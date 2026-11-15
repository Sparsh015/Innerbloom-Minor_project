import { useCallback, useEffect, useRef, useState } from "react";
import { ScanFace } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useFacialAutoCheck } from "@/components/facial-auto-check/facialAutoCheckContext";
import {
  clearFacialCheckIns,
  createFacialCheckIn,
  facialCheckInHistory,
  type FacialCheckInEntry,
} from "@/lib/api";
import { CameraControls } from "./CameraControls";
import { CameraPreview } from "./CameraPreview";
import { ExpressionResult } from "./ExpressionResult";
import { useCamera } from "./hooks/useCamera";
import { detectFaces, getFaceLandmarker } from "./services/faceLandmarker";
import { analyzeFacialFrame } from "./services/facialAnalysis";
import {
  computeLandmarkBox,
  isFacePartial,
  isFaceTooSmall,
} from "./services/imagePreprocessing";
import type {
  AnalysisPhase,
  ExpressionAnalysis,
  FaceDetectionResult,
  FaceStatus,
  ReflectionChoice,
} from "./types/expression";

const FACE_CHECK_INTERVAL_MS = 1000;
const MIN_FACE_RATIO = 0.18;

const DISCLAIMER =
  "AI-estimated facial expressions may not reflect how you actually feel. Facial-expression analysis is not a medical or psychological assessment. You can always select your actual mood yourself.";

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function describeFaceStatus(status: FaceStatus): string {
  switch (status) {
    case "no-face":
      return "No face detected. Please position your face clearly inside the camera frame.";
    case "multiple-faces":
      return "Please ensure only one face is visible in the camera.";
    case "one-face":
      return "One face detected. You can capture and analyze.";
    case "too-small":
      return "Move a little closer so your face fills more of the camera frame.";
    case "partial":
      return "Center your full face inside the camera frame.";
    case "checking":
      return "Checking for a face…";
    case "error":
      return "Face detection is unavailable right now.";
    default:
      return "Position your face inside the camera frame.";
  }
}

