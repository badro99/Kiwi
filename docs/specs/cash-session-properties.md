# Cash session properties

`tools/cash-session-properties-test.mjs` (fast tier, wired in `tools/check.js`).

The till posts each step of a cash shift to `/api/cash-sessions`: the opening
float, cash in and out, signed handovers between cashiers, and the close with
its count. The till computes the expected cash itself (`drawerExpected` in
`assets/caisse-accounting.js`): float + cash sales − cash refunds + in − out +
every signed handover gap. The server cannot see one terminal's sales, so it
keeps a floor the declared expected may not pass. That stops a till from hiding
a shortage behind a low expected.

## Properties (all strict)

1. An honest till keeps exactly the expected cash and gap it declared, cash refunds and signed handover shortages included.
2. A till announcing less than float + in − out + signed handover gaps − cash refunds has its expected raised, and the gap shows the shortage.
3. Replaying any event of a shift changes nothing.

## Defect fixed on 22 October 2026

Properties 1 and 2 were red. The floor counted the float and the movements
only. Two honest situations put the real expected below it:

- a cash refund (100 MAD paid in, 100 MAD refunded: the drawer should hold 0);
- a signed handover that found a shortage, which the till carries into the
  expected.

The server raised the expected to its floor and recorded a shortage that did
not exist, or counted a signed shortage a second time at the close. The floor
now adds the stored handover gaps and subtracts the store's cash refunds and
the cash sales voided during the shift. Those last two are counted for the
whole store because a sale row does not name its terminal, so the floor can
only get lower than before, never invent a shortage.

Production was not hit: of the 55 closes recorded by 22 October, none had a
cash refund or a handover gap during its shift.
