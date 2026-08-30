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
    # Lower default processing FPS keeps GPU/CPU pressure lower while
    # preserving responsive enrollment.
    ai_fps: float = 10.0

    # utils_auto.quality_score() returns 0..100
    # Testing low light: 25..40
    # Production: 65..75
    min_quality_score: float = 22.0

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
    # Minimum gap between accepted captures.
    capture_interval_sec: float = 0.18

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
    front_accept_pitch_deg: float = 24.0

    # After the first front capture, treat "front" as a smaller dead-zone around baseline
    # so moderate turns are recognized and captured quickly.
    front_bucket_yaw_deg: float = 12.0
    front_bucket_pitch_deg: float = 12.0

    # Required DELTA turn from baseline (must actually turn)
    # Looser yaw so mirrored/laptop feeds don't feel too strict.
    delta_yaw_left_deg: float = 15.0
    delta_yaw_right_deg: float = 15.0
    # Up/down is intentionally looser to require less tilt.
    delta_pitch_up_deg: float = 11.0
    delta_pitch_down_deg: float = 9.0

    # tolerance around target delta
    delta_tolerance_deg: float = 13.0
    # Require a realistic head turn before left/right capture is accepted.
    min_realistic_yaw_turn_deg: float = 9.0

    # Cross-axis tolerance for step-aware matching (helps up/down even with mild yaw).
    updown_max_yaw_deg: float = 28.0
    leftright_max_pitch_deg: float = 24.0
    # Allow a strong target-axis move to pass even with some cross-axis offset.
    strong_axis_bonus_deg: float = 3.0

    # Smooth pose signal to reduce jitter/missed captures.
    pose_ema_alpha: float = 0.45

    # Downscale very large frames before face detect/embed to reduce GPU load.
    max_process_side: int = 720

    # Camera feed is mirrored for enrollment UI, so flip yaw to keep
    # left/right instructions aligned with real head movement.
    flip_yaw: bool = True

    # Testing only: allow "front" step to proceed even if pose cannot be estimated
    # Keep False for production.
    allow_unknown_pose_front: bool = True
