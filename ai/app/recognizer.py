from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional
import numpy as np
from insightface.app import FaceAnalysis

from .utils import l2_normalize

@dataclass
class FaceDet:
    bbox: np.ndarray
    emb: np.ndarray
    kps: Optional[np.ndarray]

class FaceRecognizer:
    def __init__(self, model_name: str = "buffalo_l", use_gpu: bool = True, min_face_size: int = 40):
        ctx_id = 0 if use_gpu else -1
        self.min_face_size = int(min_face_size)
        self.app = FaceAnalysis(name=model_name, providers=None)
        self.app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    def detect_and_embed(self, frame_bgr: np.ndarray) -> List[FaceDet]:
        faces = self.app.get(frame_bgr)
        out: List[FaceDet] = []
        for f in faces:
            bbox = f.bbox.astype(np.float32)
            w = float(bbox[2] - bbox[0])
            h = float(bbox[3] - bbox[1])
            if min(w, h) < self.min_face_size:
                continue
            emb = l2_normalize(f.embedding.astype(np.float32))
            kps = getattr(f, "kps", None)
            out.append(FaceDet(bbox=bbox, emb=emb, kps=kps))
        return out

def match_gallery(emb: np.ndarray, gallery_embs: np.ndarray) -> Tuple[int, float]:
    if gallery_embs.size == 0:
        return -1, -1.0
    sims = gallery_embs @ emb
    i = int(np.argmax(sims))
    return i, float(sims[i])
