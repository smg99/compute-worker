#!/usr/bin/env bash
set -euo pipefail

RELEASE_VERSION="${COMPUTE_WORKER_RELEASE_VERSION:-v0.2.0}"
BASE_URL="${COMPUTE_WORKER_RELEASE_BASE_URL:-https://github.com/smg99/compute-worker/releases/download/${RELEASE_VERSION}}"
CONTROL_PLANE_URL="${COMPUTE_WORKER_CONTROL_PLANE_URL:-}"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ARTIFACT="compute-worker-darwin-arm64" ;;
  x86_64) ARTIFACT="compute-worker-darwin-x64" ;;
  *) echo "Unsupported macOS architecture: $ARCH"; exit 1 ;;
esac
if [[ -z "$CONTROL_PLANE_URL" ]]; then
  echo "Error: COMPUTE_WORKER_CONTROL_PLANE_URL is required."; exit 1
fi
WORKER_DIR="$HOME/.compute-worker"
mkdir -p "$WORKER_DIR" "$HOME/Library/LaunchAgents"
AUTH_FILE="$WORKER_DIR/auth.key"
if [[ ! -f "$AUTH_FILE" ]]; then uuidgen > "$AUTH_FILE" 2>/dev/null || openssl rand -hex 32 > "$AUTH_FILE"; fi
chmod 600 "$AUTH_FILE"
TMP="$WORKER_DIR/worker.tmp"
curl -fL --retry 3 "$BASE_URL/$ARTIFACT" -o "$TMP"
chmod 755 "$TMP"
mv "$TMP" "$WORKER_DIR/compute-worker"
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
echo "Installed $ARTIFACT to $WORKER_DIR/compute-worker and loaded the safe worker daemon."
