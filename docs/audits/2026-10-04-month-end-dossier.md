# Monthly accountant dossier

## Feature

Rapport Journalier and its existing detailed composer now offer **Rapport de fin de mois / End of Month Report / تقرير نهاية الشهر**. The default full dossier retains all monthly sections. A summary-only PDF and a local accountant CSV ZIP are also available. The owner selects a month, initially the last completed business month, then downloads one locally generated, searchable A4 PDF named `Rapport-fin-de-mois-YYYY-MM-[establishment].pdf`. The interface is trilingual; the dossier is French and retains original merchant text, including Arabic, plus the exact required English notice.

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

## Initial-release verification

- Pure engine: **51 controls**, including centime allocation, mixed dated VAT, frozen zero VAT, original refunds/voids, duplicate settlements, four-decimal costs, missing data, legacy cash archives, invoice gaps and Morocco/Ramadan business-day boundaries.
- Actual signed-session API with an in-memory SQLite database: **22 controls**, unauthorized/till/cross-establishment denial, read-only queries, all 1,107 records across three pages, absent ledgers and unassignable timestamps.
- Real Chrome rendering and actual downloaded PDF: **1,166 controls**; French/English/Arabic at 360, 390, 768 and 1,440 px; daily composer regression; all source pages reread; changed-row failure; source failure; merchant-change/cancel guard after rendering.
- Downloaded synthetic dossier: **219 pages**, **1,107 original sales**, every original sale ID found in extracted text. Required notice, A4 pagination, running/table headers, final page number, known/missing values and canonical cutoff dates verified. Cover, interior Arabic text and last-page render inspected. Fixtures are synthetic only; no production financial records, owner credentials or PINs are committed.
- Existing daily export: **26 controls**. Stamp and offline-shell focused checks passed. The completed full-project gate and real production download verification are recorded below; focused checks alone are not a release claim.

Evidence: `evidence/2026-10-04-month-end/`. The synthetic PDF is a QA sample, not an Amira report. Physical iOS acceptance is a separate boundary, not asserted by desktop browser checks.

## Initial-release full-project gate

Frozen implementation `5bf76111e28621897b34ed775382198b92b79654`: `node tools/check.js` completed with **exit 0**, all checks passed, **2026-10-04 20:14:40–20:47:38 UTC** (32m 58s). One existing `background:var(--ink)` styling-debt warning remains; no browser suite was skipped. The three monthly suites ran within this complete gate. Source files remained unchanged throughout the gate. Existing installed Chrome/dependencies and the previously documented read-only four-font path alias were used. See `full-check.txt` and `full-check-result.json`.

Production publishing and the signed-in Amira Cafe download were verified independently as described below.

## Initial-release production and real merchant verification

Release `2fc7b702dd980403f09f51da8b20ee2b59109f0d` was pushed normally to both configured GitHub mirrors. Cloudflare Pages reported successful deployment `8243778e-275c-42c1-adf8-cde0699f8aed`. The three public monthly modules matched the validated source byte-for-byte; the deployed offline manifest references core `v10`, PDF `v6`, UI `v3`.

In a separate real Chrome tab, the existing signed-in **Amira Cafe operator view** was cold-reloaded. Rapport Journalier displayed the new button even on an empty daily page. Opening it selected **September 2026**, the last completed business month. Pressing **Générer le PDF** completed successfully, with Chrome reporting the exact named PDF as **Done**. The interface showed **52 pages** and **71 points to review**. No tax configuration, transaction or cash-closing control was used.

The actual downloaded PDF was inspected locally, not committed or uploaded: all 52 page footers, the exact English notice, readable cover/last-page layout, original-ledger annexes and explicit missing/incomplete labels were verified. Its 19 original sale records include 11 active and 8 voided originals; an independent recomputation from the original integer-centime fields in the downloaded annex reconciled to its monthly net summary. The dossier preserves voided originals rather than silently removing them. See the redacted `live-verification.json`; no financial totals, tax IDs, address, financial PDF or private rendered pages are stored in repository evidence.

Amira Cafe’s existing configured timezone is **Europe/Berlin**, with cutoff **05:00**. The owner explicitly chose to **leave it unchanged and display the configured timezone** after this was identified in the real export. No timezone setting was changed. Morocco/Africa-Casablanca/Ramadan boundaries remain covered by the engine/API fixtures; the real report follows the authoritative establishment configuration rather than the browser’s local timezone.

