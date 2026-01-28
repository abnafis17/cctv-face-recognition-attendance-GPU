from __future__ import annotations

"""
Backward-compatible FastAPI entrypoint.

The app entrypoint was moved to `app.main` during the AI server restructure.
Prefer running:

    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from app.main import app, create_app  # noqa: F401

