# Q-ops, compte rendu du 26 octobre 2026

Les quatre décisions du message utilisateur sont implémentées. Le fichier `docs/decisions/2026-10-26-wave-q.md` annoncé est absent de ce checkout. Aucune commande git en écriture, aucun navigateur, aucun appel payant, aucune migration ou action en production.

## Changements

- Relais : expiration maintenue à dix minutes, liste des jobs non imprimés pendant 24 h après expiration, réimpression explicite par identifiant déterministe. Le panneau partagé caisse/dashboard propose Réimprimer en FR/EN/AR.
- Identités : 72 h hors ligne, autorisations manager limitées à une preuve en ligne de moins de 24 h, y compris le pavé 2027. Le roster en ligne invalide immédiatement tous les anciens vérificateurs, qui doivent être prouvés à nouveau. Une génération empêche une dérivation en cours de restaurer un vérificateur révoqué. Échéance affichée dans le verrouillage en FR/EN/AR.
- Carnet : les règlements complets hors ligne portent leur instantané de dette. La route de sauvegarde déduit une alerte unique par instantané payé plusieurs fois. Les paiements restent conservés en avance. La fiche client affiche cette alerte et lie au carnet propriétaire, qui conserve son action existante de remboursement.
- Pressing : le personnel choisit appel, SMS, WhatsApp ou en personne et marque le client prévenu. Identité, date et canal persistent dans le document et sa projection dashboard. Les anciens booléens se lisent comme marqués sans canal. Aucun message envoyé par Kiwi.

## Fichiers, lignes ajoutées / supprimées

| Fichier | + | - |
|---|---:|---:|
| `assets/caisse-lang.js` | 23 | 2 |
| `assets/caisse-pairing.js` | 28 | 12 |
| `assets/i18n.js` | 6 | 0 |
| `assets/kit/till-pin.js` | 1 | 1 |
| `assets/offline-pin-coverage.js` | 5 | 4 |
| `assets/pos-epicerie.js` | 5 | 0 |
| `assets/pressing-caisse.js` | 12 | 14 |
| `assets/pressing-dashboard.js` | 1 | 1 |
| `assets/pressing-ops.js` | 27 | 2 |
| `assets/printer-bridge.js` | 1 | 0 |
| `assets/printer/pairing-ui.js` | 16 | 0 |
| `assets/trade-workspaces.js` | 1 | 1 |
| `assets/vertical-state.js` | 2 | 0 |
| `functions/api/_credit-book-refund.js` | 17 | 0 |
| `functions/api/print/_relay.js` | 1 | 0 |
| `functions/api/print/jobs.js` | 24 | 4 |
| `functions/api/store.js` | 3 | 1 |
| `tools/caisse-pairing-kdf-test.mjs` | 27 | 1 |
| `tools/credit-book-properties-test.mjs` | 9 | 0 |
| `tools/credit-book-test.mjs` | 7 | 0 |
| `tools/pressing-edge-test.mjs` | 1 | 0 |
| `tools/pressing-truth-test.mjs` | 14 | 0 |
| `tools/pressing-workspace-test.js` | 2 | 2 |
| `tools/print-relay-properties-test.mjs` | 15 | 0 |

Ce compte rendu est le seul fichier documentaire ajouté. Les stamps, le service worker et les baselines restent inchangés. Aucun nouveau fichier de test : les régressions étendent des suites déjà nommées dans `tools/check.js`. Aucun élément de la baseline des problèmes connus ne correspond à ces quatre garanties ; les nouvelles assertions sont strictes.

## Preuve rouge puis verte

Protocole : copie des fichiers modifiés en mémoire, remplacement temporaire par `git show HEAD:<chemin>` avec écritures de fichiers ordinaires, exécution des suites modifiées, restauration dans un bloc finally. Les cinq suites ci-dessous échouent sur HEAD et passent avec le correctif. Les logs temporaires sont sous `/tmp/q-ops-red-<suite>.log`.

| Suite | Échec constaté sur HEAD |
|---|---|
| `caisse-pairing-kdf-test.mjs` | manager accepté à 24 h ; horloge simulée aux limites 24 h/72 h, purge du roster |
| `print-relay-properties-test.mjs` | liste des expirés absente ; propriété de réimpression concurrente unique |
| `credit-book-properties-test.mjs` | alerte absente après synchronisation de deux caisses ; avance exacte conservée |
| `credit-book-test.mjs` | règlement réel sans marqueur hors ligne/instantané commun |
| `pressing-truth-test.mjs` | marqueur personnel/canal absent ; contrôle des quatre canaux et du booléen ancien |

## Suites sans navigateur

Dernier passage : 140 scripts sélectionnés, 136 réussites, 4 échecs. La sélection inclut aussi les helpers dont le nom contient test, exécutés sans effet.

Échecs attendus à traiter par le lead :

- `audit-remediation-devices-test.mjs`, `print-relay-test.mjs` : écoute sur 127.0.0.1 refusée avec EPERM dans ce sandbox. Les routes du relais sont néanmoins exercées directement sur la fixture SQLite par les propriétés.
- `printer-split-test.mjs`, `printer-transports-split-test.mjs` : preuves byte-exact à resceller après les changements du panneau et du passage de ses helpers. Fixtures laissées intactes.

`file-size-ratchet-test.mjs` : 783 contrôles verts, aucun pin relevé. `pwa-shell-test.js` : 957 contrôles verts. Syntaxe des fichiers modifiés et `git diff --check` verts. Aucun lancement de `tools/check.js`.

Liste complète du dernier passage :

