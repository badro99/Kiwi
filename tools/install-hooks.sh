#!/bin/sh
# Kiwi · installe les hooks git versionnés (tools/hooks/*) dans ce clone.
#   sh tools/install-hooks.sh
# Idempotent. Un hook déjà présent qui n'est pas à nous est conservé sous
# <hook>.local et chaîné (le post-commit graphify, par exemple, reste intact).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS="$(git -C "$ROOT" rev-parse --git-path hooks)"
case "$HOOKS" in /*) ;; *) HOOKS="$ROOT/$HOOKS" ;; esac
mkdir -p "$HOOKS"
for src in "$ROOT"/tools/hooks/*; do
  name="$(basename "$src")"
  dst="$HOOKS/$name"
  if [ -f "$dst" ] && ! grep -q 'kiwi-hook-dispatch' "$dst"; then
    mv "$dst" "$dst.local"
    echo "  · $name existant conservé sous $name.local (chaîné)"
  fi
  cat > "$dst" <<DISPATCH
#!/bin/sh
# kiwi-hook-dispatch — généré par tools/install-hooks.sh ; la logique vit dans tools/hooks/$name
REPO="\$(git rev-parse --show-toplevel)"
if [ -x "\$REPO/tools/hooks/$name" ]; then "\$REPO/tools/hooks/$name" "\$@" || exit \$?; fi
[ -x "\$(dirname "\$0")/$name.local" ] && exec "\$(dirname "\$0")/$name.local" "\$@"
exit 0
DISPATCH
  chmod +x "$dst"
  echo "  ✓ $name → $dst"
done
