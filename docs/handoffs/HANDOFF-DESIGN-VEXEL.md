# Handoff · dashboard design track (vexel-light)

Written 2026-08-02. Branch `codex/ux-feedback`, 49 commits ahead of `main`.
Read `CLAUDE.md` §1 (auto-push) and §3 (brand system) first; this file only
covers the design track and assumes those.

---

## 1. The decision that frames everything

The owner reviewed two dashboard skins and chose **`vexel-light`** as the base
to keep working on, because it reads closest to the marketing site's DNA.

- **Work on vexel.** `assets/design-vexel.css` + `assets/design-vexel.js`.
  Enable with `?skin=vexel-light`, revert with `?skin=off`. Persists to
  localStorage (`kiwiDesignVexel`).
- **Vitrine is parked, not dead.** `assets/design-vitrine.{css,js}`, commit
  `b81ead2`, `?skin=vitrine`. It was the previous attempt. Opt-in only, nothing
  to undo — leave it alone unless asked.
- The **default** dashboard (no `?skin=`) is still untouched by both. Neither
  skin ships to merchants by default. Making vexel the default was explicitly
  offered and **not** chosen.

## 2. What just landed

`2e78a5d` — *la peau vexel adopte la discipline typographique du site*.
Touches one file: `assets/design-vexel.css` (+80 lines, a new **Layer D** at
the end).

Ported three type rules from the site, and nothing else:

| | before | after |
|---|---|---|
| Display tracking | −0.035em | −0.06em (`--vx-display-track`) |
| Block heads | 18.5px/1.2, tracking 0 | set solid, tracked |
| KPI labels | 16px sentence-case | 12/16 uppercase +0.16em |

Verified live at 1440px and 414px: −1.92px at 32px, −1.62px at 27px, −1.11px
at 18.5px, no clipped labels, no horizontal scroll, console clean, Arabic
neutralised (uppercase and tracking both to zero).

**Deliberately not done, do not "fix" these without asking:**
- **Composition untouched.** The four-up grid, 16px gutters and hidden
  `.dr-sub` are what make this skin read as the mockup (`80d7815`). The site's
  200/750/180 section rhythm is a scroll narrative; a data grid is not.
- **No reveal added.** `dashboard.html:619` already ships an entrance
  choreography gated on `body.cards-enter`. A second observer double-animates.
- **No palette convergence.** `~/.claude/skills/kiwi-dna/design.md` § "Two
  tiers, on purpose" records the site's `#000`/`#00ffae` and the product's warm
  `#F7F5F0` as a decision. The product being light is what makes dark mode a
  **Kiwi Ultra upsell**. Painting this surface black deletes a revenue hook.

## 3. Traps that will cost you a cycle each

These are not hypothetical — every one of them burned a verify pass today.

1. **The dashboard stacks three skins.** A default `body` reads
   `design-2026 design-ios27` (persisted from any 1111 session). Your new skin
   lands *on top* of frosted cards and uppercase labels that are already there,
   and reads as no change. Dump `document.body.className` before you conclude
   anything.
2. **The visible page title is `.dr-label`**, written by `dateRange.js`.
   `h1.greeting` is in the markup but renders at **zero width** — a rule aimed
   at it styles nothing and measures perfectly.
3. **CSS token names collide silently.** `--vx-track` is a *rail colour* in
   Layers B and C, which come later in the file. `letter-spacing:
   var(--vx-track)` was handed an `rgba()`, went invalid, and fell back to
   inherited tracking — no error anywhere. Hence `--vx-display-track`. Grep the
   bare token name, not `var(--name)`, before adding one.
4. **Layer D must stay last.** Every rule in it re-states a Layer A selector at
   identical specificity and wins on document order alone. Moving it up
   silently disables it.
5. **The service worker serves stale assets locally.** Unregister it and delete
   caches before believing a computed style. Assets are stale-while-revalidate,
   so *editing* an existing asset needs no `CACHE` bump; *adding* a file to the
   precache list does.
6. **Screenshot, don't just measure.** Computed styles were correct while the
   page looked identical to the default (trap 2). A/B against `?skin=off` at
   the same viewport.
7. **DOM measurement returns width 0** for off-screen duplicate KPI bands.
   Filter on `getBoundingClientRect().width > 0` before drawing conclusions
   about clipping.

## 4. Open items, in the order I'd take them

**a. `--forest` name collision.** `#0B6E4F` in cuisine/serveur/caisse,
`#1F5D3C` in order/OrderPro. Same class as trap 3 but cross-file. Needs a
rename *decision* from the owner before anyone edits.

**b. `kiwi-serveur.html` `--surface` is undefined.** ~24 rules reference it,
including `body`, so it computes to transparent. **Report-only** — fixing it
visibly repaints a production till and needs the owner's sign-off first.

**c. vexel has no offline copy.** `design-vexel.css` and `.js` are absent from
the `kiwi-sw.js` precache list, unlike `design-2026`, `design-ios27` and
`design-vitrine`. Adding them requires a `CACHE` version bump (currently
`kiwi-app-v215`).

**d. Caisse i18n (audit item #8).** Not started. Sized: 359 French text nodes
in markup, 474 French string literals in JS, 103 placeholder/title/aria
attributes. `KiwiI18n` never loads in `kiwi-caisse.html`, so till receipts are
always French. This is a scoped feature, not a cleanup.

**e. Typography scale.** vexel's title is `clamp(32px, 3vw, 39px)`; the site's
h1 is 64/64. Pushing further is a real tradeoff — every point of display size
costs data density on a screen someone reads for nine hours. Owner's call, not
yours.

## 5. Working-tree hazards

**The tree is dirty with another session's work.** ~29 modified files and a
large set of untracked `"* 2.md"` duplicates. Notably `assets/design-vexel.js`
is **modified and uncommitted by someone else** — I committed only
`design-vexel.css`.

- **Never `git add -A`.** Stage explicit paths only.
- `kiwi-caisse.html` carries two of my verified hunks (`--gradient` flattening,
  `.wordmark`) sitting uncommitted among ~68 hunks of unrelated in-flight work.
  Leave them unless you can isolate them.
- **Never leave files staged** — a concurrent session's commit will absorb them.

## 6. Commit and push protocol

Commits are pre-authorised; **deploys and deletions are not** — ask first.

Push the branch to **both** remotes by URL (remote *names* reshuffle between
sessions, so don't trust `origin`):

```bash
git push https://github.com/zaka33333-hash/Kiwi.git codex/ux-feedback && git push https://github.com/badro99/Kiwi.git codex/ux-feedback
```

`zaka33333-hash` is what Cloudflare deploys from; `badro99` is what the
business partner reads.

## 7. Local verification

```bash
open "http://localhost:4178/dashboard.html?skin=vexel-light"
```

Dev servers were left running on ports 3000, 3001, 3003, 3210, 4178. The
dashboard is behind a PIN — skip it with `window.__kiwiLock.reveal()` in the
console rather than typing a merchant PIN.
