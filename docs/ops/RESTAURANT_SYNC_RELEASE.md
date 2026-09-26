# Restaurant sync safeguards - release verification

## Scope and financial boundaries

Release starts from `dcd899b1`, cherry-picks `cd52549d` as `1d395437`, then
hardens the safeguards. No receipt is reconstructed from Z totals. No production
PIN, pairing code, test sale, manual data correction or manual migration is part
of verification.

- Visit, order and link-schema read failures return 503 before accepting an
  unlinked receipt. Replaying its immutable ID after recovery links/closes the
  visit. Definitively absent/mismatched visits retain the paid receipt with a warning.
- Unlinked table bills use a merchant/table/order/business-day settlement key.
  The voided holder can be replaced using the existing compare-and-swap guard.
  Different tables are not merged by the old 10-second heuristic.
- Blocked payloads are not retried just because a comparison found them missing.
  A server comparison can permit a removed visit rule to retry; both durable and
  fallback copies check the reason, status, tenant, ID and comparison ID. The
  comparison can reactivate a receipt at most once. Unchanged 400/422 and money
  conflicts require support; even a void does not authorise rewriting an
  immutable receipt under an existing conflicting ID.
- Till status opens receipt details instead of resending quarantined money.
  Dashboard and God Mode show bounded, sanitised debt metadata. Device telemetry
  carries up to 200 detailed blocked receipts per device; the full local outbox
  remains on the till. Telemetry is an observation, not proof of synchronisation.
- A selected closed day uses the explicitly labelled till Z reference; recorded
  ledger money, gap and missing receipt count remain visible. New terminal
  manifests are unioned by receipt ID, never summed twice. Mixed open/closed
  terminals are labelled partial. Multiple old reports without manifests cannot
  safely be unioned and are labelled unverifiable instead of inventing a total.
- Current open days use live server money and waiting debt. Without an available
  observation, sync status is unknown rather than a claimed zero.
- Historical days without comparisons use the exact ledger with an explicit
  cannot-verify note. Legacy `store_docs.dayreports` aggregates are not used.
- Server day boundaries are Africa/Casablanca 05:00, including winter clock
  changes. Restaurant and boutique headline selection uses the same convention.

## Reproducible evidence

- `node --test tools/restaurant-sync-release-test.mjs`: eight scenarios;
  unmodified upstream: **1 pass, 7 fail**; patched code: **8 pass, 0 fail**.
  This includes all five requested fixes, link-schema recovery, employee order
  lookup recovery and overlapping terminal manifests. The link-schema failure
  case already passed on upstream; it protects the cherry-picked regression.
- `node tools/z-reconciliation-browser-test.mjs`: **40 assertions**, actual Chrome
  and production JS, synthetic Amira restaurant/boutique/till/God Mode fixtures.
  Tests selected-day headline, amounts, gap, missing count, blocked receipt detail,
  no resend on till status click, date switches, fetch failure and 390px layout.
  Untouched upstream fails to render the required headline.
- `node tools/live-link-outbox-browser-test.mjs`: actual Dexie/IndexedDB, failed
  POST persistence, automatic same-ID replay, pending settlement, permanent 422
  quarantine and once-per-comparison reactivation for a removed rule.
- `node tools/maison-dashboard-browser-test.mjs`: **24 assertions**, full local
  dashboard HTML and production JS, synthetic Amira merchant. Z headline is
  labelled correctly without fabricating local receipt rows.
- `node tools/operations-system-test.mjs`: **286 controls**, including bounded
  blocked receipt details without arbitrary customer payload fields.
- Full release gate: run `node tools/check.js` on the final tree before each mirror
  push. Keep command logs outside the checkout. Use `git ls-remote` on both URLs
  and compare deployed GitHub Pages asset bytes/stamps after deployment.

Screenshots and tests demonstrate local rendered behaviour, not acceptance on
the unavailable original Pasta Corner till. Missing receipt-level history is
not recoverable from aggregate Z totals alone. No missing history was fabricated.

## Owner-only physical-till acceptance

1. Reload the real restaurant till. Check the sync indicator and inspect any debt.
2. Take one card and one cash payment on a table; confirm receipt IDs and visit closure.
3. Void one of them and pay the bill again; confirm only non-voided money is counted.
4. Close the register and let the Z comparison finish.
5. Select that business day in the dashboard. Confirm labelled Z total, recorded
   total, zero gap and zero missing receipts. If blocked debt appears, keep the
   original till/journal intact and contact support; do not clear storage.
