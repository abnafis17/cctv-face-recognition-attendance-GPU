#!/usr/bin/env python3
import os
import sys
import time
import threading
import subprocess
import argparse
import shutil

# Load environment variables if dotenv is available
try:
    from dotenv import load_dotenv
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotenv_path = os.path.join(script_dir, ".env")
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
except ImportError:
    pass

# Check if opencv-python is installed
try:
    import sys
    # Pre-import numpy to prevent system package directory import from loading older system numpy version
    import numpy as np
    # Temporarily inject system package path to load GStreamer-supported system OpenCV
    sys.path.insert(0, '/usr/lib/python3/dist-packages')
    try:
        import cv2
    finally:
        if '/usr/lib/python3/dist-packages' in sys.path:
            sys.path.remove('/usr/lib/python3/dist-packages')
except ImportError:
    print("Error: OpenCV (cv2) or NumPy is not installed in the current Python environment.")
    print("Please activate the project's virtual environment or install them:")
    print("  source .venv/bin/activate && pip install opencv-python numpy")
    sys.exit(1)

# Ensure the root of the project is in path so we can import app modules
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

try:
    from app.clients.backend_client import BackendClient
    from app.vision.insightface_models import FaceDetector, FaceEmbedder
    from app.utils import l2_normalize, open_capture_with_fallback
    from app.vision.body_detector import UniversalBodyDetector
    from app.vision.body_tracker import BodyTracker, face_belongs_to_body, draw_polygon_body_bbox
except ImportError as e:
    print(f"Error importing AI service modules: {e}")
    print("Please make sure you run this script within the 'ai' directory structure and environment.")
    sys.exit(1)

# ==============================================================================
# CONFIGURATION: Set your RTSP URL(s) here.
# You can define one or multiple RTSP URLs in this list.
# ==============================================================================
RTSP_URLS = [
    "rtsp://admin:Nokia%40123@10.81.200.13:554/cam/realmonitor?channel=1&subtype=0",
]

class FrameGrabber(threading.Thread):
    """
    Asynchronous, low-latency RTSP frame grabber thread.
    Prevents cv2.VideoCapture.read() blocking from halting the UI thread.
    Automatically reconnects if the connection is lost.
    """
    def __init__(self, rtsp_url):
        super().__init__(daemon=True)
        self.rtsp_url = rtsp_url
        self.frame = None
        self.has_new_frame = False
        self.running = True
        self.connected = False
        self.fps = 0.0
        self.frame_count = 0
        self.prev_time = time.time()
        self.lock = threading.Lock()
        self.cap = None

    def run(self):
        print(f"[{self.rtsp_url}] Thread started. Initializing capture...")
        
        self.cap = open_capture_with_fallback(self.rtsp_url)

        while self.running:
            if not self.cap or not self.cap.isOpened():
                self.connected = False
                print(f"[{self.rtsp_url}] Failed to open stream. Retrying in 10 seconds...")
                time.sleep(10.0)
                if self.running:
                    self.cap = open_capture_with_fallback(self.rtsp_url)
                continue

            self.connected = True
            ret, frame = self.cap.read()
            if not ret:
                self.connected = False
                print(f"[{self.rtsp_url}] Lost stream connection. Reconnecting in 1 second...")
                if self.cap:
                    self.cap.release()
                time.sleep(1.0)
                if self.running:
                    self.cap = open_capture_with_fallback(self.rtsp_url)
                continue

            if frame is not None and frame.ndim == 3 and frame.shape[2] == 4:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            with self.lock:
                self.frame = frame
                self.has_new_frame = True

            # Calculate FPS
            self.frame_count += 1
            curr_time = time.time()
            elapsed = curr_time - self.prev_time
            if elapsed >= 1.0:
                self.fps = self.frame_count / elapsed
                self.frame_count = 0
                self.prev_time = curr_time

        if self.cap:
            self.cap.release()
            self.cap = None
        print(f"[{self.rtsp_url}] Capture released.")

    def get_frame(self):
        with self.lock:
            frame = self.frame
            has_new = self.has_new_frame
            self.has_new_frame = False
            return has_new, frame

    def stop(self):
        self.running = False
        if hasattr(self, 'cap') and self.cap is not None:
            self.cap.release()


