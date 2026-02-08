from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional
import time

from .adaptive_scheduler import AdaptiveScheduler
from .db_writer import AttendanceWriteJob
from .pipeline_config import Config
from .tracker_manager import Track
from ..utils import now_iso


@dataclass(slots=True)
class DebounceResult:
    job: Optional[AttendanceWriteJob] = None
    reason: str = ""


class AttendanceDebouncer:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        # key = f"{company_id}:{employee_id}" (company_id can be empty)
        self._last_marked: Dict[str, float] = {}

    @staticmethod
    def _key(*, company_id: Optional[str], employee_id: str) -> str:
        comp = str(company_id or "").strip()
        emp = str(employee_id).strip()
        return f"{comp}:{emp}"

    def mark_enqueued(
        self,
        *,
        company_id: Optional[str],
        employee_id: str,
        now: Optional[float] = None,
    ) -> None:
        now = time.time() if now is None else float(now)
        key = self._key(company_id=company_id, employee_id=employee_id)
        self._last_marked[key] = now

    def note_seen(
        self,
        *,
        company_id: Optional[str],
        employee_id: str,
        now: Optional[float] = None,
    ) -> None:
        """
        Extend an active cooldown while the same person is still visible.
        This ensures re-marking only happens after they have been out of camera long enough.
        """
        now = time.time() if now is None else float(now)
        key = self._key(company_id=company_id, employee_id=employee_id)
        last = float(self._last_marked.get(key, 0.0))
        if last <= 0.0:
            return
        cooldown = float(self.cfg.attendance_debounce_seconds)
        if cooldown <= 0.0:
            return
        if (now - last) < cooldown:
            self._last_marked[key] = now

    def consider(
        self,
        *,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
        track: Track,
        scheduler: AdaptiveScheduler,
        now: Optional[float] = None,
    ) -> DebounceResult:
        now = time.time() if now is None else float(now)

        if track.person_id is None:
            self._reset_verification(track)
            return DebounceResult(None, "unknown")

        # Verification in progress: collect samples when recognizer ran.
        if track.verify_target_id:
            return self._step_verification(
                camera_id=camera_id,
                camera_name=camera_name,
                company_id=company_id,
                track=track,
                scheduler=scheduler,
                now=now,
            )

        # Candidate gating (stable identity + score)
        if int(track.stable_id_hits) < int(self.cfg.stable_id_confirmations):
            return DebounceResult(None, "unstable_id")

        min_sim = float(max(self.cfg.similarity_threshold, self.cfg.strict_similarity_threshold))
        if float(track.similarity) < min_sim:
            return DebounceResult(None, "low_similarity")

        min_identity_age = float(
            getattr(self.cfg, "attendance_min_identity_age_seconds", 0.0) or 0.0
        )
        if min_identity_age > 0.0:
            last_change = float(getattr(track, "last_identity_change_ts", 0.0) or 0.0)
            if last_change <= 0.0 or (now - last_change) < min_identity_age:
                return DebounceResult(None, "identity_too_fresh")

        # Require a fresh embedding for marks (prevents using a stale identity on a different face).
        max_age = float(getattr(self.cfg, "attendance_max_embed_age_seconds", 0.0) or 0.0)
        if max_age > 0.0:
            last_embed = float(getattr(track, "last_embed_ts", 0.0) or 0.0)
            if last_embed <= 0.0 or (now - last_embed) > max_age:
                return DebounceResult(None, "stale_embedding")

        key = self._key(company_id=company_id, employee_id=str(track.person_id))
        last = float(self._last_marked.get(key, 0.0))
        if (now - last) < float(self.cfg.attendance_debounce_seconds):
            # Sliding debounce window: if we keep recognizing the same employee, keep extending the
            # next allowed mark time. This prevents repeated marks while they remain in view.
            self._last_marked[key] = now
            return DebounceResult(None, "debounce_extend")

        # Fast path: if verification is configured to a single sample, mark immediately.
        need = int(self.cfg.verification_samples)
        if need <= 1:
            job = AttendanceWriteJob(
                company_id=company_id,
                camera_id=str(camera_id),
                camera_name=str(camera_name),
                employee_id=str(track.person_id),
                name=str(track.name or track.person_id),
                similarity=float(track.similarity),
                timestamp_iso=now_iso(),
            )
            return DebounceResult(job, "verified_fast")

        # Start verification (high-stakes): force burst and collect 3 samples.
        track.verify_target_id = track.person_id
        track.verify_target_name = track.name
        track.verify_started_ts = now
        track.verify_samples = []
        track._verify_last_embed_ts = 0.0
        if track.last_embed_ts > 0.0:
            track.verify_samples.append((track.person_id, float(track.similarity)))
            track._verify_last_embed_ts = track.last_embed_ts

        scheduler.force_burst("verify", now=now)
        track.force_recognition_until_ts = max(track.force_recognition_until_ts, now + self.cfg.burst_seconds)

        return DebounceResult(None, "verify_started")

    def _step_verification(
        self,
        *,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
        track: Track,
        scheduler: AdaptiveScheduler,
        now: float,
    ) -> DebounceResult:
        need = int(self.cfg.verification_samples)
        if need <= 1:
            target = str(track.verify_target_id or track.person_id or "").strip()
            if not target:
                self._reset_verification(track)
                return DebounceResult(None, "verify_no_target")

            job = AttendanceWriteJob(
                company_id=company_id,
                camera_id=str(camera_id),
                camera_name=str(camera_name),
                employee_id=target,
                name=str(track.verify_target_name or track.name or target),
                similarity=float(track.similarity),
                timestamp_iso=now_iso(),
            )
            self._reset_verification(track)
            return DebounceResult(job, "verified_fast")

        if track.last_embed_ts > 0.0 and track.last_embed_ts != track._verify_last_embed_ts:
            if track.person_id is not None:
                track.verify_samples.append((track.person_id, float(track.similarity)))
            track._verify_last_embed_ts = track.last_embed_ts

        if (now - float(track.verify_started_ts or now)) > float(self.cfg.burst_seconds + 2.0):
            self._reset_verification(track)
            return DebounceResult(None, "verify_timeout")

        if len(track.verify_samples) < need:
            scheduler.force_burst("verify", now=now)
            track.force_recognition_until_ts = max(track.force_recognition_until_ts, now + self.cfg.burst_seconds)
            return DebounceResult(None, f"verify_collecting_{len(track.verify_samples)}/{need}")

        target = track.verify_target_id
        if not target:
            self._reset_verification(track)
            return DebounceResult(None, "verify_no_target")

        votes = [pid for (pid, _s) in track.verify_samples]
        vote_count = sum(1 for v in votes if v == target)
        scores = [s for (pid, s) in track.verify_samples if pid == target]
        avg = (sum(scores) / len(scores)) if scores else 0.0

        required_avg = float(self.cfg.verification_required_avg_similarity)
        ok = (vote_count >= (need // 2 + 1)) and (avg >= required_avg)

        # Preserve target for job creation before reset.
        target_name = str(track.verify_target_name or track.name or target)
        similarity = float(track.similarity)
        self._reset_verification(track)

        if not ok:
            return DebounceResult(
                None, f"verify_failed votes={vote_count}/{need} avg={avg:.3f} need={required_avg:.3f}"
            )

        job = AttendanceWriteJob(
            company_id=company_id,
            camera_id=str(camera_id),
            camera_name=str(camera_name),
            employee_id=str(target),
            name=target_name,
            similarity=similarity,
            timestamp_iso=now_iso(),
        )

        return DebounceResult(job, "verified")

    @staticmethod
    def _reset_verification(track: Track) -> None:
        track.verify_target_id = None
        track.verify_target_name = None
        track.verify_samples = []
        track.verify_started_ts = 0.0
        track._verify_last_embed_ts = 0.0
