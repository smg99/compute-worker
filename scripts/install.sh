#!/usr/bin/env bash
set -e

# Compute Worker Installer (cross‑platform)
# This script can be executed directly via:
#   curl -fsSL https://example.com/install.sh | bash

# Base URL for pre‑built release artifacts. Must point to a location
# that hosts a `worker.js` file.
# Users can export this variable before running the installer to point
# to a custom location, e.g.:
#   export COMPUTE_WORKER_RELEASE_BASE_URL="https://github.com/owner/compute-worker/releases/download/v1.0.0"
COMPUTE_WORKER_RELEASE_BASE_URL="${COMPUTE_WORKER_RELEASE_BASE_URL:-}"
if [[ -z "$COMPUTE_WORKER_RELEASE_BASE_URL" ]]; then
  echo "Error: COMPUTE_WORKER_RELEASE_BASE_URL is not set."
  echo "Set it to the base URL that hosts a pre‑built 'worker.js' file before running the installer."
  exit 1
fi

# Detect OS / architecture (currently supports macOS and Linux)
OS=$(uname | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin) PLATFORM="macos" ;;
  linux)  PLATFORM="linux" ;;
  *) echo "Unsupported platform: $OS"; exit 1 ;;
esac

# Ensure Node.js runtime is available (no sudo installation)
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found in PATH. Install Node manually and retry."
  exit 1
fi

# Installation directory (per‑user)
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

# Download the pre‑built worker.js
WORKER_JS_URL="$COMPUTE_WORKER_RELEASE_BASE_URL/worker.js"
echo "Downloading worker.js from $WORKER_JS_URL ..."
curl -fsSL "$WORKER_JS_URL" -o "$WORKER_DIR/worker.js"
if [[ ! -s "$WORKER_DIR/worker.js" ]]; then
  echo "Failed to download worker.js or file is empty."
  exit 1
fi

echo "worker.js installed to $WORKER_DIR"

# Create a simple launcher script in the same directory
cat > "$WORKER_DIR/compute-worker" <<'EOF'
#!/usr/bin/env bash
exec node "$(dirname "$0")/worker.js" "$@"
EOF
chmod +x "$WORKER_DIR/compute-worker"

# Platform‑specific daemon/agent installation
echo "Logs are available at $WORKER_DIR/worker.log"
echo "You can control the daemon with launchctl (macOS) or systemctl --user (Linux)."
