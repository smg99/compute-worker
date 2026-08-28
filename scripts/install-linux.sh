#!/bin/bash
# Linux Installer Script for Compute Worker

set -e

echo "Starting Compute Worker installation for Linux..."

# 1. Download binary (placeholder)
# curl -LO https://cdn.example.com/worker/latest/compute-worker-linux-amd64
# chmod +x compute-worker-linux-amd64
# sudo mv compute-worker-linux-amd64 /usr/local/bin/compute-worker

# 2. Setup Systemd Service
SERVICE_PATH="/etc/systemd/system/compute-worker.service"

# sudo bash -c "cat << EOF > $SERVICE_PATH
# [Unit]
# Description=Compute Worker Service
# After=network.target

# [Service]
# ExecStart=/usr/local/bin/compute-worker
# Restart=always
# User=$USER
# Environment=NODE_ENV=production

# [Install]
# WantedBy=multi-user.target
# EOF"

# sudo systemctl daemon-reload
# sudo systemctl enable compute-worker
# sudo systemctl start compute-worker

echo "Installation complete."
