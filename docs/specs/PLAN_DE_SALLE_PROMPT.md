# Plan de salle v3 — build brief

> Status: **specification, not yet built.** v2 (object model, per-instance geometry,
> 17 fixtures, caisse mirror) shipped 2026-07-25 at `976cd56`. This document is the
> next round. Sections marked **[+]** are additions I'm proposing, not part of the
> original ask — cut them freely.

---

## 0. Ground truth — what already exists

Verify before building; several complaints below are half-built features that are
broken, not missing ones.

| Capability | State today | Where |
|---|---|---|
| Per-instance `x/y/w/h/rot/color/seats` | works | `floorplan-core.js` · `pdsGeom()` |
| Resize handles on **tables and fixtures** | works (8 handles + rotate) | `pages-pro.js:4263` |
| Live resize preview | works (mutates `cell.style`) | `pages-pro.js:4342` |
| Live **rotation** preview | **broken** — angle is computed, screen never updates | `pages-pro.js:4296-4304` |
| Free-angle rotation | exists but wrongly coupled to the Snap toggle | `pages-pro.js:4302` |
| Rotation via inspector | `<input type=range step="15" max="345">` — can't express 37° | `pages-pro.js:4690` |
| Rotation via double-click | jumps +90° | `pages-pro.js` · `pdsAttachElDrag` |
| Collision / overlap prevention | **absent** on drag and resize | — |
| Overlap avoidance when *placing* | exists | `pdsFreeSpot()` |
| Room floor / walls / finish colour | works, 16 materials | `PDS_MAT`, `pdsRoom()` |
| Per-object colour | works, same 16 materials | `pdsColor()` |
| Free colour picker | absent | — |
| Canvas backdrop colour | absent | — |
| Setup wizard | absent — new venues get a 5-template picker | `open-templates` |
| Template cover counts | **hardcoded and drifting** (30→42, 60→98, 20→28, 80→88) | known bug |
| Caisse mirror | works, shared via `floorplan-core.js` | `kiwi-caisse.html` |
| Units | abstract px throughout | — |

---

## 1. The brief, restated

Three themes, in the order they matter.

**A. Make manipulation feel physical.** Objects shouldn't pass through each other,
resizing should be fluid, rotation should follow the cursor at any angle.

**B. Make everything customizable.** Any object resizable, any surface colourable —
including the floor and the backdrop, not just the furniture.

**C. Stop handing merchants a blank canvas.** A short setup questionnaire produces a
*furnished* plan that matches their real venue, which they then refine.

---

## 2. Requirement A — physical manipulation

### A1. Objects cannot overlap

> "make it impossible to stack tables on top of each other because that's stupid"

Correct, but a blanket rule breaks two legitimate cases: a **tapis** (rug) is meant
to have tables on top of it, and a **banquette** is meant to have tables pushed
against it. So collision is per-class, not global:

| Class | Members | Rule |
|---|---|---|
| `solid` | tables, cuisine, comptoir, caisse, vitrine, WC, escalier, colonne | never overlaps another `solid` |
| `underlay` | tapis, texte, sol/zone paint | anything may sit on top |
| `abutting` | banquette, claustra, mur, garde-corps, fenêtre | `solid` may touch (0 gap) but not penetrate |
| `portal` | porte/entrée | must sit **on** a wall; keeps a clear fan in front |

**The collision body is the object plus its chair band** (`PDS_PAD`), not the
tabletop. Two 4-tops 5px apart don't overlap geometrically, but nobody can sit
between them — so the merchant would see a legal plan that can't be served.

**Feel matters more than the rule.** Do *not* hard-block the drag — a table that
refuses to follow the cursor feels broken. Instead:
1. The table follows the cursor 1:1, always.
2. While it would overlap, its silhouette goes red and the blocker gets a red outline.
3. On release it settles into the nearest legal position (search outward in a spiral
   from the drop point) with the standard spring.
4. If no legal position exists within ~200 units, it returns to origin and toasts why.

Same rule on resize: a fixture may not grow through a table. Clamp the growing edge
at the blocker.

### A2. Fluid resizing

Everything below is polish on a working feature.

- **rAF-throttle** `pointermove` → one style write per frame, not one per event.
- **No full re-render on release.** Today `refresh()` + `_openInspector()` fire on
  pointerup and you see the hitch. Patch the DOM and update the inspector fields
  in place.
- **Soft snapping.** Replace hard `Math.round(w / 16) * 16` with magnetic snapping:
  free movement, but pull to the grid (and to neighbours' edges) within ~6px.
  The current behaviour is why resizing feels notchy.
- **Modifiers:** `Shift` = lock aspect ratio · `Alt` = resize from centre.
- **Bigger hit targets.** Handles are 11px — fine for a mouse, unusable on a tablet.
  Keep the 11px visual, give it a 24px transparent hit pad.
- **Live readout** next to the cursor: `180 × 90 cm · 6 couverts`, updating as it
  changes — the seat count already recomputes, the merchant just can't see it.

### A3. Rotation

> "When I rotate the table, I want to see it rotate with me live. And I can rotate
> it in any way, not just 8 or 9 degrees"

- **Fix the live preview** — the `dir === 'rot'` branch returns before the block that
  writes `cell.style.transform`. Write the transform, then return.
- **Free angle is the default.** Decouple from the Snap toggle: any integer 0–359.
  Hold `Shift` to snap to 15°.
- **[+] Magnetic angles.** Within 3° of 0/90/180/270, or of a nearby wall's angle,
  pull to it. This is what makes free rotation usable rather than fiddly — you can
  still get a table exactly square without aiming.
- **Angle badge** follows the handle: `37°`.
- **Inspector:** numeric input accepting 0–359, plus a free-drag dial. Kill the
  `step="15"` slider.
- **Keep** double-click = +90° as a shortcut, but make it animate rather than jump.

---

## 3. Requirement B — total customization

### B1. Resize anything

Already true in code — verify each of the 17 fixture kinds has sane `minW`/`minH`
and that its drawing survives extreme aspect ratios (a 900×40 comptoir, a 60×400
banquette). Fixtures that must stay square (colonne, plante) should lock ratio by
default with an unlock toggle, not be un-resizable.

### B2. Colour anything

> "make it possible for me to color anything Like the background, the floor, anything"

- **Every object**: fill + edge.
- **The room**: floor, walls, finish (exists) — plus **the backdrop outside the room**,
  which is currently un-themeable.
- **Free colour picker** alongside the 16 materials. Constrain chosen colours to a
  luminance band so `pdsInk()` can always find readable label ink — `pdsLum()` already
  computes this; reject or auto-correct anything that would fail contrast.
- **[+] Ambiances — one-click whole-plan palettes.** This is the real answer to
  "looks prettier to the client". Forty individual colour decisions produce an ugly
  plan; four curated ones produce a beautiful one. Ship: **Riad** (terracotta/zellige/
  brass), **Bord de mer** (bone/sage/oak), **Néo-bistrot** (walnut/ink/brass),
  **Jardin** (sage/stone/plants). Each sets floor, walls, table material and chair
  tone coherently. Merchant can then override any single object.
- **[+] Per-zone palettes** — the terrace should be allowed to look different from
  the salle.

All colours stay inside `PDS_MAT` / brand tokens. No new accent hues (CLAUDE.md §3).

---

## 4. Requirement C — the setup wizard

> "the moment you wanna set up your salle I want a few questions to appear […] it
> already should give you a plan that you can customize later on, not just give you a
> virgin plan that you have to do everything on"

Replaces the empty state **and** the 5 hardcoded templates.

### C1. Questions

| # | Question | Type | Effect |
|---|---|---|---|
| 1 | Type d'établissement | café · restaurant · snack · pâtisserie · rooftop | sets furniture defaults & table mix |
| 2 | Combien d'étages ? | 1–4, each nameable (RDC, 1ᵉʳ, sous-sol) | one zone per floor |
| 3 | Vous avez… | checkboxes: terrasse · patio · mezzanine · salon privé · bar · comptoir à emporter | **each checked box creates its own zone** |
| 4 | Dimensions (per zone) | largeur × profondeur in **meters**, or total m² | room size |
| 5 | Combien de tables ? | number + mix slider (2p / 4p / 6p+) — or "combien de couverts ?" and solve for it | how many to place |
| 6 | La cuisine est de quel côté ? | N/S/E/W wall picker | fixture placement |
| 7 | L'entrée est de quel côté ? | N/S/E/W wall picker | entrance placement |
| 8 | Aussi présent : | WC · bar · vestiaire · escalier | extra fixtures |

Eight questions is the ceiling. Anything more and merchants abandon. Every one must
change the output — no cosmetic questions.

### C2. **[+] Real-world units — prerequisite**

Question 4 asks for meters, which the current abstract-pixel model can't represent.
**Define 1 logical unit = 1 cm.** Then a 12×8 m room is 1200×800, a 4-top is 80×80,
a service aisle is literally 90. This is required by the wizard, and it makes every
downstream feature meaningful: dimensions read in cm, clearance checks are code-real,
and `couverts/m²` becomes a number the merchant recognises. Migrate v2 plans with a
scale factor and bump `state.v` to 3.

### C3. Generate a real plan, not a template

**[+] This should be a small constraint solver, not a lookup table** — that's what
makes the output match *their* venue instead of a stock photo of a restaurant:

1. Place fixed architecture first: walls, entrance on the chosen wall, kitchen against
   its wall, WC in a corner.
2. Reserve circulation: a clear spine from the entrance, and a service path from the
   kitchen pass reaching every table.
3. Lay tables on a lattice sized to the requested mix, honouring **≥90 cm service
   aisles and ≥120 cm main circulation**.
4. Line the long wall with banquettes if the venue type suggests it.
5. Drop the decorative layer last (plants, rugs) into leftover space only.
6. Derive covers **by summing the placed tables** — never a stored number.

**[+] Offer three candidates side by side**, from the same answers: **Dense**
(max covers), **Confort** (generous aisles), **Banquettes** (perimeter seating).
Each labelled with its real numbers — `48 couverts · 1,6 m²/couvert · service 11 m max`.
Merchants choose confidently between three concrete plans; they cannot choose from an
abstract description. Plus a "Régénérer" for a different arrangement at the same
settings.

Then → **Personnaliser** drops straight into the editor with everything selectable.

### C4. This kills the template bug

The 5 hardcoded templates whose advertised cover counts drift from what they load
(30→42, 60→98, 20→28, 80→88) get **deleted**, not patched. Generated plans count
their own tables, so the class of bug disappears. Thumbnails render from the
generated data.

---

## 5. **[+]** Additional ideas, ranked by value

**Tier 1 — biggest gain per unit of work**

1. **Alignment guides + equal-gap indicators.** Magenta lines when an edge or centre
   lines up with a neighbour; badges when gaps are equal. This one feature is most of
   why professional editors feel good, and it's what turns a merchant's ugly layout
   into a tidy one without them knowing why.
2. **Multi-select → align & distribute.** Marquee-select a row of tables, align tops,
   distribute horizontally. Ten seconds to fix a crooked row that takes five minutes
   by hand.
3. **Keyboard control.** Arrows nudge 1 cm · `Shift`+arrows 10 cm · `⌘D` duplicate ·
   `⌘Z`/`⌘⇧Z` · `Delete` · `Esc` deselect · `R` rotate. Precision work is impossible
   with a mouse alone.
4. **Clearance validation.** Live badge: *"3 tables inaccessibles — passage < 90 cm"*,
   with the offending gaps highlighted. Sells the product: it tells the merchant
   something about their own restaurant they didn't know.
5. **Zoom & pan.** Currently fit-to-width only, so a 20 m room is unworkable.

**Tier 2 — real value, more work**

6. **Alt+drag to duplicate**, and "repeat N times along an axis" for table rows.
7. **Auto-numbering** by reading order, or `T1…T12` / `TER1…TER6` per zone. Manual
   numbering of 40 tables is the most tedious part of setup.
8. **Export PNG/PDF** of the plan + a per-table QR sheet. Merchants want it printed
   and on the wall.
9. **Plan versions** — "plan été" with the terrace, "plan hiver" without. Moroccan
   terraces close; today they'd have to rebuild the plan twice a year.
10. **Tablet editing.** Merchants design standing in the room. Touch targets ≥ 24 px,
    pinch-zoom, two-finger pan.

**Tier 3 — later, differentiating**

11. **Revenue heatmap** — colour tables by real takings from `KiwiSales`. *"Table 7
    earns 3× table 12."* No competitor at this price point does this, and it's a
    natural Kiwi Ultra hook.
12. **Accessibility check** — flag at least one wheelchair route and one table with
    90 cm clearance.
13. **Mirror plan** horizontally, for mirror-image premises.

---

## 6. Non-negotiables

- **The caisse and serveur must mirror everything.** All drawing stays in
  `assets/floorplan-core.js` — one catalogue, one set of primitives, both consumers.
  Wizard zones must appear as caisse zone tabs. Never re-introduce a private
  per-page table map (that's how the 10-top showed "4p").
- **Brand locked.** `--atlas` `--riad` `--mint` ≤5% `--paper` `--ink`. No new accents,
  no bold display weights, no emoji in titles or CTAs.
- **Type is roman. Never italic.** (CLAUDE.md §3)
- **One spring:** `cubic-bezier(0.34, 1.45, 0.5, 1)` · 310 ms.
- **Match the surface you're editing.** `plan-de-salle` ships as build-free
  HTML/CSS/JS; stay consistent with it here. The stack is not locked project-wide
  (CLAUDE.md §2) — but this rework is not the place to introduce a build step.
- **i18n fr/en/ar** for every new string, RTL included.
- **Cover counts are always derived**, never stored.
- **Migration:** existing merchant plans must survive (v2 → v3 with the cm scale).

---

## 7. Acceptance tests

Each must be demonstrated live, not asserted.

1. Drag a table onto another → it follows the cursor, goes red, settles adjacent on
   release. Never lands on top.
2. Drag a table onto a **tapis** → it sits on the rug. Push one against a
   **banquette** → they touch, no gap, no rejection.
3. Grow the cuisine into a table → the growing edge stops at the table.
4. Rotate a table by handle → **it turns under the cursor, every frame**, at 37°.
5. `Shift`+rotate → snaps to 15°. Near 90°, it pulls to exactly 90°.
6. Inspector accepts a typed `37` and the table matches.
7. Resize a table → no hitch on release, dimensions read in cm, seat count updates live.
8. Recolour the floor, a wall, one table, and the backdrop — four independent changes.
9. Apply the **Riad** ambiance → the whole plan recolours coherently in one click.
10. Run the wizard: 2 floors + terrace + 24 tables + kitchen north + entrance west →
    three candidate plans, each furnished, each with aisles ≥ 90 cm and a labelled
    cover count that **equals the sum of its tables**.
11. Open the caisse → the generated plan is there, correct zones, correct covers.
12. Reload → everything persists. Undo → steps back through it all.
13. Verified at 1440×900, 1680×1150, and on a tablet viewport.
