# ai/app/vision/body_detector.py
from __future__ import annotations
import os
import threading
import cv2
import numpy as np
from typing import List, Tuple, Optional

class BodyDetection:
    def __init__(self, bbox: Tuple[int, int, int, int], conf: float, polygon: Optional[List[List[int]]] = None):
        self.bbox = bbox # (x1, y1, x2, y2)
        self.conf = conf
        self.polygon = polygon # list of [x, y] coordinates representing body shape

class UniversalBodyDetector:
    """
    Detects human bodies using YOLOv8 (segmentation/detection), falling back to OpenCV HOG if unavailable.
    """
    def __init__(self):
        self.yolo_model = None
        self.hog_model = None
        self.lock = threading.Lock()
        
        # Determine device
        self.use_gpu = os.getenv("USE_GPU", "1") == "1"
        self.device = "cuda:0" if self.use_gpu else "cpu"
        
        # Try loading detection model yolov8n.pt first (faster/lighter), then yolov8s-seg.pt
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        seg_path = os.path.join(project_root, "yolov8s-seg.pt")
        yolo_path = os.path.join(project_root, "yolov8n.pt")
        
        target_path = None
        if os.path.exists(yolo_path):
            target_path = yolo_path
        elif os.path.exists(seg_path):
            target_path = seg_path
            
        if target_path:
            try:
                from ultralytics import YOLO  # type: ignore
                print(f"[BodyDetector] Loading YOLO from {target_path} on {self.device}...")
                self.yolo_model = YOLO(target_path)
                print("[BodyDetector] YOLO loaded successfully.")
            except Exception as e:
                print(f"[BodyDetector] Failed to load YOLO: {e}. Falling back to HOG.")
        else:
            print("[BodyDetector] Neither yolov8s-seg.pt nor yolov8n.pt found. Falling back to HOG.")
            
        if self.yolo_model is None:
            try:
                print("[BodyDetector] Initializing OpenCV HOG Descriptor for people detection...")
                self.hog_model = cv2.HOGDescriptor()
                self.hog_model.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
                print("[BodyDetector] HOG Descriptor initialized successfully.")
            except Exception as e:
                print(f"[BodyDetector] Failed to initialize HOG Descriptor: {e}")

    def detect(self, frame_bgr: np.ndarray) -> List[BodyDetection]:
        if frame_bgr is None or frame_bgr.size == 0:
            return []
            
        h, w = frame_bgr.shape[:2]
        dets: List[BodyDetection] = []
        
        if self.yolo_model is not None:
            try:
                with self.lock:
                    # Optimized to imgsz=320 for extremely fast, lag-free GPU/CPU processing
                    results = self.yolo_model.predict(
                        source=frame_bgr,
                        conf=0.25,
                        iou=0.45,
                        imgsz=320,
                        classes=[0], # person
                        device=self.device,
                        verbose=False
                    )
                if results and len(results) > 0:
                    r0 = results[0]
                    if r0.boxes is not None:
                        has_masks = getattr(r0, "masks", None) is not None
                        for i, b in enumerate(r0.boxes):
                            xyxy = b.xyxy[0].tolist()
                            conf = float(b.conf[0]) if b.conf is not None else 0.0
                            x1, y1, x2, y2 = [int(round(v)) for v in xyxy]
                            
                            # Clamp values
                            x1 = max(0, min(w - 1, x1))
                            y1 = max(0, min(h - 1, y1))
                            x2 = max(0, min(w, x2))
                            y2 = max(0, min(h, y2))
                            
                            polygon_pts = None
                            if has_masks and r0.masks is not None and i < len(r0.masks.xy):
                                poly = r0.masks.xy[i]
                                if poly is not None and len(poly) > 0:
                                    polygon_pts = poly.astype(np.int32).tolist()
                                    
                            dets.append(BodyDetection(bbox=(x1, y1, x2, y2), conf=conf, polygon=polygon_pts))
            except Exception:
                # Silently catch exceptions to ensure stream processing is completely log-free & lag-free
                pass
                
        # Fallback to HOG if YOLO failed or was not initialized
        if not dets and self.hog_model is not None:
            try:
                # Downscale large frames to max width 400 to make HOG blazingly fast on CPU
                scale = 1.0
                if w > 400:
                    scale = 400.0 / w
                    small_frame = cv2.resize(frame_bgr, (0, 0), fx=scale, fy=scale)
                else:
                    small_frame = frame_bgr
                
                sh, sw = small_frame.shape[:2]
                
                with self.lock:
                    rects, weights = self.hog_model.detectMultiScale(
                        small_frame,
                        winStride=(8, 8),
                        padding=(8, 8),
                        scale=1.05
                    )
                for i, (x, y, bw, bh) in enumerate(rects):
                    # Scale coordinates back to original frame size
                    x1, y1 = int(round(x / scale)), int(round(y / scale))
                    x2, y2 = int(round((x + bw) / scale)), int(round((y + bh) / scale))
                    
                    x1 = max(0, min(w - 1, x1))
                    y1 = max(0, min(h - 1, y1))
                    x2 = max(0, min(w, x2))
                    y2 = max(0, min(h, y2))
                    conf = float(weights[i]) if i < len(weights) else 0.5
                    dets.append(BodyDetection(bbox=(x1, y1, x2, y2), conf=conf, polygon=None))
            except Exception:
                pass
                
        return dets
