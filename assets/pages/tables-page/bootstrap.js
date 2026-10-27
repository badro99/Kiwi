/* Owner: restaurant table workflow. Exposes nav-tables; needs Kiwi, floorplan core/live, table data and drawing factory. Loaded at first table open. */
/* ═══ Section 2 rest A · tables / menu ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
  /* Locale helper — every i18n lookup in this IIFE reads through trLang(). */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2a — restaurant vertical handlers
 * Replaces (or supplements) the existing `nav-tables` and `nav-menu`
 * handlers in /Users/badrosonair/Documents/kiwi/assets/pages.js.
 *
 * APPLY:
 *   1. Append the contents of /tmp/kiwi-s2-rest-css.css to the CSS template
 *      literal at the top of pages.js (just before `</style>`).
 *   2. Replace the bodies of `handlers['nav-tables']` and `handlers['nav-menu']`
 *      in pages.js with the bodies below. Auxiliary handlers
 *      (`tables-merge`, `tables-split`, `tables-move`, `tables-new`,
 *      `menu-add`, `menu-86`, `menu-edit`, `menu-mass`, `menu-schedule`)
 *      can sit alongside in the same `handlers = { ... }` block.
 *
 * DEPENDENCIES (already on window.Kiwi):
 *   toast, modal, drawer, handlers, confetti
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── helper: wire `data-dismiss` buttons on a modal/drawer to close ─── */
function wireDismiss(m) {
  if (!m || !m.el) return;
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) m.close();
  });
}


let data;
function tableData() { return data || (data = window.__kiwiPagesTables.createData({ PDS_CANVAS_W, PDS_CANVAS_H })); }


let operations;
function tableOperations() { return operations || (operations = window.__kiwiPagesTables.operations({ Kiwi, PDS_FOLD, PDS_GRID, PDS_MAX_TABLE_SERVERS, PDS_MAX_VERSIONS, PDS_SERVICE_STATUSES, handlers, pdsApplyAssignment, pdsApplyVersion, pdsBusinessDayStart, pdsClearReservation, pdsClock, pdsDefaultState, pdsDuplicateNums, pdsFind, pdsFixLabel, pdsFreeSpot, pdsHandleAction, pdsHasServer, pdsHomeZones, pdsIcon, pdsInitials, pdsK, pdsManualStatuses, pdsNewZoneId, pdsNextNum, pdsNoir, pdsNoirFixture, pdsNormalize, pdsNumKey, pdsOnShift, pdsPalSeats, pdsPeriodLabel, pdsPlane, pdsPlaneOf, pdsPush, pdsReadingOrder, pdsRecordRotation, pdsRedo, pdsRenderStatusRow, pdsRestoreTableSnapshot, pdsRotationPreview, pdsSave, pdsServerIds, pdsSetNoir, pdsSetServerIds, pdsSetStatus, pdsStaffColor, pdsStatusLabel, pdsSweepGroups, pdsTableNum, pdsTableSnapshot, pdsTablesInOrder, pdsTodayKey, pdsTypeFor, pdsUndo, pdsVersions, pdsZoneName, pdsZoomBy, toast, trLang, wireDismiss })); }

let drawing;
function tableDrawing() {
  return drawing || (drawing = window.__kiwiPagesTables.drawing({
    get Kiwi() { return Kiwi; },
    get trLang() { return trLang; },
    get PDS_CANVAS_H() { return PDS_CANVAS_H; },
    get PDS_CANVAS_W() { return PDS_CANVAS_W; },
    get PDS_DEFAULT_STAFF() { return PDS_DEFAULT_STAFF; },
    get PDS_EL_RENAME() { return PDS_EL_RENAME; },
    get PDS_GRID() { return PDS_GRID; },
    get PDS_ICONS() { return PDS_ICONS; },
    get PDS_INLINE_CSS() { return PDS_INLINE_CSS; },
    get PDS_LS_KEY() { return PDS_LS_KEY; },
    get PDS_MAX_TABLE_SERVERS() { return PDS_MAX_TABLE_SERVERS; },
    get PDS_SCENE_MIGRATION() { return PDS_SCENE_MIGRATION; },
    get PDS_SEED_ZONES() { return PDS_SEED_ZONES; },
    get PDS_SERVICE_STATUSES() { return PDS_SERVICE_STATUSES; },
    get PDS_STAFF_COLORS() { return PDS_STAFF_COLORS; },
    get PDS_TRANSIENT_IDS() { return PDS_TRANSIENT_IDS; },
    get PDS_UNDO() { return PDS_UNDO; },
    get pdsAttachDrag() { return pdsAttachDrag; },
    get pdsAttachElDrag() { return pdsAttachElDrag; },
    get pdsCloud() { return pdsCloud; },
    get pdsEff() { return pdsEff; },
    get pdsK() { return pdsK; },
    get pdsKpis() { return pdsKpis; },
    get pdsLiveBadge() { return pdsLiveBadge; },
    get pdsPhoneLive() { return pdsPhoneLive; },
    get pdsRenderActions() { return pdsRenderActions; },
    get pdsRenderElement() { return pdsRenderElement; },
    get pdsRenderStage() { return pdsRenderStage; },
    get pdsRenderTable() { return pdsRenderTable; },
  }));
}
