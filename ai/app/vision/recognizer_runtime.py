from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence
import time

import numpy as np

from .adaptive_scheduler import AdaptiveScheduler
from .pipeline_config import Config
from .tracker_manager import Track
from .insightface_models import FaceEmbedder


@dataclass(slots=True)
class MatchResult:
    person_id: Optional[str]
    name: str
    score: float


class Recognizer:
    """
    Track-level recognizer that uses existing hooks:
      - embed_face(...) via FaceEmbedder
      - match_embedding(emb) -> (person_id,name,score)
    """

    def __init__(
        self,
        cfg: Config,
        *,
        embedder: FaceEmbedder,
        match_embedding: Callable[[np.ndarray], MatchResult],
    ):
        self.cfg = cfg
        self._embedder = embedder
        self._match_embedding = match_embedding

    def update_tracks(
        self,
        frame_bgr: np.ndarray,
        tracks: Sequence[Track],
        scheduler: AdaptiveScheduler,
        *,
        now: Optional[float] = None,
    ) -> dict[str, int]:
        now = time.time() if now is None else float(now)

        calls = 0
        unknowns = 0
        borderlines = 0

        def _bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
            ax1, ay1, ax2, ay2 = a
            bx1, by1, bx2, by2 = b
            ix1, iy1 = max(ax1, bx1), max(ay1, by1)
            ix2, iy2 = min(ax2, bx2), min(ay2, by2)
            iw = max(0, ix2 - ix1)
            ih = max(0, iy2 - iy1)
            inter = iw * ih
            area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
            area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
            union = area_a + area_b - inter + 1e-6
            return float(inter / union)

        for tr in tracks:
            if not scheduler.should_run_recognition(tr, now=now):
                continue

            hold_s = float(getattr(self.cfg, "identity_hold_seconds", 0.0) or 0.0)
            last_known_ts = float(getattr(tr, "last_known_ts", 0.0) or 0.0)
            last_det_ts = float(getattr(tr, "last_det_ts", 0.0) or 0.0)
            det_misses = int(getattr(tr, "det_misses", 0) or 0)
            hold_min_iou = float(getattr(self.cfg, "identity_hold_min_iou", 0.10) or 0.10)
            hold_max_det_misses = int(getattr(self.cfg, "identity_hold_max_det_misses", 1) or 1)

            last_known_bbox = getattr(tr, "last_known_bbox", None)
            cur_bbox = getattr(tr, "bbox", None)
            bbox_iou = 0.0
            if (
                last_known_bbox is not None
                and cur_bbox is not None
                and isinstance(last_known_bbox, tuple)
                and isinstance(cur_bbox, tuple)
            ):
                try:
                    bbox_iou = _bbox_iou(tuple(int(v) for v in cur_bbox), tuple(int(v) for v in last_known_bbox))
                except Exception:
                    bbox_iou = 0.0

            det_age = (now - last_det_ts) if last_det_ts > 0 else 1e9
            hold_ok = (
                hold_s > 0.0
                and (now - last_known_ts) <= hold_s
                and det_misses <= hold_max_det_misses
                and det_age <= min(hold_s, 1.25)
                and (last_known_bbox is None or bbox_iou >= hold_min_iou)
            )

            emb = self._embedder.embed(frame_bgr, bbox=tr.bbox, kps=tr.kps)
            tr.last_embed_ts = now
            calls += 1

            if emb is None:
                # During fast movement/blur, aligned crop can fail. Keep a recent known identity
                # briefly to reduce flicker while we try again on the next frame.
                if tr.person_id is not None and hold_ok:
                    tr.similarity = 0.0
                    tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + 0.45)
                else:
                    tr.person_id = None
                    tr.name = "Unknown"
                    tr.similarity = 0.0
                    tr.stable_id_hits = 0
                    tr.last_known_ts = 0.0
                    tr.last_known_bbox = None
                    if tr.unknown_since_ts <= 0.0:
                        tr.unknown_since_ts = now
                    unknowns += 1
                continue

            m = self._match_embedding(emb)
            score = float(m.score)

            # borderline around decision threshold => burst to disambiguate
            if abs(score - float(self.cfg.similarity_threshold)) <= float(self.cfg.borderline_margin):
                # For already-stable known tracks, prefer a recognition-only recheck instead of
                # forcing GPU detection into BURST (keeps GPU cool when the same person is present).
                stable_known = (
                    tr.person_id is not None
                    and int(getattr(tr, "stable_id_hits", 0) or 0) >= int(self.cfg.stable_id_confirmations)
                )
                if not stable_known:
                    scheduler.force_burst("borderline", now=now)
                tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                borderlines += 1

            if m.person_id is None or score < float(self.cfg.similarity_threshold):
                # If we had a confident identity very recently, keep it briefly even if the
                # current embedding is low-confidence (motion blur / partial face).
                if tr.person_id is not None and hold_ok:
                    tr.similarity = score
                    tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + 0.45)
                    continue

                if tr.person_id is not None:
                    tr.last_identity_change_ts = now
                tr.person_id = None
                tr.name = "Unknown"
                tr.similarity = score
                tr.stable_id_hits = 0
                tr.last_known_ts = 0.0
                tr.last_known_bbox = None
                if tr.unknown_since_ts <= 0.0:
                    tr.unknown_since_ts = now
                unknowns += 1

                if (now - tr.unknown_since_ts) >= float(self.cfg.unknown_burst_after_seconds):
                    scheduler.force_burst("unknown_persist", now=now)
                    tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                continue

            # Known
            new_id = str(m.person_id)
            if tr.person_id is not None and tr.person_id != new_id:
                # Avoid rapid flips during movement. Only accept a new id if it is clearly
                # above threshold+margin; otherwise show Unknown (never keep the old name).
                if score < float(self.cfg.similarity_threshold + self.cfg.borderline_margin):
                    scheduler.force_burst("identity_flip", now=now)
                    tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                    tr.person_id = None
                    tr.name = "Unknown"
                    tr.similarity = score
                    tr.stable_id_hits = 0
                    tr.unknown_since_ts = now if tr.unknown_since_ts <= 0.0 else tr.unknown_since_ts
                    tr.last_identity_change_ts = now
                    tr.last_known_ts = 0.0
                    tr.last_known_bbox = None
                    continue

                scheduler.force_burst("identity_flip", now=now)
                tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                tr.last_identity_change_ts = now
                tr.stable_id_hits = 0

            if tr.person_id == new_id:
                tr.stable_id_hits = int(tr.stable_id_hits) + 1
            else:
                tr.stable_id_hits = 1

            tr.person_id = new_id
            tr.name = str(m.name or new_id)
            tr.similarity = score
            tr.unknown_since_ts = 0.0
            tr.last_known_ts = now
            tr.last_known_bbox = tr.bbox

        return {"recognition_calls": calls, "unknown_tracks": unknowns, "borderline_tracks": borderlines}
