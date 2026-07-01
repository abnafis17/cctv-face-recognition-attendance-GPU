#!/usr/bin/env python3
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
import json
import logging
import threading
import asyncio
import numpy as np
import requests
from typing import Optional, List, Dict
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI, Header, Query, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# pyrefly: ignore [missing-import]
from aiortc import RTCPeerConnection, RTCSessionDescription

# pyrefly: ignore [missing-import]
from aiortc.sdp import candidate_from_sdp

# Set low-delay environment variables for OpenCV FFmpeg backend globally
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|fflags;nobuffer|flags;low_delay"

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.vision.body_tracker import BodyTracker, face_belongs_to_body, draw_polygon_body_bbox
from app.utils import open_capture_with_fallback


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

# Setup clean production logs (WARNING level to make streaming log-free & lag-free)
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("LiteAIServer")

# 1. Global Configurations
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://10.81.100.175:3001").strip()
DEFAULT_COMPANY_ID = os.getenv("BACKEND_COMPANY_ID", "cmr06hyac0004tb7uwg0m3tjo").strip()
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
AI_FPS = float(os.getenv("AI_FPS", "3.0"))
OPENCV_VIEWER_FPS = float(os.getenv("OPENCV_VIEWER_FPS", "25.0"))
ATTENDANCE_COOLDOWN_S = float(os.getenv("ATTENDANCE_COOLDOWN_SECONDS", "60.0"))
BODY_PERSISTENCE_ENABLED = os.getenv("BODY_PERSISTENCE_ENABLED", "0").strip() != "0"
MJPEG_RAW_JPEG_QUALITY = int(os.getenv("MJPEG_RAW_JPEG_QUALITY", "60"))
MJPEG_RECOGNITION_JPEG_QUALITY = int(os.getenv("MJPEG_RECOGNITION_FALLBACK_JPEG_QUALITY", "60"))

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
body_detector = None
models_lock = threading.Lock()

