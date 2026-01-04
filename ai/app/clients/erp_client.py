from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from .http_client import HttpClient


@dataclass
class ERPClientConfig:
    base_url: str
    prefix: str = "/api/v2"
    timeout_s: float = 10.0
    api_version: str = "2.0"


class ERPClient:
    def __init__(self, cfg: ERPClientConfig):
        # Best practice: x-api-version is its own header.
        # ERP curl shows it inside Content-Type; sending x-api-version separately works reliably.
        default_headers = {
            "accept": "*/*",
            "Content-Type": "application/json",
            "x-api-version": cfg.api_version,
        }

        self.http = HttpClient(
            base_url=cfg.base_url,
            prefix=cfg.prefix,
            timeout_s=cfg.timeout_s,
            default_headers=default_headers,
        )

    def manual_attendance(
        self, attendance_date: str, emp_id: str, in_time: str, in_location: str
    ) -> Any:
        payload: Dict[str, Any] = {
            "attendanceDate": attendance_date,  # "03/01/2026" (dd/mm/yyyy)
            "empId": emp_id,
            "inTime": in_time,  # "09:00:00"
            "inLocation": in_location,
        }
        return self.http.post("/Attendance/manual-attendance", payload)
