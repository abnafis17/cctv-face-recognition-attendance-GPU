from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple
import threading

import cv2
import numpy as np


@dataclass
class PersonDetection:
    bbox: Tuple[int, int, int, int]
    conf: float


class YoloPersonDetector:
    """
    YOLO-based person detector (class=person).

    Uses a single model instance with an internal lock to avoid
    concurrent access across camera threads.
    """

    def __init__(
        self,
        model_path: str,
        conf: float = 0.35,
        iou: float = 0.45,
        imgsz: int = 640,
        device: str = "cpu",
        max_det: int = 50,
    ) -> None:
        try:
            from ultralytics import YOLO  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Ultralytics YOLO is not installed. Install 'ultralytics' (and torch) to enable presence detection."
            ) from e

        self._model = YOLO(model_path)
        self._conf = float(conf)
        self._iou = float(iou)
        self._imgsz = int(imgsz)
        self._device = str(device or "cpu")
        self._max_det = int(max_det)
        self._lock = threading.Lock()

    def detect(self, frame_bgr: np.ndarray) -> List[PersonDetection]:
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        # Ultralytics expects BGR numpy for OpenCV input. Keep it as-is.
        with self._lock:
            results = self._model.predict(
                source=frame_bgr,
                conf=self._conf,
                iou=self._iou,
                imgsz=self._imgsz,
                classes=[0],  # person
                device=self._device,
                max_det=self._max_det,
                verbose=False,
            )

        if not results:
            return []

        r0 = results[0]
        if r0.boxes is None:
            return []

        dets: List[PersonDetection] = []
        try:
            boxes = r0.boxes
            for b in boxes:
                xyxy = b.xyxy[0].tolist()
                conf = float(b.conf[0]) if b.conf is not None else 0.0
                x1, y1, x2, y2 = [int(round(v)) for v in xyxy]
                dets.append(PersonDetection(bbox=(x1, y1, x2, y2), conf=conf))
        except Exception:
            # Be tolerant to different Ultralytics box formats
            return []

        return dets


class HogPersonDetector:
    """
    OpenCV HOG person detector fallback when YOLO runtime is unavailable.
    """

    def __init__(
        self,
        hit_threshold: float = 0.0,
        win_stride: Tuple[int, int] = (8, 8),
        padding: Tuple[int, int] = (8, 8),
        scale: float = 1.05,
    ) -> None:
        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self._hit_threshold = float(hit_threshold)
        self._win_stride = (int(win_stride[0]), int(win_stride[1]))
        self._padding = (int(padding[0]), int(padding[1]))
        self._scale = float(scale)
        self._lock = threading.Lock()

    def detect(self, frame_bgr: np.ndarray) -> List[PersonDetection]:
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        with self._lock:
            rects, weights = self._hog.detectMultiScale(
                frame_bgr,
                hitThreshold=self._hit_threshold,
                winStride=self._win_stride,
                padding=self._padding,
                scale=self._scale,
            )

        dets: List[PersonDetection] = []
        if len(rects) == 0:
            return dets

        for i, (x, y, w, h) in enumerate(rects):
            x1, y1 = int(x), int(y)
            x2, y2 = int(x + w), int(y + h)
            conf = float(weights[i]) if i < len(weights) else 0.5
            dets.append(PersonDetection(bbox=(x1, y1, x2, y2), conf=conf))
        return dets


class FacePresenceDetector:
    """
    Face-only detector using InsightFace (detection module only).
    Returns face bboxes so the overlay is around faces instead of full bodies.
    """

    def __init__(
        self,
        model_name: str = "buffalo_m",
        det_size: int = 640,
        min_face_size: int = 30,
        min_det_score: float = 0.35,
        use_gpu: bool = False,
    ) -> None:
        from app.vision.insightface_models import FaceDetector

        self._detector = FaceDetector(
            model_name=str(model_name),
            use_gpu=bool(use_gpu),
            det_size=(int(det_size), int(det_size)),
            min_face_size=int(min_face_size),
            min_det_score=float(min_det_score),
        )
        self._lock = threading.Lock()

    def detect(self, frame_bgr: np.ndarray) -> List[PersonDetection]:
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        with self._lock:
            dets = self._detector.detect(frame_bgr)

        out: List[PersonDetection] = []
        for d in dets:
            x1, y1, x2, y2 = [int(round(v)) for v in d.bbox.tolist()]
            out.append(PersonDetection(bbox=(x1, y1, x2, y2), conf=float(d.det_score)))
        return out


class PresenceDetector:
    """
    Switchable presence detector: face-only (default) or person (YOLO).
    """

    def __init__(
        self,
        *,
        mode: str,
        yolo_cfg: dict,
        face_cfg: dict,
        allow_hog_fallback: bool = False,
    ) -> None:
        normalized = str(mode or "face").strip().lower()
        if normalized in {"face", "faces", "face-only"}:
            self._impl = FacePresenceDetector(**face_cfg)
        elif normalized in {"person", "people", "yolo"}:
            if not allow_hog_fallback:
                # Production path: enforce YOLO for better quality.
                self._impl = YoloPersonDetector(**yolo_cfg)
            else:
                try:
                    self._impl = YoloPersonDetector(**yolo_cfg)
                except Exception as e:
                    print(
                        "[PRESENCE] YOLO person detector unavailable; "
                        f"using OpenCV HOG fallback. detail={e}"
                    )
                    self._impl = HogPersonDetector()
        else:
            raise ValueError(f"Unknown PRESENCE_DET_MODE: {mode}")

    def detect(self, frame_bgr: np.ndarray) -> List[PersonDetection]:
        return self._impl.detect(frame_bgr)
