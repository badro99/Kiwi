# Kiwi · HANDOFF

> Fusion de l'ancien `AI_HANDOFF.md` (état courant) et de `HANDOFF.md` (contexte complet) — 2026-08-22.
> **Partie 1** est à lire en premier quand on reprend le travail ; **Partie 2** donne l'histoire, l'architecture, le système de marque et la feuille de route.

---

# Partie 1 · État courant (ex-AI_HANDOFF.md)

# AI_HANDOFF.md — current-state brief for the next agent

> Read this after `CLAUDE.md` (operating rules) and `HANDOFF.md` (deep history/architecture).
> This file is the **"what's true right now and what hurts"** brief. **Kiwi is now a REAL,
> working product with a LIVE backend — not a mock/pitch artifact** (updated Jul 2026). The
> long changelog in §8 predates the backend; where §1/§3/§7/§9 below conflict with older
> prose, the updated sections are the current truth.

---

## 1. What Kiwi is (in one paragraph)

Kiwi is a **Moroccan merchant operating system**, POS-first, and it is now a **real,
working product** — no longer a pitch/demo artifact. The **frontend** is currently
HTML/CSS/JS with no build step, served as a static site (a default, not a locked
constraint — see `CLAUDE.md` §2), and a **real backend is
LIVE**: **Cloudflare Pages Functions + D1** (`functions/`, `schema.sql`) power real
accounts/auth, the passcode + operator gates, Live Link sales, the operator console, and
caisse↔dashboard pairing — plus a real native **Kiwi Printer Bridge** (`bridge/`) for ESC/POS
thermal printing. Client state still lives in `localStorage`; server-authoritative data lives
in D1. It's **trilingual: FR / EN / AR with real RTL**. The flagship surface is
`dashboard.html`; **"Café Atlas" is only the DEMO tenant** (shown to a session with no real
account — never leak it to a real merchant). The public site is `index.html`. It must still
**demo flawlessly to investors and pilot cafés** — and now also **work for real merchants**.

## 2. Business model (Phase 1 — POS SaaS, four tiers)

- **Kiwi Basic · 199 MAD/mo** — software only, on the merchant's own hardware, unlimited
  devices, **1 établissement**, integrates into the existing till, on-site training + guides.
- **Kiwi Pro · 399 MAD/mo** — everything in Basic **+ 1 free Kiwi cashier**, T+1 settlement,
  hardware maintenance. (The demo account is "on Pro".)
- **Kiwi Ultra · 1 499 MAD/mo** — unlimited établissements, multi-pays, enterprise API,
  dedicated 24/7 account manager.
- **Kiwi Ultimate · sur devis** — bespoke; scope/device-count/price agreed with the client.

Phase 2 = Kiwi Pay (payment institution), Phase 3 = Banking/Investing. **Do NOT add
Pay/Banking/Investing surfaces unless explicitly asked.** **No public financials / asks /
projections** in any external-facing material — public macro data only. The pricing lives in:
the **upgrade modal** (`interactive.js` → `upgrade-pro`), the **landing** (`index.html`:
hero KPI, the editorial pricing manifesto, JSON-LD offers, FAQ, meta, priceRange), the
**savings calculator** (`ux.js` + `i18n.js`), the **sidebar upsell** (`venues.js`), and the
**account hub** (`account.js`). All four surfaces are in sync.

## 3. Stack & conventions (the stuff that bites you)

- **No locked frontend stack (owner's call, 2026-08-13).** The UI ships today as
  build-free HTML/CSS/JS — IIFE modules registering into `window.Kiwi.handlers` — but that's
  the current shape, not a rule. Frameworks, bundlers, TypeScript and test runners are all
  allowed where they're the better tool; rewriting a *shipped* surface still needs a staged
  plan. Real server/native code lives in `functions/` (Cloudflare Pages Functions + D1) and
  `bridge/` (the printer bridge) — see CLAUDE.md §2.
- **Global click delegation** (`interactive.js`): `[data-action="x"]` `[data-arg="y"]` →
  `handlers['x'](element, 'y')`.
- **i18n**: `data-i18n="key"` on DOM (FR captured from DOM, EN/AR in a `T` dict in
  `i18n.js`); in JS use the per-module `tr({fr,en,ar})` / `pick({fr,en,ar})` helpers.
  Switch via `KiwiI18n.{setLang,getLang,setTheme,getTheme}`. RTL is driven by `html[lang="ar"]`.
- **Overlays** (`interactive.js`): `Kiwi.modal({title,tag,desc,body,foot,width}) → {el, close}`;
  `Kiwi.drawer(...)`; `Kiwi.appPage(id,{title,subtitle,body})` for **full-page destinations**
  (every sidebar/profile destination now uses this — no more side drawers, see commit
  `fc08d02`); `Kiwi.toast(title,{type,desc,force})`. **`modal()` escapes `title` and `tag`
  (XSS-hardened) but renders `desc`/`body`/`foot` as raw HTML** — never interpolate raw
  user/data into `body`; use the module's `esc()`.
- **Dark mode** (`theme.css`, applied via `html[data-theme="dark"]`): tokens **invert** —
  `--surface` (white→#151B18), `--paper`, **`--ink`/`--paper` SWAP roles**, `--warn-soft`/
  `--warn-ink`, `--n-*`, `--atlas`, `--mint`, `--danger`/`--info`. **Hardcoded hex does NOT
  invert.** **Never use `var(--ink)` as a background** (it goes light in dark — this exact
  mistake broke the sidebar and a dozen banners). `dark-fixes.js` is a runtime safety net
  that darkens stray near-white surfaces and relights dark-on-dark text — it's a band-aid,
  prefer fixing colors at the source with tokens.
- **Scroll-lock**: a global counter `window.__kiwiScrollLocks` + `html.kiwi-locked`. To
  dismiss a modal use the helper close path (e.g. `closeTopModal()` in stock.js), **not**
  `el.remove()` — raw removal leaks the counter and freezes page scroll.
- `Date.now()`/`Math.random()` are fine in normal browser JS (only forbidden inside
  `Workflow` scripts).

## 4. Passcodes (the lock screen on every load)

> **Hosted vs local:** on the LIVE site a real **server-side account gate** now sits in
> FRONT of everything (`functions/_middleware.js`: email/password accounts, the staff
> passcode bypass, and the operator console) — see `AUTH.md`/`ADMIN.md`. The client-side
> 4-digit PIN below is the *demo/local* layer; on the hosted site a real merchant reaches
> their OWN store, and **"any 4-digit → Café Atlas" must never leak to a real account.**

`dashboard.html` shows a 4-digit PIN gate every session (`paintCells()` ~line 5622). Special
routes exist for onboarding, growth previews, and manager role; any other 4-digit entry →
Café Atlas owner demo. "Entrer dans la démo" = skip. **Every passcode now
also enables the Design 2026 skin** (see below).
To drive the demo in the preview: enter a PIN (e.g. demo PIN) into the lock input, or remove
`.kiwi-lock`/`.kiwi-greet` and `.kw-app-hidden` and call `Kiwi.handlers['account-profile']()`.

## 5. Design 2026 — "Liquid Glass" skin (reversible, gated)

- `assets/design-2026.css` — a modern Apple-era glass skin (ambient gradient-mesh + grain,
  frosted translucent surfaces with specular edge-light, rounding, green-tinted depth, spring
  motion) **executed in the Kiwi palette, no new accent colors**. **Every rule is scoped to
  `body.design-2026`** → inert when the class is absent; the classic design is untouched.
- `assets/design-2026.js` — exposes `window.KiwiDesign2026.{enable,disable,toggle,isUnlocked}`.
  Any passcode calls `enable()`; state persists in `localStorage.kiwiDesign2026`. **There is
  NO on-screen toggle** (the user had me remove the floating pill). To revert:
  `KiwiDesign2026.disable()` or delete the `<link>`/`<script>` in `dashboard.html`.
- **Gotchas learned the hard way:** the sidebar must use **fixed dark hex** (not `var(--ink)`,
  which inverts in dark and turned the sidebar white). **Do not force `.kiwi-lock` to
  `position:relative`** — it's a fixed full-screen overlay; doing so collapsed it and left the
  page half-blank (fixed in `08db17c`).
- **The light-mode intensity push landed (`94e8b64`):** richer 4-blob ambient mesh, deeper
  card glass, specular sheen on the home hero, frosted date-range pill + AI input, glass
  feed-row hovers, brand-tinted thin scrollbars, frosted PIN cells on the lock screen
  (visual props only — positioning untouched). (The demo bar was later removed by the
  partner in `e05e298`; the old `.demo-bar` glass rule is inert.)
- **iOS-27 TIER (`eaa421a`) — EXPERIMENTAL, gated behind experimental demo passcode only.** Translates
  Apple's real WWDC-2026 announcements (Jun 8: transparency slider, full-edge refractive
  sidebars with colored icons, glass layered into icons — source: macrumors.com/2026/06/08/
  apple-announces-liquid-glass-improvements/) into the Kiwi palette:
  `assets/design-ios27.css` + `assets/design-ios27.js`, every rule scoped
  `body.design-2026.design-ios27` (layers ON the stable skin, never replaces it).
  Smoked-glass full-edge sidebar (mesh refracts beneath; stays dark in both themes so no
  text re-theming), mint-colored nav icons + tinted count pills, layered-glass KPI icon
  chips, display-P3 mint, and the headline: a **Liquid Glass transparency control in
  Paramètres** (Clair/Standard/Givré/Opaque, persisted `kiwiGlassLevel`, FR/EN/AR) — clear
  mode clamps modals/drawers to a legibility floor (the iOS-26 lesson). Only the 1111 PIN
  calls `KiwiDesignIOS27.enable()`; revert = `KiwiDesignIOS27.disable()` (verified clean
  round-trip) or remove the design-ios27 `<link>`/`<script>`.

## 6. The account hub — `account.js` (`Mon profil`)

The owner's command center, fully editable, trilingual, light+dark correct:
- **Personal info** (name/email/phone/language) — persisted under `kiwiSet:owner*`.
- **Mes établissements** — one rich card per business (`BIZ_DEFAULTS`: Café Atlas, Maison
  Mansour, Spa Bahia) with live data (CA/commandes/équipe) + full **Moroccan legal identity**
  (ICE, IF, RC, Patente, CNSS, phone). 11-field editor per business; **"+ Ajouter"** creates
  new ones. Persistence: `kiwiSet:biz:<id>:<field>` for defaults, `kiwiBizExtra` (JSON) for
  added ones.
- **Abonnement** — wired to the 4-tier ladder: Upgrade (opens `upgrade-pro`), Downgrade
  (confirm → steps down `PLAN_LADDER`, persists `kiwiSet:plan`), Voir la facturation, and
  **Résilier** (routed to the account manager via WhatsApp/email/phone — **no destructive
  self-serve cancellation**, per policy).
- Also: `openBilling()` and `openHelp()` are real pages (commit `83045b7`).

## 7. Git workflow + deploy (READ THIS)

- **Everyone works on `main` now.** The old `dashboard-motion` vs `cafe-atlas` two-track
  split is history (long since merged). A partner and/or a second agent often push to `main`
  **in parallel, in this same working copy**, sometimes leaving **uncommitted WIP** in the
  tree. So: stage **specific paths, never `git add -A`**, and **read `git diff --cached`
  before committing** so you never sweep up their in-progress edits. If a file you edited also
  carries their unstaged changes, isolate your hunk (`git restore --staged <f>` then
  `git apply --cached` a patch of only your hunk).
- **Two GitHub remotes — every `main` commit must land on BOTH. Their remote NAMES reshuffle
  each session, so match by URL, not name:**
  - `github.com/zaka33333-hash/Kiwi` → **Cloudflare Pages `kiwi-maroc`** →
    kiwi-maroc.pages.dev / kiwi-os.com. **Auto-deploys on push** — this is where the live
    product AND the demo run. (This is the one that must never go stale.)
  - `github.com/badro99/Kiwi` → **GitHub Pages + the business partner's copy.**
  Push `main` to both by URL. If a push is rejected: `git fetch`, inspect `HEAD..<remote>/main`,
  integrate (**never force**), re-run `tools/check.js`, push both.
- **No `/Users/badrosonair/Documents/kiwi` mirror exists on this machine** — ignore any
  instruction (incl. older CLAUDE.md prose) to push there.
- **Commit rule:** commit + push after every edit, no asking. Message `<scope> · <what
  changed>` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never commit secrets.

## 8. What this session shipped (newest first)

**Jul 23:** **Boutique inventory + real barcode system (caisse 0002 ↔ dashboard, one
shared DB).** Two new engine modules, loaded in `kiwi-caisse.html`, `dashboard.html`,
`dashboard2.html`:
- `assets/barcode.js` (`window.KiwiBarcode`) — dependency-free, **real scannable** EAN-13
  (L/G/R + parity + mod-10 check) and Code 128-B encoders → inline SVG; `nextInStoreEan()`
  generates codes in the GS1 in-store range (prefix 20–29, never collides with real GTINs);
  `detect()`, `isValidEan13()`, and `printLabels(labels,{copies})` (a `@media print` label
  sheet → `window.print()` to the label printer).
- `assets/boutique-catalog.js` (`window.KiwiBoutiqueCatalog`) — the **shared product
  database** in `localStorage` (`kiwiBoutiqueCatalog:v1:maisonMansour`). Model: Category →
  Product → **Variant (= product × colour × size)**, each variant holds a `barcodes[]` list
  (a generated EAN-13 `primary` + any scanned old-POS codes kept verbatim as `imported`).
  Full CRUD + `generateBarcode`/`attachBarcode`/`findByBarcode`/`resolveScan`; `subscribe()`
  + `storage` event so the caisse tab and dashboard tab stay live-synced; seeds once from the
  caisse's old `RAYONS` (each product fanned into colour×size variants; legacy EANs kept as
  aliases). `compat()` rebuilds the old `{RAYONS,P,BY_EAN}` shape the caisse renders from.
- **Caisse (`pos-boutique.js`, PIN 0002)** — now catalog-backed (sale grid, sheet, scanner
  all track the live DB). New **Inventaire** nav view: create product · colour×size variants ·
  input stock · **generate + print EAN-13 labels** · **register an existing old-POS barcode**
  (no reprint). A **global keyboard-wedge scanner** (document keydown buffer) adds the exact
  scanned variant to the ticket from anywhere on the sales screen; unknown scan → "register
  on an article" flow. Stock decrements on a sale stay in-memory (demo); creation + stock
  input persist to the DB.
- **Dashboard (`pages-pro.js` `nav-inventory` + `nav-categories`)** — rewritten from static
  mock to live catalog: product grid → drawer with the variant matrix (editable stock,
  per-variant barcode chip, generate/print/register), real category **create/rename/recolour/
  delete** (with product reassignment). Handlers are prefixed `bqx-`.
- GOTCHA: `barcode.js` must load **before** `boutique-catalog.js`; both must load before
  `pos-dispatch.js` / `pages-pro.js`. `localStorage` sync is **same-origin only** (real
  cross-device sync waits for the backend). `window.print()` opens a native dialog — it can
  block headless browser tooling; that's the print path working, not a bug.

**Jun 25 (later):** `171b03f` **Ultra cross-site spend control** — `assets/depenses.js`
`render()` now branches custom → **fusion** → single. When the portfolio (fusion) venue is
active it paints the consolidated Ultra view: « EXCLUSIF ULTRA » banner (1 499 MAD/mois),
consolidated ledger (in/out/net across 3 sites), « Sorties par établissement » cards (click
→ `dep-site` → `KiwiVenue.setVenue(id)` drills into that single site), and ONE cross-site
approval inbox (`xpending`, site-tagged). `dep-approve`/`dep-refuse` are cross-site aware:
**x-prefixed ids** hit the portfolio inbox, numeric ids the single-venue one. A
`KiwiVenue.subscribe` re-renders the open page on venue change (so « Go Ultra » → portfolio,
site drill-in → single, both repaint in place). `b1f7ea7` surfaced Dépenses on the home via
a « Pour vous » oppo card (`open-depenses`). Verified live incl. AR.

**Jun 25:** `cb7a51b` **Kiwi Dépenses (Kiwi Pay · Phase 2)** — the outflow half of the
merchant OS. New full-page destination « Dépenses & cartes » (sidebar → new **KIWI PAY**
section, `data-nav="depenses"`, PHASE 2 tag). Self-contained `assets/depenses.js` (injects
own CSS, renders via `Kiwi.appPage`): two-sided ledger (encaissé vs dépensé vs net +
budget bar), 4 team **Kiwi cards** with per-category limits + freeze/unfreeze, **approve/
refuse** spend requests, budgets-by-category growing bars, recent-spend feed, supplier
bills (Payer). « Émettre une carte » modal issues a live virtual card. **Honest framing:**
a `KIWI PAY · PHASE 2` banner states cards + supplier payments need a Bank Al-Maghrib
payment-institution licence — roadmap preview, no real money. Custom (0000) venues get a
starter (no demo leak); manager role (0909) hides it like Marges/Paie. Wired: `nav-depenses`
handler, `FULL_PAGE_NAVS` (pages.js), i18n `dash.sidebar.{kiwipay,depenses}` EN+AR,
`role-manager` hide rule. Trilingual + dark-mode verified. To extend: edit the `cards` /
`pending` / `budgets` / `suppliers` seed + the `T`/`CAT` dicts in depenses.js. This was the
first **Pay/Banking surface** built — previously forbidden without explicit ask; the user
explicitly asked. Don't add more Pay/Banking surfaces beyond this without the same.

