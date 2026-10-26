/* Owner: table rendering, drag operations and drawer actions. Exposes a private factory; requires immutable owner bindings and callable live-state helpers. Loaded with Tables on first open. */
window.__kiwiPagesTables.operations = (scope) => {
'use strict';
const { Kiwi, PDS_FOLD, PDS_GRID, PDS_MAX_TABLE_SERVERS, PDS_MAX_VERSIONS, PDS_SERVICE_STATUSES, handlers, pdsApplyAssignment, pdsApplyVersion, pdsBusinessDayStart, pdsClearReservation, pdsClock, pdsDefaultState, pdsDuplicateNums, pdsFind, pdsFixLabel, pdsFreeSpot, pdsHandleAction, pdsHasServer, pdsHomeZones, pdsIcon, pdsInitials, pdsK, pdsManualStatuses, pdsNewZoneId, pdsNextNum, pdsNoir, pdsNoirFixture, pdsNormalize, pdsNumKey, pdsOnShift, pdsPalSeats, pdsPeriodLabel, pdsPlane, pdsPlaneOf, pdsPush, pdsReadingOrder, pdsRecordRotation, pdsRedo, pdsRenderStatusRow, pdsRestoreTableSnapshot, pdsRotationPreview, pdsSave, pdsServerIds, pdsSetNoir, pdsSetServerIds, pdsSetStatus, pdsStaffColor, pdsStatusLabel, pdsSweepGroups, pdsTableNum, pdsTableSnapshot, pdsTablesInOrder, pdsTodayKey, pdsTypeFor, pdsUndo, pdsVersions, pdsZoneName, pdsZoomBy, toast, trLang, wireDismiss } = scope;
function pdsFixMini(kind, K) {
  const box = 26;
  const ar = K.w / K.h;
  const w = ar >= 1 ? box : Math.max(6, box * ar);
  const h = ar >= 1 ? Math.max(6, box / ar) : box;
  const g = { w, h };
  /* La vignette passe par le MÊME renderer au trait que la scène
     (pdsNoirFixture, qui choisit son encre selon la vue) : le bouton montre
     ce qui sera réellement posé. Le texte n'a pas de dessin — un Aa suffit. */
  const inkAa = pdsNoir() ? 'rgba(255,255,255,0.45)' : 'rgba(10,15,13,0.55)';
  if (K.render === 'none') {
    return `<span style="font:600 9px/1 var(--font-mono,monospace);color:${inkAa};">Aa</span>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${pdsNoirFixture({ type: kind }, K, g)}</svg>`;
}

function pdsPlanThumb(plan) {
  const z = plan.zones[0];
  if (!z) return '';
  const W = z.room.w, H = z.room.h;
  const r = pdsRoom(z);
  const items = plan.elements.filter(e => e.zone === z.id)
    .map(e => ({ o: e, c: pdsShade(pdsColor(e), -0.04) }))
    .concat(plan.tables.filter(t => t.zone === z.id).map(t => ({ o: t, c: pdsColor(t) })));
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${r.floor}" stroke="${r.wall}" stroke-width="10"/>
    ${items.map(({ o, c }) => {
      const g = pdsGeom(o);
      const round = (g.shape === 'round');
      return round
        ? `<ellipse cx="${o.x + g.w / 2}" cy="${o.y + g.h / 2}" rx="${g.w / 2}" ry="${g.h / 2}" fill="${c}"/>`
        : `<rect x="${o.x}" y="${o.y}" width="${g.w}" height="${g.h}" rx="6" fill="${c}"/>`;
    }).join('')}
  </svg>`;
}

function pdsRenderRoomCard(state, T) {
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const r = pdsRoom(zone);
  const P = pdsPlane(zone);
  const sw = (val, field) => PDS_MAT.map(m => `
    <button data-activation=write class="pds-sw ${m.c.toLowerCase() === String(val).toLowerCase() ? 'active' : ''}"
            data-pds-room-field="${field}" data-pds-val="${m.c}"
            style="background:${m.c};" title="${T['mat' + m.id] || m.id}"
            aria-label="${T['mat' + m.id] || m.id}"></button>`).join('');
  /* A free picker alongside the 16 tokens. Any hex is allowed, but the
     handler pulls it back into a legible luminance band so pdsInk() can
     always find readable ink for a table number — see pdsSafeColor. */
  const custom = (val, field) => `
    <label class="pds-sw pds-sw-custom" title="${T.customColor}">
      <input type="color" data-pds-room-field="${field}" value="${pdsHexOf(val)}"/>
    </label>`;
  /* En vue nuit le rendu aplatit toute matière vers le charbon (pdsNoirC) :
     ambiance, sol, murs, fond et finition n'auraient aucun effet visible.
     On ne montre que les dimensions. La vue jour trace murs et sol à l'encre
     (pdsRoomShellJour) : seuls ambiance, teinte du sol et fond jouent encore —
     murs et finition ont suivi le même sort que la nuit. */
  const noir = pdsNoir();
  return `
    <details class="pds-rail-card pds-fold" data-pds-fold="room"${PDS_FOLD.room ? ' open' : ''}>
      <summary class="pds-rail-title">${T.roomTitle}</summary>
      <div class="pds-rail-hint">${noir ? T.roomHintNuit : T.roomHint}</div>
      ${noir ? '' : `
      <label class="pds-mini-label">${T.ambianceLabel}</label>
      <div class="pds-amb-row">
        ${Object.keys(PDS_AMBIANCE).map(k => {
          const A = PDS_AMBIANCE[k];
          return `<button data-activation=write class="pds-amb ${zone && zone.ambiance === k ? 'active' : ''}"
                          data-pds-action="ambiance" data-pds-amb="${k}" title="${T['amb'+k]}">
            <span class="pds-amb-chips" aria-hidden="true">
              <i style="background:${A.room.floor}"></i><i style="background:${A.room.wall}"></i>
              <i style="background:${A.table}"></i><i style="background:${A.backdrop}"></i>
            </span>
            <span class="pds-amb-name">${T['amb'+k]}</span>
          </button>`;
        }).join('')}
      </div>
      <label class="pds-mini-label">${T.roomFloor}</label>
      <div class="pds-sw-row">${sw(r.floor, 'floor')}${custom(r.floor, 'floor')}</div>
      <label class="pds-mini-label">${T.roomBackdrop}</label>
      <div class="pds-sw-row">
        <button data-activation=write class="pds-sw pds-sw-none ${r.backdrop ? '' : 'active'}"
                data-pds-room-field="backdrop" data-pds-val=""
                title="${T.backdropNone}" aria-label="${T.backdropNone}"></button>
        ${sw(r.backdrop, 'backdrop')}${custom(r.backdrop || '#F7F5F0', 'backdrop')}
      </div>`}
      <div class="pds-num-grid">
        <label>${T.roomW}<input class="kf-input pds-input" type="number" min="240" max="2400" step="20" data-pds-room-field="w" value="${P.w}"/></label>
        <label>${T.roomH}<input class="kf-input pds-input" type="number" min="200" max="2000" step="20" data-pds-room-field="h" value="${P.h}"/></label>
        <label>${T.roomWallW}<input class="kf-input pds-input" type="number" min="0" max="14" step="1" data-pds-room-field="wallW" value="${r.wallW}"/></label>
      </div>
    </details>
  `;
}

function pdsRenderAssignRail(state, T) {
  /* Qui est réellement là, d'après le pointage d'Équipe. Un serveur absent
     garde ses tables, mais la pastille le dit. */
  const duty = pdsOnShift();
  const nOn = duty ? state.staff.filter(x => duty[x.id] === 'on-duty').length : null;
  const dutyLabel = (st) => st === 'on-duty' ? T.onShift : st === 'on-pause' ? T.onPause : T.offShift;
  return `
    <div class="pds-rail-card">
      <div class="pds-rail-title">${T.rosterTitle}</div>
      <div class="pds-rail-hint">${pdsEsc(nOn == null ? T.rosterHint : T.rosterShiftNow(nOn))}</div>
      <div class="pds-roster">
        ${state.staff.length ? state.staff.map(s => {
          const tbls = state.tables.filter(t => pdsHasServer(t, s.id));
          const seats = tbls.reduce((acc, t) => acc + pdsGeom(t).seats, 0);
          const st = duty && s.from === 'team' ? (duty[s.id] || 'off-duty') : null;
          return `
            <div class="pds-chip${st && st !== 'on-duty' ? ' is-off' : ''}" draggable="false" data-pds-chip="${pdsEsc(s.id)}" style="--chip:${pdsEsc(s.color)};">
              <span class="pds-chip-dot"></span>
              <span class="pds-chip-body">
                <b>${pdsEsc(s.name)}</b>
                <em>${st ? `<span class="pds-duty pds-duty-${st}">${pdsEsc(dutyLabel(st))}</span> · ` : ''}${T.rosterTables(tbls.length)} · ${T.rosterCovers(seats)}</em>
              </span>
              ${s.from === 'team' ? '' : `<button class="pds-chip-x" type="button" title="${T.rosterRemove}" aria-label="${T.rosterRemove}" data-pds-action="del-server" data-pds-sid="${pdsEsc(s.id)}">×</button>`}
            </div>
          `;
        }).join('') : `<div class="pds-roster-empty">${T.rosterEmpty}</div>`}
      </div>
      <button data-activation=write class="kb ghost pds-rail-cta" data-pds-action="add-server">${T.rosterAdd}</button>
    </div>
    <div class="pds-rail-card">
      <button class="kb ghost pds-rail-cta pds-rail-danger" data-pds-action="clear-assign">${T.clearAssign}</button>
    </div>
  `;
}

function pdsRenderAssignSummary(state, T) {
  /* Tables per server — quick overview when no table is selected */
  return `
    <div class="pds-assign-sum">
      ${state.staff.map(s => {
        const tbls = state.tables.filter(t => pdsHasServer(t, s.id));
        return `<div class="pds-asum-row" style="--chip:${s.color};">
          <span class="pds-asum-dot"></span>
          <span class="pds-asum-name">${pdsEsc(s.name.split(' ')[0])}</span>
          <span class="pds-asum-n">${tbls.length}</span>
        </div>`;
      }).join('')}
      ${state.tables.filter(t => !pdsServerIds(t).length).length > 0 ? `
        <div class="pds-asum-row pds-asum-unassigned">
          <span class="pds-asum-dot" style="--chip:#9CA3AF;"></span>
          <span class="pds-asum-name">${T.rosterUnassigned}</span>
          <span class="pds-asum-n">${state.tables.filter(t => !pdsServerIds(t).length).length}</span>
        </div>
      ` : ''}
    </div>
  `;
}

function pdsRenderInspector(state, T, obj) {
  const found = pdsFind(state, obj.id) || { o: obj, table: true };
  const isT = found.table;
  const g = pdsGeom(obj);
  const c = pdsColor(obj);
  const K = isT ? (PDS_TABLE_TYPES[obj.type] || {}) : (PDS_FIX[obj.type] || {});
  const title = isT ? T.inspectorTitle(obj.num)
                    : (T['fix' + obj.type] || obj.type);
  const swatches = PDS_MAT.map(m => `
    <button data-activation=write class="pds-sw ${m.c.toLowerCase() === String(c).toLowerCase() ? 'active' : ''}"
            data-pds-field="color" data-pds-val="${m.c}" style="background:${m.c};"
            title="${T['mat' + m.id] || m.id}" aria-label="${T['mat' + m.id] || m.id}"></button>`).join('')
    /* Free picker per object. Choosing one sets colorLock, so a later
       ambiance repaints the room around this piece and leaves it alone. */
    + `<label class="pds-sw pds-sw-custom ${obj.colorLock ? 'active' : ''}" title="${T.customColor}">
         <input type="color" data-pds-field="color" value="${pdsHexOf(c)}"/>
       </label>`;
  return `
    <div class="pds-rail-card pds-inspect" data-pds-inspect-id="${obj.id}">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${pdsEsc(title)}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      ${isT ? `
        <div class="pds-form-row">
          <label>${T.inspectorNum}</label>
          <input class="kf-input pds-input" data-pds-field="num" value="${pdsEsc(obj.num)}"/>
          ${state.tables.some(o => o.id !== obj.id && pdsNumKey(o.num) && pdsNumKey(o.num) === pdsNumKey(obj.num))
            ? `<span class="pds-field-warn" role="status">${pdsEsc(T.dupNumField)}</span>` : ''}
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorType}</label>
          <select class="kf-input pds-input" data-pds-field="type">
            ${Object.entries(PDS_TABLE_TYPES).map(([k,v]) => `<option value="${k}" ${k===obj.type?'selected':''}>${v.label(T)}</option>`).join('')}
          </select>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorSeats}</label>
          <div class="pds-step">
            <button class="pds-step-btn" data-pds-action="seats-down" data-pds-id="${obj.id}" aria-label="${pdsEsc(T.inspectorSeats)} −">−</button>
            <input class="kf-input pds-input pds-step-val" type="number" min="0" max="24" data-pds-field="seats" value="${g.seats}"/>
            <button class="pds-step-btn" data-pds-action="seats-up" data-pds-id="${obj.id}" aria-label="${pdsEsc(T.inspectorSeats)} +">+</button>
          </div>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorLabel}</label>
          <input class="kf-input pds-input" data-pds-field="label"
                 value="${pdsEsc(pdsFixLabel(obj, K, T))}" placeholder="·"/>
        </div>
      `}

      <div class="pds-form-row">
        <label>${T.inspectorSize} <span class="pds-unit">${T.unitCm}</span></label>
        <div class="pds-num-grid pds-num-4">
          <label>L<input class="kf-input pds-input" type="number" min="${K.minW||16}" max="2400" data-pds-field="w" value="${Math.round(g.w)}"/></label>
          <label>H<input class="kf-input pds-input" type="number" min="${K.minH||16}" max="2000" data-pds-field="h" value="${Math.round(g.h)}"/></label>
          <label>X<input class="kf-input pds-input" type="number" min="0" max="2400" data-pds-field="x" value="${Math.round(obj.x)}"/></label>
          <label>Y<input class="kf-input pds-input" type="number" min="0" max="2000" data-pds-field="y" value="${Math.round(obj.y)}"/></label>
        </div>
      </div>

      <div class="pds-form-row">
        <label>${T.inspectorRotation} <span class="pds-unit" data-pds-rotout>${Math.round(obj.rot||0)}°</span></label>
        <div class="pds-rot-row">
          <input class="pds-range" type="range" min="0" max="359" step="1" data-pds-field="rot" value="${Math.round(obj.rot||0)}"/>
          <input class="kf-input pds-input pds-rot-num" type="number" min="0" max="359" step="1"
                 data-pds-field="rot" value="${Math.round(obj.rot||0)}" aria-label="${T.inspectorRotation}"/>
          <button class="pds-step-btn" data-pds-action="rot-90" data-pds-id="${obj.id}" title="+90°">90°</button>
        </div>
      </div>

      ${!pdsNoir() && isT ? `
      <div class="pds-form-row">
        <label>${T.inspectorMaterial}</label>
        <div class="pds-sw-row">${swatches}</div>
      </div>` : ''}

      ${isT ? `
        ${pdsRenderStatusRow(state, T, obj)}
        ${obj.status === 'reserved' ? `
        <div class="pds-resv-fields">
          <label class="pds-resv-field">
            <span>${T.reservationName}</span>
            <input class="kf-input pds-input" data-pds-field="reservationName"
                   value="${pdsEsc(obj.reservationName || '')}" placeholder="${pdsEsc(T.reservationNamePlaceholder)}"/>
          </label>
          <label class="pds-resv-field">
            <span>${T.reservationTime}</span>
            <input class="kf-input pds-input" type="time" data-pds-field="reservationTime"
                   value="${pdsEsc(obj.reservationTime || '')}"/>
          </label>
        </div>` : ''}
        <div class="pds-form-row">
          <label>${T.inspectorServer} · ${PDS_MAX_TABLE_SERVERS} max.</label>
          ${(() => {
            /* An empty roster used to render three selects reading
               "Aucun", "·", "·" — a picker with nothing to pick. Say so,
               and otherwise offer one empty slot after the filled ones. */
            if (!state.staff.length) return `<p class="pds-field-hint">${pdsEsc(T.inspectorNoStaff)}</p>`;
            const assigned = pdsServerIds(obj);
            const spare = state.staff.length > assigned.length ? 1 : 0;
            const shown = Math.min(PDS_MAX_TABLE_SERVERS, Math.max(1, assigned.length + spare));
            return Array.from({ length: shown }, (_, slot) => `<select class="kf-input pds-input pds-server-slot" data-pds-server-slot="${slot}">
              <option value="">${slot === 0 ? T.inspectorUnassigned : pdsEsc(T.inspectorAddServer)}</option>
              ${state.staff.filter(s => s.id === assigned[slot] || !assigned.includes(s.id))
                .map(s => `<option value="${s.id}" ${s.id===assigned[slot]?'selected':''}>${pdsEsc(s.name)}</option>`).join('')}
            </select>`).join('');
          })()}
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorNotes}</label>
          <input class="kf-input pds-input" data-pds-field="notes" value="${pdsEsc(obj.notes || '')}" placeholder="·"/>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorDepth}</label>
          <div class="pds-inspect-actions pds-actions-tight">
            <button class="kb ghost" data-pds-action="layer-back" data-pds-id="${obj.id}">${T.layerBack}</button>
            <button class="kb ghost" data-pds-action="layer-front" data-pds-id="${obj.id}">${T.layerFront}</button>
          </div>
        </div>
      `}

      ${isT && obj.group ? (() => {
        /* La fusion se lit ici aussi : partenaires et capacité partagée. */
        const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
        const peers = state.tables.filter(tt => tt.group === obj.group && tt.id !== obj.id)
          .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
        const seats = state.tables.filter(tt => tt.group === obj.group)
          .reduce((s, tt) => s + (pdsGeom(tt).seats || 0), 0);
        return `<div class="pds-group-info">${pdsEsc(T.groupedWith(peers.map(p => disp(p.num)).join(' + ')))} · ${pdsEsc(T.groupCovers(seats))}</div>`;
      })() : ''}

      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="obj-lock" data-pds-id="${obj.id}">${obj.locked ? T.unlock : T.lock}</button>
        ${isT ? `<button class="kb ghost ${state._groupPickFrom === obj.id ? 'pds-group-arming' : ''}" data-pds-action="table-group" data-pds-id="${obj.id}">${T.groupTables}</button>` : ''}
        ${isT && obj.group ? `<button class="kb ghost" data-pds-action="table-ungroup" data-pds-id="${obj.id}">${T.ungroupTables}</button>` : ''}
        <button class="kb ghost" data-pds-action="table-duplicate" data-pds-id="${obj.id}">${T.inspectorDuplicate}</button>
        <button data-activation=write class="kb ghost pds-rail-danger" data-pds-action="table-delete" data-pds-id="${obj.id}">${T.inspectorDelete}</button>
      </div>
    </div>
  `;
}

function pdsRenderBulkInspector(state, T, selectedIds) {
  return `
    <div class="pds-rail-card pds-inspect">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${T.selection} · ${selectedIds.length}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="pds-form-row">
        <label>${T.bulkSetStatus}</label>
        <div class="pds-status-pills">
          ${pdsManualStatuses().map(st => `
            <button class="pds-status-pill pds-pill-${st}" data-pds-action="bulk-status" data-pds-status="${st}">
              ${pdsEsc(pdsStatusLabel(st, T))}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pds-inspect-actions" style="margin-top:6px;">
        <button class="kb ghost" data-pds-action="bulk-align-h">${T.bulkAlignH}</button>
        <button class="kb ghost" data-pds-action="bulk-align-v">${T.bulkAlignV}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-h">${T.bulkDistH}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-v">${T.bulkDistV}</button>
      </div>
      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="bulk-group">${T.bulkGroup}</button>
        <button class="kb ghost" data-pds-action="bulk-clear">${T.bulkClear}</button>
        <button data-activation=write class="kb ghost pds-rail-danger" data-pds-action="bulk-delete" style="grid-column:1 / -1;">${T.bulkDelete}</button>
      </div>
    </div>
  `;
}

function pdsSyncGroupService(state, gid, anchor) {
  if (!gid || !anchor) return;
  state.tables.forEach(t => {
    if (t.group !== gid || t.id === anchor.id) return;
    t.status = anchor.status || 'free';
    if ((anchor.status === 'occupied' || anchor.status === 'ordering' || anchor.status === 'bill') && anchor.since) t.since = anchor.since;
    else delete t.since;
    if (anchor.status === 'reserved') {
      if (anchor.reservationName) t.reservationName = anchor.reservationName;
      else delete t.reservationName;
      if (anchor.reservationTime) t.reservationTime = anchor.reservationTime;
      else delete t.reservationTime;
      if (anchor.reservationDate) t.reservationDate = anchor.reservationDate;
      else delete t.reservationDate;
    } else {
      pdsClearReservation(t);
    }
  });
}

function pdsExpireReservations(state, now) {
  now = now == null ? Date.now() : now;
  const expiredGroups = new Set();
  const expiredIds = new Set();
  let changed = false;
  state.tables.forEach(t => {
    if (t.status !== 'reserved' || !/^\d{2}:\d{2}$/.test(t.reservationTime || '')) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.reservationDate || '')) {
      t.reservationDate = pdsTodayKey(now);
      changed = true;
    }
    const day = t.reservationDate;
    const stamp = new Date(`${day}T${t.reservationTime}:00`).getTime();
    if (Number.isFinite(stamp) && now > stamp + 2 * 60 * 60 * 1000) {
      if (t.group) expiredGroups.add(t.group);
      else expiredIds.add(t.id);
    }
  });
  state.tables.forEach(t => {
    if (!expiredIds.has(t.id) && !(t.group && expiredGroups.has(t.group))) return;
    t.status = 'free';
    delete t.since;
    pdsClearReservation(t);
    changed = true;
  });
  return changed;
}

function pdsOfferTableUndo(state, T, snapshot, refresh, selection, title, restoredTitle, selectId) {
  let restored = false;
  Kiwi.toast(title, {
    type: 'warn', duration: 5200, force: true,
    action: {
      label: T.undoAction,
      onClick: () => {
        if (restored) return;
        restored = true;
        pdsPush(state);
        pdsRestoreTableSnapshot(state, snapshot);
        selection.clear();
        if (selectId && state.tables.some(t => t.id === selectId)) selection.add(selectId);
        refresh();
        if (selectId) setTimeout(() => state._openInspector(selectId), 0);
        Kiwi.toast(restoredTitle, { type: 'success', duration: 1400, force: true });
      },
    },
  });
}

function pdsRenderGroups(tables, state, T) {
  const byGroup = new Map();
  tables.forEach(t => {
    if (!t.group) return;
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  });
  let out = '';
  byGroup.forEach((members, gid) => {
    if (members.length < 2) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seats = 0;
    members.forEach(t => {
      const g = pdsGeom(t);
      x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x + g.w); y1 = Math.max(y1, t.y + g.h);
      seats += g.seats || 0;
    });
    const pad = 8;
    const nums = members.slice()
      .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
      .map(t => /^\d$/.test(String(t.num)) ? '0' + t.num : t.num);
    out += `
      <div class="pds-group-env" data-pds-group="${pdsEsc(gid)}" style="left:${x0 - pad}px; top:${y0 - pad}px; width:${(x1 - x0) + pad * 2}px; height:${(y1 - y0) + pad * 2}px;">
        <span class="pds-group-chip">${pdsEsc(nums.join(' + '))}<span class="pds-group-covers"> · ${pdsEsc(T.groupCovers(seats))}</span></span>
      </div>`;
  });
  return out;
}

function pdsRotationKey(period, now) {
  now = now == null ? Date.now() : now;
  const start = new Date(pdsBusinessDayStart(now));
  const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  if (period === 'daily') return day;
  if (period === 'weekly') {
    const d = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const wd = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  }
  const h = new Date(now).getHours();
  return day + ((h >= 16 || h < 5) ? '-soir' : '-midi');
}

function pdsRotateStep(state, tables, strategy, pairs) {
  const ids = state.staff.map(x => x.id);
  const ordered = pdsTablesInOrder(state, tables);
  const next = {};
  ordered.forEach(t => { next[t.id] = pdsServerIds(t); });
  if (ids.length < 2 && strategy !== 'pairs') return next;
  if (strategy === 'pairs') {
    const swap = {};
    (pairs || []).forEach(p => { if (p && p[0] && p[1] && p[0] !== p[1]) { swap[p[0]] = p[1]; swap[p[1]] = p[0]; } });
    ordered.forEach(t => { next[t.id] = pdsServerIds(t).map(id => swap[id] || id); });
    return next;
  }
  if (strategy === 'tables') {
    ordered.forEach((t, i) => {
      const cur = pdsServerIds(t)[0];
      const at = ids.indexOf(cur);
      next[t.id] = [ids[at >= 0 ? (at + 1) % ids.length : i % ids.length]];
    });
    return next;
  }
  /* zones: the room is a ring of seats, one per server, each zone holding
     seats in proportion to its tables (12 in the salle, 5 at the bar: the
     salle needs more hands). Servers sit on the ring in their current
     order, and every rotation moves everyone the same number of seats, a
     step coprime with the head count, so over a full cycle each server
     passes through every zone for its share of the time. Inside a zone
     each server takes a run of neighbouring tables, not every third one.
     With more zones than servers, an unstaffed zone goes to whoever holds
     the fewest tables. */
  const zones = state.zones.filter(z => ordered.some(t => t.zone === z.id)).map(z => z.id);
  if (!zones.length) return next;
  const n = ids.length;
  const nOf = {};
  zones.forEach(z => { nOf[z] = ordered.filter(t => t.zone === z).length; });
  const floor = n >= zones.length ? 1 : 0;
  const target = {};
  zones.forEach(z => { target[z] = Math.max(floor, Math.round(nOf[z] / ordered.length * n)); });
  const ratio = (z) => nOf[z] / Math.max(target[z], 0.0001);
  let sum = zones.reduce((a, z) => a + target[z], 0);
  while (sum > n) {
    const z = zones.filter(x => target[x] > floor).sort((a, b) => ratio(a) - ratio(b))[0];
    if (!z) break;
    target[z] -= 1; sum -= 1;
  }
  while (sum < n) {
    const z = zones.slice().sort((a, b) => ratio(b) - ratio(a))[0];
    target[z] += 1; sum += 1;
  }
  const slots = [];
  zones.forEach(z => { for (let k = 0; k < target[z]; k++) slots.push(z); });
  /* Where each server sits now: their zone, then their first table. */
  const home = pdsHomeZones(state, ordered);
  const firstAt = {};
  ordered.forEach((t, i) => pdsServerIds(t).forEach(id => { if (firstAt[id] == null) firstAt[id] = i; }));
  const ring = ids.slice().sort((a, b) => {
    const za = zones.indexOf(home[a]), zb = zones.indexOf(home[b]);
    return (za < 0 ? 1e6 : za) - (zb < 0 ? 1e6 : zb) || (firstAt[a] ?? 1e6) - (firstAt[b] ?? 1e6) || ids.indexOf(a) - ids.indexOf(b);
  });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let step = Math.max(1, Math.ceil(n / zones.length));
  while (n > 1 && gcd(step, n) !== 1) step += 1;
  const onZone = {};
  zones.forEach(z => { onZone[z] = []; });
  const seated = new Array(slots.length);
  ring.forEach((sid, p) => { if (slots.length) seated[(p + step) % slots.length] = sid; });
  seated.forEach((sid, k) => { if (sid != null) onZone[slots[k]].push(sid); });
  const load = {};
  ids.forEach(id => { load[id] = 0; });
  zones.forEach(z => {
    const ts = ordered.filter(t => t.zone === z);
    const crew = onZone[z];
    ts.forEach((t, i) => {
      const sid = crew.length
        ? crew[Math.min(crew.length - 1, Math.floor(i * crew.length / ts.length))]
        : ids.slice().sort((a, b) => load[a] - load[b])[0];
      load[sid] += 1;
      next[t.id] = [sid];
    });
  });
  return next;
}

function pdsFairness(state) {
  const fair = {};
  const history = (state.history || []).filter(h => h && h.at);
  if (history.length < 2) return null;
  const zoneIds = state.zones.filter(z => state.tables.some(t => t.zone === z.id)).map(z => z.id);
  state.staff.forEach(sv => {
    const count = {};
    history.forEach(h => { const z = h.servers && h.servers[sv.id]; if (z) count[z] = (count[z] || 0) + 1; });
    const seen = Object.keys(count).length;
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    if (!total) { fair[sv.id] = null; return; }
    const uniqueRatio = zoneIds.length ? Math.min(1, seen / Math.min(zoneIds.length, total)) : 1;
    const maxRatio = Math.max(...Object.values(count)) / total;
    const score = Math.max(0, Math.min(100, Math.round(uniqueRatio * 70 + (1 - maxRatio) * 30)));
    let hot = null;
    Object.entries(count).forEach(([z, c]) => { if (total >= 3 && c / total >= 0.6) hot = z; });
    fair[sv.id] = { score, hot };
  });
  return fair;
}

function pdsRenderRotateStage(state, T) {
  const rot = state.rotation || { period: 'shift', strategy: 'zones' };
  const zoneName = (id) => (state.zones.find(z => z.id === id) || {}).name || '·';
  const strategyLabel = rot.strategy === 'zones' ? T.rotZones : rot.strategy === 'tables' ? T.rotTables : T.rotPairs;
  const enough = rot.strategy === 'pairs' ? (rot.pairs || []).length > 0 : state.staff.length >= 2;
  const preview = enough ? pdsRotationPreview(state, 3) : [];
  const fairness = pdsFairness(state);
  const history = (state.history || []).filter(h => h && h.at).slice(-7);
  const autoTxt = rot.auto
    ? T.rotateAuto(rot.period === 'daily' ? T.rotateAutoDaily : rot.period === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift)
    : T.rotateOff;
  const fmt = (ts) => { const d = new Date(ts); return `${d.toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${pdsClock(ts)}`; };
  const zoneTag = (z) => 'abcdefgh'.charAt(Math.max(0, state.zones.findIndex(x => x.id === z)) % 8) || 'd';
  return `
    <div class="pds-rotate">
      <div class="pds-rotate-grid">
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotateTitle}</div>
          <div class="pds-rail-hint">${pdsEsc(T.rotateDesc)}</div>
          <div class="pds-rot-meta">
            <div><span class="pds-rot-lbl">${T.rotatePeriod}</span><span class="pds-rot-val">${pdsEsc(pdsPeriodLabel(T, rot.period))}</span></div>
            <div><span class="pds-rot-lbl">${T.rotateStrategy}</span><span class="pds-rot-val">${pdsEsc(strategyLabel)}</span></div>
          </div>
          <p class="pds-rot-auto${rot.auto ? ' on' : ''}">${pdsEsc(autoTxt)}</p>
          <p class="pds-rail-hint">${pdsEsc(rot.lastAt ? T.rotateLast(fmt(rot.lastAt)) : T.rotateNever)}</p>
          <div class="pds-rot-actions">
            <button class="kb atlas" data-pds-action="rotate-configure">${T.rotateCTA}</button>
            <button class="kb ghost" data-pds-action="rotate-now"${enough ? '' : ' disabled'}>${T.rotNow}</button>
          </div>
          ${enough ? '' : `<p class="pds-rail-hint">${pdsEsc(rot.strategy === 'pairs' ? T.rotPairsNone : T.rotNeedStaff)}</p>`}
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotPreview}</div>
          <div class="pds-rail-hint">${pdsEsc(rot.strategy === 'zones' ? T.rotZonesDesc : rot.strategy === 'tables' ? T.rotTablesDesc : T.rotPairsDesc)}</div>
          <div class="pds-rot-preview">
            ${preview.map((step, idx) => `
              <div class="pds-rot-step">
                <div class="pds-rot-step-h">+${idx + 1}</div>
                ${state.staff.slice(0, 8).map(sv => `<div class="pds-rot-line" style="--chip:${pdsEsc(sv.color)};">
                    <span class="pds-asum-dot"></span>
                    <b>${pdsEsc(String(sv.name).split(' ')[0])}</b>
                    <em>${pdsEsc(rot.strategy === 'zones' ? zoneName(step.home[sv.id]) : (step.tablesOf[sv.id] || []).slice(0, 4).join(' · ') || '·')}</em>
                  </div>`).join('')}
              </div>`).join('')}
          </div>
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotFairness}</div>
          ${fairness ? `
          <div class="pds-rail-hint">${T.rotHistoryHint}</div>
          <div class="pds-fair">
            ${state.staff.slice(0, 8).map(sv => {
              const f = fairness[sv.id];
              if (!f) return '';
              const cls = f.score >= 70 ? 'high' : f.score >= 50 ? 'mid' : 'low';
              return `
                <div class="pds-fair-row" style="--chip:${pdsEsc(sv.color)};">
                  <span class="pds-asum-dot"></span>
                  <span class="pds-fair-name">${pdsEsc(String(sv.name).split(' ')[0])}</span>
                  <span class="pds-fair-bar"><i class="pds-fair-${cls}" style="width:${f.score}%;"></i></span>
                  <span class="pds-fair-pct">${f.score}%</span>
                </div>
                <div class="pds-fair-note">${f.hot ? `<b>${pdsEsc(zoneName(f.hot))}</b> · ${T.fairnessLow}` : T.fairnessHigh}</div>`;
            }).join('')}
          </div>` : `<p class="pds-rail-hint">${pdsEsc(T.fairnessEmpty)}</p>`}
        </div>
      </div>
      <div class="pds-rail-card pds-rot-history">
        <div class="pds-rail-title">${T.rotHistoryTitle}</div>
        ${history.length ? `
        <div class="pds-history-grid" style="--cols:${history.length};">
          <div class="pds-hist-h">
            <span></span>
            ${history.map(h => `<span title="${pdsEsc(fmt(h.at))}">${pdsEsc(new Date(h.at).toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }))}</span>`).join('')}
          </div>
          ${state.staff.slice(0, 8).map(sv => `
            <div class="pds-hist-row" style="--chip:${pdsEsc(sv.color)};">
              <span class="pds-hist-name"><span class="pds-asum-dot"></span>${pdsEsc(String(sv.name).split(' ')[0])}</span>
              ${history.map(h => {
                const z = h.servers && h.servers[sv.id];
                const zname = z ? zoneName(z) : '·';
                return `<span class="pds-hist-cell pds-hist-${z ? zoneTag(z) : 'd'}" title="${pdsEsc(zname)}">${pdsEsc(zname.slice(0, 1))}</span>`;
              }).join('')}
            </div>`).join('')}
        </div>` : `<p class="pds-rail-hint">${pdsEsc(T.rotHistoryEmpty)}</p>`}
      </div>
    </div>
  `;
}

function pdsRenderActions(state, T) {
  const nv = pdsVersions(state).length;
  const dups = pdsDuplicateNums(state).length;
  return `
    <button class="kb ghost pds-act" data-pds-action="versions">${pdsEsc(T.versions)}${nv ? ` <span class="pds-count">${nv}</span>` : ''}</button>
    <details class="pds-more" data-pds-more>
      <summary class="kb ghost pds-act" aria-label="${pdsEsc(T.more)}">${pdsEsc(T.more)}${dups ? '<i class="pds-more-dot" aria-hidden="true"></i>' : ''}</summary>
      <div class="pds-more-pop" role="menu">
        <button role="menuitem" data-pds-action="renumber">${pdsEsc(T.renumber)}${dups ? `<em>${pdsEsc(T.dupShort(dups))}</em>` : ''}</button>
        <button role="menuitem" data-pds-action="open-wizard">${pdsEsc(T.wizTitle)}</button>
        <button role="menuitem" data-pds-action="scan-salle">${pdsEsc(T.scanSalle)}</button>
        <button role="menuitem" class="is-danger" data-pds-action="reset">${pdsEsc(T.reset)}</button>
      </div>
    </details>
    <button data-activation=money class="kb primary pds-act" data-pds-action="export">${pdsEsc(T.export)}</button>`;
}

function pdsAttachDrag(el, id, state, T, root, refresh, selection) {
  let dragging = false;
  let startX, startY, origX, origY, transformX, transformY;
  let dragK = 1;
  let blockFrame = 0;
  let groupPeers = [];
  let groupOrig = {};
  let selectionOrig = {};
  const t = state.tables.find(tt => tt.id === id);
  if (!t) return;

  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Mode « grouper » armé : le clic suivant lie les deux tables. Sur
     * soi-même, il annule. On sort avant toute logique de sélection ou de
     * drag — le refresh() reconstruit le DOM, donc plus rien à faire ici. */
    if (state._groupPickFrom) {
      ev.preventDefault();
      const fromId = state._groupPickFrom;
      state._groupPickFrom = null;
      const t = state.tables.find(tt => tt.id === id);
      if (fromId === id || !t) {
        toast(T.groupPickCancel, { duration: 1400 });
        refresh();
        setTimeout(() => state._openInspector(id), 0);
        return;
      }
      const from = state.tables.find(tt => tt.id === fromId);
      if (!from) { refresh(); return; }
      pdsPush(state);
      const serviceAnchor = from.group ? from : (t.group ? t : from);
      if (from.group && t.group && from.group !== t.group) {
        /* Deux groupes existants fusionnent : la cible rejoint le premier. */
        const old = t.group;
        state.tables.forEach(tt => { if (tt.group === old) tt.group = from.group; });
      } else {
        const gid = from.group || t.group || ('grp' + Date.now().toString(36));
        from.group = gid; t.group = gid;
      }
      pdsSyncGroupService(state, from.group || t.group, serviceAnchor);
      selection.clear();
      selection.add(id);
      refresh();
      const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
      const grouped = state.tables.filter(tt => tt.group && tt.group === (from.group || t.group));
      const nums = grouped.slice()
        .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
        .map(tt => disp(tt.num)).join(' + ');
      const covers = grouped.reduce((sum, tt) => sum + (pdsGeom(tt).seats || 0), 0);
      toast(T.groupOk(nums, covers), { type: 'success' });
      setTimeout(() => state._openInspector(id), 0);
      return;
    }
    /* Selection logic · Shift, ⌘ or Ctrl toggles, like every editor. */
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      if (selection.has(id)) {
        selection.delete(id);
        el.classList.remove('is-selected');
      } else {
        selection.add(id);
        el.classList.add('is-selected');
      }
      state._openBulkInspector();
      ev.preventDefault();
      return;
    } else {
      /* Plain click on an unselected table starts a fresh selection. A table
       * already inside a shift-selection keeps that selection intact so the
       * pointerdown can immediately become a multi-table drag. */
      const wasSelected = selection.has(id);
      if (!wasSelected) {
        selection.clear();
        root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(n => n.classList.remove('is-selected'));
      }
      selection.add(id);
      el.classList.add('is-selected');
      /* The matching inspector is already open for an existing selection.
       * Reopening it here calls bind(), stacking a fresh drag closure during
       * pointerdown and can steal the gesture before its first move. */
      if (!wasSelected) {
        if (selection.size > 1) state._openBulkInspector();
        else state._openInspector(id);
      }
    }
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    origX = t.x; origY = t.y;
    transformX = 0; transformY = 0;
    /* Snapshot the stage scale for the duration of this drag. The table is a
     * child of the scaled plane, so a translate() on it is itself scaled —
     * meaning a screen delta of D px must be written as D/k logical units to
     * track the cursor 1:1. */
    dragK = pdsK(root);
    /* Les partenaires de groupe (et leur enveloppe) suivent le même
       translate pendant le drag : la fusion se déplace d'un seul geste. */
    groupPeers = [];
    groupOrig = {};
    selectionOrig = {};
    if (selection.size > 1 && selection.has(id)) {
      state.tables.forEach(tt => {
        if (selection.has(tt.id)) selectionOrig[tt.id] = { x: tt.x, y: tt.y };
      });
    }
    if (t.group) {
      state.tables.forEach(tt => {
        if (tt.group === t.group && tt.id !== id) {
          groupOrig[tt.id] = { x: tt.x, y: tt.y };
          const n = root.querySelector(`[data-pds-table="${tt.id}"]`);
          if (n) groupPeers.push({ n, rot: tt.rot || 0 });
        }
      });
      const env = root.querySelector(`[data-pds-group="${t.group}"]`);
      if (env) groupPeers.push({ n: env, rot: null });
    }
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });

  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    transformX = (ev.clientX - startX) / dragK;
    transformY = (ev.clientY - startY) / dragK;
    el.style.transform = `translate(${transformX}px, ${transformY}px) rotate(${t.rot||0}deg)`;
    groupPeers.forEach(p => {
      p.n.style.transform = `translate(${transformX}px, ${transformY}px)` + (p.rot === null ? '' : ` rotate(${p.rot}deg)`);
    });
    /* The table always follows the cursor 1:1 — a table that refuses to move
       reads as a broken app, not as a rule. Illegality is shown, not enforced,
       until release. The collision test is coalesced to one per frame. */
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + transformX), y: Math.round(origY + transformY) };
      const hits = pdsBlockers(state, t, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
  });

  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    /* A drag is a gesture to undo like any other. A press that never moved
       is a click and records nothing. */
    if (Math.abs(transformX) + Math.abs(transformY) >= 1) pdsPush(state);
    let nx = origX + transformX;
    let ny = origY + transformY;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    /* Clamp to the room — its own size, which the merchant can change. */
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(t);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    el.classList.remove('is-blocked');
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* Settle. A drop on top of something lands beside it — searched outward
       from where you actually aimed, so the table still goes where you meant
       it to go rather than springing back to where it started. */
    if (selection.size <= 1 && !t.group && pdsBlockers(state, t, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, t, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    /* If shift-multi-drag, move all selected by the same delta. Positions are
       absolute from pointerdown origins: surviving DOM nodes may carry stacked
       finish listeners after a wire pass, and replaying one must be idempotent. */
    if (selection.size > 1 && selection.has(id)) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        if (selection.has(tt.id) && tt.id !== id) {
          const o = selectionOrig[tt.id];
          if (!o) return;
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, o.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, o.y + dy));
        }
      });
    }
    /* Une table groupée entraîne ses partenaires : la fusion est un seul
       meuble. Même delta pour chacun, borné à la pièce. Position absolue
       depuis l'origine capturée au pointerdown — un finish() qui rejoue
       (écouteurs empilés par un re-câblage) reste alors sans effet. */
    if (t.group) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        const o = groupOrig[tt.id];
        if (o && tt.group === t.group && !(selection.size > 1 && selection.has(tt.id))) {
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, o.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, o.y + dy));
        }
      });
      groupPeers = [];
    }
    t.x = nx;
    t.y = ny;
    /* Smooth commit: update style then full refresh (which will reset transform) */
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    el.style.transform = `rotate(${t.rot||0}deg)`;
    refresh();
    /* Re-select after refresh */
    setTimeout(() => {
      selection.forEach(sid => {
        const newEl = root.querySelector(`[data-pds-table="${sid}"]`);
        if (newEl) newEl.classList.add('is-selected');
      });
      if (selection.size > 1) state._openBulkInspector();
      else if (selection.size === 1) state._openInspector([...selection][0]);
    }, 0);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function pdsAttachElDrag(el, id, state, T, root, refresh) {
  let dragging = false;
  let startX, startY, origX, origY;
  let dragK = 1;
  let moved = false;
  let blockFrame = 0, lastX = 0, lastY = 0;
  const elObj = state.elements.find(e => e.id === id);
  if (!elObj) return;
  let lastTap = 0;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Double-click rotates element */
    const now = Date.now();
    if (now - lastTap < 280) {
      if (elObj.locked) return;
      pdsPush(state);
      elObj.rot = ((elObj.rot || 0) + 90) % 360;
      refresh();
      lastTap = 0;
      return;
    }
    lastTap = now;
    dragging = true;
    moved = false;
    startX = ev.clientX; startY = ev.clientY;
    origX = elObj.x; origY = elObj.y;
    dragK = pdsK(root);   /* screen px → logical units, see pdsK() */
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    if (!moved && Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
    moved = true;
    el.style.transform = `translate(${(ev.clientX - startX)/dragK}px, ${(ev.clientY - startY)/dragK}px) rotate(${elObj.rot||0}deg)`;
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + (lastX - startX) / dragK), y: Math.round(origY + (lastY - startY) / dragK) };
      const hits = pdsBlockers(state, elObj, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
    lastX = ev.clientX; lastY = ev.clientY;
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging', 'is-blocked');
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* A press that never moved is a click. Refreshing here would rebuild the
       stage DOM before the browser dispatches the click event, so the
       selection handler on this node would never fire — the fixture would
       feel impossible to select, resize or delete. Leave the DOM alone. */
    if (!moved) return;
    pdsPush(state);
    let nx = origX + (ev.clientX - startX) / dragK;
    let ny = origY + (ev.clientY - startY) / dragK;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(elObj);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    /* Same settle rule as tables — a kitchen dropped over a table lands
       against it, not through it. */
    if (pdsBlockers(state, elObj, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, elObj, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    elObj.x = nx; elObj.y = ny;
    refresh();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function pdsAttachChipDrag(chip, sid, state, T, root, refresh) {
  if (chip.getAttribute('data-pds-chip-wired') === '1') return;
  chip.setAttribute('data-pds-chip-wired', '1');
  let dragging = false;
  let startX, startY;
  let ghost = null;
  const create = (ev) => {
    /* La croix de retrait vit dans la pastille : sans cette sortie, le
       pointerdown démarrerait un glisser et avalerait le clic. */
    if (ev.target && ev.target.closest && ev.target.closest('[data-pds-action]')) return;
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    chip.setPointerCapture(ev.pointerId);
    /* Build a floating ghost following the cursor */
    ghost = chip.cloneNode(true);
    ghost.classList.add('pds-chip-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.9';
    document.body.appendChild(ghost);
    chip.classList.add('is-dragging');
    ev.preventDefault();
  };
  chip.addEventListener('pointerdown', create);
  chip.addEventListener('pointermove', (ev) => {
    if (!dragging || !ghost) return;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    chip.classList.remove('is-dragging');
    /* Hide the ghost so elementFromPoint reads what's under the cursor */
    if (ghost) ghost.style.display = 'none';
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    if (ghost) { ghost.remove(); ghost = null; }
    if (target) {
      const tableEl = target.closest('[data-pds-table]');
      const zoneEl = target.closest('[data-pds-zone]');
      if (tableEl) {
        const tid = tableEl.getAttribute('data-pds-table');
        const t = state.tables.find(tt => tt.id === tid);
        if (t) {
          const current = pdsServerIds(t);
          if (!current.includes(sid) && current.length >= PDS_MAX_TABLE_SERVERS) {
            Kiwi.toast(T.maxServersTitle, { type: 'info', desc: T.maxServersDesc });
            refresh();
            return;
          }
          pdsPush(state);
          pdsSetServerIds(t, current.concat(sid));
          const sv = state.staff.find(s => s.id === sid);
          Kiwi.toast(T.assignDone(sv?.name.split(' ')[0] || sid, t.num), { type: 'success', desc: T.assignDoneDesc });
          refresh();
          return;
        }
      } else if (zoneEl) {
        const zid = zoneEl.getAttribute('data-pds-zone');
        /* Assign chip to every table in that zone */
        pdsPush(state);
        let count = 0;
        state.tables.forEach(t => {
          if (t.zone !== zid) return;
          const current = pdsServerIds(t);
          if (current.includes(sid)) return;
          if (current.length < PDS_MAX_TABLE_SERVERS) { pdsSetServerIds(t, current.concat(sid)); count++; }
        });
        const zname = state.zones.find(z => z.id === zid)?.name || '';
        const sv = state.staff.find(s => s.id === sid);
        Kiwi.toast(T.zoneAssigned(sv?.name.split(' ')[0] || sid, zname), { type: 'success', desc: T.zoneAssignedDesc(count) });
        refresh();
        return;
      }
    }
    /* No drop target — small bounce-back toast (skip if too short of a drag) */
    if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) {
      /* Treated as click — open assign-chip menu */
      Kiwi.toast(state.staff.find(s => s.id === sid)?.name || sid, { type: 'info', desc: T.rosterHint, duration: 1400 });
    }
  };
  chip.addEventListener('pointerup', finish);
  chip.addEventListener('pointercancel', (ev) => {
    if (ghost) { ghost.remove(); ghost = null; }
    chip.classList.remove('is-dragging');
    dragging = false;
  });
}

function pdsRenumber(state, mode) {
  let n = 0, changed = 0;
  /* A zone of a hundred tables or more would run into the next one. */
  const span = state.zones.some(z => state.tables.filter(t => t.zone === z.id).length >= 100) ? 1000 : 100;
  state.zones.forEach((z, zi) => {
    /* Per zone, by hundreds: salle 1, 2…, then 101, 102…, 201… A letter
       (« T1 ») would read as table 1 at the till, and a waiter's keypad
       has no letters anyway. */
    if (mode === 'prefix') n = zi * span;
    pdsReadingOrder(state.tables.filter(t => t.zone === z.id)).forEach(t => {
      n += 1;
      const num = String(n);
      if (String(t.num) !== num) changed += 1;
      t.num = num;
    });
  });
  return changed || state.tables.length;
}

function pdsSaveVersion(state, name) {
  const strip = (t) => { const c = JSON.parse(JSON.stringify(t)); delete c.since; if (PDS_SERVICE_STATUSES.includes(c.status)) c.status = 'free'; return c; };
  const v = {
    id: 'ver' + Math.random().toString(36).slice(2, 8),
    name: String(name || '').slice(0, 60), at: Date.now(),
    zones: JSON.parse(JSON.stringify(state.zones)),
    tables: state.tables.map(strip),
    elements: JSON.parse(JSON.stringify(state.elements || [])),
  };
  const list = pdsVersions(state).concat(v);
  const drop = list.length > PDS_MAX_VERSIONS ? list.slice(0, list.length - PDS_MAX_VERSIONS) : [];
  if (drop.length && typeof pdsBury === 'function') pdsBury(state, drop.map(x => x.id));
  state.versions = list.slice(-PDS_MAX_VERSIONS);
  return v;
}

function pdsOpenVersions(state, T, refresh, selection) {
  const fmt = (ts) => new Date(ts).toLocaleString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const body = () => {
    const list = pdsVersions(state).slice().reverse();
    return `
      <div class="pds-versions">
        <div class="pds-version-new">
          <input class="kf-input pds-input" maxlength="60" data-pds-ver-name placeholder="${pdsEsc(T.versionNamePh)}" aria-label="${pdsEsc(T.versionName)}"/>
          <button data-activation=write class="kb atlas" data-pds-ver-save>${pdsEsc(T.versionSave)}</button>
        </div>
        ${list.length ? list.map(v => {
          const covers = (v.tables || []).reduce((n, t) => n + pdsGeom(t).seats, 0);
          return `<div class="pds-version" data-pds-ver="${pdsEsc(v.id)}">
            <div><b>${pdsEsc(v.name)}</b><em>${pdsEsc(fmt(v.at))} · ${pdsEsc(T.versionMeta((v.tables || []).length, covers))}</em></div>
            <button class="kb ghost" data-pds-ver-apply>${pdsEsc(T.versionApply)}</button>
            <button data-activation=write class="kb ghost pds-rail-danger" data-pds-ver-del>${pdsEsc(T.versionDelete)}</button>
          </div>`;
        }).join('') : `<p class="pds-rail-hint">${pdsEsc(T.versionEmpty)}</p>`}
      </div>`;
  };
  const m = Kiwi.modal({ tag: T.tagPdS, title: T.versionsTitle, desc: T.versionsDesc, width: 560, body: body(),
    foot: `<button class="kb ghost" data-dismiss>${T.close}</button>` });
  wireDismiss(m);
  if (!m || !m.el) return;
  const wire = () => {
    const host = m.el.querySelector('.pds-versions');
    host.querySelector('[data-pds-ver-save]').onclick = () => {
      const input = host.querySelector('[data-pds-ver-name]');
      const name = String(input.value || '').trim();
      if (!name) { input.focus(); return; }
      pdsSaveVersion(state, name);
      refresh();
      host.outerHTML = body(); wire();
      Kiwi.toast(T.versionSaved(name), { type: 'success' });
    };
    host.querySelectorAll('[data-pds-ver]').forEach(row => {
      const v = pdsVersions(state).find(x => x.id === row.getAttribute('data-pds-ver'));
      row.querySelector('[data-pds-ver-apply]').onclick = () => {
        if (!v) return;
        pdsPush(state);
        pdsApplyVersion(state, v, T);
        selection.clear();
        refresh();
        m.close();
        Kiwi.toast(T.versionApplied(v.name), { type: 'success', desc: T.versionAppliedDesc });
      };
      row.querySelector('[data-pds-ver-del]').onclick = () => {
        if (!v) return;
        if (typeof pdsBury === 'function') pdsBury(state, v.id);
        state.versions = pdsVersions(state);
        refresh();
        m.el.querySelector('.pds-versions').outerHTML = body(); wire();
      };
    });
  };
  wire();
}

function pdsPlaceBooking(state, booking, table) {
  try {
    const R = window.KiwiReservations, L = window.KiwiFloorLive;
    const doc = R.get();
    const b = (doc.bookings || []).find(x => x.id === booking.id);
    if (!b) return false;
    const rid = L.resourceTableId(table.id);
    let res = (doc.resources || []).find(r => r.id === rid);
    const now = Date.now();
    if (!res) {
      res = { id: rid, name: 'Table ' + pdsTableNum(table), kind: 'table', capacity: pdsGeom(table).seats || 2, active: true, week: null, updatedAt: now };
      doc.resources = (doc.resources || []).concat(res);
      /* The booking's service must accept this table, or validation would
         reject the placement later. */
      const svc = (doc.services || []).find(x => x.id === b.serviceId);
      if (svc && Array.isArray(svc.resourceIds) && svc.resourceIds.length && !svc.resourceIds.includes(rid)) {
        svc.resourceIds = svc.resourceIds.concat(rid); svc.updatedAt = now;
      }
    }
    b.resourceId = rid;
    b.updatedAt = now;
    R.set(doc);
    return true;
  } catch (_) { return false; }
}

function pdsExportSvg(state, zone, T) {
  const P = pdsPlane(zone);
  const r = pdsRoom(zone);
  const pad = 40, W = P.w + pad * 2, H = P.h + pad * 2 + 30;
  const staff = new Map(state.staff.map(x => [x.id, x]));
  const els = state.elements.filter(e => e.zone === zone.id).sort((a, b) => (a.z || 0) - (b.z || 0)).map(e => {
    const g = pdsGeom(e);
    const K = PDS_FIX[e.type] || {};
    const label = e.label != null ? e.label : (T['fix' + e.type] || K.label || '');
    return `<g transform="translate(${e.x + pad} ${e.y + pad + 30}) rotate(${e.rot || 0} ${g.w / 2} ${g.h / 2})">
      <rect width="${g.w}" height="${g.h}" rx="4" fill="#EFEBE3" stroke="#B9AF9B" stroke-width="1"/>
      ${label && g.w > 40 ? `<text x="${g.w / 2}" y="${g.h / 2 + 4}" text-anchor="middle" font-size="11" fill="#6B655B">${pdsEsc(label)}</text>` : ''}
    </g>`;
  }).join('');
  const tbls = state.tables.filter(t => t.zone === zone.id).map(t => {
    const g = pdsGeom(t);
    const cx = g.w / 2, cy = g.h / 2;
    const body = g.shape === 'round'
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`
      : `<rect width="${g.w}" height="${g.h}" rx="${Math.min(8, g.w / 5, g.h / 5)}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`;
    const svs = pdsServerIds(t).map(id => staff.get(id)).filter(Boolean);
    const dots = svs.map((sv, i) => `<g transform="translate(${g.w - 4 - i * 20} -6)"><circle r="9" fill="${pdsEsc(pdsBadge(sv.color).bg)}"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="600" fill="${pdsBadge(sv.color).ink}">${pdsEsc(pdsInitials(sv.name))}</text></g>`).join('');
    return `<g transform="translate(${t.x + pad} ${t.y + pad + 30}) rotate(${t.rot || 0} ${cx} ${cy})">${body}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="${Math.max(11, Math.min(18, g.h / 3))}" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsTableNum(t))}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="9" fill="#6B655B">${g.seats}p</text>${dots}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter Tight, Inter, system-ui, sans-serif">
    <rect width="${W}" height="${H}" fill="#F7F5F0"/>
    <text x="${pad}" y="${pad}" font-size="20" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsZoneName(zone))}</text>
    <rect x="${pad}" y="${pad + 30}" width="${P.w}" height="${P.h}" fill="${pdsEsc(r.floor || '#FBF7EE')}" stroke="#2C2520" stroke-width="${Math.max(2, r.wallW || 2)}"/>
    ${els}${tbls}
  </svg>`;
}

function pdsExportPrint(state, T) {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
  const day = new Date().toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const legend = state.staff.map(sv => {
    const n = state.tables.filter(t => pdsServerIds(t).includes(sv.id)).map(pdsTableNum);
    return n.length ? `<li><i style="background:${pdsEsc(sv.color)}"></i><b>${pdsEsc(sv.name)}</b> · ${pdsEsc(n.join(', '))}</li>` : '';
  }).join('');
  const pages = state.zones.filter(z => state.tables.some(t => t.zone === z.id) || state.elements.some(e => e.zone === z.id)).map(z => `
    <section class="page">
      <header><b>${pdsEsc(v.name || T.title)}</b><span>${pdsEsc(T.title)} · ${pdsEsc(T.exportPrinted(day))}</span></header>
      <div class="plan">${pdsExportSvg(state, z, T)}</div>
      ${legend ? `<footer><b>${pdsEsc(T.exportServers)}</b><ul>${legend}</ul></footer>` : ''}
    </section>`).join('');
  const w = window.open('', '_blank');
  if (!w) { Kiwi.toast(T.exportBlocked, { type: 'warn' }); return; }
  w.document.write(`<!doctype html><html lang="${trLang()}" dir="${trLang() === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${pdsEsc((v.name ? v.name + ' · ' : '') + T.title)}</title>
    <style>
      @page { size: A3 landscape; margin: 12mm; }
      body { margin: 0; background: #F7F5F0; color: #0A0F0D; font: 13px/1.4 "Inter Tight", Inter, system-ui, sans-serif; }
      .page { page-break-after: always; display: flex; flex-direction: column; gap: 10px; padding: 16px; box-sizing: border-box; min-height: 100vh; }
      .page:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(10,15,13,.15); padding-bottom: 8px; }
      header b { font-size: 18px; font-weight: 600; } header span { color: rgba(10,15,13,.6); }
      .plan { flex: 1; display: flex; align-items: center; justify-content: center; }
      .plan svg { max-width: 100%; max-height: 78vh; height: auto; }
      footer ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
      footer i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
    </style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script></body></html>`);
  w.document.close();
}

function pdsExportPng(state, T, zone) {
  if (!zone) return;
  const svg = pdsExportSvg(state, zone, T);
  const P = pdsPlane(zone);
  const W = P.w + 80, H = P.h + 110, scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const slug = String((v.name ? v.name + '-' : '') + zone.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.href = URL.createObjectURL(blob);
      a.download = `plan-${slug || 'salle'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      Kiwi.toast(T.exportDone, { type: 'success' });
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function tableAction26(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'toggle-view': {
      /* Flips the dashboard's theme; the observer in pdsAttach repaints. */
      pdsSetNoir(!pdsNoir());
      break;
    }
  }
}

function tableAction27(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'reset': {
      /* What the reset really loads, counted from the template itself — the
         old copy promised « 16 tables, 3 zones » for a 24-table default and
         an empty custom floor alike. The current plan goes to Versions
         first, and the reset is one undo step like any other. */
      const fresh = pdsNormalize(pdsDefaultState());
      const m = modal({
        tag: T.tagPdS,
        title: T.resetTitle,
        desc: T.resetDesc(fresh.tables.length, fresh.zones.length),
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.resetCancel}</button>
          <button class="kb pds-danger" data-dismiss data-pds-reset-confirm>${T.resetConfirm}</button>
        `,
      });
      wireDismiss(m);
      const confirm = m?.el?.querySelector('[data-pds-reset-confirm]');
      if (confirm) confirm.addEventListener('click', () => {
        pdsPush(state);
        pdsSaveVersion(state, T.versionAuto(new Date().toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR')));
        const keep = { versions: state.versions, mode: state.mode, snap: state.snap, gone: state.gone || {} };
        if (typeof pdsBury === 'function') {
          pdsBury(state, state.tables.map(t => t.id).concat(state.elements.map(e => e.id)));
          keep.gone = state.gone;
        }
        Object.keys(state).forEach(k => { if (k.charAt(0) !== '_') delete state[k]; });
        Object.assign(state, pdsNormalize(pdsDefaultState()), keep);
        selection.clear();
        refresh();
        toast(T.resetDone, {
          type: 'success', desc: T.resetDoneDesc, duration: 6000,
          action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) { selection.clear(); refresh(); } } },
        });
      });
      break;
    }
  }
}

function tableAction28(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'export': {
      const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
      const m = modal({
        tag: T.tagPdS,
        title: T.exportTitle,
        desc: T.exportDesc,
        width: 520,
        body: `
          <div class="pds-export-opts">
            <button data-activation=money class="pds-export-opt" data-pds-export="print">
              <span class="pds-export-ico">${pdsIcon('print')}</span>
              <b>${pdsEsc(T.exportPrint)}</b><em>${pdsEsc(T.exportPrintDesc)}</em>
            </button>
            <button data-activation=money class="pds-export-opt" data-pds-export="png">
              <span class="pds-export-ico">${pdsIcon('image')}</span>
              <b>${pdsEsc(T.exportPng)}</b><em>${pdsEsc(T.exportPngDesc(zone ? pdsZoneName(zone) : ''))}</em>
            </button>
          </div>`,
        foot: `<button class="kb ghost" data-dismiss>${T.cancel}</button>`,
      });
      wireDismiss(m);
      m?.el?.querySelectorAll('[data-pds-export]').forEach(b => b.addEventListener('click', () => {
        const kind = b.getAttribute('data-pds-export');
        m.close();
        if (kind === 'print') pdsExportPrint(state, T);
        else pdsExportPng(state, T, zone);
      }));
      break;
    }
  }
}

function tableAction29(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'versions': {
      pdsOpenVersions(state, T, refresh, selection);
      break;
    }
  }
}

