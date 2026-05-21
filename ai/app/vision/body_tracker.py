# ai/app/vision/body_tracker.py
from __future__ import annotations
import time
import threading
import cv2
import numpy as np
from typing import List, Tuple, Optional

def compute_iou(box1, box2):
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2
    xi1 = max(x1_1, x1_2)
    yi1 = max(y1_1, y1_2)
    xi2 = min(x2_1, x2_2)
    yi2 = min(y2_1, y2_2)
    inter_w = max(0.0, xi2 - xi1)
    inter_h = max(0.0, yi2 - yi1)
    inter_area = inter_w * inter_h
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union_area = area1 + area2 - inter_area
    return inter_area / union_area if union_area > 0 else 0.0

def face_belongs_to_body(face_bbox, body_bbox) -> bool:
    fx1, fy1, fx2, fy2 = face_bbox
    bx1, by1, bx2, by2 = body_bbox
    fcx = (fx1 + fx2) / 2.0
    fcy = (fy1 + fy2) / 2.0
    
    # Face center is inside or near the upper half of the body box
    margin_x = max(20.0, (bx2 - bx1) * 0.20)
    margin_y = max(20.0, (by2 - by1) * 0.15)
    
    if (bx1 - margin_x <= fcx <= bx2 + margin_x) and (by1 - margin_y <= fcy <= by1 + (by2 - by1) * 0.5):
        return True
        
    # Alternate check: face overlaps significantly with the body bounding box
    ix1 = max(fx1, bx1)
    iy1 = max(fy1, by1)
    ix2 = min(fx2, bx2)
    iy2 = min(fy2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    face_area = (fx2 - fx1) * (fy2 - fy1)
    if face_area > 0 and (iw * ih) / face_area > 0.35:
        return True
        
    return False

class PersonTrack:
    def __init__(self, track_id: int, bbox: Tuple[int, int, int, int], polygon: Optional[List[List[int]]] = None):
        self.track_id = track_id
        self.bbox = bbox # (x1, y1, x2, y2)
        self.polygon = polygon
        self.name = "Unknown"
        self.emp_id = None
        self.score = -1.0
        self.is_authorized = True
        self.last_recognize_time = 0.0
        self.misses = 0
        self.last_seen = time.time()
        
    def should_recognize(self, now: float, recheck_interval: float = 4.0) -> bool:
        if self.name == "Unknown" or self.emp_id is None:
            return True
        return (now - self.last_recognize_time) >= recheck_interval

class BodyTracker:
    def __init__(self, recheck_interval: float = 4.0):
        self.tracks: List[PersonTrack] = []
        self.next_track_id = 1
        self.recheck_interval = recheck_interval
        self.lock = threading.Lock()

    def update(self, body_detections: List[BodyDetection]):
        with self.lock:
            now = time.time()
            matched_track_indices = set()
            new_tracks = []
            
            for det in body_detections:
                body_bbox = det.bbox
                best_match_idx = -1
                best_score = -1.0
                
                # 1. Try IoU matching first
                for idx, track in enumerate(self.tracks):
                    if idx in matched_track_indices:
                        continue
                    iou = compute_iou(body_bbox, track.bbox)
                    if iou > 0.22 and iou > best_score:
                        best_score = iou
                        best_match_idx = idx
                        
                # 2. Fallback to center distance matching (for fast-moving people)
                if best_match_idx == -1:
                    cx1 = (body_bbox[0] + body_bbox[2]) / 2.0
                    cy1 = (body_bbox[1] + body_bbox[3]) / 2.0
                    best_dist = 999999.0
                    for idx, track in enumerate(self.tracks):
                        if idx in matched_track_indices:
                            continue
                        cx2 = (track.bbox[0] + track.bbox[2]) / 2.0
                        cy2 = (track.bbox[1] + track.bbox[3]) / 2.0
                        dist = ((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5
                        if dist < 160.0 and dist < best_dist:
                            best_dist = dist
                            best_match_idx = idx
                            
                if best_match_idx != -1:
                    matched_track_indices.add(best_match_idx)
                    track = self.tracks[best_match_idx]
                    track.bbox = body_bbox
                    track.polygon = det.polygon
                    track.misses = 0
                    track.last_seen = now
                else:
                    new_track = PersonTrack(self.next_track_id, body_bbox, det.polygon)
                    self.next_track_id += 1
                    new_tracks.append(new_track)
                    
            # Update misses for tracks that did not match any detection
            for idx, track in enumerate(self.tracks):
                if idx not in matched_track_indices:
                    track.misses += 1
                    
            # Fast track cleanup when going out of stream range (misses <= 4 and last_seen < 0.75 seconds)
            self.tracks = [t for t in self.tracks if t.misses <= 4 and (now - t.last_seen) < 0.75]
            self.tracks.extend(new_tracks)

def draw_polygon_body_bbox(img: np.ndarray, bbox: Tuple[int, int, int, int], color: Tuple[int, int, int], thickness: int = 2):
    """
    Draws a styled green/blue polygon (chamfered corner box) around the body.
    """
    x1, y1, x2, y2 = bbox
    w = x2 - x1
    h = y2 - y1
    if w <= 0 or h <= 0:
        return
        
    d = min(18, int(min(w, h) * 0.12)) # chamfer size
    
    # 8-sided polygon representing the body
    pts = np.array([
        [x1 + d, y1], [x2 - d, y1],
        [x2, y1 + d], [x2, y2 - d],
        [x2 - d, y2], [x1 + d, y2],
        [x1, y2 - d], [x1, y1 + d]
    ], np.int32)
    
    # Draw polygon border
    cv2.polylines(img, [pts], isClosed=True, color=color, thickness=thickness, lineType=cv2.LINE_AA)
    
    # Draw corners with extra thickness to look sci-fi
    cl = min(25, int(min(w, h) * 0.18))
    # Top-Left corner
    cv2.line(img, (x1, y1 + cl), (x1, y1), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1 + cl, y1), color, thickness + 1, cv2.LINE_AA)
    # Top-Right corner
    cv2.line(img, (x2 - cl, y1), (x2, y1), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + cl), color, thickness + 1, cv2.LINE_AA)
    # Bottom-Left corner
    cv2.line(img, (x1, y2 - cl), (x1, y2), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1 + cl, y2), color, thickness + 1, cv2.LINE_AA)
    # Bottom-Right corner
    cv2.line(img, (x2 - cl, y2), (x2, y2), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - cl), color, thickness + 1, cv2.LINE_AA)

    # Semi-transparent overlay inside the body bounding box for visual depth
    overlay = img.copy()
    cv2.fillPoly(overlay, [pts], color)
    cv2.addWeighted(overlay, 0.08, img, 0.92, 0, img)
