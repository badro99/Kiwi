# Kiwi Operator Console — `kiwi-admin.html`

Kiwi's own back-office. One hidden page that lets **us** (the operator, not the
merchant) see every client, their day's sales, open any client's dashboard
remotely, manage staff PINs on their behalf, and toggle which modules each client
sees. Built so a client can phone with "my numbers aren't updating" or "a waiter
quit and I can't remove his PIN" and we fix it from our base — no site visit.

Runs on the **free** Cloudflare Pages + D1 tiers. **Real when the backend is
reachable, seeded demo data otherwise** (so it always demos, even on the local
static server / GitHub Pages).

## How to get in (hidden by design)

There is **no visible button**. On the login screen, **press and hold the logo
(~1.4 s)** — a discreet operator-code prompt appears. Enter an operator code →
lands on `/kiwi-admin.html`. Clients never discover it.

- **Operator codes** live in the D1 `operators` table, hashed exactly like
  passwords (PBKDF2-SHA256). Add/delete them from the console's **Opérateurs**
  panel. We can hold as many as we like.
- **Bootstrap the first code** (no manual hashing): use the existing **staff
  bypass** — on the login screen, "Accès équipe" → the `SITE_PASSWORD` → then open
  `/kiwi-admin.html` directly and add the first operator code(s) in the Opérateurs
  panel. After that, the long-press gesture is the daily door.

## What it does

1. **Clients** — a row per merchant: établissement + contact, merchant key,
   plan, **CA du jour**, ventes, last-sale time, live dot. **"Ouvrir dashboard"**
   opens that client's real dashboard (scoped to their merchant key) so we see
   exactly what they see. **"Gérer"** opens the management panel below.
2. **PINs** (per client) — list / **add** (4-digit + name + role) / **delete**
   staff PINs. Managed remotely so an owner never has to.
