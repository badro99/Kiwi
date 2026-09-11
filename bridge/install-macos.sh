#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Kiwi Printer Bridge · Installateur LaunchAgent macOS
# ═══════════════════════════════════════════════════════════════════════════
# Configure le pont pour démarrer automatiquement à la connexion et
# redémarrer immédiatement en cas de fermeture ou d'incident (KeepAlive).
#
# Usage :
#   bash bridge/install-macos.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

PLIST_NAME="com.kiwi.printer-bridge.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"

mkdir -p "$TARGET_DIR"

# Détection de l'exécutable
EXEC_PATH="/Applications/Kiwi Printer.app/Contents/MacOS/kiwi-printer-bridge-macos"
if [ ! -f "$EXEC_PATH" ]; then
  if [ -f "$HOME/Applications/Kiwi Printer.app/Contents/MacOS/kiwi-printer-bridge-macos" ]; then
    EXEC_PATH="$HOME/Applications/Kiwi Printer.app/Contents/MacOS/kiwi-printer-bridge-macos"
  elif [ -f "/usr/local/bin/kiwi-printer-bridge" ]; then
    EXEC_PATH="/usr/local/bin/kiwi-printer-bridge"
  elif [ -f "$SCRIPT_DIR/server.js" ]; then
    EXEC_PATH="$(which node 2>/dev/null || echo "/usr/local/bin/node")"
    NODE_ARGS="<string>$SCRIPT_DIR/server.js</string>"
  fi
fi

cat << EOF > "$TARGET_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kiwi.printer-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>$EXEC_PATH</string>
        ${NODE_ARGS:-}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/kiwi-printer-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/kiwi-printer-bridge.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>KIWI_RELAY_URL</key>
        <string>https://kiwi-os.com</string>
    </dict>
</dict>
</plist>
EOF

echo "✓ LaunchAgent écrit dans $TARGET_PLIST"

# Rechargement
launchctl unload "$TARGET_PLIST" 2>/dev/null || true
launchctl load -w "$TARGET_PLIST"

echo "✓ Service LaunchAgent activé et démarré."
echo "  • Logs : tail -f /tmp/kiwi-printer-bridge.log"
echo "  • Statut : curl -s http://127.0.0.1:9110/kiwi/relay"
