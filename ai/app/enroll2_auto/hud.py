# app/enroll2_auto/hud.py
from __future__ import annotations

from typing import Optional, Tuple, Dict, Any
import cv2
import numpy as np


def _put_text_shadow(
    img: np.ndarray,
    text: str,
    org: Tuple[int, int],
    scale: float = 0.7,
    color: Tuple[int, int, int] = (255, 255, 255),
    thick: int = 2,
    font=cv2.FONT_HERSHEY_SIMPLEX,
):
    x, y = org
    cv2.putText(img, text, (x + 1, y + 1), font, scale, (0, 0, 0), thick + 3, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), font, scale, color, thick, cv2.LINE_AA)


def _rounded_rect(img: np.ndarray, x1: int, y1: int, x2: int, y2: int, radius: int, color: Tuple[int, int, int], alpha: float = 0.55):
    """
    Simple rounded rectangle fill using an overlay.
    """
    overlay = img.copy()
    # center rect
    cv2.rectangle(overlay, (x1 + radius, y1), (x2 - radius, y2), color, -1)
    cv2.rectangle(overlay, (x1, y1 + radius), (x2, y2 - radius), color, -1)
    # corners
    cv2.circle(overlay, (x1 + radius, y1 + radius), radius, color, -1)
    cv2.circle(overlay, (x2 - radius, y1 + radius), radius, color, -1)
    cv2.circle(overlay, (x1 + radius, y2 - radius), radius, color, -1)
    cv2.circle(overlay, (x2 - radius, y2 - radius), radius, color, -1)

    cv2.addWeighted(overlay, alpha, img, 1.0 - alpha, 0, img)


def _status_color(hud: Dict[str, str]) -> Tuple[int, int, int]:
    """
    Pick a UI color based on message/state.
    We keep it simple and robust based on text fields.
    """
    msg = (hud.get("message") or hud.get("msg") or "").lower()
    status = (hud.get("status") or "").lower()
    multi = (hud.get("multi_face") or hud.get("multi") or "").lower()

    if status in ("error", "failed"):
        return (40, 40, 220)  # red-ish
    if "multiple" in msg or "multi" in msg or "single face" in msg or multi in ("1", "true", "yes"):
        return (40, 170, 255)  # amber
    if "need" in msg or "hold" in msg or "move" in msg or "place" in msg:
        return (40, 170, 255)  # amber
    if "captured" in msg or "saved" in msg or "✅" in msg:
        return (80, 220, 80)   # green
    if status in ("running", "saving", "saved"):
        return (80, 220, 80)
    return (30, 200, 255)  # cyan default


def _format_progress(hud: Dict[str, str]) -> str:
    """
    Try to render progress like:
      front 3/7 | left 0/7 | right 0/7 | up 0/7 | down 0/7
    without requiring caller changes.
    """
    target = hud.get("target_per_pose") or hud.get("target") or ""
    # Most callers pass collected as a string; try to parse common patterns:
    # - "front=3,left=0,right=0,up=0,down=0"
    # - "{'front':3,'left':0,...}"
    collected_raw = hud.get("collected") or ""

    if not collected_raw:
        return ""

    # normalize target
    try:
        t = int(str(target)) if str(target).strip() else 0
    except Exception:
        t = 0

    # parse counts from very forgiving formats
    counts: Dict[str, int] = {}
    s = str(collected_raw).strip()

    # attempt dict-like parse safely
    if s.startswith("{") and s.endswith("}"):
        # super-safe manual parse (no eval)
        inner = s[1:-1].strip()
        parts = [p.strip() for p in inner.split(",") if p.strip()]
        for p in parts:
            if ":" not in p:
                continue
            k, v = p.split(":", 1)
            k = k.strip().strip("'").strip('"')
            v = v.strip().strip("'").strip('"')
            try:
                counts[k] = int(float(v))
            except Exception:
                continue
    else:
        # parse "a=1,b=2" style
        parts = [p.strip() for p in s.replace(";", ",").split(",") if p.strip()]
        for p in parts:
            if "=" not in p:
                continue
            k, v = p.split("=", 1)
            k = k.strip()
            v = v.strip()
            try:
                counts[k] = int(float(v))
            except Exception:
                continue

    if not counts:
        return ""

    order = ["front", "left", "right", "up", "down"]
    chunks = []
    for a in order:
        if a in counts:
            if t > 0:
                chunks.append(f"{a} {counts[a]}/{t}")
            else:
                chunks.append(f"{a} {counts[a]}")
    return " | ".join(chunks)


