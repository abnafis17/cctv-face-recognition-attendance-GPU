from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np
from insightface.app import FaceAnalysis

from ..core.config import env_bool, env_float, env_int, env_str, pick_ort_providers
from ..utils import l2_normalize
from ..vision.insightface_pack import normalize_model_pack_layout


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _to_kps5(kps_any) -> Optional[np.ndarray]:
    """
    Normalize landmarks to (5,2) float32 in the order expected by utils_auto.estimate_head_pose_deg:
      [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if kps_any is None:
        return None
    kps = np.asarray(kps_any)
    if kps.size == 0:
        return None

    if kps.shape == (5, 2):
        return kps.astype(np.float32, copy=False)

    if kps.ndim == 1 and kps.shape[0] == 10:
        try:
            kps = kps.reshape(5, 2)
            return kps.astype(np.float32, copy=False)
        except Exception:
            return None

    if kps.ndim == 2 and kps.shape[1] == 2 and kps.shape[0] >= 5:
        pts = kps.astype(np.float32, copy=False)
        xs = pts[:, 0]
        ys = pts[:, 1]

        cx = float(np.median(xs))
        cy = float(np.median(ys))

        left_idx = np.where(xs < cx)[0]
        right_idx = np.where(xs >= cx)[0]

        if left_idx.size == 0 or right_idx.size == 0:
            return None

        le = pts[left_idx[np.argmin(ys[left_idx])]]
        re_ = pts[right_idx[np.argmin(ys[right_idx])]]

        lm = pts[left_idx[np.argmax(ys[left_idx])]]
        rm = pts[right_idx[np.argmax(ys[right_idx])]]

        d2 = (xs - cx) ** 2 + (ys - cy) ** 2
        nose = pts[int(np.argmin(d2))]

        out = np.stack([le, re_, nose, lm, rm], axis=0).astype(np.float32, copy=False)
        return out

    return None


@dataclass
class FaceDet:
    bbox: np.ndarray
    emb: np.ndarray
    kps: Optional[np.ndarray]
    det_score: float


class FaceRecognizerAuto:
    """
    Auto-enrollment recognizer:
    - tuned for stable landmarks + embeddings
    - slightly more tolerant to low-light (optional fallback)
    """

    def __init__(
        self,
        model_name: str = "buffalo_sc",
        use_gpu: bool = True,
        min_face_size: int = 40,
        det_size: Tuple[int, int] = (640, 640),
        min_det_score: float = 0.25,
    ):
        use_gpu = env_bool("USE_GPU", use_gpu)

        det_n = env_int("AI_DET_SIZE", det_size[0])
        det_size = (det_n, det_n)

        self.min_face_size = int(min_face_size)
        self.min_det_score = _clamp(env_float("MIN_FACE_DET_SCORE", min_det_score), 0.0, 1.0)

        normalize_model_pack_layout(model_name)
        providers = pick_ort_providers(use_gpu)
        ctx_id = 0 if use_gpu else -1

        self.app = FaceAnalysis(
            name=model_name,
            providers=providers,
            allowed_modules=["detection", "recognition"],
        )
        self.app.prepare(ctx_id=ctx_id, det_size=det_size)

        print(
            f"[FaceRecognizerAuto] USE_GPU={int(use_gpu)} ORT_PROVIDER={env_str('ORT_PROVIDER','auto')} "
            f"providers={providers} ctx_id={ctx_id} det_size={det_size} min_det_score={self.min_det_score}"
        )

    def detect_and_embed(self, frame_bgr: np.ndarray) -> List[FaceDet]:
        faces = self.app.get(frame_bgr)
        out: List[FaceDet] = []
        best_fallback: Optional[FaceDet] = None

        for f in faces:
            score = float(getattr(f, "det_score", 1.0))
            bbox = np.asarray(getattr(f, "bbox", None), dtype=np.float32)
            if bbox is None or bbox.shape[0] != 4:
                continue

            w = float(bbox[2] - bbox[0])
            h = float(bbox[3] - bbox[1])
            if min(w, h) < self.min_face_size:
                continue

            emb_raw = getattr(f, "normed_embedding", None)
            if emb_raw is None:
                emb_raw = getattr(f, "embedding", None)
            if emb_raw is None:
                continue

            emb = l2_normalize(np.asarray(emb_raw, dtype=np.float32))

            kps = _to_kps5(getattr(f, "kps", None))
            if kps is None:
                for attr in ("landmark_2d_106", "landmark_2d_68", "landmark_2d_5", "landmark_3d_68"):
                    kps = _to_kps5(getattr(f, attr, None))
                    if kps is not None:
                        break

            det = FaceDet(bbox=bbox, emb=emb, kps=kps, det_score=score)

            if score >= self.min_det_score:
                out.append(det)

            if best_fallback is None or score > best_fallback.det_score:
                best_fallback = det

        fallback_floor = float(os.getenv("FALLBACK_DET_SCORE", "0.0"))
        if not out and best_fallback is not None and best_fallback.det_score >= fallback_floor:
            out.append(best_fallback)

        return out


def match_gallery(emb: np.ndarray, gallery_embs: np.ndarray) -> Tuple[int, float]:
    if gallery_embs.size == 0:
        return -1, -1.0
    sims = gallery_embs @ emb
    i = int(np.argmax(sims))
    return i, float(sims[i])
