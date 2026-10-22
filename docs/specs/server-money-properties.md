# Server money properties

Run `node tools/server-money-properties-test.mjs`. It is named in the fast tier
of `tools/check.js`. Defaults: 300 runs, seed 20261025; override with
`KIWI_PROPERTY_RUNS` / `KIWI_PROPERTY_SEED`. Missing the existing app fast-check
dependency prints an explicit green skip.

`strict(label, property, examples = [])` blocks on a counterexample.
`knownIssue(...)` prints the shrunk witness, seed and replay path. An unexpected
exception is a failure, not a known issue. A repaired known property prints a
promotion reminder; promote it with its witness rather than deleting coverage.

## Execution model

`server-money-fixture.mjs` creates one in-memory Node 24 SQLite database from
**schema.sql**. Real Pages handlers receive real Request objects; authentication
uses actual till, owner and named-operator cookies signed with a fake secret.
Refund capabilities use the real manager-proof signer and verifier with fake
staff identity. There are no real PINs, secrets, sockets, remote D1 requests or
production writes. Route logic and SQL are not replaced or extracted copies.

Routes: `/api/sale`, `/api/sale/refund`, `/api/receivables`,
`/api/store-credits`, `/api/retail-balances`, `/api/admin/sales`,
`/api/z-reconciliation`, and bounded `/api/feed?window=1`.

The D1 shim enforces the 100-bound-parameter limit, executes individual SQLite
statements atomically and serializes transactional batches with BEGIN IMMEDIATE,
COMMIT/ROLLBACK. Financial tables are reset between cases; the DB is **not rebuilt
per case**. Thus every strict property runs the full requested 3,000 cases.

Every concurrent property starts both handlers together and holds their first
financial write/batch behind a two-party barrier. Both must finish preflight and
reach the write before either proceeds. The test fails if both never arrive.
Then actual guarded SQL decides capacity. This is stronger than merely calling
Promise.all and hoping requests overlap; it does not emulate network replicas,
SQLite WAL contention across processes, Durable Objects or production latency.

Sale-write properties go through the real handler. Refund originals, some feed
legacy rows and Z comparison fixtures are inserted directly to isolate those
handlers, without spending the sale-write property again in every test. Feed
fixtures can therefore include signed/legacy rows the sale POST itself rejects.
All HTTP requests are handler calls, never loopback.

## Strict invariants (21 properties)

| Handler/path | Invariant |
| --- | --- |
| sale, valid metadata | Authoritative amount_cents and tip_cents survive; tip stays outside net; <=40 line totals and exact discount facts reconcile to cents. |
| sale, legacy amount | Centime values are retained even though legacy amount is rounded whole MAD. Includes 1 cent, 12.50 MAD and the 200,000 MAD cap. |
| sale, concurrent retry | 1..8 monetary payment parts sum to received amount/ticket; identical concurrent IDs write one row. |
| sale, mixed liabilities | Cash plus credit/delivery parts sum to full ticket, while amount_cents includes only received cash. |
| sale, bounds | Negative, above-cap, NaN/Infinity string/JSON representations reject without writing. JSON converts numeric NaN/Infinity to null; invalid JSON number literals are not fabricated. |
| sale, malformed inputs | Negative/excess/fractional tips and inconsistent tenders reject without a row. |
| sale, part cap | Nine otherwise balanced positive tender parts reject. |
| sale, discount validation | More-than-one-cent disagreement, unknown reason and PIN-shaped actor reject without a row. One-cent tolerance is SM-2. |
| sale, replay/conflict | Identical retries preserve stored fields and one row; changed amount returns 409 without changing books. |
| client fold + sale | The real named bqFoldBasket folds 41..60 lines to 40, then real ingestion preserves the full line sum. Raw oversized requests are SM-1. |
| refund, earlier debt + race | Two competing refunds after an earlier refund never jointly exceed original paid cents. Both succeed iff their sum fits; otherwise exactly one succeeds. |
| refund, same id race | One counter-entry and one refund audit, never two. |
| refund versus credit race | Combined cash refund plus newly issued credit stays within the original paid amount. |
| operator void/restore | Voiding the original also neutralizes its linked refund; restoration returns exact signed net, tips, tender parts and line money. Audit/change-log additions are retained. |
| delivery collections | Earlier and competing collections remain within owed; a successful request replay adds no money. |
| delivery rollback | Collision with another merchant's globally occupied sale ID leaves no orphan collection or consumed capacity; a fresh ID can collect in full. |
| credit spends | Across several tickets, issued = spent + balance; repeated spend IDs do not debit again; refusals leave balance unchanged and nonnegative. |
| credit races | Concurrent issuance stays below original paid amount; concurrent spends never overdraw an issued voucher. |
| retail balance | Prior deposit plus concurrent payments never exceeds total; pending reservations count; retry is idempotent and GET returns exact remaining debt. |
| bounded feed | Exclusive [from,to), live rows only, tenant isolation, stable pagination, exact signed amount, separate tips and unmodified paymentParts. An explicit 1,203-row example exercises equal-ts edges and 75-ID detail batches. |
| Z comparison | Rejects net totals below the declared -200,000 MAD envelope without persisting; inside it, exact server count/cents for IDs in this terminal's manifest; missing/void/out-of-day IDs and amount/method mismatches are exact; another terminal's row is extra, not part of this manifest total. Persisted snake_case totals equal response totals. |

Amounts usually range from 1 cent to 50,000 MAD, with bounded aggregates below
the 200,000 MAD endpoint cap. Generators cover up to eight tender parts, 60 raw
basket lines, six successive voucher spends and 1,300 feed rows. Z fixtures
include signed refunds and UTC, Africa/Casablanca, Europe/Paris business days
across Ramadan/DST boundaries.

`payment_parts` sum to **received amount** only for monetary tenders. With credit
or delivery, all parts sum to the full ticket and received amount excludes those
liabilities. The tests preserve that accounting basis rather than declaring the
valid mixed-tender contract a defect. Credit/refund cap races use original cash
sales; settled vouchers/consignment have additional receipt-value semantics not
redefined by this suite.

## Known properties, production unchanged

### SM-1: raw oversized baskets lose line money

Shrunk witness `[41]`: 41 lines, each 1 cent; received amount 41 cents. The API
accepts the sale but stores only 40 cents of lines (`raw.slice(0, 40)` in sale.js).
A safe rejection or a value-preserving fold would satisfy the property.
Authoritative received money remains 41 cents; this is a detail reconciliation
loss, not a proved cash loss.

Client reachability: Boutique/Maison use bqFoldBasket, and that path passes the
strict property. The raw 41-line POST witness requires an unfurled/custom caller.
Restaurant `recordSale` and shared `pos-sale.js` also slice source lines to 40
before posting; a cashier building >40 distinct lines can already lose detail on
the client. The server cannot reconstruct rows removed before the request, and
this test does not claim every current browser sends 41 rows to the endpoint.
Owner-visible surface: item totals/ranking/export disagree with ticket amount.

### SM-2: one-cent discount disagreement is accepted

Shrunk witness `[1]`: amount_cents=1, gross=101, discount=99. It accepts 1 cent
received even though gross minus discount is 2 cents. The code deliberately uses
an allowed error of one cent; this is a **tolerance/validation contract**, not a
claim that the stored net amount changed.

Client path: an older/external payload with independently rounded gross/discount
facts, or a caller submitting those inconsistent fields. Current clients producing
exact integer-cent metadata pass strict checks. Owner-visible surface: discount
facts/audit cannot reproduce the ticket net exactly. A different amount retry
still returns a strict-tested 409.

### SM-3: Z certifies the supplied manifest, not every terminal receipt

Shrunk witness `[1]`: DB contains two 1-cent receipts known to the fixture as
terminal A's. Its manifest includes only one. Response is matched, serverCount=1,
serverCents=1; the other ID is extra. The stronger requested contract would
require count=2, cents=2 and a mismatch.

This is a **protocol limitation**: sales have no authoritative terminal_id field
for this endpoint to use. TerminalId labels the reconciliation record; it does
not prove ownership of each sale. ID prefixes in the fixture are not an actual
production ownership rule. Another terminal's extra sales must not create false
alarms, and the existing API intentionally ignores extras for matched status.

Client path: local receipt history is incomplete and omits a durable receipt
from the submitted Z manifest. Owner sees a matched comparison despite omitted
money. Honest complete manifests pass strict exact checks. A stronger guarantee
would require trusted per-sale terminal provenance or another complete manifest
contract; this suite makes no production/protocol change.

### SM-4: valid refund days can exceed the Z negative envelope

Shrunk witness `[5]`: five previous-day tickets paid at 50,000 MAD each are
refunded today through the real refund handler. All five refunds succeed, but
Z rejects their -250,000 MAD day with 400. Each individual refund is below the
200,000 MAD transaction cap. Z allows much larger positive daily totals but
rejects net totals below -200,000 MAD.

Client path: a cashier refunds those five older tickets, then closes the day.
The owner cannot reconcile that legitimate negative day through this endpoint.
The strict property separately verifies exact reconciliation inside the current
validation envelope and clean rejection outside it; this known property records
the broader business requirement without changing production policy.

## Validation

All 21 strict properties passed 3,000 cases on each seed 20261025, 43 and
987654321: **189,000 strict cases**, no per-case fresh databases or reduced counts.
All three runs reproduced SM-1..4 with witnesses [41], [1], [1], [5].
The default 300-case run and the suite inside `node tools/check.js --fast` pass.

The fast gate has only eight blocked loopback suites: operations-system,
audit-remediation-devices, economat-real-d1-transfer, kiwi-agent-access,
invoicing-v2-real-server-browser, retail-tender-browser, retail-acompte-browser,
and print-relay. Each also fails with listen EPERM on an untouched HEAD archive
in this sandbox. The gate prints 16 failure lines because assertion diagnostics
repeat some of these eight suites. The existing iOS vector check warns that
Xcode/xcrun is unavailable. No other gate failures; no production changes.
