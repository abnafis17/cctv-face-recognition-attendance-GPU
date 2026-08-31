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
