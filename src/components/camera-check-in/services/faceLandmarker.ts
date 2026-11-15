import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision";
import type { FaceDetectionResult } from "../types/expression";

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
const FACE_MODEL_PATH = "/models/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let usingCpuFallback = false;

function buildOptions(delegate: "CPU" | "GPU"): FaceLandmarkerOptions {
  return {
    baseOptions: {
      modelAssetPath: FACE_MODEL_PATH,
      delegate,
    },
    runningMode: "IMAGE",
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
}

async function createFaceLandmarker(
  delegate: "CPU" | "GPU",
): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  return FaceLandmarker.createFromOptions(fileset, buildOptions(delegate));
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      if (usingCpuFallback) {
        return createFaceLandmarker("CPU");
      }

      try {
        return await createFaceLandmarker("GPU");
      } catch {
        usingCpuFallback = true;
        return createFaceLandmarker("CPU");
      }
    })().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }

  return landmarkerPromise;
}

function runDetection(
  landmarker: FaceLandmarker,
  source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
): FaceDetectionResult {
  const result = landmarker.detect(source);

  const landmarks = result.faceLandmarks.map((face) =>
    face.map((landmark) => ({ x: landmark.x, y: landmark.y })),
  );

  const blendshapes = (result.faceBlendshapes ?? []).map((classification) =>
    classification.categories.map((category) => ({
      categoryName: category.categoryName,
      score: category.score,
    })),
  );

  return {
    count: landmarks.length,
    landmarks,
    blendshapes,
  };
}

export async function detectFaces(
  source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
): Promise<FaceDetectionResult> {
  const landmarker = await getFaceLandmarker();

  try {
    return runDetection(landmarker, source);
  } catch (error) {
    if (usingCpuFallback) {
      throw error;
    }

    usingCpuFallback = true;
    landmarkerPromise = null;
    const fallback = await getFaceLandmarker();
    return runDetection(fallback, source);
  }
}
