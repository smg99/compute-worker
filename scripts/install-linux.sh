#!/usr/bin/env bash
set -euo pipefail

RELEASE_VERSION="${COMPUTE_WORKER_RELEASE_VERSION:-v0.2.3}"
BASE_URL="${COMPUTE_WORKER_RELEASE_BASE_URL:-https://github.com/smg99/compute-worker/releases/download/${RELEASE_VERSION}}"
CONTROL_PLANE_URL="${COMPUTE_WORKER_CONTROL_PLANE_URL:-}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARTIFACT="compute-worker-linux-x64" ;;
  aarch64|arm64) ARTIFACT="compute-worker-linux-arm64" ;;
  *) echo "Unsupported Linux architecture: $ARCH"; exit 1 ;;
esac
if [[ -z "$CONTROL_PLANE_URL" ]]; then echo "Error: COMPUTE_WORKER_CONTROL_PLANE_URL is required."; exit 1; fi
WORKER_DIR="$HOME/.compute-worker"
mkdir -p "$WORKER_DIR" "$HOME/.config/systemd/user"
AUTH_FILE="$WORKER_DIR/auth.key"
if [[ ! -f "$AUTH_FILE" ]]; then openssl rand -hex 32 > "$AUTH_FILE"; fi
chmod 600 "$AUTH_FILE"
curl -fL --retry 3 "$BASE_URL/$ARTIFACT" -o "$WORKER_DIR/worker.tmp"
chmod 755 "$WORKER_DIR/worker.tmp"
mv "$WORKER_DIR/worker.tmp" "$WORKER_DIR/compute-worker"
cat > "$HOME/.config/systemd/user/compute-worker.service" <<EOF
[Unit]
Description=Compute Worker
After=network-online.target

[Service]
ExecStart=$WORKER_DIR/compute-worker
Environment=CONTROL_PLANE_URL=$CONTROL_PLANE_URL
Environment=WORKER_STATE_DIR=$WORKER_DIR
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now compute-worker.service
echo "Installed $ARTIFACT to $WORKER_DIR/compute-worker."
