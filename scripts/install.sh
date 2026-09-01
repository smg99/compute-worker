#!/usr/bin/env bash
set -euo pipefail

# Compute Worker one-command installer for macOS/Linux.
# Example: curl -fsSL https://raw.githubusercontent.com/smg99/compute-worker/main/scripts/install.sh | bash

RELEASE_VERSION="${COMPUTE_WORKER_RELEASE_VERSION:-v0.2.4}"
BASE_URL="${COMPUTE_WORKER_RELEASE_BASE_URL:-https://github.com/smg99/compute-worker/releases/download/${RELEASE_VERSION}}"
CONTROL_PLANE_URL="${COMPUTE_WORKER_CONTROL_PLANE_URL:-}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS:$ARCH" in
  darwin:arm64) ARTIFACT="compute-worker-darwin-arm64" ;;
  darwin:x86_64) ARTIFACT="compute-worker-darwin-x64" ;;
  linux:x86_64) ARTIFACT="compute-worker-linux-x64" ;;
  linux:aarch64|linux:arm64) ARTIFACT="compute-worker-linux-arm64" ;;
  *) echo "Unsupported platform: $OS/$ARCH"; exit 1 ;;
esac

if [[ -z "$CONTROL_PLANE_URL" ]]; then
  echo "Error: COMPUTE_WORKER_CONTROL_PLANE_URL is required for production installation."
  echo "Set it to the deployed Compute Worker control-plane base URL and retry."
  exit 1
fi

WORKER_DIR="$HOME/.compute-worker"
mkdir -p "$WORKER_DIR"
AUTH_FILE="$WORKER_DIR/auth.key"
if [[ ! -f "$AUTH_FILE" ]]; then
  if command -v uuidgen >/dev/null 2>&1; then uuidgen > "$AUTH_FILE"; else openssl rand -hex 32 > "$AUTH_FILE"; fi
fi
chmod 600 "$AUTH_FILE"

TMP="$WORKER_DIR/worker.tmp"
URL="$BASE_URL/$ARTIFACT"
CHECKSUMS="$WORKER_DIR/SHA256SUMS"
echo "Downloading checksum manifest..."
curl --proto '=https' --tlsv1.2 -fL --retry 3 --retry-delay 1 "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS.tmp"
mv "$CHECKSUMS.tmp" "$CHECKSUMS"
echo "Downloading $ARTIFACT from $URL ..."
curl --proto '=https' --tlsv1.2 -fL --retry 3 --retry-delay 1 "$URL" -o "$TMP"
EXPECTED="$(awk -v file="$ARTIFACT" '$2 == file {print $1}' "$CHECKSUMS")"
[[ "$EXPECTED" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "Error: no valid checksum for $ARTIFACT"; rm -f "$TMP"; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then ACTUAL="$(sha256sum "$TMP" | awk '{print $1}')"; else ACTUAL="$(shasum -a 256 "$TMP" | awk '{print $1}')"; fi
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "Error: checksum verification failed"; rm -f "$TMP"; exit 1; }
echo "Checksum verified for $ARTIFACT."
chmod 755 "$TMP"
mv "$TMP" "$WORKER_DIR/compute-worker"

cat > "$WORKER_DIR/worker.env" <<EOF
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
WORKER_STATE_DIR=$WORKER_DIR
EOF
chmod 600 "$WORKER_DIR/worker.env"

if [[ "$OS" == "darwin" ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  PLIST="$HOME/Library/LaunchAgents/com.smg99.compute-worker.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.smg99.compute-worker</string>
<key>ProgramArguments</key><array><string>$WORKER_DIR/compute-worker</string></array>
<key>EnvironmentVariables</key><dict><key>CONTROL_PLANE_URL</key><string>$CONTROL_PLANE_URL</string><key>WORKER_STATE_DIR</key><string>$WORKER_DIR</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$WORKER_DIR/worker.log</string>
<key>StandardErrorPath</key><string>$WORKER_DIR/worker.err.log</string>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/com.smg99.compute-worker" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
else
  mkdir -p "$HOME/.config/systemd/user"
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
fi

echo "Compute Worker $RELEASE_VERSION installed at $WORKER_DIR/compute-worker"
echo "The daemon starts automatically, but compute remains disabled until local consent and a product compute request are both present."
