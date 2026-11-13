export type ExpressionKey =
  | "neutral"
  | "happiness"
  | "surprise"
  | "sadness"
  | "anger"
  | "disgust"
  | "fear"
  | "contempt";

export interface ExpressionPrediction {
  key: ExpressionKey;
  label: string;
  confidence: number;
}

export type AnalysisStatus = "success" | "low-confidence";

export interface ExpressionAnalysis {
  key: ExpressionKey;
  label: string;
  confidence: number;
  status: AnalysisStatus;
  probabilities: ExpressionPrediction[];
  analyzedAt: number;
}

export type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "error";

export type FaceStatus =
  | "unknown"
  | "checking"
  | "no-face"
  | "multiple-faces"
  | "one-face"
  | "too-small"
  | "partial"
  | "error";

export type AnalysisPhase =
  | "idle"
  | "preparing"
  | "ready"
  | "capturing"
  | "model-loading"
  | "analyzing"
  | "success"
  | "low-confidence"
  | "error";

export type ReflectionChoice = "unset" | "matches" | "different" | "skipped";

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
}

export interface FaceBlendshape {
  categoryName: string;
  score: number;
}

export interface FaceDetectionResult {
  count: number;
  landmarks: NormalizedLandmark[][];
  blendshapes: FaceBlendshape[][];
}

export interface ImageQuality {
  brightness: number;
  brightnessOk: boolean;
  blurScore: number;
  blurOk: boolean;
}
