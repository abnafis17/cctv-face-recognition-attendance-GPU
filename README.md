# cctv-face-recognition-attendance

## Run on one host PC (LAN)

**Goal:** run `ai` + `backend` + `front-end` on PC A, and open the UI from PC B/C/etc without restarting the camera.

1. Set host IP in env

- `front-end/.env`: set `NEXT_PUBLIC_BACKEND_URL=http://<PC_A_IP>:3001` and `NEXT_PUBLIC_AI_URL=http://<PC_A_IP>:8000`
- `backend/.env`: set `AI_BASE_URL=http://<PC_A_IP>:8000` and add `http://<PC_A_IP>:3000` to `CORS_ORIGIN`

2. Start services on PC A

- AI (FastAPI): `cd ai; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Backend (Express): `cd backend; npm run dev` (default `PORT=3001`)
- UI (Next.js): `cd front-end; npm run build; npm run start -- -H 0.0.0.0 -p 3000`

3. Open from other devices

- `http://<PC_A_IP>:3000`

If Windows Firewall blocks remote access, allow inbound ports `3000`, `3001`, `8000` on PC A.

# Deployment and Auto-start

cd /home/psl/PSL_Projects/camera-auto-attendance-ai

# 1. Update systemd service configurations

sudo bash deployment/install_services.sh

# 2. Restart all services

sudo systemctl restart camera-attendance-ai camera-attendance-backend camera-attendance-frontend

# Auto Start on Boot

To start them now, run:
sudo systemctl start camera-attendance-ai camera-attendance-backend camera-attendance-frontend
To check status:
sudo systemctl status camera-attendance-ai camera-attendance-backend camera-attendance-frontend

## System Status Analysis: 100% Operational & Healthy

The output confirms your full-stack deployment on the Jetson Orin Nano is running in production state:

1. AI Engine (camera-attendance-ai.service) — EXCELLENT
   Status: active (running)
   RAM Footprint: 1.7 GB (well within your 4.5 GB / 5.0 GB safety threshold).
   Inference & Streams:
   RTSP stream delivery is active (GET /camera/recognition/stream/...).
   Real-time face recognition and attendance logging is actively matching employees (emp=2023043021 name=Easin Mia).
   Live ERP synchronization queue is succeeding ([ERP Live] queued ok=True).
2. Backend Service (camera-attendance-backend.service) — EXCELLENT
   Status: active (running)
   RAM Footprint: 234 MB (very lightweight).
   Database: PostgreSQL connection established on port 5432.
   Camera Auto-Recovery: Automatically discovered and launched both configured cameras ([CAMERA-AUTOSTART] complete started=2 failed=0).
   Live Port: Listening on http://localhost:4000.
3. Frontend Web Service (camera-attendance-frontend.service) — EXCELLENT
   Status: active (running)
   RAM Footprint: 169.7 MB.
   Next.js: Running the compiled production server smoothly on port 3001 (or 3000), proxying all API requests directly to the backend on 4000.
4. Headless Auto-Start Verification
   All three units show enabled (Loaded: ...; enabled; vendor preset: enabled).
   If the Jetson loses power or reboots, systemd will automatically spin up PostgreSQL ➔ AI ➔ Backend ➔ Frontend without requiring anyone to log into the desktop.
   Total Jetson Resource Utilization
   Service Memory Usage Target Port
   AI (FastAPI + InsightFace + YOLO) 1.7 GB :8080
   Backend (Node.js + Prisma) 234 MB :4000
   Frontend (Next.js) 170 MB :3001 / :3000
   Total Stack RAM ~2.1 GB (Leaves ~5.9 GB free unified memory on Jetson)
