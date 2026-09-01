# Hotel Économat · build plan

**Audience: the agent or engineer implementing `HOTEL_ECONOMAT.md`.**
Read that document first. This one is how to build it without breaking a live product.

Twelve phases. Each is independently testable. Phase 8 is the first point at which stock
may cross units.

**There is no feature-flag system in this repository.** `assets/entitlements.js` is a
subscription paywall (`KiwiSubscription.active()`), not a per-feature gate, and
`pos-dispatch.js` selects a vertical by store type. Do not invent a flag framework for
this project.

**The rollout gate is data.** A hotel with no configured units gets no new behaviour,
because every surface in phases 0 to 7 reads the unit registry and must no-op when it is
empty. That is the gate, and it is testable: *"a merchant with zero units is
byte-identical to today"* belongs in every phase's suite up to 7. Phase 8 is where that
stops being true, which is why it is the phase that needs a named pilot hotel rather than
a flag flip.

**Scope note.** Spec v1.2 is heavier than v1.1: a transactional D1 record set for
requests, lines and fulfilment events, available-to-promise under concurrency control, a
revision protocol, and append-only fulfilment projections. All of it is correctness, none
of it optional, and any estimate carried over from v1.1 is low.
**A later phase must not start until the preceding phase's stock behaviour is verified
against real data.** This is not a style preference: phases 3 to 8 each write to a ledger
that carries live merchant money, and a wrong movement is not a rendering bug.

---

## Before you write a single line

### Read these, in this order

1. `CLAUDE.md` §3 (the rituals that fail silently), §6 (tenant and client-data safety).
2. `docs/specs/HOTEL_ECONOMAT.md` in full.
3. `assets/inventory-ledger.js` · 252 lines · the entire ledger contract. Read all of it.
4. `assets/inventory-consumption.js` · 480 lines · read `movementId()` and `record()`.
5. `functions/api/inventory/movements.js` lines 14 to 40 · the automatic/discretionary
   split and the fraud it closed. Your transfers are discretionary.

**Do not open `assets/pages-pro.js` (13 768 lines) or `assets/venues.js` (~108 k tokens)
speculatively.** Ask the graph instead:

```bash
graphify query "where is the hotel vertical wired into the caisse"
```

### Know the ledger you are extending

`window.KiwiInventory` (`assets/inventory-ledger.js`):

```js
add(movement)            // dedups on movement.id · this IS your idempotency
reverse(movement, reason, note, opts)
ensureOpening(itemId, qty, opts)
balance(itemId, { locationId })
snapshot() · history(itemId) · between(from, to)
sync() · pending() · subscribe(fn)
```

A movement carries `{ id, itemId, variantId, locationId, qty, reason, unitCost,
currency, refType, refId, note, actor, occurredTs, reversalOf, meta, cursor }`.
`qty` is signed. `unitCost` is a **rate** kept at four decimals, deliberately: an
ingredient priced by the gram rounds to zero at two decimals and throws off material
cost by 25 %. Do not round it.

Balances are keyed `itemId|variantId|locationId`. **Multi-location already works.** Your
job in phase 2 is to stop passing `'principal'`, not to build location support.

### The four rituals that will silently eat your work

1. **Asset stamps.** Any edit to a stamped asset needs
   `node tools/bump-stamp.js assets/foo.js`. Never move a stamp by hand: it lives in the
   shell tag, in `kiwi-sw.js`'s SHELL list, and in `pos-dispatch.js`'s REGISTRY `rev` for
   lazily loaded verticals. Bumping some is worse than bumping none.
2. **New test files guard nothing until `tools/check.js` names them.** Add the filename
   to the suite array in the same commit.
3. **`node tools/check.js` is the gate, and it is red before you start.** Other
   workstreams leave failures on `main` · at the time of writing they sit in
   `build-guides-check.mjs`, `article-template-test.mjs` and `stamp-drift-test.js`.
   **Do not copy a number out of this document.** Any count written here is stale within
   the hour: it was 9 when this plan was drafted and 10 an hour later, when another
   session committed a partial stamp bump on `live-link.js`.

   Record your own base instead. Before Phase 0, capture the base commit and its full
   checker output; every phase must then add **zero failures relative to that exact
   base**. Prove any suspected pre-existing failure in a detached worktree at that base
   before chasing it. Time-box known hanging checks and run their focused suites
   separately · a killed checker is not a green checker.
4. **Prod D1 lags `schema.sql`.** Query the live DB before assuming a table or column
   exists.

### Ground rules for every commit

- Stage by explicit path. **Never `git add -A`** · other sessions share this checkout.
- Commit message `<scope> · <what changed>`, e.g. `hotel · transfert atomique Économat`.
- Push `main` to **both** mirrors, by URL, never by remote name:
  `https://github.com/zaka33333-hash/Kiwi.git` and `https://github.com/badro99/Kiwi.git`.
- Never leave anything staged at the end of a turn.
- Icons: vendored Material Symbols from `assets/icons/material/` only. Never hand-draw a
  path, never convert one to a stroke.
- Colours: existing tokens in `assets/tokens.css`. No new accents. Type is roman, never
  italic.
- Gate every real-data path on `KiwiEnv.isReal()`, not on "is this a demo account".
- Never mutate a paying merchant to prove a migration. Use the seeded, live-shaped hotel
  tenant; production verification is read-only until the hotel authorises a controlled
  pilot.

### The seeded tenant already exists · use it

`tools/fixtures/hotel-tenant.mjs` · **built and guarded before Phase 0**, because every
phase's acceptance rests on it.

```js
import { createHotelTenant, UNITS } from './fixtures/hotel-tenant.mjs';
const t = createHotelTenant();          // horodatage fixe, reproductible

t.balanceAt('economat', 'whisky')       // 12 · solde d'UNE unité
t.balanceHotel('whisky')                // 18 · le cumul de l'hôtel
t.consumption.allocateCost('whisky', 12, null, { locationId: 'u-economat' })
                                        // 135.00 · taux mélangé FEFO, économat seul
t.put({ itemId, locationId, qty, reason, unitCost, occurredTs })  // ajouter un mouvement
```

It loads the **real** `inventory-ledger.js` and `inventory-consumption.js` through the
real identity path (`KiwiEnv.isReal()` then `KiwiCloudDoc.currentSlug()`), so a test
exercises the product rather than a mock of it.

Five units (one Économat, three outlets, one department), each with an immutable
`locationId`. Seeded deliberately for the cases the spec argues about: whisky in **two
lots at different costs and expiries** so the blended FEFO rate is a real blend; the same
whisky held by the rooftop bar **at a different cost**, which is how §3.4.2's
cross-location boundary is demonstrable · the same fixture that exposed the blending
bug now proves it is closed; and `verrerie` with **no known cost**, so §3.4.1's
refusal can be tested at all.

Two properties matter and are asserted in `tools/hotel-seed-test.mjs`: **the fixture has
no network** (`fetch` rejects) and **no live timers** (the ledger's background sync would
otherwise hang the suite and try to POST the seeded movements to
`/api/inventory/movements`).

---

## Pre-pilot checklist · before units are enabled on a live hotel

**Read this before creating a single unit on a real merchant.** Everything below is
harmless today only because the live hotel has no registry: with `units.length === 0` the
resolver returns `scoped: false` and nothing changes for anyone. Writing the first
registry is the moment that stops being true, and both hazards here fail **silently**.

There are twelve merchants in production and exactly one hotel. It is a real business, so
this is a one-shot first impression.

- [ ] **Every caisse terminal is mapped in `terminalUnits` in the same write that creates
      `units`.** A paired till whose terminal id is absent from the map resolves to
      `allowed: false` and gets **403 on every inventory read and write**. There is no
      management screen — Phase 0 deliberately shipped none — so the map is written by
      hand. Create units and terminal mappings in one document, never units first.
- [ ] **Collect the terminal ids before you start.** Each till mints its own on pairing,
      as `term_<uuid>` in `localStorage['kiwi:caisse:terminal-id:v1']`
      (`assets/caisse-pairing.js`). A till that has never paired has no id, and therefore
      cannot be mapped or scoped.
- [ ] **Confirm the failure mode is understood before you flip anything.** A denied till
      does not lose data and does not stop selling: `sync()` throws before the queue is
      filtered, so movements stay queued and the caisse keeps trading. It simply never
      syncs, and nobody is told. That is a good failure, but it is invisible — you will
      not notice it from the floor, only from the dashboard's stock going quiet.
- [ ] **Verify on the seeded tenant first**, never by writing a registry to the live
      hotel to see what happens.
- [ ] **No unit that still holds stock is deactivated** until Phase 3 defines
      inactive-unit semantics · see that phase. Drain it first.

**Two things not to do as a shortcut**, both of which look like kindnesses and are not:

- **Never auto-assign an unmapped terminal to a unit.** Guessing which outlet a till
  belongs to is the whole security boundary of Phase 1, given away for convenience. A
  wrong guess posts one outlet's sales against another's stock, silently and durably.
- **Never expose inactive locations just to make stock reappear.** Read and write have
  different answers there; settle them in Phase 3 rather than widening a scope to clear a
  symptom.

---

## Phase 0 · Hotel hierarchy

**Goal:** a Hotel venue can own child units. Nothing else changes.

**Build**
- A unit registry per hotel: `{ id, name, kind: 'outlet' | 'department' | 'economat',
  storeType, locationId, active }`. Exactly one unit per hotel has `kind: 'economat'`.
- `locationId` is the stable key that will appear on every future movement. Assign it
  once, never reuse it, never derive it from a display name.
- Store as a new `store_docs` feature in the FEATURES registry of
  `functions/api/store.js`, following the existing entries.
- Child units keep their existing store type behaviour untouched.
- A hotel is one merchant tenant. Units never become independent merchant slugs.
- Once referenced, a unit can only be deactivated; `locationId` is never deleted or reused.

**Do not** add stock, requests, catalogues or UI beyond listing and creating units.

**Test** `tools/hotel-units-test.mjs`
- A hotel accepts outlets and departments; exactly one Économat is enforced.
- A `locationId` is immutable once assigned.
- An existing non-hotel venue is completely unaffected.

**Acceptance:** on the seeded hotel tenant, a merchant with zero configured units is
byte-identical to today · loads, sells and prints unchanged. Verification against a
paying merchant is **read-only observation only**: compare rendered totals and reports,
write nothing, create no unit, and post no movement.

---

## Phase 1 · Server-side unit scoping

**This phase is the security boundary. It is the one phase that can leak merchant data.**

**Goal:** the caller's permitted unit set is resolved on the server, and a request naming
a unit outside it is rejected.

**Build**
- Extend the identity resolution used by `tenantFor()` so that a session or paired till
  resolves to `{ merchant, unitIds[] }`.
- Every stock read and write validates `locationId ∈ unitIds`. **Reject, do not filter** ·
  a filtered response teaches the caller which ids exist.
- Writes use `tenantFor(request, env, merchant, { strict: true })`, as
  `functions/api/inventory/movements.js` already does.
- Transfers are **discretionary** reasons. They are never added to `AUTOMATIC_REASONS`.

**The blocker you will hit, and must not solve the easy way.**

Read `functions/api/inventory/movements.js:209`. Any discretionary movement currently
requires `entitledMerchant(request, env, merchant)` **without `allowTill`** · owner
session or named operator. A paired till cannot post one.

That breaks this project on day one: the whole premise is that a department employee
confirms receipt **at the counter, on a till**. Under today's rule only the owner could
confirm a transfer.

The easy fix is to add `allowTill` or to put transfers in `AUTOMATIC_REASONS`. **Both
re-open the exact fraud the comment at line 17 describes** · a cashier moving bottles and
posting the paperwork under someone else's name.

Build the bounded third level instead, per spec §2.1:

```
transfer-in / transfer-out are accepted from a unit-scoped identity IF AND ONLY IF
  · the caller has a confirmed role in that unit, AND
  · the movement's locationId is that unit, AND
  · an approved request or direct-transfer record authorises it, AND
  · the quantity does not exceed what that record approved.
Otherwise → 403.
```

A transfer with no authorising record is refused. That last clause is what keeps the new
level from degenerating into "a till may post anything".

Good news while you are in this file: `transfer-out` and `transfer-in` are **already in
the server's `REASONS` set**, and the insert is `INSERT OR IGNORE` on the movement id, so
server-side idempotency is already done. You are adding authority, not plumbing.

**The other trap:** a till changes merchant by pairing, with nobody signing in. A guard
keyed on the logged-in account misses that path. Test the paired-till path explicitly.

At this phase, a paired till still cannot post a transfer. The bounded transfer authority
depends on request and transfer records introduced in Phases 5 and 8. Build the unit-scope
resolver and deny-by-default hook now; activate transfer confirmation only in Phase 8.

**Test** `tools/hotel-unit-scope-test.mjs`
- A paired till for the Rooftop Bar reading Économat balances gets a rejection.
- The same till posting a movement with the Économat's `locationId` gets a rejection.
- A hotel manager session reads every unit.
- A payload-supplied `unitId` never widens the permitted set.
- A non-hotel merchant is unaffected.
- A till posting any transfer before Phase 8's authorising command · **403**.
- The same till posts `loss` or `gift` · still **403**, owner-only, unchanged.
- A paired device without a currently authenticated, unit-assigned employee cannot make
  any discretionary stock change.

**Acceptance:** every assertion above passes against the live-shaped route, not a mock.

---

## Phase 2 · Per-unit inventory locations

**Goal:** movements carry the real unit instead of `'principal'`.

**Build**
- Sales consumption writes the selling outlet's `locationId`
  (`assets/inventory-consumption.js`).
- Counts, receipts and adjustments carry their unit.
- **Migration:** existing movements keep `'principal'`. Map the hotel's pre-existing
  single location onto the Économat's `locationId` by mapping, not by rewriting history.
  `inventory_movements` is append-only · do not UPDATE it.

**Test** `tools/hotel-location-attribution-test.mjs`
- A sale in the bar decrements the bar's balance, not the hotel's aggregate.
- Consolidated hotel inventory equals the sum of unit balances.
- Pre-existing `'principal'` rows still resolve after the mapping.

**Acceptance:** on the seeded tenant, totals before and after the location mapping are
identical. The migration is **never run against a paying merchant to prove it works** ·
it is proven on the seed, then applied once the hotel authorises it. Reading a real
merchant's totals to compare is fine; writing to one is not.

---

## Phase 3 · Économat catalogue

**Goal:** the central catalogue with purchase, issue and consumption units.

**Build**
- Central catalogue entries reference existing stock items. Do not fork the item model.
- Units of measure via `assets/restaurant-units.js`: purchase unit (case of 12), issue
  unit (bottle), consumption unit (4 cl), with conversions.
- The ledger stores the base unit. The UI shows the unit the user is thinking in.

### Also in Phase 3 · define what an inactive unit means for stock

**Deactivating a unit currently strands its stock, and this must be settled before any
hotel retires a unit for real.**

Found reviewing Phase 1. `activeUnits()` in `functions/api/inventory/_unit-scope.js`
filters out inactive units before any scope is built, so a deactivated outlet's
`locationId` belongs to nobody's `locationIds` — **not even the hotel manager's**. Its
balances drop out of the summary and `permitsLocation()` refuses that location to every
caller.

Phase 0 makes deactivation the only alternative to deletion. So today, "retire this bar"
silently means "lose sight of whatever stock it held", and Phase 8 will not be able to
transfer that stock out either, because the source location is forbidden to everyone.

**Do not fix this by simply exposing inactive locations.** Read and write are not the
same question and must be answered separately:

- **Read.** A manager almost certainly should see an inactive unit's remaining balance ·
  otherwise stock disappears from the hotel's consolidated inventory, which is a
  reporting lie. Decide whether outlets see it too (probably not).
- **Write.** An inactive unit must not accept `transfer-in`, or deactivation means
  nothing. But it has to permit **draining**: a `transfer-out` to another unit, so the
  stock can be recovered before the unit is closed for good.
- **Sales** at an inactive unit stay refused, unconditionally.

The likely shape is a manager-only read scope that includes inactive units, plus a
one-directional write permit for draining. Write the semantics down before the code.

Until this phase lands, treat "deactivate a unit that still holds stock" as unsupported,
and drain it first.

**Test** `tools/economat-catalogue-test.mjs`
- A case of 12 received, issued as 3 bottles, leaves 9 bottles of central stock.
- A conversion that would lose precision is refused rather than rounded silently.
- A deactivated unit's balance is still visible to a manager and to nobody else.
- A deactivated unit refuses `transfer-in` and refuses sales, but permits `transfer-out`
  so its stock can be drained.

---

## Phase 4 · Department catalogues

