from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.camera import router as camera_router
from app.api.routes.attendance import router as attendance_router
from app.api.routes.enroll2_auto import router as enroll2_auto_router
from app.api.routes.webrtc import router as webrtc_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(camera_router, tags=["camera"])
api_router.include_router(attendance_router, tags=["attendance"])
api_router.include_router(enroll2_auto_router, tags=["enroll2-auto"])
api_router.include_router(webrtc_router, tags=["webrtc"])
