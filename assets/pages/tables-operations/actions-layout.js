
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
