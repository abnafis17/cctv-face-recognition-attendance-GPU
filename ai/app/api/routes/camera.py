from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_container
from app.core.settings import (
    env_float,
    infer_company_id_from_camera_id,
    normalize_stream_type,
)
from app.streams.mjpeg import mjpeg_generator_raw, mjpeg_generator_recognition, mjpeg_generator_enroll2_auto

router = APIRouter()


@router.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(
    camera_id: str,
    rtsp_url: str,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("AI_FPS", 10.0)

    started_now = container.camera_rt.start(camera_id, rtsp_url)
    cam_name = str(camera_name or camera_id)

    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    if not resolved_company_id:
        resolved_company_id = infer_company_id_from_camera_id(camera_id)
    if resolved_company_id:
        container.attendance_rt.set_company_for_camera(camera_id, resolved_company_id)

    # Server-managed default: process attendance continuously while camera is running.
    container.attendance_rt.set_stream_type(camera_id, "attendance")
    container.attendance_rt.set_attendance_enabled(camera_id, True)
    container.rec_worker.start(camera_id, cam_name, ai_fps=float(ai_fps))

    return {
        "ok": True,
        "startedNow": bool(started_now),
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "camera_name": cam_name,
        "recognition_running": True,
        "attendance_enabled": True,
    }


@router.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(camera_id: str, container=Depends(get_container)):
    # Stop recognition worker first to avoid read/close races
    container.rec_worker.stop(camera_id)

    # Stop camera grabber
    stopped_now = container.camera_rt.stop(camera_id)

    return {"ok": True, "stoppedNow": bool(stopped_now), "camera_id": camera_id}


@router.get("/camera/stream/{camera_id}")
def camera_stream(camera_id: str, container=Depends(get_container)):
    return StreamingResponse(
        mjpeg_generator_raw(container, camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )


@router.get("/camera/recognition/stream/{camera_id}/{camera_name}")
def camera_recognition_stream(
    camera_id: str,
    camera_name: str,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    stream_type: Optional[str] = Query(default=None, alias="type"),
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("AI_FPS", 10.0)

    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    if not resolved_company_id:
        resolved_company_id = infer_company_id_from_camera_id(camera_id)
    if resolved_company_id:
        container.attendance_rt.set_company_for_camera(camera_id, resolved_company_id)

    resolved_stream_type = normalize_stream_type(stream_type)

    return StreamingResponse(
        mjpeg_generator_recognition(
            container,
            camera_id=camera_id,
            camera_name=camera_name,
            ai_fps=float(ai_fps),
            stream_type=resolved_stream_type,
        ),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )


@router.get("/camera/enroll2/auto/stream/{camera_id}")
def camera_enroll2_auto_stream(camera_id: str, container=Depends(get_container)):
    return StreamingResponse(
        mjpeg_generator_enroll2_auto(container, camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )
