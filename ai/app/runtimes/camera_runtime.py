from __future__ import annotations
from typing import Dict, Optional
import threading
import cv2
import numpy as np

from ..vision.capture import FrameGrabber


class CameraRuntime:
    def __init__(self):
        # IP cameras
        self.cameras: Dict[str, FrameGrabber] = {}

        # Laptop / browser cameras
        self.injected_frames: Dict[str, np.ndarray] = {}
        self.injected_locks: Dict[str, threading.Lock] = {}

        self._lock = threading.Lock()

    # -----------------------------
    # IP CAMERA (UNCHANGED)
    # -----------------------------
    def start(self, camera_id: str, rtsp_url: str, width=1280, height=720) -> bool:
        with self._lock:
            existing = self.cameras.get(camera_id)
            if existing and getattr(existing, "rtsp_url", None) == rtsp_url:
                return False

            if existing:
                existing.stop()
                self.cameras.pop(camera_id, None)

            grabber = FrameGrabber(rtsp_url, width=width, height=height)
            grabber.start()
            self.cameras[camera_id] = grabber
            return True

    def stop(self, camera_id: str) -> bool:
        with self._lock:
            grabber = self.cameras.pop(camera_id, None)

        self.injected_frames.pop(camera_id, None)
        self.injected_locks.pop(camera_id, None)

        if grabber:
            grabber.stop()
            return True
        return False

    # -----------------------------
    # LAPTOP CAMERA
    # -----------------------------
    def inject_frame(self, camera_id: str, frame: np.ndarray):
        if camera_id not in self.injected_locks:
            self.injected_locks[camera_id] = threading.Lock()

        with self.injected_locks[camera_id]:
            self.injected_frames[camera_id] = frame

    # -----------------------------
    # COMMON ACCESS
    # -----------------------------
    def get_frame(self, camera_id: str) -> Optional[np.ndarray]:
        # 1️⃣ laptop camera first
        lock = self.injected_locks.get(camera_id)
        if lock:
            with lock:
                frame = self.injected_frames.get(camera_id)
                if frame is not None:
                    return frame

        # 2️⃣ ip camera
        with self._lock:
            grabber = self.cameras.get(camera_id)

        if grabber:
            return grabber.read_latest()

        return None
