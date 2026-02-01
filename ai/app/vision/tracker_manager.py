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


def _xyxy_to_xywh(b: Tuple[int, int, int, int]) -> Tuple[float, float, float, float]:
    x1, y1, x2, y2 = b
    return float(x1), float(y1), float(max(1, x2 - x1)), float(max(1, y2 - y1))


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

        det_boxes: List[Tuple[int, int, int, int]] = []
        for d in detections:
            x1, y1, x2, y2 = d.bbox
            x1 = max(0, min(w - 1, int(x1)))
            y1 = max(0, min(h - 1, int(y1)))
            x2 = max(0, min(w, int(x2)))
            y2 = max(0, min(h, int(y2)))
            if x2 <= x1 or y2 <= y1:
                continue
            det_boxes.append((x1, y1, x2, y2))

        assigned_tracks: set[int] = set()
        assigned_dets: set[int] = set()

        for j, box in enumerate(det_boxes):
            best_tid: Optional[int] = None
            best_score = -1.0
            for tid, tr in self._tracks.items():
                if tid in assigned_tracks:
                    continue
                iou = _bbox_iou(tr.bbox, box)
                dist = _center_dist(tr.bbox, box)
                if iou >= float(self.cfg.track_iou_match_threshold) or dist <= float(
                    self.cfg.track_center_match_px
                ):
                    score = iou - (dist / 10_000.0)
                    if score > best_score:
                        best_score = score
                        best_tid = tid
            if best_tid is None:
                continue
            assigned_tracks.add(best_tid)
            assigned_dets.add(j)

            tr = self._tracks[best_tid]
            tr.bbox = box
            tr.last_det_ts = now
            tr.last_seen_ts = now
            tr.lost_frames = 0

            tr.tracker_kind = self._best_tracker_kind()
            tr.tracker = _create_tracker(tr.tracker_kind)
            if tr.tracker is not None:
                tr.tracker.init(frame_bgr, _xyxy_to_xywh(box))

            if j < len(detections):
                tr.kps = detections[j].kps
                tr.det_score = float(detections[j].det_score)

        new_ids: List[int] = []
        for j, box in enumerate(det_boxes):
            if j in assigned_dets:
                continue
            tid = self._next_id
            self._next_id += 1

            kind = self._best_tracker_kind()
            tracker = _create_tracker(kind)
            if tracker is not None:
                tracker.init(frame_bgr, _xyxy_to_xywh(box))

            det = detections[j] if j < len(detections) else None
            tr = Track(
                track_id=tid,
                bbox=box,
                created_ts=now,
                last_seen_ts=now,
                tracker_kind=kind,
                tracker=tracker,
                kps=None if det is None else det.kps,
                det_score=0.0 if det is None else float(det.det_score),
                last_det_ts=now,
            )
            self._tracks[tid] = tr
            new_ids.append(tid)

        return new_ids

    def _best_tracker_kind(self) -> str:
        for kind in ("csrt", "kcf", "mil"):
            if _create_tracker(kind) is not None:
                return kind
        return "mil"

