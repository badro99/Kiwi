
/* ─── nav-tables handler — main entry point ────────────────────────── */
handlers['nav-tables'] = () => {
  pdsEnsureCss();
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: '', type: 'restaurant' };
  /* Avant de lire : récupérer un dessin laissé sous un ancien identifiant. */
  try { pdsCarryForward(); } catch (_) {}
  const state = pdsLoad();
  let dirty = pdsExpireReservations(state);
  /* La rotation programmée s'applique ici aussi : ouvrir la page au début
     d'un service montre déjà les tables du service. */
  if (pdsAutoRotate(state)) dirty = true;
  if (dirty) { try { pdsSave(state); } catch (_) {} }
  /* L'état vivant, pour que la copie serveur qui arrive pendant qu'on dessine
   * repeigne la salle au lieu de se contenter du localStorage. */
  pdsLive = state;
  { const c = pdsCloud(); if (c) c.bind(); }
  pdsIndexBookings(state);

  if (pdsPhoneWanted()) { pdsOpenPhoneAssign(state, v); return; }

  /* A page in the dashboard frame like every 3.0 destination (Inventaire,
     Promotions…): sidebar kept, the room under a real h1, no overlay, no
     close button, no footer bar. Leaving the page is navigating away. */
  const dr = window.Kiwi.appPage('tables', {
    title: T.title,
    subtitle: pdsSubtitle(state, T, v),
    body: `<div class="pds-page" data-pds-body>${pdsRenderBody(state, T)}</div>`,
  });
  if (!dr || !dr.el) return;
  dr.el.classList.add('pds-host');
  pdsSetSubtitle(dr.el, pdsSubtitle(state, T, v));

  pdsAttach(dr.el, state, T, dr);
};

function pdsSubtitle() { return tableDrawing().pdsSubtitle.apply(this, arguments); }

/* Today's bookings onto plan tables. Cheap, recomputed on open and whenever
   Réservations changes (kiwi-reservations-changed). */
function pdsIndexBookings(state) {
  try {
    const doc = window.KiwiReservations && window.KiwiReservations.get ? window.KiwiReservations.get() : null;
    PDS_BOOK = (window.KiwiFloorLive && doc)
      ? window.KiwiFloorLive.bookings(doc, state.tables, Date.now(), pdsBusinessDayStart())
      : { byTable: {}, unplaced: [] };
  } catch (_) { PDS_BOOK = { byTable: {}, unplaced: [] }; }
}

/* Who is on shift right now, from Équipe. null = the team page has no live
   attendance for this store (demo, or not loaded), so we say nothing rather
   than guess. */
function pdsOnShift() { return tableDrawing().pdsOnShift.apply(this, arguments); }

/* ═══ RENDERER ══════════════════════════════════════════════════════ */
function pdsKpis(state, T) {
  const effs = state.tables.map(pdsEff);
  const nTables = state.tables.length;
  const capacity = state.tables.reduce((s, t) => s + pdsGeom(t).seats, 0);
  const free = effs.filter(e => e.status === 'free').length;
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  const seated = effs.reduce((s, e) => s + (e.status !== 'free' && e.status !== 'out' && e.status !== 'reserved' ? (e.covers || 0) : 0), 0);
  const billCents = effs.reduce((s, e) => s + (e.billCents || 0), 0);
  const asked = effs.filter(e => e.status === 'bill').length;
  const duty = pdsOnShift();
  const floorStaff = state.staff.filter(x => x.from === 'team' || !duty);
  const onShift = duty ? state.staff.filter(x => duty[x.id] === 'on-duty').length : null;
  return `
    <div class="kx-kpi-strip pds-kpis" data-pds-kpis>
      <div class="kx-kpi"><div class="l">${T.kpiTables}</div><div class="v">${nTables}</div><div class="d">${pdsEsc(T.kpiTablesD(free, nTables))}</div></div>
      ${live
        ? `<div class="kx-kpi"><div class="l">${T.kpiCoversLive}</div><div class="v">${seated}</div><div class="d">${pdsEsc(T.kpiCoversD(capacity))}</div></div>
           <div class="kx-kpi${asked ? ' warn' : ''}"><div class="l">${T.kpiBills}</div><div class="v">${pdsEsc(T.mad(billCents / 100))}</div><div class="d">${pdsEsc(T.kpiBillsD(asked))}</div></div>`
        : `<div class="kx-kpi"><div class="l">${T.kpiCoversPlan}</div><div class="v">${capacity}</div><div class="d">${pdsEsc(T.kpiCoversPlanD(nTables))}</div></div>
           <div class="kx-kpi"><div class="l">${T.kpiZones}</div><div class="v">${state.zones.length}</div><div class="d">${pdsEsc(state.zones.map(pdsZoneName).slice(0, 2).join(' · '))}${state.zones.length > 2 ? ' …' : ''}</div></div>`}
      <div class="kx-kpi"><div class="l">${T.kpiServers}</div><div class="v">${onShift == null ? state.staff.length : onShift}</div><div class="d">${pdsEsc(T.kpiServersD(onShift, onShift == null ? state.staff.length : floorStaff.length))}</div></div>
    </div>`;
}

