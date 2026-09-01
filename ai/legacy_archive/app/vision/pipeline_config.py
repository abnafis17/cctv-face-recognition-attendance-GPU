from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    v = str(os.getenv(name, str(int(default)))).strip().lower()
    return v in ("1", "true", "yes", "on")


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
    detection_fps_normal: float = 12.0
    detection_fps_burst: float = 24.0
    burst_seconds: float = 3.5

    # --- Recognition cadence ---
    embed_refresh_seconds: float = 0.25
    embed_refresh_seconds_unknown: float = 0.15
    unknown_burst_after_seconds: float = 0.6
    # Once a known identity is stable, keep the name attached to the track and
    # avoid repeated embedding/matching until the track is cleared/reacquired.
    known_identity_latch_enabled: bool = True
    known_identity_latch_min_hits: int = 0
    # Margin ratio (0..0.5) from edges of camera frame.
    # Latching is only active while the face is fully inside this Safety Zone.
    latch_boundary_margin_ratio: float = 0.05
    # If two tracks overlap by more than this IoU, suspend latching to prevent identity swaps.
    latch_max_overlap_iou: float = 0.15

    # --- Matching thresholds ---
    similarity_threshold: float = 0.35
    borderline_margin: float = 0.05
    # Require top1 to be meaningfully higher than the best different-person match.
    distinct_sim_margin: float = 0.05

    # --- Attendance gating ---
    attendance_debounce_seconds: float = 10.0
    stable_id_confirmations: int = 3
    attendance_fast_mode: bool = False

    # --- Multi-camera GPU fairness ---
    queue_size: int = 3

    # --- Tracker association ---
    track_max_age_frames: int = 30
    track_iou_match_threshold: float = 0.25
    track_center_match_px: float = 200.0
    # Clear known identity when detector re-association is likely a different person.
    track_known_reacquire_clear_iou: float = 0.18
    track_known_reacquire_clear_center_ratio: float = 0.65
    # How many consecutive detector cycles a track may miss before being removed.
    # Lower values make boxes appear/disappear closer to pure-detector behavior (less "sticky").
    # 0 => drop immediately on first miss.
    track_max_det_misses_unknown: int = 0
    # Keep known tracks alive longer so identity holds during fast movement.
    track_max_det_misses_known: int = 12

    # --- Identity hysteresis (reduce flicker during motion blur) ---
    identity_hold_seconds: float = 1.5
    identity_hold_min_iou: float = 0.05
    identity_hold_max_det_misses: int = 1
    identity_hold_max_center_shift_ratio: float = 0.35
    # Expanded zone (keeps identity while face center remains in this area).
    identity_hold_zone_enabled: bool = True
    identity_hold_zone_scale: float = 1.6
    # Safety refresh: still re-run recognition periodically even inside hold zone.
    identity_hold_zone_recheck_seconds: float = 3.5

    # --- Recognition quality + temporal fusion ---
    recognition_quality_gate_enabled: bool = True
    recognition_min_face_px: int = 24
    recognition_min_brightness: float = 10.0
    recognition_min_sharpness: float = 6.0
    recognition_max_abs_yaw: float = 78.0
    recognition_max_abs_pitch: float = 70.0
    embedding_fusion_window: int = 3

    # --- Attendance safety ---
    attendance_max_embed_age_seconds: float = 0.9
    attendance_min_identity_age_seconds: float = 0.35
    max_detection_result_age_seconds: float = 0.45
    # Only trust detector landmarks (kps) if a detection was recent.
    kps_max_age_seconds: float = 0.45

    # --- Attendance quality gates (kept compatible with existing behavior) ---
    strict_similarity_threshold: float = 0.50
    min_att_quality: float = 18.0

    # --- Logging ---
    log_interval_seconds: float = 5.0

    # --- Verification ---
    verification_samples: int = 3
    allow_single_sample_attendance: bool = False

    @classmethod
    def from_env(cls, **overrides) -> "Config":
        cfg = cls()

        # Apply constructor/config overrides first, then allow env vars to override.
        for k, v in overrides.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)

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
        cfg.embed_refresh_seconds_unknown = _env_float(
            "EMBED_REFRESH_UNKNOWN_SECONDS", cfg.embed_refresh_seconds_unknown
        )
        cfg.unknown_burst_after_seconds = _env_float(
            "UNKNOWN_BURST_AFTER_SECONDS", cfg.unknown_burst_after_seconds
        )
        cfg.known_identity_latch_enabled = _env_bool(
            "KNOWN_IDENTITY_LATCH_ENABLED", cfg.known_identity_latch_enabled
        )
        cfg.known_identity_latch_min_hits = max(
            0,
            _env_int(
                "KNOWN_IDENTITY_LATCH_MIN_HITS",
                cfg.known_identity_latch_min_hits,
            ),
        )
        cfg.latch_boundary_margin_ratio = max(
            0.0,
            min(0.45, _env_float("LATCH_BOUNDARY_MARGIN_RATIO", cfg.latch_boundary_margin_ratio)),
        )
        cfg.latch_max_overlap_iou = max(
            0.0,
            min(1.0, _env_float("LATCH_MAX_OVERLAP_IOU", cfg.latch_max_overlap_iou)),
        )

        # Thresholds
        cfg.similarity_threshold = _env_float("SIMILARITY_THRESHOLD", cfg.similarity_threshold)
        cfg.borderline_margin = _env_float("BORDERLINE_MARGIN", cfg.borderline_margin)
        cfg.distinct_sim_margin = _env_float("DISTINCT_SIM_MARGIN", cfg.distinct_sim_margin)
        cfg.strict_similarity_threshold = _env_float(
            "STRICT_SIM_THRESHOLD", cfg.strict_similarity_threshold
        )
        cfg.min_att_quality = _env_float("MIN_ATT_QUALITY", cfg.min_att_quality)

        # Attendance gates (canonical env keys only)
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
        cfg.track_iou_match_threshold = _env_float(
            "TRACK_IOU_MATCH_THRESHOLD", cfg.track_iou_match_threshold
        )
        cfg.track_center_match_px = _env_float(
            "TRACK_CENTER_MATCH_PX", cfg.track_center_match_px
        )
        cfg.track_known_reacquire_clear_iou = max(
            0.0,
            min(
                1.0,
                _env_float(
                    "TRACK_KNOWN_REACQUIRE_CLEAR_IOU",
                    cfg.track_known_reacquire_clear_iou,
                ),
            ),
        )
        cfg.track_known_reacquire_clear_center_ratio = max(
            0.0,
            _env_float(
                "TRACK_KNOWN_REACQUIRE_CLEAR_CENTER_RATIO",
                cfg.track_known_reacquire_clear_center_ratio,
            ),
        )
        cfg.track_max_det_misses_unknown = max(
            0, _env_int("TRACK_MAX_DET_MISSES_UNKNOWN", cfg.track_max_det_misses_unknown)
        )
        cfg.track_max_det_misses_known = max(
            0, _env_int("TRACK_MAX_DET_MISSES_KNOWN", cfg.track_max_det_misses_known)
        )

        # Logging / verification
        cfg.log_interval_seconds = _env_float("PIPELINE_LOG_INTERVAL_S", cfg.log_interval_seconds)
        cfg.verification_samples = max(1, _env_int("VERIFICATION_SAMPLES", cfg.verification_samples))
        cfg.allow_single_sample_attendance = _env_bool(
            "ALLOW_SINGLE_SAMPLE_ATTENDANCE", cfg.allow_single_sample_attendance
        )
        if not cfg.allow_single_sample_attendance:
            cfg.verification_samples = max(2, int(cfg.verification_samples))

        cfg.attendance_fast_mode = _env_bool("ATTENDANCE_FAST_MODE", cfg.attendance_fast_mode)
        if cfg.attendance_fast_mode:
            cfg.identity_hold_seconds = max(float(cfg.identity_hold_seconds), 2.0)
            keep_strict_checks = _env_bool("FAST_MODE_KEEP_STRICT_CHECKS", True)
            if keep_strict_checks:
                # Keep speed gains, but do not drop core anti-mismatch gates.
                cfg.stable_id_confirmations = max(int(cfg.stable_id_confirmations), 2)
                cfg.strict_similarity_threshold = max(
                    float(cfg.strict_similarity_threshold),
                    float(cfg.similarity_threshold + cfg.borderline_margin),
                )
                if not cfg.allow_single_sample_attendance:
                    cfg.verification_samples = max(2, int(cfg.verification_samples))
            else:
                # Legacy unsafe fast mode (explicit opt-out of strict checks).
                cfg.stable_id_confirmations = min(int(cfg.stable_id_confirmations), 1)
                cfg.strict_similarity_threshold = float(cfg.similarity_threshold)
                cfg.verification_samples = 1

        cfg.identity_hold_seconds = max(
            0.0, _env_float("IDENTITY_HOLD_SECONDS", cfg.identity_hold_seconds)
        )
        cfg.identity_hold_min_iou = _env_float("IDENTITY_HOLD_MIN_IOU", cfg.identity_hold_min_iou)
        cfg.identity_hold_max_det_misses = max(
            0, _env_int("IDENTITY_HOLD_MAX_DET_MISSES", cfg.identity_hold_max_det_misses)
        )
        cfg.identity_hold_max_center_shift_ratio = max(
            0.0,
            _env_float(
                "IDENTITY_HOLD_MAX_CENTER_SHIFT_RATIO",
                cfg.identity_hold_max_center_shift_ratio,
            ),
        )
        cfg.identity_hold_zone_enabled = _env_bool(
            "IDENTITY_HOLD_ZONE_ENABLED", cfg.identity_hold_zone_enabled
        )
        cfg.identity_hold_zone_scale = max(
            1.0, _env_float("IDENTITY_HOLD_ZONE_SCALE", cfg.identity_hold_zone_scale)
        )
        cfg.identity_hold_zone_recheck_seconds = max(
            0.0,
            _env_float(
                "IDENTITY_HOLD_ZONE_RECHECK_SECONDS",
                cfg.identity_hold_zone_recheck_seconds,
            ),
        )
        cfg.recognition_quality_gate_enabled = _env_bool(
            "RECOGNITION_QUALITY_GATE_ENABLED",
            cfg.recognition_quality_gate_enabled,
        )
        cfg.recognition_min_face_px = max(
            8,
            _env_int("RECOGNITION_MIN_FACE_PX", cfg.recognition_min_face_px),
        )
        cfg.recognition_min_brightness = max(
            0.0,
            _env_float("RECOGNITION_MIN_BRIGHTNESS", cfg.recognition_min_brightness),
        )
        cfg.recognition_min_sharpness = max(
            0.0,
            _env_float("RECOGNITION_MIN_SHARPNESS", cfg.recognition_min_sharpness),
        )
        cfg.recognition_max_abs_yaw = max(
            0.0,
            _env_float("RECOGNITION_MAX_ABS_YAW", cfg.recognition_max_abs_yaw),
        )
        cfg.recognition_max_abs_pitch = max(
            0.0,
            _env_float("RECOGNITION_MAX_ABS_PITCH", cfg.recognition_max_abs_pitch),
        )
        cfg.embedding_fusion_window = max(
            1, _env_int("EMBEDDING_FUSION_WINDOW", cfg.embedding_fusion_window)
        )
        cfg.attendance_max_embed_age_seconds = max(
            0.0,
            _env_float("ATTENDANCE_MAX_EMBED_AGE_S", cfg.attendance_max_embed_age_seconds),
        )
        cfg.attendance_min_identity_age_seconds = max(
            0.0,
            _env_float(
                "ATTENDANCE_MIN_ID_AGE_S",
                cfg.attendance_min_identity_age_seconds,
            ),
        )
        cfg.max_detection_result_age_seconds = max(
            0.0,
            _env_float("MAX_DET_RESULT_AGE_S", cfg.max_detection_result_age_seconds),
        )
        cfg.kps_max_age_seconds = max(
            0.0, _env_float("KPS_MAX_AGE_S", cfg.kps_max_age_seconds)
        )

        return cfg

    @property
    def verification_required_avg_similarity(self) -> float:
        # High-stakes verification is stricter than the base match threshold.
        return float(self.similarity_threshold + self.borderline_margin)
