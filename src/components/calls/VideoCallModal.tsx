/**
 * VideoCallModal — WebRTC call interface for both admin (caller) and member (callee).
 *
 * Uses the existing /ws/call signaling WebSocket to exchange offer/answer/ICE
 * candidates between the two authenticated participants. The backend never sees
 * audio/video content — it only relays JSON signaling envelopes.
 *
 * Privacy: camera and microphone are only activated after the member explicitly
 * accepts the call. The admin's camera is activated when they click "Start Call".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Phone, PhoneCall, PhoneMissed,
  User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { callWebSocketUrl, updateCallStatus, type VideoCall } from "@/lib/api";

// ─── types ────────────────────────────────────────────────────────────────

export type CallRole = "caller" | "callee";

export interface VideoCallModalProps {
  call: VideoCall;
  role: CallRole;
  onClose: () => void;
  /** For caller: called after callee accepts so we can start WebRTC. */
  onAccepted?: () => void;
}

type CallPhase =
  | "ringing"     // caller: waiting for accept; callee: incoming
  | "connecting"  // WebRTC negotiating
  | "connected"   // in call
  | "ended";      // finished

// ─── STUN config (public Google servers, no TURN needed for LAN) ──────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ─── component ───────────────────────────────────────────────────────────

export function VideoCallModal({ call, role, onClose, onAccepted }: VideoCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>(role === "callee" ? "ringing" : "connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [ringElapsed, setRingElapsed] = useState(0);

  // DOM refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedSentRef = useRef(false);

  const otherName = role === "caller" ? call.callee_name : call.caller_name;

  // ── cleanup ──────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (ringTimerRef.current) clearInterval(ringTimerRef.current);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  // ── end call ─────────────────────────────────────────────────────────

  const endCall = useCallback(async (reason: VideoCall["status"] = "ended") => {
    cleanup();
    setPhase("ended");
    try {
      await updateCallStatus(call.id, reason);
    } catch { /* ignore — call may already be ended server-side */ }
    setTimeout(onClose, 1200);
  }, [call.id, cleanup, onClose]);

  // ── ring timeout (30 s) for callee ringing state ──────────────────────

  useEffect(() => {
    if (phase !== "ringing") return;
    ringTimerRef.current = setInterval(() => {
      setRingElapsed(s => {
        if (s >= 30) {
          if (!missedSentRef.current) {
            missedSentRef.current = true;
            endCall("missed");
          }
          return s;
        }
        return s + 1;
      });
    }, 1000);
    return () => { if (ringTimerRef.current) clearInterval(ringTimerRef.current); };
  }, [phase, endCall]);

  // ── call duration timer ───────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "connected") return;
    callTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [phase]);

  // ── WebSocket + WebRTC setup ──────────────────────────────────────────

  const initWebRTC = useCallback(async (isCaller: boolean) => {
    // 1. Get local media
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      toast.error("Camera/microphone access denied. Please allow access and try again.");
      await endCall("failed");
      return;
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // 2. Build peer connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setPhase("connected");
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          call_id: call.id,
          payload: event.candidate.toJSON(),
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        endCall("failed");
      }
    };

    // 3. Open signaling WebSocket
    const ws = new WebSocket(callWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = async () => {
      if (isCaller) {
        // Caller creates offer first
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: "offer",
          call_id: call.id,
          payload: { sdp: offer.sdp, type: offer.type },
        }));
      }
    };

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data); } catch { return; }

      const type = msg.type as string;
      const payload = msg.payload as Record<string, unknown> | null;

      if (type === "offer" && !isCaller) {
        // Callee received offer → set remote, create answer
        await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: "answer",
          call_id: call.id,
          payload: { sdp: answer.sdp, type: answer.type },
        }));
      } else if (type === "answer" && isCaller) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      } else if (type === "ice-candidate" && payload) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit)); } catch { /* ignore */ }
      } else if (type === "call_ended" || type === "call_declined") {
        await endCall("ended");
      }
    };

    ws.onerror = () => { toast.error("Signaling connection error."); };
    ws.onclose = () => { /* handled by endCall if needed */ };
  }, [call.id, endCall]);

  // ── callee: accept ────────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (ringTimerRef.current) clearInterval(ringTimerRef.current);
    setPhase("connecting");
    try {
      await updateCallStatus(call.id, "accepted");
      onAccepted?.();
      await initWebRTC(false); // callee = not caller
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept call");
      await endCall("failed");
    }
  }, [call.id, endCall, initWebRTC, onAccepted]);

  // ── callee: decline ───────────────────────────────────────────────────

  const declineCall = useCallback(async () => {
    cleanup();
    setPhase("ended");
    await updateCallStatus(call.id, "declined");
    setTimeout(onClose, 800);
  }, [call.id, cleanup, onClose]);

  // ── caller: start WebRTC when call is in ringing/accepted state ───────

  useEffect(() => {
    if (role === "caller" && phase === "connecting") {
      initWebRTC(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount for caller

  // ── mic/cam toggles ───────────────────────────────────────────────────

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(m => !m);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(c => !c);
  };

  // ── cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => () => { cleanup(); }, [cleanup]);

  // ── helpers ───────────────────────────────────────────────────────────

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden bg-gray-900 shadow-2xl">

        {/* Remote video (full background) */}
        <div className="relative aspect-video bg-gray-800 flex items-center justify-center">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${phase === "connected" ? "block" : "hidden"}`}
          />

          {/* Placeholder when not yet connected */}
          {phase !== "connected" && (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-4xl font-bold">
                {otherName.slice(0, 2).toUpperCase()}
              </div>
              <p className="text-xl font-semibold">{otherName}</p>
              <p className="text-sm text-gray-400 flex items-center gap-2">
                {phase === "ringing" && role === "caller" && (
                  <><PhoneCall className="w-4 h-4 animate-pulse text-green-400" /> Ringing…</>
                )}
                {phase === "ringing" && role === "callee" && (
                  <><Phone className="w-4 h-4 animate-bounce text-green-400" /> Incoming call from admin…</>
                )}
                {phase === "connecting" && (
                  <><div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" /> Connecting…</>
                )}
                {phase === "ended" && (
                  <><PhoneMissed className="w-4 h-4 text-red-400" /> Call ended</>
                )}
              </p>
              {phase === "ringing" && role === "caller" && (
                <p className="text-xs text-gray-500">{30 - ringElapsed}s remaining</p>
              )}
            </div>
          )}

          {/* Connected duration */}
          {phase === "connected" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded-full text-white text-sm font-mono">
              {formatTime(elapsed)}
            </div>
          )}

          {/* Local video PiP */}
          <div className="absolute bottom-4 right-4 w-32 aspect-video rounded-lg overflow-hidden border-2 border-white/30 bg-gray-700">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${camOn ? "block" : "hidden"}`}
            />
            {!camOn && (
              <div className="w-full h-full flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 bg-gray-900 flex items-center justify-center gap-4">
          {/* Callee incoming call buttons */}
          {role === "callee" && phase === "ringing" && (
            <>
              <Button
                size="lg"
                className="rounded-full w-14 h-14 bg-green-500 hover:bg-green-600 text-white"
                onClick={acceptCall}
                title="Accept call"
              >
                <Phone className="w-6 h-6" />
              </Button>
              <Button
                size="lg"
                className="rounded-full w-14 h-14 bg-red-500 hover:bg-red-600 text-white"
                onClick={declineCall}
                title="Decline call"
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </>
          )}

          {/* Active call controls */}
          {(phase === "connecting" || phase === "connected") && (
            <>
              <Button
                size="lg"
                variant={micOn ? "outline" : "destructive"}
                className="rounded-full w-12 h-12"
                onClick={toggleMic}
                title={micOn ? "Mute microphone" : "Unmute microphone"}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </Button>

              <Button
                size="lg"
                className="rounded-full w-14 h-14 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => endCall("ended")}
                title="End call"
              >
                <PhoneOff className="w-6 h-6" />
              </Button>

              <Button
                size="lg"
                variant={camOn ? "outline" : "destructive"}
                className="rounded-full w-12 h-12"
                onClick={toggleCam}
                title={camOn ? "Turn off camera" : "Turn on camera"}
              >
                {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </Button>
            </>
          )}

          {/* Caller ringing — cancel */}
          {role === "caller" && phase === "ringing" && (
            <Button
              size="lg"
              className="rounded-full w-14 h-14 bg-red-500 hover:bg-red-600 text-white"
              onClick={() => endCall("ended")}
              title="Cancel call"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          )}

          {/* Ended state */}
          {phase === "ended" && (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </div>

        {/* Header label */}
        <div className="absolute top-3 left-3 px-3 py-1 bg-black/50 rounded-full text-white text-xs flex items-center gap-1">
          <Video className="w-3 h-3" />
          {role === "caller" ? "Admin Call" : "Video Call"}
        </div>
      </div>
    </div>
  );
}
