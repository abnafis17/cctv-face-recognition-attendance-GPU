from __future__ import annotations

import threading
from typing import Dict


class PresenceStreamClients:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: Dict[str, int] = {}

    def inc(self, camera_id: str) -> int:
        with self._lock:
            self._counts[camera_id] = self._counts.get(camera_id, 0) + 1
            return int(self._counts[camera_id])

    def dec(self, camera_id: str) -> int:
        with self._lock:
            cur = self._counts.get(camera_id, 0) - 1
            if cur <= 0:
                self._counts.pop(camera_id, None)
                return 0
            self._counts[camera_id] = cur
            return int(cur)
