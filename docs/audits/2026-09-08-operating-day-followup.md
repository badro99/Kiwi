# Extended operating-day QA and fixes

Date: 2026-09-08. Status: isolated completion release passed its final gate and is ready for publication; live simulation remains bounded by the evidence below.

This is not a launch certificate. The initial follow-up was uncommitted; the completion
release is being prepared independently on production base 9bca62e1. No production
migration, real payment-provider charge, merchant-data deletion, or outbox clearing
was performed. The shared dirty checkout and existing demo records were preserved.

## Completion release (supersedes earlier pending-work notes below)

- Final isolated gate: `node tools/check.js`, exit 0, all checks passed with one
  existing background-colour styling-debt warning. Log:
  `/tmp/kiwi-operating-day-release-9bca-gate-final.log`. Native interaction ran
  all 209 controls (not skipped); all twelve operating-day/cash/sync suites passed.
  The first gate found outdated test fixtures; those were corrected without
  weakening runtime authorization, and the complete gate was rerun successfully.
- Shared canonical checkout remains at d753a0ab with its existing dirty work and
  empty index. Publication uses an isolated descendant of 9bca62e1; no user files,
  merchant records, local outboxes, or print jobs were deleted. No additional
  database migration is introduced. Production rollout and the old split ACK
  remain separate verification steps after the Git pushes.
- The exact pending 35 MAD split receipt ID was confirmed in the dashboard. Its
  client-only `flow-*` session caused a retry 404, not a missing receipt. New
  takeaway payloads omit that UI token; legacy retries use the normal idempotent
  sale path. Real table sessions remain strict. Live post-deployment acknowledgement
  must still be observed without clearing or recreating the receipt.
- Takeaway handovers now require verified PIN authorization and preserve the
  acting identity atomically with the order transition. Their activity label is
  distinct from table closure/cancellation. Historical missing actors are not invented.
- Receipt/waste forms retain per-intent/per-line IDs. Count submission preserves
  its frozen result on retry, rejects changed payloads and avoids duplicate audit
  events. Failed/offline submission stays in review and explicitly says it was not
  transmitted. Multi-line stock receipt writes remain per movement, not an atomic
  whole receipt; an interrupted partial receipt must be retried using the same intent.
- Cash-journal events remain queued when till pairing is absent; this does not
  weaken server authorization. The status distinguishes journal pairing/storage
  problems from sales synchronization rather than displaying a false all-clear.
- The base includes the separately published audit/bridge compatibility work
  (a88643d0) and OrderPro work (9bca62e1). Earlier generic rollout prerequisite
  notes below are historical, not instructions to undo those releases.
- Separate new field evidence remains open: an unidentified tablet with six
  pending operations and 403, table transfer leaving table 0, and implicit
  fractional item allocation in split-by-items. Another task owns the latter
  two fixes. This release does not claim those merchant reports are verified fixed.

## Immediate live handoff

- Tenant: **cafe-atlas**, confirmed under the operator console's Demo group.
- Earlier services at 13:28 and 14:03 were closed with zero cashier variance.
  Earlier day totals: 185 MAD gross, 10 MAD refund, 175 MAD net, five receipts.
- A new demo service was opened at **15:03**, with **500 MAD opening float**.
  Its last inspected state was open, zero new transactions, and one pending sync
  operation. A pending operation is not proof of a missing sale.
- OrderPro was initially disabled. The demo-only switch was enabled through the
  operator UI. The customer page then correctly showed Service fermé until the
  till opened, and subsequently loaded the demo menu.
- One customer pickup was submitted: **QA Jour Poulet riz 69 MAD +
  QA 0809 Eau 10 MAD = 79 MAD**. After browser control recovered at 15:31,
  the existing order was identified as **OPD-5** on both customer and cashier
  screens. It was accepted into the kitchen, paid once in exact cash at 15:32,
  marked ready, and handed over at 15:33. Cashier history shows 79 MAD and
  Remise 15:33; the customer page advanced through preparation and ready to
  Merci de votre visite. **Do not resubmit or collect its payment again.**
