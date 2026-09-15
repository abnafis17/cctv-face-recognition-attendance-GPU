from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from insightface import model_zoo
from insightface.utils import face_align
import threading

from ..utils import l2_normalize
from .insightface_pack import normalize_model_pack_layout


try:
    import onnxruntime as ort
    ort.set_default_logger_severity(3)
except Exception:
    pass


class SuppressStdoutStderr:
    def __enter__(self):
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        self._devnull_out = open(os.devnull, 'w')
        self._devnull_err = open(os.devnull, 'w')
        sys.stdout = self._devnull_out
        sys.stderr = self._devnull_err

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self._stdout
        sys.stderr = self._stderr
        try:
            self._devnull_out.close()
            self._devnull_err.close()
        except Exception:
            pass


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
        model_name: str = "buffalo_s",
        use_gpu: bool = True,
        det_size: Tuple[int, int] = (640, 640),
        min_face_size: int = 14,
        min_det_score: float = 0.20,
    ):
        use_gpu = _env_bool("USE_GPU", use_gpu)
        det_n = _env_int("AI_DET_SIZE", det_size[0])
        det_size = (det_n, det_n)

        self.min_face_size = _env_int("RECOGNITION_MIN_FACE_PX", _env_int("MIN_FACE_SIZE", min_face_size))
        self.min_det_score = _clamp(_env_float("MIN_FACE_DET_SCORE", min_det_score), 0.0, 1.0)

        with SuppressStdoutStderr():
            normalize_model_pack_layout(model_name)
            providers = _pick_providers(use_gpu)
            ctx_id = 0 if use_gpu else -1

            from ..core.runtime_opt import create_ort_session_options
            ort_opts = create_ort_session_options()

            try:
                self.app = FaceAnalysis(
                    name=model_name,
                    providers=providers,
                    allowed_modules=["detection"],
                    session_options=ort_opts,
                )
            except Exception:
                self.app = FaceAnalysis(
                    name=model_name,
                    providers=providers,
                    allowed_modules=["detection"],
                )

            self.app.prepare(ctx_id=ctx_id, det_size=det_size)

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

        fallback_floor = float(os.getenv("FALLBACK_DET_SCORE", "0.0"))  # <= 0.0 disables fallback
        if fallback_floor > 0.0 and not out and best_fallback is not None and best_fallback.det_score >= fallback_floor:
            out.append(best_fallback)

        return out


class FaceEmbedder:
    """
    Recognition-only embedder (ArcFace ONNX from the same InsightFace model pack).
    """

    def __init__(self, *, model_name: str = "buffalo_s", use_gpu: bool = True):
        use_gpu = _env_bool("USE_GPU", use_gpu)

        # Default behavior:
        # - If EMBED_USE_GPU is explicitly set, honor it.
        # - Otherwise, follow USE_GPU (restores legacy "fast" behavior when GPU is enabled).
        with SuppressStdoutStderr():
            raw = os.getenv("EMBED_USE_GPU")
            embed_use_gpu = use_gpu if raw is None else _env_bool("EMBED_USE_GPU", False)
            providers = _pick_providers(use_gpu=use_gpu) if embed_use_gpu else ["CPUExecutionProvider"]
            ctx_id = 0 if (embed_use_gpu and "CUDAExecutionProvider" in providers) else -1
            normalize_model_pack_layout(model_name)

            from ..core.runtime_opt import create_ort_session_options
            ort_opts = create_ort_session_options()

            try:
                self.model = model_zoo.get_model(model_name, providers=providers, session_options=ort_opts)
            except Exception:
                self.model = model_zoo.get_model(model_name, providers=providers)

            if self.model is None:
                raise RuntimeError(f"Failed to load insightface model: {model_name}")
            self.model.prepare(ctx_id=ctx_id)
        self._lock = threading.Lock()

    @staticmethod
    def enhance_production_face_crop(crop: np.ndarray) -> np.ndarray:
        """
        Gentle illumination normalization for extremely underexposed CCTV frames (mean luma < 50).
        Preserves natural facial geometry and textures so ArcFace feature vectors remain unperturbed.
        """
        if crop is None or crop.size == 0:
            return crop

        try:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            mean_luma = float(np.mean(gray))

            # Only adjust if image is severely underexposed (dark shadows / low light)
            if mean_luma < 50.0:
                # Mild gamma correction to lift shadows without destroying high-frequency features
                gamma = max(0.65, min(1.0, mean_luma / 85.0))
                inv_gamma = 1.0 / gamma
                table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
                return cv2.LUT(crop, table)
        except Exception:
            pass

        return crop

    enhance_low_light_shadow = enhance_production_face_crop

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
        enhance_enabled = _env_bool("LOW_LIGHT_ENHANCE_ENABLED", False)
        try:
            if kps is not None:
                kps = np.asarray(kps, dtype=np.float32)
                if kps.ndim == 2 and kps.shape[1] == 2 and kps.shape[0] >= 3:
                    aimg = face_align.norm_crop(frame_bgr, landmark=kps, image_size=112)
                    if enhance_enabled:
                        aimg = self.enhance_production_face_crop(aimg)
                    with self._lock:
                        emb = self.model.get_feat(aimg).flatten().astype(np.float32)
                    return l2_normalize(emb)
        except Exception:
            # Alignment can fail on degenerate kps; fall back to bbox crop.
            pass

        crop = self._crop_bbox(frame_bgr, bbox)
        if crop is None:
            return None
        crop = cv2.resize(crop, (112, 112), interpolation=cv2.INTER_LANCZOS4)
        if enhance_enabled:
            crop = self.enhance_production_face_crop(crop)
        with self._lock:
            emb = self.model.get_feat(crop).flatten().astype(np.float32)
        return l2_normalize(emb)
