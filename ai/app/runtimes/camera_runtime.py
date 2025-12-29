from __future__ import annotations
from typing import Dict, Optional
import cv2
import numpy as np

from ..vision.capture import FrameGrabber

class CameraRuntime:
    def __init__(self):
        self.cameras: Dict[str, FrameGrabber] = {}

    def start(self, camera_id: str, rtsp_url: str, width: int = 1280, height: int = 720):
        if camera_id in self.cameras:
            self.stop(camera_id)

        grabber = FrameGrabber(rtsp_url, width=width, height=height)
        grabber.start()
        self.cameras[camera_id] = grabber

    def stop(self, camera_id: str):
        grabber = self.cameras.get(camera_id)
        if grabber:
            grabber.stop()
            self.cameras.pop(camera_id, None)

    def get_frame(self, camera_id: str) -> Optional[np.ndarray]:
        grabber = self.cameras.get(camera_id)
        if not grabber:
            return None
        return grabber.read_latest()