/* A till polls its queue every ~6 s; a backgrounded tab can stretch that to a
   minute. Past this, saying "en direct" would be a guess. */
const PDS_TILL_FRESH_MS = 90 * 1000;
function pdsLiveBadge(T) {
  const L = PDS_LIVE;
  let cls = 'is-demo', txt = pdsIsRealStore() ? T.liveNone : T.liveDemo;
  /* `live` only means /api/floor/live answered. "Caisse en direct" is a claim
     about the till, so it needs the till's own heartbeat (order_desk, stamped
     by its authenticated queue poll every few seconds). */
  if (L && L.live && !L.stale) {
    const serverNow = (L.at || Date.now()) + (L.skew || 0);
    const seen = Number(L.tillSeen) || 0;
    if (seen && serverNow - seen < PDS_TILL_FRESH_MS) { cls = 'is-live'; txt = T.liveOn; }
    else if (seen) { cls = 'is-stale'; txt = T.liveTillAway(pdsClock(seen - (L.skew || 0)).replace('h', ':')); }
    else { cls = 'is-demo'; txt = T.liveNoTill; }
  }
  else if (L && L.live && L.stale) { cls = 'is-stale'; txt = T.liveStale(pdsClock(L.at).replace('h', ':')); }
  else if (L && L.reason === 'offline') { cls = 'is-stale'; txt = T.liveOffline; }
  return `<span class="pds-live-badge ${cls}" data-pds-live-badge><i aria-hidden="true"></i>${pdsEsc(txt)}</span>`;
}

function pdsRenderBody() { return tableDrawing().pdsRenderBody.apply(this, arguments); }


/* Selection lives in pdsAttach's closure; the renderer needs to read it to
   draw handles on the selected object. This is the same Set, not a copy —
   pdsAttach assigns it — so there is still exactly one source of truth. */
let PDS_SEL = new Set();

/* Find any object by id across both arrays. Tables and fixtures use disjoint
   id prefixes, so one lookup serves both and the inspector, handles and
   keyboard nudge don't need to know which array they're editing. */
function pdsFind() { return tableDrawing().pdsFind.apply(this, arguments); }
function pdsPlane() { return tableDrawing().pdsPlane.apply(this, arguments); }
/* Plane of the zone currently on screen — the clamp bound for drag and resize.
   PDS_CANVAS_W/H are now only the default room size, not a global. */
function pdsPlaneOf() { return tableDrawing().pdsPlaneOf.apply(this, arguments); }

/* ─── Undo ────────────────────────────────────────────────────────────────
 *   Snapshots of the three mutable arrays. A designer who cannot undo does
 *   not experiment, and an editor nobody experiments in gets used once.
 *   pdsPush is called BEFORE a mutation, by the action that performs it. */
const PDS_UNDO = { stack: [], redo: [] };
function pdsSnap() { return tableDrawing().pdsSnap.apply(this, arguments); }
function pdsApplySnap() { return tableDrawing().pdsApplySnap.apply(this, arguments); }
function pdsPush() { return tableDrawing().pdsPush.apply(this, arguments); }
/* sessionStorage, keyed by the plan's own storage key: per tab, per store.
   A plan that changed underneath (another device, a reset) makes the stored
   history meaningless, so it is only restored when its tip matches the plan
   as loaded — otherwise it is dropped. */
function pdsUndoKey() { return tableDrawing().pdsUndoKey.apply(this, arguments); }
function pdsUndoPersist() {
  const k = pdsUndoKey();
  if (!k || !pdsLive) return;
  try {
    sessionStorage.setItem(k, JSON.stringify({ tip: pdsSnap(pdsLive), stack: PDS_UNDO.stack.slice(-40), redo: PDS_UNDO.redo.slice(-40) }));
  } catch (_) {}
}
function pdsUndoRestore() {
  PDS_UNDO.stack.length = 0;
  PDS_UNDO.redo.length = 0;
  const k = pdsUndoKey();
  if (!k || !pdsLive) return;
  try {
    const d = JSON.parse(sessionStorage.getItem(k) || 'null');
    if (d && d.tip === pdsSnap(pdsLive) && Array.isArray(d.stack)) {
      PDS_UNDO.stack.push(...d.stack.slice(-40));
      PDS_UNDO.redo.push(...(Array.isArray(d.redo) ? d.redo.slice(-40) : []));
    }
  } catch (_) {}
}
function pdsUndo() { return tableDrawing().pdsUndo.apply(this, arguments); }
function pdsRedo() { return tableDrawing().pdsRedo.apply(this, arguments); }

/* First grid position where a w×h object clears everything already placed,
   with an 8-unit breathing gap. Beats the old "centre + n×16 offset", which
   stacked the 7th item straight back onto the 1st. */
function pdsFreeSpot() { return tableDrawing().pdsFreeSpot.apply(this, arguments); }

/* ─── Resize + rotate ─────────────────────────────────────────────────────
 *   Eight edge/corner handles plus a rotation grip, on tables and fixtures
 *   alike. Two things make this correct rather than approximately correct:
 *
 *   1. Screen deltas are divided by the stage scale k (pdsK) and then rotated
 *      into the object's LOCAL frame, so dragging the east handle of a table
 *      turned 30° widens it along its own axis instead of along the screen's.
 *   2. The handle opposite the one being dragged stays put. Because rotation
 *      is about the centre, holding an edge still means moving the centre to
 *      compensate: with A the anchor in local coords and c the local centre,
 *      C1 = C0 + R·((A0 − A1) + (c1 − c0)). Without that term a rotated
 *      object crawls across the floor as you resize it.                    */
/* Free movement that PULLS to a value within `tol`, instead of the hard
   Math.round(v / grid) * grid that made every drag feel notched. */
function pdsMagnet() { return tableDrawing().pdsMagnet.apply(this, arguments); }

/* Repaint ONE cell from state and re-arm its handlers. The old code called
   refresh() on pointerup, which rebuilt the whole drawer body plus both
   rails and reopened the inspector — that rebuild is the hitch you feel at
   the end of every resize. Nothing outside this cell changed, so nothing
   outside it needs to be rebuilt. */
function pdsRepaintCell() { return tableDrawing().pdsRepaintCell.apply(this, arguments); }

/* Push geometry back into the inspector's number fields without rebuilding
   it — never clobbering a field the merchant is currently typing in. */
function pdsSyncInspector() { return tableDrawing().pdsSyncInspector.apply(this, arguments); }

function pdsAttachResize() { return tableDrawing().pdsAttachResize.apply(this, arguments); }

function pdsBindHandles() { return tableDrawing().pdsBindHandles.apply(this, arguments); }

