import { describe, expect, it } from "vitest";
import {
  assessImageQuality,
  computeLandmarkBox,
  isFacePartial,
  isFaceTooSmall,
} from "./imagePreprocessing";

describe("computeLandmarkBox", () => {
  it("builds a square box around the detected face", () => {
    const box = computeLandmarkBox(
      [
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.6 },
      ],
      200,
      200,
      0.1,
    );

    expect(box).toEqual({ x: 76, y: 76, width: 48, height: 48 });
  });

  it("clamps the box inside the frame", () => {
    const box = computeLandmarkBox(
      [
        { x: 0, y: 0 },
        { x: 0.2, y: 0.2 },
      ],
      200,
      200,
      0.1,
    );

    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(48);
    expect(box.height).toBe(48);
  });

  it("rejects missing landmarks", () => {
    expect(() => computeLandmarkBox([], 200, 200)).toThrow();
  });
});

describe("isFaceTooSmall", () => {
  it("flags faces that cover too little of the frame", () => {
    expect(
      isFaceTooSmall({ x: 0, y: 0, width: 20, height: 20 }, 200, 200),
    ).toBe(true);
  });

  it("accepts faces that cover enough of the frame", () => {
    expect(
      isFaceTooSmall({ x: 0, y: 0, width: 40, height: 40 }, 200, 200),
    ).toBe(false);
  });
});

describe("isFacePartial", () => {
  it("flags landmarks touching the frame edge", () => {
    expect(
      isFacePartial(
        [
          { x: 0.01, y: 0.5 },
          { x: 0.2, y: 0.8 },
        ],
        200,
        200,
      ),
    ).toBe(true);
  });

  it("accepts a fully visible centered face", () => {
    expect(
      isFacePartial(
        [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.6 },
        ],
        200,
        200,
      ),
    ).toBe(false);
  });
});

describe("assessImageQuality", () => {
  it("accepts a well-lit, sharp image", () => {
    const pixels = new Float32Array(64 * 64);

    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        pixels[y * 64 + x] = (x + y) % 2 === 0 ? 0 : 255;
      }
    }

    const quality = assessImageQuality(pixels, 64);

    expect(quality.brightnessOk).toBe(true);
    expect(quality.blurOk).toBe(true);
  });

  it("rejects a dark, flat image", () => {
    const pixels = new Float32Array(64 * 64).fill(10);
    const quality = assessImageQuality(pixels, 64);

    expect(quality.brightnessOk).toBe(false);
    expect(quality.blurOk).toBe(false);
  });
});
