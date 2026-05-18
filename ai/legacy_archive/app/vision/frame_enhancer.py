from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

import cv2
import numpy as np


@dataclass(slots=True)
class EnhancementStats:
    applied: bool = False
    mean_luma: float = 0.0
    contrast: float = 0.0
    gamma: float = 1.0


class AdaptiveFrameEnhancer:
    """
    Lightweight, inference-only low-light enhancement.

    - Applies CLAHE on the luminance channel.
    - Applies gamma lifting only when scene brightness is below target.
    - Optional denoising can be enabled for very noisy streams.
    """

    def __init__(
        self,
        *,
        enabled: bool = True,
        luma_threshold: float = 92.0,
        target_luma: float = 122.0,
        min_contrast: float = 26.0,
        clahe_clip_limit: float = 2.2,
        clahe_tile_grid: int = 8,
        gamma_min: float = 0.45,
        gamma_max: float = 1.0,
        denoise: bool = False,
        denoise_h: float = 3.0,
    ) -> None:
        self.enabled = bool(enabled)
        self.luma_threshold = float(max(0.0, luma_threshold))
        self.target_luma = float(max(0.0, min(255.0, target_luma)))
        self.min_contrast = float(max(0.0, min_contrast))
        self.gamma_min = float(max(0.05, min(2.5, gamma_min)))
        self.gamma_max = float(max(self.gamma_min, min(2.5, gamma_max)))
        self.denoise = bool(denoise)
        self.denoise_h = float(max(1.0, min(12.0, denoise_h)))

        grid = max(2, int(clahe_tile_grid))
        self._clahe = cv2.createCLAHE(
            clipLimit=float(max(1.0, clahe_clip_limit)),
            tileGridSize=(grid, grid),
        )
        self._lut_cache: Dict[int, np.ndarray] = {}

    def _gamma_lut(self, gamma: float) -> np.ndarray:
        gamma = float(max(self.gamma_min, min(self.gamma_max, gamma)))
        key = int(round(gamma * 100.0))
        lut = self._lut_cache.get(key)
        if lut is not None:
            return lut

        g = key / 100.0
        table = np.array(
            [min(255, max(0, int(round((x / 255.0) ** g * 255.0)))) for x in range(256)],
            dtype=np.uint8,
        )
        self._lut_cache[key] = table
        return table

    def enhance(self, frame_bgr: np.ndarray) -> Tuple[np.ndarray, EnhancementStats]:
        if (
            not self.enabled
            or frame_bgr is None
            or not isinstance(frame_bgr, np.ndarray)
            or frame_bgr.size == 0
        ):
            return frame_bgr, EnhancementStats(applied=False)

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        mean_luma = float(np.mean(gray))
        contrast = float(np.std(gray))
        stats = EnhancementStats(
            applied=False,
            mean_luma=mean_luma,
            contrast=contrast,
            gamma=1.0,
        )

        if mean_luma >= self.luma_threshold and contrast >= self.min_contrast:
            return frame_bgr, stats

        ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
        y = self._clahe.apply(ycrcb[:, :, 0])

        cur = float(np.mean(y) / 255.0)
        target = float(self.target_luma / 255.0)
        gamma = 1.0
        if cur > 1e-3 and cur < target:
            gamma = float(np.log(max(1e-3, target)) / np.log(max(1e-3, cur)))
            gamma = float(max(self.gamma_min, min(self.gamma_max, gamma)))
            if abs(gamma - 1.0) > 1e-3:
                y = cv2.LUT(y, self._gamma_lut(gamma))

        ycrcb[:, :, 0] = y
        out = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)

        if self.denoise:
            out = cv2.fastNlMeansDenoisingColored(
                out,
                None,
                h=self.denoise_h,
                hColor=self.denoise_h,
                templateWindowSize=7,
                searchWindowSize=21,
            )

        stats.applied = True
        stats.gamma = float(gamma)
        stats.mean_luma = float(np.mean(y))
        stats.contrast = float(np.std(y))
        return out, stats
