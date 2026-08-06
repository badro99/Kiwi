# Kiwi v2 — design-only migration · execution prompt

Paste this whole file as your first message in a fresh session. It is written to be
self-contained: it assumes the reader knows nothing about the last three sessions.

Everything under "Ground truth" was verified on 2026-08-06 against the live repos.
If more than a few days have passed, re-verify §2 before acting on §5 — a stale
baseline is what caused the last false start.

---

## 1 · Mission

Move the **v2 visual layer** onto production. Nothing else changes.

Design is in scope: colours, type, spacing, elevation, borders, hover/focus states,
motion, skin classes, iconography, layout chrome.

Everything else is out of scope: data paths, API calls, D1 schema, `functions/`,
auth, tenant scoping, business logic, KPI arithmetic, feature flags.

**The tie-breaker, and it is not negotiable:** if a v2 design change only works
because a v2 logic change is underneath it, the *design change is dropped* — the
logic is not brought along to satisfy it. Log it as deferred and move on.

---

## 2 · Ground truth (verified 2026-08-06)

**Repos.** `origin` and `fork` both point at `zaka33333-hash/Kiwi` — **the only repo
Cloudflare Pages builds**. `upstream` is `badro99/Kiwi`, the partner's working repo.
A GitHub Action mirrors `main` badro99 → zaka33333-hash on push, **strict
fast-forward, never `--force`**. Reconciling a divergence is a human decision.

**Production baseline is `origin/main`.** Not local `main`, which has been ~91
commits stale. Always `git fetch --all` and diff against `origin/main`.

**v2 is `codex/ux-feedback`.** It had drifted 52 commits behind production —
including the cross-store sales leak fix, three Aikido patches, and the whole
employee-auth chain. That gap is now closed:

- Sync merge commit **`eb6b7bb`** on branch **`codex/ux-feedback-sync`**, pushed to
  both remotes. 0 behind `origin/main`, 97 ahead.
- 6 files conflicted; all resolved hunk by hunk. Line-level audit confirms no
  production-added line was dropped.
- `tools/check.js` on the synced branch: **1 failure, 1 warning**, byte-identical to
  the pre-merge baseline. That is your reference bar — do not land anything that
  adds to it.

**`codex/ux-feedback` itself has not been fast-forwarded** — a concurrent session was
holding ~60 uncommitted files in the main worktree. **Your first action:** run
`git status` in `/Users/zaka/Desktop/kiwi`. If it is clean,
`git merge --ff-only codex/ux-feedback-sync`. If it is dirty, do not stash and do not
force — work in an isolated worktree and say so in your first reply.

**The whole delta is 38 files.** Classified in §4.

---

## 3 · Non-negotiables

Production carries real client data. Demo-data leakage is the exact failure that
burned v1 and it must not repeat.

1. Any surface that renders a number, a name, or a count goes through
   `KiwiEnv.isReal()` and `kiwiAccountKey`. A v2 hunk that hardcodes a figure
   (`4,8 %`, `14 JOURS`, a fabricated count) is a **reject**, not a port — v2 has at
   least one of these already, in the returns hero.
2. **Never `git add -A`.** Stage explicit paths. Concurrent sessions leave dirty files
   in this tree and they will be absorbed silently.
3. **Never `git checkout --ours` / `--theirs` on a content-conflicted file.** It
   replaces the *whole file* and discards every hunk git auto-merged from the other
   side. Resolve hunk by hunk; verify with a `-` diff against the side you did not take.
4. **Never force-push.** The mirror is ff-only.
5. Never commit anything resembling a key, token, password, `.env`, or a merchant PIN.
   Several markdown files in this repo still contain plaintext PINs.
6. In the browser, never type a PIN or password. Enter the dashboard via
   **"Entrer dans la démo →"**.
7. **Verify in the rendered page, never in the CSS.** Read computed values. And
   unregister the service worker + clear caches before every local check — it serves
   stale JS and will show you the previous build.
8. An edit is not done until its `?v=` stamp in `dashboard.html` moves. **CSS included.**
9. `kiwi-sw.js` cache key must strictly exceed every ancestor it merges, or clients
   never invalidate. It currently sits at `kiwi-app-v241`.

---

## 4 · The 38 files, classified

Run `git diff --numstat origin/main...codex/ux-feedback-sync` to reproduce this.

### Bucket A — pure design layer · port wholesale (10 files)

New on v2, no production counterpart, additive only:

```
assets/design-vexel.css        (+4630)   assets/design-vitrine.css   (+260)
assets/design-vexel.js                   assets/design-vitrine.js
assets/design-vexel-layout.js            assets/vexel-neon.js
assets/tokens.css              (+70/-0, purely additive)
HANDOFF-DESIGN-VEXEL.md
```

These are the migration. Copy them forward as-is. **Two hazards before you do:**

- `assets/design-vexel.js` as committed exposes only `enable/disable/toggle/isOn`.
  `dashboard.html:4988` calls `KiwiDesignVexel.prime()` — which does not exist on any
  committed branch. See P1 in §5.
- `tokens.css` is additive but token *names* collide silently across skins.
  `--brand-deep` resolves to `#0C6B4E` under Vexel and `#053B2C` under tokens.css. A
  reused custom-property name fails as `inherit`, never as an error. Grep for
  redefinitions before trusting any token.

### Bucket B — design and logic entangled · port hunk by hunk (8 files)

```
assets/pages-pro.js      (+1427/-120)   ← largest risk surface
dashboard.html           (+127/-62)     ← the wiring
assets/dateRange.js      (+367/-239)    ← mostly logic; default to DEFER
assets/dashboard-pwa.js  (+88/-19)
assets/day-report-dash.js  assets/day-report-demo.js
assets/venues.js         (+17/-26)      assets/oppo-cards.js (-19)
assets/i18n.js           (2/2)
```

For each file: walk the diff hunk by hunk and label every hunk **DESIGN** or
**LOGIC**. Port only DESIGN. Write the labelled list to
`docs/v2-migration/<file>.hunks.md` before editing anything — the audit trail is
the deliverable that makes this reviewable.

`assets/dateRange.js` is the single source of truth for the dashboard's selected
range and all per-range data. Treat every hunk in it as LOGIC unless you can prove
otherwise in the rendered page.

### Bucket C — functional, in scope by explicit decision (3 files)

```
kiwi-caisse.html        (+1341/-873)    ← the caisse rework
assets/floorplan-core.js  (+57/-12)     ← the shared plan-de-salle SVG renderer
assets/caisse-link.js     (+23/-13)     ← pairing hand-off
```

You chose to bring the caisse + plan de salle rework across rather than freeze it.
This is **functional** work, so it does not get the design-only exemption: it needs
its own test pass against production's employee-auth fixes (the caisse is now locked
without an authorised cashier, and employee PINs are scoped by role). Do this as
**Wave 2**, after the dashboard has landed and been verified — never in the same
commit.

Note: `floorplan-core.js` is shared between the dashboard editor and the POS. A
change here has two blast radii.

### Bucket D — later waves, do not touch in Wave 1 (8 files)

```
kiwi-serveur.html  kiwi-cuisine.html  kiwi-order.html  OrderPro.html  kiwi-admin.html
assets/invoicing.css  assets/invoicing.js    ← a new FEATURE, not design
assets/demoClock.js   tools/kpi-ledger-test.js
```

### Bucket E — already reconciled during the sync · leave alone (9 files)

```
robots.txt  sitemap.xml  kiwi-sw.js  functions/_middleware.js  bridge/server.js
privacy.html  terms.html  cookies.html  mentions-legales.html
```

---

## 5 · Pre-flight repairs — land these BEFORE any porting

The brief was: *if there is any feature gap or failure possibility in v2, fix it
before migrating*. Three are known and confirmed.

**P1 · `KiwiDesignVexel.prime` is undefined.** `dashboard.html:4988` calls it at boot;
the committed `assets/design-vexel.js` does not define it. Confirmed in Chrome
(`Uncaught TypeError`) on the v2 branch as committed — **not** introduced by the
sync merge. The definition (`prime: primeBody`, plus `primeDocument`/`primeBody`)
exists only in an *uncommitted* working copy from a concurrent session. Either get
that session to commit, or write the definition yourself. **The design layer cannot
ship while its own boot call throws.**

**P2 · `data-action="invoicing"` is unwired.** `dashboard.html:5391`. This is the one
`tools/check.js` failure, and it is v2-only — absent from production. The handler
*is* registered at runtime (`Kiwi.handlers.invoicing` exists), so the static check is
partly a false positive, but the button's behaviour is unverified. Either wire and
verify it, or remove the button. Do not migrate a dead control onto production.

**P3 · `index.html` still contains 16 × `kiwi.ma`.** Present on *both* branches — the
domain-rename commit `129b600` missed the generated Next landing build. The real
domain is `kiwi-os.com`. Fix on production directly; it is not a v2 issue.

Each repair is its own commit, on production, verified in a browser, before Wave 1
opens.

---

## 6 · Procedure

Branch off `origin/main` — **not** off v2. You are porting the design *forward onto
production*, so production's HTML, JS logic, `functions/`, and schema are the base
and stay authoritative.

```bash
git fetch --all
git worktree add /tmp/kiwi-v2design -b feat/v2-design origin/main
```

**Wave 0 — repairs.** P1, P2, P3. One commit each. Browser-verified.

**Wave 1 — dashboard design layer.**
1. Copy Bucket A wholesale. Commit.
2. Wire the new CSS/JS into `dashboard.html`, bumping every `?v=` stamp you touch.
   Commit.
3. Bucket B, one file at a time: write the hunk classification doc, port only the
   DESIGN hunks, commit per file. `assets/pages-pro.js` last — it is the biggest and
   the most entangled.
4. After every commit: `node tools/check.js`. The bar is **1 failure, 1 warning**. Any
   third line means stop and fix before continuing.

**Wave 2 — caisse + plan de salle.** Bucket C. Separate commits, separate
verification pass, explicitly against production's employee-auth behaviour: the till
must still refuse to open without an authorised cashier, and employee PINs must
still be role-scoped.

**Wave 3 — parity gate.** §7.

**Wave 4 — rollout.** §8.

---

## 7 · Parity gate — the thing that catches a silent data regression

Design-only means **every number on the screen is identical before and after**. Prove
it, don't assert it.

Serve production `origin/main` and the ported branch on two local ports from two
worktrees. Unregister the service worker on both. Enter each via
"Entrer dans la démo →". Then, for each of these surfaces, capture the rendered
values from **both** and diff them:

- Accueil — every KPI, all four comparison deltas, the daily objective
- The four date-range pills — Aujourd'hui / Hier / 7 jours / 30 jours
- Rapport journalier — note it deliberately ignores the dateRange fixtures and reads
  a different well; empty on demo is *correct*, not a regression
- Commandes, Clients & Marketing, Terminaux, Conformité, Équipe
- Plan de salle, Menu & modificateurs, Stock, Marges & budget
- Retours & échanges — the returns hero specifically; confirm it still branches on
  `real` and does not hardcode percentages
- Both themes. Dark mode is an **Ultra** gate — confirm it is still gated, and note
  that legacy `html[data-theme="dark"]` rules outrank the Vexel skin, so a base-rule
  edit can silently do nothing.
- 375 px and 1280 px.

Scripted extraction beats eyeballing, but re-validate the script against the new
skin first — a probe written for the old markup goes blind on the new one and
reports false green.

**Any numeric difference is a migration defect.** Fix it or revert the hunk that
caused it. Do not rationalise one.

---

## 8 · Rollout

1. Deploy `feat/v2-design` to a **preview URL**. Note: `kiwi-os.com` serves the
   account gate to `curl` at HTTP 200, so verify through the GitHub Pages mirror or a
   real browser session — a 200 proves nothing.
2. Run the §7 parity check against production with the same account and the same
   data. Publish the diff.
3. Show both, side by side, and **wait for an explicit go**. Do not merge to `main`
   on your own judgement.
4. On approval: merge to `main`, push to `zaka33333-hash/Kiwi` (Cloudflare builds it)
   **and** `badro99/Kiwi` (the partner reads it). Confirm both landed with a
   `git log --oneline -1` per remote.
5. The partner preview repo `kiwi-dashboard-preview` is a **separate deploy** —
   pushing to Kiwi does not update it. Sync it by hand if it is in play.

---

## 9 · What to report back

After each wave, in this order:

1. What landed — commit hashes and one line each
2. `tools/check.js` result vs the 1-failure/1-warning bar
3. What was **deferred** — every v2 design hunk you dropped because it required
   logic, with the file and the reason. This list is as important as the code.
4. What broke and how you verified the fix, in the rendered page
5. Anything you found and did *not* fix, flagged explicitly

Never report a wave as done from reading the diff. Done means seen working.

---

## 10 · Standing prohibitions

- Do not widen scope. No refactors, no audits, no unasked-for improvements, no
  "while I was in there".
- Do not introduce a framework, a build step, or a bundler. This stays vanilla.
- Do not introduce new accent colours, bold display weights, or emojis in titles/CTAs.
- **Type is roman. Never italic.** `font-style: italic` on a heading or UI label is
  the fastest-read "generated by an AI" tell in the repo, and it is reset in
  `tokens.css` for a reason.
- Do not ungate dark mode. It is a deliberate Kiwi Ultra upsell.
- Do not add Pay / Banking / Investing surfaces.
- Do not delete or overwrite without reading the target first.
- If you hit something the brief did not anticipate: finish everything that does not
  depend on the answer, then ask one precise question. Do not stall the whole wave
  on it, and do not guess on anything touching client data.
