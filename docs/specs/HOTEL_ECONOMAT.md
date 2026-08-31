# Kiwi Hotel · Économat, outlets and internal stock

**Version 1.1 · supersedes the 1.0 requirements PDF of 31 August 2026.**
Status: ready for implementation. Build order lives in `HOTEL_ECONOMAT_PLAN.md`.

Version 1.0 was operationally sound and technically over-scoped. This revision keeps
its operating model intact and changes five things: it cuts the V1 boundary, replaces
the status enum with a quantity model, promotes tenancy to a blocking prerequisite,
reverses the room-charge identity check, and names what Kiwi already ships so nobody
rebuilds it.

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

### 3.3 Stock in transit · undecided in 1.0

1.0's status list implies goods that have left the Économat and are not yet confirmed
by the department, but never says whose balance holds them. **Decision: the Économat
holds them.** Stock leaves the Économat's balance only when the transfer is confirmed.

This makes the two movements a single atomic pair at confirmation time, which is the
only way the consolidated hotel inventory ties out at any instant. Preparation and
handover are workflow states with no ledger effect.

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
  qtyRequested,          // what the department asked for
  qtyApproved,           // what the Économat committed to · 0 = refused
  qtyPrepared,           // what was physically assembled
  qtyReceived,           // what the confirming side accepted
  resolution,            // pending | approved | reduced | substituted | delayed | refused
  substituteFor,         // itemId when this line replaces another
  note
}
```

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
| Partially received | `0 < sum(qtyReceived) < sum(qtyApproved)` |
| Received | `sum(qtyReceived) == sum(qtyApproved)` |
| Disputed | a discrepancy is open |
| Cancelled | explicitly cancelled |

The workflow keeps exactly **three stored states**: `draft`, `open`, `closed`, plus a
`cancelled` flag. Everything else is a function of the lines. The user-facing labels
from 1.0 are preserved; only the storage changes.

Unfulfilled quantities remain visible as outstanding, delayed, substituted, rejected or
cancelled. They are never silently marked received.

### 5.2 Économat review

The Économat may approve as submitted, approve partially, change the quantity, propose
a substitute, delay a line, or reject a line or the request, with a reason.

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

### 5.4 Confirmation writes the transfer

Confirmation is the only ledger event in this workflow. It writes one linked, atomic
pair sharing a single transfer reference:

```
Économat        · reason transfer-out · qty −confirmed · unit_cost_cents = Économat cost
Department      · reason transfer-in  · qty +confirmed · same cost, same ref, same ts
```

Both movements share `refType: 'transfer'` and one `refId`. The system must never
decrease one location without increasing the other, and must never apply the same
confirmation twice.

Idempotency uses the pattern already proven for sales: a **deterministic movement id**
derived from `(merchant, transferRef, lineIndex, itemId, direction)`, so a retry, an
offline replay or a double-tap produces the same id and `KiwiInventory.add()` drops it.
Do not invent a new idempotency mechanism.

### 5.5 Configurable confirmation authority

Unchanged from 1.0, which is a genuinely good control. The hotel manager selects, in
Hotel settings, which side finalises a transfer:

- **Recipient confirmation** (recommended default): the receiving department completes
  the transfer after checking the goods.
- **Économat confirmation**: the Économat completes it at handover.

Only the selected side sees the final confirmation action. The other side can view the
result and raise a discrepancy, but cannot confirm the same transfer again.

---

## 6. Direct department-to-department transfers

Unchanged from 1.0. Departments may transfer directly without Économat approval:
Rooftop Bar requests five bottles from Lobby Bar, Lobby Bar approves and hands over,
the configured side confirms, and Kiwi writes the same atomic pair as §5.4.

These remain fully visible to hotel management and in the audit trail. They must never
be performed as an undocumented manual adjustment.

Recorded: source and destination, requested/approved/received quantities, requesting,
approving and receiving employees, method, dates and times, notes, substitutions,
discrepancies, and the linked movement pair.

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
10. Room-charge ordering fix and the per-cashier shift report (§8).
11. Économat, department and hotel management reports covering the above.

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
