# Sales history: bounded reads and slice B design

Status: prerequisite only. This change does not trim data or alter reconciliation.
References below identify the current functions; proposed behavior is not shipped.

## Read contract delivered here

`GET /api/feed?window=1&merchant=M&from=F&to=T&limit=500&after=A`
requires both bounds, positive integer milliseconds, `F < T`, and at most 400 days
plus two hours. Rows are ordered by `(ts, rowid)`, with exclusive `to` and an
opaque, versioned continuation bound to merchant and both bounds. `complete:true`
and `next:null` prove traversal ended; a full page alone proves nothing.
Entitlement is rechecked on every page, including paired till authorization.
Void exclusion is mandatory; unavailable schemas fail instead of declaring zero.
Legacy `from`-only and rowid modes retain their existing protocol.

`KiwiSalesWindow.fetchRaw(F,T)` returns all pages or null, never a prefix.
It stops at 20 pages, validates scope/order/completion, and caches only in memory
(four windows, 60 seconds). Failures are retryable. Raw readers must show loading
or unavailable when null, rerender after resolution, and never persist these rows.
This is a traversal of changing data, not an immutable point-in-time snapshot.
Backdated inserts before an already-read key and intervening voids can change it.

## Required replay contract before deletion

A timestamp boundary is not a rowid cursor. Never derive `since` from the last
window row, the first retained row, or the largest cursor encountered in a page.
Slice B needs a server replay fence `F`: the scoped maximum sales rowid, including
voided rows, captured before bootstrap. Extend window pages to carry this fence
and restrict all pages to `rowid <= F`; bind the fence into continuation tokens.
Bootstrap `[coverage, fixedUpper)`; use 400-day chunks if necessary and a server
upper time bound covering all accepted timestamps at the fence. Reject incomplete
or oversized reads rather than accepting the client helper's 20-page prefix.
After bootstrap, poll rowid mode from `since=F`, catching every subsequent insert,
including late uploads timestamped before coverage. Such rows invalidate that day's
summary/raw cache; apply their sync acknowledgement but do not re-add archived rows.
Voids need a revision or paginated change stream: today's latest-500 void list
cannot establish historical freshness after an arbitrarily long offline interval.
A reconnect must revalidate affected history or mark it unavailable until repaired.

## Reconciliation changes for slice B

| Function and current location | Assumption today | Required change |
| --- | --- | --- |
| `watchFeed`, `assets/live-link.js:1132` | Each tenant starts `since=0` and replays all history. | Without coverage keep this path. With coverage use fenced window bootstrap above, then rowid polling from F. Reset scope, fence, continuation and proof on merchant/coverage change. Snapshot mode stays read-only and never flushes an operator outbox. |
| `drainBackfill`, `assets/live-link.js:1213` (state at :1136) | `sales.length === pageSize` means another rowid page. | In window bootstrap follow `next` until explicit `complete`; enforce progress and page caps. Set `feedComplete` only for the validated coverage interval; publish interval and fence alongside it. Keep length-based logic only in legacy mode. |
| `validateSnapshotPage`, `assets/live-link.js:1105` | Cursor strictly increases and response cursor equals last row. | Separate protocol branches. Window branch validates merchant, exact bounds/fence, `(ts,rowid)` order, unique rowids and continuation/completion agreement. Rowids may decrease across increasing timestamps. Keep legacy validation unchanged. |
| `verifySnapshotLedger`, `assets/live-link.js:1554` | Entire local sales/refund arrays exactly equal the accumulated feed. | Compare only server-backed rows in the proved `[coverage,fixedUpper)` and fence, by cursor, timestamp and signed cents. Exclude pending local rows from equality, preserve them, and report pending explicitly. Never call missing archives corruption. |
| `retainCursors` (`salesRetainCursors`), `assets/venues.js:4184`; refunds counterpart :4230 | Allowed cursors describe the full entitled history. | Accept a proved interval/fence; reconcile only server-backed rows within it, preserving pending/manual rows and rows outside the proof. Invoke only after bootstrap completeness. Trimming is a separate confirmed-row operation. |
| `resolve()`, `assets/day-report-dash.js:431` | Completed feed can rebuild any day, even over a saved report. | Before coverage return the saved archive without rebuilding. If absent, fetch summary for headline totals; details require a complete raw window. Never fabricate session/drawer facts from summaries. Show loading/offline on missing data. Apply the same coverage gate to `feedIsAuthoritative`, `totalsFor` and `snapMissesSales`. |

