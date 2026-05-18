from __future__ import annotations

import os
import time
import threading
from dataclasses import dataclass, field
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
from ..vision.frame_enhancer import AdaptiveFrameEnhancer
from ..vision.identity_graph import IdentityGraphManager, IdentityNode
from ..utils import now_iso, l2_normalize, quality_score
from ..core.settings import resolve_ai_path

from ..fas.gate import FASGate, GateConfig
from ..presence.detector import PresenceDetector
from ..presence.tracker import PresenceTracker, PresenceTrack
from ..presence.botsort_tracker import BoTSORTPresenceTracker

from datetime import datetime
from ..clients.erp_client import ERPClient, ERPClientConfig
from ..services.erp_push_queue import ERPPushQueue, ERPPushJob
import urllib.parse
import urllib.request

LABEL_FONT = cv2.FONT_HERSHEY_DUPLEX
# Modern "Cyber" Palette
ACCENT_KNOWN = (235, 206, 0)     # Electric Cyan (BGR)
ACCENT_UNKNOWN = (80, 0, 255)    # Hot Crimson/Pink (BGR)
CARD_BG = (20, 20, 20)           # Deep Graphite
CARD_KNOWN = (26, 60, 32)        # dark green card
CARD_UNKNOWN = (50, 30, 30)      # dark red card

ID_STATE_VISIBLE = "VISIBLE"
ID_STATE_PARTIAL_OCCLUDED = "PARTIAL_OCCLUDED"
ID_STATE_FULL_OCCLUDED = "FULL_OCCLUDED"
ID_STATE_LOST = "LOST"
ID_STATE_REIDENTIFYING = "REIDENTIFYING"


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


@dataclass
class BodyIdentityState:
    employee_id: str
    name: str
    similarity: float
    last_seen_ts: float
    last_face_seen_ts: float
    first_seen_ts: float = 0.0
    confidence: float = 0.72
    locked_until_ts: float = 0.0
    last_switch_ts: float = 0.0
    visibility_state: str = ID_STATE_VISIBLE
    last_confidence_ts: float = 0.0
    last_body_bbox: Optional[Tuple[int, int, int, int]] = None
    last_face_bbox: Optional[Tuple[int, int, int, int]] = None
    face_rel_cx: float = 0.50
    face_rel_cy: float = 0.18
    face_rel_w: float = 0.22
    face_rel_h: float = 0.24
    last_draw_face_bbox: Optional[Tuple[int, int, int, int]] = None
    body_embedding_bank: List[np.ndarray] = field(default_factory=list)


def _draw_label_card(
    img: np.ndarray,
    text: str,
    x: int,
    y: int,
    known: bool,
    scale: float = 0.55,
) -> None:
    """Draw a sleek, modern label card with a glassmorphism effect."""
    accent = ACCENT_KNOWN if known else ACCENT_UNKNOWN
    font = LABEL_FONT
    thickness = 1

    # Measure text
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)

    pad_x = 10
    pad_y = 8

    # Card coordinates
    x0, y0 = x, y - th - pad_y * 2
    x1, y1 = x + tw + pad_x * 2, y

    # Ensure within bounds
    h, w = img.shape[:2]
    if x1 > w:
        diff = x1 - w
        x0 -= diff
        x1 -= diff
    if y0 < 0:
        y0 = y + pad_y
        y1 = y0 + th + pad_y * 2

    # Semi-transparent background using fast numpy slicing
    y0_cl, y1_cl = max(0, y0), min(h, y1)
    x0_cl, x1_cl = max(0, x0), min(w, x1)
    if y1_cl > y0_cl and x1_cl > x0_cl:
        # Fast blend: target = target * alpha + source * (1-alpha)
        # Using 0.25 (1/4) allows for bitwise optimization by some compilers, but here we just use float
        img[y0_cl:y1_cl, x0_cl:x1_cl] = (img[y0_cl:y1_cl, x0_cl:x1_cl].astype(np.float32) * 0.25 + np.array(CARD_BG, dtype=np.float32) * 0.75).astype(np.uint8)

    # Accent bar (top or side)
    cv2.rectangle(img, (x0, y0), (x0 + 4, y1), accent, -1)

    # Text (with slight shadow for legibility)
    cv2.putText(img, text, (x0 + pad_x + 1, y0 + th + pad_y + 1), font, scale, (0, 0, 0), thickness + 1, cv2.LINE_AA)
    cv2.putText(img, text, (x0 + pad_x, y0 + th + pad_y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def _draw_corners(img: np.ndarray, bbox: Tuple[int, int, int, int], color: Tuple[int, int, int], thickness: int = 2, length: int = 15):
    """Draw sleek corner brackets instead of a full rectangle."""
    x1, y1, x2, y2 = bbox
    # Top Left
    cv2.line(img, (x1, y1), (x1 + length, y1), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1, y1 + length), color, thickness, cv2.LINE_AA)
    # Top Right
    cv2.line(img, (x2, y1), (x2 - length, y1), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + length), color, thickness, cv2.LINE_AA)
    # Bottom Left
    cv2.line(img, (x1, y2), (x1 + length, y2), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1, y2 - length), color, thickness, cv2.LINE_AA)
    # Bottom Right
    cv2.line(img, (x2, y2), (x2 - length, y2), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - length), color, thickness, cv2.LINE_AA)

    # Optional: Very faint full rectangle for structure
    # Use simple rectangle for speed, or ROI if transparency is needed
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 1)


