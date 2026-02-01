from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, Optional, Sequence
import time

from .pipeline_config import Config


class Mode(str, Enum):
    IDLE = "idle"
    NORMAL = "normal"
    BURST = "burst"


@dataclass(slots=True)
class SchedulerState:
    mode: Mode = Mode.IDLE
    last_mode_change_ts: float = 0.0
    last_activity_ts: float = 0.0
    burst_until_ts: float = 0.0
    last_detection_ts: float = 0.0
    recent_burst_reasons: list[str] = field(default_factory=list)


class AdaptiveScheduler:
    """
    Per-camera scheduler.

    Modes:
      - IDLE: low detection FPS; recognition disabled unless high-stakes
      - NORMAL: medium detection FPS; recognition on refresh
      - BURST: high detection FPS for a short window
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg
        now = time.time()
        self.state = SchedulerState(last_mode_change_ts=now, last_activity_ts=now)

    def force_burst(self, reason: str, *, now: Optional[float] = None) -> None:
        now = time.time() if now is None else float(now)
        self.state.burst_until_ts = max(self.state.burst_until_ts, now + float(self.cfg.burst_seconds))
        if self.state.mode != Mode.BURST:
            self.state.mode = Mode.BURST
            self.state.last_mode_change_ts = now

        r = str(reason or "").strip() or "unspecified"
        self.state.recent_burst_reasons.append(r)
        if len(self.state.recent_burst_reasons) > 6:
            self.state.recent_burst_reasons = self.state.recent_burst_reasons[-6:]

    def update(
        self,
        *,
        motion_active: bool,
        tracks_present: bool,
        events: Optional[Iterable[str]] = None,
        now: Optional[float] = None,
        enrollment_mode: bool = False,
    ) -> Mode:
        now = time.time() if now is None else float(now)
        events = set(events or [])

        if enrollment_mode:
            self.force_burst("enrollment", now=now)
            return self.state.mode

        for e in ("new_track", "verify", "borderline", "unknown_persist", "identity_flip"):
            if e in events:
                self.force_burst(e, now=now)

        active = bool(motion_active or tracks_present)
        if active:
            self.state.last_activity_ts = now

        # If we're still within a burst window, keep burst.
        if now < self.state.burst_until_ts:
            if self.state.mode != Mode.BURST:
                self.state.mode = Mode.BURST
                self.state.last_mode_change_ts = now
            return self.state.mode

        # Otherwise, pick between NORMAL and IDLE.
        desired = Mode.NORMAL if active else Mode.IDLE
        if desired == Mode.IDLE and (now - self.state.last_activity_ts) < float(self.cfg.idle_seconds):
            desired = Mode.NORMAL

        if desired != self.state.mode:
            self.state.mode = desired
            self.state.last_mode_change_ts = now
        return self.state.mode

    def _target_detection_fps(self) -> float:
        if self.state.mode == Mode.BURST:
            return float(self.cfg.detection_fps_burst)
        if self.state.mode == Mode.NORMAL:
            return float(self.cfg.detection_fps_normal)
        return float(self.cfg.detection_fps_idle)

    def should_run_detection(self, *, now: Optional[float] = None) -> bool:
        now = time.time() if now is None else float(now)
        fps = max(0.0, self._target_detection_fps())
        if fps <= 0.0:
            return False
        period = 1.0 / fps
        return (now - self.state.last_detection_ts) >= period

    def mark_detection_submitted(self, *, now: Optional[float] = None) -> None:
        now = time.time() if now is None else float(now)
        self.state.last_detection_ts = now

    def should_run_recognition(self, track: object, *, now: Optional[float] = None) -> bool:
        now = time.time() if now is None else float(now)

        force_until = float(getattr(track, "force_recognition_until_ts", 0.0) or 0.0)
        last_embed = float(getattr(track, "last_embed_ts", 0.0) or 0.0)

        # In IDLE, recognition is normally disabled unless forced (verification/high-stakes).
        if self.state.mode == Mode.IDLE and now >= force_until:
            return False

        if now < force_until:
            # During a forced window (e.g., verification), allow faster sampling.
            min_period = 1.0 / max(1.0, float(self.cfg.detection_fps_burst))
            return (now - last_embed) >= max(0.05, min_period)

        return (now - last_embed) >= float(self.cfg.embed_refresh_seconds)

    def mode_label(self) -> str:
        return str(self.state.mode.value)

    def burst_reasons(self, *, limit: int = 4) -> Sequence[str]:
        if limit <= 0:
            return []
        return list(self.state.recent_burst_reasons[-limit:])

