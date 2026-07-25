# Plan de salle — rework brief

> **For the agent picking this up:** everything below was measured against the code on
> 2026-07-25, not inferred. Line numbers are `assets/pages-pro.js` unless stated.
> The feature is ~3 000 lines, lines **2964–5980**, entry point `handlers['nav-tables']`
> at **4022**. Read §1 before touching anything — three of the four "it looks cheap"
> complaints have a single root cause, and fixing it is ~20 lines.

---

## 0. What this feature is today

A drag-and-drop floor-plan editor in the dashboard drawer. Three modes
(`Aménagement` / `Affectation` / `Rotation`), per-zone tabs, a palette of 12 table
types, 5 "structural elements" (wall/door/window/column/plant), 5 templates, and a
hand-drawn SVG backdrop per zone "scene" (`salle`, `terrasse`, `bar`, `etage`,
`prive`).

State lives in `localStorage` under `kiwiPlanDeSalle` (+ a `:slug:` mirror so the
caisse can read the plan — `pdsSave`, 3838). It is **the only integration the
feature has.** Measured: `0` reads of live sales, `0` backend calls, `0` links to
the Réservations feature that ships in the same file, `0` printing.

**So the plan is a drawing that knows nothing.** Table status
(Libre/Occupée/Réservée/À nettoyer) is toggled by hand in the inspector. The KPI
strip counts those hand-set flags. A "Réservée" table carries a free-text note
(`'Famille El Idrissi · 20:00'`, 3869) typed by a human — not a join to the
reservation record that exists 1 200 lines earlier in the same file.

That is the real ceiling on this feature, and §3 is about raising it. But do §1
first, because right now the feature also just doesn't render correctly.

---

## 1. Root causes — fix these first (small, high leverage)

### 1.1 The template picker renders with **zero CSS**  ← this is "the templates are ugly"

`PDS_INLINE_CSS` is injected *inside the drawer body's HTML string*:

```js
// 4063 — pdsRenderBody()
return `
  <style>${PDS_INLINE_CSS}</style>
  <div class="p-kpis pds-kpis">…
```

`case 'open-templates'` (**5215**) then opens a **second drawer** whose body uses
`.pds-tpls` / `.pds-tpl` / `.pds-tpl-h`:

```js
const m = drawer({ title: T.templatesTitle, width: 560, body: `<div class="pds-tpls">…` });
```

Opening it replaces the first drawer's body — **destroying the only copy of the
stylesheet**, along with the floor plan itself. Verified live with the picker open:

```
styleBlocksWithPds: []        ← 25 <style> tags in the document, none contain .pds-*
.pds-tpl computed background: rgba(0, 0, 0, 0)   ← declared var(--paper-soft), = #EFECE3 and defined
.pds-tpl computed border:     0px none            ← declared 1px solid var(--n-200)
document.querySelector('.pds-plan-room') → null   ← the canvas is gone
```

So the "templates" are unstyled `<div>`s: no card fill, no border, no radius, no
padding. Stacked raw text over a semi-transparent drawer with the dashboard bleeding
through. That is the whole visual complaint.

**Fix:** hoist the stylesheet to a document-level singleton, injected once,
idempotent — never inside a body that gets replaced.

```js
function pdsEnsureCss() {
  if (document.getElementById('pds-css')) return;
  const s = document.createElement('style');
  s.id = 'pds-css';
  s.textContent = PDS_INLINE_CSS;
  document.head.appendChild(s);
}
```

Call it at the top of `handlers['nav-tables']`, drop the `<style>` from
`pdsRenderBody`. Audit the rest of `pages-pro.js` for the same pattern — any
`<style>` inside a returned body string is the same bug waiting to happen.

### 1.2 The backdrop is squashed 22.7 %

The scenes are authored `viewBox="0 0 1600 800"` (**2990**) with
`preserveAspectRatio="none"`. The canvas is `PDS_CANVAS_W × PDS_CANVAS_H = 880 × 540`.

```
1600×800 (aspect 2.000) → 880×540 (aspect 1.630)
x ×0.550 · y ×0.675  ⇒  22.7 % anisotropic distortion, circles render as 1.227:1 ellipses
```

Every circle in the `pds-terrazzo` / `pds-zellige` patterns, the plant pot, the
escalier treads — all stretched. This is the "cheap" tell in the backdrop.

**Fix:** one logical coordinate space shared by backdrop *and* tables. Pick a
16:10 logical room (e.g. `1600×1000`), re-author the five scenes to it, drop
`preserveAspectRatio="none"`, and scale the whole stage with a single
`transform: scale(k)` wrapper (or move tables into the SVG). Then a wall the
merchant draws can actually align to a wall in the backdrop — today they live in
different spaces.

### 1.3 Tables are placed on top of the drawn furniture

Because of 1.2 nobody could see where the fixtures actually land. In canvas px:

| fixture (drawn in the `salle` scene) | x | y |
|---|---|---|
| COMPTOIR (south wall) | 44–726 | 486–524 |
| CUISINE (east strip) | 814–877 | 54–392 |
| ESCALIER | 737–809 | 473–526 |
| ENTRÉE (west door) | 0–3 | 256–324 |

Template tables land inside them — **`resto` puts 4 tables on the comptoir**,
`bistro` puts 1 there (chair footprint included; chairs extend ~9 px past the
tabletop via `.pds-tbl-chairs-top{top:-9px}` and `.pds-tbl-chairs-ring{inset:-8px}`).

**Fix:** make fixtures *data*, not decoration — see §2.1. Then placement can
respect them and templates can be authored against them.

### 1.4 Every advertised cover count is wrong

`nCovers` in the KPI strip is computed from real seat data (**4060**), but the
template labels are hardcoded strings. They disagree:

| template | label says | actually seats | delta |
|---|---|---|---|
| Bistro | 30 couverts | **42** | +12 |
| Restaurant | 60 couverts | **98** | +38 |
| Café | 20 couverts | **28** | +8 |
| Brasserie terrasse | 80 couverts | **88** | +8 |

A merchant loads "Restaurant · 60 couverts" and the COUVERTS tile immediately
reads 98. **Fix:** derive the label from the table list at render time so it can
never drift. Delete the hardcoded numbers from `PDS_STR`.

### 1.5 Templates ship nothing but bare tables

Measured across all four: **0 structural elements** (every template sets
`elements: []`), **0 rotated tables** (`mk()` hardcodes `rot: 0`, **3915**),
**0 previews** (`hasThumbnail: false` on all 5 cards). Tightest side-gap is 24 px,
of which ~18 px is chair, leaving ~6 px of "aisle".

The UI invites the merchant to "ajoutez murs, portes et plantes pour visualiser le
restaurant" — and not one template demonstrates it.

### 1.6 The room does not scale with its container

`.pds-plan-room { width: 880px; max-width: 100% }` (**5618**) but tables are
absolutely positioned in fixed px. At a 1440 px viewport the room already measures
**841 px** — 39 px narrower than the coordinate space its contents assume, with
`overflow: hidden` on the room. Anything past x≈841 is silently clipped, and it
gets worse on smaller screens. `brasserie` already reaches x=824.

**Fix:** same as 1.2 — scale transform on a fixed logical space, so the plan
shrinks proportionally instead of cropping.

---

## 2. Make it a real editor

### 2.1 Fixtures become first-class objects

Today: `PDS_EL_TYPES` (**3819**) is 5 colored rectangles described in the UI as
"purement visuels". Promote them to a real model:

```js
{ id, kind: 'wall'|'door'|'window'|'column'|'bar'|'kitchen'|'stairs'|'plant'|'wc'|'pass',
  x, y, w, h, rot, blocking: true|false, label }
```

`blocking: true` → tables can't be dropped on it, and it participates in clearance
checks. This one change makes 1.3, template authoring, and validation all tractable,
and lets you delete the baked-in fixtures from the scene SVGs (keeping the scenes as
pure floor/texture).

### 2.2 Real-world scale, and clearance the merchant can trust

Fix the scale explicitly: **1 logical unit = 1 cm** (a `round4` at 88 units = 88 cm,
which is already about right). Then:

- show a scale bar and the room's m² in the footer;
- on drag, live-measure the gap to the nearest neighbour/fixture;
- warn under **90 cm** between chair backs, error under **70 cm** (circulation
  minimums; the 24 px gaps in today's templates are ~6 cm and physically impossible);
- flag any table whose chair ring overlaps a `blocking` fixture.

This is the single feature that turns a drawing into a tool a restaurateur respects.

### 2.3 Editor affordances that are missing

Measured absent: keyboard nudge (`0` Arrow-key handlers), zoom/pan (`0`), undo/redo
of layout edits, alignment guides, distribute/space-evenly, multi-select rotate,
duplicate. Present already: pointer drag, shift-multi-select, snap (`PDS_GRID = 16`),
double-click-to-rotate on *elements only* (**4961**) — tables have no rotation
affordance at all despite carrying a `rot` field.

Priority order: undo/redo → arrow-key nudge (1 unit, 10 with Shift) → table rotate
handle → zoom/pan → alignment guides.

### 2.4 Templates worth shipping

**Generate the thumbnails, don't draw them.** You already have a renderer — run each
template through a miniature of `pdsRenderTable` into a small inline SVG. Free,
always accurate, never drifts from the data.

**Then fix the catalog itself.** The current five are French-bistro clones
(bistro/resto/café/brasserie/blank) built from `96 + (i%4)*180` grid math. Kiwi ships
POS verticals for boulangerie, pâtisserie, snack, pizzeria, fast-food, food truck,
traiteur, coiffure, spa, hôtel — and the floor plan imagines none of them. Replace
with archetypes that match the actual market:

`café-terrasse` · `snack / comptoir` · `salon de thé — pâtisserie` ·
`restaurant familial` · `pizzeria` · `rooftop / terrasse` · `food truck + terrasse` ·
`salon de coiffure` (stations, not covers) · `plan vierge`

Each must ship walls, a door, the bar/kitchen block, rotations where a real room
would angle tables, and plausible ≥90 cm aisles.

**Better still, go parametric.** Ask three questions — *how many covers? terrace?
bar?* — and generate a plan that satisfies them against the room shape. Then the
catalog is a starting point, not a cage.

---

## 3. Make the plan mean something (the actual prize)

Ranked by value. Everything above is table stakes; this is where the feature stops
being decoration.

1. **Table status from live orders, not hand-toggling.** An open ticket on table 7
   ⇒ table 7 is `occupied`, with elapsed time and running total on the tabletop.
   Wire to `KiwiSales` / Live Link. Today: `0` reads. This is the difference between
   a diagram and a service tool.
2. **Join Réservations.** The Réservations & RDV feature is in this same file
   (**2610**). A reserved table should surface the real booking — name, time, covers,
   phone — not a hand-typed string. Reserved-soon tables should visibly warn.
3. **Turn time + covers per table → real Rotation.** The Rotation tab currently
   computes "fairness" over a **synthetic hardcoded `history` array** (**3893**).
   Feed it actual service data and it becomes a staffing tool instead of a demo.
4. **Cross-device sync.** The caisse mirror is `localStorage` + slug — same browser
   only (the comment at **3840** admits it). Move the plan to D1 alongside
   menus/orders so a plan drawn on the dashboard reaches the till and the serveur app.
5. **Serveur app parity.** A waiter should see the same plan on their phone with
   their section highlighted. `Affectation` already models server→table; it just has
   nowhere to go.

---

## 4. Assets — what's worth outsourcing to GPT, and what isn't

You offered to generate 2D/3D assets. Genuinely useful here, as **flat top-down SVG**
(not raster, so they scale with the room and stay crisp):

- **Furniture, top-down:** chairs, armchairs, banquette runs (straight + corner + curved),
  bar stools, high tables, round/square/rect tabletops in walnut / marble / bistro-tin.
- **Fixtures, top-down:** bar/comptoir block, pass-through, coffee machine, display
  fridge, pastry vitrine, POS station, host stand, WC block, staircase.
- **Moroccan architecture:** seamless zellige tile patterns (as SVG `<pattern>` tiles,
  a few colorways), riad arch openings, mashrabiya screens, wrought-iron terrace
  railings, palm / ficus / cactus top-downs, parasol, awning.
- **Textures:** terrazzo, tadelakt, cement tile, wood decking, gravel terrace.

Spec for whatever you generate: **flat top-down orthographic, no perspective, no cast
shadows baked in, transparent background, single-color-per-shape SVG paths**, sized in
cm to match §2.2, palette limited to the Kiwi tokens (`--atlas #0B6E4F`, `--riad
#053B2C`, `--paper #F7F5F0`, `--ink #0A0F0D`, plus the warm neutrals already in the
scenes: `#FBF7EE`, `#A89770`, `#8B6B47`, `#2C2520`). No mint except as an accent.

**My recommendation: do not go 3D or isometric.** I'd push back on this even though
it's the flashier option:

- it breaks the drag math, hit-testing, and snap logic (all axis-aligned 2D today);
- it makes the caisse/serveur mirror render differently from the dashboard;
- occlusion means tables hide behind each other, so the merchant loses the one thing
  the screen is for — seeing the whole room at a glance;
- and the job to be done is *assign a server, spot the free table, see who's been
  sitting 40 minutes.* Top-down does that better than any 3D view.

A clean flat top-down plan at correct scale, with real furniture silhouettes and real
zellige, will read as more premium than a wobbly 3D room — and it's a fraction of the
work. If you want depth, add it as a subtle drop-shadow + inset-highlight pass on
top-down shapes (the existing `.pds-tbl` box-shadow already gestures at this).

---

## 5. Constraints (non-negotiable)

- **Vanilla HTML/CSS/JS.** No framework, no build step, no bundler — see `CLAUDE.md` §2.
  If you think this needs a canvas/WebGL library, raise it before starting.
- **Brand is locked** (`CLAUDE.md` §3): `--atlas` / `--riad` / `--mint` (≤5 %) /
  `--paper` / `--ink`. No new accent colors. No pure `#fff` backgrounds — use
  `var(--surface)`. **Type is roman, never italic.** No emoji in titles or CTAs.
- **One spring:** `cubic-bezier(0.34, 1.45, 0.5, 1)` · 310 ms, via
  `assets/liquid-lens.js`. Register any new tab/pill group there rather than inventing
  a selection style. Note the mode switcher and zone tabs are exactly this pattern.
- **i18n:** `PDS_STR` has **179 keys × fr/en/ar** — complete today. Any new string
  lands in all three, and Arabic must work in RTL.
- **No demo data for real merchants.** `pdsDefaultState()` (**3854**) hardcodes Café
  Atlas with 24 tables and named staff; it's gated behind `KiwiVenue.isCustom()`, which
  routes custom stores to `pdsTemplate('blank')`. Keep that gate intact — it is the
  reason a real merchant sees an empty floor instead of someone else's restaurant.
- **Don't regress the caisse mirror** (`pdsSave`, **3838**) while moving to D1.

---

## 6. Suggested order of work

| # | Work | Why now |
|---|---|---|
| 1 | Hoist `PDS_INLINE_CSS` to a document singleton (§1.1) | ~20 lines, fixes the visible "ugly" outright |
| 2 | One logical coordinate space + scale transform (§1.2, §1.6) | unblocks everything geometric |
| 3 | Fixtures as data with `blocking` (§2.1) | unblocks templates + validation |
| 4 | Generated thumbnails + derived cover counts (§2.4, §1.4) | picker stops lying and starts showing |
| 5 | Re-author templates: walls, rotations, ≥90 cm aisles (§1.5) | first thing a new merchant touches |
| 6 | Scale bar + clearance warnings (§2.2) | turns it into a tool |
| 7 | Undo/redo, nudge, table rotate, zoom (§2.3) | editor credibility |
| 8 | New Moroccan-market template catalog (§2.4) | market fit |
| 9 | Live order → table status (§3.1) | the actual prize |
| 10 | Reservations join, real rotation data, D1 sync (§3.2–3.5) | the moat |

---

## 7. How to verify (don't trust the screenshot)

The Browser pane collapses to `innerWidth: 0` in this environment, which cascades
every element to ~0 px and looks exactly like a layout bug. **Always
`resize_window` to 1440×900 first and assert `innerWidth` before measuring anything.**
It cost me a false "the room is 3 px wide" finding.

Also: the service worker serves stale CSS/JS locally — unregister it and clear caches
before verifying, or you'll be testing the previous build.

Acceptance checks:

- With the template picker open, `document.querySelectorAll('style')` includes one
  containing `.pds-tpl`, and `.pds-tpl` computes a non-transparent background.
- Opening and closing the picker leaves `.pds-plan-room` in the DOM.
- Backdrop aspect matches canvas aspect (no anisotropic scale): assert
  `scaleX === scaleY` within 0.5 %.
- For every template: `0` tables overlapping a `blocking` fixture, `0` tables
  extending past the room, minimum chair-to-chair gap `≥ 90` units.
- Every template's advertised covers `===` the sum of its tables' seats.
- Room scales without clipping at 1280 / 1024 / 768 viewport widths.
- `fr` / `en` / `ar` key counts stay equal; Arabic renders RTL.
- Nothing computes `font-style: italic` (repo-wide rule).
