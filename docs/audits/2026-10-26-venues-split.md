# Découpage venues · 26 octobre 2026

Deux parties enregistrent des fabriques inertes. Le noyau conserve les opérations d’identité, les API publiques et les effets au chargement. Les corps déplacés reconstruisent exactement l’original figé. Aucun changement produit.

Décision : [vague G](../decisions/2026-10-26-wave-g.md#venues).

## Fichiers modifiés

| Fichier | Lignes avant | Lignes après |
| --- | ---: | ---: |
| `assets/venues.js` | 5204 | 2450 |
| `dashboard.html` | 2377 | 2379 |
| `kiwi-sw.js` | 676 | 678 |
| `tools/action-honesty-test.js` | 83 | 84 |
| `tools/agent-features-test.mjs` | 154 | 155 |
| `tools/briefing-discounts-test.mjs` | 65 | 66 |
| `tools/check.js` | 2941 | 2943 |
| `tools/core-split-test.mjs` | 70 | 70 |
| `tools/core-test-source.cjs` | 82 | 99 |
| `tools/dashboard-kds-nav-test.mjs` | 30 | 31 |
| `tools/file-size-baseline.json` | 36 | 36 |
| `tools/floorplan-sync-test.js` | 584 | 585 |
| `tools/hospitality-plus-test.mjs` | 74 | 75 |
| `tools/install-card-icon-test.mjs` | 34 | 35 |
| `tools/ledger-cache-test.mjs` | 87 | 88 |
| `tools/legacy-venue-modals-test.mjs` | 219 | 220 |
| `tools/material-icons-test.mjs` | 201 | 202 |
| `tools/menu-analysis-test.mjs` | 186 | 187 |
| `tools/native-audit-fixes-test.mjs` | 215 | 216 |
| `tools/operator-snapshot-test.mjs` | 322 | 322 |
| `tools/ownership-manifest.json` | 2507 | 2511 |
| `tools/pairing-resolver-test.mjs` | 921 | 922 |
| `tools/pressing-workspace-test.js` | 184 | 185 |
| `tools/sale-invoice-test.mjs` | 527 | 528 |
| `tools/sale-line-v2-test.mjs` | 178 | 179 |
| `tools/sales-reconcile-test.mjs` | 198 | 198 |
| `tools/sales-trim-test.mjs` | 174 | 175 |
| `tools/service-trades-truth-test.mjs` | 277 | 278 |
| `tools/sidebar-language-test.mjs` | 96 | 97 |
| `tools/skin-cloak-test.mjs` | 70 | 71 |
| `tools/sold-insights-test.js` | 68 | 69 |
| `tools/store-clock-test.mjs` | 92 | 93 |
| `tools/trade-workspaces-test.js` | 106 | 107 |
| `tools/vertical-feature-parity-test.mjs` | 47 | 48 |
| `assets/venues/data.js` | 0 | 2239 |
| `assets/venues/helpers.js` | 0 | 725 |
| `docs/decisions/2026-10-26-wave-g.md` | 0 | 5 |
| `tools/fixtures/venues-split/original.js.gz` | absent | 94800 octets |
| `tools/fixtures/venues-split/split.json` | 0 | 360 |
| `tools/venues-split-browser-test.mjs` | 0 | 54 |
| `tools/venues-split-test.mjs` | 0 | 111 |

## Preuves et vérifications

- Rouge initial : `venues-split-test.mjs` refuse le noyau de 5 204 lignes. Vert après : 2 450 lignes, parties de 2 239 et 725 lignes. Reconstruction octet pour octet, emprunts lexicaux, enregistrement inerte, ordre et précache vérifiés. Exécution originale et réelle comparée pour identité, ventes, isolation des locataires et recettes.
- Référence avant modification : 38/38 contrôles ciblés verts. Après : 39/39, dont les 36 suites non navigateur mentionnant `venues.js`, le nouveau test, ownership et le ratchet. PWA : 917 vérifications ; ratchet : 730.
- Complément : 160 contrôles exécutés, 158 verts après correction du comptage des scripts et de l’attribution des icônes déplacées ; deux restent rouges pour les stamps uniquement. Aucune tolérance d’icônes augmentée.
- Une seule suite navigateur, via `browser-slot.sh` : `venues-split-browser-test.mjs`, deux scénarios FR verts, démo et opérateur synthétique. Ressources chargées vérifiées dans le navigateur. Aucun appel aux services distants.
- Syntaxe des trois fichiers et `git diff --check` verts.
- Tous les HTML inventoriés : seul `dashboard.html` charge le noyau. Scripts : 114 → 116 ; plafond 122 inchangé. Pin du noyau : 5 068 → 2 450. Aucun autre pin modifié.

## À terminer par le lead

Restamper `assets/venues.js`, `assets/venues/data.js`, `assets/venues/helpers.js`. Les contrôles `stamp-drift-test.js` et `asset-stamp-coverage-test.mjs` attendent cette opération autorisée au lead. Aucun stamp, manifeste de stamps ou numéro de génération du service worker modifié. Gate complet et commit laissés au lead ; aucun push.
