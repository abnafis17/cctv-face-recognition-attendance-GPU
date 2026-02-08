# cctv-face-recognition-attendance

## Run on one host PC (LAN)

**Goal:** run `ai` + `backend` + `front-end` on PC A, and open the UI from PC B/C/etc without restarting the camera.

1) Set host IP in env
- `front-end/.env`: set `NEXT_PUBLIC_BACKEND_URL=http://<PC_A_IP>:3001` and `NEXT_PUBLIC_AI_URL=http://<PC_A_IP>:8000`
- `backend/.env`: set `AI_BASE_URL=http://<PC_A_IP>:8000` and add `http://<PC_A_IP>:3000` to `CORS_ORIGIN`

2) Start services on PC A
- AI (FastAPI): `cd ai; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Backend (Express): `cd backend; npm run dev` (default `PORT=3001`)
- UI (Next.js): `cd front-end; npm run build; npm run start -- -H 0.0.0.0 -p 3000`

3) Open from other devices
- `http://<PC_A_IP>:3000`

If Windows Firewall blocks remote access, allow inbound ports `3000`, `3001`, `8000` on PC A.
