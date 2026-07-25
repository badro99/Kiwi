# Kiwi

**Le système d'exploitation du commerçant marocain — point-of-sale first.**

Kiwi gives Morocco's cafés, restaurants, shops, spas, and hotels the tools
Square, Toast, and Stripe reserved for developed markets: an owner dashboard, a
full register (caisse), a server mobile app, and QR/NFC client ordering — in
French, English, and Arabic, with full RTL.

## This is a live product

Kiwi runs on a real backend and real hardware — it is **not** a mock or a pitch
prototype:

- **Cloudflare Pages Functions + D1** (`functions/`, `schema.sql`) — accounts
  and auth, merchant configuration, caisse↔dashboard pairing, live sales sync
  (Live Link), client book, menus, QR/NFC orders, and the operator console.
- **Kiwi Printer Bridge** (`bridge/`) — a local helper that relays ESC/POS jobs
  to networked thermal printers: real receipts, kitchen tickets, barcode
  labels, cash-drawer kick.
- **Fail-soft by design** — every surface keeps working degraded (per-device
  `localStorage`) when the network or a peripheral is unreachable, and
  reconciles when it's back.

A set of pre-seeded showcase venues (Café Atlas & co.) still exists for
demonstrations; real paired stores never see that seed data.

## The surfaces

| File | Surface | Audience |
|---|---|---|
| `dashboard.html` | Owner dashboard — revenue, KPIs, stock, team, clients | Merchant owner |
| `kiwi-caisse.html` | Register / checkout (caisse), multi-vertical | Cashier |
| `kiwi-serveur.html` | Server mobile app — tables, orders | Floor staff |
| `kiwi-order.html` | Client ordering via QR / NFC (white-label) | The merchant's customers |
| `kiwi-admin.html` | Operator console — clients, sales, PINs, modules | Kiwi (internal) |
| `index.html` | Marketing landing page | Prospects |

## Stack

- **Frontend:** vanilla HTML / CSS / JavaScript — no framework, no build step.
  A deliberate choice (fast, zero-toolchain, trivially hostable), not a
  limitation. Open any `.html` file directly, or serve the folder statically.
- **Backend:** Cloudflare Pages Functions + D1 (`functions/`, `schema.sql`).
  Client state persists in `localStorage`; server-authoritative data lives
  in D1.
- **Design system:** tokens in `assets/tokens.css`; translations in
  `assets/i18n.js` (FR is the source text, `en`/`ar` dictionaries hold the
  rest).

## Key documents

- **`AI_HANDOFF.md`** — the current-state brief: what's true right now, recent
  work, gotchas. Read this first when resuming work.
- **`LIVE_LINK.md`** — the caisse → dashboard live sales spine (D1).
- **`ADMIN.md`** / **`AUTH.md`** — operator console and accounts/auth.
- **`DEPLOY.md`** — hosting and the edge passcode gate on Cloudflare Pages.
- **`CLAUDE.md`** — operating rules for AI agents working on this repo.
- **`HANDOFF.md`** — full project history (brand system, roadmap context).

## Status at a glance

- ✅ Live backend — accounts/auth, till pairing, sales sync, clients, menus,
  orders (Cloudflare Pages Functions + D1)
- ✅ Real thermal printing via the Kiwi Printer Bridge
- ✅ Multi-vertical caisse + owner dashboard (Simple/Pro), hotels included
- ✅ FR / EN / AR with RTL
- ⬜ Payment processing — license-gated (Bank Al-Maghrib); scoped in
  `KIWI_2.0_ROADMAP.md`
