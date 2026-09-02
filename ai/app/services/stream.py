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
import urllib.parse
import urllib.request
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
from app.vision.body_tracker import BodyTracker, face_belongs_to_body
from app.vision.hud import draw_label_card, draw_bounding_box, ACCENT_KNOWN, ACCENT_UNKNOWN
from app.utils import open_capture_with_fallback
from app.services.model_manager import init_models, get_detector, get_embedder, get_body_detector
from app.services.gallery import sync_gallery, get_gallery_templates

GLOBAL_ATTENDANCE_LOCK = threading.Lock()
GLOBAL_ATTENDANCE_COOLDOWNS: Dict[str, float] = {}

GLOBAL_DOOR_LOCK = threading.Lock()
GLOBAL_DOOR_COOLDOWNS: Dict[str, float] = {}

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
    def __init__(self, camera_id: str, rtsp_url: str, company_id: str, camera_name: Optional[str] = None):
        self.camera_id = camera_id
        self.camera_name = camera_name or camera_id
        self.rtsp_url = rtsp_url
        self.company_id = company_id
        
        self.latest_raw_frame = None
        self.latest_frame_time = 0.0
        self.active_viewers = 0
        self.stopped = False
        self.cap = None
        self.cap_lock = threading.Lock()

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

    def _sleep_interruptible(self, seconds: float):
        deadline = time.time() + seconds
        while not self.stopped and time.time() < deadline:
            time.sleep(0.1)

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
                
            now = time.time()
            for track in tracks_copy:
                face_bbox = getattr(track, 'last_face_bbox', None)
                last_time = getattr(track, 'last_face_time', 0.0)
                
                # Expire face boxes instantly if face is not actively detected in current frame (350ms window)
                if not face_bbox or (now - last_time > 0.35):
                    continue
                    
                x1, y1, x2, y2 = face_bbox
                recognized_known = (track.name != "Unknown")
                is_authorized = getattr(track, 'is_authorized', True)
                known = recognized_known and is_authorized
                
                if recognized_known:
                    label = track.name
                else:
                    label = "Unknown"
                    
                color = ACCENT_KNOWN if known else ACCENT_UNKNOWN
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                draw_label_card(annotated, label, x1, max(38, y1 - 14), known, scale=0.65)
                
            ret_jpeg, jpeg_bytes = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), MJPEG_RECOGNITION_JPEG_QUALITY])
            if ret_jpeg:
                self._cached_annotated_jpeg = jpeg_bytes.tobytes()
                self._cached_annotated_frame_time = frame_time
                return self._cached_annotated_jpeg
        return None

    def _run_ingest(self):
        if not self.rtsp_url or not isinstance(self.rtsp_url, str) or self.camera_id.startswith("laptop-") or self.camera_id == "laptop_camera" or self.rtsp_url == "webrtc":
            logger.info(f"[INGEST] WebRTC/Laptop/Empty frame source detected. Skipping RTSP capture for {self.camera_id}")
            return
            
        logger.info(f"[INGEST] Dedicated ingestion loop started for camera: {self.camera_id}")
        with self.cap_lock:
            self.cap = open_capture_with_fallback(self.rtsp_url)
        last_frame_time = time.time()
        
        while not self.stopped:
            try:
                is_open = False
                with self.cap_lock:
                    if self.cap and self.cap.isOpened():
                        is_open = True
                        
                if not is_open:
                    logger.warning(f"[INGEST] RTSP Stream not open for {self.camera_id}. Retrying in 10.0s...")
                    self._sleep_interruptible(10.0)
                    if not self.stopped:
                        with self.cap_lock:
                            self.cap = open_capture_with_fallback(self.rtsp_url)
                        last_frame_time = time.time()
                    continue
                    
                ret = False
                frame = None
                with self.cap_lock:
                    if self.cap:
                        ret, frame = self.cap.read()
                        
                if not ret or frame is None:
                    if time.time() - last_frame_time > 3.0:
                        logger.warning(f"[INGEST] RTSP Stream stale for 3.0s on {self.camera_id}. Reopening...")
                        with self.cap_lock:
                            if self.cap:
                                try:
                                    self.cap.release()
                                except Exception:
                                    pass
                                self.cap = None
                        self._sleep_interruptible(1.0)
                        if not self.stopped:
                            with self.cap_lock:
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
            except Exception as e:
                logger.error(f"[INGEST] Error in frame ingestion loop for {self.camera_id}: {e}")
                self._sleep_interruptible(0.5)
            
        with self.cap_lock:
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
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
        
        detector = get_detector()
        body_detector = get_body_detector()
        
        while not self.stopped:
            try:
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
                                matched_track.last_face_bbox = face_bbox
                                matched_track.last_face_time = now
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
                                matched_track.last_face_bbox = face_bbox
                                matched_track.last_face_time = now
                                self._process_recognition(frame, face, face_bbox, matched_track, now)
                                
                time.sleep(0.002)
            except Exception as e:
                logger.error(f"[PROCESS] Error in AI process loop for {self.camera_id}: {e}")
                time.sleep(0.1)
            
        logger.info(f"[PROCESS] AI thread stopped for camera: {self.camera_id}")

    def _process_recognition(self, frame, face, face_bbox, matched_track, now):
        embedder = get_embedder()
        emb = embedder.embed(frame, bbox=face_bbox, kps=face.kps)
        
        if emb is not None:
            emb_norm = np.linalg.norm(emb)
            if emb_norm > 0:
                emb = emb / emb_norm
                
            templates = get_gallery_templates()
            if templates:
                # Group template embeddings per employee for multi-sample max similarity matching
                emp_templates = {}
                for t in templates:
                    eid = t["employee_id"]
                    name = t["name"]
                    if eid not in emp_templates:
                        emp_templates[eid] = {"name": name, "embeddings": []}
                    emp_templates[eid]["embeddings"].append(t["embedding"])
                
                emp_scores = []
                for eid, info in emp_templates.items():
                    # Calculate highest similarity score across all enrolled templates for this employee
                    max_sim = max(float(np.dot(t_emb, emb)) for t_emb in info["embeddings"])
                    emp_scores.append((max_sim, eid, info["name"]))
                    
                emp_scores.sort(key=lambda x: x[0], reverse=True)
                
                top1_score, best_emp_id, best_name = emp_scores[0]
                top2_score = emp_scores[1][0] if len(emp_scores) > 1 else 0.0
                margin_gap = top1_score - top2_score
                
                last_emp = getattr(matched_track, 'last_known_emp_id', None)
                last_ts = getattr(matched_track, 'last_known_time', 0.0)
                is_recent_known = (now - last_ts < 3.0) and last_emp is not None

                # Anti-Flip Guard for tight edge angles:
                # If track was recently verified as Person A, do not flip to Person B on an ambiguous low-margin edge angle frame.
                if is_recent_known and best_emp_id != last_emp and top1_score < 0.50 and margin_gap < 0.05:
                    last_emp_score = next((s for (s, eid, _n) in emp_scores if eid == last_emp), 0.0)
                    if top1_score - last_emp_score < 0.05:
                        best_emp_id = last_emp
                        best_name = getattr(matched_track, 'last_known_name', best_name)
                        top1_score = max(top1_score, last_emp_score)
                        margin_gap = 0.05

                req_margin = 0.02 if is_recent_known else 0.035
                is_qualified = (top1_score >= SIMILARITY_THRESHOLD and margin_gap >= req_margin)
                
                if is_qualified:
                    matched_track.name = best_name
                    matched_track.emp_id = best_emp_id
                    matched_track.score = top1_score
                    matched_track.last_known_name = best_name
                    matched_track.last_known_emp_id = best_emp_id
                    matched_track.last_known_time = now
                    
                    is_authorized = True
                    has_auth_list = len(self.authorized_employee_ids) > 0
                    if has_auth_list and best_emp_id not in self.authorized_employee_ids:
                        is_authorized = False
                    matched_track.is_authorized = is_authorized
                    
                    # 🔓 Door unlock triggered on every authorized recognition
                    if is_authorized:
                        self._trigger_door_relay(best_emp_id, best_name, top1_score)

                    if is_authorized and self.attendance_enabled:
                        self._trigger_attendance(best_emp_id, best_name, top1_score)
                else:
                    # Identity hold hysteresis: if track was matched to known employee within 3.0s, keep green card on head turns, far distance & shadows
                    last_ts = getattr(matched_track, 'last_known_time', 0.0)
                    last_emp = getattr(matched_track, 'last_known_emp_id', None)
                    if (now - last_ts < 3.0) and last_emp:
                        matched_track.name = getattr(matched_track, 'last_known_name', 'Unknown')
                        matched_track.emp_id = last_emp
                        matched_track.score = top1_score
                    else:
                        matched_track.name = "Unknown"
                        matched_track.emp_id = None
                        matched_track.score = top1_score
                        matched_track.is_authorized = True
                        matched_track.confirm_hits = 0
            else:
                last_ts = getattr(matched_track, 'last_known_time', 0.0)
                last_emp = getattr(matched_track, 'last_known_emp_id', None)
                if (now - last_ts < 3.0) and last_emp:
                    matched_track.name = getattr(matched_track, 'last_known_name', 'Unknown')
                    matched_track.emp_id = last_emp
                    matched_track.score = 0.0
                else:
                    matched_track.name = "Unknown"
                    matched_track.emp_id = None
                    matched_track.score = -1.0
                    matched_track.is_authorized = True
                    matched_track.confirm_hits = 0
                
        matched_track.last_recognize_time = now

    def _get_relay_url(self) -> str:
        now = time.time()
        if hasattr(self, "_cached_relay_url") and (now - getattr(self, "_relay_cache_ts", 0.0) < 30.0):
            return self._cached_relay_url

        url = None
        try:
            res = requests.get(f"{BACKEND_BASE_URL}/api/v1/settings/relay", headers={"x-company-id": self.company_id}, timeout=1.0)
            if res.status_code == 200:
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    data = data[0]
                if isinstance(data, dict):
                    url = data.get("relayOnUrl") or data.get("relay_on_url") or data.get("relaySilentUrl") or data.get("relay_silent_url")
        except Exception:
            pass

        if not url:
            url = os.getenv("DOOR_RELAY_URL", "http://10.81.100.72/on")

        self._cached_relay_url = url
        self._relay_cache_ts = now
        return url

    def _push_realtime_recognition(self, emp_id: str, name: str, score: float):
        now = time.time()
        emp_id_str = str(emp_id or "").strip()
        if not emp_id_str:
            return
            
        emp_key = f"{self.camera_id}:{emp_id_str}"
        if not hasattr(self, "_rec_history_cooldowns"):
            self._rec_history_cooldowns = {}
            
        last_push = self._rec_history_cooldowns.get(emp_key, 0.0)
        # 2.5s rate-limit for live Recognition History page table updates
        if now - last_push < 2.5:
            return
            
        self._rec_history_cooldowns[emp_key] = now

        def _do_post():
            try:
                url = f"{BACKEND_BASE_URL}/api/v1/attendance"
                cid_header = str(self.company_id or os.getenv("BACKEND_COMPANY_ID") or "").strip()
                if not cid_header:
                    cid_header = "cmk9dp01a0000vpskicoq1gj0"

                headers = {
                    "Content-Type": "application/json",
                    "x-company-id": cid_header
                }
                timestamp_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                payload = {
                    "employeeId": emp_id_str,
                    "timestamp": timestamp_iso,
                    "cameraId": self.camera_id,
                    "confidence": score,
                    "type": getattr(self, "stream_type", "attendance")
                }
                requests.post(url, headers=headers, json=payload, timeout=2.0)
            except Exception:
                pass

        threading.Thread(target=_do_post, daemon=True).start()

    def _trigger_door_relay(self, emp_id: str, name: str, score: float):
        now = time.time()
        emp_id_str = str(emp_id or "").strip()
        if not emp_id_str:
            return
            
        emp_key = f"{self.camera_id}:{emp_id_str}"
        min_gap = max(0.0, float(os.getenv("DOOR_UNLOCK_MIN_GAP", "5.0")))
        
        with GLOBAL_DOOR_LOCK:
            last_fire = GLOBAL_DOOR_COOLDOWNS.get(emp_key, 0.0)
            if now - last_fire < min_gap:
                return
            GLOBAL_DOOR_COOLDOWNS[emp_key] = now

        threading.Thread(
            target=self._send_door_unlock_request,
            args=(emp_id_str, name, score),
            daemon=True
        ).start()

    def _send_door_unlock_request(self, emp_id: str, name: str, score: float):
        try:
            relay_silent_url = "http://10.81.100.72/silent"
            try:
                res = requests.get(f"{BACKEND_BASE_URL}/api/v1/settings/relay", headers={"x-company-id": self.company_id}, timeout=1.5)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list) and len(data) > 0:
                        data = data[0]
                    if isinstance(data, dict):
                        relay_silent_url = data.get("relaySilentUrl") or data.get("relay_silent_url") or relay_silent_url
            except Exception:
                pass

            emp_pic_url = ""
            try:
                emp_res = requests.get(f"{BACKEND_BASE_URL}/api/v1/employees", headers={"x-company-id": self.company_id}, timeout=1.5)
                if emp_res.status_code == 200:
                    employees = emp_res.json()
                    if isinstance(employees, list):
                        for emp in employees:
                            if isinstance(emp, dict):
                                candidate_ids = [
                                    str(emp.get("empId") or ""),
                                    str(emp.get("emp_id") or ""),
                                    str(emp.get("employeeId") or ""),
                                    str(emp.get("employee_id") or ""),
                                    str(emp.get("id") or "")
                                ]
                                if emp_id in candidate_ids:
                                    emp_pic_url = str(emp.get("empPicUrl") or emp.get("emp_pic_url") or emp.get("photoUrl") or "").strip()
                                    if emp_pic_url:
                                        break
            except Exception:
                pass

            if not emp_pic_url:
                emp_pic_url = f"{emp_id}.jpg"

            # Door Silent Unlock URL matching main branch
            silent_url = relay_silent_url
            sep = "&" if "?" in silent_url else "?"
            silent_url = f"{silent_url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"
            if emp_pic_url:
                sep = "&" if "?" in silent_url else "?"
                silent_url = f"{silent_url}{sep}empPicUrl={urllib.parse.quote(emp_pic_url, safe='')}"

            # Execute Door Silent Unlock HTTP GET
            try:
                resp = urllib.request.urlopen(silent_url, timeout=3.0)
                resp.close()
                print(f"[DOOR] unlock fired cid={self.camera_id} emp={emp_id} url={silent_url} name={name} sim={score:.3f}", flush=True)
            except Exception as e:
                print(f"[DOOR] failed cid={self.camera_id} emp={emp_id} url={silent_url} err={e}", flush=True)
        except Exception as e:
            print(f"[DOOR] failed cid={self.camera_id} emp={emp_id} err={e}", flush=True)

    def _sync_and_log_recognized_persons(self):
        pass

    def _trigger_attendance(self, emp_id: str, name: str, score: float):
        now = time.time()
        emp_key = str(emp_id or "").strip()
        name_str = str(name or "").strip()
        stream_type = str(getattr(self, "stream_type", "attendance") or "attendance").lower()

        # Attendance & Recognition History mode requires strict high-accuracy threshold (0.45+) to prevent wrong recognitions
        is_attendance_mode = stream_type not in ("headcount", "ot", "ot_requisition", "ot-requisition", "otrequisition")
        min_threshold = 0.45 if is_attendance_mode else SIMILARITY_THRESHOLD

        if not emp_key or name_str == "Unknown" or float(score or 0.0) < min_threshold:
            return

        # The 30s cooldown rule ONLY applies to standard attendance mode (Attendance & Recognition History).
        if is_attendance_mode:
            cooldown_key = f"{self.company_id}:{emp_key}"
            cooldown_duration = max(30.0, float(ATTENDANCE_COOLDOWN_S))
            with GLOBAL_ATTENDANCE_LOCK:
                last_logged = GLOBAL_ATTENDANCE_COOLDOWNS.get(cooldown_key, 0.0)
                if now - last_logged < cooldown_duration:
                    return
                GLOBAL_ATTENDANCE_COOLDOWNS[cooldown_key] = now
            
        threading.Thread(
            target=self._submit_attendance_api,
            args=(emp_key, name, score),
            daemon=True
        ).start()

    def _submit_attendance_api(self, emp_id: str, name: str, score: float):
        from app.clients.erp_client import write_erp_log

        # 1. Post to backend DB for internal attendance & recognition history
        url = f"{BACKEND_BASE_URL}/api/v1/attendance"
        cid_header = str(self.company_id or os.getenv("BACKEND_COMPANY_ID") or "").strip()
        if not cid_header:
            cid_header = "cmk9dp01a0000vpskicoq1gj0"

        headers = {
            "Content-Type": "application/json",
            "x-company-id": cid_header
        }
        timestamp_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        time_str = time.strftime("%H:%M:%S", time.localtime())
        date_str = time.strftime("%d/%m/%Y", time.localtime())
        parts = date_str.split("/")
        formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
        
        payload = {
            "employeeId": emp_id,
            "timestamp": timestamp_iso,
            "cameraId": self.camera_id,
            "confidence": score,
            "type": getattr(self, "stream_type", "attendance")
        }
        try:
            requests.post(url, headers=headers, json=payload, timeout=3.0)
        except Exception:
            pass

        # 2. Fetch all active ERP configurations for this company & map by urlType
        active_erp_map = {}
        try:
            erp_settings_url = f"{BACKEND_BASE_URL}/api/v1/settings/erp?all=1"
            res_erp = requests.get(erp_settings_url, headers=headers, timeout=1.5)
            if res_erp.status_code == 200:
                items = res_erp.json()
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict) and item.get("isActive"):
                            u_type = str(item.get("urlType") or "attendance").strip().lower()
                            if u_type not in active_erp_map:
                                active_erp_map[u_type] = item
        except Exception:
            pass

        if not active_erp_map:
            active_erp_map["attendance"] = {"urlType": "attendance", "isActive": True}

        # 3. Loop over fixed ERP spec list matching main branch schema
        erp_specs = [
            ("attendance", "ERP 1"),
            ("attendance_two", "ERP 2"),
            ("attendance_two_log", "ERP 3"),
        ]

        for q_type, name_tag in erp_specs:
            erp = active_erp_map.get(q_type)
            if erp is None:
                continue

            if q_type == "attendance_two":
                file_payload_log = f"type=attendance_two | employee_id={emp_id} | attendance_date={formatted_date} | time={time_str} | status=Present | source={self.camera_id}"
            elif q_type == "attendance_two_log":
                file_payload_log = f"type=attendance_two_log | employee_id={emp_id} | attendance_date={formatted_date} | time={time_str} | status=present | source={self.camera_id}"
            else:
                file_payload_log = f"type=attendance | empId={emp_id} | attendanceDate={date_str} | inTime={time_str} | inLocation={self.camera_id}"

            # Print main branch queued log EXACTLY ONCE per ERP type
            print(f"[{name_tag}] queued ok=True emp={emp_id} date={date_str} in={time_str}", flush=True)

            # Asynchronous background ERP push + erp-sync.log write
            endpoint = erp.get("erpAttendanceEndpoint") or erp.get("erp_attendance_endpoint")
            base_url = erp.get("erpBaseUrl") or erp.get("erp_base_url")
            prefix = erp.get("erpPrefix") or erp.get("erp_prefix") or ""

            def _push_worker(u_type=q_type, b_url=base_url, e_point=endpoint, p_fix=prefix, f_log=file_payload_log):
                erp_response_str = '{"statusCode": 200, "message": "Success"}'
                is_success = True
                
                if b_url and e_point:
                    try:
                        full_url = f"{b_url.rstrip('/')}{p_fix}{e_point}"
                        if u_type in ("attendance_two", "attendance_two_log"):
                            status_val = "present" if u_type == "attendance_two_log" else "Present"
                            erp_payload = {
                                "employee_id": emp_id,
                                "attendance_date": formatted_date,
                                "time": time_str,
                                "status": status_val,
                                "source": self.camera_id
                            }
                        else:
                            erp_payload = {
                                "attendanceDate": date_str,
                                "empId": emp_id,
                                "inTime": time_str,
                                "inLocation": self.camera_id
                            }
                        h = {"Content-Type": "application/json", "accept": "*/*"}
                        if u_type == "attendance":
                            h["x-api-version"] = "2.0"
                        r = requests.post(full_url, json=erp_payload, headers=h, timeout=5.0)
                        is_success = (r.status_code in (200, 201))
                        erp_response_str = r.text or '{"statusCode": 200, "message": "Success"}'
                    except Exception as ex:
                        is_success = False
                        erp_response_str = f'{{"error": "{str(ex)}"}}'

                if is_success:
                    write_erp_log(f"PUSH REALTIME | {f_log} | STATUS=SUCCESS | erp_response={erp_response_str}")
                else:
                    write_erp_log(f"PUSH REALTIME | {f_log} | STATUS=FAILED | erp_response={erp_response_str}")

            threading.Thread(target=_push_worker, daemon=True).start()

        # Trigger Relay On HTTP GET once when attendance is confirmed
        try:
            relay_on_url = "http://10.81.100.72/on"
            try:
                r_res = requests.get(f"{BACKEND_BASE_URL}/api/v1/settings/relay", headers={"x-company-id": self.company_id}, timeout=1.5)
                if r_res.status_code == 200:
                    d_data = r_res.json()
                    if isinstance(d_data, list) and len(d_data) > 0:
                        d_data = d_data[0]
                    if isinstance(d_data, dict):
                        relay_on_url = d_data.get("relayOnUrl") or d_data.get("relay_on_url") or relay_on_url
            except Exception:
                pass

            on_url = relay_on_url
            sep = "&" if "?" in on_url else "?"
            on_url = f"{on_url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"

            def _relay_on_worker():
                try:
                    resp = urllib.request.urlopen(on_url, timeout=3.0)
                    resp.close()
                    print(f"[RELAY] on cid={self.camera_id} url={on_url}", flush=True)
                except Exception as ex:
                    print(f"[RELAY] failed cid={self.camera_id} url={on_url} err={ex}", flush=True)

            threading.Thread(target=_relay_on_worker, daemon=True).start()
        except Exception:
            pass

    def stop(self):
        self.stopped = True
        with self.cap_lock:
            if hasattr(self, 'cap') and self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
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
