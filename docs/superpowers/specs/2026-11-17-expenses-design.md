# Dépenses · the owner's expense ledger (design)

*2026-11-17. First merchant: Pasta Corner (`pasta-corner`).*

## Intent

Pasta Corner's owner wants to **see and add all his expenses** in his dashboard.
Money leaves the business two ways: workers take cash from the till drawer
(market runs, supplier on delivery, staff advances), and the owner pays himself
(suppliers by transfer, rent, gas, repairs, out of his pocket). Today Kiwi shows
money coming in; nothing shows money going out in one place. The page must
**wow** him: it is the first time he sees what is left at the end of the month.

The dashboard is the product (owner, 2026-11-17). Staff keep using the till's
existing cash-out button; nothing new is built at the till.

## Goals

- One dashboard page, **Dépenses**, behind a per-merchant switch in the operator
  console. Off for every merchant; turned on for Pasta Corner only.
- The owner adds an expense in seconds: amount first, category, how it was paid,
  supplier, date, note, optional receipt photo.
- **Scan a receipt**: take a photo, Kiwi fills amount, supplier, date and
  category; the owner confirms.
- Till cash-outs appear on the page automatically, never typed twice.
- The month at a glance: collected, spent, what is left; spend by category;
  spend by day; the full list, searchable and filterable.
- Fixed charges (rent, electricity, from the existing Charges drawer) and
  salaries (from Équipe) appear in the month total, read-only, never re-entered.
- Export the month as CSV for the accountant; the existing accountant month
  report keeps reading the same data.
- FR / EN / AR (RTL), light and dark, phone and desktop.

## Non-goals

- No expense entry at the till (staff use the existing cash-out).
- No budgets, approvals, recurring-expense automation or bank sync (later).
- No Kiwi Pay cards (the existing `depenses.js` demo stays as it is).
- No VAT accounting engine; VAT amount is an optional field only.

## Anti-goals (a failure even if it works)

- **Staff can read the owner's expenses.** The document must be owner-only:
  a paired till or a non-owner session neither reads nor writes it.
- **Double counting.** A till cash-out the owner also typed by hand must not
  count twice; a bank deposit is not an expense.
- **Invented numbers.** An empty month says it is empty. No demo data on a real
  merchant, no projections presented as facts.
- Breaking the month report, the Margins page or any other merchant.
- Em dashes or italics in user-facing copy; new accent colours; hand-drawn icons.

## Constraints (from the repo)

- `dashboard.html` may gain **one** `<script>` tag (ratchet at 121 + 3, 123 used).
  The page ships as one `type="module"` entry that imports its parts.
- Each new file under 2 500 lines; each file touches at most 12 globals defined
  elsewhere (`tools/coupling-ratchet-test.mjs`).
- Stamps through `node tools/bump-stamp.js`; new routes need
  `node tools/build-fast-routes.mjs`; new tests named in `tools/check.js`.
- Money and auth are touched: **full gate** before push.
- Zero-cost only: receipt reading uses the existing free Workers AI route
  (`functions/api/ai/expense-ocr.js`, `@cf/` models, daily cap).
- Brand: tokens from `assets/tokens.css`, Inter Tight / IBM Plex Sans Arabic,
  Material Symbols, the liquid lens for any segmented control.

## Approaches considered