export function CameraCheckIn() {
  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();
  const {
    enabled: autoCheckEnabled,
    status: autoCheckStatus,
    remainingSeconds,
    lastResult: lastAutoResult,
    lastError: lastAutoError,
    enable: enableAutoCheck,
    disable: disableAutoCheck,
    setManualCameraActive,
  } = useFacialAutoCheck();

  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("unknown");
  const [analysis, setAnalysis] = useState<ExpressionAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [reflection, setReflection] = useState<ReflectionChoice>("unset");
  const [selfMood, setSelfMood] = useState("");
  const [history, setHistory] = useState<FacialCheckInEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  const refreshHistory = useCallback(async () => {
    try {
      const rows = await facialCheckInHistory(10);
      if (mountedRef.current) {
        setHistory(rows);
      }
    } catch {
      /* history is optional; keep the UI usable offline */
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setManualCameraActive(cameraStatus === "active");
    return () => setManualCameraActive(false);
  }, [cameraStatus, setManualCameraActive]);

  useEffect(() => {
    if (cameraStatus !== "active") {
      setFaceStatus("unknown");
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    function scheduleNextCheck(delay: number) {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(runFaceCheck, delay);
    }

    function applyFaceStatus(
      detection: FaceDetectionResult,
      frameWidth: number,
      frameHeight: number,
    ) {
      if (detection.count === 0) {
        setFaceStatus("no-face");
        return;
      }

      if (detection.count > 1) {
        setFaceStatus("multiple-faces");
        return;
      }

      const landmarks = detection.landmarks[0];
      if (!landmarks) {
        setFaceStatus("no-face");
        return;
      }

      try {
        const box = computeLandmarkBox(landmarks, frameWidth, frameHeight);

        if (isFaceTooSmall(box, frameWidth, frameHeight, MIN_FACE_RATIO)) {
          setFaceStatus("too-small");
          return;
        }

        if (isFacePartial(landmarks, frameWidth, frameHeight)) {
          setFaceStatus("partial");
          return;
        }

        setFaceStatus("one-face");
      } catch {
        setFaceStatus("no-face");
      }
    }

    async function runFaceCheck() {
      if (cancelled) {
        return;
      }

      if (busyRef.current) {
        scheduleNextCheck(FACE_CHECK_INTERVAL_MS);
        return;
      }

      const video = videoRef.current;

      if (
        !video ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        scheduleNextCheck(FACE_CHECK_INTERVAL_MS);
        return;
      }

      try {
        const detection = await detectFaces(video);
        if (cancelled) {
          return;
        }
        applyFaceStatus(detection, video.videoWidth, video.videoHeight);
      } catch {
        if (!cancelled) {
          setFaceStatus("error");
        }
      } finally {
        scheduleNextCheck(FACE_CHECK_INTERVAL_MS);
      }
    }

    setPhase("preparing");
    setFaceStatus("checking");
    setAnalysis(null);
    setErrorMessage(null);
    setQualityWarning(null);
    setModelProgress(null);
    setReflection("unset");
    setSelfMood("");

    void (async () => {
      try {
        await getFaceLandmarker();
        if (cancelled) {
          return;
        }
        setPhase("ready");
        setFaceStatus("unknown");
        scheduleNextCheck(300);
      } catch {
        if (cancelled) {
          return;
        }
        setPhase("error");
        setFaceStatus("error");
        setErrorMessage(
          "Face detection could not be loaded. Please refresh the page and try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [cameraStatus, videoRef]);

  const handleStart = () => {
    setErrorMessage(null);
    setAnalysis(null);
    setQualityWarning(null);
    setModelProgress(null);
    setReflection("unset");
    setSelfMood("");
    void startCamera();
  };

  const handleStop = () => {
    runIdRef.current += 1;
    busyRef.current = false;
    stopCamera();
    setPhase("idle");
    setFaceStatus("unknown");
    setAnalysis(null);
    setErrorMessage(null);
    setQualityWarning(null);
    setModelProgress(null);
    setReflection("unset");
    setSelfMood("");
  };

  const handleRetake = () => {
    runIdRef.current += 1;
    busyRef.current = false;
    setAnalysis(null);
    setErrorMessage(null);
    setQualityWarning(null);
    setModelProgress(null);
    setReflection("unset");
    setSelfMood("");
    setPhase(cameraStatus === "active" ? "ready" : "idle");
  };

  const handleCapture = async () => {
    if (busyRef.current || cameraStatus !== "active") {
      return;
    }

    if (faceStatus === "multiple-faces") {
      setPhase("error");
      setErrorMessage("Please ensure only one face is visible in the camera.");
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    busyRef.current = true;

    setPhase("capturing");
    setAnalysis(null);
    setErrorMessage(null);
    setQualityWarning(null);
    setModelProgress(null);
    setReflection("unset");
    setSelfMood("");

    let canvas: HTMLCanvasElement | null = null;

    try {
      canvas = captureFrame();

      if (!canvas) {
        setPhase("error");
        setErrorMessage(
          "The camera frame is not ready yet. Please try again in a moment.",
        );
        return;
      }

      const outcome = await analyzeFacialFrame(canvas, {
        shouldCancel: () =>
          !mountedRef.current || runIdRef.current !== runId,
        onFaceStatus: setFaceStatus,
        onPhase: (stage) => {
          if (!mountedRef.current || runIdRef.current !== runId) {
            return;
          }
          if (stage === "model-loading") {
            setPhase("model-loading");
            setModelProgress(0);
          } else {
            setPhase("analyzing");
            setModelProgress(null);
          }
        },
        onModelProgress: (progress) => {
          if (mountedRef.current && runIdRef.current === runId) {
            setModelProgress(progress);
          }
        },
      });

      if (
        !mountedRef.current ||
        runIdRef.current !== runId ||
        outcome.status === "cancelled"
      ) {
        return;
      }

      setQualityWarning(outcome.qualityWarning);

      if (outcome.status === "failed") {
        setPhase("error");
        setErrorMessage(outcome.message);
        return;
      }

      if (outcome.analysis) {
        setAnalysis(outcome.analysis);
        setPhase(
          outcome.status === "success" ? "success" : "low-confidence",
        );

        if (outcome.status === "success") {
          try {
            const saved = await createFacialCheckIn({
              expression: outcome.analysis.key,
              confidence: outcome.analysis.confidence,
              source: "manual",
            });
            if (mountedRef.current && runIdRef.current === runId) {
              setSaveError(null);
              setHistory((prev) => [saved, ...prev].slice(0, 10));
            }
          } catch (saveFailure) {
            if (mountedRef.current && runIdRef.current === runId) {
              setSaveError(
                saveFailure instanceof Error
                  ? saveFailure.message
                  : "This check-in could not be saved.",
              );
            }
          }
        }
      }
    } catch (error) {
      if (!mountedRef.current || runIdRef.current !== runId) {
        return;
      }
      setPhase("error");
      setModelProgress(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong while analyzing the image. Please try again.",
      );
    } finally {
      if (runIdRef.current === runId) {
        busyRef.current = false;
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  };

  const handleReflectionChange = (choice: ReflectionChoice) => {
    setReflection(choice);
    if (choice !== "different") {
      setSelfMood("");
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearFacialCheckIns();
      if (mountedRef.current) {
        setHistory([]);
        setSaveError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not clear your check-in history.",
        );
      }
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanFace className="h-5 w-5 text-primary" />
          Camera Check-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            AI-Powered Facial Expression Analysis
          </p>
          <p className="text-xs text-muted-foreground">
            Facial images and video stay on your device. When automatic
            check-ins are on, only AI-estimated mood and stress results are
            saved for your admin.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Automatic check-ins</p>
              <p className="text-xs text-muted-foreground">
                Use the camera briefly about every 10 minutes while you are
                signed in.
              </p>
            </div>
            <Switch
              checked={autoCheckEnabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  void enableAutoCheck();
                } else {
                  disableAutoCheck();
                }
              }}
              disabled={autoCheckStatus === "requesting"}
              aria-label="Enable automatic facial check-ins"
            />
          </div>

          {autoCheckStatus !== "off" && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {autoCheckStatus === "requesting" && (
                <p>Requesting camera permission…</p>
              )}
              {autoCheckStatus === "running" && <p>Checking now…</p>}
              {autoCheckStatus === "saving" && <p>Saving result…</p>}
              {autoCheckStatus === "waiting" && remainingSeconds !== null && (
                <p>Next check in {formatCountdown(remainingSeconds)}</p>
              )}
              {autoCheckStatus === "error" && remainingSeconds !== null && (
                <p className="text-destructive">
                  Retrying in {formatCountdown(remainingSeconds)}
                </p>
              )}
              {lastAutoError && (
                <p className="text-amber-600 dark:text-amber-400">
                  {lastAutoError}
                </p>
              )}
              {lastAutoResult && (
                <p>
                  Last saved: {lastAutoResult.mood} ·{" "}
                  {lastAutoResult.expression_label} ·{" "}
                  {Math.round(lastAutoResult.confidence * 100)}% · stress{" "}
                  {lastAutoResult.stress_level}/5
                </p>
              )}
            </div>
          )}
        </div>

        <CameraPreview
          videoRef={videoRef}
          cameraStatus={cameraStatus}
          faceStatus={faceStatus}
          error={cameraError}
        />

        {cameraStatus === "active" && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {describeFaceStatus(faceStatus)}
            </p>
            {faceStatus === "one-face" && (
              <Badge variant="secondary">Face detected</Badge>
            )}
          </div>
        )}

        {phase === "model-loading" && modelProgress !== null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Loading expression model…</span>
              <span>{modelProgress}%</span>
            </div>
            <Progress value={modelProgress} />
          </div>
        )}

        {phase === "analyzing" && (
          <p className="text-sm text-muted-foreground">
            Analyzing facial expression…
          </p>
        )}

        {qualityWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {qualityWarning}
          </p>
        )}

        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        {saveError && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {saveError}
          </p>
        )}

        <CameraControls
          cameraStatus={cameraStatus}
          phase={phase}
          hasAnalysis={analysis !== null}
          onStart={handleStart}
          onStop={handleStop}
          onCapture={handleCapture}
          onRetake={handleRetake}
        />

        <ExpressionResult
          analysis={analysis}
          phase={phase}
          reflection={reflection}
          selfMood={selfMood}
          onReflectionChange={handleReflectionChange}
          onSelfMoodChange={setSelfMood}
        />

        <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>

        {history.length > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Recent check-ins</p>
              <Button variant="ghost" size="sm" onClick={() => void handleClearHistory()}>
                Clear
              </Button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded border bg-background/60 p-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{entry.mood}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.expression_label}
                      {entry.source === "manual" ? " · manual" : " · auto"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Badge variant="outline">Stress {entry.stress_level}/5</Badge>
                    <span>{Math.round(entry.confidence * 100)}%</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
