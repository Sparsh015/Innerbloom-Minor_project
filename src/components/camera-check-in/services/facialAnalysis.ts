import type {
  ExpressionAnalysis,
  FaceStatus,
  ImageQuality,
} from "../types/expression";
import { buildAnalysis } from "../utils/expressionMapping";
import {
  classifyExpression,
  isExpressionModelLoaded,
  loadExpressionModel,
} from "./expressionClassifier";
import { detectFaces } from "./faceLandmarker";
import {
  assessImageQuality,
  computeLandmarkBox,
  cropFaceToGrayscale,
  isFacePartial,
  isFaceTooSmall,
} from "./imagePreprocessing";

export const MIN_FACE_RATIO = 0.18;

export type FacialAnalysisStatus =
  | "success"
  | "low-confidence"
  | "failed"
  | "cancelled";

export type FacialAnalysisStage = "model-loading" | "analyzing";

export interface FacialAnalysisOutcome {
  status: FacialAnalysisStatus;
  analysis: ExpressionAnalysis | null;
  faceStatus: FaceStatus;
  message: string;
  qualityWarning: string | null;
  quality: ImageQuality | null;
}

interface AnalyzeFacialFrameOptions {
  onFaceStatus?: (status: FaceStatus) => void;
  onPhase?: (stage: FacialAnalysisStage) => void;
  onModelProgress?: (progress: number) => void;
  shouldCancel?: () => boolean;
}

export async function analyzeFacialFrame(
  source: HTMLCanvasElement | HTMLVideoElement,
  options: AnalyzeFacialFrameOptions = {},
): Promise<FacialAnalysisOutcome> {
  const isCancelled = () => options.shouldCancel?.() ?? false;

  const reportFaceStatus = (status: FaceStatus) => {
    options.onFaceStatus?.(status);
  };

  const failed = (faceStatus: FaceStatus, message: string): FacialAnalysisOutcome => {
    reportFaceStatus(faceStatus);
    return {
      status: "failed",
      analysis: null,
      faceStatus,
      message,
      qualityWarning: null,
      quality: null,
    };
  };

  const detection = await detectFaces(source);

  if (isCancelled()) {
    return {
      status: "cancelled",
      analysis: null,
      faceStatus: "unknown",
      message: "",
      qualityWarning: null,
      quality: null,
    };
  }

  if (detection.count === 0) {
    return failed(
      "no-face",
      "No face detected. Please position your face clearly inside the camera frame.",
    );
  }

  if (detection.count > 1) {
    return failed(
      "multiple-faces",
      "Please ensure only one face is visible in the camera.",
    );
  }

  const landmarks = detection.landmarks[0];
  if (!landmarks) {
    return failed(
      "no-face",
      "No face detected. Please position your face clearly inside the camera frame.",
    );
  }

  const frameWidth = source instanceof HTMLCanvasElement
    ? source.width
    : source.videoWidth;
  const frameHeight = source instanceof HTMLCanvasElement
    ? source.height
    : source.videoHeight;
  const box = computeLandmarkBox(landmarks, frameWidth, frameHeight);

  if (isFaceTooSmall(box, frameWidth, frameHeight, MIN_FACE_RATIO)) {
    return failed(
      "too-small",
      "Move a little closer so your face fills more of the camera frame.",
    );
  }

  if (isFacePartial(landmarks, frameWidth, frameHeight)) {
    return failed(
      "partial",
      "Center your full face inside the camera frame and try again.",
    );
  }

  reportFaceStatus("one-face");

  const grayscale = cropFaceToGrayscale(source, box);
  const quality = assessImageQuality(grayscale);
  const qualityWarning = buildQualityWarning(quality);

  if (isCancelled()) {
    return {
      status: "cancelled",
      analysis: null,
      faceStatus: "one-face",
      message: "",
      qualityWarning,
      quality,
    };
  }

  if (isExpressionModelLoaded()) {
    options.onPhase?.("analyzing");
  } else {
    options.onPhase?.("model-loading");
  }

  await loadExpressionModel(options.onModelProgress);

  if (isCancelled()) {
    return {
      status: "cancelled",
      analysis: null,
      faceStatus: "one-face",
      message: "",
      qualityWarning,
      quality,
    };
  }

  options.onPhase?.("analyzing");

  const logits = await classifyExpression(grayscale);

  if (isCancelled()) {
    return {
      status: "cancelled",
      analysis: null,
      faceStatus: "one-face",
      message: "",
      qualityWarning,
      quality,
    };
  }

  const analysis = buildAnalysis(logits);

  return {
    status: analysis.status,
    analysis,
    faceStatus: "one-face",
    message: "",
    qualityWarning,
    quality,
  };
}

function buildQualityWarning(quality: ImageQuality): string | null {
  if (quality.brightnessOk && quality.blurOk) {
    return null;
  }

  const issues: string[] = [];
  if (!quality.brightnessOk) {
    issues.push("the lighting looks uneven");
  }
  if (!quality.blurOk) {
    issues.push("the image looks a little blurry");
  }

  return `For a better result, make sure your face is well lit and in focus — ${issues.join(
    " and ",
  )}.`;
}
