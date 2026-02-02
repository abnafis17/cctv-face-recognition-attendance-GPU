from __future__ import annotations

import os
import time
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Optional

import cv2
import numpy as np

from ..clients.backend_client import BackendClient
from ..vision.recognizer import match_gallery
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

from ..fas.gate import FASGate, GateConfig

from datetime import datetime
from ..clients.erp_client import ERPClient, ERPClientConfig
from ..services.erp_push_queue import ERPPushQueue, ERPPushJob
import urllib.request


LABEL_FONT = (
    cv2.FONT_HERSHEY_TRIPLEX
)  # clearer serif-like font (closest to Times New Roman)
HUD_FONT = cv2.FONT_HERSHEY_DUPLEX  # slightly lighter for HUD text
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


def _put_text_white(
    img: np.ndarray, text: str, x: int, y: int, scale: float = 0.8
) -> None:
    font = HUD_FONT
    thickness = 2
    cv2.putText(img, text, (x, y), font, scale, (0, 0, 0), thickness + 3, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), font, scale, (245, 245, 245), thickness, cv2.LINE_AA)


def _put_text_with_bg(
    img: np.ndarray,
    text: str,
    x: int,
    y: int,
    scale: float = 1.05,
    text_color=(255, 255, 255),
    bg_color=(20, 20, 20),
    alpha: float = 0.68,
    pad: int = 12,
) -> None:
    """Draw text with a high-contrast card for readability."""
    font = LABEL_FONT
    thickness = 2
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
    x0 = max(0, x - pad)
    y0 = max(0, y - th - pad)
    x1 = min(img.shape[1] - 1, x + tw + pad)
    y1 = min(img.shape[0] - 1, y + pad)

    overlay = img.copy()
    # Rounded-ish corners: draw two rectangles to soften edges
    cv2.rectangle(overlay, (x0, y0), (x1, y1), bg_color, -1)
    cv2.rectangle(overlay, (x0 + 2, y0 + 2), (x1 - 2, y1 - 2), bg_color, -1)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)

    cv2.putText(img, text, (x, y), font, scale, (0, 0, 0), thickness + 3, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), font, scale, text_color, thickness, cv2.LINE_AA)


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


def _nearest_kps(
    track_bbox: Tuple[int, int, int, int],
    det_kps_map: Dict[Tuple[int, int, int, int], Optional[np.ndarray]],
    max_center_dist: float = 50.0,
) -> Optional[np.ndarray]:
    """
    Tracker bbox is often slightly different from detector bbox.
    This finds the nearest detector bbox center and returns its kps.
    """
    tx1, ty1, tx2, ty2 = track_bbox
    tcx = (tx1 + tx2) / 2.0
    tcy = (ty1 + ty2) / 2.0

    best_kps = None
    best_d = 1e18

    for (x1, y1, x2, y2), kps in det_kps_map.items():
        if kps is None:
            continue
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        d = ((cx - tcx) ** 2 + (cy - tcy) ** 2) ** 0.5
        if d < best_d:
            best_d = d
            best_kps = kps

    if best_kps is None or best_d > max_center_dist:
        return None
    return best_kps


def _bbox_iou(
    a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    union = area_a + area_b - inter + 1e-6
    return float(inter / union)


def _nms_detections(
    det_list: List[Tuple[np.ndarray, str, int, float]],
    det_kps_by_bbox: Dict[Tuple[int, int, int, int], Optional[np.ndarray]],
    iou_threshold: float = 0.45,
) -> Tuple[
    List[Tuple[np.ndarray, str, int, float]],
    Dict[Tuple[int, int, int, int], Optional[np.ndarray]],
]:
    """
    Suppress duplicate detections (same face producing multiple boxes in one frame).
    Keeps highest-similarity (then largest) box when IoU is high.
    """
    if len(det_list) <= 1:
        return det_list, det_kps_by_bbox

    scored = []
    for bbox, name, emp_id, sim in det_list:
        x1, y1, x2, y2 = [float(v) for v in bbox]
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        scored.append((float(sim), float(area), (bbox, name, emp_id, sim)))

    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)

    kept: List[Tuple[np.ndarray, str, int, float]] = []
    kept_kps: Dict[Tuple[int, int, int, int], Optional[np.ndarray]] = {}

    for _, _, det in scored:
        bbox, name, emp_id, sim = det
        bb_tuple = tuple(float(v) for v in bbox)
        if any(
            _bbox_iou(bb_tuple, tuple(float(v) for v in k[0])) >= iou_threshold
            for k in kept
        ):
            continue
        kept.append(det)
        bbox_key = tuple(int(v) for v in bbox)
        if bbox_key in det_kps_by_bbox:
            kept_kps[bbox_key] = det_kps_by_bbox[bbox_key]

    return kept, kept_kps


