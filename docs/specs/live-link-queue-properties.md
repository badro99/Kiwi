# Live Link queue money properties

Run `node tools/live-link-queue-properties-test.mjs`; named immediately after the
trades suite in `tools/check.js` fast tier. Defaults: 300 runs, seed 20261027.
Override `KIWI_PROPERTY_RUNS` / `KIWI_PROPERTY_SEED`. Uses app fast-check with an
explicit green skip when unavailable. Strict properties retain examples;
knownIssue reports shrunk witnesses, seed and replay path. Unexpected exceptions
are failures, not known issues.

## Execution and scope

`live-link-queue-harness.mjs` executes the complete current Live Link, pos-sale,
retail-sale-hold and offline-db scripts in reusable VM contexts. DOM boot is
left waiting for DOMContentLoaded; the driver explicitly starts outbox setup,
flushes, timers and watchFeed. Test-only exposures reach the private feed bridge
and trade hold writer without modifying their bodies. Restaurant hold/replay,
reviveJournalEntry and the actual venues sales/refund store functions are loaded
by name through js-declarations.cjs. Painting is stubbed, not money logic.

The real offline-db engine runs against a small transactional Dexie API shim:
get/add/update/delete, scoped queries, serialized transactions with rollback,
meta records and leases. This tests actual enqueue/claim/ack/reject/migration
logic, not real browser IndexedDB quota, persistence or transaction lifetime.
Browser crash and disk eviction guarantees still need browser/device tests.

POSTs call the real `/api/sale` handler with real Request/Response objects and
fake-secret signed merchant-specific till cookies. Feed GETs and operator
void/restore use the real fixture handlers. `server-money-fixture.mjs` builds
schema.sql once in local Node SQLite, resetting financial tables between cases.
No fresh DB per case, no reduced run counts, sockets or production requests.

The network can drop requests, return transient 5xx/429/409, return permanent
400/422, duplicate a request, hold a response before or after commit, lose the
response after commit and react to the actual 12-second AbortController timer.
Promise-based fetch delivers one response per invocation; duplicate exchanges
are exercised as repeated HTTP requests, not impossible double fulfillment.
Delayed old/new page exchanges exercise ordering across reloads; IndexedDB
lease tests independently reject stale acknowledgements. This is not a complete
multi-process browser tab scheduler or real D1 replication model.

Clock, online state, localStorage, byte budget, write denial, IndexedDB denial,
merchant pairing, listeners and page generations are controlled. Reload retains
storage and outbox rows, retires old-page timers/writes and re-evaluates modules.
Tests wait for explicit response gates rather than assuming crypto/network
operations finish within a fixed number of event-loop turns.

## Delivery contract and oracle

Valid commands have a captured stable id/ref, immutable money and an authorized
merchant. Queue acceptance means durable local ownership, not server acceptance.
Once transient faults stop, each such receipt must exist once in D1, with exact
integer cents, tender allocation and tips outside amount. A schema or immutable
money conflict is retained visibly blocked; blindly retrying or rewriting it
cannot turn an invalid receipt into an accepted one.

Amounts reach 50,000 MAD, up to six queued receipts per generated fault trace,
eight feed rows, four transport faults, twelve repeated backoff attempts and
530 held rows. Independent SQL counts/sums and captured IDs are the oracle.
Large hold-count tests exercise the real hold writer directly rather than
sending 530 server POSTs per case. Generated traces cover ordering of failures;
focused properties retain exact witnesses for the corrected defects.

money-sync publications are at least once: feed observation or a repeated
verified acknowledgement can publish accepted again. Consumers must key by
receipt id; event counts are not a financial ledger. Tests reject false accepted
signals for blocked receipts and compare the actual SQL rows instead.

Twenty-two strict properties cover:

1. Arbitrary transient-fault traces eventually deliver each durable sale once.
2. Lost committed acknowledgement plus reload preserves cents/tips/tenders.
3. 05:00 rollover leaves captured id, timestamp and money unchanged.
4. Re-pairing parks A's debt, processes B's money, then safely resumes A.
5. Delayed stale-page response after a newer page sends cannot duplicate money.
6. Retail hold persists queue refusal and replays the same payload once.
7. Real trade and restaurant holds recover refused receipts after reload.
8. With IndexedDB available, localStorage write denial still retains the sale.
9. Retry delay prevents early sending, grows and caps without dropping debt.
10. Permanent validation refusal is blocked while subsequent valid sales proceed.
11. Real feed/bridge/store replay is idempotent and preserves money/tips/parts.
12. Raw-window replay converges after operator void and restore.
13. Scheduled recovery works without a manual force flush.
14. A newer queued sale survives an older delayed acknowledgement; force flush
    cannot steal the current instance's active sender.
