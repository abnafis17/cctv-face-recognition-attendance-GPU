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

from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

# Set low-delay environment variables for OpenCV FFmpeg backend globally
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|fflags;nobuffer|flags;low_delay"

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://10.81.100.175:3001").strip()
DEFAULT_COMPANY_ID = os.getenv("BACKEND_COMPANY_ID", "cmr06hyac0004tb7uwg0m3tjo").strip()
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
AI_FPS = float(os.getenv("AI_FPS", "3.0"))
MJPEG_STREAM_FPS_RAW = float(os.getenv("MJPEG_STREAM_FPS_RAW", "8.0"))
MJPEG_STREAM_FPS_RECOGNITION = float(os.getenv("MJPEG_STREAM_FPS_RECOGNITION", "8.0"))
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
