
    function cplanTableHTML(t) {
      const C = window.KiwiFloorCore;
      if (!C || !t) return '';
      const id = String(t.num || t.id);
      const live = tables[id] || {};
      const g = C.geom(t);
      const covers = live.covers != null ? live.covers : g.seats;
      const sv = live.server && servers[live.server];
      const badge = sv
        ? `<span class="tbl-server" style="background:${sv.color};--server-badge-ink:${serverBadgeInk(sv.color)};">${serverInitials(sv)}</span>` : '';
      const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
      const hot = (live.status === 'ka-yaklo' || live.status === 'bgha-ykhlass' || live.status === 'a-commander') && hasOrder;
      const elapsed = hot && live.elapsed != null
        ? `<div class="tbl-elapsed cplan-since">${live.elapsed} mn</div>` : '';
      return caisseNoirCellHTML({
        id, status: live.status, x: +t.x || 0, y: +t.y || 0,
        w: g.w, h: g.h, shape: g.shape, seats: g.seats, covers,
        rot: t.rot || 0, serverHTML: badge, phoneHTML: phoneBadgeHTML(id), elapsedHTML: elapsed
      });
    }
    function renderRealGrid() {
      const host = document.querySelector('.view-salle .plan-real');
      if (!host) return;
      const C = window.KiwiFloorCore;
      const plan = __realPlan;
      const ids = Object.keys(tables);
      if (!ids.length) { host.innerHTML = emptyPlanHTML(); if (window.lucide) lucide.createIcons(); return; }

      /* No core or no coordinates → fall back to the card grid rather than
         render an empty room. */
      const spatial = !!(C && plan && (plan.tables || []).some(t => +t.x || +t.y));
      if (!spatial) {
        const byZone = {};
        ids.forEach(id => {
          const zid = tables[id].zone || 'z1';
          if (__activeRealZoneFilter && __activeRealZoneFilter !== 'all' && zid !== __activeRealZoneFilter) return;
          const z = tables[id].zoneName || 'Salle';
          (byZone[z] || (byZone[z] = [])).push(id);
        });
        const order = __realZoneOrder.length ? __realZoneOrder : Object.keys(byZone);
        let html = '';
        order.forEach(z => {
          const zi = byZone[z]; if (!zi || !zi.length) return;
          html += `<div class="plan-real-zone"><div class="plan-real-zone-h">${escTeam(z)} <em>· ${zi.length} table${zi.length > 1 ? 's' : ''}</em></div><div class="plan-real-grid">`;
          zi.forEach(id => { html += designedTableHTML(id, tables[id]); });
          html += '</div></div>';
        });
        host.innerHTML = html;
        if (window.lucide) lucide.createIcons();
        return;
      }

      let html = caisseNoirDefs();
      (plan.zones || []).forEach(z => {
        if (__activeRealZoneFilter && __activeRealZoneFilter !== 'all' && z.id !== __activeRealZoneFilter) return;
        const zTables = (plan.tables || []).filter(t => (t.zone || 'z1') === z.id);
        const zEls = (plan.elements || []).filter(e => (e.zone || 'z1') === z.id)
                       .slice().sort((a, b) => (a.z || 0) - (b.z || 0));
        if (!zTables.length && !zEls.length) return;
        const W = Math.max(240, +((z.room || {}).w) || 880);
        const H = Math.max(200, +((z.room || {}).h) || 540);
        const occ = zTables.filter(t => {
          const st = (tables[String(t.num || t.id)] || {}).status;
          return st && st !== 'khawya';
        }).length;

        const items = zTables.map(t => cplanTableHTML(t)).join('');

        html += `<div class="cplan-zone">
            <div class="plan-real-zone-h">${escTeam(z.name || 'Salle')}
              <em>· ${zTables.length} table${zTables.length > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''}</em></div>
            <div class="cplan-room" style="aspect-ratio:${W} / ${H};">
              <div class="cplan-scale" style="width:${W}px; height:${H}px;
                   transform:scale(calc(100cqw / ${W}px));">
                ${caisseRoomShellNoir(z)}
                ${zEls.map(e => caisseNoirElHTML(e)).join('')}
                ${items}
              </div>
            </div>
          </div>`;
      });
      host.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }

    // Read the plan, (re)build `tables` from it, then paint. Runtime service
    // state must survive this rebuild: the cloud plan can refresh while an
    // OrderPro order is being accepted, and geometry is not authority for the
    // current bill or occupancy.
    function setupRealSalle() {
      if (!storeIsReal()) return;                      // demo untouched
      const view = document.querySelector('.view-salle');
      if (!view) return;
      view.classList.add('has-real-plan');
      view.querySelectorAll('.plan-canvas').forEach(c => { c.style.display = 'none'; });  // hide demo architecture
      let host = view.querySelector('.plan-real');
      if (!host) { host = document.createElement('div'); host.className = 'plan-real'; view.appendChild(host); }

      const plan = caisseFloorPlan();
      const runtimeTables = new Map();
      Object.keys(tables).forEach((id) => runtimeTables.set(tableKey(id), tables[id]));
      Object.keys(tables).forEach(k => { delete tables[k]; });
      __realZoneOrder = [];
      __realPlan = plan;
      if (!plan || !Array.isArray(plan.tables) || !plan.tables.length) {
        host.innerHTML = emptyPlanHTML();
        if (window.lucide) lucide.createIcons();
        return;
      }

      const validZones = (plan.zones || []).filter(z => {
        const zTables = (plan.tables || []).filter(t => (t.zone || 'z1') === z.id);
        const zEls = (plan.elements || []).filter(e => (e.zone || 'z1') === z.id);
        return zTables.length || zEls.length;
      });

      const tog = document.querySelector('.main-head[data-mode-section="salle"] .floor-toggle');
      if (tog) {
        if (validZones.length > 1) {
          tog.style.display = 'inline-flex';
          tog.innerHTML = `<button class="floor-pill is-active" role="tab" data-real-zone="all"><span>Toutes</span></button>` +
            validZones.map(z => `<button class="floor-pill" role="tab" data-real-zone="${escTeam(z.id)}"><span>${escTeam(z.name || 'Salle')}</span></button>`).join('');
          tog.querySelectorAll('.floor-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              tog.querySelectorAll('.floor-pill').forEach(b => {
                b.classList.toggle('is-active', b === btn);
                b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
              });
              __activeRealZoneFilter = btn.dataset.realZone;
              renderRealGrid();
            });
          });
        } else {
          tog.style.display = 'none';
        }
      }
      const zn = {}; (plan.zones || []).forEach(z => { zn[z.id] = z.name || 'Salle'; });

      /* ── L'AFFECTATION DES SERVEURS, enfin reprise ──────────────────────
         Le patron répartit ses sections en glissant un serveur sur une table
         (mode Affectation du plan de salle) ; le plan garde ça dans
         `tb.server`, un identifiant de `plan.staff`. Cette fonction écrivait
         `server: null` en dur, donc l'affectation était jetée à l'arrivée :
         aucune table de vrai commerçant n'a JAMAIS porté de serveur, ni sur le
         plan, ni sur le bandeau de l'addition, ni sur le ticket cuisine.
         Les deux moitiés existaient et ne se parlaient pas.

         Les identifiants ne coïncident pas, et ne peuvent pas : `servers` est
         reconstruit depuis les codes d'accès du personnel (rebuildRealRoster,
         clés S1…Sn), tandis que le plan a ses propres ids. Le NOM est le seul
         mot commun aux deux. On rapproche donc là-dessus, et faute de
         correspondance on laisse vide plutôt que d'attribuer une table au
         mauvais serveur · se tromper de nom est pire que ne pas en avoir. */
      const staffById = {};
      (plan.staff || []).forEach(s => { if (s && s.id) staffById[String(s.id)] = s; });
      const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
      const localByName = {};
      Object.keys(servers).forEach(k => { localByName[norm(servers[k].name)] = k; });
      function localServerFor(tb) {
        if (!tb || !tb.server) return null;
        const key = String(tb.server);
        // Le plan peut déjà porter la clé locale (S1…) ou un id de son staff.
        if (servers[key]) return key;
        const s = staffById[key];
        const byName = s && localByName[norm(s.name)];
        return byName || null;
      }

      plan.tables.forEach(tb => {
        const id = String(tb.num || tb.id);
        const key = tableKey(id);
        const previous = runtimeTables.get(key);
        const hasBill = !!((tableOrders[id] || []).length);
        const hasLiveVisit = hasBill || phoneSeats.has(key) || phonePending.has(key)
          || !!(previous && previous.status && previous.status !== 'khawya');
        const zone = zn[tb.zone] || 'Salle';
        if (__realZoneOrder.indexOf(zone) < 0) __realZoneOrder.push(zone);
        /* Carry the designed geometry through · the owner's layout is the
           point of the mirror, so shape/position/size come from the plan
           rather than being flattened to a round table at 0,0. */
        const rebuilt = {
          designed: true, floor: 0, zone: tb.zone || 'z1', zoneName: zone,
          shape: tb.shape || 'round', covers: designedCovers(tb),
          status: hasLiveVisit
            ? ((previous && previous.status && previous.status !== 'khawya') ? previous.status : 'ka-yaklo')
            : 'khawya',
          server: (hasLiveVisit && previous && previous.server) || localServerFor(tb),
          x: +tb.x || 0, y: +tb.y || 0, w: +tb.w || 0, h: +tb.h || 0,
          rot: +tb.rot || 0, color: tb.color || null, num: tb.num || id,
          elapsed: hasLiveVisit && previous ? Math.max(0, +previous.elapsed || 0) : 0,
        };
        if (hasLiveVisit && previous) {
          if (+previous.covers > 0) rebuilt.covers = +previous.covers;
          ['orderStartedAt', 'timerSession', 'orderNo', 'discount', 'reopenRef', 'reopenSessionId', 'reopenedBill', 'settlement'].forEach((field) => {
            if (previous[field] != null) rebuilt[field] = previous[field];
          });
        }
        tables[id] = {};
        tableSettlement().project(tables[id], rebuilt);
      });
      renderRealGrid();
    }

    /* ---------- Floor switching (RDC ↔ 1er étage) ---------- */
    function setFloor(floor) {
      const f = String(floor);
      document.querySelectorAll('.floor-pill').forEach(p => {
        const isActive = p.dataset.floor === f;
        p.classList.toggle('is-active', isActive);
        p.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      document.querySelectorAll('.plan-canvas').forEach(c => {
        const isActive = c.dataset.floor === f;
        c.classList.toggle('is-active', isActive);
        c.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      document.querySelectorAll('.plan-floor-count').forEach(el => {
        el.hidden = el.dataset.floorCount !== f;
      });
    }

    function isFeatureOff(key) {
      try {
        if (window.KiwiConfig && typeof window.KiwiConfig.off === 'function') {
          return window.KiwiConfig.off(key);
        }
        if (window.KiwiConfig && window.KiwiConfig.features) {
          const feats = window.KiwiConfig.features;
          if (feats[key] === false) return true;
          if (key === 'salle' && feats.tables === false) return true;
          if (key === 'tables' && feats.salle === false) return true;
          if (key === 'vrap' && (feats['a-emporter'] === false || feats.takeout === false)) return true;
          if (key === 'waitlist' && feats.attente === false) return true;
          if (key === 'tableTransfer' && (feats['table-transfer'] === false || feats['caisse-transfer'] === false)) return true;
          if (key === 'table-transfer' && (feats.tableTransfer === false || feats['caisse-transfer'] === false)) return true;
          if (key === 'tableMerge' && (feats['table-merge'] === false || feats['caisse-merge'] === false)) return true;
          if (key === 'table-merge' && (feats.tableMerge === false || feats['caisse-merge'] === false)) return true;
          if (key === 'remboursement' && (feats.refund === false || feats.returns === false)) return true;
          if (key === 'cash-move' && (feats.cashMove === false || feats['mouvement-caisse'] === false)) return true;
          if (key === 'cashMove' && (feats['cash-move'] === false || feats['mouvement-caisse'] === false)) return true;
          if (key === 'open-drawer' && feats.openDrawer === false) return true;
          if (key === 'openDrawer' && feats['open-drawer'] === false) return true;
          if (key === 'kds' && feats.kds === false) return true;
        }
      } catch (_) {}
      return false;
    }

    function syncActiveMode() {
      if (isFeatureOff(mode)) {
        const fallback = ['salle', 'vrap', 'waitlist'].find(m => !isFeatureOff(m));
        if (fallback && fallback !== mode) {
          setMode(fallback);
        }
      }
    }



    function setMode(newMode) {
      if (isFeatureOff(newMode)) {
        const fallback = ['salle', 'vrap', 'waitlist'].find(m => !isFeatureOff(m));
        if (!fallback || fallback === newMode) return;
        newMode = fallback;
      }
      if (newMode === mode) return;
      mode = newMode;
      document.body.dataset.mode = newMode;

      // Pills: only salle/vrap get pressed; order mode = neither
      $$('.mode-pill').forEach(p =>
        p.setAttribute('aria-pressed',
          (newMode === 'salle' || newMode === 'vrap' || newMode === 'waitlist') && p.dataset.mode === newMode ? 'true' : 'false'));

      const ttTools = $('#rp-table-tools');
      if (ttTools && newMode !== 'salle') {
        ttTools.hidden = true;
        ttTools.style.display = 'none';
      }

      // Toggle main headers + views
      // 'order' mode reuses the vrap menu sections
      $$('[data-mode-section]').forEach(el => {
        const sec = el.dataset.modeSection;
        const match = sec === newMode || (newMode === 'order' && sec === 'vrap');
        el.hidden = !match;
        el.classList.toggle('is-active', match);
      });

      // Update vrap header text depending on context
      const vrapTitle = $('.main-head[data-mode-section="vrap"] .main-title');
      if (vrapTitle) {
        if (newMode === 'order' && selectedId) {
          setCaisseTableLock(selectedId, 'acquire');
          const t = tables[selectedId];
          vrapTitle.innerHTML = `Commande <strong style="color:var(--forest)">${selectedId}</strong>
            <span class="order-mode-badge"><i data-lucide="pencil-line"></i> en cours</span>
            <em>· ${t.covers} couvert${t.covers > 1 ? 's' : ''}</em>`;
        } else {
          vrapTitle.innerHTML = 'À emporter<em>· vente au comptoir</em>';
        }
      }

      // Update mode-specific labels
      const cancelLabel = $('[data-cancel-label]');
      if (cancelLabel) {
        cancelLabel.textContent = newMode === 'vrap' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Vider la commande")
          : newMode === 'order' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Annuler commande') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Annuler la table');
      }

      // Reset right panel · persist any À emporter edit, drop the edit state
      if (vrapEditingNum != null) { saveVrapEdits(); currentOrder().setEditing(null); currentOrder().replaceCart([]); }
      currentOrder().setDiscount(null);
      // Changer de mode change de note : la fiche client attachée se relâche.
      try { renderSaleClient(); } catch (_) {}
      if (newMode === 'salle') {
        showPayButtons(false);
        if (selectedId) renderRightPanel(selectedId);
        else showEmpty();
      } else if (newMode === 'order') {
        currentOrder().replaceCart([]);
        setVrapView('builder');
        renderOrderPanel(selectedId);
      } else if (newMode === 'waitlist') {
        if (selectedId) { setCaisseTableLock(selectedId, 'release'); selectedId = null; }
        renderWaitlist();  // the right addition panel is hidden via body[data-mode] CSS
      } else {
        if (selectedId) { setCaisseTableLock(selectedId, 'release'); selectedId = null; }
        setVrapView('board');
        showPayButtons(false);
        renderCart();
      }
      /* A persisted native shift can reach setMode() while this inline script is
         still parsing, before the deferred icon runtime has executed. Icons are
         decorative; their loader's own first-paint pass will fill them in. */
      if (window.lucide) lucide.createIcons();
    }
