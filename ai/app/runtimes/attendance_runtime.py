from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import cv2
import numpy as np

from ..clients.backend_client import BackendClient
from ..clients.erp_client import ERPClient, ERPClientConfig
from ..core.models_registry import ModelRegistry
from ..domain.attendance import BoundingBoxRuntimeBox
from ..fas.gate import FASGate, GateConfig
from ..services.bounding_box_tracker import BoundingBoxTrackerService
from ..services.company_cache import CompanyEmbeddingCache
from ..services.door_relay import DoorRelayService, is_known_employee_id
from ..services.erp_push_queue import ERPPushJob, ERPPushQueue
from ..services.voice_events import VoiceEventService
from ..utils import l2_normalize, now_iso, quality_score
from ..vision.adaptive_scheduler import AdaptiveScheduler
from ..vision.attendance_debouncer import AttendanceDebouncer
from ..vision.db_writer import AttendanceWriteJob, DBWriter
from ..vision.gpu_arbiter import Detection, GPUArbiter
from ..vision.hud import ACCENT_KNOWN, ACCENT_UNKNOWN, draw_label_card
from ..vision.insightface_models import FaceDetector, FaceEmbedder
from ..vision.motion_gate import MotionGate as SceneMotionGate
from ..vision.pipeline_config import Config
from ..vision.recognizer_runtime import MatchResult, Recognizer
from ..vision.tracker_manager import TrackerManager


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


class AttendanceRuntime:
    """
    Production Attendance Runtime orchestrating:
      - Video tracking, motion gating & adaptive GPU/CPU scheduling
      - Face recognition & Anti-Spoofing (FAS)
      - Debounced Attendance, Voice feedback & Door Relay control
      - High-performance ROI HUD rendering (Jetson Orin Nano optimized)
    """

    def __init__(
        self,
        use_gpu: bool = False,
        model_name: str = "buffalo_m",
        min_face_size: int = 20,
        similarity_threshold: float = 0.35,
        gallery_refresh_s: float = 5.0,
        cooldown_s: int = 30,
        stable_hits_required: int = 3,
    ) -> None:
        self._default_company_id = os.getenv("BACKEND_COMPANY_ID", "").strip() or None

        self.similarity_threshold = float(similarity_threshold)
        self.strict_similarity = float(os.getenv("STRICT_SIM_THRESHOLD", "0.5"))
        self.min_att_quality = float(os.getenv("MIN_ATT_QUALITY", "18.0"))
        self.gallery_refresh_s = float(gallery_refresh_s)
        self.cooldown_s = int(cooldown_s)
        self.stable_hits_required = int(stable_hits_required)

        # Pipeline configuration
        self.cfg = Config.from_env(
            similarity_threshold=self.similarity_threshold,
            strict_similarity_threshold=self.strict_similarity,
            min_att_quality=self.min_att_quality,
            attendance_debounce_seconds=float(self.cooldown_s),
            stable_id_confirmations=int(self.stable_hits_required),
        )

        # Domain Services
        self.company_cache = CompanyEmbeddingCache(
            default_company_id=self._default_company_id,
            refresh_interval_s=self.gallery_refresh_s,
        )
        self.voice_service = VoiceEventService()
        self.door_service = DoorRelayService(company_cache=self.company_cache)
        self.box_tracker_service = BoundingBoxTrackerService(company_cache=self.company_cache)

        # Shared models from ModelRegistry (singletons to prevent RAM duplication)
        registry = ModelRegistry.get_instance()
        self._detector = registry.get_face_detector(
            name=model_name,
            use_gpu=use_gpu,
            det_size=(640, 640),
            det_thresh=0.20,
        )
        self._embedder = registry.get_face_embedder(
            name=model_name,
            use_gpu=use_gpu,
        )

        self._gpu = GPUArbiter(
            detect_fn=self._detect_faces, queue_size=int(self.cfg.queue_size)
        )

        # Async attendance writer
        self._db_writer = DBWriter(write_fn=self._write_attendance_job, max_queue=1000)
        self._debouncer = AttendanceDebouncer(self.cfg)

        self._company_by_camera: Dict[str, str] = {}
        self._cam_state: Dict[str, CameraScanState] = {}
        self._enabled_for_attendance: Dict[str, bool] = {}
        self._stream_type_by_camera: Dict[str, str] = {}

        # Authorized employee scoping
        self._authorized_employee_ids_by_camera: Dict[str, Set[str]] = {}
        self._authorized_employee_ids_last_fetch_by_camera: Dict[str, float] = {}
        self._authorized_employee_ids_cache_ttl_s = max(
            0.0, float(os.getenv("AUTHORIZED_EMPLOYEE_IDS_CACHE_TTL_S", "10"))
        )

        # Unknown logging debouncer
        self._unknown_log_cooldown_s = max(
            0.0, float(os.getenv("UNKNOWN_LOG_COOLDOWN_S", "15"))
        )
        self._unknown_log_min_visible_s = max(
            0.0, float(os.getenv("UNKNOWN_LOG_MIN_VISIBLE_S", "1.0"))
        )
        self._unknown_last_logged_by_track: Dict[str, float] = {}

        # ERP push queues
        self._erp_queues_by_company: Dict[str, ERPPushQueue] = {}
        self._erp_queue_cfg_by_company: Dict[str, Tuple[str, str, str]] = {}
        self._erp_queue_lock = threading.Lock()
        self._erp_settings_cache_by_company: Dict[str, Dict[str, Any]] = {}
        self._erp_settings_last_fetch_by_company: Dict[str, float] = {}
        self._erp_settings_cache_ttl_s = max(
            0.0, float(os.getenv("ERP_SETTINGS_CACHE_TTL_S", "10"))
        )
        self._erp_timeout_s = float(os.getenv("ERP_TIMEOUT_S", "10"))
        self._erp_api_version = os.getenv("ERP_API_VERSION", "2.0")

        # FAS Anti-Spoofing
        self.fas_gate = registry.get_fas_gate()
        self._fas_skip_laptop = str(os.getenv("FAS_SKIP_LAPTOP", "0")).strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        self._door_unlock_on_recognition = str(
            os.getenv("DOOR_UNLOCK_ON_RECOGNITION", "1")
        ).strip().lower() in ("1", "true", "yes", "on")

    @property
    def default_company_id(self) -> Optional[str]:
        return self._default_company_id

    def shutdown(self) -> None:
        try:
            self._gpu.stop()
        except Exception:
            pass
        try:
            self._db_writer.stop()
        except Exception:
            pass

        with self._erp_queue_lock:
            for q in self._erp_queues_by_company.values():
                try:
                    q.stop()
                except Exception:
                    pass
            self._erp_queues_by_company.clear()
            self._erp_queue_cfg_by_company.clear()

    # --- Backward-compatible Service Delegations ---

    def push_voice_event(
        self,
        *,
        employee_id: str,
        name: str,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
    ) -> int:
        return self.voice_service.push_voice_event(
            employee_id=employee_id,
            name=name,
            camera_id=camera_id,
            camera_name=camera_name,
            company_id=company_id,
        )

    def get_voice_events(
        self,
        *,
        company_id: Optional[str],
        after_seq: int = 0,
        limit: int = 50,
        wait_ms: int = 0,
    ) -> Dict[str, Any]:
        return self.voice_service.get_voice_events(
            company_id=company_id,
            after_seq=after_seq,
            limit=limit,
            wait_ms=wait_ms,
        )

    def set_attendance_enabled(self, camera_id: str, enabled: bool) -> None:
        self._enabled_for_attendance[str(camera_id)] = bool(enabled)

    def is_attendance_enabled(self, camera_id: str) -> bool:
        return bool(self._enabled_for_attendance.get(str(camera_id), True))

    def set_stream_type(self, camera_id: str, stream_type: str) -> None:
        st = str(stream_type or "").strip().lower() or "attendance"
        self._stream_type_by_camera[str(camera_id)] = st

    def get_stream_type(self, camera_id: str) -> str:
        return str(
            self._stream_type_by_camera.get(str(camera_id), "attendance") or "attendance"
        )

    def set_company_for_camera(self, camera_id: str, company_id: Optional[str]) -> None:
        cid = str(camera_id or "").strip()
        comp = str(company_id or "").strip() or None
        if not cid:
            return
        if comp:
            self._company_by_camera[cid] = comp
        else:
            self._company_by_camera.pop(cid, None)

    def set_authorized_employee_ids(
        self, camera_id: str, employee_ids: Optional[List[str]]
    ) -> None:
        cid = str(camera_id or "").strip()
        if not cid:
            return
        if employee_ids is None:
            self._authorized_employee_ids_by_camera.pop(cid, None)
            self._authorized_employee_ids_last_fetch_by_camera.pop(cid, None)
            return

        cleaned = {
            str(emp_id or "").strip()
            for emp_id in employee_ids
            if str(emp_id or "").strip()
        }
        self._authorized_employee_ids_by_camera[cid] = cleaned
        self._authorized_employee_ids_last_fetch_by_camera[cid] = time.time()

    def get_authorized_employee_ids(self, camera_id: str) -> Set[str]:
        cid = str(camera_id or "").strip()
        if not cid:
            return set()
        return set(self._authorized_employee_ids_by_camera.get(cid, set()))

    def _refresh_authorized_employee_ids(
        self, camera_id: str, company_id: Optional[str]
    ) -> Set[str]:
        cid = str(camera_id or "").strip()
        if not cid:
            return set()

        now = time.time()
        ttl_s = float(self._authorized_employee_ids_cache_ttl_s)
        last_fetch = float(
            self._authorized_employee_ids_last_fetch_by_camera.get(cid, 0.0) or 0.0
        )
        cached = self._authorized_employee_ids_by_camera.get(cid)
        if cached is not None and ttl_s > 0.0 and (now - last_fetch) < ttl_s:
            return set(cached)

        comp = str(company_id or "").strip()
        if not comp:
            return set(cached or set())

        try:
            client = self.company_cache.client_for_company(comp)
            payload = client.get_camera_authorized_employees(cid)
            employee_ids = payload.get("employeeIds") or []
            if not isinstance(employee_ids, list):
                employee_ids = []
            cleaned = {
                str(emp_id or "").strip()
                for emp_id in employee_ids
                if str(emp_id or "").strip()
            }
            self._authorized_employee_ids_by_camera[cid] = cleaned
            self._authorized_employee_ids_last_fetch_by_camera[cid] = now
            return set(cleaned)
        except Exception as e:
            self._authorized_employee_ids_last_fetch_by_camera[cid] = now
            if cached is not None:
                return set(cached)
            print(f"[AUTH-SCOPE] load failed company={comp} cam={cid} err={e}")
            return set()

    # --- Vision & Recognition Processing ---

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
        matrix, meta, emp_ids = self.company_cache.get_gallery(company_id)

        if matrix is None or matrix.size == 0:
            return MatchResult(person_id=None, name="Unknown", score=-1.0)

        sims = matrix @ emb
        idx = int(np.argmax(sims))
        sim = float(sims[idx])

        if emp_ids is not None and emp_ids.size > 1 and float(self.cfg.distinct_sim_margin) > 0.0:
            emp_id = int(emp_ids[idx])
            mask = emp_ids != emp_id
            if np.any(mask):
                best_other = float(np.max(sims[mask]))
                if (sim - best_other) < float(self.cfg.distinct_sim_margin):
                    return MatchResult(person_id=None, name="Unknown", score=sim)

        if idx != -1 and idx < len(meta):
            _emp_int, emp_id_str, name = meta[idx]
            return MatchResult(person_id=str(emp_id_str), name=str(name), score=float(sim))

        return MatchResult(person_id=None, name="Unknown", score=float(sim))

    def _get_state(self, camera_id: str) -> CameraScanState:
        cid = str(camera_id)
        st = self._cam_state.get(cid)
        if st is not None:
            return st

        tracker = TrackerManager(self.cfg)
        motion = SceneMotionGate(self.cfg)
        scheduler = AdaptiveScheduler(self.cfg)

        def _match(emb: np.ndarray, *, _cid: str = cid) -> MatchResult:
            return self._match_embedding(_cid, emb)

        recognizer = Recognizer(
            self.cfg, embedder=self._embedder, match_embedding=_match
        )
        st = CameraScanState(
            tracker=tracker,
            motion=motion,
            scheduler=scheduler,
            recognizer=recognizer,
        )
        self._cam_state[cid] = st
        return st

    # --- Unknown Logging & ERP ---

    def _should_log_unknown(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        track: Any,
        now: float,
        treat_known_as_unknown: bool = False,
    ) -> bool:
        if self._unknown_log_cooldown_s <= 0:
            return False

        is_recognized = is_known_employee_id(track.person_id)
        if is_recognized and not treat_known_as_unknown:
            return False

        created = float(getattr(track, "created_at", now) or now)
        if (now - created) < self._unknown_log_min_visible_s:
            return False

        track_id = str(getattr(track, "track_id", "") or "")
        if not track_id:
            return False

        track_key = f"{self.company_cache.gallery_key(company_id)}:{camera_id}:{track_id}"
        last_log = float(self._unknown_last_logged_by_track.get(track_key, 0.0) or 0.0)
        if (now - last_log) < self._unknown_log_cooldown_s:
            return False

        self._unknown_last_logged_by_track[track_key] = now
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
        client = self.company_cache.client_for_company(company_id)

        def _do() -> None:
            try:
                client.create_attendance(
                    employee_id="-1",
                    timestamp=str(timestamp_iso),
                    camera_id=str(camera_id),
                    confidence=float(confidence) if confidence is not None else 0.0,
                    snapshot_path=None,
                    event_type="unknown",
                )
            except Exception as e:
                print(
                    f"[UNKNOWN] write failed company={company_id or 'default'} "
                    f"cam={camera_id} camera={camera_name} err={e}"
                )

        from ..core.runtime_opt import submit_async_io
        submit_async_io(_do)

    def _erp_settings_for_company(
        self, company_id: Optional[str], url_type: str = "attendance"
    ) -> Tuple[Optional[str], Optional[str], Optional[str], bool]:
        cid = str(company_id or "").strip()
        if not cid:
            return None, None, None, True

        key = f"{self.company_cache.gallery_key(cid)}:{url_type}"
        now = time.time()
        ttl = self._erp_settings_cache_ttl_s

        has_cached = key in self._erp_settings_cache_by_company
        cached = self._erp_settings_cache_by_company.get(key, {})
        last_fetch = float(self._erp_settings_last_fetch_by_company.get(key, 0.0))

        if has_cached and (ttl <= 0.0 or (now - last_fetch) < ttl):
            base_url = cached.get("erp_base_url")
            prefix = cached.get("erp_prefix")
            endpoint = cached.get("erp_attendance_endpoint")
            is_active = bool(cached.get("is_active", True))
            return base_url, prefix, endpoint, is_active

        client = self.company_cache.client_for_company(cid)
        try:
            data = client.get_erp_settings(url_type=url_type)
            base_url = data.get("erpBaseUrl") or data.get("erp_base_url")
            prefix = data.get("erpPrefix") or data.get("erp_prefix")
            endpoint = data.get("erpAttendanceEndpoint") or data.get("erp_attendance_endpoint")
            is_active = data.get("isActive")
            if is_active is None:
                is_active = data.get("is_active")
            is_active = True if is_active is None else bool(is_active)

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
                return (
                    cached.get("erp_base_url"),
                    cached.get("erp_prefix"),
                    cached.get("erp_attendance_endpoint"),
                    bool(cached.get("is_active", True)),
                )
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
        map_key = f"{self.company_cache.gallery_key(cid)}:{url_type}"
        is_abs_endpoint = bool(
            configured_endpoint
            and str(configured_endpoint).lower().startswith(("http://", "https://"))
        )
        if not base_url and is_abs_endpoint:
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

        prefix = configured_prefix or ""
        endpoint = configured_endpoint or "/Attendance/manual-attendance"
        cfg_key = (base_url, prefix, endpoint)
        old_queue = None

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

            def _erp_err(e: Exception, job: ERPPushJob) -> None:
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

    def _write_attendance_job(self, job: AttendanceWriteJob) -> None:
        cid = str(job.camera_id)
        company_id = job.company_id
        client = self.company_cache.client_for_company(company_id)
        stream_type = self.get_stream_type(cid)

        # 1) Backend attendance record
        client.create_attendance(
            employee_id=str(job.employee_id),
            timestamp=str(job.timestamp_iso),
            camera_id=cid,
            confidence=float(job.similarity),
            snapshot_path=None,
            event_type=stream_type,
        )

        # 2) Attendance side-effects (ERP, Relays, Voice)
        if stream_type == "attendance":
            attendance_date = datetime.now().strftime("%d/%m/%Y")
            in_time = datetime.now().strftime("%H:%M:%S")

            for q_type, name in [
                ("attendance", "ERP 1"),
                ("attendance_two", "ERP 2"),
                ("attendance_two_log", "ERP 3"),
            ]:
                q = self._erp_queue_for_company(company_id, q_type)
                if q is not None:
                    erp_job = ERPPushJob(
                        attendance_date=attendance_date,
                        emp_id=str(job.employee_id),
                        in_time=in_time,
                        in_location=str(job.camera_name),
                    )
                    ok = q.enqueue(erp_job)
                    print(
                        f"[{name}] queued ok={ok} emp={erp_job.emp_id} date={erp_job.attendance_date} in={erp_job.in_time}"
                    )

            self.door_service.trigger_relay_http(
                cid,
                True,
                employee_id=str(job.employee_id),
                company_id=company_id,
            )
            self.voice_service.push_voice_event(
                employee_id=str(job.employee_id),
                name=str(job.name),
                camera_id=cid,
                camera_name=str(job.camera_name),
                company_id=company_id,
            )

    # --- Main Frame Processing Loop ---

    def process_frame(
        self, frame_bgr: np.ndarray, camera_id: str, name: str
    ) -> np.ndarray:
        cid = str(camera_id)
        camera_name = str(name)
        company_id = self._company_by_camera.get(cid) or self._default_company_id

        # Update gallery cache
        self.company_cache.ensure_gallery(company_id)

        state = self._get_state(cid)
        state.company_id = company_id
        state.frame_idx += 1
        state.frames_total += 1

        enable_attendance = self.is_attendance_enabled(cid)
        annotated = frame_bgr.copy()
        now = time.time()

        # Update tracker
        tracks = state.tracker.update(frame_bgr, now=now)

        # Motion gate
        ignore_boxes: List[Tuple[int, int, int, int]] = []
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

        # Apply detections from GPUArbiter
        events: Set[str] = set()
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
                    for tr in state.tracker.tracks():
                        if tr.track_id in new_id_set:
                            tr.force_recognition_until_ts = max(
                                tr.force_recognition_until_ts,
                                now + float(self.cfg.burst_seconds),
                            )
                for tr in state.tracker.tracks():
                    tr.force_recognition_until_ts = max(
                        tr.force_recognition_until_ts, now + 0.35
                    )
                tracks = state.tracker.tracks()

        # Update scheduler mode
        tracks_attention = len(tracks) >= 2 or (
            len(tracks) == 1
            and bool(
                tracks[0].verify_target_id
                or tracks[0].person_id is None
                or int(tracks[0].stable_id_hits) < int(self.cfg.stable_id_confirmations)
            )
        )
        state.scheduler.update(
            motion_active=motion_active,
            tracks_present=tracks_attention,
            events=events,
            now=now,
        )

        # Submit GPU detection if scheduled
        if state.scheduler.should_run_detection(now=now):
            self._gpu.submit(cid, frame_bgr, ts=now)
            state.scheduler.mark_detection_submitted(now=now)

        # Per-track recognition
        rec_stats = state.recognizer.update_tracks(
            frame_bgr, tracks, state.scheduler, now=now
        )
        state.rec_calls_total += int(rec_stats.get("recognition_calls", 0) or 0)

        h, w = annotated.shape[:2]
        authorized_employee_ids = self._refresh_authorized_employee_ids(cid, company_id)
        has_authorized_scope = len(authorized_employee_ids) > 0
        tracking_boxes = self.box_tracker_service.refresh_bounding_boxes(cid, company_id)

        for tr in tracks:
            x1, y1, x2, y2 = [int(v) for v in tr.bbox]
            recognized_known = is_known_employee_id(tr.person_id)
            known = recognized_known and (
                not has_authorized_scope
                or str(tr.person_id or "").strip() in authorized_employee_ids
            )
            unauthorized_known = recognized_known and not known

            # Door unlock trigger
            if (
                known
                and self._door_unlock_on_recognition
                and enable_attendance
                and self.get_stream_type(cid) == "attendance"
            ):
                self.door_service.trigger_door_unlock(
                    camera_id=cid,
                    employee_id=str(tr.person_id),
                    company_id=company_id,
                    name=str(tr.name),
                    similarity=float(tr.similarity),
                )

            # Draw HUD card (Jetson Orin Nano optimized zero-copy ROI)
            color = ACCENT_KNOWN if known else ACCENT_UNKNOWN
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
            label = tr.name if recognized_known else "Unknown"
            draw_label_card(annotated, label, x1, max(38, y1 - 14), known, scale=0.75)

            # Spatial Bounding Box tracking
            if recognized_known and company_id and tracking_boxes:
                self.box_tracker_service.handle_tracking_for_track(
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

            # Unknown recognition logging
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

            # Attendance qualification
            if enable_attendance and known and company_id:
                self._debouncer.note_seen(
                    company_id=company_id,
                    employee_id=str(tr.person_id),
                    now=now,
                )

            if not (enable_attendance and known and company_id):
                continue

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

            if tr.person_id != str(decision.job.employee_id):
                continue

            # FAS Liveness verification
            if self._fas_skip_laptop and str(cid).startswith("laptop-"):
                fas_ok = True
            else:
                fas_ok, fas_dbg = self.fas_gate.check(
                    camera_id=cid,
                    person_key=str(decision.job.employee_id),
                    frame_bgr=frame_bgr,
                    bbox=(x1, y1, x2, y2),
                    kps=tr.kps,
                )
                if (
                    not fas_ok
                    and isinstance(fas_dbg, dict)
                    and fas_dbg.get("fas") == "need_pose_change"
                    and str(os.getenv("FAS_ALLOW_NO_POSE_FOR_ATTENDANCE", "0")).strip() == "1"
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

        return annotated
