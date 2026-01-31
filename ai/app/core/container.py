from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict, Optional

from app.core.settings import (
    STREAM_TYPE_ATTENDANCE,
    STREAM_TYPE_HEADCOUNT,
    STREAM_TYPE_OT,
    normalize_stream_type,
)

from app.runtimes.camera_runtime import CameraRuntime
from app.runtimes.attendance_runtime import AttendanceRuntime
from app.runtimes.recognition_worker import RecognitionWorker
from app.enroll2_auto.service import EnrollmentAutoService2
from app.runtimes.hls_runtime import HLSRuntime


class StreamClientManager:
    """
    Production behavior preserved:
    - Reference counting per camera
    - Track per stream type (attendance/headcount/ot)
    - Enable/disable attendance pipeline based on active viewers
    """
    def __init__(self, attendance_rt: AttendanceRuntime):
        self._lock = threading.Lock()
        self._rec_stream_clients: Dict[str, int] = {}
        self._rec_stream_mode_counts: Dict[str, Dict[str, int]] = {}
        self._attendance_rt = attendance_rt

    def _update_attendance_state(self, camera_id: str) -> None:
        counts = self._rec_stream_mode_counts.get(camera_id)
        attendance_enabled = bool(
            counts
            and (
                counts.get(STREAM_TYPE_ATTENDANCE, 0) > 0
                or counts.get(STREAM_TYPE_HEADCOUNT, 0) > 0
                or counts.get(STREAM_TYPE_OT, 0) > 0
            )
        )
        self._attendance_rt.set_attendance_enabled(camera_id, attendance_enabled)

        # Decide which type to send to backend on recognition marks.
        active_type = STREAM_TYPE_ATTENDANCE
        if counts:
            if counts.get(STREAM_TYPE_ATTENDANCE, 0) > 0:
                active_type = STREAM_TYPE_ATTENDANCE
            elif counts.get(STREAM_TYPE_HEADCOUNT, 0) > 0:
                active_type = STREAM_TYPE_HEADCOUNT
            elif counts.get(STREAM_TYPE_OT, 0) > 0:
                active_type = STREAM_TYPE_OT
        self._attendance_rt.set_stream_type(camera_id, active_type)

    def inc(self, camera_id: str, stream_type: Optional[str]) -> int:
        stream_type = normalize_stream_type(stream_type)
        with self._lock:
            self._rec_stream_clients[camera_id] = self._rec_stream_clients.get(camera_id, 0) + 1
            mode_counts = self._rec_stream_mode_counts.setdefault(camera_id, {})
            mode_counts[stream_type] = mode_counts.get(stream_type, 0) + 1
            self._update_attendance_state(camera_id)
            return self._rec_stream_clients[camera_id]

    def dec(self, camera_id: str, stream_type: Optional[str]) -> int:
        stream_type = normalize_stream_type(stream_type)
        with self._lock:
            cur = self._rec_stream_clients.get(camera_id, 0) - 1
            if cur <= 0:
                self._rec_stream_clients.pop(camera_id, None)
                cur = 0
            else:
                self._rec_stream_clients[camera_id] = cur

            mode_counts = self._rec_stream_mode_counts.get(camera_id)
            if mode_counts:
                cnt = mode_counts.get(stream_type, 0) - 1
                if cnt <= 0:
                    mode_counts.pop(stream_type, None)
                else:
                    mode_counts[stream_type] = cnt
                if not mode_counts:
                    self._rec_stream_mode_counts.pop(camera_id, None)

            self._update_attendance_state(camera_id)
            return cur


@dataclass
class ServiceContainer:
    camera_rt: CameraRuntime
    attendance_rt: AttendanceRuntime
    rec_worker: RecognitionWorker
    enroller2_auto: EnrollmentAutoService2
    hls_rt: HLSRuntime
    stream_clients: StreamClientManager = field(repr=False)

    def shutdown(self) -> None:
        # Best-effort cleanup.
        try:
            self.enroller2_auto.stop()
        except Exception:
            pass

        try:
            self.rec_worker.stop_all()
        except Exception:
            pass

        try:
            self.hls_rt.stop_all()
        except Exception:
            pass

        try:
            self.camera_rt.stop_all()
        except Exception:
            pass

        try:
            self.attendance_rt.shutdown()
        except Exception:
            pass


def build_container() -> ServiceContainer:
    camera_rt = CameraRuntime()

    attendance_rt = AttendanceRuntime(
        use_gpu=False,
        similarity_threshold=0.35,
        cooldown_s=10,
        stable_hits_required=3,
    )

    rec_worker = RecognitionWorker(camera_rt=camera_rt, attendance_rt=attendance_rt)
    enroller2_auto = EnrollmentAutoService2(camera_rt=camera_rt)

    hls_rt = HLSRuntime()

    stream_clients = StreamClientManager(attendance_rt=attendance_rt)

    return ServiceContainer(
        camera_rt=camera_rt,
        attendance_rt=attendance_rt,
        rec_worker=rec_worker,
        enroller2_auto=enroller2_auto,
        hls_rt=hls_rt,
        stream_clients=stream_clients,
    )
