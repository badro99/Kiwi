# Remise à la marocaine (boutique till) · design

Approved by the owner on 18 Nov 2026.

## Why
In a Moroccan shop the customer asks "akher taman?" and the haggling ends on a
round price ("300", "everything for 500"), not on a percentage. Today the
boutique till only offers percentage chips (5/10/15/20 % by default), so
"350 → 300" lands on 297.50 or needs mental arithmetic.

## What
Every boutique discount (on one item in the variant sheet, and on the whole
ticket from the 2027 foot "Remise") gets a three-way switch:

- **%**: today's chips, unchanged.
- **Prix convenu**: the cashier types the agreed price. On an item it is per
  piece (qty 2 → twice the price). On the ticket it is the exact new total.
- **−MAD**: the cashier types the amount off (per piece on an item, off the
  total on the ticket).

The till shows the result live (`350 → 300 · −50 MAD`). An agreed price is kept
exactly as typed, with no shelf rounding on top.

A ticket-level price or amount is spread over the pieces in proportion to their
price, in whole MAD per piece; the remainder lands on one piece of the most
expensive line (that line splits in two when its quantity is above 1), so the
ticket total equals the agreed figure exactly and a later return refunds what
that piece really cost.

An agreed price replaces a running promotion's price for that piece; the
receipt keeps promotion and discount as two separate lines.

## Rules kept
- The manager's code, once per ticket, as today. The approval records who,
  when, the mode (%, price, amount) and the figure.
- The owner's highest allowed percentage (KiwiDiscountPolicy, default 20 %) is
  a floor: no agreed price or amount may go below `price × (1 − max %)`. The
  till names the lowest possible price instead of only refusing.

## Records
- Each sale line keeps `agreed` (the per-piece price) next to `remise`.
- `remiseAuth` gains `mode` and `value`; `pct` stays for % discounts.
- "Réductions accordées" on the Z report already sums every discount: no change.
- The on-screen ticket line shows the original price struck through. The paper
  receipt keeps its subtotal / remise / total rows (thermal printers cannot
  strike through; my call).

## Approaches
- **Extend the existing line discount (chosen).** One record, one report, the
  same approval gate.
- A separate "bargain" screen: rejected, it would split the record and the Z
  report in two.
- Entry choice (owner picked C, all three): agreed price only (A) or amount
  only (B) were the alternatives.

## Not included
The restaurant till (its bill discount already takes a fixed amount), the
Maison till, and the owner's settings page.