**Goal:** each unit exposes only manager-approved items.

**Build**
- Per-unit approved list: visibility, counting unit and packaging, counting frequency,
  active/inactive, recipe use. **Par level and reorder trigger are V2** · leave the
  fields out entirely rather than shipping dead UI.
- Adding an item requires a department-manager or hotel-manager identity. An outlet
  employee cannot expand their own catalogue because an item exists centrally.
- An item must exist in the Économat catalogue to enter a department catalogue.

**Test** `tools/department-catalogue-test.mjs`
- The bartender cannot see or request passion-fruit juice before the F&B manager adds it.
- After the manager adds it, the bar can count and request it.
- An outlet employee attempting the add is refused server-side, not merely hidden.

---

## Phase 5 · Requests · create and submit

**Goal:** a department drafts and submits a request. **No stock moves.**

**Build the line model from `HOTEL_ECONOMAT.md` §5.1 exactly:**

```
line: { itemId, unit, conversionSnapshot, qtyRequestedBase,
        qtyRequested, qtyApproved, qtyPrepared, qtyReceived,
        resolution, substituteFor, note }
```

Stored request states are **`draft` | `open` | `closed`** plus a `cancelled` flag.
**Every user-facing label is derived from the lines.** Do not add a status enum column.
If you find yourself writing a state-transition table, stop · you have re-introduced the
bug this model exists to prevent.

Use transactional D1 request/line/event records with `revision` and command idempotency
keys. Do not put concurrent requests in one `store_docs` document. Derive received state
line-by-line in base units; never sum kilograms, bottles and cartons together.

**Test** `tools/internal-request-test.mjs`
- Submitting writes zero movements. Assert the ledger row count is unchanged.
- Derived labels match the table in §5.1 for each quantity combination.
- Drafts survive a reload.
- Two reviewers editing the same revision: one succeeds, the stale writer receives `409`.
- A later unit-conversion edit does not change an open request's base quantity.

---

## Phase 6 · Économat review

**Goal:** approve, reduce, refuse, with a reason. **Still no stock movement.**

**Build**
- Per line: `qtyApproved` and a `resolution`. `qtyApproved = 0` is a refusal.
- Reasons per §5.2. "Supplier delivery expected" is a **free-text note in V1** · do not
  link it to `assets/procurement.js` yet, that is V2.
- **Substitutions are V2.** In V1, refuse the line; the department raises a new request.
  `substitute_for` remains a reserved migration column but is always empty and is rejected
  by the V1 command surface.
- A change to quantity, timing or product is a **proposal** until the department accepts.
- Re-review after acceptance is allowed while the request is open and cannot reduce below
  preparation or receipt already recorded. It advances `reviewRevision` and deliberately
  leaves `acceptedRevision` behind until the department accepts again.
- Approval checks source **available to promise** in the same server transaction and
  refuses over-commitment caused by a concurrent approval.

**Test** `tools/economat-review-test.mjs`
- A reduced quantity stays a proposal until accepted; the ledger stays untouched.
- A refused line remains visible as refused, never silently received.
- Two requests cannot both commit the same remaining central quantity.

---

## Phase 7 · Preparation and handover

**Goal:** record who prepared, who handed over, pickup or delivery, times, notes.
**Still no stock movement** · see spec §3.3, the Économat holds stock in transit.

Record partial actions as append-only fulfilment events. Project cumulative quantities
from events; do not overwrite the actor and timestamp of an earlier partial handover.
V1 keeps the shipped action set compact: `prepare` carries `fulfilmentMethod` and a
`handover` marker. A dedicated handover action would duplicate the same monotonic
quantity and create two competing projections.

**Test** `tools/economat-handover-test.mjs`
- Handover recorded, ledger unchanged, Économat balance still holds the goods.
- Three partial handovers preserve three actors, quantities and timestamps.

---

## Phase 8 · Atomic transfer · the heart of the project

**Goal:** confirmation writes one linked, atomic, idempotent movement pair.

**Build**

Create one authenticated server command such as
`POST /api/hotel/transfers/:id/confirm`.

**D1 has no interactive transaction · there is no `BEGIN` spanning awaits.** The atomic
primitive is `env.DB.batch()` (already used in `functions/api/booking.js`,
`functions/api/store.js`, `functions/api/hotel/stays.js`). `batch()` binds every value up
front, so **no statement in a batch can read a value returned by an earlier one.**

That rules out copying the existing writer's shape: `functions/api/inventory/movements.js`
calls `nextCursor()` once per movement inside a loop, and `nextCursor()` is itself a
read-modify-write. Build it in two steps instead:

**Step A · validate and resolve (before the batch)**
1. Resolve merchant, employee and permitted units from the request identity.
2. Load the exact approved request revision and the hotel's confirmation policy.
3. Refuse excess quantity, stale revision (`409`), wrong side, or missing source approval.
4. Resolve the source cost: **the single blended FEFO rate**, scoped to the source
   location. Not per-lot layers · spec §3.4. If it resolves to `null`, **refuse the
   confirmation** and tell the employee the source has no known cost · spec §3.4.1.

   **`allocateCost()` already does this · spec §3.4.2, landed in Phase 2** (`7d59fd6b`).
   It was not location-aware when this plan was written, and the fix was scheduled here.
   It moved forward because `record()` calls `allocateCost()` on every sale, so Phase 2's
   per-unit locations activated the bug immediately. Pass `{ locationId }` and trust the
   answer · including the `null`. Nothing to build at this step.
5. **Reserve the cursor range in one statement:**
   `UPDATE inventory_sync_sequences SET last_ts = last_ts + N WHERE merchant = ?
   RETURNING last_ts`, with `N` = the number of movements. Derive each `srv_ts` from the
   returned range. A gap in the sequence on a fully-ignored replay is expected and
   harmless · `srv_ts` is a sync cursor, not a counter anyone reconciles.

**Step B · one `DB.batch()`**
6. The prepared `transfer-out` / `transfer-in` inserts (deterministic ids,
   `INSERT OR IGNORE`), the request update, and the confirmation event. All commit, or
   none do.

The browser mirrors the acknowledged server result into `KiwiInventory`; it never makes
two independent `KiwiInventory.add()` calls and calls that atomic.

Four rules, each of which has a test:

1. **Deterministic ids, enforced server-side.** The id derives from
   `(merchant, transferRef, lineIndex, itemId, direction)` and the insert is
   `INSERT OR IGNORE`, exactly as `movements.js` already writes. `KiwiInventory.add()`'s
   own duplicate check is a client cache guard, **not** the guarantee. Do not invent a
   third mechanism.
2. **Never one side alone.** A decrease without its matching increase is the failure mode
   that makes stock vanish between departments. Both or neither, enforced by the batch
   rather than by client sequencing.
3. **Real cost, always.** `unitCost` is the source's blended FEFO rate. **0 MAD is a
   display choice and never a stored value** (spec §3.1), and **a null cost refuses the
   confirmation** rather than writing an uncosted movement (spec §3.4.1).
4. **Single-side confirmation.** The hotel setting picks recipient or Économat. Only that
   side gets the action. The other side can view and dispute, never confirm again.
   `dispute` is a separate non-ledger command that writes the existing `disputed` field.

**Test** `tools/hotel-transfer-test.mjs` · the most important suite in this project
- Confirmation writes exactly two movements sharing one `refId`.
- Confirming twice writes nothing the second time and leaves balances unchanged.
- The non-authorised side is refused server-side.
- A partial confirmation moves only the confirmed quantity; the remainder stays open.
- The sum of both balances is unchanged by the transfer.
- The stored `unit_cost_cents` is the source's blended rate and is never zero.
- An item whose source cost resolves to `null` refuses confirmation and writes no
  movement · assert the ledger row count is unchanged and the request stays open.
- Two movements drawn across several lots produce **one** pair at the blended rate, not
  one pair per lot.
- An offline replay of the same confirmation is a no-op.
- Cursor reservation: `N` movements consume exactly `N` cursor values, and a replay that
  inserts nothing still leaves every prior cursor readable in order.
- Force the second movement insert to fail; assert the first movement, request update and
  confirmation event all roll back.
- A stale request revision returns `409` and writes no movement.
- A paired till with no active employee identity returns `403`.
- Approval exists but source balance has since changed: confirmation refuses or moves
  only a newly accepted reduced quantity; it never silently creates negative stock.

