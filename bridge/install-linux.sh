#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Kiwi Printer Bridge · Installateur Linux / Raspberry Pi (service systemd)
# ═══════════════════════════════════════════════════════════════════════════
# Installe le pont d'impression en service d'arrière-plan permanent sur
# Raspberry Pi, Debian ou Ubuntu. Redémarre automatiquement en cas de coupure.
#
# Usage :
#   sudo bash install-linux.sh
#   sudo bash install-linux.sh --pair 123456
# ═══════════════════════════════════════════════════════════════════════════

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ Ce script doit être exécuté en root (sudo bash install-linux.sh)." >&2
  exit 1
fi

BIN_TARGET="/usr/local/bin/kiwi-printer-bridge"
SERVICE_PATH="/etc/systemd/system/kiwi-printer-bridge.service"
RELEASE_BASE="https://github.com/badro99/Kiwi/releases/latest/download"
ARCH="$(uname -m)"

echo "─"
echo "  Kiwi Printer Bridge · Installation Linux / Raspberry Pi ($ARCH)"
echo "─"

# 1. Récupération ou installation du binaire
if [ "$ARCH" = "x86_64" ]; then
  echo "→ Téléchargement du binaire Linux x86_64 depuis GitHub Releases…"
  curl -fsSL "$RELEASE_BASE/kiwi-printer-bridge-linux" -o "$BIN_TARGET" || {
    echo "  (Téléchargement direct échoué, vérification de Node.js…)"
  }
fi

if [ ! -s "$BIN_TARGET" ] || [ ! -x "$BIN_TARGET" ]; then
  # Architecture ARM (Raspberry Pi) ou téléchargement indisponible : installation via Node.js natif
  echo "→ Configuration du pont avec le moteur Node.js…"
  if ! command -v node >/dev/null 2>&1; then
    echo "→ Installation de Node.js via le gestionnaire de paquets…"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq nodejs curl >/dev/null 2>&1 || true
    fi
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "✗ Node.js n'a pas pu être installé automatiquement. Installez Node.js (apt install nodejs) puis relancez." >&2
    exit 1
  fi

  LIB_DIR="/usr/local/lib/kiwi-printer-bridge"
  mkdir -p "$LIB_DIR"

  # Si le script est exécuté depuis le clone Kiwi, copier server.js ; sinon le télécharger
  SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
  if [ -f "$SCRIPT_DIR/server.js" ]; then
    cp "$SCRIPT_DIR/server.js" "$LIB_DIR/server.js"
  else
    curl -fsSL "https://raw.githubusercontent.com/badro99/Kiwi/main/bridge/server.js" -o "$LIB_DIR/server.js"
  fi

  cat << 'EOF' > "$BIN_TARGET"
#!/bin/sh
exec /usr/bin/env node /usr/local/lib/kiwi-printer-bridge/server.js "$@"
EOF
fi

chmod 755 "$BIN_TARGET"
echo "✓ Binaire installé dans $BIN_TARGET"

# 2. Création de l'unité systemd
cat << 'EOF' > "$SERVICE_PATH"
[Unit]
Description=Kiwi Printer Bridge (Relais d'impression thermique ESC/POS)
Documentation=https://kiwi-os.com/printer
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/kiwi-printer-bridge
Restart=always
RestartSec=2
Environment=KIWI_RELAY_URL=https://kiwi-os.com
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Service systemd configuré dans $SERVICE_PATH"

# 3. Activation et démarrage
systemctl daemon-reload
systemctl enable --now kiwi-printer-bridge.service
echo "✓ Service activé et démarré (Restart=always)"

# 4. Appairage si code fourni en argument (--pair 123456)
PAIR_CODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pair|-p)
      PAIR_CODE="$2"
      shift 2
      ;;
    *)
      if [[ "$1" =~ ^[0-9]{6}$ ]]; then
        PAIR_CODE="$1"
      fi
      shift
      ;;
  esac
done

sleep 1

if [ -n "$PAIR_CODE" ]; then
  echo "→ Appairage du pont avec le code $PAIR_CODE…"
  "$BIN_TARGET" --pair "$PAIR_CODE" || true
else
  # Si terminal interactif, proposer la saisie
  if [ -t 0 ]; then
    echo ""
    read -r -p "Entrez le code d'appairage à 6 chiffres affiché sur l'iPad (ou appuyez sur Entrée pour configurer plus tard) : " USER_CODE
    if [ -n "$USER_CODE" ]; then
      "$BIN_TARGET" --pair "$USER_CODE" || true
    fi
  fi
fi

# 5. État et instructions
IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"
echo ""
echo "────────────────────────────────────────────────────────────"
echo "  ✓ Kiwi Printer Bridge est prêt et tourne en arrière-plan !"
echo "────────────────────────────────────────────────────────────"
echo "  • Page locale : http://127.0.0.1:9110/ (ou http://$IP_ADDR:9110/)"
echo "  • Statut service : systemctl status kiwi-printer-bridge"
echo "  • Logs en direct : journalctl -u kiwi-printer-bridge -f"
echo "  • Appairage : Kiwi → Imprimantes → Relais Kiwi → Associer un pont"
echo "────────────────────────────────────────────────────────────"
