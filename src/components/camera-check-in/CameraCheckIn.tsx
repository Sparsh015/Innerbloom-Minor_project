import { useEffect, useRef, useState } from "react";
import { ScanFace } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CameraControls } from "./CameraControls";
import { CameraPreview } from "./CameraPreview";
import { ExpressionResult } from "./ExpressionResult";
import { useCamera } from "./hooks/useCamera";
import {
  classifyExpression,
  isExpressionModelLoaded,
  loadExpressionModel,
} from "./services/expressionClassifier";
import { detectFaces, getFaceLandmarker } from "./services/faceLandmarker";
import {
  assessImageQuality,
  computeLandmarkBox,
  cropFaceToGrayscale,
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
import { buildAnalysis } from "./utils/expressionMapping";

const FACE_CHECK_INTERVAL_MS = 1000;
const MIN_FACE_RATIO = 0.18;

const DISCLAIMER =
  "AI-estimated facial expressions may not reflect how you actually feel. Facial-expression analysis is not a medical or psychological assessment. You can always select your actual mood yourself.";

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

  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("unknown");
  const [analysis, setAnalysis] = useState<ExpressionAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [reflection, setReflection] = useState<ReflectionChoice>("unset");
  const [selfMood, setSelfMood] = useState("");

  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

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

      const detection = await detectFaces(canvas);
      if (!mountedRef.current || runIdRef.current !== runId) {
        return;
      }

      if (detection.count === 0) {
        setFaceStatus("no-face");
        setPhase("error");
        setErrorMessage(
          "No face detected. Please position your face clearly inside the camera frame.",
        );
        return;
      }

      if (detection.count > 1) {
        setFaceStatus("multiple-faces");
        setPhase("error");
        setErrorMessage(
          "Please ensure only one face is visible in the camera.",
        );
        return;
      }

      const landmarks = detection.landmarks[0];
      if (!landmarks) {
        setPhase("error");
        setErrorMessage(
          "No face detected. Please position your face clearly inside the camera frame.",
        );
        return;
      }

      const frameWidth = canvas.width;
      const frameHeight = canvas.height;
      const box = computeLandmarkBox(landmarks, frameWidth, frameHeight);

      if (isFaceTooSmall(box, frameWidth, frameHeight, MIN_FACE_RATIO)) {
        setFaceStatus("too-small");
        setPhase("error");
        setErrorMessage(
          "Move a little closer so your face fills more of the camera frame.",
        );
        return;
      }

      if (isFacePartial(landmarks, frameWidth, frameHeight)) {
        setFaceStatus("partial");
        setPhase("error");
        setErrorMessage(
          "Center your full face inside the camera frame and try again.",
        );
        return;
      }

      setFaceStatus("one-face");

      const grayscale = cropFaceToGrayscale(canvas, box);
      const quality = assessImageQuality(grayscale);

      if (!quality.brightnessOk || !quality.blurOk) {
        const issues: string[] = [];
        if (!quality.brightnessOk) {
          issues.push("the lighting looks uneven");
        }
        if (!quality.blurOk) {
          issues.push("the image looks a little blurry");
        }
        setQualityWarning(
          `For a better result, make sure your face is well lit and in focus — ${issues.join(
            " and ",
          )}.`,
        );
      }

      if (isExpressionModelLoaded()) {
        setPhase("analyzing");
      } else {
        setPhase("model-loading");
        setModelProgress(0);
      }

      await loadExpressionModel((progress) => {
        if (mountedRef.current && runIdRef.current === runId) {
          setModelProgress(progress);
        }
      });

      if (!mountedRef.current || runIdRef.current !== runId) {
        return;
      }

      setPhase("analyzing");
      setModelProgress(null);

      const logits = await classifyExpression(grayscale);
      if (!mountedRef.current || runIdRef.current !== runId) {
        return;
      }

      const result = buildAnalysis(logits);
      setAnalysis(result);
      setPhase(result.status === "success" ? "success" : "low-confidence");
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
            Everything runs locally on your device. No photos or video are
            uploaded or stored.
          </p>
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
      </CardContent>
    </Card>
  );
}