- The service showed one transaction, 79 MAD cash and one remaining sync
  operation after payment. At 15:46–15:47 the normal close flow was authorized
  with the existing demo owner PIN: 500 MAD opening + 79 MAD cash = **579 MAD
  expected and counted, zero variance**. The UI confirmed Journée clôturée and
  then Aucun service ouvert / the personal-PIN opening gate. No report was printed.
- After explicitly refreshing the operator's older read-only snapshot at 15:47,
  dashboard history showed **OPD-5 exactly once**, six sales, **264 MAD gross,
  10 MAD refunded and 254 MAD net**. The original 79 MAD submission is reconciled.
  The one remaining sync operation has not been identified or cleared; it is
  not proof of a missing sale. Server acknowledgement of every closing artifact
  has not been separately verified.
- Existing URLs: `https://kiwi-os.com/kiwi-caisse?pair=1` and
  `https://kiwi-os.com/OrderPro?s=cafe-atlas&m=takeout`.
  Verify Cafe Atlas visibly before any action; do not assume the pairing URL
  guarantees a tenant on another browser.
- No employee was clocked in during this follow-up. The prior QA employee had
  been clocked out. Existing owner PIN was used without changing or logging it.
- Older QA takeaway order 3 (QA 0809 Eau, 10 MAD) remained paid/in preparation
  from the earlier service. It was not deleted, repaid, or assumed fulfilled.

## Confirmed defects addressed locally

| ID | Finding | Change and evidence |
| --- | --- | --- |
| QA-02 | Stock deliveries calendar hardcoded to May | Merchant business-day calendar; focused date/cutoff tests and local UI showed September 8–14 |
| QA-03 | Stock with no supplier falsely flagged as an exhausted primary supplier | Actual stock/reorder calculation; exclude placeholder suppliers and opening-balance lots; preserve genuine exhausted-primary/secondary-lot warnings |
| QA-04 | Stale merchant header in operator view | Derive identity from the selected operator tenant, not stale local business metadata |
| QA-06 | Partial split reopens with full amount payable | Reuse persisted split state, display remaining amount, remove ordinary full-bill route, guard repeated part callbacks |
| QA-07 | Final split order history retains only the last part | Preserve complete order total while recording each payment part; actual finalizer/history test uses 35 + 25 = 60 |
| QA-08 | AI's 30-day context includes older transactions | Explicit merchant-day boundaries, bounded totals and freshness; test confirms refunds are not subtracted twice |
| QA-09 | Open reports name a closer; autosaves appear as closures | Closing actor only on actual close; typed, deduplicated closure revisions; stable terminal/session identity |
| QA-10 | Daily sales combined with only the latest drawer create a false shortage | Preserve separate service drawer snapshots while rebuilding daily sales; dashboard and exports tested with expected drawers 640 and 585, not 725 |
| QA-11 | Operator configuration renders duplicate feature switches and PIN rows | Generation guards around concurrent configuration and PIN reads; latest response wins, stale failures cannot append a second set |

Nine defect groups above have local patches. They are **not deployed or live-verified
repairs**. QA-03 also stops showing invented 999-day stock coverage and a receipt date
for opening stock with no actual delivery record.

QA-01 (unavailable diagnostic sources) now has actionable per-source error
classification rather than a generic empty result, including a regression for mixed
legacy and structured failure responses. The original live source failures
were not conclusively diagnosed. The later operator overview loaded its coverage
counts, but that does not prove every merchant diagnostic route healthy.

QA-05 (browser interaction stalls) remains unresolved: repeated browser-command
timeouts, connection loss and concurrent foreground changes occurred. These are not
enough to assert that Kiwi itself froze. A direct read-only D1-list attempt also failed
with Cloudflare authentication code 10000; no database query or write followed.

### Follow-up finding under completion

QA-12: after OPD-5 was handed over, the activity journal rendered it as
**Table fermée / remise à zéro · Table ? · #5 · Identité non enregistrée · served**.
The amount was correctly informational and was not deducted again from revenue.
Current `assets/pages-pro.js` labels every closure as a table closure, while the
takeaway queue closes its session with `closed_by = 'served'`. Follow-up repair:
preserve service mode and handover event type; display Commande remise au client
for takeaway fulfilment; record the verified acting staff identity at mutation
time and carry it to the activity feed. Do not substitute the current cashier
for missing historical identity or invent a retrospective authorizer. A follow-up
patch and real-handler regression are under review in the completion release.

### Completion-turn live evidence, 15:54–16:08

- A fourth Cafe Atlas demo service opened at 15:54 with 500 MAD float.
- Chrome's Network inspector established the pending request: POST `/api/sale`
  returned HTTP 404 `table-session-missing`. The queued 35 MAD first split part
  for takeaway #2 carries a client-only `flow-*` token in the server `session`
  field. The dashboard already contains a 35 MAD first part, so recovery must
  preserve identity and prove idempotency, not blindly append another receipt.
- Separate POST `/api/cash-sessions` requests returned HTTP 403 while the same
  tenant's feed/team requests returned 200. This is an authorization failure,
  not evidence of broken Wi-Fi. No queue or local record was cleared.
- At 16:04 only the demo till tab was put offline using Chrome network
  emulation; the computer's Wi-Fi and other tabs were untouched. A normal
  10 MAD cash sale of QA 0809 Eau was confirmed once at 16:05, order #6.
  The visible queue increased from one to two pending operations.
- Networking was restored to No throttling. Without clicking retry or refresh,
  the queue returned to one pending operation. The new sale appeared once in
  the refreshed dashboard at 16:08; the old split error remained separately.
- Order #6 was marked ready and handed over at 16:07. The fourth drawer closed
  through the normal PIN-authorized flow: 500 + 10 = 510 MAD expected/counted,
  zero variance. The UI confirmed Journée clôturée then Caisse fermée.
- The dashboard's refreshed snapshot contains seven positive receipts, 274 MAD
  gross, 10 MAD refund, 264 MAD net. No provider charge or courier dispatch was
  made. A kitchen print remains queued because the demo has no working printer;
  it was not removed or falsely reported printed.

## Expanded merchant activities

### Authenticated live demo

Twelve stock ingredients were visible after normal form entry, total inventory
valuation **2,743 MAD**: existing QA 0809 Tomates plus QA Jour Poulet, Riz, Lait,
Farine, Mozzarella, Huile olive, Oignons, Café, Oeufs, Salade and Boîtes livraison.
The deliberately low Salade has 1 kg on hand with a 2 kg reorder threshold.

Five additional menu products were created and subsequently visible in both the
cashier menu and OrderPro: QA Jour Poulet riz 69, Pizza mozzarella 59, Salade composée
35, Omelette 29 and Pâtes tomate 49 MAD. Existing products were not removed. The
customer menu and till showed 20 articles. The till's separate Menu badge showed
0, and Stock badge 1. Source verification resolved this apparent discrepancy:
`assets/caisse-menu-availability.js` counts unavailable menu items, while the
cashier stock badge counts out-of-stock/below-reorder rows. Thus these are alert
counts, not catalogue totals. One deliberately low Salade explains Stock 1.
Suggested UX improvement: label these badges as unavailable items/stock alerts
so merchants do not mistake them for missing records. No count fix is needed.

One salad save was not present after a browser stall; it was verified absent before
retrying and then visible. Ingredient name inputs occasionally ended blank during
rapid automation; source inspection found no asynchronous app-side name wipe.
Do not label this a proven merchant data-loss defect.

### Isolated local UI, not published to production

