const PDS_ZONE_COLORS = ['#0B6E4F', '#053B2C', '#C89235', '#B5653A', '#7A8B6F', '#5A6CDB', '#C0306E', '#2C2520'];
/* Folded sections (« Style de la salle ») keep their state across the
   re-renders that every edit triggers. */
const PDS_FOLD = {};
function pdsRenderLayoutRail(state, T) {
  const groups = {};
  Object.entries(PDS_FIX).forEach(([k, v]) => { (groups[v.grp] = groups[v.grp] || []).push([k, v]); });
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const zi = state.zones.indexOf(zone);
  const dups = pdsDuplicateNums(state);
  /* Les clés sont en minuscules (grpsalle) : la recherche capitalisée tombait
     toujours sur PDS_FIX_GRP, en français sous EN et AR. */
  const grpName = (grp) => T['grp' + grp] || PDS_FIX_GRP[grp];
  return `
    ${dups.length ? `<div class="pds-rail-warn" role="status">
      <span>${pdsEsc(T.dupNums(dups.join(', ')))}</span>
      <button class="pds-link" data-pds-action="renumber">${pdsEsc(T.renumber)}</button>
    </div>` : ''}
    <section class="pds-rail-card">
      <h3 class="pds-rail-title">${T.paletteTitle}</h3>
      <div class="pds-pal-seats">
        <span>${pdsEsc(T.paletteSeats)}</span>
        <div class="pds-step">
          <button class="pds-step-btn" data-pds-action="pal-seats" data-pds-delta="-1" aria-label="${pdsEsc(T.inspectorSeats)} −">−</button>
          <output class="pds-step-out" data-pds-pal-seats>${PDS_PAL_SEATS}</output>
          <button class="pds-step-btn" data-pds-action="pal-seats" data-pds-delta="1" aria-label="${pdsEsc(T.inspectorSeats)} +">+</button>
        </div>
      </div>
      <div class="pds-palette pds-palette-shapes">
        ${PDS_SHAPES.map(sh => {
          const t = PDS_TABLE_TYPES[pdsTypeFor(sh, PDS_PAL_SEATS)];
          const label = T['shape' + sh.charAt(0).toUpperCase() + sh.slice(1)];
          return `
            <button data-activation=write class="pds-pal-item" data-pds-action="add-shape" data-pds-shape="${sh}" title="${pdsEsc(label)} · ${pdsPalSeats(sh)} ${pdsEsc(T.seats)}">
              <span class="pds-pal-shape pds-pal-${t.shape}" style="width:${Math.min(t.w/2, 30)}px; height:${Math.min(t.h/2, 26)}px;"></span>
              <span class="pds-pal-label">${pdsEsc(label)}</span>
            </button>`;
        }).join('')}
      </div>
    </section>
    <section class="pds-rail-card">
      <h3 class="pds-rail-title">${pdsEsc(T.furnitureTitle)}</h3>
      ${Object.entries(groups).map(([grp, items], gi) => {
        const key = 'grp-' + grp;
        const open = PDS_FOLD[key] == null ? gi === 0 : PDS_FOLD[key];
        return `
        <details class="pds-fold pds-fold-sub" data-pds-fold="${key}"${open ? ' open' : ''}>
          <summary class="pds-rail-sub">${pdsEsc(grpName(grp))}<em>${items.length}</em></summary>
          <div class="pds-palette pds-palette-el">
            ${items.map(([k, v]) => `
              <button data-activation=write class="pds-pal-item pds-pal-el" data-pds-action="add-el" data-pds-eltype="${k}" title="${T['fix' + k] || k}">
                <span class="pds-pal-mini">${pdsFixMini(k, v)}</span>
                <span class="pds-pal-label">${T['fix' + k] || k}</span>
              </button>`).join('')}
          </div>
        </details>`;
      }).join('')}
    </section>
    <section class="pds-rail-card">
      <div class="pds-rail-head">
        <h3 class="pds-rail-title">${pdsEsc(zone ? pdsZoneName(zone) : '')}</h3>
        <span class="pds-rail-head-tools">
          <button class="pds-tool" data-pds-action="zone-move" data-pds-delta="-1" title="${pdsEsc(T.zoneMoveL)}" aria-label="${pdsEsc(T.zoneMoveL)}"${zi <= 0 ? ' disabled' : ''}>${pdsIcon('chevron_left')}</button>
          <button class="pds-tool" data-pds-action="zone-move" data-pds-delta="1" title="${pdsEsc(T.zoneMoveR)}" aria-label="${pdsEsc(T.zoneMoveR)}"${zi >= state.zones.length - 1 ? ' disabled' : ''}>${pdsIcon('chevron_right')}</button>
        </span>
      </div>
      <div class="pds-zone-tools">
        <button class="kb ghost" data-pds-action="rename-zone">${pdsEsc(T.renameShort)}</button>
        <button class="kb ghost" data-pds-action="zone-duplicate">${pdsEsc(T.duplicateShort)}</button>
      </div>
      <div class="pds-rail-sub">${pdsEsc(T.zoneColor)}</div>
      <div class="pds-sw-row">
        <button data-activation=write class="pds-sw pds-sw-none ${zone && zone.color ? '' : 'active'}" data-pds-action="zone-color" data-pds-val="" title="${pdsEsc(T.backdropNone)}" aria-label="${pdsEsc(T.backdropNone)}"></button>
        ${PDS_ZONE_COLORS.map(c => `<button data-activation=write class="pds-sw ${zone && zone.color === c ? 'active' : ''}" data-pds-action="zone-color" data-pds-val="${c}" style="background:${c};" aria-label="${c}"></button>`).join('')}
      </div>
      <button data-activation=write class="pds-link pds-link-danger" data-pds-action="delete-zone">${T.deleteZone}</button>
    </section>
    ${pdsRenderRoomCard(state, T)}
  `;
}