def init_models():
    global detector, embedder, body_detector
    with models_lock:
        if detector is not None:
            return
        logger.info("Initializing Face Detection & Embedding models on GPU...")
        from app.vision.insightface_models import FaceDetector, FaceEmbedder
        model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_m")
        det_model_name = os.getenv("AI_DETECTOR_MODEL", "buffalo_sc")
        detector = FaceDetector(model_name=det_model_name, use_gpu=True)
        embedder = FaceEmbedder(model_name=model_name, use_gpu=True)
        if BODY_PERSISTENCE_ENABLED:
            from app.vision.body_detector import UniversalBodyDetector
            body_detector = UniversalBodyDetector()
            logger.info("InsightFace GPU Models & Body Detector initialized successfully.")
        else:
            logger.info("InsightFace GPU Models initialized successfully. (Body Detector Disabled)")

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
        logger.warning(f"Syncing gallery templates from backend: {url}...")
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
            logger.warning(f"Gallery synchronized: {len(gallery_templates)} templates loaded.")
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
        self.latest_raw_jpeg = None
        self.latest_annotated_jpeg = None
        self.active_viewers = 0
        self.stopped = False
        self.cap = None
        
        # Track cooldowns for marking attendance
        self.attendance_cooldowns = {} # emp_id -> last_log_time
        
        # Track recognized persons list
        self.recognized_persons = []
        self.last_logged_recognized_str = ""
        
        # Camera Authorized Employee cache
        self.authorized_employee_ids = set()
        self.last_authorized_fetch = 0.0
        
        # Body Tracker
        self.body_tracker = BodyTracker(recheck_interval=4.0)
        self.attendance_enabled = True
        self.stream_type = "attendance"
        
        # Start Ingest thread (continuously drains RTSP frames to prevent OpenCV buffer build-up/latency)
        self.ingest_thread = threading.Thread(target=self._run_ingest, name=f"lite-ingest-{camera_id}", daemon=True)
        self.ingest_thread.start()
        
        # Start Processing thread (handles AI face detection & recognition at fixed AI_FPS rate)
        self.process_thread = threading.Thread(target=self._run_process, name=f"lite-process-{camera_id}", daemon=True)
        self.process_thread.start()
        logger.info(f"Background stream & processing threads started for camera: {camera_id}")

    def _run_ingest(self):
        if self.camera_id.startswith("laptop-") or self.camera_id == "laptop_camera" or self.rtsp_url == "webrtc":
            logger.info(f"[INGEST] WebRTC/Laptop frame source detected. Skipping RTSP capture for {self.camera_id}")
            return
            
        logger.info(f"[INGEST] Dedicated ingestion loop started for camera: {self.camera_id}")
        self.cap = open_capture_with_fallback(self.rtsp_url)
        last_frame_time = time.time()
        
        while not self.stopped:
            if not self.cap or not self.cap.isOpened():
                logger.warning(f"[INGEST] RTSP Stream not open for {self.camera_id}. Retrying in 10.0s...")
                time.sleep(10.0)
                if not self.stopped:
                    self.cap = open_capture_with_fallback(self.rtsp_url)
                    last_frame_time = time.time()
                continue
                
            ret, frame = self.cap.read()
            if not ret or frame is None:
                if time.time() - last_frame_time > 3.0:
                    logger.warning(f"[INGEST] RTSP Stream stale for 3.0s on {self.camera_id}. Reopening...")
                    if self.cap:
                        self.cap.release()
                    time.sleep(1.0)
                    if not self.stopped:
                        self.cap = open_capture_with_fallback(self.rtsp_url)
                        last_frame_time = time.time()
                else:
                    time.sleep(0.01)
                continue
                
            if frame is not None and frame.ndim == 3 and frame.shape[2] == 4:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            self.latest_raw_frame = frame
            
            # Dynamic viewer check: only encode/draw if we have active viewers
            now = time.time()
            is_viewer_active = (now - last_active_times.get(self.camera_id, 0.0) < 5.0)
            if self.active_viewers > 0 or is_viewer_active:
                # 1. Encode raw JPEG once
                ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RAW_JPEG_QUALITY])
                if ret_jpeg:
                    self.latest_raw_jpeg = jpeg_bytes.tobytes()
                    
                # 2. Draw overlays and encode annotated JPEG once at full ingest speed
                annotated = frame.copy()
                with self.body_tracker.lock:
                    tracks_copy = list(self.body_tracker.tracks)
                    
                for track in tracks_copy:
                    bx1, by1, bx2, by2 = track.bbox
                    if track.name != "Unknown":
                        if track.is_authorized:
                            color = (220, 180, 0) # Neon Cyan/Teal (BGR: 220, 180, 0)
                            label = f"{track.name} ({track.score:.2f})"
                        else:
                            color = (60, 60, 240) # Crimson Red (BGR: 60, 60, 240)
                            label = f"Unauthorized: {track.name}"
                    else:
                        color = (180, 190, 30) # Blue-Green/Teal BGR: (180, 190, 30)
                        label = "Unknown"
                        
                    # Draw body tracking boundary box
                    draw_polygon_body_bbox(annotated, track.bbox, color, 1)
                    
                    # Draw label text plate
                    label_sz, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.55, 1)
                    y_top = max(by1 - label_sz[1] - 12, 0)
                    bg_color = (28, 28, 28)
                    
                    cv2.rectangle(annotated, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), bg_color, cv2.FILLED)
                    cv2.rectangle(annotated, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), color, 1)
                    cv2.putText(annotated, label, (bx1 + 6, y_top + label_sz[1] + 6), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
                    
                ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RECOGNITION_JPEG_QUALITY])
                if ret_jpeg:
                    self.latest_annotated_jpeg = jpeg_bytes.tobytes()
            
            last_frame_time = now
            
        if self.cap:
            self.cap.release()
            self.cap = None
        logger.info(f"[INGEST] Ingestion thread stopped for camera: {self.camera_id}")

    def _refresh_authorized_employees(self):
        now = time.time()
        # Fetch/refresh every 10 seconds to keep it dynamic and fast without overloading the backend
        if now - self.last_authorized_fetch < 10.0:
            return
            
        # Set timestamp immediately to prevent spawning multiple threads
        self.last_authorized_fetch = now
        
        def _fetch():
            try:
                url = f"{BACKEND_BASE_URL}/api/v1/cameras/{self.camera_id}/authorized-employees"
                headers = {"x-company-id": self.company_id}
                res = requests.get(url, headers=headers, timeout=5.0)
                if res.status_code == 200:
                    data = res.json()
                    raw_ids = data.get("authorizedEmployeeIds") or data.get("authorizedEmployeePublicIds") or []
                    self.authorized_employee_ids = set(str(eid) for eid in raw_ids)
                    logger.info(f"[AUTH] Camera {self.camera_id} loaded {len(self.authorized_employee_ids)} authorized employees.")
            except Exception as e:
                logger.error(f"[AUTH] Failed to refresh authorized employees for camera {self.camera_id}: {e}")
                
        threading.Thread(target=_fetch, name=f"auth-sync-{self.camera_id}", daemon=True).start()

    def _run_process(self):
        logger.info(f"[PROCESS] Dedicated AI loop started for camera: {self.camera_id}")
        init_models()
        sync_gallery(self.company_id)
        
        last_ai_time = 0.0
        ai_period = 1.0 / AI_FPS
        last_gallery_sync = time.time()
        last_gp_sync = 0.0
        
        while not self.stopped:
            now = time.time()
            
            # Periodically sync gatepass status to console (every 2s) in a non-blocking thread
            if now - last_gp_sync >= 2.0:
                last_gp_sync = now
                threading.Thread(target=self._sync_and_log_recognized_persons, daemon=True).start()
                
            frame = self.latest_raw_frame
            if frame is None:
                time.sleep(0.01)
                continue
                
            # Periodically sync gallery templates (every 60s) in a non-blocking background thread
            if now - last_gallery_sync >= 60.0:
                last_gallery_sync = now
                threading.Thread(target=sync_gallery, args=(self.company_id,), daemon=True).start()
                
            # Decoupled AI recognition processing rate
            if now - last_ai_time >= ai_period:
                last_ai_time = now
                self._refresh_authorized_employees()
                
                pass
                    
                h, w = frame.shape[:2]
                
                # Detect faces first
                faces = detector.detect(frame)
                
                if BODY_PERSISTENCE_ENABLED:
                    # 1. Detect human bodies
                    bodies = body_detector.detect(frame)
                    
                    # 2. Update body tracker
                    self.body_tracker.update(bodies)
                    
                    # 3. Associate detected faces to body tracks
                    for face in faces:
                        fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                        fx1 = max(0, min(w - 1, fx1))
                        fy1 = max(0, min(h - 1, fy1))
                        fx2 = max(0, min(w, fx2))
                        fy2 = max(0, min(h, fy2))
                        face_bbox = (fx1, fy1, fx2, fy2)
                        
                        # Find matching body track
                        matched_track = None
                        for track in self.body_tracker.tracks:
                            if face_belongs_to_body(face_bbox, track.bbox):
                                matched_track = track
                                break
                                
                        if matched_track is not None:
                            self._process_recognition(frame, face, face_bbox, matched_track, now)
                else:
                    # Face tracking only (saves massive GPU/CPU resources!)
                    from app.vision.body_detector import BodyDetection
                    face_dets = []
                    for face in faces:
                        fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                        fx1 = max(0, min(w - 1, fx1))
                        fy1 = max(0, min(h - 1, fy1))
                        fx2 = max(0, min(w, fx2))
                        fy2 = max(0, min(h, fy2))
                        face_dets.append(BodyDetection(bbox=(fx1, fy1, fx2, fy2), conf=face.det_score))
                        
                    # Update tracker with face bounding boxes
                    self.body_tracker.update(face_dets)
                    
                    # Associate detected faces to face tracks using IoU
                    for face in faces:
                        fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                        fx1 = max(0, min(w - 1, fx1))
                        fy1 = max(0, min(h - 1, fy1))
                        fx2 = max(0, min(w, fx2))
                        fy2 = max(0, min(h, fy2))
                        face_bbox = (fx1, fy1, fx2, fy2)
                        
                        matched_track = None
                        for track in self.body_tracker.tracks:
                            if compute_iou(face_bbox, track.bbox) > 0.4:
                                matched_track = track
                                break
                                
                        if matched_track is not None:
                            self._process_recognition(frame, face, face_bbox, matched_track, now)

                pass
                
            time.sleep(0.002) # Yield CPU
            
        logger.info(f"[PROCESS] AI thread stopped for camera: {self.camera_id}")

    def _process_recognition(self, frame, face, face_bbox, matched_track, now):
        # Check if we should re-recognize
        if matched_track.should_recognize(now, recheck_interval=self.body_tracker.recheck_interval):
            emb = embedder.embed(frame, bbox=face_bbox, kps=face.kps)
            
            if emb is not None:
                with gallery_lock:
                    templates = list(gallery_templates)
                    
                best_idx = -1
                max_score = 0.0
                for idx, t in enumerate(templates):
                    score = float(np.dot(t["embedding"], emb))
                    if score > max_score:
                        max_score = score
                        best_idx = idx
                        
                if best_idx != -1 and max_score >= SIMILARITY_THRESHOLD:
                    best_name = templates[best_idx]["name"]
                    matched_emp_id = templates[best_idx]["employee_id"]
                    best_score = max_score
                    
                    # Update the track details only upon successful recognition match
                    matched_track.name = best_name
                    matched_track.emp_id = matched_emp_id
                    matched_track.score = best_score
                    
                    # Determine authorization status
                    is_authorized = True
                    has_auth_list = len(self.authorized_employee_ids) > 0
                    if has_auth_list and matched_emp_id not in self.authorized_employee_ids:
                        is_authorized = False
                    matched_track.is_authorized = is_authorized
                    
            # Update the last checked timestamp
            matched_track.last_recognize_time = now
            
        # Trigger Non-Blocking Attendance Log if identified and authorized
        if matched_track.emp_id and matched_track.is_authorized and self.attendance_enabled:
            self._trigger_attendance(matched_track.emp_id, matched_track.score)



    def _sync_and_log_recognized_persons(self):
        try:
            url = f"{BACKEND_BASE_URL}/api/v1/gatepass"
            headers = {
                "x-company-id": self.company_id
            }
            res = requests.get(url, headers=headers, timeout=2.0)
            if res.status_code == 200:
                gp_records = res.json()
                checked_out_ids = set()
                for gp in gp_records:
                    status = gp.get("status")
                    emp_pk = gp.get("employeePkId")
                    emp_code = gp.get("employeeId")
                    if status == "out":
                        if emp_pk: checked_out_ids.add(emp_pk)
                        if emp_code: checked_out_ids.add(emp_code)
                
                # Filter recognized_persons
                filtered = []
                for p in self.recognized_persons:
                    emp_id = p["employeeId"]
                    if emp_id not in checked_out_ids:
                        filtered.append(p)
                
                self.recognized_persons = filtered
                
                # Look up names from gallery_templates
                with gallery_lock:
                    id_to_name = {t["employee_id"]: t["name"] for t in gallery_templates}
                
                output_list = []
                for p in self.recognized_persons:
                    emp_id = p["employeeId"]
                    name = id_to_name.get(emp_id, emp_id)
                    output_list.append({
                        "employeeId": emp_id,
                        "name": name,
                        "timestamp": p["timestamp"]
                    })
                
                # Log list to console if changed
                current_str = str(output_list)
                if current_str != getattr(self, "last_logged_recognized_str", ""):
                    self.last_logged_recognized_str = current_str
                    logger.warning(f"[AI Server] Recognised persons list: {output_list}")
        except Exception as e:
            pass

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
            "type": getattr(self, "stream_type", "attendance")
        }
        try:
            logger.info(f"[ATTENDANCE] Pushing event to backend for employee: {emp_id} (conf: {score:.2f})")
            res = requests.post(url, headers=headers, json=payload, timeout=3.0)
            if res.status_code == 200 or res.status_code == 201:
                logger.info(f"[ATTENDANCE] Logged successfully: {emp_id}")
                
                # Update recognized_persons list
                emp_exists = False
                for item in self.recognized_persons:
                    if item["employeeId"] == emp_id:
                        item["timestamp"] = payload["timestamp"]
                        emp_exists = True
                        break
                if not emp_exists:
                    self.recognized_persons.append({
                        "employeeId": emp_id,
                        "timestamp": payload["timestamp"]
                    })
                self._sync_and_log_recognized_persons()
            else:
                logger.error(f"[ATTENDANCE] Failed to log. Code: {res.status_code}, Msg: {res.text}")
        except Exception as e:
            logger.error(f"[ATTENDANCE] Error posting attendance event: {e}")

    def stop(self):
        self.stopped = True
        if hasattr(self, 'cap') and self.cap is not None:
            self.cap.release()
            self.cap = None
        self.latest_raw_frame = None
        self.latest_raw_jpeg = None
        self.latest_annotated_jpeg = None
        self.recognized_persons = []
        self.attendance_cooldowns = {}
        self.last_logged_recognized_str = ""

    def inject_frame(self, frame):
        if frame is not None and frame.ndim == 3 and frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
        self.latest_raw_frame = frame
        
        now = time.time()
        is_viewer_active = (now - last_active_times.get(self.camera_id, 0.0) < 5.0)
        if self.active_viewers > 0 or is_viewer_active:
            ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RAW_JPEG_QUALITY])
            if ret_jpeg:
                self.latest_raw_jpeg = jpeg_bytes.tobytes()
                
            annotated = frame.copy()
            with self.body_tracker.lock:
                tracks_copy = list(self.body_tracker.tracks)
                
            for track in tracks_copy:
                bx1, by1, bx2, by2 = track.bbox
                if track.name != "Unknown":
                    if track.is_authorized:
                        color = (220, 180, 0)
                        label = f"{track.name} ({track.score:.2f})"
                    else:
                        color = (60, 60, 240)
                        label = f"Unauthorized: {track.name}"
                else:
                    color = (180, 190, 30)
                    label = "Unknown"
                    
                draw_polygon_body_bbox(annotated, track.bbox, color, 1)
                
                label_sz, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.55, 1)
                y_top = max(by1 - label_sz[1] - 12, 0)
                bg_color = (28, 28, 28)
                
                cv2.rectangle(annotated, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), bg_color, cv2.FILLED)
                cv2.rectangle(annotated, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), color, 1)
                cv2.putText(annotated, label, (bx1 + 6, y_top + label_sz[1] + 6), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
                
            ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RECOGNITION_JPEG_QUALITY])
            if ret_jpeg:
                self.latest_annotated_jpeg = jpeg_bytes.tobytes()

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
            new_stream = LiteCameraStream(camera_id, rtsp_url, company_id)
            streams[camera_id] = new_stream
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.warning("Pre-initializing AI models on startup to prevent GPU context race conditions...")
    init_models()
    logger.warning("AI models initialized successfully. Server is ready.")
    yield
    logger.warning("Shutting down Lite AI Server. Stopping all active camera streams...")
    with streams_lock:
        for camera_id, stream in list(streams.items()):
            try:
                stream.stop()
            except Exception as e:
                logger.error(f"Error stopping stream {camera_id}: {e}")
        streams.clear()
    logger.warning("All active camera streams stopped.")

