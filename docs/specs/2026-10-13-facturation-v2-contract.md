# Facturation v2 · contract (2026-10-13)

Shared by the server agent and the client agent. Both build to this exactly; if something here is impossible, say so in your report instead of improvising a different shape.

Design borrowed (ideas only, no code) from Dolibarr (validation freezes and numbers; corrections by credit note), Invoice Ninja (derived balance and overdue; payments as records; quote to invoice), InvoiceShelf (server recomputes totals; per-line tax). Moroccan rules: CGI art. 145 mentions, unbroken series, customer ICE for B2B, VAT by rate.

## Document types and numbering

| type | prefix | example | series |
|---|---|---|---|
| invoice | F | F-2026-0042 | SHARED with till invoices (`sale_invoices`) |
| credit_note | AV | AV-2026-0003 | own |
| quote | D | D-2026-0007 | own |

- `seq` is per merchant and per prefix, global across years (the existing till series already works this way: `formatInvoiceNumber(year, seq)` in functions/api/invoice.js). The year in the number is the issue year. Padding 4 digits, wider past 9999, never wraps.
- One allocator for everything: `functions/api/_invoice-series.js` exports `allocateNumber(env, merchant, prefix, year)`. Table `invoice_series(merchant TEXT, prefix TEXT, seq INTEGER, number TEXT, doc_ref TEXT, created_ts INTEGER, PRIMARY KEY (merchant, prefix, seq))`. For prefix F the next seq is `max(invoice_series F seq, sale_invoices seq) + 1`, so history is respected. Collisions retry (UNIQUE), like the current till path.
- The till path (`getOrCreateSaleInvoice`) must reserve its seq in `invoice_series` too, in the same `env.DB.batch([...])` as its `sale_invoices` insert, so both paths can never hand out the same F number. Its existing behaviour and tests (tools/sale-invoice-test.mjs) must stay green.
- A number is assigned only at **issue**, never at draft save. Numbers are never reused or deleted.

## Tables (create on first use with CREATE TABLE IF NOT EXISTS; also add to schema.sql; prod D1 lags schema.sql)

