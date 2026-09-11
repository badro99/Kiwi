# Kiwi Hotel · Économat, outlets and internal stock

**Version 1.2 · supersedes the 1.0 requirements PDF of 31 August 2026.**
Status: ready for implementation. Build order lives in `HOTEL_ECONOMAT_PLAN.md`.

Version 1.0 was operationally sound and technically over-scoped. This revision keeps
its operating model intact and changes five things: it cuts the V1 boundary, replaces
the status enum with a quantity model, promotes tenancy to a blocking prerequisite,
reverses the room-charge identity check, and names what Kiwi already ships so nobody
rebuilds it. Version 1.2 closes the remaining execution gaps: one canonical hotel
tenant, server-atomic transfer pairs, revision-safe approvals, base-unit quantity
invariants, append-only fulfilment events and explicit offline semantics.

**V1.2 is more work than V1.1, not the same work described better.** It adds a
transactional D1 record set for requests, lines and fulfilment events, an
available-to-promise check under concurrency control, a revision protocol, and
append-only fulfilment projections. Each is correctness rather than feature: without
them you get double allocation and lost updates. But the V1 list grew from eleven items
to twelve while several items got heavier, so any estimate built on V1.1 is low. The one
thing V1.2 does **not** add is per-lot cost layers · see §3.4.

---

## 0. What already exists · do not rebuild any of this

The 1.0 document reads as if starting from zero. Roughly a third of its hardest
requirements are shipped and carrying live merchant data. Rebuilding them is the most
expensive mistake available on this project.

| 1.0 section | Already in Kiwi | Where |
|---|---|---|
| §8 immediate recipe consumption | Done, including nested recipes and modifiers | `assets/inventory-consumption.js` |
| §8 idempotent consumption | Done · movement id is `hash(merchant, ref, lineIndex, itemId, part)`; `add()` drops a duplicate id | `inventory-consumption.js:251`, `inventory-ledger.js:128` |
| §13 append-only history | Done · `reversal_of` column, "correction append-only, jamais DELETE" | `schema.sql`, `inventory_movements` |
| §13 reversals not deletions | Done · `KiwiInventory.reverse()` | `assets/inventory-ledger.js:224` |
| §3 real cost retained per movement | Done · `unit_cost_cents`, rate kept at 4 decimals so gram-priced ingredients do not round to zero | `inventory-ledger.js:105` |
| §2.3 per-location balances | **Done and unused** · balances are keyed `itemId\|variantId\|locationId` | `inventory-ledger.js:71` |
| §10 physical counts and variance | Done | `inventory_counts`, `inventory_count_events`, `assets/pos-inventory-count.js` |
| §14 supplier and purchase side | Exists · suppliers, orders, receipts, invoices, 3-way match | `assets/procurement.js`, `store_docs` feature `procurement` |
| §11 folios and room charge | Exists for the hotel vertical | `assets/hotel.js`, `assets/pos-hotel.js` |
| Units of measure | Exists | `assets/restaurant-units.js` |

**The single most important line in this table:** `location_id` is already on every
movement, already defaulted to `'principal'`, and already part of the balance key. The
ledger was built for multi-location and has never been fed anything but one location.

Likewise `transfer-out` and `transfer-in` are **already accepted** by the server's
`REASONS` set in `functions/api/inventory/movements.js`, and the write is
`INSERT OR IGNORE` on the movement id, so idempotency is already enforced server-side.
No client has ever emitted one. The plumbing exists; the workflow and the authority to
use it do not. See §2.1.

This project is therefore not "build an économat". It is **"give the existing ledger a
second location, and put an approval workflow in front of the movements that cross
between them."**

---

## 1. Objective

Unchanged from 1.0. A hotel is a parent organisation containing revenue outlets
(restaurant, bar, cafeteria, spa, boutique) and operational departments (housekeeping,
administration, maintenance), which share guests, management and central purchasing
while holding separate inventories.

Existing Kiwi store types are reused as-is under the Hotel parent. A restaurant added
under a hotel is the restaurant vertical, unchanged. This project connects units; it
does not re-implement them.

---

## 2. Prerequisite · unit scoping is phase zero, not a step

**This is the change most likely to be skipped, and the only one that can leak a
merchant's data.**

Kiwi has no parent/child venue concept today. `assets/venues.js` and
`assets/platform-kernel.js` contain zero references to a parent venue, sub-venue or
child unit. One merchant is one venue is one caisse pairing.

Two facts make the naive version dangerous:

1. **A till can change merchant by pairing, with nobody signing in.** Any guard keyed
   on the logged-in account misses that path entirely.
2. **`tenantFor()` accepts a paired till cookie.** The repository already learned this
   the hard way. From `functions/api/inventory/movements.js`:

   > `tenantFor` accepte un simple cookie de caisse, donc un caissier pouvait sortir
   > des bouteilles et poster la perte correspondante au nom d'un collègue.

   The fix already in place is the right precedent for this project: movement reasons
   are split into **automatic** (`sale`, `sale-reversal`, `production-*`, written by
   the till itself and never gated) and **discretionary** (everything else, requiring
   an authorised identity). Transfers are discretionary.

### 2.1 An unresolved conflict this project must settle

The server already accepts `transfer-out` and `transfer-in` in its `REASONS` set, and
`INSERT OR IGNORE` on the movement id already makes writes idempotent end to end. The
client has simply never emitted them. That is the good news.

The conflict is in the authority. Today, any discretionary movement requires
`entitledMerchant(request, env, merchant)` **without `allowTill`**, that is the owner
session or a named operator. A paired till cannot post one at all.

That rule is correct for a loss or a gift. It is incompatible with this project, whose
whole premise is that **a department employee confirms receipt at the counter, on a
till.** Under today's rule only the hotel owner could ever confirm a transfer, which
makes the feature unusable.

So V1 must introduce a third authority level, and it is the most security-sensitive
decision in the project:

- **Automatic** · the till writes freely (sales, production). Unchanged.
- **Unit-scoped discretionary** · new. A till or session with a confirmed role in a
  specific unit may write `transfer-in` / `transfer-out` **for that unit only**, against
  an existing approved request or direct transfer, and only for the quantity that
  request authorises.
- **Owner discretionary** · loss, gift, expiry, manual adjustment. Unchanged, still
  owner or named operator.

The middle level must never become "a till may post any movement". It is bounded by an
existing request or transfer record, by the unit, and by the approved quantity. A
transfer with no matching authorising record is refused. This is what stops the feature
from reopening the exact hole the automatic/discretionary split was built to close.

### The rule

Unit scoping is enforced **server-side, against the identity on the request**, never in
the browser and never by trusting a `unitId` in the payload. Concretely:

- Every stock read and write resolves the caller's permitted unit set server-side.
- A request naming a `locationId` outside that set is rejected, not filtered.
- The Rooftop Bar's paired iPad must not be able to read the Économat's balances.

Phase 0 ships this with tests before any request workflow is written. If phase 0 slips,
everything after it waits.

### 2.2 One tenant, many units

A hotel remains **one merchant tenant**. A unit is not a second merchant slug and does
not receive an independent owner account, catalogue namespace or inventory ledger.
Existing restaurant, bar, spa and boutique behaviour is selected by the unit's
`storeType`, while every shared record remains keyed by the hotel merchant plus a stable
`unitId` / `locationId`.

This avoids cross-merchant joins for stock, guests and reporting, and makes the hotel
manager's aggregate a scoped view of one tenant rather than a privileged query across
several tenants. A unit may be deactivated but never hard-deleted once it has a movement,
request, folio line or sale. Its `locationId` is immutable and never reused.

