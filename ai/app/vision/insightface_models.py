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
import ssl

# Fix for Mac SSL certificate issues when downloading models
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

from ..utils import l2_normalize
from .insightface_pack import normalize_model_pack_layout


def _to_kps5(kps_any) -> Optional[np.ndarray]:
    """
    Normalize landmarks to (5,2) float32 in the order expected by face_align.norm_crop:
      [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if kps_any is None:
        return None
    kps = np.asarray(kps_any)
    if kps.size == 0:
        return None

    # (5,2) already
    if kps.shape == (5, 2):
        return kps.astype(np.float32, copy=False)

    # flattened (10,)
    if kps.ndim == 1 and kps.shape[0] == 10:
        try:
            return kps.reshape(5, 2).astype(np.float32, copy=False)
        except Exception:
            return None

    # (N,2) fallback (N >= 5, e.g., 68-point or 106-point)
    if kps.ndim == 2 and kps.shape[1] == 2 and kps.shape[0] >= 5:
        pts = kps.astype(np.float32, copy=False)
        xs = pts[:, 0]
        ys = pts[:, 1]

        # Robust center point
        cx = float(np.median(xs))
        cy = float(np.median(ys))

        left_idx = np.where(xs < cx)[0]
        right_idx = np.where(xs >= cx)[0]

        # extreme split fallback
        if left_idx.size == 0 or right_idx.size == 0:
            left_idx = np.argsort(xs)[: max(1, pts.shape[0] // 2)]
            right_idx = np.argsort(xs)[max(1, pts.shape[0] // 2) :]

        # Eyes: top-most (min y) in left/right halves
        le = pts[left_idx[np.argmin(ys[left_idx])]]
        re_ = pts[right_idx[np.argmin(ys[right_idx])]]

        # Mouth corners: bottom-most (max y) in left/right halves
        lm = pts[left_idx[np.argmax(ys[left_idx])]]
        rm = pts[right_idx[np.argmax(ys[right_idx])]]

        # Nose: closest point to the center of the keypoint cloud
        d2 = (xs - cx) ** 2 + (ys - cy) ** 2
        nose = pts[int(np.argmin(d2))]

        out = np.stack([le, re_, nose, lm, rm], axis=0).astype(np.float32, copy=False)
        return out

    return None



CPU_PROVIDERS = ["CPUExecutionProvider"]


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
      - coreml: Mac Neural Engine
      - cuda: force CUDA+CPU
      - tensorrt: TensorRT+CUDA+CPU
      - cpu: CPU only
    """
    ort_provider = _env_str("ORT_PROVIDER", "auto").lower()

    if ort_provider == "cpu":
        return ["CPUExecutionProvider"]

    if ort_provider == "coreml":
        return ["CoreMLExecutionProvider", "CPUExecutionProvider"]

    if ort_provider == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]

    if ort_provider == "tensorrt":
        return ["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]

    # auto
    if ort_provider == "auto" and use_gpu:
        # Check if we are on a Mac to prioritize CoreML
        import platform
        if platform.system() == "Darwin":
            return ["CoreMLExecutionProvider", "CPUExecutionProvider"]
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]

    return ["CPUExecutionProvider"]


def _is_cpu_only(providers: list[str]) -> bool:
    return providers == CPU_PROVIDERS


def _short_error(exc: Exception) -> str:
    msg = " ".join(str(exc).split())
    if len(msg) > 500:
        return msg[:500] + "..."
    return msg


def _can_retry_cpu(providers: list[str]) -> bool:
    return not _is_cpu_only(providers) and _env_bool("ORT_CPU_FALLBACK", True)


def create_face_analysis_with_fallback(
    *,
    model_name: str,
    providers: list[str],
    ctx_id: int,
    det_size: Tuple[int, int],
    log_prefix: str,
    allowed_modules: Optional[list[str]] = None,
) -> tuple[FaceAnalysis, list[str], int]:
    kwargs = {}
    if allowed_modules is not None:
        kwargs["allowed_modules"] = allowed_modules

    try:
        app = FaceAnalysis(name=model_name, providers=providers, **kwargs)
        app.prepare(ctx_id=ctx_id, det_size=det_size)
        return app, providers, ctx_id
    except Exception as exc:
        if not _can_retry_cpu(providers):
            raise
        cpu_providers = CPU_PROVIDERS.copy()
        print(
            f"[{log_prefix}] Provider init failed for providers={providers}: {_short_error(exc)}"
        )
        print(f"[{log_prefix}] Retrying with providers={cpu_providers} ctx_id=-1")
        app = FaceAnalysis(name=model_name, providers=cpu_providers, **kwargs)
        app.prepare(ctx_id=-1, det_size=det_size)
        return app, cpu_providers, -1


