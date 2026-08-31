#!/usr/bin/env bash
set -e

# ==============================================================================
# Jetson Orin Nano Full-Stack Production Launcher
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo " Starting Full-Stack Attendance System on Jetson Orin"
echo "========================================================"

if [ -f "ai/venv/bin/python" ]; then
    PYTHON_BIN="ai/venv/bin/python"
else
    PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" start_all.py "$@"
