# Kitchen properties

`tools/kitchen-properties-test.mjs` drives the real order queue route
(`functions/api/order/queue.js`) on the SQLite D1 fixture, the real counter
relay (`assets/kitchen-relay.js`) and the real paper queue
(`assets/kitchen-print-queue.js`). Only clocks, transport and printers are
simulated. Fast tier, about 7 seconds at 100 runs.

## What holds (15 strict properties)

- A state machine of send, resend, start, ready, served, recall, partial void,
  payment, table transfer and merge always leaves one ticket, the right status,
  sent minus voided as the remaining quantity, and the right table.
- Two simultaneous sends of one id keep one order and its exact lines.
- A station's late "ready" never moves a ticket the kitchen already marked
  ready back to "accepted".
- The last station to finish records the ticket's ready milestone once.
- Two stations finishing at the same instant both keep their result.
- A partial void retried, or sent by two screens at once, is counted once and
  never voids more than was sent; a void accepted by the kitchen while cooking
  restores sent minus voided under retries.
- Resending a ticket after its table was moved does not reopen the old table.
- Two waiters asking the kitchen to void the same cooking dish at once leave
  one pending alert, the one on the ticket; a pending void and a station
  "ready" landing together both survive (the interleaving is forced by holding
  the void's write until the other request lands).
- A screen paired to one merchant can neither read nor change another's queue.
- The counter relay recovers an answer lost after the server committed, across
  a reload, with one server ticket.
- When the relay (60) or the paper queue (120) is full, the new ticket is
  refused and the cashier is told; no waiting ticket is pushed out.
- The paper queue prints each ticket once across re-enqueues, acknowledgements
  and reloads.

## Defects found and fixed (22 October 2026)

1. `queue.js`: a station "ready" recomputed the status from per-station flags,
   so after a whole-ticket "ready" a late station tap moved it back.
2. `queue.js`: the ready milestone was recorded in the station accept path,
   where the ticket can never become ready, and was missing from the station
   ready path.
3. `queue.js`: a resent ticket opened a visit on its table before noticing it
   already existed, so a transferred table's old number showed a phantom,
   empty visit.
4. `kitchen-relay.js`: at 60 unsent tickets the oldest was silently dropped
   while the new one reported "queued".
5. `kitchen-print-queue.js`: at 120 waiting tickets the oldest was dropped
   while the new one was counted as accepted.
6. `queue.js`: a void needing the kitchen's approval wrote its alert and then
   the ticket's lines with no revision check. Two waiters voiding the same
   dish left a second, orphan alert; a station "ready" landing between the read
   and the write was erased. Alert and lines now go in one guarded batch, and a
   conflict answers `concurrent-update` (the waiter app already says
   « un collègue vient de la modifier, réessayez »).

