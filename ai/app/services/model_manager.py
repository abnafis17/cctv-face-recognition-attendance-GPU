import os
import threading
import numpy as np
from app.core.config import BODY_PERSISTENCE_ENABLED
from app.core.logging import logger

detector = None
embedder = None
body_detector = None
models_lock = threading.Lock()

def init_models():
    global detector, embedder, body_detector
    with models_lock:
        if detector is not None:
            return
        logger.info("Initializing Face Detection & Embedding models on GPU...")
        from app.vision.insightface_models import FaceDetector, FaceEmbedder
        model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_m")
        detector = FaceDetector(model_name=model_name, use_gpu=True)
        embedder = FaceEmbedder(model_name=model_name, use_gpu=True)
        if BODY_PERSISTENCE_ENABLED:
            from app.vision.body_detector import UniversalBodyDetector
            body_detector = UniversalBodyDetector()
            logger.info("InsightFace GPU Models & Body Detector initialized successfully.")
        else:
            logger.info("InsightFace GPU Models initialized successfully. (Body Detector Disabled)")

def get_detector():
    if detector is None:
        init_models()
    return detector

def get_embedder():
    if embedder is None:
        init_models()
    return embedder

def get_body_detector():
    if BODY_PERSISTENCE_ENABLED and body_detector is None:
        init_models()
    return body_detector

def get_l2_norm(emb):
    norm = np.linalg.norm(emb)
    return emb / norm if norm > 0 else emb

enroller2_auto_inst = None

def get_enroller2_auto(camera_rt_compat):
    global enroller2_auto_inst
    if enroller2_auto_inst is None:
        from app.enroll2_auto.service import EnrollmentAutoService2
        logger.info("Lazy-loading Auto-Enrollment Service on GPU...")
        enroller2_auto_inst = EnrollmentAutoService2(
            camera_rt=camera_rt_compat, 
            model_name=os.getenv("INSIGHTFACE_MODEL", "buffalo_m"), 
            min_face_size=30
        )
    return enroller2_auto_inst
