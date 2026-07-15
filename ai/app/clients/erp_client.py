from __future__ import annotations

import os
from datetime import datetime
from dataclasses import dataclass
from typing import Any, Dict, Optional
import requests

from .http_client import HttpClient


@dataclass
class ERPClientConfig:
    base_url: str
    prefix: str = ""
    timeout_s: float = 10.0
    api_version: str = "2.0"
    attendance_endpoint: str = "/Attendance/manual-attendance"
    url_type: str = "attendance"


def _is_http_url(value: str) -> bool:
    v = str(value or "").strip().lower()
    return v.startswith("http://") or v.startswith("https://")


class ERPClient:
    def __init__(self, cfg: ERPClientConfig):
        # Best practice: x-api-version is its own header.
        # ERP curl shows it inside Content-Type; sending x-api-version separately works reliably.
        default_headers = {
            "accept": "*/*",
            "Content-Type": "application/json",
        }
        if cfg.url_type != "attendance_two":
            default_headers["x-api-version"] = cfg.api_version

        self.url_type = cfg.url_type
        self.http = HttpClient(
            base_url=cfg.base_url,
            prefix=cfg.prefix,
            timeout_s=cfg.timeout_s,
            default_headers=default_headers,
        )
        endpoint = str(cfg.attendance_endpoint or "").strip()
        if endpoint and (not _is_http_url(endpoint)) and (not endpoint.startswith("/")):
            endpoint = f"/{endpoint}"
        self._attendance_endpoint = endpoint or "/Attendance/manual-attendance"

    def manual_attendance(
        self, attendance_date: str, emp_id: str, in_time: str, in_location: str
    ) -> Any:
        if self.url_type == "attendance_two":
            try:
                parts = attendance_date.split("/")
                formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            except Exception:
                formatted_date = attendance_date

            payload: Dict[str, Any] = {
                "employee_id": emp_id,
                "attendance_date": formatted_date,
                "time": in_time,
                "status": "Present",
                "source": in_location,
            }
        else:
            payload: Dict[str, Any] = {
                "attendanceDate": attendance_date,  # "03/01/2026" (dd/mm/yyyy)
                "empId": emp_id,
                "inTime": in_time,  # "09:00:00"
                "inLocation": in_location,
            }

        endpoint = str(self._attendance_endpoint)
        if _is_http_url(endpoint):
            res: requests.Response | None = None
            try:
                res = self.http.session.post(
                    endpoint, json=payload, timeout=self.http.timeout_s
                )
                res.raise_for_status()
                return res.json()
            except requests.RequestException as e:
                if res is not None:
                    try:
                        detail: Any = res.json()
                    except Exception:
                        detail = res.text
                    raise RuntimeError(
                        f"[ERPClient] {res.status_code} {endpoint} -> {detail}"
                    ) from e
                raise RuntimeError(f"[ERPClient] Request failed -> {endpoint}") from e

        return self.http.post(endpoint, payload)


def write_erp_log(message: str):
    try:
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../logs")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "erp-sync.log")
        timestamp = datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception as e:
        print(f"Failed to write to ERP log file: {e}")


def check_erp_success(response: Any) -> tuple[bool, str]:
    if response is None:
        return False, "No response"

    if isinstance(response, dict):
        # 1. Check for status string
        for key in ["status", "Status", "STATUS"]:
            if key in response:
                val = str(response[key]).strip()
                if val.lower() == "success":
                    return True, "SUCCESS"
                else:
                    return False, val

        # 2. Check for boolean success fields
        for key in ["success", "isSuccess", "ok", "Ok", "Success", "is_success"]:
            if key in response:
                val = response[key]
                if isinstance(val, bool):
                    if val:
                        return True, "SUCCESS"
                    else:
                        msg = response.get("message") or response.get("msg") or response.get("error") or "False"
                        return False, str(msg)
                elif isinstance(val, str):
                    if val.lower() in ("true", "1", "success", "ok"):
                        return True, "SUCCESS"
                    else:
                        msg = response.get("message") or response.get("msg") or response.get("error") or val
                        return False, str(msg)

        return True, "SUCCESS"

    elif isinstance(response, str):
        val = response.strip()
        if val.lower() == "success":
            return True, "SUCCESS"
        return False, val

    return True, "SUCCESS"



