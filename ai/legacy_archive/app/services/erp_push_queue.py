from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass
from typing import Optional, Callable

from ..clients.erp_client import ERPClient, write_erp_log, check_erp_success


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
            response_data = None
            for _ in range(self.max_retries):
                try:
                    response_data = self.erp.manual_attendance(
                        job.attendance_date, job.emp_id, job.in_time, job.in_location
                    )
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(self.retry_sleep_s)

            if last_err is None:
                is_success, erp_status = check_erp_success(response_data)
                try:
                    import json
                    resp_str = json.dumps(response_data)
                except Exception:
                    resp_str = str(response_data)

                if self.erp.url_type in ("attendance_two", "attendance_two_log"):
                    try:
                        parts = job.attendance_date.split("/")
                        formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                    except Exception:
                        formatted_date = job.attendance_date
                    status_val = "present" if self.erp.url_type == "attendance_two_log" else "Present"
                    payload_log = f"employee_id={job.emp_id} | attendance_date={formatted_date} | time={job.in_time} | status={status_val} | source={job.in_location}"
                else:
                    payload_log = f"empId={job.emp_id} | attendanceDate={job.attendance_date} | inTime={job.in_time} | inLocation={job.in_location}"

                if not is_success:
                    last_err = RuntimeError(f"ERP returned failure status: {erp_status}")
                    log_msg = f"PUSH REALTIME | type={self.erp.url_type} | {payload_log} | STATUS=FAILED | erp_status={erp_status} | erp_response={resp_str}"
                else:
                    log_msg = f"PUSH REALTIME | type={self.erp.url_type} | {payload_log} | STATUS=SUCCESS | erp_response={resp_str}"
            else:
                if self.erp.url_type in ("attendance_two", "attendance_two_log"):
                    try:
                        parts = job.attendance_date.split("/")
                        formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                    except Exception:
                        formatted_date = job.attendance_date
                    status_val = "present" if self.erp.url_type == "attendance_two_log" else "Present"
                    payload_log = f"employee_id={job.emp_id} | attendance_date={formatted_date} | time={job.in_time} | status={status_val} | source={job.in_location}"
                else:
                    payload_log = f"empId={job.emp_id} | attendanceDate={job.attendance_date} | inTime={job.in_time} | inLocation={job.in_location}"

                log_msg = f"PUSH REALTIME | type={self.erp.url_type} | {payload_log} | STATUS=FAILED | error={str(last_err)}"

            write_erp_log(log_msg)

            if last_err and self.on_error:
                self.on_error(last_err, job)

            self.q.task_done()

    def stop(self, timeout_s: float = 2.0) -> None:
        """
        Best-effort shutdown for the background worker thread.
        """
        self._stop.set()
        try:
            self._t.join(timeout=float(timeout_s))
        except Exception:
            pass
