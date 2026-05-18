from __future__ import annotations

import os
import threading
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_container
from app.clients.backend_client import BackendClient
from app.core.settings import (
    env_float,
    infer_company_id_from_camera_id,
    normalize_stream_type,
)
from app.streams.mjpeg import (
    mjpeg_generator_raw,
    mjpeg_generator_recognition,
    mjpeg_generator_enroll2_auto,
)

router = APIRouter()


def _camera_matches_identifier(camera: dict, identifier: str) -> bool:
    key = str(identifier or "").strip()
    if not key:
        return False

    camera_id = str(camera.get("id") or "").strip()
    cam_id = str(camera.get("camId") or "").strip()
    return key == camera_id or key == cam_id


def _to_int(value: object, default: int) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return int(default)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _resolve_ingest_profile(
    *,
    camera: Optional[dict] = None,
    ingest_width: Optional[int] = None,
    ingest_height: Optional[int] = None,
    ingest_fps: Optional[float] = None,
) -> tuple[int, int, int]:
    default_width = max(16, _to_int(os.getenv("CAMERA_DEFAULT_WIDTH"), 1280))
    default_height = max(16, _to_int(os.getenv("CAMERA_DEFAULT_HEIGHT"), 720))
    default_fps = max(0, _to_int(os.getenv("CAMERA_DEFAULT_INGEST_FPS"), 0))

    width = default_width
    height = default_height
    fps = default_fps

    if camera:
        camera_width = _to_int(camera.get("sendWidth"), 0)
        camera_height = _to_int(camera.get("sendHeight"), 0)
        camera_fps = _to_int(camera.get("sendFps"), 0)
        if camera_width > 0:
            width = camera_width
        if camera_height > 0:
            height = camera_height
        if camera_fps > 0:
            fps = camera_fps

    if ingest_width is not None and int(ingest_width) > 0:
        width = int(ingest_width)
    if ingest_height is not None and int(ingest_height) > 0:
        height = int(ingest_height)
    if ingest_fps is not None and float(ingest_fps) > 0:
        fps = int(float(ingest_fps))

    if _env_bool("CAMERA_ENFORCE_DEFAULT_PROFILE", False):
        width = max(width, default_width)
        height = max(height, default_height)
        if default_fps > 0:
            fps = max(fps, default_fps)

    return max(16, width), max(16, height), max(0, fps)


def _start_camera_runtime(
    *,
    container,
    camera_id: str,
    camera_name: str,
    rtsp_url: str,
    ai_fps: float,
    company_id: Optional[str],
    stream_type: str,
    attendance_enabled: bool,
    camera: Optional[dict] = None,
    ingest_width: Optional[int] = None,
    ingest_height: Optional[int] = None,
    ingest_fps: Optional[float] = None,
) -> bool:
    camera_id = str(camera_id or "").strip()
    camera_name = str(camera_name or camera_id).strip() or camera_id
    rtsp_url = str(rtsp_url or "").strip()
    company_id = str(company_id or "").strip() or None

    if not camera_id or not rtsp_url:
        return False

    width, height, profile_fps = _resolve_ingest_profile(
        camera=camera,
        ingest_width=ingest_width,
        ingest_height=ingest_height,
        ingest_fps=ingest_fps,
    )
    started_now = bool(
        container.camera_rt.start(
            camera_id,
            rtsp_url,
            width=width,
            height=height,
            target_fps=profile_fps,
        )
    )
    if company_id:
        container.attendance_rt.set_company_for_camera(camera_id, company_id)
    container.attendance_rt.set_stream_type(camera_id, stream_type)
    container.attendance_rt.set_attendance_enabled(camera_id, attendance_enabled)
    container.rec_worker.start(camera_id, camera_name, ai_fps=float(ai_fps))
    return started_now


