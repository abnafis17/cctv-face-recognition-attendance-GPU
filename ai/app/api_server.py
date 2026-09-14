from __future__ import annotations

"""
FastAPI application entrypoint.

Run directly from ai/app directory:
    python api_server.py

Run from ai directory:
    python app/api_server.py
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

from app.main import app

# ---------------------------------------------------------------------------
# Development server
# ---------------------------------------------------------------------------


def main() -> None:
    import uvicorn
    import signal
    import threading
    import time

    def _force_exit_watchdog():
        time.sleep(2.0)
        print("\n[SERVER] Shutdown forced by timeout watchdog.")
        os._exit(0)

    def _sig_handler(signum, frame):
        threading.Thread(target=_force_exit_watchdog, daemon=True).start()
        sys.exit(0)

    try:
        signal.signal(signal.SIGINT, _sig_handler)
        signal.signal(signal.SIGTERM, _sig_handler)
    except Exception:
        pass

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
        "true",
    }
    os.environ.setdefault("OPENCV_LOG_LEVEL", "OFF")
    log_level = os.getenv("AI_LOG_LEVEL", os.getenv("LOG_LEVEL", "warning")).strip().lower()

    print(f"[SERVER] Starting FastAPI AI Server on http://{host}:{port}...")

    try:
        if reload_flag:
            uvicorn.run(
                "app.main:app",
                host=host,
                port=port,
                reload=True,
                app_dir=str(PROJECT_ROOT),
                log_level=log_level,
                access_log=False,
            )
        else:
            uvicorn.run(
                app,
                host=host,
                port=port,
                log_level=log_level,
                access_log=False,
            )
    except KeyboardInterrupt:
        print("\n[SERVER] Stopped by Ctrl+C.")
        os._exit(0)


if __name__ == "__main__":
    main()
