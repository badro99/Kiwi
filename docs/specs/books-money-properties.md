# Accountant books and monthly money properties

Run `node tools/books-money-properties-test.mjs` (fast tier in tools/check.js).
fast-check comes from app/node_modules; absent dependency prints a skip.
Defaults: 100 cases, seed 20261029. Override KIWI_PROPERTY_RUNS and
KIWI_PROPERTY_SEED. strict() accepts retained examples; knownIssue() prints
shrunk witnesses and rejects unexpected exceptions.

## Actual code and oracles

The suite loads real day-report/month-report/tools/CSV/UI scripts, the browser
zone-law twin, and the real PDF create() closure. js-declarations extracts its
font/file-loader declaration and the accountant HTML's fmtMoney by name.
Only PDF dependency loading, fonts and the drawing device are stubbed: assertions
capture real table/text arguments, not PDF bytes, shaping or page layout.

The real month-report, comptable/books, comptable/access and accountant cookie
handlers run against schema.sql using tools/server-money-fixture.mjs (SQLite
D1 semantics, bound-parameter budget, fake AUTH_SECRET). One isolated DB per
process, reused between cases. No socket, merchant service or production data.

Oracles sum integer D1 cents directly. VAT uses BigInt signed half-up division;
mixed discount allocation uses independent BigInt largest remainders. No daily
rounded MAD totals are re-summed to derive monthly figures. Timestamp labels
are cached by fixture instant only; money functions and route results are not.

## Seventeen strict properties

1. Live monthly net/gross/refunds agree with raw records, daily net and tenders;
   voids are excluded, tips do not enter receipts, free discounted tickets work.
2. Included HT equals signed integer half-up in all three paths: frozen sale
   rate, line rate and dated category configuration. Every tax row balances.
3. A sale and one full refund reverse HT/VAT exactly, including the half-cent.
4. Mixed line rates after discounts agree with the independent centime allocator,
   by rate and in total (0/7/10/14/20 tested; no tax-rate policy changed).
5. The real accountant route equals SQL live receipts, refunds, days and tenders;
   restoring voided rows brings back exactly their original money.
6. CSV original/included centimes, printed MAD and per-sale HT/VAT sum to totals.
7. Real PDF summary and rate-table figures equal model cents under FR/AR UI
   state. Generated source ledgers also carry Arabic product names. PDF glyph
   shaping is not asserted here. The monthly PDF/CSV currently use
   French numeric formatting regardless of UI language; no translation invented.
8. Actual accountant-page FR and AR number formats round-trip to API cents.
9. Month boundaries partition neighboring periods; browser fallback day keys,
   server keys and report labels agree. September Morocco is 721 hours at 05:00;
   Paris March/October are 743/745 hours. Cutoffs 0..12, UTC and both Morocco
   zone names are generated. Existing zone-law-test also covers the fold day.
10. Frozen issued invoice amounts match D1 by rate; out-of-month invoices stay out.
11. Accountant scope cannot read another bucket; forged/revoked cookies fail.
12. Issued manual invoices/credit notes net per-rate HT/VAT/TTC and balances.
13. Unknown legacy invoice HT/VAT/rate stays unknown in rows, buckets and totals.
14. 5,001 later invoices cannot hide a valid, late-created backdated invoice.
15. Invalid/null/absent legacy snapshot dates fall back to creation safely.
16. Real owner DELETE of an accountant access immediately revokes its cookie.
17. A large month with 5,000 sales plus 2,500 refunds (over 250,000 MAD refunded)
    is complete in books, month-report paginated API and monthly model; the
    generated month totals and refunds also exceed signed 32-bit range.

## Minimal fixes and retained witnesses

- `assets/month-report.js`, includedHT/taxFor: Math.round of a negative half-cent
  rounds toward zero. A 3-cent ticket at 20% and its full refund left HT +1 and
  VAT -1. Signed integer half-up now reverses the sale in all three rate paths.
  Frozen invoice totals are still read unchanged; positive rounding and arbitrary
  configured rate precision are preserved. No new rate or fiscal policy.
- `functions/api/comptable/books.js`, readInvoices: Number(null) fabricated zero
  HT/TVA and a 0% rate. A legacy 1-cent invoice with unknown tax now retains null;
  knownAdd propagates incompleteness through buckets and manual-document totals.
  The existing portal already renders unknown money as a dot.
- Same file, readInvoices SQL: the 5,000 cap preceded issue-date filtering. With
  5,001 October records before a backdated September invoice, September lost that
  invoice. JSON-safe effective issue-date bounds now precede LIMIT, including
  invoices created after the period. The query can scan a merchant's invoice
  history (no schema/index change); invalid snapshots keep the creation fallback.

All fixes had red properties before production edits. A first stress run also
shrunk a test-fixture error to a free ticket with a 1-cent discount: the fixture
had omitted its gross. The fixture now records that gross, with a strict example.

## Owner questions, unchanged policies

- BP-1, `[1,1]`: books calls the 1-cent received amount gross; the monthly report
  calls 2 cents before discount gross. Example: 10 MAD shelf, 1 MAD discount,
  books gross 9 versus monthly gross 10. Should those labels be made explicit?
- BP-2, `[1]`: the monthly source allowlist has no invoice_docs/credit-note ledger;
  books includes it. A manually issued invoice is therefore absent from that
  dossier. Should there be a separate fiscal annex? Adding it to receipt VAT
  without a linkage/deduplication rule could double-count a sale.
- BP-3, shrunk `[2,8,20]`: two partial refunds of 8 cents on a 16-cent ticket at
  20% leave HT -1 / VAT +1 although net revenue is zero. A reachable example is
  a 6 MAD ticket returned as six 1 MAD items: HT +2 / VAT -2 remains. Current
  policy rounds each refund separately. Should the last refund carry the original
  tax remainder? This requires an original-sale cumulative allocation contract;
  no rounding residue was silently moved between fiscal records in this pass.

Date-only manual invoice/expense documents retain their civil dates; timestamped
sales/invoices use the store business day. Empty/undocumented monthly amounts
remain null, not certified zero. These existing boundaries are unchanged.


## Validation

- Seeds 20261029, 87389, 4478: all 17 strict properties passed; 135,012 cases.
  Fifteen randomized stricts ran 3,000 per seed (9,000 each). Two expensive,
  deterministic regressions are bounded: invoice-cap scenario once per seed,
  large-month scenario three times per seed (67,500 source rows across nine
  volume fixtures, well over 200,000 MAD refunds and 32-bit aggregate bounds).
  No normal generated property uses a reduced DB-case count.
- The current suite on an untouched 87389bd6 snapshot fails four stricts at the
  three fixed roots: signed HT, full-refund tax reversal, null VAT, invoice cap.
- Existing month-report-test: 317 controls; month-report-api-test: 36;
  accountant-portal-test: 120. Ledger agreement remains green in the full gate.
- PWA shell: 787; size ratchet: 653; stamp drift: 1,166 checks, all green.
  Month-report stamps moved only through bump-stamp; --sync sealed afterward.
- `node tools/check.js --fast`: 658 files; no new failure. Its 16 diagnostics
  come only from eight loopback/EPERM suites, independently reproduced on HEAD:
  operations-system, audit-remediation-devices, economat-real-d1-transfer,
  kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
  retail-acompte-browser, print-relay. The missing iOS/xcrun warning is unchanged.
  Browser suites excluded by the fast tier were not reported as run.
- No commit, push, schema migration or production data operation.
