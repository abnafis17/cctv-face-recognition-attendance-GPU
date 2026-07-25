import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

const MODEL_URLS = [
  "/models",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/",
];

export async function loadFaceApiModels(): Promise<void> {
  if (typeof window === "undefined") return;
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let loaded = false;
    for (const url of MODEL_URLS) {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url),
        ]);
        loaded = true;
        break;
      } catch (err) {
        console.warn(`Failed to load face-api models from ${url}`, err);
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

    if (faceapi.nets.tinyFaceDetector.isLoaded) {
      detection = await faceapi
        .detectSingleFace(
          input,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        detection = await faceapi
          .detectSingleFace(
            input,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.25 })
          )
          .withFaceLandmarks(true)
          .withFaceDescriptor();
      }
    }

    if (!detection && faceapi.nets.ssdMobilenetv1.isLoaded) {
      detection = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    if (!detection || !detection.descriptor) {
      return null;
    }

    return Array.from(detection.descriptor);
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

    if (faceapi.nets.tinyFaceDetector.isLoaded) {
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

    if (detections.length === 0 && faceapi.nets.ssdMobilenetv1.isLoaded) {
      detections = await faceapi
        .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
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

    if (score < 0.3) {
      return {
        valid: false,
        faceCount: 1,
        descriptor: null,
        score,
        error: "Face image quality is too low or blurry. Please ensure good lighting and clear face visibility.",
      };
    }

    const descriptor = Array.from(singleDetection.descriptor as Float32Array);
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


