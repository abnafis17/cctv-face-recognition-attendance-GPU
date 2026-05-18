#!/usr/bin/env python3
import os
import sys
import time
import cv2
import json
import logging
import threading
import numpy as np
import requests
from typing import Optional, List, Dict
from dotenv import load_dotenv

from fastapi import FastAPI, Header, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure root of project is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Compatibility wrapper for camera_rt to bridge LiteCameraStream to EnrollmentAutoService2
class CameraRuntimeCompat:
    def get_frame(self, camera_id: str):
        with streams_lock:
            if camera_id in streams:
                return streams[camera_id].latest_raw_frame
        return None

camera_rt_compat = CameraRuntimeCompat()


def compute_iou(box1, box2):
    """
    Calculate Intersection over Union (IoU) of two bounding boxes [x1, y1, x2, y2].
    """
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2
    
    xi1 = max(x1_1, x1_2)
    yi1 = max(y1_1, y1_2)
    xi2 = min(x2_1, x2_2)
    yi2 = min(y2_1, y2_2)
    
    inter_w = max(0.0, xi2 - xi1)
    inter_h = max(0.0, yi2 - yi1)
    inter_area = inter_w * inter_h
    
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union_area = area1 + area2 - inter_area
    
    return inter_area / union_area if union_area > 0 else 0.0


# Lazily initialized enroller2_auto to save massive GPU VRAM on startup
enroller2_auto_inst = None

def get_enroller2_auto():
    global enroller2_auto_inst
    if enroller2_auto_inst is None:
        from app.enroll2_auto.service import EnrollmentAutoService2
        logger.info("Lazy-loading Auto-Enrollment Service on GPU...")
        enroller2_auto_inst = EnrollmentAutoService2(camera_rt=camera_rt_compat, model_name=os.getenv("INSIGHTFACE_MODEL", "buffalo_m"), min_face_size=30)
    return enroller2_auto_inst

# Load environmental variables
load_dotenv()

# Setup clean production logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("LiteAIServer")

# 1. Global Configurations
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://10.81.100.175:3001").strip()
DEFAULT_COMPANY_ID = os.getenv("BACKEND_COMPANY_ID", "cmk9dp01a0000vpskicoq1gj0").strip()
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
AI_FPS = float(os.getenv("AI_FPS", "3.0"))
OPENCV_VIEWER_FPS = float(os.getenv("OPENCV_VIEWER_FPS", "15.0"))
ATTENDANCE_COOLDOWN_S = float(os.getenv("ATTENDANCE_COOLDOWN_SECONDS", "60.0"))

FALLBACK_CAMERAS = {
    "entry_cam": "rtsp://admin:Nokia%4012@10.81.200.21:554/Streaming/Channels/102",
    "reception_cam_bb": "rtsp://admin:Nokia%40123@10.81.200.18:554/Streaming/Channels/101",
    "alleyway_1_bb": "rtsp://admin:Nokia%40123@10.81.200.13:554/cam/realmonitor?channel=1&subtype=0",
    "camera_1": "rtsp://admin:Nokia%4012@10.81.200.21:554/Streaming/Channels/102",
    "camera_2": "rtsp://admin:Nokia%40123@10.81.200.18:554/Streaming/Channels/101",
    "camera_3": "rtsp://admin:Nokia%40123@10.81.200.13:554/cam/realmonitor?channel=1&subtype=0"
}

# 2. Lazy-Load Face Models (Ensures fast startup)
detector = None
embedder = None
models_lock = threading.Lock()

def init_models():
    global detector, embedder
    with models_lock:
        if detector is not None:
            return
        logger.info("Initializing Face Detection & Embedding models on GPU...")
        from app.vision.insightface_models import FaceDetector, FaceEmbedder
        model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_m")
        det_model_name = os.getenv("AI_DETECTOR_MODEL", "buffalo_sc")
        detector = FaceDetector(model_name=det_model_name, use_gpu=True)
        embedder = FaceEmbedder(model_name=model_name, use_gpu=True)
        logger.info("InsightFace GPU Models initialized successfully.")

