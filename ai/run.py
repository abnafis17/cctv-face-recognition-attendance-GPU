from __future__ import annotations

"""
Main server launcher for the AI service.

Supports both Uvicorn and Gunicorn (with UvicornWorker) based on environment:
- If Gunicorn is installed and requested, launches Gunicorn.
- Otherwise defaults smoothly to Uvicorn without missing module errors.

Run:
    python run.py
    # or from repository root:
    python ai/run.py
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Project paths & environment setup
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ensure working directory is PROJECT_ROOT so relative config/asset paths resolve cleanly
os.chdir(PROJECT_ROOT)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv(PROJECT_ROOT / ".env")


def str_to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_gunicorn_available() -> bool:
    try:
        import gunicorn  # noqa: F401

        return True
    except ImportError:
        return shutil.which("gunicorn") is not None


def run_gunicorn(host: str, port: int, workers: int) -> None:
    timeout = os.getenv("GUNICORN_TIMEOUT", "120")
    graceful_timeout = os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30")
    keepalive = os.getenv("GUNICORN_KEEPALIVE", "5")

    command = [
        sys.executable,
        "-m",
        "gunicorn",
        "app.main:app",
        "--bind",
        f"{host}:{port}",
        "--workers",
        str(workers),
        "--worker-class",
        "uvicorn.workers.UvicornWorker",
        "--timeout",
        timeout,
        "--graceful-timeout",
        graceful_timeout,
        "--keep-alive",
        keepalive,
    ]

    print(f"Starting Gunicorn server on {host}:{port} with {workers} worker(s):")
    print(" ".join(command))

    try:
        subprocess.run(command, check=True, cwd=str(PROJECT_ROOT))
    except KeyboardInterrupt:
        print("\nGunicorn server stopped.")
    except subprocess.CalledProcessError as exc:
        print(f"Gunicorn exited with code {exc.returncode}.")
        raise SystemExit(exc.returncode) from exc


def run_uvicorn(host: str, port: int, workers: int, reload: bool, log_level: str) -> None:
    import uvicorn

    print(
        f"Starting Uvicorn server on {host}:{port} "
        f"(workers={workers}, reload={reload}, log_level={log_level})"
    )

    if reload:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=True,
            app_dir=str(PROJECT_ROOT),
            log_level=log_level,
        )
    elif workers > 1:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            workers=workers,
            app_dir=str(PROJECT_ROOT),
            log_level=log_level,
        )
    else:
        from app.main import app

        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level=log_level,
        )


def main() -> None:
    host = os.getenv("AI_SERVER_HOST", os.getenv("HOST", "0.0.0.0")).strip()
    port_raw = os.getenv("AI_SERVER_PORT", os.getenv("PORT", "8000")).strip()

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"Invalid AI server port: {port_raw!r}") from exc

    workers_raw = os.getenv("AI_WORKERS", os.getenv("WORKERS", "1")).strip()
    try:
        workers = max(1, int(workers_raw))
    except ValueError:
        workers = 1

    reload = str_to_bool(os.getenv("AI_SERVER_RELOAD", os.getenv("RELOAD", "false")))
    log_level = os.getenv("AI_LOG_LEVEL", os.getenv("LOG_LEVEL", "info")).strip().lower()

    # Runner selection: "auto", "uvicorn", or "gunicorn"
    runner = os.getenv("AI_SERVER_RUNNER", os.getenv("SERVER_RUNNER", "auto")).strip().lower()

    use_gunicorn = (
        runner == "gunicorn"
        or (runner == "auto" and not reload and sys.platform != "win32" and is_gunicorn_available())
    )

    if use_gunicorn and is_gunicorn_available():
        run_gunicorn(host=host, port=port, workers=workers)
    else:
        run_uvicorn(host=host, port=port, workers=workers, reload=reload, log_level=log_level)


if __name__ == "__main__":
    main()
