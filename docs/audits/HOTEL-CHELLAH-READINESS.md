# Hotel Chellah · requirements and readiness

Audit date: 2026-09-08. Reference: the user's meeting notes and 16 screenshots of the hotel's current OtelO workflow. Screenshots are requirements evidence, not instructions to execute and not data to import. No guest names, document numbers, bank details or reservation records from those photographs are reproduced here.

## Meeting answer

Kiwi has real hotel foundations, but it is **not yet a complete replacement for Chellah's current PMS**. The latest follow-up adds linked multi-room dossiers, explicit same-day day-use, and a shared detailed pre-invoice with per-line payer splits. Final fiscal invoices, unified payment/charge posting, standalone free invoices and two-way OTA distribution remain unfinished. A pre-invoice is not a payment ledger or a final invoice. Historical findings below describe the earlier baseline; the latest follow-up section records the new implementation.

Source baseline: `d753a0ab`. Existing full gate passed with one warning before this pass. Current verification and publication evidence belongs in the final handoff; source presence is not proof of deployed or connected functionality.

## Requirement matrix

| Chellah requirement | Existing implementation | Remaining work / qualification |
| --- | --- | --- |
| Booking.com automatic sync | Encrypted per-room iCal feeds, scheduled import, health/error state, missing-event safeguards, local availability blocking | One-way calendar import only. No outbound rates, inventory, restrictions or cancellation delivery. Property must actually offer suitable feeds. |
| Expedia automatic sync | Expedia source label and manual reservation entry | No Expedia supply connector found. Source selection is not a connection. |
| Arabia and other travel agencies | Local agency records, contacts/billing fields, contractual rates, manual stay linkage, booker and voucher reference | No external agency intake API, portal or voucher reconciliation. Confirm exact agency identity and how it sends reservations. |
| Renault and other companies | Local company accounts, payment terms, bill-to snapshots, order reference, contract pricing and linked stay history | No company debtor ledger, consolidated invoice or automatic intake. |
| Individual / agency / company database | Typed commercial directory plus the existing guest Cardex; guests are distinct from the billed account | One billed account per reservation, not split debtors or separate agency-and-company payer allocations. Durable guest-ID linking and duplicate matching remain. |
| Cardex | Guest contact/identity/preference fields exist | Reservation customer is a snapshot rather than a durable cardex link. Needs explicit matching and duplicate handling, not name-only automatic merges. |
| Arrival, departure, room, origin | Real stay API and room assignment with D1 overlap checks | Origin is a small channel enum. Needs separate booking channel, booker, company/agency and invoice debtor. |
| Reservation formula / prestation | Accepted daily room-only, BB, half-board lunch/dinner and full-board contract quotes | Package quote is not an itemized fiscal ledger. Supplements/taxes still require approved rules. |
| Single / double / triple | Separate contractual occupancy prices and physical room categories | Child rules, triple reductions and supplements are not inferred. |
| Seasonal contracts | Exact inclusive validity periods per account, category, occupancy and formula; cross-season nightly quotes | Uncovered dates are refused. September–December and negotiated exceptions require explicit contracts. |
| Arrivals / departures / in-house | Server lifecycle transitions and reservation calendar | Real dashboard reception was a placeholder. This pass adds daily lists and dossier access. POS stays and dashboard reservations still are not one complete workflow. |
| Modify dates / details / room | Existing stay editor and server checks | Fixes in this pass preserve booked prices and guest details. Historical mid-stay room moves still need dated room segments, rather than rewriting the entire stay's room. |
| Add another room | Another independent reservation can be created | No multi-room dossier with linked room requests, partial cancellation and one billing account. |
| Cancel | Cancellation transition persists history and releases Kiwi capacity | Does not cancel on the originating OTA. In-house guests use checkout/early departure, not a reservation cancellation. |
| Extend / early departure | Dates can be edited; availability rechecked | Needs charge adjustments, package recalculation rules and dated movement history. An edited date alone is not accounting reconciliation. |
| Day-use | Overnight model requires checkout after arrival date | Missing explicit arrival/departure times, same-day occupancy, pricing and housekeeping turnover. |
| Facture libre | Generic invoice service starts from a sale | Confirm meaning. Standalone service invoice drafts without room stays are not a hotel workflow today. |
| Detailed hotel invoice | Generic server-numbered A4 sales invoices; separate hotel folio preview | Hotel preview does not call that invoice service. Missing immutable dated lodging/package/tax/payment ledger linked to the stay and bill-to party. |
| Situation / running balance | Folio totals and payment summary | Missing chronological debit/credit balance, credits, allocations, pro forma/final/credit-note lifecycle and debtor transfer. |
| Monthly account production | Complete-ledger monthly room-night matrix by commercial account or unlinked booking channel | Reserved room-nights, not actual presence, collected revenue, debtor balance or remaining availability. Missing/corrupt/over-limit ledger fails explicitly. |
| Availability forecast | Room/date occupancy view and D1 overlap validation | Needs category-level sellable inventory with maintenance blocks, group allotments, release dates and source breakdown; long-range intelligence is not complete. |