def _prewarm_camera_runtimes(
    *,
    container,
    camera_ids: list[str],
    ai_fps: float,
    company_id: Optional[str],
    stream_type: str,
) -> None:
    company_id = str(company_id or "").strip() or None
    if not company_id:
        return

    wanted_ids = {
        str(value or "").strip() for value in camera_ids if str(value or "").strip()
    }
    if not wanted_ids:
        return

    try:
        backend = BackendClient(company_id=company_id)
        cameras = backend.list_cameras(include_virtual=True)
    except Exception as exc:
        print(
            f"[CameraRoute] failed to list cameras for prewarm company={company_id}: {exc}"
        )
        return

    for camera in cameras:
        camera_id = str(camera.get("id") or "").strip()
        cam_id = str(camera.get("camId") or "").strip()
        keys = {value for value in (camera_id, cam_id) if value}
        if not keys.intersection(wanted_ids):
            continue
        if not bool(camera.get("isActive", True)):
            continue

        rtsp_url = str(camera.get("rtspUrl") or "").strip()
        if not rtsp_url:
            continue

        resolved_id = camera_id or cam_id
        if not resolved_id or container.camera_rt.is_running(resolved_id):
            continue

        started_now = _start_camera_runtime(
            container=container,
            camera_id=resolved_id,
            camera_name=str(camera.get("name") or resolved_id).strip() or resolved_id,
            rtsp_url=rtsp_url,
            ai_fps=float(ai_fps),
            company_id=company_id,
            stream_type=stream_type,
            attendance_enabled=bool(camera.get("attendance", True)),
            camera=camera,
        )
        if started_now:
            print(
                f"[CameraRoute] prewarmed cam={resolved_id} "
                f"stream_type={stream_type} company={company_id}"
            )


def _ensure_camera_runtime(
    *,
    container,
    camera_id: str,
    camera_name: str,
    ai_fps: float,
    company_id: Optional[str],
    stream_type: str,
) -> None:
    camera_id = str(camera_id or "").strip()
    camera_name = str(camera_name or camera_id).strip() or camera_id
    company_id = str(company_id or "").strip() or None

    if not camera_id:
        return

    if container.camera_rt.is_running(camera_id):
        if company_id:
            container.attendance_rt.set_company_for_camera(camera_id, company_id)
        return

    if not company_id:
        return

    try:
        backend = BackendClient(company_id=company_id)
        cameras = backend.list_cameras(include_virtual=True)
        camera = next(
            (item for item in cameras if _camera_matches_identifier(item, camera_id)),
            None,
        )
        if not camera:
            return

        started_now = _start_camera_runtime(
            container=container,
            camera_id=camera_id,
            camera_name=str(camera.get("name") or camera_name).strip() or camera_name,
            rtsp_url=str(camera.get("rtspUrl") or "").strip(),
            ai_fps=float(ai_fps),
            company_id=company_id,
            stream_type=stream_type,
            attendance_enabled=bool(camera.get("attendance", True)),
            camera=camera,
        )
        if not started_now and not container.camera_rt.is_running(camera_id):
            return

        print(
            f"[CameraRoute] recovered runtime cam={camera_id} "
            f"stream_type={stream_type} company={company_id}"
        )
    except Exception as exc:
        print(f"[CameraRoute] failed to recover runtime cam={camera_id}: {exc}")