**Deactivation is not yet a complete answer, and V1 must finish it.** As shipped in
Phase 1, an inactive unit leaves every scope, so its remaining balance becomes invisible
to the hotel manager and its location is refused to every caller · stock cannot be read,
and cannot be transferred out. Since deactivation is the only alternative to deletion,
that turns "retire a unit" into "strand its stock". Phase 3 must define the semantics
separately for each direction: manager-only **read** of an inactive unit's balance so it
never vanishes from consolidated inventory; **write** refused for `transfer-in` and for
sales, but permitted for `transfer-out` so the unit can be drained before it closes.
Widening the scope to expose inactive locations without settling that split would make
deactivation meaningless.

For discretionary stock actions, a paired device is not an actor. The request must also
carry a currently authenticated employee identity from the staff-code flow, and the
server resolves that employee's role and unit assignment. A client-provided role,
employee name or `unitId` is never authority.

---

## 3. The Économat

Unchanged from 1.0 in substance. One Économat per hotel. It is the purchasing
department, the internal supplier, the main stock, and the approval point for
department requests.

Four movement families, which the system must keep distinct:

| Family | Meaning | Ledger reason |
|---|---|---|
| External purchase | The Économat buys from a supplier | `receipt` (existing `procurement` flow) |
| Internal request | A department asks the Économat for stock | no movement · a request is not a movement |
| Internal transfer | Stock moves Économat→department, or department→department | `transfer-out` / `transfer-in` |
| Customer sale | A revenue outlet sells to a guest | `sale` (existing, automatic) |

**Submitting a request never moves stock.** Only a confirmed transfer does.

### 3.1 Cost · correcting an ambiguity in 1.0

1.0 says internal transfers "may display an internal amount of 0 MAD" while also
requiring the real cost to be retained. Those two sentences have been read as
permission to store zero. To be unambiguous:

- **0 MAD is a display choice and never a stored value.**
- A transfer moves at the Économat's cost for that item, carried on the movement in
  `unit_cost_cents` exactly as a purchase does.
- Storing zero silently understates outlet material cost and corrupts food-cost
  percentage for every report downstream. Any code path that writes a transfer without
  a cost is a bug, not a configuration.

### 3.2 Units of measure · missing from 1.0, required

Not mentioned in 1.0 and non-negotiable in practice: the Économat buys a case of 12,
issues bottles, and the bar pours 4 cl. Without conversion, par levels and variance are
noise, and the whole feature reads as broken to the user.

`assets/restaurant-units.js` already exists. Each catalogue entry declares its
purchase unit, issue unit and consumption unit, with the conversion between them.
Transfers are recorded in the issue unit; the ledger stores the base unit.

### 3.3 Stock in transit · conditional custody contract

The shipped implementation remains the simple V1 rule: **the Économat holds the
goods until the department confirms receipt.** Preparation and handover are workflow
states with no ledger effect, and confirmation writes one atomic Économat-to-unit
movement pair. This rule stays in force unless Discovery D observes a real interval
where staff agree that the goods have left one custodian but have not reached another.

If that interval is confirmed, the only accepted replacement is an explicit custody
model:

1. **Prepared:** quantity is reserved but remains in the Économat balance.
2. **Dispatched:** one atomic pair moves it from the Économat into a virtual
   `transit:<request-id>` location. The hotel total is unchanged and exactly one
   custodian owns every quantity.
3. **Received:** one atomic pair moves the counted quantity from transit into the
   destination unit.
4. **Rejected, short or returned at the door:** one atomic pair moves the affected
   quantity from transit back to the Économat. A discrepancy never disappears through
   a status edit.

Do not implement the virtual location or dispatch movements until Discovery D records
who physically takes custody, when they say custody changes, and whether a separate
dispatch action is operationally credible. If staff treat preparation and receipt as
one handover, the current confirmation-only pair is the correct model.

### 3.4 Cost allocation and commitments

"Économat cost" means the source location's cost allocation at confirmation time, frozen
onto both movements. It is not the latest catalogue price and not a number recomputed
later. Direct department transfers use the source department's cost on the same basis.

**V1 uses the single blended rate the existing allocator already returns. It does not
split a transfer into per-lot layer pairs.**

`allocateCost()` in `assets/inventory-consumption.js` walks the derived lots, sorted by
`expiresAt` (first-expired-first-out, not first-in-first-out), and returns **one blended
rate** rounded to four decimals: `totalCost / reqQty`. It returns a number, never a set
of layers, and nothing persists which lot was drawn.

Per-layer transfer pairs would therefore require a lot-identity model that does not
exist: lot identity carried on movements, persisted layer consumption, and layer state
surviving offline replay. That is a V2 project, and it is not the reason a hotel is
waiting for this feature.

The decisive argument for the blended rate is consistency, not effort: **sales already
value stock this way.** A bar that sells a bottle and a bar that receives a bottle must
put the same number on the same goods, or outlet material cost stops reconciling against
outlet revenue for reasons no one will find.

### 3.4.1 Unknown cost refuses the transfer

`allocateCost()` returns **`null`** when coverage is partial and no default rate exists ·
deliberately, rather than diluting the average. `unit_cost_cents` is nullable in the
schema ("NULL si inconnu"), so a null would be stored without complaint.

**A transfer whose source cost resolves to null is refused.** The confirming employee is
told the item has no known cost at the source and that a receipt or opening cost must be
recorded first. V1 does not move goods at an unknown value, because an uncosted
`transfer-in` silently understates the destination's material cost exactly like a stored
zero would · §3.1 exists to prevent that, and null is the same wound through a different
door.

This is a refusal, not a warning, and it is the one place in this project where the
system blocks an operational action. It is defensible because the fix is immediate and
local: record the cost at the Économat, then confirm.

### 3.4.2 The allocator is location-aware · landed in Phase 2

**This section described a Phase 8 fix. It moved to Phase 2 and is done.** The reason is
sequencing, not ambition: `record()` in `assets/inventory-consumption.js` calls
`allocateCost()` on **every sale**, so the moment Phase 2 gave each unit its own location,
a rooftop sale would have started blending the Économat's shelf into its cost. Phase 2
created the bug and therefore had to close it in the same commit.

What was wrong, for the record:

- `history(itemId)` in `assets/inventory-ledger.js` filtered on `itemId` only · there was
  no `locationId` filter.
- `deriveLots()` in `assets/inventory-consumption.js` did not carry `locationId` into the
  lot objects it built.

So the allocator blended lots from **every** unit. Measured on the seeded tenant
(`tools/fixtures/hotel-tenant.mjs`) before the fix, where the Économat holds 12 whisky
across two lots at 120 and 150 and the rooftop bar holds 6 at 300:

| Asked of the Économat | Returned then | Reality |
|---|---|---|
| 6 | 120.00 | correct |
| 12 | 135.00 | correct **by accident** · the Économat's lots happen to sort first |
| 13 | 147.69 | **wrong** · billing the rooftop bar's stock to the Économat |
| 18 | 190.00 | the whole hotel blended together |

The 12 was the dangerous number, not the 13: it was right only because of lot ordering,
and a changed expiry date moved that boundary silently.

**The three edits that landed** (commit `7d59fd6b`): `history()` accepts and filters on
`{ locationId }`; `deriveLots()` carries `locationId` into each lot and accepts the same
filter; `allocateCost()` passes it through, and `record()` supplies the sale's own
location instead of defaulting to `'principal'`.

Asked for 13 whisky at the Économat, the allocator now returns **`null`** rather than a
number · partial coverage with no fallback rate, exactly as §3.4.1 requires, and the
confirmation is refused instead of being priced off the wrong shelf.

**It is not a lot-tracking project** · §3.4 still stands, V1 stores one blended rate per
transfer. This only makes that one rate come from the right shelf.

`tools/hotel-seed-test.mjs` now pins the **scoped** boundary rather than the blended one:
13 at the Économat is `null` without borrowing the rooftop, 6 at the rooftop is 300, and
`deriveLots()` at the Économat sees exactly its own two lots.

