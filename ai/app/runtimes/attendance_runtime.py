from __future__ import annotations

import os
import time
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Optional

import cv2
import numpy as np

from ..clients.backend_client import BackendClient
from ..vision.pipeline_config import Config
from ..vision.motion_gate import MotionGate as SceneMotionGate
from ..vision.adaptive_scheduler import AdaptiveScheduler
from ..vision.tracker_manager import TrackerManager
from ..vision.insightface_models import FaceDetector, FaceEmbedder
from ..vision.gpu_arbiter import GPUArbiter, Detection
from ..vision.recognizer_runtime import Recognizer, MatchResult
from ..vision.attendance_debouncer import AttendanceDebouncer
from ..vision.db_writer import DBWriter, AttendanceWriteJob
from ..utils import now_iso, l2_normalize, quality_score
from ..core.settings import resolve_ai_path

from ..fas.gate import FASGate, GateConfig

from datetime import datetime
from ..clients.erp_client import ERPClient, ERPClientConfig
from ..services.erp_push_queue import ERPPushQueue, ERPPushJob
import urllib.parse
import urllib.request


LABEL_FONT = (
    cv2.FONT_HERSHEY_TRIPLEX
)  # clearer serif-like font (closest to Times New Roman)
ACCENT_KNOWN = (80, 200, 80)  # green for known
ACCENT_UNKNOWN = (40, 40, 220)  # red for unknown
CARD_KNOWN = (26, 60, 32)  # dark green card
CARD_UNKNOWN = (50, 30, 30)  # dark red card


@dataclass
class CameraScanState:
    tracker: TrackerManager
    motion: SceneMotionGate
    scheduler: AdaptiveScheduler
    recognizer: Recognizer

    last_det_seq: int = 0
    frame_idx: int = 0
    company_id: Optional[str] = None

    # basic per-camera stats (logged periodically)
    frames_total: int = 0
    det_applied_total: int = 0
    rec_calls_total: int = 0
    last_log_ts: float = 0.0
    last_log_frames_total: int = 0
    last_log_det_applied_total: int = 0
    last_log_rec_calls_total: int = 0


@dataclass
class BoundingBoxRuntimeBox:
    id: str
    name: str
    left: float
    top: float
    right: float
    bottom: float
    employee_ids: set[str]


