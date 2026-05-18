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
    body_track_id: Optional[int] = None
    embedding_history: list[np.ndarray] = field(default_factory=list)
    last_quality_score: float = 0.0
    last_quality_reason: str = ""

    # anti-spoof support (5-point kps from detector)
    kps: Optional[np.ndarray] = None
    det_score: float = 0.0
    last_det_ts: float = 0.0
    last_known_ts: float = 0.0
    last_known_bbox: Optional[Tuple[int, int, int, int]] = None
    # Expanded area around last confirmed known bbox. While the tracked face
    # center remains inside this zone we can keep identity without full re-match.
    identity_hold_zone_bbox: Optional[Tuple[int, int, int, int]] = None
    identity_hold_zone_ts: float = 0.0

    # --- PERSISTENT IDENTITY LOCK ---
    # Once a track is confirmed with enough stable_id_hits, we lock the identity here.
    # This name/id persists for the full lifetime of the track even if the face
    # disappears (person turns around, moves away, etc.) — until they fully leave frame.
    locked_person_id: Optional[str] = None
    locked_name: str = ""
    locked_at: float = 0.0

    # verification (managed by AttendanceDebouncer)
    verify_target_id: Optional[str] = None
    verify_target_name: Optional[str] = None
    verify_samples: list[Tuple[str, float]] = field(default_factory=list)
    verify_started_ts: float = 0.0
    _verify_last_embed_ts: float = 0.0

    # Smoothness support
    smoothed_bbox: Optional[Tuple[float, float, float, float]] = None


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

            # SPATIAL DRIFT GUARD: If a locked track's optical tracker has drifted
            # far from where the identity was last confirmed, clear the lock.
            # This prevents ghost labels appearing on nearby people.
            locked_pid = getattr(tr, "locked_person_id", None)
            last_known_bbox = getattr(tr, "last_known_bbox", None)
            if locked_pid and last_known_bbox and tr.person_id is None:
                kx1, ky1, kx2, ky2 = last_known_bbox
                # Max allowed drift: 1.2x the size of the original bounding box (tightened from 2.0x)
                box_w = max(1, kx2 - kx1)
                box_h = max(1, ky2 - ky1)
                max_drift = max(box_w, box_h) * 1.2
                cur_cx = (x1 + x2) * 0.5
                cur_cy = (y1 + y2) * 0.5
                lock_cx = (kx1 + kx2) * 0.5
                lock_cy = (ky1 + ky2) * 0.5
                drift = ((cur_cx - lock_cx) ** 2 + (cur_cy - lock_cy) ** 2) ** 0.5
                if drift > max_drift:
                    # Too far from where we saw them — clear the lock
                    tr.locked_person_id = None
                    tr.locked_name = ""
                    tr.locked_at = 0.0

        for tid, tr in list(self._tracks.items()):
            max_age = int(self.cfg.track_max_age_frames)
            # Locked-identity tracks get extended optical-tracker survival too.
            is_known_track = tr.person_id is not None or bool(getattr(tr, "locked_person_id", None))
            if not is_known_track:
                max_age = max(3, max_age // 3)

            # STATIC GHOST REAPER: If a track hasn't seen a detector hit for a while
            # and isn't moving (optical tracker is stuck on a pillar/wall), kill it.
            if tr.person_id is None and tr.lost_frames > (max_age // 2):
                last_known = getattr(tr, "last_known_bbox", None)
                if last_known:
                    # If it hasn't moved more than 5% of its size, it's likely a static ghost
                    lx1, ly1, lx2, ly2 = last_known
                    cx1, cy1, cx2, cy2 = tr.bbox
                    dist = ((cx1-lx1)**2 + (cy1-ly1)**2)**0.5
                    box_dim = max(1, lx2-lx1, ly2-ly1)
                    if dist < (box_dim * 0.05):
                        dead.append(tid)
                        continue

            if tr.lost_frames > max_age:
                dead.append(tid)

        for tid in dead:
            self._tracks.pop(tid, None)

        self._dedup_spatial()

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
                tr.embedding_history = []
                tr.last_quality_score = 0.0
                tr.last_quality_reason = "reacquire_clear"
                tr.unknown_since_ts = now
                tr.last_known_ts = 0.0
                tr.last_known_bbox = None
                tr.identity_hold_zone_bbox = None
                tr.identity_hold_zone_ts = 0.0
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
        # IMPORTANT: A track with a locked identity (confirmed known person) is treated
        # like a "known" track even when person_id is temporarily None (face not visible).
        # This allows the person to turn around and still be tracked until they leave frame.
        dead: list[int] = []
        for tid, tr in self._tracks.items():
            is_locked = bool(getattr(tr, "locked_person_id", None))
            if tr.person_id is not None or is_locked:
                max_misses = int(self.cfg.track_max_det_misses_known)
            else:
                max_misses = int(self.cfg.track_max_det_misses_unknown)
            if int(getattr(tr, "det_misses", 0) or 0) > max_misses:
                dead.append(tid)

        for tid in dead:
            self._tracks.pop(tid, None)

        # Deduplicate tracks sharing the same locked_person_id.
        self._dedup_locked_identity()

        # Deduplicate tracks that are spatially too close (prevent multiple HUDs for one person)
        self._dedup_spatial()

        return new_ids

    def _dedup_spatial(self) -> None:
        """Merge tracks that are spatially overlapping too much, regardless of identity."""
        if len(self._tracks) <= 1:
            return

        # Sort by 'quality' so we keep the most established tracks
        ordered = sorted(
            self._tracks.values(),
            key=lambda t: (
                t.person_id is not None,
                bool(getattr(t, "locked_person_id", None)),
                int(getattr(t, "stable_id_hits", 0) or 0),
                -float(t.lost_frames),
                int(t.track_id)
            ),
            reverse=True,
        )

        removed: set[int] = set()
        iou_merge_thr = 0.35  # Tightened from 0.45: Merge more aggressively to prevent double-boxes

        for i, t in enumerate(ordered):
            if t.track_id in removed:
                continue

            tx1, ty1, tx2, ty2 = t.bbox
            tw, th = max(1, tx2 - tx1), max(1, ty2 - ty1)
            t_diag = (tw**2 + th**2)**0.5

            for o in ordered[i + 1:]:
                if o.track_id in removed:
                    continue

                # If they have different confirmed identities, don't merge (let the recognizer sort it out)
                if t.person_id and o.person_id and t.person_id != o.person_id:
                    continue

                v_iou = _bbox_iou(t.bbox, o.bbox)
                v_dist = _center_dist(t.bbox, o.bbox)

                # Merge if:
                # 1. High overlap
                # 2. Centers are very close relative to box size
                if v_iou >= iou_merge_thr or v_dist <= (t_diag * 0.35): # Increased from 0.25
                    removed.add(o.track_id)

        for tid in removed:
            self._tracks.pop(tid, None)

    def _dedup_locked_identity(self) -> None:
        """Keep only one track per locked_person_id (the most recently face-confirmed)."""
        seen: Dict[str, Track] = {}
        to_remove: list[int] = []

        for tr in self._tracks.values():
            lid = getattr(tr, "locked_person_id", None)
            if not lid:
                continue
            existing = seen.get(lid)
            if existing is None:
                seen[lid] = tr
            else:
                # Keep the one with the more recent live face confirmation.
                # Tie-break: higher stable_id_hits, then newer track_id.
                def _score(t: Track) -> tuple:
                    return (
                        float(getattr(t, "last_known_ts", 0.0) or 0.0),
                        int(getattr(t, "stable_id_hits", 0) or 0),
                        int(t.track_id),
                    )
                if _score(tr) > _score(existing):
                    to_remove.append(existing.track_id)
                    seen[lid] = tr
                else:
                    to_remove.append(tr.track_id)

        for tid in to_remove:
            self._tracks.pop(tid, None)

    def _best_tracker_kind(self) -> str:
        for kind in ("kcf", "mil"):
            if _create_tracker(kind) is not None:
                return kind
        return "mil"
