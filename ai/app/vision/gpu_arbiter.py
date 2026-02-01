from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import threading
import time
from typing import Callable, Deque, Dict, List, Optional, Tuple

import numpy as np


@dataclass(slots=True)
class Detection:
    bbox: Tuple[int, int, int, int]
    kps: Optional[np.ndarray]
    det_score: float


@dataclass(slots=True)
class DetectionResult:
    seq: int
    ts: float
    detections: List[Detection]


@dataclass(slots=True)
class _CameraQueue:
    frames: Deque[Tuple[float, np.ndarray]] = field(default_factory=deque)
    dropped: int = 0


class GPUArbiter:
    """
    Round-robin GPU inference arbiter.

    - Per-camera bounded queues hold only the latest few frames.
    - Worker always processes the newest frame for a camera (drops backlog).
    - Cameras are served round-robin to avoid starvation.
    """

    def __init__(
        self,
        *,
        detect_fn: Callable[[np.ndarray], List[Detection]],
        queue_size: int = 3,
    ):
        self._detect_fn = detect_fn
        self._queue_size = max(1, int(queue_size))

        self._lock = threading.Lock()
        self._cv = threading.Condition(self._lock)
        self._stop = False

        self._queues: Dict[str, _CameraQueue] = {}
        self._pending_rr: Deque[str] = deque()
        self._pending_set: set[str] = set()

        self._results: Dict[str, DetectionResult] = {}
        self._seq: Dict[str, int] = {}

        self._thread = threading.Thread(target=self._loop, name="gpu-arbiter", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        with self._cv:
            self._stop = True
            self._cv.notify_all()
        self._thread.join(timeout=2.0)

    def submit(self, camera_id: str, frame_bgr: np.ndarray, *, ts: Optional[float] = None) -> None:
        cid = str(camera_id)
        ts = time.time() if ts is None else float(ts)

        with self._cv:
            q = self._queues.setdefault(cid, _CameraQueue())
            while len(q.frames) >= self._queue_size:
                q.frames.popleft()
                q.dropped += 1
            q.frames.append((ts, frame_bgr))

            if cid not in self._pending_set:
                self._pending_set.add(cid)
                self._pending_rr.append(cid)
            self._cv.notify_all()

    def get_latest_result(self, camera_id: str) -> Optional[DetectionResult]:
        cid = str(camera_id)
        with self._lock:
            return self._results.get(cid)

    def queue_stats(self, camera_id: str) -> Tuple[int, int]:
        cid = str(camera_id)
        with self._lock:
            q = self._queues.get(cid)
            if q is None:
                return 0, 0
            return len(q.frames), int(q.dropped)

    def _loop(self) -> None:
        while True:
            with self._cv:
                while not self._stop and not self._pending_rr:
                    self._cv.wait(timeout=0.25)
                if self._stop:
                    return

                cid = self._pending_rr.popleft()
                self._pending_set.discard(cid)

                q = self._queues.get(cid)
                if q is None or not q.frames:
                    continue

                ts, frame = q.frames.pop()
                dropped_extra = len(q.frames)
                if dropped_extra:
                    q.dropped += dropped_extra
                q.frames.clear()

            try:
                dets = self._detect_fn(frame)
            except Exception as e:
                print(f"[GPUArbiter] detect failed cid={cid}: {e}")
                dets = []

            with self._cv:
                seq = int(self._seq.get(cid, 0) + 1)
                self._seq[cid] = seq
                self._results[cid] = DetectionResult(seq=seq, ts=ts, detections=dets)

                q = self._queues.get(cid)
                if q is not None and q.frames and cid not in self._pending_set:
                    self._pending_set.add(cid)
                    self._pending_rr.append(cid)