def get_l2_norm(emb):
    norm = np.linalg.norm(emb)
    return emb / norm if norm > 0 else emb

# 3. Dynamic Database Gallery Sync
gallery_templates = []
gallery_lock = threading.Lock()

def sync_gallery(company_id: str):
    global gallery_templates
    url = f"{BACKEND_BASE_URL}/api/v1/gallery/templates"
    headers = {"x-company-id": company_id}
    try:
        logger.info(f"Syncing gallery templates from backend: {url}...")
        res = requests.get(url, headers=headers, timeout=5.0)
        if res.status_code == 200:
            templates = res.json()
            loaded = []
            for t in templates:
                emp_id = t.get("employeeId") or t.get("employee_id") or ""
                name = t.get("employeeName") or t.get("employee_name") or emp_id
                emb_list = t.get("embedding")
                if emb_list and len(emb_list) >= 128:
                    emb = np.asarray(emb_list, dtype=np.float32)
                    emb = get_l2_norm(emb)
                    loaded.append({
                        "employee_id": emp_id,
                        "name": name,
                        "embedding": emb
                    })
            with gallery_lock:
                gallery_templates = loaded
            logger.info(f"Gallery synchronized: {len(gallery_templates)} templates loaded.")
        else:
            logger.error(f"Failed to load templates. Status: {res.status_code}")
    except Exception as e:
        logger.error(f"Gallery template sync failed: {e}. Running with empty/stale cache.")