def draw_hud(frame, url, fps, connected, detected_faces):
    """
    Draws a clean, modern HUD overlay on top of the stream frame.
    """
    h, w = frame.shape[:2]
    
    # 1. Overlay a semi-transparent panel for HUD text (ROI optimization)
    panel_w = min(w - 20, 380)
    panel_h = 90
    sub_roi = frame[10:10+panel_h, 10:10+panel_w]
    overlay = sub_roi.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, panel_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.6, sub_roi, 0.4, 0, sub_roi)
    
    # 2. Draw border
    cv2.rectangle(frame, (10, 10), (10 + panel_w, 10 + panel_h), (80, 80, 80), 1)

    # 3. Status indicator dot (green for connected, red for reconnecting)
    dot_color = (0, 255, 0) if connected else (0, 0, 255)
    cv2.circle(frame, (25, 28), 6, dot_color, -1)

    # 4. Status Title
    status_text = "CONNECTED" if connected else "RECONNECTING"
    cv2.putText(frame, status_text, (40, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

    # 5. RTSP URL Display (mask credentials if any)
    clean_url = url
    if "@" in clean_url:
        try:
            protocol, rest = clean_url.split("://", 1)
            credentials, address = rest.split("@", 1)
            clean_url = f"{protocol}://***:***@{address}"
        except Exception:
            pass
            
    if len(clean_url) > 42:
        clean_url = clean_url[:39] + "..."
        
    cv2.putText(frame, f"Stream: {clean_url}", (20, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, cv2.LINE_AA)

    # 6. FPS, Resolution, and Detected Faces
    cv2.putText(frame, f"FPS: {fps:.1f} | Res: {w}x{h} | Faces: {detected_faces}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, cv2.LINE_AA)

    # 7. Quit prompt
    cv2.putText(frame, "Press 'q' or 'ESC' on this window to quit", (20, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (100, 220, 255), 1, cv2.LINE_AA)


def run_viewer(url):
    """
    Runs the OpenCV GUI stream viewer loop for a single RTSP stream.
    """
    print(f"\n==========================================")
    print(f"Starting Stream Viewer for: {url}")
    print(f"Press 'q' or 'ESC' in the GUI window to exit.")
    print(f"==========================================\n")

    # Load gallery templates
    gallery_templates = []
    company_id = os.getenv("BACKEND_COMPANY_ID")
    client = BackendClient(timeout_s=20.0) # Larger timeout for lossy networks
    print(f"Fetching gallery templates for company: {company_id}...")
    
    templates = None
    max_retries = 5
    for attempt in range(max_retries):
        try:
            templates = client.list_templates()
            break
        except Exception as e:
            print(f"Attempt {attempt + 1}/{max_retries} failed to fetch templates: {e}")
            if attempt < max_retries - 1:
                time.sleep(2.0)
                
    if templates is not None:
        try:
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
            print(f"Error parsing templates: {e}")
    else:
        print("Failed to fetch gallery templates after multiple retries. Continuing with empty gallery...")

    # Initialize Face models
    print("Loading Face Detection & Embedding models...")
    # Matches the production model pack used by the AI Server (buffalo_s)
    model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_s")
    use_gpu = os.getenv("USE_GPU", "1") == "1"
    print(f"Using detector and embedder model pack: {model_name} (GPU={use_gpu})")
    
    detector = FaceDetector(model_name=model_name, use_gpu=use_gpu)
    embedder = FaceEmbedder(model_name=model_name, use_gpu=use_gpu)
    body_detector = UniversalBodyDetector()
    body_tracker = BodyTracker(recheck_interval=4.0)
    
    similarity_threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.45"))
    print(f"Similarity Threshold set to: {similarity_threshold}")

    # Start the async frame grabber
    grabber = FrameGrabber(url)
    grabber.start()

    window_name = f"RTSP Stream: {url}"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    
    last_print_time = time.time()
    
    try:
        last_detect_time = 0.0
        
        while True:
            has_new, frame_orig = grabber.get_frame()
            
            if frame_orig is not None:
                if has_new:
                    h, w = frame_orig.shape[:2]
                    now = time.time()
                    
                    # Perform Face Detection and body tracking at a stable, reduced rate (e.g. ~6 FPS / 160ms interval)
                    # to prevent GIL congestion while maintaining smooth real-time video playback.
                    if now - last_detect_time >= 0.16:
                        last_detect_time = now
                        
                        # 1. Detect human bodies
                        bodies = body_detector.detect(frame_orig)
                        
                        # 2. Update body tracker
                        body_tracker.update(bodies)
                        
                        # 3. Detect faces
                        faces = detector.detect(frame_orig)
                        
                        # 4. Associate detected faces to body tracks
                        for face in faces:
                            fx1, fy1, fx2, fy2 = [int(v) for v in face.bbox]
                            fx1 = max(0, min(w - 1, fx1))
                            fy1 = max(0, min(h - 1, fy1))
                            fx2 = max(0, min(w, fx2))
                            fy2 = max(0, min(h, fy2))
                            face_bbox = (fx1, fy1, fx2, fy2)
                            
                            # Find matching body track
                            matched_track = None
                            for track in body_tracker.tracks:
                                if face_belongs_to_body(face_bbox, track.bbox):
                                    matched_track = track
                                    break
                                    
                            if matched_track is not None:
                                # Check if we should re-recognize
                                if matched_track.should_recognize(now, recheck_interval=body_tracker.recheck_interval):
                                    emb = embedder.embed(frame_orig, bbox=face_bbox, kps=face.kps)
                                    
                                    if emb is not None and len(gallery_templates) > 0:
                                        best_idx = -1
                                        best_score = -1.0
                                        for idx, t in enumerate(gallery_templates):
                                            score = float(np.dot(t["embedding"], emb))
                                            if score > best_score:
                                                best_score = score
                                                best_idx = idx
                                                
                                        if best_score >= similarity_threshold:
                                            matched_track.name = gallery_templates[best_idx]["name"]
                                            matched_track.score = best_score
                                            
                                    # Update the last checked timestamp
                                    matched_track.last_recognize_time = now

                    # Copy frame for annotations
                    frame = frame_orig.copy()
                    
                    # Draw latest recognized/cached body tracks
                    for track in body_tracker.tracks:
                        bx1, by1, bx2, by2 = track.bbox
                        matched_name = track.name
                        match_score = track.score
                        
                        if matched_name != "Unknown":
                            color = (220, 180, 0) # Neon Cyan/Teal (BGR)
                            label = f"{matched_name} ({match_score:.2f})"
                        else:
                            color = (180, 190, 30) # Blue-Green/Teal (BGR)
                            label = "Unknown"
                        
                        # Draw slate background & text plate above the head/body (Polygons and boxes are omitted for maximum Jetson Nano performance)
                        label_sz, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.55, 1)
                        y_top = max(by1 - label_sz[1] - 12, 0)
                        bg_color = (28, 28, 28)
                        cv2.rectangle(frame, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), bg_color, cv2.FILLED)
                        cv2.rectangle(frame, (bx1, y_top), (bx1 + label_sz[0] + 12, y_top + label_sz[1] + 12), color, 1)
                        cv2.putText(frame, label, (bx1 + 6, y_top + label_sz[1] + 6), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

                    # Add beautiful HUD overlay
                    draw_hud(frame, url, grabber.fps, grabber.connected, len(body_tracker.tracks))
                    cv2.imshow(window_name, frame)
            else:
                # Show connecting screen
                placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, "CONNECTING TO RTSP STREAM...", (80, 220),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 1, cv2.LINE_AA)
                
                # Show masked url in placeholder
                display_url = url
                if "@" in display_url:
                    try:
                        protocol, rest = display_url.split("://", 1)
                        credentials, address = rest.split("@", 1)
                        display_url = f"{protocol}://***:***@{address}"
                    except Exception:
                        pass
                if len(display_url) > 60:
                    display_url = display_url[:57] + "..."
                cv2.putText(placeholder, display_url, (80, 250),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1, cv2.LINE_AA)
                cv2.imshow(window_name, placeholder)

            # Print diagnostic info to console every 2 seconds
            now = time.time()
            if now - last_print_time >= 2.0:
                status = "CONNECTED" if grabber.connected else "DISCONNECTED"
                print(f"Stream Status: {status} | FPS: {grabber.fps:.1f}")
                last_print_time = now

            # Keyboard triggers (waitKey processes GUI window events)
            key = cv2.waitKey(10) & 0xFF
            if key == ord('q') or key == 27: # 'q' or ESC
                print("Exit key pressed in window.")
                break

            time.sleep(0.005)

    except KeyboardInterrupt:
        print("\nViewer interrupted by user.")
    finally:
        print("Stopping capture thread...")
        grabber.stop()
        grabber.join(timeout=2.0)
        cv2.destroyAllWindows()
        print("Viewer closed.")


def spawn_in_new_terminal(url):
    """
    Spawns a new terminal window running the viewer for the specific URL.
    """
    python_exe = sys.executable
    script_path = os.path.abspath(__file__)
    
    # We pass the URL along with the '--single' and '--spawned' arguments.
    # '--spawned' tells the child instance that it was spawned, so it should
    # pause on exit to let the user read final error messages.
    cmd = [python_exe, script_path, "--single", url, "--spawned"]
    
    # Try different terminal emulators in priority order
    terminals = [
        ("gnome-terminal", ["gnome-terminal", "--title", f"RTSP Stream: {url}", "--"]),
        ("xfce4-terminal", ["xfce4-terminal", "--title", f"RTSP Stream: {url}", "--"]),
        ("konsole", ["konsole", "-e"]),
        ("x-terminal-emulator", ["x-terminal-emulator", "-e"]),
        ("xterm", ["xterm", "-title", f"RTSP Stream: {url}", "-e"])
    ]
    
    for term_name, term_cmd in terminals:
        if shutil.which(term_name):
            try:
                # Construct command list
                if term_name in ["gnome-terminal", "xfce4-terminal"]:
                    full_cmd = term_cmd + cmd
                else: # konsole, x-terminal-emulator, xterm require -e followed by space-separated command string
                    quoted_args = [f'"{c}"' if " " in c or ":" in c else c for c in cmd]
                    full_cmd = term_cmd + [" ".join(quoted_args)]
                    
                subprocess.Popen(full_cmd)
                print(f"[+] Successfully spawned {term_name} for: {url}")
                return True
            except Exception as e:
                print(f"[-] Failed to spawn {term_name}: {e}")
                continue
            
    # Fallback to direct subprocess if no terminal emulator is available
    print(f"[-] Could not spawn terminal window for {url}. Running directly as background process.")
    try:
        subprocess.Popen(cmd)
        return True
    except Exception as e:
        print(f"Error starting subprocess: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Multi-RTSP OpenCV Stream Viewer Launcher")
    parser.add_argument("--single", type=str, help="Run a single viewer directly in this window for the specified RTSP URL")
    parser.add_argument("--spawned", action="store_true", help="Indicate if this process was spawned in a new terminal window")
    parser.add_argument("cli_urls", nargs="*", help="Optional RTSP URL(s) to view")
    
    args = parser.parse_args()

    # If running as a single viewer instance
    if args.single:
        run_viewer(args.single)
        if args.spawned:
            print("\nStream viewer finished.")
            input("Press Enter to close this terminal...")
        return

    # Determine which URLs to use
    urls = []
    
    # 1. CLI Arguments take precedence
    if args.cli_urls:
        urls = args.cli_urls
    # 2. Config list inside the file
    elif RTSP_URLS:
        urls = RTSP_URLS
    
    # 3. Interactive fallback
    if not urls:
        print("No RTSP URLs specified in the script configuration or CLI arguments.")
        print("Please enter the RTSP URL(s) below.")
        print("For multiple URLs, separate them with commas or spaces.")
        try:
            user_input = input("RTSP URL(s): ").strip()
            if not user_input:
                print("No input provided. Exiting.")
                return
            # Split by comma or space
            if "," in user_input:
                urls = [u.strip() for u in user_input.split(",") if u.strip()]
            else:
                urls = [u.strip() for u in user_input.split() if u.strip()]
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            return

    # Spawn terminal windows
    print(f"Found {len(urls)} RTSP URL(s) to launch.")
    success_count = 0
    for url in urls:
        print(f"Launching terminal viewer for: {url}")
        if spawn_in_new_terminal(url):
            success_count += 1
            # Brief sleep to stagger window opening and terminal creation
            time.sleep(0.3)
            
    print(f"\nSuccessfully launched {success_count} of {len(urls)} viewers.")
    print("Each stream is running in its own terminal window and OpenCV window.")
    print("You can control and exit each stream individually.")


if __name__ == "__main__":
    main()
