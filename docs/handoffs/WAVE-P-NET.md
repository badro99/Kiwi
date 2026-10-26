# Wave P · net · preuves et passage au lead

## Résultat

Les treize écarts ont une régression rouge sur les fichiers HEAD puis verte après restauration des correctifs. 404 suites hors navigateur sont vertes ; stamp-drift-test.js reste rouge comme attendu, et economat-real-d1-transfer-test.mjs est bloquée par les permissions du cache npm. Aucune suite navigateur ni tools/check.js exécutée. Aucune opération Git en écriture, aucun stamp déplacé, aucune génération SW modifiée, aucun pin relevé.

## Preuve rouge puis verte

Procédure exécutée : sauvegarde binaire des seuls fichiers de production concernés dans la mémoire du script, remplacement temporaire par `git show HEAD:<fichier>` (lecture Git), lancement des régressions, restauration dans un bloc finally, puis relance verte. Aucun autre worktree consulté.

| Écart | Régression et échec observé sur HEAD |
| --- | --- |
| invoices#0 | net-wave-p-test.mjs : identité tronquée à 32 caractères ; le correctif vérifie aussi le refus de restaurer un cache long ambigu. |
| invoices#1 | net-wave-p-test.mjs : fetch sans délai et absence de retour UI sous connexion bloquée ; vérification du marchand demandé et du message de reprise. |
| booking#0 | net-wave-p-test.mjs : appels non bornés ; disponibilité, configuration, gestion et annulation ne rendent pas la main. |
| hotel#0 | net-wave-p-test.mjs : recherche de chambres bloquée ; le correctif vérifie aussi le retrait des disponibilités obsolètes. |
| app#0 | net-wave-p-test.mjs : appels non bornés et absence de helper natif borné. |
| returns#0 | net-wave-p-test.mjs : lecture bloquée, aucune erreur de reprise ; lecture et mutation sont bornées sur le correctif. |
| economat#1 | net-wave-p-test.mjs : une panne de chaque service de configuration donne une erreur vide, comme une configuration absente. |
| shopify#0 | net-wave-p-test.mjs : un curseur corrompu ne rejette pas ; shopify-replay-orders-test.mjs : le statut répond 200 au lieu de 503. |
| shopify#1 | net-wave-p-test.mjs : la panne des correspondances renvoie zéro ; le correctif vérifie aussi l’erreur de synchronisation persistée par le catalogue. |
| dayreport#0 | net-wave-p-test.mjs et dayreport-properties-test.mjs, archive write failure : save renvoie un rapport malgré le quota ; le correctif renvoie false sans notification ni publication. |
| sync#0 | net-wave-p-test.mjs : deux longues références au suffixe identique produisent le même ancien identifiant FNV ; le correctif produit deux SHA-256 complets, conformes à node:crypto. |
| orderpro#0 | net-wave-p-test.mjs : les deux chemins contiennent le repli sans idempotence. |
| orderpro#2 | orderpro-properties-test.mjs, missing idempotency column : sur SQLite avec client_ref renommée, HEAD accepte une requête à 200 au lieu de 503. Le correctif refuse deux tentatives publiques et salle sans écrire de commande. |


Les régressions net-wave-p-test.mjs sont nommées dans tools/check.js. Les nouveaux cas des suites de propriétés et Shopify sont dans des suites déjà branchées au gate. Les tests réseau exécutent les fonctions de production extraites, avec le vrai deadlineFetch et une échéance réduite à 5 ms ; les imports du module sont résolus localement par le harnais. Aucun service marchand contacté.

## Décisions et limites

