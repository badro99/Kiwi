#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Kiwi Printer Bridge · Installateur Android / Termux (Box gratuite)
# ═══════════════════════════════════════════════════════════════════════════
# Transforme un ancien téléphone Android en pont d'impression permanent
# pour relayer les tickets d'un iPad vers l'imprimante réseau du café.
#
# Usage (dans Termux) :
#   curl -fsSL https://raw.githubusercontent.com/badro99/Kiwi/main/bridge/install-termux.sh | bash
#   bash install-termux.sh --pair 123456
# ═══════════════════════════════════════════════════════════════════════════

set -e

BRIDGE_DIR="$HOME/kiwi-bridge"
SERVER_JS="$BRIDGE_DIR/server.js"
BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/kiwi-bridge.sh"
CLI_LINK="$PREFIX/bin/kiwi-printer-bridge"

echo "────────────────────────────────────────────────────────────"
echo "  Kiwi Printer Bridge · Installation Android (Termux)"
echo "────────────────────────────────────────────────────────────"

# 1. Empêcher la mise en veille du CPU Android
if command -v termux-wake-lock >/dev/null 2>&1; then
  echo "→ Activation de l'anti-veille Android (termux-wake-lock)…"
  termux-wake-lock
fi

# 2. Installation des paquets nécessaires
echo "→ Vérification et installation de Node.js et curl…"
pkg update -y -q >/dev/null 2>&1 || true
pkg install -y -q nodejs curl >/dev/null 2>&1

mkdir -p "$BRIDGE_DIR"

# 3. Récupération de server.js
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
if [ -f "$SCRIPT_DIR/server.js" ]; then
  cp "$SCRIPT_DIR/server.js" "$SERVER_JS"
else
  echo "→ Téléchargement de server.js depuis GitHub…"
  curl -fsSL "https://raw.githubusercontent.com/badro99/Kiwi/main/bridge/server.js" -o "$SERVER_JS"
fi

# 4. Création du lanceur direct dans le PATH Termux
cat << 'EOF' > "$CLI_LINK"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
exec node "$HOME/kiwi-bridge/server.js" "$@"
EOF
chmod 755 "$CLI_LINK"

# 5. Configuration du démarrage automatique (Termux:Boot)
mkdir -p "$BOOT_DIR"
cat << 'EOF' > "$BOOT_SCRIPT"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
cd "$HOME/kiwi-bridge"
exec node server.js >> "$HOME/kiwi-bridge/bridge.log" 2>&1
EOF
chmod 755 "$BOOT_SCRIPT"

echo "✓ Fichiers installés dans $BRIDGE_DIR"
echo "✓ Démarrage automatique au boot configuré ($BOOT_SCRIPT)"

# 6. Démarrage du pont en arrière-plan (journal dans ~/kiwi-bridge/bridge.log)
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

if ! bridge_port >/dev/null 2>&1; then
  echo "→ Démarrage du pont…"
  nohup node "$SERVER_JS" >> "$BRIDGE_DIR/bridge.log" 2>&1 &
fi
if PORT="$(wait_bridge)"; then
  echo "✓ Le pont tourne sur http://127.0.0.1:$PORT/"
  [ -z "$PAIR_CODE" ] && PAIR_CODE="$(ask_code)"
  if [ -n "$PAIR_CODE" ]; then pair_via_api "$PORT" "$PAIR_CODE" || true; fi
else
  PORT=9110
  echo "✗ Le pont ne répond pas — voir : cat $BRIDGE_DIR/bridge.log" >&2
fi

# 7. Instructions
echo ""
echo "────────────────────────────────────────────────────────────"
echo "  ✓ Kiwi Printer Bridge est installé et tourne sur ce téléphone"
echo "────────────────────────────────────────────────────────────"
echo "  • Page locale : http://127.0.0.1:$PORT/ (dans Chrome sur ce téléphone : état, association)"
echo "  • Relancer à la main : kiwi-printer-bridge   ·   journal : cat $BRIDGE_DIR/bridge.log"
echo "  • Démarrage automatique : installez l'app Termux:Boot (F-Droid) et ouvrez-la une fois."
echo ""
echo "  CONSEILS INDISPENSABLES POUR CE TÉLÉPHONE :"
echo "  1. Laisser le téléphone branché en permanence sur chargeur."
echo "  2. Désactiver l'optimisation de batterie pour Termux dans les"
echo "     paramètres Android (Paramètres → Applications → Termux → Batterie → Sans restriction)."
echo "  3. Désactiver les données mobiles (4G) pour forcer le Wi-Fi du café."
echo "  4. Ne pas fermer Termux par « Exit » de la notification : minimisez-le."
echo "────────────────────────────────────────────────────────────"
