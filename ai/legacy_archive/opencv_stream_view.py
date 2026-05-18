#!/usr/bin/env python3
import os
import sys
import time
import threading
import cv2
import numpy as np
from dotenv import load_dotenv

# Ensure the root of the project is in path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.clients.backend_client import BackendClient
from app.vision.insightface_models import FaceDetector, FaceEmbedder
from app.utils import l2_normalize

class CameraStream:
    """
    Non-blocking low-latency background thread reader for RTSP streams.
    Ensures that slow streams do not cause other cameras to lag.
    """
    def __init__(self, name, rtsp_url):
        self.name = name
        self.rtsp_url = rtsp_url
        self.frame = None
        self.ret = False
        self.stopped = False
        self.fps = 0.0
        self.frame_count = 0
        self.prev_time = time.time()
        
        # Initialize capture
        self.cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        self.thread = threading.Thread(target=self._update, name=f"stream-{name}", daemon=True)
        self.thread.start()

    def _update(self):
        while not self.stopped:
            if not self.cap.isOpened():
                time.sleep(0.5)
                # Retry opening
                self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                continue
                
            ret, frame = self.cap.read()
            if ret:
                self.frame = frame
                self.ret = True
                
                # Calculate internal FPS
                self.frame_count += 1
                curr_time = time.time()
                elapsed = curr_time - self.prev_time
                if elapsed >= 1.0:
                    self.fps = self.frame_count / elapsed
                    self.frame_count = 0
                    self.prev_time = curr_time
            else:
                self.ret = False
                # Trigger reconnect
                self.cap.release()
                time.sleep(1.0)

    def read(self):
        return self.ret, self.frame

    def stop(self):
        self.stopped = True
        if self.cap:
            self.cap.release()

