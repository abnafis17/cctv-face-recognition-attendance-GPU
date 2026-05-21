from __future__ import annotations
import os
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

import time
from datetime import datetime
from typing import Optional, Tuple


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def l2_normalize(x: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    x = x.astype(np.float32)
    n = float(np.linalg.norm(x) + eps)
    return x / n


def sleep_fps(target_fps: float, t0: float) -> None:
    if target_fps <= 0:
        return
    dt = time.time() - t0
    wait = max(0.0, (1.0 / target_fps) - dt)
    if wait > 0:
        time.sleep(wait)


def quality_score(face_bbox, frame_bgr) -> float:
    """Simple quality heuristic: bigger face + sharper image => higher score (0-100)."""
    x1, y1, x2, y2 = [int(v) for v in face_bbox]
    h, w = frame_bgr.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0

    area = (x2 - x1) * (y2 - y1)
    size_ratio = min(1.0, area / float(w * h + 1e-6))

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    fm = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_score = min(1.0, fm / 300.0)  # rough scaling

    score = 100.0 * (0.65 * blur_score + 0.35 * size_ratio)
    return float(max(0.0, min(100.0, score)))


def estimate_head_pose_deg(kps: np.ndarray, frame_shape) -> Optional[Tuple[float, float, float]]:
    """
    Robust head-pose estimate: returns (yaw, pitch, roll) in degrees.

    Uses:
    - solvePnP (ITERATIVE) on 5 landmarks
    - cv2.decomposeProjectionMatrix to get stable Euler angles

    kps expected shape (5,2) in image coords:
      [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if kps is None or np.asarray(kps).shape != (5, 2):
        return None

    image_points = np.asarray(kps, dtype=np.float64)

    # Generic 3D model points (approx) corresponding to kps order:
    # left_eye, right_eye, nose, left_mouth, right_mouth
    model_points = np.array(
        [
            (-30.0, 30.0, -30.0),
            (30.0, 30.0, -30.0),
            (0.0, 0.0, 0.0),
            (-25.0, -30.0, -30.0),
            (25.0, -30.0, -30.0),
        ],
        dtype=np.float64,
    )

    h, w = frame_shape[:2]
    focal_length = float(w)
    center = (w / 2.0, h / 2.0)

    camera_matrix = np.array(
        [
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1],
        ],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    try:
        ok, rvec, tvec = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok:
            return None

        rmat, _ = cv2.Rodrigues(rvec)

        # Build projection matrix [R|t]
        proj = np.hstack([rmat, tvec.reshape(3, 1)])

        # decomposeProjectionMatrix gives Euler angles in degrees (rx, ry, rz)
        _c, _r, _t, _rx, _ry, _rz, euler = cv2.decomposeProjectionMatrix(proj)
        # euler: [pitch(x), yaw(y), roll(z)] in degrees (OpenCV convention)
        pitch = float(euler[0])
        yaw = float(euler[1])
        roll = float(euler[2])

        return yaw, pitch, roll
    except Exception:
        return None


def pose_label(yaw: float, pitch: float, cfg_pose: dict) -> str:
    """Classify pose into front/left/right/up/down using config thresholds."""
    yl = float(cfg_pose["yaw_left_deg"])
    yr = float(cfg_pose["yaw_right_deg"])
    pu = float(cfg_pose["pitch_up_deg"])
    pd = float(cfg_pose["pitch_down_deg"])

    # prioritize strong yaw
    if yaw <= yl:
        return "left"
    if yaw >= yr:
        return "right"
    # then pitch
    if pitch <= pu:
        return "up"
    if pitch >= pd:
        return "down"
    return "front"


def pose_matches(required: str, yaw: float, pitch: float, cfg_pose: dict) -> bool:
    tol = float(cfg_pose.get("tolerance_deg", 10))
    yl = float(cfg_pose["yaw_left_deg"])
    yr = float(cfg_pose["yaw_right_deg"])
    pu = float(cfg_pose["pitch_up_deg"])
    pd = float(cfg_pose["pitch_down_deg"])

    if required == "left":
        return yaw <= (yl + tol)
    if required == "right":
        return yaw >= (yr - tol)
    if required == "up":
        return pitch <= (pu + tol)
    if required == "down":
        return pitch >= (pd - tol)

    # front
    return (yl + tol) < yaw < (yr - tol) and (pu + tol) < pitch < (pd - tol)


def open_capture_with_fallback(rtsp_url: str) -> cv2.VideoCapture:
    """
    Tries to open video stream capture with hardware-accelerated GStreamer decoders on Jetson,
    falling back to optimized low-latency software OpenCV FFmpeg.
    """
    # 1. Ensure low-latency FFmpeg parameters are set in the environment globally
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|fflags;nobuffer|flags;low_delay"
    
    # Check if RTSP url is local file path (for testing with video files)
    if not rtsp_url.startswith("rtsp://") and not rtsp_url.startswith("rtmps://") and not rtsp_url.startswith("http://") and not rtsp_url.startswith("https://"):
        print(f"[Capture] Local file path detected: {rtsp_url}. Opening standard capture...")
        return cv2.VideoCapture(rtsp_url)

    # Load target resolution from environment variables (defaults to 640x360 for high-density, low-latency streaming)
    width = int(os.getenv("CAMERA_DEFAULT_WIDTH", "640"))
    height = int(os.getenv("CAMERA_DEFAULT_HEIGHT", "360"))

    # 2. Try GStreamer H.264
    gstreamer_h264 = (
        f"rtspsrc location={rtsp_url} latency=400 protocols=tcp drop-on-latency=true ! "
        f"rtph264depay ! h264parse ! nvv4l2decoder enable-max-performance=1 ! "
        f"nvvidconv ! video/x-raw, width={width}, height={height}, format=BGRx ! "
        f"appsink drop=true max-buffers=1 sync=false"
    )
    
    print(f"[Capture] Attempting GStreamer H.264 hardware-accelerated decode & scale ({width}x{height}) pipeline...")
    cap = cv2.VideoCapture(gstreamer_h264, cv2.CAP_GSTREAMER)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            print("[Capture] GStreamer H.264 hardware pipeline initialized successfully.")
            return cap
        else:
            cap.release()
            print("[Capture] GStreamer H.264 pipeline opened but failed to read frames.")
            
    # 3. Try GStreamer H.265
    gstreamer_h265 = (
        f"rtspsrc location={rtsp_url} latency=400 protocols=tcp drop-on-latency=true ! "
        f"rtph265depay ! h265parse ! nvv4l2decoder enable-max-performance=1 ! "
        f"nvvidconv ! video/x-raw, width={width}, height={height}, format=BGRx ! "
        f"appsink drop=true max-buffers=1 sync=false"
    )
    
    print(f"[Capture] Attempting GStreamer H.265 hardware-accelerated decode & scale ({width}x{height}) pipeline...")
    cap = cv2.VideoCapture(gstreamer_h265, cv2.CAP_GSTREAMER)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            print("[Capture] GStreamer H.265 hardware pipeline initialized successfully.")
            return cap
        else:
            cap.release()
            print("[Capture] GStreamer H.265 pipeline opened but failed to read frames.")

    # 4. Fallback to standard OpenCV FFMPEG with low-latency flags
    print("[Capture] GStreamer pipelines failed or not supported. Falling back to low-latency FFMPEG...")
    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap
