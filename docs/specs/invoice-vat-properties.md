# Invoice and VAT money properties

`tools/invoice-vat-properties-test.mjs` runs without sockets, using fast-check
from `app/node_modules`. Missing fast-check prints an explicit skip. Default:
300 cases, seed 20261028. Override `KIWI_PROPERTY_RUNS` / `KIWI_PROPERTY_SEED`.
`strict(label, property, examples=[])` retains fixed regression witnesses;
`knownIssue` fails if the policy witness unexpectedly starts holding.

## Real code and boundaries

`invoice-vat-harness.mjs` extracts named declarations with
`js-declarations.cjs`. It loads `receipt.js` as a complete module to exercise
its real normalization, HTML and thermal-text renderers. Browser storage,
identity and DOM nodes are stubs; arithmetic is production code.

- `assets/invoicing.js`: lineHT, computeTotals, totalsBlock, printable.
- `assets/invoice.js`: round2, validIce, build (sale invoice).
- `assets/receipt.js`: KiwiReceipt build, HTML, text, buildSummary.
- `assets/caisse-accounting.js`: renderReceipt legacy fallback.
- `assets/cost.js`: netOf, used by day-report-export margins.
- Actual POST `/api/invoices` and `/api/invoice`, actual auth and common number
  allocator, using `server-money-fixture.mjs` and SQLite from `schema.sql`.
  Each case resets one reusable database. Two concurrent requests are held at
  their first DB.batch until both preflight reads finish, then released into
  serialized atomic transactions. No request/response mocks for server tests.

Receipt callers: restaurant receiptDocFor/receiptSaleFrom; boutique and Maison
checkout receipt builders; pos-sale shared journal; fastfood, pharmacie and hotel
also call KiwiReceipt. The shared builder is tested once for all callers, not
as a browser proof that each caller supplies correct fields. Standalone POS
reprints use the same provider. day-report.js has no VAT-rate lines; the
receipt summary deliberately has `vat:null`. day-report-export margin HT uses
KiwiCost.netOf without centime rounding, not an invoice tax declaration.

## Existing policy, preserved

Entered invoices accept HT unit prices in centimes, quantities to 0.001 and
percentage discounts to 0.01%. Round each discounted HT line half-up, sum HT
by rate, then round VAT once per rate bucket. Rates generated: 0/7/10/14/20.
There is no independent per-line VAT allocation. Invoice TTC = HT + VAT;
print/PDF and screen use the saved rate buckets. Their line HT calculation
must agree with the server. Exempt issuance requires a mention.

Sale invoices start from received amountCents, after discounts, excluding
outside tipCents. Round total HT half-up, and VAT is the exact TTC minus HT.
Shared receipts do the same for included VAT. With excluded VAT, total is the
HT input and VAT is rounded on that total; this suite preserves the existing
meaning of the receipt's total field, without deciding collection policy.
The legacy restaurant fallback keeps its fixed 10% rate, but now rounds HT to
centimes rather than whole dirhams. This does not change the merchant's rate.

All invoice/receipt amounts render numerically in MAD. There is no currency
conversion or French/Arabic amount-in-words implementation in these paths.
French and Arabic print/receipt outputs are exercised, including RTL PDF.
Half-cent examples (including 0.005 MAD HT) exercise rounding explicitly.

## Strict properties (16)

1. Server HT, each rate bucket and TTC match an independent BigInt oracle.
2. Preview line discounts match the server, including half-cent inputs.
3. Preview bucket totals match the server for up to 60 mixed-rate lines.
4. Screen and French/Arabic PDF use saved totals and correct line HT.
5. Sale-invoice TTC preserves paid cents, with tips outside and positive VAT.
6. Shared included-VAT receipt and sale invoice agree exactly.
7. Excluded VAT rounds once on total HT.
8. Receipt HTML and thermal text retain VAT/TTC (text omits HT by design).
9. Day-summary receipts invent no VAT; margin netOf preserves its basis.
10. CM-7 fallback HT/VAT are nonnegative and sum to principal.
11. Save/issue ignore forged totals and issued money is immutable.
12. Concurrent issuance/retry of one draft consumes one number.
13. Independent issuance is gapless, tenant-isolated and never reuses a
    cancelled invoice's sequence (cancellation by full credit note).
14. Earlier credits plus racing credit notes never exceed original TTC;
    losing requests consume no number.
15. Concurrent sale-invoice retries consume one F number; entered invoices
    share that sequence. Received cents and outside tips remain unchanged.
16. Supplied contradictory or negative sale-invoice HT/VAT is rejected
    before a number is allocated. Existing issued snapshots remain frozen.

## Witness-backed corrections

Every correction fails on untouched HEAD with the new suite:
- Preview: qty 1, unitHT 5 cents, discount 90% yielded 0 instead of 1 cent.
- Sale invoice: 3,826,509 cents TTC at 20% gave HT 3,188,757 vs 3,188,758.
- Included receipt: 874,347 cents at 20% disagreed with the invoice VAT by 1.
- Excluded receipt: HT 513,795 cents at 10% gave 51,379 vs 51,380 VAT.
- CM-7: 55 cents printed HT 100 cents and VAT -45 cents. Reachable only when
  the canonical receipt is unavailable; fallback is still callable.
- Server: sale paid 1 cent, snapshot HT 2, VAT 0, TTC 1 was accepted. The
  standard builder cannot create this; an API caller/corrupted client can.
Integer arithmetic fixes retain each path's rounding granularity. The
restaurant suite also promotes CM-7 to strict, retaining its 55-cent witness.

## Known policy witnesses

- **IV-1 [2]**: a 2-cent detail line discounted to a 1-cent ticket still prints
  2 cents in sale-invoice lines, with net TTC 1 cent. Owner: sale invoice from
  Sales or the till after a ticket-level discount. No discount allocation is
  invented; choosing line allocation is a policy decision.
- **IV-3 [1]**: sale paid 1 cent, snapshot TTC 2 cents is accepted by the
  documented one-cent legacy tolerance. Standard builder sends exact TTC;
  another client can use the tolerance. Owner can see a one-cent difference.
- **IV-4 [1]**: after a 2024 invoice, first 2025 invoice has seq 2, not 1.
  Merchant/prefix series is intentionally global across years, shared with
  sale invoices. Unique and gapless globally; annual reset is not asserted.

Validation: all 16 strict properties run at 3,000 cases on seeds 20261028,
7331 and 424242 (144,000 strict cases, plus fixed examples). No reduced SQL
counts; databases are reused. Check logs live under ignored
`.kiwi/results/invoice-vat/`, including regression failures on untouched HEAD.