def _draw_label_card(
    img: np.ndarray,
    text: str,
    x: int,
    y: int,
    known: bool,
    scale: float = 1.05,
) -> None:
    """Draw label with accent bar and soft background card."""
    accent = ACCENT_KNOWN if known else ACCENT_UNKNOWN
    bg_color = CARD_KNOWN if known else CARD_UNKNOWN
    font = LABEL_FONT
    thickness = 2
    pad = 12
    accent_w = 8
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)

    x0 = max(0, x - pad - accent_w)
    y0 = max(0, y - th - pad)
    x1 = min(img.shape[1] - 1, x + tw + pad)
    y1 = min(img.shape[0] - 1, y + pad)

    overlay = img.copy()
    cv2.rectangle(overlay, (x0, y0), (x1, y1), bg_color, -1)
    cv2.rectangle(overlay, (x0, y0), (x0 + accent_w, y1), accent, -1)
    cv2.addWeighted(overlay, 0.7, img, 0.3, 0, img)

    cv2.putText(img, text, (x, y), font, scale, (0, 0, 0), thickness + 3, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


class AttendanceRuntime:
    def __init__(
        self,
        use_gpu: bool = False,
        model_name: str = "buffalo_m",
        min_face_size: int = 20,
        similarity_threshold: float = 0.35,
        gallery_refresh_s: float = 5.0,
        cooldown_s: int = 10,
        stable_hits_required: int = 3,
    ):
        self._default_company_id = os.getenv("BACKEND_COMPANY_ID", "").strip() or None
        self._default_client = BackendClient(company_id=self._default_company_id)
        self._clients_by_company: Dict[str, BackendClient] = {}

        self.similarity_threshold = float(similarity_threshold)
        self.strict_similarity = float(os.getenv("STRICT_SIM_THRESHOLD", "0.5"))
        self.min_att_quality = float(os.getenv("MIN_ATT_QUALITY", "18.0"))
        self.gallery_refresh_s = float(gallery_refresh_s)
        self.cooldown_s = int(cooldown_s)
        self.stable_hits_required = int(stable_hits_required)

        # ---------------------------
        # CPU-steady / GPU-burst pipeline config + models
        # ---------------------------
        self.cfg = Config.from_env(
            similarity_threshold=self.similarity_threshold,
            strict_similarity_threshold=self.strict_similarity,
            min_att_quality=self.min_att_quality,
            attendance_debounce_seconds=float(self.cooldown_s),
            stable_id_confirmations=int(self.stable_hits_required),
        )

        # GPU-burst detector + CPU embedder (default) + round-robin arbiter
        self._detector = FaceDetector(
            model_name=model_name,
            use_gpu=use_gpu,
            # Slightly larger detector input improves small/far-face recall.
            # If AI_DET_SIZE is set, FaceDetector will still honor the env override.
            det_size=(768, 768),
            min_face_size=min_face_size,
            # Slightly lower score gate helps keep weak/far detections.
            min_det_score=0.30,
        )
        self._embedder = FaceEmbedder(model_name=model_name, use_gpu=use_gpu)

        self._gpu = GPUArbiter(
            detect_fn=self._detect_faces, queue_size=int(self.cfg.queue_size)
        )

        # Async attendance writer (DB/HTTP/IO should never block the frame loop)
        self._db_writer = DBWriter(write_fn=self._write_attendance_job, max_queue=1000)
        self._debouncer = AttendanceDebouncer(self.cfg)

        # Optional GPU monitoring (guarded; only logs if NVML is available).
        self._nvml = None
        self._nvml_handle = None
        try:
            import pynvml  # type: ignore

            pynvml.nvmlInit()
            self._nvml = pynvml
            self._nvml_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        except Exception:
            self._nvml = None
            self._nvml_handle = None

        self._company_by_camera: Dict[str, str] = {}

        self._gallery_last_load_by_company: Dict[str, float] = {}
        self._gallery_matrix_by_company: Dict[str, np.ndarray] = {}
        self._gallery_meta_by_company: Dict[str, List[Tuple[int, str, str]]] = {}
        self._gallery_emp_ids_by_company: Dict[str, np.ndarray] = {}
        self._employee_pic_by_company: Dict[str, Dict[str, str]] = {}
        self._relay_settings_cache_by_company: Dict[str, Dict[str, Optional[str]]] = {}
        self._relay_settings_last_fetch_by_company: Dict[str, float] = {}
        self._relay_settings_cache_ttl_s = max(
            0.0, float(os.getenv("RELAY_SETTINGS_CACHE_TTL_S", "10"))
        )
        self._erp_settings_cache_by_company: Dict[str, Dict[str, Optional[str]]] = {}
        self._erp_settings_last_fetch_by_company: Dict[str, float] = {}
        self._erp_settings_cache_ttl_s = max(
            0.0, float(os.getenv("ERP_SETTINGS_CACHE_TTL_S", "10"))
        )
        self._erp_timeout_s = float(os.getenv("ERP_TIMEOUT_S", "10"))
        self._erp_api_version = os.getenv("ERP_API_VERSION", "2.0")
        self._unknown_log_cooldown_s = max(
            0.0, float(os.getenv("UNKNOWN_LOG_COOLDOWN_S", "15"))
        )
        self._unknown_log_min_visible_s = max(
            0.0, float(os.getenv("UNKNOWN_LOG_MIN_VISIBLE_S", "1.0"))
        )
        self._unknown_last_logged_by_track: Dict[str, float] = {}

        self._cam_state: Dict[str, CameraScanState] = {}
        self._enabled_for_attendance: Dict[str, bool] = {}
        # Stream type per camera (attendance/headcount). This is set by api_server
        # based on who is currently watching the recognition stream.
        self._stream_type_by_camera: Dict[str, str] = {}
        self._authorized_employee_ids_by_camera: Dict[str, set[str]] = {}
        self._authorized_last_fetch_by_camera: Dict[str, float] = {}
        self._authorized_cache_ttl_s = max(
            0.0, float(os.getenv("CAMERA_AUTHORIZED_CACHE_TTL_S", "5"))
        )
        self._bounding_boxes_by_camera: Dict[str, List[BoundingBoxRuntimeBox]] = {}
        self._bounding_boxes_last_fetch_by_camera: Dict[str, float] = {}
        self._bounding_boxes_cache_ttl_s = max(
            0.0, float(os.getenv("CAMERA_BOUNDING_BOX_CACHE_TTL_S", "5"))
        )
        self._bounding_box_tracking_enabled = (
            str(os.getenv("BOUNDING_BOX_TRACKING_ENABLED", "1")).strip() != "0"
        )
        self._bounding_box_transition_min_s = max(
            0.0, float(os.getenv("BOUNDING_BOX_TRACKING_TRANSITION_SECONDS", "1.0"))
        )
        self._bounding_box_tracking_state: Dict[str, Dict[str, Any]] = {}
        self._bounding_box_tracking_max_states = max(
            100, int(float(os.getenv("BOUNDING_BOX_TRACKING_MAX_STATES", "5000")))
        )

        # ---------------------------
        # Attendance voice events (frontend speaks serially, per company)
        # ---------------------------
        self._voice_lock = threading.Lock()
        self._voice_cv = threading.Condition(self._voice_lock)
        self._voice_seq: Dict[str, int] = {}  # company_key -> latest seq
        self._voice_events: Dict[str, List[Dict[str, Any]]] = (
            {}
        )  # company_key -> events
        self._voice_max_events: int = int(os.getenv("ATT_VOICE_MAX_EVENTS", "500"))

        self._emp_id_to_int_by_company: Dict[str, Dict[str, int]] = {}
        self._next_emp_int_by_company: Dict[str, int] = {}

        # ---------------------------
        # Face Anti-Spoofing (FAS)
        # ---------------------------
        fas_enabled = os.getenv("FAS_ENABLED", "1") == "1"
        fas_onnx_path = resolve_ai_path(
            os.getenv("FAS_ONNX_PATH", "app/fas/models/fas.onnx")
        )

        min_yaw_range = os.getenv("FAS_MIN_YAW_RANGE", "0.035")

        self.fas_gate = FASGate(
            onnx_path=fas_onnx_path,
            providers=["CPUExecutionProvider"],
            default_cfg=GateConfig(
                enabled=fas_enabled,
                fas_threshold=float(os.getenv("FAS_THRESHOLD", "0.55")),
                motion_window_sec=float(os.getenv("FAS_MOTION_WINDOW", "1.5")),
                min_yaw_range=float(min_yaw_range),
                use_heuristics=(os.getenv("FAS_USE_HEURISTICS", "1") == "1"),
                close_face_max_area_ratio=float(
                    os.getenv("FAS_CLOSE_FACE_MAX_AREA_RATIO", "0.18")
                ),
                close_face_max_width_ratio=float(
                    os.getenv("FAS_CLOSE_FACE_MAX_WIDTH_RATIO", "0.60")
                ),
                cooldown_sec=float(os.getenv("FAS_COOLDOWN_SEC", "2.0")),
            ),
            input_size=(112, 112),
        )
        # Laptop/WebRTC feeds can be noisy for anti-spoof models and may block
        # all marks. Default to bypassing FAS for camera ids like "laptop-<companyId>".
        self._fas_skip_laptop = os.getenv("FAS_SKIP_LAPTOP", "1") == "1"
        self._door_unlock_on_recognition = (
            str(os.getenv("DOOR_UNLOCK_ON_RECOGNITION", "0")).strip() == "1"
        )

        # ---------------------------
        # ERP push (optional, company-wise)
        # ---------------------------
        self._erp_queues_by_company: Dict[str, ERPPushQueue] = {}
        self._erp_queue_cfg_by_company: Dict[str, Tuple[str, str, str]] = {}
        self._erp_queue_lock = threading.Lock()

    @property
    def default_company_id(self) -> Optional[str]:
        return self._default_company_id

    def shutdown(self) -> None:
        """
        Best-effort cleanup for background resources.
        """
        try:
            if getattr(self, "_gpu", None) is not None:
                self._gpu.stop()
        except Exception:
            pass

        try:
            if getattr(self, "_db_writer", None) is not None:
                self._db_writer.stop(drain_timeout_s=2.0)
        except Exception:
            pass

        try:
            with self._erp_queue_lock:
                queues = list(self._erp_queues_by_company.values())
                self._erp_queues_by_company.clear()
                self._erp_queue_cfg_by_company.clear()
            for q in queues:
                try:
                    q.stop()
                except Exception:
                    pass
        except Exception:
            pass

        try:
            if getattr(self, "_nvml", None) is not None:
                self._nvml.nvmlShutdown()
        except Exception:
            pass

    def push_voice_event(
        self,
        *,
        employee_id: str,
        name: str,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
    ) -> int:
        """
        Record an attendance voice event to be consumed by the frontend.
        Frontend should speak these events one-by-one (no overlap).
        """
        company_key = self._gallery_key(company_id)
        full_name = str(name or "").strip()
        tokens = (
            full_name.replace(",", " ").replace(".", " ").split() if full_name else []
        )
        first_name = tokens[0] if tokens else str(employee_id).strip()

        # ✅ "Switch-case" / explicit override mapping (checked first)
        # Put the exact strings you expect as keys (usually lowercased)
        explicit_map = {
            # "exact input name": "what to speak"
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

        # Normalize for matching (case-insensitive, ignores commas/dots like above)
        normalized_full = " ".join(tokens).lower().strip()
        if normalized_full in explicit_map:
            first_name = explicit_map[normalized_full]

        # ✅ your existing logic remains the same
        if len(tokens) >= 2 and first_name.lower() in {
            "mr",
            "mrs",
            "ms",
            "md",
            "dr",
            "allama",
            "mohammad",
            "s.m",
            "al",
        }:
            first_name = tokens[1]

        first_name = first_name.strip() or str(employee_id).strip() or "there"
        text = f"Thank you, {first_name}."
        with self._voice_cv:
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
            if self._voice_max_events > 0 and len(bucket) > self._voice_max_events:
                self._voice_events[company_key] = bucket[-self._voice_max_events :]
            self._voice_cv.notify_all()
            return seq

    def get_voice_events(
        self,
        *,
        company_id: Optional[str],
        after_seq: int = 0,
        limit: int = 50,
        wait_ms: int = 0,
    ) -> Dict[str, Any]:
        company_key = self._gallery_key(company_id)
        after_seq = int(after_seq or 0)
        limit = max(1, min(int(limit or 50), 200))
        wait_ms = max(0, min(int(wait_ms or 0), 300_000))

        deadline = time.time() + (wait_ms / 1000.0) if wait_ms else 0.0

        with self._voice_cv:
            while wait_ms and int(self._voice_seq.get(company_key, 0)) <= after_seq:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._voice_cv.wait(timeout=remaining)

            latest_seq = int(self._voice_seq.get(company_key, 0))
            bucket = self._voice_events.get(company_key, [])
            items = [e for e in bucket if int(e.get("seq", 0)) > after_seq]
        return {"latest_seq": latest_seq, "events": items[:limit]}

    def set_attendance_enabled(self, camera_id: str, enabled: bool) -> None:
        self._enabled_for_attendance[str(camera_id)] = bool(enabled)

    def is_attendance_enabled(self, camera_id: str) -> bool:
        return bool(self._enabled_for_attendance.get(str(camera_id), True))

    def set_stream_type(self, camera_id: str, stream_type: str) -> None:
        st = str(stream_type or "").strip().lower() or "attendance"
        self._stream_type_by_camera[str(camera_id)] = st

    def get_stream_type(self, camera_id: str) -> str:
        return str(
            self._stream_type_by_camera.get(str(camera_id), "attendance")
            or "attendance"
        )

    def set_authorized_employee_ids(
        self, camera_id: str, employee_ids: Optional[List[str]]
    ) -> None:
        cid = str(camera_id or "").strip()
        if not cid:
            return

        values = employee_ids or []
        cleaned = {
            str(value or "").strip() for value in values if str(value or "").strip()
        }
        self._authorized_employee_ids_by_camera[cid] = cleaned
        self._authorized_last_fetch_by_camera[cid] = time.time()

    def get_authorized_employee_ids(self, camera_id: str) -> set[str]:
        cid = str(camera_id or "").strip()
        if not cid:
            return set()
        values = self._authorized_employee_ids_by_camera.get(cid)
        return set(values or set())

    def _refresh_authorized_employee_ids(
        self, camera_id: str, company_id: Optional[str]
    ) -> set[str]:
        cid = str(camera_id or "").strip()
        if not cid:
            return set()

        now = time.time()
        ttl_s = float(self._authorized_cache_ttl_s)
        last_fetch = float(self._authorized_last_fetch_by_camera.get(cid, 0.0) or 0.0)
        cached = self._authorized_employee_ids_by_camera.get(cid)

        if cached is not None and ttl_s > 0.0 and (now - last_fetch) < ttl_s:
            return set(cached)

        comp = str(company_id or "").strip()
        if not comp:
            return set(cached or set())

        try:
            payload = self._client_for_company(comp).get_camera_authorized_employees(
                cid
            )
            raw_ids = payload.get("authorizedEmployeePublicIds") or []
            if not isinstance(raw_ids, list):
                raw_ids = []

            values = {str(v or "").strip() for v in raw_ids if str(v or "").strip()}
            self._authorized_employee_ids_by_camera[cid] = values
            self._authorized_last_fetch_by_camera[cid] = now
            return set(values)
        except Exception:
            self._authorized_last_fetch_by_camera[cid] = now
            return set(cached or set())

    @staticmethod
    def _unit_float(value: Any) -> float:
        try:
            v = float(value)
        except Exception:
            return 0.0
        if v < 0.0:
            return 0.0
        if v > 1.0:
            return 1.0
        return v

    def _parse_runtime_box(self, raw: Dict[str, Any]) -> Optional[BoundingBoxRuntimeBox]:
        box_id = str(raw.get("id") or "").strip()
        if not box_id:
            return None

        employee_ids_raw = raw.get("employeePublicIds") or raw.get("employeeIds") or []
        if not isinstance(employee_ids_raw, list):
            employee_ids_raw = []
        employee_ids = {
            str(value or "").strip()
            for value in employee_ids_raw
            if str(value or "").strip()
        }
        if not employee_ids:
            return None

        xs: list[float] = []
        ys: list[float] = []
        for key in ("topLeft", "topRight", "bottomLeft", "bottomRight"):
            point = raw.get(key) or {}
            if not isinstance(point, dict):
                continue
            xs.append(self._unit_float(point.get("x")))
            ys.append(self._unit_float(point.get("y")))

        if not xs or not ys:
            return None

        left = min(xs)
        right = max(xs)
        top = min(ys)
        bottom = max(ys)
        if (right - left) <= 0.001 or (bottom - top) <= 0.001:
            return None

        return BoundingBoxRuntimeBox(
            id=box_id,
            name=str(raw.get("name") or box_id).strip() or box_id,
            left=left,
            top=top,
            right=right,
            bottom=bottom,
            employee_ids=employee_ids,
        )

    def _refresh_bounding_boxes(
        self, camera_id: str, company_id: Optional[str]
    ) -> List[BoundingBoxRuntimeBox]:
        if not self._bounding_box_tracking_enabled:
            return []

        cid = str(camera_id or "").strip()
        if not cid:
            return []

        now = time.time()
        ttl_s = float(self._bounding_boxes_cache_ttl_s)
        last_fetch = float(
            self._bounding_boxes_last_fetch_by_camera.get(cid, 0.0) or 0.0
        )
        cached = self._bounding_boxes_by_camera.get(cid)
        if cached is not None and ttl_s > 0.0 and (now - last_fetch) < ttl_s:
            return list(cached)

        comp = str(company_id or "").strip()
        if not comp:
            return list(cached or [])

        try:
            payload = self._client_for_company(comp).get_camera_bounding_boxes(cid)
            raw_boxes = payload.get("boxes") or []
            if not isinstance(raw_boxes, list):
                raw_boxes = []

            boxes: list[BoundingBoxRuntimeBox] = []
            for raw in raw_boxes:
                if not isinstance(raw, dict):
                    continue
                parsed = self._parse_runtime_box(raw)
                if parsed is not None:
                    boxes.append(parsed)

            self._bounding_boxes_by_camera[cid] = boxes
            self._bounding_boxes_last_fetch_by_camera[cid] = now
            return list(boxes)
        except Exception as e:
            self._bounding_boxes_last_fetch_by_camera[cid] = now
            if cached is not None:
                return list(cached)
            print(f"[BOX-TRACK] boxes load failed company={comp} cam={cid} err={e}")
            return []

    @staticmethod
    def _point_inside_runtime_box(
        box: BoundingBoxRuntimeBox, x_unit: float, y_unit: float
    ) -> bool:
        return (
            box.left <= x_unit <= box.right
            and box.top <= y_unit <= box.bottom
        )

    @staticmethod
    def _box_tracking_key(
        *, company_id: Optional[str], camera_id: str, box_id: str, employee_id: str
    ) -> str:
        comp = str(company_id or "").strip()
        return f"{comp}:{camera_id}:{box_id}:{employee_id}"

    def _push_bounding_box_tracking_event(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        camera_name: str,
        box_id: str,
        employee_id: str,
        event_type: str,
        confidence: Optional[float],
    ) -> None:
        comp = str(company_id or "").strip()
        if not comp:
            return

        client = self._client_for_company(comp)
        timestamp_iso = now_iso()

        def _do():
            try:
                client.create_bounding_box_tracking_event(
                    camera_id=str(camera_id),
                    bounding_box_id=str(box_id),
                    employee_id=str(employee_id),
                    event_type=str(event_type),
                    occurred_at=timestamp_iso,
                    confidence=float(confidence) if confidence is not None else None,
                )
            except Exception as e:
                print(
                    "[BOX-TRACK] write failed "
                    f"company={comp} cam={camera_id} camera={camera_name} "
                    f"box={box_id} emp={employee_id} event={event_type} err={e}"
                )

        threading.Thread(target=_do, daemon=True).start()

    def _prune_bounding_box_tracking_state(self, now: float) -> None:
        if len(self._bounding_box_tracking_state) <= self._bounding_box_tracking_max_states:
            return

        cutoff = now - 3600.0
        kept = {
            key: value
            for key, value in self._bounding_box_tracking_state.items()
            if float(value.get("last_seen", 0.0) or 0.0) >= cutoff
        }
        if len(kept) > self._bounding_box_tracking_max_states:
            items = sorted(
                kept.items(),
                key=lambda item: float(item[1].get("last_seen", 0.0) or 0.0),
                reverse=True,
            )
            kept = dict(items[: self._bounding_box_tracking_max_states])
        self._bounding_box_tracking_state = kept

    def _update_bounding_box_tracking_state(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        camera_name: str,
        box_id: str,
        employee_id: str,
        outside: bool,
        confidence: Optional[float],
        now: float,
    ) -> None:
        key = self._box_tracking_key(
            company_id=company_id,
            camera_id=camera_id,
            box_id=box_id,
            employee_id=employee_id,
        )
        state = self._bounding_box_tracking_state.setdefault(
            key,
            {
                "armed": False,
                "outside": False,
                "pending_outside": None,
                "pending_since": 0.0,
                "last_seen": now,
            },
        )
        state["last_seen"] = now

        observed_outside = bool(outside)
        if not bool(state.get("armed", False)):
            state["outside"] = False
            state["pending_outside"] = None
            state["pending_since"] = 0.0
            if not observed_outside:
                state["armed"] = True
                # Bootstrap recovery:
                # if backend already has an open "out" row (even from a previous day),
                # this first confirmed inside state should close it by writing "in".
                # When no open row exists, backend no-ops with "no_open_tracking_record".
                self._push_bounding_box_tracking_event(
                    company_id=company_id,
                    camera_id=camera_id,
                    camera_name=camera_name,
                    box_id=box_id,
                    employee_id=employee_id,
                    event_type="in",
                    confidence=confidence,
                )
            return

        current_outside = bool(state.get("outside", False))
        if observed_outside == current_outside:
            state["pending_outside"] = None
            state["pending_since"] = 0.0
            return

        pending_outside = state.get("pending_outside")
        if pending_outside is None or bool(pending_outside) != observed_outside:
            state["pending_outside"] = observed_outside
            state["pending_since"] = now
            return

        pending_since = float(state.get("pending_since", now) or now)
        if (now - pending_since) < float(self._bounding_box_transition_min_s):
            return

        state["outside"] = observed_outside
        state["pending_outside"] = None
        state["pending_since"] = 0.0
        event_type = "out" if observed_outside else "in"
        self._push_bounding_box_tracking_event(
            company_id=company_id,
            camera_id=camera_id,
            camera_name=camera_name,
            box_id=box_id,
            employee_id=employee_id,
            event_type=event_type,
            confidence=confidence,
        )
        self._prune_bounding_box_tracking_state(now)

    def _handle_bounding_box_tracking_for_track(
        self,
        *,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
        boxes: List[BoundingBoxRuntimeBox],
        employee_id: str,
        bbox: Tuple[int, int, int, int],
        frame_shape: Tuple[int, int],
        confidence: Optional[float],
        now: float,
    ) -> None:
        if not boxes:
            return
        emp = str(employee_id or "").strip()
        if not self._is_known_employee_id(emp):
            return

        h, w = frame_shape
        if h <= 0 or w <= 0:
            return

        x1, y1, x2, y2 = [int(v) for v in bbox]
        cx = self._unit_float(((x1 + x2) * 0.5) / float(w))
        cy = self._unit_float(((y1 + y2) * 0.5) / float(h))

        for box in boxes:
            if emp not in box.employee_ids:
                continue
            outside = not self._point_inside_runtime_box(box, cx, cy)
            self._update_bounding_box_tracking_state(
                company_id=company_id,
                camera_id=str(camera_id),
                camera_name=str(camera_name),
                box_id=box.id,
                employee_id=emp,
                outside=outside,
                confidence=confidence,
                now=now,
            )

    def set_company_for_camera(self, camera_id: str, company_id: Optional[str]) -> None:
        cid = str(camera_id)
        comp = str(company_id or "").strip()
        if comp:
            self._company_by_camera[cid] = comp
        else:
            self._company_by_camera.pop(cid, None)

    def _gallery_key(self, company_id: Optional[str]) -> str:
        cid = str(company_id or "").strip()
        return cid if cid else "__default__"

    def _client_for_company(self, company_id: Optional[str]) -> BackendClient:
        cid = str(company_id or "").strip()
        if not cid:
            return self._default_client
        client = self._clients_by_company.get(cid)
        if client is None:
            client = BackendClient(company_id=cid)
            self._clients_by_company[cid] = client
        return client

    def _emp_str_to_int(self, company_id: Optional[str], emp_id_str: str) -> int:
        emp_id_str = str(emp_id_str)
        key = self._gallery_key(company_id)

        emp_id_to_int = self._emp_id_to_int_by_company.setdefault(key, {})
        self._next_emp_int_by_company.setdefault(key, -2)

        if emp_id_str.isdigit():
            return int(emp_id_str)

        mapped = emp_id_to_int.get(emp_id_str)
        if mapped is not None:
            return int(mapped)

        v = int(self._next_emp_int_by_company[key])
        self._next_emp_int_by_company[key] = v - 1
        emp_id_to_int[emp_id_str] = v
        return v

    def _ensure_gallery(self, company_id: Optional[str]) -> None:
        key = self._gallery_key(company_id)
        now = time.time()
        last_load = self._gallery_last_load_by_company.get(key, 0.0)
        if now - last_load < self.gallery_refresh_s:
            return
        if not company_id:
            self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
            self._gallery_meta_by_company[key] = []
            self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)
            self._employee_pic_by_company[key] = {}
            self._gallery_last_load_by_company[key] = now
            return

        client = self._client_for_company(company_id)
        try:
            templates = client.list_templates()
        except Exception as e:
            print(f"[GALLERY] load failed company={company_id or 'default'}: {e}")
            self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
            self._gallery_meta_by_company[key] = []
            self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)
            self._gallery_last_load_by_company[key] = now
            return

        embs: List[np.ndarray] = []
        meta: List[Tuple[int, str, str]] = []

        for t in templates:
            emp_id_str = str(t.get("employeeId") or t.get("employee_id") or "").strip()
            if not emp_id_str:
                continue

            emb_list = t.get("embedding") or []
            if not isinstance(emb_list, list) or len(emb_list) < 10:
                continue

            emb = np.asarray(emb_list, dtype=np.float32)
            emb = l2_normalize(emb)

            name = str(
                t.get("employeeName")
                or t.get("employee_name")
                or t.get("name")
                or emp_id_str
            )
            emp_int = self._emp_str_to_int(company_id, emp_id_str)

            embs.append(emb)
            meta.append((emp_int, emp_id_str, name))

        self._gallery_matrix_by_company[key] = (
            np.stack(embs, axis=0) if embs else np.zeros((0, 512), dtype=np.float32)
        )
        self._gallery_meta_by_company[key] = meta
        if meta:
            self._gallery_emp_ids_by_company[key] = np.asarray(
                [m[0] for m in meta], dtype=np.int32
            )
        else:
            self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)
        self._refresh_employee_pic_cache(company_id, client)
        self._gallery_last_load_by_company[key] = now

    def _refresh_employee_pic_cache(
        self, company_id: Optional[str], client: BackendClient
    ) -> None:
        key = self._gallery_key(company_id)
        try:
            employees = client.list_employees()
        except Exception as e:
            print(
                f"[EMPLOYEE] pic cache load failed company={company_id or 'default'}: {e}"
            )
            return

        pic_map: Dict[str, str] = {}
        for employee in employees:
            pic_url = str(
                employee.get("empPicUrl") or employee.get("emp_pic_url") or ""
            ).strip()
            if not pic_url:
                continue
            for candidate in (
                employee.get("empId"),
                employee.get("emp_id"),
                employee.get("employeeId"),
                employee.get("employee_id"),
                employee.get("id"),
            ):
                employee_key = str(candidate or "").strip()
                if employee_key:
                    pic_map[employee_key] = pic_url

        self._employee_pic_by_company[key] = pic_map

    def _employee_pic_url(
        self, company_id: Optional[str], employee_id: Optional[str]
    ) -> Optional[str]:
        employee_key = str(employee_id or "").strip()
        if not employee_key:
            return None
        key = self._gallery_key(company_id)
        pic_url = self._employee_pic_by_company.get(key, {}).get(employee_key)
        if not pic_url:
            return None
        return str(pic_url)

    @staticmethod
    def _normalize_relay_url(value: Any) -> Optional[str]:
        url = str(value or "").strip()
        return url or None

    def _relay_urls_for_company(
        self, company_id: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        cid = str(company_id or "").strip()
        if not cid:
            return None, None

        key = self._gallery_key(cid)
        now = time.time()
        ttl = float(self._relay_settings_cache_ttl_s)

        has_cached = key in self._relay_settings_cache_by_company
        cached = self._relay_settings_cache_by_company.get(key, {})
        last_fetch = float(self._relay_settings_last_fetch_by_company.get(key, 0.0))

        if has_cached and (ttl <= 0.0 or (now - last_fetch) < ttl):
            relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
            relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
            return relay_on, relay_silent

        client = self._client_for_company(cid)
        try:
            data = client.get_relay_settings()
            relay_on = self._normalize_relay_url(
                data.get("relayOnUrl") or data.get("relay_on_url")
            )
            relay_silent = self._normalize_relay_url(
                data.get("relaySilentUrl") or data.get("relay_silent_url")
            )
            self._relay_settings_cache_by_company[key] = {
                "relay_on_url": relay_on,
                "relay_silent_url": relay_silent,
            }
            self._relay_settings_last_fetch_by_company[key] = now
            return relay_on, relay_silent
        except Exception as e:
            self._relay_settings_last_fetch_by_company[key] = now
            if has_cached:
                relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
                relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
                return relay_on, relay_silent
            print(f"[RELAY] settings load failed company={cid or 'default'} err={e}")
            return None, None

    @staticmethod
    def _normalize_erp_prefix(value: Any) -> Optional[str]:
        prefix = str(value or "").strip()
        if not prefix:
            return None
        return prefix if prefix.startswith("/") else f"/{prefix}"

    @staticmethod
    def _normalize_erp_endpoint(value: Any) -> Optional[str]:
        endpoint = str(value or "").strip()
        if not endpoint:
            return None
        low = endpoint.lower()
        if low.startswith("http://") or low.startswith("https://"):
            return endpoint
        return endpoint if endpoint.startswith("/") else f"/{endpoint}"

    def _erp_settings_for_company(
        self, company_id: Optional[str], url_type: str = "attendance"
    ) -> Tuple[Optional[str], Optional[str], Optional[str], bool]:
        cid = str(company_id or "").strip()
        if not cid:
            return None, None, None, True

        key = f"{self._gallery_key(cid)}:{url_type}"
        now = time.time()
        ttl = float(self._erp_settings_cache_ttl_s)

        has_cached = key in self._erp_settings_cache_by_company
        cached = self._erp_settings_cache_by_company.get(key, {})
        last_fetch = float(self._erp_settings_last_fetch_by_company.get(key, 0.0))

        if has_cached and (ttl <= 0.0 or (now - last_fetch) < ttl):
            base_url = self._normalize_relay_url(cached.get("erp_base_url"))
            prefix = self._normalize_erp_prefix(cached.get("erp_prefix"))
            endpoint = self._normalize_erp_endpoint(
                cached.get("erp_attendance_endpoint")
            )
            is_active = bool(cached.get("is_active", True))
            return base_url, prefix, endpoint, is_active

        client = self._client_for_company(cid)
        try:
            data = client.get_erp_settings(url_type=url_type)
            base_url = self._normalize_relay_url(
                data.get("erpBaseUrl") or data.get("erp_base_url")
            )
            prefix = self._normalize_erp_prefix(
                data.get("erpPrefix") or data.get("erp_prefix")
            )
            endpoint = self._normalize_erp_endpoint(
                data.get("erpAttendanceEndpoint") or data.get("erp_attendance_endpoint")
            )
            is_active = data.get("isActive")
            if is_active is None:
                is_active = data.get("is_active")
            if is_active is None:
                is_active = True
            is_active = bool(is_active)

            self._erp_settings_cache_by_company[key] = {
                "erp_base_url": base_url,
                "erp_prefix": prefix,
                "erp_attendance_endpoint": endpoint,
                "is_active": is_active,
            }
            self._erp_settings_last_fetch_by_company[key] = now
            return base_url, prefix, endpoint, is_active
        except Exception as e:
            self._erp_settings_last_fetch_by_company[key] = now
            if has_cached:
                base_url = self._normalize_relay_url(cached.get("erp_base_url"))
                prefix = self._normalize_erp_prefix(cached.get("erp_prefix"))
                endpoint = self._normalize_erp_endpoint(
                    cached.get("erp_attendance_endpoint")
                )
                is_active = bool(cached.get("is_active", True))
                return base_url, prefix, endpoint, is_active
            print(f"[ERP] settings load failed company={cid or 'default'} type={url_type} err={e}")
            return None, None, None, True

    def _erp_queue_for_company(
        self, company_id: Optional[str], url_type: str = "attendance"
    ) -> Optional[ERPPushQueue]:
        cid = str(company_id or "").strip()
        if not cid:
            return None

        base_url, configured_prefix, configured_endpoint, is_active = (
            self._erp_settings_for_company(cid, url_type)
        )
        map_key = f"{self._gallery_key(cid)}:{url_type}"
        is_abs_endpoint = bool(
            configured_endpoint
            and str(configured_endpoint).lower().startswith(("http://", "https://"))
        )
        if not base_url and is_abs_endpoint:
            # Absolute endpoint does not use HttpClient base_url/prefix.
            # Keep a harmless placeholder base so ERPClientConfig stays valid.
            base_url = "http://127.0.0.1"

        if (not base_url) or (not is_active):
            old_queue: Optional[ERPPushQueue] = None
            with self._erp_queue_lock:
                old_queue = self._erp_queues_by_company.pop(map_key, None)
                self._erp_queue_cfg_by_company.pop(map_key, None)
            if old_queue is not None:
                try:
                    old_queue.stop()
                except Exception:
                    pass
            return None

        env_prefix = self._normalize_erp_prefix(os.getenv("ERP_PREFIX", ""))
        if configured_prefix is not None:
            prefix = configured_prefix
        elif configured_endpoint:
            # Endpoint can include full path (e.g. /api/v2/Attendance/manual-attendance)
            # so do not inject an implicit prefix.
            prefix = ""
        else:
            prefix = env_prefix or ""

        endpoint = (
            self._normalize_erp_endpoint(
                configured_endpoint or os.getenv("ERP_ATTENDANCE_ENDPOINT", "")
            )
            or "/Attendance/manual-attendance"
        )

        cfg_key = (base_url, prefix, endpoint)
        old_queue: Optional[ERPPushQueue] = None

        with self._erp_queue_lock:
            existing = self._erp_queues_by_company.get(map_key)
            existing_cfg = self._erp_queue_cfg_by_company.get(map_key)
            if existing is not None and existing_cfg == cfg_key:
                return existing

            if existing is not None:
                old_queue = existing
                self._erp_queues_by_company.pop(map_key, None)
                self._erp_queue_cfg_by_company.pop(map_key, None)

            erp_cfg = ERPClientConfig(
                base_url=base_url,
                prefix=prefix,
                timeout_s=float(self._erp_timeout_s),
                api_version=str(self._erp_api_version),
                attendance_endpoint=endpoint,
                url_type=url_type,
            )
            erp_client = ERPClient(erp_cfg)

            def _erp_err(e: Exception, job: ERPPushJob):
                print(f"[ERP] push failed company={cid} type={url_type} err={e} | job={job}")

            queue = ERPPushQueue(erp_client, on_error=_erp_err)
            self._erp_queues_by_company[map_key] = queue
            self._erp_queue_cfg_by_company[map_key] = cfg_key

        if old_queue is not None:
            try:
                old_queue.stop()
            except Exception:
                pass

        return queue

    def _get_state(self, camera_id: str) -> CameraScanState:
        cid = str(camera_id)
        st = self._cam_state.get(cid)
        if st is not None:
            return st

        motion = SceneMotionGate(
            threshold=float(self.cfg.motion_threshold),
            hysteresis_ratio=float(self.cfg.motion_hysteresis_ratio),
            cooldown_seconds=float(self.cfg.motion_cooldown_seconds),
            resize=(int(self.cfg.motion_resize_w), int(self.cfg.motion_resize_h)),
        )
        scheduler = AdaptiveScheduler(self.cfg)
        tracker = TrackerManager(self.cfg)

        def _match(emb: np.ndarray, *, _cid: str = cid) -> MatchResult:
            return self._match_embedding(_cid, emb)

        recognizer = Recognizer(
            self.cfg, embedder=self._embedder, match_embedding=_match
        )
        now = time.time()
        st = CameraScanState(
            tracker=tracker,
            motion=motion,
            scheduler=scheduler,
            recognizer=recognizer,
            last_log_ts=now,
        )
        self._cam_state[cid] = st
        return st

    def _relay_http(
        self,
        camera_id: str,
        turn_on: bool,
        employee_id: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> None:
        emp_id = str(employee_id or "").strip()
        if not self._is_known_employee_id(emp_id):
            return

        # Lazy init so you don't have to touch __init__
        if not hasattr(self, "_relay_state_by_camera"):
            self._relay_state_by_camera = {}  # cid -> "on"/"off"
            self._relay_last_ts_by_camera = {}  # cid -> last call time
            self._relay_min_interval_s = float(
                os.getenv("RELAY_MIN_INTERVAL_S", "0.75")
            )
            self._relay_http_timeout_s = float(os.getenv("RELAY_HTTP_TIMEOUT_S", "0.4"))

        cid = str(camera_id)
        desired = "on" if turn_on else "off"
        # CHANGE TO (optional safety):
        if not turn_on:
            return
        relay_on_url, _ = self._relay_urls_for_company(company_id)
        if not relay_on_url:
            return
        url = relay_on_url
        if emp_id:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"
            emp_pic_url = self._employee_pic_url(company_id, emp_id)
            if emp_pic_url:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}empPicUrl={urllib.parse.quote(emp_pic_url, safe='')}"
        now = time.time()
        last_state = self._relay_state_by_camera.get(cid)
        last_ts = self._relay_last_ts_by_camera.get(cid, 0.0)

        # Debounce: only call when state changes or enough time passed
        if last_state == desired and (now - last_ts) < self._relay_min_interval_s:
            return

        self._relay_state_by_camera[cid] = desired
        self._relay_last_ts_by_camera[cid] = now

        def _do():
            try:
                # Some relay devices respond slowly or never close the connection;
                # we only need to fire the request, not read the full body.
                resp = urllib.request.urlopen(url, timeout=self._relay_http_timeout_s)
                resp.close()
                print(f"[RELAY] {desired} cid={cid} url={url}")
            except Exception as e:
                print(f"[RELAY] failed cid={cid} url={url} err={e}")

        threading.Thread(target=_do, daemon=True).start()

    def _trigger_door_unlock(
        self,
        *,
        camera_id: str,
        employee_id: str,
        company_id: Optional[str],
        name: str,
        similarity: float,
    ) -> None:
        """
        Fire-and-forget door unlock.
        Called on EVERY known recognition.
        No attendance debounce.
        """
        emp_id = str(employee_id or "").strip()
        if not self._is_known_employee_id(emp_id):
            return

        # ---- lightweight spam protection (VERY IMPORTANT) ----
        # prevents unlock firing 30 times per second for same person
        if not hasattr(self, "_door_last_fire"):
            self._door_last_fire = {}  # key -> last_ts

        key = f"{camera_id}:{emp_id}"
        now = time.time()

        # allow unlock once every X seconds per person
        # Keep this small so unlock feels instant, but still prevents per-frame spam.
        min_gap = max(0.0, float(os.getenv("DOOR_UNLOCK_MIN_GAP", "0.15")))
        last = self._door_last_fire.get(key, 0.0)
        if now - last < min_gap:
            return

        self._door_last_fire[key] = now

        _, relay_silent_url = self._relay_urls_for_company(company_id)
        if not relay_silent_url:
            return
        url = relay_silent_url
        if emp_id:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"
            emp_pic_url = self._employee_pic_url(company_id, emp_id)
            if emp_pic_url:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}empPicUrl={urllib.parse.quote(emp_pic_url, safe='')}"

        def _do():
            try:
                # fire-and-forget HTTP call
                resp = urllib.request.urlopen(url, timeout=0.4)
                resp.close()

                print(
                    f"[DOOR] unlock fired cid={camera_id} emp={emp_id} url={url} "
                    f"name={name} sim={similarity:.3f}"
                )
            except Exception as e:
                print(f"[DOOR] failed cid={camera_id} emp={emp_id} url={url} err={e}")

        threading.Thread(target=_do, daemon=True).start()

    @staticmethod
    def _is_known_employee_id(employee_id: Optional[str]) -> bool:
        emp_id = str(employee_id or "").strip()
        if not emp_id:
            return False
        return emp_id.lower() not in {"unknown", "none", "null"}

    def _unknown_track_key(
        self, company_id: Optional[str], camera_id: str, track_id: int
    ) -> str:
        return f"{self._gallery_key(company_id)}::{str(camera_id)}::{int(track_id)}"

    def _unknown_person_key(
        self, company_id: Optional[str], employee_id: str
    ) -> str:
        return f"{self._gallery_key(company_id)}::person::{str(employee_id).strip()}"

    def _should_log_unknown(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        track: Any,
        now: float,
        treat_known_as_unknown: bool = False,
    ) -> bool:
        if not treat_known_as_unknown and self._is_known_employee_id(
            getattr(track, "person_id", None)
        ):
            return False

        min_visible_s = float(self._unknown_log_min_visible_s)
        unknown_since = float(getattr(track, "unknown_since_ts", 0.0) or 0.0)
        if (
            min_visible_s > 0.0
            and unknown_since > 0.0
            and (now - unknown_since) < min_visible_s
        ):
            return False

        cooldown_s = float(self._unknown_log_cooldown_s)
        if treat_known_as_unknown:
            emp_id = str(getattr(track, "person_id", "")).strip()
            if not self._is_known_employee_id(emp_id):
                return False
            key = self._unknown_person_key(company_id, emp_id)
            cooldown_s = float(self.cfg.attendance_debounce_seconds)
        else:
            track_id = int(getattr(track, "track_id", -1))
            if track_id < 0:
                return False
            key = self._unknown_track_key(company_id, camera_id, track_id)

        last_ts = float(self._unknown_last_logged_by_track.get(key, 0.0))
        if cooldown_s > 0.0 and (now - last_ts) < cooldown_s:
            return False

        self._unknown_last_logged_by_track[key] = now

        # Keep memory bounded for long-running streams.
        if len(self._unknown_last_logged_by_track) > 10000:
            cutoff = now - max(60.0, cooldown_s * 4.0)
            self._unknown_last_logged_by_track = {
                k: v
                for k, v in self._unknown_last_logged_by_track.items()
                if v >= cutoff
            }

        return True

    def _push_unknown_recognition(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        camera_name: str,
        confidence: Optional[float],
        timestamp_iso: str,
        recognized_name: Optional[str] = None,
    ) -> None:
        cid = str(company_id or "").strip()
        if not cid:
            return

        client = self._client_for_company(cid)

        def _do():
            try:
                client.create_unknown_recognition(
                    timestamp=str(timestamp_iso),
                    camera_id=str(camera_id),
                    camera_name=str(camera_name),
                    confidence=float(confidence) if confidence is not None else None,
                    name=(
                        str(recognized_name).strip()
                        if recognized_name is not None and str(recognized_name).strip()
                        else None
                    ),
                )
            except Exception as e:
                print(f"[UNKNOWN] write failed company={cid} cam={camera_id} err={e}")

        threading.Thread(target=_do, daemon=True).start()

    # -------------------------
    # Pipeline integration points
    # -------------------------
    def _detect_faces(self, frame_bgr: np.ndarray) -> List[Detection]:
        dets = self._detector.detect(frame_bgr)
        h, w = frame_bgr.shape[:2]
        out: List[Detection] = []
        for d in dets:
            x1, y1, x2, y2 = [int(v) for v in d.bbox]
            x1 = max(0, min(w - 1, x1))
            y1 = max(0, min(h - 1, y1))
            x2 = max(0, min(w, x2))
            y2 = max(0, min(h, y2))
            if x2 <= x1 or y2 <= y1:
                continue
            out.append(
                Detection(
                    bbox=(x1, y1, x2, y2),
                    kps=d.kps,
                    det_score=float(d.det_score),
                )
            )
        return out

    def _match_embedding(self, camera_id: str, emb: np.ndarray) -> MatchResult:
        cid = str(camera_id)
        company_id = self._company_by_camera.get(cid) or self._default_company_id
        key = self._gallery_key(company_id)
        gallery_matrix = self._gallery_matrix_by_company.get(key)
        gallery_meta = self._gallery_meta_by_company.get(key, [])
        gallery_emp_ids = self._gallery_emp_ids_by_company.get(key)

        if gallery_matrix is None or gallery_matrix.size == 0:
            return MatchResult(person_id=None, name="Unknown", score=-1.0)

        sims = gallery_matrix @ emb
        idx = int(np.argmax(sims))
        sim = float(sims[idx])
        if (
            gallery_emp_ids is not None
            and gallery_emp_ids.size > 1
            and float(self.cfg.distinct_sim_margin) > 0.0
        ):
            emp_id = int(gallery_emp_ids[idx])
            mask = gallery_emp_ids != emp_id
            if np.any(mask):
                best_other = float(np.max(sims[mask]))
                if (sim - best_other) < float(self.cfg.distinct_sim_margin):
                    return MatchResult(person_id=None, name="Unknown", score=sim)
        if idx != -1 and idx < len(gallery_meta):
            _emp_int, emp_id_str, name = gallery_meta[idx]
            return MatchResult(
                person_id=str(emp_id_str), name=str(name), score=float(sim)
            )

        return MatchResult(person_id=None, name="Unknown", score=float(sim))

    def _write_attendance_job(self, job: AttendanceWriteJob) -> None:
        cid = str(job.camera_id)
        company_id = job.company_id

        client = self._client_for_company(company_id)
        stream_type = self.get_stream_type(cid)

        # 1) Backend mark (attendance/headcount decided by stream_type)
        client.create_attendance(
            employee_id=str(job.employee_id),
            timestamp=str(job.timestamp_iso),
            camera_id=cid,
            confidence=float(job.similarity),
            snapshot_path=None,
            event_type=stream_type,
        )

        # 2) Attendance side effects (skip for headcount scans)
        if stream_type == "attendance":
            attendance_date = datetime.now().strftime("%d/%m/%Y")
            in_time = datetime.now().strftime("%H:%M:%S")

            # First ERP queue
            erp_queue = self._erp_queue_for_company(company_id, "attendance")
            if erp_queue is not None:
                erp_job = ERPPushJob(
                    attendance_date=attendance_date,
                    emp_id=str(job.employee_id),
                    in_time=in_time,
                    in_location=str(job.camera_name),
                )
                ok = erp_queue.enqueue(erp_job)
                print(
                    f"[ERP 1] queued ok={ok} emp={erp_job.emp_id} date={erp_job.attendance_date} in={erp_job.in_time}"
                )

            # Second ERP queue
            erp_queue_two = self._erp_queue_for_company(company_id, "attendance_two")
            if erp_queue_two is not None:
                erp_job_two = ERPPushJob(
                    attendance_date=attendance_date,
                    emp_id=str(job.employee_id),
                    in_time=in_time,
                    in_location=str(job.camera_name),
                )
                ok_two = erp_queue_two.enqueue(erp_job_two)
                print(
                    f"[ERP 2] queued ok={ok_two} emp={erp_job_two.emp_id} date={erp_job_two.attendance_date} in={erp_job_two.in_time}"
                )

            self._relay_http(
                cid,
                True,
                employee_id=str(job.employee_id),
                company_id=company_id,
            )
            self.push_voice_event(
                employee_id=str(job.employee_id),
                name=str(job.name),
                camera_id=cid,
                camera_name=str(job.camera_name),
                company_id=company_id,
            )

    def _maybe_log_camera_stats(
        self,
        *,
        camera_id: str,
        state: CameraScanState,
        tracks_total: int,
        unknown_total: int,
        now: float,
        motion_score: float,
    ) -> None:
        interval = float(getattr(self.cfg, "log_interval_seconds", 5.0) or 0.0)
        if interval <= 0.0:
            return

        if state.last_log_ts <= 0.0:
            state.last_log_ts = now
            state.last_log_frames_total = int(state.frames_total)
            state.last_log_det_applied_total = int(state.det_applied_total)
            state.last_log_rec_calls_total = int(state.rec_calls_total)
            return

        dt = now - float(state.last_log_ts)
        if dt < interval:
            return

        frames = int(state.frames_total) - int(state.last_log_frames_total)
        det_applied = int(state.det_applied_total) - int(
            state.last_log_det_applied_total
        )
        rec_calls = int(state.rec_calls_total) - int(state.last_log_rec_calls_total)

        fps = (frames / dt) if dt > 0 else 0.0
        det_fps = (det_applied / dt) if dt > 0 else 0.0
        rec_s = (rec_calls / dt) if dt > 0 else 0.0

        q_len, q_drop = self._gpu.queue_stats(camera_id)
        mode = state.scheduler.mode_label()
        reasons = ",".join(state.scheduler.burst_reasons(limit=3))

        gpu_util = None
        try:
            if (
                getattr(self, "_nvml_handle", None) is not None
                and getattr(self, "_nvml", None) is not None
            ):
                util = self._nvml.nvmlDeviceGetUtilizationRates(self._nvml_handle)
                gpu_util = int(getattr(util, "gpu", 0))
        except Exception:
            gpu_util = None

        gpu_part = "" if gpu_util is None else f" gpu={gpu_util}%"
        # print(
        #     f"[PIPE] cam={camera_id} fps={fps:.1f} det_fps={det_fps:.2f} rec/s={rec_s:.2f} "
        #     f"tracks={tracks_total} unk={unknown_total} q={q_len} drop={q_drop} mode={mode} "
        #     f"reasons={reasons} motion={motion_score:.3f}{gpu_part}"
        # )

        state.last_log_ts = now
        state.last_log_frames_total = int(state.frames_total)
        state.last_log_det_applied_total = int(state.det_applied_total)
        state.last_log_rec_calls_total = int(state.rec_calls_total)

    def process_frame(
        self, frame_bgr: np.ndarray, camera_id: str, name: str
    ) -> np.ndarray:
        cid = str(camera_id)
        camera_name = str(name)
        company_id = self._company_by_camera.get(cid) or self._default_company_id

        # Keep the existing gallery loading contract.
        self._ensure_gallery(company_id)

        state = self._get_state(cid)
        state.company_id = company_id
        state.frame_idx += 1
        state.frames_total += 1

        enable_attendance = self.is_attendance_enabled(cid)
        annotated = frame_bgr.copy()

        now = time.time()

        # Always run CPU tracking each frame.
        tracks = state.tracker.update(frame_bgr, now=now)

        # Motion gate runs each frame too, but we ignore motion inside stable known tracks so
        # a single recognized person walking/running doesn't keep GPU detection in NORMAL/BURST.
        ignore_boxes: list[tuple[int, int, int, int]] = []
        for tr in tracks:
            if tr.verify_target_id:
                continue
            if tr.person_id is None:
                continue
            if int(tr.stable_id_hits) < int(self.cfg.stable_id_confirmations):
                continue
            ignore_boxes.append(tuple(int(v) for v in tr.bbox))

        motion_active, motion_score = state.motion.update(
            frame_bgr, now=now, ignore_boxes=ignore_boxes
        )

        # Apply newest detector result (if any).
        events: set[str] = set()
        det_res = self._gpu.get_latest_result(cid)
        if det_res is not None and int(det_res.seq) != int(state.last_det_seq):
            det_age = max(0.0, now - float(det_res.ts))
            max_det_age = float(
                getattr(self.cfg, "max_detection_result_age_seconds", 0.0) or 0.0
            )
            state.last_det_seq = int(det_res.seq)

            if max_det_age > 0.0 and det_age > max_det_age:
                state.scheduler.force_burst("stale_det", now=now)
            else:
                state.det_applied_total += 1

                new_ids = state.tracker.apply_detections(
                    frame_bgr, det_res.detections, now=now
                )
                if new_ids:
                    events.add("new_track")
                    new_id_set = set(new_ids)
                    # New tracks get immediate high-stakes recognition window.
                    for tr in state.tracker.tracks():
                        if tr.track_id in new_id_set:
                            tr.force_recognition_until_ts = max(
                                tr.force_recognition_until_ts,
                                now + float(self.cfg.burst_seconds),
                            )
                # Detection just updated boxes; force a quick recognition pass on fresh bboxes.
                for tr in state.tracker.tracks():
                    tr.force_recognition_until_ts = max(
                        tr.force_recognition_until_ts, now + 0.35
                    )
                tracks = state.tracker.tracks()

        # Scheduler mode update.
        tracks_attention = False
        if len(tracks) >= 2:
            tracks_attention = True
        elif len(tracks) == 1:
            tr0 = tracks[0]
            tracks_attention = bool(
                tr0.verify_target_id
                or tr0.person_id is None
                or int(tr0.stable_id_hits) < int(self.cfg.stable_id_confirmations)
            )
        state.scheduler.update(
            motion_active=motion_active,
            tracks_present=bool(tracks_attention),
            events=events,
            now=now,
        )

        # Scheduled GPU detection (round-robin arbitration, newest-frame only).
        if state.scheduler.should_run_detection(now=now):
            self._gpu.submit(cid, frame_bgr, ts=now)
            state.scheduler.mark_detection_submitted(now=now)

        # Scheduled per-track recognition (CPU by default).
        rec_stats = state.recognizer.update_tracks(
            frame_bgr, tracks, state.scheduler, now=now
        )
        state.rec_calls_total += int(rec_stats.get("recognition_calls", 0) or 0)

        h, w = annotated.shape[:2]
        unknown_count = 0
        authorized_employee_ids = self._refresh_authorized_employee_ids(cid, company_id)
        has_authorized_scope = len(authorized_employee_ids) > 0
        tracking_boxes = self._refresh_bounding_boxes(cid, company_id)

        for tr in tracks:
            x1, y1, x2, y2 = [int(v) for v in tr.bbox]
            recognized_known = self._is_known_employee_id(tr.person_id)
            known = recognized_known and (
                not has_authorized_scope
                or str(tr.person_id or "").strip() in authorized_employee_ids
            )
            unauthorized_known = recognized_known and not known
            # 🔓 DOOR UNLOCK — EVERY KNOWN RECOGNITION (NO DELAY)
            if (
                known
                and self._door_unlock_on_recognition
                and enable_attendance
                and self.get_stream_type(cid) == "attendance"
            ):
                self._trigger_door_unlock(
                    camera_id=cid,
                    employee_id=str(tr.person_id),
                    company_id=company_id,
                    name=str(tr.name),
                    similarity=float(tr.similarity),
                )

            if not known:
                unknown_count += 1

            color = ACCENT_KNOWN if known else ACCENT_UNKNOWN
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)

            label = tr.name if recognized_known else "Unknown"
            _draw_label_card(annotated, label, x1, max(38, y1 - 14), known, scale=0.75)

            if recognized_known and company_id and tracking_boxes:
                self._handle_bounding_box_tracking_for_track(
                    camera_id=cid,
                    camera_name=camera_name,
                    company_id=company_id,
                    boxes=tracking_boxes,
                    employee_id=str(tr.person_id),
                    bbox=(x1, y1, x2, y2),
                    frame_shape=(h, w),
                    confidence=float(tr.similarity),
                    now=now,
                )

            if (
                enable_attendance
                and not known
                and company_id
                and self.get_stream_type(cid) == "attendance"
                and self._should_log_unknown(
                    company_id=company_id,
                    camera_id=cid,
                    track=tr,
                    now=now,
                    treat_known_as_unknown=unauthorized_known,
                )
            ):
                self._push_unknown_recognition(
                    company_id=company_id,
                    camera_id=cid,
                    camera_name=camera_name,
                    confidence=float(tr.similarity),
                    timestamp_iso=now_iso(),
                    recognized_name=str(tr.name) if unauthorized_known else None,
                )

            # Attendance marking (debounced + verified + async writer)
            if enable_attendance and known and company_id:
                self._debouncer.note_seen(
                    company_id=company_id,
                    employee_id=str(tr.person_id),
                    now=now,
                )

            if not enable_attendance:
                continue
            if not known:
                continue
            if not company_id:
                continue

            # Avoid partial edge faces and low-quality crops
            if x1 <= 4 or y1 <= 4 or x2 >= (w - 4) or y2 >= (h - 4):
                continue

            q_score = quality_score((x1, y1, x2, y2), frame_bgr)
            if q_score < float(self.cfg.min_att_quality):
                continue

            decision = self._debouncer.consider(
                camera_id=cid,
                camera_name=camera_name,
                company_id=company_id,
                track=tr,
                scheduler=state.scheduler,
                now=now,
            )
            if decision.job is None:
                continue

            # Final safety: ensure we still agree on the identity.
            if tr.person_id != str(decision.job.employee_id):
                continue

            bbox_key = (x1, y1, x2, y2)

            if self._fas_skip_laptop and str(cid).startswith("laptop-"):
                fas_ok, fas_dbg = True, {"fas": "skipped_laptop"}
            else:
                fas_ok, fas_dbg = self.fas_gate.check(
                    camera_id=cid,
                    person_key=str(decision.job.employee_id),
                    frame_bgr=frame_bgr,
                    bbox=bbox_key,
                    kps=tr.kps,
                )

            # Optional: allow attendance even when only the pose-change challenge fails.
            # This improves recall for fast-moving people where head-turn may not happen.
            if (
                (not fas_ok)
                and isinstance(fas_dbg, dict)
                and fas_dbg.get("fas") == "need_pose_change"
                and str(os.getenv("FAS_ALLOW_NO_POSE_FOR_ATTENDANCE", "0")).strip()
                == "1"
            ):
                fas_ok = True
                fas_dbg = {**fas_dbg, "fas": "pose_bypassed"}

            # print(
            #     "[FAS DEBUG]",
            #     "cam=",
            #     str(cid),
            #     "emp=",
            #     str(decision.job.employee_id),
            #     "ok=",
            #     fas_ok,
            #     "dbg=",
            #     fas_dbg,
            #     "kps_none=",
            #     tr.kps is None,
            # )

            if not fas_ok:
                continue

            ok = self._db_writer.enqueue(decision.job)
            if ok:
                self._debouncer.mark_enqueued(
                    company_id=company_id,
                    employee_id=str(decision.job.employee_id),
                    now=now,
                )
            else:
                print(
                    f"[ATTENDANCE] writer queue full, dropped emp={decision.job.employee_id} cam={cid}"
                )

        # Monitoring (per camera, every few seconds)
        self._maybe_log_camera_stats(
            camera_id=cid,
            state=state,
            tracks_total=len(tracks),
            unknown_total=unknown_count,
            now=now,
            motion_score=motion_score,
        )

        return annotated
