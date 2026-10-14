# Handoff · Design 2027, stages 4 to 7

Written 2026-10-14, at the end of stage 3, for the agent that builds the rest on
another machine. Read `CLAUDE.md` first (the operating rules), then this file,
then the spec sections it points to. Everything below was true at `main` when it
was written; check `git log` for anything newer before you trust it.

## 1. Where things stand

The direction is `docs/specs/kiwi-design-2027.md` (revision 25, about 5 200
lines). **Do not read it front to back.** Its §21.1 (Stages) is the plan; the
"as landed" paragraphs under it say exactly what each stage shipped and what it
left open. §23 is the owner's decisions; every one is decided (revision 25:
"every open decision above takes its recommendation"). Do not reopen them.

| Stage | State | Where to read it |
| --- | --- | --- |
| 1 · Foundations | Landed (`e13d8b82` … `a17d1a9a`, `3de30049`) | §21.1 table, row 1 |
| 2 · Kit | Landed (`6327ff86`): `assets/kit/`, gallery `kit.html` | "Stage 2, as landed" |
| 3a · PIN pad | Landed (`a1dd05b1` … `5f309be0`, spec `32ced467`) | "Stage 3a, as landed" |
| 3b · KDS lanes | Landed (`13150c5a`, `8e0f5cf8`, `43b2bb32`) | "Stage 3b, as landed" |
| 3c · One guest app | Landed (`03486247` … `2cda43f2`, then the "i" nutrition button, the Android shift fix and the per-store switch) | "Stage 3c, first part, as landed" and its struck-through open items |
| **4 · Till core** | **Next. Not started.** | §21.1 table, row 4 (long: read all of it) |
| 5 · Dashboard | Not started | row 5 |
| 6 · The rest | Not started | row 6 |
| 7 · Retire | Not started; only after 4 to 6 | row 7, and §22 (What is deleted) |

**Flags.** Every surface has one: `localStorage['kiwiSkin2027:<surface>'] = '1'`,
or `?skin=2027` for one load. Existing: `till`, `dashboard`, `team`, `kds`,
`ordering`. All are off by default. A flag becomes default-on only after the
four conditions at the top of §21.1 (critic round scores 10, `check.js` green,
an Amira Cafe end-to-end run, then the old path kept 14 days). Never flip a
default as a side effect.

**One exception, live now:** the guest app's skin can be switched on per store
by an operator (`features.skin2027` in `merchant_config`, the "Commande client ·
design 2027" option in `kiwi-admin.html`). The middleware then marks the page
(`functions/_middleware.js` › `guestApp`). It is on for **`amira-cafe`** only,
the owner's test venue, as the start of its end-to-end run. Turn it off from
kiwi-admin if it ever misbehaves.

## 2. Stage 4, where to start

Row 4 of §21.1 is the whole scope. In order:

1. **The till's frame and menu, bill, options** behind `kiwiSkin2027:till`
   (the flag already exists: stage 3a put the PIN pad and 3b the kitchen board
   behind it). The hero screens are §18 (§18.3 is the till).
2. **Split, discount, payment**: record-only card, the sync indicator with the
   persistent unsynced count and `sync.send_now`, the tip row and popover,
   regular and compact height forms.
3. **`tipCents`**: a nullable `tip_cents` column. **Migrate the live D1 first**
   (prod lags `schema.sql`, always; query it before assuming), then the
   `/api/sale` validation (§10.26).
4. **Cash count with cash tips, Z with tips.** The cash count's reason chips are
   still undrawn (§18.9; their strings do not exist in §9.6 yet), and stage 4 is
   their deadline.
5. **Shift tools** (`current-attendance-code` in `functions/api/team/live.js`,
   §10.34), the rail and More.
6. **The Takeaway tab's online orders**, retiring `#kop-chip` and `#kop-root`,
   with `online-inbox-test` as row 4 specifies.
7. **Then the business-type tills** onto the shared frame, three per release,
   `autre` first.

Row 4's "New gates" column lists the tests to write: `components-sum-test`,
`discount-reasons-test`, `sale-unsynced-test`, `banner-announce-test`,
`pay-height-test`, plus the tip ledger cases. Each named test must exist and be
wired into `tools/check.js` before the stage counts as landed. A test file
check.js does not name guards nothing.

**Carried into stage 4 from earlier stages** (all in the "as landed" notes):
- `till-approval-level-test`'s run-time count is not built (3a). The event
  `kiwi:approval-open` is already dispatched at every opening, ready for it.
- Decision 6 (stock on Void) says "confirm with the stock module before
  stage 4". Do that first.
- The kit's JS core has about 1.2 KB of headroom against its 35 KB budget
  (`kit-size-test`). The next file in that set needs a trim, or a
  comment-stripping step at deploy, and the build step is the owner's call.
- The KDS header (station control, live dot, display sizes, bump-bar modes) is
  still the shipped one (3b).
- Decision 16 (the till's biometric relock) ships in the native app, so it waits
  for an iOS build.

## 3. How this work has been done (keep doing it)

- **Work in a git worktree off `main`**, never in the shared checkout
  (`git worktree add -b <branch> /private/tmp/kiwi-<name> origin/main`).
  Other sessions edit the shared one. In a new worktree, run `npm ci` inside
  `app/` before the gate (the bundle tests and puppeteer need it). **Never
  symlink `app/node_modules`**: `npm ci` follows the link and empties the real
  one.
- **One commit per coherent slice**, message `kit 2027 · étape 4 (n) : …` (the
  history is in French; keep it), the footer for the model running.
- **Gates:** `node tools/check.js --fast` between edits; the **full**
  `node tools/check.js` (about 13 minutes) must be green on the exact commit
  before a push. **Do not edit the worktree while its full gate runs**: its
  verdict then matches no commit. A suite that fails in parallel reruns alone;
  only a solo failure is red. A timing suite (`kit-budget-browser-test`) can
  fail when other sessions' gates load the machine: prove it alone, never
  bypass it.
- **Stamps:** `node tools/bump-stamp.js <file>` for every changed stamped asset,
  `--sync` after adding files. Never move a `?v=` by hand. §21.3 is the
  checklist for every new kit file.
- **Push:** fetch both mirrors, rebase if `main` moved, re-gate if it did, then
  push `"$(git rev-parse HEAD):refs/heads/main"` by URL to
  `https://github.com/zaka33333-hash/Kiwi.git` and
  `https://github.com/badro99/Kiwi.git`. A push has sometimes failed once and
  gone through on retry. Never force-push. Fast-forward the shared checkout
  only if it is clean.
- **Spec as you land:** each stage ends with a "Stage N, as landed" paragraph in
  §21.1: what shipped, its gates with check counts, and its open items "stated
  rather than assumed". Strike through an open item when you close it, saying
  how.
- **Every surface:** FR, EN and AR in step (`assets/kit/strings/*.{fr,en,ar}.js`,
  linted); Material icons only; no italics; no U+2014 em dash in user copy;
  kit CSS uses tokens only (kit-lint).

## 4. The owner's standing rules (from earlier sessions, not all in CLAUDE.md)

- **Zero-cost features only**: no paid APIs, no extra AI neurons.
- **The floor plan stays as shipped.** Two redesigns were rejected (decision 15).
  Never restyle it unasked.
- **`tools/agent-e2e/` is parked**: the owner will not pay for its tokens. Never
  run it.
- **Amira Cafe (the restaurant venue only)** is the test account: test orders
  labelled `TEST KIWI`, reversed through the product, books never hand-edited.
  Its codes go through the UI only, never printed or committed. No tests on
  Santos Store or any other real merchant.
- **Machine limits:** at most 3 browser slots at once on the owner's Mac; check.js
  already runs 8 jobs and 3 browsers.
- **Downloads need the owner's yes**, with file, source and size stated.
- **Ask before** sending anything for the owner, or turning on a flag by default.

## 5. Things that live only on the old Mac

- **iOS builds:** `KIWI_DEVELOPMENT_TEAM=H74H42538F KIWI_BUILD_NUMBER=<N> sh tools/app-archive.sh --upload`
  from a worktree at a commit Cloudflare has deployed (check-runs on the zaka
  mirror). It reruns the full gate first. **Last uploaded: build 41**
  (`dc8c310e`), so the next is 42. TestFlight's "Kiwi Team" group gets every
  upload automatically. It needs Xcode signed in to the team; on a machine
  without that, leave builds to the owner. Stages 4 to 7 all say "Native
  build? Yes".
- **The Android emulator** (Android 15, used for the §6.1 layout-shift
  measurement) is installed on the old Mac only. `tools/android-cls.mjs`'s
  header says how to set it up without Java.
- **graphify** (`graphify-out/`) is local and gitignored; run `graphify update .`
  to build it, or skip it and read the files you change.
