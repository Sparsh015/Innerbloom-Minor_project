/**
 * VideoCallModal — WebRTC call interface for both admin (caller) and member (callee).
 *
 * Uses the existing /ws/call signaling WebSocket to exchange offer/answer/ICE
 * candidates between the two authenticated participants. The backend never sees
 * audio/video content — it only relays JSON signaling envelopes.
 *
 * Privacy: camera and microphone are only activated after explicit user action
 * (caller starts call; callee accepts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Phone, PhoneCall, PhoneMissed,
  User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { callWebSocketUrl, getIceServers, updateCallStatus, type VideoCall } from "@/lib/api";

// ─── types ────────────────────────────────────────────────────────────────

export type CallRole = "caller" | "callee";

export interface VideoCallModalProps {
  call: VideoCall;
  role: CallRole;
  onClose: () => void;
  /** For caller: called after callee accepts so UI/parent can react. */
  onAccepted?: () => void;
}

type CallPhase =
  | "ringing"     // caller: waiting for accept; callee: incoming
  | "connecting"  // WebRTC negotiating
  | "connected"   // in call
  | "ended";      // finished

// ─── component ───────────────────────────────────────────────────────────

export function VideoCallModal({ call, role, onClose, onAccepted }: VideoCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>("ringing");
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
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const mediaReadyRef = useRef(false);
  const acceptedRef = useRef(false);
  const offerSentRef = useRef(false);
  const callActiveRef = useRef(true);
  const missedSentRef = useRef(false);
  const cleanedUpRef = useRef(false);

  const otherName = role === "caller" ? call.callee_name : call.caller_name;
  const logPrefix = `[webrtc][${role}][call:${call.id}]`;
  const dlog = (...args: unknown[]) => console.log(logPrefix, ...args);
  const dwarn = (...args: unknown[]) => console.warn(logPrefix, ...args);
  const derr = (...args: unknown[]) => console.error(logPrefix, ...args);

  // ── helpers ──────────────────────────────────────────────────────────

  const sendSignal = useCallback((type: string, payload?: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      dwarn("signaling send skipped (socket not open)", { type, readyState: ws?.readyState });
      return false;
    }
    const msg = { type, call_id: call.id, ...(payload !== undefined ? { payload } : {}) };
    dlog("signaling send", { type, hasPayload: payload !== undefined });
    ws.send(JSON.stringify(msg));
    return true;
  }, [call.id]);

  // ── cleanup ──────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;
    callActiveRef.current = false;
    dlog("cleanup");
    if (ringTimerRef.current) clearInterval(ringTimerRef.current);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (offerRetryRef.current) clearInterval(offerRetryRef.current);
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    try { pcRef.current?.close(); } catch { /* ignore */ }
    pcRef.current = null;
  }, []);

  // ── end call ─────────────────────────────────────────────────────────

  const endCall = useCallback(async (reason: VideoCall["status"] = "ended") => {
    if (!callActiveRef.current && cleanedUpRef.current) return;
    dlog("endCall", { reason });
    callActiveRef.current = false;
    cleanup();
    setPhase("ended");
    try {
      await updateCallStatus(call.id, reason);
    } catch (e) {
      dwarn("updateCallStatus failed (may already be ended)", e);
    }
    setTimeout(onClose, 1200);
  }, [call.id, cleanup, onClose]);

  // ── ring timeout (30 s) ──────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "ringing") return;
    ringTimerRef.current = setInterval(() => {
      setRingElapsed(s => {
        if (s >= 30) {
          if (!missedSentRef.current) {
            missedSentRef.current = true;
            // Caller: stop waiting and mark missed/ended; callee: missed
            endCall(role === "callee" ? "missed" : "ended");
          }
          return s;
        }
        return s + 1;
      });
    }, 1000);
    return () => { if (ringTimerRef.current) clearInterval(ringTimerRef.current); };
  }, [phase, endCall, role]);

  // ── call duration timer ───────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "connected") return;
    callTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [phase]);

  // ── negotiation helpers ──────────────────────────────────────────────

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    for (const cand of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
        dlog("ICE candidate added (flushed)", { sdpMid: cand.sdpMid });
      } catch (e) {
        dwarn("Failed to add flushed ICE candidate", e);
      }
    }
  }, []);

  const sendOffer = useCallback(async (reason: string) => {
    const pc = pcRef.current;
    const ws = wsRef.current;
    if (!pc || !ws || ws.readyState !== WebSocket.OPEN) {
      dwarn("sendOffer skipped: pc/ws not ready", { reason, hasPc: !!pc, wsState: ws?.readyState });
      return;
    }
    if (!mediaReadyRef.current) {
      dwarn("sendOffer skipped: media not ready", { reason });
      return;
    }
    // Avoid duplicate offers once negotiation is progressing/answered.
    if (pc.signalingState !== "stable" && offerSentRef.current) {
      dlog("sendOffer skipped: signaling not stable", { reason, state: pc.signalingState });
      return;
    }
    if (pc.remoteDescription?.type === "answer") {
      dlog("sendOffer skipped: answer already set", { reason });
      return;
    }
    try {
      dlog("creating offer", { reason, signalingState: pc.signalingState });
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      offerSentRef.current = true;
      const ok = sendSignal("offer", { sdp: offer.sdp, type: offer.type });
      dlog("offer sent", { ok, sdpLen: offer.sdp?.length ?? 0 });
    } catch (e) {
      derr("failed to create/send offer", e);
      toast.error("Failed to start call negotiation.");
    }
  }, [sendSignal]);

  // ── WebSocket + WebRTC setup ──────────────────────────────────────────

  const initWebRTC = useCallback(async (isCaller: boolean) => {
    if (pcRef.current || wsRef.current || cleanedUpRef.current) return;
    dlog("initWebRTC start", { isCaller, configuredBase: !!callWebSocketUrl() });
    // 1. Get local media
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      dlog("media stream acquired", { tracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })) });
    } catch (e) {
      derr("getUserMedia failed", e);
      toast.error("Camera/microphone access denied. Please allow access and try again.");
      await endCall("failed");
      return;
    }
    localStreamRef.current = stream;
    mediaReadyRef.current = true;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // 2. Build peer connection
    const iceServers = getIceServers();
    dlog("ICE servers", iceServers.map(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).join(",")));
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      dlog("remote track received", { kind: event.track.kind, streams: event.streams.length, readyState: event.track.readyState });
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        if (callActiveRef.current) setPhase("connected");
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        dlog("local ICE candidate", { type: event.candidate.type, protocol: event.candidate.protocol, sdpMid: event.candidate.sdpMid });
        sendSignal("ice-candidate", event.candidate.toJSON());
      } else {
        dlog("ICE gathering complete");
      }
    };

    pc.oniceconnectionstatechange = () => {
      dlog("iceConnectionState", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        toast.error("Connection failed (ICE). A TURN server may be required on different networks.");
        endCall("failed");
      } else if (pc.iceConnectionState === "disconnected") {
        // brief disconnects can recover; give it time
        dwarn("ICE disconnected, waiting for recovery...");
        setTimeout(() => {
          if (pcRef.current === pc && pc.iceConnectionState === "disconnected") {
            endCall("failed");
          }
        }, 10000);
      }
    };

    pc.onconnectionstatechange = () => {
      dlog("connectionState", pc.connectionState);
      if (pc.connectionState === "failed") {
        toast.error("Call connection failed.");
        endCall("failed");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        if (callActiveRef.current) endCall("ended");
      }
    };

    pc.onicegatheringstatechange = () => dlog("iceGatheringState", pc.iceGatheringState);
    pc.onsignalingstatechange = () => dlog("signalingState", pc.signalingState);

    // 3. Open signaling WebSocket
    const wsUrl = callWebSocketUrl();
    dlog("opening signaling websocket", { scheme: wsUrl.startsWith("wss") ? "wss" : wsUrl.startsWith("ws") ? "ws" : "other" });
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Caller: if already accepted (edge case) or once accepted, start offer with retries
    const startCallerNegotiation = () => {
      if (!isCaller || !acceptedRef.current) return;
      dlog("caller negotiation start");
      setPhase("connecting");
      void sendOffer("call_accepted");
      if (!offerRetryRef.current) {
        offerRetryRef.current = setInterval(() => {
          const curPc = pcRef.current;
          if (!curPc || curPc.remoteDescription?.type === "answer" || !callActiveRef.current) {
            if (offerRetryRef.current) clearInterval(offerRetryRef.current);
            offerRetryRef.current = null;
            return;
          }
          void sendOffer("retry");
        }, 3000);
      }
      if (!connectTimeoutRef.current) {
        connectTimeoutRef.current = setTimeout(() => {
          const curPc = pcRef.current;
          if (callActiveRef.current && curPc && curPc.connectionState !== "connected") {
            derr("connection timeout", { connectionState: curPc.connectionState, ice: curPc.iceConnectionState });
            toast.error("Could not connect. Check network/TURN configuration and try again.");
            endCall("failed");
          }
        }, 35000);
      }
    };

    ws.onopen = () => {
      dlog("signaling websocket open");
      // let peer know we're ready (harmless if backend ignores/acks)
      sendSignal("ping");
      if (isCaller) {
        // Wait for callee acceptance before sending offer to avoid dropped early offers.
        if (acceptedRef.current) startCallerNegotiation();
      }
    };

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data); } catch { dwarn("invalid signaling JSON"); return; }

      const type = msg.type as string;
      const payload = msg.payload as Record<string, unknown> | null;
      dlog("signaling recv", { type, delivered: msg.delivered, msgType: msg.msg_type });

      if (type === "offer" && !isCaller && payload) {
        try {
          dlog("received offer", { sdpLen: (payload.sdp as string | undefined)?.length ?? 0 });
          setPhase("connecting");
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          await flushPendingCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal("answer", { sdp: answer.sdp, type: answer.type });
          dlog("answer sent", { sdpLen: answer.sdp?.length ?? 0 });
        } catch (e) {
          derr("failed handling offer", e);
          toast.error("Failed to process call offer.");
          endCall("failed");
        }
      } else if (type === "answer" && isCaller && payload) {
        try {
          dlog("received answer", { sdpLen: (payload.sdp as string | undefined)?.length ?? 0 });
          if (pc.signalingState === "have-local-offer" || !pc.remoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            await flushPendingCandidates();
            if (offerRetryRef.current) { clearInterval(offerRetryRef.current); offerRetryRef.current = null; }
          } else {
            dlog("ignored answer in state", pc.signalingState);
          }
        } catch (e) {
          derr("failed handling answer", e);
        }
      } else if (type === "ice-candidate" && payload) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
            dlog("remote ICE candidate added");
          } else {
            pendingCandidatesRef.current.push(payload as RTCIceCandidateInit);
            dlog("remote ICE candidate queued (no remoteDescription yet)", { queued: pendingCandidatesRef.current.length });
          }
        } catch (e) {
          dwarn("failed to add remote ICE candidate", e);
        }
      } else if (type === "call_accepted") {
        dlog("call accepted by peer");
        if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
        acceptedRef.current = true;
        onAccepted?.();
        if (isCaller) startCallerNegotiation();
      } else if (type === "call_ended" || type === "call_declined") {
        dlog("call ended/declined by peer", type);
        if (callActiveRef.current) await endCall("ended");
      } else if (type === "ack") {
        if (msg.msg_type === "offer" || msg.msg_type === "answer" || msg.msg_type === "ice-candidate") {
          dlog("relay ack", { msgType: msg.msg_type, delivered: msg.delivered });
          if (msg.delivered === false && msg.msg_type === "ice-candidate") {
            dwarn("ICE candidate not delivered (peer socket may not be ready)");
          }
        }
      } else if (type === "error") {
        dwarn("signaling error", msg.detail);
      }
    };

    ws.onerror = (e) => {
      derr("signaling websocket error", e);
      if (callActiveRef.current && phase !== "ended") {
        toast.error("Signaling connection error.");
      }
    };
    ws.onclose = (e) => {
      dlog("signaling websocket closed", { code: e.code, reason: e.reason });
    };
  }, [call.id, endCall, flushPendingCandidates, onAccepted, sendOffer, sendSignal]);

  // ── callee: accept ────────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
    setPhase("connecting");
    acceptedRef.current = true;
    dlog("callee accepting call");
    try {
      await updateCallStatus(call.id, "accepted");
      onAccepted?.();
      await initWebRTC(false); // callee = not caller
    } catch (e) {
      derr("failed to accept call", e);
      toast.error(e instanceof Error ? e.message : "Failed to accept call");
      await endCall("failed");
    }
  }, [call.id, endCall, initWebRTC, onAccepted]);

  // ── callee: decline ───────────────────────────────────────────────────

  const declineCall = useCallback(async () => {
    dlog("callee declining call");
    callActiveRef.current = false;
    cleanup();
    setPhase("ended");
    try { await updateCallStatus(call.id, "declined"); } catch { /* ignore */ }
    setTimeout(onClose, 800);
  }, [call.id, cleanup, onClose]);

  // ── caller: init (media + signaling) and wait for acceptance ─────────

  useEffect(() => {
    if (role === "caller") {
      dlog("caller mounted: preparing media/signaling and waiting for acceptance");
      // Acquire media and signaling immediately, but send offer only after call_accepted.
      void initWebRTC(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

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

  useEffect(() => () => {
    callActiveRef.current = false;
    // best-effort end if still active; cleanup always
    if (!cleanedUpRef.current) {
      cleanup();
    }
  }, [cleanup]);

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
