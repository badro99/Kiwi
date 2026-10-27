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
