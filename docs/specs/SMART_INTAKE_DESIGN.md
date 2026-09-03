# Kiwi Smart Intake · design note (before build)

> « Dépose un papier, il se range tout seul. » Status: **PROPOSAL, awaiting owner
> sign-off. No code written.** One-line summary: build a **router and a review
> surface**, not a new extractor. No OCR pipeline, no PaddleOCR (Python, cannot run
> in Workers, returns text/layout where we already have supplier/ICE/amounts in
> French/MAD via `expense-ocr.js`).

## 0 · What already exists (why this is a front door, not a pipeline)

- 24 endpoints under `functions/api/ai/`, shared gateway + primary/fallback pair
  (`_run.js`), per-merchant daily quotas metered into `ai_usage_kind` (`_quota.js`).
- Specialists, all returning validated strict JSON and **posting nothing**:
  `invoice.js` (supplier invoice/BL text → supplier, ICE, lines, total; Qwen3,
  verified on a real invoice 2026-08-19), `expense-ocr.js` (receipt photo →
  supplier, date, amount MAD, category, items, ICE), `invoice-match.js` (3-way
  match, price-drift alert > 5 %), `tpe-reconcile.js` (TPE slip → totals + delta
  vs till, posts nothing), plus `menu-import.js`, `product-scan.js`,
  `reservation-parse.js` (all draft-and-confirm: `menu-import.js` header states
  « RIEN n'est écrit avant que le commerçant confirme »).
- Half of the first slice already ships: `stock.js` scan flow takes a PDF,
  extracts text client-side with vendored pdf.js, calls `/api/ai/invoice`, and
  shows a review screen. Photos currently fall back to manual entry. The intake
  generalises this path; it does not duplicate it.
- House patterns to reuse: `support/attachments.js` (R2 put with
  `cacheControl: 'private, no-store'` + D1 row, R2 delete on DB failure),
  `inventory/movements.js` (`INSERT OR IGNORE` on deterministic ids), caisse
  queue-and-retry/never-drop, `media/index.js` owner-session-only upload gate.

## 1 · V1 document types + the honest "I don't know"

V1 recognises **three** types. Everything else is `unknown`, and `unknown` is a
designed outcome, not an error: « Je ne sais pas ce que c'est » + a manual
picker that deep-links to the existing features (stock scan, dépenses,
réconciliation TPE).

| docType | Route (existing, untouched) | Draft it proposes |
|---|---|---|
| `supplier_invoice` | `invoice.js`, then `invoice-match.js` vs history | supplier, ICE, lines, totals, price-drift flags |
| `expense_receipt` | `expense-ocr.js` | supplier, date, amount MAD, category, items |
| `tpe_slip` | `tpe-reconcile.js` | bank totals + delta vs till (reconciliation input only) |

Deferred with reasons, not forgotten: **quantity-only bons de livraison and
ingredient lists** (confirming them would move stock without cost — that needs
the économat's receipt-against-order flow, §3.4/V1-blended-rate, not a generic
intake; V2), **revenue slips** (§6), **identity documents** (hard reject, §7).

**One call or two: two, sequential.** Call 1 = classification only, on a
downscaled first page / first-page text, `max_tokens` ~200, returning
`{ docType, confidence, reject }`. Below threshold → stop, show `unknown`,
**no extraction call spent**. One combined call risks doing extraction work for
a misrouted doc and returning a confident wrong-shape result; two calls also
give the identity fast path (§7) and keep each prompt short (the invoice-table
drift problem from PP-Structure is fought with shorter, narrower prompts, not
longer ones).

## 2 · Where routing lives: new `intake.js` orchestrator, zero changes to specialists

Decision: a new `functions/api/ai/intake.js` that **classifies, registers the
document, and delegates by calling the existing endpoints over their current
HTTP contract** (same-origin subrequest with the caller's auth forwarded), or —
V1 simplest — returns `{ docType, next: { endpoint, payload } }` and a tiny
shared `assets/intake.js` helper performs the already-existing specialist call,
passing `docId` through so the result attaches to the draft row.

Defence: the tidier alternative (specialists registering into a dispatch layer)
touches six working extractors that serve live merchants today. The routing
table has no proven shape yet; refactor after two document types are live and
the table has stabilised (V2). Cost of this choice: an extra round trip and
double quota metering (see §8) — both acceptable and both honest.

## 3 · Propose, never auto-post (the unbending rule)

Every extraction lands as a **draft row** (`intake_drafts`, keyed by docId)
rendered in a review screen showing: what was read (per-field), what it will
change (stock movements / expense line / supplier price, enumerated, none
applied), and confidence per section. Confirm and Reject are the only exits;
Reject keeps the bytes (business record) but marks the draft `rejected`. There
is **no auto-file path at any confidence** — not behind a flag, not later
without a new sign-off. Confirm reuses the existing write paths (stock
`movements.js`, dépenses ledger) so intake invents no posting logic.

## 4 · Idempotency: content hash, two-phase commit, deterministic ids

- `docId = sha256(fileBytes)`, computed **client-side** (`crypto.subtle`) before
  upload. Tenant-scoped identity `(merchant, docId)`: the same supplier invoice
  received by two merchants is legitimately two documents. (Économat lesson:
  random ids double-move stock on double-tap; `HOTEL_ECONOMAT_PLAN.md` §symptoms.)
- **Two-phase commit**: `POST /api/ai/intake/commit { merchant, sha256, mime,
  size }` → server answers `duplicate` (with the existing draft's date, author,
  status: « déjà déposé le …, statut : brouillon/confirmé ») or a one-time
  upload grant. Bytes upload only on grant — instant duplicate feedback, no
  wasted 16 MB uploads.
- Byte-hash catches exact re-uploads (same file picked twice, same PDF
  forwarded on WhatsApp to two devices). Re-photographed pages differ in bytes;
  perceptual dedup is explicitly out of scope — the review screen showing « un
  document très proche existe » via supplier+total+date match is the V2 answer.

## 5 · Storage: R2 as business record, private, owner-read-only

- `env.MEDIA` under `intake/<merchant>/<docId>.<ext>`, `private, no-store`
  (the `support/attachments.js` recipe, **not** the public menu-media recipe).
  Read-back is owner-session-only (the `media/index.js` gate: session +
  `tenantFor(..., { strict: true })`); never the public `/api/media/<key>` path.
- Retention: an invoice is a *pièce comptable*. Keep it (owner to confirm the
  horizon with their accountant; Moroccan fiscal practice is 10 years for
  accounting documents — this note proposes keeping until merchant deletion,
  purge by R2 prefix + D1 rows on account close). No derived copies server-side;
  previews are rendered client-side from the merchant's own bytes.
- Identity-reject (§7): delete R2 bytes immediately, write no content row.

## 6 · Fail-soft: the upload is never lost because inference failed

Draft status machine: `received → classified → extracted → confirmed|rejected`,
plus `failed-<stage>` carrying a `retryFrom` pointer. Bytes and inference are
separated by the two-phase commit: the R2 object + `received` row exist even if
Workers AI is down or `DAILY_CAPS` is exhausted — the merchant sees « document
conservé, analyse impossible pour l'instant — réessayer », and retry replays
from the last good state, idempotent by docId. Client keeps a per-merchant
namespaced `localStorage` outbox of pending docIds (namespace, don't wipe) so a
dead tab doesn't lose the thread. Quota-exhausted and model-down are distinct,
merchant-readable errors, never silent.

## 7 · Identity documents: hard reject, with a disclosed residual

The classifier prompt carries `identity_rejected` as a first-class verdict
(passport, CIN, *fiche de police*). On verdict: immediate R2 delete, no D1
content row, `422 identity-rejected` to the client. PDFs get an additional
**pre-inference screen**: keyword pre-check on the client-extracted pdf.js text
(`passeport`, `passport`, `CIN`, `بطاقة`) refuses before any byte is uploaded.
Residual risk, disclosed honestly: a *photo* of an ID reaches the classifier
itself (one vision call) before rejection, since content can't be known before
looking. A client-side ID detector is optional V2 hardening. If the hotel needs
*fiche de police* capture, that is a separate project with legal review — this
intake must never become its back door.

## 8 · Quota, money, tenancy, silence (non-negotiables checklist)

- New `DAILY_CAPS.intake` kind for classification; the follow-up specialist call
  meters under its own existing kind. Double metering is honest (two model
  calls happened); caps must be sized for it.
- Every route gated on `tenantFor(request, env, merchant, { strict: true })`.
- **Money is a rate**: pre-build fix flagged — `invoice.js`
  `validateInvoiceData` currently rounds `unitCost` to **2** decimals, while the
  économat requires 4 (`HOTEL_ECONOMAT_PLAN.md`: « ingredient cost off by ~25 %
  ← rounded to 2 »). Separate one-line guarded change with its own test before
  intake goes live.
- Never log or commit document contents, supplier details, or credentials
  (server: no content in logs; client review screen: `esc()` everything, per the
  `modal()` XSS rule).

## 9 · Revenue documents: out of scope for V1

Till sales are authoritative. A paper claiming revenue the till doesn't know is
either a **reconciliation input** (the TPE slip — allowed, because
`tpe-reconcile` only computes a delta and posts nothing) or a **correction**
(off-till revenue claim — delicate, fiscal implications, needs its own design).
V1 builds the reconciliation route only and says no to the correction route.

## 10 · Measurement before engineering (step 0, blocks hardening — not the router)

No measurements exist yet; inventing numbers here would be the exact
plausible-looking corruption §3 exists to prevent. Protocol (demo tenant only,
never live books): owner supplies N real Moroccan supplier invoices + BLs (aim
20+, including at least five 20+ line invoices); run each through `expense-ocr`
(vision) and `invoice.js` (pdf.js text); score supplier/ICE/date/total accuracy
+ line-row completeness. **Two-stage extraction (structure table, then
interpret) is built only if** long invoices show systematic row drops/merges
that a sharper prompt or stronger vision model doesn't fix — that decision gets
its own one-page evidence note. The router + review surface + one slice (§11)
proceed in parallel: they add value even with today's extractors.

## 11 · Build plan (after sign-off): flagged, one slice end to end

- UI entry hidden behind a flag; endpoint live but unlinked; demo tenant first.
- Slice 1: supplier-invoice **PDF** — extend the existing `stock.js` scan path
  (pdf.js → `invoice.js` → review screen) with docId two-phase commit,
  duplicate screen, and the `received→…→confirmed` row. Photos, receipts, and
  TPE follow as slices 2–4.
- New suite `tools/intake-draft-test.mjs` with the three fail-closed guards
  (`async check()` awaited, `unhandledRejection` → non-zero,
  `const EXPECTED = N` asserted), wired into `tools/check.js`; break the
  guarded behaviour once and confirm red. Stamped assets via
  `node tools/bump-stamp.js`. Commits by explicit path, no `-A`.

## Sign-off asked of the owner

1. V1 type list (`supplier_invoice`, `expense_receipt`, `tpe_slip` + honest
   `unknown`)? BL-without-prices and ingredient lists deferred to V2 — agreed?
2. Revenue corrections out of scope V1 — agreed?
3. Retention horizon for stored invoice images (proposal: until account close)?
4. Double quota metering (intake + specialist) acceptable?
5. Residual §7 risk (one classifier call sees an ID photo before rejection)
   acceptable, or require client-side ID pre-screen before V1?
6. Proceed with slice 1 (supplier-invoice PDF on the existing stock.js path)?

## Sign-off recorded 2026-09-03 (owner answers, no code yet at that point)

1. **Approved, build slice 1** — supplier-invoice PDF on the existing stock.js
   scan path, behind a flag, demo tenant first.
2. **Pre-screen REQUIRED before anything ships** (option "Require pre-screen").
   Consequence, sequenced honestly: slice 1 is PDF-only, where the keyword
   screen runs on the client-extracted pdf.js text **before any byte is
   uploaded and before any inference call** — full compliance with zero new
   machinery. Photo slices (receipt, TPE) stay blocked until an on-device ID
   pre-screen exists or entries remain typed-context-only; the classifier
   action (§1, call 1) lands with slice 2's generic dropzone, and `doc_type`
   is recorded from entry context until then.
3. **Agreed on both** — retention until account close (purge R2 prefix + D1
   rows on close); double metering (`intake` kind for registry/classify,
   specialist kind for extraction).

## Slice 1 hardening (review fixes, built — same sign-off, no scope change)

A safety review of the slice found seven truthfulness gaps; all fixed:

1. **Archive is now a verified fact, not a claim.** `intakeDocId` is set only
   after a successful `PUT`, and `mark confirmed` returns `409 not-archived`
   unless `has_object = 1`. An upload failure archives nothing, claims
   nothing, and still lets the merchant work (extraction continues unarchived).
2. **No double stock posting.** Confirm consults a guard *before* any
   `moveStock`: local posted-set OR server `confirmed` (second device) stops
   the write. The posting key is deterministic (`receipt-<docId16>`), and a
   retry outbox (per-merchant `localStorage`, replayed at scan open) retries
   only the *mark*, never the stock write.
3. **Manual fallback keeps the document context** (`intakeDocId` survives the
   extraction-failure path, so an archived doc always reaches `confirmed`).
4. **Server binds bytes to id**: `PUT` recomputes SHA-256 and rejects
   mismatches (`400 hash-mismatch`) before touching R2.
5. **Concurrent commits converge**: `INSERT OR IGNORE` + canonical read —
   loser gets `200 duplicate`, never 503.
6. **`intake_docs` in `schema.sql` + `migrations/2026-09-03-intake-docs.sql`** —
   no runtime-DDL-only drift.
7. **Suite at 22 checks**, including live route execution on in-memory D1/R2
   doubles (happy path, hash mismatch, concurrent commit, R2-down, sealed
   re-upload) and executed client guard/outbox tests.

## Write-layer idempotency (review fix, built — same sign-off, no scope change)

The client guard was advisory: the write layer still minted fresh ids, so a
retry (or a second device) posted again. Corrected at the layer that matters:

- **Deterministic primary keys everywhere**: receipt `grn-intake-<doc16>`,
  invoice `invdoc-intake-<doc16>`, movements `mov-intake-<doc16>-<idx>`,
  supplier `sup-intake-<hash(name)>`, overlay cards `supc-intake-<hash>`.
- **One owner on the intake path**: `stIntakePostAll` (stock.js) writes the
  procurement receipt (upsert), the movements with full meta incl. DLC
  (ledger dedups on id), checkbox-gated costs, and the invoice (upsert).
  Neither `receiveDirect`'s movement loop nor the handler's `moveStock` loop
  runs there. Procurement gained additive-only options (`receiptId`,
  `invoiceId`, `input.id`, `skipMovements`, `skipCosts`) plus upsert reads;
  legacy callers are byte-identical in behavior.
- **No lock, by design**: with every write convergent (local dedup on id +
  server `INSERT OR IGNORE` on movement id), two devices racing `received`
  converge instead of excluding — a lease without an owner would only add
  stuck-`posting` states. The guard stays as a cheap early exit.
- **Rate preserved**: procurement `cleanLine` keeps 4dp like the ledger.
- **Proven by `tools/intake-posting-test.mjs` (9 checks)** on the real
  ledger + real procurement + real route: two devices concurrently, retry
  after kill-before-`postedAdd`, kill-mid-writes — exactly one receipt, one
  invoice, one movement per line, stock incremented once, saffron at 0.0045.
- **Discovered live issue (NOT fixed, owner decision needed)**: the legacy
  (non-flag) scan path calls `receiveDirect` (which posts movements) AND the
  handler `moveStock` loop — two movements per line on every scan confirm
  while procurement is loaded. Fixing it changes live merchants' figures and
  needs a backfill decision, so it stays out of this slice.

## Cross-merchant ids + rate column (review fix, built — same sign-off)

- **Movement ids are merchant-scoped**: `mov-intake-<sha20>-<idx>` with
  `sha = SHA-256(merchant + docId + idx)`, merchant read from the owning
  ledger. `inventory_movements.id` is globally unique, so doc-only ids would
  collide across merchants sharing one supplier PDF. Belt and suspenders:
  the POST route pre-checks `WHERE id IN (…) AND merchant != ?` and rejects
  the batch `409 id-conflict` instead of falsely acknowledging an ignored
  insert. No lock needed — retries and racers converge on identical ids.
- **Rate survives the server**: `unit_cost_rate INTEGER` (×1e-4) alongside
  `unit_cost_cents` (kept for old readers); reads prefer the rate, NULL
  falls back to cents. Migration + `schema.sql` + tolerant `ALTER` in
  `ensureSchema` (prod lags schema). Verified through the real route:
  0.0045 stores as rate 45 / cents 0 and reads back 0.0045.
- **No silent skips**: `stIntakePostAll` throws without an active ledger
  (`K.add` function) and verifies every `K.add` acceptance; a refusal aborts
  the confirm (toast, no close, no mark) and the retry converges.
- **Proven by `tools/intake-posting-test.mjs` (12 checks)**: faults injected
  after receipt creation and after movement 0, cross-merchant same-PDF
  (4 server rows, disjoint), forged foreign-id POST → 409, all against the
  real ledger + real procurement + real intake and movements routes.

## Reviewed-payload arbitration (final retry hardening, same sign-off)

Index-based ids converge only while every retry carries the same reviewed
lines. A re-extraction or merchant correction could otherwise reuse index 0
for a different item after a partial write and silently produce mixed stock.

- Before any receipt or movement write, `stIntakePostAll` hashes one canonical,
  normalized representation of the reviewed supplier/date/lines. The intake
  route atomically pins that SHA-256 plus the expected line count on the
  `received` row. D1 stores no extracted fields or document content.
- Same-hash retries and two-device races converge. A changed or reordered
  review receives `409 posting-conflict` before the posting core writes.
- `K.add` remains local-first, so the posting core now requires `K.sync()` to
  succeed. `mark confirmed` independently counts the matching intake receipt
  movements in D1 and returns `409 not-posted` until every prepared line is
  durable; local state alone can never seal the document.
- `tools/intake-posting-test.mjs` now has 16 executed checks, including a
  changed retry after movement 0, two devices presenting divergent reviews,
  and an offline write that may not confirm until its ledger reaches D1.
  `tools/intake-slice1-test.mjs` has 23 checks, including atomic prepare,
  non-reflection of the fingerprint, and refusal before server rows exist.
- The checkbox-gated flat-cost write now preserves 4-decimal unit rates in
  `cost.js`; rounding to cents remains an output/display concern only.

## Phase 4 boundary (2026-09-03): photos stay closed, expense/TPE unlinked

Identity screening today is genuinely on-device and zero-dependency, but
only where text already exists on-device: keyword hints plus ICAO-9303 MRZ
zone detection (`containsMrzZone` server-side, `stIntakeMrzZone` client-side)
run on pdf.js-extracted text before any upload, model call, or byte leaves
the device. That covers CIN, passports and police sheets for the PDF slice.

Photos cannot be screened with the present architecture, and the requirement
is not weakened to fit:
- Web has no on-device OCR: no Tesseract/ONNX/TF vendored, nothing planned.
- Native shell (Capacitor 8) ships printer, keep-awake, haptics, network and
  status-bar plugins only — no ML Kit / Vision text-recognition plugin, no
  camera plugin (camera runs via WebView `getUserMedia`).
- A filename check or a cloud classifier is explicitly not a pre-screen.
- Receipt and TPE-slip photos therefore have no lawful intake path: the
  commit contract still accepts `application/pdf` only, and no
  `expense_receipt` / `tpe_slip` routing, schemas, quota kinds or type picker
  were built. `expense-ocr.js` and `tpe-reconcile.js` remain directly called,
  human-initiated surfaces — not intake routes.

What would unblock photos: a native on-device text plugin (ML Kit on
Android, Vision `VNRecognizeTextRequest` on iOS) or a vendored OCR engine,
plus real-device testing across the merchant fleet — a native-shell project
of its own, with its own privacy review, not a web-diff follow-up.
