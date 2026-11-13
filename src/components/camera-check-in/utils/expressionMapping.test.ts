import { describe, expect, it } from "vitest";
import {
  buildAnalysis,
  CONFIDENCE_THRESHOLD,
  formatConfidence,
  isLowConfidence,
  softmax,
  toPredictions,
} from "./expressionMapping";

describe("softmax", () => {
  it("converts logits into probabilities that sum to one", () => {
    const probabilities = softmax([1, 2, 3]);

    expect(probabilities).toHaveLength(3);
    expect(probabilities.reduce((total, value) => total + value, 0)).toBeCloseTo(
      1,
      6,
    );
    expect(probabilities[0]).toBeCloseTo(0.09003057, 6);
    expect(probabilities[1]).toBeCloseTo(0.24472847, 6);
    expect(probabilities[2]).toBeCloseTo(0.66524096, 6);
  });

  it("is numerically stable for large logits", () => {
    const probabilities = softmax([1000, 1001, 1002]);

    expect(probabilities.every((value) => Number.isFinite(value))).toBe(true);
    expect(probabilities.reduce((total, value) => total + value, 0)).toBeCloseTo(
      1,
      6,
    );
  });

  it("rejects non-finite logits", () => {
    expect(() => softmax([0, Number.NaN, 1])).toThrow();
  });
});

describe("toPredictions", () => {
  it("sorts predictions from highest to lowest confidence", () => {
    const predictions = toPredictions([
      0.05, 0.7, 0.1, 0.05, 0.02, 0.03, 0.03, 0.02,
    ]);

    expect(predictions[0].key).toBe("happiness");
    expect(predictions[0].label).toBe("Happy");
    expect(predictions[0].confidence).toBeCloseTo(0.7, 6);
    expect(predictions.map((prediction) => prediction.confidence)).toEqual(
      [...predictions]
        .map((prediction) => prediction.confidence)
        .sort((a, b) => b - a),
    );
  });

  it("rejects the wrong number of scores", () => {
    expect(() => toPredictions([0.5, 0.5])).toThrow();
  });
});

describe("buildAnalysis", () => {
  it("marks a confident prediction as success", () => {
    const analysis = buildAnalysis([10, 0, 0, 0, 0, 0, 0, 0], 123);

    expect(analysis.key).toBe("neutral");
    expect(analysis.status).toBe("success");
    expect(analysis.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
    expect(analysis.analyzedAt).toBe(123);
    expect(analysis.probabilities).toHaveLength(8);
  });

  it("marks an ambiguous prediction as low confidence", () => {
    const analysis = buildAnalysis([0, 0, 0, 0, 0, 0, 0, 0]);

    expect(analysis.status).toBe("low-confidence");
    expect(analysis.confidence).toBeCloseTo(0.125, 6);
    expect(isLowConfidence(analysis.confidence)).toBe(true);
  });
});

describe("formatConfidence", () => {
  it("formats a confidence as a percentage", () => {
    expect(formatConfidence(0.923)).toBe("92%");
  });
});
