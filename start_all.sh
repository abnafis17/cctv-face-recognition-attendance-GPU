#!/usr/bin/env bash
set -e

# ==============================================================================
# Full-Stack CCTV Face Recognition Attendance System Launcher
# Starts Frontend, Backend, and AI Stream Server simultaneously
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo " Starting CCTV Attendance System (Full-Stack Launcher)"
echo "========================================================"

if [ -f "ai/.venv/bin/python" ]; then
    PYTHON_BIN="ai/.venv/bin/python"
elif [ -f "ai/venv/bin/python" ]; then
    PYTHON_BIN="ai/venv/bin/python"
elif [ -f ".venv/bin/python" ]; then
    PYTHON_BIN=".venv/bin/python"
elif [ -f "venv/bin/python" ]; then
    PYTHON_BIN="venv/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON_BIN="python3"
else
    PYTHON_BIN="python"
fi

echo " Using Python Executable: $PYTHON_BIN"
exec "$PYTHON_BIN" start_all.py "$@"
