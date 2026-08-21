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

# 4. Appairage (code passé en argument, ou demandé au clavier)
PAIR_CODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pair|-p) PAIR_CODE="$2"; shift 2 ;;
    *) if [[ "$1" =~ ^[0-9]{6}$ ]]; then PAIR_CODE="$1"; fi; shift ;;
  esac
done

# ── Appairage : par l'API LOCALE du pont qui tourne déjà ──────────────────────
# Pourquoi pas `kiwi-printer-bridge --pair` ici : cela lancerait un DEUXIÈME
# pont (qui s'appaire puis reste à écouter, donc le script ne rend jamais la
# main), et le service déjà démarré ne relirait pas la configuration. On parle
# donc au service en place, qui écrit lui-même son jeton.
bridge_port() {
  for p in 9110 9111 9112 9113 9114; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$p/kiwi/ping" 2>/dev/null | grep -q '"name":"kiwi-printer-bridge"'; then
      echo "$p"; return 0
    fi
  done
  return 1
}
wait_bridge() {
  for _ in $(seq 1 40); do
    if P="$(bridge_port)"; then echo "$P"; return 0; fi
    sleep 0.5
  done
  return 1
}
pair_via_api() {
  local port="$1" code="$2" out
  out="$(curl -sS --max-time 20 -X POST -H 'Content-Type: application/json' \
        -d "{\"code\":\"$code\"}" "http://127.0.0.1:$port/kiwi/relay/pair" 2>/dev/null || true)"
  if printf '%s' "$out" | grep -q '"ok":true'; then
    echo "✓ Pont associé au commerce $(printf '%s' "$out" | sed -n 's/.*"merchant":"\([^"]*\)".*/\1/p')."
    return 0
  fi
  echo "✗ Appairage refusé : $(printf '%s' "$out" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')" >&2
  echo "  (code invalide ou expiré ? regénérez-le dans Kiwi → Imprimantes → Relais Kiwi, puis :"
  echo "   curl -X POST -H 'Content-Type: application/json' -d '{\"code\":\"123456\"}' http://127.0.0.1:$port/kiwi/relay/pair )"
  return 1
}
# `curl … | bash` : l'entrée standard est le tube, pas le clavier — on lit le
# code sur /dev/tty, sinon la question ne serait jamais posée.
ask_code() {
  local c=""
  if [ -r /dev/tty ]; then
    printf '%s' "Entrez le code d'appairage à 6 chiffres affiché dans Kiwi (Entrée pour le faire plus tard) : " > /dev/tty
    IFS= read -r c < /dev/tty || true
  fi
  printf '%s' "$c" | tr -dc '0-9' | cut -c1-6
}

if PORT="$(wait_bridge)"; then
  echo "✓ Le service répond sur http://127.0.0.1:$PORT/"
  [ -z "$PAIR_CODE" ] && PAIR_CODE="$(ask_code)"
  if [ -n "$PAIR_CODE" ]; then pair_via_api "$PORT" "$PAIR_CODE" || true; fi
else
  PORT=9110
  echo "✗ Le service ne répond pas encore — voir : journalctl -u kiwi-printer-bridge -n 30" >&2
fi

# 5. État et instructions
echo ""
echo "────────────────────────────────────────────────────────────"
echo "  ✓ Kiwi Printer Bridge est prêt et tourne en arrière-plan !"
echo "────────────────────────────────────────────────────────────"
echo "  • Page locale : http://127.0.0.1:$PORT/ (sur cette machine uniquement — le pont n'écoute pas sur le réseau)"
echo "  • Statut service : systemctl status kiwi-printer-bridge"
echo "  • Logs en direct : journalctl -u kiwi-printer-bridge -f"
echo "  • (Ré)appairage : Kiwi → Imprimantes → Relais Kiwi → Associer un pont, puis"
echo "    curl -X POST -H 'Content-Type: application/json' -d '{\"code\":\"123456\"}' http://127.0.0.1:$PORT/kiwi/relay/pair"
echo "────────────────────────────────────────────────────────────"
