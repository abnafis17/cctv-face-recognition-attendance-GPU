from __future__ import annotations

import cv2
import numpy as np
from typing import Tuple

LABEL_FONT = cv2.FONT_HERSHEY_TRIPLEX
ACCENT_KNOWN = (80, 200, 80)    # green for known
ACCENT_UNKNOWN = (40, 40, 220)  # red for unknown
CARD_KNOWN = (26, 60, 32)       # dark green card
CARD_UNKNOWN = (50, 30, 30)     # dark red card


def draw_label_card(
    img: np.ndarray,
    text: str,
    x: int,
    y: int,
    known: bool,
    scale: float = 1.05,
) -> None:
    """
    Draw HUD label with accent bar and semi-transparent background card.
    Optimized for NVIDIA Jetson Orin Nano: Uses sub-rectangle ROI blending
    instead of cloning the full frame image buffer.
    """
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

    if x1 > x0 and y1 > y0:
        roi = img[y0:y1, x0:x1]
        overlay_roi = roi.copy()
        cv2.rectangle(overlay_roi, (0, 0), (x1 - x0, y1 - y0), bg_color, -1)
        cv2.rectangle(overlay_roi, (0, 0), (min(accent_w, x1 - x0), y1 - y0), accent, -1)
        cv2.addWeighted(overlay_roi, 0.7, roi, 0.3, 0, roi)

    cv2.putText(img, text, (x, y), font, scale, (0, 0, 0), thickness + 3, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def draw_bounding_box(
    img: np.ndarray,
    bbox: Tuple[int, int, int, int],
    known: bool,
    thickness: int = 2,
) -> None:
    """Draw bounding box with accent color."""
    x0, y0, x1, y1 = bbox
    color = ACCENT_KNOWN if known else ACCENT_UNKNOWN
    cv2.rectangle(img, (x0, y0), (x1, y1), color, thickness)
