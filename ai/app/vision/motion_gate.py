from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple
import time

import cv2
import numpy as np


@dataclass(slots=True)
class MotionState:
    active: bool = False
    last_change_ts: float = 0.0
    last_motion_ts: float = 0.0
    last_score: float = 0.0


class MotionGate:
    """
    Simple CPU motion gate.

    - Downscale (~320x180), grayscale, blur
    - absdiff against previous
    - motion_score = fraction of pixels over a diff threshold
    - motion_active with hysteresis + cooldown to reduce flicker
    """

    def __init__(
        self,
        *,
        threshold: float = 0.02,
        hysteresis_ratio: float = 0.7,
        cooldown_seconds: float = 0.4,
        resize: Tuple[int, int] = (320, 180),
        diff_threshold: int = 25,
    ):
        self.threshold = float(threshold)
        self.hysteresis_ratio = float(max(0.1, min(0.99, hysteresis_ratio)))
        self.cooldown_seconds = float(max(0.0, cooldown_seconds))
        self.resize = (int(resize[0]), int(resize[1]))
        self.diff_threshold = int(max(1, diff_threshold))

        self._prev_gray: Optional[np.ndarray] = None
        self.state = MotionState()

    def update(self, frame_bgr: np.ndarray, *, now: Optional[float] = None) -> Tuple[bool, float]:
        now = time.time() if now is None else float(now)

        small = cv2.resize(frame_bgr, self.resize, interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        if self._prev_gray is None or self._prev_gray.shape != gray.shape:
            self._prev_gray = gray
            self.state.last_score = 0.0
            return False, 0.0

        diff = cv2.absdiff(gray, self._prev_gray)
        self._prev_gray = gray

        # Fraction of pixels with a meaningful change.
        motion_score = float(np.count_nonzero(diff > self.diff_threshold) / diff.size)
        self.state.last_score = motion_score

        on_th = self.threshold
        off_th = self.threshold * self.hysteresis_ratio

        desired_active = self.state.active
        if motion_score >= on_th:
            desired_active = True
        elif motion_score <= off_th:
            desired_active = False

        if desired_active != self.state.active:
            if (now - self.state.last_change_ts) >= self.cooldown_seconds:
                self.state.active = desired_active
                self.state.last_change_ts = now

        if self.state.active:
            self.state.last_motion_ts = now

        return self.state.active, motion_score

