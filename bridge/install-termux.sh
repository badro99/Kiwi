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

# 6. Appairage si code fourni en argument (--pair 123456)
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

if [ -n "$PAIR_CODE" ]; then
  echo "→ Appairage du pont avec le code $PAIR_CODE…"
  node "$SERVER_JS" --pair "$PAIR_CODE" || true
else
  if [ -t 0 ]; then
    echo ""
    read -r -p "Entrez le code d'appairage à 6 chiffres affiché sur l'iPad (ou appuyez sur Entrée pour configurer plus tard) : " USER_CODE
    if [ -n "$USER_CODE" ]; then
      node "$SERVER_JS" --pair "$USER_CODE" || true
    fi
  fi
fi

# 7. Instructions et démarrage
echo ""
echo "────────────────────────────────────────────────────────────"
echo "  ✓ Kiwi Printer Bridge est installé sur ce téléphone !"
echo "────────────────────────────────────────────────────────────"
echo "  • Page locale : http://127.0.0.1:9110/ (dans Chrome sur ce tél)"
echo "  • Pour lancer manuellement : kiwi-printer-bridge"
echo ""
echo "  CONSEILS INDISPENSABLES POUR CE TÉLÉPHONE :"
echo "  1. Laisser le téléphone branché en permanence sur chargeur."
echo "  2. Désactiver l'optimisation de batterie pour Termux dans les"
echo "     paramètres Android (Paramètres → Applications → Termux → Batterie → Sans restriction)."
echo "  3. Désactiver les données mobiles (4G) pour forcer le Wi-Fi du café."
echo "────────────────────────────────────────────────────────────"

# Si lancé interactivement, démarrer le pont en avant-plan
if [ -t 0 ] && [ -z "$PAIR_CODE" ]; then
  echo ""
  echo "→ Démarrage du pont maintenant…"
  exec node "$SERVER_JS"
fi
