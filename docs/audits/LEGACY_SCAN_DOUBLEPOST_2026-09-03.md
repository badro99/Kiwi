# Audit — non-flag stock scan posts two ledger movements per line

Date: 2026-09-03 · Scope: audit only, no figure rewritten, no
production tenant inspected. Reproduction: `node
tools/legacy-doublepost-repro.mjs` (synthetic fixtures, offline, NOT wired into
`tools/check.js`; exits non-zero if any reproduction pin fails).

## 0 · Forward fix status: FIXED (this section added after the audit)

The forward defect described in §1 is fixed, forward-only, by the phase-1
commit titled `intake · legacy scan forward fix: single writer + busy guard`,
direct child of `d370a3c8` (exact hash in the delivery report):
- `stLegacyPostAll()` (`assets/stock.js`) is the single writer on the
  non-flag path: the handler's `moveStock()` loop stays the sole movement
  writer, `receiveDirect()` is called with `skipMovements: true` (receipt
  document preserved) and `skipCosts: true` (handler checkbox stays the sole
  cost decision), Ultra `attachInvoice` unchanged and now linked to the real
  receipt id.
- Busy/re-entrancy guard (`stClaimConfirmBusy`/`stReleaseConfirmBusy`) on the
  confirm button: concurrent taps dropped, released on every recoverable
  failure path.
- Regression suite `tools/legacy-scan-test.mjs` (8 checks, wired into
  `tools/check.js`): one receipt + one movement per line, stock +1x, costs
  only when checked, busy semantics, demo intact, intake path untouched.
- Historical merchant movements were NOT modified, deleted, reversed or
  "repaired" by the fix. Historical reconciliation remains EXPLICITLY
  UNRESOLVED — see §9, still awaiting a separate owner decision. No backfill,
  migration, repair button or production query was added.

## 1 · Call chain and required conditions

One human confirmation on the scan review (`data-stock-scan-confirm`,
`assets/stock.js`, non-flag path i.e. `intakeDocId` empty) executes, in order,
for every received line:

1. `window.KiwiProcurement.receiveDirect({ supplierId, externalRef,
   receivedAt, lines })` — no `receiptId`, no `skipMovements`. Inside
   `writeReceipt` (`assets/procurement.js`), each line posts a ledger movement
   with id `` inv-<grnId>-<idx> `` via `KiwiInventory.add`.
2. The handler loop then calls `moveStock(it, qty, 'receipt', 'receipt',
   receiptRef, …)` with no `meta.movementId`, so `inventory-ledger.js`
   `clean()` mints a fresh `inv-<uuid>`.

Both rows carry the same item, quantity, reason (`receipt`) and overlapping
refs — but different primary keys. Conditions, all required: real merchant
(`KiwiEnv.isReal()`, else both ledger writes no-op and only the demo overlay
moves once), `window.KiwiProcurement` loaded, `window.KiwiInventory` real.
The flagged intake path is NOT affected (single owner `stIntakePostAll`,
pinned by the posting and slice-1 suites).

## 2 · Blast radius: plans, verticals, pages, asset combinations

- Plans: `receiveDirect`/`writeReceipt` have NO plan gate (only
  `createOrder`/`receiveOrder`/`attachInvoice` require Ultra), so all plans
  hit the movement doubling. On Ultra, each confirmation additionally files
  one invoice document whose lines were already moved twice; each
  re-confirmation files another invoice and two more movements per line.
- Verticals/pages: the stock scan review lives on the dashboard stock page
  (`nav-stock` handler in `assets/stock.js`). Any vertical whose reception
  goes through this review is affected.
- Assets: `dashboard.html` loads both `assets/stock.js` and
  `assets/procurement.js`. If procurement failed to load, only the moveStock
  row posts (single write, random id). `kiwi-caisse.html` loads procurement
  but not the stock scan review, so the doubling needs the dashboard page.
- Demo mode is NOT affected (ledger `add` returns null off-real; the demo
  overlay increments once, inside `moveStock` only).

## 3 · Why idempotency does not catch it

Local (`inventory-ledger.js add`): dedups on exact `id` only, no payload
comparison. Server (`functions/api/inventory/movements.js` POST):
`INSERT OR IGNORE` on the global `id` PK, then acknowledges the stored
cursor. `inv-<grn>-0` and `inv-<uuid>` are distinct keys, so both layers
accept both rows. Deterministic intake ids (`mov-intake-…`) and the `409
id-conflict` pre-check exist only on the flagged path.

## 4 · Amplifiers: replay, devices, retries