def load_model_with_fallback(
    *,
    model_name: str,
    providers: list[str],
    ctx_id: int,
    log_prefix: str,
    prepare_kwargs: Optional[dict] = None,
) -> tuple[object, list[str], int]:
    prepare_kwargs = dict(prepare_kwargs or {})

    def _load(active_providers: list[str], active_ctx_id: int):
        model = model_zoo.get_model(model_name, providers=active_providers)
        if model is None:
            return None
        model.prepare(ctx_id=active_ctx_id, **prepare_kwargs)
        return model

    try:
        return _load(providers, ctx_id), providers, ctx_id
    except Exception as exc:
        if not _can_retry_cpu(providers):
            raise
        cpu_providers = CPU_PROVIDERS.copy()
        print(
            f"[{log_prefix}] Provider init failed for providers={providers}: {_short_error(exc)}"
        )
        print(f"[{log_prefix}] Retrying with providers={cpu_providers} ctx_id=-1")
        return _load(cpu_providers, -1), cpu_providers, -1


@dataclass(slots=True)
class FaceDetection:
    bbox: np.ndarray  # float32 [x1,y1,x2,y2]
    kps: Optional[np.ndarray]
    det_score: float


class FaceDetector:
    """
    Detection-only InsightFace wrapper.
    Supports overriding the default detector with high-performance models like SCRFD.
    """

    def __init__(
        self,
        *,
        model_name: str = "buffalo_m",
        use_gpu: bool = True,
        det_size: Tuple[int, int] = (640, 640),
        min_face_size: int = 30,
        min_det_score: float = 0.35,
    ):
        use_gpu = _env_bool("USE_GPU", use_gpu)
        det_n = _env_int("AI_DET_SIZE", det_size[0])
        self.det_size = (det_n, det_n)

        self.min_face_size = _env_int("MIN_FACE_SIZE", _env_int("RECOGNITION_MIN_FACE_PX", min_face_size))
        self.min_det_score = _clamp(_env_float("MIN_FACE_DET_SCORE", min_det_score), 0.0, 1.0)

        normalize_model_pack_layout(model_name)
        providers = _pick_providers(use_gpu)
        ctx_id = 0 if use_gpu else -1
        active_providers = providers
        active_ctx_id = ctx_id

        # Check for detector override (e.g. SCRFD)
        # SAFETY: Never allow "buffalo_s" or "buffalo_m" as direct overrides.
        # They are model packs, not detector models.
        raw_override = _env_str("AI_DETECTOR_MODEL", "")
        if raw_override.lower() in ("buffalo_s", "buffalo_m", "buffalo_l", "buffalo_sc"):
            self.detector_model_name = ""
        else:
            self.detector_model_name = raw_override

        self.detector = None
        self.app = None

        if self.detector_model_name:
            try:
                print(f"[FaceDetector] Attempting to load override model: {self.detector_model_name}")
                self.detector, active_providers, active_ctx_id = load_model_with_fallback(
                    model_name=self.detector_model_name,
                    providers=providers,
                    ctx_id=ctx_id,
                    log_prefix="FaceDetector",
                    prepare_kwargs={"det_size": self.det_size},
                )
                if self.detector is not None:
                    print(f"[FaceDetector] Successfully loaded SCRFD model: {self.detector_model_name}")
                else:
                    print(f"[FaceDetector] Warning: model_zoo returned None for {self.detector_model_name}. Falling back to default.")
            except Exception as e:
                print(f"[FaceDetector] Error loading {self.detector_model_name}: {e}. Falling back to default.")
                self.detector = None

        if self.detector is None:
            print(f"[FaceDetector] Using default FaceAnalysis detector (from {model_name})")
            modules = ["detection"]
            if model_name != "buffalo_sc":
                modules.append("landmark_2d_106")
            self.app, active_providers, active_ctx_id = create_face_analysis_with_fallback(
                model_name=model_name,
                providers=providers,
                ctx_id=ctx_id,
                det_size=self.det_size,
                log_prefix="FaceDetector",
                allowed_modules=modules,
            )

        print(
            f"[FaceDetector] USE_GPU={int(use_gpu)} providers={active_providers} ctx_id={active_ctx_id} det_size={self.det_size} SCRFD={bool(self.detector)}"
        )

    def detect(self, frame_bgr: np.ndarray) -> List[FaceDetection]:
        out: List[FaceDetection] = []
        best_fallback: Optional[FaceDetection] = None

        if self.detector:
            # Direct model (SCRFD/RetinaFace) returns (bboxes, kpss)
            # Use 'thresh' instead of 'threshold' to match InsightFace API.
            # We use kwargs to avoid positional argument shifts across versions.
            try:
                bboxes, kpss = self.detector.detect(frame_bgr, thresh=self.min_det_score, input_size=self.det_size)
            except TypeError:
                # Fallback for versions that use 'threshold'
                bboxes, kpss = self.detector.detect(frame_bgr, threshold=self.min_det_score, input_size=self.det_size)
            for i in range(bboxes.shape[0]):
                score = float(bboxes[i, 4])
                bbox = bboxes[i, 0:4]
                kps = _to_kps5(kpss[i]) if kpss is not None else None

                w = float(bbox[2] - bbox[0])
                h = float(bbox[3] - bbox[1])
                if min(w, h) < self.min_face_size:
                    continue

                det = FaceDetection(bbox=bbox, kps=kps, det_score=score)
                out.append(det)
                if best_fallback is None or score > best_fallback.det_score:
                    best_fallback = det
        else:
            # FaceAnalysis pack
            faces = self.app.get(frame_bgr)
            for f in faces:
                score = float(getattr(f, "det_score", 1.0))
                bbox = np.asarray(getattr(f, "bbox"), dtype=np.float32)
                w = float(bbox[2] - bbox[0])
                h = float(bbox[3] - bbox[1])
                if min(w, h) < self.min_face_size:
                    continue
                kps = getattr(f, "kps", None)
                if kps is None:
                    for attr in ("landmark_2d_106", "landmark_3d_68", "landmark_2d_68", "landmark_2d_5"):
                        val = getattr(f, attr, None)
                        if val is not None:
                            kps = _to_kps5(val)
                            if kps is not None:
                                break
                else:
                    kps = _to_kps5(kps)
                det = FaceDetection(bbox=bbox, kps=kps, det_score=score)

                if score >= self.min_det_score:
                    out.append(det)
                if best_fallback is None or score > best_fallback.det_score:
                    best_fallback = det

        fallback_floor = float(os.getenv("FALLBACK_DET_SCORE", "0.0"))
        if not out and best_fallback is not None and best_fallback.det_score >= fallback_floor:
            out.append(best_fallback)

        return out


