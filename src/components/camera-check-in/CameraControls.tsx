import { Play, RotateCcw, ScanFace, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisPhase, CameraStatus } from "./types/expression";

interface CameraControlsProps {
  cameraStatus: CameraStatus;
  phase: AnalysisPhase;
  hasAnalysis: boolean;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
  onRetake: () => void;
}

export function CameraControls({
  cameraStatus,
  phase,
  hasAnalysis,
  onStart,
  onStop,
  onCapture,
  onRetake,
}: CameraControlsProps) {
  const isBusy =
    phase === "preparing" ||
    phase === "capturing" ||
    phase === "model-loading" ||
    phase === "analyzing";

  if (cameraStatus !== "active") {
    return (
      <Button
        onClick={onStart}
        className="w-full"
        disabled={cameraStatus === "requesting"}
      >
        <Play className="mr-2 h-4 w-4" />
        {cameraStatus === "requesting" ? "Starting camera…" : "Start Camera"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={onCapture} className="flex-1" disabled={isBusy}>
        <ScanFace className="mr-2 h-4 w-4" />
        {isBusy ? "Working…" : "Capture & Analyze"}
      </Button>

      {hasAnalysis && (
        <Button onClick={onRetake} variant="outline" disabled={isBusy}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Retake
        </Button>
      )}

      <Button onClick={onStop} variant="destructive">
        <Square className="mr-2 h-4 w-4" />
        Stop Camera
      </Button>
    </div>
  );
}
