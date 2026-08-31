from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional

from ..utils import now_iso


EXPLICIT_NAME_MAP = {
    "asif mamun hridoy": "Hridoy",
    "raihan jami khan": "Jami",
    "dipan kumar kundu": "Kundu",
    "md zahidul islam": "Yuvraj",
    "rajebul hasan rajon": "Rajon",
    "tahmid afsar": "Shopno",
    "eunus nobi rubel": "Rubel",
    "md. ashanur kabir": "Ashanur kabir",
    "md. sadmanur islam shishir": "shishir",
    "md maimoon hossain shomoy": "Shomoy",
    "bani amin jwel": "Jwel",
    "s.m rakib rahman tuhin": "Tuhin",
    "sohanur rahman sohan": "Sohan",
    "md. nizam uddin shamrat": "Shamrat",
    "naimul hasan jisan": "Jisan",
}

TITLE_PREFIXES = {
    "mr",
    "mrs",
    "ms",
    "md",
    "dr",
    "allama",
    "mohammad",
    "s.m",
    "al",
}


class VoiceEventService:
    """
    Dedicated thread-safe service for managing attendance voice feedback events
    with long-polling support and company isolation.
    """

    def __init__(self, max_events: int = 200) -> None:
        self._max_events = int(
            os.getenv("VOICE_MAX_EVENTS", str(max_events))
        )
        self._lock = threading.Lock()
        self._cv = threading.Condition(self._lock)
        self._voice_seq: Dict[str, int] = {}
        self._voice_events: Dict[str, List[Dict[str, Any]]] = {}

    def _format_spoken_name(self, name: str, employee_id: str) -> str:
        full_name = str(name or "").strip()
        tokens = (
            full_name.replace(",", " ").replace(".", " ").split()
            if full_name
            else []
        )
        first_name = tokens[0] if tokens else str(employee_id).strip()

        normalized_full = " ".join(tokens).lower().strip()
        if normalized_full in EXPLICIT_NAME_MAP:
            first_name = EXPLICIT_NAME_MAP[normalized_full]

        if len(tokens) >= 2 and first_name.lower() in TITLE_PREFIXES:
            first_name = tokens[1]

        return first_name.strip() or str(employee_id).strip() or "there"

    def push_voice_event(
        self,
        *,
        employee_id: str,
        name: str,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str] = None,
    ) -> int:
        company_key = str(company_id or "__default__").strip() or "__default__"
        spoken_name = self._format_spoken_name(name, employee_id)
        text = f"Thank you, {spoken_name}."

        with self._cv:
            seq = self._voice_seq.get(company_key, 0) + 1
            self._voice_seq[company_key] = seq
            bucket = self._voice_events.setdefault(company_key, [])
            bucket.append(
                {
                    "seq": seq,
                    "text": text,
                    "employee_id": str(employee_id),
                    "name": str(name),
                    "camera_id": str(camera_id),
                    "camera_name": str(camera_name),
                    "company_id": company_key,
                    "at": now_iso(),
                }
            )
            if self._max_events > 0 and len(bucket) > self._max_events:
                self._voice_events[company_key] = bucket[-self._max_events :]
            self._cv.notify_all()
            return seq

    def get_voice_events(
        self,
        *,
        company_id: Optional[str],
        after_seq: int = 0,
        limit: int = 50,
        wait_ms: int = 0,
    ) -> Dict[str, Any]:
        company_key = str(company_id or "__default__").strip() or "__default__"
        after_seq = int(after_seq or 0)
        limit = max(1, min(int(limit or 50), 200))
        wait_ms = max(0, min(int(wait_ms or 0), 300_000))

        deadline = time.time() + (wait_ms / 1000.0) if wait_ms else 0.0

        with self._cv:
            while wait_ms and int(self._voice_seq.get(company_key, 0)) <= after_seq:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._cv.wait(timeout=remaining)

            latest_seq = int(self._voice_seq.get(company_key, 0))
            bucket = self._voice_events.get(company_key, [])
            items = [e for e in bucket if int(e.get("seq", 0)) > after_seq]

        return {"latest_seq": latest_seq, "events": items[:limit]}
