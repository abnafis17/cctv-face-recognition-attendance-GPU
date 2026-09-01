import os
import sys

# Pre-import numpy to prevent system package directory import from loading older system numpy version
import numpy
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

# Temporarily inject system package path to load GStreamer-supported system OpenCV
sys.path.insert(0, '/usr/lib/python3/dist-packages')
try:
    import cv2
finally:
    if '/usr/lib/python3/dist-packages' in sys.path:
        sys.path.remove('/usr/lib/python3/dist-packages')

import time
import numpy as np
from typing import Optional
from fastapi import APIRouter, Header, Query, BackgroundTasks
from fastapi.responses import StreamingResponse

from app.core.config import (
    DEFAULT_COMPANY_ID,
    MJPEG_STREAM_FPS_RECOGNITION,
    MJPEG_STREAM_FPS_RAW,
)
from app.core.logging import logger
from app.services.stream_manager import (
    get_stream_for_camera,
    update_active_time,
    stop_camera_stream,
)
from app.services.gallery import sync_gallery, get_gallery_templates
from app.services.model_manager import get_enroller2_auto

router = APIRouter()

def make_dark_placeholder(name: str) -> bytes:
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    for x in range(0, 640, 40):
        cv2.line(frame, (x, 0), (x, 480), (10, 10, 10), 1)
    for y in range(0, 480, 40):
        cv2.line(frame, (0, y), (640, y), (10, 10, 10), 1)
    cv2.putText(frame, f"[ {name} ]", (40, 220), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, "Connecting to camera stream...", (40, 255), cv2.FONT_HERSHEY_DUPLEX, 0.5, (0, 165, 255), 1, cv2.LINE_AA)
    ret, jpeg = cv2.imencode(".jpg", frame)
    return jpeg.tobytes()

