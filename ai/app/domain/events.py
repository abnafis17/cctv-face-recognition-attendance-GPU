from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class VoiceEvent:
    seq: int
    text: str
    company_id: Optional[str] = None
    created_at: str = ""
    event_type: str = "attendance"
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DoorRelayRequest:
    company_id: Optional[str]
    employee_id: str
    employee_name: str
    camera_id: str
    timestamp: float
