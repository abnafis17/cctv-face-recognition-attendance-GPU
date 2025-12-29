from __future__ import annotations
import os
import time
import threading
from typing import Dict, Optional

import cv2
from fastapi import FastAPI, Body
from fastapi.responses import StreamingResponse, Response

from .runtimes.camera_runtime import CameraRuntime
from .services.enroll_service import EnrollmentService
from .runtimes.attendance_runtime import AttendanceRuntime
from .runtimes.recognition_worker import RecognitionWorker
from .utils import draw_enroll_hud


# --------------------------------------------------
# App
# --------------------------------------------------
app = FastAPI(title="AI Camera API", version="1.4")

# --------------------------------------------------
# Runtimes
# --------------------------------------------------
camera_rt = CameraRuntime()

enroller = EnrollmentService(
    camera_rt=camera_rt,
    use_gpu=False,
)

attendance_rt = AttendanceRuntime(
    use_gpu=False,
    similarity_threshold=0.35,
    cooldown_s=10,
    stable_hits_required=3,
)

rec_worker = RecognitionWorker(camera_rt=camera_rt, attendance_rt=attendance_rt)

# --------------------------------------------------
# Stream client reference counting (production)
# Stops recognition worker when no clients are watching
# --------------------------------------------------
_stream_lock = threading.Lock()
_rec_stream_clients: Dict[str, int] = {}  # camera_id -> count



def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default



def _inc_rec_client(camera_id: str) -> int:
    with _stream_lock:
        _rec_stream_clients[camera_id] = _rec_stream_clients.get(camera_id, 0) + 1
        return _rec_stream_clients[camera_id]


def _dec_rec_client(camera_id: str) -> int:
    with _stream_lock:
        cur = _rec_stream_clients.get(camera_id, 0) - 1
        if cur <= 0:
            _rec_stream_clients.pop(camera_id, None)
            cur = 0
        else:
            _rec_stream_clients[camera_id] = cur
        return cur


# --------------------------------------------------
# Health
# --------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------
# Camera control
# --------------------------------------------------
@app.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(camera_id: str, rtsp_url: str):
    camera_rt.start(camera_id, rtsp_url)
    return {"ok": True, "camera_id": camera_id, "rtsp_url": rtsp_url}


@app.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(camera_id: str):
    # Stop camera
    camera_rt.stop(camera_id)

    # Stop recognition worker (if any)
    rec_worker.stop(camera_id)

    # If enrollment session is tied to this camera, stop it safely
    s = enroller.status()
    if s and getattr(s, "status", None) == "running" and getattr(s, "camera_id", None) == camera_id:
        try:
            enroller.stop()
        except Exception:
            pass

    return {"ok": True, "camera_id": camera_id}


# --------------------------------------------------
# Snapshot
# --------------------------------------------------
@app.get("/camera/snapshot/{camera_id}")
def camera_snapshot(camera_id: str):
    frame = camera_rt.get_frame(camera_id)
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


# --------------------------------------------------
# RAW MJPEG stream (no recognition)
# Shows enrollment HUD when enrollment session is active for this camera
# --------------------------------------------------
def mjpeg_generator_raw(camera_id: str):
    # Wait for frames
    for _ in range(60):
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    # Cache enrollment status (avoid calling every frame)
    last_s_check = 0.0
    cached_s = None

    try:
        while True:
            frame = camera_rt.get_frame(camera_id)
            if frame is None:
                time.sleep(0.03)
                continue

            now = time.time()
            if (now - last_s_check) > 0.2:  # check 5 times/sec only
                try:
                    cached_s = enroller.status()
                except Exception:
                    cached_s = None
                last_s_check = now

            if cached_s and getattr(cached_s, "status", None) == "running" and getattr(cached_s, "camera_id", None) == camera_id:
                try:
                    frame = draw_enroll_hud(frame, cached_s, enroller.cfg.angles)
                except Exception:
                    pass

            ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if not ok:
                continue

            b = jpg.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n" +
                b +
                b"\r\n"
            )
            time.sleep(0.01)

    except GeneratorExit:
        return