function tableAction30(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'zoom-in':
    case 'zoom-out': {
      pdsZoomBy(root, state, action === 'zoom-in' ? 1.25 : 0.8);
      refresh();
      break;
    }
  }
}

function tableAction31(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'add-shape': {
      const shape = btn.getAttribute('data-pds-shape');
      const seats = pdsPalSeats(shape);
      const type = pdsTypeFor(shape, seats);
      const cfg = PDS_TABLE_TYPES[type] || PDS_TABLE_TYPES.round4;
      pdsPush(state);
      const plane = pdsPlaneOf(state);
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const num = pdsNextNum(state);
      const newT = {
        id: newTableId(), zone: state.activeZone, type, x: spot.x, y: spot.y,
        w: cfg.w, h: cfg.h, seats,
        shape: cfg.shape, color: null, num, status: 'free', server: null, notes: '', rot: 0, locked: false,
      };
      state.tables.push(newT);
      selection.clear(); selection.add(newT.id);
      refresh();
      toast(T.addedTableToast(num), { type: 'success', desc: T.addedTableDesc(newT.seats, state.zones.find(z => z.id === state.activeZone)?.name || '') });
      /* Stay on the plan: below 1100px the inspector sits under it, and
         revealing it scrolled ~1000px away from the table just placed. */
      setTimeout(() => { if (state._openInspector) state._openInspector(newT.id, { reveal: false }); }, 0);
      break;
    }
  }
}

