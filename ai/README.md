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

## 4) Run attendance (overlay + DB logging)
```powershell
python -m app.scripts.run_camera_attendance
```
Keys:
- Q quit
- R reload gallery

## 5) Run API + Dashboard
```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open:
- Dashboard: http://127.0.0.1:8000/
- API docs:   http://127.0.0.1:8000/docs

## Smoothness tips
- Increase `runtime.detect_every_n_frames` to 3
- Reduce `runtime.ai_fps`
- Reduce resolution to 640x360 if CPU-only