@app.get("/camera/stream/{camera_id}")
def camera_stream(camera_id: str):
    return StreamingResponse(
        mjpeg_generator_raw(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )


# --------------------------------------------------
# RECOGNITION + ATTENDANCE STREAM
# - Uses RecognitionWorker cached JPEG (no per-client re-encode)
# - Stops worker automatically when last client disconnects
# --------------------------------------------------
def mjpeg_generator_recognition(camera_id: str, ai_fps: float):
    _inc_rec_client(camera_id)

    # Start/adjust worker
    rec_worker.start(camera_id, ai_fps=float(ai_fps))

    # Wait for frames
    for _ in range(60):
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    try:
        while True:
            jpg_bytes = rec_worker.get_latest_jpeg(camera_id)

            if jpg_bytes is None:
                raw = camera_rt.get_frame(camera_id)
                if raw is None:
                    time.sleep(0.02)
                    continue
                ok, jpg = cv2.imencode(".jpg", raw, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
                if not ok:
                    continue
                jpg_bytes = jpg.tobytes()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpg_bytes)).encode() + b"\r\n\r\n" +
                jpg_bytes +
                b"\r\n"
            )
            time.sleep(0.01)

    except GeneratorExit:
        return

    finally:
        left = _dec_rec_client(camera_id)
        if left == 0:
            # No viewers left -> stop recognition worker to save CPU
            rec_worker.stop(camera_id)


@app.get("/camera/recognition/stream/{camera_id}")
def camera_recognition_stream(camera_id: str, ai_fps: float = None):
    if ai_fps is None:
        ai_fps = _env_float("AI_FPS", 10.0)
    return StreamingResponse(
        mjpeg_generator_recognition(camera_id, ai_fps=ai_fps),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )


# --------------------------------------------------
# Attendance enable / disable per camera
# --------------------------------------------------
@app.post("/attendance/enable")
def attendance_enable(camera_id: str):
    attendance_rt.set_attendance_enabled(camera_id, True)
    return {"ok": True, "camera_id": camera_id, "enabled": True}


@app.post("/attendance/disable")
def attendance_disable(camera_id: str):
    attendance_rt.set_attendance_enabled(camera_id, False)
    return {"ok": True, "camera_id": camera_id, "enabled": False}


@app.get("/attendance/enabled")
def attendance_enabled(camera_id: str):
    return {
        "ok": True,
        "camera_id": camera_id,
        "enabled": attendance_rt.is_attendance_enabled(camera_id),
    }


# --------------------------------------------------
# Enrollment (Browser-based)
# --------------------------------------------------
_ALLOWED_ANGLES = {"front", "left", "right", "up", "down"}


@app.post("/enroll/session/start")
def enroll_session_start(payload: dict = Body(...)):
    employee_id = str(payload.get("employeeId") or "").strip()
    name = str(payload.get("name") or "").strip()
    camera_id = str(payload.get("cameraId") or "").strip()

    if not employee_id or not name or not camera_id:
        return {"ok": False, "error": "employeeId, name, cameraId are required"}

    s = enroller.start(employee_id=employee_id, name=name, camera_id=camera_id)
    return {"ok": True, "session": s.__dict__}


@app.post("/enroll/session/stop")
def enroll_session_stop():
    stopped = enroller.stop()
    s = enroller.status()
    return {"ok": True, "stopped": stopped, "session": (s.__dict__ if s else None)}


@app.get("/enroll/session/status")
def enroll_session_status():
    s = enroller.status()
    return {"ok": True, "session": (s.__dict__ if s else None)}


@app.post("/enroll/session/angle")
def enroll_session_set_angle(payload: dict = Body(...)):
    angle = str(payload.get("angle") or "").strip().lower()
    if angle not in _ALLOWED_ANGLES:
        return {"ok": False, "error": f"Invalid angle. Allowed: {sorted(_ALLOWED_ANGLES)}"}

    try:
        s = enroller.set_angle(angle)
        return {"ok": True, "session": (s.__dict__ if s else None)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/enroll/session/capture")
def enroll_session_capture(payload: dict = Body(None)):
    try:
        if isinstance(payload, dict) and payload.get("angle"):
            angle = str(payload.get("angle") or "").strip().lower()
            if angle not in _ALLOWED_ANGLES:
                return {"ok": False, "error": f"Invalid angle. Allowed: {sorted(_ALLOWED_ANGLES)}"}
            enroller.set_angle(angle)

        result = enroller.capture()
        s = enroller.status()
        return {"ok": True, "result": result, "session": (s.__dict__ if s else None)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/enroll/session/save")
def enroll_session_save():
    try:
        result = enroller.save()
        s = enroller.status()
        return {"ok": True, "result": result, "session": (s.__dict__ if s else None)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/enroll/session/cancel")
def enroll_session_cancel():
    try:
        result = enroller.cancel()
        s = enroller.status()
        return {"ok": True, "result": result, "session": (s.__dict__ if s else None)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/enroll/session/clear-angle")
def enroll_session_clear_angle(payload: dict = Body(...)):
    try:
        angle = str(payload.get("angle") or "").strip().lower()
        result = enroller.clear_angle(angle)
        s = enroller.status()
        return {"ok": True, "result": result, "session": (s.__dict__ if s else None)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
