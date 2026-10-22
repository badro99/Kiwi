# Customer balances and loyalty properties

`tools/customer-balance-properties-test.mjs` is in check.js's fast tier.
fast-check loads from app/node_modules; absent dependency prints an explicit
skip. Default 300 runs, seed 20261030; KIWI_PROPERTY_RUNS / KIWI_PROPERTY_SEED
override both. strict() accepts replay examples; knownIssue() records shrunk
witnesses and fails if one starts holding, requiring promotion to strict.

## Production map and policy

| Surface | Source of balance / rule |
| --- | --- |
| Loyalty+ client profile, CRM dashboard, boutique/Maison till | assets/clients-store.js KiwiClients; functions/api/clients.js, clients + client_purchase_events + client_reward_events. There is no separate KiwiLoyalty ledger. |
| Earn | Amount model: floor(amount MAD × perMad + floating tolerance). Unset/zero perMad currently defaults to 1; negative values clamp to 0. No model or auto=true earns nothing. Product model uses qualifying item words/quantities; visit model counts visits. |
| Spend | Reward threshold subtracts integer points or stamps, atomic conditional UPDATE + event. Same ref replays once; different ref needs sufficient balance. |
| Refund | Separate loyalty refund event, capped to that sale_ref's purchase amount; points prorated from points originally earned, not today's configuration. Already-spent points are not made negative. Local refund is explicitly an estimate until server sync. |
| Tiers | Client segmentation VIP at 3,000 MAD spend or 20 visits; inactivity/new-customer segments use elapsed days. Ranking does not issue or spend points. Spa demo tiers are separate presentation data. |
| Point expiry | No automatic points-expiry ledger or configurable expiry was found. Inactivity segmentation is not points expiry. |
| Store credit | functions/api/store-credits.js and _store-credit-ledger.js: bearer voucher, issue against a paid sale, atomic spends and append-only events. Generic money balance is not a points balance. Owner adjustments exist and count as additional ledger liability; they can exceed the initial face value up to MAX_CENTS. |
| Retail accounts / receivables | retail-balances.js displays total-paid-pending; _retail-balances.js settles notes. receivables.js tracks delivery collections and books actual cash receipts once. |
| Epicerie ardoise | pos-epicerie.js balanceOf over debt/payment history; vertical-state.js mergeLedger unions independent ids. A receivable owed TO the store, not money owed BY the store. |
| Spa packages / gift cards | trade-workspace-schema.js spa/packages: sessionsTotal-sessionsUsed and total-paid. pos-spa.js confirmPunch consumes sessions. Generic records are not an atomic voucher-spend ledger. pages-pro.js gift-card display/issuance has demo amounts and a toast-only confirmation, not a server gift-card liability ledger. |
| Gym memberships | pos-gym.js memberStatus uses date-based access expiry/frozen status. Membership is an entitlement, not a refundable cash wallet. |
| Pressing prepaid | pressing-ops.js sanitizeOrder caps paid at total and projects remaining due (account mode is separate). |

### What earns points

The loyalty API trusts purchase.amount; it does not join sales or filter tender
method, gifts, tips or credit. Boutique/Maison pass receivedNow, which is the
full ticket for an ordinary checkout and paidNow for a deposit. Ordinary
credit-funded ticket parts are therefore included, as the code currently says.
The suite's earn oracle tests that supplied amount, not a stronger cash-only
rule. Gifts/free tickets at zero amount earn zero amount points, though the
programme may still award visit/product stamps. A caller supplying gift value
as positive purchase.amount can earn points (CB-2). No policy is changed here.

No automatic coupling is assumed between /api/sale void/refund and the separate
loyalty event endpoint. Proper returns must submit the loyalty refund as well.
A voucher is not automatically restored by the cash-refund endpoint (CB-5).
Expiry rules below deliberately remain unchanged, pending owner decisions.

## Harness and proof scope

customer-balance-harness.mjs reuses the declaration extractor from
invoice-vat-harness.mjs, backed by tools/js-declarations.cjs. It loads real
points, reward/ticket functions (including retail shelf rounding), credit-book
merge/balance, receivable due, gym status, spa confirmation and pressing
projection functions. Catalog promotions/consignment are neutral external
fixtures in the reward test; shelf, line pricing and ticket arithmetic are real.
The full clients-store and trade schema execute in reusable VM contexts.

Actual clients GET/POST, store-credit, sale/refund, admin void and collection
handlers run with real signed test cookies on server-money-fixture.mjs:
schema.sql + SQLite, no loopback or remote service. Two concurrent preflight
reads are held before releasing their atomic DB.batch writes. Browser POSTs
remain offline in the sync property; GET calls the actual handler and its
acknowledgements reconcile local pending estimates. This is a store-state
proof, not a rendered browser/UI pixel comparison.

All 21 strict properties run at 3,000 cases × seeds 20261030, 7331, 424242:
189,000 cases plus witnesses. No reduced SQL counts; a database and VM contexts
are reset and reused. Logs: ignored .kiwi/results/customer-balance/.

