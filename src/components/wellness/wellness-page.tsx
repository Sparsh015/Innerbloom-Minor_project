import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CameraCheckIn } from "@/components/camera-check-in/CameraCheckIn";
import { MessageCircle, Activity, Heart, Brain, Zap } from "lucide-react";
import { toast } from "sonner";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import dayjs from 'dayjs';
import {
  createActivity,
  createJournal,
  createMood,
  listActivities,
  listJournal,
  moodHistory,
  type JournalEntry,
} from "@/lib/api";

export const WellnessPage = () => {
  // Activity Tracker (real records from PostgreSQL)
  const [activities, setActivities] = useState<{ name: string; date: string }[]>([]);
  const [activityInput, setActivityInput] = useState("");

  // Mood Journal (real records from PostgreSQL)
  const [mood, setMood] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [moodTime, setMoodTime] = useState(dayjs().format('HH:mm'));
  const [moodEntries, setMoodEntries] = useState<{ mood: string; note: string; date: string; time: string }[]>([]);

  // Energy Levels (stored as mood records with an energy level)
  const [energy, setEnergy] = useState(5);
  const [energyTime, setEnergyTime] = useState(dayjs().format('HH:mm'));
  const [energyEntries, setEnergyEntries] = useState<{ level: number; date: string; time: string }[]>([]);

  // Private journal (real records from PostgreSQL)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);

  // Load the user's real history on mount.
  useEffect(() => {
    let cancelled = false;
    moodHistory()
      .then((records) => {
        if (cancelled) return;
        setMoodEntries(
          records
            .filter((r) => r.mood !== "Energy")
            .map((r) => ({ mood: r.mood, note: r.note, date: r.entry_date, time: r.entry_time }))
        );
        setEnergyEntries(
          records
            .filter((r) => r.mood === "Energy" && r.energy_level !== null)
            .map((r) => ({
              level: r.energy_level as number,
              date: r.entry_date,
              time: r.entry_time,
            }))
        );
      })
      .catch(() => undefined);
    listActivities()
      .then((list) => {
        if (cancelled) return;
        setActivities(
          list.map((a) => ({
            name: a.title,
            date: new Date(`${a.activity_date}T00:00:00`).toLocaleDateString(),
          }))
        );
      })
      .catch(() => undefined);
    listJournal(20)
      .then((list) => {
        if (!cancelled) setJournalEntries(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { sender: "bot", text: "Hi! I'm your wellness companion. How are you feeling today?" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleAddActivity = async () => {
    if (!activityInput.trim()) return;
    try {
      const saved = await createActivity({
        title: activityInput.trim(),
        activity_type: "wellness",
        activity_date: dayjs().format('YYYY-MM-DD'),
      });
      setActivities([
        { name: saved.title, date: new Date(`${saved.activity_date}T00:00:00`).toLocaleDateString() },
        ...activities,
      ]);
      setActivityInput("");
      toast.success("Activity logged!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save activity");
    }
  };

  const handleAddMood = async () => {
    if (!mood) return;
    try {
      const saved = await createMood({
        mood,
        note: moodNote,
        entry_date: dayjs().format('YYYY-MM-DD'),
        entry_time: moodTime,
      });
      setMoodEntries([
        { mood: saved.mood, note: saved.note, date: saved.entry_date, time: saved.entry_time },
        ...moodEntries,
      ]);
      setMood("");
      setMoodNote("");
      setMoodTime(dayjs().format('HH:mm'));
      toast.success("Mood logged!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save mood");
    }
  };

  const handleAddEnergy = async () => {
    try {
      const saved = await createMood({
        mood: "Energy",
        energy_level: energy,
        entry_date: dayjs().format('YYYY-MM-DD'),
        entry_time: energyTime,
      });
      setEnergyEntries([
        { level: saved.energy_level as number, date: saved.entry_date, time: saved.entry_time },
        ...energyEntries,
      ]);
      setEnergy(5);
      setEnergyTime(dayjs().format('HH:mm'));
      toast.success("Energy logged!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save energy");
    }
  };

  const handleAddJournal = async () => {
    if (!journalContent.trim() || journalSaving) return;
    setJournalSaving(true);
    try {
      const saved = await createJournal({
        title: journalTitle.trim(),
        content: journalContent.trim(),
      });
      setJournalEntries([saved, ...journalEntries]);
      setJournalTitle("");
      setJournalContent("");
      toast.success("Journal entry saved — private to you.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save journal entry");
    }
    setJournalSaving(false);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = { sender: "user", text: chatInput };
    setChatMessages((msgs) => [...msgs, userMsg]);
    setChatInput("");
    // Simulate AI response
    setTimeout(() => {
      const lower = chatInput.toLowerCase();
      let reply = "I'm here to support you. Can you tell me more?";
      if (lower.includes("stress") || lower.includes("anxious") || lower.includes("overwhelmed")) {
        reply = "I'm sorry you're feeling stressed. Try taking a few deep breaths. Would you like a tip for stress relief?";
      } else if (lower.includes("sad") || lower.includes("down") || lower.includes("depressed")) {
        reply = "It's okay to feel sad sometimes. Remember, you're not alone. Would you like a mood-boosting activity suggestion?";
      } else if (lower.includes("happy") || lower.includes("good") || lower.includes("great")) {
        reply = "That's wonderful to hear! Keep up the positive energy. Would you like a wellness tip to maintain your mood?";
      } else if (lower.includes("tip") || lower.includes("yes")) {
        reply = "Here's a tip: Take a 5-minute mindful break. Close your eyes, breathe deeply, and focus on the present moment.";
      } else if (lower.includes("thank")) {
        reply = "You're welcome! I'm always here if you need to talk or need more tips.";
      }
      setChatMessages((msgs) => [...msgs, { sender: "bot", text: reply }]);
    }, 800);
  };

  // Chart data for last 7 days
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString());
    }
    return days;
  };
  const last7Days = getLast7Days();

  // Activity chart data
  const activityChartData = last7Days.map(date => ({
    date,
    count: activities.filter(a => a.date === date).length
  }));

  // Mood score mapping for custom graph
  const today = dayjs().format('YYYY-MM-DD');
  const moodScore = (m: string) => {
    switch (m) {
      case '😊': return 10;
      case '😔': return 1;
      case '😠': return 2;
      case '😰': return 3;
      case '😐': return 5;
      default: return 0;
    }
  };
  const moodChartData = moodEntries
    .filter(e => dayjs(e.date).format('YYYY-MM-DD') === today)
    .map(e => ({
      time: e.time,
      score: moodScore(e.mood),
      mood: e.mood,
      note: e.note,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
  const energyChartData = energyEntries
    .filter(e => dayjs(e.date).format('YYYY-MM-DD') === today)
    .map(e => ({
      time: e.time,
      level: e.level,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Wellness Dashboard</h2>
        <p className="text-muted-foreground">Track your mental health journey and stress levels</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <CameraCheckIn />

        {/* Health Chatbot */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Health Chatbot
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
            <Button className="w-full" variant="outline" onClick={() => setChatbotOpen(true)}>
              <MessageCircle className="w-4 h-4 mr-2" />
              Start Wellness Chat
            </Button>
            <Dialog open={chatbotOpen} onOpenChange={setChatbotOpen}>
              <DialogContent className="max-w-md w-full">
                <DialogHeader>
                  <DialogTitle>Wellness Chatbot</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-2 p-2 bg-muted/30 rounded">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`text-sm px-2 py-1 rounded-lg max-w-[80%] ${msg.sender === "user" ? "bg-primary/10 self-end text-right" : "bg-white self-start"}`}>
                      {msg.text}
                    </div>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); handleSendChat(); }}>
                  <input
                    className="flex-1 border rounded px-2 py-1"
                    placeholder="Type your message..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" size="sm">Send</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Additional Wellness Features */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Activity Tracker */}
        <Card className="shadow-soft">
          <CardContent className="p-6 text-center">
            <Activity className="w-8 h-8 mx-auto text-primary mb-3" />
            <h3 className="font-semibold mb-2">Activity Tracker</h3>
            <p className="text-sm text-muted-foreground mb-3">Monitor daily activities and mood patterns</p>
            {/* Chart */}
            <div className="mb-4">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={activityChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} width={24} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#13eba0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-2 mb-2">
              <label htmlFor="activity-input" className="sr-only">Activity</label>
              <input
                id="activity-input"
                className="flex-1 border rounded px-2 py-1"
                placeholder="Add activity (e.g., walk, yoga)"
                value={activityInput}
                onChange={e => setActivityInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddActivity(); }}
                title="Activity name"
              />
              <Button size="sm" onClick={handleAddActivity}>Add</Button>
            </div>
            <div className="text-left max-h-32 overflow-y-auto">
              {activities.length === 0 && <div className="text-xs text-muted-foreground">No activities yet.</div>}
              {activities.map((a, i) => (
                <div key={i} className="text-xs py-1 border-b last:border-b-0 flex items-center gap-2">
                  <span>{a.name}</span>
                  <span className="ml-auto text-muted-foreground">{a.date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Mood Journal */}
        <Card className="shadow-soft">
          <CardContent className="p-6 text-center">
            <Heart className="w-8 h-8 mx-auto text-primary mb-3" />
            <h3 className="font-semibold mb-2">Mood Journal</h3>
            <p className="text-sm text-muted-foreground mb-3">Log your mood multiple times a day and see your trend.</p>
            {/* Time-series Line Graph */}
            <div className="mb-4 bg-gradient-to-b from-[#e6fff5] to-[#f6fdfb] rounded-lg p-2">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={moodChartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} type="category" />
                  <YAxis domain={[0, 10]} width={24} />
                  <Tooltip formatter={(v, n, p) => {
                    // Try to get dataIndex from p (payload)
                    const dataIndex = (p && ('dataIndex' in p)) ? (p as any).dataIndex : undefined;
                    if (n === 'score' && typeof dataIndex === 'number' && moodChartData[dataIndex] && moodChartData[dataIndex].mood) {
                      return `${v} (${moodChartData[dataIndex].mood})`;
                    }
                    return v;
                  }} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#b2f5ea" />
                  <Line type="monotone" dataKey="score" stroke="#13eba0" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mb-2 items-center">
              <select className="border rounded px-2 py-1 min-w-[90px]" value={mood} onChange={e => setMood(e.target.value)} title="Select your mood">
                <option value="">Mood</option>
                <option value="😊">Happy</option>
                <option value="😔">Sad</option>
                <option value="😠">Angry</option>
                <option value="😰">Stressed</option>
                <option value="😐">Neutral</option>
              </select>
              <input
                className="flex-1 min-w-[120px] border rounded px-2 py-1"
                placeholder="Add a note (optional)"
                value={moodNote}
                onChange={e => setMoodNote(e.target.value)}
                title="Mood note"
              />
              <input
                type="time"
                className="border rounded px-2 py-1 w-24 min-w-[80px]"
                value={moodTime}
                onChange={e => setMoodTime(e.target.value)}
                title="Time of mood"
              />
              <Button size="sm" className="whitespace-nowrap" onClick={handleAddMood}>Log</Button>
            </div>
            <div className="text-left max-h-32 overflow-y-auto bg-white/70 rounded p-2 border border-muted-foreground/10">
              {moodEntries.filter(e => dayjs(e.date).format('YYYY-MM-DD') === today).length === 0 && <div className="text-xs text-muted-foreground">No mood entries yet for today.</div>}
              {moodEntries.filter(e => dayjs(e.date).format('YYYY-MM-DD') === today).map((entry, i) => (
                <div key={i} className="text-xs py-1 border-b last:border-b-0 flex flex-wrap items-center gap-2">
                  <span>{entry.mood}</span>
                  <span className="truncate max-w-[100px]">{entry.note}</span>
                  <span className="ml-auto text-muted-foreground">{entry.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Energy Levels */}
        <Card className="shadow-soft">
          <CardContent className="p-6 text-center">
            <Zap className="w-8 h-8 mx-auto text-primary mb-3" />
            <h3 className="font-semibold mb-2">Energy Levels</h3>
            <p className="text-sm text-muted-foreground mb-3">Log your energy multiple times a day and see your trend.</p>
            {/* Time-series Line Graph */}
            <div className="mb-4 bg-gradient-to-b from-[#e6fff5] to-[#f6fdfb] rounded-lg p-2">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={energyChartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} type="category" />
                  <YAxis domain={[1, 10]} width={24} />
                  <Tooltip />
                  <CartesianGrid strokeDasharray="3 3" stroke="#b2f5ea" />
                  <Line type="monotone" dataKey="level" stroke="#13eba0" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-2 items-center mb-2">
              <input
                id="energy-slider"
                type="range"
                min={1}
                max={10}
                value={energy}
                onChange={e => setEnergy(Number(e.target.value))}
                className="flex-1"
                title="Energy level slider"
              />
              <input
                type="time"
                className="border rounded px-2 py-1 w-24"
                value={energyTime}
                onChange={e => setEnergyTime(e.target.value)}
                title="Time of energy"
              />
              <span className="font-bold text-primary">{energy}</span>
              <Button size="sm" onClick={handleAddEnergy}>Log</Button>
            </div>
            <div className="text-left max-h-32 overflow-y-auto">
              {energyEntries.filter(e => dayjs(e.date).format('YYYY-MM-DD') === today).length === 0 && <div className="text-xs text-muted-foreground">No energy entries yet for today.</div>}
              {energyEntries.filter(e => dayjs(e.date).format('YYYY-MM-DD') === today).map((entry, i) => (
                <div key={i} className="text-xs py-1 border-b last:border-b-0 flex items-center gap-2">
                  <span className="font-bold text-primary">{entry.level}</span>
                  <span className="ml-auto text-muted-foreground">{entry.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Private Journal */}
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-2 text-center">Private Journal</h3>
          <p className="text-sm text-muted-foreground mb-3 text-center">
            Only you can see these entries. They are never shared.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <input
              className="border rounded px-2 py-1"
              placeholder="Title (optional)"
              value={journalTitle}
              onChange={e => setJournalTitle(e.target.value)}
              title="Journal title"
            />
            <textarea
              className="border rounded px-2 py-1 min-h-[80px]"
              placeholder="Write what's on your mind..."
              value={journalContent}
              onChange={e => setJournalContent(e.target.value)}
              title="Journal content"
            />
            <Button size="sm" onClick={handleAddJournal} disabled={!journalContent.trim() || journalSaving}>
              {journalSaving ? "Saving…" : "Save Entry"}
            </Button>
          </div>
          <div className="text-left max-h-48 overflow-y-auto">
            {journalEntries.length === 0 && (
              <div className="text-xs text-muted-foreground">No journal entries yet.</div>
            )}
            {journalEntries.map((entry) => (
              <div key={entry.id} className="text-xs py-2 border-b last:border-b-0">
                {entry.title && <div className="font-semibold">{entry.title}</div>}
                <div className="whitespace-pre-wrap">{entry.content}</div>
                <div className="text-muted-foreground mt-1">
                  {new Date(entry.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};