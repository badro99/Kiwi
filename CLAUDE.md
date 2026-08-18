# CLAUDE.md — operating notes for AI agents on the Kiwi project

This file is read on first contact by any Claude session opened against this repo.
It captures rules and conventions that aren't obvious from the code alone — mostly
things that already cost someone a session.
For full project context (history, architecture, brand system, roadmap), read **`HANDOFF.md`**.
**New session resuming work? Read `AI_HANDOFF.md` first** — it's the current-state brief
(what's true right now, recent work, gotchas, the two dev tracks, the Design 2026 skin).

---

## 1. Ship every change to both GitHub mirrors

The project owner's business partner needs constant access to the latest state, and
the two mirrors serve different jobs:

- **`https://github.com/zaka33333-hash/Kiwi.git`** — what **Cloudflare Pages** builds
  and deploys (kiwi-os.com).
- **`https://github.com/badro99/Kiwi.git`** — the **GitHub Pages** mirror and the
  partner's copy.

**Push `main` to both.** Never assume one push covered the other.

**Push by URL, not by remote name.** The remote names get reshuffled between clones
and sessions — in this checkout `origin` and `fork` both point at zaka33333-hash and
`upstream` at badro99, but that is not stable. Run `git remote -v` and push to the
URL you actually want.

After **any edits** to files in this repo:

1. `git add` the changed files — **specific paths, never `git add -A`.** Another
   session is often working in this same checkout, and `-A` will absorb its
   half-finished work into your commit. The `* 2.*` files (`CLAUDE 2.md`,
   `dashboard 2.html`, …) are iCloud conflict copies — never stage them.
2. `git commit` with a message in the format `<scope> · <what changed>`
   (e.g. `dashboard · redesign revenue chart tooltip`).
3. Push `main` to both URLs above.

**Never leave files staged at the end of a turn.** A concurrent session's commit
will absorb anything sitting in the index. `git status` before you finish.

**Never force-push.** Fetch and rebase, or merge `--ff-only`. If a rebase conflicts,
read what upstream wrote before resolving — do not `git checkout --ours/--theirs` on
a content-conflicted file.

**If a merge or rebase is blocked by another session's uncommitted files, isolate in
a worktree** rather than stashing — the stash will swallow their work.

### If a local main clone exists
Older instructions referenced a second working copy at
`/Users/badrosonair/Documents/kiwi`. **It does not exist on every machine.** Check
before using it (`ls -d /Users/badrosonair/Documents/kiwi`); if it's absent, the two
GitHub pushes are the whole job and nothing is being skipped.

### Exceptions (don't commit in these cases)
- **Iteration within one turn.** If the user pivots mid-turn ("make it green / no,
  red"), commit once at the end with the final state.
- **Exploration only.** Reads, greps, file inspection — no commit.
- **Broken state.** If an edit left the repo broken, fix it before pushing. If you
  can't, say so and don't push.
- **Secrets.** If a commit would include anything resembling an API key, password,
  token, `.env`, or credentials — stop and flag it. Never commit secrets. Several
  markdown files here still contain plaintext merchant PINs; rotate before any tool
  pass that uploads document contents.

### Commit author identity
Repo-local config sets the author as `Badr-Eddin Bakkioui <badromail9@gmail.com>`
(in `.git/config`). Append the `Co-Authored-By:` footer for the model running the
session, e.g. `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## 2. Tech stack — real product, best tool for the job

**This is a real, working product with paying merchants — not a mock/pitch demo.**
Build features to actually work, backed by real infrastructure. Where a surface is
still placeholder data, that's tech debt to replace, not the intended end state.

- **Frontend: no locked stack.** The vanilla-only rule is **lifted** (owner's call,
  2026-08-13). A build step, a bundler, TypeScript, a framework, a test runner — all
  are allowed where they make the product better. Pick the best tool and say why in
  the commit.

  **What "best" means here, in practice.** The existing surfaces (`dashboard.html`,
  `kiwi-caisse.html`, `kiwi-serveur.html` and ~186 files in `assets/`) are shipped,
  load-bearing, and carry live merchant data. `dashboard.html` alone pulls 89
  `<script src>` tags into the global namespace; `kiwi-caisse.html` pulls 53.
  Rewriting a working surface is not automatically an improvement — it's a
  migration, with its own risk, and it needs a reason beyond taste. So:
  - **New, self-contained surfaces** — build them however is genuinely best.
  - **Tooling that touches no runtime code** (test runners, type-checking, linting,
    a bundler for new code) — adopt freely. This is the fastest win, and the historic
    no-dependency rule was costing us real test coverage.
  - **Rewriting an existing shipped surface** — allowed, but plan it, stage it, keep
    the old path until the new one is verified against real data, and never do it as
    a side effect of another task.

  **There is no `package.json` in this repo today.** If you introduce any tooling,
  that's step zero — with a lockfile, and with the deploy still producing
  static-hostable output for Cloudflare Pages + GitHub Pages (artefacts committed or
  built in CI). Both mirrors in §1 must keep working.
- **Real backend (live):** Cloudflare Pages Functions + D1 (`functions/`,
  `schema.sql`) — accounts/auth, Live Link sales, operator console, caisse↔dashboard
  pairing. See `LIVE_LINK.md` / `ADMIN.md`.
- **Real hardware, three transports.** ESC/POS jobs reach a thermal printer via the
  native **Kiwi Printer Bridge** (`bridge/`) on desktop, **and** directly from the
  browser over **Web Bluetooth** and **WebUSB** (`assets/printer-bridge.js` —
  `navigator.bluetooth.requestDevice`, `navigator.usb.requestDevice`, with
  `navigator.usb.getDevices()` re-acquiring a once-granted device). Don't propose
  building browser printing; it exists. Hardware I/O lives behind
  `window.KiwiHardware` / `window.KiwiPrinter` (`assets/caisse-hardware.js`,
  `assets/escpos.js`).
- **Persistence:** `localStorage` for client state (`kiwiLang`, `kiwiTheme`,
  `kiwiMode`, `kiwiDateRange`, `kiwiRevCompare`, `kiwiPrinterCfg`, …); D1 for
  server-authoritative data.
- **Fonts:** Inter Tight, Instrument Serif, IBM Plex Sans Arabic, JetBrains Mono.

When you add a capability, prefer a real implementation with a fail-soft path (works
degraded when the backend/hardware isn't reachable) over a pure mock — the caisse
pairing and printer bridge both follow this pattern.

---

## 3. The rituals that fail silently

These four are the repo's most expensive class of bug: the page returns 200, the
console stays empty, and your fix simply doesn't appear.

**Asset version stamps.** `dashboard.html` and `kiwi-caisse.html` pin assets as
`assets/foo.js?v=NNNN` (CSS too). Editing a file without bumping its stamp means
every returning browser keeps the old copy — the URL is byte-identical, so it's never
refetched. Worse, `kiwi-sw.js` serves stale-while-revalidate, so a returning browser
runs the OLD file on the FIRST load after a deploy. Bumping the cache doesn't beat
this; **changing the URL does.** A stamp lives in up to three places that must all
agree: the shell tag, the matching entry in `kiwi-sw.js`'s `SHELL` precache list, and
— for lazily loaded POS verticals — the `rev` field in `assets/pos-dispatch.js`'s
REGISTRY. Bumping *some* of them is worse than bumping none;
`tools/pwa-shell-test.js` goes red and takes `check.js` with it.

**Don't move a stamp by hand. Run the tool:**

```bash
node tools/bump-stamp.js assets/venues.js assets/tokens.css
```

It finds every place that stamp lives, moves them together, and re-seals
`tools/asset-stamps.json` — the manifest pairing each stamped asset with a hash
of its content. `tools/stamp-drift-test.js` (wired into `check.js`) fails the
build when a file's content moved and its stamp didn't, which is the one failure
mode no amount of cross-file comparison can see: nothing *diverges*, everything
is consistent — on the old URL. `--sync` re-seals without bumping; `--all` bumps
every asset whose content changed.

**Service-worker cache generation.** Bumping it costs four files, not one: `CACHE` in
`kiwi-sw.js` plus the `register('/kiwi-sw.js?v=NNN')` call in **all three** PWA
bootstraps (`assets/dashboard-pwa.js`, `assets/caisse-pwa.js`,
`assets/employee-live.js`). Editing those three changes their content, so each then
needs its own `?v=` stamp moved — one generation bump cascades to ~10 file touches.
`tools/platform-ops-test.mjs` asserts the generation as a **floor** (`>=`), never a
pin; don't "fix" a red run by pinning it.

**The gate is `node tools/check.js`.** It parses every `assets/*.js`, checks that
every `data-action` in HTML is handled, that every `data-i18n` key exists in EN + AR,
bans `background:var(--ink)` and secret-shaped strings — then runs several dozen
named suites (i18n, live-link, agent, stock, orderpro, KPI ledger, RTL numbers, PWA
shell, D1 schema, …). **A test file on disk that `check.js` doesn't name guards
nothing.** If you add a suite, wire it in. And a red run isn't automatically yours —
prove a failure is pre-existing by running it in a detached worktree at the untouched
base before you chase it.

**Prod D1 lags `schema.sql`.** Every time. Never assume the live database has a table
just because the schema file does — query the live DB. `migrations/` exists but is
barely used; formalising `wrangler d1 migrations` is on the roadmap.

**Verifying locally?** Unregister the service worker *and* `caches.delete()` every
key first, or you'll test a stale shell. Confirm what actually loaded with
`performance.getEntriesByType('resource')` rather than trusting a reload.
**Verifying prod?** `kiwi-os.com` serves the account gate to `curl` at HTTP 200 —
check the GitHub Pages mirror instead, or use a real browser session.

---

## 4. Brand system — locked

Colors (defined in `assets/tokens.css`):
- `--atlas` `#0B6E4F` (primary) · `--riad` `#053B2C` (deep) · `--mint` `#7DF2B0` (accent ≤5%)
- `--paper` `#F7F5F0` (warm bone — never use pure `#fff` for backgrounds)
- `--ink` `#0A0F0D`

Don't introduce new accent colors. Don't use bold display weights. Don't use emojis
in section titles or CTAs. Don't rebuild the design system. `--atlas` is both a
surface paint and an accent ink — if you need a brighter accent, add a new token
(`--accent-lit`) rather than brightening the shared one, and check for name
collisions: a reused custom-property name fails silently as `inherit`, never as an
error.

**Type is roman. Never italic.** Instrument Serif is the editorial voice, and the
accent word inside a heading is set in it — but upright. `font-style: italic` on a
heading, a display numeral, or a UI label is the single fastest-read "generated by
an AI" tell there is, and at 11–14px in Inter Tight it renders as sheared sans, not
as emphasis. `em`/`i`/`cite`/`dfn`/`var` are normalised to roman in
`assets/tokens.css` and `assets/landing/base.css`, so bare `<em>` can't fall back to
the browser default. Carry emphasis with the serif face, `--atlas`/`--mint`, or
weight. The only italics left in the repo *depict* something real — icing piped on
a cake (`.bl-script`), an imitated masthead (`.plogo.telquel`), a pilot's own
wordmark (`kandisky`) — and they set `font-style` on their own class so they outrank
the reset. Anything else is drift.

Signature motion — **la lentille liquide**: one highlight pill that stretches to span
the old and new option, then settles with a spring
(`cubic-bezier(0.34, 1.45, 0.5, 1)` · 310 ms). Implemented once in
`assets/liquid-lens.js` and auto-attached to segmented controls (date-range pills,
tab rows, the landing audience switch, the phone capsule bar). For any NEW tab/pill
group, register it there (or use `data-lens-demo`/`data-lens-item`) — never invent a
different selection style.

Icons — **Google Material Symbols, and nothing else.** Don't hand-draw a `<path>`.
The bespoke set that used to live in `assets/trades.js` is exactly why this rule
exists: inconsistent stroke weights, shapes that turned to mush at 23 px, a florist
that read as a tree. The vendored icons live in `assets/icons/material/` (Outlined ·
400 · grade 0 · optical size 24, Apache 2.0, `LICENSE` in the folder). Only the files
we actually use are checked in — the upstream repo is ~1 GB — and the folder's
`README.md` has the one-line `curl` that adds another. Material's native form is
`viewBox="0 -960 960 960"` with a filled path: consume it with `fill="currentColor"`
and let CSS drive `color`. Never convert one to a stroke, and never edit a vendored
`d`; if it doesn't fit, you want a different icon, not a modified one.

### Two things that will make a "correct" CSS fix do nothing
- **The dashboard stacks three skins.** The 2026 and iOS 27 layers are on by
  default, so the visible page title is `.dr-label`, not `h1.greeting`. Measure what
  actually paints before assuming which rule wins.
- **There are two dark systems.** Legacy `html[data-theme="dark"]` outranks the
  Vexel skin, so an edit to the base rule silently does nothing. And
  `data-vexel-mode` can report *light* while the page paints black — measure
  luminance, don't trust the flag.

---

## 5. Architecture pointers

- `assets/i18n.js` · captured-originals i18n (FR captured from DOM, EN/AR in the `T`
  dict). `data-i18n="key"`; `data-i18n-attr="placeholder:key"` for attributes.
  **The caisse does not use this.** `kiwi-caisse.html` has its own
  `assets/caisse-lang.js` covering the boutique register only.
- `assets/interactive.js` · global click delegation on `[data-action="..."]`, routed
  through `Kiwi.handlers[name]`. Modals/drawers via `Kiwi.modal/drawer/toast`.
  A guard keyed to named handlers protects only what it names — sweep the whole
  `Kiwi.handlers` map when adding one.
- `assets/dateRange.js` · single source of truth for the dashboard's selected date
  range and all per-range data. Subscribers re-render when the range changes.
  Note *Rapport journalier* reads a different well and is empty on demo by design.
- `assets/venues.js` · venue/tenant identity, slugs, and the transient ids (`own`,
  `scoped`) used by operator view.
- `assets/live-link.js` · Live Link sales feed → `KiwiSales` → dashboard KPIs.
- `assets/pos-dispatch.js` · lazy REGISTRY for the fourteen `pos-*` verticals.
- `assets/features.js` · feature handlers (Zakat, Sadaqa, Kiwi Compte, Capital,
  Diaspora, Loyalty, Agent Mode, Payment Links).
- `assets/pages.js` / `assets/pages-pro.js` · sidebar destination drawers
  (Transactions, Terminaux, Règlements, Conformité, Équipe, Tables, Menu, KDS, Stock,
  Payroll, Reservations). `pages-pro.js` is 13 768 lines — see §8 before opening it.

**Two clocks.** The till groups on a **5 h business day**, not midnight. Anything
that says "today" must use the same boundary or the numbers won't agree between the
caisse and the dashboard.

**Rendering under a poller.** A ticking server field inside a render signature
rebuilds the page under the user's cursor, and a DOM rebuild inside `pointerup`
swallows the click. Verify interactions with real clicks — synthetic events
false-pass.

---

## 6. Tenant and client-data safety

Merchant books in this repo are **real**. Santos Store and Amira's venue carry live
figures; treat them as production data.

- **Client state is account-scoped** via `kiwiAccountKey`. A cache namespaced per
  tenant (`kiwiSales:scoped@<slug>`) is the safety mechanism — **namespace, don't
  wipe.** Boot code that deletes a bucket "to be safe" silently converts a cache into
  a per-load cold start nobody profiles.
- **A till can change merchant by pairing, without anyone signing in.** Guards keyed
  on the logged-in account miss that path entirely.
- **Demo data leaks live in the real-session / non-custom-venue gap.** Gate on
  `KiwiEnv.isReal()`, not on "is this a demo account".
- **Never log, print, or commit credentials.** Member objects in
  `__kiwiTeamV2.byVenue` still carry `password` and `pinCode` fields, and so does
  the `employee-access` document `POST /api/config` writes into `store_docs`.
  `GET /api/config?merchant=…` no longer returns codes — its `pins` array is the
  roster, `{name, role}` — but treat any *other* surface that hands you a
  four-digit code as a credential you must not print.
- **A four-digit code is compared server-side, nowhere else.** `POST
  /api/pin/verify` is the only place a staff code is checked: `{merchant, pin}`
  for a till, `{pin}` alone for the account-wide dashboard lock. It is
  rate-limited and answers with an identity (`{id, name, role}`), never with a
  code. If you find yourself wanting the code list in the browser to compare it
  there, that is the bug this endpoint exists to prevent —
  `tools/config-pin-projection-test.mjs` fails the build for it.
- **Never enter merchant PINs, staff PINs, caisse personal codes, or pairing codes**,
  and never bypass the account gate programmatically. Enter demo surfaces through
  the demo entry points.

---

## 7. Phase 1 focus

The pitch deck and dashboard story revolve around **Kiwi POS SaaS** — a four-tier
model:
- **Kiwi Basic · 199 MAD/month** — software only, on the merchant's own hardware,
  unlimited devices, one établissement, integrated into the existing till, on-site
  training + guides included.
- **Kiwi Pro · 399 MAD/month** — everything in Basic + one free Kiwi cashier, T+1
  settlement, hardware maintenance.
- **Kiwi Ultra · 1 499 MAD/month** — unlimited établissements, multi-pays, API
  enterprise, dedicated 24/7 account manager.
- **Kiwi Ultimate · sur devis** — bespoke scope, device/cashier count and price
  agreed with the client.

Kiwi Pay / Banking / Investing are Phase 2-3 optionality.

Don't add Pay/Banking/Investing surfaces unless explicitly asked. Don't surface
internal financials, asks, or projections in any external-facing material — public
macro market data only (tourists, interchange cap, SME count).

---

## 8. graphify — query the graph before you read the files

A knowledge graph is built **locally** into `graphify-out/`. It is **gitignored, not
checked in**, so a fresh clone or another machine has none — run `graphify update .`
to build it.

**Why this rule exists, in numbers.** The files here are enormous:
`assets/pages-pro.js` is 13 768 lines, roughly **178 k tokens** — larger than most
context windows. `assets/venues.js` is ~108 k, `assets/agent.js` ~64 k. One
speculative "let me just read it and see" on any of those burns a session. The graph
answers *where does this live and what touches it* for a few hundred tokens.

**Use it for:** where a feature lives, what calls what, blast radius of a change,
which of the fourteen `pos-*` verticals share code, how two modules connect.

```bash
graphify query "how does the caisse reach the dashboard"
graphify explain "KiwiMenuStore"
graphify path "kiwi-caisse.html" "schema.sql"
```

**Don't use it for:** a file you can already name, a one-line edit, or reading a
function you are about to modify. Open the file. The graph orients you; it does not
replace reading the code you are changing. A `graphify` call you did not need costs
tokens like any other. It also does not exist inside git worktrees.

**Staleness is the real hazard.** A graph built from older code will answer
confidently about functions that no longer exist. A post-commit hook rebuilds changed
files automatically, but the hook is local to the clone (`.git/hooks/`), so another
machine has to run `graphify hook install` again.

`.graphifyignore` excludes the minified vendor bundles. Without it `three.min.js` and
`motion.min.js` dominate the graph and the hubs come back as `zi`, `Ue`, `Dt` instead
of our own module names. Don't remove it.

The doc and PDF pass sends content to a model backend. Code extraction is fully local
(tree-sitter AST, zero tokens). Several markdown files here still contain plaintext
merchant PINs, so rotate those before running any doc pass.

---

## 9. This checkout's environment

- **The repo lives on an iCloud-synced Desktop.** That is why `.git/index` has been
  wiped repeatedly mid-session and why ~30 `* 2.*` conflict copies keep reappearing.
  If a git command fails strangely, check for a stale zero-byte `.git/index.lock`
  before theorising. Moving the repo off iCloud is a standing recommendation.
- **Multiple Claude/Codex sessions share this working tree**, plus a stack of
  `/private/tmp/kiwi-*` worktrees. Leave files you didn't change alone, stage by
  path, and don't stash to clear someone else's work.
- **`main` is ahead of most feature branches.** Before "fixing" something that looks
  stale in a branch file — including this one — diff it against `origin/main`; the
  fix has often already landed there.
