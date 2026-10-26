# Wave P a11y validation

## Changed files

Tracked file line changes (+ / -):

```
12	5	assets/admin-workspace.js
23	8	assets/employee-planning.js
2	2	assets/menu-catalog.js
16	12	assets/onboarding.js
4	1	assets/pages-pro/boutique-promos-returns.js
12	10	assets/pos-epicerie.js
2	0	tools/check.js
1	1	tools/store-templates-test.mjs
```

- `assets/credit-cancel-dialog.js`: 16 new lines.
- `assets/credit-history-page.js`: 25 new lines.
- `tools/wave-p-a11y-test.mjs`: 29 new lines.
- `tools/wave-p-keyboard-browser-test.mjs`: 107 new lines.
- `docs/decisions/2026-10-26-wave-p.md`: 15 new lines.

## Regression evidence

`tools/wave-p-a11y-test.mjs` has seven separately reported checks: modal containment (employee + serveur), chronological notices, native menu switch, semantic onboarding handoff, amount confirmation, bounded ledger, and dossier refresh preserving notes. All seven failed with the six production files temporarily replaced by `git show HEAD:<path>` contents (exit 1); all seven passed after restoring the edited bytes (exit 0). No Git-writing command was used. These are source-contract checks plus an executed pagination function; real keyboard behavior remains for Chromium.

## Non-browser suites

- `tools/admin-crm-layout-test.mjs`: PASS
- `tools/business-day-surfaces-test.mjs`: PASS
- `tools/cost-margin-test.js`: PASS
- `tools/credit-book-properties-test.mjs`: PASS
- `tools/credit-book-test.mjs`: PASS
- `tools/critical-flow-test.mjs`: PASS
- `tools/cross-store-copy-test.mjs`: PASS
- `tools/dashboard-pin-vault-test.mjs`: PASS
- `tools/employee-live-test.mjs`: PASS
- `tools/employee-timezone-test.mjs`: PASS
- `tools/employee-truth-test.mjs`: PASS
- `tools/formula-protocol-test.mjs`: PASS
- `tools/inventory-queue-unblock-test.mjs`: PASS
- `tools/locale-handoff-test.mjs`: PASS
- `tools/menu-carte-store-test.js`: PASS
- `tools/menu-formula-properties-test.mjs`: PASS
- `tools/menu-i18n-test.mjs`: PASS
- `tools/menu-properties-test.mjs`: PASS
- `tools/menu-pull-route-test.js`: PASS
- `tools/menu-rules-properties-test.mjs`: PASS
- `tools/onboarding-alignment-properties-test.mjs`: PASS
- `tools/onboarding-business-type-test.mjs`: PASS
- `tools/onboarding-data-test.mjs`: PASS
- `tools/onboarding-gate-test.mjs`: PASS
- `tools/onboarding-team-recap-test.mjs`: PASS
- `tools/onboarding-truth-test.mjs`: PASS
- `tools/operating-day-operator-test.mjs`: PASS
- `tools/operator-workspace-test.mjs`: PASS
- `tools/orderpro-formula-choice-images-test.mjs`: PASS
- `tools/orderpro-guestpage-editor-test.mjs`: PASS
- `tools/pages-pro-lazy-registry-test.mjs`: PASS
- `tools/resto-carte-test.js`: PASS
- `tools/retail-truth-test.mjs`: PASS
- `tools/return-client-guards-test.mjs`: PASS
- `tools/returns-sales-sync-test.js`: PASS
- `tools/sale-return-race-properties-test.mjs`: PASS
- `tools/scoped-tab-isolation-test.mjs`: PASS
- `tools/specialty-retail-truth-test.mjs`: PASS
- `tools/store-templates-test.mjs`: PASS
- `tools/trades-money-properties-test.mjs`: PASS
- `tools/vertical-feature-parity-test.mjs`: PASS
- `tools/vertical-state-test.mjs`: PASS
- `tools/wave-n-caps-test.mjs`: PASS
- `tools/wave-n-server-test.mjs`: PASS
- `tools/wave-p-a11y-test.mjs`: PASS
- `tools/file-size-ratchet-test.mjs`: PASS
- `tools/pwa-shell-test.js`: PASS

## Browser suites for the lead

No browser suite was launched. New gate-wired `wave-p-keyboard-browser-test.mjs` covers planning leave/availability/swap Tab loops, inert and focus restoration, notice expansion, Enter/Space on the actual menu switch markup, onboarding completion focus and explicit activation, shared credit review and Escape/confirmation, bounded ledger navigation, and live dossier refresh retaining the actual focused note node and selection.

- `tools/a11y-browser-test.mjs`
- `tools/credit-book-dashboard-browser-test.mjs`
- `tools/credit-book-refund-browser-test.mjs`
- `tools/employee-timezone-browser-test.mjs`
- `tools/entitlement-held-gesture-test.mjs`
- `tools/epicerie-phone-browser-test.mjs`
- `tools/pages-pro-lazy-test.mjs`
- `tools/repeat-sale-guard-test.mjs`
- `tools/trades-ledger-browser-test.mjs`
- `tools/wave-p-keyboard-browser-test.mjs`
- `tools/z-reconciliation-browser-test.mjs`
- `tools/console-dossier-keyboard-browser-test.mjs` (additional existing dossier keyboard coverage).
- `tools/dash-onboarding-browser-test.mjs` and `tools/onboarding-recovery-browser-test.mjs` (additional end-to-end onboarding coverage).

## Lead actions and limits

Restamp all six edited production assets. Include the two new dynamically imported helpers in offline delivery/precache before release; no service-worker or stamp change was authorized here. Run the browser list and the full gate; commit with the required French message/footer. No pin raised. `pages-pro-lazy-registry-test.mjs` passed; the frozen render proof did not go red, and no fixture was resealed. Notice history exposes the server-provided history (currently the latest 20 per employee), without changing server retention.