Desktop production download acceptance is verified. Physical iOS device acceptance is not claimed. The original daily composer’s PDF/CSV controls and monthly shortcut were separately covered by the real-browser regression suite.

## Usability and readable-dossier revision

Built from origin/main `11fb9626` in the attached `codex/month-dossier-usability` worktree. No original-ledger calculation or timezone logic changed. The later user request supersedes the previous raw-field presentation: the PDF must contain understandable business text and numbers, not internal object paths or device metadata.

### 1. Summary first

The first two pages on the synthetic fixture contain establishment/legal identity, selected business period, generation clock, original revenue, refund/void counts and amounts, VAT by configured historical rate, payment split, per-service cash opening/expected/counted/variance totals, purchases/expenses with the existing coverage denominators, cost/management perimeters and inventory-variance headlines. Cash aggregates are explicitly sums of listed services, not a single month-opening/month-closing balance; absent inputs invalidate the corresponding sum. No daily rounded revenue is added. Annex labels in the full overview are real internal PDF destinations, verified by reading the generated PDF annotations.

Before: `evidence/2026-10-04-month-usability/before-page-1.png`, `before-page-2.png` (previous synthetic fixture). After: `after-full-001.png`, `after-full-002.png`, `after-summary-1.png`, `after-summary-2.png`. All figures in these samples are synthetic.

### 2. Actionable diagnostics

Every existing engine warning code has a tested cause mapping. Unknown future codes and missing codes remain visible in the fallback group (`uncoded-warning`), never disappear. Group counts count **diagnostics**, not unique documents or missing products: one existing warning can concern several lines, and multiple warnings can concern the same purchase. The trilingual UI explains this rather than inventing entity counts. Each cause names the Kiwi screen to review. The preflight shows these groups before any export; Annexe T keeps every individual diagnostic, rendered with a readable cause label. CSV retains its exact original code/reference/detail.

### 3. Summary and full dossier

`Dossier complet` remains the default, with every monthly record and supporting section after the overview. `Résumé` contains the overview and grouped diagnostics only (two pages on the synthetic fixture). Both carry the exact required notice and per-page footers. Filenames retain the requested `Rapport-fin-de-mois-...pdf` and `Resume-fin-de-mois-...pdf` prefixes.

`Annexes optionnelles` is a disclosure, not a deletion switch: it explains that payroll estimates and recipe/nutrition/cost perimeters are **always included at the end** of the full dossier, under `Annexes complémentaires` (U/V). The daily composer and its four presets are untouched.

### Readability follow-up

Raw `record.cash.*` paths, millisecond epoch timestamps, field-code lists and opaque till/session IDs are no longer printed as debugger dumps. Available business facts receive French labels, formatted dates, MAD/unit amounts and readable states. Ticket/invoice references and every sale/refund/void record remain traceable. Technical or unrecognised source fields are retained in the local CSV source table rather than passed off as understandable PDF accounting facts. Source-record sections explicitly disclose when no readable business detail is available. The full PDF remains detailed, but technical preservation is not confused with readable accounting presentation.

### 4. CSV ZIP specification

One locally generated ZIP is used instead of multiple automatic downloads: it keeps one coherent snapshot together and avoids multiple-download permission friction on tablet browsers. No new endpoint, remote ZIP/PDF generator or upload is introduced.

- `ventes.csv`: one row per original monthly sale, including void/refund originals; UTC ISO date, canonical business date, references, payment methods, original and included net centimes/MAD, status and exclusion reason, original refund reference, original/known HT/TVA and separately included HT/TVA, plus dynamically discovered per-rate HT/TVA/TTC columns. Excluded originals have an explicitly excluded included-net/tax contribution of zero; unknown taxable amounts are not guessed.
- `achats-depenses.csv`: every recorded purchase/expense, supplier, invoice/date/category/payment/VAT, inclusion marker and original source reference. Costs below one centime preserve their original MAD precision; the integer-centime cell says incomplete rather than inventing a rounded ledger amount.
- `caisse.csv`: each original monthly cash event and available legacy Z cash archive, with original event-specific centimes and adjacent MAD columns. Inapplicable/missing event fields are explicit, not zero.
- `avertissements.csv`: every individual diagnostic with code, cause group, reference, detail, action screen and annex.
- `synthese.csv`: the existing PDF summary indicators and coverage limits; `donnees-sans-date.csv`: unassignable originals without fabricated dates; `sources-complementaires.csv`: full source rows/context documents for technical traceability (accountant email excluded); `LIRE-MOI.txt`: snapshot/clock/perimeter/notice and import instructions.

