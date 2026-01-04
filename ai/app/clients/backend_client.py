from __future__ import annotations

from typing import Any, Dict, List, Optional
import os

from dotenv import load_dotenv

from .http_client import HttpClient

# Load ai/.env automatically
load_dotenv()


class BackendClient:
    """
    Backend API client (Node/Express).
    Uses BACKEND_BASE_URL + BACKEND_API_PREFIX from ai/.env.

    Example:
      BACKEND_BASE_URL=http://127.0.0.1:3001
      BACKEND_API_PREFIX=/api/v1
    """

    def __init__(self, base_url: Optional[str] = None, timeout_s: float = 10.0):
        resolved = (
            base_url or os.getenv("BACKEND_BASE_URL") or "http://127.0.0.1:3001"
        ).rstrip("/")
        api_prefix = (os.getenv("BACKEND_API_PREFIX") or "/api/v1").strip()

        self.http = HttpClient(
            base_url=resolved,
            prefix=api_prefix,
            timeout_s=timeout_s,
        )

    # ---- Health
    def health(self) -> Dict[str, Any]:
        return self.http.get("/health")

    # ---- Employees
    def upsert_employee(
        self, name: str, employee_id: Optional[str] = None
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"name": name}
        if employee_id:
            payload["empId"] = employee_id
        return self.http.post("/employees", payload)

    def list_employees(self) -> List[Dict[str, Any]]:
        return self.http.get("/employees")

    # ---- Gallery templates
    def list_templates(self) -> List[Dict[str, Any]]:
        return self.http.get("/gallery/templates")

    def upsert_template(
        self,
        employee_id: str,
        angle: str,
        embedding: List[float],
        model_name: str = "unknown",
    ) -> Dict[str, Any]:
        return self.http.post(
            "/gallery/templates",
            {
                "employeeId": employee_id,
                "angle": angle,
                "embedding": embedding,
                "modelName": model_name,
            },
        )

    # ---- Attendance
    def create_attendance(
        self,
        employee_id: str,
        timestamp: str,
        camera_id: Optional[str] = None,
        confidence: Optional[float] = None,
        snapshot_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.http.post(
            "/attendance",
            {
                "employeeId": employee_id,
                "timestamp": timestamp,
                "cameraId": camera_id,
                "confidence": confidence,
                "snapshotPath": snapshot_path,
            },
        )

    # ✅ Enrollment v2 Auto uses SAME endpoint/table as v1
    def upsert_template_enroll2_auto(
        self,
        employee_id: str,
        angle: str,
        embedding: List[float],
        model_name: str = "insightface",
    ) -> Dict[str, Any]:
        return self.upsert_template(
            employee_id=employee_id,
            angle=angle,
            embedding=embedding,
            model_name=model_name,
        )

    # ---- Enrollment helpers (AI service compatibility)
    def save_employee_embeddings(
        self,
        employee_id: str,
        embeddings: Dict[str, Any],
        model_name: str = "insightface",
    ) -> Dict[str, Any]:
        """
        Compatibility helper used by auto-enrollment services.

        Accepts a mapping of {angle: embedding} where embedding can be:
          - list[float]
          - numpy array (has .tolist())

        Persists to the same backend endpoint as manual enrollment (/gallery/templates).
        """
        saved_angles: List[str] = []
        for angle, emb in (embeddings or {}).items():
            if emb is None:
                continue
            if hasattr(emb, "tolist"):
                emb_list = emb.tolist()
            else:
                emb_list = list(emb)
            self.upsert_template_enroll2_auto(
                employee_id=employee_id,
                angle=str(angle),
                embedding=[float(x) for x in emb_list],
                model_name=model_name,
            )
            saved_angles.append(str(angle))
        return {"ok": True, "saved_angles": saved_angles}

    # ---- Attendance
    def create_attendance(
        self,
        employee_id: str,
        timestamp: str,
        camera_id: Optional[str] = None,
        confidence: Optional[float] = None,
        snapshot_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.http.post(
            "/attendance",
            {
                "employeeId": employee_id,
                "timestamp": timestamp,
                "cameraId": camera_id,
                "confidence": confidence,
                "snapshotPath": snapshot_path,
            },
        )
