from __future__ import annotations

import os
import time
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple, Optional

import cv2
import numpy as np

from ..clients.backend_client import BackendClient
from ..vision.recognizer import FaceRecognizer, match_gallery
from ..vision.tracker import SimpleTracker
from ..utils import now_iso, l2_normalize, quality_score

from ..fas.gate import FASGate, GateConfig

from datetime import datetime
from ..clients.erp_client import ERPClient, ERPClientConfig
from ..services.erp_push_queue import ERPPushQueue, ERPPushJob


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
    tracker: SimpleTracker = field(
        default_factory=lambda: SimpleTracker(
            iou_threshold=0.35,
            max_age_frames=10,
            smooth_alpha=0.55,  # smoother but still responsive for 60 fps
            center_dist_threshold=140.0,  # allow lateral motion to stay on the same track
            suppress_new_iou=0.65,  # don't spawn new tracks near an existing one
            merge_iou=0.5,  # merge overlapping tracks
            merge_center=90.0,  # merge close-center tracks
        )
    )
    last_mark: Dict[str, float] = field(
        default_factory=dict
    )  # employee_id(str) -> last_mark_ts
    frame_idx: int = 0


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
        self.client = BackendClient()
        self.rec = FaceRecognizer(
            model_name=model_name, use_gpu=use_gpu, min_face_size=min_face_size
        )

        self.similarity_threshold = float(similarity_threshold)
        self.strict_similarity = float(os.getenv("STRICT_SIM_THRESHOLD", "0.5"))
        self.min_att_quality = float(os.getenv("MIN_ATT_QUALITY", "18.0"))
        self.gallery_refresh_s = float(gallery_refresh_s)
        self.cooldown_s = int(cooldown_s)
        self.stable_hits_required = int(stable_hits_required)

        self._gallery_last_load = 0.0
        self._gallery_matrix: np.ndarray = np.zeros((0, 512), dtype=np.float32)

        self._gallery_meta: List[Tuple[int, str, str]] = (
            []
        )  # (emp_int, emp_id_str, name)

        self._cam_state: Dict[str, CameraScanState] = {}
        self._enabled_for_attendance: Dict[str, bool] = {}

        # ---------------------------
        # Attendance voice events (frontend speaks serially)
        # ---------------------------
        self._voice_lock = threading.Lock()
        self._voice_seq: int = 0
        self._voice_events: List[Dict[str, Any]] = []
        self._voice_max_events: int = int(os.getenv("ATT_VOICE_MAX_EVENTS", "500"))

        self._emp_id_to_int: Dict[str, int] = {}
        self._int_to_emp_id: Dict[int, str] = {}
        self._next_emp_int: int = 1_000_000

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

    def push_voice_event(
        self,
        *,
        employee_id: str,
        name: str,
        camera_id: str,
        camera_name: str,
    ) -> int:
        """
        Record an attendance voice event to be consumed by the frontend.
        Frontend should speak these events one-by-one (no overlap).
        """
        full_name = str(name or "").strip()
        tokens = (
            full_name.replace(",", " ").replace(".", " ").split() if full_name else []
        )
        first_name = tokens[0] if tokens else str(employee_id).strip()
        if len(tokens) >= 2 and first_name.lower() in {"mr", "mrs", "ms", "md", "dr"}:
            first_name = tokens[1]

        first_name = first_name.strip() or str(employee_id).strip() or "there"
        text = f"Thank you, {first_name}. Your attendance has been recorded."
        with self._voice_lock:
            self._voice_seq += 1
            seq = self._voice_seq
            self._voice_events.append(
                {
                    "seq": seq,
                    "text": text,
                    "employee_id": str(employee_id),
                    "name": str(name),
                    "camera_id": str(camera_id),
                    "camera_name": str(camera_name),
                    "at": now_iso(),
                }
            )
            if self._voice_max_events > 0 and len(self._voice_events) > self._voice_max_events:
                self._voice_events = self._voice_events[-self._voice_max_events :]
            return seq

    def get_voice_events(self, *, after_seq: int = 0, limit: int = 50) -> Dict[str, Any]:
        after_seq = int(after_seq or 0)
        limit = max(1, min(int(limit or 50), 200))
        with self._voice_lock:
            latest_seq = int(self._voice_seq)
            items = [e for e in self._voice_events if int(e.get("seq", 0)) > after_seq]
        return {"latest_seq": latest_seq, "events": items[:limit]}

    def set_attendance_enabled(self, camera_id: str, enabled: bool) -> None:
        self._enabled_for_attendance[str(camera_id)] = bool(enabled)

    def is_attendance_enabled(self, camera_id: str) -> bool:
        return bool(self._enabled_for_attendance.get(str(camera_id), True))

    def _emp_str_to_int(self, emp_id_str: str) -> int:
        emp_id_str = str(emp_id_str)
        if emp_id_str.isdigit():
            v = int(emp_id_str)
            self._int_to_emp_id[v] = emp_id_str
            return v

        if emp_id_str in self._emp_id_to_int:
            return self._emp_id_to_int[emp_id_str]

        v = self._next_emp_int
        self._next_emp_int += 1
        self._emp_id_to_int[emp_id_str] = v
        self._int_to_emp_id[v] = emp_id_str
        return v

    def _emp_int_to_str(self, emp_int: int) -> str:
        return self._int_to_emp_id.get(int(emp_int), str(emp_int))

    def _ensure_gallery(self) -> None:
        now = time.time()
        if now - self._gallery_last_load < self.gallery_refresh_s:
            return

        templates = self.client.list_templates()
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
            emp_int = self._emp_str_to_int(emp_id_str)

            embs.append(emb)
            meta.append((emp_int, emp_id_str, name))

        self._gallery_matrix = (
            np.stack(embs, axis=0) if embs else np.zeros((0, 512), dtype=np.float32)
        )
        self._gallery_meta = meta
        self._gallery_last_load = now

    def _get_state(self, camera_id: str) -> CameraScanState:
        cid = str(camera_id)
        if cid not in self._cam_state:
            self._cam_state[cid] = CameraScanState()
        return self._cam_state[cid]

    def process_frame(
        self, frame_bgr: np.ndarray, camera_id: str, name: str
    ) -> np.ndarray:
        self._ensure_gallery()
        cid = str(camera_id)
        camera_name = str(name)

        state = self._get_state(cid)
        state.frame_idx += 1

        enable_attendance = self.is_attendance_enabled(cid)
        annotated = frame_bgr.copy()

        _put_text_white(
            annotated, f"cam={cid} frame={state.frame_idx}", 12, 36, scale=1.05
        )
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
                match_gallery(d.emb, self._gallery_matrix)
                if self._gallery_matrix.size
                else (-1, -1.0)
            )

            bbox_key = tuple(int(v) for v in d.bbox)
            det_kps_by_bbox[bbox_key] = d.kps

            if idx != -1 and sim >= self.similarity_threshold:
                emp_int, emp_id_str, name = self._gallery_meta[idx]
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
                emp_id_str = self._emp_int_to_str(tr.employee_id)
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
                # 1) Your existing backend attendance (keep as-is)
                self.client.create_attendance(
                    employee_id=emp_id_str,
                    timestamp=now_iso(),
                    camera_id=cid,
                    confidence=float(tr.similarity),
                    snapshot_path=None,
                )

                # 2) Mark cooldown only if backend success
                state.last_mark[emp_id_str] = now

                # 3) Push to ERP (non-blocking, in background)
                if self.erp_queue is not None:
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

                    if not ok:
                        print("[ERP] queue full, dropped attendance push")

                # 4) Voice event: after backend attendance success
                self.push_voice_event(
                    employee_id=emp_id_str,
                    name=name,
                    camera_id=cid,
                    camera_name=camera_name,
                )

            except Exception as e:
                print(f"[ATTENDANCE] Failed to mark emp={emp_id_str} cam={cid}: {e}")

        return annotated
