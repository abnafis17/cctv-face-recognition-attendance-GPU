from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import time

import cv2
import numpy as np

from .gpu_arbiter import Detection
from .pipeline_config import Config


def _bbox_iou(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
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


def _center_dist(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    acx, acy = (ax1 + ax2) * 0.5, (ay1 + ay2) * 0.5
    bcx, bcy = (bx1 + bx2) * 0.5, (by1 + by2) * 0.5
    dx, dy = acx - bcx, acy - bcy
    return float((dx * dx + dy * dy) ** 0.5)


def _xyxy_to_xywh_int(b: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = b
    return int(x1), int(y1), int(max(1, x2 - x1)), int(max(1, y2 - y1))


def _safe_tracker_init(tracker: Any, frame_bgr: np.ndarray, box_xyxy: Tuple[int, int, int, int]) -> bool:
    """
    OpenCV tracker bindings differ slightly across versions/builds.
    Try a couple of bbox representations and never raise.
    """
    x, y, w, h = _xyxy_to_xywh_int(box_xyxy)
    candidates = (
        (int(x), int(y), int(w), int(h)),
        (float(x), float(y), float(w), float(h)),
    )
    for bb in candidates:
        try:
            tracker.init(frame_bgr, bb)
            return True
        except Exception:
            continue
    return False


def _xywh_to_xyxy(box: Tuple[float, float, float, float]) -> Tuple[int, int, int, int]:
    x, y, w, h = box
    x1 = int(round(x))
    y1 = int(round(y))
    x2 = int(round(x + w))
    y2 = int(round(y + h))
    return x1, y1, x2, y2


def _create_tracker(kind: str) -> Optional[Any]:
    kind = str(kind or "").strip().lower()

    # Preferred (opencv-contrib). Not available in opencv-python builds.
    if kind == "csrt":
        if hasattr(cv2, "TrackerCSRT_create"):
            return cv2.TrackerCSRT_create()
        if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "TrackerCSRT_create"):
            return cv2.legacy.TrackerCSRT_create()

    if kind == "kcf":
        if hasattr(cv2, "TrackerKCF_create"):
            return cv2.TrackerKCF_create()
        if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "TrackerKCF_create"):
            return cv2.legacy.TrackerKCF_create()

    # Fallbacks available in opencv-python.
    if kind == "mil":
        if hasattr(cv2, "TrackerMIL_create"):
            return cv2.TrackerMIL_create()
    if kind == "vit":
        if hasattr(cv2, "TrackerVit_create"):
            return cv2.TrackerVit_create()
    if kind == "nano":
        if hasattr(cv2, "TrackerNano_create"):
            return cv2.TrackerNano_create()

    return None


@dataclass
class Track:
    track_id: int
    bbox: Tuple[int, int, int, int]
    created_ts: float
    last_seen_ts: float
    lost_frames: int = 0
    det_misses: int = 0

    tracker_kind: str = "mil"
    tracker: Any = None

    # identity cache
    person_id: Optional[str] = None
    name: str = "Unknown"
    similarity: float = 0.0
    stable_id_hits: int = 0
    last_embed_ts: float = 0.0
    unknown_since_ts: float = 0.0
    last_identity_change_ts: float = 0.0
    force_recognition_until_ts: float = 0.0

    # anti-spoof support (5-point kps from detector)
    kps: Optional[np.ndarray] = None
    det_score: float = 0.0
    last_det_ts: float = 0.0
    last_known_ts: float = 0.0
    last_known_bbox: Optional[Tuple[int, int, int, int]] = None

    # verification (managed by AttendanceDebouncer)
    verify_target_id: Optional[str] = None
    verify_target_name: Optional[str] = None
    verify_samples: list[Tuple[str, float]] = field(default_factory=list)
    verify_started_ts: float = 0.0
    _verify_last_embed_ts: float = 0.0


class TrackerManager:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._tracks: Dict[int, Track] = {}
        self._next_id = 1

    def tracks(self) -> List[Track]:
        return list(self._tracks.values())

    def update(self, frame_bgr: np.ndarray, *, now: Optional[float] = None) -> List[Track]:
        now = time.time() if now is None else float(now)
        h, w = frame_bgr.shape[:2]

        dead: list[int] = []
        for tid, tr in self._tracks.items():
            if tr.tracker is None:
                tr.lost_frames += 1
                continue
            ok, box = tr.tracker.update(frame_bgr)
            if not ok:
                tr.lost_frames += 1
                continue

            x1, y1, x2, y2 = _xywh_to_xyxy(box)
            x1 = max(0, min(w - 1, x1))
            y1 = max(0, min(h - 1, y1))
            x2 = max(0, min(w, x2))
            y2 = max(0, min(h, y2))
            if x2 <= x1 or y2 <= y1:
                tr.lost_frames += 1
                continue

            tr.bbox = (x1, y1, x2, y2)
            tr.last_seen_ts = now
            tr.lost_frames = 0

        for tid, tr in list(self._tracks.items()):
            max_age = int(self.cfg.track_max_age_frames)
            if tr.person_id is None:
                max_age = max(3, max_age // 3)
            if tr.lost_frames > max_age:
                dead.append(tid)

        for tid in dead:
            self._tracks.pop(tid, None)

        return list(self._tracks.values())

    def apply_detections(
        self,
        frame_bgr: np.ndarray,
        detections: List[Detection],
        *,
        now: Optional[float] = None,
    ) -> List[int]:
        """
        Apply detector bboxes to existing tracks (re-init trackers) or spawn new ones.
        Returns list of newly created track_ids.
        """
        now = time.time() if now is None else float(now)
        h, w = frame_bgr.shape[:2]

        # Each detection result is a chance to re-confirm tracks. If a track isn't matched to
        # any detection in this cycle, it's likely stale (trackers can drift and "hold" boxes).
        for tr in self._tracks.values():
            tr.det_misses = int(getattr(tr, "det_misses", 0) or 0) + 1

        valid: List[Tuple[Tuple[int, int, int, int], Detection]] = []
        for d in detections:
            x1, y1, x2, y2 = d.bbox
            x1 = max(0, min(w - 1, int(x1)))
            y1 = max(0, min(h - 1, int(y1)))
            x2 = max(0, min(w, int(x2)))
            y2 = max(0, min(h, int(y2)))
            if x2 <= x1 or y2 <= y1:
                continue
            valid.append(((x1, y1, x2, y2), d))

        assigned_tracks: set[int] = set()
        assigned_dets: set[int] = set()

        # Global greedy matching (sorted pair scores) is more stable than "per detection"
        # greedy loops when multiple faces are present.
        pairs: List[Tuple[float, float, float, int, int]] = []  # (score, iou, -dist, tid, det_idx)
        iou_thr = float(self.cfg.track_iou_match_threshold)
        center_px = float(self.cfg.track_center_match_px)

        for det_idx, (box, _det) in enumerate(valid):
            bx1, by1, bx2, by2 = box
            bw = max(1, bx2 - bx1)
            bh = max(1, by2 - by1)
            b_area = float(bw * bh)
            for tid, tr in self._tracks.items():
                tx1, ty1, tx2, ty2 = tr.bbox
                tw = max(1, tx2 - tx1)
                th = max(1, ty2 - ty1)
                t_area = float(tw * th)
                area_ratio = b_area / (t_area + 1e-6)
                if area_ratio < 0.50 or area_ratio > 2.00:
                    continue

                iou = _bbox_iou(tr.bbox, box)
                dist = _center_dist(tr.bbox, box)

                max_dim = float(max(tw, th, bw, bh))
                # Avoid matching across people: require centers to be close relative to box size.
                eff_center = min(center_px, 0.80 * max_dim)

                if iou < iou_thr and dist > eff_center:
                    continue

                # Score: prioritize IoU, lightly penalize normalized distance.
                score = float(iou) - float(dist) / max(1.0, (eff_center * 4.0))
                pairs.append((score, float(iou), -float(dist), int(tid), int(det_idx)))

        pairs.sort(reverse=True)

        for _score, iou, neg_dist, tid, det_idx in pairs:
            if tid in assigned_tracks or det_idx in assigned_dets:
                continue
            assigned_tracks.add(tid)
            assigned_dets.add(det_idx)

            box, det = valid[det_idx]
            tr = self._tracks[tid]
            dist = float(-neg_dist)

            # If a known track is re-associated with weak overlap or large center jump,
            # treat it as a re-acquire to avoid carrying identity across people.
            tx1, ty1, tx2, ty2 = tr.bbox
            bx1, by1, bx2, by2 = box
            t_max_dim = max(1, tx2 - tx1, ty2 - ty1)
            b_max_dim = max(1, bx2 - bx1, by2 - by1)
            clear_center_thr = (
                float(getattr(self.cfg, "track_known_reacquire_clear_center_ratio", 0.65) or 0.65)
                * float(max(t_max_dim, b_max_dim))
            )
            clear_iou_thr = float(getattr(self.cfg, "track_known_reacquire_clear_iou", 0.18) or 0.18)
            if tr.person_id is not None and (
                float(iou) < clear_iou_thr or dist > clear_center_thr
            ):
                tr.person_id = None
                tr.name = "Unknown"
                tr.similarity = 0.0
                tr.stable_id_hits = 0
                tr.unknown_since_ts = now
                tr.last_known_ts = 0.0
                tr.last_known_bbox = None
                tr.last_identity_change_ts = now
                tr.force_recognition_until_ts = max(tr.force_recognition_until_ts, now + 0.8)

            tr.bbox = box
            tr.last_det_ts = now
            tr.last_seen_ts = now
            tr.lost_frames = 0
            tr.det_misses = 0

            tr.tracker_kind = self._best_tracker_kind()
            tr.tracker = _create_tracker(tr.tracker_kind)
            if tr.tracker is not None:
                ok = _safe_tracker_init(tr.tracker, frame_bgr, box)
                if not ok:
                    tr.tracker = None

            tr.kps = det.kps
            tr.det_score = float(det.det_score)

        new_ids: List[int] = []
        for j, (box, det) in enumerate(valid):
            if j in assigned_dets:
                continue
            tid = self._next_id
            self._next_id += 1

            kind = self._best_tracker_kind()
            tracker = _create_tracker(kind)
            if tracker is not None:
                ok = _safe_tracker_init(tracker, frame_bgr, box)
                if not ok:
                    tracker = None

            tr = Track(
                track_id=tid,
                bbox=box,
                created_ts=now,
                last_seen_ts=now,
                tracker_kind=kind,
                tracker=tracker,
                kps=det.kps,
                det_score=float(det.det_score),
                last_det_ts=now,
                det_misses=0,
            )
            self._tracks[tid] = tr
            new_ids.append(tid)

        # Prune tracks that haven't been detector-confirmed recently.
        # These cause "sticky" boxes because the tracker can keep returning a bbox even
        # after the face is gone.
        dead: list[int] = []
        for tid, tr in self._tracks.items():
            max_misses = int(self.cfg.track_max_det_misses_unknown)
            if tr.person_id is not None:
                max_misses = int(self.cfg.track_max_det_misses_known)
            if int(getattr(tr, "det_misses", 0) or 0) > max_misses:
                dead.append(tid)

        for tid in dead:
            self._tracks.pop(tid, None)

        return new_ids

    def _best_tracker_kind(self) -> str:
        for kind in ("csrt", "kcf", "mil"):
            if _create_tracker(kind) is not None:
                return kind
        return "mil"
