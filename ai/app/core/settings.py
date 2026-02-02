from __future__ import annotations

import os
from typing import Optional


STREAM_TYPE_ATTENDANCE = "attendance"
STREAM_TYPE_HEADCOUNT = "headcount"
STREAM_TYPE_OT = "ot"
VALID_STREAM_TYPES = {STREAM_TYPE_ATTENDANCE, STREAM_TYPE_HEADCOUNT, STREAM_TYPE_OT}


def env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def normalize_stream_type(value: Optional[str]) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in VALID_STREAM_TYPES:
        return STREAM_TYPE_ATTENDANCE
    return normalized


def infer_company_id_from_camera_id(camera_id: Optional[str]) -> Optional[str]:
    cid = str(camera_id or "").strip()
    if cid.startswith("laptop-"):
        rest = cid[len("laptop-") :].strip()
        return rest or None
    return None
