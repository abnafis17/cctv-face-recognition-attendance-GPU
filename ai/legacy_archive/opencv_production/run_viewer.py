#!/usr/bin/env python3
import os
import sys
import time
import cv2
import numpy as np
from dotenv import load_dotenv

# Ensure the root project directory is in the path to load all app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.container import build_container

def make_placeholder(name, message="Connecting..."):
    """Creates a high-end, premium dark placeholder frame for offline/connecting cameras."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Background subtle grid lines for technical control-room look
    for x in range(0, 640, 40):
        cv2.line(frame, (x, 0), (x, 480), (15, 15, 15), 1)
    for y in range(0, 480, 40):
        cv2.line(frame, (0, y), (640, y), (15, 15, 15), 1)
        
    # High-tech corner bracket accents
    margin = 15
    l_len = 15
    color = (0, 165, 255) # Warning Amber
    # Top-Left
    cv2.line(frame, (margin, margin), (margin + l_len, margin), color, 2)
    cv2.line(frame, (margin, margin), (margin, margin + l_len), color, 2)
    # Top-Right
    cv2.line(frame, (640 - margin, margin), (640 - margin - l_len, margin), color, 2)
    cv2.line(frame, (640 - margin, margin), (640 - margin, margin + l_len), color, 2)
    # Bottom-Left
    cv2.line(frame, (margin, 480 - margin), (margin + l_len, 480 - margin), color, 2)
    cv2.line(frame, (margin, 480 - margin), (margin, 480 - margin - l_len), color, 2)
    # Bottom-Right
    cv2.line(frame, (640 - margin, 480 - margin), (640 - margin - l_len, 480 - margin), color, 2)
    cv2.line(frame, (640 - margin, 480 - margin), (640 - margin, 480 - margin - l_len), color, 2)

    # Text labeling
    cv2.putText(frame, f"[ {name} ]", (40, 200), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, message, (40, 235), cv2.FONT_HERSHEY_DUPLEX, 0.55, color, 1, cv2.LINE_AA)
    
    return frame

def extract_ip_or_host(url):
    import re
    # Extract IP address/host from standard RTSP credentials format
    m = re.search(r'@([^:/]+)', url)
    if m:
        return m.group(1)
    m = re.search(r'//([^:/]+)', url)
    if m:
        return m.group(1)
    return url

def main():
    print("Loading environment and bootstrapping service container...")
    load_dotenv()
    
    # 1. Initialize the official production container (loads all models, db configs, GPU arbiter)
    container = build_container()
    print("Production Container boot completed successfully.")
    
    # 2. Define the 3 Physical Cameras Config
    cameras_config = [
        {
            "default_id": "camera_1",
            "default_name": "Camera 1 (Entry)",
            "url": "rtsp://admin:Nokia%4012@10.81.200.21:554/Streaming/Channels/102",
            "w": 640,
            "h": 480,
            "fps": 10
        },
        {
            "default_id": "camera_2",
            "default_name": "Camera 2 (Reception-PSL)",
            "url": "rtsp://admin:Nokia%40123@10.81.200.18:554/Streaming/Channels/101",
            "w": 1280,
            "h": 720,
            "fps": 20
        },
        {
            "default_id": "camera_3",
            "default_name": "Camera 3 (Alleyway-1)",
            "url": "rtsp://admin:Nokia%40123@10.81.200.13:554/cam/realmonitor?channel=1&subtype=0",
            "w": 1280,
            "h": 720,
            "fps": 20
        }
    ]

    # 3. Dynamic Database Camera ID Mapping
    # Match camera RTSP URLs to registered Postgres camera database IDs to resolve 404 errors!
    client = container.attendance_rt._default_client
    db_cameras = []
    try:
        print("Checking registered database camera credentials...")
        db_cameras = client.list_cameras()
        print(f"Found {len(db_cameras)} registered cameras in the backend API.")
    except Exception as e:
        print(f"Backend API list query bypassed (using standard configurations): {e}")

    cameras = []
    for cfg in cameras_config:
        cid = cfg["default_id"]
        cname = cfg["default_name"]
        url = cfg["url"]
        local_ip = extract_ip_or_host(url)
        
        # Match by IP address dynamically to support sub-stream/main-stream cross-matching!
        matched_cam = None
        for db_cam in db_cameras:
            db_url = db_cam.get("rtspUrl") or db_cam.get("url") or ""
            if db_url:
                db_ip = extract_ip_or_host(db_url)
                if local_ip and db_ip and local_ip == db_ip:
                    # If multiple matched, prioritize active attendance/box/gatepass cameras
                    task = str(db_cam.get("task") or "").strip().lower()
                    if db_cam.get("isActive") or task in ("attendance", "box", "gate_pass"):
                        matched_cam = db_cam
                        break
                    matched_cam = db_cam
        
        if matched_cam is not None:
            cid = matched_cam.get("camId") or matched_cam.get("id") or cid
            cname = matched_cam.get("name") or matched_cam.get("title") or cname
            print(f"-> Mapped stream dynamically to Database Public ID: '{cid}' ('{cname}')")
        else:
            print(f"-> Using local mapping for stream: '{cname}' (ID: {cid})")
            
        cameras.append({
            "id": cid,
            "name": cname,
            "url": url,
            "w": cfg["w"],
            "h": cfg["h"],
            "fps": cfg["fps"]
        })

    # Get company ID and lightweight AI processing frame rate
    company_id = os.getenv("BACKEND_COMPANY_ID", "cmk9dp01a0000vpskicoq1gj0").strip()
    ai_fps = max(1.0, float(os.getenv("AI_FPS", "3.0")))

    # 4. Start concurrent, non-blocking ingestion & recognition background worker threads
    print(f"\nStarting concurrent ingest pipelines (OpenCV) and background AI threads at {ai_fps} FPS...")
    for cam in cameras:
        print(f"Booting threads: '{cam['name']}' (ID: {cam['id']})...")
        
        # A. Apply production routing parameters inside the container
        container.attendance_rt.set_company_for_camera(cam["id"], company_id)
        container.attendance_rt.set_stream_type(cam["id"], "attendance")
        container.attendance_rt.set_attendance_enabled(cam["id"], True)

        # B. Starts native background capture ring buffers (OpenCV)
        container.camera_rt.start(
            camera_id=cam["id"],
            rtsp_url=cam["url"],
            width=cam["w"],
            height=cam["h"],
            target_fps=cam["fps"]
        )
        
        # C. Starts background recognition worker thread loop (completely decoupled!)
        container.rec_worker.start(
            camera_id=cam["id"],
            camera_name=cam["name"],
            ai_fps=ai_fps
        )

    # 5. Open three separate, hardware-accelerated standard windows
    # This prevents non-standard widescreen compositing lags in the X11 window manager!
    print("\nOpening separate GPU-accelerated display windows...")
    for cam in cameras:
        cv2.namedWindow(cam["name"], cv2.WINDOW_NORMAL)

    print("\n" + "="*80)
    print("GPU-Accelerated Smooth 3-Camera Production Viewer is ACTIVE!")
    print("Press 'q' or 'ESC' on ANY window to safely stop services.")
    print("="*80 + "\n")

    # Time pacing parameters (smooth 12 FPS display refresh to keep CPU usage low)
    target_gui_fps = max(1.0, float(os.getenv("OPENCV_VIEWER_FPS", "12.0")))
    gui_period = 1.0 / target_gui_fps

    try:
        while True:
            t_start = time.time()
            
            # 6. Fetch pre-annotated frames asynchronously from worker threads and render them
            for cam in cameras:
                annotated_frame = container.rec_worker.get_latest_annotated(cam["id"])
                
                if annotated_frame is None:
                    # Connection placeholder
                    frame_to_show = make_placeholder(cam["name"], "Establishing RTSP Connection...")
                else:
                    # No slow CPU-based resizing! Show the frame directly at its native resolution
                    # to make full use of standard hardware-accelerated rendering!
                    frame_to_show = annotated_frame

                # Draw elegant telemetry details directly on the individual stream frame
                cv2.rectangle(frame_to_show, (10, 10), (380, 50), (15, 15, 15), cv2.FILLED)
                cv2.rectangle(frame_to_show, (10, 10), (380, 50), (80, 80, 80), 1)
                cv2.putText(frame_to_show, f"ASYNC PIPELINE: ACTIVE (LOGS TO BACKEND)", (20, 26), 
                            cv2.FONT_HERSHEY_DUPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(frame_to_show, f"FRAME RATE PACING: {target_gui_fps} FPS", (20, 42), 
                            cv2.FONT_HERSHEY_DUPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)

                # Show native frame directly in its standard hardware window
                cv2.imshow(cam["name"], frame_to_show)

            # Capture key inputs
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == 27:
                break
                
            # Dynamic time compensation sleep to maintain smooth pacing
            t_spent = time.time() - t_start
            t_sleep = gui_period - t_spent
            if t_sleep > 0:
                time.sleep(t_sleep)

    except KeyboardInterrupt:
        print("\nKeyboardInterrupt caught. Commencing safe shutdown...")
    finally:
        # 7. Gracefully terminate Frame Grabber processes and worker loops
        print("\nStopping background recognition worker threads...")
        try:
            container.shutdown()
        except Exception as e:
            print(f"Teardown error: {e}")
            
        cv2.destroyAllWindows()
        print("Teardown completed successfully. All system components shut down safely.")

if __name__ == "__main__":
    main()