Approval does not move stock, but it does create a workflow commitment. To prevent two
managers approving the same bottles, the server computes **available to promise** as
on-hand less approved, unclosed quantities for that source location. Approval and its
commitment check are one concurrency-controlled server operation. V1 refuses an
over-commitment; it does not hide it behind negative future stock or a client warning.

---

## 4. Controlled department catalogues

Unchanged from 1.0, which is correct and well-argued.

Each unit has an approved catalogue. A department may request only items in its own
catalogue, and the item must also exist in the Économat catalogue. Adding an item to a
department catalogue is a manager action (for example the F&B manager), never a
self-service action by an outlet employee.

Per catalogue entry: visibility, counting unit and packaging, target/par level,
optional reorder trigger, counting frequency, whether replenishment drafts are enabled,
active/inactive, recipe use where applicable.

Storage: a `store_docs` feature, per unit. It follows the existing FEATURES registry in
`functions/api/store.js`.

---

## 5. Internal request workflow

The paper *bon de commande* becomes a digital internal stock request.

### 5.1 Quantities, not statuses · the main structural fix

1.0 asks for fourteen statuses: Draft, Submitted, Under review, Changes proposed,
Approved, Rejected, Preparing, Ready for pickup, Out for delivery, Partially handed
over, Awaiting confirmation, Partially received, Received, Disputed, Cancelled.

Three of those describe one request through three different pairs of eyes. Modelling
them as a flat enum guarantees a permanent class of bug where the status and the
quantities disagree, plus an ever-growing set of illegal-transition guards.

**Model the lines. Derive the status.**

Each request line carries four quantities and a resolution:

```
line: {
  itemId, unit,
  qtyRequestedBase,      // immutable base-unit quantity used for every comparison
  qtyRequested,          // what the department asked for
  qtyApproved,           // what the Économat committed to · 0 = refused
  qtyPrepared,           // what was physically assembled
  qtyReceived,           // what the confirming side accepted
  resolution,            // pending | approved | reduced | refused
  substituteFor,         // reserved for V2; always empty in V1
  note
}
```

`unit` and its conversion factor are snapshots. A later catalogue conversion edit must
not change an open or historical request. All server invariants use the base quantity;
display quantities remain for the employee. Quantities are non-negative and monotonic:
approved cannot exceed requested, prepared cannot exceed accepted approval, and received
cannot exceed prepared. Refused lines have approved quantity zero.

The request's displayed state is computed from its lines, not stored:

| Displayed state | Derivation |
|---|---|
| Draft | not submitted |
| Submitted | submitted, no line reviewed |
| Under review | some lines reviewed, not all |
| Changes proposed | any line where `qtyApproved != qtyRequested` or a substitute is offered, awaiting department acceptance |
| Approved | all lines resolved, none awaiting acceptance |
| Preparing | approved, `qtyPrepared` incomplete |
| Ready / Out for delivery | fulfilment method chosen, handover not confirmed |
| Partially received | at least one approved line has received quantity, and at least one approved line still has a remainder |
| Received | every approved line is fully received; refused lines are excluded |
| Disputed | a discrepancy is open |
| Cancelled | explicitly cancelled |

The workflow keeps exactly **three stored states**: `draft`, `open`, `closed`, plus a
`cancelled` flag. Everything else is a function of the lines. The user-facing labels
from 1.0 are preserved; only the storage changes.

Unfulfilled quantities remain visible as outstanding, delayed, substituted, rejected or
cancelled. They are never silently marked received.

Quantities from kilograms, bottles and cartons are never added together to derive a
state. Derivation is line-by-line in base units, then reduced with `every` / `some`.

### 5.1.1 Persistence and concurrent edits

Requests, lines, approvals and transfers are transactional D1 records, not one shared
`store_docs` JSON document. `store_docs` remains appropriate for unit and catalogue
configuration; it is not appropriate for two employees reviewing the same request.

