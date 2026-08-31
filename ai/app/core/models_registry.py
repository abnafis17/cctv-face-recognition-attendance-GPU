from __future__ import annotations

import os
import threading
from typing import Optional, Tuple

from .config import env_bool, env_float, env_int, env_str, pick_ort_providers


class ModelRegistry:
    """
    Thread-safe lazy-loaded singleton registry for ML/AI models.
    Prevents duplicate ONNX Runtime and PyTorch model allocations in
    unified RAM on NVIDIA Jetson Orin Nano.
    """

    _instance: Optional[ModelRegistry] = None
    _init_lock = threading.Lock()

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._face_detector = None
        self._face_embedder = None
        self._fas_gate = None
        self._yolo_detector = None

    @classmethod
    def get_instance(cls) -> ModelRegistry:
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get_face_detector(
        self,
        name: str = "buffalo_l",
        use_gpu: bool = True,
        det_size: Tuple[int, int] = (640, 640),
        det_thresh: float = 0.5,
    ):
        if self._face_detector is None:
            with self._lock:
                if self._face_detector is None:
                    from ..vision.insightface_models import FaceDetector

                    self._face_detector = FaceDetector(
                        model_name=name,
                        use_gpu=use_gpu,
                        det_size=det_size,
                        min_face_size=14,
                        min_det_score=0.20,
                    )
        return self._face_detector

    def get_face_embedder(
        self,
        name: str = "buffalo_l",
        use_gpu: bool = True,
    ):
        if self._face_embedder is None:
            with self._lock:
                if self._face_embedder is None:
                    from ..vision.insightface_models import FaceEmbedder

                    self._face_embedder = FaceEmbedder(
                        model_name=name,
                        use_gpu=use_gpu,
                    )
        return self._face_embedder

    def get_fas_gate(self):
        if self._fas_gate is None:
            with self._lock:
                if self._fas_gate is None:
                    from ..fas.gate import FASGate, GateConfig

                    fas_onnx_path = env_str("FAS_ONNX_PATH", "app/fas/models/fas.onnx")
                    fas_enabled = env_bool("FAS_ENABLED", True)
                    min_yaw_range = env_float("FAS_MIN_YAW_RANGE", 0.035)

                    cfg = GateConfig(
                        enabled=fas_enabled,
                        fas_threshold=env_float("FAS_THRESHOLD", 0.55),
                        motion_window_sec=env_float("FAS_MOTION_WINDOW_SEC", 2.0),
                        min_yaw_range=min_yaw_range,
                        use_heuristics=env_bool("FAS_USE_HEURISTICS", True),
                        heuristics_max_var=env_float("FAS_HEURISTICS_MAX_VAR", 900.0),
                        cooldown_sec=env_float("FAS_COOLDOWN_SEC", 2.0),
                    )

                    self._fas_gate = FASGate(
                        onnx_path=fas_onnx_path,
                        providers=["CPUExecutionProvider"],
                        default_cfg=cfg,
                    )
        return self._fas_gate

    def get_yolo_detector(
        self,
        model_path: str = "yolov8s-seg.pt",
        conf: float = 0.35,
        iou: float = 0.45,
        imgsz: int = 640,
        device: str = "cpu",
    ):
        if self._yolo_detector is None:
            with self._lock:
                if self._yolo_detector is None:
                    from ..presence.detector import YoloPersonDetector

                    self._yolo_detector = YoloPersonDetector(
                        model_path=model_path,
                        conf=conf,
                        iou=iou,
                        imgsz=imgsz,
                        device=device,
                    )
        return self._yolo_detector