**Offline rule:** the action may queue as "awaiting sync", but balances do not change
until server acknowledgement. V1 does not issue offline transfer authority.

**Acceptance:** run it against a seeded two-location merchant and assert the ledger, not
the UI.

---

## Discovery D · blocking gate before any Phase 9 build

**Phase 9 is not authorised.** Phases 0–8 prove the backend contract against fixtures;
they do not prove that the contract matches the hotel's paper workflow. Before another
backend phase, run a disposable, non-writing four-step prototype with the actual staff on
their own phones:

1. A department creates a request.
2. The Économat reduces, refuses or proposes an alternative.
3. A storekeeper prepares it.
4. A receiver confirms quantities and records a discrepancy.

Run five scenarios: routine request, partial fulfilment, substitution, urgent after-hours
request and disputed handover. Observe without coaching. Record the words staff use for
locations, requisitions and the Économat; who really approves; whether WhatsApp remains in
the loop; when they believe stock moved; and whether the audit record matches the physical
handover. Time the last three paper *bons de sortie*, ask the trolley custody question from
§3.3, and count crossed-out substitutions on 30 days of slips.

**Discovery exits only when both are true:** staff complete the workflow without coaching,
and the resulting audit record matches what physically happened. "They like it" is not an
exit criterion.

### Commercial success must be classified before Phase 9

Record a baseline and a 30-day pilot target for all five measures:

| Measure | Baseline | Pilot target | Evidence source |
|---|---:|---:|---|
| Internal requests per week | pending discovery | set after slip count | Kiwi events vs paper slips |
| Median request-to-handover time | pending discovery | set after timing | request/event timestamps |
| Substitution and discrepancy frequency | pending discovery | set after 30-day sample | crossed-out slips and Kiwi events |
| Stock variance or write-off reduction | pending discovery | owner decision | counts and append-only corrections |
| Share handled in Kiwi instead of WhatsApp | pending discovery | owner decision | staff observation and request events |

The evidence must choose the product: low volume with required paper signatures supports a
lightweight requisition overlay; frequent requests with material variance support the full
Économat platform. Do not choose the answer before measuring it.

---

## Phase 9 · Direct department transfers · blocked by Discovery D

**Goal:** unit-to-unit without Économat approval, same atomic pair, fully auditable.

**Custody gate:** Phase 9 does not introduce dispatch or virtual transit by accident.
Discovery D must first establish whether staff recognise a real custody interval.
Until then, prepared stock remains at the source and receipt writes the existing atomic
pair. If the interval is proven, implement the four-state contract in spec §3.3 with
`transit:<request-id>`; otherwise keep confirmation-only custody.

**Build:** reuse phase 8's writer unchanged. Only the approval path differs. The source
unit's authorised manager approves, and the cost is **the source unit's own blended FEFO
rate**, not the Économat's and not a catalogue price. A null source cost refuses the
transfer here too. A return to the Économat uses the same path with source and
destination reversed.

**Test** `tools/direct-transfer-test.mjs`
- Rooftop Bar ← Lobby Bar produces the same movement pair shape.
- The transfer appears in the hotel audit trail.
- It cannot be performed as an undocumented manual adjustment.
- Cancelling a received request does not erase stock; a return creates a new linked pair.

---

## Phase 10 · Room charges

**Goal:** the §8 ordering fix plus the compensating report.

**Build**
- Reorder the caisse flow: **ask for the name before revealing it.** The screen must not
  display the guest name until the cashier has confirmed they asked.
- The current server folio records only room, nights and update time; it has no
  charge lines or cashier identity. The room-charge writer must therefore freeze
  the stable cashier id, outlet and shift when the linked sale is recorded.
- **New:** a per-shift report of room charges grouped by cashier.
- Reversing an outlet transaction reverses its linked folio charge exactly once.

**Test** `tools/room-charge-test.mjs`
- The guest name is not in the DOM before the cashier's confirm step.
- A reversal reverses the folio charge exactly once, and twice is a no-op.
- The per-shift report totals match the folio lines.

**Note for the UI:** do not print a guest name, room number or any four-digit code into
logs or toasts. Treat them as credentials.

---

## Phase 11 · Reports

**Goal:** Économat, department and hotel management views over what phases 0 to 10 record.