function tableAction32(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'zone-move': {
      const i = state.zones.findIndex(z => z.id === state.activeZone);
      const j = i + (+btn.getAttribute('data-pds-delta') || 0);
      if (i < 0 || j < 0 || j >= state.zones.length) break;
      pdsPush(state);
      const z = state.zones.splice(i, 1)[0];
      state.zones.splice(j, 0, z);
      refresh();
      break;
    }
  }
}

function tableAction33(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'zone-color': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      pdsPush(state);
      const v = btn.getAttribute('data-pds-val');
      if (v) z.color = v; else delete z.color;
      refresh();
      break;
    }
  }
}

function tableAction34(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'zone-duplicate': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      pdsPush(state);
      const nz = JSON.parse(JSON.stringify(z));
      nz.id = pdsNewZoneId(state);
      nz.name = T.zoneCopy(pdsZoneName(z));
      state.zones.splice(state.zones.indexOf(z) + 1, 0, nz);
      const used = new Set(state.tables.map(t => String(t.num)));
      let next = state.tables.reduce((m, t) => Math.max(m, parseInt(t.num, 10) || 0), 0);
      state.tables.filter(t => t.zone === z.id).forEach(t => {
        const c = JSON.parse(JSON.stringify(t));
        c.id = newTableId(); c.zone = nz.id; delete c.group;
        do { next += 1; } while (used.has(String(next)));
        c.num = String(next); used.add(c.num);
        pdsSetStatus(c, 'free'); pdsSetServerIds(c, []);
        state.tables.push(c);
      });
      state.elements.filter(e => e.zone === z.id).forEach(e => {
        const c = JSON.parse(JSON.stringify(e));
        c.id = newElId(); c.zone = nz.id;
        state.elements.push(c);
      });
      state.activeZone = nz.id;
      selection.clear();
      refresh();
      toast(T.zoneDuplicated(pdsZoneName(z)), { type: 'success' });
      break;
    }
  }
}

