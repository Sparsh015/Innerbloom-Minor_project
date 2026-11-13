import type {
  AnalysisStatus,
  ExpressionAnalysis,
  ExpressionKey,
  ExpressionPrediction,
} from "../types/expression";

export const MODEL_INPUT_SIZE = 64;

export const CONFIDENCE_THRESHOLD = 0.6;

export const EXPRESSION_KEYS: ExpressionKey[] = [
  "neutral",
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
  "fear",
  "contempt",
];

export const EXPRESSION_LABELS: Record<ExpressionKey, string> = {
  neutral: "Neutral",
  happiness: "Happy",
  surprise: "Surprised",
  sadness: "Sad",
  anger: "Angry",
  disgust: "Disgusted",
  fear: "Fearful",
  contempt: "Contemptuous",
};

export function softmax(logits: number[]): number[] {
  if (logits.length === 0) {
    return [];
  }

  let max = -Infinity;
  for (const logit of logits) {
    if (!Number.isFinite(logit)) {
      throw new Error("Model output contains non-finite values.");
    }
    if (logit > max) {
      max = logit;
    }
  }

  const exponentials = logits.map((logit) => Math.exp(logit - max));
  const sum = exponentials.reduce((total, value) => total + value, 0);

  if (!Number.isFinite(sum) || sum <= 0) {
    throw new Error("Model output could not be converted to probabilities.");
  }

  return exponentials.map((value) => value / sum);
}

export function toPredictions(probabilities: number[]): ExpressionPrediction[] {
  if (probabilities.length !== EXPRESSION_KEYS.length) {
    throw new Error(
      `Expected ${EXPRESSION_KEYS.length} expression scores, received ${probabilities.length}.`,
    );
  }

  return EXPRESSION_KEYS.map((key, index) => ({
    key,
    label: EXPRESSION_LABELS[key],
    confidence: probabilities[index],
  })).sort((a, b) => b.confidence - a.confidence);
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLD;
}

export function buildAnalysis(
  logits: number[],
  analyzedAt: number = Date.now(),
): ExpressionAnalysis {
  const probabilities = softmax(logits);
  const ranked = toPredictions(probabilities);
  const top = ranked[0];
  const status: AnalysisStatus = isLowConfidence(top.confidence)
    ? "low-confidence"
    : "success";

  return {
    key: top.key,
    label: top.label,
    confidence: top.confidence,
    status,
    probabilities: ranked,
    analyzedAt,
  };
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
