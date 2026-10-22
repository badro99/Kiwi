# Menu promotions · properties

`tools/menu-promos-properties-test.mjs` (wired in `tools/check.js`, fast tier)

Restaurant promotions (`assets/menu-promos.js`) price three places: the till,
the waiter app and `priceOrder` on the server, which reprices every order when
it arrives. The suite generates menus (five dishes in three categories, a syrup
option, a composed menu), up to four promotions (percent, amount off, fixed
price; whole menu, categories or items, including targets the menu no longer
has; dates, weekdays, daily hours with windows past midnight, pause) and
moments from October 2026 to June 2027, biased onto window edges. It runs the
real server pricer on the SQLite D1 fixture and the browser copy (kit zone law
plus the rule, in a vm) and checks both against a model written from the rules
in the file header.

| Property | What it guards |
|---|---|
| Every line costs the lowest running promotion that covers it, the oldest on a tie, never above the menu price; composed menus and their parts never move | the price a customer pays, and the promotion named on the receipt |
| The server and the till agree on every line at every moment, on the legal Casablanca clock | the tablet shows what the ticket charges |
| The total is the sum of the lines in centimes; a stamp or a price sent by the device changes nothing | a phone cannot invent a discount |
| Sanitising twice changes nothing; what survives is bounded and targets only what the menu still has | every writer of the menu stores the same rules |

## Defect found (2026-10-22)

`menu-promos.js` reads its wall clock through `globalThis.KiwiZoneLaw`. The
browser kit publishes it before the till loads the rule; the Worker never did,
so `priceOrder` used the runtime's own time zone data. On a runtime older than
IANA 2026c (this Mac's Node 24 is one), Casablanca is still +01, and the server
opened a 17:00 happy hour at 16:00 and closed it at 18:00, while the till
followed the legal clock. The first counterexample was a dish at 23:59 on a
Friday, one centime apart between server and till.

`functions/api/order/_lib.js` now publishes the same law on the server before
the rule's first price. `menu-promos-test.mjs` and `menu-promos-server-test.mjs`
encoded the old clock (`h - 1` for October); both now load the law and use
UTC+0, so they no longer depend on the node that runs them, and the server test
pins 16:30 / 16:59 / 18:59 / 19:00 around a 17:00 to 19:00 happy hour.

Production may have been masked by accident: Pages bundles every route into
one Worker, and `assets/admin-policy.js` (imported by the operator overview)
`require`s the kit, which publishes the law globally when it runs. Prices no
longer depend on that import order.

Production exposure: none. On 2026-10-22 no published menu had a promotion
(0 of 9) and no order line carried a promotion stamp.

Mutations caught: the fix removed (both clock properties and three server
cases), the tie rule reversed, a tie allowed to replace the incumbent, a
promotion that does not lower the price allowed to stamp the line, composed
menus discounted.