/* Palette thumbnail — the fixture drawn by its own draw() at a small size, so
   the button always shows what will actually be placed. No second artwork to
   keep in sync. */
function pdsFixMini() { return tableOperations().pdsFixMini.apply(this, arguments); }

/* Thumbnail drawn from the candidate's OWN objects. The five templates
   shipped hand-drawn previews next to a stored cover count, which is how
   a card advertising 60 covers could load a plan holding 98 — two sources
   of truth for one number. Here there is only the plan. */
function pdsPlanThumb() { return tableOperations().pdsPlanThumb.apply(this, arguments); }

/* Room panel — floor, walls, finish, dimensions. Replaces the six-scene
   dropdown: instead of picking one of six frozen drawings, the merchant sets
   the four properties those drawings differed by. */
function pdsRenderRoomCard() { return tableOperations().pdsRenderRoomCard.apply(this, arguments); }

/* Assignation rail — roster of servers */
function pdsRenderAssignRail() { return tableOperations().pdsRenderAssignRail.apply(this, arguments); }

/* Empty inspector */
function pdsRenderInspectorEmpty(state, T) {
  const head = state.mode === 'assign'
    ? `<div class="pds-rail-card pds-inspect-empty">
        <div class="pds-rail-title">${T.modeAssign}</div>
        <div class="pds-rail-hint">${T.modeAssignDesc}</div>
        ${pdsRenderAssignSummary(state, T)}
      </div>`
    : `<div class="pds-rail-card pds-inspect-empty pds-inspect-hint">
        <div class="pds-rail-title">${T.selection}</div>
        <div class="pds-rail-hint">${pdsEsc(T.bulkHintNone)}</div>
        ${state.mode === 'layout' ? `<p class="pds-kbd-hint">${pdsEsc(T.kbdHint)}</p>` : ''}
      </div>`;
  return pdsRenderLivePanel(state, T) + head;
}

/* « En ce moment » — what the inspector column shows when nothing is
   selected, instead of a lone hint in 240 px of blank paper. Everything here
   is read from the till and from Réservations; nothing is typed. */
