from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_container
from app.core.settings import env_float, infer_company_id_from_camera_id
from app.streams.mjpeg import mjpeg_generator_presence

router = APIRouter()


def _normalize_optional_int(
    value: Optional[int],
    *,
    min_value: int,
    max_value: int,
) -> Optional[int]:
    if value is None:
        return None
    try:
        parsed = int(float(str(value).strip()))
    except Exception:
        return None
    return max(min_value, min(max_value, parsed))


@router.api_route("/presence/start", methods=["GET", "POST"])
def presence_start(
    camera_id: str,
    rtsp_url: Optional[str] = None,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    send_fps: Optional[int] = Query(default=None, alias="send_fps"),
    send_width: Optional[int] = Query(default=None, alias="send_width"),
    send_height: Optional[int] = Query(default=None, alias="send_height"),
    jpeg_quality: Optional[int] = Query(default=None, alias="jpeg_quality"),
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
        normalized_send_fps = _normalize_optional_int(
            send_fps, min_value=1, max_value=30
        )
        normalized_send_width = _normalize_optional_int(
            send_width, min_value=160, max_value=3840
        )
        normalized_send_height = _normalize_optional_int(
            send_height, min_value=120, max_value=2160
        )
        normalized_jpeg_quality = _normalize_optional_int(
            jpeg_quality, min_value=1, max_value=100
        )
        container.camera_rt.set_stream_profile(
            camera_id,
            send_fps=normalized_send_fps,
            send_width=normalized_send_width,
            send_height=normalized_send_height,
            jpeg_quality=normalized_jpeg_quality,
        )
        width = min(3840, max(1280, int(normalized_send_width or 1280)))
        height = min(2160, max(720, int(normalized_send_height or 720)))
        camera_started_now = bool(
            container.camera_rt.start(
                camera_id, rtsp_url_value, width=width, height=height
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
    profile: Optional[str] = Query(default=None),
    send_fps: Optional[int] = Query(default=None, alias="send_fps"),
    send_width: Optional[int] = Query(default=None, alias="send_width"),
    send_height: Optional[int] = Query(default=None, alias="send_height"),
    jpeg_quality: Optional[int] = Query(default=None, alias="jpeg_quality"),
    realtime: Optional[bool] = Query(default=None),
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("PRESENCE_AI_FPS", 8.0)

    return StreamingResponse(
        mjpeg_generator_presence(
            container,
            camera_id,
            ai_fps=float(ai_fps),
            profile=profile,
            send_fps=send_fps,
            send_width=send_width,
            send_height=send_height,
            jpeg_quality=jpeg_quality,
            realtime=bool(realtime),
        ),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )
