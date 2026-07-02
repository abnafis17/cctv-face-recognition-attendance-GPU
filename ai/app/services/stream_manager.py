import time
import threading
import requests
from typing import Dict, Optional
from app.core.config import FALLBACK_CAMERAS, BACKEND_BASE_URL
from app.core.logging import logger
from app.services.stream import LiteCameraStream

streams: Dict[str, LiteCameraStream] = {}
streams_lock = threading.Lock()
last_active_times: Dict[str, float] = {}

def get_stream_by_id(camera_id: str) -> Optional[LiteCameraStream]:
    with streams_lock:
        return streams.get(camera_id)

def get_all_streams():
    with streams_lock:
        return list(streams.items())

def get_stream_for_camera(camera_id: str, company_id: str, rtsp_url: Optional[str] = None) -> LiteCameraStream:
    global streams
    
    if not rtsp_url:
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
            rtsp_url = FALLBACK_CAMERAS.get("entry_cam")
        
    with streams_lock:
        last_active_times[camera_id] = time.time()
        if camera_id not in streams or streams[camera_id].stopped:
            new_stream = LiteCameraStream(camera_id, rtsp_url, company_id)
            streams[camera_id] = new_stream
        return streams[camera_id]

def update_active_time(camera_id: str):
    with streams_lock:
        last_active_times[camera_id] = time.time()

def stop_camera_stream(camera_id: str) -> bool:
    with streams_lock:
        if camera_id in streams:
            streams[camera_id].stop()
            del streams[camera_id]
            if camera_id in last_active_times:
                del last_active_times[camera_id]
            return True
        return False

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

# Start auto sleep thread
# threading.Thread(target=auto_sleep_inactive_streams, name="auto-sleep", daemon=True).start()
