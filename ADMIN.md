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

0. **Vue d'ensemble** — the first screen, and the only one that talks about *us*
   rather than about a client. Four figures, a 30-day curve, two rankings:
   **combien de clients** (counted by account, not by établissement — one login
   can hold a boutique and a café), **notre MRR**, **ce que nos clients
   encaissent** (30 days, sales count, average basket), and **les villes**.
   Served by `/api/admin/overview` in one call, because computing it in the
   browser would mean downloading every merchant's every sale to produce four
   numbers.

   Three rules make the figures worth looking at:
   - **Demos never count.** An établissement no account owns is demo data — it
     is counted separately and never added to the real park.
   - **Voided sales never count.** A sale taken out of a merchant's books
     (`sales.void_ts`) cannot come back into ours.
   - **What we don't know is said, not estimated.** An établissement with no
     city is counted as *non situé*, never filed under "autre" — a city ranking
     built on half the park and presented as complete decides real budgets. A
     tier with no list price and no agreed amount lands in *sans tarif*, never
     as zero. Columns not yet applied to the database are announced as absent
     rather than rendered as a zero that looks like a fact.

   **MRR** = the agreed amount when one is entered, otherwise the tier's list
   price (basic 199 · pro 399 · ultra 1 499). **Ultimate is sur devis** and has
   no list price — that is exactly why `merchant_config.mrr` exists. A suspended
   établissement leaves the MRR and its shortfall is stated.

   The method is printed under the figures. A dashboard that doesn't say what it
   counts gets taken on trust, and that is how a decision gets made on a
   perimeter nobody had understood.

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
5. **Ventes de test** (per établissement) — see below.
6. **Compte & adresses e-mail** (per client) — see below.
7. **Historique administratif** (per établissement) — modules, test sales and
   account changes in one list, newest first. Three tables server-side
   (`config_audit`, `sale_audit`, `account_audit`), merged by
   `functions/api/admin/audit.js`, because they tell one story — what Kiwi did to
   this client's account — and "what happened at their place in July" should not
   take three screens. Nothing is ever removed, not even when a gesture is
   undone: *taken out on the 12th, put back on the 14th* is exactly what a
   dispute asks for.
8. **Opérateurs** — add / delete operator access codes.
9. **Fiche commerciale** (per établissement) — **ville** and **abonnement
   convenu**. The two things only *we* know about a shop, and nothing in the
   database carried them before: no account and no store record held a city,
   and nothing said what a subscription is worth. Both are operator-entered
   (`merchant_config.city` / `.mrr`), never client-entered, and they are what
   feeds the Vue d'ensemble — without a city an établissement is counted *non
   situé* there, never filed elsewhere. The amount is **optional**: left empty,
   the tier's list price applies. Filled, it wins — which is how an Ultimate
   deal or an agreed discount gets recorded. Saving goes through
   `/api/admin/config`, so it demands a **named operator code**: these are our
   commercial figures, not a display setting.

   A database missing the two columns still saves the modules and says the city
   was **not** kept, rather than reporting a half-done save as done.

**Searching the roster.** The client list filters as you type on établissement,
city, contact name, e-mail, merchant key and plan. Accents are folded on both
sides — typing `fes` finds *Fès*, and typing `Fès` finds a record entered
`Fes`. The filter applies to the **établissement**, then the owner grouping is
rebuilt on what survives: searching *Rabat* returns the Rabat shop, not both
shops of an owner whose other one is in Tanger.

## Two levels of operator

Reading the console and **acting on a client's books or access** are not the same
authority, and since this release they are not the same permission.

| | opens the console | sees everything | can act |
|---|---|---|---|
| **Operator code** (`operators` table → `kiwi_op`) | ✅ | ✅ | ✅ |
| **Accès équipe** (shared `SITE_PASSWORD` → `kiwi_gate`) | ✅ | ✅ | ❌ |
| client / cashier / établissement manager (`kiwi_sess`) | ❌ | ❌ | ❌ |

