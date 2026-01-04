from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass
from typing import Optional, Callable

from ..clients.erp_client import ERPClient


@dataclass
class ERPPushJob:
    attendance_date: str
    emp_id: str
    in_time: str
    in_location: str


class ERPPushQueue:
    """
    Background queue so ERP call doesn't slow down recognition FPS.
    Includes retries.
    """

    def __init__(
        self,
        erp_client: ERPClient,
        maxsize: int = 2000,
        max_retries: int = 3,
        retry_sleep_s: float = 1.0,
        on_error: Optional[Callable[[Exception, ERPPushJob], None]] = None,
    ):
        self.erp = erp_client
        self.q: "queue.Queue[ERPPushJob]" = queue.Queue(maxsize=maxsize)
        self.max_retries = max_retries
        self.retry_sleep_s = retry_sleep_s
        self.on_error = on_error

        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)
        self._t.start()

    def enqueue(self, job: ERPPushJob) -> bool:
        try:
            self.q.put_nowait(job)
            return True
        except queue.Full:
            return False

    def _run(self):
        while not self._stop.is_set():
            try:
                job = self.q.get(timeout=0.5)
            except queue.Empty:
                continue

            last_err: Optional[Exception] = None
            for _ in range(self.max_retries):
                try:
                    self.erp.manual_attendance(
                        job.attendance_date, job.emp_id, job.in_time, job.in_location
                    )
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(self.retry_sleep_s)

            if last_err and self.on_error:
                self.on_error(last_err, job)

            self.q.task_done()
