from __future__ import annotations
from typing import Optional, Tuple, Dict
import cv2
import numpy as np


def draw_enroll2_auto_hud(
    frame_bgr: np.ndarray,
    roi: Tuple[int, int, int, int],
    primary_bbox: Optional[Tuple[int, int, int, int]],
    hud: Dict[str, str],
) -> np.ndarray:
    img = frame_bgr.copy()
    h, w = img.shape[:2]
    x0, y0, x1, y1 = roi

    # ROI guide
    cv2.rectangle(img, (x0, y0), (x1, y1), (30, 200, 255), 2)
    cv2.putText(
        img,
        "ENROLL AUTO: Place face inside box",
        (x0, max(24, y0 - 10)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (30, 200, 255),
        2,
        cv2.LINE_AA,
    )

    # Only one bbox (closest)
    if primary_bbox is not None:
        px1, py1, px2, py2 = primary_bbox
        cv2.rectangle(img, (px1, py1), (px2, py2), (80, 220, 80), 3)

    # HUD (top-left)
    y = 30
    for k, v in hud.items():
        text = f"{k}: {v}"
        cv2.putText(
            img, text, (12, y), cv2.FONT_HERSHEY_DUPLEX, 0.8, (0, 0, 0), 4, cv2.LINE_AA
        )
        cv2.putText(
            img,
            text,
            (12, y),
            cv2.FONT_HERSHEY_DUPLEX,
            0.8,
            (245, 245, 245),
            2,
            cv2.LINE_AA,
        )
        y += 26

    # Footer
    cv2.putText(
        img,
        "Single face only. Auto-captures when pose + quality + stable.",
        (12, h - 16),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 0, 0),
        4,
        cv2.LINE_AA,
    )
    cv2.putText(
        img,
        "Single face only. Auto-captures when pose + quality + stable.",
        (12, h - 16),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (245, 245, 245),
        2,
        cv2.LINE_AA,
    )

    return img
