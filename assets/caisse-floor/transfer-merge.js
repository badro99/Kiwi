
    function caisseTableKitchenLocked(id) {
      return (tableOrders[id] || []).some(line => line.sent && !line.orderProPending);
    }

    function caisseMobilityIntent(handler, from, to) {
      const merchant = currentMerchantSlug();
      const saved = handler.pendingIntent;
      // Keep the same operation after an ambiguous network response.
      if (saved && saved.merchant === merchant && saved.from === from && saved.to === to) return saved;
      let seat = phoneSeats.get(tableKey(from));
      if (!seat || !Number.isFinite(seat.revision)) {
        // Empty visits are movable too. Recover the existing canonical visit
        // from the inbox snapshot if its local badge has not been installed.
        const sessions = window.KiwiOrderInbox?.sessions?.();
        const visit = Array.isArray(sessions) && sessions.find(s => s.mode === 'table'
          && caisseTableId(s.table) === from && (!seat?.session || String(s.id) === String(seat.session)));
        if (visit && Number.isFinite(Number(visit.seen_ts))) {
          seat = { session: visit.id, since: visit.opened_ts, revision: Number(visit.seen_ts) };
        }
      }
      const intent = {
        merchant, from, to, operationId: crypto.randomUUID(),
        since: seat?.since || Date.now(), destinationClosedAt: Number(tableClosedAt[tableKey(to)] || 0),
      };
      /* A caisse-created visit can be fully valid on D1 before the inbox poll
         has installed its local badge. In that case the server resolves the
         current open visit atomically; missing local cache is not a reason to
         turn Déplacer/Fusionner into dead controls. */
      if (seat && seat.session && Number.isFinite(seat.revision)) {
        intent.expectedSession = String(seat.session);
        intent.expectedRevision = seat.revision;
      }
      return (handler.pendingIntent = intent);
    }

    function applyCaisseMovedVisit(from, to, data, intent, merge) {
      if (!data || !intent) return;
      const session = String((merge ? data.targetSessionId : (data.movedSession || data.sessionId)) || '');
      if (!session) return;
      const fromKey = tableKey(from), toKey = tableKey(to);
      const targetSeat = phoneSeats.get(toKey);
      phoneSeats.delete(fromKey);
      phoneSeats.set(toKey, {
        session, since: merge && targetSeat?.session === session ? targetSeat.since : intent.since,
        // Merge does not return a revision; wait for the canonical poll before another move.
        revision: Number.isFinite(data.revision) ? data.revision : undefined,
      });
      phoneMovedVisits.set(session, { to: toKey, from: fromKey,
        closedAt: intent.destinationClosedAt, revision: Number(data.revision || data.now) || 0 });
      const pending = phonePending.get(fromKey) || 0;
      phonePending.delete(fromKey);
      phonePending.set(toKey, pending + (merge ? (phonePending.get(toKey) || 0) : 0));
      (tableOrders[to] || []).forEach(line => {
        if (line.orderProLine) currentOrder().patchLine(line, { ["orderSession"]: session });
      });
      // Acknowledged movement changes location/visit, never acceptance or payment.
      try {
        const inbox = window.KiwiOrderInbox?.orders?.() || {};
        Object.values(inbox).forEach(order => {
          if (order.mode === 'table' && tableKey(caisseTableId(order.table) || order.table) === fromKey && !order.paid && order.status !== 'rejected') {
            order.table = to; order.session = session;
          }
        });
      } catch (_) {}
      if (tables[to]) tableSettlement().project(tables[to], { timerSession: session });
    }

    function openCaisseTransferModal(tableId) {
      if (!hasTables() || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer')) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Déplacement de table non disponible'));
        return;
      }
      ctrfFromId = tableId;
      ctrfSelectedToId = null;
      $('#ctrf-from-id').textContent = tableId;
      const btnText = $('#ctrf-btn-text');
      if (btnText) btnText.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Déplacer');
      const confirmBtn = $('#ctrf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderCaisseTransferGrid();
      $('#caisse-transfer-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderCaisseTransferGrid() {
      const grid = $('#ctrf-target-grid');
      if (!grid) return;
      const freeTables = Object.keys(tables).filter(id => id !== ctrfFromId && tables[id] && tables[id].status === 'khawya');
      if (!freeTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune table libre disponible actuellement.</div>';
        return;
      }
      grid.innerHTML = freeTables.map(id => {
        const t = tables[id];
        const isSel = id === ctrfSelectedToId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-ctrf-to="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} pl. · Libre</div>
          </div>
        `;
      }).join('');
    }

    async function confirmCaisseTransfer() {
      if (!ctrfFromId || !ctrfSelectedToId) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      const from = ctrfFromId;
      const to = ctrfSelectedToId;
      const confirmBtn = $('#ctrf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const fromT = tables[from];
      const toT = tables[to];
      if (!fromT || !toT) return;

      let transferData = null;
      let transferIntent = null;
      if (!IS_DEMO) {
        try {
          transferIntent = caisseMobilityIntent(confirmCaisseTransfer, from, to);
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: currentMerchantSlug(),
              transferTable: { from, to, covers: fromT.covers, server: fromT.server || 'Caisse',
                operationId: transferIntent.operationId, expectedSession: transferIntent.expectedSession,
                expectedRevision: transferIntent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmCaisseTransfer.pendingIntent;
            throw new Error((data && data.error) || 'transfer-failed');
          }
          transferData = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Déplacement impossible : ${err.message === 'source-session-required' || err.message === 'stale-table-visit'
            ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('visite à actualiser · synchronisez puis réessayez') : (err.message || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('erreur réseau'))}`);
          return;
        }
      }

      // Local state migration
      if ((tableOrders[from] || orders[from] || []).length) startTableTimer(from);
      tableSettlement().transfer(from, to, { id: transferIntent?.operationId || ('local-transfer:' + from + ':' + to + ':' + (fromT.timerSession || fromT.orderStartedAt || Date.now())) });
      if (Array.isArray(orders[from]) && orders[from].length) orders[to] = orders[from];
      else delete orders[to];
      applyCaisseMovedVisit(from, to, transferData, transferIntent, false);
      delete confirmCaisseTransfer.pendingIntent;
      if (typeof tableSplits !== 'undefined' && tableSplits.has(from)) {
        tableSplits.set(to, tableSplits.get(from));
        tableSplits.delete(from);
      }
      kdsOrders.forEach(order => {
        if (order && order.type === 'dineIn' && String(order.table) === String(from) && !order.paid) order.table = to;
      });

      delete orders[from];

      try { persistShift(); publishServiceFloor(); } catch (_) {}

      refreshTableNode(from);
      refreshTableNode(to);

      $('#caisse-transfer-modal').classList.remove('is-open');
      selectedId = to;
      openTable(to);
      // Annonce ce que le serveur a VRAIMENT déplacé : un transfert qui
      // laisse des lignes réglées derrière lui n'est pas un échec, mais
      // l'annoncer « déplacée » sans compter mentirait autant que l'ancien
      // silence sur les lignes non déplacées.
      {
        const moved = transferData && Number.isFinite(+transferData.ordersMoved) ? +transferData.ordersMoved : null;
        const left = transferData && Number.isFinite(+transferData.paidLeftBehind) ? +transferData.paidLeftBehind : 0;
        let msg = `Table ${from} déplacée vers Table ${to}`;
        if (moved !== null) msg += ` · ${moved} ligne${moved > 1 ? 's' : ''}`;
        if (left > 0) msg += ` · ${left} réglée${left > 1 ? 's' : ''} reste${left > 1 ? 'nt' : ''} sur ${from}`;
        toast(msg);
      }
    }

    function openCaisseMergeModal(tableId) {
      if (!hasTables() || isFeatureOff('tableMerge') || isFeatureOff('table-merge')) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fusion de tables non disponible'));
        return;
      }
      cmrgSourceId = tableId;
      cmrgSelectedTargetId = null;
      $('#cmrg-source-id').textContent = tableId;
      const btnText = $('#cmrg-btn-text');
      if (btnText) btnText.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fusionner');
      const confirmBtn = $('#cmrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderCaisseMergeGrid();
      $('#caisse-merge-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderCaisseMergeGrid() {
      const grid = $('#cmrg-target-grid');
      if (!grid) return;
      const otherTables = Object.keys(tables).filter(id => id !== cmrgSourceId && tables[id] && tables[id].status !== 'khawya' && tables[id].status !== 'khlass');
      if (!otherTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune autre table active à fusionner.</div>';
        return;
      }
      grid.innerHTML = otherTables.map(id => {
        const t = tables[id];
        const isSel = id === cmrgSelectedTargetId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-cmrg-target="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} cvts · ${({ 'khawya': 'Libre', 'a-commander': 'À commander', 'ka-yaklo': 'En cours', 'bgha-ykhlass': 'Addition', 'khlass': 'Réglée' })[t.status] || t.status}</div>
          </div>
        `;
      }).join('');
    }

    async function confirmCaisseMerge() {
      if (!cmrgSourceId || !cmrgSelectedTargetId) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      const source = cmrgSourceId;
      const target = cmrgSelectedTargetId;
      const confirmBtn = $('#cmrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const sourceT = tables[source];
      const targetT = tables[target];
      if (!sourceT || !targetT) return;
      /* A split that already took a part lives only in tableSplits, and the
         merge below clears both entries: the merged bill would then ask for the
         whole amount again, parts already paid included. Refuse until the split
         is settled rather than lose the record of what was paid. */
      if ([source, target].some((id) => { const sp = liveTableSplit(id); return sp && splitPaidCount(sp) > 0; })) {
        if (confirmBtn) confirmBtn.disabled = false;
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Un split déjà encaissé est en cours : terminez-le avant de fusionner'));
        return;
      }

      let mergeData = null;
      let mergeIntent = null;
      if (!IS_DEMO) {
        try {
          mergeIntent = caisseMobilityIntent(confirmCaisseMerge, source, target);
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: currentMerchantSlug(),
              mergeTables: { targetTable: target, sourceTable: source, server: targetT.server || 'Caisse',
                operationId: mergeIntent.operationId, expectedSession: mergeIntent.expectedSession,
                expectedRevision: mergeIntent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmCaisseMerge.pendingIntent;
            throw new Error((data && data.error) || 'merge-failed');
          }
          mergeData = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Fusion impossible : ${err.message === 'source-session-required' || err.message === 'stale-table-visit'
            ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('visite à actualiser · synchronisez puis réessayez') : (err.message || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('erreur réseau'))}`);
          return;
        }
      }

      // Merge order lines
      const sourceLines = tableOrders[source] || [];
      const targetLines = tableOrders[target] || [];
      const timerAnchors = [];
      if (sourceLines.length || (orders[source] || []).length) timerAnchors.push(startTableTimer(source));
      if (targetLines.length || (orders[target] || []).length) timerAnchors.push(startTableTimer(target));
      if (timerAnchors.length) {
        tableSettlement().project(targetT, { orderStartedAt: Math.min(...timerAnchors) });
        tableSettlement().project(targetT, {}, ['timerSession']);
        startTableTimer(target);
      }
      tableSettlement().merge(source, target, { id: mergeIntent?.operationId || ('local-merge:' + source + ':' + target + ':' + (sourceT.timerSession || sourceT.orderStartedAt || Date.now())) });
      // Cached rendered bills must include both sides, or yield to the live lines.
      if ((orders[source] || []).length || (orders[target] || []).length) {
        orders[target] = [
          ...((orders[target] || []).length ? orders[target] : targetLines.map(l => ({ ...l, total: l.price * l.qty }))),
          ...((orders[source] || []).length ? orders[source] : sourceLines.map(l => ({ ...l, total: l.price * l.qty }))),
        ];
      } else delete orders[target];
      applyCaisseMovedVisit(source, target, mergeData, mergeIntent, true);
      delete confirmCaisseMerge.pendingIntent;
      if (typeof tableSplits !== 'undefined') {
        tableSplits.delete(source);
        tableSplits.delete(target);
      }
      kdsOrders.forEach(order => {
        if (order && order.type === 'dineIn' && String(order.table) === String(source) && !order.paid) order.table = target;
      });

      delete orders[source];

      try { persistShift(); publishServiceFloor(); } catch (_) {}

      refreshTableNode(source);
      refreshTableNode(target);

      $('#caisse-merge-modal').classList.remove('is-open');
      selectedId = target;
      openTable(target);
      {
        const moved = mergeData && Number.isFinite(+mergeData.ordersMerged) ? +mergeData.ordersMerged : null;
        const left = mergeData && Number.isFinite(+mergeData.paidLeftBehind) ? +mergeData.paidLeftBehind : 0;
        let msg = `Table ${source} fusionnée dans Table ${target}`;
        if (moved !== null) msg += ` · ${moved} ligne${moved > 1 ? 's' : ''}`;
        if (left > 0) msg += ` · ${left} réglée${left > 1 ? 's' : ''} reste${left > 1 ? 'nt' : ''} sur ${source}`;
        toast(msg);
      }
    }
