from __future__ import annotations

import collections
import os
import threading
import time
from typing import Deque, Dict, Optional, Tuple

import cv2
import numpy as np

from .attendance_runtime import AttendanceRuntime
from .camera_runtime import CameraRuntime


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


# Optional delay used only for display smoothing.
# Default is 0 for lowest-latency monitoring.
_STREAM_DELAY_SECONDS = max(0.0, _env_float("STREAM_DELAY_SECONDS", 0.0))


class RecognitionWorker:
    """
    Background recognition per camera:
    - reads latest raw frame from CameraRuntime
    - runs attendance/recognition at capped ai_fps (CPU-friendly)
    - attendance events fire immediately (real-time)
    - stores a small ring buffer of annotated JPEGs for optional delayed streaming
    """

    def __init__(self, camera_rt: CameraRuntime, attendance_rt: AttendanceRuntime):
        self.camera_rt = camera_rt
        self.attendance_rt = attendance_rt

        self._threads: Dict[str, threading.Thread] = {}
        self._running: Dict[str, bool] = {}
        self._locks: Dict[str, threading.Lock] = {}

        # Latest annotated frame (BGR) - kept for compatibility.
        self._latest_frame: Dict[str, np.ndarray] = {}

        # Latest JPEG bytes + timestamp.
        self._latest_jpg: Dict[str, Tuple[bytes, float]] = {}

        # Ring buffer of (jpg_bytes, timestamp) tuples per camera.
        self._frame_buffer: Dict[str, Deque[Tuple[bytes, float]]] = {}

        # Per-camera config.
        self._ai_fps: Dict[str, float] = {}
        self._last_error_log_by_camera: Dict[str, float] = {}

    def start(self, camera_id: str, camera_name: str, ai_fps: float = 10.0):
        """
        Start recognition worker for camera if not already running.
        ai_fps controls how often recognition runs.
        """
        if self._running.get(camera_id):
            self._ai_fps[camera_id] = float(ai_fps)
            return

        self._running[camera_id] = True
        self._ai_fps[camera_id] = float(ai_fps)
        self._locks.setdefault(camera_id, threading.Lock())

        # Keep a small buffer to support optional delay without introducing drift.
        buf_size = max(3, int(_STREAM_DELAY_SECONDS * ai_fps) + 4)
        self._frame_buffer[camera_id] = collections.deque(maxlen=buf_size)

        t = threading.Thread(target=self._loop, args=(camera_id, camera_name), daemon=True)
        self._threads[camera_id] = t
        t.start()

    def stop(self, camera_id: str):
        self._running[camera_id] = False
        t = self._threads.get(camera_id)
        try:
            join_timeout = float(str(os.getenv("RECOG_WORKER_STOP_JOIN_TIMEOUT_S", "0.2")).strip())
        except Exception:
            join_timeout = 0.2
        join_timeout = max(0.0, join_timeout)
        if t:
            t.join(timeout=join_timeout)

        self._threads.pop(camera_id, None)
        self._ai_fps.pop(camera_id, None)

        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            self._latest_frame.pop(camera_id, None)
            self._latest_jpg.pop(camera_id, None)
            self._frame_buffer.pop(camera_id, None)

    def stop_all(self) -> None:
        for camera_id in list(self._threads.keys()):
            try:
                self.stop(camera_id)
            except Exception:
                pass

    def get_latest_annotated(self, camera_id: str) -> Optional[np.ndarray]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            frame = self._latest_frame.get(camera_id)
            return None if frame is None else frame.copy()

    def get_latest_jpeg(self, camera_id: str) -> Optional[bytes]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            return None if item is None else item[0]

    def get_latest_jpeg_item(self, camera_id: str) -> Optional[Tuple[bytes, float]]:
        """
        Returns the freshest annotated frame by default.
        If STREAM_DELAY_SECONDS > 0, returns the closest frame not newer than the delay.
        """
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            if item is None:
                return None

            buf = self._frame_buffer.get(camera_id)
            if _STREAM_DELAY_SECONDS <= 0.0 or not buf:
                return (item[0], float(item[1]))

            now = time.time()
            target_ts = now - _STREAM_DELAY_SECONDS

            # Prune definitely-too-old frames and keep the nearest delayed candidate.
            while len(buf) > 1 and float(buf[1][1]) <= target_ts:
                buf.popleft()

            candidate = buf[0]
            if float(candidate[1]) <= target_ts:
                return (candidate[0], float(candidate[1]))

            # Not enough delayed history yet; use the freshest frame.
            return (item[0], float(item[1]))

    def _loop(self, camera_id: str, camera_name: str):
        last_t = 0.0
        try:
            jpg_quality = int(float(os.getenv("MJPEG_RECOGNITION_FALLBACK_JPEG_QUALITY", "75")))
        except Exception:
            jpg_quality = 75

        while self._running.get(camera_id, False):
            ai_fps = max(0.5, float(self._ai_fps.get(camera_id, 10.0)))
            period = 1.0 / ai_fps

            now = time.time()
            if (now - last_t) < period:
                time.sleep(0.005)
                continue
            last_t = now

            frame = self.camera_rt.get_frame(camera_id, copy=False)
            if frame is None:
                continue

            try:
                annotated = self.attendance_rt.process_frame(
                    frame_bgr=frame, camera_id=camera_id, name=camera_name
                )
            except Exception as exc:
                err_now = time.time()
                last_err = float(
                    self._last_error_log_by_camera.get(camera_id, 0.0) or 0.0
                )
                if err_now - last_err >= 5.0:
                    self._last_error_log_by_camera[camera_id] = err_now
                    print(
                        f"[RECOG_WORKER] process_frame failed "
                        f"cam={camera_id} err={exc}"
                    )
                continue

            # Pre-encode JPEG once (CPU win when multiple clients watch).
            jpg_quality = int(_env_float("MJPEG_RECOGNITION_FALLBACK_JPEG_QUALITY", 70))
            ok, jpg = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), jpg_quality]
            )
            if not ok:
                continue

            jpg_bytes = jpg.tobytes()
            ts = time.time()

            lock = self._locks.setdefault(camera_id, threading.Lock())
            with lock:
                self._latest_frame[camera_id] = annotated
                self._latest_jpg[camera_id] = (jpg_bytes, ts)
                buf = self._frame_buffer.get(camera_id)
                if buf is not None:
                    buf.append((jpg_bytes, ts))
