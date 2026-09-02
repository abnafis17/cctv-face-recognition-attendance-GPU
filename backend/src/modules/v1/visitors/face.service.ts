import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import * as tf from "@tensorflow/tfjs";
import * as wasm from "@tensorflow/tfjs-backend-wasm";
import { Canvas, Image, ImageData, loadImage } from "canvas";
import path from "path";
import fs from "fs";

// Patch faceapi environment for Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

let modelsLoaded = false;
let modelLoadPromise: Promise<void> | null = null;

/**
 * Normalizes a 128D feature embedding vector to unit L2 length (||v||_2 = 1.0).
 */
export function normalizeL2(vector: number[] | Float32Array): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return Array.from(vector);
  const result = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / norm;
  }
  return result;
}

export async function ensureFaceModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    // Initialize WASM backend
    console.log("[VisitorFaceService] Initializing TensorFlow JS WASM backend...");
    wasm.setWasmPaths("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/", true);
    await tf.setBackend("wasm");
    await tf.ready();
    console.log(`[VisitorFaceService] TensorFlow JS Backend: ${tf.getBackend()}`);

    // Look for models in front-end/public/models or backend/models
    const possiblePaths = [
      path.resolve(__dirname, "../../../../../front-end/public/models"),
      path.resolve(__dirname, "../../../../models"),
      path.resolve(process.cwd(), "../front-end/public/models"),
      path.resolve(process.cwd(), "models"),
    ];

    let validPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, "ssd_mobilenetv1_model-weights_manifest.json"))) {
        validPath = p;
        break;
      }
    }

    if (!validPath) {
      throw new Error(`Face API models directory not found in any of: ${possiblePaths.join(", ")}`);
    }

    console.log(`[VisitorFaceService] Loading face-api models from: ${validPath}`);
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(validPath),
      faceapi.nets.tinyFaceDetector.loadFromDisk(validPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(validPath),
      faceapi.nets.faceLandmark68TinyNet.loadFromDisk(validPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(validPath),
    ]);

    modelsLoaded = true;
    console.log("[VisitorFaceService] Face-api models loaded successfully in Express backend.");
  })();

  return modelLoadPromise;
}

export interface ExtractVisitorFaceResult {
  valid: boolean;
  embedding: number[] | null;
  score?: number;
  faceCount?: number;
  error?: string;
}

/**
 * Extracts a high-precision 128D SSD MobileNet V1 face embedding vector from an image Buffer in Node.js backend.
 */
export async function extractVisitorFaceEmbedding(
  imageBuffer: Buffer
): Promise<ExtractVisitorFaceResult> {
  try {
    await ensureFaceModelsLoaded();

    const img = await loadImage(imageBuffer);
    const canvasElement = faceapi.createCanvasFromMedia(img as any);

    let detections: any[] = [];

    // Primary Industrial Detector: SSD MobileNet V1
    if (faceapi.nets.ssdMobilenetv1.isLoaded) {
      detections = await faceapi
        .detectAllFaces(canvasElement as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    // Fallback: TinyFaceDetector if SSD MobileNet V1 returned no faces
    if (detections.length === 0 && faceapi.nets.tinyFaceDetector.isLoaded) {
      detections = await faceapi
        .detectAllFaces(
          canvasElement as any,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    if (detections.length === 0) {
      return {
        valid: false,
        embedding: null,
        faceCount: 0,
        error: "No face detected in the captured photo. Please ensure a clear, well-lit face is uploaded.",
      };
    }

    if (detections.length > 1) {
      return {
        valid: false,
        embedding: null,
        faceCount: detections.length,
        error: `Multiple faces detected (${detections.length} persons). Please upload a photo with only 1 person.`,
      };
    }

    const singleDetection = detections[0];
    const score = singleDetection.detection?.score || 1.0;

    if (score < 0.35) {
      return {
        valid: false,
        embedding: null,
        faceCount: 1,
        score,
        error: "Face quality is too low or blurry. Please upload a clearer face photo.",
      };
    }

    const embedding = normalizeL2(singleDetection.descriptor as Float32Array);
    return {
      valid: true,
      embedding,
      faceCount: 1,
      score,
    };
  } catch (error: any) {
    console.error("[VisitorFaceService] Error extracting face embedding:", error);
    return {
      valid: false,
      embedding: null,
      error: `Backend face processing error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