Every request has a monotonically increasing `revision`. Review, acceptance,
preparation and confirmation submit the revision they saw; stale writes receive `409`
and must reload. Accepting a reduction accepts one exact revision, never "whatever is
current". Every create/submit/approve/confirm command also has an idempotency key.

### 5.2 Économat review

The Économat may approve as submitted, approve partially, change the quantity, or reject
a line or the request, with a reason. Substitution is refused in V1; the department
raises a new request. The persisted `substitute_for` column is reserved for V2 and every
V1 command keeps it empty.

An accepted review is not permanently locked. The Économat may re-review an open request
while no proposed quantity drops below preparation or receipt already recorded. A new
review raises `reviewRevision` above `acceptedRevision`, returning the request to
`changes-proposed` until the department accepts that exact revision. This is required
when central stock changes after an earlier approval.

Reasons: insufficient central stock · supplier delivery expected · product unavailable
in Morocco · temporarily discontinued · reserved for another requirement · replaced by
an equivalent · free-text note.

> **"Supplier delivery expected" presumes the purchase pipeline is wired to this
> workflow.** `assets/procurement.js` exists (suppliers, orders, receipts, invoices,
> 3-way match) but is not connected to internal requests. For V1 this reason is a
> free-text note like any other. Linking a delayed line to an actual purchase order is
> V2 and is listed as such in §9.

Changes affecting quantity, timing or product selection remain **proposals** until the
requesting department accepts them.

### 5.3 Preparation and handover

Fulfilment is delivery (Économat brings the goods) or pickup (department collects).
The request records the method and, where available: prepared by, handed over by,
delivered to or collected by, preparation time, handover time, notes and discrepancies.

Neither preparation nor handover writes to the ledger. See §3.3.

Partial preparation, handover and receipt are append-only fulfilment events carrying
line, quantity, actor, unit and timestamp. The line quantities above are projections of
those events, not values repeatedly overwritten in place. This preserves who handled
each of three partial deliveries and makes corrections reversible.

V1 deliberately uses the existing `prepare` command for handover rather than adding a
second action with the same cumulative quantity. Its payload carries `fulfilmentMethod`
and `handover`; the first delivery handover freezes `delivery_started_ts`, while every
partial command remains an event with its own actor, payload and timestamp.

### 5.4 Confirmation writes the transfer

Confirmation is the only ledger event in this workflow. A dedicated server command writes
one linked pair, atomically, sharing a transfer reference:

```
Économat        · reason transfer-out · qty −confirmed · unit_cost_cents = Économat cost
Department      · reason transfer-in  · qty +confirmed · same cost, same ref, same ts
```

Both movements share `refType: 'transfer'` and one `refId`. The request update,
confirmation event and movement pair commit together. The system must never decrease one
location without increasing the other, and must never apply the same confirmation twice.

### 5.4.1 The atomic mechanism, precisely

**D1 has no interactive transaction.** There is no `BEGIN` / `COMMIT` spanning awaits in
the Workers binding. The atomic primitive is `env.DB.batch()`, already used in
`functions/api/booking.js`, `functions/api/store.js` and `functions/api/hotel/stays.js`.

`batch()` takes prepared statements whose values are **bound up front**, so no statement
in a batch can consume a value returned by an earlier statement in the same batch. That
rules out the shape the existing writer uses: `functions/api/inventory/movements.js`
calls `nextCursor()` once per movement inside a loop, and `nextCursor()` is itself a
read-modify-write (`INSERT OR IGNORE` then `UPDATE … RETURNING`).

The confirmation command therefore runs in two steps:

1. **Reserve the cursor range first**, outside the batch, in one statement:
   `UPDATE inventory_sync_sequences SET last_ts = last_ts + N WHERE merchant = ?
   RETURNING last_ts`, where `N` is the number of movements about to be written.
   Compute each movement's `srv_ts` from the returned range.
2. **Then `DB.batch()`** the prepared inserts, the request update and the confirmation
   event together. All of it commits, or none of it does.