`SITE_PASSWORD` is a **shared** secret — it also opens the demo site, and several
people know it. It can prove "somebody who knows the team passcode", which is a
list of suspects, not a responsibility. Taking a sale out of a merchant's books,
changing a login address or firing a password reset must carry a name, so those
three demand a personal operator code (`isSeniorOperator()` in
`functions/auth/_lib.js`). The panels stay fully **visible** on the staff bypass
and say why the buttons are closed — create yourself a code under *Opérateurs*
and reopen the console with it. A merchant session is not admitted at all: every
`/api/admin/*` route refuses it with 403.

## Ventes de test

An installation, a training session, a printer check leave **real rows in a real
merchant's books**. The operator has to be able to take them out of the figures —
but `DELETE` on a financial record has no way back, and a support console that
erases sales will one day erase the wrong one.

So nothing is erased. `sales.void_ts` is stamped and `/api/feed` stops serving the
row; the amount, the basket, the time and the receipt reference stay in the
database. Clearing `void_ts` puts the sale back **identical** — the gesture is
reversible both ways, and both ways are journalled.

**Search** by receipt number, label, transaction id, date range, amount range,
payment method, and by state (*dans les livres* / *sorties* / *toutes*). Click a
row to open the **full transaction** — every basket line with quantity, category
and amount — before doing anything. Tick one or several, then *Marquer comme
ventes de test…*.

**Before it happens, God mode shows what it costs.** Revenue removed, sale count,
average basket, per-method breakdown, and two lists it is careful to separate:

- **corrects itself** — revenue, number of sales, average basket, product
  ranking, payment split, the daily report of an *open* day, accounting exports
  and Kiwi AI's answers. All of them recompute from the feed, which is why the
  exclusion sits in `functions/api/feed.js` and nowhere else. One filter fixes
  every surface; ten filters would have missed one.
- **you must do by hand** — **stock** and **loyalty**. A sale line carries the
  product *name*, not the variant id (colour × size) that was decremented, and no
  column links a sale to a customer record. Kiwi lists exactly what to put back,
  with the figures, and records it in the journal — guessing a variant from a name
  corrupts a real inventory about one time in ten, and inventing the reversal
  would have looked better on screen and been wrong in the database.

**Blockers** stop a careless removal: a **closed business day** (the Z is a
snapshot — the dashboard serves it as-is, so taking a sale out fixes the running
figures but *not* that day's report until it is reopened and closed again), a day
that contains refunds, a label that looks like a return or a credit note (taking a
refund out of the books pushes revenue *up*). The first click is refused with the
consequences attached; only a second, explicit click gets through, and the journal
records the gesture as **forced**.

A **reason is required by the server**, not just by the screen: *onboarding ·
imprimante · formation · doublon · installation · autre* (with a written
explanation). The list is closed — free text fills up with "test", "ok", "rien"
and answers nothing six months later.

**One établissement can never touch another.** Every statement is bound by
`WHERE merchant = ?`, and requested ids that don't come back from that read fail
the **whole batch** rather than being silently skipped — an operator with two
shops open in two tabs cannot take the boutique's sale out from the café's panel.

The retraction reaches every device: `/api/feed` returns a `voided` list on every
poll carrying both the **cursor** (the dashboard keys its sales by it) and the
**receipt ref** (all a till knows), so an already-synced browser drops the row
instead of keeping it in its totals forever. The caisse polls the same list at a
slow cadence (`voids=1`) and drops it from its own day counter.

## Compte & adresses e-mail

Four kinds of address, named, because they don't get corrected in the same spirit:

- **Connexion** (`accounts.email`) — the key. Unique across Kiwi.
- **Contact** (`accounts.contact_email`) — where Kiwi writes to the business.
- **Facturation** (`accounts.billing_email`) — accounting, when it differs.
- **Équipe** (`store_docs` feature `team`) — staff addresses, **read-only** here.
  They belong to the roster the merchant keeps himself, authenticate nothing, and
  overwriting them from the console would fork the same employee's record.

The last two were one column until now, so fixing a mistyped login also changed
where Kiwi writes. Empty means *same as the login address* — which is the true
state of every existing account, and why the migration copies nothing into them.

Before a login change the panel names the account and the user, states plainly
that **the new address becomes the login immediately** (Kiwi has no address
verification step — a blocking one would lock out precisely the client who lost
access to their old mailbox), and requires a written reason. A collision is
refused with the name of the other business. A notice goes to the old address, a
confirmation to the new one; neither carries a password or a token.

**Nothing breaks, and that is a property of the schema rather than a promise:**
the session is signed on `accounts.id`, store ownership is
`merchant_config.account_id`, sales are keyed by store slug. No second account, no
re-onboarding, no lost permissions — the client stays logged in.

**Controlled recovery:** if the client disputes it, *Rétablir l'adresse
précédente* reads the previous value back from the journal rather than making the
operator retype it from memory — that retyping is the mistake being repaired. The
revert is journalled in turn (`email-revert`); it is never a deletion.

## Mot de passe — envoyer un lien

The operator can send the official reset message. They cannot read the existing
password (it exists only as PBKDF2), cannot choose a new one, **and never see the
link**: the response says *sent / not sent* and the journal stores the masked
destination (`a•••a@kiwi.test`) and nothing else. A link shown in the console
would be account takeover in one click for anyone who opens God mode, and reading
it out over the phone is the same thing as choosing the password.

The link is unique to the user, expires after **one hour**, works **once**
(consumed by a single conditional `UPDATE`, so two simultaneous opens cannot both
win), and a successful reset kills every other live link on the account. Expired,
already used, forged and never-existed all answer with the **same** message — a
distinction would turn the page into an oracle — and the page displays no address,
so it cannot be used to test whether someone is a Kiwi client. The client lands
signed in, on the normal dashboard.

`reset_tokens` stores `selector` plus an **HMAC** of the secret half; reading the
whole table yields no usable link. A **5-minute cooldown** applies per account —
each send invalidates the previous link, so an operator clicking three times while
the client reads their email would lock them out — and the console shows the last
send, whether a link is still live, and when the next one is allowed.

**Email delivery needs `MAIL_WEBHOOK`** (see *Cloudflare setup*). Without it the
endpoint refuses honestly and creates **no** token: a dead link that replaced a
live one would be taking the client's key away to throw it in the bin.

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
- `functions/api/admin/audit.js` — `GET ?merchant=` the administrative history,
  merging `config_audit` + `sale_audit` + `account_audit` into one sorted list.
- `functions/api/admin/sales.js` — `GET` search / impact preview, `POST`
  void + restore. Read is operator-level; **write requires an operator code**.
- `functions/api/admin/account.js` — `GET` the four kinds of address, `PUT`
  correct one (or revert). **Operator code.**
- `functions/api/admin/reset.js` — `GET` send state + cooldown, `POST` send the
  reset mail. **Operator code.** Never returns the link.
- `functions/auth/reset.js` — the client half: `GET ?token=` validates without
  consuming, `POST {token,password}` consumes once and signs the client in.
  Public (no session — someone who lost their password has none), served by
  `reset.html`, which is allow-listed in `functions/_middleware.js`.
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
   `npx wrangler d1 execute kiwi-sales --file=schema.sql --remote`. This creates
   `config_audit` (module journal), `sale_audit`, `account_audit` and
   `reset_tokens`. Until they exist the console still works and still saves — the
   journal writes are deliberately non-blocking, and the panels say so.
2. **Columns on existing tables — run once by hand.** `CREATE TABLE IF NOT
   EXISTS` will not add a column to a table that already exists, so these
   `ALTER`s have to be run separately (each safe once; re-running errors
   harmlessly with "duplicate column name"):

   ```sql
   ALTER TABLE merchant_config ADD COLUMN account_id TEXT;
   ALTER TABLE merchant_config ADD COLUMN name TEXT;
   ALTER TABLE sales ADD COLUMN void_ts INTEGER;
   ALTER TABLE sales ADD COLUMN void_reason TEXT;
   ALTER TABLE sales ADD COLUMN void_note TEXT;
   ALTER TABLE sales ADD COLUMN void_actor TEXT;
   ALTER TABLE sales ADD COLUMN void_actor_id TEXT;
   ALTER TABLE accounts ADD COLUMN contact_email TEXT;
   ALTER TABLE accounts ADD COLUMN billing_email TEXT;
   ```

   Until they are run, everything keeps working exactly as before. A client's
   second établissement stays folded into their first (the old behaviour, not a
   new failure); `/api/feed` falls back to its original query so **no dashboard
   ever goes blank**; and the test-sale panel searches read-only and states that
   the migration is missing instead of failing silently. Nothing 500s, and no
   data is written anywhere the apps can't read it back.
3. **`MAIL_WEBHOOK`** (Settings → Variables & Secrets) — required for the
   password-reset mail and the address-change notices, and for nothing else. Kiwi
   has no mail provider; this reuses the mechanism `LEADS_WEBHOOK` already uses, a
   Google Apps Script `/exec` URL. The script receives
   `{kind:'mail', to, subject, text}` and sends it:

   ```js
   function doPost(e) {
     var m = JSON.parse(e.postData.contents);
     if (m.kind === 'mail') MailApp.sendEmail(m.to, m.subject, m.text);
     return ContentService.createTextOutput('{}');
   }
   ```

   Deploy it as a web app ("execute as me", "anyone with the link"), and paste the
   `/exec` URL. Unset, the console refuses the send **honestly** and creates no
   token — a "sent ✓" over a mail that never left is worse than no button at all.
4. Deploy (push, or Create deployment — not "Retry").
5. First entry: staff bypass → `/kiwi-admin.html` → Opérateurs → add your codes.
   **Then reopen the console with a code**: the staff bypass is read-only for
   test sales, addresses and resets (see *Two levels of operator*).

Besides `MAIL_WEBHOOK` no new secret is needed — the operator cookie and the
reset tokens both key off `AUTH_SECRET`.

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
and **Snack Rif** (opened after → the five modules off). Amira also holds a
**second établissement** (*Amira Café*), a **closed business day**, a sale that
looks like a **return**, a multi-line basket, a client book and a staff roster —
the hard cases, seeded on purpose, so the frightening paths can be walked without
touching a real merchant's books.

- `/kiwi-admin.html` — the console in **Live · D1** mode, against those two.
- `/dashboard.html` — Amira's app.
- `/dashboard.html?merchant=snack-rif` — the new client's app.
- `/kiwi-caisse.html` — the till (Order Pro chip, staff PINs).
- `/__outbox` — the mail that "went out". `MAIL_WEBHOOK` points back at this
  server, so you can copy a real reset link out of it and open it as the client
  would — the only way to check the whole path rather than stopping at the moment
  the server claims to have sent it.

Clear the service worker on first open (DevTools › Application › Service Workers
› Unregister), or it will serve you cached assets instead of your edits.

### The rules, checked

```bash
node tools/check-godmode.mjs
```

119 checks over the same real Functions: who is allowed in (anonymous, merchant
session, staff bypass, operator code), search by every criterion, the impact
preview, the closed-day blocker and its forced override, cross-establishment
isolation, the mandatory reason, void → feed → restore round trip, the journal's
contents, address correction with collision and controlled revert, reset send /
resend cooldown / single use / expiry / forged token, the till's offline-queue
replay not resurrecting a removed sale, and an unmigrated database still serving
a dashboard. Run it before touching any of it — these are behavioural claims, and
the only honest way to check a server rule is to execute it.

On the plain static server (`tools/static-server.js`) there is no backend, so the
console runs in **Démo** mode (seeded clients) and the client apps keep their
defaults — exactly what ships to GitHub Pages.
