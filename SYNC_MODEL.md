# Kiwi — How the Three Surfaces Stay in Sync

> Pitch-ready narrative for the question every technical investor asks:
> *"An order is taken on the server's phone — how does it reach the cashier and the owner's dashboard?"*

> **✅ Built (July 2026).** The architecture below is no longer a plan — it is
> what runs in production. The "Venue Service" is Cloudflare Pages Functions +
> D1 (`functions/`, `schema.sql`): sales rung on the caisse or settled on the
> serveur reach the owner's dashboard on any device (Live Link — see
> `LIVE_LINK.md`), tills bind to their store via pairing (`/api/pair/*`), and
> QR/NFC client orders flow through `/api/order/*`. The "wire it in-browser
> for the demo" section at the end is the historical stepping stone that
> preceded the real backend.

## The starting point (as of May 2026, when this was written)

Kiwi was then a **fidelity prototype**. The three surfaces — `kiwi-serveur.html`
(server mobile app), `kiwi-caisse.html` (cashier register), `dashboard.html`
(owner dashboard) — each ran on their own client-side mock data with
**no sync between them**. This document was the architecture to build next —
which has since happened (see the note above).

## The model: one venue ledger, three thin clients

The surfaces never talk to each other. They all read from and write to a
single **Venue Service** — the one source of truth per venue (café/restaurant).

```
   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
   │  kiwi-serveur    │     │  kiwi-caisse     │     │   dashboard      │
   │  (server phone)  │     │  (cashier tablet)│     │  (owner)         │
   └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
            │ write order            │ read tickets           │ read aggregates
            │                        │ write payment          │
            ▼                        ▼                        ▼
        ╔═══════════════════════════════════════════════════════════╗
        ║              VENUE SERVICE  (single source of truth)        ║
        ║   order store · ticket state machine · payment ledger       ║
        ║   live event stream (WebSocket / SSE)                       ║
        ╚═══════════════════════════════════════════════════════════╝
```

### The lifecycle of one order

1. **Server creates it.** On `kiwi-serveur`, the server picks table 7, adds
   items, hits *Envoyer la commande*. The app `POST`s the order to the Venue
   Service. The order now exists once, server-side, with a stable `orderId`
   and state `OPEN`.
2. **Kitchen + cashier see it instantly.** The Venue Service pushes a
   `order.created` event over its live stream. `kiwi-caisse` (and the KDS) are
   subscribed — the new ticket appears on the register within a second. No
   peer-to-peer messaging; the cashier simply observes the shared ledger.
3. **Cashier settles it.** When the customer pays, `kiwi-caisse` `POST`s a
   payment against `orderId`. The Venue Service moves the order to `PAID` and
   emits `order.paid`.
4. **Dashboard updates.** `dashboard` subscribes to the same stream, but to an
   *aggregated* view: `order.paid` increments today's revenue, the live feed,
   the covers count, the hourly heatmap. The owner sees it without refreshing.

Because every surface derives its view from the same ledger, they cannot
disagree. A "live transaction feed" is just the dashboard's projection of the
event stream — not a separate data source.

### Why this is the right shape

- **One source of truth.** Conflicts are impossible: there is exactly one
  order record, with one state machine (`OPEN → SENT → PAID / VOID`).
- **Surfaces are disposable.** Lose the cashier tablet mid-service — the orders
  are safe on the Venue Service; any device re-subscribes and is current.
- **Offline-tolerant.** Each surface keeps an outbox: writes queue locally when
  the connection drops and reconcile on reconnect, keyed by `orderId` so
  retries are idempotent. Critical for Moroccan venues with patchy Wi-Fi.
- **The dashboard scales to many venues.** An owner with three cafés subscribes
  to three venue streams; cross-venue analytics is just aggregation on top.

## What we wire into the demo now (low-cost, high-credibility)

We do **not** need a backend to kill the "it's three disconnected mockups"
objection. In-browser, same-origin, this is a few hours of work:

- A tiny shared `KiwiBus` module: a `BroadcastChannel('kiwi-venue')` plus a
  `localStorage`-backed order store, included by all three pages.
- `kiwi-serveur`'s *Envoyer la commande* writes a real order into that store
  and broadcasts `order.created`.
- `kiwi-caisse` listens and renders the ticket live; settling it broadcasts
  `order.paid`.
- `dashboard`'s live feed and KPI counters listen and increment.

Open the three pages in three browser tabs and an order genuinely flows
serveur → caisse → dashboard in real time. That is the demo that survives a
technical investor — it shows the *architecture is real*, even while the
backend is still simulated. The `BroadcastChannel`/`localStorage` layer is a
faithful local stand-in for the Venue Service stream; swapping it for a real
WebSocket later changes one module, not the surfaces.

## One-line pitch answer

> "Each device is a thin client over a per-venue ledger. The server writes the
> order once; the cashier and the dashboard subscribe to the same live stream,
> so they're always looking at the same truth — and it keeps working offline."
