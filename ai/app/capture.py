from __future__ import annotations
import threading
import time
from typing import Optional
import cv2
import numpy as np

class FrameGrabber:
    def __init__(self, rtsp_url: str, width: int = 1280, height: int = 720):
        self.rtsp_url = rtsp_url
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # def start(self):
    #     self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
    #     self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    #     self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, float(self.width))
    #     self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, float(self.height))
    #     self._running = True
    #     self._thread = threading.Thread(target=self._loop, daemon=True)
    #     self._thread.start()

    def start(self):
        src = self.rtsp_url
        if isinstance(src, str) and src.strip().isdigit():
            src = int(src.strip())
            self.cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)  # best for many webcams on Windows
        else:
            self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, float(self.width))
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, float(self.height))

        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()


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
