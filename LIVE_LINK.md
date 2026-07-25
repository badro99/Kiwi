# Kiwi Live Link — real caisse → dashboard connectivity, $0

Turns the demo from "each browser is its own island" into a real link: a sale rung
on the **caisse** (any device) appears on the owner's **dashboard** (any device),
live. Runs entirely on the **free** Cloudflare Pages + D1 tiers.

**Real and paired stores are live automatically** (`KiwiEnv.isReal()` turns the
spine on — no flag needed). The `kiwiLive` / `?live=1` flag described below
remains as the manual switch for ad-hoc use. With neither, the showcase venues
keep their seeded per-browser behaviour — nothing here can disturb them, and
they can never leak into a real store's feed.

> **✅ Provisioned (2026-07-07).** The one-time Cloudflare setup below is already
> done on the `kiwi-maroc` Pages project: D1 database **`kiwi-sales`** created,
> `schema.sql` applied, and bound as variable **`DB`**. Health check
> `GET https://kiwi-maroc.pages.dev/api/sale` returns `{"ok":true,"db":true}`.
> Verified end-to-end in production (a card sale on the caisse appeared on the
> dashboard's live card). To use it, just open the apps with `?live=1` (below).
> The steps in the next section are kept for reference / re-provisioning only.

## How it works

- `functions/api/sale.js` — `POST /api/sale` writes one sale to Cloudflare **D1**.
- `functions/api/feed.js` — `GET /api/feed?merchant=…&since=<cursor>` returns new
  sales since the last one the dashboard saw (SQLite `rowid` is the cursor).
- `assets/live-link.js` — the caisse calls `postSale()` from `recordSale()` (every
  tender: cash / card / QR / split), **and the serveur calls it from
  `markTablePaid()`** whenever a table is settled (card · cash · split); the
  dashboard polls `/api/feed` every ~3.5 s and shows results in an
  **"EN DIRECT · VENTES"** card it fully owns (each row self-identifies — a caisse
  ticket vs. a `Table Tx`; the simulated feed is never touched).
- Both `/api` calls are same-origin, so they ride **behind the passcode gate**
  automatically (a device must be unlocked once). The service worker is set to
  **never cache `/api/*`**, so the poll is always fresh.

## One-time Cloudflare setup (~3 clicks + a paste)

Everything below is on the free tier. Do it once on the `kiwi-maroc` Pages project.

1. **Create the database** — Cloudflare dashboard → **Workers & Pages → D1 →
   Create database** → name it `kiwi-sales`.
2. **Create the table** — open the new DB → **Console** → paste the contents of
   [`schema.sql`](schema.sql) → Run. (Or, with the CLI:
   `npx wrangler d1 execute kiwi-sales --file=schema.sql --remote`.)
3. **Bind it to the site** — Pages project **kiwi-maroc → Settings → Functions →
   D1 database bindings → Add binding**:
   - **Variable name:** `DB`  ← must be exactly this (the Functions read `env.DB`)
   - **D1 database:** `kiwi-sales`
4. **Redeploy** — Deployments → **Create deployment** (or push a commit). Do **not**
   use "Retry deployment" — a retry replays the old env snapshot without the new
   binding (same gotcha as `SITE_PASSWORD` in `DEPLOY.md`).

That's it. `GET https://kiwi-maroc.pages.dev/api/sale` (while unlocked) should
return `{"ok":true,"db":true}` once the binding is live.

## Turn it on for the devices

Live mode is per-device, opt-in:
- Open the caisse and the dashboard **once** with `?live=1` appended
  (`…/kiwi-caisse?live=1`, `…/dashboard?live=1`) — it's remembered, or
- set `localStorage.kiwiLive = '1'` on each device.

Now ring a sale on the caisse → it appears on the dashboard's live card within a
few seconds, across devices. One demo tenant (`cafe-atlas`) for now; override per
device with `localStorage.kiwiLiveMerchant`.

## Honest limits (this is a pilot bridge, not the full backend)

- **Polling, not push.** ~3.5 s latency. True realtime push (WebSocket) on
  Cloudflare needs Durable Objects → the paid Workers plan (~$5/mo). Polling stays
  free and feels live.
- **No offline queue yet.** If the caisse is offline when a sale is rung, that
  POST is dropped (best-effort). The queue-and-sync layer is the next phase — the
  service worker + the online/offline dot are the plumbing for it.
- **Auth = the passcode gate only.** Good enough for a single-merchant pilot; real
  multi-tenant needs per-merchant keys + auth.
- **Free-tier quotas** (D1 rows/day, Functions 100k req/day) are ample for a pilot,
  not for a large always-on fleet.

## Optional: wrangler.toml (CLI users only)

If you deploy/bind via the `wrangler` CLI instead of the dashboard, add a
`wrangler.toml` at the repo root (kept out of the repo so it can't disturb the
dashboard-managed build):

```toml
name = "kiwi-maroc"
pages_build_output_dir = "."
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "kiwi-sales"
database_id = "<your-d1-database-id>"
```

## Local proof (no Cloudflare needed)

`tools/live-mock-server.js` is a throwaway that mirrors the two endpoints in memory
and serves the site, so the whole loop can be verified locally:

```
node tools/live-mock-server.js        # http://localhost:4181
# open /dashboard.html?live=1 and /kiwi-caisse.html?live=1
```