CSV files use UTF-8 BOM, semicolon separators, CRLF, quoted/escaped cells, ISO dates or original ISO civil dates, decimal-comma MAD and separate centime columns. Spreadsheet-formula-like merchant text is neutralised with an apostrophe; genuine negative numeric values stay numeric. The ZIP has tested CRCs and fails rather than truncates at ZIP32 limits. Summary/full/CSV in one dialog use the same verified source batch. The first export verifies that the preflight batch has not changed; an explicit Refresh starts a new batch. This is change-detected read consistency, not a database transaction snapshot.

### 5. Accountant email and sharing

Optional `accountantEmail` is explicitly saved in the existing owner-scoped `monthreport` store, separate from generation, with revision checks/CAS. Email changes preserve immutable dated tax periods; tax-period saves preserve the email. Invalid/control-character addresses are rejected. Explicit clearing is supported even without any tax periods.

A separate user click on `Partager` uses a prepared File with `navigator.canShare`/`navigator.share` when available. User cancellation sends nothing and does not trigger another automatic action. Unsupported/failed file sharing uses the existing local Blob/anchor download pattern and offers a **normal, separate mailto link**. The neutral French message matches the French report language, contains no figures, and instructs the user to manually attach the downloaded file. No email client is auto-opened, email auto-sent or PDF uploaded. [W3C Web Share specification](https://www.w3.org/TR/web-share/) defines capability/activation requirements.

Native source inspection: `KiwiPrinterSocket.exportInvoice` presents UIActivityViewController only after rendering invoice HTML, with a 200-page renderer cap. It accepts neither an existing PDF nor ZIP bytes. There is no generic file-share/Filesystem path for monthly files in this repository; the invoice-specific renderer is deliberately not misused or extended. Capacitor/iOS therefore retains the download/mailto fallback where browser file sharing is unavailable. Physical iOS saving/sharing acceptance is **NOT done**.

### Revised verification

- Engine/presentation/email policy: **317 controls**, unchanged original-ledger invariants, all warning codes, count reconciliation, readable dates/units/missing values, full FR/EN/AR key coverage, safe CSV numeric/text handling and explicit share/cancellation/fallback branches.
- Real signed-session API/store with synthetic in-memory SQLite: **36 controls**, strictly read-only report handler; separately explicit persisted email saves/rereads, historical-rate protection, stale/cross-owner/unsigned rejection, concurrent same-revision arbitration and clearing with/without tax periods.
- Real Chrome UI/downloads: **1,231 controls** before the final gate. All 12 language/width combinations, full-default choice, preflight group counts, no horizontal overflow, actual summary/full/ZIP downloads, first-two-page contents, all 1,107 original IDs, no raw-field dump labels, real internal annex annotations, complementary-annex order, BOM/CRC validation, independent centime/VAT recomputation including original void/refund records, explicit synthetic email persistence and actual fallback-button behavior without sending or auto mail navigation.
- Service workers unregistered and caches cleared before local verification; performance entries record all five currently stamped monthly modules. `dialog-[fr|en|ar]-[360|390|768|1440].png` and corresponding `dialog-diagnostics-...png` capture the real dialog. PDF first pages and a readable synthetic Z annex are rendered for visual inspection.
- Final full-project gate and live Amira evidence are recorded below after completion; these focused results alone are not a deployment claim.

The first usability full-gate attempt exited 1 solely because the print-hub test required the CAS feature array to have exactly its old two members. Adding the report settings to that protected-save set correctly changed the array. The test now executes the array and retains both mandatory reservation/print-hub membership checks plus its original conditional-write assertions. All 48 printer checks pass; the new report-store race test independently proves exactly one same-revision concurrent email save wins. This was a related integration correction, not an unrelated baseline failure. The first attempt is retained as `full-check-attempt-1.txt` / `full-check-attempt-1.json`.

A queued second full-gate invocation was cancelled before it entered any suites, to add the same human-readable formatting to numeric `date` fields as existing timestamp fields. ISO calendar-date strings are unchanged; this has a dedicated regression check. The queued invocation and exit 130 are retained separately, not counted as verification.

The third invocation was also cancelled: the existing global guard stops waiting after 20 minutes and would otherwise run beside the still-active native-ticket gate. It was stopped during syntax checks to restore the requested single-gate rule. Its exit 130 is retained as `full-check-guard-cancelled-attempt-3.*`; it is not passing evidence. The final invocation waits for the active owner gate to finish before starting.

The fourth complete run (23:07:06–23:41:45 UTC) passed all monthly, printer and other suites except the unchanged hotel direct-booking browser test, which hit its original 420-second limit while observed machine load exceeded 100. No assertions or timeout budgets were changed. The exact test bytes were run serially in a clean detached worktree at `11fb9626`: all 177 controls passed with exit 0 under the same 420-second limit (23:42:06–23:46:37 UTC). This supports a transient resource-load diagnosis, not a proven pre-existing hotel code defect. Evidence: `full-check-load-attempt-4.*` and `base-hotel-check.*`. Abandoned headless browsers with dead test parents and temporary Puppeteer profiles were closed; regular Chrome, active test children, simulator and the other checker were untouched. The final full run uses the same frozen product bytes and original budgets.

## Usability final full-project gate

`node tools/check.js` completed with **exit 0**, all checks passed, **2026-10-04 23:46:59–2026-10-05 00:12:05 UTC** (25m 06s). The frozen product/test bytes remained unchanged. The original timeout budgets and assertions were used; no browser suite was skipped. All three monthly suites and all 48 printer-lease controls ran within this complete gate. One pre-existing `background:var(--ink)` styling-debt warning remains. Installed Chrome/dependencies and the existing read-only four-font path alias were used. Evidence: `evidence/2026-10-04-month-usability/full-check.txt` and `full-check-result.json`. The temporary clean detached baseline checkout was removed after its 177-control hotel check. Physical iOS acceptance remains NOT done.

## Usability deployment and live acceptance

Implementation `72c22e6ba4f89d08946a23ce48432a04e7427009` was normally pushed to both GitHub mirror URLs. Cloudflare Pages reported success for deployment `cde76936-4ad4-4620-a74d-94c76f56f80e`. All five public monthly modules and the service worker match the fully validated source bytes. Stamps: core v10, tools v5, CSV v4, PDF v12, UI v7. The unauthenticated dashboard probe correctly returns 401; its signed-in shell was verified through Chrome, not represented as a public byte comparison.

In the dedicated existing signed-in Amira Cafe **restaurant** operator tab, a cold reload showed the new full/summary choices, explicit accountant field, preflight cause groups and CSV button. September 2026 was the default. Full, résumé and CSV ZIP were generated from **one verified dialog snapshot**; Chrome marked all three downloads Done. The full dossier is now 43 pages (previously 52), the résumé is 2 pages. Private independent extraction recomputed original included centimes from CSV and compared them to both PDF net summaries; all known CSV summary amounts also match. The résumé content is identical to the first two full-PDF pages except page totals. Original ticket references and void originals remain available. Warning-group counts reconcile to every raw CSV warning (raw PDF drawing order avoids interleaving wrapped table columns during extraction). Required notices, ZIP CRC/BOM, honest missing-data labels and complementary-annex ordering were checked. The first two real PDF pages and structured Z page were privately rendered and visually inspected.

The configured **Europe/Berlin / 05:00** clock was shown and unchanged. No settings, tax rates, accountant address, transaction, order, cash closure, PIN or credential was entered or changed. Neither Share nor the mailto link was clicked, and no real message was sent. The existing ready service worker applied automatically after the finished dialog closed; the operator page rehydrated normally, without PIN entry. The operator-only sticky banner can overlay the top of a tall dialog; the clean merchant layouts were inspected in all 12 synthetic language/width cases.

Only `live-amira-september-redacted.json` is committed for the real merchant: boolean acceptance checks plus non-financial target/month/time metadata. Real PDF/ZIP files stay in the user's Downloads, never in this repository. Synthetic before/after pages, all 12 dialog screenshots, CSV reconciliation and complete-gate logs are in the same evidence folder. Physical iOS acceptance remains **NOT done**; there is no generic native monthly-file share hook, and the download/manual-attachment fallback remains necessary where Web Share files are unavailable.
