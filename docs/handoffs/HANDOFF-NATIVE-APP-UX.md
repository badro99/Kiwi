# Handoff · native app UI/UX — 2026-09-04

Written by the outgoing Claude session for the incoming GPT/Codex session.
Base commit: `a190a8f1`. Working tree clean, nothing staged, no source files changed
by me. This document is the entire record of the pass.

---

## 0. Before anything: use the simulator, not a browser

**I could not.** You can. Do it first — it changes what you can trust below.

You have `mcp__Claude_Code_iOS_Simulator__control` (`attach`, `launch`, `screenshot`,
`tap`, `swipe`, `touch_path`, `text`, `button`, `open_url`) and a `build` tool. Call
`attach` **first**, before building — it is cheap, opens instantly on a booted device,
and surfaces the device-permission prompt while the user is still at the keyboard.

```bash
node tools/build-app-www.mjs && cd app && npx cap sync ios
```

then build and `launch` the `.app`.

### What I actually did, so you know what to distrust

I served the static `app/www` bundle over `python3 -m http.server` and drove it in
Chromium at emulated phone/tablet sizes. To reach the Capacitor-only stylesheet I
added `html.kiwi-native` **by hand** in the console. That activates
`app/src/native-runtime.css` but it is **not** a WKWebView, and my clicks were
scripted `element.click()`, not real pointer input — the Browser pane in this session
refused pointer events. CLAUDE.md §5 warns that synthetic events false-pass, and it
is right.

**So: every geometry number below is real and re-measurable. Every behavioural claim
that needs a finger or a real web view is not.** Specifically, re-verify on the
simulator before you touch:

| Unverified | Why the browser can't answer it |
|---|---|
| iOS auto-zoom on sub-16px inputs (§E) | WKWebView behaviour, not Chromium's |
| Real `env(safe-area-inset-*)` (§D1) | Chromium reports `0px`; the notch and home indicator are the whole question |
| Keyboard insets / `--kiwi-keyboard` | needs a real soft keyboard |
| Dynamic Type at accessibility sizes (§F1) | Settings → Accessibility → Display & Text Size |
| Momentum scroll, rubber-banding | Chromium's scroll physics are not UIScrollView's |
| Every tap target under a real finger (§F3) | I measured boxes, not hit-testing |
| **Android hardware Back (§A5)** | needs the **Android emulator**, not the iOS sim |

Two of the items I flagged are Android-only. Don't close them from an iPhone.

---

## 1. Where I got to

Built the bundle (fingerprint `e5258e875a46`, 4 pages, 466 assets, 30.7 MB), served
it, and walked the merchant path as the **Till** role on the demo merchant
(Café Atlas), at **375×812, 390×844, 430×932, 820×1180, 880×900**.

Covered: setup shell → role picker → till open (float + "Ouvrir la caisse") →
product grid → takeaway orders list → add to cart → cart/payment sheet → nav drawer.

Not covered: Kiwi Team / floor, kitchen (KDS), dashboard, pairing, printer setup,
RTL/Arabic, dark mode, offline. **The floor and kitchen surfaces are untouched by
this pass** — they may be better or worse than the till.

I did not write any code. I created `.claude/launch.json` (static server for
`app/www`); `.claude/` is gitignored so it does not appear in `git status`.

---

## 2. Findings

Ordered by how much they hurt. Every number is measured, not estimated.

### A · The navigation model is the root cause of "doesn't feel phone native"

**A1. Nav is a 280px desktop sidebar behind a floating hamburger.** No tab bar
anywhere. `.kw-hamburger` is `position: fixed`, 44×44, `z-index: 46`
(`assets/caisse-skin.css:134`); `aside.sidebar` is `position: fixed`, 280px wide. On a
390px screen the open drawer covers 72% and leaves a dead 110px strip. This is a
web/desktop pattern wearing a phone's clothes, and it is the single biggest reason
the app reads as a website in a shell.

**A2. The drawer mixes navigation with dashboard content.** Inside it: an identity
card, a clock, an "IDENTIFIANT CAISSE" button, the Salle/À emporter/Attente mode
switcher, 4 action tiles, **two KPI cards** (`TRANSACTIONS 47 · Carte 69% · Cash 31%`,
`MOYENNE TABLE 243,91 MAD`, `TABLES RÉGLÉES 35`), then 7 nav rows, then a footer.
~20 interactive elements. The consequence is measurable: real navigation is pushed
below the fold — `Clients & fidélité` sits at **y=713 of 844**, and the footer is cut.

**A3. Drawer nav rows are 40–41px tall** (`.team-trigger`). Apple's minimum is 44pt,
Android's 48dp. The entire primary navigation is under both.

