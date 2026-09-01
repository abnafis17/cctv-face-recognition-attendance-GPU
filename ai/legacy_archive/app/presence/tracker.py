from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import math
import time

from .detector import PersonDetection


@dataclass
class PresenceTrack:
    track_id: int
    bbox: Tuple[int, int, int, int]
    first_seen_ts: float
    last_seen_ts: float
    hits: int
    conf: float
    misses: int = 0
    vx: float = 0.0
    vy: float = 0.0
    last_cx: float = 0.0
    last_cy: float = 0.0
    last_update_ts: float = 0.0
    mask_polygon: Optional[List[Tuple[int, int]]] = None

    def dwell_seconds(self, now: float) -> float:
        return max(0.0, float(now) - float(self.first_seen_ts))


@dataclass
class PresenceExit:
    track_id: int
    first_seen_ts: float
    last_seen_ts: float
    dwell_s: float


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


def _bbox_area(box: Tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = box
    return float(max(0, x2 - x1) * max(0, y2 - y1))


def _bbox_max_dim(box: Tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = box
    return float(max(1, x2 - x1, y2 - y1))


def _bbox_center(box: Tuple[int, int, int, int]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return (float(x1 + x2) * 0.5, float(y1 + y2) * 0.5)


def _center_distance(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax, ay = _bbox_center(a)
    bx, by = _bbox_center(b)
    return float(math.hypot(ax - bx, ay - by))


def _smooth_bbox(
    old_box: Tuple[int, int, int, int],
    new_box: Tuple[int, int, int, int],
    alpha: float,
) -> Tuple[int, int, int, int]:
    a = max(0.0, min(1.0, float(alpha)))
    inv = 1.0 - a
    ox1, oy1, ox2, oy2 = old_box
    nx1, ny1, nx2, ny2 = new_box
    x1 = int(round(ox1 * inv + nx1 * a))
    y1 = int(round(oy1 * inv + ny1 * a))
    x2 = int(round(ox2 * inv + nx2 * a))
    y2 = int(round(oy2 * inv + ny2 * a))
    if x2 <= x1:
        x2 = x1 + 1
    if y2 <= y1:
        y2 = y1 + 1
    return (x1, y1, x2, y2)


def _shift_bbox(
    box: Tuple[int, int, int, int],
    dx: float,
    dy: float,
) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    return (
        int(round(float(x1) + float(dx))),
        int(round(float(y1) + float(dy))),
        int(round(float(x2) + float(dx))),
        int(round(float(y2) + float(dy))),
    )


def _clamp_bbox(
    box: Tuple[int, int, int, int],
    *,
    w: Optional[int],
    h: Optional[int],
) -> Tuple[int, int, int, int]:
    if w is None or h is None:
        return box
    x1, y1, x2, y2 = box
    x1 = max(0, min(int(w) - 1, int(x1)))
    y1 = max(0, min(int(h) - 1, int(y1)))
    x2 = max(0, min(int(w), int(x2)))
    y2 = max(0, min(int(h), int(y2)))
    if x2 <= x1:
        x2 = x1 + 1
    if y2 <= y1:
        y2 = y1 + 1
    return (x1, y1, x2, y2)


def _dedup_detections(
    valid: List[Tuple[PersonDetection, Tuple[int, int, int, int]]],
    iou_threshold: float,
) -> List[Tuple[PersonDetection, Tuple[int, int, int, int]]]:
    if len(valid) <= 1:
        return valid

    scored = sorted(
        valid,
        key=lambda item: (float(item[0].conf), _bbox_area(item[1])),
        reverse=True,
    )
    kept: List[Tuple[PersonDetection, Tuple[int, int, int, int]]] = []
    for det, box in scored:
        if any(_bbox_iou(box, k_box) >= iou_threshold for _, k_box in kept):
            continue
        kept.append((det, box))
    return kept


class PresenceTracker:
    def __init__(
        self,
        match_iou: float = 0.30,
        max_lost_s: float = 2.0,
        min_hits: int = 1,
        max_events: int = 200,
        match_center_ratio: float = 0.70,
        reacquire_center_ratio: float = 1.10,
        bbox_smooth_alpha: float = 0.75,
        det_nms_iou: float = 0.65,
        active_hold_s: float = 0.60,
        max_misses: int = 8,
        area_ratio_range: Tuple[float, float] = (0.35, 2.85),
        vel_alpha: float = 0.60,
        vel_decay: float = 0.92,
        max_speed_px_s: float = 2600.0,
    ) -> None:
        self.match_iou = float(match_iou)
        self.max_lost_s = float(max_lost_s)
        self.min_hits = int(max(1, min_hits))
        self.max_events = int(max(10, max_events))
        self.match_center_ratio = max(0.1, float(match_center_ratio))
        self.reacquire_center_ratio = max(
            self.match_center_ratio, float(reacquire_center_ratio)
        )
        self.bbox_smooth_alpha = max(0.0, min(1.0, float(bbox_smooth_alpha)))
        self.det_nms_iou = max(0.1, min(0.95, float(det_nms_iou)))
        self.active_hold_s = max(
            0.05, min(float(self.max_lost_s), float(active_hold_s))
        )
        self.max_misses = max(1, int(max_misses))
        self.area_ratio_min = max(0.05, float(area_ratio_range[0]))
        self.area_ratio_max = max(self.area_ratio_min, float(area_ratio_range[1]))
        self.vel_alpha = max(0.05, min(0.95, float(vel_alpha)))
        self.vel_decay = max(0.50, min(0.99, float(vel_decay)))
        self.max_speed_px_s = max(50.0, float(max_speed_px_s))

        self._tracks: Dict[int, PresenceTrack] = {}
        self._next_id = 1
        self._recent_exits: List[PresenceExit] = []
        self._last_update_ts: Optional[float] = None
        self._avg_dt_s: Optional[float] = None

    def update(
        self,
        detections: Optional[List[PersonDetection]],
        *,
        now: Optional[float] = None,
        frame_shape: Optional[Tuple[int, int, int]] = None,
    ) -> List[PresenceTrack]:
        ts = time.time() if now is None else float(now)
        det_cycle = detections is not None

        if self._last_update_ts is not None:
            dt = ts - float(self._last_update_ts)
            if dt > 0:
                if self._avg_dt_s is None:
                    self._avg_dt_s = float(dt)
                else:
                    self._avg_dt_s = (0.90 * float(self._avg_dt_s)) + (0.10 * float(dt))
        self._last_update_ts = ts

        # Clamp detections to frame bounds when provided
        h = w = None
        if frame_shape is not None:
            h, w = int(frame_shape[0]), int(frame_shape[1])

        valid: List[Tuple[PersonDetection, Tuple[int, int, int, int]]] = []
        if det_cycle:
            for d in detections or []:
                x1, y1, x2, y2 = d.bbox
                if w is not None and h is not None:
                    x1 = max(0, min(w - 1, x1))
                    y1 = max(0, min(h - 1, y1))
                    x2 = max(0, min(w, x2))
                    y2 = max(0, min(h, y2))
                if x2 <= x1 or y2 <= y1:
                    continue
                valid.append((d, (x1, y1, x2, y2)))
            valid = _dedup_detections(valid, iou_threshold=self.det_nms_iou)

        # Predict track boxes forward (constant velocity) so fast motion doesn't break dwell timers.
        pred_boxes: Dict[int, Tuple[int, int, int, int]] = {}
        for tid, tr in self._tracks.items():
            dt = ts - float(getattr(tr, "last_update_ts", tr.last_seen_ts))
            if dt <= 0:
                pred = tr.bbox
            else:
                dx = float(getattr(tr, "vx", 0.0)) * float(dt)
                dy = float(getattr(tr, "vy", 0.0)) * float(dt)
                pred = _shift_bbox(tr.bbox, dx, dy)
            pred_boxes[int(tid)] = _clamp_bbox(pred, w=w, h=h)

        assigned_tracks = set()
        assigned_dets = set()

        if det_cycle:
            # Greedy assignment using IoU + center-distance scoring.
            pairs: List[Tuple[float, int, int]] = []
            track_items = list(self._tracks.items())
            for det_idx, (_det, det_box) in enumerate(valid):
                for tid, tr in track_items:
                    tr_box = pred_boxes.get(int(tid), tr.bbox)
                    t_area = _bbox_area(tr_box)
                    d_area = _bbox_area(det_box)
                    area_ratio = float(d_area / (t_area + 1e-6))
                    if area_ratio < self.area_ratio_min or area_ratio > self.area_ratio_max:
                        continue

                    iou = _bbox_iou(tr_box, det_box)
                    scale = max(24.0, max(_bbox_max_dim(tr_box), _bbox_max_dim(det_box)))
                    center_gate_px = self.match_center_ratio * scale
                    center_dist_px = _center_distance(tr_box, det_box)
                    if iou < self.match_iou and center_dist_px > center_gate_px:
                        continue

                    center_score = max(0.0, 1.0 - (center_dist_px / (center_gate_px + 1e-6)))
                    score = (0.75 * iou) + (0.25 * center_score) + min(0.05, 0.005 * tr.hits)
                    pairs.append((score, tid, det_idx))

            pairs.sort(reverse=True, key=lambda x: x[0])

            for _score, tid, det_idx in pairs:
                if tid in assigned_tracks or det_idx in assigned_dets:
                    continue
                assigned_tracks.add(tid)
                assigned_dets.add(det_idx)

                tr = self._tracks.get(tid)
                if tr is None:
                    continue

                det, det_box = valid[det_idx]
                tr_box = pred_boxes.get(int(tid), tr.bbox)
                tr.bbox = _smooth_bbox(
                    tr_box, det_box, alpha=self.bbox_smooth_alpha
                )
                tr.bbox = _clamp_bbox(tr.bbox, w=w, h=h)

                # Velocity update (EMA) from last confirmed center to new center.
                prev_seen_ts = float(tr.last_seen_ts)
                dt_det = ts - prev_seen_ts
                new_cx, new_cy = _bbox_center(tr.bbox)
                if dt_det > 1e-3:
                    obs_vx = float(new_cx - float(getattr(tr, "last_cx", new_cx))) / float(dt_det)
                    obs_vy = float(new_cy - float(getattr(tr, "last_cy", new_cy))) / float(dt_det)
                    speed = float(math.hypot(obs_vx, obs_vy))
                    if speed > self.max_speed_px_s:
                        scale_down = self.max_speed_px_s / (speed + 1e-6)
                        obs_vx *= scale_down
                        obs_vy *= scale_down
                    tr.vx = (1.0 - self.vel_alpha) * float(getattr(tr, "vx", 0.0)) + self.vel_alpha * float(obs_vx)
                    tr.vy = (1.0 - self.vel_alpha) * float(getattr(tr, "vy", 0.0)) + self.vel_alpha * float(obs_vy)
                tr.last_cx = float(new_cx)
                tr.last_cy = float(new_cy)
                tr.last_update_ts = float(ts)
                tr.last_seen_ts = ts
                tr.hits += 1
                tr.conf = float(det.conf)
                tr.misses = 0

            # Reacquire unmatched detections with nearby lost tracks before creating new IDs.
            for det_idx, (det, det_box) in enumerate(valid):
                if det_idx in assigned_dets:
                    continue

                best_tid: Optional[int] = None
                best_dist = float("inf")
                det_scale = max(24.0, _bbox_max_dim(det_box))

                for tid, tr in self._tracks.items():
                    if tid in assigned_tracks:
                        continue
                    age_s = ts - float(tr.last_seen_ts)
                    if age_s > self.max_lost_s:
                        continue
                    tr_box = pred_boxes.get(int(tid), tr.bbox)
                    t_area = _bbox_area(tr_box)
                    d_area = _bbox_area(det_box)
                    area_ratio = float(d_area / (t_area + 1e-6))
                    if area_ratio < self.area_ratio_min or area_ratio > self.area_ratio_max:
                        continue

                    tr_scale = max(24.0, _bbox_max_dim(tr_box))
                    reacquire_gate_px = self.reacquire_center_ratio * max(det_scale, tr_scale)
                    dist_px = _center_distance(tr_box, det_box)
                    if dist_px > reacquire_gate_px:
                        continue
                    if dist_px < best_dist:
                        best_dist = dist_px
                        best_tid = tid

                if best_tid is None:
                    continue

                tr = self._tracks.get(best_tid)
                if tr is None:
                    continue
                tr_box = pred_boxes.get(int(best_tid), tr.bbox)
                tr.bbox = _smooth_bbox(tr_box, det_box, alpha=self.bbox_smooth_alpha)
                tr.bbox = _clamp_bbox(tr.bbox, w=w, h=h)

                prev_seen_ts = float(tr.last_seen_ts)
                dt_det = ts - prev_seen_ts
                new_cx, new_cy = _bbox_center(tr.bbox)
                if dt_det > 1e-3:
                    obs_vx = float(new_cx - float(getattr(tr, "last_cx", new_cx))) / float(dt_det)
                    obs_vy = float(new_cy - float(getattr(tr, "last_cy", new_cy))) / float(dt_det)
                    speed = float(math.hypot(obs_vx, obs_vy))
                    if speed > self.max_speed_px_s:
                        scale_down = self.max_speed_px_s / (speed + 1e-6)
                        obs_vx *= scale_down
                        obs_vy *= scale_down
                    tr.vx = (1.0 - self.vel_alpha) * float(getattr(tr, "vx", 0.0)) + self.vel_alpha * float(obs_vx)
                    tr.vy = (1.0 - self.vel_alpha) * float(getattr(tr, "vy", 0.0)) + self.vel_alpha * float(obs_vy)
                tr.last_cx = float(new_cx)
                tr.last_cy = float(new_cy)
                tr.last_update_ts = float(ts)
                tr.last_seen_ts = ts
                tr.hits += 1
                tr.conf = float(det.conf)
                tr.misses = 0
                assigned_tracks.add(best_tid)
                assigned_dets.add(det_idx)

            # New tracks for unassigned detections.
            for det_idx, (det, det_box) in enumerate(valid):
                if det_idx in assigned_dets:
                    continue
                tid = self._next_id
                self._next_id += 1
                cx, cy = _bbox_center(det_box)
                self._tracks[tid] = PresenceTrack(
                    track_id=tid,
                    bbox=det_box,
                    first_seen_ts=ts,
                    last_seen_ts=ts,
                    hits=1,
                    conf=float(det.conf),
                    misses=0,
                    vx=0.0,
                    vy=0.0,
                    last_cx=float(cx),
                    last_cy=float(cy),
                    last_update_ts=float(ts),
                )
                assigned_tracks.add(tid)

        # Remove tracks that are not visible for too long.
        effective_max_misses = int(self.max_misses)
        if self._avg_dt_s is not None and float(self._avg_dt_s) > 1e-3:
            required = int(math.ceil(float(self.max_lost_s) / float(self._avg_dt_s))) + 1
            effective_max_misses = max(effective_max_misses, required)

        dead: List[int] = []
        for tid, tr in self._tracks.items():
            if tid in assigned_tracks:
                continue
            if det_cycle:
                tr.misses += 1

            # Advance box using last known velocity so re-acquire remains stable.
            dt = ts - float(getattr(tr, "last_update_ts", tr.last_seen_ts))
            if dt > 0:
                dx = float(getattr(tr, "vx", 0.0)) * float(dt)
                dy = float(getattr(tr, "vy", 0.0)) * float(dt)
                tr.bbox = _clamp_bbox(_shift_bbox(tr.bbox, dx, dy), w=w, h=h)
                tr.last_update_ts = float(ts)
                tr.vx = float(getattr(tr, "vx", 0.0)) * float(self.vel_decay)
                tr.vy = float(getattr(tr, "vy", 0.0)) * float(self.vel_decay)

            too_old = (ts - tr.last_seen_ts) > self.max_lost_s
            too_many_misses = det_cycle and tr.misses > effective_max_misses
            if too_old or too_many_misses:
                dead.append(tid)

        for tid in dead:
            tr = self._tracks.pop(tid, None)
            if tr is None:
                continue
            self._recent_exits.append(
                PresenceExit(
                    track_id=tr.track_id,
                    first_seen_ts=tr.first_seen_ts,
                    last_seen_ts=tr.last_seen_ts,
                    dwell_s=tr.dwell_seconds(tr.last_seen_ts),
                )
            )

        if len(self._recent_exits) > self.max_events:
            self._recent_exits = self._recent_exits[-self.max_events :]

        return list(self._tracks.values())

    def active_tracks(self, now: Optional[float] = None) -> List[PresenceTrack]:
        ts = time.time() if now is None else float(now)
        if self.min_hits <= 1:
            tracks = list(self._tracks.values())
        else:
            tracks = [
                t for t in self._tracks.values() if int(t.hits) >= int(self.min_hits)
            ]
        return [
            t
            for t in tracks
            if (ts - float(t.last_seen_ts)) <= float(self.active_hold_s)
        ]

    def recent_exits(self, limit: int = 20) -> List[PresenceExit]:
        limit = max(1, min(int(limit or 20), self.max_events))
        return list(self._recent_exits[-limit:])

    def reset(self) -> None:
        self._tracks.clear()
        self._recent_exits.clear()
        self._next_id = 1
