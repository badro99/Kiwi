# Trade till money properties

Run `node tools/trades-money-properties-test.mjs`; included beside the server
money suite in the fast gate. Defaults: 300 cases, seed 20261026. Overrides:
`KIWI_PROPERTY_RUNS`, `KIWI_PROPERTY_SEED`. Missing app fast-check prints an
explicit skip. `strict(label, property, examples=[])` blocks failures;
`knownIssue` reports shrunk witnesses and unexpected exceptions still fail.

## Real code and boundaries

Declarations come from current files by name through `js-declarations.cjs`.
A small cached wrapper selects a declaration's starting line before scanning,
allowing closure bodies and test-harness ESM imports without relying on offsets.
The complete real pos-sale script runs in the existing hold-test VM sandbox.
The existing restaurant VM harness supplies DOM/network/storage edges; its
accounting functions remain current production declarations. Real Live Link
`postSale` builds the final `/api/sale` body; only enqueue/storage/network edges
are stubbed. No sockets, remote writes or production data are involved.

Independent oracles use integer centimes. Percentages use
`Math.round(cents * pct / 100 + 1e-9)`. Gram prices use integer price cents and
grams, then round once. Quantities reach 60 lines and 12 split parts; the actual
wire cap is eight tender parts. Ticket/price generators reach 50,000 MAD;
quantity stress can produce larger aggregate tickets and does not assert server
acceptance above its cap. Server limits/races remain in the server suite.

## Confirmed journal callers

The dispatcher has 17 verticals. Fifteen specialist tills call the shared
journal: pressing (`pressing-caisse.js`), spa, hotel, fastfood, boulangerie,
pizzeria, traiteur, foodtruck, epicerie, pharmacie, librairie, fleuriste,
coiffure, gym, autre. Boutique and Maison have their own retail journal paths;
they reference KiwiPosSale for shared integration, not this record wrapper.
The property calls every real `postDay` wrapper; autre's real checkout is used
instead because it calls record directly. Wrapper preservation is not a claim
that every DOM payment screen has been browser-tested.

## Strict properties (25)

- Journal/local and outbound line sums equal the ticket for 1..60 lines.
- Fold preserves input, cents, and small-array identity; maximum 40 outbound rows.
- Rejected queue entry is held, then accepted once with original reference/time.
- Pizzeria/fastfood/spa basket quantities match integer sums.
- Epicerie price/kg × gram weight agrees with screen, journal and wire amount.
- Gym real membership/custom paid price remains exact (student discount is zero
  for real stores; demonstration-only discounts are not a business promise).
- Pharmacie insurer plus patient equals gross, each share bounded; actual rates
  0/70/80 percent, including 5 cents at 70 percent.
- Traiteur default schedule conserves quote, nonnegative installments/debt.
- Boulangerie last-hour discount follows its explicit floor-to-cent policy.
- Restaurant outbound folding preserves ticket money and full local receipt.
- Split allocation conserves ticket across up to twelve equal tenders.
- Refundable remainder equals paid less prior confirmed refundedAmount.
- Actual wire preserves amounts, balanced parts, discounts, separate tips.
- Coiffure services/addons counted once in ticket and passage.
- Librairie whole-MAD loyalty subtraction follows declared policy.
- Every one of fifteen trade wrappers preserves money/lines into the journal.
- Fleuriste promotion and B2B discount match independent integer percentages.
- Cash change equals sufficient tender minus ticket, bounded by cash given;
  insufficient cash disables confirmation (real shared restaurant cash helper).
- Foodtruck screen and outgoing lines match instant prices and quantities.
- Pressing garment quantities and whole-MAD B2B subtraction agree.
- Hotel nights, tax, extras, payments and remaining balance agree.
- Journal tender parts survive the actual wire serializer unchanged in cents.
- Custom traiteur percentages allocate whole-dirham deposits and an exact, nonnegative residual.
- Raw restaurant journal retries also fold at the actual wire boundary.
- Pressing/fastfood/librairie/fleuriste partial-payment line allocations sum
  exactly to received cents, including a final residual after many tiny shares.

Refund scope: KiwiPosSale has no refund executor. The suite checks the real
restaurant refundableLeft/refundedSoFar helpers, while real server refund caps
and concurrent refund/credit races remain covered in server-money-properties.
It does not invent a missing trade refund interface or simulate server acceptance.

## Fixes and retained regression examples

- SM-1: 41 one-cent lines previously became 40 cents of shared-journal detail;
  restaurant Live Link likewise sliced the outbound detail. Shared `foldLines`
  keeps 39 rows plus a centime-summed residual, matching Boutique's existing
  approach. Full local journal/restaurant lines stay available for stock and
  receipts. Only outbound copies are folded. Live Link applies the same helper when
  replaying older held restaurant rows. Server-imported rows keep their existing
  capped reader. Frozen originals are never edited.