def _dedup_known_faces(
    det_list: List[Tuple[np.ndarray, str, int, float]],
    det_kps_by_bbox: Dict[Tuple[int, int, int, int], Optional[np.ndarray]],
) -> Tuple[
    List[Tuple[np.ndarray, str, int, float]],
    Dict[Tuple[int, int, int, int], Optional[np.ndarray]],
]:
    """
    Keep only one detection per known employee (highest similarity then largest area).
    Unknown faces (-1) are left as-is so multiple unknown people still show.
    """
    best_known: Dict[int, Tuple[np.ndarray, str, int, float]] = {}
    best_kps: Dict[int, Tuple[int, int, int, int]] = {}
    unknowns: List[Tuple[np.ndarray, str, int, float]] = []

    for bbox, name, emp_id, sim in det_list:
        if emp_id == -1:
            unknowns.append((bbox, name, emp_id, sim))
            continue
        x1, y1, x2, y2 = [float(v) for v in bbox]
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        key = emp_id
        prev = best_known.get(key)
        if prev is None:
            best_known[key] = (bbox, name, emp_id, sim, area)
            best_kps[key] = tuple(int(v) for v in bbox)
        else:
            _, _, _, prev_sim, prev_area = prev
            if sim > prev_sim or (sim == prev_sim and area > prev_area):
                best_known[key] = (bbox, name, emp_id, sim, area)
                best_kps[key] = tuple(int(v) for v in bbox)

    merged_list: List[Tuple[np.ndarray, str, int, float]] = []
    merged_kps: Dict[Tuple[int, int, int, int], Optional[np.ndarray]] = {}

    for bbox, name, emp_id, sim, _ in best_known.values():
        merged_list.append((bbox, name, emp_id, sim))
        bbox_key = best_kps[emp_id]
        if bbox_key in det_kps_by_bbox:
            merged_kps[bbox_key] = det_kps_by_bbox[bbox_key]

    merged_list.extend(unknowns)
    for k, v in det_kps_by_bbox.items():
        merged_kps.setdefault(k, v)

    return merged_list, merged_kps


