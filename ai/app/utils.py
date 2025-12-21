from __future__ import annotations
import os
import time
from datetime import datetime
from typing import Optional, Tuple, Any

import numpy as np
import cv2


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


def quality_score(face_bbox, frame_bgr) -> float:
    """Simple quality heuristic: bigger face + sharper image => higher score (0-100)."""
    x1, y1, x2, y2 = [int(v) for v in face_bbox]
    h, w = frame_bgr.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0

    area = (x2 - x1) * (y2 - y1)
    size_ratio = min(1.0, area / float(w * h + 1e-6))

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    fm = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_score = min(1.0, fm / 300.0)  # rough scaling

    score = 100.0 * (0.65 * blur_score + 0.35 * size_ratio)
    return float(max(0.0, min(100.0, score)))


def estimate_head_pose_deg(kps: np.ndarray, frame_shape) -> Optional[Tuple[float, float, float]]:
    """
    Robust head-pose estimate: returns (yaw, pitch, roll) in degrees.

    Uses:
    - solvePnP (ITERATIVE) on 5 landmarks
    - cv2.decomposeProjectionMatrix to get stable Euler angles

    kps expected shape (5,2) in image coords:
      [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if kps is None or np.asarray(kps).shape != (5, 2):
        return None

    image_points = np.asarray(kps, dtype=np.float64)

    # Generic 3D model points (approx) corresponding to kps order:
    # left_eye, right_eye, nose, left_mouth, right_mouth
    model_points = np.array(
        [
            (-30.0, 30.0, -30.0),
            (30.0, 30.0, -30.0),
            (0.0, 0.0, 0.0),
            (-25.0, -30.0, -30.0),
            (25.0, -30.0, -30.0),
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

    try:
        ok, rvec, tvec = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok:
            return None

        rmat, _ = cv2.Rodrigues(rvec)

        # Build projection matrix [R|t]
        proj = np.hstack([rmat, tvec.reshape(3, 1)])

        # decomposeProjectionMatrix gives Euler angles in degrees (rx, ry, rz)
        _c, _r, _t, _rx, _ry, _rz, euler = cv2.decomposeProjectionMatrix(proj)
        # euler: [pitch(x), yaw(y), roll(z)] in degrees (OpenCV convention)
        pitch = float(euler[0])
        yaw = float(euler[1])
        roll = float(euler[2])

        return yaw, pitch, roll
    except Exception:
        return None


def pose_label(yaw: float, pitch: float, cfg_pose: dict) -> str:
    """Classify pose into front/left/right/up/down using config thresholds."""
    yl = float(cfg_pose["yaw_left_deg"])
    yr = float(cfg_pose["yaw_right_deg"])
    pu = float(cfg_pose["pitch_up_deg"])
    pd = float(cfg_pose["pitch_down_deg"])

    # prioritize strong yaw
    if yaw <= yl:
        return "left"
    if yaw >= yr:
        return "right"
    # then pitch
    if pitch <= pu:
        return "up"
    if pitch >= pd:
        return "down"
    return "front"


def pose_matches(required: str, yaw: float, pitch: float, cfg_pose: dict) -> bool:
    tol = float(cfg_pose.get("tolerance_deg", 10))
    yl = float(cfg_pose["yaw_left_deg"])
    yr = float(cfg_pose["yaw_right_deg"])
    pu = float(cfg_pose["pitch_up_deg"])
    pd = float(cfg_pose["pitch_down_deg"])

    if required == "left":
        return yaw <= (yl + tol)
    if required == "right":
        return yaw >= (yr - tol)
    if required == "up":
        return pitch <= (pu + tol)
    if required == "down":
        return pitch >= (pd - tol)

    # front
    return (yl + tol) < yaw < (yr - tol) and (pu + tol) < pitch < (pd - tol)


# -----------------------------
# Browser Enrollment HUD overlay
# -----------------------------
def _put_line(img: np.ndarray, text: str, x: int, y: int, scale: float = 0.6, thick: int = 2):
    # shadow
    cv2.putText(img, text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick + 2, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thick, cv2.LINE_AA)


def draw_enroll_hud(frame_bgr: np.ndarray, session: Any, cfg_angles: list[str]) -> np.ndarray:
    """
    Draws enrollment status text on the frame (so browser shows what manual OpenCV window shows).
    Only called from /camera/stream when an enrollment session is active for that camera.
    """
    img = frame_bgr.copy()

    name = getattr(session, "name", "")
    required = getattr(session, "current_angle", "front")
    collected = getattr(session, "collected", {}) or {}
    last_pose = getattr(session, "last_pose", None)
    last_q = float(getattr(session, "last_quality", 0.0) or 0.0)
    msg = getattr(session, "last_message", "") or ""

    # Count captured angles (angle considered "done" if count > 0)
    done = sum(1 for a in cfg_angles if int(collected.get(a, 0) or 0) > 0)
    total = len(cfg_angles)

    # Top banner
    _put_line(img, f"Enroll: {name} | Required: {required} | {done}/{total}", 12, 30, 0.7, 2)
    _put_line(img, "Use UI buttons: Start -> Capture -> Save (auto-stop) | Cancel clears staged", 12, 55, 0.55, 1)

    # Debug pose line (like your manual script)
    if last_pose is not None:
        _put_line(img, f"pose => {last_pose} | quality={last_q:.1f}", 12, 80, 0.6, 2)
    else:
        _put_line(img, f"quality={last_q:.1f}", 12, 80, 0.6, 2)

    # Message line
    if msg:
        _put_line(img, msg, 12, 105, 0.6, 2)

    return img
