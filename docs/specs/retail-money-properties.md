# Retail checkout money properties

`node tools/retail-money-properties-test.mjs` runs real Boutique and Maison
checkout/accounting declarations, extracted by name with `js-declarations.cjs`.
No production source is copied or changed. Missing fast-check explicitly skips
green; install the existing app development dependencies to execute properties.

Default: 300 runs, seed 20261023. Overrides:

```sh
KIWI_PROPERTY_RUNS=3000 KIWI_PROPERTY_SEED=43 node tools/retail-money-properties-test.mjs
```

`strict(label, property, examples = [])` fails the gate on any counterexample.
`knownIssue(id, label, property, examples = [])` prints the shrunk witness,
seed and replay path. Unexpected exceptions still fail. A repaired known issue
prints a promotion reminder. The suite is explicitly named in `tools/check.js`.

## Execution boundary

The VM runs entire named `openPay`, `doAvoir`, `openExchSummary`,
`originalSalePayload`, `syncReturnSales` and accounting functions. DOM stubs
retain selectors, values, disabled buttons and actual installed handlers.
Tests press those handlers; they do not reproduce the nested checkout math.
Card animation timers run explicitly, without loopback or a browser.

Storage is isolated memory. Printing, catalogue stock actions and manager/server
approval edges are stubs. Applied promotion prices are fixture inputs to the real
`lineBase` / `lineUnit` / `ticketTotals`; promotion eligibility remains covered by
`money-properties-test.mjs`. This suite does not prove stock reservation, printing,
real card authorization or rendered browser behavior. Exchange properties assert
the requested payment/credit difference; they do not simulate the complete stock
swap. Existing browser suites retain that responsibility.

The credit-authority property executes the real `/api/store-credits` handler,
authenticated with a fake secret against in-memory SQLite and the real schema.
It checks repeated redemption IDs and multiple tickets without network access.

## Strict invariants (33 properties)

Each of the following thirteen properties runs independently for **both** tills:

| Real functions | Merchant invariant |
| --- | --- |
| `openPay`, `bqPaymentParts` | Up to 12 tender parts and encoded payment parts sum to the ticket; another final tap books no second receipt. |
| `openPay` sharing handlers | 25/50 percent parts are positive, bounded by the remainder; final parts conserve cents. |
| `openPay` cash handlers | Change is max(0, given - due), never exceeds given; insufficient cash disables confirmation. |
| `ticketTotals`, `originalSalePayload`, `bqLineTotals`, `bqFoldBasket` | Positive discounted tickets equal server line totals, including 41..60 lines folded to 40. |
| `returnRatio`, `paidUnit`, returned-quantity helpers | Total credit for returned paid quantities never exceeds the paid ticket; repeated marking cannot exceed sold quantity. |
| `doAvoir` | The real credit request stays within paid value and concurrent return taps issue once. |
| `openPay` balance collection | Receipt balance = original total - previous collections - this payment. |
| `openPay` voucher handlers | Several tickets conserve voucher balance; confirmation retry cannot spend twice. |
| `openPay`, `doAvoir` deposit guard | Initial deposit records exactly one received part; a deposit ticket cannot issue a return credit. |
| `openExchSummary` | Requested payment or credit equals replacement price minus the frozen paid return unit. |
| `syncReturnSales`, `caToday` | Repeated paid-history imports add one row and count its paid revenue once. |
| `ticketTotals` | A fully rewarded basket has an explicit zero ticket. |
| `salesToday`, `caToday`, `bqDayTotals`, `bqZJournal` | Live monetary rows count on receipt day; voids, older days and uncollected delivery/credit parts do not enter revenue. |

There are **13 per till**, plus seven shared properties: balance conservation and
receipt retry/tenant isolation; remote/local receipt-ID reconciliation; delivery
receipt replay/day totals; delivery amount parsing/retry payload identity; hold
and replay payload conservation; repeat-guard scope/time/signature invariants;
and real credit-authority conservation/idempotency. Thus 26 + 7 = 33.

Amounts use integer centimes, usually 0..5,000,000 (50,000 MAD), up to 12 parts
and 60 lines. Basket maxima stay below 50,000 MAD. Return/exchange fixtures also
cover partial quantities and fractional paid units. A zero ticket is tested
separately because the allocation helper currently treats zero as unknown.

## Known failures, production untouched

### RM-1-boutique / RM-1-maison: explicit free ticket becomes unknown

Shrunk witness: `[100]`, a 1 MAD line with an explicit zero ticket and reward.
`bqLineTotals([1], 0)` retains `[1]`; `originalSalePayload` also falls back from
zero to gross line value, producing `ticketAmountCents: 100`. Expected: zero
lines and zero ticket. `paidUnit` correctly returns zero; no excessive credit
was observed for this witness.

A cashier can reach the zero-valued basket: select an eligible customer with
“1 offert”, put its single 1 MAD item in the basket, apply the reward, then cash
and confirm zero. A configured 100 percent reward has the same result. Both live
checkout builders use `bqLineTotals(..., total)`. The original-sale reconstruction
failure is helper-level: the normal credit-return action refuses zero credit
before reaching reconstruction. Live Link may skip zero payments; this property
does **not** establish an accepted server sale or an actual cash overcharge.

### RM-2-boutique / RM-2-maison: imported unpaid sales enter daily money

Shrunk witnesses: Boutique `[1, "delivery"]`; Maison `[1, "credit"]`.
The first number is line-value centimes; received `amountCents` is zero.
Boutique imports full line value without tender parts, so its header treats an
unpaid delivery or credit ticket as cash revenue. Maison preserves
`receivedAmount` for the header, but its daily money-in fallback counts a
`credit` method at full line value. The two manifestations share lost tender
semantics during `syncReturnSales`, not an additional collection.

The one-cent shrink need not be available on today's whole-dirham shelf. The
same defect occurs with an ordinary 1 MAD or 100 MAD ticket: on till A, choose
Livraison or pay fully by avoir; on another tablet/reloaded ledger, open
Échanges & avoirs to import its history. Boutique's header rises for unpaid
sales; Maison's header remains correct but its daily money-in increases for
credit. Imported rows lack `syncId` and are excluded from `bqZJournal`; this
witness therefore does not establish a duplicate Z submission.

## Validation

Run every strict property at 3,000 cases with seeds 20261023, 43 and 987654321.
No per-property run cap is used, including the real credit-authority property.
Known witnesses are explicit examples and print their shrink replay path.

Validated: all 33 strict properties passed 3,000 runs on each of those three
seeds (297,000 strict cases). Four known failures reproduced. `check.js --fast`
had only the eight sandbox EPERM suites, also reproduced on untouched HEAD:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay.
