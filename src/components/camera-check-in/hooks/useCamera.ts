import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraStatus } from "../types/expression";

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  audio: false,
};

const MAX_CAPTURE_WIDTH = 640;

function describeCameraError(error: unknown): {
  status: CameraStatus;
  message: string;
} {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        status: "denied",
        message:
          "Camera permission was denied. Please allow camera access in your browser settings and try again.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        status: "unavailable",
        message: "No camera was found on this device.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        status: "unavailable",
        message: "The camera is already in use by another application.",
      };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        status: "unavailable",
        message: "The camera does not support the requested settings.",
      };
    default:
      return {
        status: "error",
        message: "Unable to start the camera. Please try again.",
      };
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopRequestedRef.current = true;
    startingRef.current = false;
    releaseStream();
    setStatus("idle");
    setError(null);
  }, [releaseStream]);

  const startCamera = useCallback(async () => {
    if (startingRef.current || streamRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("unavailable");
      setError("Camera access is not supported in this browser.");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("unavailable");
      setError(
        "Camera access requires a secure connection (HTTPS or localhost).",
      );
      return;
    }

    startingRef.current = true;
    stopRequestedRef.current = false;
    setStatus("requesting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        CAMERA_CONSTRAINTS,
      );

      if (stopRequestedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;

      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          void 0;
        }
      }

      setStatus("active");
    } catch (error) {
      releaseStream();
      const described = describeCameraError(error);
      setStatus(described.status);
      setError(described.message);
    } finally {
      startingRef.current = false;
    }
  }, [releaseStream]);

  const captureFrame = useCallback(
    (maxWidth: number = MAX_CAPTURE_WIDTH): HTMLCanvasElement | null => {
      const video = videoRef.current;

      if (
        !video ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return null;
      }

      const scale = Math.min(1, maxWidth / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        canvas.width = 0;
        canvas.height = 0;
        return null;
      }

      context.drawImage(video, 0, 0, width, height);
      return canvas;
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;

    return () => {
      stopRequestedRef.current = true;
      const stream = streamRef.current;
      streamRef.current = null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  return {
    videoRef,
    status,
    error,
    startCamera,
    stopCamera,
    captureFrame,
  };
}
