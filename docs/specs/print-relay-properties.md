# Cloud print relay properties

`tools/print-relay-properties-test.mjs` drives the real `/api/print/jobs`
route on the SQLite D1 fixture with generated sequences of deposits (with
retries), bridge polls whose answer may be lost, acknowledgements that may be
lost, a printer going down, the clock moving and the till re-sending an
uncertain ticket. Only the bridge and the printer are simulated. Fast tier.

## What holds (5 strict properties)

- One bridge: whatever is lost, a ticket is never printed twice, never marked
  printed without paper, there is one queue row per ticket whatever the
  retries, and no ticket stays open past its ten minutes.
- Two bridges of one store never receive the same ticket.
- A bridge that stops mid-ticket leaves it uncertain; it is never handed out
  again on its own, and the till can send it again once.
- A ticket the printer failed is retried after its ten-second pause and
  printed once.
- Another store's till cannot read a ticket, and another store's bridge never
  receives or acknowledges one.

A mutation (an expired claim going back in the queue instead of quarantine)
turns two of them red.

## Known (owner question)

PR-1. A ticket goes to whichever bridge of the store asks first and stays with
it: a retry after a failure, and a « printer not saved on this bridge »
refusal, never reach the store's other bridge. Production on 22 October: no
store has two bridges online at once (the extra ones are earlier pairings),
but Amira Cafe did from 31 August to 2 September and its second bridge failed
26 tickets it could not reach. Should a ticket one bridge cannot print be
offered to the store's other bridges?