function pdsRenderLivePanel(state, T) {
  const now = Date.now();
  const zoneName = (id) => (state.zones.find(z => z.id === id) || {}).name || '';
  const num = (t) => pdsTableNum(t);
  const rows = state.tables.map(t => ({ t, e: pdsEff(t) }));
  const bills = rows.filter(r => r.e.status === 'bill');
  const check = rows.filter(r => r.e.since && (r.e.status === 'occupied' || r.e.status === 'ordering' || r.e.status === 'bill') && pdsSince(r.e.since)?.check);
  const goto = (t, body) => `<button type="button" class="pds-live-row" data-pds-goto="${pdsEsc(t.id)}">${body}</button>`;
  let html = `<div class="pds-rail-card pds-live" data-pds-live-panel>
    <div class="pds-live-head"><div class="pds-rail-title">${pdsEsc(T.liveTitle)}</div></div>`;
  if (bills.length) {
    html += `<div class="pds-live-sec is-urgent"><div class="pds-live-sub">${pdsEsc(T.liveBills)} · ${bills.length}</div>
      ${bills.map(({ t, e }) => goto(t, `<b>${pdsEsc(num(t))}</b><span>${pdsEsc(zoneName(t.zone))}</span><em>${e.billCents ? pdsEsc(T.mad(e.billCents / 100)) : ''}</em>`)).join('')}
    </div>`;
  }
  if (check.length) {
    html += `<div class="pds-live-sec is-check"><div class="pds-live-sub">${pdsEsc(T.liveCheck)} · ${check.length}</div>
      <p class="pds-live-note">${pdsEsc(T.liveCheckHint)}</p>
      ${check.map(({ t, e }) => goto(t, `<b>${pdsEsc(num(t))}</b><span>${pdsEsc(zoneName(t.zone))}</span><em>${pdsEsc(pdsSince(e.since).label)}</em>`)).join('')}
    </div>`;
  }
  /* Today's bookings: placed first by time, then the ones without a table. */
  const placed = [];
  Object.keys(PDS_BOOK.byTable || {}).forEach(id => {
    const t = state.tables.find(x => x.id === id);
    (PDS_BOOK.byTable[id] || []).forEach(b => { if (t && b.startAt >= now - 15 * 60000) placed.push({ b, t }); });
  });
  placed.sort((a, b) => a.b.startAt - b.b.startAt);
  const unplaced = (PDS_BOOK.unplaced || []).filter(b => b.startAt >= now - 15 * 60000);
  html += `<div class="pds-live-sec"><div class="pds-live-sub">${pdsEsc(T.liveUpcoming)}${placed.length + unplaced.length ? ' · ' + (placed.length + unplaced.length) : ''}</div>`;
  if (!placed.length && !unplaced.length) html += `<p class="pds-live-note">${pdsEsc(T.liveNoBookings)}</p>`;
  html += placed.slice(0, 8).map(({ b, t }) => goto(t,
    `<b>${pdsEsc(pdsClock(b.startAt))}</b><span>${pdsEsc(b.name)}${b.partySize ? ` · ${b.partySize}p` : ''}</span><em>${pdsEsc(num(t))}</em>`)).join('');
  html += unplaced.slice(0, 6).map(b => `<div class="pds-live-row is-unplaced">
      <b>${pdsEsc(pdsClock(b.startAt))}</b><span>${pdsEsc(b.name)}${b.partySize ? ` · ${b.partySize}p` : ''}</span>
      <button type="button" class="kb ghost pds-live-place" data-pds-action="place-booking" data-pds-booking="${pdsEsc(b.id)}">${pdsEsc(T.livePlace)}</button>
    </div>`).join('');
  html += `</div>`;
  /* Today, per zone: turns, average time at table, revenue per seat. */
  if (PDS_LIVE && PDS_LIVE.live) {
    const zones = state.zones.map(z => {
      const ts = state.tables.filter(t => t.zone === z.id);
      let turns = 0, open = 0, minutes = 0, timed = 0, rev = 0;
      ts.forEach(t => {
        const st = pdsStatsOf(t);
        if (!st) return;
        turns += st.turns || 0; open += st.open || 0; rev += st.revenueCents || 0;
        if (st.avgMinutes) { minutes += st.avgMinutes * (st.turns || 1); timed += st.turns || 1; }
      });
      const seats = ts.reduce((n, t) => n + pdsGeom(t).seats, 0);
      return { z, turns, open, avg: timed ? Math.round(minutes / timed) : 0, perSeat: seats ? rev / 100 / seats : 0 };
    }).filter(x => x.turns || x.open);
    html += `<div class="pds-live-sec"><div class="pds-live-sub">${pdsEsc(T.liveToday)}</div>`;
    html += zones.length
      ? zones.map(x => `<div class="pds-live-stat"><b>${pdsEsc(pdsZoneName(x.z))}</b>
          <span>${pdsEsc(T.liveTurns(x.turns))}${x.open ? ' · ' + pdsEsc(T.liveOpen(x.open)) : ''}${x.avg ? ' · ' + pdsEsc(T.liveAvg(x.avg)) : ''}</span>
          <em>${pdsEsc(T.liveRevSeat(T.mad(x.perSeat)))}</em></div>`).join('')
      : `<p class="pds-live-note">${pdsEsc(T.liveNoStats)}</p>`;
    html += `</div>`;
  }
  return html + `</div>`;
}

