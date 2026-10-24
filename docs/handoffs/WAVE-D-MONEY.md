# Wave D · money · 2026-10-24

Worktree: cx/d-money. No commit, push, stamp changes or production migration.

## Verification and decisions

The nine policy lines are in [the decision log](../decisions/2026-10-24-wave-d.md#money).

| Requested gap | Verified result / proof |
| --- | --- |
| till SM-2 | Confirmed on original code, strict property red; exact gross minus discount now required. Server money properties: 28 strict, 300 runs each. |
| till + sync LQ-1 | Same underlying gap, confirmed red. Shared boutique/Maison payment confirmation now probes a real localStorage or IndexedDB metadata write and refuses if both fail. Existing hold/onLost recovery remains for storage failures after preflight. Queue properties: 25 strict, 300 runs each. A probe does not reserve future capacity or protect against device failure after payment. |
| collected delivery cancellation | Confirmed red. Refused both before and inside the cancellation transaction, including reopen. Received collections remain booked and separately refundable. |
| deposit returns / collectible delivery | Confirmed red. A refund closes the unpaid obligation with one distinct delivery-writeoff audit entry, atomic with cash refund. Historical returned deposits without that entry refuse collection, remain visible with needsReview, and refund replay appends the missing write-off once. Receivables: 14 strict, 100 runs each. |
| boutique EN/AR tablet checkout | Already exercised by the gate-named surface-matrix-states-credit browser journey in all FR/EN/AR phone/tablet combinations. Added dedicated boutique-checkout and boutique-returns coverage cells; no mutable-state refactor. |
| return/exchange/refused-credit annotation | Existing real UI journeys cover these states in all FR/EN/AR phone/tablet combinations. Added dedicated boutique-returns, boutique-exchange and boutique-return-refusal manifest/baseline cells. Runtime rerun blocked at Chromium launch. |
| creditbook CRB-1 | Confirmed on original route. Added POST /api/store with feature verticalops, action credit-book-refund, id, clientId, amountCents, method transfer. Requires the merchant owner session, caps by current advance under CAS, records an immutable ledger counterentry, negative transfer sale and audit once. Generic debt is a receivable, never payout authorization; legacy refund-labelled counterentries are refused. Ledger history cannot be erased or have its money changed. |
| creditbook CRB-2 | Confirmed red. Credit-book document changes require the actual merchant owner session or paired till. Generic operator entitlement alone is insufficient. Credit-book properties: 8 strict, 300 runs each, including concurrent refunds, retries, authorization and tampering. |
| creditbook coverage | The reported FR/AR-desktop-only baseline is stale: credit-book already has all nine locale/viewport cells from the three gate-named till matrix suites. Dedicated advance/refund screen journeys remain open. The new refund operation has route proof, not an owner-facing refund control or rendered flow proof. |
| Shopify shortage | Old stock-floor expectations failed after promoting the full-quantity rule. Replay now records every external piece in signed movements; zero sellable stock does not mean a prior sale was booked. Restocks repay the retained deficit. A later physical count resolves it. FR/EN/AR warning updated. Replay and sync properties green, including 17 strict sync properties, 100 runs each. Historical zero settlement movements remain historical records, not automatically rewritten. |
| Shopify recovery coverage | Mapping/error/retry/replay UI journeys already existed with generic dashboard annotations. Added dedicated shopify-recovery manifest and six phone/tablet locale cells. Runtime rerun blocked at Chromium launch. |
| invoice IV-3 | Confirmed red. Any one-cent discrepancy is rejected before allocating a number. |
| invoice IV-4 | Confirmed red. Shared annual F/AV/D sequences use the year shown in the immutable number and preserve old numbers. Till invoice year follows merchant civil midnight, independently of UTC and the 05:00 business day. VAT/invoice properties: 20 strict, 300 runs each. |

## Validation

238 distinct targeted non-browser suites passed after corrections and reruns. The selection included every non-browser tools/*test* source naming a changed path, plus direct money-property suites, coverage manifest, known issues, size and PWA checks. No full check.js run.

Initial failures caused by old source-pattern/policy expectations, migration replay classification, and a test wrapper were fixed and rerun green. D1 migration tests preserve historical sale invoices and manual series byte for byte. Restore rehearsal proves recovery from every interrupted prefix; the constraint rebuild is not safe to replay blindly after a non-atomic partial apply.

Eight known issues removed from the baseline (SM-2, LQ-1, CRB-1, CRB-2, IV-3, IV-4, two receivables policies). No pin was raised. Size: 680 checks pass. PWA: 811 checks pass. Syntax and git diff --check pass.

Four browser suites attempted, sequentially through the required machine-wide slot wrapper:

- surface-matrix-states-credit-browser-test.mjs
- surface-matrix-states-credit-real-browser-test.mjs
- surface-matrix-states-boutique-browser-test.mjs
- surface-matrix-states-shopify-browser-test.mjs

All four fail before navigation because Chromium cannot launch in this environment. The coverage baseline describes source annotations, not successful browser execution. Dedicated credit-book advance/refund visual journeys remain unimplemented; the general debt locale/viewport annotations already existed.

## Lead integration

Apply/review migration 0011_annual_invoice_series.sql before relying on annual cross-year allocation. It was drafted with tools/d1-migrations.mjs --draft, then completed as a lossless constraint rebuild. Do not apply to production from this job. Reconcile migration numbering with other Wave D jobs if needed.

Restamp these six assets with the lead's normal tooling:

- assets/caisse-lang.js
- assets/channel-link.js
- assets/interactive.js
- assets/live-link.js
- assets/pos-reprint.js
- assets/retail-sale-hold.js

No split-proof runtime file was changed, so no archived split fixture required regeneration.

## Changed files

- assets/caisse-lang.js
- assets/channel-link.js
- assets/interactive.js
- assets/live-link.js
- assets/pos-reprint.js
- assets/retail-sale-hold.js
- docs/decisions/2026-10-24-wave-d.md
- docs/handoffs/WAVE-D-MONEY.md
- functions/api/_credit-book-refund.js
- functions/api/_invoice-series.js
- functions/api/invoice.js
- functions/api/receivables.js
- functions/api/sale.js
- functions/api/sale/cancel.js
- functions/api/sale/refund.js
- functions/api/shopify/_replay-orders.js
- functions/api/store.js
- migrations/0011_annual_invoice_series.sql
- schema.sql
- tools/briefing-discounts-test.mjs
- tools/coverage-baseline.json
- tools/coverage-manifest-test.mjs
- tools/coverage-manifest.json
- tools/credit-book-properties-test.mjs
- tools/d1-migrations-test.mjs
- tools/d1-restore-rehearsal-test.mjs
- tools/invoice-vat-properties-test.mjs
- tools/invoices-v2-test.mjs
- tools/known-issues-baseline.json
- tools/live-link-queue-properties-test.mjs
- tools/receivables-properties-test.mjs
- tools/sale-invoice-test.mjs
- tools/server-money-properties-test.mjs
- tools/shopify-replay-orders-test.mjs
- tools/shopify-sync-properties-test.mjs
- tools/surface-matrix-states-boutique-browser-test.mjs
- tools/surface-matrix-states-credit-browser-test.mjs
- tools/surface-matrix-states-credit-real-browser-test.mjs
- tools/surface-matrix-states-shopify-browser-test.mjs
