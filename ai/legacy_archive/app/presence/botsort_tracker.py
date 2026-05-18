from __future__ import annotations

import math
import threading
import time
from typing import Dict, List, Optional, Tuple

import numpy as np

from .tracker import PresenceTrack


def _bbox_center(box: Tuple[int, int, int, int]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return (float(x1 + x2) * 0.5, float(y1 + y2) * 0.5)


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
    w: int,
    h: int,
) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    x1 = max(0, min(int(w) - 1, int(x1)))
    y1 = max(0, min(int(h) - 1, int(y1)))
    x2 = max(0, min(int(w), int(x2)))
    y2 = max(0, min(int(h), int(y2)))
    if x2 <= x1:
        x2 = min(int(w), x1 + 1)
    if y2 <= y1:
        y2 = min(int(h), y1 + 1)
    return (x1, y1, x2, y2)


class BoTSORTPresenceTracker:
    """
    Ultralytics YOLO + BoTSORT body tracker wrapper.

    - Runs YOLO tracking with `persist=True` so track ids remain stable.
    - Applies lightweight bbox smoothing + velocity prediction between updates.
    - Exposes the same PresenceTrack structure used by the existing runtime.
    """

    def __init__(
        self,
        *,
        model_path: str,
        tracker_cfg: str,
        conf: float = 0.25,
        iou: float = 0.45,
        imgsz: int = 640,
        device: str = "cpu",
        max_det: int = 100,
        active_hold_s: float = 0.60,
        max_lost_s: float = 2.0,
        max_misses: int = 8,
        bbox_smooth_alpha: float = 0.70,
        vel_alpha: float = 0.55,
        vel_decay: float = 0.92,
        max_speed_px_s: float = 2600.0,
    ) -> None:
        try:
            from ultralytics import YOLO  # type: ignore
        except Exception as e:
            raise RuntimeError(
                "Ultralytics YOLO is required for BoTSORT body tracking."
            ) from e

        self._model = YOLO(str(model_path))
        self._tracker_cfg = str(tracker_cfg)
        self._conf = float(conf)
        self._iou = float(iou)
        self._imgsz = int(imgsz)
        self._device = str(device or "cpu")
        self._max_det = int(max_det)

        self._active_hold_s = max(0.05, float(active_hold_s))
        self._max_lost_s = max(self._active_hold_s, float(max_lost_s))
        self._max_misses = max(1, int(max_misses))
        self._bbox_smooth_alpha = max(0.0, min(1.0, float(bbox_smooth_alpha)))
        self._vel_alpha = max(0.05, min(0.95, float(vel_alpha)))
        self._vel_decay = max(0.50, min(0.99, float(vel_decay)))
        self._max_speed_px_s = max(50.0, float(max_speed_px_s))

        self._tracks: Dict[int, PresenceTrack] = {}
        self._last_update_ts: Optional[float] = None
        self._avg_dt_s: Optional[float] = None
        self._lock = threading.Lock()

    def _run_track(
        self, frame_bgr: np.ndarray
    ) -> List[Tuple[int, Tuple[int, int, int, int], float]]:
        results = self._model.track(
            source=frame_bgr,
            conf=self._conf,
            iou=self._iou,
            imgsz=self._imgsz,
            classes=[0],  # person
            device=self._device,
            max_det=self._max_det,
            tracker=self._tracker_cfg,
            persist=True,
            verbose=False,
        )
        if not results:
            return []

        r0 = results[0]
        boxes = getattr(r0, "boxes", None)
        if boxes is None:
            return []

        ids_raw = getattr(boxes, "id", None)
        xyxy_raw = getattr(boxes, "xyxy", None)
        conf_raw = getattr(boxes, "conf", None)
        if ids_raw is None or xyxy_raw is None:
            return []

        masks = getattr(r0, "masks", None)
        masks_xy = None
        if masks is not None:
            try:
                masks_xy = masks.xy
            except Exception:
                pass

        try:
            ids = ids_raw.int().cpu().tolist()
            xyxy = xyxy_raw.cpu().tolist()
            confs = conf_raw.cpu().tolist() if conf_raw is not None else [0.0] * len(ids)
        except Exception:
            return []

        out: List[Tuple[int, Tuple[int, int, int, int], float, Optional[List[Tuple[int, int]]]]] = []
        for idx, tid in enumerate(ids):
            try:
                tid_i = int(tid)
            except Exception:
                continue
            if tid_i <= 0:
                continue

            try:
                x1, y1, x2, y2 = [int(round(float(v))) for v in xyxy[idx]]
            except Exception:
                continue
            if x2 <= x1 or y2 <= y1:
                continue

            conf_v = 0.0
            if idx < len(confs):
                try:
                    conf_v = float(confs[idx])
                except Exception:
                    conf_v = 0.0
            
            mask_poly = None
            if masks_xy is not None and idx < len(masks_xy):
                try:
                    poly = masks_xy[idx]
                    if poly is not None and len(poly) > 2:
                        mask_poly = [(int(p[0]), int(p[1])) for p in poly]
                except Exception:
                    pass
                    
            out.append((tid_i, (x1, y1, x2, y2), conf_v, mask_poly))
        return out

    def track(
        self,
        frame_bgr: np.ndarray,
        *,
        now: Optional[float] = None,
    ) -> Dict[int, PresenceTrack]:
        if frame_bgr is None or frame_bgr.size == 0:
            return self.active_tracks(now=now)

        ts = time.time() if now is None else float(now)
        h, w = frame_bgr.shape[:2]

        if self._last_update_ts is not None:
            dt = ts - float(self._last_update_ts)
            if dt > 0.0:
                if self._avg_dt_s is None:
                    self._avg_dt_s = dt
                else:
                    self._avg_dt_s = (0.90 * float(self._avg_dt_s)) + (0.10 * dt)
        self._last_update_ts = ts

        with self._lock:
            detections = self._run_track(frame_bgr)

        seen: set[int] = set()
        for tid, det_box, conf, mask_poly in detections:
            seen.add(int(tid))
            det_box = _clamp_bbox(det_box, w=w, h=h)
            tr = self._tracks.get(int(tid))
            if tr is None:
                cx, cy = _bbox_center(det_box)
                self._tracks[int(tid)] = PresenceTrack(
                    track_id=int(tid),
                    bbox=det_box,
                    first_seen_ts=ts,
                    last_seen_ts=ts,
                    hits=1,
                    conf=float(conf),
                    misses=0,
                    vx=0.0,
                    vy=0.0,
                    last_cx=float(cx),
                    last_cy=float(cy),
                    last_update_ts=float(ts),
                    mask_polygon=mask_poly,
                )
                continue

            pred_dt = ts - float(getattr(tr, "last_update_ts", tr.last_seen_ts))
            pred_box = tr.bbox
            if pred_dt > 0.0:
                dx = float(getattr(tr, "vx", 0.0)) * float(pred_dt)
                dy = float(getattr(tr, "vy", 0.0)) * float(pred_dt)
                pred_box = _clamp_bbox(_shift_bbox(pred_box, dx, dy), w=w, h=h)

            smoothed = _smooth_bbox(
                pred_box,
                det_box,
                alpha=float(self._bbox_smooth_alpha),
            )
            smoothed = _clamp_bbox(smoothed, w=w, h=h)

            prev_ts = float(tr.last_seen_ts)
            dt_det = ts - prev_ts
            new_cx, new_cy = _bbox_center(smoothed)
            if dt_det > 1e-3:
                obs_vx = float(new_cx - float(getattr(tr, "last_cx", new_cx))) / float(dt_det)
                obs_vy = float(new_cy - float(getattr(tr, "last_cy", new_cy))) / float(dt_det)
                speed = float(math.hypot(obs_vx, obs_vy))
                if speed > self._max_speed_px_s:
                    scale = self._max_speed_px_s / (speed + 1e-6)
                    obs_vx *= scale
                    obs_vy *= scale
                tr.vx = (1.0 - self._vel_alpha) * float(getattr(tr, "vx", 0.0)) + self._vel_alpha * obs_vx
                tr.vy = (1.0 - self._vel_alpha) * float(getattr(tr, "vy", 0.0)) + self._vel_alpha * obs_vy

            tr.bbox = smoothed
            tr.last_cx = float(new_cx)
            tr.last_cy = float(new_cy)
            tr.last_update_ts = float(ts)
            tr.last_seen_ts = float(ts)
            tr.hits = int(getattr(tr, "hits", 0) or 0) + 1
            tr.conf = float(conf)
            tr.misses = 0
            
            if mask_poly is not None:
                tr.mask_polygon = mask_poly
            elif tr.mask_polygon is not None and dt_det > 1e-3:
                # Retain old mask but shift it according to observed center movement
                dx_obs = new_cx - float(getattr(tr, "last_cx", new_cx))
                dy_obs = new_cy - float(getattr(tr, "last_cy", new_cy))
                tr.mask_polygon = [(int(p[0] + dx_obs), int(p[1] + dy_obs)) for p in tr.mask_polygon]

        effective_max_misses = int(self._max_misses)
        if self._avg_dt_s is not None and float(self._avg_dt_s) > 1e-3:
            required = int(math.ceil(float(self._max_lost_s) / float(self._avg_dt_s))) + 1
            effective_max_misses = max(effective_max_misses, required)

        dead: List[int] = []
        for tid, tr in self._tracks.items():
            if int(tid) in seen:
                continue

            tr.misses = int(getattr(tr, "misses", 0) or 0) + 1
            dt = ts - float(getattr(tr, "last_update_ts", tr.last_seen_ts))
            if dt > 0.0:
                dx = float(getattr(tr, "vx", 0.0)) * float(dt)
                dy = float(getattr(tr, "vy", 0.0)) * float(dt)
                tr.bbox = _clamp_bbox(_shift_bbox(tr.bbox, dx, dy), w=w, h=h)
                if tr.mask_polygon is not None:
                    tr.mask_polygon = [(int(p[0] + dx), int(p[1] + dy)) for p in tr.mask_polygon]
                tr.last_update_ts = float(ts)
                tr.vx = float(getattr(tr, "vx", 0.0)) * self._vel_decay
                tr.vy = float(getattr(tr, "vy", 0.0)) * self._vel_decay

            too_old = (ts - float(tr.last_seen_ts)) > float(self._max_lost_s)
            too_many_misses = int(tr.misses) > int(effective_max_misses)
            if too_old or too_many_misses:
                dead.append(int(tid))

        for tid in dead:
            self._tracks.pop(int(tid), None)

        return self.active_tracks(now=ts)

    def active_tracks(self, *, now: Optional[float] = None) -> Dict[int, PresenceTrack]:
        ts = time.time() if now is None else float(now)
        out: Dict[int, PresenceTrack] = {}
        for tid, tr in self._tracks.items():
            age = ts - float(getattr(tr, "last_seen_ts", ts))
            if age > float(self._active_hold_s):
                continue
            if int(getattr(tr, "misses", 0) or 0) > int(self._max_misses):
                continue
            out[int(tid)] = tr
        return out

    def reset(self) -> None:
        with self._lock:
            self._tracks.clear()
            self._last_update_ts = None
            self._avg_dt_s = None