function pdsRenderStage(state, T) {
  if (state.mode === 'rotate') return pdsRenderRotateStage(state, T);
  /* Layout + Assignation share the same canvas; Assignation overlays a roster. */
  const tablesInZone = state.tables.filter(t => t.zone === state.activeZone);
  const elsInZone = state.elements.filter(e => e.zone === state.activeZone);
  const isEmpty = tablesInZone.length === 0 && elsInZone.length === 0;
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const P = pdsPlane(zone);
  /* Fixtures paint under tables, and within fixtures a rug must sit under a
     comptoir. z is explicit so the merchant can reorder. */
  const ordered = elsInZone.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  const noir = pdsNoir();
  return `
    <div class="pds-stage-grid pds-stage-${state.mode}">
      <div class="pds-rail" data-pds-rail>
        ${state.mode === 'layout' ? pdsRenderLayoutRail(state, T) : pdsRenderAssignRail(state, T)}
      </div>
      <div class="pds-canvas-wrap">
        <div class="pds-canvas-bar">
          ${pdsRenderHeatSwitch(T)}
          <div class="pds-bar-tools">
            <span class="pds-zoom" role="group" aria-label="Zoom">
              <button class="pds-tool" data-pds-action="zoom-out" title="${pdsEsc(T.zoomOut)}" aria-label="${pdsEsc(T.zoomOut)}">${pdsIcon('remove')}</button>
              <button class="pds-tool pds-zoom-val" data-pds-action="zoom-fit" title="${pdsEsc(T.zoomFitHint)}">${PDS_ZOOM ? Math.round(PDS_ZOOM * 100) + ' %' : pdsEsc(T.zoomFit)}</button>
              <button class="pds-tool" data-pds-action="zoom-in" title="${pdsEsc(T.zoomIn)}" aria-label="${pdsEsc(T.zoomIn)}">${pdsIcon('add')}</button>
            </span>
            ${state.mode === 'layout' ? `
              <button class="pds-tool" data-pds-action="undo" title="${pdsEsc(T.undo)} (⌘Z)" aria-label="${pdsEsc(T.undo)}"${PDS_UNDO.stack.length ? '' : ' disabled'}>${pdsIcon('undo')}</button>
              <button class="pds-tool" data-pds-action="redo" title="${pdsEsc(T.redo)} (⇧⌘Z)" aria-label="${pdsEsc(T.redo)}"${PDS_UNDO.redo.length ? '' : ' disabled'}>${pdsIcon('redo')}</button>` : ''}
            <button class="pds-tool pds-tool-view" data-pds-action="toggle-view"
                    title="${pdsEsc(noir ? T.viewJour : T.viewNuit)}" aria-label="${pdsEsc(noir ? T.viewJour : T.viewNuit)}">
              ${pdsIcon(noir ? 'light_mode' : 'dark_mode')}
            </button>
            ${state.mode === 'layout' ? `
            <label class="pds-snap" title="${pdsEsc(T.snapHint)}">
              <input type="checkbox" role="switch" data-pds-snap ${state.snap?'checked':''}/>
              <span>${T.snapOn}</span>
            </label>` : ''}
          </div>
        </div>
        <div class="pds-plan-canvas${PDS_ZOOM ? ' is-zoomed' : ''}" data-pds-backdrop
             style="${!noir && pdsRoom(zone).backdrop ? `background:${pdsRoom(zone).backdrop};` : ''}">
          <div class="pds-plan-room" data-pds-room style="${pdsRoomSize(P)} aspect-ratio:${P.w} / ${P.h};">
            <div class="pds-plan-label"${zone && zone.color ? ` style="--zone:${pdsEsc(zone.color)};"` : ''}>${pdsEsc(pdsZoneName(zone))}</div>
            <div class="pds-plan-scale" data-pds-scale
                 style="width:${P.w}px; height:${P.h}px; transform:scale(calc(100cqw / ${P.w}px));">
              <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
                <linearGradient id="pdsNoirBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#101312"/><stop offset="100%" stop-color="#050605"/></linearGradient>
                <radialGradient id="pdsNoirCall"><stop offset="0%" stop-color="#00FFAE" stop-opacity="0.20"/><stop offset="100%" stop-color="#00FFAE" stop-opacity="0"/></radialGradient>
                <filter id="pdsNoirLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/></filter>
                <radialGradient id="pdsJourCall"><stop offset="0%" stop-color="#0B6E4F" stop-opacity="0.16"/><stop offset="100%" stop-color="#0B6E4F" stop-opacity="0"/></radialGradient>
                <radialGradient id="pdsNoirBill"><stop offset="0%" stop-color="#FF7DA9" stop-opacity="0.22"/><stop offset="100%" stop-color="#FF7DA9" stop-opacity="0"/></radialGradient>
                <radialGradient id="pdsJourBill"><stop offset="0%" stop-color="#C2456F" stop-opacity="0.16"/><stop offset="100%" stop-color="#C2456F" stop-opacity="0"/></radialGradient>
                <filter id="pdsJourLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0A0F0D" flood-opacity="0.20"/></filter>
              </defs></svg>
              ${noir ? pdsRoomShellNoir(zone) : pdsRoomShellJour(zone)}
              <div class="pds-canvas" data-pds-canvas style="width:${P.w}px; height:${P.h}px;">
                ${isEmpty ? pdsRenderEmpty(state, T) : ''}
                ${ordered.map(e => pdsRenderElement(e, state, T)).join('')}
                ${pdsRenderGroups(tablesInZone, state, T)}
                ${tablesInZone.map(t => pdsRenderTable(t, state, T)).join('')}
                <div class="pds-marquee" data-pds-marquee hidden></div>
                <div class="pds-bulk" data-pds-bulk hidden></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pds-plan-footer">
          ${pdsRenderLegend(state, T)}
          <span class="pds-plan-meta">
            <span class="pds-plan-floor-count" data-pds-floor-count>${pdsEsc(pdsFloorCount(tablesInZone, T))}</span>
            <span class="pds-plan-dims" title="${state.mode === 'layout' ? pdsEsc(T.kbdHint) : ''}">${P.w} × ${P.h} ${T.unitCm}</span>
          </span>
        </div>
      </div>
      <div class="pds-inspector" data-pds-inspector>
        ${pdsRenderInspectorEmpty(state, T)}
      </div>
    </div>
  `;
}