class FaceEmbedder:
    """
    Recognition-only embedder (ArcFace ONNX from the same InsightFace model pack).
    """

    def __init__(self, *, model_name: str = "buffalo_m", use_gpu: bool = True):
        use_gpu = _env_bool("USE_GPU", use_gpu)

        # Default behavior:
        # - If EMBED_USE_GPU is explicitly set, honor it.
        # - Otherwise, follow USE_GPU (restores legacy "fast" behavior when GPU is enabled).
        raw = os.getenv("EMBED_USE_GPU")
        embed_use_gpu = use_gpu if raw is None else _env_bool("EMBED_USE_GPU", False)
        providers = _pick_providers(use_gpu=use_gpu) if embed_use_gpu else ["CPUExecutionProvider"]
        ctx_id = 0 if (embed_use_gpu and "CUDAExecutionProvider" in providers) else -1
        normalize_model_pack_layout(model_name)
        self.model, active_providers, active_ctx_id = load_model_with_fallback(
            model_name=model_name,
            providers=providers,
            ctx_id=ctx_id,
            log_prefix="FaceEmbedder",
        )
        if self.model is None:
            raise RuntimeError(f"Failed to load insightface model: {model_name}")
        self._lock = threading.Lock()

        print(
            f"[FaceEmbedder] EMBED_USE_GPU={int(embed_use_gpu)} providers={active_providers} ctx_id={active_ctx_id}"
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
                kps_mapped = _to_kps5(kps)
                if kps_mapped is not None:
                    aimg = face_align.norm_crop(frame_bgr, landmark=kps_mapped, image_size=112)
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
