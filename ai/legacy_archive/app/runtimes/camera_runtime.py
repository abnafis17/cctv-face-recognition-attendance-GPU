from __future__ import annotations
import os
from typing import Dict, Optional
import threading
import numpy as np

from ..vision.capture import FrameGrabber


class CameraRuntime:
    def __init__(self):
        self.cameras: Dict[str, FrameGrabber] = {}
        self._lock = threading.Lock()
        self.injected_frames: Dict[str, np.ndarray] = {}
        self.injected_locks: Dict[str, threading.Lock] = {}
        self._camera_cfg: Dict[str, tuple[str, int, int, int, str]] = {}

    def start(
        self,
        camera_id: str,
        rtsp_url: str,
        width: int = 1280,
        height: int = 720,
        target_fps: int = 0,
    ) -> bool:
        """
        Idempotent start:
        - If already running with same source + profile, do nothing.
        - If source changed, restart.
        Returns True if a start/restart happened, False if it was already running.
        """
        width = max(16, int(width))
        height = max(16, int(height))
        target_fps = max(0, int(target_fps))

        # Prefer lower ingest fps by default when caller does not specify one.
        if target_fps <= 0:
            try:
                target_fps = max(
                    0, int(float(str(os.getenv("CAMERA_DEFAULT_INGEST_FPS", "0")).strip()))
                )
            except Exception:
                target_fps = 0

        with self._lock:
            existing = self.cameras.get(camera_id)
            existing_sig = self._camera_cfg.get(camera_id)
            expected_sig = (
                str(rtsp_url or "").strip(),
                int(width),
                int(height),
                int(target_fps),
                str(os.getenv("STREAM_CAPTURE_BACKEND", "auto")).strip().lower()
                or "auto",
            )

            if existing and existing_sig == expected_sig:
                return False

            if existing:
                existing.stop()
                self.cameras.pop(camera_id, None)
                self._camera_cfg.pop(camera_id, None)

            grabber = FrameGrabber(
                rtsp_url,
                width=width,
                height=height,
                target_fps=target_fps,
            )
            grabber.start()
            self.cameras[camera_id] = grabber
            # Persist the effective signature (including backend request) for idempotency.
            self._camera_cfg[camera_id] = (
                str(grabber.rtsp_url or "").strip(),
                int(grabber.width),
                int(grabber.height),
                int(grabber.target_fps),
                str(grabber.requested_backend),
            )
            return True

    def stop(self, camera_id: str) -> bool:
        with self._lock:
            grabber = self.cameras.pop(camera_id, None)
            self._camera_cfg.pop(camera_id, None)
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

    def get_profile(self, camera_id: str) -> Optional[dict]:
        with self._lock:
            sig = self._camera_cfg.get(str(camera_id))
            grabber = self.cameras.get(str(camera_id))
        if not sig:
            return None
        src, width, height, fps, backend_request = sig
        backend_effective = str(getattr(grabber, "backend_name", backend_request))
        return {
            "source": src,
            "width": int(width),
            "height": int(height),
            "ingest_fps": int(fps),
            "backend_request": backend_request,
            "backend_effective": backend_effective,
        }

    def list_profiles(self) -> Dict[str, dict]:
        with self._lock:
            camera_ids = list(self.cameras.keys())
        profiles: Dict[str, dict] = {}
        for camera_id in camera_ids:
            profile = self.get_profile(camera_id)
            if profile is not None:
                profiles[camera_id] = profile
        return profiles

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
