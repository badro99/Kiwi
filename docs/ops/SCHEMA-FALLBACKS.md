# Replis de schéma à retirer

Inventaire initial de la branche cx/g-schema au 26 octobre 2026. Les lignes désignent le code avant retrait. Minimum pris en charge : 0016, confirmé par le propriétaire ; vérification distante indisponible faute de variables Cloudflare. Aucun contrôle de version sur le chemin des requêtes.

Les sondes de catalogue des exports administratifs peuvent être légitimes : elles doivent être distinguées des replis. Les modules gelés restent hors modification.

| Fichier | Lignes initiales | Première migration contenant les objets détectés |
| --- | --- | --- |
| `functions/api/_client-audit.js` | 12, 39 | `client_reward_refusals` : `0012` |
| `functions/api/_client-merge.js` | 36, 84, 93 | Sondes `employee_loyalty_events`, `store_credits` et tables clientes : `0001` ; `invoice_docs` : `0002`. |
| `functions/api/_demo-requests.js` | 18 | `demo_requests` : `0001` |
| `functions/api/_invoice-series.js` | 25, 29, 34, 38, 50, 70 | `sale_invoices` : `0001` ; `invoice_series` : `0002` ; `invoice_docs` : `0002` ; `invoice_payments` : `0002` |
| `functions/api/_quarantine-guard.js` | 14 | Absence de `operational_commands` ignorée : `0001`. |
| `functions/api/_store-credit-ledger.js` | 18 | `store_credit_events` : `0001` |
| `functions/api/_support.js` | 7, 8, 9, 10, 11, 12, 13, 23, 35 | `support_articles` : `0001` ; `support_article_versions` : `0001` ; `support_tickets` : `0001` ; `support_messages` : `0001` ; `support_attachments` : `0001` ; `support_searches` : `0001` ; `support_feedback` : `0001` |
| `functions/api/cash-sessions.js` | 231, 234 | `cash_session_events` : `0001` |
| `functions/api/clients.js` | 60, 72, 74, 75, 76, 82, 92, 129, 180, 201, 263, 504, 1060, 1113 | `client_purchase_events` : `0001` ; `client_reward_events` : `0001` ; `client_sync_sequences` : `0001` |
| `functions/api/employee-clients.js` | 24 | `employee_loyalty_events` : `0001` |
| `functions/api/feed.js` | 96, 192 | Requêtes moins riches après erreur de colonne (`sales` et `sale_audit`) : `0001` ; journal des changements : `0006`. |
| `functions/api/foodcost.js` | 47, 57 | `foodcost_sheets` : `0002` ; `foodcost_snapshots` : `0002` |
| `functions/api/invoice.js` | 47 | `sale_invoices` : `0001` |
| `functions/api/invoices.js` | 421 | Liste vide si les tables de facturation manquent : `0002`. |
| `functions/api/month-report.js` | 50, 62, 87 | Sélection des seules colonnes présentes pour chaque source : objets `0001` et `0002`, `sales.written_by` : `0010`. |
| `functions/api/operations.js` | 88, 104, 116, 121, 125, 128, 412, 422, 671, 684, 693, 879, 892, 907, 914, 924, 1299, 1315, 1504, 1516, 1525, 1859, 1875, 1881 | `operational_commands` : `0001` ; `operational_events` : `0001` ; `operational_rate` : `0001` ; `notification_prefs` : aucune migration ≤ 0016 ; `notification_deliveries` : aucune migration ≤ 0016 ; `accounting_documents` : aucune migration ≤ 0016 ; `accounting_entries` : aucune migration ≤ 0016 ; `accounting_periods` : aucune migration ≤ 0016 ; `purchase_orders` : `0002` ; `purchase_order_lines` : `0002` ; `inventory_movements` : `0001` ; `inventory_sync_sequences` : `0001` ; `payslips` : aucune migration ≤ 0016 ; `payroll_periods` : aucune migration ≤ 0016 ; `payment_links` : aucune migration ≤ 0016 ; `payment_refunds` : aucune migration ≤ 0016 ; `payment_refund_reservations` : `0001` ; `device_health` : `0001` ; `device_alerts` : `0001` |
| `functions/api/receivables.js` | 44 | `delivery_collections` : `0003` |
| `functions/api/sale.js` | 38, 41, 72, 77, 85, 98, 120, 587, 762, 856, 923, 925, 935, 937 | `sales` : `0001` ; `sale_sync_conflicts` : `0001` ; `sale_settlement_keys` : `0001` ; `sale_receipts` : `0001` |
| `functions/api/store-credits.js` | 31, 38, 52 | `sale_receipts` : `0001` ; `store_credits` : `0001` ; `store_credit_events` : `0001` |
| `functions/api/ticket-sequence.js` | 34 | `ticket_sequences` : `0001` |
| `functions/api/timezone.js` | 24, 26 | `merchant_config` : `0001` |
| `functions/api/z-reconciliation.js` | 12, 21 | `z_reconciliations` : `0001` ; `sale_sync_conflicts` : `0001` |
| `functions/auth/_lib.js` | 335, 401, 456, 458, 478, 783, 1068 | Création `till_devices`, absence traitée comme non révoquée, `merchant_config.till_epoch` et `status` : `0001` ; absence de `session_revocations` traitée comme non révoquée : `0007`. |
| `functions/auth/signup.js` | 109 | INSERT sans `accounts.business_slug` si la colonne manque : `0007`. Retiré dans cette branche ; erreur de stockage : 503, aucune création sans réservation. |
| `functions/api/admin/_workspace.js` | 22 | Diagnostic d’erreur de schéma, sans seconde requête : ne constitue pas un repli. |
| `functions/api/admin/account.js` | 248 | Diagnostic 503 de colonne manquante, sans seconde requête : `0001`. |
| `functions/api/admin/clients.js` | 294, 301, 402, 472 | Catalogue de purge/export dynamique, sondes support : `0001` ; introspection métier à conserver distincte des replis. |
| `functions/api/admin/config.js` | 40, 45 | `merchant_config` : `0001` |
| `functions/api/admin/sales.js` | 124, 125, 128, 260, 304, 449, 471 | Requêtes sans centimes, détails et annulations : `0001`. |
| `functions/api/agent/_core.js` | 41, 50, 51 | `agent_keys` : `0001` ; `agent_audit` : `0001` |
| `functions/api/agent/_oauth.js` | 68, 72 | `agent_oauth_clients` : `0002` ; `agent_oauth_codes` : `0002` |
| `functions/api/ai/_quota.js` | 24, 32 | `ai_usage_kind` : `0001` |
| `functions/api/ai/intake.js` | 114 | `intake_docs` : `0002` |
| `functions/api/comptable/_lib.js` | 28 | `accountant_access` : `0002` |
| `functions/api/comptable/books.js` | 46, 303 | Projections selon les colonnes présentes et rapprochement non enregistré : `0001` / `0002`. |
| `functions/api/hotel/_commercial.js` | 141 | Absence de `hotel_reservations` : `0002`. |
| `functions/api/hotel/_stay-events.js` | 128, 139 | Absence de `hotel_stay_events` : `0001` ; `hotel_reservations` : `0002`. |
| `functions/api/hotel/billing-draft.js` | 108 | Branche historique en absence de `hotel_reservations` : `0002`. |
| `functions/api/hotel/declarations.js` | 115 | Sonde de tables ; `hotel_monthly_declarations` est absente des migrations jusqu’à `0016`. |
| `functions/api/inventory/counts.js` | 23, 59, 75 | `inventory_counts` : `0001` ; `inventory_count_events` : `0001` ; `inventory_sync_sequences` : `0001` |
| `functions/api/inventory/internal-requests.js` | 123, 136, 149, 159, 377, 379, 484 | `inventory_request_reservations` : `0001` ; `inventory_movements` : `0001` |
| `functions/api/inventory/movements.js` | 38, 49, 54, 59, 63 | `inventory_movements` : `0001` ; `inventory_sync_sequences` : `0001` |
| `functions/api/order/_lib.js` | 58 | `order_sequences` : `0001` |
| `functions/api/order/_queue-create.js` | 305 | `order_following` : `0002` |
| `functions/api/order/_queue-tables.js` | 291 | `sales` : `0001` |
| `functions/api/order/game.js` | 41 | `game_scores` : `0001` |
| `functions/api/pair/devices.js` | 68 | Liste vide si `till_devices` manque : `0001`. |
| `functions/api/pair/revoke.js` | 36 | `merchant_config` : `0001` |
| `functions/api/print/_relay.js` | 100 | Diagnostic de tables du relais absentes : `0001` ; vérifier les appelants, aucune création dans ce helper. |
| `functions/api/push/morning.js` | 72, 115 | `push_morning_sent` : `0002` |
| `functions/api/push/register.js` | 25, 27, 86, 137 | `push_tokens` : `0001` |
| `functions/api/shopify/_inbound-stock.js` | 4 | `shopify_inbound_stock` : `0001` |
| `functions/api/tickets/_lib.js` | 88 | Diagnostic de schéma des tickets absent : `0001` ; vérifier les appelants, aucune création dans ce helper. |

## Replis sans message SQLite explicite

| Fichier | Comportement | Migration |
| --- | --- | --- |
| `functions/api/config.js` | `claimStore` écrit une forme réduite après erreur ; lectures sans statut, registre ou propriétaire ; compteur de magasins absent traité comme zéro. | `merchant_config.account_id`, `store_name`, `status` et champs commerciaux : `0001`. |
| `functions/api/_private.js` | Registre absent ou illisible remplacé par le slug du compte ; statut absent traité comme actif. | `0001`. |
| `functions/api/_store-credit-ledger.js` | Remboursements relus sans `amount_cents`, événements absents traités comme zéro. | `0001`. |
| `functions/api/inventory/internal-requests.js` | Lots relus sans taux précis ; écritures conditionnées par les colonnes ; tables nommées par constantes. | `hotel_internal_requests`, `hotel_internal_request_lines`, `hotel_internal_request_events`, `inventory_request_reservations` et colonnes de `inventory_movements` : `0001`. |
| `functions/api/sale.js` | `hasWrittenBy` désactive l’attribution si la colonne manque. | `0010`. |
| `functions/api/clients.js` | Lecture, mise à jour et effacement sans tags si colonne absente. | `0009`. |

## État de livraison

Inventaire de repérage, non certification exhaustive des captures générales : les captures sans message SQLite et les SQL dynamiques nécessitent encore une revue. Les lignes initiales restent volontairement stables après retrait.

Le contrôle local reconstruit 0001 à 0016. Il révèle dix tables utilisées mais non migrées : `notification_prefs`, `notification_deliveries`, `accounting_documents`, `accounting_entries`, `accounting_periods`, `payslips`, `payroll_periods`, `payment_links`, `payment_refunds`, `hotel_monthly_declarations`. Les neuf premières ont des créations dans `operations.js` : elles ne peuvent pas être supprimées au titre du minimum 0016. La dernière n’a pas de création dans cette route. Aucune migration appliquée n’a été modifiée.

Le retrait global reste ouvert. Les modules `ai` et `helpcentre` (`_support.js`) restent gelés. Le nouveau contrôle est intentionnellement rouge tant que ces dettes existent ; il ne doit pas être présenté comme une validation de déploiement. Les SQL littéraux sont préparés sans exécution ; les expressions dynamiques sont comptées, pas certifiées. Aucun contrôle de version n’est exécuté par une requête.

## Preuves locales de cette session

- Inscription, avant retrait : les deux propriétés de non-contournement échouent sur le code initial. Après retrait : 20 propriétés strictes passent, 30 cas chacune. Les collisions concurrentes sur e-mail et slug restent testées.
- Schéma, mêmes règles avant/après : 175 puis 174 diagnostics (130 puis 129 occurrences de replis ; 45 requêtes sur des tables absentes). 1 079 requêtes littérales sont préparables après retrait ; 207 expressions dynamiques restent non certifiées. Ce résultat est rouge et bloque la livraison.
- Argent : 16 propriétés passent, 300 cas chacune, aucun saut.
- 27 suites distinctes vertes, une rouge (`schema-minimum-test.mjs`). Le gate complet n’a pas été exécuté.
- Suites vertes : `android-native-test.mjs`, `android-print-bridge-test.mjs`, `app-bundle-test.mjs`, `auth-hardening-2-test.mjs`, `auth-input-test.mjs`, `auth-properties-test.mjs`, `cashier-cancel-test.mjs`, `check-parallel-test.mjs`, `economat-rd-invariants-test.mjs`, `economat-real-d1-transfer-test.mjs`, `file-size-ratchet-test.mjs`, `hotel-units-test.mjs`, `import-test.js`, `landing-claims-test.mjs`, `money-properties-test.mjs`, `nonlatin-slug-test.mjs`, `password-policy-test.mjs`, `pwa-shell-test.js`, `relay-print-verdict-test.mjs`, `sale-label-xss-test.mjs`, `sale-line-v2-test.mjs`, `security-and-channel-hardening-test.mjs`, `stamp-drift-test.js`, `till-truth-test.mjs`, `d1-migrations-test.mjs`, `d1-schema-test.mjs`, `check-guard-test.mjs`. Cette dernière a été exécutée via le créneau navigateur imposé, en français.
- Aucun stamp à déplacer ; aucune migration distante, modification d’index Git, validation de commit ou publication.

## Pin

The 174 diagnostics left on 26 October 2026 are pinned in `tools/schema-fallback-baseline.json` (file and message, no line number). `tools/schema-minimum-test.mjs` fails on any new runtime fallback or any query that no longer prepares against migration 0016, and asks for the pin to be lowered when one goes away (`KIWI_UPDATE_SCHEMA_BASELINE=1`). It never raises a count or adds a key. Removing the remaining fallbacks means first writing migrations for the tables routes still create at runtime (payment links, payroll periods, payment refunds and others), and the owner applying them in production.

## Migration 0017 (written 26 October 2026, waiting for the owner)

`migrations/0017_runtime_tables.sql` declares the ten tables routes still create
on first use: notification prefs and deliveries, the accounting ledger
(documents, entries, periods), payslips and payroll periods, payment links and
refunds (all in `functions/api/operations.js`), and the hotel monthly
declarations ledger, which only existed as an unapplied dated file. None of them
exists in production today, so applying 0017 creates empty tables and nothing
else. The DDL was generated by running the routes' own `ensure*` functions
against an empty database, so it is the same shape the routes would have built.

One visible effect: the hotel monthly declarations screen answers
`declaration-unavailable` today because its table is missing; after 0017 it works.

After the owner applies it (`npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml`):
1. move `MINIMUM_SCHEMA_VERSION` to 17 (and the assertion in `tools/schema-minimum-test.mjs`);
2. run `KIWI_UPDATE_SCHEMA_BASELINE=1 node tools/schema-minimum-test.mjs`: measured, the pin goes from 174 to 129 and 45 more queries are checked;
3. remove `ensureNotify`, `ensureLedger`, `ensurePayroll`, `ensurePayments` and the hotel `tableExists` guard, then lower the pin again.

## Wave M · schema · 26 octobre 2026

Le retrait des CREATE des objets couverts avant 0011 est réalisé hors modules
`ai` et `helpcentre` gelés. Le pin passe de 174 à 108 diagnostics, sans hausse.
Les tables introduites après 0010 restent créées par leurs helpers. L'inventaire
historique ci-dessus reste un repérage de l'état initial, pas l'état des lignes
actuelles. Voir [la preuve Wave M](2026-10-26-wave-m-schema.md) pour les exceptions,
les comparaisons avant/après et les suites. Les autres replis (sondes, ALTER hors
helpers retirés, projections et captures d'erreurs) restent hors de ce retrait.