`accumulateFeed` (`assets/live-link.js:1423`) and `bridgeToStore` (:1434) must keep
old rows out of both the replay accumulator and local ledger once coverage exists.
After trimming, prune their old entries and corresponding `feedSeen` keys; otherwise
a venue change can re-add them. `applyVoids` (:1369) must invalidate historical
summary/raw caches even when the affected cursor no longer exists locally.

## Confirmation, scope, and trim safety

`paymentCompletion` (`assets/live-link.js:439`) accepts only a successful JSON
body with `ok` and no `settlementPending`. The durable outbox is acknowledged
at :652 through `KiwiOffline.acknowledge` (`assets/offline-db.js:183`).
`moneySignal` (:210) emits per-ID acceptance/aliases, but `kiwi:sale-ack:<merchant>`
is only a last-success timestamp: it does not confirm every ledger row.
A canonical feed row supplies `cursor` and `id`; `bridgeToStore` copies these as
`cursor` and `saleId`, and `salesEntry` (`assets/venues.js:4066`) persists cursor.
Require a fresh scoped server match on cursor, canonical ID, timestamp and cents
for each deletion candidate, with no pending/sending/blocked debt for that ID.
A cursor alone, an old event, an empty outbox, or backfillComplete alone is insufficient.
Manual rows without that proof remain. Apply the same rule to refunds.

Resolve the exact ledger scope through `SALES_KEY` (`assets/venues.js:3948`) and
`salesTenant` (:3935). Use its suffix, e.g. `scoped@merchant`, for both coverage and
last-trim markers; never use shared `own`/`scoped`. Update the summary reader's
scope resolver at the same time. Never wipe other namespaces or trim demo ledgers.

1. After initial rendering, schedule idle work with a timeout fallback. Attempt
   at most once per business day per scope; retry transient failures the next day.
2. Hold a per-scope lock shared by every ledger writer and feed bridge; reread
   identity, marker, sales, refunds and upload debt under that lock. Without a
   supported cross-tab exclusion mechanism, skip trimming rather than race writers.
3. Compute C with `KiwiDayReport.shiftDay(today,-119)` and `dayBounds(...).from`:
   today plus 119 preceding business dates remain. Use store cutoff/zone, never
   subtract 120 fixed 24-hour durations. Keep empty boundary days too.
4. Require every candidate below C, including refunds, to have the fresh server
   proof above. Any unmatched/pending candidate aborts the entire scope's trim;
   invalid timestamps, missing identity/clock/proof, or storage errors also abort.
5. Store/read back `kiwiSalesCoverage:<scope>=C` before deleting confirmed rows.
   If marker persistence fails, delete nothing. If ledger writes fail afterward,
   the marker plus an untrimmed superset is safe: totals ignore old local rows.
   Keep the marker, finish pruning on a later attempt, and do not roll it back
   after either sales or refund deletion. Notify only after the coherent update.
6. Writers/bridges must honor coverage after reload. A newly pending backdated
   row below C suspends historical completeness until reconciled; preserve it,
   show partial state, and do not silently hide it behind server-only summaries.
   A late confirmed server row stays archived and invalidates historical caches.

## Open questions

- Approve the fenced bootstrap and a revision/change-stream contract for historical
  voids before enabling deletion? The new raw-window mode alone is not that contract.
- Approve conservative whole-scope deferral when any old sale/refund is unconfirmed,
  and skipping browsers without cooperative cross-tab locking?
- Should pending backdated manual entries rewind coverage and reload the missing
  interval, or remain visibly partial until server confirmation? No silent omission.
