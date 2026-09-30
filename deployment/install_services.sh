#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1. Copying service files to /etc/systemd/system/..."
sudo cp "$SCRIPT_DIR/camera-attendance-ai.service" /etc/systemd/system/
sudo cp "$SCRIPT_DIR/camera-attendance-backend.service" /etc/systemd/system/
sudo cp "$SCRIPT_DIR/camera-attendance-frontend.service" /etc/systemd/system/

echo "==> 2. Setting permissions..."
sudo chmod 644 /etc/systemd/system/camera-attendance-ai.service
sudo chmod 644 /etc/systemd/system/camera-attendance-backend.service
sudo chmod 644 /etc/systemd/system/camera-attendance-frontend.service

echo "==> 3. Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "==> 4. Enabling services to start on boot (headless / without login)..."
sudo systemctl enable camera-attendance-ai.service
sudo systemctl enable camera-attendance-backend.service
sudo systemctl enable camera-attendance-frontend.service

echo "================================================================"
echo " Services successfully installed and enabled for automatic boot!"
echo " To start them now, run:"
echo "   sudo systemctl start camera-attendance-ai camera-attendance-backend camera-attendance-frontend"
echo " To check status:"
echo "   sudo systemctl status camera-attendance-ai camera-attendance-backend camera-attendance-frontend"
echo "================================================================"