# 4. Ingestion & Recognition Background Thread Reader
class LiteCameraStream:
    """
    Decoupled non-blocking reader and face recognition loop.
    Optimized for Jetson Orin Nano GPU/CPU.
    """
    def __init__(self, camera_id: str, rtsp_url: str, company_id: str):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.company_id = company_id
        
        self.latest_raw_frame = None
        self.latest_annotated_frame = None
        self.active_viewers = 0
        self.stopped = False
        
        # Track cooldowns for marking attendance
        self.attendance_cooldowns = {} # emp_id -> last_log_time
        
        # Camera Authorized Employee cache
        self.authorized_employee_ids = set()
        self.last_authorized_fetch = 0.0
        
        # Start Ingest thread (continuously drains RTSP frames to prevent OpenCV buffer build-up/latency)
        self.ingest_thread = threading.Thread(target=self._run_ingest, name=f"lite-ingest-{camera_id}", daemon=True)
        self.ingest_thread.start()
        
        # Start Processing thread (handles AI face detection & recognition at fixed AI_FPS rate)
        self.process_thread = threading.Thread(target=self._run_process, name=f"lite-process-{camera_id}", daemon=True)
        self.process_thread.start()
        logger.info(f"Background stream & processing threads started for camera: {camera_id}")

    def _run_ingest(self):
        logger.info(f"[INGEST] Dedicated ingestion loop started for camera: {self.camera_id}")
        cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        while not self.stopped:
            if not cap.isOpened():
                logger.warning(f"[INGEST] RTSP Stream disconnected for {self.camera_id}. Retrying in 2.0s...")
                time.sleep(2.0)
                cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                continue
                
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.005)
                continue
                
            self.latest_raw_frame = frame
            
        cap.release()
        logger.info(f"[INGEST] Ingestion thread stopped for camera: {self.camera_id}")

    def _refresh_authorized_employees(self):
        now = time.time()
        # Fetch/refresh every 10 seconds to keep it dynamic and fast without overloading the backend
        if now - self.last_authorized_fetch < 10.0:
            return
            
        try:
            url = f"{BACKEND_BASE_URL}/api/v1/cameras/{self.camera_id}/authorized-employees"
            headers = {"x-company-id": self.company_id}
            res = requests.get(url, headers=headers, timeout=2.0)
            if res.status_code == 200:
                data = res.json()
                raw_ids = data.get("authorizedEmployeeIds") or data.get("authorizedEmployeePublicIds") or []
                self.authorized_employee_ids = set(str(eid) for eid in raw_ids)
                self.last_authorized_fetch = now
                logger.info(f"[AUTH] Camera {self.camera_id} loaded {len(self.authorized_employee_ids)} authorized employees.")
        except Exception as e:
            logger.error(f"[AUTH] Failed to refresh authorized employees for camera {self.camera_id}: {e}")
            self.last_authorized_fetch = now

    def _run_process(self):
        logger.info(f"[PROCESS] Dedicated AI loop started for camera: {self.camera_id}")
        init_models()
        sync_gallery(self.company_id)
        
        last_ai_time = 0.0
        ai_period = 1.0 / AI_FPS
        last_gallery_sync = time.time()
        
        active_tracks = [] # tracks from the previous frames: [{"bbox": bbox, "emb": emb, "name": name, "emp_id": emp_id, "score": score, "last_embed_time": t}]
        
        while not self.stopped:
            frame = self.latest_raw_frame
            if frame is None:
                time.sleep(0.01)
                continue
                
            now = time.time()
            
            # Periodically sync gallery templates (every 60s) in a non-blocking background thread
            if now - last_gallery_sync >= 60.0:
                last_gallery_sync = now
                threading.Thread(target=sync_gallery, args=(self.company_id,), daemon=True).start()
                
            # Decoupled AI recognition processing rate
            if now - last_ai_time >= ai_period:
                last_ai_time = now
                self._refresh_authorized_employees()
                
                # Dynamic viewer activity check: only copy and draw overlays if someone is actively watching
                is_viewer_active = (now - last_active_times.get(self.camera_id, 0.0) < 5.0)
                if is_viewer_active:
                    annotated = frame.copy()
                else:
                    annotated = None
                    
                h, w = frame.shape[:2]
                
                # Perform Face Detection
                faces = detector.detect(frame)
                
                current_tracks = []
                
                for face in faces:
                    x1, y1, x2, y2 = [int(v) for v in face.bbox]
                    x1 = max(0, min(w - 1, x1))
                    y1 = max(0, min(h - 1, y1))
                    x2 = max(0, min(w, x2))
                    y2 = max(0, min(h, y2))
                    bbox = (x1, y1, x2, y2)
                    

                    # Attempt to find overlapping track from previous frame to reuse embedding
                    matched_track = None
                    best_iou = 0.0
                    for track in active_tracks:
                        iou = compute_iou(bbox, track["bbox"])
                        if iou > 0.35 and iou > best_iou:
                            best_iou = iou
                            matched_track = track
                            
                    # If we found a track, and the embedding is fresh (less than 1.5s old), we reuse it!
                    reuse_matched = False
                    if matched_track is not None and (now - matched_track["last_embed_time"] < 1.5):
                        emb = matched_track["emb"]
                        matched_name = matched_track["name"]
                        match_score = matched_track["score"]
                        matched_emp_id = matched_track["emp_id"]
                        last_embed_time = matched_track["last_embed_time"]
                        reuse_matched = True
                        
                    if not reuse_matched:
                        # Extract Embedding and Compare Cosine Similarity
                        emb = embedder.embed(frame, bbox=bbox, kps=face.kps)
                        matched_name = "Unknown"
                        match_score = -1.0
                        matched_emp_id = None
                        best_name = "Unknown"
                        best_score = 0.0
                        last_embed_time = now
                        
                        if emb is not None:
                            with gallery_lock:
                                templates = list(gallery_templates)
                                
                            best_idx = -1
                            for idx, t in enumerate(templates):
                                score = float(np.dot(t["embedding"], emb))
                                if score > best_score:
                                    best_score = score
                                    best_idx = idx
                                    
                            if best_idx != -1:
                                best_name = templates[best_idx]["name"]
                                matched_emp_id = templates[best_idx]["employee_id"]

                            if best_score >= SIMILARITY_THRESHOLD:
                                matched_name = best_name
                                match_score = best_score
                                
                    # Determine authorization status for this particular camera
                    is_authorized = True
                    has_auth_list = len(self.authorized_employee_ids) > 0
                    if matched_name != "Unknown" and matched_emp_id:
                        if has_auth_list and matched_emp_id not in self.authorized_employee_ids:
                            is_authorized = False

                    # Store to current tracks
                    current_tracks.append({
                        "bbox": bbox,
                        "emb": emb,
                        "name": matched_name,
                        "emp_id": matched_emp_id,
                        "score": match_score,
                        "last_embed_time": last_embed_time,
                        "is_authorized": is_authorized
                    })
                    
                    # Trigger Non-Blocking Attendance Log only if employee is authorized for this camera
                    if matched_emp_id and is_authorized:
                        self._trigger_attendance(matched_emp_id, match_score)
                        
                    # Draw visual results only if viewer is active
                    if annotated is not None:
                        if matched_name != "Unknown":
                            if is_authorized:
                                color = (130, 190, 78) # Premium Emerald (BGR: 130, 190, 78) for Authorized
                                label = f"{matched_name} ({match_score:.2f})"
                            else:
                                color = (60, 60, 240) # Crimson Red (BGR: 60, 60, 240) for Unauthorized
                                label = f"Unauthorized: {matched_name}"
                        else:
                            color = (60, 60, 240) # Crimson Red (BGR: 60, 60, 240) for Unknown
                            label = "Unknown"
                            
                        # Draw sleek premium bounding box
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        
                        # High-readability font scale (0.55) and bold/thick font text sizes
                        label_sz, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.55, 1)
                        
                        # Slate Black background for professional high-contrast readability
                        y_top = max(y1 - label_sz[1] - 12, 0)
                        bg_color = (28, 28, 28)
                        cv2.rectangle(annotated, (x1, y_top), (x1 + label_sz[0] + 12, y_top + label_sz[1] + 12), bg_color, cv2.FILLED)
                        # Connect accent border outline to the box
                        cv2.rectangle(annotated, (x1, y_top), (x1 + label_sz[0] + 12, y_top + label_sz[1] + 12), color, 1)
                        
                        # Render sharp white text over the slate dark background
                        cv2.putText(annotated, label, (x1 + 6, y_top + label_sz[1] + 6), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
                
                # Keep active tracks updated for the next frame
                active_tracks = current_tracks
                self.latest_annotated_frame = annotated
                
            time.sleep(0.002) # Yield CPU
            
        logger.info(f"[PROCESS] AI thread stopped for camera: {self.camera_id}")

    def _trigger_attendance(self, emp_id: str, score: float):
        now = time.time()
        last_logged = self.attendance_cooldowns.get(emp_id, 0.0)
        if now - last_logged >= ATTENDANCE_COOLDOWN_S:
            self.attendance_cooldowns[emp_id] = now
            # Submit POST in non-blocking background thread
            threading.Thread(
                target=self._submit_attendance_api,
                args=(emp_id, score),
                daemon=True
            ).start()

    def _submit_attendance_api(self, emp_id: str, score: float):
        url = f"{BACKEND_BASE_URL}/api/v1/attendance"
        headers = {
            "Content-Type": "application/json",
            "x-company-id": self.company_id
        }
        payload = {
            "employeeId": emp_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "cameraId": self.camera_id,
            "confidence": score,
            "type": "attendance"
        }
        try:
            logger.info(f"[ATTENDANCE] Pushing event to backend for employee: {emp_id} (conf: {score:.2f})")
            res = requests.post(url, headers=headers, json=payload, timeout=3.0)
            if res.status_code == 200 or res.status_code == 201:
                logger.info(f"[ATTENDANCE] Logged successfully: {emp_id}")
            else:
                logger.error(f"[ATTENDANCE] Failed to log. Code: {res.status_code}, Msg: {res.text}")
        except Exception as e:
            logger.error(f"[ATTENDANCE] Error posting attendance event: {e}")

    def stop(self):
        self.stopped = True

# 5. Global Camera Stream Manager (With Auto-Sleep)
streams: Dict[str, LiteCameraStream] = {}
streams_lock = threading.Lock()
last_active_times: Dict[str, float] = {}

def get_stream_for_camera(camera_id: str, company_id: str, rtsp_url: Optional[str] = None) -> LiteCameraStream:
    global streams
    
    if not rtsp_url:
        # 1. Resolve RTSP URL dynamically from backend API, or local fallback
        rtsp_url = FALLBACK_CAMERAS.get(camera_id)
        try:
            url = f"{BACKEND_BASE_URL}/api/v1/cameras"
            headers = {"x-company-id": company_id}
            res = requests.get(url, headers=headers, timeout=2.0)
            if res.status_code == 200:
                db_cameras = res.json()
                for dc in db_cameras:
                    dc_id = dc.get("id") or dc.get("camId") or ""
                    dc_url = dc.get("rtspUrl") or dc.get("url") or ""
                    if dc_id == camera_id and dc_url:
                        rtsp_url = dc_url
                        break
        except Exception as e:
            logger.warning(f"Failed to query backend camera catalog: {e}. Using fallbacks.")
            
        if not rtsp_url:
            # Final default fallback if camera is not found
            rtsp_url = FALLBACK_CAMERAS.get("entry_cam")
        
    with streams_lock:
        last_active_times[camera_id] = time.time()
        if camera_id not in streams or streams[camera_id].stopped:
            streams[camera_id] = LiteCameraStream(camera_id, rtsp_url, company_id)
        return streams[camera_id]

# Auto-sleep background cleaner (Stops streams inactive for more than 60 seconds)
def auto_sleep_inactive_streams():
    global streams
    while True:
        time.sleep(10.0)
        now = time.time()
        with streams_lock:
            to_remove = []
            for cid, last_t in list(last_active_times.items()):
                if cid in streams and (now - last_t > 60.0):
                    logger.info(f"Auto-Sleep: Stopping idle stream reader for camera: {cid}")
                    streams[cid].stop()
                    to_remove.append(cid)
            for cid in to_remove:
                del streams[cid]
                del last_active_times[cid]

# threading.Thread(target=auto_sleep_inactive_streams, name="auto-sleep", daemon=True).start()

# 6. Unified FastAPI App
app = FastAPI(title="CCTV Attendance Pro AI Server", version="1.5")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/health")
def health():
    return {"status": "healthy", "service": "CCTV-Lite-AI-Server"}

@app.api_route("/camera/start", methods=["GET", "POST"])
def start_camera(
    camera_id: str,
    rtsp_url: str,
    camera_name: Optional[str] = None,
    ai_fps: Optional[float] = None,
    company_id: Optional[str] = Query(default=None, alias="companyId"),
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    logger.info(f"Received start camera request: {camera_id} -> {rtsp_url}")
    
    # Initialize the camera background stream immediately
    stream = get_stream_for_camera(camera_id, comp_id, rtsp_url=rtsp_url)
    
    return {
        "ok": True,
        "startedNow": True,
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "camera_name": camera_name or camera_id,
        "recognition_running": True,
        "attendance_enabled": True
    }

@app.api_route("/camera/stop", methods=["GET", "POST"])
def stop_camera(
    camera_id: str,
):
    logger.info(f"Received stop camera request: {camera_id}")
    with streams_lock:
        if camera_id in streams:
            streams[camera_id].stop()
            del streams[camera_id]
            if camera_id in last_active_times:
                del last_active_times[camera_id]
            was_running = True
        else:
            was_running = False
            
    return {
        "ok": True,
        "stoppedNow": was_running,
        "camera_id": camera_id
    }

@app.post("/camera/recognition/prewarm")
def prewarm(background_tasks: BackgroundTasks, x_company_id: Optional[str] = Header(default=None, alias="x-company-id")):
    cid = "entry_cam"
    comp_id = x_company_id or DEFAULT_COMPANY_ID
    background_tasks.add_task(get_stream_for_camera, cid, comp_id)
    return {"ok": True, "queued": True, "camera_id": cid}

@app.get("/camera/recognition/refresh")
def refresh_templates(x_company_id: Optional[str] = Header(default=None, alias="x-company-id")):
    comp_id = x_company_id or DEFAULT_COMPANY_ID
    sync_gallery(comp_id)
    return {"ok": True, "templates": len(gallery_templates)}


def mjpeg_recognition_generator(camera_id: str, company_id: str):
    logger.info(f"Client started viewing recognition stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id)
    
    gui_period = 1.0 / OPENCV_VIEWER_FPS
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    try:
        while True:
            t_start = time.time()
            
            # Keep stream active timestamp alive
            last_active_times[camera_id] = t_start
            
            frame = stream.latest_annotated_frame
            if frame is None:
                # Still connecting, yield placeholder
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
            else:
                ret, jpeg = cv2.imencode(".jpg", frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client stopped viewing recognition stream: {camera_id} ({e})")

def mjpeg_raw_generator(camera_id: str, company_id: str):
    logger.info(f"Client started viewing raw stream: {camera_id}")
    stream = get_stream_for_camera(camera_id, company_id)
    
    gui_period = 1.0 / OPENCV_VIEWER_FPS
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    try:
        while True:
            t_start = time.time()
            last_active_times[camera_id] = t_start
            
            frame = stream.latest_raw_frame
            if frame is None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
            else:
                ret, jpeg = cv2.imencode(".jpg", frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client stopped viewing raw stream: {camera_id} ({e})")

@app.get("/camera/recognition/stream/{camera_id}/{camera_name}")
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

@app.get("/camera/stream/{camera_id}")
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

def mjpeg_enroll_generator(camera_id: str):
    logger.info(f"Client started viewing enroll stream: {camera_id}")
    # Auto start camera if not already active to ensure enrollment frames flow
    stream = get_stream_for_camera(camera_id, DEFAULT_COMPANY_ID)
    
    gui_period = 1.0 / 12.0 # Enroll FPS is typically 12 FPS
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    try:
        from app.enroll2_auto.hud import draw_enroll2_auto_hud
        enroller = get_enroller2_auto()
        
        while True:
            t_start = time.time()
            last_active_times[camera_id] = t_start
            
            frame = stream.latest_raw_frame
            if frame is None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')
            else:
                # Copy frame to draw HUD safely
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

                ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)
                
    except Exception as e:
        logger.info(f"Client stopped viewing enroll stream: {camera_id} ({e})")

class Enroll2AutoStartPayload(BaseModel):
    employeeId: str
    name: str
    cameraId: str

@app.post("/enroll2/auto/session/start")
def enroll2_auto_session_start(
    payload: Enroll2AutoStartPayload,
    x_company_id: Optional[str] = Header(default=None, alias="x-company-id"),
):
    employee_id = payload.employeeId.strip()
    name = payload.name.strip()
    camera_id = payload.cameraId.strip()

    if not employee_id or not name or not camera_id:
        return {"ok": False, "error": "employeeId, name, cameraId are required"}

    # Dynamic backend client configuration inside enroller
    enroller = get_enroller2_auto()
    enroller.client.set_company_id(x_company_id or DEFAULT_COMPANY_ID)

    s = enroller.start(
        employee_id=employee_id,
        name=name,
        camera_id=camera_id,
        company_id=x_company_id,
    )
    return {"ok": True, "session": s.__dict__}

@app.get("/enroll2/auto/session/status")
def enroll2_auto_session_status():
    enroller = get_enroller2_auto()
    s = enroller.status()
    return {"ok": True, "session": (s.__dict__ if s else None)}

@app.post("/enroll2/auto/session/stop")
def enroll2_auto_session_stop():
    enroller = get_enroller2_auto()
    stopped = enroller.stop()
    s = enroller.status()
    return {"ok": True, "stopped": stopped, "session": (s.__dict__ if s else None)}

@app.get("/camera/enroll2/auto/stream/{camera_id}")
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

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("AI_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("AI_SERVER_PORT", "8000"))
    logger.info(f"Starting Lite AI Server on {host}:{port}...")
    uvicorn.run(app, host=host, port=port, log_config=None)
