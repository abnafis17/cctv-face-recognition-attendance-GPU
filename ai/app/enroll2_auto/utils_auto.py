from __future__ import annotations
import os
import time
from datetime import datetime
from typing import Optional, Tuple, Any, Dict

import numpy as np
import cv2


# -----------------------------
# Basics
# -----------------------------
def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def l2_normalize(x: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    x = x.astype(np.float32)
    n = float(np.linalg.norm(x) + eps)
    return x / n


def sleep_fps(target_fps: float, t0: float) -> None:
    if target_fps <= 0:
        return
    dt = time.time() - t0
    wait = max(0.0, (1.0 / target_fps) - dt)
    if wait > 0:
        time.sleep(wait)


# -----------------------------
# Quality scoring (0..100)
# -----------------------------
def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def quality_score(face_bbox, frame_bgr) -> float:
    """
    Production-friendly quality metric (0..100).
    Combines:
      - sharpness (Laplacian variance)
      - brightness (avoid under/over exposure)
      - contrast (std-dev)
      - face size ratio (CCTV: reject small/far faces)

    NOTE: this returns 0..100 (same scale as your original utils).
    """
    x1, y1, x2, y2 = [int(v) for v in face_bbox]
    h, w = frame_bgr.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0

    # face size ratio
    area = float(max(1, (x2 - x1) * (y2 - y1)))
    frame_area = float(w * h + 1e-6)
    size_ratio = _clip01(area / frame_area)  # typical good: ~0.03..0.20+

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

    # sharpness (laplacian variance)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    # normalize: 0..1 (tuned for CCTV; adjust if needed)
    sharp = _clip01(lap_var / 350.0)  # 300-500 is usually “sharp enough”

    # brightness and contrast
    mean = float(np.mean(gray))
    std = float(np.std(gray))

    # brightness score peaks around ~110..160 for 8-bit
    # penalize too dark / too bright
    bright = 1.0 - _clip01(abs(mean - 135.0) / 135.0)

    # contrast: std around 35..65 tends to be decent; normalize
    contr = _clip01(std / 60.0)

    # weight blend (sum=1)
    # sharpness is most important; face size next; brightness/contrast help stability
    score01 = (
        0.45 * sharp +
        0.30 * _clip01(size_ratio / 0.12) +  # >=12% of frame face area is strong
        0.15 * bright +
        0.10 * contr
    )

    return float(max(0.0, min(100.0, 100.0 * score01)))


# -----------------------------
# Head pose (yaw, pitch, roll)
# -----------------------------
def estimate_head_pose_deg(
    kps: np.ndarray,
    frame_shape: Tuple[int, int, int],
) -> Optional[Tuple[float, float, float]]:
    """
    Robust head-pose estimate: returns (yaw, pitch, roll) in degrees.

    Uses:
      - solvePnP (ITERATIVE) on 5 landmarks
      - cv2.decomposeProjectionMatrix to get stable Euler angles

    kps expected shape (5,2) image coords:
      [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if kps is None:
        return None
    kps = np.asarray(kps)
    if kps.shape != (5, 2):
        return None

    image_points = np.asarray(kps, dtype=np.float64)

    # generic 3D model points (approx) corresponding to kps order
    model_points = np.array(
        [
            (-30.0, 30.0, -30.0),  # left_eye
            (30.0, 30.0, -30.0),   # right_eye
            (0.0, 0.0, 0.0),       # nose
            (-25.0, -30.0, -30.0), # left_mouth
            (25.0, -30.0, -30.0),  # right_mouth
        ],
        dtype=np.float64,
    )

    h, w = frame_shape[:2]
    focal_length = float(w)
    center = (w / 2.0, h / 2.0)

    camera_matrix = np.array(
        [
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1],
        ],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    def _fallback_from_kps5(points: np.ndarray) -> Optional[Tuple[float, float, float]]:
        # Geometry-only fallback when solvePnP is unstable/unavailable.
        # Produces a bounded, monotonic signal good enough for enrollment gating.
        try:
            le, re, nose, lm, rm = points.astype(np.float32)

            eye_dist = float(np.linalg.norm(re - le))
            if not np.isfinite(eye_dist) or eye_dist < 1.0:
                return None

            mid_eye = (le + re) * 0.5
            mid_mouth = (lm + rm) * 0.5

            # Yaw proxy: nose horizontal offset vs eye distance.
            yaw_proxy = float((nose[0] - mid_eye[0]) / (eye_dist + 1e-6))
            yaw = float(np.clip(yaw_proxy * 180.0, -89.9, 89.9))

            # Pitch proxy: nose vertical offset vs eye->mouth distance.
            face_h = float(mid_mouth[1] - mid_eye[1])
            if not np.isfinite(face_h) or abs(face_h) < 1.0:
                pitch = 0.0
            else:
                pitch_proxy = float((nose[1] - (mid_eye[1] + mid_mouth[1]) * 0.5) / (face_h + 1e-6))
                pitch = float(np.clip(pitch_proxy * 180.0, -89.9, 89.9))

            # Roll from eye line angle.
            roll = float(np.degrees(np.arctan2(float(re[1] - le[1]), float(re[0] - le[0]))))
            roll = float(np.clip(roll, -89.9, 89.9))

            if not np.isfinite([yaw, pitch, roll]).all():
                return None
            return yaw, pitch, roll
        except Exception:
            return None

    try:
        ok, rvec, tvec = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok:
            return _fallback_from_kps5(image_points)

        rmat, _ = cv2.Rodrigues(rvec)
        proj = np.hstack([rmat, tvec.reshape(3, 1)])

        _c, _r, _t, _rx, _ry, _rz, euler = cv2.decomposeProjectionMatrix(proj)
        # OpenCV convention: euler = [pitch(x), yaw(y), roll(z)] degrees
        pitch = float(euler[0])
        yaw = float(euler[1])
        roll = float(euler[2])

        if not np.isfinite([yaw, pitch, roll]).all():
            return None

        # decomposeProjectionMatrix can return valid angles outside [-90, 90] for strong turns.
        # For enrollment gating, we prefer a stable bounded signal over dropping pose entirely.
        def _wrap180(a: float) -> float:
            a = float(a)
            return ((a + 180.0) % 360.0) - 180.0

        yaw = _wrap180(yaw)
        pitch = _wrap180(pitch)
        roll = _wrap180(roll)

        yaw = float(np.clip(yaw, -89.9, 89.9))
        pitch = float(np.clip(pitch, -89.9, 89.9))
        roll = float(np.clip(roll, -89.9, 89.9))

        return yaw, pitch, roll
    except Exception:
        return _fallback_from_kps5(image_points)


# -----------------------------
# Pose label + strict matching
# -----------------------------
def pose_label(yaw: float, pitch: float, cfg_pose: Dict[str, float]) -> str:
    """
    Classify pose into front/left/right/up/down using config thresholds.

    Priority:
      - strong yaw first
      - then pitch
      - else front
    """
    yl = float(cfg_pose["yaw_left_deg"])    # negative threshold (e.g. -35) OR magnitude reference (see below)
    yr = float(cfg_pose["yaw_right_deg"])   # positive threshold (e.g. +35)
    pu = float(cfg_pose["pitch_up_deg"])    # negative threshold (e.g. -20) OR magnitude reference
    pd = float(cfg_pose["pitch_down_deg"])  # positive threshold (e.g. +20)

    # We assume config stores positive magnitudes:
    # left is yaw <= -yl, right is yaw >= +yr, up is pitch <= -pu, down is pitch >= +pd
    # (This matches how most systems define it.)
    yl = abs(yl)
    yr = abs(yr)
    pu = abs(pu)
    pd = abs(pd)

    if yaw <= -yl:
        return "left"
    if yaw >= yr:
        return "right"
    if pitch <= -pu:
        return "up"
    if pitch >= pd:
        return "down"
    return "front"


def pose_matches(required: str, yaw: float, pitch: float, cfg_pose: Dict[str, float]) -> bool:
    """
    STRICT pose matching so the system NEVER advances unless truly in pose.

    Rules:
      - left:  yaw <= -(yl - tol)   (must be clearly left)
      - right: yaw >= +(yr - tol)
      - up:    pitch <= -(pu - tol)
      - down:  pitch >= +(pd - tol)
      - front: |yaw| <= front_yaw and |pitch| <= front_pitch

    front_yaw/front_pitch are derived from tolerance if not provided.
    """
    tol = float(cfg_pose.get("tolerance_deg", 10.0))
    yl = abs(float(cfg_pose["yaw_left_deg"]))
    yr = abs(float(cfg_pose["yaw_right_deg"]))
    pu = abs(float(cfg_pose["pitch_up_deg"]))
    pd = abs(float(cfg_pose["pitch_down_deg"]))

    # strict front bounds (can override in cfg_pose)
    front_yaw = float(cfg_pose.get("front_yaw_deg", tol))
    front_pitch = float(cfg_pose.get("front_pitch_deg", tol))

    if required == "left":
        return yaw <= -(yl - tol)
    if required == "right":
        return yaw >= (yr - tol)
    if required == "up":
        return pitch <= -(pu - tol)
    if required == "down":
        return pitch >= (pd - tol)

    # front
    return abs(yaw) <= front_yaw and abs(pitch) <= front_pitch


# -----------------------------
# Browser HUD overlay (optional)
# -----------------------------
def _put_line(img: np.ndarray, text: str, x: int, y: int, scale: float = 0.6, thick: int = 2):
    cv2.putText(img, text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick + 2, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thick, cv2.LINE_AA)


def draw_enroll_hud(frame_bgr: np.ndarray, session: Any, cfg_angles: list[str]) -> np.ndarray:
    """
    Draw enrollment status on the frame for /camera/stream.
    Compatible with both naming styles:
      - session.current_step OR session.current_angle
    """
    img = frame_bgr.copy()

    name = getattr(session, "name", "")
    required = getattr(session, "current_step", None) or getattr(session, "current_angle", "front")
    collected = getattr(session, "collected", {}) or {}
    last_pose = getattr(session, "last_pose", None)
    last_q = float(getattr(session, "last_quality", 0.0) or 0.0)
    msg = getattr(session, "last_message", "") or ""

    target_per_pose = int(getattr(session, "target_per_pose", 0) or 0)

    done = 0
    for a in cfg_angles:
        c = int(collected.get(a, 0) or 0)
        if target_per_pose > 0:
            if c >= target_per_pose:
                done += 1
        else:
            if c > 0:
                done += 1

    total = len(cfg_angles)

    _put_line(img, f"Enroll: {name} | Required: {required} | {done}/{total}", 12, 30, 0.7, 2)

    if last_pose is not None:
        _put_line(img, f"pose => {last_pose} | quality={last_q:.1f}", 12, 55, 0.6, 2)
    else:
        _put_line(img, f"quality={last_q:.1f}", 12, 55, 0.6, 2)

    if msg:
        _put_line(img, msg, 12, 80, 0.6, 2)

    return img
