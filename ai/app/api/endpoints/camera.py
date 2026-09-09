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

def make_dark_placeholder(name: str, status_msg: str = "Connecting to camera stream...") -> bytes:
    width, height = 640, 480
    frame = np.zeros((height, width, 3), dtype=np.uint8)

    # 1. Vignette dark background
    center_x, center_y = width // 2, height // 2
    y_coords, x_coords = np.ogrid[:height, :width]
    dist_from_center = np.sqrt((x_coords - center_x)**2 + (y_coords - center_y)**2)
    max_dist = np.sqrt(center_x**2 + center_y**2)
    norm_dist = np.clip(dist_from_center / max_dist, 0, 1)

    center_color = np.array([28, 32, 42], dtype=np.float32)
    edge_color = np.array([12, 14, 20], dtype=np.float32)

    for c in range(3):
        frame[:, :, c] = (center_color[c] * (1 - norm_dist * 0.7) + edge_color[c] * (norm_dist * 0.7)).astype(np.uint8)

    # 2. Subtle Grid Overlay
    grid_color = (35, 40, 52)
    for x in range(0, width, 40):
        cv2.line(frame, (x, 0), (x, height), grid_color, 1)
    for y in range(0, height, 40):
        cv2.line(frame, (0, y), (width, y), grid_color, 1)

    # 3. Center Overlay Card Box
    card_w, card_h = 460, 140
    card_x1 = (width - card_w) // 2
    card_y1 = (height - card_h) // 2
    card_x2 = card_x1 + card_w
    card_y2 = card_y1 + card_h

    overlay = frame.copy()
    cv2.rectangle(overlay, (card_x1, card_y1), (card_x2, card_y2), (22, 26, 36), -1)
    cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)

    cv2.rectangle(frame, (card_x1, card_y1), (card_x2, card_y2), (55, 65, 85), 1)

    # Card Corner Accents
    accent_len = 8
    accent_color = (0, 165, 255) # Warm Amber Accent
    cv2.line(frame, (card_x1, card_y1), (card_x1 + accent_len, card_y1), accent_color, 2)
    cv2.line(frame, (card_x1, card_y1), (card_x1, card_y1 + accent_len), accent_color, 2)
    cv2.line(frame, (card_x2 - accent_len, card_y1), (card_x2, card_y1), accent_color, 2)
    cv2.line(frame, (card_x2, card_y1), (card_x2, card_y1 + accent_len), accent_color, 2)
    cv2.line(frame, (card_x1, card_y2), (card_x1 + accent_len, card_y2), accent_color, 2)
    cv2.line(frame, (card_x1, card_y2 - accent_len), (card_x1, card_y2), accent_color, 2)
    cv2.line(frame, (card_x2 - accent_len, card_y2), (card_x2, card_y2), accent_color, 2)
    cv2.line(frame, (card_x2, card_y2 - accent_len), (card_x2, card_y2), accent_color, 2)

    # 4. Glowing Status Indicator Dot
    dot_cy = card_y1 + 28
    cv2.circle(frame, (center_x, dot_cy), 8, (0, 90, 200), -1, cv2.LINE_AA)
    cv2.circle(frame, (center_x, dot_cy), 4, (0, 185, 255), -1, cv2.LINE_AA)

    # 5. Centered Camera Name Text
    camera_title = str(name or "Camera Stream").strip()
    font = cv2.FONT_HERSHEY_DUPLEX
    font_scale = 0.7
    thickness = 1

    (tw, th), baseline = cv2.getTextSize(camera_title, font, font_scale, thickness)
    if tw > card_w - 40:
        font_scale = 0.55
        (tw, th), baseline = cv2.getTextSize(camera_title, font, font_scale, thickness)

    title_x = (width - tw) // 2
    title_y = card_y1 + 72
    cv2.putText(frame, camera_title, (title_x, title_y), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

    # 6. Centered Status Subtitle Text
    sub_font_scale = 0.48
    (sw, sh), _ = cv2.getTextSize(status_msg, font, sub_font_scale, 1)
    sub_x = (width - sw) // 2
    sub_y = card_y1 + 108
    cv2.putText(frame, status_msg, (sub_x, sub_y), font, sub_font_scale, (0, 185, 255), 1, cv2.LINE_AA)

    ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return jpeg.tobytes()

def mjpeg_presence_generator(camera_id: str, company_id: str, camera_name: Optional[str] = None):
    logger.info(f"Client started viewing presence stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id, camera_name=camera_name)
    stream.presence_enabled = True
    
    display_name = camera_name or getattr(stream, "camera_name", None) or camera_id
    if display_name == camera_id and getattr(stream, "camera_name", None) and stream.camera_name != camera_id:
        display_name = stream.camera_name

    gui_period = 1.0 / MJPEG_STREAM_FPS_RECOGNITION
    placeholder_bytes = make_dark_placeholder(display_name)
    
    stream.active_viewers += 1
    try:
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting presence generator: {camera_id}")
                break
            t_start = time.time()
            update_active_time(camera_id)
            
            jpeg_bytes = stream.get_presence_jpeg()
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
        logger.info(f"Client error in presence stream: {camera_id} ({e})")
    finally:
        stream.active_viewers = max(0, stream.active_viewers - 1)
        logger.info(f"Client stopped viewing presence stream: {camera_id}")

def mjpeg_recognition_generator(camera_id: str, company_id: str, camera_name: Optional[str] = None, stream_type: Optional[str] = None):
    logger.info(f"Client started viewing recognition stream: {camera_id} (type: {stream_type})")
    stream = get_stream_for_camera(camera_id, company_id, camera_name=camera_name)
    if stream_type:
        stream.stream_type = str(stream_type).strip().lower()
    
    display_name = camera_name or getattr(stream, "camera_name", None) or camera_id
    if display_name == camera_id and getattr(stream, "camera_name", None) and stream.camera_name != camera_id:
        display_name = stream.camera_name

    gui_period = 1.0 / MJPEG_STREAM_FPS_RECOGNITION
    placeholder_bytes = make_dark_placeholder(display_name)
    
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

def mjpeg_raw_generator(camera_id: str, company_id: str, camera_name: Optional[str] = None):
    logger.info(f"Client started viewing raw stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id, camera_name=camera_name)
    
    display_name = camera_name or getattr(stream, "camera_name", None) or camera_id
    gui_period = 1.0 / MJPEG_STREAM_FPS_RAW
    placeholder_bytes = make_dark_placeholder(display_name)
    
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

def mjpeg_enroll_generator(camera_id: str, camera_name: Optional[str] = None):
    logger.info(f"Client started viewing enroll stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, DEFAULT_COMPANY_ID, camera_name=camera_name)
    
    display_name = camera_name or getattr(stream, "camera_name", None) or "Laptop Camera"
    enroll_fps = float(os.getenv("MJPEG_STREAM_FPS_ENROLL", os.getenv("ENROLL_STREAM_FPS", "10.0")))
    gui_period = 1.0 / enroll_fps
    
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

            st = enroller.overlay_state()
            is_re_enroll = bool(st.get("re_enroll") or st.get("reEnroll") or ("re-enroll" in str(st.get("message") or "").lower()))
            status_text = "Starting re-enrollment..." if is_re_enroll else "Starting enrollment..."
            placeholder_bytes = make_dark_placeholder(display_name, status_msg=status_text)

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

@router.get("/camera/recognition/stream/{camera_id}")
def recognition_stream_by_id(
    camera_id: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    type: Optional[str] = Query(default=None, alias="type"),
    stream_type: Optional[str] = Query(default=None, alias="stream_type"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    st_type = type or stream_type
    return StreamingResponse(
        mjpeg_recognition_generator(camera_id, comp_id, stream_type=st_type),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive"
        }
    )

@router.get("/camera/recognition/stream/{camera_id}/{camera_name}")
def recognition_stream(
    camera_id: str,
    camera_name: str,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
    type: Optional[str] = Query(default=None, alias="type"),
    stream_type: Optional[str] = Query(default=None, alias="stream_type"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    st_type = type or stream_type
    return StreamingResponse(
        mjpeg_recognition_generator(camera_id, comp_id, camera_name=camera_name, stream_type=st_type),
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

@router.post("/camera/stop-all")
def stop_all_cameras():
    from app.services.stream_manager import streams, streams_lock, stop_camera_stream
    count = 0
    with streams_lock:
        cids = list(streams.keys())
    for cid in cids:
        if stop_camera_stream(cid):
            count += 1
    logger.info(f"[CAMERA_CONTROL] Stopped all active camera streams. Count={count}")
    return {"ok": True, "stoppedCount": count}

@router.post("/camera/stop/{camera_id}")
def stop_camera_by_id(camera_id: str):
    stopped = stop_camera_stream(camera_id)
    return {"ok": True, "cameraId": camera_id, "stopped": stopped}
