# Waiter payments and table money properties

`node tools/serveur-money-properties-test.mjs`, in the fast tier of check.js.
fast-check is read from app/node_modules; absence prints an explicit skip.
Defaults: 100 cases, seed 20261030. KIWI_PROPERTY_RUNS / KIWI_PROPERTY_SEED
replace them. KIWI_PROPERTY_ONLY runs strict labels matching that regular expression.
strict() accepts retained examples; knownIssue() reports shrunk witnesses and
fails on unexpected exceptions or an issue that now holds.

## Actual code and independent oracles

js-declarations.cjs extracts current serveur-app functions by name, including
launchSplitFlow, splitArticleAllocation, markSplitPartPaid, actual card readers,
canonical bill rebuilding, durable payment references and shift tally functions.
The real markTablePaid wrapper is parser-extracted from its assignment. No copy
of the payment algorithm is substituted. DOM, timers and transport are stubbed.
One property also evaluates the real caisse currentTotal against the same bill.

Real order/session, order/index, order/queue, service/events, sale and sale/cancel
handlers run directly with Request objects against server-money-fixture.mjs.
It builds schema.sql on local SQLite, enforcing D1's bound-parameter budget and
atomic batches. Fake owner/till/employee cookies exercise actual authentication.
One DB per process, reset between cases; no fresh-schema count reduction.
Concurrent handlers use Promise.all and real compare-and-swap/unique constraints.
The committed-response-loss test commits through sale.js before dropping its
reply, then retries the real phone function. No production service is contacted.

Money oracles add integer cents independently of UI formatting. The complete
flow checks stored tender methods, lines, tip_cents, revenue, closed visits and
paid flags, including repeated taps. Summary tests use the real summarize() on
D1 rows and independently sum expected cents, tips and day buckets.

## Strict properties (35 since WM-7 was fixed)

- Equal splits conserve cents, final part absorbs the remainder; sub-cent parts
  cannot be launched. Item lines sum to each part and to each original dish,
  including baskets of 15 dishes and quantities up to eight.
- Tips are calculated once in cents, allocated outside revenue, shown in cash
  and card amounts, transmitted as tipCents, and enter day summaries once.
- Published menu percentage discounts use the same centime-exact per-unit net
  price on the phone and server, including half-cent ties.
- Whole-item splits preserve each quantity once; extra/fractional allocations
  are rejected. Canonical hydration replaces fabricated snapshots, keeps only
  this phone's unsent drafts and does not append courses twice.
- Payment references survive reload. Durable split progress is merchant/visit
  scoped, also survives a table-number transfer, and refuses payment before
  fetch when storage cannot be written. No new localStorage namespace.
- Real cards never auto-approve; closing without manual approval cannot settle.
- Shift revenue waits for acknowledgement, counts partials immediately in cents,
  excludes tips, and hydrates the saved tally before its first post-reload add.
- Two phones paying one flow/index produce one receipt and leave the other part
  due. The key remains stable across a merge or a replay with a changed timestamp.
- A whole phone-to-D1 split flow with mixed cash/card payments conserves all
  money and line cents, settles once, and survives duplicate taps.
- Transfers/retries preserve lines and receipts. Concurrent transfers elect one
  destination. Merge moves the payment's visit link atomically with the orders.
- Concurrent orders and retries retain two distinct courses. Two service-phone
  snapshots cannot write invented bill lines into canonical orders.
- An approved kitchen void reduces exactly the requested quantity once, including
  request retries; server, phone and till bills agree afterwards.
- Actual employee settlement retries and owner cancellation leave one receipt
  and one cancellation audit, excluding the voided money from revenue.
- Forced closure retains unpaid orders in the recovery feed and books no money.
- UTC, Morocco (both zone names) and Paris business boundaries partition instants
  correctly through Morocco's law change and the daily 05:00 boundary.

## Root fixes and red witnesses

- serveur-app launchSplitFlow / markSplitPartPaid: 1 MAD / 3 produced 99 cents;
  a 1% tip on 1 MAD entered revenue. Integer allocation now conserves ticket and
  line cents, rejects zero-value parts, and transmits/shows tips separately.
  A whole-item allocation keeps its existing no-tip behavior; no new mode added.
- sale.js: two supplied IDs for index 0 of one flow created two receipts and
  could close the visit. Existing sale_settlement_keys now claims merchant +
  flow + index independently of table/session/time. Same money replays; conflicting
  money still refuses. No migration or new endpoint. Old arbitrary receipts from
  before this claim existed cannot retroactively acquire a missing part index;
  their original stable ID remains the recovery path.
- order/queue.js: a merge retained the original sale's source session while its
  orders moved. The batch now moves that link too; amounts/tenders stay unchanged.
  Legacy schemas lacking the optional sales.session_id column remain supported.
- serveur-app save/loadSplitFlow: previously only a Map survived modal dismissal;
  reload lost allocation/progress. Save is mandatory before POST, keyed by the
  immutable visit within the existing payment-reference store. Completed flows
  remain recoverable until a later save prunes completed entries for that merchant.
- serveur-app closeCardModal: the close action accepted paid:true without checking
  cardApproved. The actual settlement boundary now checks it too.
- serveur-app shift wrapper / kgRecordPayment: refused/pending payments increased
  revenue immediately, split updates referenced inaccessible inner-IIFE variables,
  and the first add after reload could be swallowed by Math.max(saved, current).
  A shared callback records only acknowledged cents after loading the tally.
  Retained reload witness: saved 2 cents + new 1 cent was still 2, now 3.

- menu-promos.js priceWith: 50% off 8,274.47 MAD produced 4,137.23 rather
  than 4,137.24. Net unit prices are now rounded from integer cents; the existing
  per-unit net rounding rule is preserved (not replaced with discount rounding).
  The real priceOrder property was red before this shared browser/server fix.

