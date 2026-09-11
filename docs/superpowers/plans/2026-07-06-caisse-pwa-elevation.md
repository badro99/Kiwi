# Kiwi Caisse — Premium PWA Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `kiwi-caisse.html` into a gorgeous, installable, offline-capable, responsive point-of-sale app — at the dashboard's premium bar — without leaving the locked vanilla HTML/CSS/JS stack.

**Architecture:** Keep the existing dispatcher + per-vertical modules untouched. Layer a shared premium *skin* (`caisse-skin.css`) and a *motion* file (`caisse-motion.js`) onto the existing register chrome by class name, wire in the already-landed elevation tokens from `tokens.css`, sweep cold `#fff` fills to warm `--paper-elev` across the vertical stylesheets, add responsive breakpoints (portrait bottom-sheet ticket), package the app with a `manifest.webmanifest` + service worker, add a mocked hardware bridge behind a clean seam, and fill the highest-value café + pressing feature gaps.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no build, no bundler). PWA: Web App Manifest + Service Worker (Cache API). Motion: Web Animations API + existing `liquid-lens.js`. Persistence: `localStorage` (unchanged). Icons: SVG (maskable) + one canvas-generated PNG. Fonts: Inter Tight / Instrument Serif / JetBrains Mono.

---

## Verification model (read first)

This project has **no unit-test harness** (vanilla, zero-dep — see `tools/check.js` header). "Test" steps below therefore mean the project's real safety net:

1. **Static smoke check:** `node tools/check.js` — must print `✓ all checks passed`. It enforces three rules this plan must respect:
   - Every `data-action="x"` in HTML **must** have a handler known to some `assets/*.js` file, or it fails. Any new `data-action` (Task 4's `toggle-ticket`, Task 7's actions) ships with its handler in the same commit.
   - No `background: var(--ink)` in CSS/JS (inverts in dark mode) — use `--ink-bg`, `--riad`, or `--riad-deep`.
   - No secret-shaped strings.
2. **In-browser verification** via the Claude Preview MCP against the local static server (`kiwi-static`, port 4178): `preview_start` → navigate to `http://localhost:4178/kiwi-caisse.html` → `preview_screenshot` / `preview_inspect` (assert exact CSS props) / `preview_resize` (viewport shapes). Where a step reads runtime state it uses **`preview_eval`** with the given expression. The caisse boots to a PIN keypad; enter a 4-digit code (any unlisted code → café register), pick an opening float, click **Ouvrir la caisse** to reach the register.

**Commit** after each green task with author footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `<scope> · <what>` subject. **Push** to both remotes at task checkpoints via `tools/push-both.sh` (or, if remote names reshuffled, push `main` by URL to both the Cloudflare repo `zaka33333-hash/Kiwi` and the Pages repo `badro99/Kiwi` — see `~/.claude/.../memory/deploy-remotes.md`). Per CLAUDE.md never `git add -A`; stage explicit paths.

---

## File structure

**New files:**
- `assets/caisse-skin.css` — elevation + warm-paper + responsive skin for the caisse chrome (targets existing classes only).
- `assets/caisse-motion.js` — motion hooks: ticket-row spring, total count-up, validate celebration, category-tab lens rescan, bottom-sheet toggle. Reduced-motion aware.
- `manifest.webmanifest` — installable app metadata.
- `assets/caisse-sw.js` — service worker (cache-first app shell + versioned bust).
- `assets/caisse-pwa.js` — SW registration + install affordance + offline/online status.
- `assets/caisse-hardware.js` — `KiwiHardware` peripheral bridge (mock now, Web Serial/USB/BT seam).
- `assets/icons/kiwi-caisse.svg` — maskable brand mark for the manifest.
- `assets/icons/kiwi-caisse-180.png` — iOS apple-touch icon (canvas-generated once).

**Modified files:**
- `kiwi-caisse.html` — head link/meta/script wiring; `data-lens-*` on category tabs; motion hook calls at the recompute + payment-success sites; café feature-fill handlers (Task 7).
- `assets/tokens.css` — add one motion token (`--spring`). (Elevation tokens `--elev-1/2`, `--paper-elev` already present.)
- `assets/pos-boulangerie.css`, `pos-boutique.css`, `pos-coiffure.css`, `pos-epicerie.css`, `pos-fastfood.css`, `pos-fleuriste.css`, `pos-foodtruck.css`, `pos-gym.css`, `pos-hotel.css`, `pos-librairie.css`, `pos-pharmacie.css`, `pos-pizzeria.css`, `pos-spa.css`, `pos-traiteur.css`, `pressing-caisse.css` — `#fff` → `var(--paper-elev)` sweep (card/panel fills only).
- `assets/pressing-caisse.js` — pressing feature-fill handlers (Task 7).

**Critical ordering constraint (Task 1):** the caisse has its **own** inline `:root` palette in the `<head>` `<style>` (`--forest #1F5D3C`, `--paper #FAFAF8`, `--mint #7DF2B0`, `--ink #111`) whose names overlap `tokens.css`. `tokens.css` **must** be linked **before** the inline `<style>` so the inline palette still wins (caisse keeps its greens) while the *new* tokens the inline block doesn't define (`--elev-1/2`, `--paper-elev`, `--spring`) resolve. `caisse-skin.css` must be linked **after** the inline `<style>` so its elevation rules override the inline component styles. Do **not** link `theme.css` — the register is intentionally a light surface; dark mode is out of scope for round 1.

---

## Task 1: Foundation — wire tokens, elevate the chrome, register the tab lens

**Files:**
- Modify: `assets/tokens.css` (add `--spring`)
- Create: `assets/caisse-skin.css`
- Modify: `kiwi-caisse.html` (head links; `data-lens-*` on `.cat-pills`/`.cat-pill`)

