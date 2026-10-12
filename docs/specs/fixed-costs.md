# Charges fixes, commissions et résultat net

Owner request, 2026-10-12: "implement fixed costs from now on so we can get real
margins". Decisions taken with the owner that day:

- **Salaries come from Équipe.** `baseSalary` and `hourlyRate` on each member,
  computed by the same `payrollFigures` as Paie & planning (`KiwiTeam.labour`).
  Only the employer social-charges rate is entered with the charges. Nothing is
  entered twice.
- **Partial costing is estimated, and said so.** The margin rate measured on
  costed sales is applied to the uncosted ones and labelled « estimée ». Below
  50 % of sales costed there is no net result at all.
- **Commissions in this version.** A rate per payment method (card, contactless,
  QR…) and per sales platform (Glovo, Yassir…), offered only for what the sales
  actually contain.

## Where things live

| Piece | File |
| --- | --- |
| Pure calculation (no DOM, no storage) | `assets/charges-engine.js` → `window.KiwiChargesEngine` |
| Document, editor drawer, Marges cards | `assets/charges.js` → `window.KiwiCharges` |
| Accepted sales with method/channel/parts | `assets/cost.js` › `ledger().sales` |
| Payroll over a list of days | `assets/team.js` › `KiwiTeam.labour(days)` |
| Net result rows in the P&L | `assets/finance.js` › `finRealParts` |
| Kiwi IQ break-even and cost breakdown | `assets/agent.js` › `sBreakEvenReal`, `sChargesReal` |
| Kiwi Health line C13 | `functions/api/_merchant-health.js`, `functions/api/merchant-health.js` |
| Server document | `functions/api/store.js` › `FEATURES.charges`, `REDACT.charges` |

## The document (`store_docs`, feature `charges`)

```js
{ v: 1,
  lines: [{ id, label, cat, freq: 'month'|'quarter'|'year',
            versions: [{ from: 'YYYY-MM', amount }],   // each amount applies from that month
            until: 'YYYY-MM' | null,                   // last month it applies
            deleted?: true,                            // tombstone, so another device cannot resurrect it
            updatedAt }],
  social: { rate: null | 0..60 },
  commissions: { methods: { card: 1.5, … }, channels: { glovo: 25, … } },
  updatedAt }
```

It is the business's operating account, not a till setting: `REDACT.charges`
hands a paired till or a signed-in employee an empty copy and refuses their
writes (403). Only the owner session or a named operator reads and writes it.
`tools/team-doc-redaction-test.mjs` holds both halves.

## The rules

- A month weighs on each of its days equally (1/31 in October, 1/28 in
  February). Rent runs on closed days too.
- A yearly cost weighs a twelfth each month, a quarterly one a third.
- Raising the rent "from March" never rewrites February. Changing a frequency
  keeps every past version's monthly weight.
- Removing a cost defaults to **next month** (this month was paid). Choosing its
  very first month removes it entirely (a tombstone remains for sync).
- A new cost applies from the month of the first sale Kiwi knows, editable.
- Commissions are computed per accepted sale: the card part of a split payment
  pays the card rate, the whole sale pays its platform's rate. The merchant's
  own channels (sur place, à emporter, comptoir…) never pay a platform rate.
- A refund removes the margin of the sale it reverses, at the measured rate.
- Break-even for the current month = (fixed costs of the month + full monthly
  base salaries + hourly pay at the last 30 days' pace, plus social charges) ÷
  the contribution rate of the last 30 days (margin minus commissions, over
  sales). Per opening day when hours are set, per calendar day otherwise, and
  the card says which. The month's pace uses completed days only.

## Tests

- `tools/charges-test.js` (in `check.js`): every rule to the cent, the ledger's
  `sales`, and the real Marges page rendered in a sandbox.
- `tools/charges-browser-test.mjs` (in `check.js`): the real dashboard, real
  clicks: empty state, entry, field errors, net result equal to the engine,
  removal months, Kiwi IQ answers, Arabic RTL, phone width.
- `tools/team-doc-redaction-test.mjs`: till and employee neither read nor write.
- `tools/merchant-health-test.mjs`: C13 « Charges fixes » todo/done, amounts
  never leave.

## Not in this version

- The month report (`functions/api/month-report.js`) does not list the charges
  yet. When it does, they must be shown as estimates, never as recorded
  expenses.
- `payrollFigures` counts every member, including one whose fixed-term contract
  has ended. Fixing it belongs in Paie & planning first, so both pages move
  together.
- No cash position yet, so Kiwi IQ's runway question still says it cannot
  answer.
