from __future__ import annotations

import threading
import time
import os
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
    - skips JPEG encoding when no client is watching to save Jetson CPU cycles
    """

    def __init__(
        self,
        camera_rt: CameraRuntime,
        attendance_rt: AttendanceRuntime,
        stream_clients: Optional[Any] = None,
    ):
        self.camera_rt = camera_rt
        self.attendance_rt = attendance_rt
        self.stream_clients = stream_clients

        self._threads: Dict[str, threading.Thread] = {}
        self._running: Dict[str, bool] = {}
        self._locks: Dict[str, threading.Lock] = {}

        # Latest annotated frame (BGR)
        self._latest_frame: Dict[str, np.ndarray] = {}

        # Latest JPEG bytes + timestamp (so each client does NOT re-encode)
        self._latest_jpg: Dict[str, Tuple[bytes, float]] = {}

        # Per-camera config
        self._ai_fps: Dict[str, float] = {}
        self._jpeg_quality = max(30, min(95, int(os.getenv("MJPEG_RECOGNITION_FALLBACK_JPEG_QUALITY", "60"))))

    def clear(self, camera_id: str) -> None:
        """Clear any cached annotated frames/JPEGs for a camera."""
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            self._latest_frame.pop(camera_id, None)
            self._latest_jpg.pop(camera_id, None)

    def start(self, camera_id: str, camera_name: str, ai_fps: float = 10.0):
        """
        Start recognition worker for camera if not already running.
        ai_fps controls how often recognition runs. Streaming stays smooth regardless.
        """
        if self._running.get(camera_id):
            # update fps dynamically
            self._ai_fps[camera_id] = float(ai_fps)
            return

        self.clear(camera_id)
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
        try:
            join_timeout = float(str(os.getenv("RECOG_WORKER_STOP_JOIN_TIMEOUT_S", "0.2")).strip())
        except Exception:
            join_timeout = 0.2
        join_timeout = max(0.0, join_timeout)
        if t:
            t.join(timeout=join_timeout)

        self._threads.pop(camera_id, None)
        self._ai_fps.pop(camera_id, None)
        self.clear(camera_id)

    def stop_all(self) -> None:
        for camera_id in list(self._threads.keys()):
            try:
                self.stop(camera_id)
            except Exception:
                pass

    def get_latest_annotated(self, camera_id: str) -> Optional[np.ndarray]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            f = self._latest_frame.get(camera_id)
            return None if f is None else f.copy()

    def get_latest_jpeg(self, camera_id: str) -> Optional[bytes]:
        item = self.get_latest_jpeg_item(camera_id)
        return None if item is None else item[0]

    def get_latest_jpeg_item(self, camera_id: str) -> Optional[Tuple[bytes, float]]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            if item is not None:
                return (item[0], float(item[1]))

            # If no cached JPEG exists yet, encode latest annotated frame on demand
            frame = self._latest_frame.get(camera_id)
            if frame is None:
                return None
            try:
                ok, jpg = cv2.imencode(
                    ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self._jpeg_quality]
                )
                if not ok:
                    return None
                jpg_bytes = jpg.tobytes()
                now = time.time()
                self._latest_jpg[camera_id] = (jpg_bytes, now)
                return (jpg_bytes, now)
            except Exception:
                return None

    def _has_viewers(self, camera_id: str) -> bool:
        if self.stream_clients is None:
            return True
        try:
            return bool(self.stream_clients.has_viewers(camera_id))
        except Exception:
            return True

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

            frame = self.camera_rt.get_frame(camera_id, copy=False)
            if frame is None:
                continue

            # Heavy vision inference (capped cadence)
            try:
                annotated = self.attendance_rt.process_frame(
                    frame_bgr=frame, camera_id=camera_id, name=camera_name
                )
            except Exception as e:
                print(
                    f"[RECOGNITION] process_frame failed cam={camera_id}: {e}"
                )
                continue

            lock = self._locks.setdefault(camera_id, threading.Lock())
            has_viewers = self._has_viewers(camera_id)

            if has_viewers:
                # Pre-encode JPEG once only when viewers are watching (saves CPU when idle)
                try:
                    ok, jpg = cv2.imencode(
                        ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), self._jpeg_quality]
                    )
                    if ok:
                        jpg_bytes = jpg.tobytes()
                        with lock:
                            self._latest_frame[camera_id] = annotated
                            self._latest_jpg[camera_id] = (jpg_bytes, time.time())
                        continue
                except Exception:
                    pass

            with lock:
                self._latest_frame[camera_id] = annotated
