from __future__ import annotations

import os
from dataclasses import dataclass


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


@dataclass(slots=True)
class Config:
    """
    CPU-steady / GPU-burst config.

    NOTE: These defaults are chosen to be safe and reasonably conservative.
    They can be overridden via env vars where provided.
    """

    # --- Motion gate (CPU) ---
    motion_threshold: float = 0.020  # fraction of pixels "changed" (0..1)
    motion_hysteresis_ratio: float = 0.70
    motion_cooldown_seconds: float = 0.40
    motion_resize_w: int = 320
    motion_resize_h: int = 180

    # --- Scheduler ---
    idle_seconds: float = 2.0
    detection_fps_idle: float = 2.0
    detection_fps_normal: float = 8.0
    detection_fps_burst: float = 15.0
    burst_seconds: float = 4.0

    # --- Recognition cadence ---
    embed_refresh_seconds: float = 2.5
    unknown_burst_after_seconds: float = 1.3

    # --- Matching thresholds ---
    similarity_threshold: float = 0.35
    borderline_margin: float = 0.05

    # --- Attendance gating ---
    attendance_debounce_seconds: float = 10.0
    stable_id_confirmations: int = 3

    # --- Multi-camera GPU fairness ---
    queue_size: int = 3

    # --- Tracker association ---
    track_max_age_frames: int = 30
    track_iou_match_threshold: float = 0.25
    track_center_match_px: float = 120.0

    # --- Attendance quality gates (kept compatible with existing behavior) ---
    strict_similarity_threshold: float = 0.50
    min_att_quality: float = 18.0

    # --- Logging ---
    log_interval_seconds: float = 5.0

    # --- Verification ---
    verification_samples: int = 3

    @classmethod
    def from_env(cls, **overrides) -> "Config":
        cfg = cls()

        # Motion
        cfg.motion_threshold = _env_float("MOTION_THRESHOLD", cfg.motion_threshold)
        cfg.motion_cooldown_seconds = _env_float(
            "MOTION_COOLDOWN_SECONDS", cfg.motion_cooldown_seconds
        )
        cfg.idle_seconds = _env_float("IDLE_SECONDS", cfg.idle_seconds)

        # Scheduler
        cfg.detection_fps_idle = _env_float("DETECTION_FPS_IDLE", cfg.detection_fps_idle)
        cfg.detection_fps_normal = _env_float(
            "DETECTION_FPS_NORMAL", cfg.detection_fps_normal
        )
        cfg.detection_fps_burst = _env_float(
            "DETECTION_FPS_BURST", cfg.detection_fps_burst
        )
        cfg.burst_seconds = _env_float("BURST_SECONDS", cfg.burst_seconds)

        # Recognition cadence
        cfg.embed_refresh_seconds = _env_float(
            "EMBED_REFRESH_SECONDS", cfg.embed_refresh_seconds
        )
        cfg.unknown_burst_after_seconds = _env_float(
            "UNKNOWN_BURST_AFTER_SECONDS", cfg.unknown_burst_after_seconds
        )

        # Thresholds
        cfg.similarity_threshold = _env_float("SIMILARITY_THRESHOLD", cfg.similarity_threshold)
        cfg.borderline_margin = _env_float("BORDERLINE_MARGIN", cfg.borderline_margin)
        cfg.strict_similarity_threshold = _env_float(
            "STRICT_SIM_THRESHOLD", cfg.strict_similarity_threshold
        )
        cfg.min_att_quality = _env_float("MIN_ATT_QUALITY", cfg.min_att_quality)

        # Attendance gates
        cfg.attendance_debounce_seconds = _env_float(
            "ATTENDANCE_DEBOUNCE_SECONDS", cfg.attendance_debounce_seconds
        )
        cfg.stable_id_confirmations = _env_int(
            "STABLE_ID_CONFIRMATIONS", cfg.stable_id_confirmations
        )

        # Queues / tracking
        cfg.queue_size = max(1, _env_int("GPU_QUEUE_SIZE", cfg.queue_size))
        cfg.track_max_age_frames = max(
            1, _env_int("TRACK_MAX_AGE_FRAMES", cfg.track_max_age_frames)
        )

        # Logging / verification
        cfg.log_interval_seconds = _env_float("PIPELINE_LOG_INTERVAL_S", cfg.log_interval_seconds)
        cfg.verification_samples = max(1, _env_int("VERIFICATION_SAMPLES", cfg.verification_samples))

        for k, v in overrides.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
        return cfg

    @property
    def verification_required_avg_similarity(self) -> float:
        # High-stakes verification is stricter than the base match threshold.
        return float(self.similarity_threshold + self.borderline_margin)

