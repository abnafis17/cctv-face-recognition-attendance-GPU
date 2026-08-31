#!/usr/bin/env python3
from __future__ import annotations

"""
Unified Production Process Supervisor for NVIDIA Jetson Orin Nano Developer Kit.

Runs the optimized, production-compiled builds of:
  1. Backend (Compiled Node.js / Prisma)   -> Dynamic Port (Default 3001)
  2. AI Service (FastAPI / CUDA / PyTorch) -> Dynamic Port (Default 8000)
  3. Frontend (Next.js Standalone Build)   -> Dynamic Port (Default 3000)

Usage:
  ./start_all.sh                 # Start all 3 servers in production mode
  python3 start_all.py           # Start all 3 servers in production mode
  python3 start_all.py --build   # Build and start all 3 servers
  python3 start_all.py --dev     # Start all 3 servers in dev mode
  python3 start_all.py --dry-run # Check environment and ports only
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
AI_DIR = ROOT_DIR / "ai"
FRONTEND_DIR = ROOT_DIR / "front-end"


def read_env_var(env_path: Path, key: str, default: str) -> str:
    if not env_path.is_file():
        return default
    try:
        with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    if k.strip() == key:
                        return v.strip().strip('"').strip("'")
    except Exception:
        pass
    return default


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = 25.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.3)
    return False


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_python_executable() -> str:
    venv_py = AI_DIR / "venv" / "bin" / "python"
    if venv_py.is_file() and os.access(venv_py, os.X_OK):
        return str(venv_py)
    return sys.executable


class ProcessSupervisor:
    def __init__(
        self,
        dev_mode: bool = False,
        build_first: bool = False,
        skip_ai: bool = False,
        skip_frontend: bool = False,
    ) -> None:
        self.dev_mode = dev_mode
        self.build_first = build_first
        self.skip_ai = skip_ai
        self.skip_frontend = skip_frontend
        self.processes: dict[str, subprocess.Popen] = {}
        self.is_stopping = False

        # Dynamically load ports from respective .env files
        self.backend_port = int(read_env_var(BACKEND_DIR / ".env", "PORT", "3001"))
        self.ai_port = int(read_env_var(AI_DIR / ".env", "AI_SERVER_PORT", read_env_var(AI_DIR / ".env", "PORT", "8000")))
        self.frontend_port = 3000

    def build_artifacts(self) -> bool:
        print("\n========================================================")
        print(" [BUILD] Compiling Production Artifacts for Jetson...")
        print("========================================================")

        # 1. Backend build
        print("--> Building Backend (TypeScript -> JavaScript)...")
        res = subprocess.run(["npm", "run", "build"], cwd=str(BACKEND_DIR))
        if res.returncode != 0:
            print("[ERROR] Backend build failed!")
            return False

        # 2. Frontend build
        if not self.skip_frontend:
            print("--> Building Frontend (Next.js Standalone)...")
            res = subprocess.run(["npm", "run", "build"], cwd=str(FRONTEND_DIR))
            if res.returncode != 0:
                print("[ERROR] Frontend build failed!")
                return False

        print("[OK] Production builds completed successfully.\n")
        return True

    def preflight_check(self) -> bool:
        print("\n========================================================")
        print(" [JETSON ORIN NANO] Full-Stack Supervisor Preflight")
        print("========================================================")
        print(f" Working Directory : {ROOT_DIR}")
        print(f" Execution Mode    : {'Development' if self.dev_mode else 'Production (Built Versions)'}")
        print(f" Python Executable : {get_python_executable()}")
        print(f" Detected Ports    : Backend={self.backend_port}, AI={self.ai_port}, Frontend={self.frontend_port}")

        # Check build artifacts in production mode
        if not self.dev_mode:
            backend_dist = BACKEND_DIR / "dist" / "index.js"
            if not backend_dist.is_file():
                print(" [INFO] Backend build not found (dist/index.js missing). Building now...")
                self.build_artifacts()

            frontend_standalone = FRONTEND_DIR / ".next"
            if not frontend_standalone.is_dir() and not self.skip_frontend:
                print(" [INFO] Frontend build not found (.next missing). Building now...")
                self.build_artifacts()

        ports = [
            (self.backend_port, "Backend"),
            (self.ai_port, "AI Service"),
            (self.frontend_port, "Frontend"),
        ]
        all_clear = True
        for port, name in ports:
            if is_port_in_use(port):
                print(f" [WARNING] Port {port} ({name}) is already in use!")
                all_clear = False
            else:
                print(f" [OK] Port {port} ({name}) is available.")

        return all_clear

    def start_backend(self) -> None:
        print(f"\n--> [1/3] Starting Backend Production Server (Port {self.backend_port})...")
        env = os.environ.copy()
        env["NODE_OPTIONS"] = "--max-old-space-size=256"
        env["PORT"] = str(self.backend_port)

        cmd = (
            ["npm", "run", "dev"]
            if self.dev_mode
            else ["node", "--max-old-space-size=256", "dist/index.js"]
        )
        p = subprocess.Popen(cmd, cwd=str(BACKEND_DIR), env=env)
        self.processes["backend"] = p

        if wait_for_port(self.backend_port, timeout=15.0):
            print(f" [OK] Backend Service is ready on http://127.0.0.1:{self.backend_port}")
        else:
            print(f" [WARNING] Backend did not bind to port {self.backend_port} within 15s. Continuing...")

    def start_ai(self) -> None:
        if self.skip_ai:
            print("\n--> [2/3] Skipping AI Service (--no-ai specified)")
            return

        print(f"\n--> [2/3] Starting AI Production Server (Port {self.ai_port})...")
        py_bin = get_python_executable()
        cmd = [py_bin, "run.py"] if not self.dev_mode else [py_bin, "app/api_server.py"]

        p = subprocess.Popen(cmd, cwd=str(AI_DIR))
        self.processes["ai"] = p

        if wait_for_port(self.ai_port, timeout=25.0):
            print(f" [OK] AI Service is ready on http://127.0.0.1:{self.ai_port}")
        else:
            print(f" [WARNING] AI service did not bind to port {self.ai_port} within 25s. Continuing...")

    def start_frontend(self) -> None:
        if self.skip_frontend:
            print("\n--> [3/3] Skipping Frontend Service (--no-frontend specified)")
            return

        print(f"\n--> [3/3] Starting Frontend Production Server (Port {self.frontend_port})...")
        env = os.environ.copy()
        env["NODE_OPTIONS"] = "--max-old-space-size=512"
        env["PORT"] = str(self.frontend_port)

        cmd = ["npm", "run", "dev"] if self.dev_mode else ["npm", "run", "start:jetson"]
        p = subprocess.Popen(cmd, cwd=str(FRONTEND_DIR), env=env)
        self.processes["frontend"] = p

        if wait_for_port(self.frontend_port, timeout=20.0):
            print(f" [OK] Frontend Service is ready on http://127.0.0.1:{self.frontend_port}")
        else:
            print(f" [WARNING] Frontend did not bind to port {self.frontend_port} within 20s. Continuing...")

    def stop_all(self, sig=None, frame=None) -> None:
        if self.is_stopping:
            return
        self.is_stopping = True
        print("\n\n[SUPERVISOR] Received stop signal. Shutting down all processes gracefully...")

        for name, proc in list(self.processes.items()):
            if proc.poll() is None:
                print(f" [STOPPING] Sending SIGINT to {name} (PID: {proc.pid})...")
                proc.send_signal(signal.SIGINT)

        # Wait up to 5 seconds for clean exit
        deadline = time.time() + 5.0
        for name, proc in self.processes.items():
            remaining = max(0.1, deadline - time.time())
            try:
                proc.wait(timeout=remaining)
                print(f" [STOPPED] {name} exited cleanly.")
            except subprocess.TimeoutExpired:
                print(f" [FORCE KILL] {name} did not terminate in time. Killing...")
                proc.kill()

        print("[SUPERVISOR] All processes terminated cleanly. Goodbye!\n")
        sys.exit(0)

    def run(self) -> None:
        signal.signal(signal.SIGINT, self.stop_all)
        signal.signal(signal.SIGTERM, self.stop_all)

        if self.build_first:
            if not self.build_artifacts():
                sys.exit(1)

        self.preflight_check()
        self.start_backend()
        self.start_ai()
        self.start_frontend()

        local_ip = get_local_ip()
        print("\n========================================================")
        print(" All Services are Running in Production Mode!")
        print(f"  - Backend (API) : http://localhost:{self.backend_port}/api/v1 (or http://{local_ip}:{self.backend_port}/api/v1)")
        print(f"  - AI Server     : http://localhost:{self.ai_port}/docs (or http://{local_ip}:{self.ai_port}/docs)")
        print(f"  - Frontend (UI) : http://localhost:{self.frontend_port} (or http://{local_ip}:{self.frontend_port})")
        print(f"\n [TIP] For smoothest multi-camera viewing without Jetson browser overhead,")
        print(f"       open http://{local_ip}:{self.frontend_port} from your laptop / client PC browser.")
        print(" Press Ctrl+C to terminate all services gracefully.")
        print("========================================================\n")

        try:
            while not self.is_stopping:
                for name, proc in list(self.processes.items()):
                    ret = proc.poll()
                    if ret is not None:
                        print(f"[ALERT] Process {name} exited unexpectedly with code {ret}!")
                        self.stop_all()
                time.sleep(1.0)
        except KeyboardInterrupt:
            self.stop_all()


def main() -> None:
    parser = argparse.ArgumentParser(description="Full-stack launcher for Jetson Orin Nano")
    parser.add_argument("--dev", action="store_true", help="Run services in dev mode")
    parser.add_argument("--build", action="store_true", help="Rebuild backend and frontend before starting")
    parser.add_argument("--no-ai", action="store_true", help="Do not start AI service")
    parser.add_argument("--no-frontend", action="store_true", help="Do not start Frontend service")
    parser.add_argument("--dry-run", action="store_true", help="Check ports and environment only")

    args = parser.parse_args()

    supervisor = ProcessSupervisor(
        dev_mode=args.dev,
        build_first=args.build,
        skip_ai=args.no_ai,
        skip_frontend=args.no_frontend,
    )

    if args.dry_run:
        ok = supervisor.preflight_check()
        sys.exit(0 if ok else 1)

    supervisor.run()


if __name__ == "__main__":
    main()