- Epicerie: 1.45 MAD/kg × 700 g previously became 1.01 instead of 1.02 MAD.
  Compute with price cents and integer grams. Reachable on weighted checkout.
- Pharmacie: a 0.05 MAD covered unit at 70 percent previously allocated 0.03
  instead of 0.04 MAD to the insurer. Compute gross cents, integer percent,
  then patient residual. Reachable by selecting a 70-percent patient and item.
- Traiteur: 0.19 MAD × nine guests could produce a negative final installment
  because the first two were rounded to whole MAD with no cap. Deposits stay in
  whole dirhams (owner practice: 30 % of 1 875 is collected as 563), now computed
  in integer cents and capped at what remains, so the residual is exact and never
  negative. Reachable via a custom low-price quote. (Codex proposed centime
  deposits; Claude kept the whole-dirham rule on review, 22/10.)
- Shared journal tender detail (paymentParts) is sent only when every part is
  received money (cash, card, transfer, cheque) summing exactly to the ticket.
  A credit-book part makes received < ticket and /api/sale would refuse the whole
  sale (400); such sales keep the legacy payload. Strict property with witnesses
  cash 5,00 + ardoise 3,00 and ardoise only (Claude, on review 22/10).
- Fleuriste: 1.45 MAD less 30 percent became 1.01 instead of 1.02 MAD; the B2B
  percentage used the same vulnerable float approach. Use integer percentages
  on cents. Reachable from a discounted arrival and a B2B customer.
- Shared split API: parts were retained locally but dropped from the outbound
  payload. Forward them as paymentParts in cents with the required full ticketAmountCents.
  The strict properties also pass the real server tender validator and assert
  its required aggregate method, so a balanced payload cannot omit that contract. The public record API can
  reach this input; current trade postDay wrappers normally pass one method.

- Partial-payment allocation: four 1 MAD lines against a 0.02 MAD payment
  could allocate three 0.01 MAD rows and zero to the last, overstating detail.
  Cap each rounded allocation at remaining cents in pressing, fastfood,
  librairie and fleuriste. This changes no charged amount or discount policy.
  Reachability: a small remaining balance after earlier collections; full
  discounted baskets can also hit cumulative rounding at tiny values. The
  property shrinks to four one-cent pressing/fastfood lines and two cents paid;
  the explicit four-one-MAD witness exercises all four allocators.

Running the new suite against an untouched HEAD archive reproduces all these
regressions (including explicit examples), with no production file swaps.

## Policy questions, unchanged

TM-P1 witness `[10]`: a 0.10 MAD librairie line earns zero instead of a 0.01 MAD
nearest-cent loyalty discount. `cartRemise` explicitly rounds to whole MAD.
An eligible known customer sees this at checkout. Pressing also deliberately
uses whole-MAD B2B rounding; boulangerie floors last-hour unit prices. Those
policies are tested as written rather than silently changed.

TM-P2 witness `[100]`: spa's real saleLines/postDay sends a 10 MAD service plus a
1 MAD tip as 11 MAD revenue, with a tip line and no separate tipCents.
Coiffure explicitly does the same in its payment callback. Cashier: choose a
service, enter a 1 MAD custom tip, pay; owner: revenue includes tips. This is explicitly
commented as the existing service accounting basis, so owner confirmation is
needed before changing it. The wire separately supports outside-revenue tips,
which the strict serializer property covers without claiming these screens use it.

## Validation

All 25 strict properties passed 3,000 cases on each seed 20261026, 43 and
987654321: **225,000 strict cases**, no reduced counts. Both known policies
reproduce with witnesses [10] and [100]. Real original-file runs reproduce the
folding, weight, insurer, installments, flower discount, tender forwarding and
partial-allocation regressions; the fixed files pass the same examples.
Sandboxes are reused and mutable journals reset between cases. This keeps V8
context allocation bounded; earlier concurrent fresh-context runs encountered
Node segmentation faults, so final stress passes run sequentially.

`node tools/check.js --fast` passes the new suite and the existing restaurant,
retail, server, trade truth and journal suites. Only these eight loopback suites
fail with EPERM, also reproduced against the untouched c978bd35 archive:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser, print-relay. Its 16 failure lines repeat some assertion
diagnostics. The existing iOS-vector warning is missing Xcode/xcrun.

The file-size ratchet passes all 651 checks without pin changes. Stamps were
bumped and sealed through bump-stamp.js; no manual stamp edits. No commits,
pushes, production requests or migrations.
