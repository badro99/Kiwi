# Kiwi — Launch Fix Plan (client "Ghali clothes" bug report, 2026-07-24)

This is the fix prompt for the 7 problems in the client PDF, root-caused across the
codebase (5-agent audit) **and** verified live on the deployed app + the operator
console. Read this top-to-bottom before implementing. Every fix is **demo-safe**:
the Boutique Mansour / Café Atlas demo (which has no account and no onboarding) must
stay byte-identical — we only change the REAL-merchant / hosted paths.

Production files load `venues.js` / `dateRange.js` (NOT the `*2.js` backup forks that
power `dashboard2.html`). Mirror identity/isolation fixes into the `*2` forks only
after the mainline is verified.

---

## STATUS — 2026-07-24 (all shipped to both remotes, deployed, demo-safe)

| Fix | State | Verified |
|-----|-------|----------|
| **F0** PIN "code incorrect" | ✅ DONE (5e20da3, v48) | live — 7777 accepted |
| **F1** account-scoped tenant reset | ✅ DONE (9f05298, v49) | live — same-acct no-op |
| **F2** onboarding `?onboarding=1` strip | ✅ DONE (c419870, v50) | code + fail-safe (needs signup e2e) |
| **F3** server business type on login | ✅ DONE (c419870, v50) | **live — /api/me→boutique, venueType=boutique, boutique sidebar** |
| **F4** one caisse⇄dashboard inventory key | ✅ DONE (9c4827a, v51) | key = slugMerchant(business)="mixmax-test" both sides |
| **F5** checkout → recordPurchase (client/points/spend) | ✅ DONE (9c4827a, v51) | code (needs a real sale e2e) |
| **F7** live-card merchant scope + heal stale pin | ✅ DONE (c419870→bc5df9a, v52) | **live — kiwiLiveMerchant healed vix→mixmax-test** |
| **F8** staff PIN after pairing | ✅ DONE (9c4827a, v51) | code, **fail-soft (worst case = no lockout)** — needs a real pairing e2e |
| **F6** restaurant floor blanked for real stores | ✅ DONE (v53) | real caisse/serveur floor renders empty ("0 / 0 occupées"), no cafe-atlas geometry; demo untouched |

Ground truth (D1 `kiwi-sales`): accounts **adam** (adam@example.test, slug `adam`,
type boutique, PIN `••••`) and **Ghali/MixMax** (mixmax@example.test, slug `mixmax-test`,
type boutique, PIN `••••`). Both boutiques → F6 (restaurant) is not launch-blocking.

---

## The one disease

Every symptom is tenant data kept in **browser-global localStorage keys** that are
(a) never scoped to the signed-in account, (b) never cleared on account switch, and
(c) read synchronously at boot before `identity.js`'s async `/api/me` can correct
them — **plus** "if the real venue/merchant isn't resolved yet → fall back to the
DEMO venue" fallbacks. So a new merchant in a browser that earlier held test accounts
inherits their establishments, PINs, live-feed target, pairing, and demo fixtures.

Live proof captured on the owner's Mac (one browser):
- `kiwiCustomVenues` = one global array holding `vix`, `trt`, … (every account's stores).
- 5 venue-data sets piled up: `boutique-culto`, `adam`, `scoped`, `own`, `vmr5c4ki2`.
- `/api/me` = MixMax/Ghali, but sidebar rendered a stale venue; `staffCount:6` on an empty custom venue.
- `kiwiPins` = `[{code:"••••",name:"Zakariae"}]` — a different account's PIN (the "code incorrect" cause).

---

## Problem → root cause → fix (ordered by leverage)

### F0 · PIN "code incorrect" — DONE (commit `5e20da3`, cache v48)
- **Cause:** `merchant-config.js` `merchant()` read the merchant slug from the stale
  global `kiwiLiveMerchant` (`"vix"`) / demo default, so the dashboard fetched
  `/api/config?merchant=vix` → empty pins → lock fell back to stale local
  `kiwiPins` (••••) → real PIN rejected.
- **Fix shipped:** GET `/api/config` now derives the merchant from the authenticated
  session when no `?merchant=` is given (mirrors POST); the dashboard (non-operator)
  calls bare `/api/config`. Verified live: returns `{pins:[{pin:"••••",...}],type:"boutique"}`.
- **Hardened by F1** (clears the stale local `kiwiPins`).

### F1 · KEYSTONE — account-scoped tenant reset  → fixes P4, P5, P6, P7-team, P1-stale, hardens F0
- **Cause:** `kiwiCustomVenues`, `kiwiVenue`, `kiwiOnboarded`, `kiwiPins`,
  `kiwiLiveMerchant`, `kiwiPaired/PairedVenue/Pairings`, `kiwiBizExtra`,
  `kiwiTeamSize`, `kiwiOwnerName/BizName/BizType/City/Goals`, `kiwiSet:biz:*`,
  and all `kiwi:*:v1:*` / `kiwiSales:*` / `kiwiBoutiqueCatalog:v1:*` records are
  browser-global and survive account switches. `venues.js init()` picks the active
  venue as `[...customIds][0]` — an arbitrary, often foreign venue of a foreign type.
- **Fix:** In `identity.js`, when `/api/me` resolves an authenticated **real** merchant
  (`me.authenticated && me.email && !me.operator`), run `reconcileAccount(me)`:
  - Compare `me.email` to `localStorage.kiwiAccountKey`.
  - **Same** → no-op (reload of the current account keeps everything).
  - **Different** (key set and differs; or, on first run, prior `kiwiOwnerEmail`/`kiwiBizName`
    positively mismatches) → `purgeTenantState()` (remove the tenant set above,
    **preserve** device/UI prefs: `kiwiLang/kiwiTheme/kiwiMode/kiwiDesign2026/
    kiwiDesignIOS27/kiwiRamadan/kiwiDateRange/kiwiRevCompare/kiwiHeroView/
    kiwiKpiLayout/kiwiGlassLevel/cafeAtlasLang/kiwiAccountKey`), then `location.reload()`.
  - Set `kiwiAccountKey = me.email` **before** any reload → loops are impossible
    (next load has `key===email`). Default to **no purge** when the account can't be
    positively determined (safe for existing real clients on deploy).
- **Demo-safe:** demo has no account (`/api/me` → not authenticated) → never runs.
- **Verify:** same-account reload = no purge, no loop, data survives; a different
  account (or fresh signup) = clean slate. Mirror the purge into the `/auth` logout path.

### F2 · Onboarding trap on reload → P3, P5
- **Cause:** signup redirects to `/dashboard?onboarding=1` (`_middleware.js:658`); the
  `?onboarding` param is sticky so `onboarding.shouldAutoLaunch()` re-`reset()`s and
  relaunches the wizard on every reload (`onboarding.js:709/735`), wiping `kiwiOnboarded`.
- **Fix:** After consuming the param in `onboarding.js` boot, strip it via
  `history.replaceState({}, '', location.pathname)`. Gate the auto-launch on
  `!isComplete()` for the current account. Best: add an `onboarded` boolean to the
  real-merchant `/api/me` (derived from `merchant_config`/a new `accounts.onboarded`
  column) and treat it as authoritative; `finish()` POSTs completion to the server.

### F3 · Server business type authoritative on normal login → P6, P7
- **Cause:** the server knows Ghali is a `boutique` (now in `/api/me` `type` and
  `/api/config` `type`), but `merchant-config.applyServerType()` only applies it in
  operator scope (`isScoped()`), so a plain login keeps the stale venue's type.
- **Fix:** `/api/me` real-merchant branch must return `type` (currently only the
  operator branch does — `me.js`). On a non-operator real login, call
  `KiwiVenue.applyServerType(me.type)` so a boutique never renders as a restaurant.
  `ensureOwnEmptyVenue()` already derives type from `KiwiMe.type` — make it re-run
  once identity resolves. In `init()`, prefer a persisted custom venue matching the
  account type over an arbitrary `[0]`.

### F4 · caisse ↔ dashboard don't share one tenant key → P2, P2b-a/b
- **Cause:** boutique inventory is keyed by merchant **slug** on the caisse but by
  slug-or-**venueId** on the dashboard, and both fall back to the demo
  `maisonMansour` key. So a caisse-created product never reaches the dashboard and
  vice-versa; a brand-new boutique shows demo caftans.
- **Fix:** ONE canonical tenant key on both surfaces for a real venue — the
  authenticated **merchant slug** (`slugMerchant(KiwiMe.business)` / `kiwiLiveMerchant`,
  the same key the client book already uses). `pages-pro.js` `_bqxVenue()` and
  `pos-boutique.js` `_bqKey` resolve slug-first; only fall to `maisonMansour` for a
  genuinely unpaired **local** boutique demo (guard: `KiwiEnv.isReal()===false && no
  kiwiPairedVenue && no kiwiLiveMerchant`). `boutique-catalog.use()` default must
  NEVER be `DEMO_VENUE` for a real session. Longer term: D1 `products` table + `/api/inventory`.

### F5 · Sale doesn't attach product / points / dépense to the client → P2b-c/d
- **Cause:** boutique checkout writes a bare `{amount,method,label}` to a local SALES
  array + `/api/sale`, mutates a throwaway local client for points, writes no dépense;
  D1 `sales`/`feed` have no line-items or client columns.
- **Fix:** In `pos-boutique.js` checkout `onPaid`, when a client is attached call
  `KiwiClients.recordPurchase(clientId, {amount,visit:1})` (persists spend/points/visit
  to the shared slug book → dashboard) instead of mutating a local object; emit a
  dépense/revenue record through the store the dashboard accounting reads. For
  cross-device: add `lines`(JSON) + `client_id` to the `sales` table, send them in
  `postSale`, return them in `/api/feed`. Add `functions/api/clients.js`
  (GET `?merchant=&since=` / POST upsert / DELETE) backed by a D1 `clients` table —
  the client already speaks this contract (`clients-store.js` `mergeServer/getCursor`).

### F6 · Restaurant caisse shows demo floor / KDS / servers → P7  ✅ SHIPPED (v53)
- **Cause:** the floor plan (T7..T16 + CUISINE + the 1er étage rows) and servers are
  hard-coded module constants in `kiwi-caisse.html` / `kiwi-serveur.html` — NOT
  venue-scoped. The real-store branch only cleared occupancy + renamed waiters
  ("keep the table layout but clear every occupancy"), so cafe-atlas's *specific
  geometry* (24 named tables, terrasse/étage zones, the banquette ronde) still
  rendered inside every real restaurant.
- **Fix shipped:** in the real-store branch ONLY (`storeIsReal()` in caisse /
  `svReal()` in serveur — both false for the local demo), delete every seeded table
  (`Object.keys(tables).forEach(k => delete tables[k])`) instead of merely emptying
  its status. A real store now opens a blank floor ("0 / 0 occupées") until it builds
  its own; `renderSalle()` + the occupancy counters + every serveur consumer iterate
  `Object.keys(tables)` or guard `tables[id]`, so empty is safe, and `currentUser`
  still resolves in the (kept, generic-renamed) `servers`. The demo path never enters
  the branch, so the pitch floor stays byte-identical.
- **Why not the full KiwiStore route (the earlier plan):** the inline `<script>` that
  declares `tables` runs during parse, *before* the deferred `venue-store.js`, so
  `KiwiStore` is undefined at declaration time, and `venues.js`/`KiwiVenue` isn't loaded
  in the caisse at all (no `currentVenue`). Wiring a per-venue store would mean moving
  shared-shell load order under the demo — real demo-byte-identical risk for zero
  present benefit (no floor-builder UI consumes per-venue persistence yet). Deferred to
  when a floor editor exists; the blank-floor outcome is identical for real stores today.
- **KDS / recipe catalog:** left intact — the KDS recipe DB is a shared reference keyed
  by dish name, not tenant-identifying data; with an empty floor no demo tickets route
  to it anyway.

### F7 · Live "EN DIRECT" card shows another merchant's sales → P1
- **Cause:** `live-link` `merchant()` defaults every unresolved merchant to the shared
  `cafe-atlas` tenant (or a stale `kiwiLiveMerchant`), so a brand-new dashboard polls
  another store's feed.
- **Fix:** Derive the live-card merchant from the authenticated identity; do NOT poll
  against `cafe-atlas` for a real dashboard — render the empty "En attente d'une
  vente" card until a real slug is known. Clear `kiwiLiveMerchant` on account switch
  (F1 covers this). Scope the D1 feed by authenticated merchant server-side.

### F8 · Caisse pairing link bypasses the staff PIN → P2
- **Cause:** `kiwi-caisse.html?pair=1` auto-redeems the newest pending code and boots
  the register with NO PIN; the hosted caisse never validates the merchant's PINs.
- **Fix:** Separate device-binding (pairing) from person-auth (staff PIN). After
  redeem succeeds, show a staff-PIN screen validated against the store's configured
  PINs (`/api/config?merchant=` for the paired slug) before the register is usable —
  as the dashboard lock already does. Only auto-redeem a code whose `entry.merchant`
  matches the signed-in account. (Client framed the no-PIN entry as a bug → PIN required.)

---

## Verification checklist (per fix)
- Same-account reload never purges, never loops, never re-onboards.
- A fresh signup / different account gets an empty switcher, empty caisse, its own PINs.
- Demo (`kiwi-maroc.pages.dev` unauthenticated, and local) is byte-identical.
- `node tools/check.js` green; bump `kiwi-sw.js` `CACHE`; push origin (Cloudflare) + upstream (partner).