## Corrections in this implementation pass

- Replace the real-hotel reception placeholder with dated arrivals/departures, actual in-house status, overdue items, counts, search and dossier links. Walk-in folios are explicitly distinguished from reservation dossiers.
- Read today's and selected-date reservations from the server, and fetch current in-house stays independently so overdue guests are not hidden by the day filter. Show refresh failures and the 1,000-row read limit instead of an unqualified empty state.
- Scope fetched reservations to the hotel; prefer the newer record when combining the compact document and D1 results. Late responses retain their originating scope.
- Persist cancellation results in the local fetched cache; stop claiming Kiwi cancellations propagate to all OTAs.
- Keep the same creation reference when retrying an uncertain network response. Prevent simultaneous submissions and writes through an editor opened under another hotel.
- Reject impossible calendar dates instead of silently normalizing them. Preserve the booked price and cents during same-category edits; category changes deliberately use the new category price.
- Allow explicit cancelled-history reads and full-status operational snapshots without changing the default cancellation filter.
- Preserve guest identity data through normalization/editing, including stable guest IDs, birth dates and accompanying-minor counts.
- Freeze room-price snapshots for newly opened POS stays; legacy stays without snapshots cannot have their original agreed rate reconstructed automatically.
- Prevent quantity edits on already-posted POS extras until a linked reversal/adjustment workflow exists. Include recorded extra timestamps in the hotel printout.
- Preserve open folios/stays when payment recording fails. Dashboard checkout checks the recording result's `ok` value rather than treating an error object as success. A queued payment is explicitly not a bank settlement or a server acknowledgement.
- Retain the latest closed dashboard folio marker/snapshot per room so a stale synchronized copy does not reopen it. This is not a complete immutable invoice archive.
- Replace fixed placeholder charge time with actual Casablanca time and retain an actual timestamp on new dashboard charges.
- Add phone/tablet-friendly reception layout, labelled controls, visible keyboard focus and 44px control targets. This is a targeted usability improvement, not whole-product accessibility certification.

## Follow-up implementation: commercial accounts and contract pricing

Built locally after approval, not published:

- Entry points: **Reception → Clients, agences & sociétés**, or **Tarifs & occupation → Contrats agences & sociétés**. Existing guest Cardex remains reachable from the new directory.
- Individual, agency and company accounts with legal identity, ICE/IF/RC fields, billing address, contacts, payment days, notes and archival state. Fields can be cleared deliberately. No real hotel/customer data were imported from the photographs.
- Account stay-history read, filtered server-side, including cancellations. The UI distinguishes booked amounts from receipts/debtor balances and identifies capped/document-only history.
- Account/category/single-double-triple/formula contract rows with exact inclusive validity dates; MAD per room or per person per night; room-only, BB, half-board lunch, half-board dinner and full board. No automatic September–December season or child reduction is invented.
- Server-side per-night quote in centimes; cross-season breakdown; rejection of missing rates, overlapping rates, mixed HT/TTC basis, impossible dates and monetary overflow.
- Explicit quote preview and acceptance in the reservation editor. Server recalculates the quote and checks the directory revision. Contract edits do not automatically reprice accepted stays; changed dates/category/occupancy require renewed acceptance. Closed dossiers cannot be repriced through the commercial path.
- Guest, booking channel, booker and billed account are kept distinct. Billing identity and accepted quote are snapshots, preserved through client normalization, public booking writes and pruned D1-only stay editing. Whole-document sync rejects changes that would erase/rewrite commercial terms; reservation document writes use compare-and-swap.
- Private `/api/hotel/commercial` route uses existing `store_docs` under `hotel-commercial`; it is not exposed through the generic store feature list. Owner/named-operator authorization, exact merchant matching, hotel-only and suspended-store checks, bounded documents, fail-closed corrupt data, archive instead of deletion, and revision conflicts are implemented.
- Responsive cards/forms, labelled controls, keyboard focus and touch-size controls are added. Local behavior is tested; rendered phone/tablet acceptance is still unverified.

Important boundaries: this is a commercial reservation quote, not an invoice, ledger or payment authority. HT rates are reviewable but cannot be accepted as a TTC stay before hotel tax configuration. Taxes and supplements are not automatically derived from the photographs. Imported iCal stays cannot accept contract pricing until provider updates can be reconciled safely. Existing dashboard/POS folios are still separate from this reservation pricing; do not use the legacy checkout as proof that a contract is invoiced correctly.

## Critical work still required before replacing OtelO

### 1. Commercial accounts and linked identities

Entities must separate the **guest**, **booking source/booker**, **commercial account** and **invoice debtor**. One company can book through an agency for several guests; the bill may be split between company-covered lodging and guest-paid extras.

Basic records, terms, archival state, reservation links, bill-to snapshots, voucher/order references and linked stay reads are now implemented locally. Remaining: independent agency/booker/payer relationships, split debtors, guest-ID matching, account activity audit history and integration with an immutable invoice ledger.

### 2. Contracted seasonal and package pricing

The account/category/occupancy/board/date matrix, units, HT/TTC distinction and explicit daily quote acceptance are implemented locally. Remaining: accountant-approved tax calculation, child/triple/supplement rules, incremental adjustments for changed stays, quote-to-folio posting and provider reconciliation.

Rules must address overlapping contracts, gaps, cross-season stays, child ages/charges, third-person supplements or reductions, complimentary stays, negotiated exceptions, cancellation/no-show fees and who can override a price. Freeze accepted daily prices. Later catalogue changes must never rewrite past charges.

User-specified presets: low season 1 January–30 June; high season 1 July–31 August. Do not infer September–December. The photographed old program shows different presets in places; the user's confirmed contract wins over that reference UI.

### 3. Unified reservation, room movement and folio ledger

Dashboard folios currently live in `rooms`; POS stays use `verticalops`. The audited room-charge events do not establish a shared stay/folio identity. Introduce one stable stay/folio reference and dated lines for lodging, meals, extras, taxes, payments and adjustments. Posting, reversal, retry and authorization must be enforced server-side.

Add multi-room dossiers; original booking recap; edits with reason/operator/time; dated room moves; extensions; early departure; partial cancellation; guest changes; housekeeping handoff; outstanding-balance alerts and authorized credit. Confirmed payment, queued payment, room-charge transfer and actual money collected are different states.

### 4. Detailed invoicing and debtor ledger

Model service date, quantity, room, occupants, description, unit price, discounts and configured tax components per line. Render daily lodging/packages, extras, receipts and cumulative balance from the ledger. Separate pre-invoice/situation, final invoice and adjustment documents. Include stable numbering, saved immutable snapshots, bill-to identity, references, payment methods and credit balances. Add group/agency/company consolidation and split billing only on top of these primitives.

Two audited hotel paths contain different hardcoded tax amounts (25 vs 27 MAD). **Neither is an approved Chellah configuration.** Obtain the hotel's accountant-approved taxes, exemptions, invoice samples and rounding treatment. Do not copy the photographed monetary values into global defaults or present this audit as legal/tax validation.

### 5. Actual distribution connections

Choose an approved connectivity path with the hotel: an existing compatible channel manager, or direct provider onboarding. Implement property/room/rate-plan mapping, inbound new/changed/cancelled reservations, outbound availability/rates/restrictions, acknowledgements, idempotency, retries, monitoring and reconciliation. Test concurrent bookings and last-room races before enabling sales.

Booking.com's official documentation distinguishes Reservations and Rates & Availability connections and requires onboarding/testing. [Booking.com connectivity](https://developers.booking.com/connectivity/docs), [going live](https://developers.booking.com/connectivity/docs/going_live).

Expedia's lodging connectivity describes availability/rates, reservation management and product management as separate core interfaces. This is the supply integration needed here, not a consumer travel-search API. [Expedia lodging APIs](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/reservations/getting_started/ui_guidelines/).

These external accounts, permissions and mapping decisions are dependencies, not something source edits can truthfully mark connected. No provider enrolment, credential use, contracts or production connections were performed in this pass.

## Questions to collect while the hotel is available