- sale.js settleCoveredOrders / serveur-app keepServiceBillOpen (WM-5, fixed
  22 October 2026): a course ordered after the bill was taken (a dessert between
  two parts of a split, or while a queued payment was still travelling) was
  stamped paid with the rest of the visit and the table closed. Production,
  read-only: Pasta Corner, table 1 on 24 September, 202 MAD of dishes marked
  paid with no receipt; table 11 on 12 September looks the same (119 MAD); a
  35 MAD course on table 8 on 2 October was probably rung again as takeaway.
  Now, when the visit's receipts pay exactly its oldest orders (to the
  centime), those are settled and the later ones stay payable: the table stays
  open, the answer carries billOpen, remainingCents and settledOrders, and the
  phone keeps the table at « addition demandée » with only the remainder and a
  fresh payment id (the old one would be deduplicated as the same sale). Amounts
  decide, not device clocks. Any other shortfall (a discount the till did not
  file, a payment never linked to the visit) settles exactly as before. This
  takes the « shared remainder » answer to the question WM-5 asked; freezing
  courses once a payment starts remains possible on top of it. Red witnesses:
  the WM-5 split case, a queued full payment followed by a course, and the
  phone billing the server remainder; turning the guard or the phone's removal
  of settled orders off makes each red.

- order/queue.js closeSession settle (WM-7, fixed 22 October 2026, till): the
  till closes a paid table with closedBy « settle », in parallel with its
  receipt, and that close stamped every order of the visit paid, whatever the
  receipt covered. WM-5 had closed the hole for the waiter phone only: a till
  payment answered billOpen, then the till's own close paid the late course
  anyway. The rule now lives in one place, functions/api/_visit-cover.js, used
  by /api/sale and by the close: when the visit's receipts pay exactly its
  oldest orders, only those are stamped paid, the visit still closes (the till
  has freed the table), the late course stays owed and shows in the console's
  « closed with money owed » list, and the answer carries owedCents and
  owedOrders. The till's close outbox (orderpro-inbox.js) turns that into a
  toast naming the table and the amount, once per visit. Unchanged on purpose:
  a close that reaches the server before any receipt, or a shortfall that
  lands on no order boundary, settles everything as before (production, since 21 September: no till close
  ever found its visit still open, so the receipt always arrived first).
  Red witness: the till property with a full payment for the first course;
  removing the close's guard makes it red, and removing the toast makes
  restaurant-visit-close-reload-test red.

- Split pool by name (fixed 22 October 2026, till and waiter phone): the split
  screen grouped dishes by name, so two « Prépare ton Plat » at 84 and 88 MAD
  became one card at 84. Paid by articles, each guest paid 86 and both receipt
  lines said 84 (Pasta Corner, 1 October; the total, 172, was right). A dish of
  the same name at another price now keeps its own card, labelled with its
  price, and its base name so product rankings still count them together.
  Property: the pool always adds up to the bill, and a guest given dishes pays
  exactly those dishes, lines included; red on the old grouping.

## Known contracts requiring owner decisions

- WM-3, [1]: closeTable with one unpaid course succeeds without force:true.
  Existing server comments deliberately distinguish freeing a table from payment.
  The unpaid visit/orders remain findable, never marked paid. Should freeing an
  indebted table require an explicit additional force confirmation? No silent
  change to the cleaning/departure-without-payment protocol in this pass.
- WM-4, [1]: waiter A takes one cent on phone A; the same waiter's phone B reads
  zero on its shift card. That card is a device-local gamification tally, not a
  server-derived staff ledger. Which employee owns shared-table payments and how
  should multiple devices share a shift? A server attribution contract is needed.
- WM-6, [1]: merging a 50 MAD source (one cent already paid) into a 50 MAD target
  keeps both receipts/lines and now their visit link, but the phone offers 100 MAD
  again. Which shared remainder/allocation contract should merge two live split
  flows, or should such merges be refused until settled? This pass does not certify
  merged partial-payment checkout as safe. Cancelling an already-paid split has
  the related allocation problem. No financial row is deleted or invented.

Card approval is a cashier attestation on an external terminal, not a hardware
approval callback. Live mode says “Paiement carte confirmé”; fake terminal approval
is demo-only. Is explicit manual confirmation still the intended terminal policy?
Equal and whole-item are the phone's implemented modes; there is no custom-amount
split editor to certify. Existing caisse money properties cover its own split paths.

## Verification

Final stress: 3,000 cases per strict property on seeds 20261030, 20261031,
20261101: 270,000 strict cases, no reduced DB counts. The final 29-property run
is supplemented by the new promotion property on all three seeds. Tip checks
were repeated on all three seeds after widening tips to the full 0..100% server
range and asserting the persisted completed-table count. Tips are weighted by
part bases so no small part exceeds the server's tip <= revenue bound.
All existing requested fast suites are rerun, including the 33 caisse properties.
Split-bill-tender's harness supplies the new persistence/tally dependencies; its
mutation removes both session defenses to retain its negative-control assertion.
Browser layout/hardware are not proved by these VM properties. field-split-ui
cannot launch Chromium here. The eight usual loopback suites fail with EPERM;
all eight reproduce on an untouched HEAD archive in this worktree's ignored
results directory, without touching another git worktree.

Waiter-related browser suites still requiring the owner's browser gate:
field-split-ui-test, pairs-serveur-browser-test, team-split-browser-test,
team-pin-browser-test, team-browse-readonly-browser-test, menu-promos-browser-test,
native-pass2-browser-test, dash-onboarding-browser-test and
pwa-first-install-browser-test (all .mjs). The usual EPERM group is
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay (all -test.mjs).
