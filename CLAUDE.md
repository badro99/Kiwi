# CLAUDE.md — operating notes for AI agents on the Kiwi project

This file is read on first contact by any Claude session opened against this repo.
It captures rules and conventions that aren't obvious from the code alone — mostly
things that already cost someone a session.
**New session resuming work? Read `docs/handoffs/HANDOFF.md` first.** Part 1 is the
current-state brief (what's true right now, recent work, gotchas, the two dev tracks, the
Design 2026 skin); Part 2 is the full project context (history, architecture, brand system,
roadmap). All other documents live under `docs/` — `audits/`, `roadmaps/`, `specs/`, `ops/`
(runbooks: deploy, auth, admin, Live Link, kiosk) — see `docs/README.md`. Only `README.md`
and this file stay at the repo root (`AGENTS.md` is a gitignored file the claude-mem
plugin writes; it holds no project rules).

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
  `kiwi-caisse.html`, `kiwi-serveur.html` and the files in `assets/`) are shipped,
  load-bearing, and carry live merchant data. Each shell pulls dozens of
  `<script src>` tags into the global namespace (the size ratchet in §3 pins the
  counts).
  Rewriting a working surface is not automatically an improvement — it's a
  migration, with its own risk, and it needs a reason beyond taste. So:
  - **New, self-contained surfaces** — build them however is genuinely best.
  - **Tooling that touches no runtime code** (test runners, type-checking, linting,
    a bundler for new code) — adopt freely. This is the fastest win, and the historic
    no-dependency rule was costing us real test coverage.
  - **Rewriting an existing shipped surface** — allowed, but plan it, stage it, keep
    the old path until the new one is verified against real data, and never do it as
    a side effect of another task.

  **The root `package.json` declares no dependencies** — no root `node_modules`,
  no root lockfile. It is a script index, not a build (`npm test`, `check:*`,
  `stamp`, `dev`, `db:*`, `load:*`; read its `scripts` for the list). Test-only
  dev dependencies (puppeteer-core, fast-check, axe-core) live in `app/`, with
  their own lockfile — see "Property and accessibility suites" in §3. It sets no `"type"`, which is why running an ES-module file under
  `functions/` prints a `MODULE_TYPELESS_PACKAGE_JSON` warning — noise, not a
  failure; do not "fix" it by adding `"type": "module"` without checking every
  CommonJS caller first.

  So the root stays dependency-free, and it is worth keeping. If you
  introduce tooling that genuinely needs packages, that's the step that changes
  this — add a lockfile, and keep the deploy producing static-hostable output for
  Cloudflare Pages + GitHub Pages (artefacts committed or built in CI). Both
  mirrors in §1 must keep working.
- **Real backend (live):** Cloudflare Pages Functions + D1 (`functions/`,
  `schema.sql`) — accounts/auth, Live Link sales, operator console, caisse↔dashboard
  pairing. See `docs/ops/LIVE_LINK.md` / `docs/ops/ADMIN.md`.
- **Real hardware, three transports.** ESC/POS jobs reach a thermal printer via the
  native **Kiwi Printer Bridge** (`bridge/`) on desktop, **and** directly from the
  browser over **Web Bluetooth** and **WebUSB** (`assets/printer-bridge.js` —
  `navigator.bluetooth.requestDevice`, `navigator.usb.requestDevice`, with
  `navigator.usb.getDevices()` re-acquiring a once-granted device). **Plus a
  fourth, outbound-only transport for iPads/tablets:** the caisse deposits the
  ESC/POS job on `/api/print/jobs` and the counter's bridge (paired once by a
  6-digit code, `functions/api/print/`, bridge ≥ 1.4.0) polls and prints it —
  the CloudPRNT model. Don't propose building browser printing or "bridge on
  the LAN with a self-signed cert"; both questions are settled. Hardware I/O
  lives behind `window.KiwiHardware` / `window.KiwiPrinter`
  (`assets/caisse-hardware.js`, `assets/escpos.js`).
- **Persistence:** `localStorage` for client state (`kiwiLang`, `kiwiTheme`,
  `kiwiMode`, `kiwiDateRange`, `kiwiRevCompare`, `kiwiPrinterCfg`, …); D1 for
  server-authoritative data.
- **Fonts:** Inter Tight (400–800) carries all Latin UI and editorial emphasis; IBM Plex Sans Arabic carries Arabic; JetBrains Mono is reserved for codes and tabular technical data. All emphasis is upright.

When you add a capability, prefer a real implementation with a fail-soft path (works
degraded when the backend/hardware isn't reachable) over a pure mock — the caisse
pairing and printer bridge both follow this pattern.

---

## 3. The rituals that fail silently

Stamps, the service-worker generation and the gate below are the repo's most
expensive class of bug: the page returns 200, the console stays empty, and your fix
simply doesn't appear.

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
**Don't do it by hand either:** `node tools/bump-stamp.js --sw` moves the generation in
all four files and then bumps the three bootstraps' own stamps in the same run.
`tools/platform-ops-test.mjs` asserts the generation as a **floor** (`>=`), never a
pin; don't "fix" a red run by pinning it.

**The pre-commit hook catches the rest.** Run `sh tools/install-hooks.sh` once per
clone (hooks aren't versioned; the installer chains any existing hook such as
graphify's post-commit). It exports the **index** to a scratch directory and runs
`tools/stamp-drift-test.js` there — so it judges exactly what you are committing,
and another session's unstaged edits can neither block you nor rescue you. It never
modifies or stages anything: on a red it prints the `bump-stamp` command to run.
One subtlety it names for you: `bump-stamp` seals `tools/asset-stamps.json` from the
working tree, so an asset a *concurrent session* edited but did not stage enters the
manifest you stage — the hook refuses and names that file; stage it if it's yours,
else `KIWI_SKIP_STAMP_HOOK=1` for that one commit.

**Adding, moving or removing a route file under `functions/`?** Run
`node tools/build-fast-routes.mjs` and commit `functions/_fast-routes.js` with
it. The root middleware calls static routes directly from that table (the Pages
router cost most of our Workers CPU, `docs/ops/CPU.md`); a deleted route still
listed there fails the Pages build. The gate and the pre-commit hook refuse a
stale table.

**The gate is `node tools/check.js`.** It parses every `assets/*.js`, checks that
every `data-action` in HTML is handled, that every `data-i18n` key exists in EN + AR,
bans `background:var(--ink)` and secret-shaped strings — then runs every test file
it names (about 900: i18n, live-link, agent, stock, orderpro, KPI ledger, RTL
numbers, PWA shell, D1 schema, …). **A test file on disk that `check.js` doesn't name guards
nothing.** If you add a suite, wire it in, and put it in `tools/` (a test anywhere else
is refused). On the full gate, naming is not enough: every `tools/*test*` file must
actually be started by that run (or replayed from a pass with the same inputs), and every
mandatory French coverage cell must be *reached*: `tools/coverage-probe.mjs` turns each
`// coverage:` annotation into a run-time record (2026-10-27). And a red run isn't automatically yours —
prove a failure is pre-existing by running it in a detached worktree at the untouched
base before you chase it.

**Three tiers, and the rule for using them (owner, 2026-10-23, for every
session and every GPT job):**
- **Between edits: `npm run check:changed`** (`node tools/check.js --changed`).
  It runs only the child tests your working tree can affect, plus every
  in-process check (syntax, data-action, i18n keys, secrets): seconds to a
  couple of minutes instead of a full run. A test is selected when it is a
  changed file, when it touched a changed file the last time it passed (the
  parallel pool records every import and fs read through `tools/dep-trace.cjs`
  into `kiwi-test-deps.json` in the temp dir), or when its source names the
  file. A change that only moves stamps selects the stamp suites. A browser
  suite runs when it names the file; one that only loaded it with its page is
  listed and left to the full gate (`--browsers` runs it now; `--no-browsers`
  leaves every browser suite, for a sandbox without Chromium such as GPT's). `--base <ref>`
  compares against a merge base instead of HEAD. On a fresh machine the map is
  empty and selection falls back to names until one fast or full run records it.
- **`npm run check:fast`** skips every browser suite (about 190 of ~900; a
  suite that reaches Chromium through a local harness such as
  `surface-matrix-lib.mjs` counts as one).
- **Before a push, scale the check to the risk** (owner, 2026-10-24, replaces
  "full gate before every push"):
  - **Full gate** (`npm test` / `npm run check:full`) for merges of several
    branches, and for anything touching money, auth, the database schema or
    the service worker / offline cache.
  - **`npm run check:changed -- --browsers`** for one small, contained fix
    (one file or one feature, like a bridge or copy fix) or docs: the tests
    the change can affect, browser suites included.
  - **Nothing** for text-only or scorecard-only changes outside the app.
  Bundle merges so one full gate covers several branches. On 24 October the
  full gate caught four failures (two of them browser-only) after GPT's own
  targeted checks had passed, so do not skip it for merges.

**Browser locales (owner decision, 26 Oct 2026).** Browser suites run French only
by default. Set `KIWI_LOCALES=fr,en,ar` for a full multilingual pass before
shipping changes to Arabic/RTL layout or translations. Static translation and
language completeness checks still cover every language.

A suite counts as slow (browser) by reading its source and the local files it
imports (puppeteer, browser-trace, Chromium, Playwright, Chrome), not its
filename (`tools/check-guard.js`).

**Suites stay fast (CPU ratchet).** After the parallel run, check.js compares
each suite's node CPU time (every process it starts included) with
`tools/suite-cpu-baseline.json`: a pinned suite fails past twice its pin plus
15 s, any other suite past 30 s. Pins only come down
(`KIWI_UPDATE_CPU_BASELINE=1`); never raise one to make a red go away. When a
suite is slow, profile it (`node --cpu-prof`) before touching it. The first
pass (23 October) found the same four causes again and again, so look for them
first: a fixture rebuilt per case (build the schema once, copy it with
`DatabaseSync.serialize()`/`deserialize()`), a deliberate cost paid in a case
that does not test it (a million-round key derivation in a behaviour case), a
regex that restarts at every character, and production code that rebuilds an
`Intl.DateTimeFormat` per call (it cost the server too). Browser suites reuse
one browser and one page per locale and viewport instead of relaunching.

**Every tier runs in parallel by default.** Before its sections start, check.js
reads every test file it names and runs them side by side (`tools/check-pool.js`,
up to 8 at a time, 3 browsers, longest first from the last run's timings), then
replays its sections in order against those results: same output, same verdict.
Only a pass is reused; a test that failed in parallel runs again alone at its
usual place, so a red still means red. `KIWI_CHECK_JOBS=1` is the old serial
run, `KIWI_CHECK_JOBS` / `KIWI_CHECK_BROWSER_JOBS` tune it. A new suite only has
to be named in check.js to be prefetched, like before.

**A pass is reused when nothing it read changed** (2026-10-26). After a test
passes in the pool, `tools/check-pool.js` keeps a key in the temp dir
(`kiwi-pass-cache.json`): the content of the test and of every repo file it
read, copied, listed or probed (`tools/dep-trace.cjs`), plus Node, the `app/`
lockfile, the tracer and every `KIWI_*` setting. A later run with the same key
replays that pass and its output instead of running the test, and prints
`N test files reused`. Never reused: a pass from another day or over 24 h old,
a test that starts a program other than node (git, sqlite3, a shell: their
reads are invisible to the tracer), a test that just failed.
`KIWI_PASS_CACHE=0` runs everything. A reused pass has no CPU time, so the CPU
ratchet only measures what ran. If a test reads something the tracer cannot
see (a non-repo file, the network) and a stale pass is replayed, run with
`KIWI_PASS_CACHE=0` and teach the tracer, don't add exceptions in the test.
`tools/pass-cache-test.mjs` holds the rules.

**New browser suites use `tools/browser-trace.mjs`.** Run each scenario through
`suite(name).run()` and `t.watch(page)`: a failure then writes
`.kiwi/results/<suite>/<test>/trace.md` (steps, every page load and the script
that started it, console errors, 4xx/5xx, screen, accessibility tree) and
prints its path, which check.js shows. A launch or navigation timeout exits 3,
and check-guard runs that suite once more before calling it red. Staff codes go
through `secretFromEnv()` + `fillSecret()`, never a string. `expectScreenshot()`
compares against `tools/__screenshots__/`; `KIWI_UPDATE_SNAPSHOTS=1` rewrites a
baseline you meant to change. The AI bug-bash pilot in `tools/agent-e2e/` is
**parked: the owner will not pay for its model tokens. Do not run it.**

**Property and accessibility suites.** `tools/money-properties-test.mjs` runs
fast-check against the real boutique pricing and revenue code and the real
store-credit ledger; `tools/a11y-browser-test.mjs` runs axe-core on the landing,
the demo dashboard, the onboarding wizard and the demo till. Both packages are
dev dependencies of `app/` (next to puppeteer-core), so the root `package.json`
stays dependency-free: `npm --prefix app ci` once per clone. Without them
every property suite prints `○ skip` and exits 0, so the full gate now refuses
to start (a fresh worktree passed it with no money property run, 22 October):
in a worktree, `ln -s <main checkout>/app/node_modules app/node_modules`.
Every tier now refuses (the fast tier used to only warn, 2026-10-27);
`KIWI_ALLOW_PROPERTY_SKIP=1` runs the rest knowingly, and that run ends red, as does
any run where a suite printed `○ skip … unavailable`. The money suite keeps a short list of **known** properties, defects
already logged and awaiting a decision or fix: they print their counterexample
without failing, and say `! known … tient maintenant` once they hold. When you
see that, move the property to `strict()`, or the guarantee is lost. The a11y
suite fails on any serious violation above `tools/a11y-baseline.json`; lower the
baseline (`KIWI_UPDATE_A11Y_BASELINE=1`) when a fix brings a count down, never
raise it to make a red go away.

**The very large files stop growing** (2026-10-21). `tools/file-size-ratchet-test.mjs`
pins each file listed in `tools/file-size-baseline.json` at its size there, plus 50
lines of slack (200 until 2026-10-27; the files that had already used more are frozen
at their size in `frozen`), each stylesheet the same way (`cssLines`, +50),
and the three shells' `<script src>` counts plus 3. A bug fix fits; a new feature goes
in its own file. The same suite pins each stylesheet's `!important` count (+10, a new
stylesheet 25): they went from 573 to 1 182 in two months, every skin winning by force
over the one below, so new rules win by cascade instead. A pin only goes down: after a split, `KIWI_UPDATE_SIZE_BASELINE=1`
lowers it. Never raise one to make a red go away.
A file that is not pinned stays under 2 500 lines (5 000 until 2026-10-27).

**Coupling stops growing too** (2026-10-28). `tools/coupling-ratchet-test.mjs`
pins, per file under `assets/`, how many globals defined by OTHER files it reads
or writes (`window.X`, bare `Kiwi*` / `__kiwi*`), and the list of globals that
more than one file assigns (`tools/coupling-baseline.json`). A new file may touch
12; a pin only goes down (`KIWI_UPDATE_COUPLING_BASELINE=1` after a clean-up); a
global never gains a second writer. Splitting a file without cutting what it
shares does not lower anything here.

**Prod D1 changes through `wrangler d1 migrations`** (since 2026-10-19,
`docs/ops/MIGRATIONS.md`). Changing `schema.sql` means adding the next
`migrations/NNNN_name.sql` in the same commit — `node tools/d1-migrations.mjs
--draft` writes it, and `tools/d1-migrations-test.mjs` (fast tier) fails the gate
when migrations applied to an empty DB differ from `schema.sql`. Old dated files
live in `migrations/legacy/`; never put a dated file back at the top level,
wrangler would apply it. The test cannot see prod: until someone runs
`npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml`, prod
still lags, so query the live DB (`node tools/d1-schema.mjs`) before assuming a
table exists. Agents never apply to prod; the owner does.

**Verifying locally?** Unregister the service worker *and* `caches.delete()` every
key first, or you'll test a stale shell. Confirm what actually loaded with
`performance.getEntriesByType('resource')` rather than trusting a reload.
**Verifying prod?** `kiwi-os.com` serves the account gate to `curl` at HTTP 200 —
check the GitHub Pages mirror instead, or use a real browser session.

---

## 4. Brand system — locked

- **2026-08-22 · Typography:** Instrument Serif is retired from every user-facing surface. Existing serif/editorial/display aliases remain for compatibility but resolve to Inter Tight; emphasis uses upright weight and colour, never italics. User-facing copy uses commas, full stops or middle dots instead of U+2014 em dashes.

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

**Type is roman. Never italic.** `font-style: italic` on a
heading, a display numeral, or a UI label is the single fastest-read "generated by
an AI" tell there is, and at 11–14px in Inter Tight it renders as sheared sans, not
as emphasis. `em`/`i`/`cite`/`dfn`/`var` are normalised to roman in
`assets/tokens.css` and `assets/landing/base.css`, so bare `<em>` can't fall back to
the browser default. Carry emphasis with `--atlas`/`--mint` or weight. The only italics left in the repo *depict* something real — icing piped on
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
- `assets/pos-dispatch.js` · lazy REGISTRY for the `pos-*` verticals.
- `assets/features.js` · feature handlers (Zakat, Sadaqa, Kiwi Compte, Capital,
  Diaspora, Loyalty, Agent Mode, Payment Links).
- `assets/pages.js` / `assets/pages-pro.js` · sidebar destination drawers
  (Transactions, Terminaux, Règlements, Conformité, Équipe, Tables, Menu, KDS, Stock,
  Payroll, Reservations).

**Two clocks.** The till groups on a **5 h business day**, not midnight. Anything
that says "today" must use the same boundary or the numbers won't agree between the
caisse and the dashboard.

**Rendering under a poller.** A ticking server field inside a render signature
rebuilds the page under the user's cursor, and a DOM rebuild inside `pointerup`
swallows the click. Verify interactions with real clicks — synthetic events
false-pass.

---

## 6. Tenant and client-data safety

Merchant books in this repo can contain **real hosted records**. Santos Store and
other merchants are production data. **Amira Cafe** (the restaurant venue only)
is owner-designated as a testing account as of 2026-09-27: use it for explicitly
requested end-to-end tests, including test orders and register operations.
Its hosted figures are still persistent records, not a disposable local fixture:
label test orders `TEST KIWI`, reverse/cancel test payments and orders through the
product flow, verify cleanup, and never reset or hand-edit its books. Do not
assume the designation extends to Amira's Boutique, Maison, or other venues.

- **Client state is account-scoped** via `kiwiAccountKey`. A cache namespaced per
  tenant (`kiwiSales:scoped@<slug>`) is the safety mechanism — **namespace, don't
  wipe.** Boot code that deletes a bucket "to be safe" silently converts a cache into
  a per-load cold start nobody profiles.
- **A till can change merchant by pairing, without anyone signing in.** Guards keyed
  on the logged-in account miss that path entirely.
- **Demo data leaks live in the real-session / non-custom-venue gap.** Gate on
  `KiwiEnv.isReal()`, not on "is this a demo account".
- **Never log, print, or commit credentials.** Member objects in
  `__kiwiTeamV2.byVenue` carry `password` and `pinCode`, and so do the `team` and
  `employee-access` documents in `store_docs`. `GET /api/config?merchant=…` no
  longer returns codes — its `pins` array is the roster, `{name, role}` — and
  `GET /api/store?feature=team` only returns them to the surface that manages
  them (see below). Treat any four-digit code a surface hands you as a
  credential you must not print.
- **A store doc can be readable by more people than its author.** `tenantFor()`
  accepts a **paired till token**, so every `FEATURES` entry in
  `functions/api/store.js` is readable from the counter device. That is fine for
  a menu and wrong for `team`, whose members carry their personal codes: it is
  redacted for anyone who is not the owner session or a named operator
  (`REDACT` / `editsRoster`). If you add a feature holding anything
  credential-shaped, add it to `REDACT` — and remember the redaction is only
  half of it. **Whoever may not read a secret must not be able to write the
  document that holds it**, or they will read the redacted copy, push it back,
  and erase the real values. `tools/team-doc-redaction-test.mjs` holds both.
- **A four-digit code is compared server-side, nowhere else.** Three verifiers do
  it, and all three live in `functions/auth/_lib.js` — never in a route, never in
  the browser: `verifyStaffPin` (a till code, `{merchant, pin}`), `verifyAccountPin`
  (the account-wide dashboard lock, `{pin}` alone) and `findEmployeeCredential`
  (the employee app's e-mail + code login). `POST /api/pin/verify` fronts the first
  two, `POST /api/employee` (`action:'login'`) the third, and the manager override
  in `POST /api/sale/cancel` calls `verifyStaffPin` rather than comparing anything
  itself. Each is rate-limited and answers with an identity (`{id, name, role}`),
  never with a code. A new surface that needs to check a code calls one of the
  three; it does not write its own comparison. If you find yourself wanting the
  code list in the browser to compare it there, that is the bug this design exists
  to prevent — `tools/config-pin-projection-test.mjs` fails the build for it.
- **Never record or commit merchant PINs, staff PINs, caisse personal codes, or
  pairing codes**, and never bypass the account gate programmatically. For real
  merchants, leave code entry to their staff. **Demo surfaces and the
  owner-designated Amira Cafe testing account are standing exceptions (owner,
  2026-09-28, repeated many times): agents may enter their codes through the
  normal UI for testing without asking again.** Still never print, log or commit
  those codes. Do not infer that permission for any other merchant or venue.

---

## 7. Phase 1 focus

The pitch deck and dashboard story revolve around **Kiwi POS SaaS** — a five-offer
model. The landing page shows four plan cards (Basic, Plus, Pro, Ultra) and a
quote-only Ultimate strip under them (owner, 2026-10-16):
- **Kiwi Basic · 150 MAD/month, 99 on the annual plan** (99 is a monthly
  equivalent, one payment of 1 188 MAD a year) — a simple caisse for small shops
  and épiceries: barcode scanning, stock tracking, receipts, customer credit
  book, daily report, offline till, one établissement.
- **Kiwi Plus · 300 MAD/month, 249 on the annual plan** (one payment of
  2 988 MAD a year) — everything in Basic + boutique management: size and colour
  catalogue, returns/exchanges/credit notes, promotions, Loyalty+, customer
  records, sales and margin tracking. OrderPro and employee management are NOT
  in Plus. The backend knows `plus`: `functions/api/config.js` accepts it as an
  explicit plan and the operator console bills it at 300 MAD
  (`tools/plan-catalog-test.mjs` holds both). Signup does not take a plan from
  the landing, so a new account starts on `basic` until an operator sets it.
- **Kiwi Pro · 399 MAD/month, 349 on the annual plan** (billed 4 200 MAD a
  year) — everything in Plus + restaurant operations: interactive floor plan,
  waiter ordering, kitchen display, OrderPro Restaurant, multilingual menu,
  booking link, recipes and food cost, employee access with permissions,
  scheduling/time clock/payroll, advanced Kiwi IQ, priority WhatsApp support.
- **Kiwi Ultra · 1 499 MAD/month** (no annual plan) — everything in Pro +
  unlimited établissements, multi-establishment control, multi-country, API
  enterprise, dedicated account manager.
- **Kiwi Ultimate · sur devis** — bespoke scope, device/cashier count and price
  agreed with the client.

The landing's copy lives in `content/landing-pricing.json` (all seven locales);
`tools/rebuild-landing-locales.mjs` regenerates the pages from it.

Kiwi Pay / Banking / Investing are Phase 2-3 optionality.

Don't add Pay/Banking/Investing surfaces unless explicitly asked. Don't surface
internal financials, asks, or projections in any external-facing material — public
macro market data only (tourists, interchange cap, SME count).

---

## 8. graphify — query the graph before you read the files

A knowledge graph is built **locally** into `graphify-out/`. It is **gitignored, not
checked in**, so a fresh clone or another machine has none — run `graphify update .`
to build it.

**Why this rule exists.** Several files here still run to thousands of lines
(`tools/file-size-baseline.json` lists them; `assets/venues.js` is the largest). One
speculative "let me just read it and see" on those burns context. The graph answers
*where does this live and what touches it* for a few hundred tokens.

**Use it for:** where a feature lives, what calls what, blast radius of a change,
which `pos-*` verticals share code, how two modules connect.

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

- **Work in `/Users/zaka/Developer/kiwi`.** Keep code off iCloud-synced folders: an
  evicted file makes `read()` block forever at 0% CPU, so `git push` hangs silently.
  If a git command hangs, check which checkout you are in (`find .git -type f -flags
  +dataless`, `sample <pid> 3`) and look for a stale zero-byte `.git/index.lock`.
- **Multiple Claude/Codex sessions share this working tree**, plus a stack of
  `/private/tmp/kiwi-*` worktrees. Leave files you didn't change alone, stage by
  path, and don't stash to clear someone else's work.
- **`main` is ahead of most feature branches.** Before "fixing" something that looks
  stale in a branch file — including this one — diff it against `origin/main`; the
  fix has often already landed there.
