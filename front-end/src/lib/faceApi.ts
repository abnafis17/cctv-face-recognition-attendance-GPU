import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

const MODEL_URLS = [
  "/models",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/",
];

/**
 * Normalizes a 128D feature embedding vector to unit L2 length (||v||_2 = 1.0).
 * Unit length normalization ensures consistent Euclidean & Cosine distance metrics.
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

export async function loadFaceApiModels(): Promise<void> {
  if (typeof window === "undefined") return;
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let loaded = false;
    for (const url of MODEL_URLS) {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(url),
          faceapi.nets.tinyFaceDetector.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url),
        ]);
        loaded = true;
        break;
      } catch (err) {
        console.warn(`Failed to load full face-api model suite from ${url}`, err);
      }
    }

    if (!loaded) {
      for (const url of MODEL_URLS) {
        try {
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(url),
            faceapi.nets.faceLandmark68Net.loadFromUri(url),
            faceapi.nets.faceRecognitionNet.loadFromUri(url),
          ]);
          loaded = true;
          break;
        } catch (e) {
          console.warn(`SSD Mobilenet fallback failed for ${url}`, e);
        }
      }
    }

    modelsLoaded = loaded;
  })();

  return loadPromise;
}

export async function extractFaceDescriptor(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<number[] | null> {
  try {
    if (typeof window === "undefined") return null;
    if (!modelsLoaded) {
      await loadFaceApiModels();
    }

    let detection: faceapi.WithFaceDescriptor<any> | undefined = undefined;

    // Primary High-Accuracy Detector: SSD MobileNet V1
    if (faceapi.nets.ssdMobilenetv1.isLoaded) {
      detection = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    // Secondary Fallback Detector: TinyFaceDetector
    if (!detection && faceapi.nets.tinyFaceDetector.isLoaded) {
      detection = await faceapi
        .detectSingleFace(
          input,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        detection = await faceapi
          .detectSingleFace(
            input,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
          )
          .withFaceLandmarks(true)
          .withFaceDescriptor();
      }
    }

    if (!detection || !detection.descriptor) {
      return null;
    }

    return normalizeL2(detection.descriptor);
  } catch (error) {
    console.error("Error extracting face descriptor:", error);
    return null;
  }
}

export interface FaceAnalysisResult {
  valid: boolean;
  faceCount: number;
  descriptor: number[] | null;
  score: number;
  error?: string;
}

export async function analyzeCapturedImage(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceAnalysisResult> {
  try {
    if (typeof window === "undefined") {
      return { valid: false, faceCount: 0, descriptor: null, score: 0, error: "SSR environment" };
    }
    if (!modelsLoaded) {
      await loadFaceApiModels();
    }

    let detections: any[] = [];

    // Primary Industrial Detector: SSD MobileNet V1
    if (faceapi.nets.ssdMobilenetv1.isLoaded) {
      detections = await faceapi
        .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    // Fallback Detector: TinyFaceDetector if SSD MobileNet returned no faces
    if (detections.length === 0 && faceapi.nets.tinyFaceDetector.isLoaded) {
      detections = await faceapi
        .detectAllFaces(
          input,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        detections = await faceapi
          .detectAllFaces(
            input,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
          )
          .withFaceLandmarks(true)
          .withFaceDescriptors();
      }
    }

    if (detections.length === 0) {
      return {
        valid: false,
        faceCount: 0,
        descriptor: null,
        score: 0,
        error: "No face detected in the captured photo. Please align your face clearly in the frame.",
      };
    }

    if (detections.length > 1) {
      return {
        valid: false,
        faceCount: detections.length,
        descriptor: null,
        score: 0,
        error: `Multiple faces detected (${detections.length} persons). Please ensure ONLY 1 person is in the frame.`,
      };
    }

    const singleDetection = detections[0];
    const score = singleDetection.detection?.score || 1.0;

    if (score < 0.35) {
      return {
        valid: false,
        faceCount: 1,
        descriptor: null,
        score,
        error: "Face image quality is too low or blurry. Please ensure good lighting and clear face visibility.",
      };
    }

    const descriptor = normalizeL2(singleDetection.descriptor as Float32Array);
    return {
      valid: true,
      faceCount: 1,
      descriptor,
      score,
    };
  } catch (error: any) {
    console.error("Error analyzing captured face image:", error);
    return {
      valid: false,
      faceCount: 0,
      descriptor: null,
      score: 0,
      error: "Face image analysis failed. Please try again.",
    };
  }
}

/**
 * Lightweight real-time face detector for live-camera overlays.
 * Uses only TinyFaceDetector (no landmarks / descriptors) so it's fast
 * enough to run inside a requestAnimationFrame loop (~130 ms cadence).
 *
 * Returns an array of detected face bounding boxes: { top, left, right, bottom, width, height }.
 * Returns an empty array when no face is found or models are not yet loaded.
 */
export async function detectFacesLive(
  video: HTMLVideoElement
): Promise<{ top: number; left: number; right: number; bottom: number; width: number; height: number }[]> {
  try {
    if (!modelsLoaded) return [];
    if (video.readyState < 2 || video.videoWidth === 0) return [];

    const detections = await faceapi
      .detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.40 })
      );

    return detections.map((d) => ({
      top:    d.box.top,
      left:   d.box.left,
      right:  d.box.right,
      bottom: d.box.bottom,
      width:  d.box.width,
      height: d.box.height,
    }));
  } catch {
    return [];
  }
}
