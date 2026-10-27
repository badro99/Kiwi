
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