Normal forms were exercised for 12 ingredients and 10 new products across three
sections; a required single-choice accompaniment with a +5 MAD option; two recipes
using gram/kilogram and millilitre/litre conversion. Measured recipe costs were
16.40 MAD for chicken/rice and 11.10 MAD for pizza. Nutrition remained explicitly
incomplete rather than inventing nutritional values.

This local dashboard was entered through its Demo control, which does not publish
the catalogue to OrderPro. The local OrderPro page still showed the harness's seeded
product. After reload, the authenticated scope/PIN gate and zero-item view appeared;
continuity of those local demo records was not established. These form exercises
must not be reported as durable end-to-end menu synchronization or a live merchant day.

### Real-handler SQLite integration

`tools/operating-day-orders-integration-test.mjs` runs actual application handlers
against an isolated SQLite database built from schema.sql. Its 61 checks cover:

- Six OrderPro pickups and six externally sourced delivery orders.
- Unknown/required option rejection and unavailable-item rejection.
- Stable retry references without duplicate orders or payments.
- Delivery address and fee-inclusive total persistence (not a fee breakdown).
- Pending, accepted, ready, served and rejected states, including cancellation
  after acceptance; four completed orders marked paid.
- Four order-referenced sales totalling **391 MAD**, a full **90 MAD refund**,
  over-refund refusal and refund replay.
- An order-linked inventory consumption movement through the real movement API.

No sales/refunds were inserted directly into the test database. Fixtures establish
only account/menu/access/provider configuration. The inventory movement is submitted
explicitly: **automatic recipe expansion/consumption is not proved by this test**.
No real Glovo/provider request, courier dispatch or financial charge was performed.

## Remaining acceptance work

1. Identify the remaining sync operation without clearing it and verify closing
   report persistence. OPD-5 and the 15:03 service have been reconciled/closed;
   do not repay or resubmit the fulfilled order.
2. Complete live pickup/delivery intake, kitchen progression, payments and totals
   across a representative workload; include split reload, returns and cancellation.
3. Exercise stock receiving, physical counts, waste, recipe-driven depletion and
   recovery after a genuine offline/reconnect cycle without clearing queues.
4. Verify the fixes in a safely deployed build, with merchant/employee role changes
   and opening/closing actors. Local tests do not prove rollout success.
5. Review same-session concurrent cloud snapshot conflicts: existing last-writer
   aggregate selection is not an event-level merge. Distinct terminal drawers are
   now preserved, but arbitrary divergent edits within one session are not claimed
   resolved. Never sum overlapping snapshots to manufacture reconciliation.

Separate pre-existing schema/bridge rollout prerequisites remain documented in
`docs/audits/2026-09-08-remediation.md`; this follow-up does not resolve or waive them.

## Verification record

- Seven operating-day suites are registered in tools/check.js: stock, AI context,
  split UI, operator diagnostics, drawer integration, admin concurrency and orders.
- Drawer tests execute actual dashboard resolver, CSV and HTML export seams, not
  only a duplicate calculation helper. Both terminal identities are retained.
- Cache references updated with tools/bump-stamp.js, including service-worker v549.
- Initial full-gate log: `/tmp/kiwi-operating-day-final-gate.log`: exit 1,
  14 reported failure entries across three suites (OrderPro session, Amira,
  table transfer/merge). These suites' current targeted reruns are green after
  aligning test fixtures with the existing shared-visit closure and pre-kitchen
  transfer contracts. No production authorization was weakened to satisfy them.
- A complete rerun of the current checkout is in
  `/tmp/kiwi-operating-day-final-gate-rerun.log`: **exit 0, all checks passed,
  one existing background-colour styling-debt warning**. Native interaction
  coverage ran (209 controls); it was not skipped.
- After that run had passed the OrderPro session suite, its tests were further
  strengthened to execute the shipped LIVE polling, onSessionClosed and
  server-session-closed submission path. The final test-only revision was run
  separately: **30 passed, zero failed**. Production files were unchanged by
  this final test improvement.
- Original live QA evidence retained at `/tmp/kiwi-operating-day.6Qhe4R/report.md`.
