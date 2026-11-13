import type { RefObject } from "react";
import { Camera, CameraOff, ScanFace } from "lucide-react";
import type { CameraStatus, FaceStatus } from "./types/expression";

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  faceStatus: FaceStatus;
  error: string | null;
}

function faceStatusLabel(faceStatus: FaceStatus): string {
  switch (faceStatus) {
    case "one-face":
      return "Face detected";
    case "multiple-faces":
      return "Multiple faces detected";
    case "no-face":
      return "No face detected";
    case "too-small":
      return "Move closer";
    case "partial":
      return "Center your face";
    case "error":
      return "Face detection unavailable";
    case "checking":
      return "Checking for a face…";
    default:
      return "Position your face in the frame";
  }
}

export function CameraPreview({
  videoRef,
  cameraStatus,
  faceStatus,
  error,
}: CameraPreviewProps) {
  const isActive = cameraStatus === "active";
  const isRequesting = cameraStatus === "requesting";
  const hasError =
    cameraStatus === "denied" ||
    cameraStatus === "unavailable" ||
    cameraStatus === "error";

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border bg-black">
      <video
        ref={videoRef}
        className={`h-full w-full -scale-x-100 object-cover ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Camera preview"
        aria-hidden={!isActive}
        autoPlay
        playsInline
        muted
      />

      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-center">
          {isRequesting ? (
            <>
              <ScanFace className="h-10 w-10 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">
                Requesting camera access…
              </p>
            </>
          ) : hasError ? (
            <>
              <CameraOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {error ?? "Camera is not available."}
              </p>
            </>
          ) : (
            <>
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Start the camera to begin your check-in.
              </p>
            </>
          )}
        </div>
      )}

      {isActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
            {faceStatusLabel(faceStatus)}
          </span>
        </div>
      )}
    </div>
  );
}
