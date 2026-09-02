from __future__ import annotations

import os
from typing import List, Optional


def env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def env_int(name: str, default: int) -> int:
    try:
        val = os.getenv(name)
        if val is None:
            return default
        return int(str(val).strip())
    except (ValueError, TypeError):
        return default


def env_float(name: str, default: float) -> float:
    try:
        val = os.getenv(name)
        if val is None:
            return default
        return float(str(val).strip())
    except (ValueError, TypeError):
        return default


def env_str(name: str, default: str) -> str:
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip()


def pick_ort_providers(use_gpu: bool) -> List[str]:
    """
    Select ONNX Runtime Execution Providers optimized for Jetson / Linux / Windows:
      - ORT_PROVIDER: auto | cuda | tensorrt | cpu
    """
    ort_provider = env_str("ORT_PROVIDER", "auto").lower()

    if ort_provider == "cpu":
        return ["CPUExecutionProvider"]

    if ort_provider == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]

    if ort_provider == "tensorrt":
        return [
            "TensorrtExecutionProvider",
            "CUDAExecutionProvider",
            "CPUExecutionProvider",
        ]

    # auto
    if use_gpu:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]

    return ["CPUExecutionProvider"]


# ---------------------------------------------------------------------------
# Global environment configuration values
# ---------------------------------------------------------------------------

BACKEND_BASE_URL = env_str("BACKEND_BASE_URL", "http://localhost:3001")
DEFAULT_COMPANY_ID = env_str("DEFAULT_COMPANY_ID", env_str("BACKEND_COMPANY_ID", "default"))
SIMILARITY_THRESHOLD = env_float("SIMILARITY_THRESHOLD", 0.44)
AI_FPS = env_int("AI_FPS", 25)
ATTENDANCE_COOLDOWN_S = env_float("ATTENDANCE_DEBOUNCE_SECONDS", env_float("ATTENDANCE_COOLDOWN_S", 30.0))
BODY_PERSISTENCE_ENABLED = env_bool("BODY_PERSISTENCE_ENABLED", True)
MJPEG_RAW_JPEG_QUALITY = env_int("MJPEG_RAW_JPEG_QUALITY", 80)
MJPEG_RECOGNITION_JPEG_QUALITY = env_int("MJPEG_RECOGNITION_JPEG_QUALITY", 80)
MJPEG_STREAM_FPS_RECOGNITION = env_int("MJPEG_STREAM_FPS_RECOGNITION", 15)
MJPEG_STREAM_FPS_RAW = env_int("MJPEG_STREAM_FPS_RAW", 25)
FALLBACK_CAMERAS: dict[str, str] = {}

