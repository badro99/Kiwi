
    /* ---- covers modal ---- */
    function openNewTableModal(tableId) {
      newTableId = tableId;
      newTableCovers = Math.max(2, tables[tableId]?.covers || 2);
      $('#nt-table-id').textContent = tableId;
      renderNewTableChips();
      $('#new-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderNewTableChips() {
      $('#nt-covers-chips').innerHTML = [1,2,3,4,5,6,7,8].map(n =>
        `<button class="nt-chip ${n === newTableCovers ? 'is-active' : ''}" data-nt-covers="${n}">${n}</button>`
      ).join('');
    }

    function confirmNewTable() {
      if (!newTableId) return;
      $('#new-table-modal').classList.remove('is-open');
      const t = tables[newTableId];
      tableSettlement().project(t, { covers: newTableCovers });
      t.size    = newTableCovers >= 5 ? 6 : (newTableCovers <= 2 ? 2 : 4);
      tableSettlement().project(t, { status: 'ka-yaklo' });
      resetTableTimer(t);
      tableSettlement().project(t, {}, ['discount']); // Toute nouvelle table démarre sans remise
      /* A former party's split can survive an older till snapshot. Starting a
         genuinely new table invalidates it even if the old close was missed. */
      tableSplits.delete(newTableId);
      delete tableClosedAt[tableKey(newTableId)]; // Nouvelle table légitime · lever le filtre de fermeture
      currentOrder().replaceTable(newTableId, []);
      serviceFloorLocalVersion[newTableId] = Date.now();
      serviceFloorRemoteVersion[newTableId] = Math.max(serviceFloorRemoteVersion[newTableId] || 0, Date.now());
      refreshTableNode(newTableId);
      selectedId = newTableId;
      newTableId = null;
      setMode('order');
    }

    function openWaitlistModal() {
      wlDraft = { name: '', size: 2, pref: 'peu-importe' };
      $('#wl-name').value = '';
      renderWaitlistChips();
      $('#waitlist-modal').classList.add('is-open');
      setTimeout(() => $('#wl-name').focus(), 60);
      lucide.createIcons();
    }

    function renderWaitlistChips() {
      $('#wl-size-chips').innerHTML = [1,2,3,4,5,6,7,8].map(n =>
        `<button class="nt-chip ${n === wlDraft.size ? 'is-active' : ''}" data-wl-size="${n}">${n}</button>`
      ).join('');
      $('#wl-pref-chips').innerHTML = Object.entries(WL_PREFS).map(([key, p]) =>
        `<button class="wl-pref-chip ${key === wlDraft.pref ? 'is-active' : ''}" data-wl-pref="${key}"><i data-lucide="${p.icon}"></i>${p.label}</button>`
      ).join('');
      lucide.createIcons();
    }

    function confirmWaitlistAdd() {
      const name = ($('#wl-name').value || '').trim();
      if (!name) { $('#wl-name').focus(); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajoute un nom')); return; }
      waitlist.push({ id: ++wlSeq, name, size: wlDraft.size, pref: wlDraft.pref, addedAt: Date.now() });
      $('#waitlist-modal').classList.remove('is-open');
      renderWaitlist();
      toast(`${name} ajouté·e à la file`);
    }

    function wlWaitMins(entry) {
      return Math.max(0, Math.round((Date.now() - entry.addedAt) / 60000));
    }

    function renderWaitlist() {
      const list = $('#waitlist-list');
      if (!list) return;
      if (!waitlist.length) {
        list.innerHTML = `<div class="wl-empty">
          <i data-lucide="users"></i>
          <div class="wl-empty-title">Personne en attente</div>
          <div class="wl-empty-sub">Clique « Ajouter à la file » quand un client se présente sans réservation.</div>
        </div>`;
        lucide.createIcons();
        return;
      }
      list.innerHTML = waitlist.map((e, i) => {
        const pref = WL_PREFS[e.pref] || WL_PREFS['peu-importe'];
        const mins = wlWaitMins(e);
        const wait = mins === 0 ? "à l'instant" : `${mins} min`;
        return `<div class="wl-card" data-wl-id="${e.id}">
          <div class="wl-pos">${i + 1}</div>
          <div class="wl-main">
            <div class="wl-name">${kdsEsc(e.name)}</div>
            <div class="wl-meta">
              <span class="wl-size"><i data-lucide="users"></i>${e.size} pers.</span>
              <span class="wl-pref"><i data-lucide="${pref.icon}"></i>${pref.label}</span>
              <span class="wl-wait">${wait}</span>
            </div>
          </div>
          <div class="wl-acts">
            <button class="wl-act seat" data-wl-seat="${e.id}"><i data-lucide="door-open"></i>Attabler</button>
            <button class="wl-act remove" data-wl-remove="${e.id}"><i data-lucide="x"></i>Retirer</button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    /* "Attabler" · open the Plan de salle and let the hostess tap a free table. */
    function startSeating(id) {
      const e = waitlist.find(w => w.id === id);
      if (!e) return;
      wlSeating = e;
      const pref = WL_PREFS[e.pref] || WL_PREFS['peu-importe'];
      const bn = $('#wl-seat-banner-text');
      if (bn) bn.innerHTML = `<i data-lucide="armchair"></i><span>Installer <strong>${kdsEsc(e.name)}</strong> <em>· ${e.size} pers. · ${pref.label} · touche une table libre</em></span>`;
      document.body.classList.add('is-seating');
      setMode('salle');
      markSeatTables();
      lucide.createIcons();
    }

    /* Flag free tables (selectable) vs occupied (dimmed) for the seating overlay. */
    function markSeatTables() {
      $$(TBL_SEL).forEach(c => {
        const t = tables[c.dataset.table];
        const free = !!(t && t.status === 'khawya');
        c.classList.toggle('wl-seat-free', free);
        c.classList.toggle('wl-seat-dim', !free);
      });
    }

    function endSeating(backToList) {
      wlSeating = null;
      document.body.classList.remove('is-seating');
      $$(TBL_SEL).forEach(c => c.classList.remove('wl-seat-free', 'wl-seat-dim'));
      if (backToList) { setMode('waitlist'); renderWaitlist(); }
    }

    function seatPartyAt(tableId) {
      if (!wlSeating) return;
      const e = wlSeating;
      const idx = waitlist.findIndex(w => w.id === e.id);
      const t = tables[tableId];
      if (t && t.status === 'khawya') {  // occupy the chosen table on the floor
        tableSettlement().project(t, { status: 'a-commander' });    // seated · server still needs to take the order
        tableSettlement().project(t, { covers: e.size });
        resetTableTimer(t);
        delete orders[tableId];       // drop any cached/fabricated order
        currentOrder().replaceTable(tableId, []);    // fresh table, ready to take their order
        refreshTableNode(tableId);
      }
      if (idx >= 0) waitlist.splice(idx, 1);
      endSeating(true);
      toast(`${e.name} · installé·e à ${tableId}`);
      /* This used to stop at the cashier's toast. Publish the seating fact to
         the one waiter assigned to this table by the owner's floor plan. The
         event is best-effort: seating never waits for the network. */
      try {
        const assigned = t && t.server && servers[t.server];
        // Caisse réappairée en plein service : pas d'événement chez l'autre commerce.
        const merchant = window.KiwiTillTenant?.mismatch() ? '' : currentMerchantSlug();
        if (t && merchant) {
          fetch('/api/service/events', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant, event: {
              type: 'table-seated', table: tableId, serverId: (t && t.server) || '',
              server: (assigned && assigned.name) || '', customer: e.name, covers: e.size,
            } }),
          }).catch(() => {});
        }
      } catch (_) {}
    }

    function removeWaitlist(id) {
      const idx = waitlist.findIndex(e => e.id === id);
      if (idx < 0) return;
      const name = waitlist[idx].name;
      waitlist.splice(idx, 1);
      renderWaitlist();
      toast(`${name} retiré·e de la file`);
    }
