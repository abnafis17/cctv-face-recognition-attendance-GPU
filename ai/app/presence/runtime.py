from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.core.settings import resolve_ai_path
from app.utils import now_iso

from .detector import PresenceDetector
from .tracker import PresenceTracker, PresenceTrack, PresenceExit


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, str(default))).strip()))
    except Exception:
        return default


def _env_str(name: str, default: str) -> str:
    v = str(os.getenv(name, default)).strip()
    return v or default


def _env_bool(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _format_dwell(seconds: float) -> str:
    total = max(0, int(seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


class PresenceRuntime:
    def __init__(self) -> None:
        self._lock = threading.Lock()

        # Presence mode should detect full human bodies (including back view), not faces.
        configured_mode = _env_str("PRESENCE_DET_MODE", "person").lower()
        if configured_mode in {"face", "faces", "face-only"}:
            configured_mode = "person"
        self._detector_mode = configured_mode
        self._allow_hog_fallback = _env_bool("PRESENCE_ALLOW_HOG_FALLBACK", False)

        model_path = resolve_ai_path(_env_str("PRESENCE_YOLO_MODEL", "yolov8n.pt"))
        conf = _env_float("PRESENCE_CONF", 0.25)
        iou = _env_float("PRESENCE_IOU", 0.45)
        imgsz = _env_int("PRESENCE_IMG_SIZE", 640)
        device = _env_str("PRESENCE_DEVICE", "cpu")
        max_det = _env_int("PRESENCE_MAX_DET", 100)

        face_model = _env_str("PRESENCE_FACE_MODEL", "buffalo_m")
        face_det_size = _env_int("PRESENCE_FACE_DET_SIZE", 640)
        face_min_size = _env_int("PRESENCE_FACE_MIN_SIZE", 30)
        face_min_score = _env_float("PRESENCE_FACE_MIN_SCORE", 0.35)

        self._match_iou = _env_float("PRESENCE_MATCH_IOU", 0.30)
        self._max_lost_s = _env_float("PRESENCE_MAX_LOST_S", 2.0)
        self._min_hits = _env_int("PRESENCE_MIN_HITS", 1)
        self._recent_exit_limit = _env_int("PRESENCE_EXIT_LIMIT", 50)
        self._match_center_ratio = _env_float("PRESENCE_MATCH_CENTER_RATIO", 0.70)
        self._reacquire_center_ratio = _env_float(
            "PRESENCE_REACQUIRE_CENTER_RATIO", 1.10
        )
        self._bbox_smooth_alpha = _env_float("PRESENCE_BBOX_SMOOTH_ALPHA", 0.75)
        self._det_nms_iou = _env_float("PRESENCE_DET_NMS_IOU", 0.65)
        self._active_hold_s = _env_float("PRESENCE_ACTIVE_HOLD_S", 0.60)
        self._max_misses = _env_int("PRESENCE_MAX_MISSES", 8)

        self._detector_cfg = {
            "yolo_cfg": {
                "model_path": model_path,
                "conf": conf,
                "iou": iou,
                "imgsz": imgsz,
                "device": device,
                "max_det": max_det,
            },
            "face_cfg": {
                "model_name": face_model,
                "det_size": face_det_size,
                "min_face_size": face_min_size,
                "min_det_score": face_min_score,
                "use_gpu": False,
            },
        }
        self._detector: Optional[PresenceDetector] = None

        self._trackers: Dict[str, PresenceTracker] = {}
        self._latest_stats: Dict[str, Dict[str, Any]] = {}

    def _get_tracker(self, camera_id: str) -> PresenceTracker:
        with self._lock:
            tr = self._trackers.get(camera_id)
            if tr is None:
                tr = PresenceTracker(
                    match_iou=self._match_iou,
                    max_lost_s=self._max_lost_s,
                    min_hits=self._min_hits,
                    max_events=self._recent_exit_limit,
                    match_center_ratio=self._match_center_ratio,
                    reacquire_center_ratio=self._reacquire_center_ratio,
                    bbox_smooth_alpha=self._bbox_smooth_alpha,
                    det_nms_iou=self._det_nms_iou,
                    active_hold_s=self._active_hold_s,
                    max_misses=self._max_misses,
                )
                self._trackers[camera_id] = tr
        return tr

    def _get_detector(self) -> PresenceDetector:
        if self._detector is not None:
            return self._detector
        with self._lock:
            if self._detector is None:
                self._detector = PresenceDetector(
                    mode=self._detector_mode,
                    allow_hog_fallback=self._allow_hog_fallback,
                    **self._detector_cfg,
                )
        return self._detector

    def reset_camera(self, camera_id: str) -> None:
        with self._lock:
            tr = self._trackers.pop(camera_id, None)
            if tr is not None:
                tr.reset()
            self._latest_stats.pop(camera_id, None)

    def reset_all(self) -> None:
        with self._lock:
            cams = list(self._trackers.keys())
        for cid in cams:
            self.reset_camera(cid)

    def get_latest_stats(self, camera_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._latest_stats.get(camera_id)

    def process_frame(self, frame_bgr: np.ndarray, camera_id: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        cid = str(camera_id)
        now = time.time()

        detector = self._get_detector()
        detections = detector.detect(frame_bgr)
        tracker = self._get_tracker(cid)
        tracker.update(detections, now=now, frame_shape=frame_bgr.shape)

        active = tracker.active_tracks(now=now)
        exits = tracker.recent_exits(limit=self._recent_exit_limit)

        annotated = self._draw(frame_bgr, active, now)

        stats = self._build_stats(cid, active, exits, now)
        with self._lock:
            self._latest_stats[cid] = stats

        return annotated, stats

    def _draw(self, frame_bgr: np.ndarray, tracks: List[PresenceTrack], now: float) -> np.ndarray:
        annotated = frame_bgr.copy()
        hud_color = (255, 255, 255)
        cv2.putText(
            annotated,
            f"people={len(tracks)}",
            (12, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            hud_color,
            2,
            cv2.LINE_AA,
        )

        h, w = annotated.shape[:2]

        for tr in tracks:
            x1, y1, x2, y2 = [int(v) for v in tr.bbox]

            dwell = tr.dwell_seconds(now)
            label = _format_dwell(dwell)
            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
            )
            box_h = max(1, y2 - y1)
            cx = int((x1 + x2) * 0.5)
            # Head anchor for person boxes: place timer around upper body/head area.
            head_offset = min(24, max(10, int(0.08 * box_h)))
            baseline_y = y1 + head_offset
            x = int(max(0, min(w - tw - 1, cx - tw // 2)))
            y = int(max(th + 2, min(h - 2, baseline_y)))
            cv2.putText(
                annotated,
                label,
                (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 0),
                3,
                cv2.LINE_AA,
            )
            cv2.putText(
                annotated,
                label,
                (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

        return annotated

    def _build_stats(
        self,
        camera_id: str,
        tracks: List[PresenceTrack],
        exits: List[PresenceExit],
        now: float,
    ) -> Dict[str, Any]:
        active_tracks: List[Dict[str, Any]] = []
        for tr in tracks:
            active_tracks.append(
                {
                    "track_id": int(tr.track_id),
                    "bbox": [int(v) for v in tr.bbox],
                    "first_seen_ts": float(tr.first_seen_ts),
                    "last_seen_ts": float(tr.last_seen_ts),
                    "dwell_s": round(tr.dwell_seconds(now), 2),
                    "confidence": round(float(tr.conf), 3),
                }
            )

        recent_exits: List[Dict[str, Any]] = []
        for ex in exits:
            recent_exits.append(
                {
                    "track_id": int(ex.track_id),
                    "first_seen_ts": float(ex.first_seen_ts),
                    "last_seen_ts": float(ex.last_seen_ts),
                    "dwell_s": round(float(ex.dwell_s), 2),
                }
            )

        return {
            "camera_id": str(camera_id),
            "ts": now_iso(),
            "active_count": int(len(tracks)),
            "active_tracks": active_tracks,
            "recent_exits": recent_exits,
        }
