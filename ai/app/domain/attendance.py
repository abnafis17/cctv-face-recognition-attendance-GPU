from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple
import numpy as np


@dataclass
class BoundingBoxRuntimeBox:
    id: str
    name: str
    left: float
    top: float
    right: float
    bottom: float
    employee_ids: Set[str] = field(default_factory=set)


@dataclass
class AttendanceRecord:
    company_id: str
    employee_id: str
    name: str
    timestamp: str
    camera_id: str
    confidence: float
    stream_type: str = "attendance"
    snapshot_path: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamStats:
    fps: float = 0.0
    active_viewers: int = 0
    total_frames: int = 0
    detections_count: int = 0
    recognition_count: int = 0
