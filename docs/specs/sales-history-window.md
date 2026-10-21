# Sales history: bounded reads and slice B design

Status: prerequisite only. This change does not trim data or alter reconciliation.
References below identify the current functions; proposed behavior is not shipped.

## Server contracts delivered through B1

`GET /api/feed?window=1&merchant=M&from=C&to=T&limit=500&after=A&fence=F`
requires both positive integer millisecond bounds, C < T, and a span at most
400 days plus two hours. Pages sort by `(ts,rowid)`, with exclusive T.
Without `after` or `fence`, capture F = scoped MAX(rowid), including voided rows
and rows outside the time window (empty scope gives 0). Return numeric `fence`
on every page; select only `rowid <= F`. Inserts after capture cannot enter that
bootstrap, including uploads whose timestamps precede an already-read key.
Window v2 continuations are HMAC-SHA256 signed with AUTH_SECRET and bind protocol,
merchant, resolved legacy bucket, C, T, F, and the last `(ts,rowid)` pair.
Old unsigned v1, altered/scope-mismatched tokens, invalid fences, or an explicit
fence disagreeing with `after` return 400. Secret rotation invalidates tokens.
Without `after`, an explicit integer F in [0,current scoped MAX(rowid)] restarts
that bounded traversal; larger/negative/fractional/malformed values return 400.
A numeric fence is a filter, not proof that it was previously issued. Signatures
protect continuation tokens; entitlement is independently checked on every page.
`complete:true,next:null` proves EOF; a full page alone does not.
Legacy byDay and rowid modes retain their existing protocol and response bytes.

`GET /api/feed?voids=1&merchant=M&afterVoid=&limit=500` opts into the void stream;
parameter presence, including empty initial value, selects it. Missing afterVoid
retains the old latest-500 response. Stream pages contain `{merchant,voided,next,
complete,checkpoint}`; each void is `{c,i,r,ts,vts}` and sorts by `(void_ts,rowid)`.
`afterVoid` is a signed v1 token bound to protocol, merchant, resolved legacy
bucket and the last pair. Continue with `next`; persist `checkpoint` even at EOF
so later polls can resume. Empty pages preserve that position. Both new modes
clamp limits to 50..500 and use one-row lookahead. Both call `legacyBucketFor`;
no owner session may union its pre-split bucket into a foreign paired till.
Invalid tokens return 400; missing DB/columns fail rather than claim completion.

These APIs are not immutable snapshots: voids can change after F is captured.
The stream reads current void_ts values, not an append-only audit:
restorations clearing void_ts and retimestamping behind a checkpoint are absent.
Do not treat F or the stream alone as a full revision/change-log guarantee.
`idx_sales_merchant_ts` covers window reads; MAX(rowid) uses merchant indexing.
Migration 0005 adds `(merchant,void_ts) WHERE void_ts >= 0` for stream scans.
The explicit stream predicate keeps the old latest-500 plan/tie behavior intact.
Negative legacy markers are included via an unindexed prefix. Without the optional
index reads are slower but correct; the owner applies migration.

`KiwiSalesWindow.fetchRaw` remains unchanged: all pages or null, 20-page cap,
validated ordering/scope/completion, four memory-only cached windows for 60 seconds.
No trimming or client reconciliation changes ship in B1.
For slice B, bootstrap `[coverage,fixedUpper)` at F, then poll rowid mode from F;
never derive since from the last time-ordered row. Before deletion, define a
server upper bound covering accepted timestamps and close the void/restoration
revision gap above. Scope, fence and proof must remain stable throughout bootstrap.

## Reconciliation changes for slice B

| Function and current location | Assumption today | Required change |
| --- | --- | --- |
| `watchFeed`, `assets/live-link.js:1132` | Each tenant starts `since=0` and replays all history. | Without coverage keep this path. With coverage use fenced window bootstrap described above, then rowid polling from F. Reset scope, fence, continuation and proof on merchant/coverage change. Snapshot mode stays read-only and never flushes an operator outbox. |
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

Approved: fenced bootstrap and paginated voids before deletion; any unconfirmed
old sale/refund defers the entire scope; no Web Locks means no trim. Backdated
pending entries remain visibly partial until confirmation; never rewind coverage.
Remaining: which server upper-time bound should slice B use, and how should
restorations/revisions be recorded so offline clients can detect every change?