function tableAction35(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'renumber': {
      const m = modal({
        tag: T.tagPdS,
        title: T.renumberTitle,
        desc: T.renumberDesc,
        width: 520,
        body: `
          <div class="pds-strat-cards">
            <button data-activation=write class="pds-strat-card active" data-pds-renum="flat"><b>${pdsEsc(T.renumberFlat)}</b><em>${pdsEsc(T.renumberFlatDesc)}</em></button>
            <button class="pds-strat-card" data-pds-renum="prefix"><b>${pdsEsc(T.renumberPrefix)}</b><em>${pdsEsc(T.renumberPrefixDesc)}</em></button>
          </div>`,
        foot: `<button class="kb ghost" data-dismiss>${T.cancel}</button>
               <button class="kb atlas" data-pds-renum-ok>${T.renumberOk}</button>`,
      });
      wireDismiss(m);
      let mode = 'flat';
      m?.el?.querySelectorAll('[data-pds-renum]').forEach(b => b.addEventListener('click', () => {
        mode = b.getAttribute('data-pds-renum');
        m.el.querySelectorAll('[data-pds-renum]').forEach(o => o.classList.toggle('active', o === b));
      }));
      m?.el?.querySelector('[data-pds-renum-ok]')?.addEventListener('click', () => {
        pdsPush(state);
        const n = pdsRenumber(state, mode);
        m.close();
        refresh();
        toast(T.renumberDone(n), { type: 'success' });
      });
      break;
    }
  }
}

