/**
 * IncomingCallListener — mounts once at the top level for logged-in users.
 * Opens the /ws/call WebSocket and listens for incoming_call, call_ended,
 * call_declined events, showing the VideoCallModal when appropriate.
 *
 * Also handles the caller side: when the admin's VideoCallModal signals that
 * the call was accepted, the listener updates accordingly.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VideoCallModal } from "./VideoCallModal";
import { callWebSocketUrl, type VideoCall } from "@/lib/api";

interface IncomingCallSignal {
  type: "incoming_call";
  call_id: string;
  caller_id: string;
  caller_name: string;
  ring_timeout: number;
}

export function IncomingCallListener() {
  const [incomingCall, setIncomingCall] = useState<VideoCall | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    function connect() {
      if (!mounted) return;
      const url = callWebSocketUrl();
      // Don't connect if no token
      if (url.includes("token=&") || url.endsWith("token=")) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === "incoming_call") {
          const signal = msg as unknown as IncomingCallSignal;
          // Construct a minimal VideoCall object for the modal
          setIncomingCall({
            id: signal.call_id,
            caller_id: signal.caller_id,
            caller_name: signal.caller_name,
            callee_id: "",
            callee_name: "",
            status: "ringing",
            started_at: new Date().toISOString(),
            answered_at: null,
            ended_at: null,
          });
        }

        if (msg.type === "call_ended" || msg.type === "call_declined") {
          setIncomingCall(prev => {
            if (prev && prev.id === msg.call_id) return null;
            return prev;
          });
        }
      };

      ws.onerror = () => { /* silent — reconnect below */ };

      ws.onclose = () => {
        wsRef.current = null;
        if (mounted) {
          reconnectTimer.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  if (!incomingCall) return null;

  return (
    <VideoCallModal
      call={incomingCall}
      role="callee"
      onClose={() => setIncomingCall(null)}
    />
  );
}
