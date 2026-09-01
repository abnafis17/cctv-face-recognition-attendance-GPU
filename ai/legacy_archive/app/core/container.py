from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from typing import Dict, Optional

from app.core.settings import (
    STREAM_TYPE_ATTENDANCE,
    STREAM_TYPE_BOX,
    STREAM_TYPE_HEADCOUNT,
    STREAM_TYPE_OT,
    normalize_stream_type,
)

from app.runtimes.camera_runtime import CameraRuntime
from app.runtimes.attendance_runtime import AttendanceRuntime
from app.runtimes.recognition_worker import RecognitionWorker
from app.enroll2_auto.service import EnrollmentAutoService2
from app.runtimes.hls_runtime import HLSRuntime
from app.presence.runtime import PresenceRuntime
from app.presence.worker import PresenceWorker
from app.presence.clients import PresenceStreamClients


def _env_bool(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return float(default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, str(default))).strip()))
    except Exception:
        return int(default)


def _env_str(name: str, default: str) -> str:
    value = str(os.getenv(name, default)).strip()
    return value or default


def _resolve_use_gpu() -> bool:
    raw = os.getenv("USE_GPU")
    if raw is not None and str(raw).strip() != "":
        return _env_bool("USE_GPU", False)
    try:
        import torch  # type: ignore

        return bool(torch.cuda.is_available())
    except Exception:
        return False


class StreamClientManager:
    """
    Stream viewer bookkeeping:
    - Reference counting per camera
    - Track per stream type (attendance/headcount/ot)
    - Derive active stream type hint from current viewers

    Attendance enable/disable is intentionally NOT tied to viewer count anymore.
    Recognition/attendance must continue server-side even when no browser is open.
    """

    def __init__(self, attendance_rt: AttendanceRuntime):
        self._lock = threading.Lock()
        self._rec_stream_clients: Dict[str, int] = {}
        self._rec_stream_mode_counts: Dict[str, Dict[str, int]] = {}
        self._attendance_rt = attendance_rt

    def _update_stream_type(self, camera_id: str) -> None:
        counts = self._rec_stream_mode_counts.get(camera_id)
        # Decide which type to send to backend on recognition marks.
        # Default to attendance when there are no stream viewers.
        active_type = STREAM_TYPE_ATTENDANCE
        if counts:
            if counts.get(STREAM_TYPE_ATTENDANCE, 0) > 0:
                active_type = STREAM_TYPE_ATTENDANCE
            elif counts.get(STREAM_TYPE_BOX, 0) > 0:
                active_type = STREAM_TYPE_BOX
            elif counts.get(STREAM_TYPE_HEADCOUNT, 0) > 0:
                active_type = STREAM_TYPE_HEADCOUNT
            elif counts.get(STREAM_TYPE_OT, 0) > 0:
                active_type = STREAM_TYPE_OT
        self._attendance_rt.set_stream_type(camera_id, active_type)

    def inc(self, camera_id: str, stream_type: Optional[str]) -> int:
        stream_type = normalize_stream_type(stream_type)
        with self._lock:
            self._rec_stream_clients[camera_id] = (
                self._rec_stream_clients.get(camera_id, 0) + 1
            )
            mode_counts = self._rec_stream_mode_counts.setdefault(camera_id, {})
            mode_counts[stream_type] = mode_counts.get(stream_type, 0) + 1
            self._update_stream_type(camera_id)
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

            self._update_stream_type(camera_id)
            return cur


@dataclass
class ServiceContainer:
    camera_rt: CameraRuntime
    attendance_rt: AttendanceRuntime
    rec_worker: RecognitionWorker
    enroller2_auto: EnrollmentAutoService2
    hls_rt: HLSRuntime
    presence_rt: PresenceRuntime
    presence_worker: PresenceWorker
    presence_clients: PresenceStreamClients
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
            self.presence_worker.stop_all()
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

        try:
            self.presence_rt.reset_all()
        except Exception:
            pass


def build_container() -> ServiceContainer:
    import os
    import yaml
    from app.core.settings import resolve_ai_path

    config_path = resolve_ai_path("config.yaml")
    config = {}
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            config = yaml.safe_load(f) or {}

    rec_cfg = config.get("recognition", {})
    att_cfg = config.get("attendance", {})

    # Priority: Env > Config > Default
    model_name = os.getenv("AI_DETECTOR_MODEL", rec_cfg.get("model_name", "buffalo_m"))
    sim_threshold = float(os.getenv("SIMILARITY_THRESHOLD", rec_cfg.get("similarity_threshold", 0.35)))
    min_att_quality = float(os.getenv("MIN_ATT_QUALITY", 3.0))
    gallery_refresh = float(rec_cfg.get("gallery_refresh_s", 1.0))

    camera_rt = CameraRuntime()
    use_gpu = _resolve_use_gpu()

    attendance_rt = AttendanceRuntime(
        use_gpu=use_gpu,
        model_name=model_name,
        min_face_size=max(10, _env_int("MIN_FACE_SIZE", 20)),
        similarity_threshold=sim_threshold,
        gallery_refresh_s=gallery_refresh,
        cooldown_s=max(1, _env_int("ATTENDANCE_DEBOUNCE_SECONDS", int(att_cfg.get("cooldown_seconds", 30)))),
        stable_hits_required=max(1, _env_int("STABLE_ID_CONFIRMATIONS", int(att_cfg.get("stable_hits_required", 2)))),
    )

    rec_worker = RecognitionWorker(camera_rt=camera_rt, attendance_rt=attendance_rt)
    enroller2_auto = EnrollmentAutoService2(camera_rt=camera_rt)

    hls_rt = HLSRuntime()

    stream_clients = StreamClientManager(attendance_rt=attendance_rt)

    presence_rt = PresenceRuntime()
    presence_worker = PresenceWorker(camera_rt=camera_rt, presence_rt=presence_rt)
    presence_clients = PresenceStreamClients()

    return ServiceContainer(
        camera_rt=camera_rt,
        attendance_rt=attendance_rt,
        rec_worker=rec_worker,
        enroller2_auto=enroller2_auto,
        hls_rt=hls_rt,
        presence_rt=presence_rt,
        presence_worker=presence_worker,
        presence_clients=presence_clients,
        stream_clients=stream_clients,
    )