def draw_enroll2_auto_hud(
    frame_bgr: np.ndarray,
    roi: Tuple[int, int, int, int],
    primary_bbox: Optional[Tuple[int, int, int, int]],
    hud: Dict[str, str],
) -> np.ndarray:
    """
    Production HUD overlay for auto enrollment.

    Signature unchanged from your original:
      (frame_bgr, roi, primary_bbox, hud) -> frame_bgr

    `hud` should include (typical from overlay_state()):
      - step / instruction / status / message / last_pose / last_quality
      - collected (stringified dict or "front=3,left=0,...")
      - target_per_pose (optional)
      - overlay_roi_faces / overlay_multi_in_roi (optional)
    """
    img = frame_bgr.copy()
    h, w = img.shape[:2]
    x0, y0, x1, y1 = roi

    # Colors
    accent = _status_color(hud)

    # ROI guide
    ROI_YELLOW = (0, 255, 255)  # BGR yellow
    cv2.rectangle(img, (x0, y0), (x1, y1), ROI_YELLOW, 2)
    _put_text_shadow(
        img,
        "ENROLL AUTO: keep face inside box",
        (x0, max(26, y0 - 10)),
        scale=0.7,
        color=ROI_YELLOW,
        thick=2,
        font=cv2.FONT_HERSHEY_DUPLEX,
    )

    # Primary bbox
    if primary_bbox is not None:
        px1, py1, px2, py2 = primary_bbox
        FACE_BLUE = (255, 0, 0)  # BGR blue
        cv2.rectangle(img, (px1, py1), (px2, py2), FACE_BLUE, 3)

    # -------- Top banner pill --------
    step = hud.get("step") or hud.get("required") or ""
    instruction = hud.get("instruction") or ""
    status = hud.get("status") or ""
    msg = hud.get("message") or hud.get("msg") or hud.get("last_message") or ""

    banner_text = f"{status.upper() if status else 'ENROLL'}  •  {step.upper() if step else ''}  {('— ' + instruction) if instruction else ''}"
    bx1, by1 = 12, 12
    bx2, by2 = min(w - 12, 12 + 980), 58
    _rounded_rect(img, bx1, by1, bx2, by2, radius=14, color=(0, 0, 0), alpha=0.35)
    _rounded_rect(img, bx1, by1, bx2, by2, radius=14, color=accent, alpha=0.18)
    _put_text_shadow(img, banner_text.strip(), (bx1 + 14, by1 + 32), scale=0.78, color=(245, 245, 245), thick=2)

    # -------- Stats box --------
    last_pose = hud.get("last_pose") or hud.get("pose") or ""
    last_q = hud.get("last_quality") or hud.get("quality") or ""
    roi_faces = hud.get("overlay_roi_faces") or hud.get("roi_faces") or ""
    multi_in_roi = hud.get("overlay_multi_in_roi") or hud.get("multi_in_roi") or ""

    sx1, sy1 = 12, 72
    sx2, sy2 = 420, 176
    _rounded_rect(img, sx1, sy1, sx2, sy2, radius=16, color=(0, 0, 0), alpha=0.35)

    y = sy1 + 34
    _put_text_shadow(img, f"Pose: {last_pose}", (sx1 + 14, y), scale=0.72, color=(245, 245, 245), thick=2)
    y += 30
    _put_text_shadow(img, f"Quality: {last_q}", (sx1 + 14, y), scale=0.72, color=(245, 245, 245), thick=2)
    y += 30

    # Face count hints if provided
    if roi_faces != "":
        _put_text_shadow(img, f"Faces in ROI: {roi_faces}", (sx1 + 14, y), scale=0.68, color=(245, 245, 245), thick=2)
        y += 28
    if str(multi_in_roi).lower() in ("1", "true", "yes"):
        _put_text_shadow(img, "Multiple faces detected — show only one face", (sx1 + 14, y), scale=0.62, color=(40, 170, 255), thick=2)

    # -------- Progress line (bottom of banner) --------
    progress = _format_progress(hud)
    if progress:
        _rounded_rect(img, 12, 190, min(w - 12, 12 + 980), 230, radius=14, color=(0, 0, 0), alpha=0.30)
        _put_text_shadow(img, progress, (26, 218), scale=0.62, color=(245, 245, 245), thick=2)

    # -------- Message line --------
    if msg:
        # message box near bottom
        mx1, my1 = 12, h - 70
        mx2, my2 = min(w - 12, 12 + 1200), h - 16
        _rounded_rect(img, mx1, my1, mx2, my2, radius=14, color=(0, 0, 0), alpha=0.35)
        _rounded_rect(img, mx1, my1, mx2, my2, radius=14, color=accent, alpha=0.14)
        _put_text_shadow(img, msg, (mx1 + 14, my1 + 36), scale=0.70, color=(245, 245, 245), thick=2)

    return img
