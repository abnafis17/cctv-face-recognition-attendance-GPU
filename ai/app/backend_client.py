from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
import requests
from dotenv import load_dotenv

# Load ai/.env automatically
load_dotenv()


class BackendClient:
    """
    Backend API client (Node/Express).
    Uses BACKEND_BASE_URL from ai/.env.
    Fallback: http://127.0.0.1:3001
    """

    def __init__(self, base_url: Optional[str] = None, timeout_s: float = 10.0):
        resolved = (base_url or os.getenv("BACKEND_BASE_URL") or "http://127.0.0.1:3001").rstrip("/")
        self.base_url = resolved
        self.timeout_s = timeout_s

    def _get(self, path: str) -> Any:
        try:
            r = requests.get(f"{self.base_url}{path}", timeout=self.timeout_s)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.ConnectionError as e:
            raise RuntimeError(
                f"Backend connection failed: {self.base_url}{path}. "
                f"Is backend running? Check BACKEND_BASE_URL in ai/.env"
            ) from e
        except requests.exceptions.HTTPError as e:
            detail: Any
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise RuntimeError(f"Backend GET {path} failed: {detail}") from e

    def _post(self, path: str, payload: Dict[str, Any]) -> Any:
        try:
            r = requests.post(f"{self.base_url}{path}", json=payload, timeout=self.timeout_s)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.ConnectionError as e:
            raise RuntimeError(
                f"Backend connection failed: {self.base_url}{path}. "
                f"Is backend running? Check BACKEND_BASE_URL in ai/.env"
            ) from e
        except requests.exceptions.HTTPError as e:
            detail: Any
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise RuntimeError(f"Backend POST {path} failed: {detail}") from e

    # ---- Health
    def health(self) -> Dict[str, Any]:
        return self._get("/health")

    # ---- Employees
    def upsert_employee(self, name: str, employee_id: Optional[str] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"name": name}
        if employee_id:
            payload["id"] = employee_id
        return self._post("/api/employees", payload)

    def list_employees(self) -> List[Dict[str, Any]]:
        return self._get("/api/employees")

    # ---- Gallery templates
    def list_templates(self) -> List[Dict[str, Any]]:
        return self._get("/api/gallery/templates")

    def upsert_template(self, employee_id: str, angle: str, embedding: List[float], model_name: str = "unknown") -> Dict[str, Any]:
        return self._post("/api/gallery/templates", {
            "employeeId": employee_id,
            "angle": angle,
            "embedding": embedding,
            "modelName": model_name,
        })

    # ---- Attendance
    def create_attendance(
        self,
        employee_id: str,
        timestamp: str,
        camera_id: Optional[str] = None,
        confidence: Optional[float] = None,
        snapshot_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._post("/api/attendance", {
            "employeeId": employee_id,
            "timestamp": timestamp,
            "cameraId": camera_id,
            "confidence": confidence,
            "snapshotPath": snapshot_path,
        })
