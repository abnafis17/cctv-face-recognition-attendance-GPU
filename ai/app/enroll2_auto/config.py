# ai/app/enroll2_auto/config.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class Enroll2AutoConfig:
    """
    Comfortable auto-enrollment config:
    - Front is "near-front" acceptance (comfortable).
    - Left/Right/Up/Down require DELTA turn relative to the captured front baseline.
    """

    # ---------- pipeline ----------
    ai_fps: float = 12.0

    # utils_auto.quality_score() returns 0..100
    # Testing low light: 25..40
    # Production: 65..75
    min_quality_score: float = 25.0

    # ---------- enrollment steps ----------
    steps: List[str] = field(default_factory=lambda: ["front", "left", "right", "up", "down"])

    # Testing: 3-5 (faster)
    # Production best: 7
    target_per_pose: int = 1
    max_per_pose: int = 3

    # Must hold correct pose before capture
    pose_stable_ms: float = 320.0

    # Cooldown after capture
    cooldown_sec: float = 0.25

    # ---------- voice ----------
    voice_min_interval_sec: float = 1.4

    # ---------- ROI gating ----------
    roi_x0: float = 0.22
    roi_y0: float = 0.12
    roi_x1: float = 0.78
    roi_y1: float = 0.88

    # ---------- face size gating ----------
    # relaxed a bit for laptop testing
    min_face_w_frac: float = 0.08
    max_face_w_frac: float = 0.70

    # ---------- bbox stability gating ----------
    stable_ms: float = 280.0
    stable_px: float = 30.0

    # ---------- pose behavior ----------
    # FRONT acceptance window (comfortable "quite front")
    front_accept_yaw_deg: float = 24.0
    front_accept_pitch_deg: float = 20.0

    # After the first front capture, treat "front" as a smaller dead-zone around baseline
    # so moderate turns are recognized and captured quickly.
    front_bucket_yaw_deg: float = 12.0
    front_bucket_pitch_deg: float = 12.0

    # Required DELTA turn from baseline (must actually turn)
    # Looser yaw so mirrored/laptop feeds don't feel too strict.
    delta_yaw_left_deg: float = 16.0
    delta_yaw_right_deg: float = 16.0
    delta_pitch_up_deg: float = 14.0
    delta_pitch_down_deg: float = 14.0

    # tolerance around target delta
    delta_tolerance_deg: float = 14.0

    # If your camera feed is mirrored or yaw sign is inverted, flip yaw
    flip_yaw: bool = True

    # Testing only: allow "front" step to proceed even if pose cannot be estimated
    # Keep False for production.
    allow_unknown_pose_front: bool = True
