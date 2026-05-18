from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from app.api.deps import get_container

router = APIRouter()


class Enroll2AutoStartPayload(BaseModel):
    employeeId: str
    name: str
    cameraId: str


@router.post("/enroll2/auto/session/start")
def enroll2_auto_session_start(
    payload: Enroll2AutoStartPayload,
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    employee_id = payload.employeeId.strip()
    name = payload.name.strip()
    camera_id = payload.cameraId.strip()

    if not employee_id or not name or not camera_id:
        return {"ok": False, "error": "employeeId, name, cameraId are required"}

    s = container.enroller2_auto.start(
        employee_id=employee_id,
        name=name,
        camera_id=camera_id,
        company_id=x_company_id,
    )
    return {"ok": True, "session": s.__dict__}


@router.get("/enroll2/auto/session/status")
def enroll2_auto_session_status(container=Depends(get_container)):
    s = container.enroller2_auto.status()
    return {"ok": True, "session": (s.__dict__ if s else None)}


@router.post("/enroll2/auto/session/stop")
def enroll2_auto_session_stop(container=Depends(get_container)):
    stopped = container.enroller2_auto.stop()
    s = container.enroller2_auto.status()
    return {"ok": True, "stopped": stopped, "session": (s.__dict__ if s else None)}
