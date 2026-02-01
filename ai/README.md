# CCTV Attendance Pro (1-camera) — Windows 10/11 — RTSP + Face Recognition + DB + API + Dashboard

This project includes:
- **Low-lag RTSP** capture (latest frame thread)
- Face detect + embedding via **InsightFace**
- **Multi-angle enrollment** with optional **auto pose guidance** (front/left/right/up/down)
- Attendance logging to **SQLite** ( models)
- **** API + a minimal **Web Dashboard** (HTML)

## 1) Setup (Windows 10/11, Python 3.10.11)
```powershell
cd cctv-attendance-pro
py -3.10 -m venv .venv
.\.venv\Scripts\activate
python -m pip install -U pip
pip install -r requirements.txt
```

### GPU (optional, recommended)
```powershell
pip uninstall -y onnxruntime
pip install onnxruntime-gpu
```
Set `runtime.use_gpu: true`.

## 2) Configure RTSP
Edit `config.yaml`:
- `camera.rtsp_url`
- start with `1280x720`

## 3) Enroll employee (auto-enrollment)
Use the web UI (Front-end) Enrollment page to run the auto-enrollment flow (WebRTC laptop camera + guided angles).

## 4) Run attendance (web)
Attendance is recorded via the recognition stream used by the web UI (Cameras/Headcount pages). Start AI + backend + front-end and view a recognition stream to begin logging.

## 5) Run AI API
```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open:
- API docs: http://127.0.0.1:8000/docs

## Smoothness tips
- Increase `runtime.detect_every_n_frames` to 3
- Reduce `runtime.ai_fps`
- Reduce resolution to 640x360 if CPU-only

## CPU-steady / GPU-burst pipeline (upgrade)

This repo now uses a **CPU-steady / GPU-burst** attendance pipeline to keep GPU usage low in idle scenes while staying responsive when motion/people appear.

**What changed (minimal diffs):**
- Updated `ai/app/runtimes/attendance_runtime.py` to refactor the face-processing loop:
  - CPU motion gate runs every frame
  - CPU tracker runs every frame (smooth boxes between detections)
  - GPU face detection runs only on scheduled ticks (IDLE/NORMAL/BURST)
  - Recognition runs per-track on refresh/high-stakes only
  - Attendance writes are async (never block the frame loop)
- Added new modular components under `ai/app/vision/`:
  - `pipeline_config.py`, `motion_gate.py`, `adaptive_scheduler.py`, `gpu_arbiter.py`
  - `insightface_models.py`, `tracker_manager.py`, `recognizer_runtime.py`
  - `attendance_debouncer.py`, `db_writer.py`

**What stayed the same:**
- Capture/reconnect (`FrameGrabber`, `CameraRuntime`)
- Streaming/UI endpoints (MJPEG/WebRTC/HLS flow + existing worker abstraction)
- Existing backend + ERP + voice-event behaviors and signatures (moved behind an async writer)

**Tuning (env vars):**
- `MOTION_THRESHOLD`, `IDLE_SECONDS`
- `DETECTION_FPS_IDLE`, `DETECTION_FPS_NORMAL`, `DETECTION_FPS_BURST`, `BURST_SECONDS`
- `EMBED_REFRESH_SECONDS`, `UNKNOWN_BURST_AFTER_SECONDS`
- `SIMILARITY_THRESHOLD`, `BORDERLINE_MARGIN`
- `ATTENDANCE_DEBOUNCE_SECONDS`, `STABLE_ID_CONFIRMATIONS`, `GPU_QUEUE_SIZE`

**Note:** For CSRT/KCF trackers install `opencv-contrib-python` (this repo’s `requirements*.txt` now uses it). If unavailable, the code falls back to another OpenCV tracker.
