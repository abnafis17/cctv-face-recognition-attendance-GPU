from __future__ import annotations
from dataclasses import dataclass, field
from typing import List


@dataclass
class Enroll2AutoConfig:
    steps: List[str] = field(
        default_factory=lambda: ["front", "right", "left", "up", "down", "blink"]
    )

    # ROI guide (fraction of frame)
    roi_x0: float = 0.25
    roi_y0: float = 0.18
    roi_x1: float = 0.75
    roi_y1: float = 0.88

    # Ignore background faces via size gates
    min_face_w_frac: float = 0.10
    max_face_w_frac: float = 0.80

    # Quality + stability
    min_quality_score: float = 10.0
    stable_ms: int = 900
    stable_px: float = 18.0

    # Pose thresholds (same meaning as your current utils)
    yaw_left_deg: float = -18.0
    yaw_right_deg: float = 18.0
    pitch_up_deg: float = -12.0
    pitch_down_deg: float = 12.0
    tolerance_deg: float = 15.0

    # Webcam mirror: if UI is mirrored, yaw might flip
    flip_yaw: bool = False

    # Loop speed
    ai_fps: float = 12.0
