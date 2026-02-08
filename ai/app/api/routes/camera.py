from __future__ import annotations

from typing import Optional

import cv2
from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response, StreamingResponse

from app.api.deps import get_container
from app.core.settings import env_float, infer_company_id_from_camera_id, normalize_stream_type
from app.streams.mjpeg import mjpeg_generator_raw, mjpeg_generator_recognition, mjpeg_generator_enroll2_auto

router = APIRouter()


@router.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(camera_id: str, rtsp_url: str, container=Depends(get_container)):
    started_now = container.camera_rt.start(camera_id, rtsp_url)
    return {
        "ok": True,
        "startedNow": bool(started_now),
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
    }


@router.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(camera_id: str, container=Depends(get_container)):
    # Stop recognition worker first to avoid read/close races
    container.rec_worker.stop(camera_id)

    # Stop camera grabber
    stopped_now = container.camera_rt.stop(camera_id)

    return {"ok": True, "stoppedNow": bool(stopped_now), "camera_id": camera_id}


@router.get("/camera/snapshot/{camera_id}")
def camera_snapshot(camera_id: str, container=Depends(get_container)):
    frame = container.camera_rt.get_frame(camera_id)
    if frame is None:
        return Response(content=b"No frame yet", status_code=503)

    ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return Response(content=b"Encode failed", status_code=500)

    return Response(
        content=jpg.tobytes(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


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
