# Sale returns · race properties

`tools/sale-return-race-properties-test.mjs` (wired in `tools/check.js`, fast tier)

Three routes take value back out of a paid ticket: a void
(`functions/api/sale/cancel.js`), a refund (`functions/api/sale/refund.js`) and
a store credit issued against it (`functions/api/store-credits.js`, action
`issue`). The rules: a voided ticket cannot be refunded or credited, a refunded
or credited ticket cannot be voided, and refunds plus credits never pass the
ticket. Two tills can press at the same moment, so each rule has to hold inside
the write, not only in a read before it.

The suite runs the real routes on the SQLite D1 fixture through a D1 wrapper
that pauses one request before its n-th database step (a batch counts as one
step and stays atomic) while a second request runs to completion. Amounts are a
share of the ticket, up to 120 %, so most fit and the guards decide.

| Property | What it guards |
|---|---|
| Two requests on one ticket, the first paused at every step: a voided ticket keeps no refund or credit, refunds plus credits stay within the ticket, and every answer matches the books | money leaves a ticket once, even when two devices race |
| Ordinary sequences of up to five voids, refunds and credits keep the same rules | the everyday path |
| A store credit's ledger balances (issued plus adjustments equals spent plus cancelled plus what is left) while two requests (spend, batch spend, adjust, cancel) race at every step | the written-off amount of a cancelled credit is what was really left |

## Defect found (2026-10-22)

The void checked for refunds and store credits with a read
(`alreadyReturned`) and then wrote with an UPDATE whose own guard excluded
refunds only. A store credit issued by another device between the two left the
ticket voided **and** credited: the sale disappears from revenue and the
customer still holds a credit for it. Shrunk counterexample: a 1 MAD ticket,
the void paused before its write, a 1 centime credit.

Both void statements (plain void and void-and-reopen) now refuse a ticket that
has an issued credit, in the same UPDATE, and the route creates the credit
ledger table first on a database that never had one, so the guard cannot fail
the void. A database that cannot create it cannot hold a credit either, and
there the guard is left out (the PIN hardening suite's stand-in database is
one).

Production on 2026-10-22: one store credit ever issued, 155 voids, no ticket
both voided and credited, none both voided and refunded.

Mutations caught: the void's new credit guard removed, the credit issue's
`void_ts IS NULL` removed, the refund's `void_ts IS NULL` removed.

## Second defect found (2026-10-22)

Cancelling a store credit recorded as written off the balance it had read at
the start of the request. A spend landing between that read and the cancel
(step 17 of the route) left a ledger of 100 issued, 1 spent, 100 cancelled.
The cancel now holds only against the balance it read; if the credit moved it
answers `credit-changed` and changes nothing. No screen calls cancel today, and
production holds one credit event ever (its issue).
