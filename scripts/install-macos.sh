#!/bin/bash
# MacOS Installer Script for Compute Worker

set -e

echo "Starting Compute Worker installation for macOS..."

# 1. Download binary (placeholder)
# curl -LO https://cdn.example.com/worker/latest/compute-worker-macos-arm64
# chmod +x compute-worker-macos-arm64
# mv compute-worker-macos-arm64 /usr/local/bin/compute-worker

# 2. Setup LaunchAgent for user-level persistence
PLIST_PATH="$HOME/Library/LaunchAgents/com.example.compute-worker.plist"

cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.compute-worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/compute-worker</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/compute-worker.err.log</string>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/compute-worker.out.log</string>
</dict>
</plist>
EOF

# launchctl load "$PLIST_PATH"

echo "Installation complete."
