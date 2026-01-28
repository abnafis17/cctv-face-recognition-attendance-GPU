from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.container import build_container


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HLS_STATIC_DIR = os.path.join(BASE_DIR, "hls")
os.makedirs(HLS_STATIC_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build and attach service container (singletons)
    app.state.container = build_container()
    yield
    # Graceful shutdown (best-effort)
    c = getattr(app.state, "container", None)
    if c:
        try:
            c.shutdown()
        except Exception:
            pass


def create_app() -> FastAPI:
    app = FastAPI(title="AI Camera API", version="1.4", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Static (HLS)
    app.mount("/hls", StaticFiles(directory=HLS_STATIC_DIR), name="hls")

    # Routes
    app.include_router(api_router)

    return app


app = create_app()
