from __future__ import annotations

import threading
import time
from typing import Optional, Tuple, List, Union

import cv2
import numpy as np


class FrameGrabber:
    def __init__(
        self,
        rtsp_url: str,
        width: int = 1280,
        height: int = 720,
        prefer_max_webcam_res: bool = True,
        target_fps: int = 30,
    ):
        self.rtsp_url = rtsp_url
        self.width = int(width)
        self.height = int(height)

        # Webcam tuning
        self.prefer_max_webcam_res = bool(prefer_max_webcam_res)
        self.target_fps = int(target_fps)

        self.cap: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # -------------------------
    # Public
    # -------------------------
    def start(self):
        src: Union[str, int] = self.rtsp_url

        # Webcam index like "0", "1"
        is_webcam = isinstance(src, str) and src.strip().isdigit()
        if is_webcam:
            idx = int(str(src).strip())
            self.cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)  # good for Windows webcams

            # Low buffering for webcams
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Try to set FPS first (some drivers accept it)
            if self.target_fps > 0:
                self.cap.set(cv2.CAP_PROP_FPS, float(self.target_fps))

            # Negotiate best resolution
            if self.prefer_max_webcam_res:
                best = self._negotiate_best_webcam_resolution(self.cap)
            else:
                best = self._set_resolution(self.cap, self.width, self.height)

            # Log what we actually got
            self._log_stream_info(prefix=f"Webcam[{idx}]", best_hint=best)

        else:
            # RTSP/IP camera
            self.cap = cv2.VideoCapture(str(src), cv2.CAP_FFMPEG)

            # For RTSP, CAP_PROP_BUFFERSIZE is not always honored, but try anyway
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Some RTSP backends ignore width/height; still try (won't hurt)
            self._set_resolution(self.cap, self.width, self.height)

            # Log actual
            self._log_stream_info(prefix="RTSP", best_hint=None)

        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def read_latest(self) -> Optional[np.ndarray]:
        with self._lock:
            if self._frame is None:
                return None
            return self._frame.copy()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()

    # -------------------------
    # Internals
    # -------------------------
    def _loop(self):
        backoff = 0.5
        while self._running:
            if self.cap is None or not self.cap.isOpened():
                time.sleep(backoff)
                continue

            ok, frame = self.cap.read()
            if not ok or frame is None:
                time.sleep(0.02)
                continue

            with self._lock:
                self._frame = frame

    def _negotiate_best_webcam_resolution(self, cap: cv2.VideoCapture) -> Tuple[int, int]:
        """
        Try common webcam resolutions from highest to lowest and keep the best accepted.
        """
        candidates: List[Tuple[int, int]] = [
            (1920, 1080),
            (1600, 900),
            (1280, 720),
            (1024, 576),
            (960, 540),
            (800, 600),
            (640, 480),
        ]

        # Also include user-requested as a candidate (in case it's unusual)
        if (self.width, self.height) not in candidates:
            candidates.insert(0, (self.width, self.height))

        for w, h in candidates:
            aw, ah = self._set_resolution(cap, w, h)
            # Many drivers report slightly different values; accept if close enough
            if aw >= int(0.95 * w) and ah >= int(0.95 * h):
                return aw, ah

        # fallback: whatever the camera has
        aw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        ah = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return aw, ah

    def _set_resolution(self, cap: cv2.VideoCapture, w: int, h: int) -> Tuple[int, int]:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, float(w))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, float(h))
        time.sleep(0.05)  # give driver time to apply
        aw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        ah = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return aw, ah

    def _log_stream_info(self, prefix: str, best_hint: Optional[Tuple[int, int]]):
        if not self.cap:
            return
        w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(self.cap.get(cv2.CAP_PROP_FPS) or 0.0)

        hint = f" (negotiated {best_hint[0]}x{best_hint[1]})" if best_hint else ""
        print(f"[FrameGrabber] {prefix}: {w}x{h} @ {fps:.1f}fps{hint}")