# 6. Unified FastAPI App
app = FastAPI(title="CCTV Attendance Pro AI Server", version="1.5", lifespan=lifespan)

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

@app.websocket("/webrtc/signal")
async def webrtc_signal(ws: WebSocket):
    await ws.accept()
    logger.warning("[WebRTC] Signal WebSocket connection accepted.")

    pc: Optional[RTCPeerConnection] = None
    camera_id: Optional[str] = None
    max_ingest_fps = max(1.0, float(os.getenv("WEBRTC_INGEST_MAX_FPS", "30.0")))
    ingest_min_interval = 1.0 / max_ingest_fps

    try:
        while True:
            try:
                msg = await ws.receive_json()
                logger.warning(f"[WebRTC] Signal message received keys: {list(msg.keys())}")

                # Persistence: only update camera_id if present in message
                msg_cam_id = msg.get("cameraId")
                if msg_cam_id:
                    camera_id = str(msg_cam_id)

                if not camera_id:
                    # Ignore messages that don't tell us which camera they are for
                    continue

                company_from_msg = str(msg.get("companyId") or msg.get("company_id") or "").strip() or None
                comp_id = company_from_msg or DEFAULT_COMPANY_ID

                purpose = str(msg.get("purpose") or msg.get("intent") or "").strip().lower()
                ingest_only = False
                if purpose in {"enroll", "enrollment", "enroll2", "enroll2-auto", "presence"}:
                    ingest_only = True

                stream_type = msg.get("type") or msg.get("streamType") or msg.get("mode") or "attendance"

                # Ensure stream is instantiated
                stream = get_stream_for_camera(camera_id, comp_id, rtsp_url="webrtc")
                stream.stream_type = stream_type.strip().lower()
                stream.attendance_enabled = not ingest_only

                # SDP OFFER
                if "sdp" in msg:
                    try:
                        camera_id_for_connection = str(camera_id)
                        if pc:
                            try: await pc.close()
                            except: pass

                        pc = RTCPeerConnection()

                        @pc.on("track")
                        def on_track(track):
                            if track.kind != "video": return
                            logger.warning("[WebRTC] Video track received. Starting track loop...")

                            async def track_loop():
                                last_t = 0.0
                                while True:
                                    try:
                                        frame = await track.recv()
                                        now = time.monotonic()
                                        if (now - last_t) < ingest_min_interval:
                                            continue
                                        last_t = now

                                        def process_and_inject(f):
                                            img = f.to_ndarray(format="bgr24")
                                            with streams_lock:
                                                if camera_id_for_connection in streams:
                                                    streams[camera_id_for_connection].inject_frame(img)

                                        await asyncio.to_thread(process_and_inject, frame)
                                    except Exception as e:
                                        logger.warning(f"[WebRTC] Track loop exited: {e}")
                                        break

                            asyncio.create_task(track_loop())

                        offer = RTCSessionDescription(sdp=msg["sdp"]["sdp"], type=msg["sdp"]["type"])
                        await pc.setRemoteDescription(offer)
                        answer = await pc.createAnswer()
                        await pc.setLocalDescription(answer)

                        await ws.send_json({
                            "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp},
                            "cameraId": camera_id
                        })
                        logger.warning("[WebRTC] Sent SDP answer to client.")
                    except Exception as e:
                        logger.error(f"[WebRTC] SDP Error: {e}", exc_info=True)

                # ICE CANDIDATE
                elif "ice" in msg and pc:
                    try:
                        ice = msg["ice"]
                        if ice and ice.get("candidate"):
                            cand_str = ice["candidate"]
                            if cand_str.startswith("candidate:"):
                                cand_str = cand_str.split(":", 1)[1]
                            candidate = candidate_from_sdp(cand_str)
                            candidate.sdpMid = ice.get("sdpMid")
                            candidate.sdpMLineIndex = ice.get("sdpMLineIndex")
                            await pc.addIceCandidate(candidate)
                    except Exception as e:
                        logger.warning(f"[WebRTC] ICE Candidate Error: {e}")
            except WebSocketDisconnect:
                raise
            except Exception as e:
                if "disconnect" in str(e).lower():
                    logger.warning(f"[WebRTC] Signal WebSocket disconnected during loop: {e}")
                    break
                logger.error(f"[WebRTC] Signal Loop Error: {e}")
                continue

    except WebSocketDisconnect:
        logger.warning("[WebRTC] Signal WebSocket disconnected.")
    except Exception as e:
        logger.error(f"[WebRTC] Fatal WebSocket Connection Error: {e}")
    finally:
        if pc:
            try: await pc.close()
            except: pass
        if camera_id:
            with streams_lock:
                if camera_id in streams:
                    streams[camera_id].stop()
                    del streams[camera_id]
                    if camera_id in last_active_times:
                        del last_active_times[camera_id]

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
    stream_type: Optional[str] = Query(default=None, alias="stream_type"),
):
    comp_id = company_id or x_company_id or DEFAULT_COMPANY_ID
    logger.info(f"Received start camera request: {camera_id} -> {rtsp_url} (type: {stream_type})")
    
    # Initialize the camera background stream immediately
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
    
    stream.active_viewers += 1
    try:
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting recognition generator: {camera_id}")
                break
            t_start = time.time()
            last_active_times[camera_id] = t_start
            
            jpeg_bytes = stream.latest_annotated_jpeg
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
    
    gui_period = 1.0 / OPENCV_VIEWER_FPS
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    stream.active_viewers += 1
    try:
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting raw generator: {camera_id}")
                break
            t_start = time.time()
            last_active_times[camera_id] = t_start
            
            jpeg_bytes = stream.latest_raw_jpeg
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
    
    enroll_fps = float(os.getenv("ENROLL_STREAM_FPS", "25.0"))
    gui_period = 1.0 / enroll_fps
    placeholder_bytes = make_dark_placeholder(camera_id)
    
    try:
        from app.enroll2_auto.hud import draw_enroll2_auto_hud
        enroller = get_enroller2_auto()
        
        while True:
            if stream.stopped:
                logger.info(f"Stream stopped, exiting enroll generator: {camera_id}")
                break
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