class AttendanceRuntime:
    def __init__(
        self,
        use_gpu: bool = False,
        model_name: str = "buffalo_l",
        min_face_size: int = 30,
        similarity_threshold: float = 0.35,
        gallery_refresh_s: float = 5.0,
        cooldown_s: int = 10,
        stable_hits_required: int = 3,
    ):
        self._default_company_id = (
            os.getenv("BACKEND_COMPANY_ID", "").strip()
            or os.getenv("COMPANY_ID", "").strip()
            or None
        )
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
            min_face_size=min_face_size,
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

        self._cam_state: Dict[str, CameraScanState] = {}
        self._enabled_for_attendance: Dict[str, bool] = {}
        # Stream type per camera (attendance/headcount). This is set by api_server
        # based on who is currently watching the recognition stream.
        self._stream_type_by_camera: Dict[str, str] = {}

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
        self._int_to_emp_id_by_company: Dict[str, Dict[int, str]] = {}
        self._next_emp_int_by_company: Dict[str, int] = {}

        # ---------------------------
        # Face Anti-Spoofing (FAS)
        # ---------------------------
        fas_enabled = os.getenv("FAS_ENABLED", "1") == "1"
        fas_onnx_path = os.getenv("FAS_ONNX_PATH", "app/fas/models/fas.onnx")

        # Backward compatible:
        # - new: FAS_MIN_YAW_RANGE
        # - old: FAS_MIN_MOTION_PX (we map it to yaw range if new one not set)
        min_yaw_range = os.getenv("FAS_MIN_YAW_RANGE")
        if min_yaw_range is None:
            min_yaw_range = os.getenv("FAS_MIN_MOTION_PX", "0.035")

        self.fas_gate = FASGate(
            onnx_path=fas_onnx_path,
            providers=["CPUExecutionProvider"],
            default_cfg=GateConfig(
                enabled=fas_enabled,
                fas_threshold=float(os.getenv("FAS_THRESHOLD", "0.55")),
                motion_window_sec=float(os.getenv("FAS_MOTION_WINDOW", "1.5")),
                min_yaw_range=float(min_yaw_range),
                use_heuristics=(os.getenv("FAS_USE_HEURISTICS", "1") == "1"),
                cooldown_sec=float(os.getenv("FAS_COOLDOWN_SEC", "2.0")),
            ),
            input_size=(112, 112),
        )
        # Laptop/WebRTC feeds can be noisy for anti-spoof models and may block
        # all marks. Default to bypassing FAS for camera ids like "laptop-<companyId>".
        self._fas_skip_laptop = os.getenv("FAS_SKIP_LAPTOP", "1") == "1"

        # ---------------------------
        # ERP push (optional)
        # ---------------------------
        self.erp_queue: Optional[ERPPushQueue] = None

        erp_base = os.getenv("ERP_BASE_URL", "").strip()
        if erp_base:
            erp_cfg = ERPClientConfig(
                base_url=erp_base,
                prefix=os.getenv("ERP_PREFIX", "/api/v2"),
                timeout_s=float(os.getenv("ERP_TIMEOUT_S", "10")),
                api_version=os.getenv("ERP_API_VERSION", "2.0"),
            )
            erp_client = ERPClient(erp_cfg)

            def _erp_err(e: Exception, job: ERPPushJob):
                print(f"[ERP] push failed: {e} | job={job}")

            self.erp_queue = ERPPushQueue(erp_client, on_error=_erp_err)
        else:
            print("[ERP] ERP_BASE_URL not set, ERP push disabled.")

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
            if self.erp_queue is not None:
                self.erp_queue.stop()
        except Exception:
            pass
        finally:
            self.erp_queue = None

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
        int_to_emp_id = self._int_to_emp_id_by_company.setdefault(key, {})
        self._next_emp_int_by_company.setdefault(key, -2)

        if emp_id_str.isdigit():
            v = int(emp_id_str)
            int_to_emp_id[v] = emp_id_str
            return v

        if emp_id_str in emp_id_to_int:
            return emp_id_to_int[emp_id_str]

        v = int(self._next_emp_int_by_company[key])
        self._next_emp_int_by_company[key] = v - 1
        emp_id_to_int[emp_id_str] = v
        int_to_emp_id[v] = emp_id_str
        return v

    def _emp_int_to_str(self, company_id: Optional[str], emp_int: int) -> str:
        key = self._gallery_key(company_id)
        mapping = self._int_to_emp_id_by_company.get(key, {})
        return mapping.get(int(emp_int), str(emp_int))

    def _ensure_gallery(self, company_id: Optional[str]) -> None:
        key = self._gallery_key(company_id)
        now = time.time()
        last_load = self._gallery_last_load_by_company.get(key, 0.0)
        if now - last_load < self.gallery_refresh_s:
            return
        if not company_id:
            self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
            self._gallery_meta_by_company[key] = []
            self._gallery_last_load_by_company[key] = now
            return

        client = self._client_for_company(company_id)
        try:
            templates = client.list_templates()
        except Exception as e:
            print(f"[GALLERY] load failed company={company_id or 'default'}: {e}")
            self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
            self._gallery_meta_by_company[key] = []
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
        self._gallery_last_load_by_company[key] = now

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

    def _relay_http(self, camera_id: str, turn_on: bool) -> None:
        # Lazy init so you don't have to touch __init__
        if not hasattr(self, "_relay_state_by_camera"):
            self._relay_state_by_camera = {}  # cid -> "on"/"off"
            self._relay_last_ts_by_camera = {}  # cid -> last call time
            self._relay_min_interval_s = float(
                os.getenv("RELAY_MIN_INTERVAL_S", "0.75")
            )
            self._relay_http_timeout_s = float(
                os.getenv("RELAY_HTTP_TIMEOUT_S", "0.4")
            )

        cid = str(camera_id)
        desired = "on" if turn_on else "off"
        # CHANGE TO (optional safety):
        if not turn_on:
            return
        url = os.getenv("RELAY_ON_URL", "http://10.81.100.72/on").strip()
        if not url:
            url = "http://10.81.100.72/on"
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

        if gallery_matrix is None or gallery_matrix.size == 0:
            return MatchResult(person_id=None, name="Unknown", score=-1.0)

        idx, sim = match_gallery(emb, gallery_matrix)
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

        # 2) Push to ERP + voice only for attendance mode (skip for headcount scans)
        if stream_type == "attendance" and self.erp_queue is not None:
            attendance_date = datetime.now().strftime("%d/%m/%Y")
            in_time = datetime.now().strftime("%H:%M:%S")

            erp_job = ERPPushJob(
                attendance_date=attendance_date,
                emp_id=str(job.employee_id),
                in_time=in_time,
                in_location=str(job.camera_name),
            )

            ok = self.erp_queue.enqueue(erp_job)
            print(
                f"[ERP] queued ok={ok} emp={erp_job.emp_id} date={erp_job.attendance_date} in={erp_job.in_time}"
            )

            if ok:
                self._relay_http(cid, True)
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
        print(
            f"[PIPE] cam={camera_id} fps={fps:.1f} det_fps={det_fps:.2f} rec/s={rec_s:.2f} "
            f"tracks={tracks_total} unk={unknown_total} q={q_len} drop={q_drop} mode={mode} "
            f"reasons={reasons} motion={motion_score:.3f}{gpu_part}"
        )

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
            state.last_det_seq = int(det_res.seq)
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

        # HUD / overlay
        _put_text_white(annotated, f"frame={state.frame_idx}", 12, 36, scale=1.05)
        _put_text_white(
            annotated,
            f"mode={state.scheduler.mode_label()} motion={motion_score:.3f}",
            12,
            68,
            scale=0.75,
        )

        h, w = annotated.shape[:2]
        unknown_count = 0

        for tr in tracks:
            x1, y1, x2, y2 = [int(v) for v in tr.bbox]
            known = tr.person_id is not None
            if not known:
                unknown_count += 1

            color = ACCENT_KNOWN if known else ACCENT_UNKNOWN
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)

            label = tr.name if known else "Unknown"
            _draw_label_card(annotated, label, x1, max(38, y1 - 14), known, scale=0.75)

            # Attendance marking (debounced + verified + async writer)
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

            print(
                "[FAS DEBUG]",
                "cam=",
                str(cid),
                "emp=",
                str(decision.job.employee_id),
                "ok=",
                fas_ok,
                "dbg=",
                fas_dbg,
                "kps_none=",
                tr.kps is None,
            )

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

        """
        cid = str(camera_id)
        camera_name = str(name)
        company_id = self._company_by_camera.get(cid) or self._default_company_id
        self._ensure_gallery(company_id)
        gallery_key = self._gallery_key(company_id)
        gallery_matrix = self._gallery_matrix_by_company.get(gallery_key)
        if gallery_matrix is None:
            gallery_matrix = np.zeros((0, 512), dtype=np.float32)
            self._gallery_matrix_by_company[gallery_key] = gallery_matrix
        gallery_meta = self._gallery_meta_by_company.get(gallery_key, [])

        state = self._get_state(cid)
        state.frame_idx += 1

        enable_attendance = self.is_attendance_enabled(cid)
        annotated = frame_bgr.copy()
        relay_on_this_frame = False

        _put_text_white(annotated, f"frame={state.frame_idx}", 12, 36, scale=1.05)
        ts_now = time.strftime("%Y-%m-%d %H:%M:%S")

        dets = self.rec.detect_and_embed(frame_bgr)

        # remove junk detections

        # min_det_quality = float(os.getenv("MIN_DET_QUALITY", "8.0"))
        # filtered = []
        # for d in dets:
        #     q = quality_score(tuple(int(v) for v in d.bbox), frame_bgr)
        #     if q < min_det_quality:
        #         continue
        #     filtered.append(d)
        # dets = filtered

        det_list = []
        det_kps_by_bbox: Dict[Tuple[int, int, int, int], Optional[np.ndarray]] = {}

        for d in dets:
            idx, sim = (
                match_gallery(d.emb, gallery_matrix)
                if gallery_matrix.size
                else (-1, -1.0)
            )

            bbox_key = tuple(int(v) for v in d.bbox)
            det_kps_by_bbox[bbox_key] = d.kps

            if (
                idx != -1
                and sim >= self.similarity_threshold
                and idx < len(gallery_meta)
            ):
                emp_int, emp_id_str, name = gallery_meta[idx]
                det_list.append((d.bbox, name, int(emp_int), float(sim)))
            else:
                det_list.append((d.bbox, "Unknown", -1, float(sim)))

        # Keep a single detection per known person (best similarity/area)
        det_list, det_kps_by_bbox = _dedup_known_faces(det_list, det_kps_by_bbox)

        # Remove duplicate boxes for the same face within this frame (keeps highest-sim/area)
        det_list, det_kps_by_bbox = _nms_detections(
            det_list, det_kps_by_bbox, iou_threshold=0.45
        )

        tracks = state.tracker.update(
            frame_idx=state.frame_idx,  # consistent frame counter (target ~60 fps upstream)
            dets=[
                (bbox, name, emp_int, sim) for (bbox, name, emp_int, sim) in det_list
            ],
        )

        for tr in tracks:
            x1, y1, x2, y2 = [int(v) for v in tr.bbox]
            h, w = annotated.shape[:2]

            known = tr.employee_id != -1
            color = ACCENT_KNOWN if known else ACCENT_UNKNOWN

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)

            if known:
                emp_id_str = self._emp_int_to_str(company_id, tr.employee_id)
                name = tr.name
            else:
                emp_id_str = "-1"
                name = "Unknown"

            label = f"{name}"
            _draw_label_card(annotated, label, x1, max(38, y1 - 14), known, scale=0.75)

            if not enable_attendance:
                continue
            if not known:
                continue
            if not company_id:
                continue
            if tr.stable_name_hits < self.stable_hits_required:
                continue
            if tr.similarity < self.strict_similarity:
                continue

            # Avoid partial edge faces and low-quality crops
            if x1 <= 4 or y1 <= 4 or x2 >= (w - 4) or y2 >= (h - 4):
                continue

            q_score = quality_score((x1, y1, x2, y2), frame_bgr)
            if q_score < self.min_att_quality:
                continue

            last = state.last_mark.get(emp_id_str, 0.0)
            now = time.time()
            if now - last < self.cooldown_s:
                continue

            bbox_key = (x1, y1, x2, y2)

            # ✅ IMPORTANT: nearest kps match (tracker bbox != detector bbox)
            face_kps = _nearest_kps(bbox_key, det_kps_by_bbox)

            if self._fas_skip_laptop and str(cid).startswith("laptop-"):
                # Laptop/WebRTC feeds often fail anti-spoof checks; do not block marks.
                fas_ok, fas_dbg = True, {"fas": "skipped_laptop"}
            else:
                fas_ok, fas_dbg = self.fas_gate.check(
                    camera_id=cid,
                    person_key=emp_id_str,
                    frame_bgr=frame_bgr,
                    bbox=bbox_key,
                    kps=face_kps,
                )

            print(
                "[FAS DEBUG]",
                "emp=",
                emp_id_str,
                "ok=",
                fas_ok,
                "dbg=",
                fas_dbg,
                "kps_none=",
                face_kps is None,
            )

            if not fas_ok:
                # Optional debug overlay:
                # _put_text_white(annotated, f"FAS BLOCK: {fas_dbg.get('fas')}", x1, y2 + 22, scale=0.7)
                continue

            try:
                client = self._client_for_company(company_id)
                stream_type = self.get_stream_type(cid)

                # 1) Backend mark (attendance/headcount decided by stream_type)
                client.create_attendance(
                    employee_id=emp_id_str,
                    timestamp=now_iso(),
                    camera_id=cid,
                    confidence=float(tr.similarity),
                    snapshot_path=None,
                    event_type=stream_type,
                )

                # 2) Mark cooldown only if backend success
                state.last_mark[emp_id_str] = now

                # 3) Push to ERP + voice only for attendance mode (skip for headcount scans)
                if stream_type == "attendance" and self.erp_queue is not None:
                    attendance_date = datetime.now().strftime(
                        "%d/%m/%Y"
                    )  # "03/01/2026"
                    in_time = datetime.now().strftime("%H:%M:%S")  # "09:00:00"

                    job = ERPPushJob(
                        attendance_date=attendance_date,
                        emp_id=str(emp_id_str),  # IMPORTANT: must match ERP empId
                        in_time=in_time,
                        in_location=camera_name,
                    )

                    ok = self.erp_queue.enqueue(job)
                    print(
                        f"[ERP] queued ok={ok} emp={job.emp_id} date={job.attendance_date} in={job.in_time}"
                    )

                    if ok:
                        # --- ADD: relay ON when attendance ensured ---
                        # relay_on_this_frame = True
                        # self._relay_http(cid, True)

                        # Also push a voice event for this attendance
                        self.push_voice_event(
                            employee_id=emp_id_str,
                            name=name,
                            camera_id=cid,
                            camera_name=camera_name,
                            company_id=company_id,
                        )

                    if not ok:
                        print("[ERP] queue full, dropped attendance push")

            except Exception as e:
                print(f"[ATTENDANCE] Failed to mark emp={emp_id_str} cam={cid}: {e}")

        # --- ADD: relay OFF if nobody was ensured this frame ---
        # if enable_attendance and not relay_on_this_frame:
        #     self._relay_http(cid, False)

        return annotated
        """
