from __future__ import annotations
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class ProcInfo:
    name: str
    args: List[str]
    popen: subprocess.Popen

class ProcessManager:
    def __init__(self):
        self.procs: Dict[str, ProcInfo] = {}

    def is_running(self, key: str) -> bool:
        p = self.procs.get(key)
        return bool(p and p.popen.poll() is None)

    def start(self, key: str, name: str, module: str, module_args: List[str]) -> bool:
        if self.is_running(key):
            return False
        pop = subprocess.Popen(
            [sys.executable, "-m", module, *module_args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.procs[key] = ProcInfo(name=name, args=[module, *module_args], popen=pop)
        return True

    def stop(self, key: str) -> bool:
        p = self.procs.get(key)
        if not p:
            return False
        if p.popen.poll() is None:
            p.popen.terminate()
        self.procs.pop(key, None)
        return True

    def status(self, key: str) -> dict:
        p = self.procs.get(key)
        return {
            "running": self.is_running(key),
            "name": p.name if p else None,
            "args": p.args if p else None,
        }