Voir [les décisions net](../decisions/2026-10-26-wave-p.md#net). Les anciennes clés de factures restent lues et leurs octets restent intacts. Une ancienne clé tronquée sans preuve de propriétaire ne peut pas être restaurée automatiquement dans un compte réel long : récupération accompagnée nécessaire pour ces anciens brouillons ambigus. Les caches non ambigus, identifiants de ventes déjà présents et identifiants des commandes déjà mises en file restent inchangés.

Le module assets/live-link/sale-identity.js figure dans le précache ; la constante de génération SW et tous les ?v= sont inchangés. Les suites de split exécutées sont vertes, aucune fixture n’a été rescellée.

## À faire par le lead

- Déplacer les stamps de assets/booking.js, assets/day-report.js, assets/hotel-economat-requests.js, assets/invoicing.js, assets/live-link.js et assets/pages-pro/boutique-promos-returns.js avec l’outil habituel.
- Exécuter les suites navigateur ci-dessous et le gate complet selon le processus de fusion.
- Relancer economat-real-d1-transfer-test.mjs dans un environnement où npm peut accéder à son cache. Le même EPERM sur ~/.npm/_cacache est reproduit avec le fichier économat HEAD.
- Commit par le lead ; aucun fichier n’est stagé par ce travail.

## Fichiers modifiés (+ / − lignes)

| Fichier | Ajouts | Suppressions |
| --- | ---: | ---: |
| app/src/native-shell.js | 7 | 5 |
| assets/booking.js | 7 | 7 |
| assets/day-report.js | 4 | 3 |
| assets/hotel-economat-requests.js | 4 | 4 |
| assets/invoicing.js | 9 | 8 |
| assets/live-link.js | 2 | 0 |
| assets/pages-pro/boutique-promos-returns.js | 3 | 3 |
| functions/api/catalog.js | 2 | 1 |
| functions/api/order/_queue-create.js | 3 | 2 |
| functions/api/order/index.js | 3 | 2 |
| functions/api/shopify/_lib.js | 2 | 2 |
| functions/api/shopify/_replay-orders.js | 8 | 1 |
| functions/api/shopify/status.js | 3 | 1 |
| kiwi-sw.js | 1 | 0 |
| tools/app-bundle-test.mjs | 1 | 1 |
| tools/booking-read-order-test.mjs | 2 | 2 |
| tools/check.js | 1 | 0 |
| tools/core-test-source.cjs | 1 | 1 |
| tools/dayreport-properties-test.mjs | 2 | 1 |
| tools/live-link-queue-source.cjs | 1 | 0 |
| tools/orderpro-properties-test.mjs | 11 | 0 |
| tools/sale-id-collision-test.mjs | 2 | 2 |
| tools/sale-return-race-properties-test.mjs | 1 | 1 |
| tools/shopify-replay-orders-test.mjs | 7 | 0 |
| tools/trades-money-properties-test.mjs | 3 | 2 |
| assets/live-link/sale-identity.js (nouveau) | 33 | 0 |
| tools/net-wave-p-test.mjs (nouveau) | 164 | 0 |
| docs/decisions/2026-10-26-wave-p.md (nouveau) | 29 | 0 |
| docs/handoffs/WAVE-P-NET.md (nouveau) | 556 | 0 |

## Suites hors navigateur exécutées

404 vertes, 1 rouge attendu pour les stamps. En plus, une suite économat bloquée par l’environnement. Relances finales de net-wave-p, booking-read-order, hotel-direct-pricing, dayreport-properties (15 propriétés, 300 essais), orderpro-properties (9 propriétés, 100 essais), shopify-replay-orders, file-size-ratchet (778 contrôles) et pwa-shell (948 contrôles) vertes. Les propriétés connues des suites existantes restent inchangées.

- account-deletion-test.mjs : vert
- account-deletion-ui-test.mjs : vert
- account-scope-test.mjs : vert
- accountant-portal-test.mjs : vert
- action-honesty-test.js : vert
- admin-delete-r2-test.mjs : vert
- admin-report-test.mjs : vert
- agent-features-test.mjs : vert
- agent-mcp-remote-test.mjs : vert
- agent-month-business-day-test.mjs : vert
- agent-open-targets-test.mjs : vert
- agent-test.js : vert
- agent-vision-test.mjs : vert
- agent-voice-test.mjs : vert
- ai-routes-test.mjs : vert
- amira-integration-test.mjs : vert
- android-native-test.mjs : vert
- android-print-bridge-test.mjs : vert
- api-boundaries-test.mjs : vert
- app-bundle-test.mjs : vert
- app-release-test.mjs : vert
- attendance-code-current-test.mjs : vert
- audit-remediation-ai-channel-surfaces-test.mjs : vert
- audit-remediation-auth-test.mjs : vert
- audit-remediation-connectors-test.mjs : vert
- audit-remediation-dashboard-test.mjs : vert
- audit-remediation-devices-test.mjs : vert
- audit-remediation-inventory-loyalty-test.mjs : vert
- audit-remediation-money-test.mjs : vert
- audit-remediation-orders-test.mjs : vert
- audit-remediation-pressing-test.mjs : vert
- audit-remediation-refund-recovery-test.mjs : vert
- auth-hardening-2-test.mjs : vert
- auth-input-test.mjs : vert
- auth-properties-test.mjs : vert
- basket-pairs-test.mjs : vert
- booking-api-test.mjs : vert
- booking-hotel-beyond-window-test.mjs : vert
- booking-manage-test.mjs : vert
- booking-properties-test.mjs : vert
- booking-read-order-test.mjs : vert
- booking-truth-test.mjs : vert
- books-money-properties-test.mjs : vert
- boutique-custom-color-test.js : vert
- boutique-existing-barcode-test.mjs : vert
- boutique-product-sheet-test.mjs : vert
- boutique-variant-stock-test.mjs : vert
- briefing-cash-sessions-test.mjs : vert
- briefing-discounts-test.mjs : vert
- briefing-properties-test.mjs : vert
- briefing-test.mjs : vert
- bump-stamp-test.mjs : vert
- business-day-default-test.mjs : vert
- business-day-surfaces-test.mjs : vert
- caisse-chip-gate-test.mjs : vert
- caisse-dna-test.js : vert
- caisse-link-success-test.js : vert
- caisse-money-properties-test.mjs : vert
- caisse-offline-sync-test.mjs : vert
- caisse-outbox-full-test.mjs : vert
- caisse-pairing-recovery-test.mjs : vert
- caisse-payment-upload-test.mjs : vert
- caisse-pressing-hotel-lang-test.mjs : vert
- caisse-reconnect-test.mjs : vert
- caisse-terminal-recovery-test.mjs : vert
- caisse-theme-contrast-test.mjs : vert
- card-z-reconciliation-test.mjs : vert
- cash-session-properties-test.mjs : vert
- cash-sessions-auth-test.mjs : vert
- cashier-cancel-test.mjs : vert
- catalog-ledger-properties-test.mjs : vert
- catalog-merge-properties-test.mjs : vert
- catalog-merge-test.js : vert
- catalog-stock-transaction-test.mjs : vert
- channel-order-test.js : vert
- channel-properties-test.mjs : vert
- check-parallel-test.mjs : vert
- client-mix-test.mjs : vert
- clients-pending-write-test.mjs : vert
- clients-properties-test.mjs : vert
- cloud-doc-quota-test.mjs : vert
- config-pin-projection-test.mjs : vert
- core-split-test.mjs : vert
- cost-margin-test.js : vert
- course-following-retry-test.mjs : vert
- credit-book-properties-test.mjs : vert
- critical-flow-test.mjs : vert
- cross-store-copy-test.mjs : vert
- d1-variable-limit-test.mjs : vert
- dark-fixes-batch-test.mjs : vert
- dashboard-card-truth-test.mjs : vert
- dashboard-currency-ar-test.mjs : vert
- dashboard-kds-nav-test.mjs : vert
- dashboard-pin-vault-test.mjs : vert
- dashboard-truth-test.mjs : vert
- dashboard-unoffered-actions-test.mjs : vert
- date-range-calendar-truth-test.mjs : vert
- day-report-export-test.mjs : vert
- day-report-formatter-cache-test.mjs : vert
- day-report-menu-group-test.mjs : vert
- day-report-multi-service-test.mjs : vert
- day-report-paired-scope-test.mjs : vert
- dayreport-properties-test.mjs : vert
- demo-request-api-test.mjs : vert
- department-catalogue-test.mjs : vert
- device-timezone-test.mjs : vert
- discount-policy-api-test.mjs : vert
- discount-policy-test.mjs : vert
- discount-reasons-test.mjs : vert
- economat-catalogue-test.mjs : vert
- economat-rd-invariants-test.mjs : vert
- employee-language-test.js : vert
- employee-live-test.mjs : vert
- employee-loyalty-bound-test.mjs : vert
- employee-properties-test.mjs : vert
- employee-trade-shell-test.mjs : vert
- employee-truth-test.mjs : vert
- error-reporter-test.mjs : vert
- face-unlock-test.mjs : vert
- feed-changes-test.mjs : vert
- feed-limit-test.mjs : vert
- feed-voids-test.mjs : vert
- feed-window-test.mjs : vert
- fetch-b-deadline-test.mjs : vert
- field-orderpro-acceptance-test.mjs : vert
- field-table-transfer-test.mjs : vert
- file-size-ratchet-test.mjs : vert
- financial-ledger-invariant-test.mjs : vert
- floor-accept-test.mjs : vert
- floor-live-test.mjs : vert
- floorplan-sync-test.js : vert
- food-production-print-test.mjs : vert
- food-trades-truth-test.mjs : vert
- foodcost-api-test.mjs : vert
- forgot-password-test.mjs : vert
- formula-child-options-test.mjs : vert
- formula-protocol-test.mjs : vert
- formula-receipt-pricing-test.mjs : vert
- global-ownership-test.mjs : vert
- haptics-plugin-test.mjs : vert
- hospitality-plus-test.mjs : vert
- hotel-channel-sync-test.mjs : vert
- hotel-commercial-test.mjs : vert
- hotel-declarations-closing-test.mjs : vert
- hotel-direct-pricing-test.mjs : vert
- hotel-properties-test.mjs : vert
- hotel-reports-test.mjs : vert
- hotel-reservations-d1-test.mjs : vert
- hotel-room-bulk-api-test.mjs : vert
- hotel-rooms-test.mjs : vert
- hotel-split-test.mjs : vert
- hotel-stay-editing-test.mjs : vert
- hotel-stays-group-test.mjs : vert
- hotel-stays-test.mjs : vert
- hotel-sync-worker-test.mjs : vert
- hotel-truth-test.mjs : vert
- hotel-unit-scope-test.mjs : vert
- hotel-units-test.mjs : vert
- idle-lock-test.mjs : vert
- import-test.js : vert
- install-card-icon-test.mjs : vert
- intake-archive-test.mjs : vert
- intake-storage-fault-test.mjs : vert
- interactive-split-test.mjs : vert
- internal-request-test.mjs : vert
- inventory-ledger-test.mjs : vert
- inventory-universal-count-test.mjs : vert
- invoices-v2-test.mjs : vert
- invoicing-print-test.mjs : vert
- kds-recall-test.mjs : vert
- kitchen-modifiers-and-seating-test.mjs : vert
- kitchen-print-queue-test.mjs : vert
- kitchen-properties-test.mjs : vert
- kitchen-relay-test.js : vert
- kitchen-void-protocol-test.mjs : vert
- kiwi-agent-access-test.mjs : vert
- kpi-card-layout-test.mjs : vert
- kpi-ledger-test.js : vert
- kpi-same-slice-test.mjs : vert
- landing-claims-test.mjs : vert
- ledger-agreement-test.mjs : vert
- ledger-cache-test.mjs : vert
- legacy-venue-modals-test.mjs : vert
- live-feed-backfill-test.mjs : vert
- live-link-merchant-identity-test.mjs : vert
- live-link-queue-ownership-test.mjs : vert
- live-link-settlement-test.mjs : vert
- live-link-test.js : vert
- live-link-write-ahead-test.mjs : vert
- locale-booking-wave-n-test.mjs : vert
- loyalty-truth-test.mjs : vert
- maison-return-ledger-test.mjs : vert
- maison-stock-movements-test.mjs : vert
- maison-till-stock-journal-test.mjs : vert
- material-icons-test.mjs : vert
- media-owner-test.mjs : vert
- media-upload-test.mjs : vert
- menu-analysis-properties-test.mjs : vert
- menu-analysis-test.mjs : vert
- menu-availability-test.mjs : vert
- menu-carte-store-test.js : vert
- menu-formula-properties-test.mjs : vert
- menu-i18n-test.mjs : vert
- menu-insights-test.mjs : vert
- menu-ledger-test.mjs : vert
- menu-option-group-editor-test.mjs : vert
- menu-promos-properties-test.mjs : vert
- menu-promos-server-test.mjs : vert
- menu-promos-test.mjs : vert
- menu-properties-test.mjs : vert
- menu-pull-route-test.js : vert
- menu-rules-properties-test.mjs : vert
- menu-sales-test.mjs : vert
- menu-scan-test.mjs : vert
- menu-workspace-split-test.mjs : vert
- merchant-health-test.mjs : vert
- merchant-hour-test.mjs : vert
- mixmax-reconciliation-repair-test.mjs : vert
- modal-desc-escape-test.mjs : vert
- money-properties-test.mjs : vert
- month-report-api-test.mjs : vert
- morning-push-test.mjs : vert
- multi-device-collision-test.mjs : vert
- native-audit-fixes-test.mjs : vert
- native-host-bridge-test.mjs : vert
- native-pass4-test.mjs : vert
- native-pass5-test.mjs : vert
- native-pass7-test.mjs : vert
- net-wave-p-test.mjs : vert
- nonlatin-slug-test.mjs : vert
- offline-foundation-test.mjs : vert
- onboarding-gate-test.mjs : vert
- operating-day-ai-context-test.mjs : vert
- operating-day-drawers-test.mjs : vert
- operating-day-handover-test.mjs : vert
- operating-day-orders-integration-test.mjs : vert
- operating-day-split-session-test.mjs : vert
- operations-system-test.mjs : vert
- operator-properties-test.mjs : vert
- operator-snapshot-test.mjs : vert
- operator-workspace-test.mjs : vert
- order-controls-test.mjs : vert
- order-delivery-test.mjs : vert
- order-hours-server-test.mjs : vert
- order-pricing-properties-test.mjs : vert
- order-queue-pagination-test.mjs : vert
- order-truth-test.mjs : vert
- orderpro-cancellation-lifecycle-test.mjs : vert
- orderpro-formula-choice-images-test.mjs : vert
- orderpro-guest-api-test.mjs : vert
- orderpro-guestpage-editor-test.mjs : vert
- orderpro-invalid-options-test.mjs : vert
- orderpro-properties-test.mjs : vert
- orderpro-relay-test.js : vert
- orderpro-shared-table-test.mjs : vert
- origin-move-test.mjs : vert
- pages-pro-lazy-registry-test.mjs : vert
- pairing-parity-test.mjs : vert
- pairing-resolver-test.mjs : vert
- pairs-api-test.mjs : vert
- password-policy-test.mjs : vert
- pin-dashboard-test.mjs : vert
- pin-hardening-test.mjs : vert
- pin-lockout-truth-test.mjs : vert
- plan-catalog-test.mjs : vert
- plan-tier-test.mjs : vert
- planning-layout-test.mjs : vert
- platform-ops-test.mjs : vert
- pos-inventory-count-test.mjs : vert
- pos-maison-test.mjs : vert
- pos-mobile-test.mjs : vert
- pos-registry-sync-test.mjs : vert
- pressing-money-properties-test.mjs : vert
- pressing-truth-test.mjs : vert
- pressing-workspace-test.js : vert
- print-paper-test.mjs : vert
- print-relay-properties-test.mjs : vert
- print-relay-test.mjs : vert
- printer-transports-split-test.mjs : vert
- production-split-void-menu-test.mjs : vert
- promotions-store-contract-test.mjs : vert
- push-registration-test.mjs : vert
- pwa-shell-test.js : vert
- quarantine-settlement-test.mjs : vert
- queue-open-visit-unpaid-test.mjs : vert
- ramadan-test.js : vert
- receivables-properties-test.mjs : vert
- receivables-test.mjs : vert
- refund-reporting-test.mjs : vert
- relay-print-verdict-test.mjs : vert
- request-headers-test.mjs : vert
- request-pollers-test.mjs : vert
- reservations-test.mjs : vert
- restaurant-item-editor-test.mjs : vert
- restaurant-menu-ledger-reconciliation-test.js : vert
- restaurant-payment-identity-test.mjs : vert
- restaurant-recipe-layout-test.mjs : vert
- restaurant-reopen-test.mjs : vert
- restaurant-sync-release-test.mjs : vert
- resto-carte-test.js : vert
- retail-acompte-api-test.mjs : vert
- retail-scan-test.mjs : vert
- retail-tender-methods-test.mjs : vert
- retail-truth-test.mjs : vert
- retail-z-reconciliation-test.mjs : vert
- return-client-guards-test.mjs : vert
- returns-sales-sync-test.js : vert
- room-charge-test.mjs : vert
- runtime-ddl-routes-test.mjs : vert
- sale-id-collision-test.mjs : vert
- sale-invoice-cache-key-test.mjs : vert
- sale-invoice-test.mjs : vert
- sale-label-xss-test.mjs : vert
- sale-line-v2-test.mjs : vert
- sale-replay-visit-binding-test.mjs : vert
- sale-return-ledger-test.mjs : vert
- sale-return-race-properties-test.mjs : vert
- sale-tip-d1-test.mjs : vert
- sales-centime-precision-test.mjs : vert
- sales-day-contrast-test.mjs : vert
- sales-ledger-cutoff-test.mjs : vert
- sales-reconcile-test.mjs : vert
- sales-scope-test.mjs : vert
- sales-summary-store-test.mjs : vert
- sales-summary-test.mjs : vert
- sales-trim-test.mjs : vert
- salle-scan-test.mjs : vert
- scoped-tab-isolation-test.mjs : vert
- security-and-channel-hardening-test.mjs : vert
- serveur-money-properties-test.mjs : vert
- service-interconnectivity-test.mjs : vert
- service-settlement-test.mjs : vert
- service-trades-truth-test.mjs : vert
- settlement-recovery-test.mjs : vert
- shared-day-selector-test.mjs : vert
- shopify-connector-test.mjs : vert
- shopify-direct-webhook-test.mjs : vert
- shopify-replay-orders-test.mjs : vert
- shopify-shop-domain-test.mjs : vert
- shopify-sync-properties-test.mjs : vert
- shopify-webhook-test.js : vert
- sidebar-language-test.mjs : vert
- skin-cloak-test.mjs : vert
- sold-insights-test.js : vert
- source-assertion-ratchet-test.mjs : vert
- specialty-retail-truth-test.mjs : vert
- split-edit-resilience-test.mjs : vert
- staff-skin-test.mjs : vert
- stamp-drift-test.js : rouge attendu, stamps réservés au lead
- stock-lookup-test.js : vert
- stock-money-properties-test.mjs : vert
- stock-strings-split-test.mjs : vert
- stock-truth-test.mjs : vert
- store-cas-test.mjs : vert
- store-clock-test.mjs : vert
- store-creation-ack-test.mjs : vert
- store-creation-api-test.mjs : vert
- store-credit-sale-test.mjs : vert
- store-credits-test.mjs : vert
- store-pending-setup-test.mjs : vert
- store-templates-test.mjs : vert
- strings-sw-test.mjs : vert
- subscription-privacy-test.mjs : vert
- support-triage-retry-test.mjs : vert
- support-triage-test.mjs : vert
- sw-immutable-revalidation-test.mjs : vert
- sync-ledger-boutique-clock-test.mjs : vert
- table-time-test.mjs : vert
- table-transfer-merge-test.mjs : vert
- table-visit-reuse-test.mjs : vert
- takeaway-history-timestamps-test.mjs : vert
- takeaway-stale-archive-test.mjs : vert
- takeout-confirmation-test.js : vert
- team-catalog-split-test.mjs : vert
- team-doc-redaction-test.mjs : vert
- team-offshift-server-test.mjs : vert
- team-properties-test.mjs : vert
- team-removal-shift-test.mjs : vert
- team-roster-cap-test.mjs : vert
- team-split-test.mjs : vert
- team-test-source.cjs : vert
- tenant-guard-test.mjs : vert
- terminaux-truth-test.mjs : vert
- ticket-141-test.mjs : vert
- tickets-properties-test.mjs : vert
- tickets-retest-test.mjs : vert
- tickets-storage-purge-test.mjs : vert
- tickets-taxonomy-test.mjs : vert
- till-device-revoke-test.mjs : vert
- till-gate-test.mjs : vert
- till-truth-test.mjs : vert
- tips-truth-test.mjs : vert
- trade-workspaces-test.js : vert
- trades-money-properties-test.mjs : vert
- venues-split-test.mjs : vert
- vertical-feature-parity-test.mjs : vert
- void-stock-test.js : vert
- waiter-queue-privacy-test.mjs : vert
- wave-d-security-test.mjs : vert
- wave-n-server-test.mjs : vert
- wave-o-truth-test.mjs : vert
- worker-cpu-test.mjs : vert
- z-alert-truth-test.mjs : vert
- z-reconciliation-test.mjs : vert
- zone-law-test.mjs : vert
- economat-real-d1-transfer-test.mjs : bloquée, npm EPERM, reproduit sur HEAD.

## Suites navigateur pour le lead

Aucune exécutée. Classification par tools/check-guard.js, y compris les imports de harnais.

- a11y-browser-test.mjs
- app-interaction-test.mjs
- avoir-customer-scope-browser-test.mjs
- caisse-ink-dark-browser-test.mjs
- caisse-item-cancel-browser-test.mjs
- caisse-restaurant-lang-browser-test.mjs
- caisse-viewport-guard-test.mjs
- check-guard-test.mjs
- client-history-browser-test.mjs
- clients-book-page-browser-test.mjs
- dark-startup-browser-test.mjs
- dash-phone-pages-ar-browser-test.mjs
- dash-phone-pages-browser-test.mjs
- dash-phone-pages-kit-browser-test.mjs
- dash-phone-sheets-ar-browser-test.mjs
- dash-pin-browser-test.mjs
- dashboard-activity-test.mjs
- dashboard-first-use-test.mjs
- dashboard-pin-vault-browser-test.mjs
- discount-policy-live-browser-test.mjs
- dynamic-type-200-browser-test.mjs
- entitlement-held-gesture-test.mjs
- fixture-agreement-test.mjs
- genpage-breadcrumb-language-test.mjs
- hotel-direct-booking-browser-test.mjs
- hotel-journey-browser-test.mjs
- hotel-stays-group-browser-test.mjs
- icon-render-test.mjs
- ink-debt-browser-test.mjs
- invoicing-pdf-pages-browser-test.mjs
- invoicing-v2-browser-test.mjs
- kds-board-browser-test.mjs
- kds-cards-browser-test.mjs
- kds-course-following-browser-test.mjs
- kds-recall-browser-test.mjs
- live-link-crash-browser-test.mjs
- live-link-outbox-browser-test.mjs
- maison-caisse-browser-test.mjs
- maison-dashboard-browser-test.mjs
- maison-shelf-price-browser-test.mjs
- menu-promos-browser-test.mjs
- month-report-browser-test.mjs
- native-owner-home-browser-test.mjs
- native-store-readiness-test.mjs
- orderpro-parity-browser-test.mjs
- pages-pro-lazy-test.mjs
- pairs-boutique-browser-test.mjs
- pairs-caisse-browser-test.mjs
- pairs-serveur-browser-test.mjs
- pos-maison-split-browser-test.mjs
- promo-window-browser-test.mjs
- pwa-first-install-browser-test.mjs
- reset-states-test.mjs
- sale-unsynced-test.mjs
- shared-day-selector-browser-test.mjs
- surface-matrix-states-booking-floor-browser-test.mjs
- sync-ledger-boutique-browser-test.mjs
- sync-ledger-browser-test.mjs
- team-codes-browser-test.mjs
- team-pin-browser-test.mjs
- till-repair-lock-browser-test.mjs
- trades-ledger-browser-test.mjs
- trades-ledger-care-browser-test.mjs
- trades-ledger-retail-browser-test.mjs
- transactions-nav-stability-browser-test.mjs
