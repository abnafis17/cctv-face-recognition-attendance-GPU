from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_container
from app.core.settings import env_float, infer_company_id_from_camera_id
from app.streams.mjpeg import mjpeg_generator_presence

router = APIRouter()


def _to_int(value: object, default: int) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return int(default)


def _resolve_ingest_profile(
    ingest_width: Optional[int],
    ingest_height: Optional[int],
    ingest_fps: Optional[float],
) -> tuple[int, int, int]:
    width = max(16, _to_int(os.getenv("CAMERA_DEFAULT_WIDTH"), 1280))
    height = max(16, _to_int(os.getenv("CAMERA_DEFAULT_HEIGHT"), 720))
    fps = max(0, _to_int(os.getenv("CAMERA_DEFAULT_INGEST_FPS"), 0))

    if ingest_width is not None and int(ingest_width) > 0:
        width = int(ingest_width)
    if ingest_height is not None and int(ingest_height) > 0:
        height = int(ingest_height)
    if ingest_fps is not None and float(ingest_fps) > 0:
        fps = int(float(ingest_fps))

    return width, height, fps


@router.api_route("/presence/start", methods=["GET", "POST"])
def presence_start(
    camera_id: str,
    rtsp_url: Optional[str] = None,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    ingest_width: Optional[int] = Query(default=None, alias="ingest_width"),
    ingest_height: Optional[int] = Query(default=None, alias="ingest_height"),
    ingest_fps: Optional[float] = Query(default=None, alias="ingest_fps"),
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("PRESENCE_AI_FPS", 8.0)

    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    if not resolved_company_id:
        resolved_company_id = infer_company_id_from_camera_id(camera_id)
    if resolved_company_id:
        container.attendance_rt.set_company_for_camera(camera_id, resolved_company_id)

    camera_started_now = False
    rtsp_url_value = str(rtsp_url or "").strip()
    if rtsp_url_value:
        width, height, profile_fps = _resolve_ingest_profile(
            ingest_width=ingest_width,
            ingest_height=ingest_height,
            ingest_fps=ingest_fps,
        )
        camera_started_now = bool(
            container.camera_rt.start(
                camera_id,
                rtsp_url_value,
                width=width,
                height=height,
                target_fps=profile_fps,
            )
        )

    # Presence mode must not trigger recognition/attendance side effects.
    try:
        container.attendance_rt.set_attendance_enabled(camera_id, False)
    except Exception:
        pass
    try:
        container.rec_worker.stop(camera_id)
    except Exception:
        pass

    started_now = container.presence_worker.start(camera_id, ai_fps=float(ai_fps))
    return {
        "ok": True,
        "startedNow": bool(started_now),
        "cameraStartedNow": bool(camera_started_now),
        "camera_id": camera_id,
        "camera_name": str(camera_name or ""),
        "ai_fps": float(ai_fps),
        "capture_profile": container.camera_rt.get_profile(camera_id),
    }


@router.api_route("/presence/stop", methods=["GET", "POST"])
def presence_stop(camera_id: str, container=Depends(get_container)):
    stopped_now = container.presence_worker.stop(camera_id)
    return {
        "ok": True,
        "stoppedNow": bool(stopped_now),
        "camera_id": camera_id,
    }


@router.get("/presence/status/{camera_id}")
def presence_status(
    camera_id: str,
    auto_start: bool = Query(default=False, alias="autoStart"),
    ai_fps: Optional[float] = None,
    container=Depends(get_container),
):
    if auto_start and not container.presence_worker.is_running(camera_id):
        if ai_fps is None:
            ai_fps = env_float("PRESENCE_AI_FPS", 8.0)
        container.presence_worker.start(camera_id, ai_fps=float(ai_fps))

    stats = container.presence_worker.get_latest_stats(camera_id)

    return {
        "ok": True,
        "running": bool(container.presence_worker.is_running(camera_id)),
        "stats": stats,
    }


@router.get("/presence/stream/{camera_id}")
def presence_stream(
    camera_id: str,
    ai_fps: Optional[float] = None,
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("PRESENCE_AI_FPS", 8.0)

    return StreamingResponse(
        mjpeg_generator_presence(container, camera_id, ai_fps=float(ai_fps)),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )
