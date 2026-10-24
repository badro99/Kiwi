# Wave D resto verification

The product decisions are in `2026-10-24-wave-d.md`, under `resto`.

| Gap | Verified state and evidence |
| --- | --- |
| tables SM-2 | Reproduced one-cent mismatch with strict real-route property; corrected exact equality. `server-money-properties-test.mjs`: 28 strict properties, 300 cases each. |
| tables layout annotations | Already present in `surface-matrix-till-{phone,tablet,desktop}-browser-test.mjs` and coverage baseline, including EN/AR. These entry visits do not certify every split/transfer/reopen state. |
| serveur WM-4 | Reproduced missing server shift report on old runtime. New strict route property covers authenticated attribution, two phones, other employee exclusion, retry and void. Existing `seller_id` column used, no schema change. Historical unattributed receipts are not backfilled. Local table/game counters remain local; server revenue replaces the receipt tally when the employee payload is available. |
| serveur layout annotations | Already present for all FR/EN/AR devices in `surface-matrix-apps-browser-test.mjs` and baseline. Complete operational state matrix remains a separate obligation. |
| kitchen physical acknowledgment | Reproduced automatic reprint on `online` after uncertain output. Network/config events now only flush eligible jobs. Explicit staff reprint records a reconciliation event. `relay-print-verdict-test.mjs` covers all three automatic events and the manual trace. KDS acceptance still does not certify paper output. |
| kitchen layout annotations | Already present for kitchen FR/EN/AR devices; entry phone/tablet visits are classified. This does not certify every station/error transition. |
| menu editor layout annotations | Already present for FR tablet and EN/AR desktop in dashboard tablet/desktop matrix suites. |
| menu translation review | FR/EN/AR merchant review notice added to translation panel, including empty state. Red/green contract check in `menu-i18n-test.mjs`. No AI request was made by this work. Semantic translation quality remains a merchant review responsibility. |
| orderpro external total | Old strict route property fails without a signed adjustment. New customer record stores `channelAdjustmentCents`; localized note exposes the difference for staff acceptance. Provider total remains authoritative. Strict property tests both signs in FR/EN/AR. Three accepted issue entries removed with the required update command: SM-2, WM-4 and channel policy. |
| orderpro layout annotations | Already present for all requested FR/EN/AR devices in the baseline. Full localized guest checkout states still require rendered verification. |
| floor deletion horizon | Already fixed: `goneHorizon` survives tombstone compaction. `floorplan-sync-test.js` explicitly verifies a 31-day stale table and deleted decor cannot return, both merge directions; LWW properties also pass. |
| floor live status | Existing `floorplan-live.js` retains `stale:true` during outage. Adopted advisory status contract, with server visit operations authoritative. No immediate seating lock promised. |
| floor layout annotations | Already present for FR/EN/AR devices. `surface-matrix-states-booking-floor-browser-test.mjs` additionally visits phone/tablet floor states. Complete keyboard/touch/geometry transitions are not newly certified here. |
| analysis historical costs | Existing strict `menu-analysis-properties-test.mjs` proves frozen cost outranks current costs, matched inventory evidence recovers original cost, otherwise estimates stay flagged by `frozen:false` and `todayCostQty`; missing costs remain unknown. No historical reconstruction invented. |
| analysis state classification | Added dedicated dashboard-analysis phone/tablet FR/EN/AR classification to existing finance performance visits. Simple food-cost editor/empty/error remains explicitly unreachable in demo in the owning suite; no false claim of visiting it. |
| stock last unit | Existing strict `stock-money-properties-test.mjs` retains both movements and exposes negative balances, with dashboard and briefing low-stock agreement. Adopted warning/record policy, no new reservation mechanism. |
| stock layout annotations | Already present FR/EN/AR desktop/tablet in dashboard matrix suites. Full purchase/receipt/count transitions remain unverified here. |
| promos competing rules | Existing `promos.js` explicitly selects lowest single price, oldest tie, and keeps manager reduction separate. `promos-properties-test.mjs` remains strict. Adopted this contract. |
| promos editor classification | Added dedicated dashboard-promotion-editor FR/EN/AR phone/tablet classification to existing offer/scope/duration/preview/invalid-zero workflow. |
| catalogue editor classification | Added dedicated dashboard-product-editor FR/EN/AR phone/tablet classification to existing create validation and size/colour workflow. Count-review and additional tablet widths remain open. |

## Validation and limitations

- Targeted non-browser batch: 115 suites. Four initial failures required updating a source assertion, the channel-note expectation, a minimal employee SQLite fixture and the byte-exact serveur fixture. All four passed after repair; the batch therefore has 115 passing suites after targeted reruns. Additional final checks: 38 waiter properties (100 cases each), 12 channel properties (100 cases each), 23 print-verdict controls, byte-exact serveur reconstruction, known-issues and coverage inventory, 679 size checks and 811 PWA shell checks. No full `tools/check.js` execution.
- Red evidence: `/tmp/resto-{sm,wm,channel,menu,print,coverage}-red.log`. Green logs and the batch inventory are under `/tmp/resto-tests/`, `/tmp/resto-test-results.json` and `/tmp/resto-*-green.log`.
- Coverage annotations are source declarations, not browser success certificates. Both changed browser suites were invoked individually through the required machine-wide slot wrapper. Chromium failed to launch (code null, no stderr) before any scenario. These layouts require a lead rerun in an environment where Chromium starts. No accessibility or size pin was raised.
- Known-issues update removes three entries, adds none. No schema change, migration, production operation, commit, push or stamp change.
- Assets to restamp: `assets/kitchen-print-queue.js`, `assets/restaurant-menu-workspace.js`, `assets/serveur-app.js`.

## Changed file inventory
- `assets/kitchen-print-queue.js`
- `assets/restaurant-menu-workspace.js`
- `assets/serveur-app.js`
- `functions/api/channel/order.js`
- `functions/api/employee.js`
- `functions/api/sale.js`
- `tools/briefing-discounts-test.mjs`
- `tools/channel-properties-test.mjs`
- `tools/coverage-baseline.json`
- `tools/coverage-manifest-test.mjs`
- `tools/coverage-manifest.json`
- `tools/employee-truth-test.mjs`
- `tools/fixtures/serveur/original.js.gz`
- `tools/fixtures/serveur/split.json`
- `tools/known-issues-baseline.json`
- `tools/menu-i18n-test.mjs`
- `tools/relay-print-verdict-test.mjs`
- `tools/server-money-properties-test.mjs`
- `tools/serveur-money-properties-test.mjs`
- `tools/surface-matrix-states-ops-browser-test.mjs`
- `tools/surface-matrix-states-promos-catalogue-browser-test.mjs`
- `docs/decisions/2026-10-24-wave-d.md`
- `docs/decisions/2026-10-24-wave-d-resto-evidence.md`

Tracked code/test/config diff: 139 inserted lines, 34 removed lines, plus the regenerated binary serveur fixture. Two decision/evidence documents are new.
