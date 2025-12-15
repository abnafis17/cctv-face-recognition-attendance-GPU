from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Tuple
import numpy as np
from .config import AppConfig

@dataclass
class GalleryCache:
    # employeeId -> (name, angle -> embedding)
    names: Dict[str, str] = field(default_factory=dict)
    angles: Dict[str, Dict[str, np.ndarray]] = field(default_factory=dict)

@dataclass
class AppState:
    cfg: AppConfig
    gallery: GalleryCache = field(default_factory=GalleryCache)

def init_state(cfg: AppConfig) -> AppState:
    return AppState(cfg=cfg)