**A4. The mode switcher is buried.** Salle / À emporter / Attente is the most-used
control in a restaurant till and it is two taps deep inside a drawer.

**A5. Android hardware Back is unhandled — nothing in the repo registers it.**
`grep -rn "backButton\|onBackPressed" app/ assets/` returns **zero matches**.
`@capacitor/app` is installed and `appStateChange` is wired
(`app/src/native-runtime.js:216`), but `backButton` is not. In a Capacitor app with
no listener, Back does not close the drawer, dismiss the cart sheet, or close a
modal — **it exits the app.** A cashier with a payment sheet open presses Back and
loses the screen. Verify on the Android emulator, then fix.

### B · Density — the grid wastes the screen, worst on the device POS actually runs on

**B1. `assets/caisse-skin.css:87` hard-codes `grid-template-columns: repeat(2, 1fr)`
for every viewport ≤900px.** The correct responsive rule already exists 33 lines
above it — `assets/caisse-skin.css:54`,
`repeat(auto-fill, minmax(128px, 1fr))` — but it is scoped to the **901–1099px band
only**. Measured:

| Viewport | Columns | Items visible / 35 |
|---|---|---|
| 390×844 (iPhone) | 2 × 167px | 6 |
| 820×1180 (**iPad portrait**) | 2 × **382px** | 10 |
| 880×900 | 2 × **412px** | 6 |

An iPad in portrait — the flagship POS form factor — shows two 382px-wide cards each
holding a small icon, a category label, a short name and a price. Letting the
existing `auto-fill` rule apply would give 5–6 columns and roughly 30 items.

**B2. 258px of chrome sits above the first product, and it never adapts.** Header 95
+ meta line 30 + "Commandes à emporter" back pill 50 + category tabs 40 + "Montant
libre" pill 50. `gridTop` measured **258px at 375, 390, 430, 820 and 880** — identical
at every width. On an 812px phone that is **31.8% of the screen** before the first
sellable item, with a further 72px lost to the bottom bar. Usable band: 482px, or
2.87 rows.

**B3. Every card repeats its own category.** Six cards on screen, six `ENTRÉES`
eyebrows, while the category filter above already says which category you are in.

### C · The grid moves under the cashier's finger — worst defect for a POS

**C1. Adding an item grows its row from 156px to 178px.** The price reflows from
`45 MAD` on one line to `45 / MAD` on two to make room for the − 1 + stepper, the
card grows 22px, and because it is a CSS grid **the whole row grows** — the untouched
neighbour went to 178px too. Every row below shifts down 22px; I measured row 2's top
move from 426 → 448.

So: tap a product, and the next two products jump 22px down under your finger. Tap
again and it happens again. In a fast order this is a mis-tap generator, and it is a
large part of why the app feels unstable rather than native.

### D · The cart / payment sheet

**D1. The expanded sheet has no bottom safe-area padding.** `.rp-peek` correctly
applies `env(safe-area-inset-bottom)` (`assets/caisse-skin.css:171-177`), but the
**open** state (`body.ticket-open .rightpanel { transform: translateY(0) }`) does not:
computed `padding-bottom: 0px`, and the footer row bottoms at **y=828 of 844**. On an
iPhone the home indicator owns roughly the bottom 34pt, so `Imprimer · Réimprimer ·
Vider la commande` sits inside the gesture zone. The file's own comment worries about
exactly this drift — it just guards the peek and not the open sheet. **Confirm the
real inset on the simulator before fixing.**

**D2. That footer's buttons are 65×27px** — far under any minimum — and one of them,
`Vider la commande`, is destructive and carries the same visual weight as `Imprimer`.

**D3. No drag handle.** Dismissal is an ✕. It is a modal wearing a sheet's shape;
native sheets get a grabber and swipe-to-dismiss. (I could not test swipe — use
`touch_path` on the simulator.)

**D4. `45 MAD` appears seven times in the open sheet** (peek total, order summary,
line item, sous-total, total, Encaisser button, …). One number, seven renderings.

**D5. Nine actions stacked with little hierarchy** — Envoyer en cuisine, Encaisser,
three payment-method icons, Partager, Réduction, Imprimer, Réimprimer, Vider.

### E · Text input will zoom the page on iOS

**E1. Five inputs are under 16px and none is inside `.modal`**, so the
`.modal input { font-size: 16px }` rescue at `assets/caisse-skin.css:199` misses all
of them:

| Input | Size | Where |
|---|---|---|
| `.rp-item-note` | **11.5px** | inside the cart sheet — kitchen note |
| `#jr-search-input` | 13px | journal search |
| `#clo-count-input` | 14px | cash count at close-of-day |
| `#km-search` | 15px | menu search |
| `#ci-float-input` | 15px | opening float |

**E2. `kiwi-caisse.html` has no `maximum-scale=1` — but `kiwi-serveur.html` does.**
Four surfaces, inconsistent:

```
index.html        width=device-width, initial-scale=1, viewport-fit=cover
dashboard.html    width=device-width, initial-scale=1, viewport-fit=cover
kiwi-caisse.html  width=device-width, initial-scale=1, viewport-fit=cover
kiwi-serveur.html width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover
```

On iOS, focusing a sub-16px input in a page without `maximum-scale` auto-zooms the
viewport. `.rp-item-note` is the bad case: 11.5px, **inside a `position: fixed` bottom
sheet**, so the zoom lands on top of a fixed coordinate space with the keyboard up.
Prefer raising the inputs to 16px over adding `maximum-scale` — the latter disables
pinch-zoom for everyone. **Verify the zoom actually fires on the simulator first.**

### F · Accessibility and system integration

**F1. Dynamic Type stops at the front door.** `--type-scale` appears **only** in
`app/src/native-shell.js` and `app/src/native-shell.css`. Zero occurrences anywhere in
`assets/`. I confirmed at runtime: setting `--type-scale: 1.35` on the till changed
nothing. So the five-step setup wizard honours the user's text-size setting, and the
till, floor, kitchen and dashboard — where the merchant spends the entire day —
ignore it completely.

**F2. `.welcome-banner` is permanently in the accessibility tree.** It is
`opacity: 0; visibility: visible`, `position: fixed`, `z-index: 80`, sitting over the
header, with **no `aria-hidden` and no `inert`**. A screen reader announces
"Bonjour Othmane, 3 serveurs en service, 11 tables en c…" as live page content
forever. It *does* have `pointer-events: none`, so it does not eat taps — I checked.
This is also what produced the ghost text over the header in the screenshot that
started this: the banner caught mid-fade.

**F3. 15 of 27 on-screen tappable elements are under 44px** at 390px width.

### G · Haptics are installed, wired, and never fired

`@capacitor/haptics` is a dependency. `hapticLight()` is defined at
`app/src/native-runtime.js:52`. A listener for `kiwi:native-haptic` is registered at
`:203`. And **nothing in the repo ever dispatches that event** —
`grep -rn "native-haptic" assets/ app/src/` returns only the listener itself.

So there is no haptic feedback anywhere: not on adding an item, not on payment
success, not on error. On a POS, the silent tile tap is a real part of the
"it's a website" feeling. This is the cheapest high-impact fix in the list.

### H · The setup shell (`app/src/`) — good work, wrong proportions for a phone

It is the best-looking surface in the app and clearly the most recently designed.
But the hero costs roughly **430px of an 812px viewport** before the sign-in field:
`.brand-kicker` at `clamp(30px, 3.1vw, 48px)` and `.step-heading h1` at
`clamp(34px, 4.4vw, 54px)`, which wraps "Sign in to the merchant account" onto two
lines. On the role screen the tiles end around y=575 and ~200px of dead space
follows, with no pinned footer CTA — phone convention puts the primary action at the
bottom, in the thumb's reach.

---

## 3. Things I checked that are NOT broken

Don't spend budget here. `app/src/native-runtime.css` is genuinely well built:

- Under `html.kiwi-native` it correctly sets `-webkit-tap-highlight-color: transparent`,
  `overscroll-behavior: none`, `user-select: none` and `-webkit-touch-callout: none`
  on buttons/nav/header/footer/sidebar/topbar, and `touch-action: manipulation`.
- I suspected `.menu-item` escaped that because it is a `DIV` — **it does not.** It
  carries `role="button"` and `tabindex="0"`, so it inherits all of the above.
  Computed: `user-select: none`, `touch-action: manipulation`, transparent tap
  highlight. No double-tap-zoom risk on product tiles.
- The icon-only payment buttons **do** have accessible labels. I checked; there are
  zero unlabelled buttons in the sheet.
- `.rp-peek`, `.modal`, `.modal-veil`, `.kds-head` and `.kds-body` all handle
  `env(safe-area-inset-*)` properly. Only the *open* `.rightpanel` misses it (D1).
- Keyboard inset tracking via `visualViewport` and `revealFocused()` are implemented
  (`native-runtime.js:58-72`).
- Status bar painting, keep-awake on caisse/cuisine, offline banner, biometric
  re-lock after 20 min idle, and secure pairing restore are all implemented.

The low-level native polish is done. **The gap is layout, density and navigation
model** — which is consistent with the user's read that the app is "way behind the
landing page and dashboard."

---

## 4. Suggested improvements, in the order I'd do them

### P0 — correctness; a merchant loses work or hits a dead end

1. **Register the Android back button** (A5). `App.addListener('backButton', …)` with
   a dismissal stack: modal → cart sheet → drawer → in-app back → only then exit
   (and confirm before exiting from the till). Verify on the Android emulator.
2. **Stop the grid jumping** (C1). Give `.menu-item` a fixed height across both
   resting and in-cart states, and stop the price wrapping — reserve the stepper's
   row in the resting card rather than growing into it. Verify with **real taps** on
   the simulator, not scripted clicks: the whole point is what happens under a finger.
3. **Safe-area the open cart sheet** (D1). Add
   `padding-bottom: calc(<n>px + env(safe-area-inset-bottom, 0px))` to the open
   `.rightpanel` content, sharing the token `.rp-peek` already uses so the two cannot
   drift. Confirm the real inset in the simulator first.
4. **Raise the five inputs to 16px** (E1) rather than adding `maximum-scale=1`.
   Then decide deliberately whether the four surfaces should agree on the viewport
   meta (E2) — right now they differ for no documented reason.

### P1 — the density complaint

5. **Delete the `repeat(2, 1fr)` override at `caisse-skin.css:87`** and let the
   `auto-fill, minmax(…)` rule from `:54` cover ≤900px too, with a minmax floor tuned
   per band (phones want ~150px, tablets ~128px). This one line is the largest single
   win in the audit — an iPad goes from 10 visible items to ~30.
6. **Cut the 258px of chrome** (B2). The meta line, the back pill and the "Montant
   libre" pill are three separate 30–50px rows. Collapse into one row; move "Montant
   libre" into the grid as a first tile or into the sheet. Target under 150px.
7. **Drop the per-card category eyebrow** (B3) whenever a category filter is active.

### P2 — the native-feel gap

8. **Fire haptics** (G1). The dispatcher already exists; add
   `kiwi:native-haptic` on add-to-cart, payment success, error, and drawer open.
   Cheapest win in the list.
9. **Replace the hamburger drawer with a bottom tab bar** (A1–A4) for the 3–5
   destinations a cashier actually uses, and promote the Salle/À emporter/Attente
   switcher out of the drawer into the header as a segmented control — note the repo
   already has `assets/liquid-lens.js` and CLAUDE.md §4 requires **any** new
   tab/pill group to register there rather than inventing a selection style.
   Move the KPI cards out of the nav entirely.
10. **Give the sheet a grabber and swipe-to-dismiss** (D3); separate the destructive
    `Vider la commande` from `Imprimer` (D2); collapse the nine actions into one
    primary plus an overflow (D5); show the total once (D4).
11. **Raise every tap target to 44pt / 48dp** (A3, D2, F3).

### P3 — accessibility

12. **Make `--type-scale` reach the four real surfaces** (F1), following the pattern
    already established in `native-shell.css`:
    `calc(<px> * var(--type-scale, 1))`, which is a no-op at scale 1 and fail-soft via
    the `var(…, 1)` fallback. This is a large mechanical change across `assets/*.css`
    — a good candidate for delegation, and it needs a real device at accessibility
    text sizes to validate.
13. **`inert` + `aria-hidden` on `.welcome-banner`** while it is faded (F2).

---

## 5. Repo rules that will bite you

Read `CLAUDE.md` in full; these four are the ones this work touches.

- **Asset stamps.** Editing `assets/foo.css` without moving its `?v=NNN` means every
  returning browser keeps the old file, silently, at HTTP 200. Never move a stamp by
  hand — `node tools/bump-stamp.js assets/caisse-skin.css`. It moves the stamp
  everywhere it lives and reseals `tools/asset-stamps.json`.
- **The gate is `node tools/check.js`.** As of `a190a8f1` there are **3 pre-existing
  failures** — `planning-layout-test.mjs`, `reservations-test.mjs`,
  `briefing-cancellations-test.mjs`. They are not yours. Prove any new red is yours by
  running it in a detached worktree at the untouched base.
- **`app/www` is generated and gitignored.** Edit `app/src/` and `assets/`, then
  rebuild. Never edit `app/www` directly.
- **Brand is locked** (CLAUDE.md §4): no new accent colours, no bold display weights,
  roman never italic, Material Symbols only — never hand-draw or edit a vendored path.
- **Push `main` to both mirrors by URL**, `zaka33333-hash/Kiwi.git` (Cloudflare Pages)
  and `badro99/Kiwi.git` (partner). Stage by path, never `git add -A` — other sessions
  share this working tree.

---

## 6. The one thing I'd want you to check that I couldn't

Whether any of §C, §D1 or §E reproduces **under a real finger on a real simulator**.
My clicks were scripted and my "native" was a hand-added CSS class. The geometry is
solid; the feel is not something I was able to test, and "doesn't feel phone native"
is fundamentally a claim about feel.

Start there, then work down §4.
