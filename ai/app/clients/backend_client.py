from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
from urllib.parse import urlencode

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

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_s: float = 10.0,
        company_id: Optional[str] = None,
    ):
        try:
            timeout_s = float(os.getenv("BACKEND_TIMEOUT_S", str(timeout_s)))
        except Exception:
            pass

        resolved = (
            base_url or os.getenv("BACKEND_BASE_URL") or "http://127.0.0.1:3001"
        ).rstrip("/")
        api_prefix = (os.getenv("BACKEND_API_PREFIX") or "/api/v1").strip()

        company_id = company_id or os.getenv("BACKEND_COMPANY_ID")
        default_headers = {"X-Company-Id": company_id.strip()} if company_id else None

        self.http = HttpClient(
            base_url=resolved,
            prefix=api_prefix,
            timeout_s=timeout_s,
            default_headers=default_headers,
        )
        self._company_id = company_id.strip() if company_id else None

    def set_company_id(self, company_id: Optional[str]) -> None:
        cid = str(company_id or "").strip()
        if not cid:
            return
        self._company_id = cid
        self.http.set_default_headers({"X-Company-Id": cid})

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

    # ---- Cameras
    def list_cameras(
        self,
        *,
        include_virtual: bool = False,
        task: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, str] = {}
        if include_virtual:
            query["includeVirtual"] = "1"
        if task and str(task).strip():
            query["task"] = str(task).strip()

        path = "/cameras"
        if query:
            path = f"{path}?{urlencode(query)}"
        return self.http.get(path)

    # ---- Camera authorized employees
    def get_camera_authorized_employees(self, camera_id: str) -> Dict[str, Any]:
        cid = str(camera_id or "").strip()
        if not cid:
            return {"authorizedEmployeePublicIds": []}
        return self.http.get(f"/cameras/{cid}/authorized-employees")

    def get_camera_bounding_boxes(self, camera_id: str) -> Dict[str, Any]:
        cid = str(camera_id or "").strip()
        if not cid:
            return {"boxes": []}
        return self.http.get(f"/cameras/{cid}/bounding-boxes")

    def create_bounding_box_tracking_event(
        self,
        *,
        camera_id: str,
        bounding_box_id: str,
        employee_id: str,
        event_type: str,
        occurred_at: str,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        cid = str(camera_id or "").strip()
        if not cid:
            return {"ok": False, "error": "camera_id is required"}

        payload: Dict[str, Any] = {
            "boundingBoxId": str(bounding_box_id),
            "employeeId": str(employee_id),
            "eventType": str(event_type),
            "occurredAt": str(occurred_at),
            "confidence": confidence,
        }
        return self.http.post(f"/cameras/{cid}/bounding-box-tracking/events", payload)

    # ---- Company settings
    def get_relay_settings(self, url_type: Optional[str] = None) -> Dict[str, Any]:
        query: Dict[str, str] = {}
        if url_type and str(url_type).strip():
            query["url_type"] = str(url_type).strip()

        path = "/settings/relay"
        if query:
            path = f"{path}?{urlencode(query)}"
        return self.http.get(path)

    def list_relay_settings(self) -> List[Dict[str, Any]]:
        return self.http.get("/settings/relay?all=true")

    def get_erp_settings(self, url_type: Optional[str] = None) -> Dict[str, Any]:
        query: Dict[str, str] = {}
        if url_type and str(url_type).strip():
            query["url_type"] = str(url_type).strip()

        path = "/settings/erp"
        if query:
            path = f"{path}?{urlencode(query)}"
        return self.http.get(path)

    def list_erp_settings(self) -> List[Dict[str, Any]]:
        return self.http.get("/settings/erp?all=true")

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

    def replace_templates(
        self,
        employee_id: str,
        templates: Dict[str, List[float]],
        model_name: str = "insightface",
    ) -> Dict[str, Any]:
        return self.http.post(
            "/gallery/templates/replace",
            {
                "employeeId": employee_id,
                "templates": templates,
                "modelName": model_name,
            },
        )

    # ---- Enrollment helpers (AI service compatibility)
    def save_employee_embeddings(
        self,
        employee_id: str,
        embeddings: Dict[str, Any],
        model_name: str = "insightface",
        replace: bool = True,
    ) -> Dict[str, Any]:
        """
        Compatibility helper used by auto-enrollment services.

        Accepts a mapping of {angle: embedding} where embedding can be:
          - list[float]
          - numpy array (has .tolist())

        When replace=True (default), atomically wipes all previous templates
        for this employee and saves only the new template set.
        """
        payload_templates: Dict[str, List[float]] = {}
        for angle, emb in (embeddings or {}).items():
            if emb is None:
                continue
            if hasattr(emb, "tolist"):
                emb_list = emb.tolist()
            else:
                emb_list = list(emb)
            payload_templates[str(angle)] = [float(x) for x in emb_list]

        if not payload_templates:
            return {"ok": False, "error": "No valid embeddings to save"}

        if replace:
            try:
                res = self.replace_templates(
                    employee_id=employee_id,
                    templates=payload_templates,
                    model_name=model_name,
                )
                if isinstance(res, dict) and res.get("ok"):
                    return res
            except Exception as e:
                print(f"[BackendClient] replace_templates endpoint error: {e}")

        # Fallback to individual upserts with replace flag on first angle
        saved_angles: List[str] = []
        first = True
        for angle, emb_list in payload_templates.items():
            self.http.post(
                "/gallery/templates",
                {
                    "employeeId": employee_id,
                    "angle": str(angle),
                    "embedding": emb_list,
                    "modelName": model_name,
                    "replace": bool(replace and first),
                },
            )
            first = False
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
        event_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "employeeId": employee_id,
            "timestamp": timestamp,
            "cameraId": camera_id,
            "confidence": confidence,
            "snapshotPath": snapshot_path,
        }
        if event_type:
            payload["type"] = str(event_type)
        return self.http.post(
            "/attendance",
            payload,
        )

    def create_unknown_recognition(
        self,
        *,
        timestamp: str,
        camera_id: Optional[str] = None,
        camera_name: Optional[str] = None,
        confidence: Optional[float] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "timestamp": timestamp,
            "cameraId": camera_id,
            "cameraName": camera_name,
            "confidence": confidence,
        }
        if name is not None and str(name).strip():
            payload["name"] = str(name).strip()
        return self.http.post(
            "/unknown-recognitions",
            payload,
        )