3. **Fonctionnalités** (per établissement) — **a switch per module the client can see**,
   in three bands: *Modules communs* (ventes, clients & marketing, terminaux,
   conformité, équipe, paie, réservations, fidélité, dépenses), the client's own
   trade (boutique → inventaire / catégories / promos / retours; restaurant →
   plan de salle / menu / KDS / stock / marges; spa; hôtel), and *Options
   payantes* (Order Pro). **Operator-only authority** — it maps to the pricing
   tier. Turning a module **off hides it in that client's real app** on next load
   (a small snack gets a clean interface, not a maze of buttons it will never
   use); switch off a whole trade section and its sidebar header goes with it.

   The list is a mirror of the dashboard sidebar and has to stay one: a module in
   the sidebar with no switch can't be sold or withheld, and a switch with no
   sidebar node lies to whoever flips it. **Adding a nav entry ⇒ add the switch**
   (`kiwi-admin.html` › `CORE_MODULES` / `VERTICAL_MODULES`) **and tag the node**
   `data-feature="<key>"` — static entries in `dashboard.html`, per-trade ones in
   `assets/venues.js` › `renderVerticalSection()` (tagged automatically from the
   nav id). Only **Accueil** is deliberately unswitchable: it is the dashboard
   itself, not a module.

   Each row states its **state** (Activé / Désactivé) and where that state comes
   from — *réglé pour ce client* (somebody decided it) or *valeur par défaut*
   (nobody has, so the module's own polarity applies). There is no account-level
   inheritance and no plan gate in the product: a module belongs to one
   établissement, and the stored `plan` closes no door. So no state is invented
   for either — the panel says only what is true.
4. **Journal des modules** (per établissement) — every change: which module,
   enabled or disabled, by whom, when. Written by `functions/api/admin/config.js`
   on each real change (a save that alters nothing writes nothing), read back
   from `/api/admin/audit`. Disabling **never deletes data** — the catalogue, the
   bookings, the notes stay in their own tables and come back untouched when the
   module is switched on again.

   *Who* is the operator **code** that was used, not an IP: `kiwi_op` is the same
   cookie for everyone (an HMAC of the secret), so `functions/_middleware.js` also
   sets a signed `kiwi_op_id` when a code is verified. Without it — the shared
   staff bypass, or a session opened before this shipped — the entry reads
   `equipe`, which is honest rather than falsely precise.
5. **Opérateurs** — add / delete operator access codes.

## What a NEW établissement starts with

Five modules are **off by default on any établissement created from 2026-07-27**:
**Terminaux · Conformité · Réservations · Dépenses & cartes · Order Pro**. They
serve only some trades — a neighbourhood snack has no card terminals to list, no
compliance file, no booking book and no expense cards — and shipping them on by
default hands a new client a maze with four empty rooms in it. Nothing is removed
from the product: the operator turns each one on, individually, when the client
actually needs it.

The list and the rule live in `functions/api/config.js` ›
`NEW_STORE_FEATURES`. Two things decide that a store is new:

- **`fresh: true`** in `POST /api/config` — sent by `assets/venues.js` ›
  `createVenue()` at the exact moment an établissement is created (onboarding, or
  the dashboard's venue switcher). This is what covers a **second shop opened by
  an existing client**.
- **a recent account** — `accounts.created_ts >= NEW_ACCOUNT_FROM`. The safety
  net for a browser still running an old cached bundle: a brand-new client always
  starts from the right configuration.

**Existing clients are never touched.** The defaults are only ever written into a
row that has *no* configuration at all (`ON CONFLICT` leaves `features` alone, and
the catch-up `UPDATE` requires `features` to still be `{}`), so a client already
using their réservations keeps them. A merchant cannot switch a module on for
themselves either: `POST /api/config` ignores `features` entirely, and
`/api/admin/config` refuses a plain merchant session with 403.

## Architecture

### Backend (Cloudflare Pages Functions + D1)

New D1 tables in [`schema.sql`](schema.sql): `operators`, `staff_pins`,
`merchant_config`. Bound as `DB` (same binding Live Link + auth already use).

Functions (all under the site gate; the `/admin/*` ones additionally require an
**operator or staff** cookie — a plain merchant session is not enough):

- `functions/api/admin/clients.js` — `GET` roster (accounts ⨝ today's sales ⨝ plan).
- `functions/api/admin/pins.js` — `GET`/`POST`/`DELETE` staff PINs.
- `functions/api/admin/config.js` — `GET`/`PUT` a merchant's feature flags; the
  `PUT` also journals every module it actually changed.
- `functions/api/admin/audit.js` — `GET ?merchant=` the module change history.
- `functions/api/admin/operators.js` — `GET`/`POST`/`DELETE` operator codes.
- `functions/api/config.js` — `GET ?merchant=…` the client apps' own read of
  `{features, pins}` (any authenticated session; a merchant reads its own slug).
- `functions/_middleware.js` — operator cookie is a 3rd "way in"; `POST /__operator`
  verifies a code and sets `kiwi_op` (`HMAC(AUTH_SECRET,"kiwi-operator-v1")`).

**Merchant key = slug of the business name** (`slugMerchant` in
`functions/auth/_lib.js`): "Café Atlas" → `cafe-atlas`, which is also the Live
Link default, so an account lines up with its sales without a stored mapping.

### One client, several établissements

A login can hold more than one store — a boutique and a restaurant — created from
the dashboard's venue switcher. **A store is not a client.** Each store has its
own slug, till, staff, modules and money; the client is the account that owns
them. `merchant_config` carries that link:

- `account_id` — the owning account, claimed **first-write-wins** the first time
  a store syncs (`POST /api/config`), then locked to it. A sync naming a store
  that belongs to someone else is answered `403 merchant-not-yours`, never
  silently redirected.
- `name` — the store's own display name, so the console shows "Café Nord" rather
  than a slug.

`POST /api/config` takes `{merchant, name}` to say **which** store it is syncing;
the session still decides **who** is writing. `GET /api/config?merchant=…` is
honoured for a merchant's own stores and otherwise falls back to the account's
own slug (that fallback is what keeps one merchant from reading another's staff
PINs). `/api/pair/create` resolves the store the same way, so a second shop's
till posts into the second shop's books.

Without this, every store on an account was forced onto the one slug derived from
`accounts.business`: a second shop's onboarding overwrote the first's business
type, the two shared a single staff PIN list, its till paired into the wrong
tenant, and the roster showed it as a nameless ownerless row under "démos".

The console groups the roster by owner: one band per client, its shops beneath.
Deleting a client removes **every** store it owns, and the confirmation says so.

### Client-app consumption (`assets/merchant-config.js`)

Loaded by `dashboard.html`, `kiwi-caisse.html`, `kiwi-serveur.html`. On load it
fetches `/api/config?merchant=<slug>` and:

- **Feature hiding** — for each module toggled off, hides every element tagged
  `data-feature="<key>"` and adds `body.feat-off-<key>`. A sidebar section header
  whose every link is hidden goes too (an empty "BOUTIQUE" band reads as a broken
  page, not as a module the client doesn't have). Surfaces that paint on demand —
  drawers, in-flow pages, the re-rendered trade section — are caught by a
  `MutationObserver` that only runs while something is actually switched off, so
  the common case costs nothing.
- **Doors, not just signs** — the same destination is reachable from search
  (⌘K), a home card, a quick action, the phone tab bar, a caisse control and
  Kiwi AI's "j'ouvre les terminaux" button. They all end at
  `Kiwi.handlers[name]`, so that is where the gate sits: `gateHandlers()` wraps
  `nav-<key>` (nav ids **are** module keys) plus the aliases in
  `HANDLER_ALIASES`, and the wrapper tests the flag **at call time** — switching
  a module back on reopens it with nothing to restore, and a config that never
  arrived (offline, static host) closes nothing. `window.KiwiConfig.off(key)` is
  the same test for callers that need to filter *before* rendering: the command
  palette drops matching results, `assets/agent.js` drops the nav target so the
  assistant answers something else instead of offering a dead button,
  `assets/oppo-cards.js` never deals the card, and
  `assets/orderpro-inbox.js` keeps the caisse's "Commandes" chip off a till whose
  merchant has no Order Pro.
- **PINs** — exposes `window.KiwiConfig.pins` for the caisse/serveur to consult
  **additively** (managed PINs augment the hardcoded defaults; defaults never
  break). A `kiwi-config` event fires when config arrives.

**Fail-safe:** no backend / offline / endpoint missing ⇒ nothing changes. The
pitch demo and existing clients are never at risk.

## Cloudflare setup

Already mostly provisioned (D1 `kiwi-sales` bound as `DB`, `AUTH_SECRET` set). To
enable the console in production:

1. Apply the new tables: re-run [`schema.sql`](schema.sql) (all `CREATE TABLE IF
   NOT EXISTS` — safe to re-apply) in the D1 console, or
   `npx wrangler d1 execute kiwi-sales --file=schema.sql --remote`. This is what
   creates `config_audit` (the module journal). Until it exists the console still
   works and still saves — the panel simply shows "aucun changement enregistré",
   because the journal write is deliberately non-blocking.
2. **Multi-store registry — run once on an existing database.** `CREATE TABLE IF
   NOT EXISTS` will not add columns to a table that already exists, so these two
   `ALTER`s have to be run by hand (each is safe to run once; re-running errors
   harmlessly with "duplicate column name"):

   ```sql
   ALTER TABLE merchant_config ADD COLUMN account_id TEXT;
   ALTER TABLE merchant_config ADD COLUMN name TEXT;
   ```

   Until they are run, everything keeps working exactly as before — a client's
   second établissement simply stays folded into their first, which is the old
   behaviour, not a new failure. Nothing 500s, and no data is written anywhere the
   apps can't read it back.
3. Deploy (push, or Create deployment — not "Retry").
4. First entry: staff bypass → `/kiwi-admin.html` → Opérateurs → add your codes.

No new secret is needed — the operator cookie reuses `AUTH_SECRET`.

## Local proof

`tools/live-mock-server.mjs` serves the site **and runs the real Pages Functions**
against an in-memory SQLite database built from `schema.sql` (`node:sqlite`,
Node 22+, nothing to install). Not a stand-in that imitates the responses — the
code that ships, executed locally, which is the only way to check a rule like
"a new établissement starts with five modules off, an existing client is never
touched" without deploying.

```bash
node tools/live-mock-server.mjs
```

It seeds the contrast that matters: **Amira Boutique** (account opened long
before the cutover, no configuration saved → everything on, exactly as before)
and **Snack Rif** (opened after → the five modules off).

- `/kiwi-admin.html` — the console in **Live · D1** mode, against those two.
- `/dashboard.html` — Amira's app.
- `/dashboard.html?merchant=snack-rif` — the new client's app.
- `/kiwi-caisse.html` — the till (Order Pro chip, staff PINs).

Clear the service worker on first open (DevTools › Application › Service Workers
› Unregister), or it will serve you cached assets instead of your edits.

On the plain static server (`tools/static-server.js`) there is no backend, so the
console runs in **Démo** mode (seeded clients) and the client apps keep their
defaults — exactly what ships to GitHub Pages.
