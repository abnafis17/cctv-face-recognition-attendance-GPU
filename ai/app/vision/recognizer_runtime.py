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

        for tr in tracks:
            if not scheduler.should_run_recognition(tr, now=now):
                continue

            emb = self._embedder.embed(frame_bgr, bbox=tr.bbox, kps=tr.kps)
            tr.last_embed_ts = now
            calls += 1

            if emb is None:
                tr.person_id = None
                tr.name = "Unknown"
                tr.similarity = 0.0
                tr.stable_id_hits = 0
                if tr.unknown_since_ts <= 0.0:
                    tr.unknown_since_ts = now
                unknowns += 1
                continue

            m = self._match_embedding(emb)
            score = float(m.score)

            # borderline around decision threshold => burst to disambiguate
            if abs(score - float(self.cfg.similarity_threshold)) <= float(self.cfg.borderline_margin):
                scheduler.force_burst("borderline", now=now)
                tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                borderlines += 1

            if m.person_id is None or score < float(self.cfg.similarity_threshold):
                if tr.person_id is not None:
                    tr.last_identity_change_ts = now
                tr.person_id = None
                tr.name = "Unknown"
                tr.similarity = score
                tr.stable_id_hits = 0
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
                scheduler.force_burst("identity_flip", now=now)
                tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + self.cfg.burst_seconds)
                tr.last_identity_change_ts = now
                tr.stable_id_hits = 0

            tr.person_id = new_id
            tr.name = str(m.name or new_id)
            tr.similarity = score
            tr.unknown_since_ts = 0.0

        return {"recognition_calls": calls, "unknown_tracks": unknowns, "borderline_tracks": borderlines}
