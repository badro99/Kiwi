# Échange sans ticket · caisse Maison

Approved by the owner on 23 Nov 2026 (conversation). First user: la maison en vogue
(Tangier, Maison till, Pro).

## Why

Gift recipients bring back duplicate or unwanted gifts. They have no ticket, the buyer
is not with them, and Vogue's 6 127 products carry no barcode and no photo (97 % are
named by supplier reference, "AM-58-8 MARRON"). In caisse.ma the cashier re-keys the
returned item and rings the new one. The Kiwi exchange page needs a ticket number or the
buyer's phone, so it cannot help. Gift receipts and labels for future sales are the
partner's track, not this one.

## Policy (owner)

Exchange for goods only. Nothing is refunded and no credit note is issued without a
sale: the server caps every credit note at a known sale (`sale-required`,
`sale-credit-exceeds-available`), and that protection stays. The new items must be
worth at least the returned ones; the till says "il reste X MAD à choisir" until they are.

## Approaches considered

1. Find the original sale (scan or search). Rejected: nothing to scan, nothing to search by.
2. Free credit note for the balance. Rejected: a new server money path without a sale cap.
3. **A dedicated −1 / +1 sheet (chosen).** Returned items searched by reference or name,
   valued at today's selling price (promotion included, `lineDeal`), new items searched
   the same way, the difference paid through the normal payment sheet.

## Behaviour

- "Échange sans ticket" button on the Échanges page header.
- Sheet with one search over the catalogue (reference matched with or without
  punctuation, exact and prefix first), two lists: "Rendus" and "Emportés", quantity
  steppers, totals.
- Difference = emportés − rendus. `< 0`: blocked, "il reste X MAD à choisir".
  `0`: confirm. `> 0`: `openPay`, a sale of kind `echange` posted for the difference only
  (the gift was counted when it was sold), lines allocated over the new items in cents.
- Stock: each returned item +qty (`why: 'retour'`), each new item −qty (`why: 'vente'`),
  reference = the exchange number (or `EST-…` when nothing is paid), cashier as actor.
- Returns register: one entry, kind `echange`, reason "Cadeau, sans ticket", items back.
- Whole items only (no loose pieces of a set) in this first version.

## Code

- `assets/pos-maison/gift-exchange-core.js`: pure (search ranking, totals, cent allocation,
  phrase table FR/EN/AR). Tested by `tools/gift-exchange-core-test.mjs`.
- `assets/pos-maison/gift-exchange.js`: the sheet, mounted on demand, own small style.
  Its phrase table lives in the core file because `assets/caisse-lang.js` is frozen by
  the file-size ratchet.
- `assets/pos-maison/gift-exchange-entry.js`: the button label and a lazy `import()` of the
  sheet on first tap. `checkout.js` imports only this entry: a static import of the sheet
  would pull it into the Maison module cycle (`tools/coupling-ratchet-test.mjs`).
- `checkout.js`: the header button and the entry import, on existing lines (the file is at
  its size pin). The Maison split proof is resealed on these edits and the new stamps.
- Browser proof: `tools/maison-gift-exchange-browser-test.mjs` on the demo till.