- Offline replay: the ledger queues both rows (`d.queued`) and syncs both;
  replay is idempotent per id, which does not help — the ids differ.
- Two devices: each runs the confirm locally, each posts its own pair → 4x
  per line (plus independent receipt documents).
- Retries/double-click: the confirm handler has no re-entrancy guard (no
  disabled state, no busy flag). Every extra confirmation mints a new receipt
  (`grn-<ts>-<seq>`) and N new UUID movements. The flagged path's guard,
  outbox and deterministic ids do not cover this path.

## 5 · What else duplicates (and what does not)

- Receipt documents: YES, one new `grn-*` row per confirmation (seq++).
- Invoices (Ultra only): YES, one new invoice row per confirmation, each
  re-running `matchInvoice` against its own receipt.
- Supplier directory rows: NO on retry (handler find-or-create by name before
  `addSupplier`); cross-device same-name creation can still diverge (ids are
  random, merge is by id) — second-order, unquantified.
- Supplier overlay cards: NO duplicate rows (find-by-name, price overwritten
  in place); the overwrite itself is last-wins.
- Item costs (`KiwiCost.setItemCost`): called twice per line with the same
  value by the two writers (unconditional in `writeReceipt`, checkbox-gated
  in the handler loop) — value converges, timestamps churn; on re-confirm
  with edited costs the last writer wins per its own rule, so the two rules
  can disagree across attempts.

## 6 · Introduction (git history, local repo only)

Both halves landed in one commit: `0c580b74` “feat: harden vertical
operations and inventory workflows” (2026-08-10), which added the handler's
`receiveDirect` call AND procurement's per-line `KiwiInventory.add` in
`writeReceipt`. Before that commit the handler's `moveStock` loop was the
sole movement writer. The double-post has therefore existed on the non-flag
path since 2026-08-10 for real merchants.

## 7 · Why the suites missed it

- `tools/procurement-test.mjs`: drives `receiveDirect` in isolation; asserts
  one receipt, never counts ledger rows against a second writer.
- `tools/economat-procurement-location-test.mjs`: asserts receipt location
  routing, not write cardinality.
- The three `tools/intake-*-test.mjs` suites: pin single ownership ONLY on the
  flagged path (`stIntakePostAll`); the non-flag branch is asserted nowhere.
- No suite executes the non-flag confirm handler end to end (DOM-bound), and
  no suite counts `KiwiInventory.history(item)` rows after a legacy confirm.

## 8 · Remediation design (forward half BUILT — see §0; history still open)

- Minimal fix: give the legacy path one owner — pass `skipMovements: true`
  (and `skipCosts`, honoring the checkbox gate) from the handler's
  `receiveDirect` call, leaving the `moveStock` loop as the sole movement
  writer; or vice versa with deterministic ids. Either is a ~5-line change
  confined to the call sites, reusing the additive options the flagged path
  already proved. Cost: small. Risk: changes live posting counts going
  forward (by design — that IS the fix); must ship with the merchant-facing
  note that scanned receipts stop double-counting.
- Re-entrancy guard on the confirm button (disable + busy flag, released on
  error). Cost: trivial. Risk: near zero.
- Historical reconciliation is a SEPARATE decision (options below), never
  bundled with the forward fix.

## 9 · Historical-reconciliation options (no figures touched by this audit)

- A. Do nothing historically, fix forward only. Cost: zero. Risk: past
  balances stay inflated wherever the path was used; ongoing drift ends.
- B. Paired-row detection + reversal movements (`reason: 'count'` or a
  dedicated correction reason, append-only, never DELETE). Heuristic:
  same merchant + item + `reason=receipt` + pairs with `refId` receipt `BR-*`
  matching a `moveStock` row with identical qty/cost/note inside a short
  window. Cost: medium (detection script + per-merchant review +explicit
  merchant approval per correction). Risk: false positives if a merchant
  genuinely received the same qty twice in one window — hence human approval
  per pair, never bulk auto-reversal.
- C. Full restatement from supplier invoices. Cost: high. Risk: high
  (reinterprets history). Not recommended.

## 10 · What cannot be quantified without authorised production data

- How many merchants ever confirmed a scan on a real venue since 2026-08-10,
  and how many confirmations each issued (needs `store_docs`/D1 movement
  counts per merchant — NOT inspected).
- What share of current balances is phantom (needs per-item receipt-pair
  analysis on live ledgers).
- Whether any merchant already compensated manually (counts, waste
  declarations, or cost edits that mask the inflation).
- Cross-device same-supplier directory divergence in the wild.
