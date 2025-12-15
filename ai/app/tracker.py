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
    def __init__(self, iou_threshold: float = 0.35, max_age_frames: int = 30):
        self.iou_threshold = float(iou_threshold)
        self.max_age_frames = int(max_age_frames)
        self.tracks: Dict[int, Track] = {}
        self._next_id = 1

    def update(self, frame_idx: int, dets: List[Tuple[np.ndarray, str, int, float]]) -> List[Track]:
        assigned = set()
        for tid, tr in list(self.tracks.items()):
            best_j = -1
            best_iou = 0.0
            for j, (bbox, name, emp_id, sim) in enumerate(dets):
                if j in assigned:
                    continue
                v = iou(tr.bbox, bbox)
                if v > best_iou:
                    best_iou = v
                    best_j = j

            if best_j != -1 and best_iou >= self.iou_threshold:
                bbox, name, emp_id, sim = dets[best_j]
                if name == tr.name and emp_id == tr.employee_id and emp_id != -1:
                    tr.stable_name_hits += 1
                else:
                    tr.stable_name_hits = 1 if emp_id != -1 else 0

                tr.bbox = bbox
                tr.name = name
                tr.employee_id = emp_id
                tr.similarity = sim
                tr.last_seen_frame = frame_idx
                assigned.add(best_j)

        for j, (bbox, name, emp_id, sim) in enumerate(dets):
            if j in assigned:
                continue
            tid = self._next_id
            self._next_id += 1
            self.tracks[tid] = Track(
                track_id=tid,
                bbox=bbox,
                name=name,
                employee_id=emp_id,
                similarity=sim,
                last_seen_frame=frame_idx,
                stable_name_hits=1 if emp_id != -1 else 0
            )

        for tid, tr in list(self.tracks.items()):
            if frame_idx - tr.last_seen_frame > self.max_age_frames:
                del self.tracks[tid]

        return list(self.tracks.values())
