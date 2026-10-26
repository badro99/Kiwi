# Network · preuves Wave L

## Rouge puis vert

La suite tools/network-recovery-test.mjs exécute les fichiers livrés dans node:vm, avec fetch, stockage et timers doubles. Les quatre fichiers runtime ont été sauvegardés dans /tmp, remplacés temporairement par leurs versions originales, la suite exécutée (code 1, six scénarios rouges), puis restaurés dans finally. La même suite passe ensuite (six scénarios). Aucun appel réseau réel.

- salle et menu : fetch infini reste pending sur ancien code ; timeout, abort, nettoyage des timers et relance passent après correction. Les fenêtres réelles affichent le message puis permettent une relance ; le bouton Annuler interrompt fetch.
- floor : ancien délai visible de 16000 ms échoue ; huit polls inchangés restent sous 15000 ms après correction, y compris avec KiwiPoll.delay à 600000 ; focus et visibilité déclenchent immédiatement un poll, page masquée sans timer.
- clients : ancien événement conservé sans lastFailure (undefined) échoue ; HTTP 503 puis rejet offline gardent le même événement avec leur raison, une réponse 200 seule le retire. Modifier le résultat public ne modifie pas la file.

## Suites Node

Toutes les suites ci-dessous passent. Les harnais menu-scan-i18n et request-pollers ont été adaptés (AbortController et attente des microtâches ; nouveau plafond limité à floor).

- app-bundle-test.mjs
- audit-remediation-inventory-loyalty-test.mjs
- clients-outbox-owner-test.mjs
- clients-properties-test.mjs
- clients-sync-tenant-test.mjs
- dashboard-truth-test.mjs
- economat-rd-invariants-test.mjs
- floor-live-test.mjs
- hotel-units-test.mjs
- import-test.js
- landing-claims-test.mjs
- locale-handoff-test.mjs
- lock-caisse-link-test.mjs
- lock-greeting-truth-test.mjs
- loyalty-refused-redemption-test.mjs
- loyalty-reserve-test.mjs
- loyalty-truth-test.mjs
- maison-client-history-test.mjs
- menu-analysis-test.mjs
- menu-scan-i18n-test.mjs
- menu-scan-test.mjs
- menu-truth-test.mjs
- native-pass5-test.mjs
- native-pass7-test.mjs
- network-recovery-test.mjs
- planning-layout-test.mjs
- quarantine-settlement-test.mjs
- request-pollers-test.mjs
- salle-scan-test.mjs
- sidebar-language-test.mjs
- till-truth-test.mjs
- type-policy-test.js
- file-size-ratchet-test.mjs
- pwa-shell-test.js
- dynamic-i18n-test.mjs
- strings-completeness-test.mjs
- source-assertion-ratchet-test.mjs
- check-guard-test.mjs

clients-properties-test ne saute aucun contrôle ; sorties conservées temporairement dans /tmp/network-results.json. Aucun pin augmenté. Aucun nouveau test de texte seul.

## Suites navigateur à lancer par le lead

- tools/app-interaction-test.mjs
- tools/avoir-customer-scope-browser-test.mjs
- tools/clients-book-page-browser-test.mjs
- tools/dashboard-breadcrumb-language-test.mjs
- tools/genpage-breadcrumb-language-test.mjs
- tools/hotel-direct-booking-browser-test.mjs
- tools/hotel-stays-group-browser-test.mjs
- tools/maison-caisse-browser-test.mjs
- tools/maison-shelf-price-browser-test.mjs
- tools/native-owner-home-browser-test.mjs
- tools/native-store-readiness-test.mjs
- tools/owner-identity-browser-test.mjs

## Livraison

Restamper assets/salle-scan.js, assets/menu-scan.js, assets/floorplan-live.js, assets/clients-store.js et assets/i18n.js. Aucun stamp, service worker ou index Git modifié. Le lead effectue le gate complet et le commit.

## Fichiers et lignes

| Fichier | Ajouts | Retraits |
| --- | ---: | ---: |
| assets/clients-store.js | 16 | 3 |
| assets/floorplan-live.js | 1 | 1 |
| assets/i18n.js | 4 | 0 |
| assets/menu-scan.js | 50 | 22 |
| assets/salle-scan.js | 35 | 15 |
| tools/check.js | 1 | 0 |
| tools/menu-scan-i18n-test.mjs | 2 | 2 |
| tools/request-pollers-test.mjs | 3 | 3 |
| tools/network-recovery-test.mjs (nouveau) | 119 | 0 |
| docs/decisions/2026-10-26-wave-l.md (nouveau) | 10 | 0 |

Ce rapport est également nouveau.
