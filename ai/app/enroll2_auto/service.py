# app/enroll2_auto/service.py
from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import cv2

from ..runtimes.camera_runtime import CameraRuntime
from ..vision.recognizer import FaceRecognizer
from ..clients.backend_client import BackendClient

from ..utils import (
    now_iso,
    quality_score,
    estimate_head_pose_deg,
    pose_label,
    pose_matches,
)

from .config import Enroll2AutoConfig


def _roi_rect(h: int, w: int, cfg: Enroll2AutoConfig) -> Tuple[int, int, int, int]:
    return (
        int(cfg.roi_x0 * w),
        int(cfg.roi_y0 * h),
        int(cfg.roi_x1 * w),
        int(cfg.roi_y1 * h),
    )


def _bbox_area(b: np.ndarray) -> float:
    return float(max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1]))


def _bbox_center(b: np.ndarray) -> Tuple[float, float]:
    return float((b[0] + b[2]) * 0.5), float((b[1] + b[3]) * 0.5)


def _inside_roi(cx: float, cy: float, roi: Tuple[int, int, int, int]) -> bool:
    x0, y0, x1, y1 = roi
    return x0 <= cx <= x1 and y0 <= cy <= y1


def _instruction_text(step: str) -> str:
    return {
        "front": "Look Straight",
        "right": "Turn Right",
        "left": "Turn Left",
        "up": "Look Up",
        "down": "Look Down",
        "blink": "Blink Your Eyes",
    }.get(step, step)


@dataclass
class Enroll2AutoSession:
    session_id: str
    employee_id: str
    name: str
    camera_id: str
    started_at: str
    status: str = "running"  # running|saving|saved|error|stopped
    error: Optional[str] = None

    current_step: str = "front"
    instruction: str = "Look Straight"
    collected: Dict[str, int] = field(default_factory=dict)

    last_quality: float = 0.0
    last_pose: Optional[str] = None
    last_message: str = ""
    last_update_at: str = field(default_factory=now_iso)

    # overlay state
    overlay_primary_bbox: Optional[Tuple[int, int, int, int]] = None
    overlay_roi_faces: int = 0
    overlay_multi_in_roi: bool = False

    # bbox stability (existing)
    _stable_since: float = 0.0
    _last_center: Optional[Tuple[float, float]] = None

    # NEW: pose stability + gating (fixes "too fast" scanning)
    _pose_ok_since: float = 0.0
    _last_pose_label: Optional[str] = None
    _must_leave_prev_pose: bool = False
    _cooldown_until: float = 0.0

    # blink proxy
    _blink_missing_since: Optional[float] = None
    _blink_done: bool = False


