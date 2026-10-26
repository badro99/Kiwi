# Wave O · truth · handoff

All nine assigned gaps are addressed. Decisions: [2026-10-26-wave-o.md](../decisions/2026-10-26-wave-o.md#truth).

## Changes

| File | Added / removed lines |
| --- | --- |
| `assets/agent-voice.js` | +1 / −0 |
| `assets/briefing.js` | +27 / −3 |
| `assets/live-link.js` | +17 / −14 |
| `assets/menu-scan.js` | +7 / −1 |
| `assets/sold-insights.js` | +4 / −4 |
| `functions/api/_client-merge.js` | +3 / −3 |
| `functions/api/ai/vision-inspect.js` | +51 / −19 |
| `functions/api/clients.js` | +4 / −8 |
| `tools/briefing-properties-test.mjs` | +1 / −1 |
| `tools/briefing-tenant-test.mjs` | +1 / −1 |
| `tools/briefing-test.mjs` | +1 / −1 |
| `tools/check.js` | +1 / −0 |
| `tools/clients-properties-test.mjs` | +7 / −2 |
| `tools/menu-scan-test.mjs` | +1 / −1 |
| `assets/live-consumer-errors.js` | +16 / −0 |
| `tools/wave-o-truth-test.mjs` | +132 / −0 |
| `docs/decisions/2026-10-26-wave-o.md` | +12 / −0 |
| `docs/handoffs/WAVE-O-TRUTH.md` | +180 / −0 |

## Red-first evidence

`tools/wave-o-truth-test.mjs` is registered in `tools/check.js`. All eleven tests failed against the original implementations, then passed after restoration. Proof used filesystem replacement from read-only `git show HEAD:<path>`, ran the suite, and restored working bytes in `finally`; no git writes. Logs: `/tmp/wave-o-reverted-red.log` and `/tmp/wave-o-restored-green.log`.

| Gap | Regression group and original failure |
| --- | --- |
| vision#0 | `vision#0 retains 61 lines…`: original returns 60 and omits incomplete review flag. |
| vision#1 | `vision#1 zero stays zero…`: original changes zero to one; accepts Infinity and unreconciled totals. |
| vision#2 | `vision#2 / i18n#0 selected locale…`: original prompt lacks selected English language. |
| i18n#0 | Same prompt fixture; now checks FR/EN/AR without model calls. |
| i18n#1 | `i18n#1 all sold dates…`: original hard-codes French; now also executes the shipped date expression in all three locales. |
| menu#2 | `menu#2 rejects overflow…` and actual handler: original slices; seven files do not produce explicit rejection. |
| clients#0 | `clients#0 both merge paths…`: original caps notes/tags. Updated `clients-properties-test.mjs` additionally proves automatic replay and explicit merge preserve 21,022 note characters and 402 tags. |
| sync#2 | `sync#2 consumer update failures…` and actual bridge: original swallows both consumer failures. The behavior test also verifies refund void removal proceeds after sales removal throws. |
| briefing#1 | `briefing#1 saves await…` and actual module: original has no per-save result/marker or confirmed-write retry. |

## Targeted verification

93 non-browser files executed: 90 passed; three remaining results below. Size ratchet: 775 checks passed. PWA shell: 947 checks passed. New regression suite: 11 passed. Client properties: 41 strict properties passed, 100 runs; briefing properties: 26 strict properties passed, 150 runs. Changed JavaScript syntax and `git diff --check` passed.

Remaining results:

- `hotel-split-test.mjs`: expected byte-exact `assets/agent-voice.js` fixture mismatch from adding selected locale to the request. Lead must reseal the fixture.
- `stamp-drift-test.js`: expected, stamps deliberately untouched. Restamp `assets/agent-voice.js`, `assets/briefing.js`, `assets/live-link.js`, `assets/menu-scan.js`, `assets/sold-insights.js`.
- `economat-real-d1-transfer-test.mjs`: sandbox blocked npm cache access; retried with a temporary npm cache, then Wrangler registry access was blocked under the user preferences directory. Lead must rerun this local D1 integration suite.

Passed files:

- `admin-delete-r2-test.mjs`
- `agent-vision-test.mjs`
- `agent-voice-test.mjs`
- `ai-vision-models-test.mjs`
- `android-native-test.mjs`
- `android-print-bridge-test.mjs`
- `app-bundle-test.mjs`
- `audit-remediation-ai-channel-surfaces-test.mjs`
- `audit-remediation-inventory-loyalty-test.mjs`
- `briefing-cancellations-test.mjs`
- `briefing-card-placement-test.mjs`
- `briefing-cash-sessions-test.mjs`
- `briefing-discounts-test.mjs`
- `briefing-late-orders-test.mjs`
- `briefing-low-stock-test.mjs`
- `briefing-margin-test.mjs`
- `briefing-planning-test.mjs`
- `briefing-properties-test.mjs`
- `briefing-sales-drop-test.mjs`
- `briefing-tenant-test.mjs`
- `briefing-test.mjs`
- `business-day-surfaces-test.mjs`
- `business-day-timezone-test.mjs`
- `caisse-chip-gate-test.mjs`
- `caisse-offline-sync-test.mjs`
- `caisse-outbox-full-test.mjs`
- `caisse-payment-upload-test.mjs`
- `caisse-reconnect-test.mjs`
- `cashier-cancel-test.mjs`
- `check-parallel-test.mjs`
- `clients-pending-write-test.mjs`
- `clients-properties-test.mjs`
- `clients-sync-test.mjs`
- `core-test-source.cjs`
- `economat-rd-invariants-test.mjs`
- `employee-live-test.mjs`
- `employee-loyalty-bound-test.mjs`
- `feed-changes-test.mjs`
- `financial-ledger-invariant-test.mjs`
- `formula-receipt-pricing-test.mjs`
- `hospitality-plus-test.mjs`
- `hotel-units-test.mjs`
- `import-test.js`
- `landing-claims-test.mjs`
- `live-feed-backfill-test.mjs`
- `live-link-merchant-identity-test.mjs`
- `live-link-queue-ownership-test.mjs`
- `live-link-settlement-test.mjs`
- `live-link-test.js`
- `live-link-write-ahead-test.mjs`
- `loyalty-truth-test.mjs`
- `menu-scan-i18n-test.mjs`
- `menu-scan-test.mjs`
- `modal-desc-escape-test.mjs`
- `native-pass4-test.mjs`
- `offline-foundation-test.mjs`
- `operating-day-split-session-test.mjs`
- `operator-snapshot-test.mjs`
- `operator-workspace-test.mjs`
- `pairing-resolver-test.mjs`
- `quarantine-settlement-test.mjs`
- `refund-reporting-test.mjs`
- `relay-print-verdict-test.mjs`
- `request-headers-test.mjs`
- `request-pollers-test.mjs`
- `retail-truth-test.mjs`
- `retail-z-reconciliation-test.mjs`
- `runtime-ddl-routes-test.mjs`
- `sale-id-collision-test.mjs`
- `sale-invoice-test.mjs`
- `sale-line-v2-test.mjs`
- `sales-centime-precision-test.mjs`
- `sales-reconcile-test.mjs`
- `schema-minimum-test.mjs`
- `security-and-channel-hardening-test.mjs`
- `service-interconnectivity-test.mjs`
- `sold-insights-test.js`
- `stock-money-properties-test.mjs`
- `store-credit-sale-test.mjs`
- `subscription-privacy-test.mjs`
- `takeout-confirmation-test.js`
- `ticket-141-test.mjs`
- `till-truth-test.mjs`
- `tips-truth-test.mjs`
- `trades-money-properties-test.mjs`
- `wave-d-security-test.mjs`
- `wave-o-truth-test.mjs`
- `weather-test.mjs`
- `file-size-ratchet-test.mjs`
- `pwa-shell-test.js`

## Browser suites for the lead

None run. Source-based browser classification followed local imports, including conservative matches in guard tests.

- `app-interaction-test.mjs`
- `avoir-customer-scope-browser-test.mjs`
- `caisse-ink-dark-browser-test.mjs`
- `check-guard-test.mjs`
- `clients-book-page-browser-test.mjs`
- `dash-phone-pages-ar-browser-test.mjs`
- `dash-phone-pages-browser-test.mjs`
- `dash-phone-pages-kit-browser-test.mjs`
- `dash-phone-sheets-ar-browser-test.mjs`
- `hotel-direct-booking-browser-test.mjs`
- `hotel-stays-group-browser-test.mjs`
- `live-link-crash-browser-test.mjs`
- `live-link-outbox-browser-test.mjs`
- `maison-caisse-browser-test.mjs`
- `maison-dashboard-browser-test.mjs`
- `maison-shelf-price-browser-test.mjs`
- `native-owner-home-browser-test.mjs`
- `native-store-readiness-test.mjs`
- `sale-unsynced-test.mjs`
- `sold-insights-layout-test.mjs`
- `source-assertion-ratchet-test.mjs`
- `sync-ledger-boutique-browser-test.mjs`
- `sync-ledger-browser-test.mjs`
- `trades-ledger-browser-test.mjs`
- `trades-ledger-care-browser-test.mjs`
- `trades-ledger-retail-browser-test.mjs`

## Release work left to lead

Run the listed browser suites, reseal the split fixture, restamp the five assets, run the local D1 suite and full gate, review and commit. Include new `assets/live-consumer-errors.js` in deployment; it is dynamically imported when a consumer update fails. No stamps, service-worker generation, pins, production data, index or commits were changed. No real AI calls or paid APIs were used.
