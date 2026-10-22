# Sales history: bounded reads and slice B design

Status: B2 reconciliation is coverage-gated. No production marker writer or trimming ships here. Without a marker the legacy feed path is unchanged.

## Server contracts delivered through B2a

Migration 0006 installs `sale_changes(seq AUTOINCREMENT,merchant,sale_rowid,sale_id)`
and its merchant/seq index. UPDATE logs every update, even no-ops, in the same
statement transaction; rekeys log OLD and NEW identities/scopes. INSERT also logs,
because hidden sales rowids can be reused after DELETE. DELETE logs a tombstone.
Sale identity prevents a reused rowid from resolving an old event to another sale.
The log is append-only during normal operation. Explicit merchant privacy purge
clears it last, after sales-delete triggers; no retention/compaction ships here. Missing log schema/triggers fails closed; apply 0006 first.

`GET /api/feed?window=1&merchant=M&from=C&to=T&limit=500&after=A` requires both positive integer bounds, C < T, and at most 400 days plus two hours.
First page captures scoped F=MAX(sales.rowid), including voids, and CF=MAX(sale_changes.seq) together in one SELECT snapshot (empty maxima are zero).
All pages select rowid <= F, order `(ts,rowid)`, exclude voids, and use exclusive T.
Return `fence:F` and `changeFence:CF` on every page. Window v3 tokens bind protocol,
merchant, resolved legacy bucket, C,T,F,CF and last position; v1/v2 are rejected.
Optional numeric `fence` and `changeFence` restart from supplied values within the
current scoped maxima; with `after`, supplied values must match its signed pair. They are filters, not proof of issuance; retain the pair for replay.

`GET /api/feed?changes=1&merchant=M&afterChange=P&limit=500` selects changes; presence of afterChange alone also selects this mode. Empty means zero; numeric CF in [0,current scoped
MAX(seq)] is the initial-position form. Thereafter use signed v1 change tokens.
Response: `{merchant,changes,next,complete,checkpoint}`. Limits clamp to 50..500
log entries, with one-entry lookahead. A page collapses repeated sale identities
to their latest consumed seq and sorts by seq, so output can be shorter than limit
without being complete. Checkpoint always follows the last consumed log entry. Empty EOF preserves position; `next:null,complete:true` proves current EOF.
Rows are current full window-shaped sales, including lines, tips and tender parts,
plus `seq`, `voided` and `voidTs`; voided rows must remain distinguishable from live
rows. Deleted/rekeyed/out-of-scope rows are only `{seq,cursor,id,deleted:true}`;
never expose another tenant's current row. Events are invalidations with current
state, not historical row images. Repeated identities across pages are upserts.

HMAC-SHA256 tokens use AUTH_SECRET with `kiwi-feed:` domain separation. Every page
rechecks entitlement (including paired tills) and `legacyBucketFor`; tokens bind
the resolved union. Tampering, old protocols, impossible positions or scope changes
return 400. Restart bootstrap on 400; never skip a failed page or accept a prefix.
The row image may change during bootstrap, but every concurrent update/restore/void
is logged above CF, so catch-up repairs it. No writer can omit an application event.

Legacy rowid/byDay and `voids=1` without afterVoid keep their exact response bytes.
The earlier `afterVoid` stream remains for existing tooling/tests, superseded for
reconciliation because it cannot represent restoration. Index 0005 is unchanged. Server migration deployment remains owner-managed.

## Client algorithm for slice B

1. Bootstrap the coverage window to EOF, retaining the first F/CF pair and scope.
2. Drain changes from CF to EOF; a returning cache must also cover its saved
   checkpoint's offline gap. Upsert current rows, remove void/tombstoned identities,
   and invalidate affected summary/raw days, even outside the local coverage window.
3. Poll new rows from since=F, and keep polling changes from the last checkpoint.
   Inserts/repeated updates can appear in both paths: deduplicate by sale identity,
   never add event amounts to totals. INSERT logging also catches reused rowids <= F.
4. Persist each change checkpoint only after its page's ledger/cache effects have
   been applied; replay is idempotent after crashes. Never discard pending/manual
   entries. On 400 discard the proof, invalidate only that scope's history caches,
   and restart bootstrap; do not erase merchant ledgers or other tenant keys.
Before deletion, choose a server-defined upper time bound covering accepted sales. `KiwiSalesWindow.fetchRaw` stays unchanged (20 pages, memory-only).

Implementation: `KiwiSalesReconcile` in sales-history.js stages the complete replay
before applying it. Scope comes from `KiwiSales.scope()` (the exact SALES_KEY suffix).
Checkpoint key: `kiwiSalesChangeCheckpoint:<scope>`, written after ledger verification.
A scoped offline debt read is required; missing/unavailable debt proof stops reconciliation.
Historical cache invalidation covers the merchant: tombstones lack dates and revisions can move days.
The bootstrap upper bound is now +2 hours; the server-bound policy remains a prerequisite to deletion.

