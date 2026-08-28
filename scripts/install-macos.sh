#!/bin/bash
# macOS Installer Script for Compute Worker
#
# Downloads the pre-built `worker.js` from the published GitHub release asset
# for v0.1.0. Does NOT require the user to have the repository cloned.
# This script does NOT start compute automatically.

set -e

echo "Starting Compute Worker installation for macOS..."

# Base URL for the pre-built release artifact (worker.js).
# Points at the published GitHub release asset for v0.1.0.
# Override by exporting COMPUTE_WORKER_RELEASE_BASE_URL before running.
COMPUTE_WORKER_RELEASE_BASE_URL="${COMPUTE_WORKER_RELEASE_BASE_URL:-https://github.com/smg99/compute-worker/releases/download/v0.1.0}"
WORKER_JS_URL="$COMPUTE_WORKER_RELEASE_BASE_URL/worker.js"

# Ensure Node.js runtime is available (no sudo installation)
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found in PATH. Install Node manually and retry."
  exit 1
fi

# Installation directory (per-user)
WORKER_DIR="$HOME/.compute-worker"
mkdir -p "$WORKER_DIR"

# Preserve existing auth.key or generate a new one
AUTH_FILE="$WORKER_DIR/auth.key"
if [[ -f "$AUTH_FILE" ]]; then
  echo "Preserving existing auth key."
else
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen > "$AUTH_FILE"
  else
    # fallback to openssl if uuidgen is missing
    openssl rand -hex 16 > "$AUTH_FILE"
  fi
  echo "Generated new auth key at $AUTH_FILE"
fi
chmod 600 "$AUTH_FILE"

# Download the pre-built worker.js from the GitHub release asset
echo "Downloading worker.js from $WORKER_JS_URL ..."
curl -fsSL "$WORKER_JS_URL" -o "$WORKER_DIR/worker.js"
if [[ ! -s "$WORKER_DIR/worker.js" ]]; then
  echo "Failed to download worker.js or file is empty."
  exit 1
fi
echo "worker.js installed to $WORKER_DIR"

# Create a simple launcher script (not a standalone binary)
cat > "$WORKER_DIR/compute-worker" <<'EOF'
#!/usr/bin/env bash
exec node "$(dirname "$0")/worker.js" "$@"
EOF
chmod +x "$WORKER_DIR/compute-worker"

# Optional: LaunchAgent for user-level persistence.
# The plist is created but NOT loaded — compute does not start automatically.
PLIST_PATH="$HOME/Library/LaunchAgents/com.smg99.compute-worker.plist"
cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.smg99.compute-worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>$WORKER_DIR/compute-worker</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$WORKER_DIR/worker.err.log</string>
    <key>StandardOutPath</key>
    <string>$WORKER_DIR/worker.out.log</string>
</dict>
</plist>
EOF

# launchctl load "$PLIST_PATH"  # intentionally disabled: do not start compute automatically

echo "Installation complete."
echo "Worker installed at $WORKER_DIR/worker.js"
echo "To start the worker manually: launchctl load $PLIST_PATH"
echo "Logs are available at $WORKER_DIR/worker.log"
