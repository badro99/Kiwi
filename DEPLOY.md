# Deploying Kiwi for a client — $0 hosting + passcode gate

Kiwi is a static site (vanilla HTML/CSS/JS, no build step). It hosts for free on
Cloudflare Pages, with a real, server-side passcode gate and a clean URL — all on
the free tier.

## What "hosted" means here (be honest with the client)

The deployed site is the **real product**: every screen, the caisse, the
dashboard, all verticals, trilingual FR/EN/AR — backed by a live Cloudflare
D1 backend (`functions/`, `schema.sql`). Concretely:

- **Data syncs across devices.** Accounts/auth, caisse↔dashboard pairing, live
  sales (Live Link), clients, menus, and QR/NFC orders are server-authoritative
  in D1. A sale rung on the till appears on the owner's phone.
- **Fail-soft:** if the backend is unreachable, each surface keeps working on
  per-device `localStorage` and reconciles when it's back.
- The one honest limit: **Kiwi does not process payments itself yet** — no
  settlements or DGI filings. That layer is license-gated (Bank Al-Maghrib)
  and scoped in `KIWI_2.0_ROADMAP.md`; the merchant's existing acquirer keeps
  handling money movement.

## 1. Host on Cloudflare Pages (free)

1. Go to **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the `badro99/Kiwi` repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. **Save and Deploy.** Done — every push to the branch auto-redeploys.

Cloudflare serves it worldwide with unlimited bandwidth on the free tier.

## 2. Turn on the passcode gate

The gate is already in the repo: `functions/_middleware.js`. It runs on every
request at Cloudflare's edge — until the visitor enters the passcode, **nothing**
is served (not a page, not a CSS file, not an image). This is real protection, not
a client-side overlay that view-source could bypass.

To activate it:

1. Cloudflare Pages project → **Settings → Environment variables → Production**.
2. Add a variable:
   - **Name:** `SITE_PASSWORD`
   - **Value:** *(the passcode you hand the client — e.g. a word + a few digits)*
3. **Save**, then trigger a **brand-new deployment** — push a commit (or Deployments
   → *Create deployment*). **Do _not_ use "Retry deployment":** a retry replays the
   previous deployment's frozen env snapshot, so a variable you added *after* that
   deployment (like `SITE_PASSWORD`) will be missing and the gate will silently
   fail open. Only a freshly created deployment picks up new/changed variables.

Now visitors see a branded "Accès privé" screen and must enter the passcode. It is
remembered on that device for 30 days.

- **The passcode is stored only in Cloudflare — never in this repo.**
- **To change or revoke access:** edit `SITE_PASSWORD`, then create a new deployment
  (not a retry). Every existing device is logged out immediately (cookies are derived
  from the passcode).
- **To disable the gate entirely:** delete the `SITE_PASSWORD` variable and create a
  new deployment.

## 3. A nice URL

- **Free:** the project ships on `‹project-name›.pages.dev`. Choose a good project
  name at creation (e.g. `kiwi-app` → `kiwi-app.pages.dev`). Renamable later.
- **Branded (~$10–15/yr):** buy a `.com` (e.g. via Cloudflare Registrar at cost),
  then Pages project → **Custom domains → Set up a domain**. SSL is automatic and
  free. This is the credible choice for a real client.
- **`.ma` (~250–400 MAD/yr + local paperwork):** a Moroccan registrar (Genious, HB,
  etc.). Skip until past the pilot.

## Notes

- The gate (`functions/_middleware.js`) sits in front of the whole app **and**
  the `/api/*` backend (accounts, pairing, Live Link, orders — see `LIVE_LINK.md`
  and `ADMIN.md`), so API calls ride behind it automatically. The frontend
  itself stays 100% vanilla.
- The gate runs **only on Cloudflare Pages** — it is inert on the local static
  server and on GitHub Pages, which have no serverless layer.
