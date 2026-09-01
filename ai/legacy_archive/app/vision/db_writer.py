from __future__ import annotations

from dataclasses import dataclass
import queue
import threading
import time
from typing import Callable, Optional


@dataclass(slots=True)
class AttendanceWriteJob:
    company_id: Optional[str]
    camera_id: str
    camera_name: str
    employee_id: str
    name: str
    similarity: float
    timestamp_iso: str


class DBWriter:
    def __init__(
        self,
        *,
        write_fn: Callable[[AttendanceWriteJob], None],
        max_queue: int = 1000,
    ):
        self._write_fn = write_fn
        self._q: "queue.Queue[Optional[AttendanceWriteJob]]" = queue.Queue(
            maxsize=max(1, int(max_queue))
        )
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._loop, name="attendance-db-writer", daemon=True)
        self._t.start()

    def enqueue(self, job: AttendanceWriteJob) -> bool:
        if self._stop.is_set():
            return False
        try:
            self._q.put_nowait(job)
            return True
        except queue.Full:
            return False

    def stop(self, *, drain_timeout_s: float = 2.0) -> None:
        self._stop.set()

        end = time.time() + float(max(0.0, drain_timeout_s))
        while time.time() < end:
            if self._q.empty():
                break
            time.sleep(0.02)

        try:
            self._q.put_nowait(None)
        except queue.Full:
            pass
        self._t.join(timeout=2.0)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                job = self._q.get(timeout=0.25)
            except queue.Empty:
                continue
            if job is None:
                return
            try:
                self._write_fn(job)
            except Exception as e:
                print(f"[DBWriter] write failed: {e} | job={job}")

