import { createContext, useContext } from "react";
import type { FacialCheckInEntry } from "@/lib/api";

export type FacialAutoCheckStatus =
  | "off"
  | "requesting"
  | "waiting"
  | "running"
  | "saving"
  | "error";

export interface FacialAutoCheckContextValue {
  enabled: boolean;
  status: FacialAutoCheckStatus;
  nextCheckAt: number | null;
  remainingSeconds: number | null;
  lastResult: FacialCheckInEntry | null;
  lastError: string | null;
  enable: () => Promise<void>;
  disable: () => void;
  setManualCameraActive: (active: boolean) => void;
}

export const FacialAutoCheckContext =
  createContext<FacialAutoCheckContextValue | null>(null);

export function useFacialAutoCheck(): FacialAutoCheckContextValue {
  const context = useContext(FacialAutoCheckContext);

  if (!context) {
    throw new Error(
      "useFacialAutoCheck must be used inside FacialAutoCheckProvider.",
    );
  }

  return context;
}
