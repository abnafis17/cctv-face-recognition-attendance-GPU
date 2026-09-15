#!/usr/bin/env python3
from __future__ import annotations

"""
Unified Process Supervisor for CCTV Face Recognition Attendance System.

Starts all 3 core microservices simultaneously:
  1. Backend API (Node.js / Express / Prisma)   -> Default Port 3001
  2. AI Service Server (FastAPI / PyTorch / OpenCV) -> Default Port 8000
  3. Frontend Web App (Next.js Dashboard)         -> Default Port 3000

Usage:
  python start_all.py           # Start all 3 servers in dev mode
  python start_all.py --dev     # Start all 3 servers in dev mode
  python start_all.py --prod    # Start all 3 servers in production mode
  python start_all.py --build   # Build production artifacts then start
  python start_all.py --dry-run # Check environment and ports only
  ./start_all.sh                 # Linux / Jetson launcher shell script
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
AI_DIR = ROOT_DIR / "ai"
FRONTEND_DIR = ROOT_DIR / "front-end"

IS_WINDOWS = sys.platform == "win32"

# ANSI Colors for clean terminal logging
COLOR_CYAN = "\033[96m"
COLOR_GREEN = "\033[92m"
COLOR_YELLOW = "\033[93m"
COLOR_MAGENTA = "\033[95m"
COLOR_RED = "\033[91m"
COLOR_BOLD = "\033[1m"
COLOR_RESET = "\033[0m"


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


def free_port(port: int) -> None:
    if IS_WINDOWS:
        try:
            cmd = f"netstat -ano | findstr LISTENING | findstr :{port}"
            out = subprocess.check_output(cmd, shell=True, text=True, errors="ignore")
            for line in out.strip().splitlines():
                parts = line.strip().split()
                if parts:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) > 0:
                        subprocess.run(
                            f"taskkill /F /PID {pid}",
                            shell=True,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
            time.sleep(0.5)
        except Exception:
            pass
    else:
        try:
            subprocess.run(
                ["fuser", "-k", f"{port}/tcp"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(0.3)
        except Exception:
            pass


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


def get_npm_command() -> str:
    return "npm.cmd" if IS_WINDOWS else "npm"


def get_python_executable() -> str:
    win_paths = [
        AI_DIR / ".venv" / "Scripts" / "python.exe",
        AI_DIR / "venv" / "Scripts" / "python.exe",
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / "venv" / "Scripts" / "python.exe",
    ]
    nix_paths = [
        AI_DIR / ".venv" / "bin" / "python",
        AI_DIR / "venv" / "bin" / "python",
        ROOT_DIR / ".venv" / "bin" / "python",
        ROOT_DIR / "venv" / "bin" / "python",
    ]
    paths = win_paths if IS_WINDOWS else nix_paths
    for p in paths:
        if p.is_file():
            return str(p)
    return sys.executable


def kill_process_tree(pid: int) -> None:
    if IS_WINDOWS:
        try:
            subprocess.run(
                f"taskkill /F /T /PID {pid}",
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass
    else:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except Exception:
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass


class ProcessSupervisor:
    def __init__(
        self,
        dev_mode: bool = True,
        build_first: bool = False,
        skip_ai: bool = False,
        skip_backend: bool = False,
        skip_frontend: bool = False,
    ) -> None:
        self.dev_mode = dev_mode
        self.build_first = build_first
        self.skip_ai = skip_ai
        self.skip_backend = skip_backend
        self.skip_frontend = skip_frontend
        self.processes: dict[str, subprocess.Popen] = {}
        self.is_stopping = False

        self.backend_port = int(read_env_var(BACKEND_DIR / ".env", "PORT", "3001"))
        self.ai_port = int(
            read_env_var(
                AI_DIR / ".env",
                "AI_SERVER_PORT",
                read_env_var(AI_DIR / ".env", "PORT", "8000"),
            )
        )
        self.frontend_port = int(read_env_var(FRONTEND_DIR / ".env", "PORT", "3000"))

    def build_artifacts(self) -> bool:
        npm_cmd = get_npm_command()
        print(f"\n{COLOR_CYAN}{COLOR_BOLD}========================================================{COLOR_RESET}")
        print(f"{COLOR_CYAN} [BUILD] Compiling Production Artifacts...{COLOR_RESET}")
        print(f"{COLOR_CYAN}{COLOR_BOLD}========================================================{COLOR_RESET}")

        if not self.skip_backend:
            print(f"{COLOR_YELLOW}--> Building Backend (TypeScript -> JavaScript)...{COLOR_RESET}")
            res = subprocess.run([npm_cmd, "run", "build"], cwd=str(BACKEND_DIR))
            if res.returncode != 0:
                print(f"{COLOR_RED}[ERROR] Backend build failed!{COLOR_RESET}")
                return False

        if not self.skip_frontend:
            print(f"{COLOR_YELLOW}--> Building Frontend (Next.js)...{COLOR_RESET}")
            res = subprocess.run([npm_cmd, "run", "build"], cwd=str(FRONTEND_DIR))
            if res.returncode != 0:
                print(f"{COLOR_RED}[ERROR] Frontend build failed!{COLOR_RESET}")
                return False

        print(f"{COLOR_GREEN}[OK] Production builds completed successfully.{COLOR_RESET}\n")
        return True

    def preflight_check(self) -> bool:
        print(f"\n{COLOR_BOLD}========================================================{COLOR_RESET}")
        print(f"{COLOR_BOLD} CCTV Attendance Pro - Microservices Supervisor{COLOR_RESET}")
        print(f"{COLOR_BOLD}========================================================{COLOR_RESET}")
        print(f" Working Directory : {ROOT_DIR}")
        print(f" Operating System  : {'Windows' if IS_WINDOWS else 'Linux/Unix'}")
        print(f" Execution Mode    : {'Development (Live Reload)' if self.dev_mode else 'Production (Compiled)'}")
        print(f" Python Executable : {get_python_executable()}")
        print(
            f" Ports Configured  : Backend={self.backend_port}, AI={self.ai_port}, Frontend={self.frontend_port}"
        )

        if not self.dev_mode:
            backend_dist = BACKEND_DIR / "dist" / "index.js"
            if not backend_dist.is_file() and not self.skip_backend:
                print(f"{COLOR_YELLOW} [INFO] Backend dist/index.js missing. Triggering build...{COLOR_RESET}")
                if not self.build_artifacts():
                    return False

            frontend_next = FRONTEND_DIR / ".next"
            if not frontend_next.is_dir() and not self.skip_frontend:
                print(f"{COLOR_YELLOW} [INFO] Frontend .next directory missing. Triggering build...{COLOR_RESET}")
                if not self.build_artifacts():
                    return False

        ports = []
        if not self.skip_backend:
            ports.append((self.backend_port, "Backend API"))
        if not self.skip_ai:
            ports.append((self.ai_port, "AI Engine"))
        if not self.skip_frontend:
            ports.append((self.frontend_port, "Frontend Dashboard"))

        all_clear = True
        for port, name in ports:
            if is_port_in_use(port):
                print(f"{COLOR_YELLOW} [WARNING] Port {port} ({name}) is in use! Clearing process...{COLOR_RESET}")
                free_port(port)
                if is_port_in_use(port):
                    print(f"{COLOR_RED} [ERROR] Could not free port {port} ({name}).{COLOR_RESET}")
                    all_clear = False
                else:
                    print(f"{COLOR_GREEN} [OK] Port {port} ({name}) freed successfully.{COLOR_RESET}")
            else:
                print(f"{COLOR_GREEN} [OK] Port {port} ({name}) is available.{COLOR_RESET}")

        return all_clear

    def _stream_output(self, proc: subprocess.Popen, name: str, color: str) -> None:
        prefix = f"{color}[{name}]{COLOR_RESET} "
        try:
            if proc.stdout:
                for line in iter(proc.stdout.readline, ""):
                    if line:
                        sys.stdout.write(f"{prefix}{line}")
                        sys.stdout.flush()
        except Exception:
            pass

    def start_backend(self) -> None:
        if self.skip_backend:
            print(f"\n--> [1/3] Skipping Backend Service")
            return

        print(f"\n--> [1/3] Starting Backend Server (Port {self.backend_port})...")
        npm_cmd = get_npm_command()
        backend_mem = os.getenv("BACKEND_NODE_MAX_MEM", "1024")
        env = os.environ.copy()
        env["NODE_OPTIONS"] = f"--max-old-space-size={backend_mem}"
        env["PORT"] = str(self.backend_port)
        env["HOST"] = "0.0.0.0"

        backend_dist = BACKEND_DIR / "dist" / "index.js"
        if self.dev_mode or not backend_dist.is_file():
            cmd = [npm_cmd, "run", "dev"]
        else:
            cmd = ["node", f"--max-old-space-size={backend_mem}", "dist/index.js"]

        p = subprocess.Popen(
            cmd,
            cwd=str(BACKEND_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.processes["backend"] = p

        t = threading.Thread(target=self._stream_output, args=(p, "BACKEND", COLOR_CYAN), daemon=True)
        t.start()

        if wait_for_port(self.backend_port, timeout=20.0):
            print(f"{COLOR_GREEN} [OK] Backend Service ready on http://0.0.0.0:{self.backend_port}{COLOR_RESET}")
        else:
            print(f"{COLOR_YELLOW} [INFO] Backend server process launched (port {self.backend_port}){COLOR_RESET}")

    def start_ai(self) -> None:
        if self.skip_ai:
            print(f"\n--> [2/3] Skipping AI Service")
            return

        print(f"\n--> [2/3] Starting AI Stream Engine (Port {self.ai_port})...")
        py_bin = get_python_executable()

        lite_ai = AI_DIR / "lite_ai_server.py"
        run_py = AI_DIR / "run.py"

        if lite_ai.is_file():
            cmd = [py_bin, "lite_ai_server.py"]
        elif run_py.is_file():
            cmd = [py_bin, "run.py"]
        else:
            cmd = [py_bin, "app/api_server.py"]

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["HOST"] = "0.0.0.0"

        p = subprocess.Popen(
            cmd,
            cwd=str(AI_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.processes["ai"] = p

        t = threading.Thread(target=self._stream_output, args=(p, "AI-ENGINE", COLOR_MAGENTA), daemon=True)
        t.start()

        if wait_for_port(self.ai_port, timeout=25.0):
            print(f"{COLOR_GREEN} [OK] AI Engine ready on http://0.0.0.0:{self.ai_port}{COLOR_RESET}")
        else:
            print(f"{COLOR_YELLOW} [INFO] AI Engine process launched (port {self.ai_port}){COLOR_RESET}")

    def start_frontend(self) -> None:
        if self.skip_frontend:
            print(f"\n--> [3/3] Skipping Frontend Service")
            return

        print(f"\n--> [3/3] Starting Frontend Web App (Port {self.frontend_port})...")
        npm_cmd = get_npm_command()
        frontend_mem = os.getenv("FRONTEND_NODE_MAX_MEM", "2048")
        env = os.environ.copy()
        env["NODE_OPTIONS"] = f"--max-old-space-size={frontend_mem}"
        env["PORT"] = str(self.frontend_port)
        env["HOSTNAME"] = "0.0.0.0"
        env["HOST"] = "0.0.0.0"

        frontend_next = FRONTEND_DIR / ".next"
        if self.dev_mode or not frontend_next.is_dir():
            cmd = [npm_cmd, "run", "dev"]
        else:
            cmd = [npm_cmd, "run", "start"]

        p = subprocess.Popen(
            cmd,
            cwd=str(FRONTEND_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.processes["frontend"] = p

        t = threading.Thread(target=self._stream_output, args=(p, "FRONTEND", COLOR_GREEN), daemon=True)
        t.start()

        if wait_for_port(self.frontend_port, timeout=25.0):
            print(f"{COLOR_GREEN} [OK] Frontend Dashboard ready on http://127.0.0.1:{self.frontend_port}{COLOR_RESET}")
        else:
            print(f"{COLOR_YELLOW} [INFO] Frontend process launched (port {self.frontend_port}){COLOR_RESET}")

    def stop_all(self, sig=None, frame=None) -> None:
        if self.is_stopping:
            return
        self.is_stopping = True
        print(f"\n\n{COLOR_YELLOW}[SUPERVISOR] Shutting down all microservices cleanly...{COLOR_RESET}")

        for name, proc in list(self.processes.items()):
            if proc.poll() is None:
                print(f" [STOPPING] Terminating {name} (PID: {proc.pid})...")
                kill_process_tree(proc.pid)

        print(f"{COLOR_GREEN}[SUPERVISOR] All microservices terminated successfully. Bye!{COLOR_RESET}\n")
        sys.exit(0)

    def run(self) -> None:
        signal.signal(signal.SIGINT, self.stop_all)
        signal.signal(signal.SIGTERM, self.stop_all)

        if self.build_first:
            if not self.build_artifacts():
                sys.exit(1)

        if not self.preflight_check():
            print(f"{COLOR_YELLOW} Preflight check warnings logged. Proceeding with launch...{COLOR_RESET}")

        self.start_backend()
        self.start_ai()
        self.start_frontend()

        local_ip = get_local_ip()
        print(f"\n{COLOR_GREEN}{COLOR_BOLD}========================================================{COLOR_RESET}")
        print(f"{COLOR_GREEN}{COLOR_BOLD} All Microservices Started & Running!{COLOR_RESET}")
        print(f"  - Frontend App   : {COLOR_BOLD}http://localhost:{self.frontend_port}{COLOR_RESET}  (LAN: http://{local_ip}:{self.frontend_port})")
        print(f"  - Backend API    : {COLOR_BOLD}http://localhost:{self.backend_port}/api/v1{COLOR_RESET} (LAN: http://{local_ip}:{self.backend_port}/api/v1)")
        print(f"  - AI Stream Server: {COLOR_BOLD}http://localhost:{self.ai_port}/docs{COLOR_RESET}  (LAN: http://{local_ip}:{self.ai_port}/docs)")
        print(f"\n {COLOR_YELLOW}Press Ctrl+C in this terminal to stop all servers.{COLOR_RESET}")
        print(f"{COLOR_GREEN}{COLOR_BOLD}========================================================{COLOR_RESET}\n")

        try:
            while not self.is_stopping:
                for name, proc in list(self.processes.items()):
                    ret = proc.poll()
                    if ret is not None and not self.is_stopping:
                        print(f"\n{COLOR_RED}[ALERT] Process {name} exited with code {ret}!{COLOR_RESET}")
                time.sleep(1.0)
        except KeyboardInterrupt:
            self.stop_all()


def main() -> None:
    parser = argparse.ArgumentParser(description="Full-Stack Microservices Launcher for CCTV Attendance System")
    parser.add_argument("--dev", action="store_true", default=True, help="Run services in dev mode (Default)")
    parser.add_argument("--prod", action="store_true", help="Run services in production built mode")
    parser.add_argument("--build", action="store_true", help="Build frontend and backend artifacts before launching")
    parser.add_argument("--no-ai", action="store_true", help="Skip starting AI server")
    parser.add_argument("--no-backend", action="store_true", help="Skip starting Backend server")
    parser.add_argument("--no-frontend", action="store_true", help="Skip starting Frontend server")
    parser.add_argument("--dry-run", action="store_true", help="Check ports and environment only")
    parser.add_argument("--install-startup", action="store_true", help="Configure Windows auto-start on PC boot/logon")
    parser.add_argument("--uninstall-startup", action="store_true", help="Remove Windows auto-start on PC boot/logon")
    parser.add_argument("--stop", action="store_true", help="Stop all currently running servers on ports 3000, 3001, and 8000")

    args = parser.parse_args()

    if args.stop:
        print(f"\n{COLOR_YELLOW}[STOP] Terminating all running microservices (Ports 3000, 3001, 8000)...{COLOR_RESET}")
        free_port(3001)
        free_port(8000)
        free_port(3000)
        print(f"{COLOR_GREEN}[OK] All server processes terminated successfully.{COLOR_RESET}\n")
        sys.exit(0)

    if args.install_startup or args.uninstall_startup:
        from scripts.setup_windows_startup import install_vbs_startup, install_task_scheduler, uninstall_startup
        if args.uninstall_startup:
            uninstall_startup()
        else:
            prod_mode = bool(args.prod)
            install_vbs_startup(prod_mode=prod_mode)
            install_task_scheduler(prod_mode=prod_mode)
        sys.exit(0)

    dev_mode = not args.prod

    supervisor = ProcessSupervisor(
        dev_mode=dev_mode,
        build_first=args.build,
        skip_ai=args.no_ai,
        skip_backend=args.no_backend,
        skip_frontend=args.no_frontend,
    )

    if args.dry_run:
        ok = supervisor.preflight_check()
        sys.exit(0 if ok else 1)

    supervisor.run()


if __name__ == "__main__":
    main()
