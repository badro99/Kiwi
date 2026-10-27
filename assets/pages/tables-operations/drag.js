
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