**Jun 11 (later):** `47c2002` **the whole home enters alive** — the c98e317 card entrance
played at DOM load, hidden BEHIND the PIN lock; users saw a frozen page. Now all three
reveal paths (PIN unlock 3 200 ms dive-in, 0000 onboard unlock, « Entrer dans la démo »
skipToApp) add `body.cards-enter`, and every entrance animation (blocks, .settle, oppo
cards, mix legend) is gated on it. Hover on every card upgraded to −2px lift + atlas border
tint. Heures-de-pointe bars rise (hh-rise, `--i` stagger) and feed rows cascade on real
data changes only — both gated `classList.toggle(x, !liveTickInProgress)` so the 3 s demo
tick never replays them. GOTCHA: any new load-time animation on the dashboard is invisible
(lock screen covers it) — gate it on `body.cards-enter`. oppo-cards base opacity:0 removed
(entrance moved into keyframes + backwards fill) so cards can't be stuck invisible.

**Jun 11 (late):** `f0efdfd`+`01b5149`+`6afd310` **kiwi-caisse becomes 14 POS verticals, one
per métier** — the dashboard's venue universe (boutique, spa, hôtel, fast-food, boulangerie,
pizzeria, traiteur, food truck, épicerie, pharmacie, librairie, fleuriste, coiffure, salle
de sport) now each has a real hardware POS app behind its own PIN. **`assets/pos-dispatch.js`**
is the router: registry `0002`–`0015` → lazy-loads `assets/pos-<id>.{js,css}` on first
unlock, owns the shared unlock/greet/lock choreography (dot success → fade → greeting flash →
`body.is-pos.is-pos-<id>`, lock-back via `__kiwiPinReset`), a tappable **code legend** on the
pin-foot, and an honest "module indisponible" toast if a module is missing. Modules
self-register: `KiwiPosDispatch.register({id, greet, mount(root), onShow})` — `mount` builds
into the dispatcher-provided root (`<div class="vx-screen" id="pos-<id>">`, fixed inset-0,
z-90), never `document.body`. **PIN map:** 0000 pressing · 0001 cuisine(KDS) · 0002 boutique
(Maison Mansour — échanges & avoirs, stock par taille) · 0003 spa (Spa Bahia — cures à carte
poinçonnée) · 0004 hôtel (Riad Yasmina — folio + taxe de séjour) · 0005 fast-food (Snack
Chamal — combo upsell, file d'appel) · 0006 boulangerie (Bab Kasbah — fournées/restant,
précommandes gâteaux) · 0007 pizzeria (La Marsa — moitié-moitié, livraison) · 0008 traiteur
(Dar Zellij — devis/personne, échéancier d'acomptes) · 0009 food truck (Karavan — vente 2
taps) · 0010 épicerie (Si Brahim — **le carnet de crédit/ardoise**, vente au poids) · 0011
pharmacie (Ibn Batouta — **tiers payant** part mutuelle/patient, opérationnel only) · 0012
librairie (Al Boughaz — commandes spéciales, listes scolaires) · 0013 fleuriste (Fleurs du
Détroit — composer de bouquet, carte message) · 0014 coiffure (Salon Yasmine — formule
couleur mémorisée) · 0015 gym (Atlas Fitness — check-in vert/rouge) · **tout autre code →
caisse restaurant Café Atlas, le démo principal, intact.** Each module (~1 100–1 700 lignes
JS) reuses the caisse tokens + modal kit (`.modal-veil/.cash-*/.reader-*/.ma-btn/.pay-tip`)
and `#toast-stack`, with its own `<prefix>-` CSS namespace, dark rail, SVG line-art, phone-
first clients, offline chip, seeded mid-shift Moroccan data. **Build method:** a build+review
agent **Workflow** (the first 14-agent run hit the 4:50pm session reset mid-flight — 8 built,
6 left; a second 12-agent run finished the rest). All 14 verified live by the orchestrator
(mount + every view renders + zero console errors + signature feature exercised). **Toast
z-index fix** rode along: `#toast-stack` shipped at z-90 = the vertical roots, so toasts
painted underneath — lifted to 200 under `body.is-pos`/`body.is-pressing` (restaurant
untouched). **Two gotchas for the next session:** (1) the preview tab kept getting hijacked
to `dashboard2.html` and the shared `:8765` server died repeatedly during the agent runs —
verify one PIN at a time, re-navigate + re-harness when it drifts, and don't trust the first
screenshot (intermittent DPR downscale — functional DOM probes are the reliable signal). (2)
**`assets/pressing.js` is stray untracked cruft** (the old `hx-`-prefixed pressing prototype,
superseded by `pressing-caisse.js`, referenced nowhere) — it's the sole `node tools/check.js`
failure (`data-action="modal-close"` unwired, + 3 `var(--ink)` warnings). Safe to delete;
left in place pending the owner's OK (not created by this session).

**Jun 11 (night):** `50bdbce`+`57b181b` **PIN 0000 turns kiwi-caisse into a pressing** —
the Tangier-prospect demo: one terminal, two métiers. His restaurant = any 4-digit code
(caisse untouched), his pressing = **0000**; the KDS station moved to **0001** (pin-foot
hint updated). New `assets/pressing-caisse.{js,css}` (~2 700 lines) inject a full laundry
counter scoped to `body.is-pressing` — the only shared surface is the 3-way PIN branch +
`window.__kiwiPinReset()` (extracted from lockoutKitchen). The **headline differentiator
is the VISUAL intake grid** (24 hand-drawn SVG garments, 6 catégories, prix MAD par
garment×service — text-list incumbents don't have this). Intake flow: tap garment →
config sheet (services **MULTI-SELECT et cumulables** — lavage + repassage = le classique,
prix additionnés, exclusions réelles sec⟷lavage/repassage via SVC_CONFLICTS, codes
combinés LAV+REP sur ticket/étiquettes/détail; les variantes restent single-select à la
**lentille liquide** — liquid-lens.js loads in the caisse, its selectors match nothing
restaurant-side; costume 2/3 pièces, tapis S/M/L, couleur, notes usuelles, **photo état**
mock) → ticket courant → client **PHONE-FIRST**
(reco fidèle + préférences, B2B –15 %, fiche rapide, passage) → date promise suggérée
(dimanche sauté) → **reçu thermique + 1 étiquette code-barres PAR PIÈCE** (costume 3p =
3 étiquettes) → encaissement (maintenant / acompte / **au retrait = habituel** / sur
compte B2B; espèces avec rendu, carte = montant envoyé au lecteur partenaire, V1 sans
encaissement Kiwi). Ops: tableau 4 statuts **par pièce** avec recherche téléphone,
détail à steppers, tout-prêt auto-déclenche le **WhatsApp « c'est prêt »** (+ photo du
vêtement fini), retrait par téléphone/scan (cintre en GROS, solde verrouille la remise),
rangement rails A/B/C × 12, hors-ligne simulé (file + sync). Demo data: **Pressing
Marshan** (Tanger), 7 clients dont **Hôtel Bab El Bahr** (compte B2B · facture mensuelle),
12 commandes seedées, 1 en retard. Gotchas: the caisse `.modal-veil`s are z-100 over
`.px-screen` z-90 but DOM ORDER decides between veils (close detail before opening
tags/pay); the offline banner needed `[hidden]{display:none}` (its `display:flex` was
winning); preview verification needs a **resize jiggle 1366×900↔901 to force repaint**
(hidden-tab compositor serves stale frames) and `preview_resize` must be re-applied
after every reload. Dashboard deliberately untouched (owner: "caisse only for now") —
the venue-switcher half of the pressing brief is still open.

**Jun 10 evening (6):** `c98e317` **every card is alive** — staggered card entrance
(.dash-col .block nth-child delays), hover lift (+shadow; rule is `html body .block` to
outrank theme.css's `html .block` color-only transition — merge color transitions in or
theme switching judders), Top produits mini-bars + bench bars draw in from 0 via
`growBars()` (dateRange.js: double-rAF + 450ms timer fallback for hidden tabs), rows
cascade via `--i` stagger, bench rank counts up (animateNumber). Health ring / mix donut /
rev chart were already animated. The 3s live tick only re-renders hero/KPI/chart/feed, so
nothing replays on its own; reduced-motion disables all of it.

**Jun 10 evening (5):** `74e56e8` **the 0000 session stops leaking the demo** — from a
merchant-created venue, the switcher still offered the 3 demo venues + « Go Ultra »
(fusion = demo aggregation), and « Marges → » opened Café Atlas's product margins. Now:
`renderDropdown` lists only the merchant's own venues in the 0000 session
(`window.__kiwiOnboard`, set at PIN entry) with an « Ajouter un établissement » CTA
(action `onboard`); dropdown rows escape merchant-typed name/location; `view-margins`
(dashboard-extra.js) gets a trilingual starter drawer for custom venues. Demo sessions
unchanged. NOTE: other [data-action] drawers reachable from custom venues may still show
demo data — guard them with the same isCustom pattern as they surface.

**Jun 10 evening (4):** `86d695d` **« Pour vous » opportunity cards** — Shopify-style
suggestion band under the KPI strip, Kiwi-native (`assets/oppo-cards.js`, self-contained:
injects its own CSS). 5-card pool × 3 slots, each card = one real feature (payment-link,
loyalty, agent-mode, capital, zakat) + a brand-token SVG illustration + one text CTA wired
to the feature's existing handler + a dismiss ✕ persisted in `kiwiOppoDismissed`; band
self-removes when the pool is dry. Staggered entrance, hover lift + art parallax,
reduced-motion + RTL safe, trilingual w/ langchange re-render. To add a card: append to
POOL + ART in oppo-cards.js (no other wiring).

**Jun 10 evening (3):** `bd45e69` **custom venues stop leaking demo data** — a fresh venue
opening « Catégories » landed on Maison Mansour's caftans (200 demo products, 249 320 MAD).
No page module had isCustom guards. New starter-page layer (end of pages-pro.js): 19
destinations render an honest « Encore rien ici — et c'est normal » starter for custom
venues — trade-titled via subtype profile (pharmacie → Familles & ordonnances), venue-named
subtitle, three what-will-appear bullets, `.gp-starter` CSS. CRITICAL gotcha discovered:
team.js / stock.js / conformite.js / finance.js re-install their nav handlers at
`load + setTimeout(0)` to win override wars — any naive load-time wrap gets clobbered.
The starter wrap is idempotent (`__kiwiStarter` flag), re-asserted at load+150ms AND on
every venue switch. Pass-through branch clears `page-genpage` (direct handler invocations
bypass the sidebar router's cleanup and would mask body-class pages like Équipe).

**Jun 10 evening (2):** `9b757a8` **every sidebar destination is a full page** — the last 8
drawer-based destinations (boutique: inventory/catégories/promos/retours · spa: calendrier
RDV/services/praticiennes/fiches clients) converted to `Kiwi.appPage()` full views, same as
transactions/terminaux/réservations. Root cause of the "raw text" look the user screenshotted:
the spa family's CSS (~80 classes: `.s-*` `.pr-*` `.sc-*`) had NEVER been written — now in
pages-pro.css (+260 lines, tokens only): positioned week-calendar grid, KPI strips, heat row,
waitlist, iOS toggle, package cards, practitioner cards, client CRM. appPage() now returns a
drawer-compatible `close()` (goes home) and rebuilds a fresh `.dash-genpage` host per render
(destinations attach listeners to the host — reuse stacked duplicates). Nested detail
drawers/wizards stay drawers on top of pages. Gotcha for future conversions: root lookups
must point at `.dash-genpage`, not `.kiwi-drawer`; drop `data-dismiss` foot buttons.

**Jun 10 evening:** `2368b21` **all 15 trades get full home-card vocabulary** — the vocab
layer extended from gym-only to every onboarding activity type. Each trade now has its own
feed badge ("FOUR ALLUMÉ", "EN TOURNÉE", "FOURNIL OUVERT"…), products card (Top boissons /
combos / fournées / pizzas / menus / titres / compositions…), manage link, staff card
(Performance vendeurs / praticiens / coiffeurs / coachs), evening card (précommandes gâteaux,
prochain événement, prochain emplacement, GARDE pharmacie, livraisons fleuriste), nav label
and ask-bar placeholder — all FR/EN/AR in `SUBTYPE_PROFILES[*].vocab` + `BASE_VOCAB`
(venues.js). Field-level merge: a subtype overrides only what differs from its base
vertical. All 15 probed live; AR pass on boulangerie; Café Atlas restores stock copy.

**Jun 10 early evening:** `9d805fa` **home cards speak the trade's language** — follow-up
to the subtype profiles: the user opened their gym and the home cards still said
« Première commande à venir », « ingrédients », « Gérer menu », « votre restaurant ».
New vocab layer: `BASE_VOCAB` (boutique/spa) + `SUBTYPE_PROFILES[*].vocab`
(sport/coiffure/pharmacie) in venues.js, resolved by `KiwiVenue.getVocab(section)`;
dateRange.js `tradeStr()` merges it over the default empty-state dicts (feed badge,
stock card, evening card, Top produits, Performance équipe, ask-bar placeholder, sidebar
« Commandes » → Passages/Ventes/Encaissements). Products/staff card titles + the manage
link moved from `data-i18n` to JS-owned text so the per-venue relabel can win — restores
mirror the former i18n values exactly. Also fixed the « NaN % » Rétention tile (0-division
in the retention derive on a fresh venue's zeroed data).

**Jun 10 end of afternoon:** `e5adccb` **each trade gets its own features** — the 15
onboarding activity types stop inheriting restaurant/boutique/spa wholesale.
`SUBTYPE_PROFILES` in venues.js: 12 full trilingual profiles (café, fast-food,
boulangerie, pizzeria, traiteur, food truck, épicerie, pharmacie, librairie, fleuriste,
coiffure, salle de sport), each with its own sidebar nav labels (mapped onto the base
vertical's nav targets, so pages still work), its own KPI band spec (keys from the valid
data-key set; labels in the trade's vocabulary — "Patients réguliers", "Retours labo",
"Passages", "Rétention"), and 3 **optional** step-2 onboarding questions. The wizard is
now two steps: type+name → trade questions with « Passer pour l'instant » skip; answers
persist as `profileInfo` on the custom venue (skip ⇒ null). KPI band wiring: profile
labels win over the generic KPI_CATALOG and tiles skip `data-i18n` (i18n.js would
overwrite them); the band re-renders on `kiwi:langchange` so AR/EN re-pick. Gotcha fixed
on the way: `vData()` zero-cloned **cafeAtlas** for every custom venue, so
vertical-specific tiles (tauxRetour, retention…) silently dropped — it now clones the
base type's demo sibling (maisonMansour / spaBahia). Verified live both paths:
Pharmacie (full answers, FR+AR) and Salle de sport (skip path).

**Jun 10 late afternoon:** `32b6b59` **Exclusif Ultra band** — the fusion/portfolio view
(the Ultra experience) gains Section 5b living the 1 499 pillars: actionable cross-site
AI rec (+3 800 MAD/sem staff transfer, real roster names), account manager card (Yasmine
Kabbaj, median 11 min), enterprise API panel (key/webhooks/SFTP/SLA), ROI header line
(≈0,1 % du CA portefeuille — matches the 1,47 M sidebar figure). Trilingual FS_ULTRA_STR
in venues.js; CTAs = honest toasts; upgrade modal Ultra tier now lists portfolio view +
ROI. NOTE: dashboard2.html (partner's hotel fork) has its own copies — not synced. ·
`6eeb0ac` **main column + side rail** (.dash-cols two independent stacks; cards pack at
exactly 14px; <1100px dissolves via display:contents + priority order).

**Jun 10 afternoon:** `993e60c` **the 10/10 polish sweep** — a 6-agent Workflow audit (71
graded findings, full output preserved in the commit message) → ~50 fixes in 23 files:
every flat-slab row hover → eased brand tint w/ rounded end cells; press states across the
overlay kit/landing/wallet; dark-mode root causes (venue dropdown, heatmap ramp via
color-mix, KDS invalid nested @keyframes strobe, .on-state specificity traps in growth
modules, sparkline token, ~40 leftover #fff); the ux.css duplicate focus rule that
RESHAPED buttons on keyboard focus; the dead Export button (cross-IIFE ReferenceError);
RTL mirrors for the 2026 row leans; brand.html 'Deux paliers' → 'Quatre formules. Deux
expressions.' Earlier same day: `cfbf1e6` lens-wash row hover (the user's canonical hated
slab), `9761527` conscious cards (.row align-items:start — cards end at their data) + the
analyses disclosure as a glass capsule w/ live count chip + animated unfold, `9309a98`
darker iOS-27 sidebar on desktop light, `b4a7a0c` night-crash fix (chart RangeError after
23h sim), `224919c` **la lentille liquide** brand motion + module. Deferred wave-2 (see
spawn-task chip / audit output): traveling lens for command palette + accounting tabs,
six-toggle standardization, .kit-empty empty-state rollout, premium.css deletion, .kb
radius unification.

**Past-midnight Jun 9→10:** `224919c` **LA LENTILLE LIQUIDE** — the capsule bar's sliding
highlight is now THE brand selection motion (`assets/liquid-lens.js`: spring
cubic-bezier(0.34,1.45,0.5,1)·310ms, 115ms stretch-then-settle). Auto-attached to the
dashboard date-range pills, resv/KDS tab rows, the landing audience switch, plus a live
demo + spec in brand.html 07·MOTION; CLAUDE.md §3 makes it a rule (new segmented controls
register in the lens module — never invent another active style). The module only watches
class/aria-selected mutations — existing handlers untouched. · `b4a7a0c` **night-crash
fix**: renderRevChart's live padding went negative after ~23h sim time (RangeError killed
the render+setLang chain for night viewers) — clip to 16 before padding.

**Late-night Jun 9:** `2f6bfad` **mobile capsule bar** — the dashboard's phone bottom nav
is now the serveur app's floating Liquid Glass capsule (same glass recipe + rubber-band
sliding lens, ported to `mobile-nav.js` `movePill()` / `mobile.css`), icon-first with
sr-only i18n labels, live Commandes badge mirroring the sidebar count; phone polish:
LIVE-chip nowrap, date-pill edge fades, 2 dark-mode `#fff` fixes, RTL bidi-isolate on
hero-breakdown values. Verified 375×812 light/dark × FR/AR.

**Push-to-10 polish session (evening Jun 9):** `0aa162e`+`59a8b68` **P0 hotfix — partner's
Safari-fallback commit ate the role-gate's `</script>`, which swallowed the i18n.js include
(blank/FR-only dashboard on main for ~30 min; both of us fixed it in parallel, merged
clean)** · `78dc7af` i18n: live-feed payment strings translated at render time, sidebar
upsell FR/EN/AR + langchange re-render, `sidebar.restaurant.finance` key, RTL bidi-isolate
on hero money figures · `56e3ef6` **tools/check.js smoke suite** (syntax, data-action↔handler
coverage, i18n EN/AR parity, balanced `<script>` tags, forbidden patterns) + tools/push-both.sh;
its first run found two dead spa-services buttons (svc-new, svc-cure-edit — wired) and the
missing role-badge key · `4f5467f` Settings drawer fully FR/EN/AR + **stored-XSS fix**
(custom-venue name/hours/methods were interpolated unescaped) · `94e8b64` Liquid Glass
light-mode push · `831fe88` pages-pro.css 36 white surfaces → `var(--surface)` ·
`4ac23da` **reservations page rebuilt honest**: real dates (Intl per lang), derived counts,
full FR/EN/AR incl. booking notes · `da144fa` a11y batch: menu keyboard nav (roles/arrows/
Escape/focus return), toast live region, appPage focus-to-h1, skip-to-content link, drawer
title escaping, 13 injected-CSS white surfaces → tokens, dark-fixes observer scoped to
added subtrees (it was watching `.app` children while appPage mounts into `.container` —
near-dead before).

**Earlier session:** `08db17c` remove Design-2026 pill (+fix the lock-screen collapse it exposed) · `a001f51`
enable Design 2026 on every passcode · `a13df9f` **Liquid Glass skin** · `d48135f`
**expand Mon profil → account+business hub** · `83045b7` real Profil/Facturation/Aide pages ·
`fc08d02` unify destinations to full-page format · `e58c4f6` a11y (icon-button aria-labels) ·
`1b3246e` reframe the CMI savings calc · `6ecffe7` **HACCP + equipment data fully trilingual** ·
`ea1fd7b` propagate 4-tier pricing everywhere · `9fb919f` **4-tier upgrade modal** · `1c618f5`
lazy videos · `b1a6341` more conformité/stock i18n · `50654d8` conformité dialog a11y ·
`8ddcc98` make Settings actually customizable. Earlier in the session: comprehensive dark-mode
pass, the big merge, PIN-gated Croissance, finance i18n, **P0 stored-XSS fix at the `modal()`
helper**, stock scroll-lock-leak fix.

## 9. Honest quality state & what's left

**As a demo: ~9.5/10. As a production foundation: improving.** The backend has since landed
(Cloudflare D1 + Pages Functions: real accounts/auth, Live Link sales, operator console,
caisse↔dashboard pairing; plus the Kiwi Printer Bridge for real thermal printing). The old
"no backend — deliberate, that's the ceiling" framing is **obsolete** — production-readiness
is now an active work item, not an accepted 3.5. The **frontend** stack is no longer locked
either (2026-08-13) — build tooling and frameworks are available where they earn their place.
Open items:
- **EN home-page accent scan returns zero leaks.** Standalone partner pages (kiwi-order,
  kiwi-caisse, kiwi-serveur) have their own inline dicts — out of i18n.js scope by design.
- **`background:var(--ink)` debt:** ~55 instances inventoried by tools/check.js as a
  warning (runtime-patched today by theme.css overrides + dark-fixes). Don't add more.
- **Savings calculator (`ux.js`):** stays honest, reframed off the "vs CMI" premise —
  **the user actively dislikes overpromising**.
- **Perf:** ~3.5 MB `.mov` in `menu_try_video/` (lazy, metadata-only preload) — fine.
  dark-fixes now rescans only added subtrees, never the full app.
- **Paramètres-as-page:** still offered, still not done (drawer is now fully trilingual).

## 10. How to verify (the loop that works)

**Run `node tools/check.js` before every push** — syntax, data-action↔handler coverage,
i18n EN/AR parity, balanced `<script>` tags, forbidden patterns. Exit 0 or don't ship.
Use the **preview tools** (`preview_start` → `kiwi-static` on **:4173**, then
`localhost:4173/dashboard.html`). Enter a PIN to pass the lock (or click the skip button).
**Always verify across {light, dark} × {FR, EN, AR-RTL}.** **Screenshots are ground truth**
— the contrast scanners give false positives on gradients, trust the picture. Note: the
preview tab is hidden, so `requestAnimationFrame` doesn't fire between evals — take a
screenshot to pump frames before asserting on rAF-gated UI (toasts).
**The partner pushes to main while you work.** Twice in one evening: a feature commit and
a parallel hotfix. If `git push origin HEAD:main` is rejected: `git fetch origin`, inspect
`git log HEAD..origin/main`, merge (never force), re-run `tools/check.js`, push both. Their
Safari-fallback commit shipped with a missing `</script>` that silently killed i18n — the
balanced-tags check exists because of it; run it on THEIR commits after every merge.
`tools/push-both.sh` does the two-branch push with the right failure message.

## 11. User preferences (also in the memory system)

Commit & push everything without asking (both branches). The Kiwi AI agent must handle
multi-turn corrections — the user calls bad/forgetful answers "bullshitting." Wants a
bleeding-edge **2026 / iOS-era "Liquid Glass"** look, with big visual experiments **gated +
reversible**. Values **accuracy and honesty** over hype. Action-oriented — prefers "just do
it and push" over long check-ins.


---

# Partie 2 · Contexte complet (ex-HANDOFF.md)

# Kiwi — Agent Handoff Document

**Last updated:** 2026-05-12 · **superseded on current state by `AI_HANDOFF.md`** — read that first; this file remains the full history/context companion.
**Location:** `/Users/badrosonair/Documents/kiwi/` (mirror at `/tmp/kiwi-preview/`) · GitHub `https://github.com/badro99/Kiwi` (auto-pushed after every edit — see `CLAUDE.md` §1)
**Status:** Real, working product with a live backend (Cloudflare Pages Functions + D1: accounts/auth, till pairing, live sales sync, operator console) and real hardware I/O (Kiwi Printer Bridge). The "high-fidelity prototype" framing this document was written under (May 2026) is retired — see `CLAUDE.md` §2.
**Founders:** Badr-Eddin Bakkioui (CEO) & Zakariae Attahiri (CTO · COO) · `invest@kiwi-os.com` · Tanger

---

## 0. What Kiwi is

A Moroccan fintech super-app, POS-first. Phase 1 = **pure SaaS subscription for restaurants, cafés and retail**, four tiers: **Kiwi Basic 199 MAD/month** (software only, on the merchant's own hardware, integrated into the existing till, training + guides included), **Kiwi Pro 399 MAD/month** (everything in Basic + one free Kiwi cashier, T+1 settlement, hardware maintenance), **Kiwi Ultra 1 499 MAD/month** (unlimited établissements, multi-pays, API enterprise, dedicated 24/7 account manager) and **Kiwi Ultimate · sur devis** (bespoke). Hardware (PAX A920, KDS tablet, Kiwi Tap SoftPOS) is **loaned for free** from Pro upward. Zero commitment, WhatsApp-native support. Phase 2 = **Kiwi Pay** (own Payment Institution license, SoftPOS on server phones, low merchant margins) + Kiwi Banking. Phase 3 = Kiwi Investing (fractional AMMC, halal filter).

Brand positioning: *"Le système d'exploitation du commerçant marocain."* Aesthetic = Mercury / Ramp / Stripe tier, but with Moroccan-specific cultural intelligence (Darija-Arabizi in the voice, Zakat/Sadaqa as native features, Friday/Ramadan rhythms, diaspora France↔Morocco corridor as a defensible wedge).

**Revenue phases represented in the prototype:**
1. Phase 1 — Kiwi Basic SaaS · 199 MAD/month (software only on the merchant's own hardware, 1 établissement, integrated into existing till, training + guides)
2. Phase 1 — Kiwi Pro SaaS · 399 MAD/month (Basic + 1 free Kiwi cashier, règlement T+1, hardware maintenance)
   · Kiwi Ultra · 1 499 MAD/month (unlimited établissements, multi-pays, API, dedicated AM) · Kiwi Ultimate · sur devis (bespoke)
3. Phase 2 — Kiwi Pay (acquiring under own PE license, servers accept on their own Android, low MDR to merchants)
4. Phase 2 — Kiwi Banking · Kiwi Compte IBAN + debit card + Murabaha lending
5. Phase 3 — Kiwi Investing · fractional AMMC funds, halal filter, CSE + ETFs
6. Cross-cutting — remote Payment Links, Zakat calculator + Sadaqa round-up, diaspora FX corridor (France ↔ Maroc)

Hardware is a Kiwi CapEx line — **never a revenue line**. The distribution moat is that merchants switch from CMI without upfront cost.

---

## 1. Tech stack (boring by default, not by law)

- **HTML + CSS + JS, no build step *today*.** Not a locked constraint — the
  vanilla-only rule was lifted by the owner on 2026-08-13. Frameworks, bundlers,
  TypeScript and test runners are all on the table where they're the better tool;
  see `CLAUDE.md` §2 for how to weigh that against rewriting a shipped surface.
- **Serves from a Python `http.server`** (sandboxed copy at `/tmp/kiwi-preview/`).
- **Fonts:** Google Fonts — Inter Tight, Instrument Serif, IBM Plex Sans Arabic, JetBrains Mono.
- **Real backend (landed July 2026).** Cloudflare Pages Functions + D1 (`functions/`, `schema.sql`): accounts/auth, merchant config, caisse↔dashboard pairing, live sales sync, clients, menus, orders, operator console. Surfaces fail soft to per-device state when it's unreachable.
- **localStorage** for client-side persistence (lang, theme, mode, per-store state); D1 for server-authoritative data.

The choice of vanilla was intentional: the product must be demonstrable by anyone, anywhere, without toolchain. Any agent inheriting this project should resist the urge to "migrate to Next.js" — the vanilla decision on the **frontend** is deliberate and durable; the backend is real and lives in `functions/`.

---

## 2. File structure

```
kiwi/
├── index.html          Landing page (marketing site) · primary investor/client entry point
├── dashboard.html      Merchant dashboard · has Simple Mode (default) + Pro Mode
├── wallet.html         Consumer Kiwi Wallet (phone mockups + features)
├── brand.html          Design system + brand guidelines
├── pitch.html          12-slide investor pitch deck
├── HANDOFF.md          ← this file
├── _serve.py           Python preview server (unused in prod; dev only)
└── assets/
    ├── logo.svg        Wordmark (atlas green)
    ├── logo-white.svg  Inverse wordmark
    ├── mark.svg        Rounded-square "k" app icon
    ├── favicon.svg     16-64 favicon
    │
    ├── tokens.css      ★ Design system tokens: colors, typography, spacing, buttons
    ├── theme.css       Dark-mode overrides (kept for future; UI toggle is removed)
    ├── polish.css      Grain, scroll reveals, 3D card tilts, marquee, editorial block
    ├── premium.css     Pill nav scroll-morph, gradient mesh hero, proof stats, dark break, glossary
    ├── simple.css      Simple Mode (merchant dashboard · senior-friendly layer)
    ├── ux.css          Interactive pricing calc · map tooltips · shortcuts overlay · ripple
    │
    ├── interactive.js  ★ Core interaction layer: toast, modal, drawer, command palette, handlers
    ├── features.js     Feature handlers: payment links, Zakat, Sadaqa, Ramadan, Kiwi Compte,
    │                   Capital, Diaspora FX, Loyalty, AI Agent Mode
    ├── pages.js        Dashboard sidebar destinations: Transactions, Terminaux, Règlements,
    │                   Conformité, Équipe, Tables, Menu, KDS, Stock ingrédients
    ├── i18n.js         ★ FR/EN/AR translation layer (setLang, captured-originals pattern)
    ├── simple.js       Simple Mode runtime (3 tabs: Lyoum · Flousi · 3awn)
    ├── polish.js       Scroll reveals, count-up animations, live tx feed, live clock
    ├── premium.js      Pill nav scroll tracker, rotating verb carousel, map ping rings
    └── ux.js           Pricing calculator, hero parallax, map tooltips, shortcuts overlay,
                        button ripple, Simple-mode live timestamp
```

**★ files are load-bearing.** The rest are optional enhancement layers.

---

## 3. How to run

```bash
# Option A — Python (what we use)
cd /Users/zaka/Desktop/Gemma/kiwi && python3 _serve.py
# then open http://localhost:4321/index.html

# Option B — any static server
python3 -m http.server 4321 --directory /Users/zaka/Desktop/Gemma/kiwi
# or: npx serve kiwi · or: caddy file-server

# Option C — just open the files directly
# open -a Safari /Users/zaka/Desktop/Gemma/kiwi/index.html
# (works for index/wallet/brand/pitch; dashboard needs a server for the i18n module path)
```

**The sandboxed preview copy at `/tmp/kiwi-preview/` is served on port 4321** by a launched Python server (see `.claude/launch.json` one directory up). Keep the two directories in sync: any edit in `kiwi/` must be copied to `/tmp/kiwi-preview/` before the browser preview reflects it.

```bash
# Sync pattern:
cp /Users/zaka/Desktop/Gemma/kiwi/<file> /tmp/kiwi-preview/
cp /Users/zaka/Desktop/Gemma/kiwi/assets/<file> /tmp/kiwi-preview/assets/
```

---

## 4. Brand system (locked, do not redesign)

**Colors** (defined in `assets/tokens.css`):
- Primary: `#0B6E4F` — Atlas Green
- Deep:    `#053B2C` — Riad
- Accent:  `#7DF2B0` — Mint (use ≤5% of surface area)
- Paper:   `#F7F5F0` — warm bone (never pure white for backgrounds)
- Ink:     `#0A0F0D` — warm near-black
- Full neutral ramp `--n-50` through `--n-800`
- Semantic: `--success #1FB574`, `--warning #D99A2B`, `--danger #C94A3A`, `--info #3A6FB8`

**Typography:**
- Display + body: **Inter Tight** (Medium 500 for headlines — never Bold)
- Editorial italic: **Instrument Serif** (use for 1 word per headline, not more)
- Arabic: **IBM Plex Sans Arabic**
- Monospace: **JetBrains Mono** (tabular numbers)

**Logo:** lowercase wordmark "kiwi" + mint-dot accent. No fruit imagery. Ever.

**Voice:** Direct, Moroccan, adult. Darija-Arabizi for emotional CTAs (*flousak kayji ghda sbah*), French for descriptive copy. Never formal French. No emoji in headlines. No orientalist clichés.

**Locked don'ts** (every agent inheriting must respect):
- No emoji in section titles or CTAs
- No stock photography (when real photos are added, shoot original Moroccan merchants)
- No gradient backgrounds behind hero copy (gradients only inside product-UI indicators)
- No Bold weights on display text
- No multiple accent colors in the same viewport
- No tagine / lantern / camel / souk iconography
- No pure white `#fff` — use `var(--paper)` which is `#F7F5F0`

---

## 5. Key architectural decisions

### 5.1 Language system (`assets/i18n.js`)

The **captured-originals pattern**: on page load, we walk every `[data-i18n]` element and store its FR content in memory under its key. When switching to EN or AR, we swap innerHTML from the `T[lang][key]` dictionary. Switching back to FR restores from captured originals — so FR translations don't need to exist in the dictionary (saves ~40% of the file).

RTL is triggered by `document.documentElement.dir = 'rtl'` on Arabic. Most layout flips naturally (flex, grid, logical properties). For directional arrows in buttons, `theme.css` has `html[dir="rtl"] .btn svg { transform: scaleX(-1); }`.

### 5.2 Mode system (Simple / Pro)

Toggled via `html[data-mode="simple"]` or `"pro"`. Persisted in `localStorage.kiwiMode`. Default = `simple` (per founder direction for accessibility).

In **Simple Mode**, `simple.css` hides `.container` (the Pro dashboard body), `.topbar`, `.sidebar`, `.status-bar`, `.demo-bar`, `.ai-drawer`, `.ramadan-banner`. The `.simple-root` injected by `simple.js` is a 520px-centered column with 3 tabs (Lyoum · Flousi · 3awn). 18px body, 36px amounts, 56px tap targets. Routes simple-action events to the rich Pro-mode handlers (`payment-link`, `new-sale`, `kiwi-compte`) so the same logic is reused.

In **Pro Mode**, simple UI elements are removed from the DOM and the regular dashboard is visible with its sidebar, topbar, live feed, AI drawer, etc.

A big pill toggle lives **fixed top-right** in both modes. Also switchable via `⌘⇧M` keyboard shortcut.

### 5.3 Interaction layer (`assets/interactive.js`)

**Event delegation, not per-element handlers.** One global click listener routes based on:
1. Explicit `[data-action="…"]` with registered handler
2. Range/tab toggles
3. Language switcher
4. Anchor smooth-scroll
5. AI drawer suggestions/close
6. Feed rows / KPI cards / sidebar links / location switcher / profile menu
7. Icon buttons (notifications, settings)
8. Fallback for plain `.btn` classes — **but scoped via `SKIP_FALLBACK_CONTAINERS` and `SKIP_FALLBACK_ATTRS`** so it never fires inside modals, drawers, menus, or on elements with their own handler.

All modals/drawers created via `Kiwi.modal({...})` / `Kiwi.drawer({...})` / `Kiwi.toast(...)`. Fully keyboard-closable via Escape. Click on backdrop closes. First focus does NOT auto-trap (known QA gap — see §7).

### 5.4 Feature handlers (`assets/features.js`)

Each feature is a handler registered on `Kiwi.handlers[name]` and opens a modal or drawer. Handlers are idempotent and self-contained. Registered names:
- `payment-link`, `zakat`, `sadaqa`, `ramadan-toggle`, `kiwi-compte`, `capital`, `diaspora`, `loyalty`, `agent-mode`

Calling `Kiwi.handlers['zakat']()` from anywhere opens the Zakat calculator.

### 5.5 Pages (`assets/pages.js`)

The 10 sidebar destinations on the dashboard. Each one is a full-width drawer with real-looking data tables, cards, or calendars. Handler names are prefixed with `nav-` (e.g., `nav-transactions`, `nav-kds`, `nav-stock`). Wired to sidebar links via `data-nav="transactions"` etc.

### 5.6 UX layer (`assets/ux.js`, shipped latest)

Currently on landing + dashboard:
- Scroll progress bar at top
- Hero mouse-parallax on dashboard mockup (rotateY ±4° / rotateX ±3°)
- Morocco map hover tooltips (city name, merchant count, latest transaction)
- Interactive pricing calculator (slider + tier toggle + persona label + live savings calc)
- Keyboard shortcuts overlay (press `?`)
- Button ripple on `pointerdown`
- Simple Mode live "updated X sec ago" timestamp

---

## 6. Known content (what's actually rendered)

### Landing (`index.html`)
Nav · Hero (with gradient mesh + rotating verb carousel: 9 verbs) · Embedded live dashboard mockup · Marquee ticker · Trust bar · Stats (animated count-up) · 3 product tiles · Feature rows × 3 · Moroccan-restaurant pill section · Morocco merchant map (8 cities, animated pulse-pings) · Editorial break (*"Un pays de 73 305 restaurants…"*) · Monzo-style proof stats (1 847 MAD/mois · 7 min · 2,3M Zakat) · Pricing calculator (interactive) · Static Base vs Pro cards · Testimonials (3 named merchants) · Security section · Starling-style dark break · Loops.so glossary grid (6 cards) · Press logos · Final CTA · Footer.

### Dashboard Simple Mode
**Lyoum:** greeting + help icon · big amount · payout card · Encaisser primary CTA · 3 mini-tiles (Envoyer un lien · Rembourser · Ma carte) · Derniers paiements (5 rows).
**Flousi:** weekly total · Kiwi Compte balance widget · 7-day list · Envoyer au comptable.
**3awn:** Appeler conseiller · 4-item FAQ accordion · Vidéo Kiwi · small ghost "Mode avancé" link.

### Dashboard Pro Mode
Demo bar · Sidebar (260px, 15+ items across 3 sections) · Topbar (breadcrumb, search with ⌘K, team avatars, notifications, settings, `?` hint, AI button) · Hero Today card (gradient with live badge, 120px amount, 4-metric breakdown, 24h spark, objectif progress) · 6 KPI cards with sparklines · Revenue chart 7-day · Payment mix donut · Hour×day heatmap · Live transactions feed (auto-refreshes every 9-16s) · Settlement card · 7-day timeline · Health score (91/100) · Benchmark (#12/147 Casa cafés) · Top products · Staff performance · Integrations · AI drawer (floating bottom-right with 3 suggestions).

### Wallet (`wallet.html`)
Nav · Hero with phone mockup (home screen) · 3 phone cards side-by-side (Pay QR, Kiwi Card, Split Bill) · 6-feature grid · Investing block · Roadmap cards · Final CTA · Footer.

### Brand (`brand.html`)
Full design system reference with 8 sections (Logo, Couleurs, Typographie, Voix, Iconographie, Grille, Motion, Règles).

### Pitch (`pitch.html`)
12 slides: Cover · Problem · Why Now · Solution · Market · Product · Business Model · Traction · Competition · Team · Roadmap · Ask.

---

## 7. Known bugs / unfinished

From the automated QA audit (Nov 2025). BLOCKERS are fixed. HIGH items remaining:

1. **Dashboard has only partial `data-i18n` coverage.** Page greeting, KPI labels, block titles on dashboard do not switch when EN/AR is selected — they stay French. Fix: add `data-i18n` attributes to the ~30 dashboard strings; the i18n keys already exist in `i18n.js`.
2. **Command palette has no keyboard nav.** Footer promises "↑↓ naviguer" but only hover-highlight is wired. Fix: add keydown ArrowUp/ArrowDown to cycle `.kp-item.active`, Enter to activate.
3. **Modal/drawer focus traps are missing.** Tab escapes into the page behind. Fix: on open, focus first tabbable element; on Tab from last, cycle to first.
4. **Wallet `.f-card` tiles are `<div>`s, not `<button>`s.** Keyboard-unreachable. Fix: swap tag or add `role="button" tabindex="0"`.
5. **Landing mobile responsiveness:** dashboard mockup SVG `preserveAspectRatio="none"` stretches vertically at <375px; `.tx-head`/`.tx-row` 5-col grid squeezes below 640px; heatmap needs horizontal scroll below 480px.
6. **RTL polish:** `.dash-float` at `right: -14px` can overflow the viewport on mobile Arabic layout.
7. **Pitch deck is English-marked (`<html lang="en">`) but content is French, and has no lang switcher.**

See the full 85-item audit by searching for the QA agent transcript if needed; this project's next agent should keep a running todo file.

---

## 8. What's next (prioritized roadmap for the inheriting agent)

### Immediate (< 1 day each)
1. Fix the 7 HIGH items above
2. Add `data-i18n` to remaining dashboard/wallet strings
3. Run Lighthouse once — expect <90 performance from ungzipped font loads + grain SVG
4. Add `<meta name="description">` per page for SEO
5. Add `og:` and `twitter:` meta tags for social previews

### Short horizon (1–3 days each)
6. **Hook up a real backend** — even mocked via Supabase or Cloudflare Worker — for the signup wizard so real leads funnel into a CRM (currently pressing "Créer mon compte" does nothing but confetti)
7. **Build the Kiwi Invest UI** (Phase 3 in the pitch deck, not yet in Wallet) — fractional AMMC fund tiles, stock picker, halal filter
8. **Add the Pro-only surfaces** promised when the merchant toggles from Simple → Pro:
   - API keys + webhook log viewer
   - CSV import
   - Raw ledger query console
   - Bulk refund tool
9. **Dashboard live data simulation depth** — right now only the Pro dashboard's live feed animates. Simple Mode numbers are static; should tick.
10. **Real Moroccan photography shoot** — commission a 1-day photo shoot in Casablanca/Rabat/Marrakech of actual merchants. Replace the zero photos currently on the site with these.

### Medium horizon (1–3 weeks)
11. **Productize the Simple/Pro mode toggle** — currently a toggle; should be a smart default based on user's tenure (new user → Simple, power user → Pro) + an onboarding tutorial
12. **Kiwi Agent Mode upgrades** — right now it's 5 static suggestions; wire it to a real LLM backend (Anthropic Claude) for generative action proposals
13. **Push notifications / WhatsApp integration** — founder wants to keep merchants IN Kiwi, so build our own chat/notification layer rather than deep-linking to WhatsApp for every action
14. **Arabic UX QA** — find a native Arabic-speaking Moroccan merchant to review RTL layout. The current Arabic is plausible but not native-reviewed.
15. **Accessibility pass** — full WCAG 2.2 AA sweep (contrast, tab order, focus management, ARIA labels) — required for fintech compliance expectations in 2026

### Long horizon (built around real backend)
16. **Real KYC integration** — Sumsub or equivalent for CIN + selfie verification (currently a mocked wizard)
17. **BAM PE license filing** — the regulatory path mapped in the pitch deck requires this
18. **Merchant onboarding partner integration** — connect to Damane Cash or CDM Pay as sponsor acquirer (see `memory/kiwi_brand_system.md` for context)

---

## 9. Agent operating instructions

If you're an agent inheriting this project:

1. **Read this file first.** Then read `assets/tokens.css` (the design system), `assets/interactive.js` (the event model), and `assets/i18n.js` (translation pattern). That's ~800 lines total and gives you the architecture.
2. **Never edit `/tmp/kiwi-preview/` directly.** Always edit `/Users/zaka/Desktop/Gemma/kiwi/` and copy forward. The `/tmp` copy is the sandboxed preview runtime only.
3. **The dark-mode toggle was removed from the UI** per the founder's explicit direction (2026-04-24). The CSS vars still work if you set `html[data-theme="dark"]` programmatically, but don't re-expose the toggle unless explicitly asked.
4. **Simple Mode must remain sufficient for all daily merchant tasks** per founder direction (2026-04-24). Don't add features that are Pro-only by design — add them as mini-tiles, FAQ items, or contextual actions within Simple Mode too.
5. **No locked stack (since 2026-08-13).** Frameworks, bundlers, TypeScript and test runners are allowed — use whichever is genuinely best. What still needs a plan and the owner's go-ahead is *rewriting a surface that already ships to merchants*; new surfaces and non-runtime tooling don't. See `CLAUDE.md` §2.
6. **Memory system** — there are project memories at `/Users/zaka/.claude/projects/-Users-zaka-Desktop-Gemma/memory/` including user profile, brand system, and project context. Respect them.
7. **When the founder says "make it feel like $100M"**, the playbook is in `premium.css` + `ux.css` — pill nav, gradient mesh, mouse parallax, word stagger, scroll reveals, 3D card tilts, ripple, grain texture, count-up, marquee. Compound these; don't replace them.
8. **The 3 research agent briefs** (Moroccan market · $100M patterns · senior UX) were synthesized into this project. Re-deploying them is usually wasteful; read this file and the inline code comments instead.
9. **Known user style:** likes big ambitious scope, "take as long as needed" framing, wants parallel agent deployment for independent research, values tangible output over memos, will give direct feedback if something misses (e.g., "too simple", "still not fixed", "not a $100M website").

---

## 10. Build log since 2026-04-25 — the "merchant operations" layer

Everything below was added **after** the original handoff was written. It is the
work that should drive the next pass on the seed deck and pitch website. All
commits are on `main` at `github.com/badro99/Kiwi`; commit hashes referenced
inline for traceability.

### 11.1 Dashboard entry sequence — PIN lock + greeting flash (`47efc33`, `0dc12b3`, `314ba2b`, `21b8030`)

The dashboard no longer drops the user straight into the merchant view. On
every reload the experience is:

1. **Full-viewport PIN lock** — 4-digit numeric pad over a paper-colored canvas.
   Code entry animates cells `is-success` left → right on entry.
2. **Greeting flash** — "Bonjour Rachid," lands centered, holds ~600 ms, then a
   green Instrument-Serif italic types in to the right of the comma
   ("bienvenue dans Kiwi.") via a single max-width CSS transition with a caret
   on the ::after pseudo. See `/tmp/kiwi-greet-new.js` for the canonical
   timeline (cells settle 460 ms → lock fades → 1400 ms typewriter starts →
   2400 ms caret drops → 3200 ms greeting fades + dashboard dives in →
   4000 ms greeting removed).
3. **Dashboard "dive in"** — the demo bar + main app fade-up from underneath
   the greeting on a synchronized timeline.

This entry exists to make the seed-deck screen-recordings open with a moment
of brand voice instead of a static dashboard. Worth a 3-second clip in the
"Product" slide.

### 11.2 Caisse (in-resto checkout) — full PIN + équipe + split bill (`d4dc9f3`, `9f75584`, `95c4052`, `856acaf`)

The caisse surface (the on-Android-tablet checkout the staff use) is now a
miniature product of its own:

- **Staff PIN login** before any cashier action — each server has a 4-digit
  code, with an "Équipe" tab tracking who is on shift, on break, with
  messages to/from the manager.
- **Server assignment to tables** — visible avatars on every table tile
  (even empty ones) so the owner sees who owns which section at a glance.
- **Persistent split bill** — by item, by guest, or equal parts. State
  survives table switches and reopens with the bill mid-split.
- **Gamification** — tip leaderboard + service-speed badges per server,
  displayed in the Équipe tab.
- **iOS-style entry animation** after PIN success — zoom-in + welcome
  banner gradient. Matches the dashboard greeting flash in feel.

### 11.3 Serveur mobile app (`5982ea0`, `a3f279d`, `4d03e84`, `f45c1ad`, `70c1a5c`, `7ca843e`, `74cbd22`, `b401d7e`, `03daae3`)

A **separate mobile-first surface** for waiters running on their own Android
phone. Same brand language as caisse but with mobile-native gestures:

- 4-digit PIN before pointage (clock-in)
- "Vos tables ce soir" landing — the server sees only their own assigned
  tables, ranked by oldest order time
- Menu with category tabs, item modifiers, and a sticky "Voir la commande"
  bar that only appears in the Menu tab (regression-tested)
- Split par article (inverse model: pick the guest first, then tap items)
  + "Toutes regroupé par serveur" view
- Explicit "Lancer la commande" button — order isn't sent to the KDS until
  the server taps it (no auto-fire on item add)
- Background-persistent split — server can leave the table mid-split, come
  back, state is intact

**Implication for the deck:** Kiwi is no longer "the merchant dashboard" — it
is a 3-surface system (owner dashboard / cashier caisse / server mobile)
unified by the same brand. The pitch site needs a triptych shot.

### 11.4 Owner-perspective restaurant operations (`57edeb7`, `b6a712f`, `8f8eb04`)

The four restaurant features on the sidebar (Tables & additions, Menu, KDS,
Stock ingrédients) were reframed from "what a cashier does" to "what the
owner does from anywhere":

- **Tables & additions redesigned** as a strategic floor-plan tool — assign
  tables to waiters, drag-rearrange the layout, swap between presets
  (midi / soir / event), view per-table revenue performance + reservations
  + AI insights. **No cashier surfaces** (no "encaisser", no payment
  capture — those live on the Android caisse only).
- **Fullpage drawer mode** added to the interaction layer. New API:
  `Kiwi.fullpage({title, subtitle, body, foot})` — same DOM as `drawer()`
  but slides up from the bottom into a full-viewport overlay with
  max-width 1480 body centered and sticky head/foot. Tables, Menu, KDS,
  and Stock all open as fullpages now (they were cramped as side drawers
  — these surfaces will hold a lot of functionality going forward).

### 11.5 What this means for the seed deck + pitch site

The originals (built 2026-04-24) frame Kiwi as a single merchant dashboard
with Phase 1 SaaS pricing. They are now **incomplete** because they don't
show:

1. The 3-surface system (owner dashboard / caisse / serveur mobile)
2. PIN-locked staff workflows + server gamification
3. The full restaurant-operations suite (Tables / Menu / KDS / Stock as
   first-class fullpages, not sidebar items)
4. The cinematic entry sequence (PIN → greeting flash → dive-in)

When updating the deck and pitch website, the new narrative arcs to
emphasize are:

- **"One system, three surfaces."** Owner gets the dashboard. Cashier gets
  the caisse. Server gets the mobile app. All branded Kiwi, all sync'd.
- **"Designed for the owner who isn't in the restaurant."** The dashboard
  is strategic (assign tables, rebalance sections, see AI insights), not
  operational. The Android tablet and the server phone do the operational
  work.
- **"Staff are first-class."** PIN logins, équipe panel, leaderboards,
  pauses/messages, split-bill persistence. Not bolted on — designed in.
- **Phase 1 pricing — four tiers.** Kiwi Basic 199 MAD/mo (software only, own
  hardware), Kiwi Pro 399 MAD/mo (+ free cashier, T+1), Kiwi Ultra 1 499 MAD/mo,
  Kiwi Ultimate sur devis. Hardware loaned free from Pro up. Don't add public numbers / asks /
  projections to external materials (see `CLAUDE.md` and the no-public-
  numbers memo).

### 11.6 New / renamed file map (delta from §2)

```
kiwi/
├── caisse.html            ★ NEW · in-resto Android-tablet checkout
├── serveur.html           ★ NEW · server mobile app
├── CLAUDE.md              ★ NEW · agent operating rules (read first)
├── KIWI_2.0_ROADMAP.md    Roadmap doc (was already present 04-25)
└── assets/
    ├── pages-pro.js       ★ NEW · owner-perspective restaurant features
    │                       (overrides nav-tables, nav-menu, nav-kds,
    │                        nav-stock from pages.js — last wins)
    ├── dateRange.js       ★ NEW · single source of truth for the
    │                       dashboard's selected date range + per-range
    │                       data; owns the live transaction feed
    ├── interactive.js     UPDATED · added Kiwi.fullpage() API + the
    │                       `.kiwi-fullpage` CSS block
    └── greet.js / lock.js Entry-sequence runtime (see /tmp/kiwi-greet-new.js
                           for the canonical timeline reference)
```

Old paths in §2 referencing `/Users/zaka/Desktop/Gemma/kiwi/` are stale —
the project moved to `/Users/badrosonair/Documents/kiwi/` and is now
git-tracked with auto-push.

---

## 11. Contact

- **Founders:** Badr-Eddin Bakkioui (CEO) & Zakariae Attahiri (CTO · COO) · invest@kiwi-os.com · Tanger, Maroc
- **Preview URL (local):** http://localhost:4321/index.html
- **Source repo:** `/Users/badrosonair/Documents/kiwi/` · GitHub `github.com/badro99/Kiwi` (auto-pushed)
- **Memory:** `/Users/badrosonair/.claude/projects/-Users-badrosonair-Documents-kiwi/memory/MEMORY.md`

---

*Built over ~5 conversations between 2026-04-23 and 2026-04-24 with Claude Opus 4.7 (1M context). The aesthetic target was "indistinguishable from Mercury / Ramp / Stripe in 2026." Hit that bar on hero, calculator, dark break, glossary, pricing. Gaps remain on: real photography, native Arabic review, responsive edges <400px, focus management, real backend.*
