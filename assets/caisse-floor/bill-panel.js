
    /* ---------- Toast ---------- */
    function toast(msg, ms = 3200, kind = '', desc = '') {
      const lower = String(msg || '').toLowerCase();
      if (!kind) kind = /refus|erreur|illisible|impossible|requis/.test(lower) ? 'danger' : /d'abord|attention|d\u00e9j\u00e0|scannez/.test(lower) ? 'warn' : 'success';
      if (window.KiwiCaisseLang) { msg = window.KiwiCaisseLang.tr(msg); if (desc) desc = window.KiwiCaisseLang.tr(desc); }
      const el = document.createElement('div');
      el.className = `toast is-${kind}`;
      el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
      const copy = document.createElement('span'); copy.className = 'toast-copy';
      const title = document.createElement('span'); title.className = 'toast-title'; title.textContent = msg;
      copy.appendChild(title);
      if (desc) { const detail = document.createElement('span'); detail.className = 'toast-desc'; detail.textContent = desc; copy.appendChild(detail); }
      el.appendChild(copy);
      $('#toast-stack').appendChild(el);
      setTimeout(() => { el.classList.add('fade'); }, ms);
      setTimeout(() => { el.remove(); }, ms + 280);
      try { window.dispatchEvent(new CustomEvent('kiwi:toast', { detail: { title: String(msg || ''), desc: String(desc || ''), type: kind } })); } catch (_) {}
    }

    function setCaisseTableLock(tableId, action) {
      if (window.KiwiTillTenant?.mismatch()) return;
      const merchant = currentMerchantSlug();
      if (!merchant || !storeIsReal() || !tableId) return;
      fetch('/api/service/events', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
          lock: {
            table: tableId,
            action: action || 'acquire',
            actor: (typeof cashierName !== 'undefined' && cashierName) || 'Caisse'
          }
        })
      }).catch(() => {});
    }

    function renderRightPanel(id) {
      const t = tables[id];
      const lines = generateOrder(id, t);
      const total = lines.reduce((sum, l) => sum + l.total, 0);
      // La note change → la fiche client attachée suit (ou se détache).
      try { renderSaleClient(); } catch (_) {}

      $('#rp-table').textContent = `${id} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;

      const subEl = $('#rp-substatus');
      const flag = t.status === 'bgha-ykhlass' ? 'bgha-ykhlass' : (t.status === 'a-commander' ? 'a-commander' : 'ka-yaklo');
      subEl.dataset.flag = flag;
      const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
      const subText = !hasOrder
        ? (phoneSeats.has(tableKey(id)) ? 'Client connecté sur téléphone' : (t.status === 'a-commander' ? 'À commander' : 'Table ouverte'))
        : ({
            'bgha-ykhlass': `Addition · ${t.elapsed || 0} mn`,
            'a-commander':  `À commander · ${t.elapsed || 0} mn`,
            'ka-yaklo':     `En cours · ${t.elapsed || 0} mn`,
          })[flag];
      subEl.textContent = subText;

      // Server row
      const serverRow = $('#rp-server-row');
      if (mode !== 'vrap' && t.server && servers[t.server]) {
        const s = servers[t.server];
        $('#rp-server-avatar').textContent = serverInitials(s);
        $('#rp-server-avatar').style.background = s.color;
        $('#rp-server-name').textContent = s.name + (s.status === 'pause' ? ' · en pause' : '');
        serverRow.hidden = false;
      } else {
        serverRow.hidden = true;
      }

      // Split-in-progress card and table tools
      renderRpSplitCard(id);
      const tt = $('#rp-table-tools');
      if (tt) {
        const canUseTableTools = hasTables();
        const transferOff = !canUseTableTools || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer');
        const mergeOff = !canUseTableTools || isFeatureOff('tableMerge') || isFeatureOff('table-merge');
        const trBtn = $('#rp-transfer-table');
        const mgBtn = $('#rp-merge-table');
        if (trBtn) { trBtn.hidden = transferOff; trBtn.style.display = transferOff ? 'none' : ''; }
        if (mgBtn) { mgBtn.hidden = mergeOff; mgBtn.style.display = mergeOff ? 'none' : ''; }
        [trBtn, mgBtn].forEach(button => {
          if (!button) return;
          button.disabled = false;
          button.title = '';
        });
        tt.hidden = transferOff && mergeOff;
        tt.style.display = (transferOff && mergeOff) ? 'none' : '';
      }

      // Remise · recompute the discount amount against the current gross
      const discAmt = discountAmountFor(id, total);
      const net = Math.max(0, total - discAmt);
      const savedSplit = liveTableSplit(id);
      const splitRemaining = savedSplit ? splitRemainingTotal(savedSplit) : null;

      let itemsHTML = lines.map(l => `
        <div class="rp-item">
          <span class="rp-item-qty">${l.qty}×${l.sent && l.kind !== 'formula-part' && l.uid
            ? `<button type="button" class="qty-btn" data-table-void="${kdsEsc(l.uid)}" aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">−</button>` : ''}</span>
          <span class="rp-item-name">${lineName(l)}${promoTag(l)}${l.held ? ' <span class="rp-hold-mark">À suivre</span>' : ''}</span>
          <span class="rp-item-price mono">${fmtMAD(l.total)}</span>
          ${l.note && l.note.trim() ? `<span class="rp-item-noteline">Note cuisine · ${kdsEsc(l.note)}</span>` : ''}
        </div>
      `).join('');
      if (discAmt > 0) {
        const d = t.discount;
        const tag = d.kind === 'pct' ? `Remise ${d.value} %` : 'Remise';
        itemsHTML += `
        <div class="rp-item rp-item--discount">
          <span class="rp-item-qty" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise"><i data-lucide="badge-percent"></i></span>
          <span class="rp-item-name" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">${tag}${d.reason ? ' · ' + d.reason : ''}</span>
          <span class="rp-item-price mono" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">−${fmtMAD(discAmt)}</span>
          <button type="button" class="rp-item-del-btn" data-action="remove-table-discount" title="Supprimer la remise" aria-label="Supprimer la remise">
            <i data-lucide="trash-2"></i>
          </button>
        </div>`;
      }
      const currentCashier = (typeof cashierName !== 'undefined' && cashierName) || 'Caisse';
      const activeLock = caisseTableLocks && caisseTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentCashier && (Date.now() - Number(activeLock.ts || 0) < 60000);
      /* `esc` n'a jamais existé dans cette page — une seule occurrence, aucune
         déclaration, et aucun des assets chargés n'en expose. Le littéral était
         donc évalué dès qu'un collègue tenait la table (le verrou porte SON nom,
         jamais celui de la caisse : le cas normal en service), il levait une
         ReferenceError, et renderRightPanel s'arrêtait AVANT d'écrire le
         sous-total, le total, le montant carte, le montant espèces et le rendu.
         Le panneau gardait les montants de la table affichée juste avant : on
         encaissait la table 5 en croyant encaisser la table 7.

         Deux corrections, pas une. On échappe avec escTeam, qui existe et est
         dans la portée ; et on met la bannière hors d'état de nuire, parce qu'un
         libellé décoratif ne doit jamais pouvoir empêcher un montant de
         s'afficher. */
      let lockBanner = '';
      if (isLockedByOther) {
        try {
          lockBanner = `
        <div class="td-lock-banner" style="margin-bottom:10px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#92400E;">
          <i data-lucide="lock" style="width:16px;height:16px;color:#B45309;flex-shrink:0;"></i>
          <span><b>${escTeam(activeLock.actor)}</b> prend la commande sur cette table</span>
        </div>
      `;
        } catch (_) { lockBanner = ''; }
      }
      /* A table is managed as one bill, not as a stack of kitchen ticket
         numbers the cashier has to remember. Whole-table cancellation lives
         on “Annuler mesa”; individual corrections live on each line's −. */
      $('#rp-items').innerHTML = lockBanner + itemsHTML;

      $('#rp-total').textContent = fmtMAD(splitRemaining != null ? splitRemaining : net);
      window.CaisseFx && window.CaisseFx.countTotal();

      // Sync modal labels too
      payMeta({ prefix: true, table: id, covers: t.covers, unit: +t.covers > 1 ? 'couverts' : 'couvert' });
      $('#card-amount').textContent = fmtMADcents(net);
      $('#cash-amount').textContent = fmtMADcents(net);
      $('#cash-received').value = net;
      updateRendu();
      showPayButtons(false);
      /* A resumed split is the only valid payment route. Leaving the ordinary
         button visible here charged the full 60 MAD again after a 35 MAD part
         had already been recorded, even though the split card showed 25 MAD
         remaining. */
      if (savedSplit && splitPaidCount(savedSplit) < savedSplit.parts.length) {
        const normal = $('#rp-pay-normal');
        if (normal) {
          normal.hidden = true;
          normal.style.display = 'none';
        }
      }
      /* Une commande OrderPro à table est rattachée à l'addition avant d'être
         acceptée. Elle doit pouvoir partir depuis CETTE fiche, sans obliger le
         caissier à découvrir le panneau secondaire « Commandes ». Le bouton
         reste caché quand toutes les lignes sont déjà parties. */
      const kitchenBtn = $('#rp-send-kitchen');
      const tableKitchenPending = (tableOrders[id] || []).some(l => l && (l.orderProPending || !l.sent));
      kitchenBtn.hidden = !tableKitchenPending;
      const kitchenBtnLabel = kitchenBtn.querySelector('span');
      const heldQty = tableHeldQty(id);
      if (kitchenBtnLabel) kitchenBtnLabel.textContent = (tableOrders[id] || []).some(l => l && l.orderProPending)
        ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Accepter · envoyer en cuisine')
        : tableSuiteOnly(id) ? `Envoyer la suite · ${heldQty}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Envoyer en cuisine');
      /* La seule porte de retour vers le menu depuis une addition ouverte. Elle
         n'existe qu'en salle, et pas sur une table déjà encaissée · on ne
         rouvre pas une note soldée, on rouvre une mesa. */
      const addBtn = $('#rp-add-items');
      if (addBtn) addBtn.hidden = !(mode === 'salle' && t.status !== 'khlass');
    }

    function openTable(id) {
      const t = tables[id];
      // Keep the table's real status (Ka-yaklo / Addition) · the selection
      // highlight already shows which bill is open, so there's no separate
      // "payment in progress" status.
      selectedId = id;
      if (document.documentElement.classList.contains('kiwi-native')) renderMenu();
      refreshTableNode(id);

      markSelectedTable(id);

      renderRightPanel(id);
      $('#rp-empty').hidden = true;
      $('#rp-empty').style.display = 'none';
      const active = $('#rp-active');
      active.hidden = false;
      active.style.display = 'flex';
      // re-trigger slide-in animation
      active.style.animation = 'none';
      void active.offsetWidth;
      active.style.animation = '';

      lucide.createIcons();
    }

    function showEmpty() {
      $$('.tbl').forEach(el => el.classList.remove('is-selected')); // inner tabletops only
      $('#rp-active').hidden = true;
      $('#rp-active').style.display = 'none';
      const empty = $('#rp-empty');
      empty.hidden = false;
      empty.style.display = 'flex';
      /* Remettre l'addition à zéro AVANT de la masquer. Le panneau caché garde
         son dernier montant, et sur la disposition téléphone/tablette portrait
         la barre repliée « Addition » le recopie (caisse-motion.js countTotal) :
         une caisse vide affichait donc encore les 40 MAD de la note précédente,
         seul chiffre visible tant que la feuille n'est pas dépliée. Un montant
         faux en évidence sur un comptoir, c'est une erreur de caisse qui attend
         son tour. */
      $('#rp-total').textContent = fmtMAD(0);
      window.CaisseFx && window.CaisseFx.countTotal();
      // Mode-aware prompt text
      const txt = $('#rp-empty-text');
      if (txt) {
        txt.textContent = mode === 'vrap'
          ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Commande vide. Choisissez un article dans le menu.')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Touchez une table pour voir l'addition.");
      }
    }

    function closeRightPanel() {
      $$('.tbl').forEach(el => el.classList.remove('is-selected')); // inner tabletops only
      selectedId = null;
      if (mode === 'order') {
        backToSalle();
        return;
      }
      showEmpty();
    }

    function refreshTableNode(id) {
      /* Every live table transition also schedules the reverse Wi-Fi bridge.
         The snapshot signature suppresses duplicates, so callers stay simple
         while short-lived states such as `khlass` cannot disappear before the
         four-second heartbeat sees them. */
      try { setTimeout(publishServiceFloor, 0); } catch (_) {}
      const t = tables[id];
      if (!t) return;
      /* Le plan SPATIAL (celui que tout vrai commerçant obtient dès qu'il a
         dessiné sa salle) rend des `.cplan-tbl`, pas des `.tbl-cell`. Cette
         fonction ne cherchait que la seconde forme : `if (!old) return`
         partait donc en silence, et AUCUN changement d'état ne se repeignait
         jamais chez un vrai client · une table encaissée restait verte jusqu'au
         prochain rechargement complet de la salle. */
      const cell = document.querySelector(`.tbl-cell[data-table="${id}"]`);
      if (cell) {
        cell.outerHTML = tableHTML(id, t);
        lucide.createIcons();
        updateFloorCount(t.floor);
        return;
      }
      const spatial = document.querySelector(`.cplan-tbl[data-table="${id}"]`);
      if (!spatial) return;
      const was = spatial.classList.contains('is-selected');
      /* La démo et le plan réel émettent désormais tous deux des .cplan-tbl
         (renderer noir unifié) · on distingue par le conteneur. */
      if (spatial.closest('.plan-canvas')) {
        spatial.outerHTML = tableHTML(id, t);
        updateFloorCount(t.floor);
      } else {
        const pt = planTableOf(id);
        if (!pt) return;
        spatial.outerHTML = cplanTableHTML(pt);
      }
      if (was) {
        const now = document.querySelector(`.cplan-tbl[data-table="${id}"]`);
        if (now) now.classList.add('is-selected');
      }
    }

    function updateFloorCount(floor) {
      const f = Number(floor);
      const floorIds = Object.keys(tables).filter(id => tables[id].floor === f);
      const occupied = floorIds.filter(id => tables[id].status !== 'khawya').length;
      const countEl = document.querySelector(`.plan-floor-count[data-floor-count="${f}"]`);
      if (countEl) countEl.textContent = `${occupied} / ${floorIds.length} occupées`;
    }
    // Back-compat alias (older code paths may still call updateZoneCount).
    function updateZoneCount(_unused) {
      // The plan no longer has per-zone counters; refresh both floors instead.
      updateFloorCount(0); updateFloorCount(1);
    }

    function markPaid(id) {
      const t = tables[id];
      const visit = phoneSessionOf(id);
      if (visit) {
        // A local receipt is durable even if /api/sale or the close request is
        // still in the offline outbox. Never resurrect this paid visit on reload.
        journal.forEach(entry => {
          if (entry && entry.table === String(id) && entry.session === visit) entry.visitClosed = true;
        });
        try { persistShift(); } catch (_) {}
        kdsOrders.forEach(order => {
          if (order && order.type === 'dineIn' && String(order.table) === String(id)
            && String(order.session || '') === visit) order.paid = true;
        });
      }
      tableSettlement().settle(t);
      tableSettlement().project(t, {}, ['discount']); // clear remise immédiatement à l'encaissement
      /* The final tender ends this bill's split. A stale completed flow must
         never make the next party's fresh order look already paid. The paid
         receipt keeps its own immutable snapshot for an audited reopen. */
      tableSplits.delete(id);
      tableSettlement().project(t, {}, ['reopenedBill']);
      tableSettlement().project(t, {}, ['reopenRef']);
      tableSettlement().project(t, {}, ['reopenSessionId']);
      tableSettlement().project(t, {}, ['orderNo']);
      currentOrder().replaceTable(id, []);
      delete orders[id];
      /* L'addition est réglée : le téléphone posé sur cette table cesse d'être
         un terminal de commande. C'est LE point de passage de tous les
         encaissements · carte, espèces, addition partagée · donc c'est ici et
         nulle part ailleurs qu'on coupe, sinon le partage d'addition aurait
         laissé la session ouverte. L'appel réseau est délégué à
         orderpro-inbox.js par un évènement : une vente ne doit jamais attendre
         le réseau, ni échouer parce qu'il est tombé. */
      releasePhoneTable(id, 'settle', true);
      resetTableTimer(t);
      refreshTableNode(id);
      shift.tablesPaid += 1;
      renderShiftStats();
      try { persistShift(); } catch (_) {}
      // Fade to khawya after 3s
      setTimeout(() => {
        if (tables[id] && tables[id].status === 'khlass') {
          tableSettlement().project(tables[id], { status: 'khawya' });
          delete orders[id]; // clear order
          currentOrder().removeTable(id); // clear cashier-built order
          tableSettlement().project(tables[id], {}, ['discount']); // clear remise · table reset
          tableSettlement().project(tables[id], {}, ['orderNo']); // next party gets its own order number
          refreshTableNode(id);
          try { persistShift(); } catch (_) {}
        }
      }, 3000);
    }

    /* ===========================================================
       New Table · open empty table, take order
       =========================================================== */

    /* ---- helpers ---- */
    function showPayButtons(forOrder) {
      const normal = $('#rp-pay-normal');
      const order  = $('#rp-pay-order');
      normal.hidden = forOrder;
      normal.style.display = forOrder ? 'none' : '';
      order.hidden  = !forOrder;
      order.style.display = forOrder ? 'flex' : 'none';
      // Order-builder mode has its own "Envoyer en cuisine" · hide the À emporter one
      if (forOrder) {
        const sk = $('#rp-send-kitchen'); if (sk) sk.hidden = true;
      }
      /* « Ajouter des articles » n'appartient qu'à l'addition d'une mesa en
         salle. On l'éteint ICI, au point de passage commun, et renderRightPanel
         le rallume pour le seul cas qui le mérite : sinon il survivrait au
         passage en « À emporter » (qui partage ce bloc de boutons) et
         rouvrirait la commande d'une table qu'on ne regarde plus. */
      const ai = $('#rp-add-items'); if (ai) ai.hidden = true;
    }
