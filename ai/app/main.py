from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import logger
from app.services.model_manager import init_models
from app.services.stream_manager import streams_lock, streams
from app.api.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.warning("==========================================================================")
    logger.warning("[AI SERVER] CCTV Face Recognition & Attendance Engine ON")
    logger.warning("[AI SERVER] Models Loaded: InsightFace RetinaFace + MobileFaceNet (buffalo_m CUDA GPU)")
    logger.warning("[AI SERVER] Services Active: Realtime ERP Attendance Sync & Door Unlock Relay")
    logger.warning("==========================================================================")
    init_models()
    yield
    logger.warning("Shutting down Lite AI Server. Stopping all active camera streams...")
    with streams_lock:
        for camera_id, stream in list(streams.items()):
            try:
                stream.stop()
            except Exception as e:
                logger.error(f"Error stopping stream {camera_id}: {e}")
        streams.clear()
    logger.warning("All active camera streams stopped.")

app = FastAPI(title="CCTV Attendance Pro AI Server", version="1.5", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Router
app.include_router(api_router)
