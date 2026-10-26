# Wave L · small · preuves

Les cinq écarts sont corrigés. Aucun commit, push, changement de stamp, de génération SW ou hausse de pin.

## Preuves rouges puis vertes

Chaque restauration a été faite dans ce worktree par lecture de `git show HEAD:<fichier>`, écriture temporaire de l’ancien contenu, exécution ciblée, puis restauration garantie du contenu modifié. Aucun git en écriture.

- Booking : `wave-l-style-test.mjs booking`, ancien CSS exit 1, restauré exit 0 (pseudo-élément transparent : 36 + 8 = 44 px).
- Pressing : `wave-l-style-test.mjs pressing`, ancien CSS exit 1, restauré exit 0 (marge logique).
- Économat : `economat-pagination-test.mjs`, ancien JS exit 1, restauré exit 0 (251 résultats, trois pages et suggestions, FR/EN/AR, recherche et réouverture).
- Gate : `check-verdict-test.mjs`, ancien verdict final extrait sans modification de comportement exit 1, nouveau module restauré exit 0. Toutes les combinaisons des deux overrides, acceptation et présence d’échecs sont exécutées. Le full utilise ce module, sans lancer le gate pendant ce travail.
- Shopify : `shopify-replay-orders-test.mjs`, anciennes routes restaurées temporairement : cinq assertions de progression/exception en échec, exit 1 ; nouvelles routes restaurées : exit 0. Harness SQLite depuis schema.sql, vraies routes POST et GET, reprise 1000/1002, erreur puis reprise, exception sans mouvement partiel, aperçu sans écriture.

## Fixtures et stamps

`hotel-economat.js` ne figure dans aucun corps/fragment de reconstruction des fixtures : uniquement dans `tools/fixtures/hotel/split-2.json`, `scriptsBefore[154]`, comme balise de chargement. Aucune fixture à régénérer.

À restamper par le lead : `assets/reservations.css`, `assets/pressing-caisse.css`, `assets/hotel-economat.js`. Le test stamp-drift échoue exactement pour ces trois fichiers, conformément à la consigne de ne pas déplacer les stamps.

## Suites ciblées

- `tools/android-native-test.mjs` : PASS.
- `tools/android-print-bridge-test.mjs` : PASS.
- `tools/app-bundle-test.mjs` : PASS.
- `tools/audit-remediation-devices-test.mjs` : PASS.
- `tools/cashier-cancel-test.mjs` : PASS.
- `tools/check-parallel-test.mjs` : PASS.
- `tools/economat-pagination-test.mjs` : PASS.
- `tools/economat-rd-invariants-test.mjs` : PASS.
- `tools/economat-real-d1-transfer-test.mjs` : PASS, 20 contrôles sur le vrai D1 local.
- `tools/hotel-economat-ui-test.mjs` : PASS.
- `tools/hotel-units-test.mjs` : PASS.
- `tools/import-test.js` : PASS.
- `tools/landing-claims-test.mjs` : PASS.
- `tools/native-pass5-test.mjs` : PASS.
- `tools/pressing-workspace-test.js` : PASS.
- `tools/relay-print-verdict-test.mjs` : PASS.
- `tools/sale-line-v2-test.mjs` : PASS.
- `tools/shopify-connector-test.mjs` : PASS.
- `tools/shopify-replay-orders-test.mjs` : PASS.
- `tools/shopify-sync-properties-test.mjs` : PASS.
- `tools/stamp-drift-test.js` : Échec attendu, stamps réservés au lead.
- `tools/till-truth-test.mjs` : PASS.
- `tools/trade-cash-presets-test.mjs` : PASS.
- `tools/wave-l-style-test.mjs` : PASS.
- `tools/check-verdict-test.mjs` : PASS.
- `tools/file-size-ratchet-test.mjs` : PASS.
- `tools/pwa-shell-test.js` : PASS.
- `tools/dynamic-i18n-test.mjs` : PASS.
- `tools/source-assertion-ratchet-test.mjs` : PASS.

Le garde i18n reste à 3271 écritures héritées, zéro régression ; le ratchet tailles et les 945 contrôles PWA passent. Les nouveaux tests sont nommés dans check.js ; le test CSS est déclaré sous style dans le manifeste source.

## Suites navigateur pour le lead

Aucune lancée. Liste des suites qui nomment un fichier modifié, selon la sélection textuelle et la classification locale :

- `tools/app-interaction-test.mjs`
- `tools/caisse-ink-dark-browser-test.mjs`
- `tools/dash-phone-pages-ar-browser-test.mjs`
- `tools/dash-phone-pages-browser-test.mjs`
- `tools/dash-phone-pages-kit-browser-test.mjs`
- `tools/dash-phone-sheets-ar-browser-test.mjs`
- `tools/hotel-direct-booking-browser-test.mjs`
- `tools/hotel-stays-group-browser-test.mjs`
- `tools/maison-dashboard-browser-test.mjs`
- `tools/native-owner-home-browser-test.mjs`
- `tools/native-store-readiness-test.mjs`
- `tools/surface-matrix-states-ops-browser-test.mjs`
- `tools/sync-ledger-boutique-browser-test.mjs`
- `tools/sync-ledger-browser-test.mjs`
- `tools/trades-ledger-browser-test.mjs`
- `tools/trades-ledger-care-browser-test.mjs`
- `tools/trades-ledger-retail-browser-test.mjs`

`source-assertion-ratchet-test.mjs` est classé navigateur par les mots de son propre classificateur, mais ne lance aucun navigateur : exécuté et vert. `check-guard-test.mjs` utilise notamment des exécutables factices, mais invoque aussi le vrai check.js pour son préflight : laissé au lead pour respecter l’interdiction absolue de lancer check.js.

D1 local a d’abord rencontré les chemins npm/Wrangler interdits, puis passé avec : `npm_config_cache=/tmp/kiwi-l-npm-cache WRANGLER_REGISTRY_PATH=/tmp/kiwi-l-wrangler-registry WRANGLER_LOG_PATH=/tmp/kiwi-l-wrangler-logs XDG_CONFIG_HOME=/tmp/kiwi-l-xdg node tools/economat-real-d1-transfer-test.mjs`.

## Limites et suite

Le full gate et les navigateurs restent au lead. Le statut Shopify annonce remaining=null tant que hasNextPage est vrai, puis zéro ; les exceptions restent listées séparément du nombre done. Les lots restent déclenchés par l’action de reprise existante. Aucun schéma ni migration ajouté.

## Fichiers modifiés (lignes ajoutées / supprimées)

| Fichier | + / − |
| --- | ---: |
| `assets/hotel-economat.js` | 37 / 11 |
| `assets/pressing-caisse.css` | 1 / 1 |
| `assets/reservations.css` | 1 / 1 |
| `functions/api/shopify/_replay-orders.js` | 49 / 29 |
| `functions/api/shopify/status.js` | 8 / 2 |
| `tools/check.js` | 8 / 0 |
| `tools/shopify-replay-orders-test.mjs` | 44 / 2 |
| `tools/source-assertion-manifest.json` | 1 / 0 |
| `tools/check-verdict.cjs` | 12 / 0 |
| `tools/check-verdict-test.mjs` | 12 / 0 |
| `tools/economat-pagination-test.mjs` | 47 / 0 |
| `tools/wave-l-style-test.mjs` | 23 / 0 |
| `docs/decisions/2026-10-26-wave-l.md` | 13 / 0 |
| `docs/audits/2026-10-26-wave-l-small.md` | 102 / 0 |
