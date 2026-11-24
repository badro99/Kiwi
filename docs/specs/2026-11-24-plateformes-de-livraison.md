# Plateformes de livraison · one menu per delivery app

Status: design locked with the owner on 2026-11-24, not built yet.
First user: a restaurant client that is also Kiwi's first KDS user.

## The problem

Delivery apps in Morocco (Glovo and smaller local ones) take a percentage
commission, so restaurants list higher prices on them. Today those orders never
reach Kiwi, so the owner has no complete view of revenue. The cashier reads each
order on the platform's own tablet and has nowhere to type it with the right
prices.

Kiwi does not connect to any platform. Entry is manual by design.

## Who sees it

Nothing changes for an existing restaurant. Every surface below stays hidden
until the owner adds at least one platform in the dashboard. Remove the last
platform and it all disappears again. A store with no platforms gets the same
till, the same menu editor, the same Z report and the same dashboard as today.

## Dashboard · setup

**Réglages › Plateformes de livraison.** One row per platform:

- name (free text: « Glovo », « Livreur X »);
- colour (picked from a fixed set of brand-safe colours, used on the till,
  kitchen ticket and KDS);
- commission in % (optional fixed fee per order in MAD).

All platforms pay by card straight to the restaurant's bank account, so there is
no cash-collection setting.

Commission and fees are owner-only data. They live in their own store doc next
to KiwiCost, never on a menu item, and never in `/api/menu`.

**Product card.** When at least one platform exists, the single price becomes a
row: `Sur place · Glovo · Livreur X · …`. An empty platform price means « not
sold on this platform ». Option and extra prices get the same row. A bulk helper
fills a whole platform from the dine-in prices: « +25 % sur toute la carte,
arrondi au dirham ».

**OrderPro is untouched.** It reads the restaurant's own menu and dine-in prices
only. Platform prices must never appear in the public menu response. A test must
hold this.

## Till · taking an order

1. A **Livraison** pill joins Salle and À emporter in the mode selector (only
   when platforms exist). Tapping it opens the list of the owner's platforms,
   each in its colour. With a single platform, the pill opens straight onto it.
2. The platform is picked **before** any item. The menu then shows that
   platform's prices, with a band in the platform's colour across the top
   (« Glovo · prix Glovo »). Items without a price for this platform are greyed
   out. The platform cannot be switched once lines exist on the order.
3. One optional field, focused but skippable: the platform's order number
   (`A3F9`). It goes on the kitchen ticket and the KDS. If the same number was
   already entered today, Kiwi shows a quiet warning; it never blocks.
4. No total check, no required field. The send button carries the total in the
   platform's colour (« Envoyer · 153 MAD ») so the cashier can glance at the
   platform tablet if they want to.
5. Send. Kiwi does the rest: kitchen, payment, reports. The sale is recorded as
   paid by the platform (tender `platform`, with the platform id), never as
   cash or card.

## Kitchen ticket and KDS

The printed kitchen ticket opens with the platform name and order number in
large type: « GLOVO · A3F9 ».

The KDS shows the same chip in the platform's colour. `kds-model.js` already
draws hardcoded `glovo` and `yassir` chips; replace them with the owner's
platform list so any name and colour works.

The order waits on the À emporter board with the platform badge until
« Remis au livreur ».

## Reports

Every platform is its own channel, shown by name, never pooled.

- **Rapport Z.** A « Plateformes » block, one line per platform:
  `Glovo : 4 000 MAD`. These amounts are not in the cash count and not in the
  card terminal total.
- **Dashboard home.** Revenue is gross: it includes platform sales at the
  prices the customers paid. A channel breakdown (Salle, À emporter, Glovo,
  Livreur X…) appears only when platforms exist.
- **Net figures (Marges & budget / expenses).** Per platform: gross revenue,
  minus commission (and fixed fees), gives net revenue. Minus food cost from
  KiwiCost gives net profit. Commission shows as its own expense line per
  platform (« Commission Glovo »).

## Build order

1. Platform list in the dashboard and the price row on the product card;
   public-menu test that platform prices never leak.
2. Till: Livraison mode, platform prices, order number, `platform` tender.
3. Kitchen ticket header and KDS chip from the platform list.
4. Z report block and dashboard channel breakdown.
5. Net revenue, commission expense lines and net profit.