function tableAction36(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'add-zone': {
      const m = modal({
        tag: T.tagPdS,
        title: T.addZone,
        desc: T.addZoneDesc,
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-name autofocus placeholder="${T.zoneName}" value=""/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-zone-confirm>${T.zoneAdd}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-name]');
        const name = (input?.value || '').trim().slice(0, 40) || `Zone ${state.zones.length + 1}`;
        /* Four characters of the clock collided for two zones made in the
           same second; the random tail and the existence check do not. */
        const id = pdsNewZoneId(state);
        pdsPush(state);
        state.zones.push({ id, name });
        state.activeZone = id;
        m.close();
        refresh();
        toast(T.zoneAdded, { type: 'success', desc: T.zoneAddedDesc(name) });
      });
      break;
    }
  }
}

function tableAction37(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'rename-zone': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const m = modal({
        tag: T.tagPdS,
        title: T.renameZoneTitle,
        desc: '',
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-rename autofocus maxlength="40" value="${pdsEsc(pdsZoneName(z))}"/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-zone-rename-confirm>${T.save2}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-rename-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-rename]');
        const name = (input?.value || '').trim().slice(0, 40);
        if (!name) { m.close(); return; }
        pdsPush(state);
        /* Le champ montre le nom traduit ; s'il revient intact, le nom semé reste. */
        if (name !== pdsZoneName(z)) z.name = name;
        m.close();
        refresh();
        toast(T.renameZone, { type: 'success', desc: T.zoneRenamedDesc(name) });
      });
      break;
    }
  }
}