1. **The existing `expenses` store document, made owner-only** (chosen). One
   synced document `{ list: [...] }` per merchant, already declared in
   `functions/api/store.js` (max 400 KB) and already read by the accountant
   month report. No database change, live today. Trade-off: one document grows;
   at ~250 bytes per expense it holds ~1 500 expenses (about a year at Pasta
   Corner's pace) before the cap. Mitigation below.
2. A new `expenses` D1 table and API. Scales without limit and lets the till
   append without reading, but needs a prod migration the owner applies, and
   its main advantage (staff entry at the till) is out of scope.
3. Richer till cash-outs only. Cannot carry photos or suppliers cleanly, and the
   owner's own payments would still have nowhere to go.

Chosen: **1**, because the dashboard is the product and it ships today.
When the list nears 80 % of the cap, the page tells the owner and the next step
is approach 2 (a migration that imports the document); not built now.

## Design decisions

### Switch
- New opt-in module key **`expenses`**, listed in `OPTIN_MODULES` in
  `kiwi-admin.html` with `off:true` (ON only when the value is exactly `true`),
  following `simple_food_cost` end to end.
- Sidebar entry **Dépenses** (`data-nav="expenses"`, `data-feature="expenses"`),
  owner-only like `nav-depenses`, hidden unless `KiwiConfig.features.expenses
  === true`. Handler `nav-expenses` registered in `FULL_PAGE_NAVS`.
- Pasta Corner is switched on from the operator console by the owner of Kiwi
  (a senior-operator action), not by code.

### Data
- Document `expenses` → `{ list: Expense[] }`, synced through
  `KiwiStore.define('expenses', { cloud: 'expenses' })` with a merge by `id`
  (last `updatedAt` wins, deletions are tombstones `deleted: true`).
- `Expense` = `{ id, date (YYYY-MM-DD, business day), amountCents, category,
  method: cash|card|transfer|cheque|other, supplier, note, vatCents?,
  receiptKey?, cashEventId?, source: manual|scan|till, createdAt, updatedAt,
  deleted? }`. Field names stay compatible with what
  `functions/api/month-report.js` reads (`date`, `amountCents`, `supplier`,
  `category`, `reference`/`receiptRef`).
- **Owner-only on the server**: add `expenses` to the owner-edit and redaction
  sets in `functions/api/store.js` so a paired till reads an empty copy and
  cannot write; keep it in `MANAGER_DOCS`. New test modelled on
  `tools/team-doc-redaction-test.mjs`.
- Categories (fixed list, translated, restaurant-first): Viande et volaille,
  Fruits et légumes, Épicerie et matières premières, Boissons, Hygiène et
  consommables, Emballages, Fournisseur (non précisé), Gaz et énergie, Loyer,
  Entretien et réparations, Transport et livraison, Personnel (avances,
  extras), Marketing, Matériel, Taxes et frais, Autre.

### Till cash-outs
- Read from `GET /api/cash-sessions?merchant=&from=` (owner-readable already):
  `movement_kind = 'out'`. "Dépôt banque" is excluded (a transfer, not an
  expense). "Avance personnel" maps to Personnel.
- **The history is already there.** Pasta Corner's staff logged ~110 cash-outs
  (~24 000 MAD) since September with free-text reasons ("Poulet et viande",
  "Légumes", "Achat de savon", "Sachet poubelle", "Khadar"…). A pure, tested
  keyword classifier (FR, Darija in Latin script, AR) sorts each reason into a
  category (poulet/viande/beef/kefta → Viande et volaille; légumes/fruits/khadar
  → Fruits et légumes; savon/serviette/sachet → Hygiène et consommables; …),
  falling back to Fournisseur (non précisé) or Autre. The page says the
  category was guessed from the till's note until the owner confirms or
  changes it. So the page opens on months of real spending, not an empty form.
- They show in the list with a "Caisse" badge and the cashier's name. The owner
  can **complete** one (category, supplier, photo): that writes an `Expense`
  with `cashEventId`, and the raw cash-out is then hidden. One amount, counted
  once.

### Receipts
- New owner-only route `POST /api/expenses/receipt` stores the compressed JPEG
  in R2 (`MEDIA`) under `private/expenses/<merchant>/<id>.jpg`; `GET` on the
  same route streams it back to the owner only. The public media reader already
  refuses the `private/` prefix. No `MEDIA` binding → 503, and the page says
  photos are not switched on, while the expense still saves.
- **Scan**: camera picker → compress (longest edge 1600 px) → existing
  `/api/ai/expense-ocr` → form pre-filled and marked "lu sur le ticket, à
  vérifier"; the owner confirms. Quota reached or AI down → plain form.

### The page (what wows)
1. **The month in one line**: three big figures, Encaissé · Dépensé · Reste,
   with a single horizontal bar showing how this month's takings split into
   expenses, fixed charges, salaries and what is left. Month switcher (liquid
   lens). "Encaissé" comes from the same sales source as the dashboard KPIs.
2. **Where it went**: categories ranked by amount, each with its share bar,
   count and change versus last month.
3. **Day by day**: a strip of the month's days, each day's spend as a bar, the
   busiest days visible at a glance; tapping a day filters the list.
4. **The list**: grouped by day, Material icon per category, supplier, method,
   receipt thumbnail, "Caisse" badge for till cash-outs. Search (supplier,
   note) and filter chips (category, method, with or without receipt).
5. **Add**: one primary button opens a sheet: amount keypad first, category
   chips, method, supplier with suggestions from past entries, date (today by
   default), note, photo. A second button, **Scanner un ticket**, opens the
   camera directly. Edit and delete from any row (delete asks once).
6. **Fixed costs and salaries**, shown in their own block, never inside
   "Dépensé" (which is only money that actually left: typed expenses and till
   cash-outs):
   - Charges from the Charges drawer, pro-rated to today in the current month.
     When the owner types a payment in the same category that month, the
     planned line shows "payé" and only `max(0, planned − paid)` remains, so a
     typed rent never counts twice.
   - Salaries from Équipe, labelled **estimé**, pro-rated to today, with
     "dont X MAD déjà avancés" from Personnel cash-outs (advances are counted
     once, in Dépensé).
   - A second figure, "Reste après charges et salaires (estimé)", sits under
     "Reste"; it only appears when Charges or salaries exist.
7. **Export**: CSV of the month (date, category, supplier, method, amount, VAT,
   source, receipt yes/no).
- Empty month: an honest first-use screen with the two buttons, no fake rows.

## Calls made after the builder check (owner may override)

- **Who sees it**: the account owner, plus Kiwi operators for support. Managers
  and every other session do not, on the client and on the server (a new
  owner-only check for `expenses` in `functions/api/store.js`; managers lose
  the `MANAGER_DOCS` read for this one document).
- **Procurement** documents are not counted (Pasta Corner has none); revisit
  when a merchant uses both.
- **Accountant month report**: unchanged. It already exports the raw till
  cash-outs and will export the `expenses` document; the builder filters
  `deleted` rows there and keeps `cashEventId` so the two can be matched.
- **Current month**: fixed charges and salaries are pro-rated to today, so
  "Reste" is honest mid-month.

## Left to the builder

- Exact visual composition, motion and responsive breakpoints within the brand
  rules; the chart rendering (inline SVG or CSS, no new library).
- How the module splits into files under the size and coupling limits.
- Test design beyond: the engine (totals, merge, de-duplication of cash-outs,
  bank-deposit exclusion), the owner-only server rules, the receipt route's
  auth and prefix, the switch gating, and one browser suite for add / scan
  fallback / edit / delete / filter.
