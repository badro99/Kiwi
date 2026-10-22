# Pressing property checks

Run `node tools/pressing-money-properties-test.mjs`. Default: 300 cases per
property, seed 20261022. Override with KIWI_PROPERTY_RUNS / KIWI_PROPERTY_SEED;
KIWI_PROPERTY_ONLY selects a label. Requires the existing app fast-check install.
The suite uses real browser declarations in a VM, full catalogue/operations/Z
modules, and real sale/feed/store/cancellation handlers on in-memory SQLite.
No hosted data, network, card terminal or browser is used.

14 strict properties cover centime totals and the existing 15% B2B discount
(rounded to the whole dirham by declared policy, see trades-money-properties.md
TM-P1: a 12.50 MAD B2B line pays 10.50, not 10.62),
service/variant pricing, quantity-to-garment tags, payment-line allocation,
deposit limits, retained public numbers, cancellation tombstones, handover
idempotency, local tenant namespaces, server authorization, cancellation races,
store revision conflicts, future ready slots, and deposit/pickup Z attribution.
The Z test crosses 05:00 on the Morocco UTC+0 reform date and in October,
using actual sale requests and the feed projection that supplies the Z.
There are no independent surcharge or per-line discount fields in this flow.
The tests do not assert card-terminal or physical cash outcomes.

## Red, fixed, and removal verified

- An unpaid 12.50 MAD ticket, or a cancelled ticket, could be handed over by
  calling deliverOrder; repeated handover changed collectedAt. The operation
  now checks balance and terminal states before changing garments.
- POST pressing/cancel accepted a ticket with a delivered garment or
  collectedAt. It now returns 409 without modifying the document. The
  revision CAS also protects a concurrent collection after its initial read.

Restoring each runtime file from HEAD made its selected strict property red;
restoring the corrections made the full suite green. No commits were made.

- Merge delivered updatedAt=1 with stale received updatedAt=2: received won, so
  a device that missed a pickup could undo it by editing the ticket later and
  the till asked for the balance again. A handover is now final in the merge,
  like a cancellation tombstone: the collected copy wins whole with its payment,
  and a garment handed over in either copy stays handed over (Claude, 22 October).

## Known guarantees that do not hold

These remain executable knownIssue checks, not launch clearance:

- Cancel a ticket paid 10 MAD: pay.paid survives, but no refund or refund-due
  record is issued. The existing UI explicitly says cancellation does not
  refund. The owner must decide refund versus retained deposit policy; this
  suite does not activate a new refund flow.
- A received garment with readyAt=1 becomes ready at epoch 2 without an
  atelier action. Existing auto-ready tests require this behavior. Changing
  that operational promise requires a product decision.
- Two disconnected devices starting at seq=1 both allocate 0001. The retained
  local-number guarantee holds; global uniqueness needs an allocation policy
  for offline devices and the finite four-digit namespace.
- Berlin device, Casablanca store, 2026-10-22 04:00Z: the recommended next-day
  18:00 slot is 16:00Z, not 18:00Z. Ready-date helpers use local Date methods.
  A fix needs a shared store-zone calendar contract for slot calculation,
  labels, and custom date input; changing only the suggested instant would
  leave the other entry paths inconsistent. UTC-device future/05:00 checks pass.

Validation: new suite plus pressing-edge, pressing-auto-ready, pressing-truth,
and audit-remediation-pressing. No project-wide check or browser suite run.