15. Expired lease replacement rejects stale IndexedDB ack/reject tokens.
16. A 501..530-row trade hold retains its oldest unsent receipt.
17. An observed legacy void/restore converges on the running dashboard.
18. Actual abort timer after commit retains debt and safely replays on reload.
19. Real sale-conflict 409 leaves original money intact and conflict visible.
20. Finite queue byte budget refuses explicitly, retaining debt and overflow hold.
21. IndexedDB transaction failure leaves the synchronous write-ahead copy usable.
22. Reload before async IndexedDB ownership retains that write-ahead receipt.

## Minimal production fixes

- **Trade hold truncation:** witness 501 held rows. heldWrite previously used
  slice(-500), deleting held-0 without acknowledgment. It now writes the full
  pending list. The direct writer witness does not claim a global-quota failure always leaves
  room for 501 holds. It applies to an already-large persisted backlog, or
  admission/identity refusal while the hold store remains writable. The actual
  hold writer must preserve that debt regardless of how it accumulated.
- **Observed legacy restore:** witness one one-cent receipt, admin void, feed
  poll, admin restore, feed poll. Restore preserves rowid, so since had passed
  it. When an ID disappears from the last void list, watchFeed now restarts
  legacy backfill, then uses existing accumulation/bridge deduplication. Coverage
  reconciliation remains on its existing path. An ID aging out of the latest-500
  void list can cause a harmless extra backfill; it does not manufacture a sale.

The new properties fail against untouched dec76341 for both fixes. No queue,
ledger, coverage marker or checkpoint is silently trimmed or newly written by
these fixes. Normal delivery still uses original idempotency keys.

## Known boundaries

**LQ-1, witness [100] cents:** localStorage setItem throws, IndexedDB unavailable,
offline till receipt is held in memory; after reload there is no durable copy.
The queue returns explicit refusal and retail pendingPost is set, but its
persistence also fails. Owner sees taken money missing remotely if the page is
closed before storage/network recovery. Cashier path: accept a 1 MAD retail sale
in an affected private/storage-denied browser. This cannot be repaired by a
queue algorithm after every durable backend refuses writes. Preventing the
payment before money changes hands requires a separate cashier-blocking policy;
this suite does not invent it or pretend the in-memory hold is durable.

**LQ-2, witness [1] cent:** after initial feed/bridge, a real accepted repeat POST
adds tipCents=1 to the same row. Legacy since polling returns no row and the
cached dashboard tip stays stale. This witness is reachable through the API or
an integration correcting an existing receipt; the normal immutable queued
payload does not invent a late tip. Owner-visible surface: tip KPI/report after
an in-place correction. Re-reading raw rows also requires updating existing
cached metadata, not merely marking a duplicate cursor seen. General mutable-row
convergence needs the change-stream reconciliation protocol already available
for coverage scopes, beyond the small observed-restore fix here. A restored row
never included in the latest-500 void list has the same legacy observability
limit. No unconditional change-stream rollout is hidden in this job.

There is deliberately no fixed receipt-count cap on unsent debt: qWrite says
never trim it. The strict budget test bounds storage bytes, checks explicit
refusal and a separate hold. Arbitrarily long outages cannot combine a finite
storage bound with unlimited accepted payments and guaranteed reload survival;
when every backend is full this reduces to LQ-1. No arbitrary cap or silent
oldest-row eviction is introduced to make a property green.

## Validation

All 22 strict properties passed 3,000 cases on seeds 20261027, 43 and
987654321: **198,000 strict cases**, no fresh-per-case DB or count reduction.
Both known issues reproduced with [100] and [1]. The first concurrent seed-43
process exited with a native Node segmentation fault (139), not a property
counterexample. Its first property passed 3,000 cases in isolation, and a full
unchanged-code rerun of seed 43 passed all 22 properties. This native VM-stress
incident is recorded rather than counted as a completed run.

`node tools/check.js --fast` passes the new suite and related hold/queue/money
suites. Only eight EPERM loopback suites fail, each reproduced on an untouched
HEAD archive: operations-system, audit-remediation-devices,
economat-real-d1-transfer, kiwi-agent-access, invoicing-v2-real-server-browser,
retail-tender-browser, retail-acompte-browser, print-relay. The 16 failure lines
repeat assertion diagnostics for these eight suites. The existing iOS-vector
warning is missing Xcode/xcrun. File-size ratchet: 651 checks pass, no pin edits.
Asset stamps were bumped/sealed with bump-stamp.js.

The stale
pos-truth-a traiteur assertion also fails on untouched HEAD: it still expects
fractional-dirham deposits despite the owner's committed whole-dirham rule.
Only that test expectation is aligned with the existing integer-cent/capped
whole-dirham policy; no traiteur production code changes.
