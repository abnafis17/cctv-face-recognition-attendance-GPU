from __future__ import annotations

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

# ---------------------------------------------------------------------------
# Jetson Orin Nano Super Low-Level Environment Defaults
# Must be set before importing numpy, cv2, torch, or onnxruntime.
# ---------------------------------------------------------------------------

def configure_process_environment() -> None:
    """Clamp internal BLAS/OpenMP/CUDA runtime threads to prevent CPU thrashing."""
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
    os.environ.setdefault("MKL_NUM_THREADS", "2")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "2")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "2")
    os.environ.setdefault("ORT_INTRA_OP_NUM_THREADS", "2")
    os.environ.setdefault("ORT_INTER_OP_NUM_THREADS", "1")
    os.environ.setdefault("CUDA_MODULE_LOADING", "LAZY")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


# Run immediately on module import
configure_process_environment()


def configure_library_threads() -> None:
    """Clamp OpenCV and PyTorch thread pools to Jetson-friendly levels."""
    try:
        import cv2
        cv_threads = int(os.getenv("OPENCV_NUM_THREADS", "2"))
        cv2.setNumThreads(max(1, cv_threads))
        if hasattr(cv2, "ocl") and hasattr(cv2.ocl, "setUseOpenCL"):
            cv2.ocl.setUseOpenCL(False)
    except Exception:
        pass

    try:
        import torch
        torch_threads = int(os.getenv("TORCH_NUM_THREADS", "2"))
        torch.set_num_threads(max(1, torch_threads))
        if hasattr(torch, "set_num_interop_threads"):
            torch.set_num_interop_threads(1)
    except Exception:
        pass


# Run library thread config immediately
configure_library_threads()


def create_ort_session_options() -> Any:
    """
    Build an ONNX Runtime SessionOptions instance tuned for Jetson Orin Nano.
    Limits thread pools to avoid multiplying threads across multiple models.
    """
    try:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, int(os.getenv("ORT_INTRA_OP_NUM_THREADS", "2")))
        opts.inter_op_num_threads = max(1, int(os.getenv("ORT_INTER_OP_NUM_THREADS", "1")))
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        return opts
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Bounded Shared Async I/O Thread Pool
# Replaces ad-hoc threading.Thread spawns for door relays, ERP, and DB writes.
# ---------------------------------------------------------------------------

_IO_EXECUTOR: Optional[ThreadPoolExecutor] = None


def get_async_io_executor() -> ThreadPoolExecutor:
    global _IO_EXECUTOR
    if _IO_EXECUTOR is None:
        max_workers = max(2, int(os.getenv("ASYNC_IO_MAX_WORKERS", "3")))
        _IO_EXECUTOR = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="ai-async-io",
        )
    return _IO_EXECUTOR


def submit_async_io(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    """Submit a task to the shared bounded async I/O worker pool."""
    executor = get_async_io_executor()

    def _wrapped() -> None:
        try:
            fn(*args, **kwargs)
        except Exception as exc:
            print(f"[AsyncIO] task failed {getattr(fn, '__name__', str(fn))}: {exc}")

    try:
        executor.submit(_wrapped)
    except Exception as exc:
        print(f"[AsyncIO] executor submit failed: {exc}")
