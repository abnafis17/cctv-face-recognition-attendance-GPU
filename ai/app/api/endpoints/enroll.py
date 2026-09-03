from typing import Optional
from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.core.config import DEFAULT_COMPANY_ID
from app.services.model_manager import get_enroller2_auto
from app.services.stream import camera_rt_compat

router = APIRouter()

class Enroll2AutoStartPayload(BaseModel):
    employeeId: str
    name: str
    cameraId: str
    reEnroll: Optional[bool] = False

@router.post("/enroll2/auto/session/start")
def enroll2_auto_session_start(
    payload: Enroll2AutoStartPayload,
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    employee_id = payload.employeeId.strip()
    name = payload.name.strip()
    camera_id = payload.cameraId.strip()
    re_enroll = bool(payload.reEnroll)

    if not employee_id or not name or not camera_id:
        return {"ok": False, "error": "employeeId, name, cameraId are required"}

    enroller = get_enroller2_auto(camera_rt_compat)
    enroller.client.set_company_id(x_company_id or DEFAULT_COMPANY_ID)

    s = enroller.start(
        employee_id=employee_id,
        name=name,
        camera_id=camera_id,
        company_id=x_company_id,
        re_enroll=re_enroll,
    )
    return {"ok": True, "session": s.__dict__}

@router.get("/enroll2/auto/session/status")
def enroll2_auto_session_status():
    enroller = get_enroller2_auto(camera_rt_compat)
    s = enroller.status()
    return {"ok": True, "session": (s.__dict__ if s else None)}

@router.post("/enroll2/auto/session/stop")
def enroll2_auto_session_stop():
    enroller = get_enroller2_auto(camera_rt_compat)
    stopped = enroller.stop()
    s = enroller.status()
    return {"ok": True, "stopped": stopped, "session": (s.__dict__ if s else None)}