function tableAction38(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'delete-zone': {
      if (state.zones.length <= 1) {
        toast(T.deleteZoneNoLast, { type: 'warn', desc: T.deleteZoneNoLastDesc });
        break;
      }
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const count = state.tables.filter(t => t.zone === z.id).length;
      const m = modal({
        tag: T.tagPdS,
        title: T.deleteZoneTitle,
        desc: T.deleteZoneDesc(pdsEsc(pdsZoneName(z)), count),
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas pds-rail-danger" data-pds-zone-del-confirm>${T.deleteZoneOk}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-del-confirm]');
      confirm?.addEventListener('click', () => {
        pdsPush(state);
        if (typeof pdsBury === 'function') {
          pdsBury(state, state.tables.filter(t => t.zone === z.id).map(t => t.id)
            .concat(state.elements.filter(e => e.zone === z.id).map(e => e.id)));
        }
        state.tables = state.tables.filter(t => t.zone !== z.id);
        state.elements = state.elements.filter(e => e.zone !== z.id);
        state.zones = state.zones.filter(zz => zz.id !== z.id);
        state.activeZone = state.zones[0]?.id;
        m.close();
        refresh();
        toast(T.deleteZoneDone, { type: 'success', desc: pdsZoneName(z), action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) refresh(); } } });
      });
      break;
    }
  }
}

function tableAction39(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'scan-salle': {
      const scan = window.KiwiSalleScan;
      if (!scan || !scan.open) { toast(T.scanUnavailable, { type: 'warn' }); break; }
      scan.open({
        onFacts: (facts) => {
          const A = state._wizAnswers || (state._wizAnswers = {
            venue: 'restaurant', floors: ['RDC'], extras: [],
            dims_default: { w: 1200, h: 800 }, tables: 18,
            kitchenWall: 'n', entranceWall: 's', wc: true,
          });
          if (facts.venue) A.venue = facts.venue;
          if (facts.tables) A.tables = Math.min(60, Math.max(2, facts.tables));
          if (facts.mix && facts.mix.length) A.mix = facts.mix;
          A.placement = facts.placement || [];
          if (facts.terrasse && !A.extras.includes('terrasse')) A.extras = A.extras.concat('terrasse');
          pdsHandleAction('open-wizard', btn, state, T, root, dr, refresh, selection);
        },
      });
      break;
    }
  }
}

