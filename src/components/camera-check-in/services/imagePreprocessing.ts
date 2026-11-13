import type {
  FaceBox,
  ImageQuality,
  NormalizedLandmark,
} from "../types/expression";
import { MODEL_INPUT_SIZE } from "../utils/expressionMapping";

const MIN_BRIGHTNESS = 35;
const MAX_BRIGHTNESS = 225;
const MIN_BLUR_SCORE = 8;
const DEFAULT_FACE_MARGIN = 0.18;
const DEFAULT_MIN_FACE_RATIO = 0.18;
const DEFAULT_EDGE_RATIO = 0.02;

export function computeLandmarkBox(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
  margin: number = DEFAULT_FACE_MARGIN,
): FaceBox {
  if (!landmarks.length || frameWidth <= 0 || frameHeight <= 0) {
    throw new Error("Face landmarks are unavailable.");
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const landmark of landmarks) {
    const x = landmark.x * frameWidth;
    const y = landmark.y * frameHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error("Face landmarks could not be mapped to the camera frame.");
  }

  const faceWidth = Math.max(maxX - minX, 1);
  const faceHeight = Math.max(maxY - minY, 1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const maxSize = Math.min(frameWidth, frameHeight);
  const size = Math.min(
    Math.max(faceWidth, faceHeight) * (1 + margin * 2),
    maxSize,
  );

  const x = Math.min(Math.max(centerX - size / 2, 0), frameWidth - size);
  const y = Math.min(Math.max(centerY - size / 2, 0), frameHeight - size);

  return { x, y, width: size, height: size };
}

export function isFaceTooSmall(
  box: FaceBox,
  frameWidth: number,
  frameHeight: number,
  minRatio: number = DEFAULT_MIN_FACE_RATIO,
): boolean {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return true;
  }
  return Math.min(box.width / frameWidth, box.height / frameHeight) < minRatio;
}

export function isFacePartial(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
  edgeRatio: number = DEFAULT_EDGE_RATIO,
): boolean {
  if (!landmarks.length || frameWidth <= 0 || frameHeight <= 0) {
    return false;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const landmark of landmarks) {
    const x = landmark.x * frameWidth;
    const y = landmark.y * frameHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return false;
  }

  return (
    minX <= frameWidth * edgeRatio ||
    maxX >= frameWidth * (1 - edgeRatio) ||
    minY <= frameHeight * edgeRatio ||
    maxY >= frameHeight * (1 - edgeRatio)
  );
}

export function cropFaceToGrayscale(
  source: CanvasImageSource,
  box: FaceBox,
  size: number = MODEL_INPUT_SIZE,
): Float32Array {
  if (box.width <= 0 || box.height <= 0) {
    throw new Error("The detected face area is too small to analyze.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("The browser could not prepare the captured frame for analysis.");
  }

  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size).data;
  const grayscale = new Float32Array(size * size);

  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    grayscale[index] =
      0.299 * imageData[offset] +
      0.587 * imageData[offset + 1] +
      0.114 * imageData[offset + 2];
  }

  canvas.width = 0;
  canvas.height = 0;

  return grayscale;
}

export function assessImageQuality(
  grayscale: Float32Array,
  size: number = MODEL_INPUT_SIZE,
): ImageQuality {
  let brightnessTotal = 0;
  for (let index = 0; index < grayscale.length; index += 1) {
    brightnessTotal += grayscale[index];
  }
  const brightness =
    grayscale.length > 0 ? brightnessTotal / grayscale.length : 0;

  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let laplacianCount = 0;

  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      const laplacian =
        -4 * grayscale[index] +
        grayscale[index - 1] +
        grayscale[index + 1] +
        grayscale[index - size] +
        grayscale[index + size];

      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  let blurScore = 0;
  if (laplacianCount > 0) {
    const laplacianMean = laplacianTotal / laplacianCount;
    blurScore =
      laplacianSquaredTotal / laplacianCount - laplacianMean * laplacianMean;
  }

  return {
    brightness,
    brightnessOk:
      brightness >= MIN_BRIGHTNESS && brightness <= MAX_BRIGHTNESS,
    blurScore,
    blurOk: blurScore >= MIN_BLUR_SCORE,
  };
}