## Strict properties (21)

1. Amount points match independent integer-centime/configured-rate oracle.
2. Concurrent purchase retries earn once; same ref with changed amount refuses.
3. Competing reward spends cannot overdraw; loser receives clear HTTP 409.
4. Concurrent identical reward ref and later retries spend once.
5. Two partial refunds recover originally earned points after full return.
6. Three partial refunds recover the final fractional-earned point.
7. Racing loyalty refunds cannot reverse more spend than the purchase.
8. Real GET acknowledgements converge local profile/till/dashboard book and
   server points/spend after purchase and refund.
9. Inactive or automatic programme earns nothing and refuses reward spending.
10. Real boutique/Maison ticketTotals keep free/percent rewards nonnegative,
    and charge the independent whole-dirham shelf-rule oracle amount.
11. Concurrent identical credit issue creates one voucher/event.
12. Competing issues/spends stay within paid amount / available voucher; retries
    spend once, losing distinct spends return 409.
13. Successive ticket spends conserve issue = remaining + spent.
14. Retail note due equals max(0,total-paid-pending).
15. Competing delivery collections never exceed owed; duplicate ids book once.
16. Ardoise merge retains independent debts and deduplicates retried ids.
17. Spa package projected sessions and unpaid balance cannot be negative.
18. Spa confirmation cannot consume more sessions than sold on replay.
19. Pressing prepaid projection caps paid and conserves remaining due.
20. Gym statuses follow their existing calendar rule; frozen overrides expiry.
21. Tier segmentation changes no point balance.

## Minimal corrections, red on untouched HEAD

- **Reward race [1]**: balance/threshold 1, two tills redeem distinct refs.
  One succeeds; losing conditional UPDATE previously returned 503. It now
  returns reward-not-ready/409, matching ordinary insufficient points.
- **Fractional clawback [100 cents]**: buy 1 MAD at 1 point/MAD (one point earned),
  refund 0.33, 0.33 and 0.34 MAD. Independently rounding each claw left one point
  after a full refund. Use the cumulative refunded proportion minus already
  clawed points. The refund endpoint accepts these centime amounts. A till that restricts
  returns to whole dirhams cannot produce this tiny witness through its UI.
- **Refund race [1 cent]**: two loyalty refund requests reversed two cents of
  history from a one-cent purchase. The atomic UPDATE now compares the observed
  prior refund cents; on a lost comparison it rereads/retries at most three
  times. It preserves the existing capped/no-op acknowledgement behaviour.
  No customer cash is paid by this metadata endpoint.
- **Spa [size=1, used=0]**: repeated confirmation consumed past size and also
  inflated visits. confirmPunch now returns when all sessions are used.
  Normal openPunch already checked this; a replayed/stale confirmation bypassed
  that check. This is a bound guard, not full cross-device session idempotency.

## Known witnesses / owner-visible questions

- **CB-1 [1 cent]**: requested voucher expiry at 12:34 stays that instant,
  clamped to 1..730 days from issuance (default 182 days). It is not aligned to
  05:00 merchant time. Checkout refuses at that instant. Keep absolute expiry,
  or change to a business-day contract? No timestamps were rewritten.
- **CB-2 [1 MAD]**: purchase.method='credit' still earns one point. Standard
  retail checkout includes the funded ticket value as described above; API
  callers can submit other positive values without a sale lookup. Owner policy:
  earn on ticket value or received cash/card only? Neither is silently imposed.
- **CB-3 [1 MAD]**: voiding the real sales row leaves its separate loyalty
  purchase point. Owner sees a voided sale but retained client points unless a
  compensating loyalty event is submitted. No automatic void-event bridge was
  added; mapping historical sale refs safely needs a separate design.
- **CB-4 [1 cent]**: two offline tills each settle the same ardoise completely,
  with distinct ids. Union preserves both real receipts and exposes -1 cent.
  Clamping/removing an entry could conceal money actually collected; settlement
  reconciliation is required. Same-id retries are correctly deduplicated.
- **CB-5 [1 cent]**: fully spend a voucher, then try the cash-refund endpoint
  for that zero-received credit-funded ticket. Original voucher remains zero;
  cash refund is not a credit restoration operation. Owner adjustments can
  restore value explicitly, but returns need a defined voucher-restoration or
  reissue contract and idempotent link. No extra liability is invented here.
- **CB-6 [00:00 UTC]**: a spa package dated through Oct 21 is expired at midnight
  Oct 22, before 05:00. Generic schema uses the merchant's calendar date; gym
  status uses device-local calendar dates. Which expiry contract should apply
  to prepaid entitlements? Monetary vouchers and points have different rules.

Remaining limits: generic prepaid records and spa confirmations have no atomic
cross-till session-spend ledger; the end-of-package guard cannot distinguish
legitimate new sessions from repeated callbacks while sessions remain. Gift-card
presentation is not evidence of a durable redeemable balance. These gaps are
recorded rather than manufacturing passing tests for nonexistent guarantees.