- [ ] **Step 1: Add the motion spring token to `tokens.css`**

In `assets/tokens.css`, immediately after the `--elev-2:` line (line ~31), add:

```css
  /* Signature spring — la lentille liquide settle curve. Single source; the
     caisse skin and motion layer both reference var(--spring). */
  --spring: cubic-bezier(0.34, 1.45, 0.5, 1);
```

- [ ] **Step 2: Create `assets/caisse-skin.css`**

Create `assets/caisse-skin.css` with exactly this content:

```css
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — premium skin.
 * Layers lit-paper elevation onto the existing register chrome WITHOUT touching
 * per-vertical logic. Loaded AFTER the inline <style> (these rules win); relies
 * on tokens.css (linked BEFORE the inline block) for --elev-1/2, --paper-elev,
 * --spring. The caisse keeps its own --forest/--emerald palette.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ---- Light register surfaces: warm lit paper instead of cold #fff ---- */
.rightpanel {
  background: var(--paper-elev);
  box-shadow: var(--elev-1);
}
.menu-item {
  background: var(--paper-elev);
  box-shadow: var(--elev-1);
  transition: box-shadow .22s var(--spring), transform .18s var(--spring),
              background .18s ease;
}
.menu-item:hover { box-shadow: var(--elev-2); }
.menu-item.is-in-cart { box-shadow: var(--elev-2); }

/* Lit icon plate on menu tiles (mint → paper wash + inset highlight) */
.menu-item-art {
  background: linear-gradient(160deg,
              color-mix(in srgb, var(--mint) 40%, var(--paper-elev)) 0%,
              var(--paper-elev) 70%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.85);
}

/* ---- Category tabs: cooperate with the liquid-lens pill ----
 * The lens paints the moving selection pill behind the active tab, so each pill
 * is transparent-resting; the active pill's fill comes from the lens, not the
 * tab. Keep the active TEXT colour for legibility. */
.cat-pills { position: relative; }         /* lens positions against this */
.cat-pill { background: transparent; box-shadow: none; }
.cat-pill:hover { background: color-mix(in srgb, var(--forest) 6%, transparent); }
.cat-pill.is-active { background: transparent; color: var(--forest); }

/* ---- Stat cards in the light zone read as lit paper ---- */
.stat-card { box-shadow: var(--elev-1); }
```

- [ ] **Step 3: Wire the head links in the correct order**

In `kiwi-caisse.html`, the caisse currently links no shared CSS. Add the `tokens.css` link **before** the opening `<style>` tag in `<head>` (so the inline palette overrides shared tokens but the new elevation tokens resolve). Find the `<style>` line (~line 34, `<style>` then `/* ---------- Tokens (inline, file is standalone) ---------- */`) and insert immediately above it:

```html
  <!-- Shared material tokens (elevation, paper, spring). Linked BEFORE the
       inline <style> so the caisse's own palette still wins; only the tokens
       the inline block does not define (--elev-1/2, --paper-elev, --spring)
       are inherited from here. -->
  <link rel="stylesheet" href="assets/tokens.css" />
```

Then add the skin link **after** the closing `</style>` of that head block (so skin rules override inline component styles). Find the `</style>` that closes the main head style block and insert immediately after it:

```html
  <link rel="stylesheet" href="assets/caisse-skin.css" />
```

- [ ] **Step 4: Register the category tabs as a liquid-lens group**

`liquid-lens.js` auto-attaches to `[data-lens-demo]` containers (items marked `[data-lens-item]`) and re-scans added DOM via a MutationObserver. In `kiwi-caisse.html`, find the `.cat-pills` container in the café markup and add `data-lens-demo`, and add `data-lens-item` to each `.cat-pill`. If the pills are rendered by JS, add the attributes in the render string. Locate the `.cat-pills` element (search `class="cat-pills"`) → change to `class="cat-pills" data-lens-demo`; locate the `.cat-pill` template (search `class="cat-pill`) → add `data-lens-item` to each rendered pill.

- [ ] **Step 5: Verify — elevation is live and the palette held**

Start the preview and open the café register:

```
preview_start(name: "kiwi-static")
preview_eval → expression: window.location.href='http://localhost:4178/kiwi-caisse.html'
preview_resize(serverId, width:1680, height:960)
```

Enter `1234` on the keypad (programmatically: click the `.pin-key` elements for 1,2,3,4), then click `.clockin-btn`. Then assert:

- `preview_inspect(serverId, ".rightpanel", ["background-color","box-shadow"])` → `box-shadow` is non-`none` (elevated), background is warm off-white (not pure `rgb(255,255,255)`).
- `preview_eval` → expression: `getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()` → **`#FAFAF8`** (caisse palette preserved, NOT tokens.css `#F7F5F0`).
- `preview_eval` → expression: `getComputedStyle(document.documentElement).getPropertyValue('--elev-1').trim().length > 0` → `true` (elevation token inherited).

Expected: elevated ticket panel, preserved caisse green palette.

- [ ] **Step 6: Verify static checks pass**

Run: `node tools/check.js`
Expected: `✓ all checks passed`

- [ ] **Step 7: Commit**

```bash
git add assets/tokens.css assets/caisse-skin.css kiwi-caisse.html
git commit -F - <<'MSG'
caisse · elevate register chrome + wire shared tokens & tab liquid-lens

Layer lit-paper --elev-1/2 onto .rightpanel/.menu-item/.cat-pill; link
tokens.css before the inline palette (caisse keeps its greens) and
caisse-skin.css after; register category tabs as a liquid-lens group.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 2: `#fff` sweep across the vertical stylesheets

**Files:**
- Modify: the 14 `assets/pos-*.css` + `assets/pressing-caisse.css` (card/panel fills only)

**Note:** ~26–48 `#fff` per file. This is a mechanical, per-file-reviewed pass — a good candidate to delegate to `gemini -m gemini-2.5-flash-lite` with the rule below, but each file's result **must** be reviewed for over-replacement before staging.

- [ ] **Step 1: Baseline — count the sweep surface**

Run:
```bash
for f in assets/pos-*.css assets/pressing-caisse.css; do printf "%-32s %s\n" "$f" "$(grep -oiE '#fff(fff)?\b' "$f" | wc -l | tr -d ' ')"; done
```
Record the counts (they'll drop after the sweep).

- [ ] **Step 2: Replace card/panel-background `#fff` with `var(--paper-elev)`**

For each file, replace `#fff`/`#ffffff` that is a **card, panel, tile, sheet, or surface background** with `var(--paper-elev)`. **Leave genuine whites alone:** toggle/switch knobs, status dots, on-ink/on-dark text (`color:#fff`), icon glyphs on colored chips, and box-shadow inset highlights (`rgba(255,255,255,…)`). Rule of thumb: `background`/`background-color: #fff` on a container → sweep; `color: #fff` or `#fff` inside a `linear-gradient`/`box-shadow`/knob → keep.

Do this per file (review each replacement in context — do not blind-sed) for all 15 files.

- [ ] **Step 3: Verify no card surface is still cold white, no knob got swept**

Run `node tools/check.js` → `✓ all checks passed`.

Then spot-check two swept verticals in the preview. Open the pressing register (`preview` → navigate → enter `0000`) and the boutique (tap the pin-foot to reveal the code list, then enter the boutique code). For each: `preview_screenshot` and confirm cards read as warm paper (not stark white) and toggles/dots are still white.

- [ ] **Step 4: Confirm the sweep landed**

Re-run the Step 1 count command. Each file's `#fff` count should have **dropped** (residual counts are the legitimately-kept whites). Eyeball that no file dropped to an implausibly low number (would signal an over-sweep of kept whites).

- [ ] **Step 5: Commit**

```bash
git add assets/pos-boulangerie.css assets/pos-boutique.css assets/pos-coiffure.css assets/pos-epicerie.css assets/pos-fastfood.css assets/pos-fleuriste.css assets/pos-foodtruck.css assets/pos-gym.css assets/pos-hotel.css assets/pos-librairie.css assets/pos-pharmacie.css assets/pos-pizzeria.css assets/pos-spa.css assets/pos-traiteur.css assets/pressing-caisse.css
git commit -F - <<'MSG'
caisse · sweep cold #fff card fills to warm --paper-elev across verticals

Card/panel/tile backgrounds now read as lit paper; knobs, dots, on-ink
text, and inset highlights left as genuine white.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 3: Motion layer — make ringing up feel alive

**Files:**
- Create: `assets/caisse-motion.js`
- Modify: `kiwi-caisse.html` (script tag; one hook call at each recompute + payment-success site)

Existing behavior to build on (do not duplicate): `.menu-item.pop { animation: pop-add 280ms }` already fires on add-to-cart; the payment success already adds `.is-success`/`.flash` to the reader disc (~line 6383) and cash success (~6521). The ticket total is set via `#rp-total.textContent = fmtMAD(...)` at ~4 sites (~5648, 6085, 6879). This task adds: (a) a spring on the newest ticket row, (b) a count-up on `#rp-total`, (c) a confetti burst on payment success, (d) a `KiwiLens.rescan()` after the menu renders, (e) the bottom-sheet toggle used in Task 4. All suppressed under `prefers-reduced-motion`.

- [ ] **Step 1: Create `assets/caisse-motion.js`**

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — motion layer. Self-contained, defer-loaded. Exposes
 * window.CaisseFx. All effects no-op under prefers-reduced-motion.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPRING = 'cubic-bezier(0.34, 1.45, 0.5, 1)';

  function springIn(el) {
    if (reduce || !el || !el.animate) return;
    el.animate(
      [{ transform: 'translateX(8px)', opacity: 0 },
       { transform: 'translateX(0)',   opacity: 1 }],
      { duration: 320, easing: SPRING, fill: 'both' }
    );
  }

  // Spring the newest ticket row whenever the order list gains a child.
  function watchTicket() {
    var list = document.getElementById('rp-items') ||
               document.querySelector('.order-items');
    if (!list) return;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) springIn(n); });
      });
    }).observe(list, { childList: true });
  }

  // Count the total up from its previous displayed value to the new one.
  var lastTotal = 0;
  function countTotal() {
    var el = document.getElementById('rp-total');
    if (!el) return;
    var to = parseFloat((el.textContent || '').replace(/[^\d.]/g, '')) || 0;
    var suffix = (el.textContent || '').replace(/[\d\s.,]/g, '').trim();
    function fmt(v) { return Math.round(v).toLocaleString('fr-FR') + (suffix ? ' ' + suffix : ''); }
    var peek = document.getElementById('rp-peek-total');
    if (reduce || !el.animate) { lastTotal = to; if (peek) peek.textContent = el.textContent; return; }
    var from = lastTotal; lastTotal = to;
    if (from === to) { if (peek) peek.textContent = el.textContent; return; }
    var start = null, dur = 420;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(frame); else el.textContent = fmt(to);
    }
    requestAnimationFrame(frame);
    if (peek) peek.textContent = fmt(to);
  }

  // Confetti burst — self-contained DOM, no dependency.
  function confetti(originEl) {
    if (reduce) return;
    var r = originEl ? originEl.getBoundingClientRect()
                     : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var colors = ['#0B6E4F', '#7DF2B0', '#3FB67A', '#F7F5F0'];
    for (var i = 0; i < 24; i++) {
      var p = document.createElement('span');
      p.style.cssText = 'position:fixed;z-index:9999;width:8px;height:8px;border-radius:2px;pointer-events:none;left:' +
        cx + 'px;top:' + cy + 'px;background:' + colors[i % colors.length];
      document.body.appendChild(p);
      var ang = (Math.PI * 2 * i) / 24, dist = 80 + (i % 5) * 22;
      (function (node) {
        node.animate(
          [{ transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
           { transform: 'translate(' + (Math.cos(ang) * dist - 50) + '%,' + (Math.sin(ang) * dist + 120) + '%) rotate(320deg)', opacity: 0 }],
          { duration: 900 + (i % 4) * 120, easing: 'cubic-bezier(.2,.6,.2,1)', fill: 'forwards' }
        ).onfinish = function () { node.remove(); };
      })(p);
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    watchTicket();
    // Bottom-sheet ticket toggle (Task 4 peek bar).
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="toggle-ticket"]')) document.body.classList.toggle('ticket-open');
    });
  });

  window.CaisseFx = {
    countTotal: countTotal,
    confetti: confetti,
    // Re-attach the liquid-lens after a menu/category re-render.
    lens: function () { if (window.KiwiLens) window.KiwiLens.rescan(); }
  };
})();
```

- [ ] **Step 2: Wire the script tag**

In `kiwi-caisse.html` `<head>`, after the `liquid-lens.js` script tag, add:

```html
  <script src="assets/caisse-motion.js" defer></script>
```

- [ ] **Step 3: Call `countTotal()` at each total-recompute site**

At each site where `#rp-total` is assigned (search `$('#rp-total').textContent`), add on the line **after** the assignment:

```javascript
      window.CaisseFx && window.CaisseFx.countTotal();
```

(There are ~3 recompute functions around lines 5648, 6085, 6879. Add the call after the `#rp-total` set in each.)

- [ ] **Step 4: Fire confetti on payment success**

Find the cash-success point (search `cashSuccessRendu` ~line 6521) and the card-success point (search `reader.status.classList.add('is-success')` ~line 6385). Immediately after the success class is added, add:

```javascript
        window.CaisseFx && window.CaisseFx.confetti(document.querySelector('.reader-disc') || document.getElementById('rp-total'));
```

- [ ] **Step 5: Rescan the lens after the menu renders**

Find where the café menu grid / category pills are (re)rendered (search where `.cat-pill` markup is written into the DOM, or the à-emporter menu render). After the render assignment, add:

```javascript
      window.CaisseFx && window.CaisseFx.lens();
```

- [ ] **Step 6: Verify motion, and that reduced-motion disables it**

Preview → café register (`1234` → Ouvrir). Add an item to a ticket (open à-emporter mode, click a `.menu-item`); `preview_screenshot` mid-interaction — the new ticket row should be present, total updated. Switch category tabs and screenshot — the liquid-lens pill should follow the active tab.

Then confirm the reduced-motion guard: `preview_eval` → expression: `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — if the harness can emulate reduced motion, confirm `CaisseFx.confetti()` early-returns; otherwise assert the guard exists by reading the file. `node tools/check.js` → green.

- [ ] **Step 7: Commit**

```bash
git add assets/caisse-motion.js kiwi-caisse.html
git commit -F - <<'MSG'
caisse · motion layer — ticket-row spring, total count-up, pay confetti

Self-contained CaisseFx (WAAPI); count-up on #rp-total, spring on the
newest order row, confetti on payment success, lens rescan after menu
render, bottom-sheet toggle. All effects no-op under prefers-reduced-motion.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 4: Responsive register — portrait bottom-sheet ticket

**Files:**
- Modify: `assets/caisse-skin.css` (append responsive breakpoints)
- Modify: `kiwi-caisse.html` (peek-bar element inside `.rightpanel`)

The landscape layout is `.sidebar` (left) · `.main` (center) · `.rightpanel` (ticket). At ≤767px the third column doesn't fit — the ticket becomes a bottom sheet: a peek bar (item count + total) that expands to the full `.rp-active`. The toggle handler was already added in Task 3 Step 1 (`data-action="toggle-ticket"`).

- [ ] **Step 1: Append breakpoints to `assets/caisse-skin.css`**

```css
/* ═══ Responsive register ═══════════════════════════════════════════════════ */

/* Peek bar — hidden on wide screens, shown as the bottom-sheet handle on phones */
.rp-peek { display: none; align-items: center; justify-content: space-between;
           padding: 14px 20px; cursor: pointer; font-weight: 600; }

/* Mid — tablet landscape: narrow the menu, keep the ticket docked but slimmer */
@media (max-width: 1099px) and (min-width: 768px) {
  .rightpanel { width: min(340px, 34vw); }
  .menu-grid { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); }
}

/* Portrait handheld — ticket becomes a bottom sheet */
@media (max-width: 767px) {
  .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 40;
             transform: translateX(-100%); transition: transform .28s var(--spring); }
  body.nav-open .sidebar { transform: translateX(0); }
  .main { padding-bottom: 88px; }               /* room for the peek bar */
  .menu-grid { grid-template-columns: repeat(2, 1fr); }
  .menu-item { min-height: 96px; }              /* big thumb targets */

  .rightpanel {
    position: fixed; left: 0; right: 0; bottom: 0; top: auto;
    width: 100%; max-height: 82vh;
    transform: translateY(calc(100% - 72px));   /* peek bar height */
    transition: transform .32s var(--spring);
    border-radius: 18px 18px 0 0;
    box-shadow: var(--elev-2);
    z-index: 45;
  }
  body.ticket-open .rightpanel { transform: translateY(0); }
  .rp-peek { display: flex; }
}
```

- [ ] **Step 2: Add the peek bar element**

In `kiwi-caisse.html`, inside `<aside class="rightpanel">` as its **first** child, add:

```html
      <button class="rp-peek" id="rp-peek" data-action="toggle-ticket" aria-label="Afficher l'addition">
        <span id="rp-peek-count">0 articles</span>
        <span id="rp-peek-total">0 MAD</span>
      </button>
```

`#rp-peek-total` is kept in sync by `CaisseFx.countTotal()` (already wired in Task 3). The `toggle-ticket` action already has its handler (Task 3 Step 1), so `tools/check.js` resolves it.

- [ ] **Step 3: Verify all three shapes**

Preview → café register. For each viewport, screenshot and confirm layout:
- `preview_resize(serverId, width:1680, height:960)` — three columns, ticket docked right, elevated.
- `preview_resize(serverId, width:1024, height:768)` — ticket slimmer, still docked.
- `preview_resize(serverId, width:390, height:844)` — ticket collapsed to a bottom peek bar; tapping `#rp-peek` (`preview_click(serverId, "#rp-peek")`) expands it over the register; `preview_screenshot` confirms the sheet slides up and primary actions (card/cash/Valider) are reachable.

Also open the pressing register (`0000`) at 390px and confirm it reflows without horizontal scroll: `preview_eval` → expression: `document.documentElement.scrollWidth <= window.innerWidth + 1` → `true`.

- [ ] **Step 4: Static check + commit**

Run `node tools/check.js` → green.

```bash
git add assets/caisse-skin.css kiwi-caisse.html
git commit -F - <<'MSG'
caisse · responsive register — portrait bottom-sheet ticket + breakpoints

Landscape keeps 3 columns; 768-1099 slims the ticket; <=767 collapses the
ticket to a tappable bottom-sheet peek bar with big thumb targets.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 5: PWA shell — installable + offline

**Files:**
- Create: `assets/icons/kiwi-caisse.svg`, `assets/icons/kiwi-caisse-180.png`
- Create: `manifest.webmanifest`, `assets/caisse-sw.js`, `assets/caisse-pwa.js`
- Modify: `kiwi-caisse.html` (manifest link + apple meta + pwa script)

- [ ] **Step 1: Create the maskable brand mark `assets/icons/kiwi-caisse.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#053B2C"/>
  <text x="256" y="300" text-anchor="middle" font-family="'Inter Tight',system-ui,sans-serif"
        font-size="180" font-weight="800" fill="#F7F5F0" letter-spacing="-8">kiwi</text>
  <circle cx="388" cy="300" r="20" fill="#7DF2B0"/>
</svg>
```

(Full-bleed `#053B2C` field keeps the mark safe inside the maskable safe-zone.)

- [ ] **Step 2: Generate the iOS PNG once via the preview canvas**

iOS `apple-touch-icon` must be PNG. Generate it once from the SVG using the preview page's canvas and save the bytes. Run this expression via **`preview_eval`**:

```javascript
(async()=>{const svg=await (await fetch('assets/icons/kiwi-caisse.svg')).text();const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(svg);await img.decode();const c=document.createElement('canvas');c.width=180;c.height=180;c.getContext('2d').drawImage(img,0,0,180,180);return c.toDataURL('image/png');})()
```

Take the returned `data:image/png;base64,…` string and write the decoded bytes:

```bash
node -e "const fs=require('fs');const d=process.argv[1].replace(/^data:image\/png;base64,/,'');fs.writeFileSync('assets/icons/kiwi-caisse-180.png',Buffer.from(d,'base64'));" '<PASTE_DATAURL>'
```

Verify: `file assets/icons/kiwi-caisse-180.png` → reports `PNG image data, 180 x 180`.

- [ ] **Step 3: Create `manifest.webmanifest`**

```json
{
  "name": "Kiwi Caisse",
  "short_name": "Caisse",
  "description": "Caisse Kiwi — encaissement multi-métiers",
  "start_url": "/kiwi-caisse.html",
  "scope": "/",
  "display": "fullscreen",
  "display_override": ["fullscreen", "standalone"],
  "orientation": "any",
  "background_color": "#0A0F0D",
  "theme_color": "#053B2C",
  "categories": ["business", "productivity"],
  "icons": [
    { "src": "assets/icons/kiwi-caisse.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 4: Create `assets/caisse-sw.js`**

```javascript
/* Kiwi Caisse service worker — cache-first app shell, versioned bust. */
'use strict';
var CACHE = 'kiwi-caisse-v1';
var SHELL = [
  '/kiwi-caisse.html',
  '/manifest.webmanifest',
  '/assets/tokens.css',
  '/assets/caisse-skin.css',
  '/assets/liquid-lens.js',
  '/assets/caisse-motion.js',
  '/assets/caisse-pwa.js',
  '/assets/caisse-hardware.js',
  '/assets/pos-dispatch.js',
  '/assets/pressing-caisse.js',
  '/assets/pressing-caisse.css',
  '/assets/lucide.min.js',
  '/assets/icons/kiwi-caisse.svg'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Cache each asset individually so one missing file doesn't fail the install.
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* skip missing */ });
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        // Offline navigation → serve the shell.
        if (req.mode === 'navigate') return caches.match('/kiwi-caisse.html');
      });
    })
  );
});
```

- [ ] **Step 5: Create `assets/caisse-pwa.js`**

```javascript
/* Kiwi Caisse — PWA registration, install affordance, offline reflection. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('assets/caisse-sw.js').catch(function () {});
    });
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    showInstall();
  });

  function showInstall() {
    if (document.getElementById('kiwi-install')) return;
    var b = document.createElement('button');
    b.id = 'kiwi-install';
    b.textContent = 'Installer la caisse';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;padding:12px 18px;' +
      'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:600 14px/1 "Inter Tight",system-ui;' +
      'box-shadow:0 8px 24px -8px rgba(11,110,79,.5);cursor:pointer';
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; b.remove(); });
    });
    document.body.appendChild(b);
  }
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('kiwi-install'); if (b) b.remove();
  });

  // Offline/online reflection — a small dot the cashier can trust.
  function status() {
    var d = document.getElementById('kiwi-net') || (function () {
      var s = document.createElement('div'); s.id = 'kiwi-net';
      s.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9998;width:9px;height:9px;border-radius:50%';
      document.body.appendChild(s); return s;
    })();
    d.style.background = navigator.onLine ? '#3FB67A' : '#B85245';
    d.title = navigator.onLine ? 'En ligne' : 'Hors ligne — ventes enregistrées localement';
  }
  window.addEventListener('online', status);
  window.addEventListener('offline', status);
  if (document.readyState !== 'loading') status();
  else document.addEventListener('DOMContentLoaded', status);
})();
```

- [ ] **Step 6: Wire the manifest, apple meta, and pwa script into `kiwi-caisse.html`**

In `<head>`, after the `caisse-skin.css` link, add:

```html
  <link rel="manifest" href="manifest.webmanifest" />
  <meta name="theme-color" content="#053B2C" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Caisse" />
  <link rel="apple-touch-icon" href="assets/icons/kiwi-caisse-180.png" />
  <script src="assets/caisse-pwa.js" defer></script>
```

- [ ] **Step 7: Verify installability + offline load**

Preview → navigate to the caisse. Then, via `preview_eval`:
- expression: `(async()=>{const m=await (await fetch('manifest.webmanifest')).json();return m.name+'|'+m.display+'|'+m.icons.length})()` → `"Kiwi Caisse|fullscreen|1"`.
- expression: `navigator.serviceWorker.getRegistration('assets/caisse-sw.js').then(r=>!!r)` → `true` (SW registered).
- expression: `caches.match('/kiwi-caisse.html').then(r=>!!r)` → `true` (shell cached).
- `preview_network(serverId, filter:"failed")` → the manifest and SW requests are **not** in the failed list.

- [ ] **Step 8: Static check + commit**

Run `node tools/check.js` → green.

```bash
git add manifest.webmanifest assets/caisse-sw.js assets/caisse-pwa.js assets/icons/kiwi-caisse.svg assets/icons/kiwi-caisse-180.png kiwi-caisse.html
git commit -F - <<'MSG'
caisse · PWA shell — installable, full-screen, offline app shell

manifest.webmanifest (fullscreen/standalone, maskable brand icon) +
cache-first service worker (versioned bust) + install affordance and
online/offline reflection. Opens with no network.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 6: Hardware bridge — mock now, real seam later

**Files:**
- Create: `assets/caisse-hardware.js`
- Modify: `kiwi-caisse.html` (script tag; route the existing print action through the bridge)

- [ ] **Step 1: Create `assets/caisse-hardware.js`**

Note: the mock receipt is built with `createElement` + `textContent` (never `innerHTML`) so ticket data can't inject markup — consistent with the project's XSS-safe DOM pattern.

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — hardware bridge. Registers never talk to a device directly;
 * they call KiwiHardware.*. Each method resolves against a MOCK today, with a
 * feature-detected path to Web Serial (ESC/POS) / WebUSB / Web Bluetooth
 * stubbed behind the same interface for later.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var hasSerial = 'serial' in navigator;
  var hasUSB = 'usb' in navigator;
  var hasBT = 'bluetooth' in navigator;

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;   // textContent — never innerHTML
    return n;
  }

  function mockPrint(ticket) {
    return new Promise(function (resolve) {
      function done() { overlay.remove(); resolve({ ok: true, mock: true }); }
      var overlay = el('div', 'position:fixed;inset:0;z-index:9997;display:grid;place-items:center;background:rgba(10,15,13,.55)');
      overlay.setAttribute('role', 'dialog');
      var card = el('div', "background:#FFFDFA;width:300px;max-width:86vw;padding:22px;border-radius:14px;font:13px/1.5 'JetBrains Mono',monospace;box-shadow:0 24px 60px -20px rgba(0,0,0,.5)");
      card.appendChild(el('div', 'text-align:center;font-weight:700;margin-bottom:10px', (ticket && ticket.title) || 'Reçu Kiwi'));
      (ticket && ticket.lines ? ticket.lines : []).forEach(function (l) {
        var row = el('div', 'display:flex;justify-content:space-between');
        row.appendChild(el('span', '', (l.qty ? l.qty + '× ' : '') + (l.name || '')));
        row.appendChild(el('span', '', l.price || ''));
        card.appendChild(row);
      });
      card.appendChild(el('hr', 'border:0;border-top:1px dashed #ccc;margin:10px 0'));
      var tot = el('div', 'display:flex;justify-content:space-between;font-weight:700');
      tot.appendChild(el('span', '', 'Total'));
      tot.appendChild(el('span', '', (ticket && ticket.total) || ''));
      card.appendChild(tot);
      var close = el('button', 'margin-top:16px;width:100%;padding:10px;border:0;border-radius:9px;background:#0B6E4F;color:#F7F5F0;font-weight:600;cursor:pointer', 'Fermer');
      close.addEventListener('click', done);
      card.appendChild(close);
      overlay.appendChild(card);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) done(); });
      document.body.appendChild(overlay);
    });
  }

  window.KiwiHardware = {
    capabilities: { serial: hasSerial, usb: hasUSB, bluetooth: hasBT },
    // Print a receipt. Real path (Web Serial ESC/POS) stubbed; mock shows a preview.
    print: function (ticket) { return mockPrint(ticket); },
    // Open the cash drawer (ESC/POS kick). Mock resolves immediately.
    openDrawer: function () { return Promise.resolve({ ok: true, mock: true }); },
    // Barcode scan. Mock resolves a simulated code after a tick.
    scan: function (cb) { setTimeout(function () { cb && cb({ code: '000000000000', mock: true }); }, 250); return Promise.resolve(); },
    // Card read. Mock resolves approved; NO certified EMV in round one.
    readCard: function (amount) { return Promise.resolve({ approved: true, amount: amount, mock: true }); }
  };
})();
```

- [ ] **Step 2: Wire the script tag**

In `kiwi-caisse.html` `<head>`, after `caisse-motion.js`, add:

```html
  <script src="assets/caisse-hardware.js" defer></script>
```

- [ ] **Step 3: Route the existing print action through the bridge**

The café has `data-action="print-bill"`. Find its handler (search `print-bill`) and, inside it, replace the direct print behavior with a `KiwiHardware.print(...)` call, passing the current ticket's title/lines/total (build from the `#rp-*` DOM or the existing ticket state), and store it for reprint: `window.__lastTicket = ticket;`. Keep the existing handler registration intact so `tools/check.js` still resolves the action.

- [ ] **Step 4: Verify the mock print + capabilities seam**

Preview → café register, open a table with a ticket, trigger print (`preview_click` the print/Imprimer control) → `preview_screenshot` shows the receipt preview modal. Then, via `preview_eval`:
- expression: `JSON.stringify(window.KiwiHardware.capabilities)` → returns the serial/usb/bluetooth booleans (the seam is present).
- expression: `typeof KiwiHardware.print==='function' && typeof KiwiHardware.openDrawer==='function' && typeof KiwiHardware.scan==='function' && typeof KiwiHardware.readCard==='function'` → `true`.

- [ ] **Step 5: Static check + commit**

Run `node tools/check.js` → green.

```bash
git add assets/caisse-hardware.js kiwi-caisse.html
git commit -F - <<'MSG'
caisse · hardware bridge — mock peripherals behind a Web Serial/USB/BT seam

KiwiHardware.print/openDrawer/scan/readCard resolve against mocks (print
preview modal built with safe DOM, simulated scan/card) with
feature-detected real paths stubbed. Route print-bill through the bridge.
No certified EMV yet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 7: Feature-completeness pass — café then pressing (audit-and-fill)

**Files:**
- Modify: `kiwi-caisse.html` (café gap handlers)
- Modify: `assets/pressing-caisse.js` (pressing gap handlers)

**Audit result (evidence from the code).** Both registers are already functionally deep. Café has: split bill (`resume-split`/`cancel-split`, `splitState`), discount (`discount`), refund (`remboursement`), cash-move (`cash-move`), passation (`passation`), print (`print-bill`), server reassign (`reassign-server`), cash-with-change (`cashRenduVal`), tip, table/à-emporter/attente modes, KDS handoff (Écran cuisine + `kit-history`). Pressing has: deposit (`acompte`, `stepAcompte`), pickup (`retrait`/`pickup`), label generation, ticket validation (`validateTicket`), per-piece handling. Per the spec (§5.7: "audit → fill the **highest-value** gaps, not build every line"), fill the top **two** gaps per vertical below; the remainder are surveyed-and-deferred (listed in §7E — an explicit, logged cap, not silent).

### 7A — Café gap 1: receipt reprint

- [ ] **Step 1: Add the reprint control + handler**

Café can print but has no reprint of the last receipt. In the café markup near the `print-bill` control, add a sibling:

```html
        <button class="rp-foot-btn" data-action="reprint-bill" aria-label="Réimprimer">Réimprimer</button>
```

Register the handler alongside the existing `print-bill` handler (same delegation block). It reprints the last ticket via the hardware bridge:

```javascript
      if (action === 'reprint-bill') {
        if (window.__lastTicket) window.KiwiHardware.print(window.__lastTicket);
        return;
      }
```

(`window.__lastTicket` is set in the `print-bill` handler in Task 6 Step 3.) This makes `reprint-bill` a known action (satisfies `check.js`) and reuses the bridge.

- [ ] **Step 2: Verify reprint**

Preview → café → open a ticket → print, close the preview, then click Réimprimer → `preview_screenshot` shows the receipt preview again. `node tools/check.js` → green (both actions resolve).

### 7B — Café gap 2: QR payment method

- [ ] **Step 3: Add a QR payment tender + handler**

Café tenders are card/cash. Add QR (relevant for Moroccan wallets). Near the card/cash payment buttons, add:

```html
        <button class="pay-btn" data-action="pay-qr" aria-label="Paiement QR">QR</button>
```

Handler (in the same delegation block as the card/cash tenders): reuse the existing success choreography so confetti + `is-success` fire:

```javascript
      if (action === 'pay-qr') {
        var disc = document.querySelector('.reader-disc');
        if (disc) { disc.classList.add('flash', 'is-success'); }
        window.CaisseFx && window.CaisseFx.confetti(disc);
        return;
      }
```

- [ ] **Step 4: Verify QR tender**

Preview → café → open ticket → click QR → success choreography + confetti fire. `node tools/check.js` → green.

### 7C — Pressing gap 1: express option + promised pickup date

- [ ] **Step 5: Add an express toggle that shortens the promised date**

In `assets/pressing-caisse.js`, where the ticket's promised/pickup date is computed, add an express flag. Add a toggle control to the pressing ticket render string:

```javascript
      '<button class="pc-express" data-action="pc-toggle-express">Express (+50%)</button>'
```

Register `pc-toggle-express` in the pressing action handler (add a branch): toggle `state.express`, recompute the promised date (express = +4h; standard = +48h), and re-render. Ensure the pressing JS handles this `data-action` so `check.js` resolves it:

```javascript
      if (action === 'pc-toggle-express') {
        state.express = !state.express;
        var base = new Date();
        state.promisedAt = new Date(base.getTime() + (state.express ? 4 : 48) * 3600 * 1000);
        renderTicket();
        return;
      }
```

- [ ] **Step 6: Verify express**

Preview → pressing (`0000`) → start a ticket → toggle Express → `preview_screenshot` shows the promised date shorten and the express badge active. `node tools/check.js` → green.

### 7D — Pressing gap 2: client phone search on ticket claim

- [ ] **Step 7: Add a phone-search field to claim retrieval**

Pressing retrieves tickets; add a phone lookup. In the claim/retrieval UI render string, add:

```javascript
      '<input class="pc-phone-search" data-action="pc-phone-search" inputmode="tel" placeholder="Téléphone client">'
```

Register `pc-phone-search` — wire it on `input` and register the `data-action` so `check.js` resolves it. Filter the claim rows by phone substring:

```javascript
      document.addEventListener('input', function (e) {
        var el = e.target.closest('[data-action="pc-phone-search"]');
        if (!el) return;
        var q = el.value.replace(/\s/g, '');
        document.querySelectorAll('.pc-claim-row').forEach(function (row) {
          var phone = (row.getAttribute('data-phone') || '').replace(/\s/g, '');
          row.style.display = phone.indexOf(q) !== -1 ? '' : 'none';
        });
      });
```

(Ensure each rendered claim row carries `class="pc-claim-row" data-phone="…"`; add these to the claim-row render string if absent.)

- [ ] **Step 8: Verify phone search**

Preview → pressing → open claim/retrieval → type digits into the phone field → `preview_screenshot` shows the list filter. `node tools/check.js` → green.

### 7E — Log the deferred gaps (no silent cap)

- [ ] **Step 9: Record what was surveyed but deferred**

In the commit body (Step 10), list the deferred café gaps (item modifiers size/extras, line-void/comp, payment-link, loyalty attach, offline **sale-queue** persistence beyond the app-shell cache) and pressing gaps (per-piece tags délicat/au m², explicit deposit→in-process→ready→picked-up status chips, per-piece label reprint). These received the premium surface + install but not a bespoke handler this round.

- [ ] **Step 10: Commit**

```bash
git add kiwi-caisse.html assets/pressing-caisse.js
git commit -F - <<'MSG'
caisse · feature pass — café reprint + QR, pressing express + phone search

Fill the top-2 audited gaps per pilot vertical: café receipt reprint (via
the hardware bridge) and QR tender; pressing express promised-date and
client phone search on claim.

Deferred (surface+install only this round): café item modifiers, line
void/comp, payment-link, loyalty, offline sale queue; pressing per-piece
tags, status chips, per-piece label reprint.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 8: Full verification sweep + deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Static check**

Run: `node tools/check.js`
Expected: `✓ all checks passed`.

- [ ] **Step 2: Cross-viewport smoke of the whole caisse**

Preview → for each of `width:1920,height:1080`, `width:1024,height:768`, `width:390,height:844`: navigate to the caisse, verify the PIN dispatcher renders, enter café PIN → café register renders elevated and reflows (no horizontal scroll: `preview_eval` → expression: `document.documentElement.scrollWidth <= window.innerWidth + 1` → `true`), and enter `0000` → pressing renders elevated at the same viewport. Screenshot each.

- [ ] **Step 3: Install + offline confirmation**

Via `preview_eval`:
- expression: `navigator.serviceWorker.getRegistration('assets/caisse-sw.js').then(r=>!!r)` → `true`.
- expression: `caches.match('/kiwi-caisse.html').then(r=>!!r)` → `true`.
- Manifest parses with the icon (Task 5 Step 7).

- [ ] **Step 4: Deep flow — café + pressing end to end**

- Café: open table T13 → add items → total counts up → each tender (card, cash-with-change, QR) → payment success + confetti → print + reprint.
- Pressing: new ticket → add pieces → toggle express → deposit (`acompte`) → validate → claim retrieval by phone.

Screenshot the key states.

- [ ] **Step 5: Deploy to both remotes**

```bash
node tools/check.js && tools/push-both.sh
```

If `push-both.sh` fails because remote names reshuffled (see `deploy-remotes.md`), push `main` by URL to both repos:
```bash
git push https://github.com/zaka33333-hash/Kiwi.git HEAD:main   # Cloudflare
git push https://github.com/badro99/Kiwi.git HEAD:main          # Pages + partner
```
Confirm the final commit landed: `git log --oneline -1` and both GitHub URLs.

---

## Self-review notes (author)

- **Spec coverage:** §5.1 tokens → Task 1 (+`--spring`). §5.2 skin → Task 1. §5.3 `#fff` sweep → Task 2. §5.4 motion → Task 3. §5.5 PWA shell → Task 5. §5.6 responsive → Task 4. §5.7 feature pass → Task 7. §5.8 hardware → Task 6. §8 verification + §10 sequencing → mapped 1:1 to Tasks 1-8. Deploy → Task 8.
- **Ordering guard** (tokens.css before inline `<style>`, skin after) is called out in the file-structure preamble and enforced by the Task 1 Step 5 assertion that `--paper` still resolves to `#FAFAF8`.
- **check.js constraints** (every `data-action` has a handler; no `background:var(--ink)`) are respected — each new action (`toggle-ticket` in Task 3/4, and `reprint-bill`, `pay-qr`, `pc-toggle-express`, `pc-phone-search` in Task 7) ships with its handler in the same task.
- **Type/name consistency:** `window.CaisseFx.{countTotal,confetti,lens}`, `window.KiwiHardware.{print,openDrawer,scan,readCard,capabilities}`, `window.KiwiLens.{rescan,refresh}`, `window.__lastTicket`, cache name `kiwi-caisse-v1`, ids `#rp-total`/`#rp-peek-total`/`#rp-items` used consistently across tasks.
- **Explicit cap:** Task 7 fills top-2 gaps per vertical and logs the deferred remainder (§7E) in the commit body rather than silently truncating.