function tableAction40(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'open-templates':
    case 'open-wizard': {
      const A = state._wizAnswers || (state._wizAnswers = {
        venue: 'restaurant', floors: ['RDC'], extras: [],
        dims_default: { w: 1200, h: 800 }, tables: 18,
        kitchenWall: 'n', entranceWall: 's', wc: true,
      });
      let step = 1, plans = null, chosen = null, spin = 0;

      const VENUES = ['restaurant', 'cafe', 'snack', 'patisserie', 'rooftop'];
      const EXTRAS = ['terrasse', 'patio', 'mezzanine', 'salon', 'bar'];
      const WALLS  = ['n', 'e', 's', 'w'];

      const qBody = () => `
        <div class="pds-wiz">
          <label class="pds-wiz-q">${T.wizVenue}</label>
          <div class="pds-wiz-opts">
            ${VENUES.map(v => `<button data-activation=write class="pds-wiz-opt ${A.venue===v?'active':''}" data-wiz-venue="${v}">${T['venue'+v]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizFloors}</label>
          <div class="pds-wiz-opts">
            ${[1,2,3,4].map(n => `<button data-activation=write class="pds-wiz-opt ${A.floors.length===n?'active':''}" data-wiz-floors="${n}">${n}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizExtras}</label>
          <div class="pds-wiz-opts">
            ${EXTRAS.map(e => `<button data-activation=write class="pds-wiz-opt ${A.extras.includes(e)?'active':''}" data-wiz-extra="${e}">${T['extra'+e]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizDims}</label>
          <div class="pds-wiz-dims">
            <label>${T.wizW}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-w value="${A.dims_default.w/100}"/><span class="pds-unit">m</span></label>
            <label>${T.wizH}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-h value="${A.dims_default.h/100}"/><span class="pds-unit">m</span></label>
            <span class="pds-wiz-area">${((A.dims_default.w*A.dims_default.h)/10000).toFixed(0)} m²</span>
          </div>

          <label class="pds-wiz-q">${T.wizTables}</label>
          <div class="pds-wiz-dims">
            <input class="pds-range" type="range" min="2" max="60" step="1" data-wiz-tables value="${A.tables}"/>
            <span class="pds-wiz-area" data-wiz-tables-out>${A.tables}</span>
          </div>

          <label class="pds-wiz-q">${T.wizKitchen}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button data-activation=write class="pds-wiz-opt ${A.kitchenWall===w?'active':''}" data-wiz-kw="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizEntrance}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button data-activation=write class="pds-wiz-opt ${A.entranceWall===w?'active':''}" data-wiz-ew="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizAlso}</label>
          <div class="pds-wiz-opts">
            <button data-activation=write class="pds-wiz-opt ${A.wc?'active':''}" data-wiz-wc>${T.fixwc}</button>
          </div>
        </div>`;

      const cardBody = () => `
        <div class="pds-wiz-cards">
          ${plans.map((p, i) => `
            <button data-activation=write class="pds-wiz-card ${chosen===i?'active':''}" data-wiz-pick="${i}">
              <span class="pds-wiz-thumb">${pdsPlanThumb(p)}</span>
              <span class="pds-wiz-card-name">${T['var'+p.variant]}</span>
              <span class="pds-wiz-card-nums">
                <b>${p.covers}</b> ${T.covers} · ${p.tableCount} ${T.tables}<br/>
                ${p.m2PerCover} m²/${T.cover} · ${T.aisleOf(p.aisle)}
              </span>
              ${p.shortfall ? `<span class="pds-wiz-short">${T.wizShort(p.shortfall, p.requested)}</span>` : ''}
            </button>`).join('')}
        </div>
        <p class="pds-wiz-note">${T.wizCardsNote}</p>`;

      const m = drawer({
        title: T.wizTitle, subtitle: T.wizDesc, width: 620,
        body: qBody(),
        foot: `<button class="kb ghost" data-dismiss>${T.close}</button>
               <button data-activation=write class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`,
      });
      wireDismiss(m);
      if (!m || !m.el) break;

      const bodyEl = () => m.el.querySelector('.kiwi-drawer-body') || m.el.querySelector('.kiwi-modal-body');
      const footEl = () => m.el.querySelector('.kiwi-drawer-foot') || m.el.querySelector('.kiwi-modal-foot');

      const build = () => {
        /* Vary the mix rotation per regeneration so "Régénérer" gives a
           genuinely different arrangement rather than the same one twice.
           A scanned mix (Scanner ma salle) wins over the venue default: it
           reflects the tables actually photographed in this room. */
        const mix = ((A.mix && A.mix.length) ? A.mix : (PDS_VENUE_MIX[A.venue] || PDS_VENUE_MIX.restaurant)).slice();
        for (let i = 0; i < (spin % Math.max(1, mix.length)); i++) mix.push(mix.shift());
        const ans = Object.assign({}, A, {
          mix,
          floors: A.floors,
          extras: A.extras.map(e => T['extra' + e]),
        });
        plans = ['dense', 'confort', 'banquettes'].map(v => pdsGeneratePlan(ans, v));
        chosen = 0;
      };

      const render = () => {
        const b = bodyEl(), f = footEl();
        if (step === 1) {
          if (b) b.innerHTML = qBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-dismiss>${T.close}</button>
                                <button data-activation=write class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`;
        } else {
          if (b) b.innerHTML = cardBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-wiz-back>${T.wizBack}</button>
                                <button class="kb ghost" data-wiz-again>${T.wizAgain}</button>
                                <button class="kb atlas" data-wiz-apply>${T.wizApply}</button>`;
        }
        wireDismiss(m);
        wire();
      };

      const wire = () => {
        const on = (sel, fn) => m.el.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
        on('[data-wiz-venue]', el => { A.venue = el.getAttribute('data-wiz-venue'); render(); });
        on('[data-wiz-floors]', el => {
          const n = +el.getAttribute('data-wiz-floors');
          const names = ['RDC', '1er', '2e', '3e'];
          A.floors = names.slice(0, n); render();
        });
        on('[data-wiz-extra]', el => {
          const k = el.getAttribute('data-wiz-extra');
          A.extras = A.extras.includes(k) ? A.extras.filter(x => x !== k) : A.extras.concat(k);
          render();
        });
        on('[data-wiz-kw]', el => { A.kitchenWall = el.getAttribute('data-wiz-kw'); render(); });
        on('[data-wiz-ew]', el => { A.entranceWall = el.getAttribute('data-wiz-ew'); render(); });
        on('[data-wiz-wc]', () => { A.wc = !A.wc; render(); });

        const wIn = m.el.querySelector('[data-wiz-w]'), hIn = m.el.querySelector('[data-wiz-h]');
        if (wIn) wIn.onchange = () => { A.dims_default.w = Math.round(Math.max(3, +wIn.value || 12) * 100); render(); };
        if (hIn) hIn.onchange = () => { A.dims_default.h = Math.round(Math.max(3, +hIn.value || 8) * 100); render(); };
        const tIn = m.el.querySelector('[data-wiz-tables]');
        if (tIn) {
          tIn.oninput = () => {
            A.tables = +tIn.value;
            const out = m.el.querySelector('[data-wiz-tables-out]');
            if (out) out.textContent = A.tables;
          };
        }

        const go = m.el.querySelector('[data-wiz-go]');
        if (go) go.onclick = () => { build(); step = 2; render(); };
        const back = m.el.querySelector('[data-wiz-back]');
        if (back) back.onclick = () => { step = 1; render(); };
        const again = m.el.querySelector('[data-wiz-again]');
        if (again) again.onclick = () => { spin++; build(); render(); };
        on('[data-wiz-pick]', el => { chosen = +el.getAttribute('data-wiz-pick'); render(); });

        const apply = m.el.querySelector('[data-wiz-apply]');
        if (apply) apply.onclick = () => {
          const p = plans[chosen];
          if (!p) return;
          pdsPush(state);
          state.zones = p.zones;
          state.tables = p.tables;
          state.elements = p.elements;
          state.activeZone = p.zones[0].id;
          state.v = 2;
          selection.clear();
          try { pdsSave(state); } catch (_) {}
          /* Closing this drawer takes the plan drawer underneath with it, so
             the merchant would land back on the dashboard having never seen
             the room they just built — the one moment it most needs to be on
             screen. Re-open it explicitly instead of assuming it survived. */
          m.close();
          refresh();
          setTimeout(() => {
            if (!document.querySelector('[data-pds-canvas]')) {
              try { handlers['nav-tables'](); } catch (_) {}
            }
            toast(T.wizDone(p.covers), {
              type: 'success',
              desc: p.shortfall ? T.wizShort(p.shortfall, p.requested) : T.wizDoneDesc(p.tableCount, p.aisle),
            });
          }, 60);
        };
      };

      wire();
      break;
    }
  }
}

function tableAction41(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'add-table':
    case 'add-table-default': {
      const type = action === 'add-table-default' ? 'round4' : btn.getAttribute('data-pds-type');
      const cfg = PDS_TABLE_TYPES[type] || PDS_TABLE_TYPES.round4;
      pdsPush(state);
      const plane = pdsPlaneOf(state);
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const num = String(state.tables.length + 1);
      const newT = {
        id: newTableId(),
        zone: state.activeZone,
        type,
        x: spot.x,
        y: spot.y,
        /* Geometry is stamped onto the instance at birth. The type is only a
           source of defaults from here on, so resizing this table cannot
           affect any other table of the same type. */
        w: cfg.w, h: cfg.h, seats: cfg.seats, shape: cfg.shape,
        color: null,
        num,
        status: 'free',
        server: null,
        notes: '',
        rot: 0,
        locked: false,
      };
      state.tables.push(newT);
      /* Select BEFORE rendering: handles are drawn by the renderer from the
         selection, so selecting afterwards left the new table without any. */
      selection.clear();
      selection.add(newT.id);
      refresh();
      toast(T.addedTableToast(num), { type: 'success', desc: T.addedTableDesc(cfg.seats, state.zones.find(z=>z.id===state.activeZone)?.name || '') });
      setTimeout(() => { if (state._openInspector) state._openInspector(newT.id); }, 0);
      break;
    }
  }
}

function tableAction42(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'add-el': {
      const type = btn.getAttribute('data-pds-eltype');
      const cfg = PDS_FIX[type];
      if (!cfg) break;
      const plane = pdsPlaneOf(state);
      pdsPush(state);
      /* Drop new fixtures in a free spot rather than always dead-centre, so
         adding three in a row doesn't stack them into one illegible pile. */
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
      const el = {
        id: newElId(), zone: state.activeZone, type,
        x: spot.x, y: spot.y, w: cfg.w, h: cfg.h, rot: 0,
        color: cfg.color, label: null, z: maxZ + 1, locked: false,
      };
      state.elements.push(el);
      selection.clear(); selection.add(el.id);
      refresh();
      if (state._openInspector) setTimeout(() => state._openInspector(el.id), 0);
      toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      break;
    }
  }
}

function tableAction43(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'clear-assign': {
      const m = modal({
        tag: T.tagPdS,
        title: T.clearAssignTitle,
        desc: T.clearAssignDesc,
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas pds-rail-danger" data-dismiss data-pds-clear-confirm>${T.clearAssignOk}</button>
        `,
      });
      wireDismiss(m);
      const confirm = m?.el?.querySelector('[data-pds-clear-confirm]');
      confirm?.addEventListener('click', () => {
        pdsPush(state);
        state.tables.forEach(t => { pdsSetServerIds(t, []); });
        refresh();
        toast(T.clearAssignDone, { type: 'success', desc: T.clearAssignDoneDesc });
      });
      break;
    }
  }
}

function tableAction44(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'add-server': {
      const m = modal({
        tag: T.tagPdS,
        title: T.rosterAddTitle,
        desc: T.rosterAddDesc,
        width: 460,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.rosterAddLabel}</label>
            <input class="kf-input pds-input" type="text" maxlength="40" data-pds-new-server placeholder="${T.rosterAddPlaceholder}"/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-new-server-ok>${T.rosterAddOk}</button>
        `,
      });
      wireDismiss(m);
      const input = m?.el?.querySelector('[data-pds-new-server]');
      try { input?.focus(); } catch (e) {}
      const commit = () => {
        const name = String(input?.value || '').trim();
        if (!name) { input?.focus(); return; }
        pdsPush(state);
        const id = 'sv-' + Date.now().toString(36);
        state.staff.push({ id, name, color: pdsStaffColor(id + name), from: 'local' });
        m?.close?.();
        refresh();
        toast(T.rosterAddDone(name), { type: 'success', desc: T.rosterHint });
      };
      m?.el?.querySelector('[data-pds-new-server-ok]')?.addEventListener('click', commit);
      input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
      break;
    }
  }
}

function tableAction45(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'del-server': {
      const sid = btn.getAttribute('data-pds-sid');
      const sv = state.staff.find(s => s.id === sid);
      if (!sv) break;
      pdsPush(state);
      const freed = state.tables.filter(t => pdsHasServer(t, sid)).length;
      state.tables.forEach(t => { if (pdsHasServer(t, sid)) pdsSetServerIds(t, pdsServerIds(t).filter(id => id !== sid)); });
      state.staff = state.staff.filter(s => s.id !== sid);
      refresh();
      toast(T.rosterRemoveDone(sv.name), { type: 'info', desc: T.rosterRemoveDoneDesc(freed) });
      break;
    }
  }
}

function tableAction46(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'rotate-configure': {
      const r0 = state.rotation || {};
      let chosenP = ['shift', 'daily', 'weekly'].includes(r0.period) ? r0.period : 'shift';
      let chosenS = ['zones', 'tables', 'pairs'].includes(r0.strategy) ? r0.strategy : 'zones';
      let auto = !!r0.auto;
      let pairs = (Array.isArray(r0.pairs) ? r0.pairs : []).filter(p => Array.isArray(p)).map(p => p.slice(0, 2));
      const staffOpts = (sel) => `<option value="">·</option>` + state.staff.map(x => `<option value="${pdsEsc(x.id)}" ${x.id === sel ? 'selected' : ''}>${pdsEsc(x.name)}</option>`).join('');
      const pairsHtml = () => `
        <div class="pds-pairs" data-pds-pairs ${chosenS === 'pairs' ? '' : 'hidden'}>
          <label class="kf-label">${pdsEsc(T.rotPairsPick)}</label>
          ${pairs.map((p, i) => `<div class="pds-pair-row" data-pds-pair="${i}">
              <select class="kf-input pds-input" data-pds-pair-a>${staffOpts(p[0])}</select>
              <span aria-hidden="true">⇄</span>
              <select class="kf-input pds-input" data-pds-pair-b>${staffOpts(p[1])}</select>
              <button class="pds-chip-x" type="button" data-pds-pair-del aria-label="${pdsEsc(T.versionDelete)}">×</button>
            </div>`).join('')}
          <button data-activation=write class="kb ghost" type="button" data-pds-pair-add>${pdsEsc(T.rotPairsAdd)}</button>
        </div>`;
      const m = modal({
        tag: T.tagPdS,
        title: T.rotateTitle,
        desc: T.rotateDesc,
        width: 600,
        body: `
          <div class="pds-rot-cfg">
            <label class="pds-toggle-row">
              <input type="checkbox" role="switch" data-pds-rot-auto ${auto ? 'checked' : ''}/>
              <span><b>${pdsEsc(T.rotateEnable)}</b><em data-pds-rot-auto-desc></em></span>
            </label>
            <div class="kf-group">
              <label class="kf-label">${T.rotatePeriod}</label>
              <div class="pds-pillrow" data-pds-period>
                ${[['shift', T.rotateShift], ['daily', T.rotateDaily], ['weekly', T.rotateWeekly]].map(([k, l]) => `
                  <button data-activation=write class="pds-cfg-pill ${chosenP === k ? 'active' : ''}" data-pds-p="${k}">${pdsEsc(l)}</button>
                `).join('')}
              </div>
            </div>
            <div class="kf-group">
              <label class="kf-label">${T.rotateStrategy}</label>
              <div class="pds-strat-cards" data-pds-strat>
                ${[['zones', T.rotZones, T.rotZonesDesc], ['tables', T.rotTables, T.rotTablesDesc], ['pairs', T.rotPairs, T.rotPairsDesc]].map(([k, l, d]) => `
                  <button data-activation=write class="pds-strat-card ${chosenS === k ? 'active' : ''}" data-pds-s="${k}">
                    <b>${pdsEsc(l)}</b>
                    <em>${pdsEsc(d)}</em>
                  </button>
                `).join('')}
              </div>
            </div>
            <div data-pds-pairs-host>${pairsHtml()}</div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas" data-pds-rot-apply>${T.rotApply}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const autoDesc = () => {
        const d = m.el.querySelector('[data-pds-rot-auto-desc]');
        if (d) d.textContent = auto ? T.rotateAuto(chosenP === 'daily' ? T.rotateAutoDaily : chosenP === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift) : T.rotateOff;
      };
      const readPairs = () => {
        pairs = [...m.el.querySelectorAll('[data-pds-pair]')].map(row => [
          row.querySelector('[data-pds-pair-a]').value, row.querySelector('[data-pds-pair-b]').value]);
      };
      const wirePairs = () => {
        const host = m.el.querySelector('[data-pds-pairs-host]');
        if (!host) return;
        host.innerHTML = pairsHtml();
        host.querySelector('[data-pds-pair-add]')?.addEventListener('click', () => { readPairs(); pairs.push(['', '']); wirePairs(); });
        host.querySelectorAll('[data-pds-pair-del]').forEach(b => b.addEventListener('click', () => {
          readPairs(); pairs.splice(+b.closest('[data-pds-pair]').getAttribute('data-pds-pair'), 1); wirePairs();
        }));
        host.querySelectorAll('select').forEach(sel => sel.addEventListener('change', readPairs));
      };
      autoDesc();
      wirePairs();
      m.el.querySelector('[data-pds-rot-auto]')?.addEventListener('change', (e) => { auto = e.target.checked; autoDesc(); });
      m.el.querySelectorAll('[data-pds-p]').forEach(b => {
        b.addEventListener('click', () => {
          chosenP = b.getAttribute('data-pds-p');
          m.el.querySelectorAll('[data-pds-p]').forEach(o => o.classList.toggle('active', o === b));
          autoDesc();
        });
      });
      m.el.querySelectorAll('[data-pds-s]').forEach(b => {
        b.addEventListener('click', () => {
          readPairs();
          chosenS = b.getAttribute('data-pds-s');
          m.el.querySelectorAll('[data-pds-s]').forEach(o => o.classList.toggle('active', o === b));
          if (chosenS === 'pairs' && !pairs.length) pairs.push(['', '']);
          wirePairs();
        });
      });
      m.el.querySelector('[data-pds-rot-apply]')?.addEventListener('click', () => {
        readPairs();
        const clean = pairs.filter(p => p[0] && p[1] && p[0] !== p[1]);
        if (chosenS === 'pairs' && !clean.length) { toast(T.rotPairsNone, { type: 'warn' }); return; }
        pdsPush(state);
        const keepKey = r0.period === chosenP && r0.auto ? r0.lastKey : undefined;
        state.rotation = { period: chosenP, strategy: chosenS, enabled: true, auto, pairs: clean, lastAt: r0.lastAt || 0 };
        /* Switching it on arms it for the NEXT period: nobody's tables move
           the moment the owner saves the settings. */
        state.rotation.lastKey = keepKey || pdsRotationKey(chosenP);
        m.close();
        refresh();
        toast(T.rotApplied, { type: 'success', desc: auto ? T.rotateAuto(chosenP === 'daily' ? T.rotateAutoDaily : chosenP === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift) : T.rotateOff });
      });
      break;
    }
  }
}

