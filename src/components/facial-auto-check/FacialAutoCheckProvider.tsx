import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCamera } from "@/components/camera-check-in/hooks/useCamera";
import { analyzeFacialFrame } from "@/components/camera-check-in/services/facialAnalysis";
import { getFaceLandmarker } from "@/components/camera-check-in/services/faceLandmarker";
import { loadExpressionModel } from "@/components/camera-check-in/services/expressionClassifier";
import {
  createFacialCheckIn,
  currentUser,
  getFacialAutoCheckSettings,
  updateFacialAutoCheckSettings,
  type FacialCheckInEntry,
} from "@/lib/api";
import {
  FacialAutoCheckContext,
  type FacialAutoCheckContextValue,
  type FacialAutoCheckStatus,
} from "./facialAutoCheckContext";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 5000;
const DEDUPE_WINDOW_MS = 30_000;
const STORAGE_PREFIX = "innerbloom.facial-auto-check.";

function getIntervalMs(): number {
  const configured = Number(
    import.meta.env.VITE_FACIAL_AUTO_CHECK_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
  );

  if (!Number.isFinite(configured)) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.max(MIN_INTERVAL_MS, configured);
}

function storageKey(): string {
  return `${STORAGE_PREFIX}${currentUser()?.id ?? "anonymous"}`;
}

function lastCheckKey(): string {
  return `${STORAGE_PREFIX}last.${currentUser()?.id ?? "anonymous"}`;
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("The camera frame did not become ready in time."));
    }, 3000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("playing", handleReady);
    };

    const handleReady = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };

    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("playing", handleReady);
  });
}

