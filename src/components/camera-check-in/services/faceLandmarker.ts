import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision";
import type { FaceDetectionResult } from "../types/expression";

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
const FACE_MODEL_PATH = "/models/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

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

async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);

  try {
    return await FaceLandmarker.createFromOptions(fileset, buildOptions("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, buildOptions("CPU"));
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createFaceLandmarker().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }

  return landmarkerPromise;
}

export async function detectFaces(
  source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
): Promise<FaceDetectionResult> {
  const landmarker = await getFaceLandmarker();
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