def _recover_camera_runtime(
    *,
    container,
    camera_id: str,
    camera_name: str,
    company_id: Optional[str],
) -> None:
    camera_id = str(camera_id or "").strip()
    camera_name = str(camera_name or camera_id).strip() or camera_id
    company_id = str(company_id or "").strip() or None

    if not camera_id:
        return

    if container.camera_rt.is_running(camera_id):
        if company_id:
            container.attendance_rt.set_company_for_camera(camera_id, company_id)
        return

    if not company_id:
        return

    try:
        backend = BackendClient(company_id=company_id)
        cameras = backend.list_cameras(include_virtual=True)
        camera = next(
            (item for item in cameras if _camera_matches_identifier(item, camera_id)),
            None,
        )
        if not camera or not bool(camera.get("isActive", True)):
            return

        rtsp_url = str(camera.get("rtspUrl") or "").strip()
        if not rtsp_url:
            return

        width, height, profile_fps = _resolve_ingest_profile(camera=camera)
        started_now = bool(
            container.camera_rt.start(
                camera_id,
                rtsp_url,
                width=width,
                height=height,
                target_fps=profile_fps,
            )
        )
        if company_id:
            container.attendance_rt.set_company_for_camera(camera_id, company_id)

        if started_now:
            print(
                f"[CameraRoute] recovered camera-only runtime cam={camera_id} "
                f"name={str(camera.get('name') or camera_name).strip() or camera_name} "
                f"company={company_id}"
            )
    except Exception as exc:
        print(f"[CameraRoute] failed to recover camera-only runtime cam={camera_id}: {exc}")


def _stop_camera_runtime(*, container, camera_id: str) -> None:
    camera_id = str(camera_id or "").strip()
    if not camera_id:
        return

    # Stop recognition/presence first to avoid read/close races with the grabber.
    try:
        container.rec_worker.stop(camera_id)
    except Exception as exc:
        print(f"[CameraRoute] rec_worker stop failed cam={camera_id}: {exc}")

    try:
        container.presence_worker.stop(camera_id)
    except Exception as exc:
        print(f"[CameraRoute] presence_worker stop failed cam={camera_id}: {exc}")

    try:
        container.camera_rt.stop(camera_id)
    except Exception as exc:
        print(f"[CameraRoute] camera runtime stop failed cam={camera_id}: {exc}")

    try:
        container.attendance_rt.set_authorized_employee_ids(camera_id, [])
    except Exception as exc:
        print(f"[CameraRoute] clear authorized ids failed cam={camera_id}: {exc}")

    try:
        container.attendance_rt.set_attendance_enabled(camera_id, False)
    except Exception:
        pass


class CameraAuthorizedPersonsPayload(BaseModel):
    camera_id: str
    employee_ids: list[str] = Field(default_factory=list)


class CameraRecognitionPrewarmPayload(BaseModel):
    camera_ids: list[str] = Field(default_factory=list)
    company_id: Optional[str] = None
    ai_fps: Optional[float] = None
    stream_type: Optional[str] = None


