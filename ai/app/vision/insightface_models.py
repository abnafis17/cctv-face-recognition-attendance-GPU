from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from insightface import model_zoo
from insightface.utils import face_align
import threading

from ..utils import l2_normalize


def _env_bool(name: str, default: bool) -> bool:
    v = str(os.getenv(name, str(int(default)))).strip().lower()
    return v in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def _env_str(name: str, default: str) -> str:
    return str(os.getenv(name, default)).strip()


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _pick_providers(use_gpu: bool) -> list[str]:
    """
    ORT_PROVIDER:
      - auto (default): use CUDA if USE_GPU=1 else CPU
      - cuda: force CUDA+CPU
      - tensorrt: TensorRT+CUDA+CPU
      - cpu: CPU only
    """
    ort_provider = _env_str("ORT_PROVIDER", "auto").lower()

    if ort_provider == "cpu":
        return ["CPUExecutionProvider"]

    if ort_provider == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]

    if ort_provider == "tensorrt":
        return ["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]

    # auto
    if use_gpu:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


@dataclass(slots=True)
class FaceDetection:
    bbox: np.ndarray  # float32 [x1,y1,x2,y2]
    kps: Optional[np.ndarray]
    det_score: float


class FaceDetector:
    """
    Detection-only InsightFace wrapper.

    This keeps GPU usage low by not running recognition on every detection call.
    """

    def __init__(
        self,
        *,
        model_name: str = "buffalo_l",
        use_gpu: bool = True,
        det_size: Tuple[int, int] = (640, 640),
        min_face_size: int = 30,
        min_det_score: float = 0.35,
    ):
        use_gpu = _env_bool("USE_GPU", use_gpu)
        det_n = _env_int("AI_DET_SIZE", det_size[0])
        det_size = (det_n, det_n)

        self.min_face_size = int(min_face_size)
        self.min_det_score = _clamp(_env_float("MIN_FACE_DET_SCORE", min_det_score), 0.0, 1.0)

        providers = _pick_providers(use_gpu)
        ctx_id = 0 if use_gpu else -1

        self.app = FaceAnalysis(name=model_name, providers=providers, allowed_modules=["detection"])
        self.app.prepare(ctx_id=ctx_id, det_size=det_size)

        print(
            f"[FaceDetector] USE_GPU={int(use_gpu)} ORT_PROVIDER={_env_str('ORT_PROVIDER','auto')} providers={providers} ctx_id={ctx_id} det_size={det_size}"
        )

    def detect(self, frame_bgr: np.ndarray) -> List[FaceDetection]:
        faces = self.app.get(frame_bgr)
        out: List[FaceDetection] = []
        best_fallback: Optional[FaceDetection] = None

        for f in faces:
            score = float(getattr(f, "det_score", 1.0))
            bbox = np.asarray(getattr(f, "bbox"), dtype=np.float32)
            w = float(bbox[2] - bbox[0])
            h = float(bbox[3] - bbox[1])
            if min(w, h) < self.min_face_size:
                continue
            kps = getattr(f, "kps", None)
            det = FaceDetection(bbox=bbox, kps=kps, det_score=score)

            if score >= self.min_det_score:
                out.append(det)
            if best_fallback is None or score > best_fallback.det_score:
                best_fallback = det

        fallback_floor = float(os.getenv("FALLBACK_DET_SCORE", "0.0"))  # 0.0 disables fallback
        if not out and best_fallback is not None and best_fallback.det_score >= fallback_floor:
            out.append(best_fallback)

        return out


class FaceEmbedder:
    """
    Recognition-only embedder (ArcFace ONNX from the same InsightFace model pack).
    """

    def __init__(self, *, model_name: str = "buffalo_l", use_gpu: bool = True):
        use_gpu = _env_bool("USE_GPU", use_gpu)

        # Default behavior:
        # - If EMBED_USE_GPU is explicitly set, honor it.
        # - Otherwise, follow USE_GPU (restores legacy "fast" behavior when GPU is enabled).
        raw = os.getenv("EMBED_USE_GPU")
        embed_use_gpu = use_gpu if raw is None else _env_bool("EMBED_USE_GPU", False)
        providers = _pick_providers(use_gpu=use_gpu) if embed_use_gpu else ["CPUExecutionProvider"]
        ctx_id = 0 if (embed_use_gpu and "CUDAExecutionProvider" in providers) else -1
        self.model = model_zoo.get_model(model_name, providers=providers)
        if self.model is None:
            raise RuntimeError(f"Failed to load insightface model: {model_name}")
        self.model.prepare(ctx_id=ctx_id)
        self._lock = threading.Lock()

        print(
            f"[FaceEmbedder] EMBED_USE_GPU={int(embed_use_gpu)} providers={providers} ctx_id={ctx_id}"
        )

    @staticmethod
    def _crop_bbox(frame_bgr: np.ndarray, bbox: Tuple[int, int, int, int]) -> Optional[np.ndarray]:
        h, w = frame_bgr.shape[:2]
        x1, y1, x2, y2 = bbox
        x1 = max(0, min(w - 1, int(x1)))
        y1 = max(0, min(h - 1, int(y1)))
        x2 = max(0, min(w, int(x2)))
        y2 = max(0, min(h, int(y2)))
        if x2 <= x1 or y2 <= y1:
            return None
        return frame_bgr[y1:y2, x1:x2]

    def embed(
        self,
        frame_bgr: np.ndarray,
        *,
        bbox: Tuple[int, int, int, int],
        kps: Optional[np.ndarray] = None,
    ) -> Optional[np.ndarray]:
        try:
            if kps is not None:
                kps = np.asarray(kps, dtype=np.float32)
                if kps.ndim == 2 and kps.shape[1] == 2 and kps.shape[0] >= 3:
                    aimg = face_align.norm_crop(frame_bgr, landmark=kps, image_size=112)
                    with self._lock:
                        emb = self.model.get_feat(aimg).flatten().astype(np.float32)
                    return l2_normalize(emb)
        except Exception:
            # Alignment can fail on degenerate kps; fall back to bbox crop.
            pass

        crop = self._crop_bbox(frame_bgr, bbox)
        if crop is None:
            return None
        crop = cv2.resize(crop, (112, 112), interpolation=cv2.INTER_LINEAR)
        with self._lock:
            emb = self.model.get_feat(crop).flatten().astype(np.float32)
        return l2_normalize(emb)