## Reconciliation changes for slice B

| Function and current location | Assumption today | Required change |
| --- | --- | --- |
| `watchFeed`, `assets/live-link.js:1132` | Each tenant starts `since=0` and replays all history. | Without coverage keep this path. With coverage use the F/CF bootstrap and change catch-up above, then rowid polling from F plus checkpointed changes. Reset scope, fence, continuation and proof on merchant/coverage change. Snapshot mode stays read-only and never flushes an operator outbox. |
| `drainBackfill`, `assets/live-link.js:1213` (state at :1136) | `sales.length === pageSize` means another rowid page. | In window bootstrap follow `next` until explicit `complete`; enforce progress and page caps. Set `feedComplete` only for the validated coverage interval; publish interval and fence alongside it. Keep length-based logic only in legacy mode. |
| `validateSnapshotPage`, `assets/live-link.js:1105` | Cursor strictly increases and response cursor equals last row. | Separate protocol branches. Window branch validates merchant, exact bounds/fence, `(ts,rowid)` order, unique rowids and continuation/completion agreement. Rowids may decrease across increasing timestamps. Keep legacy validation unchanged. |
| `verifySnapshotLedger`, `assets/live-link.js:1554` | Entire local sales/refund arrays exactly equal the accumulated feed. | Compare only server-backed rows in the proved `[coverage,fixedUpper)` and fence, by cursor, timestamp and signed cents. Exclude pending local rows from equality, preserve them, and report pending explicitly. Never call missing archives corruption. |
| `retainCursors` (`salesRetainCursors`), `assets/venues.js:4184`; refunds counterpart :4230 | Allowed cursors describe the full entitled history. | Accept a proved interval/fence; reconcile only server-backed rows within it, preserving pending/manual rows and rows outside the proof. Invoke only after bootstrap completeness. Trimming is a separate confirmed-row operation. |
| `resolve()`, `assets/day-report-dash.js:431` | Completed feed can rebuild any day, even over a saved report. | Before coverage return the saved archive without rebuilding. If absent, fetch summary for headline totals; details require a complete raw window. Never fabricate session/drawer facts from summaries. Show loading/offline on missing data. Apply the same coverage gate to `feedIsAuthoritative`, `totalsFor` and `snapMissesSales`. |

`accumulateFeed` (`assets/live-link.js:1423`) and `bridgeToStore` (:1434) must keep
old rows out of both the replay accumulator and local ledger once coverage exists. After trimming, prune old entries and `feedSeen` keys; otherwise
a venue change can re-add them. `applyVoids` (:1369) and change application must invalidate historical
summary/raw caches even when the affected cursor no longer exists locally.

## Confirmation, scope, and trim safety

`paymentCompletion` (`assets/live-link.js:439`) accepts only a successful JSON
body with `ok` and no `settlementPending`. The durable outbox is acknowledged at :652 through `KiwiOffline.acknowledge` (`assets/offline-db.js:183`).
`moneySignal` (:210) emits per-ID acceptance/aliases, but `kiwi:sale-ack:<merchant>`
is only a last-success timestamp: it does not confirm every ledger row. A canonical feed row supplies `cursor` and `id`; `bridgeToStore` copies these as
`cursor` and `saleId`, and `salesEntry` (`assets/venues.js:4066`) persists cursor.
Require a fresh scoped server match on cursor, canonical ID, timestamp and cents
for each deletion candidate, with no pending/sending/blocked debt for that ID.
A cursor alone, an old event, an empty outbox, or backfillComplete alone is insufficient. Manual rows remain without proof; apply the same rule to refunds.

Resolve the exact ledger scope through `SALES_KEY` (`assets/venues.js:3948`) and
`salesTenant` (:3935). Use its suffix, e.g. `scoped@merchant`, for both coverage and last-trim markers; never shared `own`/`scoped`. Update the summary reader's
scope resolver at the same time. Never wipe other namespaces or trim demo ledgers.

1. After initial rendering, schedule idle work with a timeout fallback. Attempt
   at most once per business day per scope; retry transient failures the next day.
2. Use navigator.locks.request with ifAvailable or a short acquisition timeout;
   every ledger writer/feed bridge must share the scope lock. Reread identity,
   coverage, rows and upload debt while holding it. Missing Web Locks or a busy
   lock means no trim. Never substitute an unsafe localStorage spin lock.
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

## Approved decisions and remaining questions

Approved: fenced bootstrap and paginated changes before deletion; any unconfirmed
old sale/refund defers the entire scope; no Web Locks means no trim. Backdated
pending entries remain visibly partial until confirmation; never rewind coverage. Remaining: which server upper-time bound should slice B use? Atomic change
logging now closes the restoration/revision gap; B2 client wiring ships only behind existing coverage markers.
