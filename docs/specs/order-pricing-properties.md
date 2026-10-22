# Order pricing properties

`tools/order-pricing-properties-test.mjs` runs the real `priceOrder`
(`functions/api/order/_lib.js`), which reprices every QR order and every order
the waiter app creates, on generated menus (dishes, option groups, a composed
menu with two slots) and generated lines a phone could send, honest or not:
forged prices, quantities from -5 to 500, options from another dish or another
group, composed-menu parts without their menu, unknown dishes. Fast tier.

## What holds (6 strict properties, 1 000 cases each)

- A forged price, unit price or total sent by the phone never changes what the
  order costs.
- Every accepted line costs its dish plus the options it really chose, at a
  quantity between 1 and 99, and the total is their sum in centimes.
- A dish is never served free: each accepted billable line costs at least its
  menu price.
- A composed-menu part rides only with its menu, within its slot, and never
  more than the menus ordered allow.
- Accepted options respect their group: from the dish's own groups, one at
  most where one is allowed, no fewer than required.
- The order of the lines does not change the bill.

## Defect found and fixed (22 October 2026)

Two lines claiming to be the composed menu for the same group id overwrote each
other's check, so the outcome depended on line order: refused in one order,
accepted in the other with the second line charged the real menu's supplement.
Honest clients mint one id per composed menu, so only a crafted or corrupted
order could hit it. A group id claimed by two menu lines is now ambiguous and
the whole composition is refused, whatever the order.
