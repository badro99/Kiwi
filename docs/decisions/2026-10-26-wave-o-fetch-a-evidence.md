# Wave O · fetch-a evidence

All five named gaps have a 12-second transport deadline, AbortController support,
and a promise rejection fallback when abort is absent or ignored. JSON reads share
the deadline. Attendance decisions keep their existing response-only success path.
No shell tags, stamps, service-worker generation, fixtures, or pins changed.
Cloud-document deadlines apply only to `team`, preserving other feature transports.

## Changed files

Line counts are additions/deletions against the initial branch, including new files.

| File | Lines |
| --- | --- |
| `assets/clients-store.js` | +38 / −4 |
| `assets/cloud-doc.js` | +28 / −2 |
| `assets/employee-live.js` | +26 / −1 |
| `assets/invoicing.js` | +27 / −2 |
| `assets/team-hours.js` | +26 / −1 |
| `assets/team.js` | +39 / −5 |
| `tools/audit-remediation-inventory-loyalty-test.mjs` | +2 / −2 |
| `tools/check.js` | +1 / −0 |
| `tools/clients-properties-test.mjs` | +1 / −1 |
| `tools/customer-balance-harness.mjs` | +1 / −1 |
| `tools/employee-live-test.mjs` | +4 / −2 |
| `tools/request-pollers-test.mjs` | +2 / −0 |
| `tools/team-codes-at-rest-test.mjs` | +1 / −1 |
| `tools/team-split-test.mjs` | +2 / −1 |
| `tools/fetch-deadline-test.mjs` | +73 / −0 |
| `docs/decisions/2026-10-26-wave-o.md` | +8 / −0 |
| `docs/decisions/2026-10-26-wave-o-fetch-a-evidence.md` | +176 / −0 |

## Red first and recovery evidence

`tools/fetch-deadline-test.mjs` is registered in `tools/check.js`. For the red run,
all six runtime files were temporarily restored from their pristine initial bytes,
the suite was run, and the edited bytes were restored immediately afterwards.
No git write commands were used. Each named case failed on the original code:

| Gap / test case | Original failure | Passing recovery assertion |
| --- | --- | --- |
| invoices#0 | never-settling fetch leaves API pending | offline error, aborted signal, successful retry |
| team#0 | roster read remains pending | roster/cloud read resolves false, live busy flag clears, localized retry notice, retry allowed |
| planning#0 | correction handler remains pending | button re-enabled, notice shown, correction retained; retry removes it only after success |
| employee#0 | flush remains pending | durable queue retained, retry scheduled at 15 seconds, same opId resent before next punch |
| clients#1 | two concurrent reads instead of one | callbacks settle with false and timeout error; per-book slot released, retry succeeds |

The sixth case covers all six transports without AbortController, stalled JSON
bodies, successful retries, and timer cleanup. Fake clocks expire only the
12-second deadline; no browser, paid API, or model call is involved.

## Suites and checks

63 non-browser suites passed; two required suites remain deliberately red:

- `stamp-drift-test.js`: lead must restamp the six runtime assets listed above.
- `team-catalog-split-test.mjs`: byte-exact region proof requires lead resealing.

`team-split-test.mjs` passes after its harness waits for transport promise chains
to drain before comparing markup; frozen source and markup assertions remain.
`team-test-source.cjs` was also executed successfully as a source-helper check.
`file-size-ratchet-test.mjs`: 774 checks passed, no pin raised.
`pwa-shell-test.js`: 947 checks passed. All six runtime syntax checks and
`git diff --check` passed.

`economat-real-d1-transfer-test.mjs` initially hit npm cache permissions; retry
with `npm_config_cache=/tmp/kiwi-fetch-npm-cache` and
`XDG_CONFIG_HOME=/tmp/kiwi-fetch-config` passed all 20 local D1 checks.
The complete targeted run used those writable paths and passed that suite too.

Passing suite inventory:

- `android-native-test.mjs`
- `android-print-bridge-test.mjs`
- `app-bundle-test.mjs`
- `audit-remediation-inventory-loyalty-test.mjs`
- `briefing-planning-test.mjs`
- `bump-stamp-test.mjs`
- `cashier-cancel-test.mjs`
- `check-parallel-test.mjs`
- `clients-display-properties-test.mjs`
- `clients-outbox-owner-test.mjs`
- `clients-properties-test.mjs`
- `clients-sync-tenant-test.mjs`
- `cloud-doc-offline-test.js`
- `cloud-doc-paired-test.js`
- `cloud-doc-quota-test.mjs`
- `cost-margin-test.js`
- `cross-store-copy-test.mjs`
- `customer-balance-properties-test.mjs`
- `dashboard-truth-test.mjs`
- `economat-rd-invariants-test.mjs`
- `economat-real-d1-transfer-test.mjs`
- `employee-live-test.mjs`
- `fetch-deadline-test.mjs`
- `file-size-ratchet-test.mjs`
- `floorplan-lww-test.mjs`
- `floorplan-sync-test.js`
- `hotel-cloud-save-test.mjs`
- `hotel-stays-group-test.mjs`
- `hotel-units-test.mjs`
- `import-test.js`
- `invoicing-print-test.mjs`
- `landing-claims-test.mjs`
- `legacy-venue-modals-test.mjs`
- `loyalty-refused-redemption-test.mjs`
- `loyalty-reserve-test.mjs`
- `loyalty-truth-test.mjs`
- `maison-client-history-test.mjs`
- `native-pass4-test.mjs`
- `network-recovery-test.mjs`
- `pairing-resolver-test.mjs`
- `planning-layout-test.mjs`
- `platform-ops-test.mjs`
- `pressing-money-properties-test.mjs`
- `print-paper-test.mjs`
- `promos-test.js`
- `pwa-shell-test.js`
- `queues-wave-n-test.mjs`
- `relay-print-verdict-test.mjs`
- `request-pollers-test.mjs`
- `sale-invoice-cache-key-test.mjs`
- `sale-invoice-test.mjs`
- `sale-line-v2-test.mjs`
- `scoped-tab-isolation-test.mjs`
- `sidebar-language-test.mjs`
- `store-cas-test.mjs`
- `team-added-toast-test.mjs`
- `team-codes-at-rest-test.mjs`
- `team-job-names-test.mjs`
- `team-roster-purge-test.mjs`
- `team-split-test.mjs`
- `team-truth-test.mjs`
- `till-truth-test.mjs`
- `vertical-feature-parity-test.mjs`

## Browser suites for the lead

Not run: Chromium cannot start in this sandbox. This list includes suites naming
changed source/test files, with recursive browser classification by check-guard.
Some broader suites name `tools/check.js`, which registers the new regression.

- `app-interaction-test.mjs`
- `avoir-customer-scope-browser-test.mjs`
- `caisse-ink-dark-browser-test.mjs`
- `check-guard-test.mjs`
- `clients-book-page-browser-test.mjs`
- `dash-phone-pages-ar-browser-test.mjs`
- `dash-phone-pages-browser-test.mjs`
- `dash-phone-pages-kit-browser-test.mjs`
- `dash-phone-sheets-ar-browser-test.mjs`
- `dashboard-breadcrumb-language-test.mjs`
- `discount-policy-live-browser-test.mjs`
- `hotel-direct-booking-browser-test.mjs`
- `hotel-stays-group-browser-test.mjs`
- `invoicing-pdf-pages-browser-test.mjs`
- `invoicing-v2-browser-test.mjs`
- `maison-caisse-browser-test.mjs`
- `maison-dashboard-browser-test.mjs`
- `maison-shelf-price-browser-test.mjs`
- `native-owner-home-browser-test.mjs`
- `native-store-readiness-test.mjs`
- `source-assertion-ratchet-test.mjs`
- `sync-ledger-boutique-browser-test.mjs`
- `sync-ledger-browser-test.mjs`
- `trades-ledger-browser-test.mjs`
- `trades-ledger-care-browser-test.mjs`
- `trades-ledger-retail-browser-test.mjs`

## Remaining work

Lead: run the listed browser suites, reseal the team catalogue split proof,
restamp `assets/invoicing.js`, `assets/team.js`, `assets/team-hours.js`,
`assets/employee-live.js`, `assets/clients-store.js`, and `assets/cloud-doc.js`,
then run the full gate and commit. No git writes, commit, or push were performed.
Product decisions are in `docs/decisions/2026-10-26-wave-o.md` under `fetch-a`.
