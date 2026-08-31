#!/usr/bin/env bash
# ==============================================================================
# Jetson Orin Nano Super: NVMe SSD 8GB Swap & Memory Performance Setup
# ==============================================================================
# Resolves in-RAM ZRAM memory saturation & CPU thrashing during multi-camera AI.
# Safe to run multiple times. Requires sudo privileges.
# ==============================================================================

set -e

SWAP_FILE="/swapfile"
SWAP_SIZE="8G"

echo "========================================================"
echo " Setting up 8GB NVMe Swapfile on Jetson Orin Nano..."
echo "========================================================"

if [ "$EUID" -ne 0 ]; then
    echo "[INFO] Re-running script with sudo..."
    exec sudo bash "$0" "$@"
fi

if [ -f "$SWAP_FILE" ]; then
    echo "[OK] Swap file $SWAP_FILE already exists."
else
    echo "[-->] Allocating $SWAP_SIZE swap file at $SWAP_FILE on NVMe SSD..."
    fallocate -l "$SWAP_SIZE" "$SWAP_FILE" 2>/dev/null || dd if=/dev/zero of="$SWAP_FILE" bs=1G count=8 status=progress
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
    echo "[OK] Swap file created successfully."
fi

# Enable swap if not active
if swapon --show | grep -q "$SWAP_FILE"; then
    echo "[OK] Swap file $SWAP_FILE is currently active."
else
    echo "[-->] Activating $SWAP_FILE..."
    swapon "$SWAP_FILE"
    echo "[OK] $SWAP_FILE is now active."
fi

# Persist in /etc/fstab
if grep -q "$SWAP_FILE" /etc/fstab; then
    echo "[OK] /etc/fstab already includes $SWAP_FILE."
else
    echo "[-->] Adding $SWAP_FILE to /etc/fstab for persistence..."
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    echo "[OK] Added to /etc/fstab."
fi

# Optimize swappiness (favors physical RAM over premature swap eviction)
echo "[-->] Setting vm.swappiness to 20..."
sysctl vm.swappiness=20
if grep -q "vm.swappiness" /etc/sysctl.conf; then
    sed -i 's/^vm.swappiness=.*/vm.swappiness=20/' /etc/sysctl.conf
else
    echo "vm.swappiness=20" >> /etc/sysctl.conf
fi

echo ""
echo "========================================================"
echo " Current Memory & Swap Status:"
echo "========================================================"
free -h
echo ""
swapon --show
echo "========================================================"
echo " [SUCCESS] Jetson Orin Nano memory configuration complete!"
echo "========================================================"