1. Current channel manager name, if any; Booking/Expedia property identifiers and room/rate-plan mapping list, shared securely later, not passwords in chat.
2. Exact Arabia agency name and intake method: portal, email, API, voucher, phone, allotment file?
3. September–December season; per-agency exceptions; whether a stay crossing seasons is priced night by night.
4. Are single/double/triple amounts per room or per person? Meal supplement unit? Child bands, third-person reduction, complimentary guest rules?
5. Does “facture libre” mean a non-resident restaurant/event/service invoice? What are day-use hours and prices?
6. Who pays accommodation, taxes and extras for each agency/company? Credit terms, monthly consolidation, deposits and overpayments?
7. Sanitized examples of the exact documents they need: situation, pro forma, final invoice, credit note, agency statement and company invoice.
8. Group/room-allotment rules, option deadlines, no-shows, cancellations and overbooking handling.
9. Which history must be migrated, and which exports can OtelO supply? Plan a reconciled import and parallel run, not ingestion from photographs.

## Evidence map

- `assets/hotel.js`: real dashboard reception, room catalogue, calendar, folios, iCal UI.
- `assets/pos-hotel.js`: front-desk POS state, room-rate calculation, extras, settlement callback and hotel preview.
- `assets/reservations.js`: reservation normalization and client document round trips.
- `functions/api/hotel/stays.js`, `_stay-events.js`: authenticated stay lifecycle, D1 room availability, event-backed writes and compact-document fallback.
- `functions/api/hotel/_channels.js`, `channels.js`, `cron.js`: actual inbound calendar integration.
- `assets/clients-store.js`, `functions/api/clients.js`: current cardex fields and per-client synchronization.
- `assets/invoice.js`, `functions/api/invoice.js`: generic sale-based invoice service, distinct from hotel preview.
- `functions/api/hotel/_room-charge-data.js`: room-charge event/report model and its current scope.

## Acceptance before a hotel go-live

Run a synthetic direct booking, OTA booking, agency voucher, company multi-room booking, cross-season BB/HB stay, day-use, room move, early departure, cancellation, extra reversal, split settlement and consolidated invoice. Reconcile charges/taxes/payments to the accountant-approved expected ledger. Test two simultaneous reception devices, offline retries and recovery, guest record preservation, unauthorized access, 172+ rooms, printed A4 output and tablet workflows. Then repeat the approved scenarios on a designated test property/account and obtain hotel sign-off. Do not test these writes on current guest bookings.

## Validation evidence for the initial reception/safety pass

- Final `node tools/check.js`: all checks passed, one warning, matching the baseline warning count. Log: `/tmp/kiwi-chellah-verified-check.log`. `git diff --check` also passed. Changes remain local, not committed or pushed in this pass.
- `node tools/hotel-reception-journal-test.mjs`: 29 behavioral/regression tests passed, including tenant-switch races, stale snapshot suppression, escaped rendering, failed checkout, retained closure, retry identity and guest detail submission.
- `node tools/hotel-stay-editing-test.mjs`: 14 tests passed across compact-document, D1 and pruned D1-only reservation paths, including calendar-date validation, cancelled history, agreed-rate preservation and idempotent creation retries.
- `node tools/hotel-pos-billing-safety-test.mjs`: 36 checks passed across cash/card/online failure returns, duplicate completion, frozen room rates, posted-extra edit protection and timestamp rendering. Actual POS recorder behavior is exercised; a returned local entry is not misrepresented as a server acknowledgement.
- `node tools/reservations-test.mjs`: 57 controls passed, including added guest/segment preservation coverage.
- Existing room register, stay, D1 reservation, iCal and sale-line forwarding suites passed when run directly. New suites are registered in `tools/check.js`; runtime asset stamps are updated through the repository tool.
- Generated a 20-arrival synthetic preview with long and Arabic text. Browser policy blocked opening the local-file preview; no workaround was attempted. **Rendered phone/tablet visual QA and full-dashboard interaction QA for the new journal remain unverified.** CSS breakpoint, labels and focus rules were checked programmatically, which is not equivalent to device acceptance.
- No live guest records were edited, no external OTA accounts were connected, and no accountant-approved invoice/tax validation was obtained. This remains a source/local-test handoff, not Chellah production acceptance.

## Validation evidence for the commercial follow-up

