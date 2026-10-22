# Catalogue merge properties

`tools/catalog-merge-properties-test.mjs` (fast tier, wired in `tools/check.js`).

A boutique's stock lives on every device that sells from it and on the server.
Each device sells, counts, deletes and edits offline, then syncs through
`mergeDocs()` in `assets/boutique-catalog.js`. The server also folds an
oversized ledger before a stock action (`compactForWrite()` in
`functions/api/catalog.js`).

The suite replays generated histories on three devices and the server and
compares the result with a model of what the shop did:

> stock = the latest physical count + every sale, return or reception after it

## Properties (all strict)

1. After every device syncs, all copies hold the same stock, and it matches the model.
2. No sale is lost or counted twice: each move made after its variant's latest count is in the merged ledger exactly once.
3. A deletion on any device stays deleted everywhere, with its moves, and no variant is left without its product.
4. The latest edit of a variant wins on every device.
5. Merging is order-free: `a+b = b+a`, and three devices give the same result whatever the grouping.
6. Merging what is already known changes nothing.
7. A device folding moves older than 45 days into its count shows the same stock, alone and merged with a copy that never folded.
8. The server folding a ledger above 11 000 moves never changes a stock, pending online reservations included.

## Defect fixed on 22 October 2026

Property 8 was red. The server never folds a pending reservation, but the
folded count took the timestamp of the newest folded move. A reservation older
than that timestamp fell behind the count and stopped counting: the reserved
piece came back on sale, and a second time when the reservation was released.
Two moves of one variant in the same millisecond on either side of the fold line
had the same problem. The fold now stops, per variant, strictly before its
oldest kept move.

Production was never exposed: on 22 October the largest catalogue held 1 411
moves, far from the 11 000 threshold.

Mutation checks run when the suite was written: making the client fold take
the current time, or letting an older count beat a newer one in `mergeDocs`,
both turn the suite red.

## Not covered

A move made offline and synced after another copy folded past its timestamp
(client fold at 45 days, server fold at 11 000 moves) is ignored by design of
the fold. That needs a till offline for more than 45 days, or a ledger of
11 000 moves with one device far behind.
