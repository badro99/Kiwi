#!/bin/bash
# Synchronise badro99/Kiwi (partenaire + GitHub Pages) vers zaka33333-hash/Kiwi
# (le dépôt que Cloudflare Pages construit). Tourne en tâche de fond via launchd
# — voir ~/Library/LaunchAgents/com.kiwi.cloudflare-sync.plist
#
# Pourquoi ce script existe : rien ne relie les deux dépôts GitHub. Le partenaire
# pousse sur badro99, Cloudflare ne regarde que le fork. Sans ça, la production
# reste sur un vieux commit sans que personne ne le voie. C'est arrivé sept fois
# en une seule journée le 2026-07-28.
#
# Pourquoi cette approche plutôt qu'une GitHub Action : les workflows planifiés
# (`schedule`) ne s'exécutent JAMAIS dans un dépôt forké — règle GitHub. Et un
# mirroir poussé depuis badro99 exigerait un PAT stocké en secret. Ici, `gh` est
# déjà authentifié sur cette machine : zéro secret à créer.
#
# Le script ne touche PAS l'arbre de travail local — un seul appel API. Il peut
# donc tourner pendant qu'on code sans rien perturber.

set -uo pipefail

FORK="zaka33333-hash/Kiwi"
LOG="$HOME/Library/Logs/kiwi-cloudflare-sync.log"
GH="/opt/homebrew/bin/gh"

mkdir -p "$(dirname "$LOG")"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"; }

# Garde le journal sous 2000 lignes.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

body=$("$GH" api -X POST "repos/${FORK}/merge-upstream" -f branch=main 2>&1)
status=$?

if [ $status -eq 0 ]; then
  case "$body" in
    *fast-forward*)
      sha=$("$GH" api "repos/${FORK}/commits/main" --jq '.sha' 2>/dev/null | cut -c1-7)
      log "SYNCHRONISÉ → ${sha:-?} · Cloudflare Pages lance son build."
      ;;
    *)
      # Réponse "none" : déjà à jour. Silencieux — sinon le journal se noie.
      ;;
  esac
  exit 0
fi

# Échec. Le cas qui compte : les deux branches ont divergé (quelqu'un a poussé
# sur le fork sans passer par badro99), et là aucune synchro automatique ne peut
# décider à notre place.
if printf '%s' "$body" | grep -qi 'conflict\|diverged\|409'; then
  log "DIVERGENCE — le fork a des commits absents de badro99. Intervention manuelle requise."
  log "  $body"
  osascript -e 'display notification "Le fork a divergé de badro99. La production ne se met plus à jour toute seule." with title "Kiwi · synchro Cloudflare bloquée"' 2>/dev/null
else
  log "ÉCHEC — $body"
fi
exit 1