@router.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(
    camera_id: str,
    rtsp_url: str,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    stream_type: Optional[str] = Query(default=None, alias="stream_type"),
    attendance_enabled: Optional[bool] = Query(
        default=None, alias="attendance_enabled"
    ),
    ingest_width: Optional[int] = Query(default=None, alias="ingest_width"),
    ingest_height: Optional[int] = Query(default=None, alias="ingest_height"),
    ingest_fps: Optional[float] = Query(default=None, alias="ingest_fps"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    if ai_fps is None:
        ai_fps = env_float("AI_FPS", 10.0)

    width, height, profile_fps = _resolve_ingest_profile(
        ingest_width=ingest_width,
        ingest_height=ingest_height,
        ingest_fps=ingest_fps,
    )
    started_now = container.camera_rt.start(
        camera_id,
        rtsp_url,
        width=width,
        height=height,
        target_fps=profile_fps,
    )
    cam_name = str(camera_name or camera_id)

    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    if not resolved_company_id:
        resolved_company_id = infer_company_id_from_camera_id(camera_id)
    if resolved_company_id:
        container.attendance_rt.set_company_for_camera(camera_id, resolved_company_id)

    # Server-managed default: process attendance continuously while camera is running.
    container.attendance_rt.set_stream_type(camera_id, normalize_stream_type(stream_type))
    resolved_attendance_enabled = (
        True if attendance_enabled is None else bool(attendance_enabled)
    )
    container.attendance_rt.set_attendance_enabled(
        camera_id, resolved_attendance_enabled
    )
    container.rec_worker.start(camera_id, cam_name, ai_fps=float(ai_fps))

    return {
        "ok": True,
        "startedNow": bool(started_now),
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "camera_name": cam_name,
        "recognition_running": True,
        "attendance_enabled": resolved_attendance_enabled,
        "capture_profile": container.camera_rt.get_profile(camera_id),
    }


@router.post("/camera/authorized-persons")
def set_camera_authorized_persons(
    payload: CameraAuthorizedPersonsPayload, container=Depends(get_container)
):
    camera_id = str(payload.camera_id or "").strip()
    if not camera_id:
        raise HTTPException(status_code=400, detail="camera_id is required")

    employee_ids = [
        str(value).strip()
        for value in list(payload.employee_ids or [])
        if str(value).strip()
    ]

    container.attendance_rt.set_authorized_employee_ids(camera_id, employee_ids)

    return {
        "ok": True,
        "camera_id": camera_id,
        "authorizedEmployeeCount": len(employee_ids),
    }


@router.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(camera_id: str, container=Depends(get_container)):
    cid = str(camera_id or "").strip()
    was_running = bool(container.camera_rt.is_running(cid))

    worker = threading.Thread(
        target=_stop_camera_runtime,
        kwargs={"container": container, "camera_id": cid},
        daemon=True,
    )
    worker.start()

    return {"ok": True, "stoppedNow": bool(was_running), "camera_id": cid}


@router.post("/camera/recognition/prewarm")
def camera_recognition_prewarm(
    payload: CameraRecognitionPrewarmPayload,
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    company_id = str(payload.company_id or x_company_id or "").strip() or None
    camera_ids = [
        str(value or "").strip()
        for value in list(payload.camera_ids or [])
        if str(value or "").strip()
    ]
    if not company_id or not camera_ids:
        return {
            "ok": True,
            "queued": False,
            "camera_count": len(camera_ids),
        }

    ai_fps = float(payload.ai_fps or env_float("AI_FPS", 10.0))
    stream_type = normalize_stream_type(payload.stream_type)

    worker = threading.Thread(
        target=_prewarm_camera_runtimes,
        kwargs={
            "container": container,
            "camera_ids": list(dict.fromkeys(camera_ids)),
            "ai_fps": ai_fps,
            "company_id": company_id,
            "stream_type": stream_type,
        },
        daemon=True,
    )
    worker.start()

    return {
        "ok": True,
        "queued": True,
        "camera_count": len(camera_ids),
    }


@router.get("/camera/runtime/status")
def camera_runtime_status(container=Depends(get_container)):
    profiles = container.camera_rt.list_profiles()
    return {
        "ok": True,
        "running_camera_count": len(profiles),
        "profiles": profiles,
    }


@router.get("/camera/runtime/status/{camera_id}")
def camera_runtime_status_one(camera_id: str, container=Depends(get_container)):
    profile = container.camera_rt.get_profile(camera_id)
    return {
        "ok": True,
        "camera_id": camera_id,
        "running": profile is not None,
        "profile": profile,
    }


# raw stream when attendance is disabled
@router.get("/camera/stream/{camera_id}")
def camera_stream(
    camera_id: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    container=Depends(get_container),
):
    resolved_company_id = str(company_id or x_company_id or "").strip() or None
    if not resolved_company_id:
        resolved_company_id = infer_company_id_from_camera_id(camera_id)

    _recover_camera_runtime(
        camera_id=camera_id,
        camera_name=camera_id,
        company_id=resolved_company_id,
        container=container,
    )

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


# recognised stream when attendance is enabled
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

    _recover_camera_runtime(
        camera_id=camera_id,
        camera_name=camera_name,
        company_id=resolved_company_id,
        container=container,
    )

    resolved_stream_type = normalize_stream_type(stream_type)
    _ensure_camera_runtime(
        container=container,
        camera_id=camera_id,
        camera_name=camera_name,
        ai_fps=float(ai_fps),
        company_id=resolved_company_id,
        stream_type=resolved_stream_type,
    )

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