@app.post("/attendance/enable")
def enable_attendance(camera_id: str):
    logger.info(f"Enabling attendance for camera {camera_id}")
    with streams_lock:
        if camera_id in streams:
            streams[camera_id].attendance_enabled = True
            streams[camera_id].recognized_persons = []
            streams[camera_id].attendance_cooldowns = {}
            streams[camera_id].last_logged_recognized_str = ""
            return {"ok": True, "enabled": True, "camera_id": camera_id}
        else:
            return {"ok": False, "error": f"Camera stream {camera_id} not running", "camera_id": camera_id}

@app.post("/attendance/disable")
def disable_attendance(camera_id: str):
    logger.info(f"Disabling attendance for camera {camera_id}")
    with streams_lock:
        if camera_id in streams:
            streams[camera_id].attendance_enabled = False
            streams[camera_id].recognized_persons = []
            streams[camera_id].attendance_cooldowns = {}
            streams[camera_id].last_logged_recognized_str = ""
            return {"ok": True, "enabled": False, "camera_id": camera_id}
        else:
            return {"ok": False, "error": f"Camera stream {camera_id} not running", "camera_id": camera_id}

@app.get("/attendance/enabled")
def get_attendance_enabled(camera_id: str):
    with streams_lock:
        if camera_id in streams:
            return {"ok": True, "enabled": streams[camera_id].attendance_enabled, "camera_id": camera_id}
        else:
            return {"ok": True, "enabled": False, "camera_id": camera_id}

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("AI_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("AI_SERVER_PORT", "8000"))
    logger.info(f"Starting Lite AI Server on {host}:{port}...")
    uvicorn.run(app, host=host, port=port, log_config=None, access_log=False, loop="asyncio")