export function FacialAutoCheckProvider({ children }: { children: ReactNode }) {
  const {
    videoRef,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();

  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<FacialAutoCheckStatus>("off");
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastResult, setLastResult] = useState<FacialCheckInEntry | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const enabledRef = useRef(false);
  const runningRef = useRef(false);
  const manualCameraRef = useRef(false);
  const nextCheckAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const intervalMs = useMemo(getIntervalMs, []);

  const scheduleNext = useCallback((timestamp: number) => {
    nextCheckAtRef.current = timestamp;
    setNextCheckAt(timestamp);
  }, []);

  const preloadModels = useCallback(() => {
    void getFaceLandmarker().catch(() => undefined);
    void loadExpressionModel().catch(() => undefined);
  }, []);

  const enable = useCallback(async () => {
    if (enabledRef.current) {
      return;
    }

    setStatus("requesting");
    setLastError(null);

    const started = await startCamera();

    if (!started.ok) {
      setStatus("error");
      setLastError(started.error);
      return;
    }

    stopCamera();

    enabledRef.current = true;
    setEnabled(true);
    setNow(Date.now());
    scheduleNext(Date.now() + intervalMs);
    setStatus("waiting");
    sessionStorage.setItem(storageKey(), "on");
    void updateFacialAutoCheckSettings(true).catch(() => undefined);
    preloadModels();
  }, [intervalMs, preloadModels, scheduleNext, startCamera, stopCamera]);

  const disable = useCallback(() => {
    enabledRef.current = false;
    runningRef.current = false;
    nextCheckAtRef.current = null;
    setEnabled(false);
    setStatus("off");
    setNextCheckAt(null);
    setLastError(null);
    stopCamera();
    sessionStorage.removeItem(storageKey());
    void updateFacialAutoCheckSettings(false).catch(() => undefined);
  }, [stopCamera]);

  const setManualCameraActive = useCallback((active: boolean) => {
    manualCameraRef.current = active;
  }, []);

  const runCheck = useCallback(async () => {
    if (
      !enabledRef.current ||
      runningRef.current ||
      manualCameraRef.current ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const lastCheck = Number(localStorage.getItem(lastCheckKey()) ?? 0);
    if (Number.isFinite(lastCheck) && Date.now() - lastCheck < DEDUPE_WINDOW_MS) {
      scheduleNext(Date.now() + intervalMs);
      return;
    }

    runningRef.current = true;
    setStatus("running");
    setLastError(null);

    let canvas: HTMLCanvasElement | null = null;

    try {
      const started = await startCamera();

      if (!started.ok) {
        setStatus("error");
        setLastError(started.error);
        return;
      }

      const video = videoRef.current;

      if (!video) {
        throw new Error("The camera preview is not available.");
      }

      await waitForVideoReady(video);
      canvas = captureFrame();

      if (!canvas) {
        throw new Error("The camera frame is not ready yet.");
      }

      const outcome = await analyzeFacialFrame(canvas, {
        shouldCancel: () => !mountedRef.current,
      });

      if (!mountedRef.current || outcome.status === "cancelled") {
        return;
      }

      if (outcome.status === "success" && outcome.analysis) {
        localStorage.setItem(lastCheckKey(), String(Date.now()));
        setStatus("saving");
        const saved = await createFacialCheckIn({
          expression: outcome.analysis.key,
          confidence: outcome.analysis.confidence,
        });

        if (!mountedRef.current) {
          return;
        }

        setLastResult(saved);
        setStatus("waiting");
        setLastError(null);
        return;
      }

      if (outcome.status === "low-confidence") {
        setStatus("waiting");
        setLastError(
          "Check skipped: expression confidence was below 60%.",
        );
        return;
      }

      setStatus("waiting");
      setLastError(outcome.message || "Check skipped. No result was saved.");
    } catch (error) {
      if (mountedRef.current) {
        setStatus("error");
        setLastError(
          error instanceof Error
            ? error.message
            : "Automatic check-in failed. It will retry next interval.",
        );
      }
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }

      stopCamera();
      runningRef.current = false;

      if (mountedRef.current && enabledRef.current) {
        scheduleNext(Date.now() + intervalMs);
      }
    }
  }, [
    captureFrame,
    intervalMs,
    scheduleNext,
    startCamera,
    stopCamera,
    videoRef,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      enabledRef.current = false;
      runningRef.current = false;
      nextCheckAtRef.current = null;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    const key = storageKey();
    let cancelled = false;

    void (async () => {
      let serverEnabled = false;
      try {
        const settings = await getFacialAutoCheckSettings();
        serverEnabled = settings.enabled;
      } catch {
        return;
      }

      if (cancelled) {
        return;
      }

      if (!serverEnabled) {
        sessionStorage.removeItem(key);
        return;
      }

      try {
        if (!navigator.permissions?.query) {
          return;
        }

        const permission = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });

        if (cancelled || permission.state !== "granted") {
          return;
        }

        enabledRef.current = true;
        setEnabled(true);
        setNow(Date.now());
        scheduleNext(Date.now() + intervalMs);
        setStatus("waiting");
        sessionStorage.setItem(key, "on");
        preloadModels();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [intervalMs, preloadModels, scheduleNext]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tick = () => {
      const currentTime = Date.now();
      setNow(currentTime);

      const dueAt = nextCheckAtRef.current;

      if (
        dueAt === null ||
        currentTime < dueAt ||
        runningRef.current
      ) {
        return;
      }

      if (manualCameraRef.current) {
        scheduleNext(currentTime + intervalMs);
        setStatus("waiting");
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      void runCheck();
    };

    const timer = window.setInterval(tick, 1000);
    tick();

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, runCheck, scheduleNext]);

  const remainingSeconds =
    enabled && nextCheckAt !== null
      ? Math.max(0, Math.ceil((nextCheckAt - now) / 1000))
      : null;

  const value = useMemo<FacialAutoCheckContextValue>(
    () => ({
      enabled,
      status,
      nextCheckAt,
      remainingSeconds,
      lastResult,
      lastError,
      enable,
      disable,
      setManualCameraActive,
    }),
    [
      disable,
      enable,
      enabled,
      lastError,
      lastResult,
      nextCheckAt,
      remainingSeconds,
      setManualCameraActive,
      status,
    ],
  );

  return (
    <FacialAutoCheckContext.Provider value={value}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      />
      {children}
    </FacialAutoCheckContext.Provider>
  );
}
