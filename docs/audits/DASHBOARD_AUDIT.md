# Dashboard Audit — `dashboard.html`

Combined audit: Codex static code pass + live click-through of every tab and
button in a real browser. Severity: **P1** ship-blocker · **P2** fix before
pitch · **P3** cleanup / nice-to-have.

## Summary

The dashboard is visually strong and the 7 nav drawers all contain real,
distinct content. The problems are **interaction reliability** (drawer
switching, dead buttons) and **dead weight** (a whole retired Simple Mode still
loading). Nothing is architecturally broken; it needs a tightening pass.

---

## P2 — Fix before the pitch

### Interaction bugs

1. **Drawer-to-drawer switching is unreliable.** Clicking a sidebar item while
   another drawer is open often just *closes* the current drawer instead of
   switching to the new one — you have to click a second time. The sidebar
   active-state can also desync from the drawer that's actually visible.
   *Live-confirmed: Transactions open → click Terminaux = drawer closes, nothing
   opens, "Transactions" stays highlighted.* Fix: on nav click, always close any
   open drawer **and** open the requested one in the same handler.

2. **`nav-accueil` closes the wrong backdrop.** `pages-pro.js:41` removes
   `.kiwi-modal-backdrop`, but modals are created as `.kiwi-backdrop`
   (`interactive.js:27`). Open modals are *not* dismissed when "Accueil" is
   clicked. Fix the class name.

3. **Retired Simple Mode is still keyboard-reachable.** `ux.js:225` —
   `Cmd/Ctrl+Shift+M` still toggles Simple Mode even though `simple.js:330`
   locks Pro as the only mode. A stray keypress resurrects retired UI mid-demo.
   Remove the shortcut.

4. **Agent Mode cleanup binds to the wrong drawer.** `features.js:709` grabs the
   first `.kiwi-drawer-backdrop` globally — with two drawers open it can wire
   cleanup to the wrong one. Scope it to the drawer it created.

### Dead / weak buttons

5. **`data-action="export"`** (`dashboard.html:2696`) — no real handler; the
   "Exporter" button just fires a generic success toast. For a demo, at minimum
   it should download a sample CSV.
6. **`data-action="filter-tx"`** (`dashboard.html:2889`) — the live-feed
   "Filtrer" button has no handler; generic toast only.
7. **`data-action="add-integration"`** (`dashboard.html:3109`) — "+ Ajouter une
   intégration" is inert.
8. **Silent handler fallback masks all of the above.** `interactive.js:1365` —
   any unknown `data-action` quietly falls through to a success toast, so broken
   controls *look* like they worked. Make unknown actions a no-op + console
   warn in dev, so dead buttons are visible during QA.

---

## P3 — Cleanup & polish

### Dead / redundant code (safe to delete)

- **Entire Simple Mode stack** (`simple.js:18–330`) loads on every page even
  though init forcibly removes Simple Mode and locks Pro. ~15 KB of dead JS.
- **`polish.js:131–220` `bindLiveFeed()`** — retained but never called;
  superseded by `dateRange.js`.
- **`pages.js:326`** — first-gen sidebar handlers are fully overridden by
  `pages-pro.js`; dead after load order resolves.
- **`features.js:122`** — `step` variable written but never read.

### Interaction polish

- **Drawer fade-in is too slow.** Live-captured twice mid-fade with content
  semi-transparent over the dashboard for a noticeable beat. Shorten the
  entrance transition (~150–200 ms) so drawers feel instant.
- **`stock-reorder`** (`dashboard.html:2997`) — handler exists
  (`pages-pro.js:3240`) but the button omits `data-name`/`data-supplier`, so it
  opens a generic prompt instead of a pre-filled one.
- **`href="#"` links** (`dashboard.html:2873, 2890, 3070, 3084, 3096, 3222` —
  "Voir l'an", "Tout voir", "Activer prompt auto", "Gérer menu", "Paramètres
  équipe", "aide WhatsApp") do nothing. Either wire them or render them as
  non-link text so they don't invite a dead click.

### Code quality

- **Two competing nav listeners** — `pages.js` (`data-nav`) and `interactive.js`
  (`href="#"` fallback) both handle the sidebar; behavior depends on listener
  registration order. Consolidate to one delegated handler.
- **Modal action handlers use global `document.querySelector`**
  (`pages-pro.js:3234`) instead of scoping to the created modal — fragile when
  overlays coexist.
- **Inline-style sprawl** in `dashboard.html` (e.g. `:2997`) spreads styling
  across HTML and CSS with no single control path.

### Missing (note for roadmap, don't build now)

- No supplier / purchase-order history — just a single reorder CTA.
- No margin / COGS / per-product profitability view.
- No screen to actually *configure* integrations — they're listed
  (`dashboard.html:3103`) with nowhere to manage them.

---

## Verified working (no action needed)

- All 7 nav drawers open with distinct, correctly-rendered content:
  Commandes, Parc terminaux, Conformité & sécurité, Équipe, Paie & planning,
  Réservations & RDV, plus Accueil (acts as a reset-to-top, by design).
- `Esc` closes drawers correctly.
- No console errors on load or during navigation.
- Content below the fold is laid out continuously — no empty gap.

## Corrected from the static pass

- Codex flagged `data-action="nav-reservations"` (`dashboard.html:2936`) as the
  "wrong action on a settlement card." **False positive** — live-checked, that
  card is *"Voir le plan de salle · +5 réservations"*. Opening the Reservations
  drawer is the correct behavior. No fix needed.

---

## Suggested fix order

1. Drawer-switching reliability (#1) — most visible during a live demo.
2. Dead buttons #5–8 — wire Export to a real CSV, give Filtrer + Add-integration
   at least an honest "coming soon" state, and kill the silent toast fallback.
3. Backdrop-class bug (#2) + retired Simple Mode shortcut (#3).
4. Delete dead code (P3) in one sweep.