def mjpeg_recognition_generator(camera_id: str, company_id: str):
    logger.info(f"Client started viewing recognition stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id)
    
    gui_period = 1.0 / MJPEG_STREAM_FPS_RECOGNITION
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    stream.active_viewers += 1
    try:
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting recognition generator: {camera_id}")
                break
            t_start = time.time()
            update_active_time(camera_id)
            
            jpeg_bytes = stream.get_latest_annotated_jpeg()
            if jpeg_bytes is None:
                yield (b'--frame\n'
                       b'Content-Type: image/jpeg\n\n' + placeholder_bytes + b'\n')
            else:
                yield (b'--frame\n'
                       b'Content-Type: image/jpeg\n\n' + jpeg_bytes + b'\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client error in recognition stream: {camera_id} ({e})")
    finally:
        stream.active_viewers = max(0, stream.active_viewers - 1)
        logger.info(f"Client stopped viewing recognition stream: {camera_id}")

def mjpeg_raw_generator(camera_id: str, company_id: str):
    logger.info(f"Client started viewing raw stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id)
    
    gui_period = 1.0 / MJPEG_STREAM_FPS_RAW
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    stream.active_viewers += 1
    try:
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting raw generator: {camera_id}")
                break
            t_start = time.time()
            update_active_time(camera_id)
            
            jpeg_bytes = stream.get_latest_raw_jpeg()
            if jpeg_bytes is None:
                yield (b'--frame\n'
                       b'Content-Type: image/jpeg\n\n' + placeholder_bytes + b'\n')
            else:
                yield (b'--frame\n'
                       b'Content-Type: image/jpeg\n\n' + jpeg_bytes + b'\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client error in raw stream: {camera_id} ({e})")
    finally:
        stream.active_viewers = max(0, stream.active_viewers - 1)
        logger.info(f"Client stopped viewing raw stream: {camera_id}")

def mjpeg_enroll_generator(camera_id: str):
    logger.info(f"Client started viewing enroll stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, DEFAULT_COMPANY_ID)
    
    enroll_fps = float(os.getenv("MJPEG_STREAM_FPS_ENROLL", os.getenv("ENROLL_STREAM_FPS", "10.0")))
    gui_period = 1.0 / enroll_fps
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    try:
        from app.enroll2_auto.hud import draw_enroll2_auto_hud
        from app.services.stream import camera_rt_compat
        enroller = get_enroller2_auto(camera_rt_compat)
        
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting enroll generator: {camera_id}")
                break
            t_start = time.time()
            update_active_time(camera_id)
            
            frame = stream.latest_raw_frame
            if frame is None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
            else:
                frame = frame.copy()
                st = enroller.overlay_state()
                if st.get("running") and st.get("camera_id") == camera_id:
                    h, w = frame.shape[:2]
                    cfg = enroller.cfg
                    roi = (
                        int(cfg.roi_x0 * w),
                        int(cfg.roi_y0 * h),
                        int(cfg.roi_x1 * w),
                        int(cfg.roi_y1 * h),
                    )

                    bbox = st.get("bbox")
                    primary = None if not bbox else tuple(int(v) for v in bbox)

                    hud = {
                        "mode": "enroll2-auto",
                        "step": str(st.get("step", "")),
                        "instruction": str(st.get("instruction", "")),
                        "q": f"{float(st.get('quality') or 0.0):.1f}",
                        "pose": str(st.get("pose") or "-"),
                        "message": str(st.get("message") or ""),
                        "roi_faces": str(st.get("roi_faces") or 0),
                        "collected": str(st.get("collected") or ""),
                        "target_per_pose": str(st.get("target_per_pose") or "5"),
                        "status": str(st.get("status") or ""),
                    }
                    frame = draw_enroll2_auto_hud(frame, roi, primary, hud)

                quality = int(os.getenv("MJPEG_ENROLL_JPEG_QUALITY", "60"))
                ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client stopped viewing enroll stream: {camera_id} ({e})")

@router.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(
    camera_id: str,
    rtsp_url: str,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    stream_type: Optional[str] = Query(default=None, alias="stream_type"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    logger.info(f"Received start camera request: {camera_id} -> {rtsp_url} (type: {stream_type})")
    
    stream = get_stream_for_camera(camera_id, comp_id, rtsp_url=rtsp_url)
    if stream_type:
        stream.stream_type = stream_type.strip().lower()
    
    return {
        "ok": True,
        "startedNow": True,
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "camera_name": camera_name or camera_id,
        "recognition_running": True,
        "attendance_enabled": True
    }

@router.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(
    camera_id: str,
):
    logger.info(f"Received stop camera request: {camera_id}")
    was_running = stop_camera_stream(camera_id)
            
    return {
        "ok": True,
        "stoppedNow": was_running,
        "camera_id": camera_id
    }

@router.post("/camera/recognition/prewarm")
def prewarm(background_tasks: BackgroundTasks, x_company_id: Optional[str] = Header(default=None, alias="x-company-id")):
    cid = "entry_cam"
    comp_id = x_company_id or DEFAULT_COMPANY_ID
    background_tasks.add_task(get_stream_for_camera, cid, comp_id)
    return {"ok": True, "queued": True, "camera_id": cid}

@router.get("/camera/recognition/refresh")
def refresh_templates(x_company_id: Optional[str] = Header(default=None, alias="x-company-id")):
    comp_id = x_company_id or DEFAULT_COMPANY_ID
    sync_gallery(comp_id)
    return {"ok": True, "templates": len(get_gallery_templates())}

@router.get("/camera/recognition/stream/{camera_id}/{camera_name}")
def recognition_stream(
    camera_id: str,
    camera_name: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id")
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    return StreamingResponse(
        mjpeg_recognition_generator(camera_id, comp_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive"
        }
    )

@router.get("/camera/stream/{camera_id}")
def raw_stream(
    camera_id: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id")
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    return StreamingResponse(
        mjpeg_raw_generator(camera_id, comp_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive"
        }
    )

@router.get("/camera/enroll2/auto/stream/{camera_id}")
def camera_enroll2_auto_stream(camera_id: str):
    return StreamingResponse(
        mjpeg_enroll_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive"
        }
    )