- `accountant-portal-test.mjs` : PASS
- `android-print-bridge-test.mjs` : PASS
- `audit-remediation-auth-test.mjs` : PASS
- `audit-remediation-devices-test.mjs` : ÉCHEC, voir motif ci-dessus
- `audit-remediation-inventory-loyalty-test.mjs` : PASS
- `audit-remediation-pressing-test.mjs` : PASS
- `booking-properties-test.mjs` : PASS
- `briefing-cash-sessions-test.mjs` : PASS
- `briefing-discounts-test.mjs` : PASS
- `briefing-test.mjs` : PASS
- `caisse-client-sale-test.mjs` : PASS
- `caisse-color-picker-language-test.mjs` : PASS
- `caisse-handoff-demo-reload-test.mjs` : PASS
- `caisse-lang-test.js` : PASS
- `caisse-offline-pin-test.mjs` : PASS
- `caisse-pairing-kdf-test.mjs` : PASS
- `caisse-pairing-recovery-test.mjs` : PASS
- `caisse-pairing-repair-test.mjs` : PASS
- `caisse-pressing-hotel-lang-test.mjs` : PASS
- `caisse-repair-pin-venue-test.mjs` : PASS
- `caisse-surface-lang-test.js` : PASS
- `cash-move-custom-reason-test.mjs` : PASS
- `catalog-merge-test.js` : PASS
- `channel-properties-test.mjs` : PASS
- `clients-display-properties-test.mjs` : PASS
- `clients-outbox-owner-test.mjs` : PASS
- `clients-properties-test.mjs` : PASS
- `clients-sync-tenant-test.mjs` : PASS
- `config-pin-projection-test.mjs` : PASS
- `core-test-source.cjs` : PASS
- `cost-margin-test.js` : PASS
- `credit-book-properties-test.mjs` : PASS
- `credit-book-refund-ui-test.mjs` : PASS
- `credit-book-test.mjs` : PASS
- `critical-flow-test.mjs` : PASS
- `cross-store-copy-test.mjs` : PASS
- `customer-retention-test.mjs` : PASS
- `dashboard-truth-test.mjs` : PASS
- `discount-policy-test.mjs` : PASS
- `economat-unit-deactivation-test.mjs` : PASS
- `employee-live-test.mjs` : PASS
- `employee-properties-test.mjs` : PASS
- `employee-truth-test.mjs` : PASS
- `escpos-unsupported-test.mjs` : PASS
- `fetch-b-deadline-test.mjs` : PASS
- `file-size-ratchet-test.mjs` : PASS
- `floorplan-sync-test.js` : PASS
- `food-trades-truth-test.mjs` : PASS
- `hotel-commercial-test.mjs` : PASS
- `hotel-room-bulk-api-test.mjs` : PASS
- `hotel-units-test.mjs` : PASS
- `kitchen-print-queue-test.mjs` : PASS
- `live-link-queue-ownership-test.mjs` : PASS
- `locale-booking-wave-n-test.mjs` : PASS
- `locale-handoff-test.mjs` : PASS
- `lock-caisse-link-test.mjs` : PASS
- `lock-greeting-truth-test.mjs` : PASS
- `loyalty-confirmation-test.mjs` : PASS
- `loyalty-refused-redemption-test.mjs` : PASS
- `loyalty-reserve-test.mjs` : PASS
- `loyalty-truth-test.mjs` : PASS
- `maison-client-history-test.mjs` : PASS
- `menu-analysis-properties-test.mjs` : PASS
- `menu-analysis-test.mjs` : PASS
- `menu-carte-store-test.js` : PASS
- `menu-i18n-test.mjs` : PASS
- `menu-truth-test.mjs` : PASS
- `month-report-api-test.mjs` : PASS
- `native-audit-fixes-test.mjs` : PASS
- `native-pass4-test.mjs` : PASS
- `native-pass5-test.mjs` : PASS
- `native-pass7-test.mjs` : PASS
- `native-workspace-ux-test.mjs` : PASS
- `network-recovery-test.mjs` : PASS
- `operating-day-sync-status-test.mjs` : PASS
- `orderpro-guest-api-test.mjs` : PASS
- `orderpro-relay-test.js` : PASS
- `pairing-parity-test.mjs` : PASS
- `pairing-resolver-test.mjs` : PASS
- `pin-lockout-truth-test.mjs` : PASS
- `planning-layout-test.mjs` : PASS
- `pos-reprint-test.js` : PASS
- `pos-truth-a-test.mjs` : PASS
- `pressing-auto-ready-test.mjs` : PASS
- `pressing-edge-test.mjs` : PASS
- `pressing-money-properties-test.mjs` : PASS
- `pressing-truth-test.mjs` : PASS
- `pressing-workspace-test.js` : PASS
- `print-hub-lease-test.mjs` : PASS
- `print-paper-test.mjs` : PASS
- `print-relay-idempotency-test.mjs` : PASS
- `print-relay-properties-test.mjs` : PASS
- `print-relay-test.mjs` : ÉCHEC, voir motif ci-dessus
- `print-slow-bridge-test.mjs` : PASS
- `print-socket-test.mjs` : PASS
- `printer-split-test.mjs` : ÉCHEC, voir motif ci-dessus
- `printer-station-unicode-test.mjs` : PASS
- `printer-test-source.cjs` : PASS
- `printer-transports-split-test.mjs` : ÉCHEC, voir motif ci-dessus
- `promotions-store-contract-test.mjs` : PASS
- `pwa-shell-test.js` : PASS
- `quarantine-settlement-test.mjs` : PASS
- `queues-wave-n-test.mjs` : PASS
- `reservation-overlap-test.mjs` : PASS
- `retail-scan-test.mjs` : PASS
- `retail-truth-test.mjs` : PASS
- `sale-line-v2-test.mjs` : PASS
- `sales-reconcile-test.mjs` : PASS
- `sales-trim-test.mjs` : PASS
- `salle-scan-test.mjs` : PASS
- `scan-view-test.mjs` : PASS
- `scoped-tab-isolation-test.mjs` : PASS
- `service-trades-truth-test.mjs` : PASS
- `sidebar-language-test.mjs` : PASS
- `specialty-retail-truth-test.mjs` : PASS
- `station-printer-routing-test.mjs` : PASS
- `stock-truth-test.mjs` : PASS
- `store-cas-test.mjs` : PASS
- `store-pending-setup-test.mjs` : PASS
- `team-codes-at-rest-test.mjs` : PASS
- `team-doc-redaction-test.mjs` : PASS
- `team-properties-test.mjs` : PASS
- `team-removal-shift-test.mjs` : PASS
- `till-gate-test.mjs` : PASS
- `till-truth-test.mjs` : PASS
- `trade-cash-presets-test.mjs` : PASS
- `trade-workspaces-test.js` : PASS
- `trades-money-properties-test.mjs` : PASS
- `type-policy-test.js` : PASS
- `vertical-feature-parity-test.mjs` : PASS
- `vertical-state-test.mjs` : PASS
- `wave-d-security-test.mjs` : PASS
- `wave-n-caps-test.mjs` : PASS
- `wave-o-infra-test.mjs` : PASS
- `wave-p-a11y-test.mjs` : PASS
- `wave-p-limits-test.mjs` : PASS
- `wave-p-merge-test.mjs` : PASS
- `wave-p-money-test.mjs` : PASS
- `wave-p-polish-test.mjs` : PASS
- `worker-cpu-test.mjs` : PASS