def _format_duration(seconds: float) -> str:
    """Format seconds into MM:SS or HH:MM:SS."""
    s = int(max(0, seconds))
    if s < 3600:
        return f"{s // 60:02d}:{s % 60:02d}"
    h = s // 3600
    m = (s % 3600) // 60
    s = s % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def _format_dwell_seconds(seconds: float) -> str:
    total = max(0, int(seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _label_with_dwell(name: str, dwell_seconds: Optional[float]) -> str:
    return str(name or "Unknown").strip() or "Unknown"


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
        self._use_gpu = bool(use_gpu)
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
            # Face detector + recognition throughput (Turbo SCRFD - 640px)
            # AI_DETECTOR_MODEL=scrfd_2.5g_bn_kps
            # AI_DET_SIZE=640
            det_size=(640, 640),
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
        self._gallery_loaded_log_by_company: Dict[str, Tuple[int, int]] = {}
        self._gallery_missing_company_warned = False
        self._last_match_debug_by_camera: Dict[str, float] = {}
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
        self._body_presence_tracker_backend = (
            str(os.getenv("BODY_PERSIST_TRACKER_BACKEND", "classic")).strip().lower()
        )
        if self._body_presence_tracker_backend not in {"classic", "botsort"}:
            self._body_presence_tracker_backend = "classic"

        self._body_presence_tracker_by_camera: Dict[str, Any] = {}
        self._body_presence_botsort_by_camera: Dict[str, BoTSORTPresenceTracker] = {}
        self._body_presence_tracks_by_camera: Dict[str, Dict[int, PresenceTrack]] = {}
        self._body_identity_state_by_camera: Dict[str, Dict[int, BodyIdentityState]] = (
            {}
        )
        self._identity_graph_by_camera: Dict[str, IdentityGraphManager] = {}
        self._body_presence_last_det_ts_by_camera: Dict[str, float] = {}
        self._body_presence_last_track_ts_by_camera: Dict[str, float] = {}
        self._body_presence_last_error_ts_by_camera: Dict[str, float] = {}
        self._body_presence_detector: Optional[PresenceDetector] = None
        self._body_presence_detector_failed = False
        self._body_presence_botsort_failed = False
        self._body_presence_error_log_interval_s = max(
            1.0, float(os.getenv("BODY_PERSIST_ERROR_LOG_INTERVAL_S", "10.0"))
        )
        self._body_presence_enabled = (
            str(os.getenv("BODY_PERSISTENCE_ENABLED", "1")).strip() != "0"
        )
        self._body_presence_allow_hog_fallback = str(
            os.getenv(
                "BODY_PERSIST_ALLOW_HOG_FALLBACK",
                os.getenv("PRESENCE_ALLOW_HOG_FALLBACK", "0"),
            )
        ).strip().lower() in {"1", "true", "yes", "on"}
        self._body_presence_det_fps = max(
            0.2,
            float(
                os.getenv(
                    "BODY_PERSIST_DET_FPS",
                    os.getenv("PRESENCE_AI_FPS", "8"),
                )
            ),
        )
        self._body_presence_track_fps = max(
            0.2,
            float(
                os.getenv(
                    "BODY_PERSIST_TRACK_FPS",
                    os.getenv(
                        "BODY_PERSIST_DET_FPS", os.getenv("PRESENCE_AI_FPS", "8")
                    ),
                )
            ),
        )
        self._body_presence_match_iou = float(
            os.getenv("BODY_PERSIST_MATCH_IOU", os.getenv("PRESENCE_MATCH_IOU", "0.30"))
        )
        self._body_presence_max_lost_s = max(
            0.5,
            float(
                os.getenv(
                    "BODY_PERSIST_MAX_LOST_S", os.getenv("PRESENCE_MAX_LOST_S", "0.8")
                )
            ),
        )
        self._body_presence_min_hits = max(
            1,
            int(
                float(
                    os.getenv(
                        "BODY_PERSIST_MIN_HITS", os.getenv("PRESENCE_MIN_HITS", "1")
                    )
                )
            ),
        )
        self._body_presence_match_center_ratio = float(
            os.getenv(
                "BODY_PERSIST_MATCH_CENTER_RATIO",
                os.getenv("PRESENCE_MATCH_CENTER_RATIO", "0.70"),
            )
        )
        self._body_presence_reacquire_center_ratio = float(
            os.getenv(
                "BODY_PERSIST_REACQUIRE_CENTER_RATIO",
                os.getenv("PRESENCE_REACQUIRE_CENTER_RATIO", "1.10"),
            )
        )
        self._body_presence_bbox_smooth_alpha = float(
            os.getenv(
                "BODY_PERSIST_BBOX_SMOOTH_ALPHA",
                os.getenv("PRESENCE_BBOX_SMOOTH_ALPHA", "0.75"),
            )
        )
        self._body_presence_det_nms_iou = float(
            os.getenv(
                "BODY_PERSIST_DET_NMS_IOU",
                os.getenv("PRESENCE_DET_NMS_IOU", "0.65"),
            )
        )
        self._body_presence_max_misses = max(
            1,
            int(
                float(
                    os.getenv(
                        "BODY_PERSIST_MAX_MISSES", os.getenv("PRESENCE_MAX_MISSES", "6")
                    )
                )
            ),
        )
        self._body_presence_visible_hold_s = max(
            0.05,
            float(
                os.getenv(
                    "BODY_PERSIST_VISIBLE_HOLD_S",
                    os.getenv("PRESENCE_ACTIVE_HOLD_S", "0.45"),
                )
            ),
        )
        self._body_identity_ttl_s = max(
            self._body_presence_max_lost_s,
            float(os.getenv("BODY_PERSIST_IDENTITY_TTL_S", "1.2")),
        )
        self._body_identity_lock_seconds = max(
            0.0, float(os.getenv("BODY_PERSIST_IDENTITY_LOCK_SECONDS", "0.5"))
        )
        self._body_identity_switch_min_sim_gain = max(
            0.0, float(os.getenv("BODY_PERSIST_SWITCH_MIN_SIM_GAIN", "0.0"))
        )
        self._body_face_match_min_score = float(
            os.getenv("BODY_PERSIST_FACE_MATCH_MIN_SCORE", "0.75")
        )
        self._body_known_match_min_score = max(
            0.50,
            float(
                os.getenv(
                    "BODY_PERSIST_KNOWN_MATCH_MIN_SCORE",
                    str(max(0.75, self._body_face_match_min_score * 0.85)),
                )
            ),
        )
        self._body_face_match_margin_x_ratio = max(
            0.0, float(os.getenv("BODY_PERSIST_BODY_EXPAND_X_RATIO", "0.22"))
        )
        self._body_face_match_margin_y_ratio = max(
            0.0, float(os.getenv("BODY_PERSIST_BODY_EXPAND_Y_RATIO", "0.18"))
        )
        self._body_face_match_top_ratio = max(
            0.0, float(os.getenv("BODY_PERSIST_BODY_EXPAND_TOP_RATIO", "0.28"))
        )
        self._body_face_max_y_ratio = max(
            0.55,
            min(1.0, float(os.getenv("BODY_PERSIST_FACE_MAX_Y_RATIO", "0.92"))),
        )
        self._body_unknown_suppress_iou = max(
            0.0,
            min(1.0, float(os.getenv("BODY_PERSIST_UNKNOWN_SUPPRESS_IOU", "0.22"))),
        )
        self._known_face_draw_scale = max(
            1.0, float(os.getenv("FACE_KNOWN_DRAW_SCALE", "1.0"))
        )
        self._body_face_rel_update_alpha = max(
            0.05,
            min(1.0, float(os.getenv("BODY_PERSIST_FACE_REL_ALPHA", "0.35"))),
        )
        self._body_face_draw_smooth_alpha = max(
            0.0,
            min(1.0, float(os.getenv("BODY_PERSIST_FACE_DRAW_SMOOTH_ALPHA", "0.75"))),
        )
        self._body_rebind_iou_min = max(
            0.0, min(1.0, float(os.getenv("BODY_PERSIST_REBIND_IOU_MIN", "0.35")))
        )
        self._body_rebind_center_ratio = max(
            0.10, float(os.getenv("BODY_PERSIST_REBIND_CENTER_RATIO", "0.50"))
        )
        self._body_rebind_min_score = max(
            0.0, float(os.getenv("BODY_PERSIST_REBIND_MIN_SCORE", "0.85"))
        )
        self._body_face_fallback_max_age_s = max(
            0.0, float(os.getenv("BODY_PERSIST_FACE_FALLBACK_MAX_AGE_S", "1.0"))
        )
        self._body_fallback_overlay_enabled = str(
            os.getenv("BODY_PERSIST_DRAW_FALLBACK_OVERLAY", "1")
        ).strip().lower() in ("1", "true", "yes", "on")
        self._body_presence_draw_max_stale_s = max(
            0.05,
            float(
                os.getenv(
                    "BODY_PERSIST_DRAW_MAX_STALE_S",
                    os.getenv("BODY_PERSIST_VISIBLE_HOLD_S", "0.45"),
                )
            ),
        )
        self._body_presence_draw_max_misses = max(
            0, int(float(os.getenv("BODY_PERSIST_DRAW_MAX_MISSES", "2")))
        )
        self._face_overlay_max_stale_s = max(
            0.05, float(os.getenv("FACE_OVERLAY_MAX_STALE_S", "0.45"))
        )
        self._face_overlay_max_det_misses = max(
            0, int(float(os.getenv("FACE_OVERLAY_MAX_DET_MISSES", "0")))
        )
        self._identity_conf_decay_visible_per_s = max(
            0.0, float(os.getenv("IDENTITY_CONF_DECAY_VISIBLE_PER_S", "0.05"))
        )
        self._identity_conf_decay_missing_per_s = max(
            self._identity_conf_decay_visible_per_s,
            float(os.getenv("IDENTITY_CONF_DECAY_MISSING_PER_S", "0.16")),
        )
        self._identity_conf_boost_face = max(
            0.01, float(os.getenv("IDENTITY_CONF_BOOST_FACE", "0.22"))
        )
        self._identity_conf_boost_body = max(
            0.0, float(os.getenv("IDENTITY_CONF_BOOST_BODY", "0.03"))
        )
        self._identity_conf_min_show = max(
            0.0, min(1.0, float(os.getenv("IDENTITY_CONF_MIN_SHOW", "0.18")))
        )
        self._identity_conf_drop = max(
            0.0,
            min(
                self._identity_conf_min_show,
                float(os.getenv("IDENTITY_CONF_DROP", "0.08")),
            ),
        )
        self._identity_partial_occ_after_s = max(
            0.0, float(os.getenv("IDENTITY_PARTIAL_OCCLUSION_AFTER_S", "0.55"))
        )
        self._identity_full_occ_after_s = max(
            self._identity_partial_occ_after_s,
            float(os.getenv("IDENTITY_FULL_OCCLUSION_AFTER_S", "1.6")),
        )
        self._body_embedding_bank_size = max(
            2, int(float(os.getenv("BODY_EMBEDDING_BANK_SIZE", "12")))
        )
        self._body_presence_botsort_model_path = resolve_ai_path(
            os.getenv(
                "BODY_PERSIST_BOTSORT_MODEL",
                os.getenv("PRESENCE_YOLO_MODEL", "yolov8n.pt"),
            )
        )
        self._body_presence_botsort_tracker_yaml = resolve_ai_path(
            os.getenv(
                "BODY_PERSIST_BOTSORT_TRACKER_YAML",
                "app/presence/config/botsort_reid.yaml",
            )
        )
        print(
            "[BODY-PERSIST] "
            f"enabled={int(self._body_presence_enabled)} "
            f"backend={self._body_presence_tracker_backend} "
            f"use_gpu={int(self._use_gpu)} "
            f"det_fps={self._body_presence_det_fps:.2f} "
            f"track_fps={self._body_presence_track_fps:.2f}"
        )
        self._inference_frame_enhancer = AdaptiveFrameEnhancer(
            enabled=(str(os.getenv("LOW_LIGHT_ENHANCE_ENABLED", "1")).strip() != "0"),
            luma_threshold=float(os.getenv("LOW_LIGHT_LUMA_THRESHOLD", "92")),
            target_luma=float(os.getenv("LOW_LIGHT_TARGET_LUMA", "122")),
            min_contrast=float(os.getenv("LOW_LIGHT_MIN_CONTRAST", "26")),
            clahe_clip_limit=float(os.getenv("LOW_LIGHT_CLAHE_CLIP_LIMIT", "2.2")),
            clahe_tile_grid=int(float(os.getenv("LOW_LIGHT_CLAHE_TILE_GRID", "8"))),
            gamma_min=float(os.getenv("LOW_LIGHT_GAMMA_MIN", "0.45")),
            gamma_max=float(os.getenv("LOW_LIGHT_GAMMA_MAX", "1.0")),
            denoise=(str(os.getenv("LOW_LIGHT_DENOISE_ENABLED", "0")).strip() == "1"),
            denoise_h=float(os.getenv("LOW_LIGHT_DENOISE_H", "3.0")),
        )
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
        self._attendance_require_extra_quality = (
            str(os.getenv("ATTENDANCE_REQUIRE_EXTRA_QUALITY_GATE", "0"))
            .strip()
            .lower()
            in {"1", "true", "yes", "on"}
        )
        self._attendance_require_fas = (
            str(os.getenv("ATTENDANCE_REQUIRE_FAS", "0")).strip().lower()
            in {"1", "true", "yes", "on"}
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
            self._body_presence_tracker_by_camera.clear()
            self._body_presence_botsort_by_camera.clear()
            self._body_presence_tracks_by_camera.clear()
            self._body_identity_state_by_camera.clear()
            self._identity_graph_by_camera.clear()
            self._body_presence_last_det_ts_by_camera.clear()
            self._body_presence_last_track_ts_by_camera.clear()
            self._body_presence_last_error_ts_by_camera.clear()
            self._body_presence_detector = None
            self._body_presence_botsort_failed = False
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

    def _parse_runtime_box(
        self, raw: Dict[str, Any]
    ) -> Optional[BoundingBoxRuntimeBox]:
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
        return box.left <= x_unit <= box.right and box.top <= y_unit <= box.bottom

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
        if (
            len(self._bounding_box_tracking_state)
            <= self._bounding_box_tracking_max_states
        ):
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
            if not self._gallery_missing_company_warned:
                print(
                    "[GALLERY] no company id available; recognition gallery is empty. "
                    "Pass ?companyId=<id>, use camera id laptop-<id>, or set BACKEND_COMPANY_ID."
                )
                self._gallery_missing_company_warned = True
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

            # Ensure embedding is valid before adding to gallery
            if not np.all(np.isfinite(emb)):
                continue

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
        unique_employees = len({m[1] for m in meta})
        log_state = (len(meta), unique_employees)
        if self._gallery_loaded_log_by_company.get(key) != log_state:
            print(
                f"[GALLERY] company={company_id} templates={len(meta)} "
                f"employees={unique_employees}"
            )
            self._gallery_loaded_log_by_company[key] = log_state

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
        self, company_id: Optional[str]
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        cid = str(company_id or "").strip()
        if not cid:
            return None, None, None

        key = self._gallery_key(cid)
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
            return base_url, prefix, endpoint

        client = self._client_for_company(cid)
        try:
            data = client.get_erp_settings()
            base_url = self._normalize_relay_url(
                data.get("erpBaseUrl") or data.get("erp_base_url")
            )
            prefix = self._normalize_erp_prefix(
                data.get("erpPrefix") or data.get("erp_prefix")
            )
            endpoint = self._normalize_erp_endpoint(
                data.get("erpAttendanceEndpoint") or data.get("erp_attendance_endpoint")
            )
            self._erp_settings_cache_by_company[key] = {
                "erp_base_url": base_url,
                "erp_prefix": prefix,
                "erp_attendance_endpoint": endpoint,
            }
            self._erp_settings_last_fetch_by_company[key] = now
            return base_url, prefix, endpoint
        except Exception as e:
            self._erp_settings_last_fetch_by_company[key] = now
            if has_cached:
                base_url = self._normalize_relay_url(cached.get("erp_base_url"))
                prefix = self._normalize_erp_prefix(cached.get("erp_prefix"))
                endpoint = self._normalize_erp_endpoint(
                    cached.get("erp_attendance_endpoint")
                )
                return base_url, prefix, endpoint
            print(f"[ERP] settings load failed company={cid or 'default'} err={e}")
            return None, None, None

    def _erp_queue_for_company(
        self, company_id: Optional[str]
    ) -> Optional[ERPPushQueue]:
        cid = str(company_id or "").strip()
        if not cid:
            return None

        base_url, configured_prefix, configured_endpoint = (
            self._erp_settings_for_company(cid)
        )
        map_key = self._gallery_key(cid)
        is_abs_endpoint = bool(
            configured_endpoint
            and str(configured_endpoint).lower().startswith(("http://", "https://"))
        )
        if not base_url and is_abs_endpoint:
            # Absolute endpoint does not use HttpClient base_url/prefix.
            # Keep a harmless placeholder base so ERPClientConfig stays valid.
            base_url = "http://127.0.0.1"

        if not base_url:
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
            )
            erp_client = ERPClient(erp_cfg)

            def _erp_err(e: Exception, job: ERPPushJob):
                print(f"[ERP] push failed company={cid} err={e} | job={job}")

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

    def _unknown_person_key(self, company_id: Optional[str], employee_id: str) -> str:
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

    @staticmethod
    def _bbox_iou_xyxy(
        a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]
    ) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw = max(0, ix2 - ix1)
        ih = max(0, iy2 - iy1)
        inter = float(iw * ih)
        area_a = float(max(0, ax2 - ax1) * max(0, ay2 - ay1))
        area_b = float(max(0, bx2 - bx1) * max(0, by2 - by1))
        union = area_a + area_b - inter + 1e-6
        return float(inter / union)

    @staticmethod
    def _bbox_center_xyxy(box: Tuple[int, int, int, int]) -> Tuple[float, float]:
        x1, y1, x2, y2 = box
        return (float(x1 + x2) * 0.5, float(y1 + y2) * 0.5)

    @staticmethod
    def _expand_xyxy(
        box: Tuple[int, int, int, int],
        *,
        expand_x_ratio: float = 0.0,
        expand_y_ratio: float = 0.0,
        expand_top_ratio: float = 0.0,
        frame_w: Optional[int] = None,
        frame_h: Optional[int] = None,
    ) -> Tuple[int, int, int, int]:
        x1, y1, x2, y2 = [int(v) for v in box]
        bw = max(1.0, float(x2 - x1))
        bh = max(1.0, float(y2 - y1))
        pad_x = float(max(0.0, expand_x_ratio)) * bw
        pad_y = float(max(0.0, expand_y_ratio)) * bh
        pad_top = float(max(0.0, expand_top_ratio)) * bh

        nx1 = int(round(float(x1) - pad_x))
        nx2 = int(round(float(x2) + pad_x))
        ny1 = int(round(float(y1) - (pad_y + pad_top)))
        ny2 = int(round(float(y2) + pad_y))

        if frame_w is not None and int(frame_w) > 0:
            nx1 = max(0, min(int(frame_w) - 1, nx1))
            nx2 = max(0, min(int(frame_w), nx2))
        if frame_h is not None and int(frame_h) > 0:
            ny1 = max(0, min(int(frame_h) - 1, ny1))
            ny2 = max(0, min(int(frame_h), ny2))
        if nx2 <= nx1:
            nx2 = nx1 + 1
        if ny2 <= ny1:
            ny2 = ny1 + 1
        return (nx1, ny1, nx2, ny2)

    @staticmethod
    def _bbox_overlap_ratio_xyxy(
        a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]
    ) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw = max(0, ix2 - ix1)
        ih = max(0, iy2 - iy1)
        inter = float(iw * ih)
        area_a = float(max(0, ax2 - ax1) * max(0, ay2 - ay1))
        if area_a <= 1e-6:
            return 0.0
        return float(inter / area_a)

    @staticmethod
    def _smooth_box_xyxy(
        old_box: Optional[Tuple[int, int, int, int]],
        new_box: Tuple[int, int, int, int],
        *,
        alpha: float,
        frame_w: Optional[int] = None,
        frame_h: Optional[int] = None,
    ) -> Tuple[int, int, int, int]:
        if old_box is None:
            return new_box
        a = max(0.0, min(1.0, float(alpha)))
        inv = 1.0 - a
        ox1, oy1, ox2, oy2 = old_box
        nx1, ny1, nx2, ny2 = new_box
        sx1 = int(round((inv * float(ox1)) + (a * float(nx1))))
        sy1 = int(round((inv * float(oy1)) + (a * float(ny1))))
        sx2 = int(round((inv * float(ox2)) + (a * float(nx2))))
        sy2 = int(round((inv * float(oy2)) + (a * float(ny2))))
        if frame_w is not None and int(frame_w) > 0:
            sx1 = max(0, min(int(frame_w) - 1, sx1))
            sx2 = max(0, min(int(frame_w), sx2))
        if frame_h is not None and int(frame_h) > 0:
            sy1 = max(0, min(int(frame_h) - 1, sy1))
            sy2 = max(0, min(int(frame_h), sy2))
        if sx2 <= sx1:
            sx2 = sx1 + 1
        if sy2 <= sy1:
            sy2 = sy1 + 1
        return (sx1, sy1, sx2, sy2)

    def _known_face_draw_box(
        self,
        face_box: Tuple[int, int, int, int],
        *,
        frame_w: int,
        frame_h: int,
    ) -> Tuple[int, int, int, int]:
        known_scale = float(max(1.0, self._known_face_draw_scale))
        expand_ratio = max(0.0, (known_scale - 1.0) * 0.5)
        return self._expand_xyxy(
            face_box,
            expand_x_ratio=expand_ratio,
            expand_y_ratio=expand_ratio,
            frame_w=frame_w,
            frame_h=frame_h,
        )

    @staticmethod
    def _shift_box_xyxy(
        box: Tuple[int, int, int, int],
        *,
        dx: float,
        dy: float,
        frame_w: Optional[int] = None,
        frame_h: Optional[int] = None,
    ) -> Tuple[int, int, int, int]:
        x1, y1, x2, y2 = [int(v) for v in box]
        nx1 = int(round(float(x1) + float(dx)))
        ny1 = int(round(float(y1) + float(dy)))
        nx2 = int(round(float(x2) + float(dx)))
        ny2 = int(round(float(y2) + float(dy)))
        if frame_w is not None and int(frame_w) > 0:
            nx1 = max(0, min(int(frame_w) - 1, nx1))
            nx2 = max(0, min(int(frame_w), nx2))
        if frame_h is not None and int(frame_h) > 0:
            ny1 = max(0, min(int(frame_h) - 1, ny1))
            ny2 = max(0, min(int(frame_h), ny2))
        if nx2 <= nx1:
            nx2 = nx1 + 1
        if ny2 <= ny1:
            ny2 = ny1 + 1
        return (nx1, ny1, nx2, ny2)

    @staticmethod
    def _face_rel_from_body(
        face_box: Tuple[int, int, int, int],
        body_box: Tuple[int, int, int, int],
    ) -> Tuple[float, float, float, float]:
        fx1, fy1, fx2, fy2 = [int(v) for v in face_box]
        bx1, by1, bx2, by2 = [int(v) for v in body_box]
        bw = max(1.0, float(bx2 - bx1))
        bh = max(1.0, float(by2 - by1))
        fw = max(1.0, float(fx2 - fx1))
        fh = max(1.0, float(fy2 - fy1))
        fcx = (float(fx1) + float(fx2)) * 0.5
        fcy = (float(fy1) + float(fy2)) * 0.5
        rel_cx = (fcx - float(bx1)) / bw
        rel_cy = (fcy - float(by1)) / bh
        rel_w = fw / bw
        rel_h = fh / bh
        rel_cx = max(0.0, min(1.0, rel_cx))
        rel_cy = max(0.0, min(1.0, rel_cy))
        rel_w = max(0.02, min(0.90, rel_w))
        rel_h = max(0.02, min(0.90, rel_h))
        return (float(rel_cx), float(rel_cy), float(rel_w), float(rel_h))

    def _predict_face_box_from_body(
        self,
        *,
        body_box: Tuple[int, int, int, int],
        body_state: BodyIdentityState,
        frame_w: int,
        frame_h: int,
    ) -> Tuple[int, int, int, int]:
        bx1, by1, bx2, by2 = [int(v) for v in body_box]
        bw = max(1.0, float(bx2 - bx1))
        bh = max(1.0, float(by2 - by1))

        rel_cx = max(0.05, min(0.95, float(getattr(body_state, "face_rel_cx", 0.50))))
        rel_cy = max(
            0.02,
            min(
                float(self._body_face_max_y_ratio),
                float(getattr(body_state, "face_rel_cy", 0.18)),
            ),
        )
        rel_w = max(0.06, min(0.70, float(getattr(body_state, "face_rel_w", 0.22))))
        rel_h = max(0.08, min(0.72, float(getattr(body_state, "face_rel_h", 0.24))))

        face_w = max(14.0, min(0.80 * bw, rel_w * bw))
        face_h = max(14.0, min(0.80 * bh, rel_h * bh))
        cx = float(bx1) + (rel_cx * bw)
        cy = float(by1) + (rel_cy * bh)

        fx1 = int(round(cx - (face_w * 0.5)))
        fy1 = int(round(cy - (face_h * 0.5)))
        fx2 = int(round(cx + (face_w * 0.5)))
        fy2 = int(round(cy + (face_h * 0.5)))

        fx1 = max(0, min(frame_w - 1, fx1))
        fy1 = max(0, min(frame_h - 1, fy1))
        fx2 = max(0, min(frame_w, fx2))
        fy2 = max(0, min(frame_h, fy2))
        if fx2 <= fx1:
            fx2 = min(frame_w, fx1 + 1)
        if fy2 <= fy1:
            fy2 = min(frame_h, fy1 + 1)
        return (fx1, fy1, fx2, fy2)

    def _update_body_identity_face_geometry(
        self,
        *,
        body_state: BodyIdentityState,
        face_box: Tuple[int, int, int, int],
        body_box: Tuple[int, int, int, int],
    ) -> None:
        rel_cx, rel_cy, rel_w, rel_h = self._face_rel_from_body(face_box, body_box)
        alpha = float(self._body_face_rel_update_alpha)
        inv = 1.0 - alpha
        body_state.face_rel_cx = (inv * float(body_state.face_rel_cx)) + (
            alpha * rel_cx
        )
        body_state.face_rel_cy = (inv * float(body_state.face_rel_cy)) + (
            alpha * rel_cy
        )
        body_state.face_rel_w = (inv * float(body_state.face_rel_w)) + (alpha * rel_w)
        body_state.face_rel_h = (inv * float(body_state.face_rel_h)) + (alpha * rel_h)
        body_state.last_face_bbox = tuple(int(v) for v in face_box)
        body_state.last_body_bbox = tuple(int(v) for v in body_box)

    @staticmethod
    def _sync_body_identity_dwell_anchor(
        *,
        body_state: BodyIdentityState,
        body_track: Optional[PresenceTrack],
        now: float,
    ) -> None:
        current = float(getattr(body_state, "first_seen_ts", 0.0) or 0.0)
        track_first = (
            float(getattr(body_track, "first_seen_ts", 0.0) or 0.0)
            if body_track is not None
            else 0.0
        )
        if current <= 0.0:
            body_state.first_seen_ts = track_first if track_first > 0.0 else float(now)
        elif track_first > 0.0 and track_first < current:
            body_state.first_seen_ts = track_first

    def _body_identity_dwell_seconds(
        self,
        *,
        body_state: Optional[BodyIdentityState],
        body_track: Optional[PresenceTrack],
        fallback_first_seen_ts: Optional[float],
        now: float,
    ) -> Optional[float]:
        first_seen = 0.0
        if body_state is not None:
            self._sync_body_identity_dwell_anchor(
                body_state=body_state,
                body_track=body_track,
                now=now,
            )
            first_seen = float(getattr(body_state, "first_seen_ts", 0.0) or 0.0)
        if first_seen <= 0.0 and body_track is not None:
            first_seen = float(getattr(body_track, "first_seen_ts", 0.0) or 0.0)
        if first_seen <= 0.0 and fallback_first_seen_ts is not None:
            first_seen = float(fallback_first_seen_ts)
        if first_seen <= 0.0:
            return None
        return max(0.0, float(now) - first_seen)

    def _is_body_track_fresh_for_overlay(
        self, body_track: Optional[PresenceTrack], *, now: float
    ) -> bool:
        if body_track is None:
            return False
        last_seen = float(getattr(body_track, "last_seen_ts", 0.0) or 0.0)
        if last_seen <= 0.0:
            return False
        if (float(now) - last_seen) > float(self._body_presence_draw_max_stale_s):
            return False
        misses = int(getattr(body_track, "misses", 0) or 0)
        if misses > int(self._body_presence_draw_max_misses):
            return False
        return True

    def _is_face_track_fresh_for_overlay(self, track: Any, *, now: float) -> bool:
        last_det = float(getattr(track, "last_det_ts", 0.0) or 0.0)
        if last_det <= 0.0:
            return False
        if (float(now) - last_det) > float(self._face_overlay_max_stale_s):
            return False
        det_misses = int(getattr(track, "det_misses", 0) or 0)
        if det_misses > int(self._face_overlay_max_det_misses):
            return False
        return True

    @staticmethod
    def _clamp_unit(value: float) -> float:
        return float(max(0.0, min(1.0, float(value))))

    def _body_embedding_from_bbox(
        self,
        frame_bgr: np.ndarray,
        body_box: Tuple[int, int, int, int],
    ) -> Optional[np.ndarray]:
        if frame_bgr is None or frame_bgr.size == 0:
            return None
        h, w = frame_bgr.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in body_box]
        x1 = max(0, min(w - 1, x1))
        y1 = max(0, min(h - 1, y1))
        x2 = max(0, min(w, x2))
        y2 = max(0, min(h, y2))
        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame_bgr[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        # Focus on upper torso to avoid leg/background noise for re-identification.
        ch, cw = crop.shape[:2]
        top = 0
        bottom = max(1, int(round(ch * 0.72)))
        torso = crop[top:bottom, :]
        if torso.size == 0:
            torso = crop
        torso = cv2.resize(torso, (64, 128), interpolation=cv2.INTER_AREA)

        hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
        hist_h = cv2.calcHist([hsv], [0], None, [16], [0, 180]).reshape(-1)
        hist_s = cv2.calcHist([hsv], [1], None, [16], [0, 256]).reshape(-1)
        hist_v = cv2.calcHist([hsv], [2], None, [16], [0, 256]).reshape(-1)
        gray = cv2.cvtColor(torso, cv2.COLOR_BGR2GRAY)
        edge = cv2.Canny(gray, 60, 140)
        edge_hist = cv2.calcHist([edge], [0], None, [8], [0, 256]).reshape(-1)

        feat = np.concatenate([hist_h, hist_s, hist_v, edge_hist]).astype(np.float32)
        if feat.size == 0:
            return None
        return l2_normalize(feat)

    def _update_body_embedding_bank(
        self,
        body_state: BodyIdentityState,
        emb: Optional[np.ndarray],
    ) -> None:
        if emb is None:
            return
        bank = getattr(body_state, "body_embedding_bank", None)
        if not isinstance(bank, list):
            bank = []
            body_state.body_embedding_bank = bank
        bank.append(np.asarray(emb, dtype=np.float32))
        keep = int(max(2, self._body_embedding_bank_size))
        if len(bank) > keep:
            del bank[: len(bank) - keep]

    @staticmethod
    def _body_embedding_centroid(body_state: BodyIdentityState) -> Optional[np.ndarray]:
        bank = getattr(body_state, "body_embedding_bank", None)
        if not isinstance(bank, list) or not bank:
            return None
        arr = np.vstack([np.asarray(v, dtype=np.float32) for v in bank])
        centroid = np.mean(arr, axis=0).astype(np.float32)
        return l2_normalize(centroid)

    @staticmethod
    def _body_embedding_similarity(
        a: Optional[np.ndarray], b: Optional[np.ndarray]
    ) -> float:
        if a is None or b is None:
            return -1.0
        va = np.asarray(a, dtype=np.float32).reshape(-1)
        vb = np.asarray(b, dtype=np.float32).reshape(-1)
        if va.size == 0 or vb.size == 0 or va.size != vb.size:
            return -1.0
        return float(np.dot(va, vb))

    def _boost_body_identity_state(
        self,
        *,
        body_state: BodyIdentityState,
        similarity: float,
        now: float,
        face_confirmed: bool,
    ) -> None:
        last_ts = float(getattr(body_state, "last_confidence_ts", 0.0) or 0.0)
        if last_ts <= 0.0:
            last_ts = now
        dt = max(0.0, now - last_ts)
        conf = float(getattr(body_state, "confidence", 0.72) or 0.72)
        conf = max(0.0, conf - (self._identity_conf_decay_visible_per_s * dt))
        boost = (
            self._identity_conf_boost_face
            if face_confirmed
            else self._identity_conf_boost_body
        )
        sim_norm = self._clamp_unit((float(similarity) + 1.0) * 0.5)
        conf = conf + (boost * (0.65 + (0.35 * sim_norm)))
        body_state.confidence = self._clamp_unit(conf)
        body_state.last_confidence_ts = now
        body_state.visibility_state = (
            ID_STATE_VISIBLE if face_confirmed else ID_STATE_PARTIAL_OCCLUDED
        )

    def _decay_body_identity_state(
        self,
        *,
        body_state: BodyIdentityState,
        now: float,
        body_visible: bool,
    ) -> None:
        last_ts = float(getattr(body_state, "last_confidence_ts", 0.0) or 0.0)
        if last_ts <= 0.0:
            last_ts = now
        dt = max(0.0, now - last_ts)
        decay = (
            self._identity_conf_decay_visible_per_s
            if body_visible
            else self._identity_conf_decay_missing_per_s
        )
        conf = float(getattr(body_state, "confidence", 0.72) or 0.72)
        conf = conf - (decay * dt)
        body_state.confidence = self._clamp_unit(conf)
        body_state.last_confidence_ts = now

        face_age = max(
            0.0, now - float(getattr(body_state, "last_face_seen_ts", now) or now)
        )
        if body_visible:
            if face_age <= float(self._identity_partial_occ_after_s):
                body_state.visibility_state = ID_STATE_VISIBLE
            elif face_age <= float(self._identity_full_occ_after_s):
                body_state.visibility_state = ID_STATE_PARTIAL_OCCLUDED
            else:
                body_state.visibility_state = ID_STATE_FULL_OCCLUDED
        else:
            body_state.visibility_state = (
                ID_STATE_REIDENTIFYING
                if conf >= float(self._identity_conf_min_show)
                else ID_STATE_LOST
            )

    def _score_body_rebind(
        self,
        ref_box: Tuple[int, int, int, int],
        cand_box: Tuple[int, int, int, int],
        *,
        ref_emb: Optional[np.ndarray] = None,
        cand_emb: Optional[np.ndarray] = None,
    ) -> float:
        iou = self._bbox_iou_xyxy(ref_box, cand_box)
        rcx, rcy = self._bbox_center_xyxy(ref_box)
        ccx, ccy = self._bbox_center_xyxy(cand_box)
        center_dist = float(np.hypot(float(rcx - ccx), float(rcy - ccy)))
        rx1, ry1, rx2, ry2 = [int(v) for v in ref_box]
        cx1, cy1, cx2, cy2 = [int(v) for v in cand_box]
        rdim = float(max(1, rx2 - rx1, ry2 - ry1))
        cdim = float(max(1, cx2 - cx1, cy2 - cy1))
        center_norm = center_dist / max(1.0, max(rdim, cdim))

        area_ref = float(max(1, rx2 - rx1) * max(1, ry2 - ry1))
        area_cand = float(max(1, cx2 - cx1) * max(1, cy2 - cy1))
        area_ratio = area_cand / max(1.0, area_ref)
        if area_ratio < 0.20 or area_ratio > 5.0:
            return -1.0

        if iou < float(self._body_rebind_iou_min) and center_norm > float(
            self._body_rebind_center_ratio
        ):
            return -1.0

        center_score = max(
            0.0,
            1.0 - (center_norm / max(0.01, float(self._body_rebind_center_ratio))),
        )
        reid = self._body_embedding_similarity(ref_emb, cand_emb)
        reid_score = max(0.0, reid)
        return float((0.70 * iou) + (0.24 * center_score) + (0.20 * reid_score))

    def _rebind_body_identity_tracks(
        self,
        *,
        body_identity_state: Dict[int, BodyIdentityState],
        body_tracks: Dict[int, PresenceTrack],
        frame_bgr: Optional[np.ndarray],
        now: float,
    ) -> None:
        if not body_identity_state or not body_tracks:
            return

        occupied_tids: set[int] = set()
        for tid in body_identity_state.keys():
            tid_i = int(tid)
            if tid_i in body_tracks:
                occupied_tids.add(tid_i)

        missing_tids: List[int] = [
            int(tid)
            for tid in body_identity_state.keys()
            if int(tid) not in body_tracks
        ]
        if not missing_tids:
            return

        missing_tids.sort(
            key=lambda tid: float(
                getattr(body_identity_state.get(int(tid)), "last_seen_ts", 0.0) or 0.0
            ),
            reverse=True,
        )
        cand_embs: Dict[int, Optional[np.ndarray]] = {}
        if frame_bgr is not None:
            for cand_tid, cand_track in body_tracks.items():
                cand_box = tuple(int(v) for v in cand_track.bbox)
                cand_embs[int(cand_tid)] = self._body_embedding_from_bbox(
                    frame_bgr, cand_box
                )

        for old_tid in missing_tids:
            state = body_identity_state.get(int(old_tid))
            if state is None:
                continue
            if (now - float(state.last_seen_ts)) > float(self._body_identity_ttl_s):
                continue
            if (now - float(state.last_seen_ts)) > float(
                self._body_presence_draw_max_stale_s
            ):
                continue

            ref_box = state.last_body_bbox or state.last_face_bbox
            if ref_box is None:
                continue

            ref_emb = self._body_embedding_centroid(state)
            best_tid: Optional[int] = None
            best_score = -1.0
            for cand_tid, cand_track in body_tracks.items():
                tid_i = int(cand_tid)
                if tid_i in occupied_tids:
                    continue
                cand_box = tuple(int(v) for v in cand_track.bbox)
                score = self._score_body_rebind(
                    ref_box,
                    cand_box,
                    ref_emb=ref_emb,
                    cand_emb=cand_embs.get(tid_i),
                )
                if score > best_score:
                    best_score = score
                    best_tid = tid_i

            if best_tid is None or best_score < float(self._body_rebind_min_score):
                continue

            body_identity_state.pop(int(old_tid), None)
            body_identity_state[int(best_tid)] = state
            state.last_seen_ts = now
            state.last_body_bbox = tuple(
                int(v) for v in body_tracks[int(best_tid)].bbox
            )
            state.visibility_state = ID_STATE_REIDENTIFYING
            self._update_body_embedding_bank(state, cand_embs.get(int(best_tid)))
            occupied_tids.add(int(best_tid))

    def _clear_body_presence_state(self, camera_id: str) -> None:
        cid = str(camera_id)
        self._body_presence_tracker_by_camera.pop(cid, None)
        self._body_presence_botsort_by_camera.pop(cid, None)
        self._body_presence_tracks_by_camera.pop(cid, None)
        self._body_identity_state_by_camera.pop(cid, None)
        self._identity_graph_by_camera.pop(cid, None)
        self._body_presence_last_det_ts_by_camera.pop(cid, None)
        self._body_presence_last_track_ts_by_camera.pop(cid, None)
        self._body_presence_last_error_ts_by_camera.pop(cid, None)

    def _get_identity_graph_manager(self, camera_id: str) -> IdentityGraphManager:
        cid = str(camera_id)
        mgr = self._identity_graph_by_camera.get(cid)
        if mgr is not None:
            return mgr
        mgr = IdentityGraphManager(
            min_show_confidence=float(self._identity_conf_min_show),
            drop_confidence=float(self._identity_conf_drop),
            lock_seconds=float(self._body_identity_lock_seconds),
            switch_min_similarity_gain=float(self._body_identity_switch_min_sim_gain),
        )
        self._identity_graph_by_camera[cid] = mgr
        return mgr

    def _ensure_body_presence_detector(self) -> Optional[PresenceDetector]:
        if not bool(self._body_presence_enabled):
            return None
        if bool(self._body_presence_detector_failed):
            return None
        if self._body_presence_detector is not None:
            return self._body_presence_detector

        default_presence_device = "cuda:0" if bool(self._use_gpu) else "cpu"
        face_use_gpu_raw = (
            str(os.getenv("PRESENCE_FACE_USE_GPU", "1" if self._use_gpu else "0"))
            .strip()
            .lower()
        )
        face_use_gpu = face_use_gpu_raw in {"1", "true", "yes", "on"}

        yolo_cfg = {
            "model_path": resolve_ai_path(
                os.getenv("PRESENCE_YOLO_MODEL", "yolov8n.pt")
            ),
            "conf": float(os.getenv("PRESENCE_CONF", "0.25")),
            "iou": float(os.getenv("PRESENCE_IOU", "0.45")),
            "imgsz": int(float(os.getenv("PRESENCE_IMG_SIZE", "640"))),
            "device": str(
                os.getenv("PRESENCE_DEVICE", default_presence_device)
                or default_presence_device
            ),
            "max_det": int(float(os.getenv("PRESENCE_MAX_DET", "100"))),
        }
        face_cfg = {
            "model_name": str(
                os.getenv("PRESENCE_FACE_MODEL", "buffalo_m") or "buffalo_m"
            ),
            "det_size": int(float(os.getenv("PRESENCE_FACE_DET_SIZE", "640"))),
            "min_face_size": int(float(os.getenv("PRESENCE_FACE_MIN_SIZE", "30"))),
            "min_det_score": float(os.getenv("PRESENCE_FACE_MIN_SCORE", "0.35")),
            "use_gpu": bool(face_use_gpu),
        }
        try:
            self._body_presence_detector = PresenceDetector(
                mode="person",
                yolo_cfg=yolo_cfg,
                face_cfg=face_cfg,
                allow_hog_fallback=bool(self._body_presence_allow_hog_fallback),
            )
            return self._body_presence_detector
        except Exception as e:
            self._body_presence_detector_failed = True
            print(f"[BODY-PERSIST] detector init failed; feature disabled. err={e}")
            return None

    def _get_body_presence_tracker(self, camera_id: str) -> PresenceTracker:
        cid = str(camera_id)
        tr = self._body_presence_tracker_by_camera.get(cid)
        if isinstance(tr, PresenceTracker):
            return tr

        tr = PresenceTracker(
            match_iou=float(self._body_presence_match_iou),
            max_lost_s=float(self._body_presence_max_lost_s),
            min_hits=int(self._body_presence_min_hits),
            max_events=200,
            match_center_ratio=float(self._body_presence_match_center_ratio),
            reacquire_center_ratio=float(self._body_presence_reacquire_center_ratio),
            bbox_smooth_alpha=float(self._body_presence_bbox_smooth_alpha),
            det_nms_iou=float(self._body_presence_det_nms_iou),
            active_hold_s=float(self._body_presence_visible_hold_s),
            max_misses=int(self._body_presence_max_misses),
        )
        self._body_presence_tracker_by_camera[cid] = tr
        return tr

    def _get_body_presence_botsort_tracker(
        self,
        camera_id: str,
    ) -> Optional[BoTSORTPresenceTracker]:
        if bool(self._body_presence_botsort_failed):
            return None
        cid = str(camera_id)
        tr = self._body_presence_botsort_by_camera.get(cid)
        if tr is not None:
            return tr

        default_presence_device = "cuda:0" if bool(self._use_gpu) else "cpu"
        tracker_cfg_path = str(self._body_presence_botsort_tracker_yaml).strip()
        if not tracker_cfg_path or not os.path.exists(tracker_cfg_path):
            tracker_cfg_path = (
                str(
                    os.getenv("BODY_PERSIST_BOTSORT_TRACKER_YAML", "botsort.yaml")
                ).strip()
                or "botsort.yaml"
            )

        try:
            tr = BoTSORTPresenceTracker(
                model_path=str(self._body_presence_botsort_model_path),
                tracker_cfg=str(tracker_cfg_path),
                conf=float(os.getenv("PRESENCE_CONF", "0.25")),
                iou=float(os.getenv("PRESENCE_IOU", "0.45")),
                imgsz=int(float(os.getenv("PRESENCE_IMG_SIZE", "640"))),
                device=str(
                    os.getenv("PRESENCE_DEVICE", default_presence_device)
                    or default_presence_device
                ),
                max_det=int(float(os.getenv("PRESENCE_MAX_DET", "100"))),
                active_hold_s=float(self._body_presence_visible_hold_s),
                max_lost_s=float(self._body_presence_max_lost_s),
                max_misses=int(self._body_presence_max_misses),
                bbox_smooth_alpha=float(self._body_presence_bbox_smooth_alpha),
            )
            self._body_presence_botsort_by_camera[cid] = tr
            self._body_presence_tracker_by_camera[cid] = tr
            self._body_presence_botsort_failed = False
            return tr
        except Exception as e:
            self._body_presence_botsort_failed = True
            last_err = float(
                self._body_presence_last_error_ts_by_camera.get(cid, 0.0) or 0.0
            )
            if (time.time() - last_err) >= float(
                self._body_presence_error_log_interval_s
            ):
                self._body_presence_last_error_ts_by_camera[cid] = time.time()
                print(f"[BODY-PERSIST] BoTSORT init failed cam={cid} err={e}")
            return None

    def _update_body_presence_tracks(
        self, camera_id: str, frame_bgr: np.ndarray, now: float
    ) -> Dict[int, PresenceTrack]:
        cid = str(camera_id)
        if not bool(self._body_presence_enabled):
            self._clear_body_presence_state(cid)
            return {}

        backend = str(self._body_presence_tracker_backend).strip().lower()
        if backend == "botsort":
            botsort = self._get_body_presence_botsort_tracker(cid)
            if botsort is None:
                self._clear_body_presence_state(cid)
                return {}

            run_period = 1.0 / max(0.2, float(self._body_presence_track_fps))
            last_track = float(
                self._body_presence_last_track_ts_by_camera.get(cid, 0.0) or 0.0
            )
            run_track = last_track <= 0.0 or (now - last_track) >= run_period
            try:
                visible = (
                    botsort.track(frame_bgr, now=now)
                    if run_track
                    else botsort.active_tracks(now=now)
                )
                if run_track:
                    self._body_presence_last_track_ts_by_camera[cid] = now
                self._body_presence_tracks_by_camera[cid] = visible
                return visible
            except Exception as e:
                last_err = float(
                    self._body_presence_last_error_ts_by_camera.get(cid, 0.0) or 0.0
                )
                if (now - last_err) >= float(self._body_presence_error_log_interval_s):
                    self._body_presence_last_error_ts_by_camera[cid] = now
                    print(f"[BODY-PERSIST] BoTSORT track failed cam={cid} err={e}")
                fallback = botsort.active_tracks(now=now)
                self._body_presence_tracks_by_camera[cid] = fallback
                return fallback

        detector = self._ensure_body_presence_detector()
        if detector is None:
            self._clear_body_presence_state(cid)
            return {}

        tracker = self._get_body_presence_tracker(cid)
        det_period = 1.0 / max(0.2, float(self._body_presence_det_fps))
        last_det = float(self._body_presence_last_det_ts_by_camera.get(cid, 0.0) or 0.0)
        run_det = last_det <= 0.0 or (now - last_det) >= det_period

        detections = None
        if run_det:
            try:
                detections = detector.detect(frame_bgr)
                self._body_presence_last_det_ts_by_camera[cid] = now
            except Exception as e:
                last_err = float(
                    self._body_presence_last_error_ts_by_camera.get(cid, 0.0) or 0.0
                )
                if (now - last_err) >= float(self._body_presence_error_log_interval_s):
                    self._body_presence_last_error_ts_by_camera[cid] = now
                    print(f"[BODY-PERSIST] detect failed cam={cid} err={e}")
                detections = []

        tracks = tracker.update(detections, now=now, frame_shape=frame_bgr.shape)

        visible: Dict[int, PresenceTrack] = {}
        for tr in tracks:
            age = max(0.0, now - float(getattr(tr, "last_seen_ts", now) or now))
            if age > float(self._body_presence_visible_hold_s):
                continue
            if int(getattr(tr, "misses", 0) or 0) > int(self._body_presence_max_misses):
                continue
            visible[int(tr.track_id)] = tr

        self._body_presence_tracks_by_camera[cid] = visible
        return visible

    def _score_face_to_body(
        self,
        face_box: Tuple[int, int, int, int],
        body_box: Tuple[int, int, int, int],
    ) -> float:
        fx1, fy1, fx2, fy2 = [int(v) for v in face_box]
        bx1, by1, bx2, by2 = self._expand_xyxy(
            body_box,
            expand_x_ratio=float(self._body_face_match_margin_x_ratio),
            expand_y_ratio=float(self._body_face_match_margin_y_ratio),
            expand_top_ratio=float(self._body_face_match_top_ratio),
        )
        if fx2 <= fx1 or fy2 <= fy1 or bx2 <= bx1 or by2 <= by1:
            return -1.0

        fcx, fcy = self._bbox_center_xyxy((fx1, fy1, fx2, fy2))
        bw = max(1.0, float(bx2 - bx1))
        bh = max(1.0, float(by2 - by1))
        margin_x = 0.10 * bw
        margin_y = 0.12 * bh
        inside = (float(bx1) - margin_x) <= fcx <= (float(bx2) + margin_x) and (
            float(by1) - margin_y
        ) <= fcy <= (float(by2) + margin_y)
        if not inside:
            return -1.0

        if fcy > (float(by1) + (float(self._body_face_max_y_ratio) * bh)):
            return -1.0

        face_area = float(max(1, fx2 - fx1) * max(1, fy2 - fy1))
        ix1 = max(fx1, bx1)
        iy1 = max(fy1, by1)
        ix2 = min(fx2, bx2)
        iy2 = min(fy2, by2)
        inter = float(max(0, ix2 - ix1) * max(0, iy2 - iy1))
        containment = inter / max(1e-6, face_area)
        iou = self._bbox_iou_xyxy((fx1, fy1, fx2, fy2), (bx1, by1, bx2, by2))

        head_y = float(by1) + (0.15 * bh)
        head_align = max(0.0, 1.0 - abs(fcy - head_y) / max(1.0, 0.45 * bh))
        center_x = float(bx1 + bx2) * 0.5
        x_align = max(0.0, 1.0 - abs(fcx - center_x) / max(1.0, 0.60 * bw))

        # Exponential penalty for faces too far down the body.
        # This is CRITICAL for preventing background person body IDs from stealing foreground faces.
        y_rel = (fcy - float(by1)) / bh
        v_penalty = 1.0
        if y_rel > 0.30:
             v_penalty = max(0.0, 1.0 - ((y_rel - 0.30) * 4.0))

        return float(
            ((1.40 * containment) + (0.45 * iou) + (0.35 * head_align) + (0.15 * x_align)) * v_penalty
        )

    def _score_observation_to_body(
        self,
        obs_box: Tuple[int, int, int, int],
        body_box: Tuple[int, int, int, int],
    ) -> float:
        face_score = self._score_face_to_body(obs_box, body_box)

        ox1, oy1, ox2, oy2 = [int(v) for v in obs_box]
        bx1, by1, bx2, by2 = self._expand_xyxy(
            body_box,
            expand_x_ratio=float(self._body_face_match_margin_x_ratio),
            expand_y_ratio=float(self._body_face_match_margin_y_ratio),
            expand_top_ratio=float(self._body_face_match_top_ratio),
        )
        if ox2 <= ox1 or oy2 <= oy1 or bx2 <= bx1 or by2 <= by1:
            return float(face_score)

        obs_area = float(max(1, ox2 - ox1) * max(1, oy2 - oy1))
        body_area = float(max(1, bx2 - bx1) * max(1, by2 - by1))
        area_ratio = obs_area / max(1.0, body_area)
        if area_ratio > 2.25:
            return float(face_score)

        ocx, ocy = self._bbox_center_xyxy((ox1, oy1, ox2, oy2))
        bw = max(1.0, float(bx2 - bx1))
        bh = max(1.0, float(by2 - by1))
        margin_x = 0.08 * bw
        margin_y = 0.08 * bh
        center_inside = (float(bx1) - margin_x) <= ocx <= (float(bx2) + margin_x) and (
            float(by1) - margin_y
        ) <= ocy <= (float(by2) + margin_y)

        obs_overlap = self._bbox_overlap_ratio_xyxy(
            (ox1, oy1, ox2, oy2), (bx1, by1, bx2, by2)
        )
        iou = self._bbox_iou_xyxy((ox1, oy1, ox2, oy2), (bx1, by1, bx2, by2))
        body_cx = float(bx1 + bx2) * 0.5
        x_align = max(0.0, 1.0 - abs(float(ocx) - body_cx) / max(1.0, 0.75 * bw))
        upper_body_y = float(by1) + (0.42 * bh)
        y_align = max(0.0, 1.0 - abs(float(ocy) - upper_body_y) / max(1.0, 0.80 * bh))

        general_score = 0.0
        if center_inside:
            general_score += 0.18
        general_score += 0.50 * max(0.0, min(1.0, obs_overlap))
        general_score += 0.25 * max(0.0, min(1.0, iou * 3.0))
        general_score += 0.08 * x_align
        general_score += 0.06 * y_align

        return float(max(face_score, general_score))

    def _assign_body_track_to_face(
        self,
        *,
        face_track: Any,
        body_tracks: Dict[int, PresenceTrack],
        used_body_track_ids: set[int],
    ) -> Optional[int]:
        if not body_tracks:
            return None

        try:
            face_box = tuple(int(v) for v in getattr(face_track, "bbox", None) or ())
        except Exception:
            return None
        if len(face_box) != 4:
            return None

        preferred = getattr(face_track, "body_track_id", None)
        if preferred is not None:
            try:
                preferred_tid = int(preferred)
            except Exception:
                preferred_tid = -1
            if (
                preferred_tid in body_tracks
                and preferred_tid not in used_body_track_ids
            ):
                pref_score = self._score_observation_to_body(
                    face_box, body_tracks[preferred_tid].bbox
                )
                if pref_score >= float(self._body_face_match_min_score):
                    used_body_track_ids.add(preferred_tid)
                    face_track.body_track_id = preferred_tid
                    return preferred_tid

        best_tid: Optional[int] = None
        best_score = -1.0
        for tid, body_tr in body_tracks.items():
            if int(tid) in used_body_track_ids:
                continue
            score = self._score_observation_to_body(face_box, body_tr.bbox)
            
            # Prefer larger body boxes if face box is large (simple Z-order hint)
            face_area = (face_box[2]-face_box[0]) * (face_box[3]-face_box[1])
            body_area = (body_tr.bbox[2]-body_tr.bbox[0]) * (body_tr.bbox[3]-body_tr.bbox[1])
            if face_area > 10000 and body_area > 50000:
                score *= 1.15
            
            if score > best_score:
                best_score = score
                best_tid = int(tid)

        if best_tid is None or best_score < float(self._body_face_match_min_score):
            # If no good match, check if we should clear the preferred TID
            if preferred is not None:
                 face_track.body_track_id = None
            return None

        used_body_track_ids.add(best_tid)
        face_track.body_track_id = best_tid
        return best_tid

    def _dedupe_body_identity_state(
        self,
        *,
        camera_id: str,
        body_tracks: Dict[int, PresenceTrack],
        now: float,
    ) -> None:
        cid = str(camera_id)
        state = self._body_identity_state_by_camera.get(cid)
        if not state:
            return

        active_ids = {int(tid) for tid in body_tracks.keys()}
        ranked_by_employee: Dict[str, List[Tuple[float, int]]] = {}
        for tid, body_state in state.items():
            tid_i = int(tid)
            if tid_i not in active_ids:
                continue
            employee_id = str(getattr(body_state, "employee_id", "") or "").strip()
            if not self._is_known_employee_id(employee_id):
                continue
            face_age = max(
                0.0, float(now) - float(getattr(body_state, "last_face_seen_ts", 0.0) or 0.0)
            )
            recency = max(0.0, 1.0 - min(1.0, face_age / 2.0))
            confidence = float(getattr(body_state, "confidence", 0.0) or 0.0)
            similarity = float(getattr(body_state, "similarity", 0.0) or 0.0)
            score = (0.55 * confidence) + (0.30 * similarity) + (0.15 * recency)
            ranked_by_employee.setdefault(employee_id, []).append((float(score), tid_i))

        remove: set[int] = set()
        for _employee_id, ranked in ranked_by_employee.items():
            if len(ranked) <= 1:
                continue
            ranked.sort(reverse=True, key=lambda item: item[0])
            for _score, tid_i in ranked[1:]:
                remove.add(int(tid_i))

        for tid_i in remove:
            state.pop(int(tid_i), None)

    def _prune_body_identity_state(
        self,
        *,
        camera_id: str,
        body_tracks: Dict[int, PresenceTrack],
        now: float,
    ) -> None:
        cid = str(camera_id)
        state = self._body_identity_state_by_camera.get(cid)
        if not state:
            return

        ttl_s = float(self._body_identity_ttl_s)
        remove: list[int] = []
        for tid, item in state.items():
            if int(tid) in body_tracks:
                continue
            missing_age = now - float(item.last_seen_ts)
            if missing_age > max(0.1, float(self._body_presence_draw_max_stale_s)):
                remove.append(int(tid))
                continue
            self._decay_body_identity_state(
                body_state=item, now=now, body_visible=False
            )
            if float(getattr(item, "confidence", 0.0) or 0.0) < float(
                self._identity_conf_drop
            ):
                remove.append(int(tid))
                continue
            if (now - float(item.last_seen_ts)) > ttl_s:
                remove.append(int(tid))
        for tid in remove:
            state.pop(int(tid), None)

        if not state:
            self._body_identity_state_by_camera.pop(cid, None)

    def _is_body_identity_switch_allowed(
        self,
        *,
        camera_id: str,
        existing_state: Optional[BodyIdentityState],
        new_employee_id: str,
        new_similarity: float,
        now: float,
    ) -> bool:
        if existing_state is None:
            return True

        existing_emp = str(getattr(existing_state, "employee_id", "") or "").strip()
        if existing_emp == str(new_employee_id or "").strip():
            return True

        graph = self._get_identity_graph_manager(camera_id)
        locked_until_ts = float(getattr(existing_state, "locked_until_ts", 0.0) or 0.0)
        existing_similarity = float(getattr(existing_state, "similarity", 0.0) or 0.0)
        
        # High confidence face match unconditionally overrides identity locks.
        # This instantly fixes BoTSORT ID swaps during crossovers IF we are very sure.
        if float(new_similarity) >= 0.90:
            setattr(existing_state, "locked_until_ts", graph.lock_until(now=float(now)))
            setattr(existing_state, "last_switch_ts", float(now))
            return True

        # If we already have a decent match, require a VERY large gain to switch.
        # This prevents 'identity jitter' in crowded office desks.
        dynamic_gain = float(self.cfg.distinct_sim_margin) * 1.5
        if existing_similarity > 0.45:
             dynamic_gain = max(dynamic_gain, 0.15)

        allowed = float(new_similarity) >= (existing_similarity + dynamic_gain)
        if not allowed and float(now) >= float(locked_until_ts):
             # If lock is expired, allow standard graph policy
             allowed = graph.can_switch(
                existing_employee_id=existing_emp,
                existing_similarity=existing_similarity,
                existing_locked_until_ts=locked_until_ts,
                new_employee_id=str(new_employee_id or "").strip(),
                new_similarity=float(new_similarity),
                now=float(now),
            )

        if allowed:
            setattr(existing_state, "locked_until_ts", graph.lock_until(now=float(now)))
            setattr(existing_state, "last_switch_ts", float(now))
        return bool(allowed)

    def _reconcile_body_identity_graph(
        self,
        *,
        camera_id: str,
        body_tracks: Dict[int, PresenceTrack],
        now: float,
    ) -> None:
        cid = str(camera_id)
        body_identity_state = self._body_identity_state_by_camera.get(cid)
        if not body_identity_state or not body_tracks:
            return

        graph = self._get_identity_graph_manager(cid)
        active_track_ids = {int(tid) for tid in body_tracks.keys()}

        nodes: Dict[int, IdentityNode] = {}
        for tid, state in body_identity_state.items():
            tid_i = int(tid)
            if tid_i not in active_track_ids:
                continue
            emp = str(getattr(state, "employee_id", "") or "").strip()
            if not emp:
                continue
            if not self._is_known_employee_id(emp):
                continue
            node = IdentityNode(
                track_id=tid_i,
                employee_id=emp,
                name=str(getattr(state, "name", emp) or emp),
                confidence=float(getattr(state, "confidence", 0.0) or 0.0),
                similarity=float(getattr(state, "similarity", 0.0) or 0.0),
                last_seen_ts=float(getattr(state, "last_seen_ts", now) or now),
                locked_until_ts=float(getattr(state, "locked_until_ts", 0.0) or 0.0),
                last_switch_ts=float(getattr(state, "last_switch_ts", 0.0) or 0.0),
            )
            nodes[tid_i] = node

        if not nodes:
            return

        removed = graph.reconcile(
            nodes=nodes,
            active_track_ids=active_track_ids,
            now=float(now),
        )

        for tid_i, node in nodes.items():
            state = body_identity_state.get(int(tid_i))
            if state is None:
                continue
            state.confidence = float(max(0.0, min(1.0, node.confidence)))
            state.similarity = float(node.similarity)
            state.last_seen_ts = float(node.last_seen_ts)
            setattr(state, "locked_until_ts", float(node.locked_until_ts))
            setattr(state, "last_switch_ts", float(node.last_switch_ts))

        for tid_i in removed:
            body_identity_state.pop(int(tid_i), None)

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
            self._debug_match(
                camera_id=cid,
                company_id=company_id,
                message="empty gallery",
            )
            return MatchResult(person_id=None, name="Unknown", score=-1.0)

        # Hardened numerical matching
        if not np.all(np.isfinite(emb)):
            self._debug_match(
                camera_id=cid,
                company_id=company_id,
                message="invalid embedding",
            )
            return MatchResult(person_id=None, name="Unknown", score=-1.0)

        # Ensure gallery is finite
        if not np.all(np.isfinite(gallery_matrix)):
            self._debug_match(
                camera_id=cid,
                company_id=company_id,
                message="invalid gallery",
            )
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
                    self._debug_match(
                        camera_id=cid,
                        company_id=company_id,
                        message=(
                            f"ambiguous best={sim:.3f} other={best_other:.3f} "
                            f"margin={(sim - best_other):.3f}"
                        ),
                    )
                    return MatchResult(person_id=None, name="Unknown", score=sim)
        if idx != -1 and idx < len(gallery_meta):
            _emp_int, emp_id_str, name = gallery_meta[idx]
            self._debug_match(
                camera_id=cid,
                company_id=company_id,
                message=f"best id={emp_id_str} name={name} score={sim:.3f}",
            )
            return MatchResult(
                person_id=str(emp_id_str), name=str(name), score=float(sim)
            )

        self._debug_match(
            camera_id=cid,
            company_id=company_id,
            message=f"no metadata score={sim:.3f}",
        )
        return MatchResult(person_id=None, name="Unknown", score=float(sim))

    def _debug_match(
        self,
        *,
        camera_id: str,
        company_id: Optional[str],
        message: str,
    ) -> None:
        if os.getenv("RECOGNITION_DEBUG", "0") != "1":
            return
        now = time.time()
        last = float(self._last_match_debug_by_camera.get(camera_id, 0.0) or 0.0)
        if now - last < 1.0:
            return
        self._last_match_debug_by_camera[camera_id] = now
        print(
            f"[MATCH] cam={camera_id} company={company_id or 'none'} {message}"
        )

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

            erp_queue = self._erp_queue_for_company(company_id)
            if erp_queue is not None:
                erp_job = ERPPushJob(
                    attendance_date=attendance_date,
                    emp_id=str(job.employee_id),
                    in_time=in_time,
                    in_location=str(job.camera_name),
                )
                ok = erp_queue.enqueue(erp_job)
                print(
                    f"[ERP] queued ok={ok} emp={erp_job.emp_id} date={erp_job.attendance_date} in={erp_job.in_time}"
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
        infer_frame, _enhance_stats = self._inference_frame_enhancer.enhance(frame_bgr)

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
                # Detection just updated boxes; force quick recognition only for
                # tracks that still need an identity/verification sample.
                for tr in state.tracker.tracks():
                    stable_known = (
                        self._is_known_employee_id(getattr(tr, "person_id", None))
                        and int(getattr(tr, "stable_id_hits", 0) or 0)
                        >= int(self.cfg.stable_id_confirmations)
                    )
                    if stable_known and not getattr(tr, "verify_target_id", None):
                        continue
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
            self._gpu.submit(cid, infer_frame, ts=now)
            state.scheduler.mark_detection_submitted(now=now)

        h, w = annotated.shape[:2]
        # Draw Safety Zone (Boundary Box) for identity latching
        margin_ratio = float(getattr(self.cfg, "latch_boundary_margin_ratio", 0.005) or 0.005)
        mx = int(w * margin_ratio)
        my = int(h * margin_ratio)
        if mx > 0 and my > 0:
            # Draw a very subtle thin line for the boundary (near camera edges)
            overlay = annotated.copy()
            cv2.rectangle(overlay, (mx, my), (w - mx, h - my), (120, 120, 120), 1)
            # Add corner accents for a premium "targeting" look
            corner_len = int(min(w, h) * 0.02)
            # Top-left
            cv2.line(overlay, (mx, my), (mx + corner_len, my), (200, 200, 200), 2)
            cv2.line(overlay, (mx, my), (mx, my + corner_len), (200, 200, 200), 2)
            # Top-right
            cv2.line(overlay, (w - mx, my), (w - mx - corner_len, my), (200, 200, 200), 2)
            cv2.line(overlay, (w - mx, my), (w - mx, my + corner_len), (200, 200, 200), 2)
            # Bottom-left
            cv2.line(overlay, (mx, h - my), (mx + corner_len, h - my), (200, 200, 200), 2)
            cv2.line(overlay, (mx, h - my), (mx, h - my - corner_len), (200, 200, 200), 2)
            # Bottom-right
            cv2.line(overlay, (w - mx, h - my), (w - mx - corner_len, h - my), (200, 200, 200), 2)
            cv2.line(overlay, (w - mx, h - my), (w - mx, h - my - corner_len), (200, 200, 200), 2)
            
            cv2.addWeighted(overlay, 0.4, annotated, 0.6, 0, annotated)

        unknown_count = 0
        authorized_employee_ids = self._refresh_authorized_employee_ids(cid, company_id)
        has_authorized_scope = len(authorized_employee_ids) > 0
        tracking_boxes = self._refresh_bounding_boxes(cid, company_id)
        body_tracks_all = self._update_body_presence_tracks(cid, infer_frame, now)
        body_tracks = {
            int(tid): tr
            for tid, tr in body_tracks_all.items()
            if self._is_body_track_fresh_for_overlay(tr, now=now)
        }
        body_identity_state = self._body_identity_state_by_camera.setdefault(cid, {})
        self._dedupe_body_identity_state(
            camera_id=cid,
            body_tracks=body_tracks,
            now=now,
        )
        # Scheduled per-track recognition (CPU by default).
        rec_stats = state.recognizer.update_tracks(
            infer_frame, tracks, state.scheduler, now=now
        )
        state.rec_calls_total += int(rec_stats.get("recognition_calls", 0) or 0)

        used_body_track_ids: set[int] = set()
        known_render_boxes: list[Tuple[int, int, int, int]] = []
        body_fallback_overlays: Dict[
            int,
            Tuple[
                Tuple[int, int, int, int],
                str,
                str,
                Optional[float],
                Tuple[int, int, int, int],
                Optional[List[Tuple[int, int]]],
            ],
        ] = {}

        if body_tracks:
            for tr in tracks:
                if not self._is_known_employee_id(getattr(tr, "person_id", None)):
                    continue
                matched_tid = self._assign_body_track_to_face(
                    face_track=tr,
                    body_tracks=body_tracks,
                    used_body_track_ids=used_body_track_ids,
                )
                if matched_tid is None:
                    continue
                emp_id = str(getattr(tr, "person_id", "") or "").strip()
                existing_state = body_identity_state.get(int(matched_tid))
                switch_allowed = self._is_body_identity_switch_allowed(
                    camera_id=cid,
                    existing_state=existing_state,
                    new_employee_id=emp_id,
                    new_similarity=float(getattr(tr, "similarity", 0.0) or 0.0),
                    now=now,
                )
                if not switch_allowed:
                    continue
                if (
                    existing_state is not None
                    and str(existing_state.employee_id).strip() == emp_id
                ):
                    existing_state.name = str(getattr(tr, "name", "") or emp_id)
                    existing_state.similarity = float(
                        getattr(tr, "similarity", 0.0) or 0.0
                    )
                    existing_state.last_seen_ts = now
                    existing_state.last_face_seen_ts = now
                    if (
                        float(getattr(existing_state, "last_confidence_ts", 0.0) or 0.0)
                        <= 0.0
                    ):
                        existing_state.last_confidence_ts = now
                    body_state = existing_state
                else:
                    body_state = BodyIdentityState(
                        employee_id=emp_id,
                        name=str(getattr(tr, "name", "") or emp_id),
                        similarity=float(getattr(tr, "similarity", 0.0) or 0.0),
                        last_seen_ts=now,
                        last_face_seen_ts=now,
                        confidence=max(
                            0.55,
                            min(0.98, float(getattr(tr, "similarity", 0.0) or 0.0)),
                        ),
                        visibility_state=ID_STATE_VISIBLE,
                        last_confidence_ts=now,
                    )
                    body_identity_state[int(matched_tid)] = body_state
                setattr(
                    body_state,
                    "locked_until_ts",
                    self._get_identity_graph_manager(cid).lock_until(now=now),
                )
                body_tr = body_tracks.get(int(matched_tid))
                if body_tr is not None:
                    self._sync_body_identity_dwell_anchor(
                        body_state=body_state,
                        body_track=body_tr,
                        now=now,
                    )
                    self._update_body_identity_face_geometry(
                        body_state=body_state,
                        face_box=tuple(int(v) for v in tr.bbox),
                        body_box=tuple(int(v) for v in body_tr.bbox),
                    )
                    body_emb = self._body_embedding_from_bbox(
                        infer_frame,
                        tuple(int(v) for v in body_tr.bbox),
                    )
                    self._update_body_embedding_bank(body_state, body_emb)
                self._boost_body_identity_state(
                    body_state=body_state,
                    similarity=float(getattr(tr, "similarity", 0.0) or 0.0),
                    now=now,
                    face_confirmed=True,
                )
                stale_same_emp: list[int] = []
                for other_tid, other_state in body_identity_state.items():
                    if int(other_tid) == int(matched_tid):
                        continue
                    if str(other_state.employee_id) != emp_id:
                        continue
                    if (now - float(other_state.last_face_seen_ts)) > 0.5:
                        stale_same_emp.append(int(other_tid))
                for stale_tid in stale_same_emp:
                    body_identity_state.pop(int(stale_tid), None)

        if body_tracks and body_identity_state:
            self._dedupe_body_identity_state(
                camera_id=cid,
                body_tracks=body_tracks,
                now=now,
            )

        if body_tracks and body_identity_state:
            self._rebind_body_identity_tracks(
                body_identity_state=body_identity_state,
                body_tracks=body_tracks,
                frame_bgr=infer_frame,
                now=now,
            )

        if body_tracks and body_identity_state:
            self._dedupe_body_identity_state(
                camera_id=cid,
                body_tracks=body_tracks,
                now=now,
            )

        if body_tracks and body_identity_state:
            for tid, body_state in body_identity_state.items():
                body_tr = body_tracks.get(int(tid))
                if body_tr is None:
                    self._decay_body_identity_state(
                        body_state=body_state,
                        now=now,
                        body_visible=False,
                    )
                    continue
                body_state.last_seen_ts = now
                self._decay_body_identity_state(
                    body_state=body_state,
                    now=now,
                    body_visible=True,
                )
                prev_body_box = (
                    tuple(int(v) for v in body_state.last_body_bbox)
                    if body_state.last_body_bbox is not None
                    else None
                )
                curr_body_box = tuple(int(v) for v in body_tr.bbox)
                self._sync_body_identity_dwell_anchor(
                    body_state=body_state,
                    body_track=body_tr,
                    now=now,
                )
                body_state.last_body_bbox = curr_body_box
                body_emb = self._body_embedding_from_bbox(infer_frame, curr_body_box)
                self._update_body_embedding_bank(body_state, body_emb)
                if not self._is_known_employee_id(
                    getattr(body_state, "employee_id", None)
                ):
                    continue
                self._boost_body_identity_state(
                    body_state=body_state,
                    similarity=float(getattr(body_state, "similarity", 0.0) or 0.0),
                    now=now,
                    face_confirmed=False,
                )
                if float(getattr(body_state, "confidence", 0.0) or 0.0) < float(
                    self._identity_conf_min_show
                ):
                    continue
                employee_id = str(body_state.employee_id or "").strip()
                if has_authorized_scope and employee_id not in authorized_employee_ids:
                    continue
                # 100% Accuracy: Trust the body identity even if face-fallback timer expires.
                # Only skip if the identity is fully dropped or authorized scope is violated.
                if not self._body_fallback_overlay_enabled:
                    continue

                predicted_seed = self._predict_face_box_from_body(
                    body_box=curr_body_box,
                    body_state=body_state,
                    frame_w=w,
                    frame_h=h,
                )
                face_seed = (
                    tuple(int(v) for v in body_state.last_draw_face_bbox)
                    if body_state.last_draw_face_bbox is not None
                    else None
                )
                if face_seed is None and body_state.last_face_bbox is not None:
                    face_seed = self._known_face_draw_box(
                        tuple(int(v) for v in body_state.last_face_bbox),
                        frame_w=w,
                        frame_h=h,
                    )
                if face_seed is None:
                    face_seed = predicted_seed
                else:
                    face_seed = self._smooth_box_xyxy(
                        face_seed,
                        predicted_seed,
                        alpha=0.35,
                        frame_w=w,
                        frame_h=h,
                    )

                shifted_seed = face_seed
                if prev_body_box is not None:
                    prev_cx, prev_cy = self._bbox_center_xyxy(prev_body_box)
                    curr_cx, curr_cy = self._bbox_center_xyxy(curr_body_box)
                    dx = float(curr_cx - prev_cx)
                    dy = float(curr_cy - prev_cy)
                    cbx1, cby1, cbx2, cby2 = curr_body_box
                    max_shift = 1.8 * float(max(1, cbx2 - cbx1, cby2 - cby1))
                    if float(np.hypot(dx, dy)) <= max_shift:
                        shifted_seed = self._shift_box_xyxy(
                            face_seed,
                            dx=dx,
                            dy=dy,
                            frame_w=w,
                            frame_h=h,
                        )

                smooth_box = self._smooth_box_xyxy(
                    body_state.last_draw_face_bbox,
                    shifted_seed,
                    alpha=float(self._body_face_draw_smooth_alpha),
                    frame_w=w,
                    frame_h=h,
                )
                body_state.last_draw_face_bbox = smooth_box
                known_render_boxes.append(smooth_box)
                dwell_s = self._body_identity_dwell_seconds(
                    body_state=body_state,
                    body_track=body_tr,
                    fallback_first_seen_ts=None,
                    now=now,
                )
                body_fallback_overlays[int(tid)] = (
                    smooth_box,
                    employee_id,
                    str(body_state.name or employee_id),
                    dwell_s,
                    curr_body_box,
                    getattr(body_tr, "mask_polygon", None),
                )

        if body_tracks and body_identity_state:
            self._reconcile_body_identity_graph(
                camera_id=cid,
                body_tracks=body_tracks,
                now=now,
            )

        body_drawn_employee_ids = {
            str(payload[1]).strip()
            for payload in body_fallback_overlays.values()
            if payload[1]
        }

        primary_known_face_track_by_employee: Dict[str, int] = {}
        primary_known_face_score_by_employee: Dict[str, float] = {}
        for tr in tracks:
            if not self._is_face_track_fresh_for_overlay(tr, now=now):
                continue
            emp_id = str(getattr(tr, "person_id", "") or "").strip()
            if not self._is_known_employee_id(emp_id):
                continue
            if has_authorized_scope and emp_id not in authorized_employee_ids:
                continue
            sim = float(getattr(tr, "similarity", 0.0) or 0.0)
            stable_hits = float(getattr(tr, "stable_id_hits", 0) or 0)
            embed_age = (
                now - float(getattr(tr, "last_embed_ts", 0.0) or 0.0)
                if float(getattr(tr, "last_embed_ts", 0.0) or 0.0) > 0.0
                else 999.0
            )
            score = sim + (0.01 * min(stable_hits, 10.0)) - (0.02 * min(embed_age, 5.0))
            old_score = primary_known_face_score_by_employee.get(emp_id)
            if old_score is None or score > old_score:
                primary_known_face_track_by_employee[emp_id] = int(tr.track_id)
                primary_known_face_score_by_employee[emp_id] = float(score)

        drawn_known_employee_ids: set[str] = set()

        for tr in tracks:
            # --- SMOOTHING ---
            # Use Exponential Moving Average (EMA) for fluid, jitter-free movement.
            # This is applied every frame to the tracker's raw output.
            # Tightened from 0.22 to 0.40 to feel more 'live' and responsive.
            alpha = float(os.getenv("HUD_SMOOTHING_ALPHA", "0.40"))
            if tr.smoothed_bbox is None:
                tr.smoothed_bbox = tr.bbox
            else:
                tr.smoothed_bbox = tuple(
                    alpha * float(c) + (1.0 - alpha) * float(p)
                    for c, p in zip(tr.bbox, tr.smoothed_bbox)
                )

            # Use smoothed coordinates for all drawing and spatial logic
            x1, y1, x2, y2 = [int(v) for v in tr.smoothed_bbox]

            # --- IDENTITY RESOLUTION ---
            # Priority: live recognition > identity lock > unknown
            # If face recognition is currently active and confident, use it.
            # If the face isn't visible but we have a confirmed lock, show it.
            # Only skip drawing a label for fully anonymous (no lock) unknowns.
            live_recognized = self._is_known_employee_id(tr.person_id)
            has_lock = bool(
                tr.locked_person_id
                and self._is_known_employee_id(tr.locked_person_id)
            )

            # Effective identity for display and attendance logic
            effective_person_id = tr.person_id if live_recognized else (tr.locked_person_id if has_lock else None)
            effective_name = tr.name if live_recognized else (tr.locked_name if has_lock else "Unknown")
            is_locked_display = has_lock and not live_recognized  # face not visible, using lock

            recognized_known = self._is_known_employee_id(effective_person_id)
            face_track_fresh = self._is_face_track_fresh_for_overlay(tr, now=now)

            known = recognized_known and (
                not has_authorized_scope
                or str(effective_person_id or "").strip() in authorized_employee_ids
            )
            unauthorized_known = recognized_known and not known

            if known:
                emp_for_primary = str(effective_person_id or "").strip()
                primary_tid = primary_known_face_track_by_employee.get(emp_for_primary)
                if primary_tid is not None and int(tr.track_id) != int(primary_tid):
                    continue
            if not face_track_fresh:
                continue

            matched_body_tid: Optional[int] = None
            if body_tracks:
                preferred_tid_raw = getattr(tr, "body_track_id", None)
                preferred_tid: Optional[int] = None
                if preferred_tid_raw is not None:
                    try:
                        candidate_tid = int(preferred_tid_raw)
                    except Exception:
                        candidate_tid = -1
                    if candidate_tid in body_tracks:
                        face_box = (x1, y1, x2, y2)
                        pref_score = self._score_observation_to_body(
                            face_box, body_tracks[candidate_tid].bbox
                        )
                        if pref_score >= float(self._body_face_match_min_score):
                            preferred_tid = candidate_tid
                if (
                    preferred_tid is not None
                    and preferred_tid in used_body_track_ids
                    and not recognized_known
                ):
                    preferred_tid = None
                if preferred_tid is not None:
                    matched_body_tid = preferred_tid
                    if recognized_known:
                        used_body_track_ids.add(int(preferred_tid))
                else:
                    matched_body_tid = self._assign_body_track_to_face(
                        face_track=tr,
                        body_tracks=body_tracks,
                        used_body_track_ids=used_body_track_ids,
                    )
                if recognized_known and matched_body_tid is not None:
                    emp_id = str(effective_person_id or "").strip()
                    existing_state = body_identity_state.get(int(matched_body_tid))
                    switch_allowed = self._is_body_identity_switch_allowed(
                        camera_id=cid,
                        existing_state=existing_state,
                        new_employee_id=emp_id,
                        new_similarity=float(tr.similarity),
                        now=now,
                    )
                    if not switch_allowed:
                        existing_state = body_identity_state.get(int(matched_body_tid))
                        if existing_state is not None:
                            self._boost_body_identity_state(
                                body_state=existing_state,
                                similarity=float(
                                    getattr(existing_state, "similarity", 0.0) or 0.0
                                ),
                                now=now,
                                face_confirmed=False,
                            )
                        continue
                    if (
                        existing_state is not None
                        and str(existing_state.employee_id).strip() == emp_id
                    ):
                        existing_state.name = str(tr.name or emp_id)
                        existing_state.similarity = float(tr.similarity)
                        existing_state.last_seen_ts = now
                        existing_state.last_face_seen_ts = now
                        if (
                            float(
                                getattr(existing_state, "last_confidence_ts", 0.0)
                                or 0.0
                            )
                            <= 0.0
                        ):
                            existing_state.last_confidence_ts = now
                        body_state = existing_state
                    else:
                        body_state = BodyIdentityState(
                            employee_id=emp_id,
                            name=str(tr.name or emp_id),
                            similarity=float(tr.similarity),
                            last_seen_ts=now,
                            last_face_seen_ts=now,
                            confidence=max(0.55, min(0.98, float(tr.similarity))),
                            visibility_state=ID_STATE_VISIBLE,
                            last_confidence_ts=now,
                        )
                        body_identity_state[int(matched_body_tid)] = body_state
                    setattr(
                        body_state,
                        "locked_until_ts",
                        self._get_identity_graph_manager(cid).lock_until(now=now),
                    )
                    body_tr = body_tracks.get(int(matched_body_tid))
                    if body_tr is not None:
                        self._sync_body_identity_dwell_anchor(
                            body_state=body_state,
                            body_track=body_tr,
                            now=now,
                        )
                        self._update_body_identity_face_geometry(
                            body_state=body_state,
                            face_box=(x1, y1, x2, y2),
                            body_box=tuple(int(v) for v in body_tr.bbox),
                        )
                        body_emb = self._body_embedding_from_bbox(
                            infer_frame,
                            tuple(int(v) for v in body_tr.bbox),
                        )
                        self._update_body_embedding_bank(body_state, body_emb)
                    self._boost_body_identity_state(
                        body_state=body_state,
                        similarity=float(tr.similarity),
                        now=now,
                        face_confirmed=True,
                    )
            if matched_body_tid is None and body_tracks and body_identity_state:
                face_box = (x1, y1, x2, y2)
                best_tid: Optional[int] = None
                best_score = -1.0
                for cand_tid, cand_state in body_identity_state.items():
                    if not self._is_known_employee_id(
                        getattr(cand_state, "employee_id", None)
                    ):
                        continue
                    body_tr = body_tracks.get(int(cand_tid))
                    if body_tr is None:
                        continue
                    score = self._score_observation_to_body(face_box, body_tr.bbox)
                    if score > best_score:
                        best_score = score
                        best_tid = int(cand_tid)
                if best_tid is not None and best_score >= float(
                    self._body_known_match_min_score
                ):
                    matched_body_tid = int(best_tid)

            body_state = (
                body_identity_state.get(int(matched_body_tid))
                if matched_body_tid is not None
                else None
            )
            matched_body_tr = (
                body_tracks.get(int(matched_body_tid))
                if matched_body_tid is not None
                else None
            )
            matched_body_fresh = self._is_body_track_fresh_for_overlay(
                matched_body_tr, now=now
            )
            body_identity_hold_ok = bool(
                matched_body_fresh
                and body_state is not None
                and (
                    float(self._body_face_fallback_max_age_s) <= 0.0
                    or (
                        now
                        - float(getattr(body_state, "last_face_seen_ts", 0.0) or 0.0)
                    )
                    <= float(self._body_face_fallback_max_age_s)
                )
            )
            body_conf = (
                float(getattr(body_state, "confidence", 0.0) or 0.0)
                if body_state is not None
                else 0.0
            )
            # 100% Accuracy: Trust the body identity even if face recognition is stale/obscured.
            body_has_stable_identity = bool(
                body_state is not None
                and self._is_known_employee_id(getattr(body_state, "employee_id", None))
                and body_conf >= float(self._identity_conf_min_show)
            )

            display_employee_id: Optional[str] = (
                str(effective_person_id or "").strip()
                if recognized_known and face_track_fresh
                else (
                    str(body_state.employee_id).strip()
                    if body_has_stable_identity and body_state is not None
                    else None
                )
            )
            display_name = (
                str(effective_name or display_employee_id or "Unknown")
                if recognized_known and face_track_fresh
                else (
                    str(body_state.name or body_state.employee_id)
                    if body_has_stable_identity and body_state is not None
                    else "Unknown"
                )
            )
            display_known = bool(
                display_employee_id
                and self._is_known_employee_id(display_employee_id)
                and (
                    not has_authorized_scope
                    or str(display_employee_id) in authorized_employee_ids
                )
            )
            if body_state is not None:
                if matched_body_fresh and matched_body_tr is not None:
                    body_state.last_seen_ts = now
                    self._sync_body_identity_dwell_anchor(
                        body_state=body_state,
                        body_track=matched_body_tr,
                        now=now,
                    )
                    body_state.last_body_bbox = tuple(
                        int(v) for v in matched_body_tr.bbox
                    )
                    if not recognized_known:
                        self._boost_body_identity_state(
                            body_state=body_state,
                            similarity=float(
                                getattr(body_state, "similarity", 0.0) or 0.0
                            ),
                            now=now,
                            face_confirmed=False,
                        )
                else:
                    self._decay_body_identity_state(
                        body_state=body_state,
                        now=now,
                        body_visible=False,
                    )
            if not display_known and not face_track_fresh:
                continue

            suppress_unknown_overlay = False
            if not display_known:
                if body_has_stable_identity:
                    suppress_unknown_overlay = True
                else:
                    face_box = (x1, y1, x2, y2)
                    if body_tracks and body_identity_state:
                        # 1) Direct match check (most accurate)
                        if matched_body_tid is not None:
                            bs = body_identity_state.get(int(matched_body_tid))
                            if bs and self._is_known_employee_id(getattr(bs, "employee_id", None)):
                                suppress_unknown_overlay = True

                        # 2) Spatial fallback check
                        if not suppress_unknown_overlay:
                            for cand_tid, cand_state in body_identity_state.items():
                                if not self._is_known_employee_id(getattr(cand_state, "employee_id", None)):
                                    continue
                                cand_employee_id = str(getattr(cand_state, "employee_id", "") or "").strip()
                                if has_authorized_scope and cand_employee_id not in authorized_employee_ids:
                                    continue
                                body_tr = body_tracks.get(int(cand_tid))
                                if body_tr is None:
                                    continue
                                score = self._score_observation_to_body(face_box, tuple(int(v) for v in body_tr.bbox))
                                if score >= float(self._body_known_match_min_score) * 0.85:
                                    suppress_unknown_overlay = True
                                    break

                    fcx, fcy = self._bbox_center_xyxy(face_box)
                    if not suppress_unknown_overlay:
                        for kbox in known_render_boxes:
                            kx1, ky1, kx2, ky2 = kbox
                            iou = self._bbox_iou_xyxy(face_box, kbox)
                            overlap = self._bbox_overlap_ratio_xyxy(face_box, kbox)
                            center_inside = float(kx1) <= fcx <= float(kx2) and float(
                                ky1
                            ) <= fcy <= float(ky2)
                            if (
                                iou >= float(self._body_unknown_suppress_iou)
                                or overlap >= 0.55
                                or center_inside
                            ):
                                suppress_unknown_overlay = True
                                break

            embed_age = (
                now - float(getattr(tr, "last_embed_ts", 0.0) or 0.0)
                if float(getattr(tr, "last_embed_ts", 0.0) or 0.0) > 0.0
                else 1e9
            )
            known_for_actions = bool(
                live_recognized
                and known
                and face_track_fresh
                and embed_age
                <= max(
                    0.6,
                    float(
                        getattr(self.cfg, "attendance_max_embed_age_seconds", 0.9)
                        or 0.9
                    ),
                )
            )

            # DOOR UNLOCK - EVERY KNOWN RECOGNITION (NO DELAY)
            if (
                known_for_actions
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

            if suppress_unknown_overlay:
                continue

            if not display_known:
                unknown_count += 1

            if body_has_stable_identity and not recognized_known:
                continue

            # --- CLUTTER FILTER (GHOST DETECTION SUPPRESSION) ---
            # Don't draw "Unknown" boxes if they are low confidence or haven't been confirmed
            # by the tracker for long enough. This eliminates "ghosts" on background objects.
            # Tightened: Require higher det_score or more stable hits for unknown boxes.
            is_ghost = not display_known and (
                float(getattr(tr, "det_score", 0.0)) < (float(self.cfg.similarity_threshold) + 0.15)
                or int(getattr(tr, "stable_id_hits", 0) or 0) < 2
            )

            if is_ghost:
                continue

            color = ACCENT_KNOWN if display_known else ACCENT_UNKNOWN
            draw_x1, draw_y1, draw_x2, draw_y2 = x1, y1, x2, y2

            skip_face_rendering = False
            if display_known and display_employee_id and str(display_employee_id) in body_drawn_employee_ids:
                skip_face_rendering = True

            if not skip_face_rendering:
                if display_known:
                    if body_state is not None:
                        body_state.last_draw_face_bbox = (
                            draw_x1,
                            draw_y1,
                            draw_x2,
                            draw_y2,
                        )
                    known_render_boxes.append((draw_x1, draw_y1, draw_x2, draw_y2))
                
                # Sleek corner brackets instead of bulk rectangle
                _draw_corners(annotated, (draw_x1, draw_y1, draw_x2, draw_y2), color, thickness=2, length=12)

                label = (
                    display_name
                    if (display_known or body_has_stable_identity or recognized_known)
                    else "Unknown"
                )
                
                # Show timer / duration
                duration_s = now - tr.created_ts
                timer_str = _format_duration(duration_s)

                if display_known or body_has_stable_identity or recognized_known:
                    dwell_s = self._body_identity_dwell_seconds(
                        body_state=(
                            body_state if (display_known or body_has_stable_identity) else None
                        ),
                        body_track=matched_body_tr,
                        fallback_first_seen_ts=float(getattr(tr, "created_ts", now) or now),
                        now=now,
                    )
                    
                    if is_locked_display:
                        # Clean up persistent locks display
                        label = f"{display_name} [L]"
                        
                    label_text = _label_with_dwell(label, dwell_s)
                    label_text = f"{label_text} ({timer_str})"
                    _draw_label_card(
                        annotated,
                        label_text,
                        draw_x1,
                        max(38, draw_y1 - 14),
                        display_known,
                        scale=0.55,
                    )
                else:
                    # Truly unknown - minimal timer label
                    _draw_label_card(
                        annotated,
                        timer_str,
                        draw_x1,
                        max(38, draw_y1 - 14),
                        False,
                        scale=0.45,
                    )
                if display_known and display_employee_id:
                    drawn_known_employee_ids.add(str(display_employee_id))



            if known_for_actions and company_id and tracking_boxes:
                self._handle_bounding_box_tracking_for_track(
                    camera_id=cid,
                    camera_name=camera_name,
                    company_id=company_id,
                    boxes=tracking_boxes,
                    employee_id=str(effective_person_id),
                    bbox=(x1, y1, x2, y2),
                    frame_shape=(h, w),
                    confidence=float(tr.similarity),
                    now=now,
                )

            if (
                enable_attendance
                and not known_for_actions
                and not body_has_stable_identity
                and face_track_fresh
                and (not recognized_known or unauthorized_known)
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
            # Only note_seen for LIVE face recognition, not display lock
            if enable_attendance and known_for_actions and company_id:
                self._debouncer.note_seen(
                    company_id=company_id,
                    employee_id=str(tr.person_id),
                    now=now,
                )

            if not enable_attendance:
                continue
            if not known_for_actions:
                continue
            if not company_id:
                continue

            if self._attendance_require_extra_quality:
                # Optional extra gate. Recognition already has its own quality gate,
                # so keep this off by default for fast attendance writes.
                if x1 <= 4 or y1 <= 4 or x2 >= (w - 4) or y2 >= (h - 4):
                    continue

                q_score = quality_score((x1, y1, x2, y2), infer_frame)
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

            if self._attendance_require_fas:
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

                if (
                    (not fas_ok)
                    and isinstance(fas_dbg, dict)
                    and fas_dbg.get("fas") == "need_pose_change"
                    and str(os.getenv("FAS_ALLOW_NO_POSE_FOR_ATTENDANCE", "0")).strip()
                    == "1"
                ):
                    fas_ok = True

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

        if body_tracks and body_identity_state:
            self._dedupe_body_identity_state(
                camera_id=cid,
                body_tracks=body_tracks,
                now=now,
            )

        if body_tracks and body_identity_state:
            self._reconcile_body_identity_graph(
                camera_id=cid,
                body_tracks=body_tracks,
                now=now,
            )

        if self._body_fallback_overlay_enabled and body_fallback_overlays:
            for payload in body_fallback_overlays.values():
                _face_box, employee_id, draw_label, dwell_s, body_box, mask_poly = payload
                employee_id = str(employee_id or "").strip()
                bx1, by1, bx2, by2 = [int(v) for v in body_box]
                
                if mask_poly is not None and len(mask_poly) > 2:
                    poly_arr = np.array(mask_poly, np.int32).reshape((-1, 1, 2))
                    cv2.polylines(annotated, [poly_arr], True, ACCENT_KNOWN, 3)
                else:
                    cv2.rectangle(annotated, (bx1, by1), (bx2, by2), ACCENT_KNOWN, 3)
                    
                _draw_label_card(
                    annotated,
                    _label_with_dwell(str(draw_label or "Unknown"), dwell_s),
                    bx1,
                    max(38, by1 - 14),
                    True,
                    scale=0.75,
                )
                if employee_id:
                    drawn_known_employee_ids.add(employee_id)

        self._prune_body_identity_state(
            camera_id=cid,
            body_tracks=body_tracks,
            now=now,
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