/* Material Symbols, outlined 400 (assets/icons/material), inlined so the
   toolbar does not wait on eight requests. The paths are the vendored files'
   own `d`, unedited. */
const PDS_ICONS = {
  add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
  remove: 'M200-440v-80h560v80H200Z',
  undo: 'M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z',
  redo: 'M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z',
  light_mode: 'M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-226.5 56.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z',
  dark_mode: 'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z',
  chevron_left: 'M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z',
  chevron_right: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
  print: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
  image: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z',
};
function pdsIcon() { return tableDrawing().pdsIcon.apply(this, arguments); }

/* Zoom. 0 = ajusté : la salle tient en entier, en largeur ET en hauteur —
   c'est ce qui coupait le bas de la salle sur un portable. Au-delà, la
   salle grandit et le cadre défile (molette, trackpad, ou espace + glisser). */
let PDS_ZOOM = 0;
function pdsRoomSize(P) {
  if (!PDS_ZOOM) return `width:min(100%, calc((100dvh - var(--pds-chrome, 330px)) * ${P.w} / ${P.h})); max-width:${P.w * 1.6}px;`;
  return `width:${Math.round(P.w * PDS_ZOOM)}px; max-width:none;`;
}
function pdsFloorCount() { return tableDrawing().pdsFloorCount.apply(this, arguments); }