- `tools/hotel-commercial-test.mjs`: 13 tests passed. Synthetic in-memory SQLite exercises real handlers, cross-tenant refusals, suspension, directory CAS races, field clearing/archive, overlap/gap validation, cross-season centimes, accepted snapshot preservation, HT refusal, legacy document protection, account-filtered history and public-booking preservation without disclosure.
- `tools/hotel-reception-journal-test.mjs`: now 33 tests passed, including four new commercial UI regressions for escaped rendering, account filtering/navigation, tenant-switch response isolation and stale quote rejection after changing dates.
- Existing 14 stay-editing tests, 36 POS billing safety checks and 57 reservation controls remain green.
- The shared-checkout full gate observed 81 failures and one warning while other sessions were modifying authentication, inventory, payments, reporting, printers and native code. Those edits were not reverted or included in the hotel-only verification snapshot. Do not interpret that run as a launch clearance.
- An isolated local clone of `d753a0ab`, with only the hotel changes from these two passes, passed **the complete `node tools/check.js` gate with one existing warning**. Log: `/tmp/kiwi-chellah-isolated-final-check.log`; verification checkout: `/tmp/kiwi-chellah-verify.yCsJCM`. Existing local `app/node_modules` was reused. The first isolated attempt lacked those dependencies; the final run includes them and does not skip the existing native interaction suite.
- All selected implementation/test/shell files were byte-compared to that verified snapshot after completion. `tools/check.js` and the stamp manifest are shared files: the isolated copy contains the hotel test registrations and a manifest regenerated for the isolated source, not the other sessions' work.
- `git diff --check` passed for the hotel patch. The canonical index is empty. No commit, push, deployment, migration, real booking mutation or external OTA connection was performed.
- The new commercial screens have behavior/source tests, not rendered browser or physical-device acceptance. Existing native-shell tests in the full gate are not evidence that the new hotel screens have been visually approved.

## Subsequent design / production release candidate

The user authorized publication, but could not identify the channel manager or confirm hotel taxes/payer rules. These are still unknown; no tax values were invented and no external OTA connection was activated. Unified fiscal invoicing, split debtors, multi-room dossiers and day-use remain incomplete. Do not call this a completed PMS replacement or a TestFlight/App Store release.

Changes in this candidate:

- Monthly account/channel room-night report at **Clients, agences & sociétés → Production mensuelle**. It reads the complete `hotel_reservations` ledger, clips stays to the selected month, excludes the departure night, counts confirmed/in-house/completed stays, and excludes requested/cancelled/no-show records. Unassigned reservations are explicitly counted and labelled.
- The aggregate response contains commercial account names and counts, not guest record/contact/document fields. Exact hotel authorization; no compact-document fallback; corrupt data and the 20,000-stay read limit produce an unavailable state instead of misleading totals.
- Account filters now also filter contract cards. The new commercial header, summary strip, forms and cards use the existing brand typography and surface/inverse tokens. Reception hierarchy, control sizing and contrast were refined without changing its billing authority.
- Monthly matrix has semantic table headers, a labelled keyboard-scrollable region, sticky opaque account/day headings and responsive controls. Month-switch races and hotel switches cannot display another request's report; failed refreshes clear old totals.
- Public booking intake now also preserves existing staff-entered guest identities and dated guest/room segments when rewriting the shared document, without returning these fields to the public visitor. A real-handler SQLite regression covers the compact-document-only case where losing these fields would otherwise be permanent.

Verification:

- 15 commercial/model/real-handler SQLite tests, including monthly aggregation, leap years, cross-month nights, missing/corrupt history, authorization and aggregate privacy.
- 36 hotel UI behavior tests, including the account/contract filter fix, monthly-response ordering, hotel isolation, escaping and stale-total removal.
- 40 real Chromium component layout scenarios: commercial directory and monthly production, widths 320/390/768/1024/1440, light/dark and Vexel light/dark. Uses production JS/CSS and locally installed upright Inter Tight/Arabic fonts. Checks page overflow, labelled fields, 44px controls, keyboard focus and primary-button contrast. Screenshots reviewed; sticky table backgrounds corrected. This does not certify all dashboard skins, physical touch behavior or full merchant workflows.
- Shared checkout gate: `/tmp/kiwi-hotel-finish-shared-gate.log` reported 79 failure lines and one warning during concurrent audit changes. It is not a release gate pass.
- Hotel-only verification checkout: `/tmp/kiwi-chellah-verify.yCsJCM`, updated to upstream `8062e761401e49dba55b66f5f8a423d1741343a7`, preserving its separate OrderPro fix. Hotel patch excludes the in-progress auth/payment/inventory/bridge remediation. Final isolated gate log: `/tmp/kiwi-hotel-finish-release-gate.log`.
- This hotel candidate adds no schema migration. The broader audit's three migrations, Shopify worker rollout, native rebuilds and bridge restarts are separate, unperformed operations. Remote schema inspection was unavailable through the schema tool because its required Cloudflare environment settings were absent; the monthly route fails explicitly if the existing reservation ledger is unavailable.