**Build only what the V1 data supports.** No par levels, no replenishment suggestions,
no theoretical-versus-counted variance workflow · those are V2 and their reports would be
empty or, worse, plausible and wrong.

- Économat: central inventory, pending and urgent requests, awaiting review, prepared
  awaiting pickup or delivery, transfers awaiting confirmation, consumption by department,
  most requested and unavailable items, partial-fulfilment history, discrepancies.
- Department: current inventory, received transfers, open and historical requests,
  theoretical consumption from sales and recipes, counts and variances, inventory value.
- Hotel management: consolidated inventory, inventory by department, transfer history
  including direct transfers, consumption and cost by department, outlet revenue and
  material cost, outstanding room charges by outlet, user audit trail.

**Test** `tools/hotel-reports-test.mjs`
- Consolidated inventory equals the sum of unit balances at any instant.
- For each unit, `opening + receipts + transfers in - transfers out - consumption ±
  posted corrections = closing`.
- A physical count alone changes nothing; only its linked variance correction enters the
  reconciliation.

---

## Definition of done, per phase

A phase is done when **all** of these hold:

- [ ] The phase's own test suite exists **and is named in `tools/check.js`**.
- [ ] The suite **cannot pass silently.** Three guards, all three required · a suite that
      reports green while asserting nothing is worse than no suite, and one shipped in
      this project already (the Phase 3 harness declared `check(name, fn)` synchronous and
      threw away every async callback's promise · two assertions never ran, and it printed
      green):
      - `check()` is `async` and every call site **awaits** it.
      - `process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); })`
        at the top of the file, so a dropped promise fails the run instead of vanishing.
      - `const EXPECTED = N;` and `assert.equal(checks, EXPECTED)` at the end, so a check
        that stops executing is a failure rather than a smaller number nobody reads.
      Prove it once: break the code the suite guards and confirm it actually goes red.
- [ ] Focused suites pass and `node tools/check.js` adds zero failures relative to the
      recorded base commit; any timed-out phase is reported, never called green.
- [ ] Every edited stamped asset went through `node tools/bump-stamp.js`.
- [ ] Nothing is staged; `git status` is clean.
- [ ] `main` is pushed to **both** mirrors when the user authorises release.
- [ ] No credential, PIN, guest name or room number is logged, printed or committed.
- [ ] For phases 2, 8 and 9: balances were verified on a seeded two-location merchant by
      reading the ledger, not the UI.
- [ ] No paying merchant was mutated for validation.

## Things that will go wrong, and what they look like

| Symptom | Cause |
|---|---|
| Your fix does not appear, console is clean, page is 200 | A stamp was not moved. `node tools/bump-stamp.js` |
| Stock quietly vanishes between two units | One side of a transfer pair written without the other |
| Food cost drops after go-live | A transfer stored `unitCost: 0`. Never store the display value |
| Ingredient cost off by ~25 % | `unitCost` rounded to 2 decimals. It is a rate, keep 4 |
| A double-tap moves stock twice | You generated a random movement id instead of a deterministic one |
| An outlet iPad reads the Économat | Scoping done in the browser instead of server-side |
| Status and quantities disagree | You added a status enum column. Derive it from lines |
| `batch()` inserts bind `undefined` as a cursor | You tried to read `nextCursor()`'s return inside the batch. Reserve the range first (§5.4.1) |
| Phase 8 balloons into a lot-tracking project | You read "cost layers" and built per-lot pairs. V1 is one blended FEFO rate (§3.4) |
| A `transfer-in` lands with a null cost | `allocateCost()` returned `null`. Refuse the confirmation, do not store it (§3.4.1) |
| A transfer confirms while the till is offline | You mirrored the client ledger instead of waiting for the server ack |
| `git push` hangs, prints nothing, no CPU | You are in `/Users/zaka/Desktop/kiwi`. Work in `/Users/zaka/Developer/kiwi` |

## What not to build

Substitutions · par levels and target stock · replenishment drafts · automatic submission ·
the guided end-of-shift variance flow · purchase-order linkage for delayed lines ·
multiple Économats · beverage cellars and cold rooms as sub-locations · approval
thresholds by quantity or value.

All of these are V2 in `HOTEL_ECONOMAT.md` §9. Building them early doubles the state space
and delays the only thing a hotel is actually waiting for, which is a request that ends in
a transfer that ties out.