function pdsRenderAssignSummary() { return tableOperations().pdsRenderAssignSummary.apply(this, arguments); }

/* ─── Inspector ───────────────────────────────────────────────────────────
 *   One inspector serves tables and fixtures. Geometry (X/Y/W/H/rotation) is
 *   editable numerically as well as by handle, because "make both banquettes
 *   exactly 240 wide" is not a drag gesture.                               */
function pdsRenderInspector() { return tableOperations().pdsRenderInspector.apply(this, arguments); }

/* Ce que le patron peut marquer à la main. Dans un vrai magasin, le service
   (en cours, addition, réglée) appartient à la caisse : il ne garde que ce
   qu'elle ignore. Sur une démo, toute la palette, pour montrer la salle. */
function pdsManualStatuses() {
  return pdsIsRealStore() ? ['free', 'reserved', 'out'] : ['free', 'ordering', 'occupied', 'bill', 'paid', 'reserved', 'out'];
}
function pdsRenderStatusRow(state, T, obj) {
  const eff = pdsEff(obj);
  const manual = obj.status === 'out' ? 'out' : pdsStatusKey(obj.status);
  const fromTill = eff.source === 'till' && eff.status !== 'free';
  let html = '';
  if (fromTill || (PDS_LIVE && PDS_LIVE.live)) {
    const si = eff.since ? pdsSince(eff.since) : null;
    const g = pdsGeom(obj);
    html += `<div class="pds-form-row">
      <label>${pdsEsc(T.tillStatus)}</label>
      <div class="pds-till-status pds-till-${eff.status}">
        <span class="pds-legend-swatch pds-sw-${eff.status}"></span>
        <b>${pdsEsc(pdsStatusLabel(eff.status, T))}</b>
        ${eff.covers && eff.status !== 'free' ? `<span>${pdsEsc(T.coversNow(eff.covers, g.seats))}</span>` : ''}
        ${si && eff.status !== 'free' ? `<span>${pdsEsc(si.check ? T.checkTable : T.since(si.label))}</span>` : ''}
        ${eff.billCents ? `<span>${pdsEsc(T.billNow)} · ${pdsEsc(T.mad(eff.billCents / 100))}</span>` : ''}
      </div>
      <p class="pds-field-hint">${pdsEsc(T.tillStatusHint)}</p>
    </div>`;
  }
  const choices = pdsManualStatuses();
  html += `<div class="pds-form-row">
    <label>${pdsEsc(pdsIsRealStore() ? T.holdLabel : T.inspectorStatus)}</label>
    <div class="pds-status-pills" data-pds-status-row>
      ${choices.map(st => `
        <button data-activation=write class="pds-status-pill pds-pill-${st} ${manual === st ? 'active' : ''}" data-pds-status="${st}" aria-pressed="${manual === st}">
          ${pdsEsc(st === 'free' && pdsIsRealStore() ? T.holdNone : pdsStatusLabel(st, T))}
        </button>`).join('')}
    </div>
  </div>`;
  if (eff.booking) {
    html += `<div class="pds-group-info">${pdsEsc(pdsClock(eff.booking.startAt))} · ${pdsEsc(eff.booking.name)}${eff.booking.partySize ? ' · ' + eff.booking.partySize + 'p' : ''}</div>`;
  }
  return html;
}

function pdsRenderBulkInspector() { return tableOperations().pdsRenderBulkInspector.apply(this, arguments); }