class EnrollmentAutoService2:
    def __init__(
        self,
        camera_rt: CameraRuntime,
        model_name: str = "buffalo_l",
        min_face_size: int = 40,
    ):
        self.camera_rt = camera_rt
        self.cfg = Enroll2AutoConfig()

        # Env-based GPU/CPU remains handled inside FaceRecognizer
        self.rec = FaceRecognizer(
            model_name=model_name, use_gpu=True, min_face_size=min_face_size
        )

        self.client = BackendClient()
        self._lock = threading.Lock()
        self._session: Optional[Enroll2AutoSession] = None
        self._embs: Dict[str, List[np.ndarray]] = {}

        self._run = False
        self._t: Optional[threading.Thread] = None

    def start(self, employee_id: str, name: str, camera_id: str) -> Enroll2AutoSession:
        employee_id = str(employee_id).strip()
        name = str(name).strip()
        camera_id = str(camera_id).strip()
        if not employee_id or not name or not camera_id:
            raise ValueError("employeeId, name, cameraId required")

        # same employee upsert as v1 enrollment
        self.client.upsert_employee(name, employee_id)

        with self._lock:
            sid = f"enroll2_{int(time.time())}"
            self._session = Enroll2AutoSession(
                session_id=sid,
                employee_id=employee_id,
                name=name,
                camera_id=camera_id,
                started_at=now_iso(),
                status="running",
                current_step=self.cfg.steps[0],
                instruction=_instruction_text(self.cfg.steps[0]),
                collected={s: 0 for s in self.cfg.steps},
            )
            self._embs = {s: [] for s in self.cfg.steps}
            self._run = True

        self._t = threading.Thread(target=self._loop, daemon=True)
        self._t.start()
        return self.status()  # type: ignore

    def stop(self) -> bool:
        with self._lock:
            if not self._session:
                return False
            self._session.status = "stopped"
            self._session.last_message = "Stopped"
            self._session.last_update_at = now_iso()
            self._run = False
            return True

    def status(self) -> Optional[Enroll2AutoSession]:
        with self._lock:
            return self._session

    # used by stream overlay without re-inference per client
    def overlay_state(self) -> Dict[str, Any]:
        with self._lock:
            s = self._session
            if not s:
                return {"running": False}
            return {
                "running": s.status == "running",
                "camera_id": s.camera_id,
                "step": s.current_step,
                "instruction": s.instruction,
                "quality": s.last_quality,
                "pose": s.last_pose,
                "message": s.last_message,
                "bbox": s.overlay_primary_bbox,
                "roi_faces": s.overlay_roi_faces,
                "multi": s.overlay_multi_in_roi,
                "status": s.status,
            }

    # ---------------- loop ----------------
    def _loop(self):
        period = 1.0 / max(1.0, float(self.cfg.ai_fps))

        # Defaults if config doesn't contain these (so service.py alone works)
        pose_stable_ms = float(getattr(self.cfg, "pose_stable_ms", 900.0))  # ~1s
        cooldown_sec = float(
            getattr(self.cfg, "cooldown_sec", 0.7)
        )  # prevent instant step jumps

        while True:
            with self._lock:
                if (
                    not self._run
                    or not self._session
                    or self._session.status != "running"
                ):
                    break
                s = self._session

            frame = self.camera_rt.get_frame(s.camera_id)
            if frame is None:
                time.sleep(0.05)
                continue

            primary, roi_dets, roi = self._select_primary(frame)

            # update overlay state
            with self._lock:
                if self._session:
                    self._session.overlay_primary_bbox = (
                        None
                        if primary is None
                        else tuple(int(v) for v in primary.bbox.tolist())
                    )
                    self._session.overlay_roi_faces = len(roi_dets)
                    self._session.overlay_multi_in_roi = len(roi_dets) >= 2

            if primary is None:
                self._msg("No face inside ROI")
                self._blink_proxy(has_face=False)
                time.sleep(period)
                continue

            if len(roi_dets) >= 2:
                self._msg("Multiple faces in ROI. Single face only.")
                time.sleep(period)
                continue

            # Safe step read (no extra status() calls)
            with self._lock:
                if not self._session:
                    break
                step = self._session.current_step

            # blink step (proxy)
            if step == "blink":
                ok = self._blink_proxy(has_face=True)
                if ok:
                    with self._lock:
                        if self._session:
                            self._session.collected["blink"] = 1
                            self._session.last_message = "Blink complete ✅"
                            self._session.last_update_at = now_iso()
                    self._auto_save()
                    break

                self._msg("Blink now (briefly close/occlude then return)")
                time.sleep(period)
                continue

            # quality gate
            q = float(quality_score(primary.bbox, frame))
            if q < self.cfg.min_quality_score:
                self._update(
                    q=q, pose=None, msg=f"Low quality ({q:.1f})", pose_deg=None
                )
                time.sleep(period)
                continue

            # pose estimation + match
            pose_name: Optional[str] = None
            pose_ok: bool = True
            pose_deg: Optional[Tuple[float, float, float]] = None

            if primary.kps is not None:
                pose_deg = estimate_head_pose_deg(primary.kps, frame.shape)
                if pose_deg:
                    yaw, pitch, roll = pose_deg
                    if self.cfg.flip_yaw:
                        yaw = -yaw

                    thresholds = {
                        "yaw_left_deg": self.cfg.yaw_left_deg,
                        "yaw_right_deg": self.cfg.yaw_right_deg,
                        "pitch_up_deg": self.cfg.pitch_up_deg,
                        "pitch_down_deg": self.cfg.pitch_down_deg,
                        "tolerance_deg": self.cfg.tolerance_deg,
                    }

                    pose_name = pose_label(yaw, pitch, thresholds)
                    pose_ok = pose_matches(step, yaw, pitch, thresholds)
                    self._update(
                        q=q, pose=pose_name, msg="", pose_deg=(yaw, pitch, roll)
                    )
            else:
                # If no kps, we cannot do pose gating reliably
                pose_ok = False
                pose_name = None

            now = time.time()

            # --- NEW: cooldown (prevents step jumping in consecutive frames) ---
            with self._lock:
                if self._session and now < float(self._session._cooldown_until or 0.0):
                    self._session.last_quality = q
                    self._session.last_pose = pose_name
                    self._session.last_message = "Hold on…"
                    self._session.last_update_at = now_iso()
                    time.sleep(period)
                    continue

            # --- NEW: must leave previous pose label before next capture ---
            with self._lock:
                if self._session and self._session._must_leave_prev_pose:
                    prev_label = self._session._last_pose_label
                    # if still same label, block until user actually changes head direction
                    if prev_label and pose_name == prev_label:
                        self._session.last_quality = q
                        self._session.last_pose = pose_name
                        self._session.last_message = "Move to the next position…"
                        self._session.last_update_at = now_iso()
                        time.sleep(period)
                        continue
                    # left previous pose successfully
                    self._session._must_leave_prev_pose = False
                    self._session._pose_ok_since = 0.0

            # pose must match current step
            if not pose_ok:
                with self._lock:
                    if self._session:
                        self._session._pose_ok_since = 0.0
                self._update(
                    q=q,
                    pose=pose_name,
                    msg=f"Need {step}, got {pose_name or 'unknown'}",
                    pose_deg=pose_deg,
                )
                time.sleep(period)
                continue

            # --- NEW: pose stability timer (hold correct pose for realistic capture) ---
            with self._lock:
                if not self._session:
                    break
                if self._session._pose_ok_since <= 0.0:
                    self._session._pose_ok_since = now
                    self._session.last_message = "Hold this position…"
                    self._session.last_update_at = now_iso()
                    time.sleep(period)
                    continue

                pose_stable_for_ms = (now - self._session._pose_ok_since) * 1000.0
                if pose_stable_for_ms < pose_stable_ms:
                    self._session.last_message = (
                        f"Hold steady… {int(pose_stable_for_ms)}ms"
                    )
                    self._session.last_update_at = now_iso()
                    time.sleep(period)
                    continue

            # bbox stability (existing) – keep it to avoid blurry/moving captures
            if not self._stable(primary.bbox):
                self._msg("Hold steady…")
                time.sleep(period)
                continue

            # ---------------- AUTO CAPTURE ----------------
            with self._lock:
                if not self._session or self._session.status != "running":
                    break

                self._embs[step].append(primary.emb)
                self._session.collected[step] = len(self._embs[step])
                self._session.last_message = f"Captured {step} ✅"
                self._session.last_update_at = now_iso()

                # advance step
                i = self.cfg.steps.index(step)
                nxt = self.cfg.steps[i + 1] if i < len(self.cfg.steps) - 1 else step
                self._session.current_step = nxt
                self._session.instruction = _instruction_text(nxt)

                # reset stability timers for next step
                self._session._stable_since = 0.0
                self._session._last_center = None

                self._session._pose_ok_since = 0.0

                # NEW: require leaving this pose before accepting the next
                self._session._must_leave_prev_pose = True
                self._session._last_pose_label = pose_name

                # NEW: cooldown to prevent back-to-back step captures
                self._session._cooldown_until = time.time() + cooldown_sec

            time.sleep(period)

    # ---------------- face selection ----------------
    def _select_primary(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        roi = _roi_rect(h, w, self.cfg)
        min_w = self.cfg.min_face_w_frac * w
        max_w = self.cfg.max_face_w_frac * w

        dets = self.rec.detect_and_embed(frame_bgr)
        roi_dets = []
        for d in dets:
            b = d.bbox.astype(float)
            bw = float(b[2] - b[0])
            if bw < min_w or bw > max_w:
                continue
            cx, cy = _bbox_center(b)
            if not _inside_roi(cx, cy, roi):
                continue
            roi_dets.append(d)

        if not roi_dets:
            return None, [], roi

        roi_dets.sort(key=lambda d: _bbox_area(d.bbox), reverse=True)
        return roi_dets[0], roi_dets, roi

    # ---------------- stability ----------------
    def _stable(self, bbox: np.ndarray) -> bool:
        with self._lock:
            s = self._session
            if not s:
                return False
            cx, cy = _bbox_center(bbox)
            now = time.time()
            if s._last_center is None:
                s._last_center = (cx, cy)
                s._stable_since = now
                return False
            px, py = s._last_center
            dist = float(((cx - px) ** 2 + (cy - py) ** 2) ** 0.5)
            s._last_center = (cx, cy)

            if dist <= self.cfg.stable_px:
                if s._stable_since <= 0:
                    s._stable_since = now
                return (now - s._stable_since) * 1000.0 >= float(self.cfg.stable_ms)

            s._stable_since = now
            return False

    # ---------------- blink proxy ----------------
    def _blink_proxy(self, has_face: bool) -> bool:
        with self._lock:
            s = self._session
            if not s:
                return False
            now = time.time()
            if s._blink_done:
                return True

            if has_face:
                if s._blink_missing_since is not None:
                    miss = now - s._blink_missing_since
                    if 0.10 <= miss <= 1.2:
                        s._blink_done = True
                        s._blink_missing_since = None
                        return True
                    s._blink_missing_since = None
                return False

            if s._blink_missing_since is None:
                s._blink_missing_since = now
            return False

    # ---------------- auto save ----------------
    def _auto_save(self):
        with self._lock:
            if not self._session or self._session.status != "running":
                return
            self._session.status = "saving"
            session = self._session
            embs_copy = {k: list(v) for k, v in self._embs.items()}

        saved, skipped = [], []
        for step, vecs in embs_copy.items():
            if step == "blink":
                continue
            if not vecs:
                skipped.append(step)
                continue

            arr = np.stack(vecs, axis=0)
            mean = arr.mean(axis=0).astype(np.float32)
            mean = mean / (np.linalg.norm(mean) + 1e-12)

            # SAME storage table/endpoint as v1, just a wrapper
            self.client.upsert_template_enroll2_auto(
                employee_id=session.employee_id,
                angle=step,
                embedding=mean.tolist(),
                model_name="insightface",
            )
            saved.append(step)

        with self._lock:
            if self._session:
                self._session.status = "saved"
                self._session.last_message = f"Enrollment complete ✅ Saved: {saved}"
                self._session.last_update_at = now_iso()
                self._run = False

    # ---------------- UI helpers ----------------
    def _msg(self, msg: str):
        with self._lock:
            s = self._session
            if not s:
                return
            q = float(s.last_quality)
            pose = s.last_pose
        self._update(q=q, pose=pose, msg=msg, pose_deg=None)

    def _update(
        self,
        q: float,
        pose: Optional[str],
        msg: str,
        pose_deg: Optional[Tuple[float, float, float]],
    ):
        with self._lock:
            if not self._session:
                return
            self._session.last_quality = float(q)
            self._session.last_pose = pose
            if msg:
                self._session.last_message = msg
            self._session.last_update_at = now_iso()
