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
import threading
import requests
import numpy as np
from typing import Optional, List, Dict

from app.core.config import (
    BACKEND_BASE_URL,
    SIMILARITY_THRESHOLD,
    AI_FPS,
    ATTENDANCE_COOLDOWN_S,
    BODY_PERSISTENCE_ENABLED,
    MJPEG_RAW_JPEG_QUALITY,
    MJPEG_RECOGNITION_JPEG_QUALITY,
)
from app.core.logging import logger
from app.vision.body_tracker import BodyTracker, face_belongs_to_body, draw_polygon_body_bbox
from app.utils import open_capture_with_fallback
from app.services.model_manager import init_models, get_detector, get_embedder, get_body_detector
from app.services.gallery import sync_gallery, get_gallery_templates

# Compatibility wrapper for camera_rt to bridge LiteCameraStream to EnrollmentAutoService2
class CameraRuntimeCompat:
    def get_frame(self, camera_id: str):
        from app.services.stream_manager import get_stream_by_id
        stream = get_stream_by_id(camera_id)
        if stream:
            return stream.latest_raw_frame
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
        self.latest_frame_time = 0.0
        self.active_viewers = 0
        self.stopped = False
        self.cap = None
        
        # JPEG encoding lock and cache
        self.jpeg_lock = threading.Lock()
        self._cached_raw_jpeg = None
        self._cached_raw_frame_time = 0.0
        self._cached_annotated_jpeg = None
        self._cached_annotated_frame_time = 0.0
        
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

    def get_latest_raw_jpeg(self) -> Optional[bytes]:
        frame = self.latest_raw_frame
        if frame is None:
            return None
            
        frame_time = self.latest_frame_time
        
        with self.jpeg_lock:
            if self._cached_raw_frame_time == frame_time and self._cached_raw_jpeg is not None:
                return self._cached_raw_jpeg
                
            ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RAW_JPEG_QUALITY])
            if ret_jpeg:
                self._cached_raw_jpeg = jpeg_bytes.tobytes()
                self._cached_raw_frame_time = frame_time
                return self._cached_raw_jpeg
        return None

    def get_latest_annotated_jpeg(self) -> Optional[bytes]:
        frame = self.latest_raw_frame
        if frame is None:
            return None
            
        frame_time = self.latest_frame_time
        
        with self.jpeg_lock:
            if self._cached_annotated_frame_time == frame_time and self._cached_annotated_jpeg is not None:
                return self._cached_annotated_jpeg
                
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
                self._cached_annotated_jpeg = jpeg_bytes.tobytes()
                self._cached_annotated_frame_time = frame_time
                return self._cached_annotated_jpeg
        return None

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
            self.latest_frame_time = time.time()
            
            last_frame_time = self.latest_frame_time
            
        if self.cap:
            self.cap.release()
            self.cap = None
        logger.info(f"[INGEST] Ingestion thread stopped for camera: {self.camera_id}")

    def _refresh_authorized_employees(self):
        now = time.time()
        if now - self.last_authorized_fetch < 10.0:
            return
            
        self.last_authorized_fetch = now
        
        def _fetch():
            try:
                url = f"{BACKEND_BASE_URL}/api/v1/cameras/{self.camera_id}/authorized-employees"
                headers = {"x-company-id": self.company_id}
                res = requests.get(url, headers=headers, timeout=5.0)
                if res.status_code == 200:
                    data = res.json()
                    raw_ids = list(data.get("authorizedEmployeeIds") or []) + list(data.get("authorizedEmployeePublicIds") or [])
                    self.authorized_employee_ids = set(str(eid).strip() for eid in raw_ids if eid)
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
        
        detector = get_detector()
        body_detector = get_body_detector()
        
        while not self.stopped:
            now = time.time()
            
            if now - last_gp_sync >= 2.0:
                last_gp_sync = now
                threading.Thread(target=self._sync_and_log_recognized_persons, daemon=True).start()
                
            frame = self.latest_raw_frame
            if frame is None:
                time.sleep(0.01)
                continue
                
            if now - last_gallery_sync >= 60.0:
                last_gallery_sync = now
                threading.Thread(target=sync_gallery, args=(self.company_id,), daemon=True).start()
                
            if now - last_ai_time >= ai_period:
                last_ai_time = now
                self._refresh_authorized_employees()
                
                h, w = frame.shape[:2]
                
                faces = detector.detect(frame)
                
                if BODY_PERSISTENCE_ENABLED:
                    bodies = body_detector.detect(frame)
                    self.body_tracker.update(bodies)
                    
                    for face in faces:
                        fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                        fx1 = max(0, min(w - 1, fx1))
                        fy1 = max(0, min(h - 1, fy1))
                        fx2 = max(0, min(w, fx2))
                        fy2 = max(0, min(h, fy2))
                        face_bbox = (fx1, fy1, fx2, fy2)
                        
                        matched_track = None
                        for track in self.body_tracker.tracks:
                            if face_belongs_to_body(face_bbox, track.bbox):
                                matched_track = track
                                break
                                
                        if matched_track is not None:
                            self._process_recognition(frame, face, face_bbox, matched_track, now)
                else:
                    from app.vision.body_detector import BodyDetection
                    face_dets = []
                    for face in faces:
                        fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                        fx1 = max(0, min(w - 1, fx1))
                        fy1 = max(0, min(h - 1, fy1))
                        fx2 = max(0, min(w, fx2))
                        fy2 = max(0, min(h, fy2))
                        face_dets.append(BodyDetection(bbox=(fx1, fy1, fx2, fy2), conf=face.det_score))
                        
                    self.body_tracker.update(face_dets)
                    
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
                            
            time.sleep(0.002)
            
        logger.info(f"[PROCESS] AI thread stopped for camera: {self.camera_id}")

    def _process_recognition(self, frame, face, face_bbox, matched_track, now):
        embedder = get_embedder()
        if matched_track.should_recognize(now, recheck_interval=self.body_tracker.recheck_interval):
            emb = embedder.embed(frame, bbox=face_bbox, kps=face.kps)
            
            if emb is not None:
                templates = get_gallery_templates()
                    
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
                    
                    matched_track.name = best_name
                    matched_track.emp_id = matched_emp_id
                    matched_track.score = best_score
                    
                    is_authorized = True
                    has_auth_list = len(self.authorized_employee_ids) > 0
                    if has_auth_list and matched_emp_id not in self.authorized_employee_ids:
                        is_authorized = False
                    matched_track.is_authorized = is_authorized
                else:
                    # If it was previously recognized, but now the similarity is low,
                    # we should reset it to Unknown to prevent locking onto a false identity.
                    # We use a small buffer (e.g. SIMILARITY_THRESHOLD - 0.08) to prevent flickering.
                    if matched_track.name != "Unknown" and max_score < (SIMILARITY_THRESHOLD - 0.08):
                        logger.warning(
                            f"[TRACK] Resetting track {matched_track.track_id} from {matched_track.name} "
                            f"back to Unknown due to low similarity ({max_score:.2f})"
                        )
                        matched_track.name = "Unknown"
                        matched_track.emp_id = None
                        matched_track.score = -1.0
                        matched_track.is_authorized = True
                    
            matched_track.last_recognize_time = now
            
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
                
                filtered = []
                for p in self.recognized_persons:
                    emp_id = p["employeeId"]
                    if emp_id not in checked_out_ids:
                        filtered.append(p)
                
                self.recognized_persons = filtered
                
                templates = get_gallery_templates()
                id_to_name = {t["employee_id"]: t["name"] for t in templates}
                
                output_list = []
                for p in self.recognized_persons:
                    emp_id = p["employeeId"]
                    name = id_to_name.get(emp_id, emp_id)
                    output_list.append({
                        "employeeId": emp_id,
                        "name": name,
                        "timestamp": p["timestamp"]
                    })
                
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
        with self.jpeg_lock:
            self._cached_raw_jpeg = None
            self._cached_raw_frame_time = 0.0
            self._cached_annotated_jpeg = None
            self._cached_annotated_frame_time = 0.0
        self.recognized_persons = []
        self.attendance_cooldowns = {}
        self.last_logged_recognized_str = ""

    def inject_frame(self, frame):
        if frame is not None and frame.ndim == 3 and frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
        self.latest_raw_frame = frame
        self.latest_frame_time = time.time()