## Suites navigateur à exécuter par le lead

Ces suites nomment un fichier modifié ; aucune exécutée ici. Pour la vérification des traductions, utiliser `KIWI_LOCALES=fr,en,ar`.

- `tools/a11y-browser-test.mjs`
- `tools/avoir-customer-scope-browser-test.mjs`
- `tools/caisse-restaurant-lang-browser-test.mjs`
- `tools/clients-book-page-browser-test.mjs`
- `tools/credit-book-dashboard-browser-test.mjs`
- `tools/credit-book-refund-browser-test.mjs`
- `tools/dashboard-breadcrumb-language-test.mjs`
- `tools/discount-policy-live-browser-test.mjs`
- `tools/epicerie-phone-browser-test.mjs`
- `tools/french-leak-browser-test.mjs`
- `tools/genpage-breadcrumb-language-test.mjs`
- `tools/hotel-direct-booking-browser-test.mjs`
- `tools/hotel-journey-browser-test.mjs`
- `tools/live-link-crash-browser-test.mjs`
- `tools/live-link-outbox-browser-test.mjs`
- `tools/maison-caisse-browser-test.mjs`
- `tools/maison-shelf-price-browser-test.mjs`
- `tools/orderpro-parity-browser-test.mjs`
- `tools/owner-identity-browser-test.mjs`
- `tools/pages-pro-lazy-test.mjs`
- `tools/pos-autre-custom-amount-test.mjs`
- `tools/pos-maison-split-browser-test.mjs`
- `tools/repeat-sale-guard-test.mjs`
- `tools/till-approval-server-writes-test.mjs`
- `tools/trades-ledger-browser-test.mjs`
- `tools/wave-p-keyboard-browser-test.mjs`

Compléments métier conseillés : `surface-matrix-states-pressing-browser-test.mjs`, `surface-matrix-states-credit-browser-test.mjs`, `surface-matrix-states-credit-real-browser-test.mjs` (leurs fichiers chargent les surfaces via le harness plutôt que de nommer directement ces assets).

## Restamp et livraison par le lead

Restamper les assets suivants, sans changement de génération du service worker :

- `assets/caisse-lang.js`
- `assets/caisse-pairing.js`
- `assets/i18n.js`
- `assets/kit/till-pin.js`
- `assets/offline-pin-coverage.js`
- `assets/pos-epicerie.js`
- `assets/pressing-caisse.js`
- `assets/pressing-dashboard.js`
- `assets/pressing-ops.js`
- `assets/printer-bridge.js`
- `assets/printer/pairing-ui.js`
- `assets/trade-workspaces.js`
- `assets/vertical-state.js`

Restent : resceller les deux fixtures de découpage imprimante, relancer les deux suites nécessitant localhost hors sandbox, exécuter les suites navigateur ci-dessus, restamper, exécuter le gate complet puis committer. Le travail reste non committé selon instruction.
