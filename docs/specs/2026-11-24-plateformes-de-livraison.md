# Plateformes de livraison · one menu per delivery app

Status: design locked with the owner on 2026-11-24 (second pass: presets with logos, in-house delivery, one option is enough), not built yet.
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
until the owner turns on **one** delivery option in the dashboard (a platform or
in-house delivery; one is enough, not two). Remove the last one and it all
disappears again. A store with none gets the same till, the same menu editor,
the same Z report and the same dashboard as today.

## Dashboard · setup

**Réglages › Livraison.** The owner turns on the options they use. Two kinds.

### Platforms (Glovo, Kooul, Yassir, or another)

Three presets, each with its real logo and brand colour already filled in:

| Preset | Logo | Colour |
| --- | --- | --- |
| Glovo | `assets/brands/delivery/glovo.png` | `#FFC244` |
| Kooul | `assets/brands/delivery/kooul.png` | `#FC3C53` |
| Yassir | `assets/brands/delivery/yassir.png` | `#6316DB` |

« Kool » as owners say it is **Kooul** (ORA Technologies, 800+ restaurants in
Morocco), not the inactive « Kool Delivery » app on the App Store.

« Autre plateforme » adds any other app: name, plus a colour from a fixed set;
its badge is the first letter on that colour.

Each platform carries a commission in % and an optional fixed fee per order in
MAD. All platforms pay by card straight to the restaurant's bank account, so
there is no cash-collection setting.

### In-house delivery (« Livraison maison »)

The restaurant's own driver. Menu prices do **not** change: the order uses the
dine-in prices, and a fixed delivery fee set by the owner (« Frais de
livraison : 20 MAD ») is added as its own line on the ticket. No commission.
The customer pays the restaurant directly (cash or card, the normal tenders),
so this money does go into the drawer and the card total like any sale. The
badge is the Material `two_wheeler` icon, never a third-party logo.

### Logos and the skins

A logo is always the platform's own app icon in a rounded tile; it carries its
own background, so it reads the same on the classic skin and on 2027, light and
dark. Everything around it (chip ground, name, order number) uses our tokens,
never the platform colour, so contrast holds in every theme. The platform
colour appears only as a thin stripe on the till band. These are the one
exception to « Material Symbols only »: they are not icons, they identify a
third party, and they must never be recoloured or redrawn. See
`assets/brands/delivery/README.md`.

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
   when a delivery option is on). Tapping it opens the owner's options as
   tiles: each platform with its logo, plus « Livraison maison ». With a single
   option, the pill opens straight onto it.
2. The option is picked **before** any item and cannot be switched once lines
   exist on the order.
   - **Platform:** the menu shows that platform's prices, with a band across
     the top carrying the logo and name (« Glovo · prix Glovo ») and a thin
     stripe in the platform colour. Items without a price for this platform are
     greyed out.
   - **Livraison maison:** the menu keeps the dine-in prices; the delivery fee
     line is added to the order automatically and shown above the total.
3. One optional field, focused but skippable: the platform's order number
   (`A3F9`), or the customer's name and phone for in-house delivery. It goes on
   the kitchen ticket and the KDS. If the same platform number was already
   entered today, Kiwi shows a quiet warning; it never blocks.
4. No total check, no required field. The send button carries the total
   (« Envoyer · 153 MAD ») so the cashier can glance at the platform tablet if
   they want to.
5. Send. Kiwi does the rest: kitchen, payment, reports.
   - Platform orders are recorded as paid by the platform (tender `platform`,
     with the platform id), never as cash or card.
   - In-house orders are paid normally (cash or card) when the driver comes
     back or at the door.

## Badges · till, kitchen ticket and KDS

Every delivery order wears the same badge wherever it appears: logo tile, name,
order number (« [logo] Glovo A3F9 », « [moto] Maison #214 »).

- **Till:** the À emporter board, the open-order list, the order detail and the
  sales history. The order waits on the board with its badge until « Remis au
  livreur ».
- **KDS:** the same badge. `kds-model.js` already draws hardcoded `glovo` and
  `yassir` chips (and `caisse-shell.css` styles them in orange and blue); both
  are replaced by the owner's list, so any option shows its real logo.
- **Printed kitchen ticket:** thermal printers print text, so the header is the
  name and number in large type: « GLOVO · A3F9 », « LIVRAISON MAISON · #214 ».

## Reports

Every delivery option is its own channel, shown by name, never pooled.

- **Rapport Z.** A « Livraison » block, one line per option:
  `Glovo : 4 000 MAD`, `Kooul : 1 250 MAD`, `Livraison maison : 900 MAD
  (dont frais 120 MAD)`. Platform amounts are not in the cash count and not in
  the card terminal total. In-house amounts are already inside cash and card,
  and the line only shows how much of the day came that way.
- **Dashboard home.** Revenue is gross: it includes platform sales at the
  prices the customers paid, and in-house delivery fees. A channel breakdown
  (Salle, À emporter, Glovo, Livraison maison…) appears only when a delivery
  option is on.
- **Net figures (Marges & budget / expenses).** Per platform: gross revenue,
  minus commission (and fixed fees), gives net revenue. Minus food cost from
  KiwiCost gives net profit. Commission shows as its own expense line per
  platform (« Commission Glovo »).

## Build order

1. Delivery options in the dashboard (presets with logos, other platform,
   in-house fee) and the price row on the product card; public-menu test that
   platform prices never leak.
2. Till: Livraison mode, platform prices, in-house fee line, order number,
   `platform` tender, badges on the board and history.
3. Kitchen ticket header and KDS badge from the owner's list.
4. Z report block and dashboard channel breakdown.
5. Net revenue, commission expense lines and net profit.
