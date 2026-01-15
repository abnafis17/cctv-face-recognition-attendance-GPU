from __future__ import annotations

import os
import threading
import time
from typing import Optional, Tuple, List, Union

import cv2
import numpy as np


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, str(default))).strip()))
    except Exception:
        return default


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

        # Auto-recovery tuning (env-overridable)
        # - FRAME_STALE_SEC: reopen capture if no successful frame for N seconds
        # - FRAME_MAX_FAILS: reopen after N consecutive read failures
        # - FRAME_REOPEN_WAIT_SEC: initial backoff between reopen attempts
        self.frame_stale_sec = max(0.5, _env_float("FRAME_STALE_SEC", 5.0))
        self.frame_max_fails = max(1, _env_int("FRAME_MAX_FAILS", 30))
        self.frame_reopen_wait_sec = max(
            0.05, _env_float("FRAME_REOPEN_WAIT_SEC", 0.5)
        )
        self.cap_open_timeout_ms = max(0, _env_int("CAP_OPEN_TIMEOUT_MS", 5000))
        self.cap_read_timeout_ms = max(0, _env_int("CAP_READ_TIMEOUT_MS", 5000))

        self.cap: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # -------------------------
    # Public
    # -------------------------
    def start(self):
        self._running = True
        self._open_capture()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def read_latest(self) -> Optional[np.ndarray]:
        with self._lock:
            if self._frame is None:
                return None
            return self._frame.copy()

    def stop(self):
        self._running = False
        # Best-effort unblock any pending read()
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
        if self._thread:
            self._thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
        self.cap = None

    # -------------------------
    # Internals
    # -------------------------
    def _open_capture(self) -> bool:
        src: Union[str, int] = self.rtsp_url

        # Webcam index like "0", "1"
        is_webcam = isinstance(src, str) and src.strip().isdigit()
        cap: Optional[cv2.VideoCapture] = None

        try:
            if is_webcam:
                idx = int(str(src).strip())
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)  # good for Windows webcams

                # Low buffering for webcams
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                # Try to set FPS first (some drivers accept it)
                if self.target_fps > 0:
                    cap.set(cv2.CAP_PROP_FPS, float(self.target_fps))

                # Negotiate best resolution
                if self.prefer_max_webcam_res:
                    best = self._negotiate_best_webcam_resolution(cap)
                else:
                    best = self._set_resolution(cap, self.width, self.height)

                # Log what we actually got
                self._log_stream_info(prefix=f"Webcam[{idx}]", best_hint=best, cap=cap)
            else:
                # RTSP/IP camera
                cap = cv2.VideoCapture()
                if (
                    self.cap_open_timeout_ms > 0
                    and hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC")
                ):
                    cap.set(
                        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                        float(self.cap_open_timeout_ms),
                    )
                if (
                    self.cap_read_timeout_ms > 0
                    and hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC")
                ):
                    cap.set(
                        cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                        float(self.cap_read_timeout_ms),
                    )
                cap.open(str(src), cv2.CAP_FFMPEG)

                # For RTSP, CAP_PROP_BUFFERSIZE is not always honored, but try anyway
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                # Some RTSP backends ignore width/height; still try (won't hurt)
                self._set_resolution(cap, self.width, self.height)

                # Log actual
                self._log_stream_info(prefix="RTSP", best_hint=None, cap=cap)

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                return False

            old = self.cap
            self.cap = cap
            if old is not None and old is not cap:
                old.release()
            return True

        except Exception:
            try:
                if cap is not None:
                    cap.release()
            except Exception:
                pass
            return False

    def _reopen_capture(self, reason: str):
        try:
            if self.cap is not None:
                self.cap.release()
        except Exception:
            pass
        self.cap = None
        with self._lock:
            self._frame = None
        print(f"[FrameGrabber] reopen ({reason}) src={self.rtsp_url}")

    def _loop(self):
        reopen_backoff = float(self.frame_reopen_wait_sec)
        last_ok = time.monotonic()
        fails = 0

        while self._running:
            cap = self.cap
            if cap is None or not cap.isOpened():
                if self._open_capture():
                    cap = self.cap
                    fails = 0
                    last_ok = time.monotonic()
                    reopen_backoff = float(self.frame_reopen_wait_sec)
                    continue

                time.sleep(reopen_backoff)
                reopen_backoff = min(reopen_backoff * 2.0, 10.0)
                continue

            ok, frame = cap.read()
            now = time.monotonic()

            if ok and frame is not None:
                fails = 0
                last_ok = now
                reopen_backoff = float(self.frame_reopen_wait_sec)
                with self._lock:
                    self._frame = frame
                continue

            fails += 1
            time.sleep(0.02)

            if fails >= self.frame_max_fails or (now - last_ok) > self.frame_stale_sec:
                reason = "stale" if (now - last_ok) > self.frame_stale_sec else "fail"
                self._reopen_capture(reason=reason)
                time.sleep(reopen_backoff)
                reopen_backoff = min(reopen_backoff * 2.0, 10.0)

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

    def _log_stream_info(
        self, prefix: str, best_hint: Optional[Tuple[int, int]], cap: cv2.VideoCapture
    ):
        if cap is None:
            return
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)

        hint = f" (negotiated {best_hint[0]}x{best_hint[1]})" if best_hint else ""
        print(f"[FrameGrabber] {prefix}: {w}x{h} @ {fps:.1f}fps{hint}")
