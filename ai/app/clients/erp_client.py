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
        if cfg.url_type not in ("attendance_two", "attendance_two_log", "attendance_live"):
            default_headers["x-api-version"] = cfg.api_version

        self.url_type = cfg.url_type
        base_url = cfg.base_url
        if "pakizaknit.pakizasoftware.com" in str(base_url):
            base_url = "http://pakizaknit.pakizasoftware.com:9070"
        self.http = HttpClient(
            base_url=base_url,
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
        if self.url_type in ("attendance_two", "attendance_two_log", "attendance_live"):
            try:
                parts = attendance_date.split("/")
                formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            except Exception:
                formatted_date = attendance_date

            status_val = "present" if self.url_type in ("attendance_two_log", "attendance_live") else "Present"
            payload: Dict[str, Any] = {
                "employee_id": emp_id,
                "attendance_date": formatted_date,
                "time": in_time,
                "status": status_val,
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
                try:
                    data = res.json()
                except Exception:
                    data = res.text or {"status": res.status_code}

                if res.status_code in (200, 201):
                    return data
                return {"error": f"HTTP {res.status_code}", "detail": data}
            except requests.RequestException as e:
                if res is not None:
                    try:
                        detail: Any = res.json()
                    except Exception:
                        detail = res.text
                    return {"error": f"HTTP {res.status_code}", "detail": detail}
                return {"error": f"Request failed: {e}"}

        try:
            return self.http.post(endpoint, payload)
        except Exception as e:
            return {"error": str(e)}


def write_erp_log(message: str):
    try:
        # Datewise file inside logs/erp/YYYY-MM-DD.log (matching door log format)
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../logs/erp")
        os.makedirs(log_dir, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        log_path = os.path.join(log_dir, f"{date_str}.log")
        timestamp = datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception as e:
        print(f"Failed to write to ERP log file: {e}")


def check_erp_success(response: Any) -> tuple[bool, str]:
    if response is None:
        return False, "No response"

    if isinstance(response, dict):
        # 1. Check for status string or int
        for key in ["status", "Status", "STATUS"]:
            if key in response:
                val = response[key]
                if isinstance(val, (int, float)):
                    if int(val) in (200, 201, 0):
                        return True, "SUCCESS"
                    else:
                        return False, str(val)
                elif isinstance(val, str):
                    s_val = val.strip().lower()
                    if s_val in ("success", "200", "201", "0", "ok", "true"):
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
                    if val.lower() in ("true", "1", "success", "ok", "200", "201"):
                        return True, "SUCCESS"
                    else:
                        msg = response.get("message") or response.get("msg") or response.get("error") or val
                        return False, str(msg)

        return True, "SUCCESS"

    elif isinstance(response, str):
        val = response.strip()
        if val.lower() in ("success", "200", "201", "ok", "true"):
            return True, "SUCCESS"
        return False, val

    return True, "SUCCESS"



