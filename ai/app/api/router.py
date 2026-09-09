from fastapi import APIRouter
from app.api.endpoints import health, camera, webrtc, enroll, attendance, presence

api_router = APIRouter()

# Include sub-routers.
api_router.include_router(health.router)
api_router.include_router(camera.router)
api_router.include_router(webrtc.router)
api_router.include_router(enroll.router)
api_router.include_router(attendance.router)
api_router.include_router(presence.router)
