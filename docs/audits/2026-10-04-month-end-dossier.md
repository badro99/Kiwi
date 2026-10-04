# Monthly accountant dossier

## Feature

Rapport Journalier and its existing detailed composer now offer **Rapport de fin de mois / End of Month Report / تقرير نهاية الشهر**. All monthly sections are mandatory. The owner selects a month, initially the last completed business month, then downloads one locally generated, searchable A4 PDF named `Rapport-fin-de-mois-YYYY-MM-[establishment].pdf`. The interface is trilingual; the dossier is French and retains original merchant text, including Arabic, plus the exact required English notice.

The original daily PDF/CSV composer and four presets remain unchanged. There is no accountant certification, tax filing, accounting profit claim, transaction settlement, cash closure, database repair or migration in generation. Frozen invoice tax information takes precedence; dated owner-confirmed category rates are optional and separately saved. Existing periods cannot be edited/deleted; a new period is appended. See the [legal-source review](2026-10-04-month-end-legal.md).

## Source and calculation boundaries

- Original `sales` integer centimes, `sale_audit`, immutable `sale_invoices` and `sale_receipts`: refunds, adjustments, original references, customer/consignment differences. KiwiDayReport's settlement fingerprint excludes identified duplicate settlements from sums while retaining both originals in annexes. Equal split payments are retained. Explicit `1/n` equal-part baskets count quantities/costs once only for a fully identified, complete flow; partial flows leave physical quantities/costs incomplete. Consignment ownership differences prevent an unsupported merchant VAT/COGS/result calculation.
- `cash_session_events` plus available legacy KiwiDayReport drawer archives: opening/movements/counts/expectations/variances. Monthly Z archives are supporting reconciliation records, never inputs to summed monthly revenue.
- `store_docs` procurement/suppliers/expenses plus original server purchase orders/lines and dated purchasing inventory receipts/returns. Commitments and current cumulative received quantities are not incorrectly treated as monthly purchases. Explicitly linked receipt/invoice pairs are not counted twice. Ambiguous unlinked documents make the purchase total incomplete.
- Original `inventory_movements`, `inventory_counts` and frozen sale-line costs: four-decimal stock cost rates, signed movements, baseline-dependent indicative stock valuation, inventory discrepancies and theoretical/actual cost perimeters. No certified FIFO/CUMP reconstruction, retroactive use of later current costs, guessed refund item quantities or invented foreign-currency conversion.
- `store_credit_events`, `retail_balance_receipts`, recorded reservations/payroll, current legal identity, dated supporting cost/recipe/receipt/supplier configuration, relevant dated tax configuration and unassignable/unsynced references are retained in supporting annexes. Payroll estimates are not automatically turned into expenses.

Generation reads owner/operator-authorized, merchant-scoped sources through an allowlisted GET endpoint. It paginates without a total-row cap. Row fences, a full source reread and final document revisions detect changing input; generation fails/retries instead of silently omitting pages or falling back to local data for a real establishment. These checks are not represented as a cross-request database transaction snapshot. Demo/local exports explicitly disclaim server completeness.

The server's configured establishment timezone and business-day cutoff determine the selected month. Server-derived local dates/business dates are also used in the PDF, avoiding differing browser/server timezone databases. Date-only supporting documents retain their calendar date instead of inventing midnight and shifting them to the preceding business day. Historical tax effective dates use civil transaction dates, which can differ from the business month around midnight.

Every coverage percentage states its denominator. Sales coverage means recorded activity/closure days, not proof that all external sales were entered. Expense/purchase percentages describe documents recorded in Kiwi, not external costs the owner omitted. Missing values remain null and print “Non enregistré dans Kiwi” or “Incomplet.” Management estimates exclude unsupported accrual/accounting elements and are unavailable when their required inputs are incomplete.

## Verification

- Pure engine: **51 controls**, including centime allocation, mixed dated VAT, frozen zero VAT, original refunds/voids, duplicate settlements, four-decimal costs, missing data, legacy cash archives, invoice gaps and Morocco/Ramadan business-day boundaries.
- Actual signed-session API with an in-memory SQLite database: **22 controls**, unauthorized/till/cross-establishment denial, read-only queries, all 1,107 records across three pages, absent ledgers and unassignable timestamps.
- Real Chrome rendering and actual downloaded PDF: **1,166 controls**; French/English/Arabic at 360, 390, 768 and 1,440 px; daily composer regression; all source pages reread; changed-row failure; source failure; merchant-change/cancel guard after rendering.
- Downloaded synthetic dossier: **219 pages**, **1,107 original sales**, every original sale ID found in extracted text. Required notice, A4 pagination, running/table headers, final page number, known/missing values and canonical cutoff dates verified. Cover, interior Arabic text and last-page render inspected. Fixtures are synthetic only; no production financial records, owner credentials or PINs are committed.
- Existing daily export: **26 controls**. Stamp and offline-shell focused checks passed. Full-project gate and deployment verification are recorded below when completed; focused checks alone are not a release claim.

Evidence: `evidence/2026-10-04-month-end/`. The synthetic PDF is a QA sample, not an Amira report. Physical iOS acceptance is a separate boundary, not asserted by desktop browser checks.
