import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.logging import logger
from app.services.model_manager import init_models
from app.services.stream_manager import streams_lock, streams
from app.api.router import api_router

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HLS_STATIC_DIR = os.path.join(BASE_DIR, "hls")
PUBLIC_STATIC_DIR = os.path.join(BASE_DIR, "public")
os.makedirs(HLS_STATIC_DIR, exist_ok=True)
os.makedirs(PUBLIC_STATIC_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.warning("==========================================================================")
    logger.warning("[AI SERVER] CCTV Face Recognition & Attendance Engine ON")
    logger.warning("[AI SERVER] Models Loaded: InsightFace (buffalo_s CUDA GPU)")
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

# Static file mounts
app.mount("/hls", StaticFiles(directory=HLS_STATIC_DIR), name="hls")
app.mount("/ai/public/images", StaticFiles(directory=PUBLIC_STATIC_DIR), name="public")

import logging
from fastapi.responses import JSONResponse

class Suppress404AccessLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        # Suppress 404 access log lines from external internet scanners
        if " 404 " in msg or "404 Not Found" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(Suppress404AccessLogFilter())

# Register API Router
app.include_router(api_router)

@app.get("/")
async def root_health():
    return {"status": "ok", "service": "CCTV Face Recognition & Attendance Engine"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


