#!/usr/bin/env python3
import os
import sys
import uvicorn
from dotenv import load_dotenv

# Ensure the root of the project is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

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

# Set low-delay environment variables for OpenCV FFmpeg backend globally
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|fflags;nobuffer|flags;low_delay"

from app.core.logging import logger
from app.main import app

if __name__ == "__main__":
    host = os.getenv("AI_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("AI_SERVER_PORT", "8000"))
    logger.info(f"Starting Lite AI Server on {host}:{port}...")
    try:
        uvicorn.run(app, host=host, port=port, log_config=None, access_log=False, loop="asyncio")
    except KeyboardInterrupt:
        logger.info("AI Server stopped by Ctrl+C.")
