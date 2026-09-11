# Deploying Kiwi for a client — $0 hosting + passcode gate

Kiwi deploys as a static site (HTML/CSS/JS, no build step today — if a build is
ever introduced, it ships its output here the same way). It hosts for free on
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

## 4. Post-deploy schema attestation (mandatory after schema-affecting releases)

`schema.sql` describes a FRESH database. A live database never receives it —
`CREATE TABLE IF NOT EXISTS` does not add columns to tables that already
exist — so after any release that touches `schema.sql`, attest the deployed
base with the read-only command (needs `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` in the environment):

```bash
node tools/d1-schema.mjs
```

- Exit **0** : the deployed base matches `schema.sql` — nothing to do.
- Exit **1** : drift — the output names every missing table, column and
  index. Do not ship features that depend on them until this is green.
- Exit **2** : the check itself errored (credentials, network) — attestation
  did NOT happen; fix access and re-run, never assume green.

`--apply --yes` (`node tools/d1-schema.mjs --apply --yes`) is a SEPARATE
migration authorization, not part of attestation: it WRITES additive orders
to the live base. Read the plan it prints, confirm each statement, and only
then authorize it explicitly. Attestation itself never writes.

## Notes

- The gate (`functions/_middleware.js`) sits in front of the whole app **and**
  the `/api/*` backend (accounts, pairing, Live Link, orders — see `LIVE_LINK.md`
  and `ADMIN.md`), so API calls ride behind it automatically — whatever the
  frontend is built with.
- The gate runs **only on Cloudflare Pages** — it is inert on the local static
  server and on GitHub Pages, which have no serverless layer.
