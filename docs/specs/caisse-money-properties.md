# Restaurant money properties

Reference: a55899e4. Production code is unchanged. Run:

```
node tools/caisse-money-properties-test.mjs
KIWI_PROPERTY_RUNS=2000 KIWI_PROPERTY_SEED=761391 node tools/caisse-money-properties-test.mjs
```

The suite is explicitly named in `tools/check.js`. It loads app/'s fast-check;
without that development dependency it prints an explicit skip and exits green,
matching money-properties-test.mjs. Default: 300 cases/property, seed 20261022.
Seed and case count are overrideable. Known properties print counterexamples
and notify if fixed; unexpected exceptions still fail. Small minimized replay
witnesses are explicit examples, so a known failure cannot disappear by luck.

## Real functions and merchant invariants

The split manifest supplies declaration boundaries. All snippets come from
**current production files**, including their money/minor/major format helpers;
no frozen source, copied accounting implementation, browser or server is used.
Only DOM/printing/storage/authorization side effects and external services are
stubbed. Manager approval is a test callback, with no credentials. The real
`day-report.js` is evaluated for buildDayReport, including preview().

Money is generated as integer centimes, 0–5,000,000 (0–50,000 MAD), then converted
at the public MAD boundary. Allocation covers 1–12 tenders and up to 60 lines.
Line generators keep the entire ticket below 50,000 MAD. Ledger generators
include voids, partial refunds, rejected refunds and physical cash exceptions,
with tips kept outside base amounts. Handover gaps may be signed.

| Functions / location | Merchant invariant / strict coverage |
| --- | --- |
| core shareMoney, shareWeighted | Parts are nonnegative, conserve every centime, and obey equal/weighted quotas; zero-weight diners receive no allocation. |
| core launchSplitFlow, splitArticleAllocation, effectiveTipPct | Equal and article flows conserve the ticket; only whole units are assigned; over-allocation and fractional units are rejected. Tips are separately allocated. |
| core markSplitPartPaid; accounting recordSale | Mixed cash/card parts create exactly one journal entry per paid part even on repeated taps; base and tip stay separate. |
| core payTipPct, payTipAmount | Tips do not reduce the base; a split callback prevents double tipping. Whole-MAD split percentage tips are exact. Fractional-MAD rounding is CM-4. |
| core updateRendu | Cash given covers base plus tip before confirmation; returned change equals the surplus, is nonnegative and never exceeds cash given. |
| core vrapDiscountAmount, discountAmountFor | Percentage/fixed discounts are rounded and capped between zero and gross. Table and takeaway agree. |
| accounting activeSaleDiscount, discountReasonCode | Gross minus net equals discount metadata to the centime across up to 60 lines. |
| accounting accountActiveDiscount | A newly approved discount increments shift amount/count exactly once. |
| core refundedSoFar, refundableLeft, clampRefundAmount, confirmRefund, markRejectedRefund, applyAcceptedRefund, refundOriginalFor | Refunded plus remaining equals paid; positive-balance clamp cannot over-refund; actual approved confirmation cannot exceed remaining or paid and blocks exhausted tickets. Reject/re-accept transitions are idempotent, including cash exceptions. CM-2 isolates the helper edge; CM-6 covers an approval-time balance change. |
| accounting isReportableJournalEntry, rollupLedger, journalTotals; core posteRollup/refundHasCashException | Net equals live sales minus reportable refunds, split by cash/card. Refunds do not add sale counts. Rejected refunds count only with physical cash evidence. Voids and their tips are excluded. Poste windows respect the timestamp cutoff. |
| accounting reconcileVoids | A unique-id void removes exactly that sale and tip; repeated voids are idempotent and explicit restore adds it back once. |
| accounting receiptSaleFrom | Receipt base and tip are separate; refunds show absolute returned principal and no tip. |
| accounting renderReceipt (legacy fallback) | Paid/refunded total conserves principal plus outside tip, HT + VAT equals principal. VAT nonnegativity is CM-7; canonical receipt engine rendering is separate. |
| accounting cloudSaleJournalEntry | Server amount and line centimes survive conversion; outside tips are CM-5. |
| accounting handoverGapCents, drawerExpected | Expected cash = float + net cash sales + cash tips + cash in − cash out + signed handover gaps. |
| accounting updateEcart, updateCardEcart | UI counted-minus-expected gaps retain cents and sign. Cash tips enter the drawer; card tips do not. |
| accounting dayReportSession, currentBusinessDay, buildDayReport; day-report build/preview | Z net/method/tip amounts match the filtered journal; cash expected follows the drawer equation without handovers, and gap equals counted minus expected. Signed handover parity is CM-3. |

Renderers such as renderCloture, renderResume, renderItems and renderShiftStats
consume these totals; they are not separate arithmetic oracles. Network replay,
refund approval enforcement, persistence, rendering and multi-tab concurrency
are not claimed as integration-tested here. The strict approved-refund property
uses a fixed balance; CM-6 exercises the real acceptance helper during approval.

## Known properties, minimized witnesses and reachability

All values below are centimes unless explicitly marked MAD. No code is fixed.

### CM-1: equal split detail totals drift

Witness `[3, 2]`: a 0.03 MAD ticket split in two has bases 0.02 + 0.01,
but both copies of the item line are 0.02, summing to 0.04. The tender money
conserves correctly; the detailed line totals do not. launchSplitFlow rounds
the same per-line share for every diner instead of distributing its remainder.
recordSale keeps those rounded line totals, so category/detail totals can drift
from the net Z headline. This is reachable without tiny artificial prices:
a 47.50 MAD dish split three ways has detail totals 15.83 × 3 = 47.49 MAD.
Steps: table bill → Diviser → equal split, three parts → pay all parts → item/Z
detail. The UI offers both two and three parts.

### CM-2: standalone refund clamp at zero availability

Witness `[0]`: exhausted original, request 1 MAD. clampRefundAmount produces
0.01 MAD even though remaining is zero. It is **unreachable through normal
confirmation**: confirmRefund checks remaining before calling the clamp, then
checks again after manager approval. The strict test executes that real path
and confirms no refund is journaled for an exhausted positive-value ticket.
The same helper flaw exists for any fully refunded ticket, not just zero sales.

### CM-3: signed handover gap absent from printed Z expected cash

Witness `[1]`: opening float 100 MAD, signed handover gap +0.01 MAD, no sales.
drawerExpected is 100.01 MAD; buildDayReport().cash.expected is 100 MAD.
The live drawer adds handoverGapCents while day-report's drawer formula omits
it. Reachable: Passation → outgoing count different from expected → incoming
cashier confirms the same physical count with their own approval → close/Z.
A normal +5 MAD counted difference reproduces it too. The property supplies
an actual-shaped signed handover record, not an arbitrary malformed ledger.

### CM-4: fractional-MAD percentage tip loses a centime

Witness `[2135, 10]` (base cents, percent): base 21.35 MAD, expected half-up tip 2.14 MAD,
actual 2.13 MAD. Floating multiplication/division precedes money() and its
single Number.EPSILON adjustment cannot correct this half-cent boundary.
Reachable: a 21.35 MAD table/counter bill → cash or card → 10% tip → confirm.
The kit's tillKitTip also sets the same payTipMode and uses payTipAmount.
Revenue remains 21.35; the outside tip is short by 0.01. This witness was also
minimized by scanning all smaller positive bases at 10%.

### CM-5: fresh server journal import discards a tip

Witness `[1]`: server row with amount 1 MAD and tipCents=1 becomes amount=1,
tip=0 in cloudSaleJournalEntry. /api/feed attaches tipCents (feed.js:438–448),
but the converter initializes tip to zero. Reachable: keep a second restaurant
till's service open, pay a tipped bill on another till, and import it through
the feed/current-service reconciliation. A missing journal entry is converted
with no tip, understating Z tips and, for cash, expected drawer. An ordinary
reload with a complete persisted local journal need not take this fresh-import
path. No request is sent by the property test.

### CM-6: earlier refund acceptance during manager approval

Witness `[2]`: paid 0.02 MAD. A previously rejected/reversed refund of 0.01 MAD
has been reauthorized and is pending. A new refund prepares the full 0.02 MAD.
Before its manager callback, the earlier refund becomes accepted; the test calls
the real applyAcceptedRefund, raising original.refundedAmount to 0.01. The new
callback only checks that remaining is positive, then journals the captured
0.02 amount without clamping it again. Local refundedAmount becomes 0.03 MAD.

The ordering is possible in the UI: Journal → reauthorize a failed refund →
while its retry is in flight, start another refund on the same ticket → let
kiwi:money-sync accepted arrive during the new manager prompt → approve. The
listener at core:7857 calls applyAcceptedRefund without closing that prompt.
Example at normal prices: 100 MAD paid, 40 MAD retry accepted during approval
of a new 100 MAD refund, resulting in 140 MAD locally recorded. The property
simulates that callback ordering; it does not claim the server accepts the
excess. Server authorization/refund enforcement and real network timing are not
executed here. The known issue is the local journal/remaining-balance invariant.

### CM-7: legacy receipt fallback prints negative VAT

Witness `[55]`: positive sale 0.55 MAD, no tip. When receiptDocFor returns no
document, renderReceipt computes HT as Math.round(gross / 1.10), in **whole
MAD**: HT=1.00 MAD and VAT=−0.45 MAD. The fallback conserves HT + VAT and the
paid total, but violates nonnegative tax components. Ordinary receipts use the
KiwiReceipt engine instead; this input reaches the fallback only if that engine
is missing/unavailable or cannot produce a document. The test explicitly forces
that branch, so it is not presented as a normal successful-load till bug.
The suite does not change receipt code or apply a tax-policy fix.

## Results

26 strict properties pass at 300 runs each (seed 20261022). Seven known properties
fail at their minimized replay witnesses. An additional 2,000 runs per strict
property (52,000 cases, seed 761391) also pass. The missing-fast-check skip path was
also exercised. No production file, stamp, schema or merchant data changes.

`node tools/check.js --fast` reports only the eight known EPERM suites:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay. All eight independently reproduce EPERM
against an untouched a55899e4 export.
