# Kiwi directory (annuaire): design

Status: agreed direction, not built. Written 29 October 2026 from the owner's decisions in session.

## Intent

A public directory of Moroccan businesses, city by city, that does two jobs at once:

- **For customers:** find a café, restaurant, boutique or shop and see what it offers.
- **For Kiwi:** every business that lists itself is a warm lead, and every Kiwi client gets a listing that
  non-clients cannot match.

Any business can list itself for free, the way Google Business Profile works. Becoming a Kiwi client is the
upgrade, and a visitor can see the difference on the page.

## Why the premium line draws itself

| Free listing | Kiwi client listing |
|---|---|
| Name, photos, hours, phone, address | Everything in the free listing |
| Optionally a photo of the menu | The real menu and prices, straight from the till |
| Static, updated by hand | Live: "open now", sold-out items, today's specials |
| | Book a table (booking link), order from the table (QR), several languages |

Competitors cannot copy the right column, because it needs the till's data.

A paid "featured" spot in a city or category is a later, second revenue line, open to clients and non-clients.

## Goals

1. A public page for each Kiwi client, built from data that already exists.
2. Free self-signup listings for any business, each one landing in the operator console as a lead.
3. City and category pages that Google can index.
4. Later: paid featured spots.

## Non-goals (for now)

- **No reviews.** They need moderation, and fake reviews would sink trust. Revisit once the directory is busy.
- **No listings copied from Google Maps or anywhere else.** It breaks their terms and lists people without
  consent. Every listing is claimed by its owner.
- **No SMS verification.** It costs money per message and breaks the zero-cost rule. The team verifies by
  call or visit instead, which doubles as a sales contact.
- **No payment flow** until paid spots ship.

## Anti-goals (would make it a failure even if it works)

- Ranking that looks bought. Paid spots carry a visible "Sponsorisé" label, and normal ranking depends on how
  complete and fresh a listing is, never on who pays. Kiwi clients win that ranking naturally because their
  listings are live.
- A directory that looks empty. Open one city and one or two categories, seed them until they look full, and
  only then open the next.
- Leaking anything private. A public page shows only what the merchant chose to publish: never staff, codes,
  sales figures or customer data (CLAUDE.md §6).

## Build order

### Step 1: the public merchant page (Kiwi clients)

- One URL per merchant, built from data already in D1 and the store docs: name, address, hours, menu
  (`functions/api/menu.js`, translations from `_menu-langs.js`), booking link (`booking.html`,
  `functions/api/booking.js`), table ordering (`kiwi-order.html`).
- The page format must also render a reduced "basic listing" variant, so step 2 reuses it unchanged.
- The merchant chooses what is public (a switch per block in the dashboard). Default: name, address, hours,
  menu. Nothing else until switched on.
- Structured data (`LocalBusiness` / `Restaurant` / `Menu`) so search engines read it.

### Step 2: free self-signup listings

- A public form ("Inscrire mon commerce"): business name, trade, city, address, phone, hours, photos.
- Defend it like `POST /api/demo-request` already is: same origin only, a honeypot field, the shared rate
  limiter, every field bounded and typed.
- Each sign-up is stored as a pending listing and appears in the operator console as a lead (next to demo
  requests), mirrored to `LEADS_WEBHOOK` like sign-ups are.
- A listing goes public only after the team verifies it (call or visit). Verification status is visible to the
  operator, never invented.
- The homepage prototype's directory form (today it opens WhatsApp with a prepared message) switches to this
  endpoint once it exists.

### Step 3: city and category pages

- `/annuaire/<ville>/` and `/annuaire/<ville>/<métier>/`, static enough to be cached and indexed.
- Ranking: completeness and freshness of the listing. Live Kiwi listings rank first because they are
  complete and fresh, not because of a rule that favours them.
- Start with one city (Casablanca, to be confirmed) and one or two trades.

### Step 4: paid featured spots (later)

- A labelled slot at the top of a city or category page, time-boxed.
- Needs a payment flow for non-clients; clients can be billed with their subscription.

## Open questions for the owner

1. Which city opens first, and which trades.
2. Whether a free listing can show a photo of the menu, or only clients get a menu.
3. Who on the team verifies listings, and how fast (this sets how many sign-ups we can accept per week).
4. Price and duration of a featured spot.

## What is left to the builder

URL scheme, D1 table shape for listings (with a `migrations/NNNN_*.sql` file, CLAUDE.md §3), the page's
design (it follows the Kiwi brand system), and caching.