Reserving cursors ahead of a batch that may be fully ignored on replay can leave a gap in
the sequence. That is fine and intended: `srv_ts` is a monotonic **cursor** for
incremental sync, not a counter anyone reconciles. Gaps cost nothing; collisions would
cost a resynchronisation.

### 5.4.2 Idempotency is server-side

Idempotency is enforced **on the server**, by a deterministic movement id plus
`INSERT OR IGNORE`, which is how `functions/api/inventory/movements.js` already writes.
The id derives from `(merchant, transferRef, lineIndex, itemId, direction)`, so a retry,
an offline replay or a double-tap produces the same id and the insert is ignored.

`KiwiInventory.add()`'s own duplicate check is a **client-side cache guard, not the
guarantee.** Two sequential browser calls to `add()` are not atomic and are forbidden for
transfer confirmation. The browser mirrors the acknowledged server result into the local
ledger; it never authors the pair.

Do not invent a third idempotency mechanism. The deterministic id and
`INSERT OR IGNORE` already carry sales, and transfers use the same pattern.

Final confirmation requires a server acknowledgement in V1. Drafting, submission,
review notes and preparation may queue offline, but the UI must show "awaiting sync" and
must not alter either final balance until the server has revalidated authority,
revision, available quantity and idempotency. A replay after reconnection is safe; an
offline device is never allowed to mint its own transfer authority.

### 5.5 Configurable confirmation authority

Unchanged from 1.0, which is a genuinely good control. The hotel manager selects, in
Hotel settings, which side finalises a transfer:

- **Recipient confirmation** (recommended default): the receiving department completes
  the transfer after checking the goods.
- **Économat confirmation**: the Économat completes it at handover.

Only the selected side sees the final confirmation action. The other side can view the
result and raise a discrepancy, but cannot confirm the same transfer again.
Raising that discrepancy is the non-ledger `dispute` command; it writes `disputed` and an
audit event without authoring a stock movement.

---

## 6. Direct department-to-department transfers

Departments may transfer directly without Économat approval, but never without source
approval. Rooftop Bar requests five bottles from Lobby Bar, an authorised Lobby Bar
manager approves and hands over,
the configured side confirms, and Kiwi writes the same atomic pair as §5.4.

These remain fully visible to hotel management and in the audit trail. They must never
be performed as an undocumented manual adjustment.

Recorded: source and destination, requested/approved/received quantities, requesting,
approving and receiving employees, method, dates and times, notes, substitutions,
discrepancies, and the linked movement pair.

A return to the Économat is this same workflow with source and destination reversed. It
is not a negative receipt, deletion or manual adjustment. Only the unconfirmed remainder
of a request may be cancelled; received goods leave through a new return transfer or an
append-only correction.

---

## 7. Outlet consumption

**Already built.** See §0. Every completed sale consumes stock immediately through the
recipe structure, idempotently, with reversals on cancellation.

The only work here is ensuring consumption is attributed to the **outlet's own
location** rather than `'principal'`, which falls out of phase 0.

One requirement from 1.0 worth restating because it is unusually honest and should
survive: items with no configured recipe cannot produce reliable consumption, and Kiwi
should surface them as *not covered by inventory automation* rather than implying the
stock figure is accurate.

---

## 8. Room charges · the one control this document changes

1.0 §11 has the cashier select the room, **Kiwi display the guest's name**, and then the
cashier ask the guest to state their name. That hands the answer to the person being
checked, which is not an identity check.

### Required order

1. The guest states the room number.
2. The cashier selects the room in the caisse.
3. **The cashier asks the guest for their name, before any name is displayed.**
4. Kiwi reveals the name of the guest currently assigned to the room.
5. If they match, the cashier proceeds.
6. The sale posts to the guest's folio for settlement at checkout.

The reversal costs nothing and turns a formality into a control.

### Accepted risk, stated as such

V1 requires no guest PIN, signature or automated identity check. That is a legitimate
business decision, and it is the hotel's accepted risk, not a solved requirement. It is
also the one flow where fraud is directly profitable, because the charge lands on
someone else's bill and surfaces at checkout when the guest is already leaving.