`invoice_docs`
- `id TEXT PRIMARY KEY` (server-generated, e.g. `inv_` + 16 base64url chars)
- `merchant TEXT NOT NULL`, `type TEXT NOT NULL` (invoice | credit_note | quote)
- `status TEXT NOT NULL` (see states), `number TEXT` (null while draft), `seq INTEGER`
- `issue_date TEXT` (YYYY-MM-DD), `due_date TEXT`, `terms_days INTEGER`, `valid_until TEXT` (quotes)
- `customer TEXT NOT NULL` JSON `{name, address, ice, if, email, phone, clientId}`
- `seller TEXT` JSON snapshot frozen at issue (from the merchant's legal identity, same source as the till invoice: name, legalName, address, city, ice, if, rc, patente, phone, email)
- `lines TEXT NOT NULL` JSON array `[{description, qty, unitHT (cents), discountPct, vatRate}]`
- `totals TEXT NOT NULL` JSON `{htCents, vatCents, ttcCents, byRate: [{rate, baseCents, vatCents}]}` computed by the SERVER only
- `payment_method TEXT` (cash | card | transfer | cheque | other), `note TEXT`, `internal_note TEXT`
- `original_id TEXT` (credit notes: the invoice they correct), `source_quote_id TEXT` (invoice made from a quote), `reason TEXT` (credit notes)
- `created_ts, updated_ts, issued_ts, sent_ts, cancelled_ts INTEGER`, `created_by TEXT`
- `legacy_ref TEXT` (old device-local number when imported)

`invoice_payments(id TEXT PK, merchant, doc_id, amount_cents INTEGER CHECK > 0, date TEXT, method TEXT, reference TEXT, created_ts, created_by)`

## States

- invoice: `draft → issued`; derived display states from payments: `partial` (0 < paid < ttc), `paid` (paid + credited ≥ ttc); `overdue` is derived (issued, balance > 0, due_date < today) and never stored. `cancelled` only when credit notes cover the full TTC. A draft may be deleted; an issued invoice never.
- credit_note: `draft → issued`. Must reference an issued invoice of the same merchant; total ≤ that invoice's remaining credit-able amount (ttc − already credited). Lines may be partial.
- quote: `draft → sent → accepted | rejected → invoiced`; `expired` derived from `valid_until`. A quote is not a tax document; it can be edited until `invoiced`.
- After issue, LOCKED: lines, totals, customer, seller, number, issue_date, type. Still editable: `internal_note`, `sent_ts` (mark sent), payments.

Balance (derived, returned by the API): `ttc − sum(payments) − sum(issued credit notes on this invoice)`.

## VAT

- Per line `vatRate` from the list `[20, 14, 10, 7, 0]`. 0 means exempt; an exempt line requires the document `note` or a dedicated `exemptionMention` field to state the exemption basis (client asks for it; server rejects issue without it if any line is 0). Keep the list in one exported constant so it can change.
- Server computes per line: `lineHT = round(qty × unitHT × (1 − discountPct/100))`, groups by rate, `vat = round(base × rate / 100)` per rate group, `ttc = ht + vat`. Cents everywhere, integers.

## API: `functions/api/invoices.js` (GET + POST), owner session or named operator only

Auth: same rule as owner-only store features (see `editsRoster` / `entitledMerchant` in functions/auth/_lib.js and functions/api/store.js). A paired till token, an employee session, or the accountant cookie (`kiwi_acct`) must get 401/403 on every write AND on reads.

GET `/api/invoices?merchant=<slug>&type=invoice|credit_note|quote&from=YYYY-MM-DD&to=YYYY-MM-DD`
→ `{ ok, docs: [ {id, type, status, displayStatus, number, issueDate, dueDate, customer:{name, ice}, totals:{ttcCents}, balanceCents, originalNumber?, legacyRef?} ] }` newest first, max 500.

GET `/api/invoices?merchant=<slug>&id=<id>` → `{ ok, doc: <full row with parsed JSON>, payments: [...], creditNotes: [{id, number, ttcCents, issueDate}], displayStatus, balanceCents }`

POST `/api/invoices` body `{ merchant, action, ... }`:
- `save` `{ id?, type, customer, lines, issueDate, termsDays | dueDate, validUntil, paymentMethod, note, exemptionMention, internalNote }` → creates or updates a draft (or an unissued quote). Returns `{ok, doc}`. Rejects updates to issued docs except `internalNote` (409 `locked`).
- `issue` `{ id }` → validates (customer name required; ICE format checked with functions/api/_ice.js when present; at least one line with qty > 0; exempt lines need the mention), freezes seller snapshot, recomputes totals, allocates number, sets issued_ts. Idempotent: issuing an issued doc returns it unchanged. On a quote, `issue` assigns the D number and sets status `sent` (the quote stays editable until `invoiced`; editing keeps its number).
- `mark-sent` `{ id }` → sets sent_ts (invoice or credit note).
- `payment` `{ id, amountCents, date, method, reference }` → only on issued invoices; amount ≤ balance; returns updated balance and displayStatus.
- `delete-payment` `{ id, paymentId }`.
- `credit-note` `{ id, lines?, reason }` → creates a DRAFT credit note pre-filled from the invoice's lines (or the given subset), `original_id` set. The client then issues it with `issue`.
- `quote-status` `{ id, status: accepted | rejected }`.
- `convert-quote` `{ id }` → creates a draft invoice with the quote's customer and lines, `source_quote_id` set; quote becomes `invoiced`. Returns the new draft.
- `duplicate` `{ id }` → new draft of the same type with the same customer and lines, no number.
- `delete-draft` `{ id }` → only drafts (and unissued quotes).
- `import-legacy` `{ docs: [...] }` → imports device-local invoices (the old `kiwi:invoices:v1:<venue>` localStorage shape: `{id, customer, contact, issueDate, dueDate, terms, taxRate, status, items:[{description, qty, price}], note}`) as DRAFT invoices with `legacy_ref = '#' + id`, prices treated as HT, the old single taxRate applied to every line. Idempotent per (merchant, legacy_ref). Max 500 per call.

Errors: JSON `{ error: '<code>', message }`, codes: `unauthorized`, `forbidden`, `not-found`, `locked`, `invalid-<field>`, `exempt-mention-required`, `amount-exceeds-balance`, `credit-exceeds-invoice`, `not-issued`.

## Accountant portal

`functions/api/comptable/books.js` also returns issued invoices and credit notes from `invoice_docs` for the period (number, date, customer name + ICE, HT, VAT by rate, TTC, balance, original number for credit notes). Never drafts or quotes. comptable.html shows them in the invoices table and its CSV export.

## Printing (client)

A4 HTML document generated client-side (window/iframe print as today; in the native app use whatever export path assets/invoicing.js or the app already uses for PDFs), roman type, never italic:
- Title by type: FACTURE / AVOIR / DEVIS, number, issue date, due date (invoice) or validity (quote).
- Seller block with all mentions present in the frozen seller snapshot: legal name, address, ICE, IF, RC, patente, phone.
- Customer block: name, address, ICE (and IF if given).
- Lines: Désignation, Qté, P.U. HT, Remise, TVA %, Total HT.
- Totals: Total HT, one VAT line per rate ("TVA 20 % sur 1 000,00"), Total TTC; amount paid and balance for invoices with payments.
- Credit note: "Avoir sur facture F-2026-0042 du 12/10/2026" and reason.
- Exempt mention when present. Payment method and terms.
- A draft prints with a large "BROUILLON · sans valeur fiscale" and no number.
- FR, EN, AR document language follows the app language; Arabic is RTL.