function tableAction47(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'rotate-now': {
      const r = state.rotation || { strategy: 'zones' };
      if (r.strategy !== 'pairs' && state.staff.length < 2) { toast(T.rotNeedStaff, { type: 'warn' }); break; }
      pdsPush(state);
      pdsApplyAssignment(state, pdsRotateStep(state, state.tables, r.strategy, r.pairs));
      pdsRecordRotation(state, 'manual');
      state.rotation = Object.assign({}, r, { lastAt: Date.now() });
      refresh();
      toast(T.rotNowDone, { type: 'success', desc: T.rotNowDoneDesc,
        action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) refresh(); } } });
      break;
    }
  }
}

function tableAction48(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'table-rotate':
    case 'rot-90': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.o.locked) break;
      pdsPush(state);
      const step = action === 'rot-90' ? 90 : 45;
      f.o.rot = ((f.o.rot || 0) + step) % 360;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
  }
}

function tableAction49(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'ambiance': {
      const key = btn.getAttribute('data-pds-amb');
      pdsPush(state);
      if (pdsApplyAmbiance(state, state.activeZone, key)) {
        refresh();
        toast(T.ambianceApplied(T['amb' + key]), { type: 'success', desc: T.ambianceDesc });
      }
      break;
    }
  }
}

function tableAction50(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'table-duplicate': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        /* The copy takes the next free number. « 4· » was a number nobody
           could type on the till. */
        const newT = { ...f.o, id: newTableId(), x: f.o.x + 24, y: f.o.y + 24, num: pdsNextNum(state) };
        delete newT.group;
        pdsSetStatus(newT, 'free');
        state.tables.push(newT);
        selection.clear(); selection.add(newT.id);
        refresh();
        toast(T.addedTableToast(newT.num), { type: 'success', desc: T.addedTableDesc(pdsGeom(newT).seats, state.zones.find(z=>z.id===newT.zone)?.name || '') });
      } else {
        const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
        const newE = { ...f.o, id: newElId(), x: f.o.x + 24, y: f.o.y + 24, z: maxZ + 1 };
        state.elements.push(newE);
        selection.clear(); selection.add(newE.id);
        refresh();
        toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      }
      break;
    }
  }
}

function tableAction51(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'table-delete': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        const affected = f.o.group ? state.tables.filter(t => t.group === f.o.group) : [f.o];
        const snapshot = pdsTableSnapshot(state, affected);
        const title = `Table ${f.o.num} · ${T.deletedSuffix}`;
        state.tables.splice(state.tables.findIndex(o => o.id === id), 1);
        if (typeof pdsBury === 'function') pdsBury(state, id);
        pdsSweepGroups(state);
        selection.delete(id);
        refresh();
        pdsOfferTableUndo(state, T, snapshot, refresh, selection, title, T.deleteUndone, id);
        break;
      } else {
        state.elements.splice(state.elements.findIndex(o => o.id === id), 1);
        if (typeof pdsBury === 'function') pdsBury(state, id);
        toast(`${T['fix'+f.o.type] || f.o.type} · ${T.deletedSuffix}`, { type: 'warn', duration: 1400 });
      }
      selection.delete(id);
      refresh();
      break;
    }
  }
}

function tableAction52(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'table-group': {
      /* Arme le mode « choisir la seconde table » — le pointerdown de la
       * table cliquée ensuite fait la liaison (voir pdsAttachDrag). */
      const id = btn.getAttribute('data-pds-id');
      state._groupPickFrom = id;
      toast(T.groupPickHint, { duration: 2600 });
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
  }
}

function tableAction53(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'table-ungroup': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || !f.table || !f.o.group) break;
      pdsPush(state);
      const gid = f.o.group;
      const snapshot = pdsTableSnapshot(state, state.tables.filter(tt => tt.group === gid));
      state.tables.forEach(tt => { if (tt.group === gid) delete tt.group; });
      refresh();
      pdsOfferTableUndo(state, T, snapshot, refresh, selection, T.ungroupOk, T.ungroupUndone, id);
      break;
    }
  }
}

function tableAction54(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'obj-lock': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      f.o.locked = !f.o.locked;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
  }
}

function tableAction55(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'seats-up':
    case 'seats-down': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      const cur = pdsGeom(f.o).seats;
      f.o.seats = Math.max(0, Math.min(24, cur + (action === 'seats-up' ? 1 : -1)));
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
  }
}

function tableAction56(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'layer-back':
    case 'layer-front': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.table) break;
      pdsPush(state);
      const zs = state.elements.map(e => e.z || 0);
      f.o.z = action === 'layer-front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
  }
}

function tableAction57(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'undo': {
      if (!pdsUndo(state)) { toast(T.undoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
  }
}

function tableAction58(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'redo': {
      if (!pdsRedo(state)) { toast(T.redoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
  }
}

function tableAction59(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-align-h': {
      if (selection.size < 2) break;
      pdsPush(state);
      const ids = [...selection];
      const ys = ids.map(id => state.tables.find(t => t.id === id)?.y).filter(v => v != null);
      const avg = Math.round(ys.reduce((a,b) => a+b, 0) / ys.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.y = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
  }
}

function tableAction60(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-align-v': {
      if (selection.size < 2) break;
      pdsPush(state);
      const ids = [...selection];
      const xs = ids.map(id => state.tables.find(t => t.id === id)?.x).filter(v => v != null);
      const avg = Math.round(xs.reduce((a,b) => a+b, 0) / xs.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.x = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
  }
}

function tableAction61(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-dist-h': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      pdsPush(state);
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.x - b.x);
      const span = arr[arr.length-1].x - arr[0].x;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.x = Math.round((arr[0].x + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
  }
}

function tableAction62(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-dist-v': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      pdsPush(state);
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.y - b.y);
      const span = arr[arr.length-1].y - arr[0].y;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.y = Math.round((arr[0].y + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
  }
}

function tableAction63(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-delete': {
      const n = selection.size;
      const selectedGroups = new Set();
      selection.forEach(id => {
        const t = state.tables.find(tt => tt.id === id);
        if (t && t.group) selectedGroups.add(t.group);
      });
      const affected = state.tables.filter(t => selection.has(t.id) || (t.group && selectedGroups.has(t.group)));
      const snapshot = pdsTableSnapshot(state, affected);
      const firstId = [...selection][0] || null;
      pdsPush(state);
      if (typeof pdsBury === 'function') pdsBury(state, state.tables.filter(t => selection.has(t.id)).map(t => t.id));
      state.tables = state.tables.filter(t => !selection.has(t.id));
      pdsSweepGroups(state);
      selection.clear();
      refresh();
      pdsOfferTableUndo(state, T, snapshot, refresh, selection, T.bulkOkDelete(n), T.deleteUndone, firstId);
      break;
    }
  }
}

function tableAction64(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-group': {
      const picked = state.tables.filter(t => selection.has(t.id));
      if (picked.length < 2) break;
      pdsPush(state);
      const touchedGroups = new Set(picked.map(t => t.group).filter(Boolean));
      const members = state.tables.filter(t => selection.has(t.id) || (t.group && touchedGroups.has(t.group)));
      const anchor = picked.find(t => t.group) || picked[0];
      const gid = anchor.group || ('grp' + Date.now().toString(36));
      members.forEach(t => { t.group = gid; });
      pdsSyncGroupService(state, gid, anchor);
      refresh();
      toast(T.bulkOkGroup(members.length), { type: 'success' });
      setTimeout(() => state._openBulkInspector(), 0);
      break;
    }
  }
}

function tableAction65(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-clear': {
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
  }
}

function tableAction66(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'bulk-status': {
      const st = btn.getAttribute('data-pds-status');
      const n = selection.size;
      const gids = new Set();
      pdsPush(state);
      selection.forEach(id => {
        const t = state.tables.find(tt => tt.id === id);
        if (!t) return;
        pdsSetStatus(t, st);
        if (t.group) gids.add(t.group);
      });
      /* Le statut déborde sur les partenaires de groupe hors sélection. */
      state.tables.forEach(tt => {
        if (tt.group && gids.has(tt.group) && !selection.has(tt.id)) pdsSetStatus(tt, st);
      });
      refresh();
      toast(T.bulkOkStatus(n, pdsStatusLabel(st, T)), { type: 'success', duration: 1400 });
      break;
    }
  }
}

function tableAction67(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
case 'deselect': {
      /* Close inspector × button — clears the current selection and returns
       *   to the empty inspector / décor picker pane. */
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
  }
}

function tableAction68(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);
  switch (action) {
default: {
      Kiwi.toast(action, { type: 'info', desc: T.soonAvailable, duration: 1400 });
    }
  }
}

return { pdsFixMini, pdsPlanThumb, pdsRenderRoomCard, pdsRenderAssignRail, pdsRenderAssignSummary, pdsRenderInspector, pdsRenderBulkInspector, pdsSyncGroupService, pdsExpireReservations, pdsOfferTableUndo, pdsRenderGroups, pdsRotationKey, pdsRotateStep, pdsFairness, pdsRenderRotateStage, pdsRenderActions, pdsAttachDrag, pdsAttachElDrag, pdsAttachChipDrag, pdsRenumber, pdsSaveVersion, pdsOpenVersions, pdsPlaceBooking, pdsExportSvg, pdsExportPrint, pdsExportPng, tableAction26, tableAction27, tableAction28, tableAction29, tableAction30, tableAction31, tableAction32, tableAction33, tableAction34, tableAction35, tableAction36, tableAction37, tableAction38, tableAction39, tableAction40, tableAction41, tableAction42, tableAction43, tableAction44, tableAction45, tableAction46, tableAction47, tableAction48, tableAction49, tableAction50, tableAction51, tableAction52, tableAction53, tableAction54, tableAction55, tableAction56, tableAction57, tableAction58, tableAction59, tableAction60, tableAction61, tableAction62, tableAction63, tableAction64, tableAction65, tableAction66, tableAction67, tableAction68 };
};
