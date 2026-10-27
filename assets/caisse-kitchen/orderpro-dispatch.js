
    function opMerchant() {
      try { return (window.KiwiOrderInbox && KiwiOrderInbox.merchant && KiwiOrderInbox.merchant()) || ''; }
      catch (_) { return ''; }
    }
    /* Pousser l'état vers le serveur, pour que le TÉLÉPHONE l'apprenne. Sans
       cet écho, la cuisine sait que le plat est prêt et le client, non. */
    function opPush(o, status, extra) {
      if (!o || !o.opId) return Promise.resolve(null);
      try {
        if (window.KiwiOrderInbox && KiwiOrderInbox.setStatus) {
          return KiwiOrderInbox.setStatus(o.opId, status, extra || {});
        }
      } catch (_) {}
      return Promise.resolve(null);
    }

    function orderProPendingIdsForTable(tableId) {
      const ids = new Set();
      (tableOrders[tableId] || []).forEach((line) => {
        if (!line || !line.orderProPending) return;
        const marker = String(line.orderProLine || '');
        const cut = marker.lastIndexOf(':');
        if (cut > 0) ids.add(marker.slice(0, cut));
      });
      return Array.from(ids);
    }

    /* Accept locally first so a paid/confirmed order reaches this caisse's KDS
       and printer even if the network acknowledgement takes a moment. The
       subsequent server echo reuses the same opId; opTickets and the durable
       print queue therefore turn it into a no-op instead of a duplicate. */
    function dispatchPendingOrderProAtTable(tableId, paid) {
      const ids = orderProPendingIdsForTable(tableId);
      if (!ids.length) return 0;
      let inbox = {};
      try { inbox = (window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders()) || {}; }
      catch (_) { inbox = {}; }
      const server = serverNameFor(tableId);
      ids.forEach((id) => {
        const attached = (tableOrders[tableId] || []).filter(line =>
          String(line && line.orderProLine || '').startsWith(id + ':'));
        const remote = inbox[id] || (attached.length ? {
          id, mode: 'table', table: tableId, status: 'pending', server,
          total: attached.reduce((sum, line) => sum + (+line.price || 0) * (+line.qty || 1), 0),
          lines: attached.map(line => ({
            id: line.id || '', name: line.name || '', qty: line.qty || 1,
            unitPrice: Math.max(0, +line.price || 0), note: line.note || '',
            options: line.options || '', visuals: Array.isArray(line.visuals) ? line.visuals : [],
            station: line.station || '', kind: line.kind || '', formulaUid: line.formulaUid || '',
            formulaName: line.formulaName || '', slotLabel: line.slotLabel || '',
            formulaSlotId: line.formulaSlotId || '', lineId: line.lineId || '',
          })),
        } : null);
        if (remote) {
          opIngest(Object.assign({}, remote, {
            status: 'accepted', server: server || remote.server || '',
            paid: paid === true || remote.paid === true, updated_ts: Date.now(),
            localKitchenAction: true,
          }));
        }
        try {
          if (window.KiwiOrderInbox && KiwiOrderInbox.setStatus) {
            KiwiOrderInbox.setStatus(id, 'accepted', { server, paid: paid === true });
          }
        } catch (_) {}
      });
      return ids.length;
    }

    function dispatchHeldTakeaway(o, paid, localKitchenAction) {
      if (!o || o.status !== 'held') return false;
      o.status = 'new';
      o.sentAt = new Date();
      if (!o.kitchenDispatchedAt) {
        o.kitchenDispatchedAt = Date.now();
        printKitchenTickets(o, o.items || [], {
          /* A click on THIS till must print on THIS till. `remote` is reserved
             for passive polling, where only the elected hub may print. */
          remote: !!o.opId && localKitchenAction !== true,
          sourceId: o.opId || '', createdAt: o.kitchenDispatchedAt,
        });
      }
      opPush(o, 'accepted', { paid: paid === true });
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      try { persistShift(); } catch (_) {}
      return true;
    }

    function dispatchTableUnsentToKitchen(tableId, paid, fire) {
      const remote = dispatchPendingOrderProAtTable(tableId, paid);
      /* Payé : tout part, y compris « à suivre ». Un plat encaissé ne doit
         jamais rester sur une addition sans bon de cuisine. */
      const local = sendTableToKitchen(tableId, (paid === true || fire === true) ? { fire: true } : null);
      return { remote, local };
    }

    async function awaitCanonicalTicketNumber(dispatched) {
      /* Table dispatch returns {remote, local}; takeaway dispatch returns the
         order itself. Keep one gate for both paths so a fast payment can never
         overtake number allocation on any restaurant checkout surface. */
      const orders = [];
      if (dispatched?.canonicalNumberPromise) orders.push(dispatched);
      if (dispatched?.local?.canonicalNumberPromise) orders.push(dispatched.local);
      if (dispatched?.remote?.canonicalNumberPromise) orders.push(dispatched.remote);
      // #0068 can arise even with no new dish in this payment tap: an earlier
      // cashier kitchen send may still be awaiting its canonical visit. Wait
      // for every local ticket on this table before freezing the paid sale.
      if (mode !== 'vrap' && selectedId) {
        kdsOrders.forEach(order => {
          if (order?.type === 'dineIn' && String(order.table) === String(selectedId)
            && !order.paid && order.canonicalNumberPromise && !orders.includes(order)) orders.push(order);
        });
      }
      if (!orders.length) return;
      /* Bounded. A Wi-Fi with no Internet used to hold the tender until the
         relay gave up, cash in the drawer and no sale written. Past this
         window the sale is recorded with the provisional number, and
         reconcileReceiptOrderNumber swaps in the permanent one (receipt,
         journal and the idempotent Dashboard mirror) the moment it lands. */
      const CANONICAL_NUMBER_WAIT_MS = 2500;
      let timer = null;
      const allocated = Promise.all(orders.map(order =>
        Promise.resolve(order.canonicalNumberPromise).catch(() => null)));
      const deadline = new Promise(resolve => { timer = setTimeout(resolve, CANONICAL_NUMBER_WAIT_MS); });
      try { await Promise.race([allocated, deadline]); }
      finally { clearTimeout(timer); }
    }

    function dispatchUnsentKitchenBeforePayment() {
      if (mode === 'vrap') {
        if (vrapEditingNum != null) {
          const existing = kdsOrders.find(x => x && x.num === vrapEditingNum);
          if (existing) dispatchHeldTakeaway(existing, true, true);
          return existing || null;
        }
        if (cart && cart.length) {
          const created = createTakeawayKitchenOrder(cart);
          if (created) currentOrder().setEditing(created.num);
          return created;
        }
        return null;
      }
      if (selectedId) return dispatchTableUnsentToKitchen(selectedId, true);
      return null;
    }

    /* Le serveur affecté à la table, tel que le plan de salle le connaît. */
    function serverNameFor(tableId) {
      const t = tables[tableId];
      const s = t && t.server && servers[t.server];
      return (s && s.name) || '';
    }

    /* OrderPro connaît le numéro écrit par le client ("2", "T2", espaces),
       tandis que le plan conserve le libellé exact choisi par le patron. */
    function caisseTableId(v) {
      const wanted = tableKey(v);
      const numeric = wanted.replace(/^T(?=\d+$)/, '');
      return Object.keys(tables).find(id => {
        const candidate = tableKey(id);
        return candidate === wanted || candidate.replace(/^T(?=\d+$)/, '') === numeric;
      }) || '';
    }