/* La légende EST le filtre : chaque statut porte son compte et se clique. */
function pdsRenderLegend(state, T) {
  const counts = {};
  state.tables.filter(t => t.zone === state.activeZone).forEach(t => {
    const st = pdsEff(t).status; counts[st] = (counts[st] || 0) + 1;
  });
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  /* Sans caisse, « à commander / addition / réglée » ne sont que du bruit :
     on n'affiche que les statuts qui existent dans cette salle, plus les
     trois de base. */
  const shown = PDS_LEGEND.filter(st => counts[st] || ['free', 'occupied', 'reserved'].includes(st) || (live && st === 'bill'));
  return `<div class="pds-legend" role="group" aria-label="${pdsEsc(T.legendTitle)}">
    ${shown.map(st => `
      <button type="button" class="pds-legend-item${PDS_FILTER.has(st) ? ' on' : ''}" data-pds-filter="${st}" aria-pressed="${PDS_FILTER.has(st)}">
        <span class="pds-legend-swatch pds-sw-${st}"></span>${pdsEsc(pdsStatusLabel(st, T))}<b>${counts[st] || 0}</b>
      </button>`).join('')}
    ${PDS_FILTER.size ? `<button type="button" class="pds-legend-clear" data-pds-filter="">${pdsEsc(T.filterAll)}</button>` : ''}
  </div>`;
}

function pdsRenderHeatSwitch(T) {
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  const opt = (k, l) => `<button type="button" class="pds-heat-opt${PDS_HEAT === k ? ' on' : ''}" data-pds-heat="${k}"${!live && k !== 'status' ? ` disabled title="${pdsEsc(T.heatNeedsLive)}"` : ''}>${pdsEsc(l)}</button>`;
  return `<span class="pds-heat" role="group" aria-label="${pdsEsc(T.heatLabel)}">${opt('status', T.heatStatus)}${opt('revenue', T.heatRevenue)}${opt('turns', T.heatTurns)}</span>`;
}

/* Merchant-authored strings (zone names, fixture labels) reach innerHTML, so
   they get escaped. `${zone.name}` used to interpolate raw. */

function pdsRenderEmpty() { return tableDrawing().pdsRenderEmpty.apply(this, arguments); }

/* Layout rail — table palette + every fixture kind + the room panel.
   The fixture list is generated from PDS_FIX, so adding a kind there makes it
   placeable here with no second edit. */
/* Pick a seat count, then a shape: five buttons instead of twelve tiles
   (« Ronde 2 », « Ronde 4 »…). The seat count picks the size class, so the
   table that lands is the one a merchant would have chosen from the grid. */
let PDS_PAL_SEATS = 4;
const PDS_SHAPES = ['round', 'square', 'rect', 'bar', 'high'];
/* What each palette shape can actually seat. The palette's "Places" stepper
   applied to every shape, so a counter stool (56×56) and a mange-debout came
   out with 4 seats, a square with 8: chairs the till then counted as covers. */
const PDS_SHAPE_MAX_SEATS = { round: 8, square: 4, rect: 10, bar: 1, high: 4 };
function pdsPalSeats(shape) {
  return Math.max(1, Math.min(PDS_PAL_SEATS, PDS_SHAPE_MAX_SEATS[shape] || PDS_PAL_SEATS));
}
function pdsTypeFor() { return tableDrawing().pdsTypeFor.apply(this, arguments); }
/* Table numbers used more than once. The till and the waiter app address a
   table by its number, so two « 4 » send one order to the wrong table. */
/* The key a number is known by. On a real store it is the till's own key
   (functions/api/service/events.js › tableKey), which reads « T4 » and
   « Table 4 » as table 4: a plan holding both « 4 » and « T4 » sends the
   counter's orders for one to both. A demo has no till behind it, so only
   identical numbers count there. */
function pdsNumKey(num) {
  const raw = String(num == null ? '' : num).trim().toLowerCase();
  if (!pdsIsRealStore()) return raw;
  return raw.replace(/^table\s*/, '').replace(/^t(?=\d+$)/, '');
}
function pdsDuplicateNums(state) {
  const groups = {};
  state.tables.forEach(t => {
    const k = pdsNumKey(t.num);
    if (!k) return;
    (groups[k] = groups[k] || new Set()).add(String(t.num));
  });
  const out = [];
  Object.keys(groups).forEach(k => {
    const n = state.tables.filter(t => pdsNumKey(t.num) === k).length;
    if (n > 1) out.push([...groups[k]].join(' = '));
  });
  return out;
}
