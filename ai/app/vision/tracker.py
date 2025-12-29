from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Tuple
import numpy as np

def iou(a: np.ndarray, b: np.ndarray) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    union = area_a + area_b - inter + 1e-6
    return float(inter / union)

def center_distance(a: np.ndarray, b: np.ndarray) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    acx, acy = (ax1 + ax2) * 0.5, (ay1 + ay2) * 0.5
    bcx, bcy = (bx1 + bx2) * 0.5, (by1 + by2) * 0.5
    dx, dy = acx - bcx, acy - bcy
    return float((dx * dx + dy * dy) ** 0.5)


def bbox_diag(b: np.ndarray) -> float:
    x1, y1, x2, y2 = b
    return float(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5)

@dataclass
class Track:
    track_id: int
    bbox: np.ndarray
    name: str
    employee_id: int
    similarity: float
    last_seen_frame: int
    stable_name_hits: int = 0

class SimpleTracker:
    def __init__(
        self,
        iou_threshold: float = 0.35,
        max_age_frames: int = 30,
        smooth_alpha: float = 0.55,
        center_dist_threshold: float = 140.0,
        suppress_new_iou: float = 0.65,
        merge_iou: float = 0.5,
        merge_center: float = 90.0,
    ):
        self.iou_threshold = float(iou_threshold)
        self.max_age_frames = int(max_age_frames)
        self.smooth_alpha = float(smooth_alpha)
        self.center_dist_threshold = float(center_dist_threshold)
        self.suppress_new_iou = float(suppress_new_iou)
        self.merge_iou = float(merge_iou)
        self.merge_center = float(merge_center)
        self.tracks: Dict[int, Track] = {}
        self._next_id = 1

    def _base_center_thresh(self, bbox: np.ndarray) -> float:
        diag = bbox_diag(np.asarray(bbox, dtype=float))
        return max(self.center_dist_threshold, diag * 0.75)

    def _merge_distance(self, a: np.ndarray, b: np.ndarray) -> float:
        return max(self.merge_center, 0.5 * max(bbox_diag(a), bbox_diag(b)))

    def update(self, frame_idx: int, dets: List[Tuple[np.ndarray, str, int, float]]) -> List[Track]:
        assigned = set()
        updated_tracks = set()

        for tid, tr in list(self.tracks.items()):
            age = max(0, frame_idx - tr.last_seen_frame)
            base_center = self._base_center_thresh(tr.bbox)
            adaptive_center = base_center * (1.0 + 0.12 * min(age, 5))

            best_j = -1
            best_iou = 0.0
            best_dist = 1e9
            best_score = -1e9
            for j, (bbox, name, emp_id, sim) in enumerate(dets):
                if j in assigned:
                    continue
                v_iou = iou(tr.bbox, bbox)
                v_dist = center_distance(tr.bbox, bbox)
                if v_dist > adaptive_center * 1.3:
                    continue
                score = (v_iou * 1.8) - (v_dist / (adaptive_center + 1e-6))
                if score > best_score:
                    best_score = score
                    best_iou = v_iou
                    best_dist = v_dist
                    best_j = j

            if best_j != -1 and (best_iou >= self.iou_threshold * 0.75 or best_dist <= adaptive_center):
                bbox, name, emp_id, sim = dets[best_j]
                self._update_track(tr, bbox, name, emp_id, sim, frame_idx, alpha=self.smooth_alpha)
                updated_tracks.add(tid)
                assigned.add(best_j)

        # Relaxed re-attach for stale tracks before creating new tracks
        for j, (bbox, name, emp_id, sim) in enumerate(dets):
            if j in assigned:
                continue
            best_tid = None
            best_score = -1e9
            for tid, tr in self.tracks.items():
                if tid in updated_tracks:
                    continue
                age = frame_idx - tr.last_seen_frame
                if age <= 0 or age > self.max_age_frames:
                    continue
                base_center = self._base_center_thresh(tr.bbox)
                relaxed_center = base_center * (1.6 + 0.08 * min(age, 5))
                v_iou = iou(tr.bbox, bbox)
                v_dist = center_distance(tr.bbox, bbox)
                if v_dist > relaxed_center * 1.15 and v_iou < self.iou_threshold * 0.6:
                    continue
                score = (v_iou * 1.4) - (v_dist / (relaxed_center + 1e-6))
                if score > best_score:
                    best_score = score
                    best_tid = tid

            if best_tid is not None:
                tr = self.tracks[best_tid]
                self._update_track(tr, bbox, name, emp_id, sim, frame_idx, alpha=max(self.smooth_alpha, 0.7))
                updated_tracks.add(best_tid)
                assigned.add(j)
                continue

        for j, (bbox, name, emp_id, sim) in enumerate(dets):
            if j in assigned:
                continue
            # Skip spawning a duplicate track if it overlaps heavily or sits near an existing track
            should_skip = False
            for tr in self.tracks.values():
                if iou(tr.bbox, bbox) >= self.suppress_new_iou:
                    should_skip = True
                    break
                prox_gate = max(self.center_dist_threshold * 0.4,
                                self._base_center_thresh(np.asarray(bbox, dtype=float)) * 0.6)
                if center_distance(tr.bbox, bbox) <= prox_gate:
                    should_skip = True
                    break
            if should_skip:
                continue
            tid = self._next_id
            self._next_id += 1
            self.tracks[tid] = Track(
                track_id=tid,
                bbox=np.asarray(bbox, dtype=float),
                name=name,
                employee_id=emp_id,
                similarity=sim,
                last_seen_frame=frame_idx,
                stable_name_hits=1 if emp_id != -1 else 0
            )

        for tid, tr in list(self.tracks.items()):
            age = frame_idx - tr.last_seen_frame
            max_age = self.max_age_frames if tr.employee_id != -1 else max(3, self.max_age_frames // 3)
            if age > max_age:
                del self.tracks[tid]


        # Merge overlapping/nearby tracks so a single face keeps one box
        self._merge_tracks()
        self._dedup_by_employee()
        self._dedup_unknown_overlap()

        return list(self.tracks.values())

    def _update_track(
        self,
        tr: Track,
        bbox: np.ndarray,
        name: str,
        emp_id: int,
        sim: float,
        frame_idx: int,
        alpha: float,
    ) -> None:
        alpha = float(max(0.0, min(1.0, alpha)))
        if name == tr.name and emp_id == tr.employee_id and emp_id != -1:
            tr.stable_name_hits += 1
        else:
            tr.stable_name_hits = 1 if emp_id != -1 else 0

        if alpha > 0:
            tr.bbox = (alpha * np.asarray(bbox, dtype=float) +
                       (1.0 - alpha) * tr.bbox)
        else:
            tr.bbox = np.asarray(bbox, dtype=float)
        tr.name = name
        tr.employee_id = emp_id
        tr.similarity = sim
        tr.last_seen_frame = frame_idx

    def _merge_tracks(self) -> None:
        if len(self.tracks) <= 1:
            return
        ordered = sorted(
            self.tracks.values(),
            key=lambda t: (t.stable_name_hits, t.similarity, t.last_seen_frame),
            reverse=True,
        )
        removed: set[int] = set()
        for i, t in enumerate(ordered):
            if t.track_id in removed:
                continue
            for o in ordered[i + 1:]:
                if o.track_id in removed:
                    continue
                if t.employee_id != -1 and o.employee_id != -1 and t.employee_id != o.employee_id:
                    continue
                merge_dist = self._merge_distance(t.bbox, o.bbox)
                if iou(t.bbox, o.bbox) >= self.merge_iou or center_distance(t.bbox, o.bbox) <= merge_dist:
                    removed.add(o.track_id)
        for tid in removed:
            self.tracks.pop(tid, None)

    def _dedup_by_employee(self) -> None:
        # Keep a single track per known employee id when they overlap/are near
        ordered = sorted(
            self.tracks.values(),
            key=lambda t: (t.stable_name_hits, t.similarity, t.last_seen_frame),
            reverse=True,
        )
        kept_emp: Dict[int, Track] = {}
        removed: set[int] = set()
        for tr in ordered:
            if tr.employee_id == -1 or tr.track_id in removed:
                continue
            if tr.employee_id not in kept_emp:
                kept_emp[tr.employee_id] = tr
                continue
            anchor = kept_emp[tr.employee_id]
            merge_dist = self._merge_distance(anchor.bbox, tr.bbox)
            if iou(anchor.bbox, tr.bbox) >= self.merge_iou or center_distance(anchor.bbox, tr.bbox) <= merge_dist:
                removed.add(tr.track_id)
        for tid in removed:
            self.tracks.pop(tid, None)

    def _dedup_unknown_overlap(self) -> None:
        # Unknown faces: suppress multiple overlapping boxes
        ordered = sorted(
            self.tracks.values(),
            key=lambda t: (t.stable_name_hits, t.similarity, t.last_seen_frame),
            reverse=True,
        )
        removed: set[int] = set()
        for i, t in enumerate(ordered):
            if t.employee_id != -1 or t.track_id in removed:
                continue
            for o in ordered[i + 1:]:
                if o.employee_id != -1 or o.track_id in removed:
                    continue
                merge_dist = self._merge_distance(t.bbox, o.bbox)
                if iou(t.bbox, o.bbox) >= self.merge_iou or center_distance(t.bbox, o.bbox) <= merge_dist:
                    removed.add(o.track_id)
        for tid in removed:
            self.tracks.pop(tid, None)
