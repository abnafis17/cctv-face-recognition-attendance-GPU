from __future__ import annotations
from typing import Dict, Optional
import threading
import cv2
import numpy as np

from ..vision.capture import FrameGrabber


class CameraRuntime:
    def __init__(self):
        self.cameras: Dict[str, FrameGrabber] = {}
        self._lock = threading.Lock()
        self.injected_frames: Dict[str, np.ndarray] = {}
        self.injected_locks: Dict[str, threading.Lock] = {}
        self.stream_profiles: Dict[str, Dict[str, int]] = {}

    @staticmethod
    def _clamp_int(value: int, min_value: int, max_value: int) -> int:
        return max(min_value, min(max_value, int(value)))

    def set_stream_profile(
        self,
        camera_id: str,
        *,
        send_fps: Optional[int] = None,
        send_width: Optional[int] = None,
        send_height: Optional[int] = None,
        jpeg_quality: Optional[int] = None,
    ) -> None:
        with self._lock:
            cur = dict(self.stream_profiles.get(str(camera_id), {}))
            if send_fps is not None:
                cur["send_fps"] = self._clamp_int(int(send_fps), 1, 30)
            if send_width is not None:
                cur["send_width"] = self._clamp_int(int(send_width), 160, 3840)
            if send_height is not None:
                cur["send_height"] = self._clamp_int(int(send_height), 120, 2160)
            if jpeg_quality is not None:
                cur["jpeg_quality"] = self._clamp_int(int(jpeg_quality), 1, 100)
            if cur:
                self.stream_profiles[str(camera_id)] = cur

    def get_stream_profile(self, camera_id: str) -> Dict[str, int]:
        with self._lock:
            return dict(self.stream_profiles.get(str(camera_id), {}))

    def start(self, camera_id: str, rtsp_url: str, width: int = 1280, height: int = 720) -> bool:
        """
        Idempotent start:
        - If already running with same source, do nothing.
        - If source changed, restart.
        Returns True if a start/restart happened, False if it was already running.
        """
        with self._lock:
            existing = self.cameras.get(camera_id)
            if (
                existing
                and getattr(existing, "rtsp_url", None) == rtsp_url
                and int(getattr(existing, "width", width)) == int(width)
                and int(getattr(existing, "height", height)) == int(height)
            ):
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
        if not grabber:
            return False
        try:
            grabber.stop()
            return True
        except Exception as e:
            print(f"[CameraRuntime] stop failed for {camera_id}: {e}")
            return False

    def stop_all(self) -> None:
        with self._lock:
            ids = list(self.cameras.keys())
        for camera_id in ids:
            try:
                self.stop(camera_id)
            except Exception:
                pass

    def is_running(self, camera_id: str) -> bool:
        with self._lock:
            return str(camera_id) in self.cameras

    def inject_frame(self, camera_id: str, frame: np.ndarray):
        """Inject a frame from a laptop/WebRTC source."""
        if camera_id not in self.injected_locks:
            self.injected_locks[camera_id] = threading.Lock()
        with self.injected_locks[camera_id]:
            self.injected_frames[camera_id] = frame

    def get_frame(self, camera_id: str, copy: bool = True) -> Optional[np.ndarray]:
        # 1) Laptop camera (injected frames)
        lock = self.injected_locks.get(camera_id)
        if lock:
            with lock:
                frame = self.injected_frames.get(camera_id)
                if frame is not None:
                    return frame.copy() if copy else frame

        # 2) IP camera
        with self._lock:
            grabber = self.cameras.get(camera_id)
        if grabber:
            return grabber.read_latest(copy=copy)

        return None
