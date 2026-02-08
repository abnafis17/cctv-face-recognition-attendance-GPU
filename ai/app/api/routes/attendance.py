from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query

from app.api.deps import get_container

router = APIRouter()


@router.post("/attendance/enable")
def attendance_enable(camera_id: str, container=Depends(get_container)):
    container.attendance_rt.set_attendance_enabled(camera_id, True)
    return {"ok": True, "camera_id": camera_id, "enabled": True}


@router.post("/attendance/disable")
def attendance_disable(camera_id: str, container=Depends(get_container)):
    container.attendance_rt.set_attendance_enabled(camera_id, False)
    return {"ok": True, "camera_id": camera_id, "enabled": False}


@router.get("/attendance/enabled")
def attendance_enabled(camera_id: str, container=Depends(get_container)):
    return {
        "ok": True,
        "camera_id": camera_id,
        "enabled": container.attendance_rt.is_attendance_enabled(camera_id),
    }


@router.get("/attendance/voice-events")
def attendance_voice_events(
    after_seq: int = 0,
    limit: int = 50,
    wait_ms: int = Query(default=0, ge=0, le=300_000),
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    payload = container.attendance_rt.get_voice_events(
        company_id=resolved_company_id,
        after_seq=after_seq,
        limit=limit,
        wait_ms=wait_ms,
    )
    return {"ok": True, **payload}
