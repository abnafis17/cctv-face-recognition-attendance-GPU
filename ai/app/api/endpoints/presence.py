from typing import Optional
from fastapi import APIRouter, Header, Query
from fastapi.responses import StreamingResponse

from app.core.config import DEFAULT_COMPANY_ID
from app.core.logging import logger
from app.services.stream_manager import (
    get_stream_for_camera,
    get_stream_by_id,
)
from app.api.endpoints.camera import mjpeg_presence_generator

router = APIRouter()

@router.api_route("/presence/start", methods=["GET", "POST"])
def presence_start(
    camera_id: str,
    rtsp_url: Optional[str] = None,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    logger.info(f"Received presence start request: {camera_id} -> {rtsp_url}")

    stream = get_stream_for_camera(camera_id, comp_id, rtsp_url=rtsp_url, camera_name=camera_name)
    stream.presence_enabled = True

    return {
        "ok": True,
        "startedNow": True,
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "camera_name": camera_name or camera_id,
        "running": True,
    }

@router.api_route("/presence/stop", methods=["GET", "POST"])
def presence_stop(
    camera_id: str,
):
    logger.info(f"Received presence stop request: {camera_id}")
    stream = get_stream_by_id(camera_id)
    if stream:
        stream.presence_enabled = False
    return {
        "ok": True,
        "stoppedNow": True,
        "camera_id": camera_id,
    }

@router.get("/presence/status/{camera_id}")
def presence_status(
    camera_id: str,
    auto_start: bool = Query(default=False, alias="autoStart"),
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    stream = get_stream_by_id(camera_id)
    if not stream and auto_start:
        stream = get_stream_for_camera(camera_id, comp_id)
        if stream:
            stream.presence_enabled = True

    is_running = bool(stream and not stream.stopped and getattr(stream, "presence_enabled", False))
    return {
        "ok": True,
        "running": is_running,
        "stats": {
            "camera_id": camera_id,
            "presence_enabled": getattr(stream, "presence_enabled", False) if stream else False,
        },
    }

@router.get("/presence/stream/{camera_id}")
def presence_stream(
    camera_id: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    return StreamingResponse(
        mjpeg_presence_generator(camera_id, comp_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )

@router.get("/presence/stream/{camera_id}/{camera_name}")
def presence_stream_with_name(
    camera_id: str,
    camera_name: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    return StreamingResponse(
        mjpeg_presence_generator(camera_id, comp_id, camera_name=camera_name),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )
