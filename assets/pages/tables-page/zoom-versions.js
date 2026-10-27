
/* The fitted room is as tall as the window allows: the drawer's own head and
   foot plus the canvas bars are measured, not guessed, so the whole room is
   on screen without scrolling the page. */
function pdsMeasureChrome(root) {
  const h = (sel) => { const n = root.querySelector(sel); return n ? n.getBoundingClientRect().height : 0; };
  /* In the dashboard frame the page scrolls under the top bar: the room fits
     between that bar and the window's foot once the KPIs have scrolled by. */
  const bar = document.querySelector('.topbar, .main > header, .dash-topbar');
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 64;
  const chrome = top + h('.pds-canvas-bar') + h('.pds-plan-footer') + 48;
  root.style.setProperty('--pds-chrome', Math.round(chrome) + 'px');
  root.style.setProperty('--pds-top', Math.round(top) + 'px');
}
function pdsZoomBy(root, state, factor) {
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const P = pdsPlane(zone);
  const room = root.querySelector('[data-pds-room]');
  const cur = PDS_ZOOM || ((room ? room.getBoundingClientRect().width : P.w) / P.w);
  PDS_ZOOM = Math.max(0.3, Math.min(3, Math.round(cur * factor * 100) / 100));
}
let PDS_CLIP = null;

/* ═══ STAGE SCALE ═══════════════════════════════════════════════════
 * The stage is authored once in logical units (${PDS_CANVAS_W}×${PDS_CANVAS_H},
 * 1 unit = 1 cm) and CSS scales it to fit the room (see .pds-plan-scale, which
 * derives the ratio from 100cqw). Everything downstream — drag deltas,
 * snapping, clamping — works in logical units and divides screen pixels by k,
 * so the maths never has to know how wide the window is.
 *
 * k is always MEASURED from the live box, never cached and never written by JS.
 * An earlier version set a --pds-k custom property from a ResizeObserver; at
 * 1024px the room was 712px while the property still read 0.968, and five
 * tables rendered outside the room. One source of truth only. */
function pdsK(root) {
  const scale = root && root.querySelector('[data-pds-scale]');
  if (!scale) return 1;
  /* Measured against the scale box's OWN layout width (the room's width in
     logical units), not PDS_CANVAS_W: a room the merchant resized to 1200 cm
     used to drag at 880/1200 of the cursor speed and land off target. */
  const k = scale.getBoundingClientRect().width / (scale.offsetWidth || PDS_CANVAS_W);
  return (isFinite(k) && k > 0.05) ? k : 1;
}

/* ═══ DRAG SYSTEM (pointer events, CSS transforms) ══════════════════ */
function pdsAttachDrag() { return tableOperations().pdsAttachDrag.apply(this, arguments); }

function pdsAttachElDrag() { return tableOperations().pdsAttachElDrag.apply(this, arguments); }

/* Server chip drag — drop on a table or a zone tab */
function pdsAttachChipDrag() { return tableOperations().pdsAttachChipDrag.apply(this, arguments); }

/* ─── Helpers behind the actions ──────────────────────────────────────── */
function pdsNewZoneId(state) {
  let id;
  do { id = 'z' + Math.random().toString(36).slice(2, 8); } while (state.zones.some(z => z.id === id));
  return id;
}
/* The next number nobody uses yet: highest numeric + 1, skipping taken ones. */
function pdsNextNum(state) {
  const used = new Set(state.tables.map(t => String(t.num).trim().toLowerCase()));
  let n = state.tables.reduce((m, t) => Math.max(m, parseInt(t.num, 10) || 0), 0) + 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}
/* Reading order inside a zone: rows (tables whose tops are within 40 cm
   of each other share a row), then left to right. */
function pdsReadingOrder(tables) {
  const sorted = tables.slice().sort((a, b) => a.y - b.y);
  const rows = [];
  sorted.forEach(t => {
    const row = rows.find(r => Math.abs(r.y - t.y) < 40);
    if (row) row.items.push(t); else rows.push({ y: t.y, items: [t] });
  });
  return rows.flatMap(r => r.items.sort((a, b) => a.x - b.x));
}
function pdsRenumber() { return tableOperations().pdsRenumber.apply(this, arguments); }

/* ─── Versions ────────────────────────────────────────────────────────────
 *   Named layouts kept inside the plan document, so they travel with it to
 *   every device. Five at most (the document caps at 400 KB). A deleted
 *   version is buried like a deleted table, so another device's copy cannot
 *   bring it back. */
const PDS_MAX_VERSIONS = 5;
function pdsVersions(state) {
  const gone = state.gone || {};
  return (Array.isArray(state.versions) ? state.versions : []).filter(v => v && v.id && !gone[v.id]);
}
function pdsSaveVersion() { return tableOperations().pdsSaveVersion.apply(this, arguments); }
function pdsApplyVersion(state, v, T) {
  pdsSaveVersion(state, T.versionBefore(v.name));
  const now = new Set(state.tables.map(t => t.id).concat(state.elements.map(e => e.id)));
  const incoming = JSON.parse(JSON.stringify({ zones: v.zones, tables: v.tables, elements: v.elements || [] }));
  const keep = new Set(incoming.tables.map(t => t.id).concat(incoming.elements.map(e => e.id)));
  if (typeof pdsBury === 'function') pdsBury(state, [...now].filter(id => !keep.has(id)));
  if (typeof pdsUnbury === 'function') pdsUnbury(state, [...keep]);
  state.zones = incoming.zones; state.tables = incoming.tables; state.elements = incoming.elements;
  if (!state.zones.some(z => z.id === state.activeZone)) state.activeZone = state.zones[0] && state.zones[0].id;
  pdsSyncStaff(state);
}
function pdsOpenVersions() { return tableOperations().pdsOpenVersions.apply(this, arguments); }

/* A booking without a table gets one: the table resource the floor-plan
   template uses (`tpl-floor-<id>`), created if Réservations does not have
   it yet. Goes through KiwiReservations.set, so the booking page, the public
   link and every device see the same placement. */
function pdsPlaceBooking() { return tableOperations().pdsPlaceBooking.apply(this, arguments); }

/* ─── Export ──────────────────────────────────────────────────────────────
 *   The old « Plan exporté · PDF A3 » toast exported nothing. Both formats
 *   are drawn from the plan itself (no screenshot of the editor, no
 *   selection handles): one vector drawing per zone, with table numbers,
 *   covers and the servers' initials. */
function pdsExportSvg() { return tableOperations().pdsExportSvg.apply(this, arguments); }
function pdsExportPrint() { return tableOperations().pdsExportPrint.apply(this, arguments); }
function pdsExportPng() { return tableOperations().pdsExportPng.apply(this, arguments); }

/* ═══ ACTION HANDLERS ═════════════════════════════════════════════════ */
function pdsHandleAction(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);

  switch (action) {
    case 'toggle-view': { tableOperations().tableAction26(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'reset': { tableOperations().tableAction27(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'export': { tableOperations().tableAction28(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'versions': { tableOperations().tableAction29(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'place-booking': {
      const id = btn.getAttribute('data-pds-booking');
      const b = (PDS_BOOK.unplaced || []).find(x => x.id === id);
      if (!b || !window.KiwiReservations || !window.KiwiFloorLive) break;
      const t = window.KiwiFloorLive.suggestTable(b, state.tables, (tt) => pdsEff(tt).status, PDS_BOOK);
      if (!t) { toast(T.liveNoFit, { type: 'warn' }); break; }
      if (pdsPlaceBooking(state, b, t)) {
        pdsIndexBookings(state);
        refresh();
        toast(T.livePlaced(b.name, pdsTableNum(t)), { type: 'success' });
      }
      break;
    }
    case 'zoom-in':
    case 'zoom-out': { tableOperations().tableAction30(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zoom-fit': {
      PDS_ZOOM = 0;
      refresh();
      break;
    }
    case 'pal-seats': {
      PDS_PAL_SEATS = Math.max(1, Math.min(10, PDS_PAL_SEATS + (+btn.getAttribute('data-pds-delta') || 0)));
      /* Repaint the rail alone: the stepper must not rebuild the room. */
      const rail = root.querySelector('[data-pds-rail]');
      if (rail) rail.innerHTML = pdsRenderLayoutRail(state, T);
      if (state._rebind) state._rebind();
      break;
    }
    case 'add-shape': { tableOperations().tableAction31(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-move': { tableOperations().tableAction32(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-color': { tableOperations().tableAction33(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-duplicate': { tableOperations().tableAction34(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'renumber': { tableOperations().tableAction35(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-zone': { tableOperations().tableAction36(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rename-zone': { tableOperations().tableAction37(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'delete-zone': { tableOperations().tableAction38(action, btn, state, T, root, dr, refresh, selection); break; }
    /* ─── Setup wizard ───────────────────────────────────────────────────
       Replaces the five hard-coded templates. Eight questions, then three
       furnished candidates built from the answers — each labelled with the
       numbers it actually produced, so the count on the card and the count
       on the floor cannot drift apart the way the templates' could. */
    /* « Scanner ma salle » — la photo remplace le questionnaire, pas le
     * générateur. Le modèle vision extrait les FAITS (combien de tables,
     * quelles formes, terrasse, type d'établissement), on pré-remplit les
     * réponses du magicien avec, et c'est pdsGeneratePlan qui dessine — allées
     * garanties, zéro coordonnée inventée. Le commerçant relit les réponses,
     * ajuste, puis compare les trois plans comme d'habitude. */
    case 'scan-salle': { tableOperations().tableAction39(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'open-templates':
    case 'open-wizard': { tableOperations().tableAction40(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-table':
    case 'add-table-default': { tableOperations().tableAction41(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-el': { tableOperations().tableAction42(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'clear-assign': { tableOperations().tableAction43(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-server': { tableOperations().tableAction44(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'del-server': { tableOperations().tableAction45(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rotate-configure': { tableOperations().tableAction46(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rotate-now': { tableOperations().tableAction47(action, btn, state, T, root, dr, refresh, selection); break; }
    /* ── Inspector actions ─────────────────────────────────────── */
    /* ── Object actions ────────────────────────────────────────────
     * These used to be table-only. They now resolve through pdsFind, so the
     * same buttons rotate, duplicate, lock and delete a comptoir or a kitchen
     * — the operations the merchant could not previously perform on anything
     * that came out of a scene. The action names keep their `table-` prefix
     * because the inspector markup and the keyboard bindings both reference
     * them; renaming would be churn for no behaviour change. */
    case 'table-rotate':
    case 'rot-90': { tableOperations().tableAction48(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'ambiance': { tableOperations().tableAction49(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-duplicate': { tableOperations().tableAction50(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-delete': { tableOperations().tableAction51(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-group': { tableOperations().tableAction52(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-ungroup': { tableOperations().tableAction53(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'obj-lock': { tableOperations().tableAction54(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'seats-up':
    case 'seats-down': { tableOperations().tableAction55(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'layer-back':
    case 'layer-front': { tableOperations().tableAction56(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'undo': { tableOperations().tableAction57(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'redo': { tableOperations().tableAction58(action, btn, state, T, root, dr, refresh, selection); break; }
    /* ── Bulk actions ──────────────────────────────────────────── */
    case 'bulk-align-h': { tableOperations().tableAction59(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-align-v': { tableOperations().tableAction60(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-dist-h': { tableOperations().tableAction61(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-dist-v': { tableOperations().tableAction62(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-delete': { tableOperations().tableAction63(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-group': { tableOperations().tableAction64(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-clear': { tableOperations().tableAction65(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-status': { tableOperations().tableAction66(action, btn, state, T, root, dr, refresh, selection); break; }
    /* 'set-scene' retired with PDS_SCENES — the room is four editable
       properties now, wired through [data-pds-room-field]. */
    case 'deselect': { tableOperations().tableAction67(action, btn, state, T, root, dr, refresh, selection); break; }
    default: { tableOperations().tableAction68(action, btn, state, T, root, dr, refresh, selection); break; }
  }
}

/* ═══ INLINE CSS · scoped to .pds-* ══════════════════════════════════ */
const PDS_INLINE_CSS = tableData().PDS_INLINE_CSS;


})();
