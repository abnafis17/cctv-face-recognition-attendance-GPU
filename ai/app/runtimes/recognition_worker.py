from __future__ import annotations

import threading
import time
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

from .camera_runtime import CameraRuntime
from .attendance_runtime import AttendanceRuntime


class RecognitionWorker:
    """
    Background recognition per camera:
    - reads latest raw frame from CameraRuntime
    - runs attendance/recognition at capped ai_fps (CPU-friendly)
    - stores latest annotated frame (and pre-encoded JPEG) for streaming
    """

    def __init__(self, camera_rt: CameraRuntime, attendance_rt: AttendanceRuntime):
        self.camera_rt = camera_rt
        self.attendance_rt = attendance_rt

        self._threads: Dict[str, threading.Thread] = {}
        self._running: Dict[str, bool] = {}
        self._locks: Dict[str, threading.Lock] = {}

        # Latest annotated frame (BGR)
        self._latest_frame: Dict[str, np.ndarray] = {}

        # Latest JPEG bytes + timestamp (so each client does NOT re-encode)
        self._latest_jpg: Dict[str, Tuple[bytes, float]] = {}

        # Per-camera config
        self._ai_fps: Dict[str, float] = {}

    def start(self, camera_id: str, camera_name: str, ai_fps: float = 10.0):
        """
        Start recognition worker for camera if not already running.
        ai_fps controls how often recognition runs. Streaming stays smooth regardless.
        """
        if self._running.get(camera_id):
            # update fps dynamically
            self._ai_fps[camera_id] = float(ai_fps)
            return

        self._running[camera_id] = True
        self._ai_fps[camera_id] = float(ai_fps)
        self._locks.setdefault(camera_id, threading.Lock())

        t = threading.Thread(
            target=self._loop, args=(camera_id, camera_name), daemon=True
        )
        self._threads[camera_id] = t
        t.start()

    def stop(self, camera_id: str):
        self._running[camera_id] = False
        t = self._threads.get(camera_id)
        if t:
            t.join(timeout=1.0)

        self._threads.pop(camera_id, None)
        self._ai_fps.pop(camera_id, None)

        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            self._latest_frame.pop(camera_id, None)
            self._latest_jpg.pop(camera_id, None)

    def get_latest_annotated(self, camera_id: str) -> Optional[np.ndarray]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            f = self._latest_frame.get(camera_id)
            return None if f is None else f.copy()

    def get_latest_jpeg(self, camera_id: str) -> Optional[bytes]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            return None if item is None else item[0]

    def _loop(self, camera_id: str, camera_name: str):
        last_t = 0.0

        while self._running.get(camera_id, False):
            ai_fps = max(0.5, float(self._ai_fps.get(camera_id, 10.0)))
            period = 1.0 / ai_fps

            now = time.time()
            if (now - last_t) < period:
                time.sleep(0.005)
                continue
            last_t = now

            frame = self.camera_rt.get_frame(camera_id)
            if frame is None:
                continue

            # Heavy work (capped)
            annotated = self.attendance_rt.process_frame(
                frame_bgr=frame, camera_id=camera_id, name=camera_name
            )

            # Pre-encode JPEG once (huge CPU win when multiple clients watch)
            ok, jpg = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 65]
            )
            if not ok:
                continue
            jpg_bytes = jpg.tobytes()

            lock = self._locks.setdefault(camera_id, threading.Lock())
            with lock:
                self._latest_frame[camera_id] = annotated
                self._latest_jpg[camera_id] = (jpg_bytes, time.time())
