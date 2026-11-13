import * as ort from "onnxruntime-web/wasm";
import { MODEL_INPUT_SIZE } from "../utils/expressionMapping";

const EXPRESSION_MODEL_URL = "/models/emotion-ferplus-8.onnx";
const ORT_WASM_PATH = "/ort/";

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let modelLoaded = false;

export type ModelProgressCallback = (progress: number) => void;

function configureRuntime(): void {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = ORT_WASM_PATH;
}

async function readModelBytes(
  onProgress?: ModelProgressCallback,
): Promise<Uint8Array> {
  const response = await fetch(EXPRESSION_MODEL_URL);

  if (!response.ok) {
    throw new Error(
      `Unable to download the expression model (HTTP ${response.status}).`,
    );
  }

  const total = Number(response.headers.get("content-length")) || 0;

  if (!response.body || total <= 0) {
    const buffer = await response.arrayBuffer();
    onProgress?.(100);
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(
        Math.min(99, Math.round((received / total) * 100)),
      );
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  onProgress?.(100);
  return bytes;
}

async function createSession(
  onProgress?: ModelProgressCallback,
): Promise<ort.InferenceSession> {
  configureRuntime();
  const modelBytes = await readModelBytes(onProgress);
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });

  modelLoaded = true;
  return session;
}

export function isExpressionModelLoaded(): boolean {
  return modelLoaded;
}

export function loadExpressionModel(
  onProgress?: ModelProgressCallback,
): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = createSession(onProgress).catch((error) => {
      sessionPromise = null;
      modelLoaded = false;
      throw error;
    });
  }

  return sessionPromise;
}

export async function classifyExpression(
  grayscale: Float32Array,
): Promise<number[]> {
  if (grayscale.length !== MODEL_INPUT_SIZE * MODEL_INPUT_SIZE) {
    throw new Error(
      `Expected ${MODEL_INPUT_SIZE * MODEL_INPUT_SIZE} pixels, received ${grayscale.length}.`,
    );
  }

  const session = await loadExpressionModel();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const input = new ort.Tensor("float32", grayscale, [
    1,
    1,
    MODEL_INPUT_SIZE,
    MODEL_INPUT_SIZE,
  ]);

  const outputs = await session.run({ [inputName]: input });

  try {
    const output = outputs[outputName];

    if (!output) {
      throw new Error("The expression model did not return a result.");
    }

    return Array.from(output.data as Float32Array);
  } finally {
    for (const tensor of Object.values(outputs)) {
      tensor.dispose?.();
    }
    input.dispose?.();
  }
}
