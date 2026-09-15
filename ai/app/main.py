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
    logger.warning("[AI SERVER] Models Loaded: InsightFace (buffalo_l CUDA GPU)")
    logger.warning("[AI SERVER] Services Active: Realtime ERP Attendance Sync & Door Unlock Relay")
    logger.warning("==========================================================================")
    init_models()
    host = os.getenv("AI_SERVER_HOST", os.getenv("HOST", "0.0.0.0")).strip()
    port = os.getenv("AI_SERVER_PORT", os.getenv("PORT", "8000")).strip()
    use_gpu = str(os.getenv("USE_GPU", "1")).strip() in ("1", "true", "yes", "on")
    model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")
    device_str = "CUDA GPU Acceleration" if use_gpu else "CPU Execution"
    
    print("\n==========================================================================")
    print("  CCTV Face Recognition & Attendance Engine (AI Server v1.5)")
    print("==========================================================================")
    print(f"  Server URL      : http://{host}:{port}")
    print(f"  Model Loaded    : InsightFace RetinaFace + ArcFace ({model_name})")
    print(f"  Execution Device: {device_str}")
    print(f"  Active Services : Realtime ERP Attendance Sync & Hardware Door Relay")
    print("==========================================================================\n")
    yield
    logger.info("Shutting down AI Server. Stopping all active camera streams...")
    with streams_lock:
        for camera_id, stream in list(streams.items()):
            try:
                stream.stop()
            except Exception as e:
                logger.error(f"Error stopping stream {camera_id}: {e}")
        streams.clear()
    logger.info("All active camera streams stopped.")

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

class AccessLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        # Suppress routine HTTP access logs (2xx/3xx/404); allow only 5xx server errors
        if " 200 " in msg or " 201 " in msg or " 204 " in msg or " 304 " in msg or " 404 " in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(AccessLogFilter())

# Register API Router
app.include_router(api_router)

@app.get("/")
async def root_health():
    return {"status": "ok", "service": "CCTV Face Recognition & Attendance Engine"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


