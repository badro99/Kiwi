# Stock, recipe and food-cost properties

`node tools/stock-money-properties-test.mjs` uses fast-check from app/node_modules.
`KIWI_PROPERTY_RUNS` defaults to 100 and `KIWI_PROPERTY_SEED` to 20261104;
`KIWI_PROPERTY_ONLY` filters strict properties. Missing fast-check is a visible skip.
The suite is named in check.js's fast tier. No socket or merchant data is used.

## Executed surfaces and oracle

Real inventory-ledger.js and inventory-consumption.js run in isolated VM tills.
Real movements.js and counts.js handlers run on schema.sql through the shared
server-money-fixture.mjs SQLite D1 adapter, which rejects over 100 bound values.
One database is reused/reset, rather than weakening the stress count for D1.
The fake network only transports Requests and Responses; it computes no stock.
Real catalog.js sanitize/stockMutation, cost.js, and named declarations from
dateRange.js and briefing.js supply the remaining production algorithms.
Independent sums use integer milli-units and centimes.

Strict properties cover:

- Interleaved signed sale, return, loss, receipt and transfer movements: local
  and server summary sums, independent variant/location balances, negative stock.
- Two simultaneous till sales of the last ledger unit: both movements survive;
  their negative balance is pulled back to a fresh till.
- Recipe yield and pre-converted stockQty: rounded positive milli-unit consumption,
  replayed sale IDs, full void and waste reversals once.
- Batches 1..200, explicit 40/101/200 cases, stable retry cursors and payload
  conflicts. Unknown reasons are refused without blocking later queue entries.
- Count submission/approval/retry: its frozen delta applies once. A subsequently
  arriving movement with an earlier occurredTs is additive, not absorbed by or
  retroactively rebased into the count. This is the current ledger policy.
- FEFO, then frozen supplier rank/receipt time: weighted rate across selected
  lots, four-decimal precision, no false missing-cost result from float residue.
- Catalog reservation retry and selected-variant isolation.
- Cost coverage revenue/net/refunds and frozen line costs; half-open business
  windows using real zone-law boundaries for Casablanca, UTC and Paris, including
  September 19/20 and October 25, 2026.
- Dashboard and morning briefing thresholds agree, including negative stock.

Two additional deterministic scenarios submit and sync 501/1,001-line physical
counts through the actual 500-row feed. Every line must arrive. These are not
repeated 3,000 times; the randomized count property is.

## Defects and regression witnesses

1. Recipe 0.001 units / yield 2: rounding the negative directly lost the half
   milli-unit. Round positive consumption, then negate. Sale replay stays stable.
2. Repeated generic reverse(loss of 0.001) produced +0.001 surplus. Its default
   reversal ID is now deterministic; explicit operation IDs remain supported.
3. Lots 4.082 + 1.092 at 0.01: binary addition made coverage look incomplete.
   Use the already millesimal remaining quantity, rather than a float sum, to
   decide full coverage.
4. A 501-line count shared one cursor: the first page advanced past its last
   line. Allocate distinct cursors inside the approval transaction, so an intervening
   pull cannot advance past uncommitted adjustments. A paused-approval race
   executes that regression with a concurrent receipt and incremental pull.
5. Restaurant dashboard low-stock rows hid negative stock behind zero. Preserve
   the ledger deficit, matching the morning briefing and stock journal.

6. Kitchen reversal of one piece followed by voiding its two-piece sale returned
   three pieces. Full sale reversal now subtracts prior restorations of each
   original movement. The witness fails before the fix.

## Owner decisions and limits

ST-2: receipt 1 unit at 0.01 plus 150 at 0.02 costs 3.01, but the stored weighted
rate 0.0199 times 151 prints 3.00. Rates deliberately carry four decimals in both
client and D1. Should movements additionally freeze total cost in centimes?
The Stock costing/expiry screens can expose this at large quantities. No schema
or costing-policy migration is made here.

ST-3: a receipt at 0.01, recipe now priced 0.02, one sold portion with no frozen
line cost: inventory consumption costs 0.01 but dashboard coverage costs 0.02.
Dashboard explicitly supports current-recipe fallback and gross costed revenue;
it is not a realized movement COGS/net-sales report. Should that report instead
join frozen ingredient movements and refunds? This pass does not silently change
that policy or claim exact agreement between those different measures.

Recipe modifiers consume their own explicitly identified recipe lines; arbitrary
modifier text is not interpreted as extra ingredient stock. Hotel internal-request
transfer authorization, atomic transfer-pair creation, stale count revisions and
physical return UI remain covered by their dedicated suites, not randomized here.
Catalog reservations refuse a second reservation of the last piece (existing
policy); append-only inventory movements accept both actual sales and show debt.
Compacted history is a base balance plus retained movements, not full lot history.

## Verification

15 strict properties passed 3,000 cases each at seeds 20261104, 42 and 20261022
(at least 135,000 strict cases). The count transaction and kitchen/full-void
regressions additionally received focused three-seed stress after their fixes.
501/1,001-row scenarios passed. Compiled SQLite statements are reused for stress
speed; handlers, bound arguments, results, transactions and the 100-value guard
are never replaced or cached. All six fixes have failing old-code witnesses.
One long stress process exited with native SIGSEGV during the final read-only
window check. That property was rerun successfully for all three seeds with one
reused VM; each other property had already completed its cases. The fast gate
has only the eight known EPERM suites, reproduced on an untouched HEAD snapshot.
The 19 focused stock/recipe/void suites pass. retail-return-stock-browser-test.mjs
requires the owner's loopback/browser environment.
