#!/usr/bin/env python3
from __future__ import annotations

"""
Windows Auto-Start Setup Tool for CCTV Face Recognition Attendance System.

Configures automatic background startup on PC boot / logon so that all servers
(Backend, AI Engine, Frontend) and active database cameras run automatically without manual terminal intervention.
"""

import os
import sys
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
START_ALL_PY = ROOT_DIR / "start_all.py"

def get_startup_folder() -> Path:
    appdata = os.getenv("APPDATA")
    if appdata:
        return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    return Path.home() / "AppData" / "Roaming" / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"

def install_vbs_startup(prod_mode: bool = True) -> bool:
    """
    Creates a hidden VBScript launcher in the Windows Startup folder.
    This runs start_all.py invisibly in the background on Windows boot/logon.
    """
    try:
        startup_dir = get_startup_folder()
        startup_dir.mkdir(parents=True, exist_ok=True)
        
        vbs_path = startup_dir / "cctv_attendance_autostart.vbs"
        py_exec = sys.executable
        mode_flag = "--prod" if prod_mode else "--dev"
        
        # Build VBScript content to launch python in background with hidden window (0)
        vbs_content = f'''Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & "{py_exec}" & Chr(34) & " " & Chr(34) & "{START_ALL_PY}" & Chr(34) & " {mode_flag}", 0, False
'''
        with open(vbs_path, "w", encoding="utf-8") as f:
            f.write(vbs_content)
            
        print(f"[OK] Windows Startup VBScript created at:\n     {vbs_path}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to create Startup VBScript: {e}")
        return False

def install_task_scheduler(prod_mode: bool = True) -> bool:
    """
    Registers a Windows Scheduled Task to trigger start_all.py at system boot (BEFORE user logon).
    """
    try:
        py_exec = sys.executable
        mode_flag = "--prod" if prod_mode else "--dev"
        task_name = "CCTV_Attendance_BootStart"
        
        # 1. Try registering system boot trigger (/SC ONSTART) with SYSTEM account so it runs before unlock
        cmd_system = [
            "schtasks", "/Create", "/F",
            "/TN", task_name,
            "/TR", f'"{py_exec}" "{START_ALL_PY}" {mode_flag}',
            "/SC", "ONSTART",
            "/RU", "SYSTEM"
        ]
        res = subprocess.run(cmd_system, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"[OK] System Boot Task '{task_name}' registered under SYSTEM account (runs before unlock).")
            return True

        # 2. Fallback to /SC ONSTART under HIGHEST privileges
        cmd_boot = [
            "schtasks", "/Create", "/F",
            "/TN", task_name,
            "/TR", f'"{py_exec}" "{START_ALL_PY}" {mode_flag}',
            "/SC", "ONSTART",
            "/RL", "HIGHEST"
        ]
        res_boot = subprocess.run(cmd_boot, capture_output=True, text=True)
        if res_boot.returncode == 0:
            print(f"[OK] System Boot Task '{task_name}' registered successfully.")
            return True
        else:
            err_msg = res_boot.stderr.strip()
            if "Access is denied" in err_msg or "access is denied" in err_msg.lower():
                print(f"[INFO] Task Scheduler (pre-logon boot task): Admin privileges required.")
                print(f"[INFO] Startup VBScript is already ACTIVE for automatic startup on logon.")
                print(f"[TIP]  To also enable pre-logon startup before user login, open PowerShell as Administrator and re-run.")
            else:
                print(f"[INFO] Task Scheduler registration note: {err_msg}")
            return False
    except Exception as e:
        print(f"[WARNING] Task Scheduler error: {e}")
        return False

def uninstall_startup() -> bool:
    """
    Removes auto-start VBScript and Task Scheduler entries.
    """
    success = True
    try:
        vbs_path = get_startup_folder() / "cctv_attendance_autostart.vbs"
        if vbs_path.is_file():
            vbs_path.unlink()
            print(f"[OK] Removed VBScript: {vbs_path}")
    except Exception as e:
        print(f"[WARNING] Could not remove VBScript: {e}")
        success = False

    for task_name in ("CCTV_Attendance_BootStart", "CCTV_Attendance_AutoStart"):
        try:
            res = subprocess.run(["schtasks", "/Delete", "/TN", task_name, "/F"], capture_output=True, text=True)
            if res.returncode == 0:
                print(f"[OK] Removed Scheduled Task: {task_name}")
        except Exception:
            pass
        
    return success

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--uninstall", "-u", "uninstall"):
        print("Uninstalling CCTV Attendance Auto-Start from Windows...")
        uninstall_startup()
        return

    prod = "--dev" not in sys.argv
    print("Installing CCTV Attendance Auto-Start for Windows...")
    vbs_ok = install_vbs_startup(prod_mode=prod)
    task_ok = install_task_scheduler(prod_mode=prod)
    
    if vbs_ok or task_ok:
        print("\n========================================================")
        print(" Auto-Start Installed Successfully!")
        print(" When your PC starts up or restarts, all servers (Backend,")
        print(" AI Engine, Frontend) will run automatically in the background,")
        print(" and active cameras from the database will start recognition &")
        print(" attendance automatically!")
        print("========================================================\n")
    else:
        print("\n[ERROR] Could not complete auto-start setup.")

if __name__ == "__main__":
    main()
