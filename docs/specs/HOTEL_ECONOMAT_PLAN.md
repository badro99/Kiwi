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
- Never mutate a paying merchant to prove a migration. Use a seeded, live-shaped hotel
  tenant in staging; production verification is read-only until the hotel authorises a
  controlled pilot.

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

**Test** `tools/economat-catalogue-test.mjs`
- A case of 12 received, issued as 3 bottles, leaves 9 bottles of central stock.
- A conversion that would lose precision is refused rather than rounded silently.

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
- A change to quantity, timing or product is a **proposal** until the department accepts.
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
4. Resolve the source cost: **the single blended FEFO rate `allocateCost()` already
   returns.** Not per-lot layers · spec §3.4. If it returns `null`, **refuse the
   confirmation** and tell the employee the source has no known cost · spec §3.4.1.
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

## Phase 9 · Direct department transfers

**Goal:** unit-to-unit without Économat approval, same atomic pair, fully auditable.

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
- Folio line records the cashier, already required.
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
