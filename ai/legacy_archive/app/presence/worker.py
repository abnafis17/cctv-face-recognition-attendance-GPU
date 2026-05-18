from __future__ import annotations

import os
import threading
import time
from typing import Dict, Optional, Tuple

import cv2
from app.runtimes.camera_runtime import CameraRuntime

from .runtime import PresenceRuntime


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return float(default)


class PresenceWorker:
    """
    Background presence worker per camera:
    - reads latest frame from CameraRuntime
    - runs YOLO person detection + dwell tracking at capped ai_fps
    - when no person is present for a short window, drops to idle ai_fps
    - stores latest pre-encoded JPEG + stats
    """

    def __init__(self, camera_rt: CameraRuntime, presence_rt: PresenceRuntime) -> None:
        self.camera_rt = camera_rt
        self.presence_rt = presence_rt

        self._threads: Dict[str, threading.Thread] = {}
        self._running: Dict[str, bool] = {}
        self._locks: Dict[str, threading.Lock] = {}
        self._ai_fps: Dict[str, float] = {}
        self._no_person_since: Dict[str, Optional[float]] = {}

        self._idle_ai_fps = max(0.1, _env_float("PRESENCE_IDLE_AI_FPS", 1.0))
        self._idle_after_s = max(0.0, _env_float("PRESENCE_IDLE_AFTER_S", 2.0))

        self._latest_jpg: Dict[str, Tuple[bytes, float]] = {}
        self._latest_stats: Dict[str, Dict[str, object]] = {}
        self._last_error_log_ts: Dict[str, float] = {}
        self._last_error_msg: Dict[str, str] = {}
        self._error_log_interval_s = max(
            1.0, _env_float("PRESENCE_ERROR_LOG_INTERVAL_S", 10.0)
        )

    def start(self, camera_id: str, ai_fps: float = 8.0) -> bool:
        if self._running.get(camera_id):
            self._ai_fps[camera_id] = float(ai_fps)
            return False

        self._running[camera_id] = True
        self._ai_fps[camera_id] = float(ai_fps)
        # Unknown state at start: only idle after first inference reports no person.
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            self._no_person_since[camera_id] = None

        t = threading.Thread(target=self._loop, args=(camera_id,), daemon=True)
        self._threads[camera_id] = t
        t.start()
        return True

    def is_running(self, camera_id: str) -> bool:
        return bool(self._running.get(camera_id))

    def stop(self, camera_id: str) -> bool:
        was_running = bool(self._running.get(camera_id) or self._threads.get(camera_id))
        self._running[camera_id] = False
        t = self._threads.get(camera_id)
        join_timeout = max(0.0, _env_float("PRESENCE_WORKER_STOP_JOIN_TIMEOUT_S", 0.2))
        if t:
            t.join(timeout=join_timeout)

        self._threads.pop(camera_id, None)
        self._ai_fps.pop(camera_id, None)

        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            self._no_person_since.pop(camera_id, None)
            self._latest_jpg.pop(camera_id, None)
            self._latest_stats.pop(camera_id, None)
            self._last_error_log_ts.pop(camera_id, None)
            self._last_error_msg.pop(camera_id, None)

        self.presence_rt.reset_camera(camera_id)
        return was_running

    def stop_all(self) -> None:
        for camera_id in list(self._threads.keys()):
            try:
                self.stop(camera_id)
            except Exception:
                pass

    def get_latest_jpeg(self, camera_id: str) -> Optional[bytes]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            return None if item is None else item[0]

    def get_latest_jpeg_item(self, camera_id: str) -> Optional[Tuple[bytes, float]]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            item = self._latest_jpg.get(camera_id)
            return None if item is None else (item[0], float(item[1]))

    def get_latest_stats(self, camera_id: str) -> Optional[Dict[str, object]]:
        lock = self._locks.setdefault(camera_id, threading.Lock())
        with lock:
            return self._latest_stats.get(camera_id)

    def _loop(self, camera_id: str) -> None:
        last_t = 0.0

        while self._running.get(camera_id, False):
            now = time.time()
            base_ai_fps = max(0.5, float(self._ai_fps.get(camera_id, 8.0)))
            lock = self._locks.setdefault(camera_id, threading.Lock())
            with lock:
                no_person_since = self._no_person_since.get(camera_id)
            if (
                no_person_since is not None
                and (now - no_person_since) >= self._idle_after_s
            ):
                target_ai_fps = min(base_ai_fps, self._idle_ai_fps)
            else:
                target_ai_fps = base_ai_fps

            period = 1.0 / max(0.1, float(target_ai_fps))
            elapsed = now - last_t
            sleep_for = period - elapsed
            if sleep_for > 0:
                time.sleep(min(sleep_for, 0.05))
                continue
            last_t = now

            frame = self.camera_rt.get_frame(camera_id, copy=False)
            if frame is None:
                continue

            try:
                annotated, stats = self.presence_rt.process_frame(
                    frame, camera_id=camera_id
                )
            except Exception as e:
                err = str(e)
                now_err = time.time()
                with lock:
                    last_msg = self._last_error_msg.get(camera_id)
                    last_ts = float(self._last_error_log_ts.get(camera_id, 0.0))
                    should_log = (
                        err != last_msg
                        or (now_err - last_ts) >= self._error_log_interval_s
                    )
                    if should_log:
                        self._last_error_msg[camera_id] = err
                        self._last_error_log_ts[camera_id] = now_err
                if should_log:
                    print(f"[PRESENCE] process_frame failed cam={camera_id}: {e}")
                continue

            active_raw = stats.get("active_count")
            if active_raw is None:
                active_raw = stats.get("person_count")
            try:
                active_count = int(active_raw or 0)
            except (TypeError, ValueError):
                active_count = 0
            with lock:
                if active_count > 0:
                    self._no_person_since[camera_id] = None
                elif self._no_person_since.get(camera_id) is None:
                    self._no_person_since[camera_id] = time.time()

            ok, jpg = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 90]
            )
            if not ok:
                continue

            jpg_bytes = jpg.tobytes()

            with lock:
                self._latest_jpg[camera_id] = (jpg_bytes, time.time())
                self._latest_stats[camera_id] = stats
