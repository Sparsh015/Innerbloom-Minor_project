import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Brain } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  clearWellnessChatHistory,
  sendWellnessChat,
  wellnessChatHistory,
} from "@/lib/api";

const DEFAULT_CRISIS_RESOURCES = [
  "Tele-MANAS: 14416 (India, 24x7)",
  "KIRAN: 1800-599-0019 (India, 24x7)",
  "Emergency: 112",
];

type ChatMessage = { sender: "user" | "bot"; text: string };

const CHAT_GREETING: ChatMessage = {
  sender: "bot",
  text: "Hi! I'm your wellness companion. How are you feeling today?",
};

export function WellnessChatCard() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([CHAT_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [resources, setResources] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    wellnessChatHistory(50)
      .then((rows) => {
        if (cancelled || rows.length === 0) {
          return;
        }
        setMessages(
          rows.map((row) => ({
            sender: row.role === "user" ? "user" : "bot",
            text: row.content,
          })),
        );
        const sawCrisis = rows.some((row) => row.crisis);
        setCrisis(sawCrisis);
        if (sawCrisis) {
          setResources(DEFAULT_CRISIS_RESOURCES);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, loading, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    setMessages((msgs) => [...msgs, { sender: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const response = await sendWellnessChat(text);
      setMessages((msgs) => [...msgs, { sender: "bot", text: response.message.content }]);
      setCrisis(response.crisis);
      setResources(response.resources ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to reach the wellness assistant",
      );
      setMessages((msgs) => [
        ...msgs,
        {
          sender: "bot",
          text: "Sorry, I couldn't respond just now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearWellnessChatHistory();
      setMessages([CHAT_GREETING]);
      setCrisis(false);
      setResources([]);
      toast.success("Chat cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to clear chat");
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Wellness AI Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-primary/5 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground">
                Hi! I'm your wellness companion. I can help you with stress management,
                mood tracking, and personalized wellness tips. How are you feeling today?
              </p>
            </div>
          </div>
        </div>
        <Button className="w-full" variant="outline" onClick={() => setOpen(true)}>
          <MessageCircle className="w-4 h-4 mr-2" />
          Start Wellness Chat
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader className="flex flex-row items-center justify-between gap-2">
              <DialogTitle>Wellness AI Chat</DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => void handleClear()} disabled={loading}>
                Clear
              </Button>
            </DialogHeader>
            <div
              ref={scrollRef}
              className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-2 p-2 bg-muted/30 rounded"
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-sm px-2 py-1 rounded-lg max-w-[80%] ${
                    msg.sender === "user"
                      ? "bg-primary/10 self-end text-right"
                      : "bg-white self-start"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {loading && (
                <div className="text-xs text-muted-foreground self-start">Thinking…</div>
              )}
            </div>
            {crisis && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-medium">You don't have to face this alone.</p>
                <p className="mt-1">
                  If you're in danger, call 112. Free helplines:{" "}
                  {(resources.length ? resources : DEFAULT_CRISIS_RESOURCES).join(" · ")}.
                </p>
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                className="flex-1 border rounded px-2 py-1"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={loading || !input.trim()}>
                Send
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
