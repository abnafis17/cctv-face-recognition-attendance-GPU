from fastapi import APIRouter
from app.core.logging import logger
from app.services.stream_manager import streams_lock, streams

router = APIRouter()

@router.post("/attendance/enable")
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

@router.post("/attendance/disable")
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

@router.get("/attendance/enabled")
def get_attendance_enabled(camera_id: str):
    with streams_lock:
        if camera_id in streams:
            return {"ok": True, "enabled": streams[camera_id].attendance_enabled, "camera_id": camera_id}
        else:
            return {"ok": True, "enabled": False, "camera_id": camera_id}