def main():
    print("Loading .env configuration...")
    load_dotenv()

    # RTSP URLs
    streams_config = [
        {
            "name": "Camera 1 (Sub-stream 102)",
            "url": "rtsp://admin:Nokia%4012@10.81.200.21:554/Streaming/Channels/102"
        },
        {
            "name": "Camera 2 (Main-stream 101)",
            "url": "rtsp://admin:Nokia%40123@10.81.200.18:554/Streaming/Channels/101"
        },
        {
            "name": "Camera 3 (Sub-stream 0)",
            "url": "rtsp://admin:Nokia%40123@10.81.200.13:554/cam/realmonitor?channel=1&subtype=0"
        }
    ]

    # 1. Initialize Backend Client and fetch gallery
    print("Initializing Backend Client...")
    company_id = os.getenv("BACKEND_COMPANY_ID")
    client = BackendClient()
    
    print(f"Fetching gallery templates for company: {company_id}...")
    gallery_templates = []
    try:
        templates = client.list_templates()
        print(f"Successfully retrieved {len(templates)} templates from backend.")
        for t in templates:
            emp_id = t.get("employeeId") or t.get("employee_id") or ""
            name = t.get("employeeName") or t.get("employee_name") or t.get("name") or emp_id
            emb_list = t.get("embedding")
            if emb_list and len(emb_list) >= 128:
                emb = np.asarray(emb_list, dtype=np.float32)
                emb = l2_normalize(emb)
                gallery_templates.append({
                    "employee_id": emp_id,
                    "name": name,
                    "embedding": emb
                })
        print(f"Loaded {len(gallery_templates)} valid face signatures into memory.")
    except Exception as e:
        print(f"Error fetching gallery templates from backend: {e}")
        print("Continuing with empty gallery (detections will show as Unknown)...")

    # 2. Initialize Models
    print("Loading Face Detection & Embedding models...")
    model_name = os.getenv("AI_DETECTOR_MODEL", "buffalo_sc")
    use_gpu = os.getenv("USE_GPU", "1") == "1"
    
    print(f"Using detector model: {model_name} (GPU={use_gpu})")
    detector = FaceDetector(model_name=model_name, use_gpu=use_gpu)
    embedder = FaceEmbedder(model_name=model_name, use_gpu=use_gpu)
    
    similarity_threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
    print(f"Similarity Threshold set to: {similarity_threshold}")

    # 3. Start Camera Streams
    streams = []
    print("\nStarting camera background threads...")
    for cfg in streams_config:
        print(f"Initializing {cfg['name']} -> {cfg['url']}")
        stream = CameraStream(cfg['name'], cfg['url'])
        streams.append(stream)

    print("\n" + "="*50)
    print("Three-Camera OpenCV Stream Viewer Running!")
    print("Press 'q' or 'ESC' on any window to exit.")
    print("="*50 + "\n")

    # Create windows for each stream
    for s in streams:
        cv2.namedWindow(s.name, cv2.WINDOW_NORMAL)

    try:
        while True:
            # Process each stream frame
            for s in streams:
                ret, frame_orig = s.read()
                if not ret or frame_orig is None:
                    # Draw a nice "Stream Connecting..." placeholder frame
                    placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(placeholder, f"Connecting to {s.name}...", (40, 240), 
                                cv2.FONT_HERSHEY_DUPLEX, 0.6, (0, 165, 255), 1, cv2.LINE_AA)
                    cv2.imshow(s.name, placeholder)
                    continue

                # Make a working copy for annotations
                frame = frame_orig.copy()
                h, w = frame.shape[:2]

                # 4. Perform Face Detection
                faces = detector.detect(frame)
                
                for face in faces:
                    bbox = face.bbox
                    x1, y1, x2, y2 = [int(v) for v in bbox]
                    
                    # Clamp bbox values to frame borders
                    x1 = max(0, min(w - 1, x1))
                    y1 = max(0, min(h - 1, y1))
                    x2 = max(0, min(w, x2))
                    y2 = max(0, min(h, y2))
                    
                    # Draw Face Landmark Keypoints if available
                    if face.kps is not None:
                        for kp in face.kps:
                            cv2.circle(frame, (int(kp[0]), int(kp[1])), 2, (0, 255, 255), -1)

                    # 5. Extract Feature Embedding and match
                    emb = embedder.embed(frame, bbox=(x1, y1, x2, y2), kps=face.kps)
                    
                    matched_name = "Unknown"
                    match_score = -1.0
                    
                    if emb is not None and len(gallery_templates) > 0:
                        # Find best cosine similarity match
                        best_idx = -1
                        best_score = -1.0
                        for idx, t in enumerate(gallery_templates):
                            score = float(np.dot(t["embedding"], emb))
                            if score > best_score:
                                best_score = score
                                best_idx = idx
                        
                        if best_score >= similarity_threshold:
                            matched_name = gallery_templates[best_idx]["name"]
                            match_score = best_score
                    
                    # Visual presentation configuration
                    if matched_name != "Unknown":
                        color = (0, 255, 0) # Green for match
                        label = f"{matched_name} ({match_score:.2f})"
                    else:
                        color = (0, 0, 255) # Red for unknown
                        label = "Unknown"

                    # Draw smooth bounding box with semi-filled name tag
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    
                    # Draw header bar for label text
                    label_sz, base_line = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.5, 1)
                    y_label_top = max(y1 - label_sz[1] - 10, 0)
                    cv2.rectangle(frame, (x1, y_label_top), (x1 + label_sz[0] + 10, y_label_top + label_sz[1] + 10), color, cv2.FILLED)
                    cv2.putText(frame, label, (x1 + 5, y_label_top + label_sz[1] + 5), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

                # Draw status overlay on each frame
                status_bg_color = (30, 30, 30)
                cv2.rectangle(frame, (10, 10), (280, 80), status_bg_color, cv2.FILLED)
                cv2.rectangle(frame, (10, 10), (280, 80), (100, 100, 100), 1)
                
                cv2.putText(frame, f"FPS: {s.fps:.1f}", (20, 30), cv2.FONT_HERSHEY_DUPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
                cv2.putText(frame, f"Resolution: {w}x{h}", (20, 50), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(frame, f"Detected: {len(faces)} faces", (20, 70), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 0), 1, cv2.LINE_AA)

                # Display the individual camera stream window
                cv2.imshow(s.name, frame)

            # Global keyboard event handling
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == 27:
                break
                
            # Yield CPU slightly
            time.sleep(0.005)

    except KeyboardInterrupt:
        print("\nShutting down stream viewer...")
    finally:
        # Cleanup
        print("Releasing all camera captures...")
        for s in streams:
            s.stop()
        cv2.destroyAllWindows()
        print("Viewer stopped and resource cleanup complete.")

if __name__ == "__main__":
    main()
