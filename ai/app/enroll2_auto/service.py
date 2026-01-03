# ai/app/enroll2_auto/service.py
from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import cv2

from ..runtimes.camera_runtime import CameraRuntime
from .recognizer_auto import FaceRecognizerAuto as FaceRecognizer
from ..clients.backend_client import BackendClient

# ✅ new utils used by auto enrollment
from .utils_auto import (
    now_iso,
    quality_score,
    estimate_head_pose_deg,
    pose_label,
)

from .config import Enroll2AutoConfig


def _roi_rect(h: int, w: int, cfg: Enroll2AutoConfig) -> Tuple[int, int, int, int]:
    return (
        int(cfg.roi_x0 * w),
        int(cfg.roi_y0 * h),
        int(cfg.roi_x1 * w),
        int(cfg.roi_y1 * h),
    )


def _instruction_text(step: str) -> str:
    """Short, Face-ID-style on-screen prompts."""
    return {
        "front": "Look straight ahead",
        "left": "Turn your head left",
        "right": "Turn your head right",
        "up": "Look up",
        "down": "Look down",
        "blink": "Blink",
        "liveness": "Blink",
    }.get(step, step)


WELCOME_VOICE = (
    "Let\'s set up face enrollment. Position your face in the frame.",
)

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

    overlay_primary_bbox: Optional[Tuple[int, int, int, int]] = None
    overlay_roi_faces: int = 0
    overlay_multi_in_roi: bool = False

    # ---------- voice events (frontend plays when voice_seq changes) ----------
    voice_seq: int = 0
    voice_text: str = ""
    _voice_last_at: float = 0.0
    _voice_last_text: str = ""

    # bbox stability
    _stable_since: float = 0.0
    _last_center: Optional[Tuple[float, float]] = None

    # pose hold stability
    _pose_ok_since: float = 0.0

    # require leaving previous pose label before allowing next step
    _must_leave_prev_pose: bool = False
    _last_pose_label: Optional[str] = None

    # cooldown
    _cooldown_until: float = 0.0


    # capture throttling (FaceID-style)
    _last_capture_at: float = 0.0
    _last_capture_pose: Optional[str] = None

    # baseline for relative pose
    _baseline_yaw: Optional[float] = None
    _baseline_pitch: Optional[float] = None

    # track instruction voice per step to avoid repeats
    _last_step_voice: Optional[str] = None


