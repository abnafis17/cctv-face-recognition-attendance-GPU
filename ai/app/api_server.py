from __future__ import annotations
import os
import time
import threading
from typing import Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI, Body, Header, Query, UploadFile, File,Form
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from .runtimes.camera_runtime import CameraRuntime
from .services.enroll_service import EnrollmentService
from .runtimes.attendance_runtime import AttendanceRuntime
from .runtimes.recognition_worker import RecognitionWorker
from .utils import draw_enroll_hud
from .enroll2_auto.service import EnrollmentAutoService2
from .enroll2_auto.hud import draw_enroll2_auto_hud
from app.vision.capture import FrameGrabber 
# -----------------------------
# App
# -----------------------------
app = FastAPI(title="AI Camera API", version="1.4")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # your frontend origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Runtimes
# -----------------------------
camera_rt = CameraRuntime()

enroller = EnrollmentService(camera_rt=camera_rt, use_gpu=False)

attendance_rt = AttendanceRuntime(
    use_gpu=False,
    similarity_threshold=0.35,
    cooldown_s=10,
    stable_hits_required=3,
)

rec_worker = RecognitionWorker(camera_rt=camera_rt, attendance_rt=attendance_rt)

enroller2_auto = EnrollmentAutoService2(camera_rt=camera_rt)

# -----------------------------
# Stream client ref counting
# -----------------------------
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

# -----------------------------
# Health
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}

# -----------------------------
# Start/Stop IP or laptop camera manually (optional)
# -----------------------------
@app.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(camera_id: str, rtsp_url: str):
    started_now = camera_rt.start(camera_id, rtsp_url)
    return {
        "ok": True,
        "startedNow": bool(started_now),
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
    }

@app.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(camera_id: str):
    stopped_now = camera_rt.stop(camera_id)
    rec_worker.stop(camera_id)
    return {"ok": True, "stoppedNow": bool(stopped_now), "camera_id": camera_id}

# -----------------------------
# Snapshot
# -----------------------------
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
        headers={"Cache-Control": "no-cache", "Pragma": "no-cache", "Expires": "0"},
    )

# -----------------------------
# Receive frames from laptop camera
# -----------------------------

@app.post("/camera/frame")
def camera_frame_upload(
    camera_id: str = Query(...),  # string like "10000"
    frame: UploadFile = File(...),
):
    # Read frame
    file_bytes = frame.file.read()
    img = cv2.imdecode(np.frombuffer(file_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"ok": False, "error": "Invalid frame"}

    # Mirror frame
    img = cv2.flip(img, 1)

    # Inject frame into CameraRuntime
    camera_rt.inject_frame(camera_id, img)

    # Start recognition worker (if not already)
    # Give it a camera_name so AttendanceRuntime knows it’s a valid camera
    rec_worker.start(camera_id, camera_name=f"Laptop-{camera_id}", ai_fps=30.0)

    return {"ok": True}

# -----------------------------
# Recognition + attendance stream
# -----------------------------
def mjpeg_generator_recognition(camera_id: str, camera_name: str, ai_fps: float):
    _inc_rec_client(camera_id)
    rec_worker.start(camera_id, camera_name, ai_fps=float(ai_fps))

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
                b"Content-Length: "
                + str(len(jpg_bytes)).encode()
                + b"\r\n\r\n"
                + jpg_bytes
                + b"\r\n"
            )
            time.sleep(0.01)
    except GeneratorExit:
        return
    finally:
        left = _dec_rec_client(camera_id)
        if left == 0:
            rec_worker.stop(camera_id)

@app.get("/camera/recognition/stream/{camera_id}/{camera_name}")
def camera_recognition_stream(
    camera_id: str,
    camera_name: str,
    ai_fps: Optional[float] = None,
):
    if ai_fps is None:
        ai_fps = _env_float("AI_FPS", 10.0)
    return StreamingResponse(
        mjpeg_generator_recognition(camera_id, camera_name, ai_fps=ai_fps),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "Pragma": "no-cache", "Expires": "0", "Connection": "keep-alive"},
    )

# (You can keep all your other endpoints like enroll/attendance unchanged)