Publication must include only the verified hotel candidate, never the unrelated still-changing audit work. The canonical shared checkout must not be reset or broadly staged to incorporate a release made from the verification checkout. Preserve all concurrent work and reconcile against the published commit before its next release.

## Latest follow-up: dossiers, day-use and pre-invoice allocation

Entry: Reception → open a reservation → **Chambres & facturation du dossier**.

- Add an independently confirmed room to the same dossier, including after the original reservation has left the compact cache. Server resolves the root in the current tenant. A failed room addition does not mutate the original, and cancelling one room does not cancel the others. This is sequential room addition, not an atomic group allotment or room-block booking engine.
- Day-use creation accepts one calendar date, explicit arrival/departure hours in Africa/Casablanca, and an agreed TTC flat amount in centimes. No overnight or season price is guessed. Overlapping room hours are rejected; a later overnight stay can use the room after the day-use interval ends. Same-day stays have zero statistical nights; the monthly production report excludes them. The stay mode is locked after creation; changes remain subject to room availability.
- Staff/public document writers and calendar refresh preserve dossier metadata. Generic whole-document sync cannot erase or forge protected dossier links, day-use times, prices or lodging dates. Existing iCal capabilities remain one-way; no new live OTA adapter was built or activated.
- The private `/api/hotel/billing-draft` route reads the complete D1 dossier, not the compact cache. It derives dated lodging/package lines from accepted rates, preserves exact total centimes, supports proposed dated extras, and splits each line between one or two named payers. Different lines can use different guests, agencies or companies. Cancelled/no-show/requested rooms are visible but do not generate lodging lines; cancellation penalties are not guessed.
- Drafts are tenant-scoped `store_docs` records under `hotel-billing-draft:<dossierId>`, inaccessible through generic store feature sync. A single conditional SQL write checks the exact reservation snapshot, account-directory revision and prior draft revision. Conflicts fail without replacing the prior draft. Lost-response retries preserve the same command; changed-payload reuse is rejected. These are mutable working drafts, not an immutable journal.
- Saved-only A4 pre-invoice printing, payer totals, explicit warnings for unvalidated taxes and unreconciled payments, and disabled finalization. Source/account changes require deliberate review/reset. A reset explicitly replaces the old draft's allocations and proposed extras; it is not an automatic adjustment or credit note.
- UI uses existing upright brand typography, surface/inverse token pairs, responsive cards, labelled controls, visible focus and at least 44px targets. Reservation and draft actions are scoped to the originating hotel.

Verification: 20 real-handler/model commercial tests, 20 stay editing tests, 37 reception behavior tests (including non-overlapping day-use/overnight calendar positions), 17 calendar-sync checks, 60 Chromium commercial/production/billing layout scenarios at 320/390/768/1024/1440px across light/dark/Vexel themes, plus interactive draft-split/retry and day-use editor checks. These synthetic checks do not establish physical-device touch quality, deployment, authenticated merchant acceptance, payment reconciliation, or tax compliance. Hotel follow-up release gate: `/tmp/kiwi-hotel-dossier-release-gate.log`.

### Still not finished or activated

1. Immutable lodging/extra/tax/payment ledger shared with POS and restaurant room charges, receipts/refunds, split settlement, fiscal invoice numbering and credit notes. The new drafts deliberately do not post to the legacy POS ledgers or mark anything paid. Accountant-approved taxes, exemptions, payer rules and expected examples remain unknown, but there is also engineering work left here.
2. Standalone facture libre, automatic account-wide invoicing across unrelated dossiers, and atomic multi-room allotments.
3. Booking.com/Expedia two-way connectivity, mappings, credential provisioning, certified adapter behavior and live acceptance. Booking.com requires authorized property connections and specifies API go-live requirements: [Connections overview](https://developers.booking.com/connectivity/docs/connections-api/connections-overview), [Going live](https://developers.booking.com/connectivity/docs/going_live). A channel manager name and hotel/provider access have not been supplied. No provider enrolment, purchase or real guest mutation was performed.

No new schema migration is required for these draft/dossier features. They use the existing hotel reservation table and `store_docs`; missing/corrupt D1 data fails closed. Do not announce a completed PMS, final invoicing capability, App Store/TestFlight release, or live OTA connection based on this follow-up.