class EnrollmentAutoService2:
    """
    Auto-enrollment service:
    - ROI + size gating
    - single face only
    - quality gate
    - comfortable front (near-front)
    - left/right/up/down based on DELTA from captured front baseline
    - hold pose + bbox stable + cooldown
    - captures multiple frames per pose and averages embeddings
    """

    def __init__(
        self,
        camera_rt: CameraRuntime,
        model_name: str = "buffalo_l",
        min_face_size: int = 40,
    ):
        self.camera_rt = camera_rt
        self.cfg = Enroll2AutoConfig()

        self.rec = FaceRecognizer(
            model_name=model_name, use_gpu=True, min_face_size=min_face_size
        )

        self.client = BackendClient()
        self._lock = threading.Lock()
        self._session: Optional[Enroll2AutoSession] = None
        self._embs: Dict[str, List[np.ndarray]] = {}
        self._run = False
        self._thread: Optional[threading.Thread] = None


    def _voice_for_step(self, step: str) -> str:
        # Calm, iPhone-style voice prompts.
        return {
            "front": "Keep your face in the frame. Hold still.",
            "left": "Slowly turn your head to the left.",
            "right": "Now slowly turn your head to the right.",
            "up": "Now look up.",
            "down": "Now look down.",
        }.get(step, "Please follow the on-screen instruction.")

    def _say_instruction_for_step(self, step: str, *, force: bool = False) -> None:
        """
        Speak the instruction for a step only once per step unless forced.
        Prevents the loop from repeating the same prompt.
        """
        with self._lock:
            s = self._session
            if not s:
                return
            if not force and s._last_step_voice == step:
                return
            s._last_step_voice = step

        self._say(self._voice_for_step(step), force=force)

    def _say(self, text: str, *, force: bool = False) -> None:
        if not text:
            return
        with self._lock:
            s = self._session
            if not s:
                return
            now = time.time()
            min_gap = float(getattr(self.cfg, "voice_min_interval_sec", 1.4))

            if not force:
                # avoid repeating the same sentence too often
                if text == s._voice_last_text and (now - s._voice_last_at) < min_gap:
                    return
                # avoid rapid chatter
                if (now - s._voice_last_at) < min_gap:
                    return

            s.voice_text = text
            s.voice_seq += 1
            s._voice_last_text = text
            s._voice_last_at = now
            s.last_update_at = now_iso()

    def start(self, employee_id: str, name: str, camera_id: str) -> Enroll2AutoSession:
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

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

        # initial instruction voice
        self._say(WELCOME_VOICE, force=True)
        self._say_instruction_for_step(self._session.current_step, force=True)

        return self._session

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

    def overlay_state(self) -> Dict[str, Any]:
        with self._lock:
            s = self._session
            if not s:
                return {"running": False}
            return {
                "running": s.status == "running",
                "status": s.status,
                "employee_id": s.employee_id,
                "name": s.name,
                "camera_id": s.camera_id,
                "step": s.current_step,
                "instruction": s.instruction,
                "collected": dict(s.collected),
                "last_quality": s.last_quality,
                "last_pose": s.last_pose,
                "last_message": s.last_message,
                "last_update_at": s.last_update_at,
                "overlay_primary_bbox": s.overlay_primary_bbox,
                "overlay_roi_faces": s.overlay_roi_faces,
                "overlay_multi_in_roi": s.overlay_multi_in_roi,
                # aliases for legacy overlay consumers
                "bbox": s.overlay_primary_bbox,
                "quality": s.last_quality,
                "pose": s.last_pose,
                "message": s.last_message,
                "roi_faces": s.overlay_roi_faces,
                "voice_seq": int(getattr(s, "voice_seq", 0)),
                "voice_text": str(getattr(s, "voice_text", "")),
                "target_per_pose": int(getattr(self.cfg, "target_per_pose", 5)),
                "baseline_yaw": s._baseline_yaw,
                "baseline_pitch": s._baseline_pitch,
            }

    def _loop(self):
        """Face-ID style auto-capture.

        - As soon as ONE face is inside the ROI, we start capturing embeddings.
        - We DO NOT require long 'hold still' timers that can feel like a hang.
        - We bucket captures into: front/left/right/up/down based on yaw/pitch deltas
          relative to the baseline captured at the first valid 'front'.
        """

        period = 1.0 / max(1.0, float(getattr(self.cfg, "ai_fps", 6.0)))

        target_per_pose = int(getattr(self.cfg, "target_per_pose", 5))
        max_per_pose = int(getattr(self.cfg, "max_per_pose", 10))

        min_q = float(getattr(self.cfg, "min_quality_score", 45.0))

        # how often to accept a capture (seconds)
        capture_interval = float(getattr(self.cfg, "capture_interval_sec", 0.25))

        # thresholds (degrees)
        fa_y = float(getattr(self.cfg, "front_accept_yaw_deg", 18.0))
        fa_p = float(getattr(self.cfg, "front_accept_pitch_deg", 15.0))

        # Once "front" is collected, shrink the "front" bucket so side turns don't get stuck as "front".
        fb_y = float(getattr(self.cfg, "front_bucket_yaw_deg", 12.0))
        fb_p = float(getattr(self.cfg, "front_bucket_pitch_deg", 12.0))

        dy_left = float(getattr(self.cfg, "delta_yaw_left_deg", 22.0))
        dy_right = float(getattr(self.cfg, "delta_yaw_right_deg", 22.0))
        dp_up = float(getattr(self.cfg, "delta_pitch_up_deg", 14.0))
        dp_down = float(getattr(self.cfg, "delta_pitch_down_deg", 14.0))

        tol = float(getattr(self.cfg, "delta_tolerance_deg", 12.0))
        allow_unknown_front = bool(getattr(self.cfg, "allow_unknown_pose_front", True))
        flip_yaw = bool(getattr(self.cfg, "flip_yaw", False))

        def next_required_step(collected: Dict[str, int]) -> Optional[str]:
            for s in self.cfg.steps:
                if int(collected.get(s, 0) or 0) < target_per_pose:
                    return s
            return None

        def set_current_step(step: str):
            # Keep UI + voice aligned to the next missing capture.
            speak = False
            with self._lock:
                if not self._session:
                    return
                if self._session.current_step != step:
                    self._session.current_step = step
                    self._session.instruction = _instruction_text(step)
                    self._session.last_update_at = now_iso()
                    speak = True
            if speak:
                # Trigger voice after releasing the lock to avoid self-deadlock.
                self._say_instruction_for_step(step)

        while True:
            with self._lock:
                if not self._run or not self._session or self._session.status != "running":
                    break
                cam_id = self._session.camera_id

            frame_bgr = self.camera_rt.get_frame(camera_id=cam_id)
            if frame_bgr is None:
                self._msg("Waiting for camera…")
                time.sleep(period)
                continue

            primary, roi_faces, multi_in_roi = self._select_primary(frame_bgr)

            with self._lock:
                if self._session:
                    self._session.overlay_roi_faces = roi_faces
                    self._session.overlay_multi_in_roi = multi_in_roi
                    self._session.overlay_primary_bbox = (
                        tuple(map(int, primary.bbox)) if primary is not None else None
                    )

            # Need exactly ONE face inside ROI
            if primary is None:
                if multi_in_roi:
                    self._msg("Only one face in the box")
                    self._say("Please make sure only one face is inside the frame.")
                else:
                    self._msg("Position your face in the box")
                    self._say("Position your face in the frame.")
                time.sleep(period)
                continue

            # Quality gate (soft + friendly)
            q = float(quality_score(primary.bbox, frame_bgr))
            if q < min_q:
                self._update(q=q, pose=None, msg="Hold still, improve lighting", pose_deg=None)
                self._say("Hold still. Improve lighting if needed.")
                time.sleep(period)
                continue

            # Pose
            pose_deg = None
            if primary.kps is not None:
                pose_deg = estimate_head_pose_deg(primary.kps, frame_bgr.shape)

            if pose_deg is None:
                yaw = pitch = roll = 0.0
            else:
                yaw, pitch, roll = map(float, pose_deg)

            if flip_yaw:
                yaw = -yaw

            # Baseline (first good front)
            with self._lock:
                if self._session and self._session._baseline_yaw is None:
                    # Only set baseline when we have a stable-ish front (or when pose is missing but allowed)
                    if pose_deg is not None and (abs(yaw) <= fa_y and abs(pitch) <= fa_p):
                        self._session._baseline_yaw = float(yaw)
                        self._session._baseline_pitch = float(pitch)
                    elif pose_deg is None and allow_unknown_front:
                        self._session._baseline_yaw = 0.0
                        self._session._baseline_pitch = 0.0

            with self._lock:
                if not self._session:
                    break
                base_y = float(self._session._baseline_yaw or 0.0)
                base_p = float(self._session._baseline_pitch or 0.0)
                collected = dict(self._session.collected or {})

            dy = yaw - base_y
            dp = pitch - base_p

            # UI pose label (for debug tiles)
            ui_pose = "front"
            if dy <= -(dy_left):
                ui_pose = "left"
            elif dy >= (dy_right):
                ui_pose = "right"
            elif dp <= -(dp_up):
                ui_pose = "up"
            elif dp >= (dp_down):
                ui_pose = "down"

            # Capture bucket (stricter than UI label)
            bucket: Optional[str] = None
            if pose_deg is None:
                if allow_unknown_front:
                    bucket = "front"
            else:
                need_front = int(collected.get("front", 0) or 0) < target_per_pose
                front_y = fa_y if need_front else min(fa_y, fb_y)
                front_p = fa_p if need_front else min(fa_p, fb_p)

                if abs(dy) <= front_y and abs(dp) <= front_p:
                    bucket = "front"
                elif dy <= -max(0.0, dy_left - tol):
                    bucket = "left"
                elif dy >= max(0.0, dy_right - tol):
                    bucket = "right"
                elif dp <= -max(0.0, dp_up - tol):
                    bucket = "up"
                elif dp >= max(0.0, dp_down - tol):
                    bucket = "down"

            # Guide user to the next missing step (FaceID feel)
            nxt = next_required_step(collected)
            if nxt is not None:
                set_current_step(nxt)

            # Update status (no noisy ms counters)
            self._update(q=q, pose=ui_pose, msg="", pose_deg=pose_deg)

            # If we don't have a valid bucket yet, keep guiding (no hang)
            if bucket is None or nxt is None:
                self._msg("Move your head slowly")
                if nxt is not None:
                    self._say_instruction_for_step(nxt)
                time.sleep(period)
                continue

            # If this bucket is already complete, keep guiding to next
            if int(collected.get(bucket, 0) or 0) >= target_per_pose:
                self._msg("Good. Keep going…")
                time.sleep(period)
                continue

            # Throttle capture rate (prevents duplicates + stabilizes)
            now = time.time()
            with self._lock:
                if not self._session or self._session.status != "running":
                    break
                last_cap = float(getattr(self._session, "_last_capture_at", 0.0) or 0.0)
                if (now - last_cap) < capture_interval:
                    self._session.last_quality = q
                    self._session.last_pose = ui_pose
                    self._session.last_message = "Hold steady…"
                    self._session.last_update_at = now_iso()
                    time.sleep(period)
                    continue

                # store embedding
                if len(self._embs[bucket]) < max_per_pose:
                    self._embs[bucket].append(primary.emb)

                got = len(self._embs[bucket])
                self._session.collected[bucket] = got
                self._session.last_quality = q
                self._session.last_pose = ui_pose
                self._session.last_message = f"Captured ✓ ({got}/{target_per_pose})"
                self._session.last_update_at = now_iso()

                # record capture time
                self._session._last_capture_at = now
                self._session._last_capture_pose = bucket

            # Finished?
            with self._lock:
                if not self._session:
                    break
                done = all(int(self._session.collected.get(s, 0) or 0) >= target_per_pose for s in self.cfg.steps)

            if done:
                self._auto_save()
                break

            time.sleep(period)
    def _select_primary(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        roi = _roi_rect(h, w, self.cfg)
        min_w = self.cfg.min_face_w_frac * w
        max_w = self.cfg.max_face_w_frac * w

        dets = self.rec.detect_and_embed(frame_bgr)
        if not dets:
            return None, 0, False

        x0, y0, x1, y1 = roi
        in_roi = []
        for d in dets:
            bx0, by0, bx1, by1 = d.bbox.astype(int).tolist()
            cx = (bx0 + bx1) * 0.5
            cy = (by0 + by1) * 0.5
            bw = (bx1 - bx0)

            if not (x0 <= cx <= x1 and y0 <= cy <= y1):
                continue
            if bw < min_w or bw > max_w:
                continue
            in_roi.append(d)

        if not in_roi:
            return None, 0, False
        if len(in_roi) > 1:
            return None, len(in_roi), True
        return in_roi[0], len(in_roi), False
    def _stable(self, bbox: np.ndarray) -> bool:
        # Legacy method kept for compatibility; FaceID-style capture does not require it.
        return True

    def _auto_save(self):
        with self._lock:
            s = self._session
            if not s:
                return
            employee_id = s.employee_id

            embeddings: Dict[str, np.ndarray] = {}
            for step, vecs in self._embs.items():
                if not vecs:
                    continue
                arr = np.stack(vecs, axis=0)
                mean = arr.mean(axis=0)
                n = float(np.linalg.norm(mean) + 1e-12)
                mean = mean / n
                embeddings[step] = mean.astype(np.float32)

        try:
            self.client.save_employee_embeddings(employee_id, embeddings)
            with self._lock:
                if self._session:
                    self._session.status = "saved"
                    self._session.last_message = "Enrollment saved ✅"
                    self._session.last_update_at = now_iso()
        except Exception as e:
            with self._lock:
                if self._session:
                    self._session.status = "error"
                    self._session.error = str(e)
                    self._session.last_message = "Save failed"
                    self._session.last_update_at = now_iso()
    def _msg(self, msg: str):
        # Update message only (do not reset quality/pose tiles in UI)
        with self._lock:
            if not self._session:
                return
            self._session.last_message = msg
            self._session.last_update_at = now_iso()

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