It is only survivable because of the compensating controls, which are therefore
mandatory rather than nice to have:

- Every folio line records the cashier, already required by 1.0.
- **A per-shift report of room charges by cashier**, added by this revision.
- Reversing an outlet transaction reverses its linked folio charge exactly once.

Folio line contents are unchanged from 1.0: originating outlet, transaction and receipt
reference, date and time, cashier, items or receipt summary, amount, reversal status.

---

## 9. Version 1 boundary

1.0's boundary section still contained nearly everything, which is why it read as a
twelve-month build labelled Version 1. The boundary below is what a hotel will pay for
and what can be verified against real stock.

### In V1

1. Hotel hierarchy with child outlets and departments.
2. Server-side unit scoping (§2).
3. Per-unit inventory locations on the existing ledger.
4. Department catalogues (§4).
5. Internal request: create, submit, review, approve/reduce/refuse, accept changes.
6. Preparation and handover with pickup or delivery.
7. Configurable single-side confirmation.
8. Atomic transfer pair with deterministic idempotency (§5.4).
9. Direct department-to-department transfers.
10. Returns using the same controlled transfer workflow.
11. Room-charge ordering fix and the per-cashier shift report (§8).
12. Économat, department and hotel management reports covering the above.

### Explicitly deferred to V2

Par levels and target stock · automatic replenishment drafts · the end-of-shift variance
and count workflow as a guided flow · substitution proposals (V1 refuses a line and the
department raises a new request) · delay-a-line linked to a purchase order · multiple
Économats and central sub-locations such as a beverage cellar or cold room · quantity or
value-based approval thresholds · automatic submission of replenishment requests.

Deferring substitutions and par levels removes roughly half the state space and none of
the value. Both are natural V2 work once real transfer data exists to validate against.

---

## 10. Permissions

Access follows the hotel hierarchy. At minimum:

| Role | Scope |
|---|---|
| Hotel manager | All units, configuration, confirmation policy |
| Économat manager / employee | Central catalogue, central stock, request approval, preparation, handover |
| Department manager | Department catalogue, requests, counts, department reports |
| Outlet employee | Assigned caisse, permitted stock actions and requests |
| Reception | Guest stays and folios, including visibility of outlet charges |

Users see only the units and actions assigned to their role. Every discretionary stock
action records the responsible user and time, consistent with the automatic/
discretionary split already enforced in `functions/api/inventory/movements.js`.

---

## 11. Audit requirements

Stock history is append-only from an audit perspective. Corrections create linked
reversing or adjustment movements; they never erase the original.

Every movement answers: what moved, how much, from where, to where, why, which request
or transfer or sale or correction caused it, who performed and confirmed it, and when.

The first reliable release must handle: partial fulfilment · delayed lines · pickup and
delivery · rejected and cancelled requests · returns to the Économat · direct
outlet-to-outlet transfers · incorrect quantities · damaged goods at handover ·
duplicate confirmation attempts · sale reversal after recipe consumption · room-charge
reversal · negative stock shown as a warning rather than blocking a real sale · offline
POS synchronisation without duplicate consumption.

The hotel inventory equation used by tests and reports is:

`opening + external receipts + transfers in - transfers out - consumption ± append-only corrections = closing`

A physical count is an observation; only its posted variance correction enters the
equation. Reports never describe a count itself as consumption.

The last three already work. The rest is this project.

---

## 12. Product principle

Unchanged from 1.0, and worth keeping verbatim in spirit:

> The product should remove the Économat's paper-entry backlog without removing
> operational control. Departments enter their own needs. The Économat decides what can
> be supplied. The employee handling the goods records the handover. One authorised side
> confirms it. Kiwi updates both inventories, preserves the real cost and keeps a
> complete audit trail.

The result should feel simple to hotel employees while remaining strict enough that
stock cannot disappear between departments.
