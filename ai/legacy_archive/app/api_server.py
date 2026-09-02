from __future__ import annotations

"""
Backward-compatible FastAPI entrypoint.

Development:
    python app/api_server.py
    # or from repository root:
    python ai/app/api_server.py
"""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ensure working directory is PROJECT_ROOT so relative file paths resolve cleanly
os.chdir(PROJECT_ROOT)

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv(PROJECT_ROOT / ".env")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

from app.main import app, create_app  # noqa: F401

# ---------------------------------------------------------------------------
# Development server
# ---------------------------------------------------------------------------


def main() -> None:
    import uvicorn

    host = os.getenv(
        "AI_SERVER_HOST",
        os.getenv("HOST", "0.0.0.0"),
    ).strip()

    port_raw = os.getenv(
        "AI_SERVER_PORT",
        os.getenv("PORT", "8000"),
    ).strip()

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"Invalid AI server port: {port_raw!r}") from exc

    reload_flag = os.getenv("AI_SERVER_RELOAD", os.getenv("RELOAD", "false")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    log_level = os.getenv("AI_LOG_LEVEL", os.getenv("LOG_LEVEL", "info")).strip().lower()

    print(f"Starting FastAPI development server on {host}:{port} (reload={reload_flag})")

    if reload_flag:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=True,
            app_dir=str(PROJECT_ROOT),
            log_level=log_level,
        )
    else:
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level=log_level,
        )


if __name__ == "__main__":
    main()
