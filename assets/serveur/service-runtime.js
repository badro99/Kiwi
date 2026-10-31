    function serviceNorm(value) {
      let s = String(value || '').trim().toLowerCase();
      try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
      return s.replace(/\s+/g, ' ');
    }

    function serviceTableId(value) {
      const wanted = serviceNorm(value).replace(/^table\s*/, '').replace(/^t(?=\d+$)/, '');
      return Object.keys(tables).find((id) => serviceNorm(id).replace(/^t(?=\d+$)/, '') === wanted) || '';
    }

    function serviceHistoryStorageKey() {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      return 'kiwi-service-notifications:' + merchant + ':' + (currentUser || 'employee');
    }

    function loadServiceHistory() {
      const key = serviceHistoryStorageKey();
      if (serviceHistoryKey === key) return;
      serviceHistoryKey = key;
      serviceNotifications.length = 0;
      serviceEventSeen.clear();
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        (Array.isArray(saved) ? saved : []).slice(0, 100).forEach((item) => {
          if (!item || !item.id) return;
          item.unread = false;
          serviceNotifications.push(item);
          serviceEventSeen.add(item.id);
        });
      } catch (_) {}
    }

    function saveServiceHistory() {
      if (!serviceHistoryKey) return;
      /* Au-delà des 100 dernières, les plus anciennes ne disparaissent plus :
         elles passent dans l'archive de cet appareil, même cloison marchand +
         employé que l'historique, 500 au plus, plus récentes d'abord. Le
         centre de notifications les relit avec « Voir plus ». */
      if (serviceNotifications.length > 100) {
        const overflow = serviceNotifications.splice(100);
        try {
          const archiveKey = serviceHistoryKey + ':archive';
          const saved = JSON.parse(localStorage.getItem(archiveKey) || '[]');
          const kept = (Array.isArray(saved) ? saved : []).filter((item) => item && item.id);
          const seen = new Set(kept.map((item) => item.id));
          const moved = overflow.filter((item) => item && item.id && !seen.has(item.id))
            .map((item) => ({ ...item, unread: false }));
          localStorage.setItem(archiveKey, JSON.stringify(moved.concat(kept).slice(0, 500)));
        } catch (_) {}
      }
      try { localStorage.setItem(serviceHistoryKey, JSON.stringify(serviceNotifications.slice(0, 100))); } catch (_) {}
    }

    async function publishServiceTableState(id, status, covers, closeSession) {
      if (svBrowseMode()) return { ok: false, error: 'browse-mode' };
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      if (!merchant || SV_DEMO) return { ok: !!SV_DEMO, demo: !!SV_DEMO };
      let closeData = null;
      if (closeSession) {
        try {
          /* Close the canonical visit FIRST. Publishing "free" while its
             OrderPro session is still open lets the next queue poll reopen the
             table. The two requests used to race and the UI announced success
             without checking either one. */
          const response = await svFetchJson('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant, closeTable: id, closedBy: 'service',
              expectedSession: serviceTableSessions.get(id) || '',
              expectedRevision: serviceTableSessionRevisions.get(id) || undefined }),
          });
          closeData = response.data;
          if (!response.ok || !closeData || !closeData.ok) {
            return { ok: false, error: (closeData && closeData.error) || ('close-' + response.status) };
          }
        } catch (err) { return { ok: false, error: err && err.timeout ? 'timeout' : 'offline' }; }
      }
      try {
        const response = await svFetchJson('/api/service/events', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchant, state: {
            table: id, status, covers: Math.max(0, Number(covers) || 0),
            syncVersion: SERVICE_BILL_SYNC_VERSION,
            /* Plus de `lines`. Ce document dit qui est assis, pas ce qu'il a
               commandé — l'addition vient de la file. Les envoyer entretenait
               une seconde vérité vivante. */
          } }),
        });
        const data = response.data;
        return {
          ok: !!(response.ok && data && data.ok),
          error: response.ok ? (data && data.error) : ('state-' + response.status),
          unpaid: Number(closeData && closeData.unpaid) || 0,
          sessionClosed: !!closeData,
        };
      } catch (err) {
        return { ok: false, error: err && err.timeout ? 'timeout' : 'offline', sessionClosed: !!closeData,
          unpaid: Number(closeData && closeData.unpaid) || 0 };
      }
    }

    async function setTableLock(id, action) {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      if (!merchant || SV_DEMO || !id) return;
      try {
        await fetch('/api/service/events', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant,
            lock: {
              table: id,
              action: action || 'acquire',
              actor: activeRole.fullName || activeRole.name || 'Serveur'
            }
          })
        });
      } catch (_) {}
    }

    function serviceNotify(title, body, meta) {
      const noticeId = (meta && meta.id) || ('notice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
      loadServiceHistory();
      if (serviceEventSeen.has(noticeId)) return;
      serviceEventSeen.add(noticeId);
      serviceNotifications.unshift({
        id: noticeId,
        title: String(title || 'Notification'), body: String(body || ''),
        table: String(meta && meta.table || ''), type: String(meta && meta.type || 'service'),
        ts: Number(meta && meta.ts) || Date.now(), unread: currentTab !== 'notifications',
      });
      saveServiceHistory();
      if (serviceNotifications.length > 100) serviceNotifications.length = 100;
      if (currentTab !== 'notifications') serviceUnread++;
      try { renderNotifications(); } catch (_) {}
      updateNotificationBadge();
      toast(body ? `${title} · ${body}` : title, 4200);
      try {
        if (window.Notification && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification(title, { body: body || '', tag: 'kiwi-service-' + title + '-' + body });
        }
      } catch (_) {}
    }

    async function pollServiceOrders(merchant, since) {
      const orders = [];
      let cursor = null;
      for (let page = 0; page < 100; page++) {
        if (merchant !== svSlug() || !shiftStart) return null;
        const url = '/api/order/queue?merchant=' + encodeURIComponent(merchant)
          + '&since=' + encodeURIComponent(since) + '&role=service'
          + (cursor ? '&cursor=' + encodeURIComponent(JSON.stringify(cursor)) : '');
        const response = await svFetchJson(url, {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        }, SV_POLL_TIMEOUT_MS);
        if (!response.ok) return null;
        const data = response.data;
        if (!data || !data.ok || data.ordersAvailable === false) return null;
        orders.push(...(Array.isArray(data.orders) ? data.orders : []));
        if (!data.nextCursor) return { ...data, orders };
        cursor = data.nextCursor;
      }
      return null; // never present a partial queue as a complete one
    }

    function ingestServiceOrders(data) {
      if (!data || !data.ok || data.ordersAvailable === false) return;
      serviceOrderSince = data.now || serviceOrderSince;
      serviceCanonicalReady = true;
      serviceMineTables.clear();
      servicePausedTables.clear();
      ((data.service && data.service.mineTables) || []).forEach((id) => serviceMineTables.add(serviceTableId(id) || String(id)));
      ((data.service && data.service.pausedTables) || []).forEach((id) => servicePausedTables.add(serviceTableId(id) || String(id)));
      serviceTableSessions.clear();
      serviceTableSessionRevisions.clear();
      serviceVisitCredit.clear();
      /* « En cours · N mn » vient de l'heure d'ouverture que le serveur a
         écrite (`opened_ts`), pas d'un compteur local. Le compteur repartait
         de zéro à chaque rechargement, et une table ouverte depuis une heure
         par un collègue ou par la caisse affichait « 0 mn » ; un téléphone
         verrouillé, dont setInterval est suspendu, prenait du retard. On
         oublie l'heure de toute table avant de relire les sessions vivantes :
         une table sans session retombe sur le compteur, jamais sur une heure
         périmée. */
      Object.keys(tables).forEach((k) => { delete tables[k].openedTs; });
      (data.sessions || []).forEach((session) => {
        if (!session || session.mode !== 'table') return;
        const id = serviceTableId(session.table);
        if (id && session.id) {
          serviceTableSessions.set(id, String(session.id));
          serviceTableSessionRevisions.set(id, Number(session.seen_ts) || 0);
          if (Number(session.creditCents) > 0) serviceVisitCredit.set(id, Math.round(Number(session.creditCents)));
          else serviceVisitCredit.delete(id);
          if (tables[id] && Number(session.opened_ts) > 0) {
            tables[id].openedTs = Number(session.opened_ts);
            tables[id].elapsed = Math.max(0, Math.floor((Date.now() - tables[id].openedTs) / 60000));
          }
        }
        const canonical = serviceStateVersion.get(id);
        if (id && tables[id] && tables[id].status === 'khawya' && !(canonical && canonical.status === 'khawya')) {
          tables[id].status = 'ka-yaklo';
        }
      });
      serviceReopenedBills.clear();
      serviceReopenedBillsAvailable = data.reopenedBillsAvailable !== false;
      (data.reopenedBills || []).forEach((bill) => {
        const id = serviceTableId(bill && bill.table);
        if (id && bill && String(bill.session || '') === serviceTableSessions.get(id)) {
          serviceReopenedBills.set(id, bill);
        }
      });
      (data.orders || []).forEach((order) => {
        if (!order || !order.id) return;
        const before = serviceOrderStatus.get(order.id) || '';
        serviceOrderStatus.set(order.id, order.status);
        const table = serviceTableId(order.table) || order.table || '';
        if (order.mode === 'table' && table) {
          if (order.status === 'rejected' || order.paid) serviceCanonicalOrders.delete(order.id);
          else {
            serviceCanonicalOrders.set(order.id, { ...order, table });
            if (tables[table] && !tables[table].orderNo) tables[table].orderNo = serviceOrderRef(order);
          }
        }
        const shouldNotify = !isEmployeePaused() && (serviceMineTables.has(table) || servicePausedTables.has(table));
        if (shouldNotify && order.status === 'pending' && before !== 'pending') {
          serviceNotify(`Table ${table}`, `nouvelle commande ${serviceOrderRef(order)}`.trim(), { table, type: 'orderpro', id: 'order-' + order.id + '-pending', ts: order.updated_ts });
        } else if (shouldNotify && order.status === 'ready' && before !== 'ready') {
          serviceNotify(`Table ${table}`, `commande ${serviceOrderRef(order)} prête`.trim(), { table, type: 'ready', id: 'order-' + order.id + '-ready', ts: order.updated_ts });
        }
      });
      /* Rebuild the SENT part of every bill from the canonical order queue.
         Ready/accepted notifications are status changes only; they cannot
         append items. This also removes any old fabricated snapshot that was
         already stored in service-events but has no KDS/order counterpart. */
      Object.keys(tables).forEach((table) => reconcileCanonicalServiceBill(table));
      try { renderAll(); } catch (_) {}
    }

    function reconcileCanonicalServiceBill(table) {
      if (!serviceCanonicalReady || !tables[table]) return;
      const canonical = [];
      serviceCanonicalOrders.forEach((order) => {
        if (String(order.table) !== String(table)) return;
        (order.lines || []).forEach((line, index) => canonical.push({
          uid: 'order-' + order.id + '-' + index,
          canonicalUid: line.uid || line.id || '',
          cloudKey: 'order:' + order.id + ':' + index,
          orderId: order.id,
          id: line.id || '', name: line.name || 'Article',
          price: Math.max(0, Number(line.unitPrice) || 0),
          ...(line.promo && line.promo.id ? { promo: line.promo } : {}),
          qty: Math.max(1, Number(line.qty) || 1),
          sentQty: Math.max(1, Number(line.qty) || 1),
          note: line.note || '',
          kind: line.kind || '',
          formulaUid: line.formulaUid || '',
          formulaName: line.formulaName || '',
          slotLabel: line.slotLabel || '',
          formulaSlotId: line.formulaSlotId || '',
          lineId: line.lineId || '',
          opts: Array.isArray(line.visuals) ? line.visuals.map((visual) => ({
            group: visual.group || '', label: visual.label || '',
            p: Math.max(0, Number(visual.price) || 0), emoji: visual.emoji || '',
          })) : [],
          sourceCanonical: true,
          voidPending: !!line.voidAlert,
        }));
      });
      /* Keep only THIS phone's not-yet-sent draft. A line hydrated from caisse
         is never a local draft (`sourceCaisse`), so an orphan 373 MAD snapshot
         cannot survive merely because its quantities look sent. */
      const localDraft = (tableOrders[table] || []).filter((line) =>
        line.sourceLocal === true
        && Number(line.sentQty || 0) < Number(line.qty || 0));
      tableOrders[table] = canonical.concat(localDraft);
      if (!canonical.length && !localDraft.length && tables[table].status === 'ka-yaklo') {
        /* Occupancy may still be real (clients seated), only the invented bill
           is removed. Never close the table from a missing order alone. */
        tables[table].elapsed = Math.max(0, Number(tables[table].elapsed) || 0);
      }
    }

    function ingestServiceEvents(data) {
      if (!data || !data.ok) return;
      serviceEventSince = data.now || serviceEventSince;
      window.KiwiServiceRequests?.ingest(data, {
        merchant: svSlug(), notify: toast, refresh: pollServiceSync,
        openTable: value => { const id = serviceTableId(value); if (svBrowseMode()) return; if (id && tables[id]) { setTab('tables'); openTableDetail(id); } },
      });
      if (data.locks && typeof data.locks === 'object') serviceTableLocks = data.locks;
      Object.keys(data.states || {}).forEach((key) => {
        const state = data.states[key] || {};
        const id = serviceTableId(state.table || key) || String(state.table || key);
        if (!tables[id]) return;
        /* Service states are snapshots, not permanent table history. The till
           itself expires a saved service after twelve hours; the phone must
           use the same boundary or yesterday's occupied tables reappear on a
           fresh clock-in merely because the page was reloaded. */
        if (Number(state.ts) && Number(state.ts) < Date.now() - 12 * 60 * 60 * 1000) return;
        /* Employee drafts from a PREVIOUS attendance period do not belong to a
           newly clocked-in phone. A real open bill is continuously owned and
           echoed by the caisse (`source: caisse`), so it still crosses shift
           changes; an orphan employee-only snapshot does not get resurrected
           merely because another account signs in on the same device. */
        const currentShiftStart = shiftStart instanceof Date ? shiftStart.getTime() : 0;
        if (state.source === 'employee' && currentShiftStart
          && Number(state.ts || 0) < currentShiftStart) return;
        /* Versions before v2 could publish the sample bill that booted with
           this single-file demo into a real restaurant. Those poisoned states
           are exactly the bills that reappear after refresh. Never hydrate a
           live phone from any legacy bill payload; a current caisse snapshot
           or a new employee action replaces it normally. */
        const legacyBillState = Array.isArray(state.lines)
          && Number(state.syncVersion || 0) < SERVICE_BILL_SYNC_VERSION;
        if (legacyBillState) {
          serviceStateVersion.set(id, {
            status: 'khawya', ts: Number(state.ts) || 0,
            source: 'legacy-cleanup', hasLines: true,
          });
          tables[id].status = 'khawya';
          tables[id].elapsed = 0;
          delete tables[id].orderNo;
          tableOrders[id] = [];
          return;
        }
        serviceStateVersion.set(id, {
          status: state.status, ts: Number(state.ts) || 0, source: state.source || '',
          hasLines: Array.isArray(state.lines),
        });
        tables[id].status = state.status || tables[id].status;
        if (state.covers) tables[id].covers = state.covers;
        const awaiting = serviceBillAwaiting.get(id);
        const stateTs = Number(state.ts) || 0;
        if (awaiting && (stateTs > awaiting.after || Date.now() > awaiting.until)) serviceBillAwaiting.delete(id);
        /* ── L'INSTANTANÉ NE FABRIQUE PLUS D'ADDITION ────────────────────────
         * Ce bloc reconstruisait des lignes à partir de `state.lines` tant que
         * la file n'avait pas répondu. C'était la DERNIÈRE porte par laquelle un
         * document partagé pouvait devenir une addition — et donc la dernière
         * source des factures fantômes au démarrage : une table qui s'ouvre
         * avec des articles que personne n'a commandés, parce qu'un instantané
         * ancien, écrit par un autre appareil, arrivait avant la file.
         *
         * L'addition n'a plus qu'une source : la file des commandes. Le temps
         * qu'elle réponde — une seconde ou deux — la table s'affiche occupée
         * (le statut, lui, appartient bien à cet instantané) avec une addition
         * vide. Montrer « rien, pour l'instant » est honnête ; montrer des
         * articles peut-être faux ne l'est pas, et c'est ce qu'on encaissait. */
        if (serviceCanonicalReady) reconcileCanonicalServiceBill(id);
        if (state.status === 'khawya' || state.status === 'khlass') {
          tables[id].elapsed = 0;
          delete tables[id].orderNo;
          Array.from(serviceCanonicalOrders.entries()).forEach(([orderId, order]) => {
            if (String(order.table) === String(id)) serviceCanonicalOrders.delete(orderId);
          });
          tableOrders[id] = [];
        }
      });
      (data.events || []).forEach((event) => {
        if (!event || serviceEventSeen.has(event.id)) return;
        if (event.guestRequest) { serviceEventSeen.add(event.id); return; }
        const id = serviceTableId(event.table) || event.table;
        if (event.type === 'table-seated' && tables[id]) {
          tables[id].status = 'a-commander';
          tables[id].covers = event.covers || tables[id].covers;
          tables[id].elapsed = 0;
          serviceNotify(`Table ${id}`, `${event.customer || 'Clients'} installé${event.covers ? ` · ${event.covers} pers.` : ''} · menus à apporter`, { table: id, type: event.type, id: event.id, ts: event.ts });
          return;
        }
        if (event.type === 'guest-call') {
          const asks = { water: 'Demande de l’eau', bread: 'Demande du pain', napkins: 'Demande des serviettes', 'clear-table': 'Demande de débarrasser' };
          serviceNotify(`Table ${id}`, asks[event.action] || 'Appelle un serveur', {
            table: id, type: event.type, id: event.id, ts: event.ts,
          });
          return;
        }
        if (event.type !== 'table-state') { serviceEventSeen.add(event.id); return; }
        const messages = {
          'a-commander': 'Clients installés · menus à apporter',
          'ka-yaklo': 'Table ouverte · commande en cours',
          'bgha-ykhlass': 'Addition demandée',
          'ka-tkhdam': 'Paiement en cours',
          'khlass': 'Addition réglée',
          'khawya': 'Table libérée',
        };
        if (messages[event.status]) serviceNotify(`Table ${id}`, messages[event.status], { table: id, type: event.status, id: event.id, ts: event.ts });
      });
      try { renderAll(); } catch (_) {}
    }

    function pollServiceSync() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState) return;
      const merchant = liveEmployeeState.merchant || svSlug();
      if (!merchant) return;
      /* Every clocked-in role needs live attendance and manager messages. Only
         floor-service roles continue into orders, tables and KDS events. */
      const restricted = !!activeRole.restricted;
      if (window.KiwiEmployeeLive) {
        KiwiEmployeeLive.refresh().then((data) => {
          applyEmployeeLive(data);
          activeRole = resolveRole('');
          applyRoleToMain();
          svWhenIdle('all', () => { try { renderAll(); } catch (_) {} });
          /* Un rôle sans plan de salle n'a que cette lecture pour savoir s'il
             est à jour. */
          if (restricted) svSyncMark(true);
        }).catch((err) => {
          if (err && err.status === 401) { endRevokedSession(); return; }
          if (restricted) svSyncMark(false);
        });
      }
      if (restricted) return;
      /* Menu edits made by the owner on another device reach the service app
         on the same short live-sync cadence as orders and table events.
         svFetchCarte shares an in-flight read and skips a fresh one. */
      try { svFetchCarte(); } catch (_) {}
      /* ── Une erreur de synchro n'est plus avalée ───────────────────────────
         Les deux lectures (événements de salle, puis file des commandes) ont
         chacune un délai. Le tour ne compte comme une synchro réussie que si
         les DEUX ont répondu ; sinon l'en-tête le dit (svSyncMark), avec
         l'heure de la dernière mise à jour réelle. */
      svFetchJson('/api/service/events?merchant=' + encodeURIComponent(merchant) + '&since=' + serviceEventSince, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }, SV_POLL_TIMEOUT_MS).then((r) => (r.ok ? r.data : null)).then((events) => {
        if (merchant !== svSlug() || !shiftStart) return SV_POLL_SKIP;
        ingestServiceEvents(events);
        return pollServiceOrders(merchant, serviceOrderSince).then((orders) => ({ events, orders }));
      }).then((res) => {
        if (res === SV_POLL_SKIP) return;
        ingestServiceOrders(res.orders);
        svSyncMark(!!(res.events && res.events.ok && res.orders && res.orders.ok));
      }).catch(() => { svSyncMark(false); });
      servicePlanTick++;
      /* Team, schedule and floor assignments share this six-second live loop.
         Eighteen seconds was long enough for a newly assigned table to look
         broken during service even though the cloud write had succeeded. */
    }

    function svSyncMark(ok) {
      const wasFailing = svSync.failing;
      if (ok) { svSync.lastOkAt = Date.now(); svSync.failing = false; }
      else svSync.failing = true;
      svRenderSyncStatus();
      /* La ligne au-dessus du plan dépend de cet état : on la redessine quand
         il change, sans attendre (et sans repeindre sous le doigt). */
      if (wasFailing !== svSync.failing && currentTab === 'tables') {
        svWhenIdle('tables', () => { try { renderTables(); } catch (_) {} });
      }
    }

    function svSyncReset() {
      svSync.lastOkAt = 0; svSync.failing = false; svSync.resumedAt = 0;
      svRenderSyncStatus();
    }

    function svDataStale() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState) return false;
      if (svKnownOffline() || svSync.failing) return true;
      if (!svSync.lastOkAt) return false;          // premier tour en cours : la ligne des tables le dit
      /* Un téléphone verrouillé ne sonde pas : on ne compte le silence qu'à
         partir du retour à l'écran. */
      const cadence = (window.KiwiLiveSocket && KiwiLiveSocket.live && KiwiLiveSocket.live()) ? SERVICE_SYNC_LIVE : SERVICE_SYNC_FAST;
      const since = Math.max(svSync.lastOkAt, svSync.resumedAt || 0);
      return Date.now() - since > cadence * 3 + SV_POLL_TIMEOUT_MS;
    }

    function svClock(ts) {
      const d = new Date(ts);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function svRenderSyncStatus() {
      const el = document.getElementById('tb-sync');
      if (!el) return;
      const stale = svDataStale();
      document.body.classList.toggle('sv-stale', stale);
      if (!stale) {
        el.hidden = true;
        if (el.dataset.fr) { el.dataset.fr = ''; el.textContent = ''; }
        return;
      }
      /* Écrit en français ; l'observateur de langue le traduit (patron
         « Hors ligne · dernière mise à jour HH:MM » dans EMPLOYEE_PATTERNS). */
      const fr = svSync.lastOkAt
        ? `Hors ligne · dernière mise à jour ${svClock(svSync.lastOkAt)}`
        : 'Hors ligne · pas encore synchronisé';
      if (el.dataset.fr !== fr) { el.dataset.fr = fr; el.textContent = fr; }
      el.hidden = false;
    }

    function svFloorNoteHTML() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState || serviceCanonicalReady) return '';
      if (activeRole && activeRole.restricted) return '';
      if (!Object.keys(tables).length) return '';
      return (svSync.failing || svKnownOffline())
        ? `<div class="floor-note is-down" role="status">${SV_ICON_OFFLINE}<span>${esc(employeeTranslation("Serveur injoignable · l'état des tables n'est peut-être pas à jour"))}</span></div>`
        : `<div class="floor-note" role="status">${SV_ICON_SYNC}<span>${esc(employeeTranslation('Synchronisation des tables…'))}</span></div>`;
    }

    function svFloorEmptyHTML() {
      const floorKnown = SV_DEMO || !!(liveEmployeeState && liveEmployeeState.floor);
      let icon, title, body;
      if (floorKnown) {
        icon = '<i data-lucide="layout-grid"></i>';
        title = 'Aucune table dans le plan de salle';
        body = 'Le responsable compose le plan de salle depuis le tableau de bord.';
      } else if (svSync.failing || svKnownOffline()) {
        icon = SV_ICON_OFFLINE;
        title = 'Serveur injoignable';
        body = "Les tables s'afficheront au retour du réseau.";
      } else {
        icon = SV_ICON_SYNC;
        title = 'Chargement des tables…';
        body = 'Le plan de salle arrive du serveur.';
      }
      return `<div class="tables-empty" role="status">
        <div class="tables-empty-icon">${icon}</div>
        <strong>${esc(employeeTranslation(title))}</strong>
        <p>${esc(employeeTranslation(body))}</p>
      </div>`;
    }

    function joinServiceSocket() {
      try {
        if (!window.KiwiLiveSocket || SV_DEMO || !liveEmployeeState) return;
        const merchant = liveEmployeeState.merchant || svSlug();
        if (merchant) KiwiLiveSocket.on(merchant, 'service', pollServiceSync);
      } catch (_) {}
    }

    function svDrainPendingBatches() {
      if (SV_DEMO || svBrowseMode()) return;
      const now = Date.now();
      if (now - svDrainAt < 4000) return;
      svDrainAt = now;
      const prefix = 'kiwi:service-pending-v1:';
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      const operator = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
      const mine = prefix + merchant + ':' + operator + ':';
      const ids = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.indexOf(mine) === 0) ids.push(key.slice(mine.length));
        }
      } catch (_) { return; }
      ids.forEach((id) => {
        const pending = svReadPending(id);
        if (!pending) return;
        /* Un lot très ancien n'est plus une commande en cours : le rejouer
           enverrait en cuisine des plats d'un service terminé. On le laisse
           visible plutôt que de l'imprimer. */
        if (Date.now() - Number(pending.createdAt || 0) > SV_DRAFT_TTL) return;
        try {
          svSendOrderBatch(id).then((r) => {
            if (r && r.ok && !r.nothing) toast('Commande en attente envoyée · cuisine', 'ok');
          }).catch(() => {});
        } catch (_) {}
      });
    }

    function startServiceSync() {
      if (serviceSyncTimer || SV_DEMO) return;
      try { svRestoreDrafts(); } catch (_) {}
      try { svDrainPendingBatches(); } catch (_) {}
      pollServiceSync();
      const tick = () => {
        joinServiceSocket();
        const live = window.KiwiLiveSocket && KiwiLiveSocket.live();
        serviceSyncTimer = setTimeout(() => {
          try { pollServiceSync(); } catch (_) {}
          tick();
        }, live ? SERVICE_SYNC_LIVE : SERVICE_SYNC_FAST);
      };
      tick();
    }

    function stopServiceSync() {
      if (serviceSyncTimer) clearTimeout(serviceSyncTimer);
      try { if (window.KiwiLiveSocket) KiwiLiveSocket.stop(); } catch (_) {}
      serviceSyncTimer = null;
      serviceOrderSince = 0;
      serviceEventSince = 0;
      servicePlanTick = 0;
      serviceOrderStatus.clear();
      serviceCanonicalOrders.clear();
      serviceReopenedBills.clear();
      serviceReopenedBillsAvailable = !!SV_DEMO;
      serviceCanonicalReady = false;
      serviceEventSeen.clear();
      serviceStateVersion.clear();
      serviceBillAwaiting.clear();
      serviceHistoryKey = '';
      serviceMineTables.clear();
      servicePausedTables.clear();
      try { svSyncReset(); } catch (_) {}
    }

    function clearEmployeeOperationalState() {
      serviceDraftTimers.forEach((timer) => clearTimeout(timer));
      serviceDraftTimers.clear();
      dirtyOrders.clear();
      svPendingRef.clear();
      svPendingBatches.clear();
      serviceTableSessionRevisions.clear();
      Object.keys(tableOrders).forEach((id) => delete tableOrders[id]);
      tableClients.clear();
      /* Effacé AUSSI du stockage : un identifiant de paiement laissé derrière
         soi appartiendrait à l'employé suivant qui ouvre la même table. */
      employeePaymentRefsForgetAll();
      serviceBillAwaiting.clear();
      activeTableId = null;
      menuContextId = null;
    }

    function prepareAttendanceGate(action) {
      attendanceAction = action === 'clock-out' ? 'clock-out' : 'clock-in';
      applyRoleToClockin();
      resetNfc();
      const button = $('#ci-button');
      const caption = $('#nfc-caption');
      if (button) {
        const label = button.querySelector('span');
        if (label) label.textContent = attendanceAction === 'clock-out' ? 'Pointer le départ' : 'Pointer l’arrivée';
      }
      if (caption) caption.textContent = attendanceAction === 'clock-out'
        ? 'Saisissez le code de la caisse pour terminer le service'
        : 'Saisissez le code de la caisse pour ouvrir le service';
      showScreen('screen-clockin');
      if (teamKit()) { mountTeamClock(); return; }
      setTimeout(() => { const input = $('#attendance-code'); if (input) input.focus(); }, 80);
    }

    function resetNfc() {
      nfcTapped = false;
      const z = $('#nfc-zone'), c = $('#nfc-caption'), b = $('#ci-button');
      if (z) z.classList.remove('is-tapped');
      if (c) c.textContent = attendanceAction === 'clock-out'
        ? 'Saisissez le code de la caisse pour terminer le service'
        : 'Saisissez le code de la caisse pour ouvrir le service';
      if (b) b.disabled = true;
    }

    function fireNfcTap() {
      if (nfcTapped) return;
      if (!SV_DEMO && attendanceCode.length !== 6) return;
      nfcTapped = true;
      const z = $('#nfc-zone'), c = $('#nfc-caption'), b = $('#ci-button');
      if (SV_DEMO) {
        if (z) z.classList.add('is-tapped');
        if (c) c.textContent = attendanceAction === 'clock-out'
          ? `Départ autorisé · ${activeRole.name}`
          : `Arrivée autorisée · ${activeRole.name}`;
      } else if (c) {
        /* Six chiffres tapés ne prouvent rien : « Arrivée autorisée » et la coche
           s'affichaient avant que le serveur ait comparé le code à celui de la
           caisse, puis un code faux se faisait refuser après coup. Ici on dit
           seulement que le code est saisi ; l'autorisation vient de la réponse. */
        c.textContent = 'Code saisi · il sera vérifié au pointage';
      }
      if (b) b.disabled = false;
    }

    function enterServiceAfterClockIn(btn, cloudStart) {
      /* New flow — mirrors the dashboard intro sequence:
       *   0       button morphs into a check
       *   640     clockin screen leaves (zoom + blur, 380ms)
       *   1020    GREETING FLASH appears (paper bg fades in, h1 slides up)
       *   1900    typewriter reveal begins
       *   2700    caret drops, sentence reads clean
       *   3300    greeting fades + main screen zooms in (existing animation)
       *   4000    greeting removed
       */
      setTimeout(() => {
        $('#screen-clockin').classList.add('is-leaving');

        // 380ms later — clockin gone, swap to main (kept hidden) + show greeting
        setTimeout(() => {
          shiftStart = cloudStart || new Date();
          startServiceSync();
          $$('.screen').forEach(s => s.classList.remove('is-leaving'));
          showScreen('screen-main');
          const main = $('#screen-main');
          main.classList.add('is-pre-hidden');
          btn.classList.remove('is-loading');
          // Wire identity + role-restricted tabs BEFORE first paint
          applyRoleToMain();
          renderSchedule();
          renderHours();
          updateShiftMeta();
          // Pre-render so the dive-in shows real data, not empty bones.
          // Restricted roles land straight in the profil tab.
          setTab(activeRole.defaultTab);
          renderAll();
          lucide.createIcons();

          runGreetingFlash(main);
        }, 380);
      }, 640);
    }

    function enterBrowseMode() {
      document.body.classList.add('is-browse-mode');
      svApplyBrowseLock(true);
      // Hard guarantee: no shift in flight when consulting from home.
      shiftStart = null;

      $$('.screen').forEach(s => s.classList.remove('is-leaving'));
      showScreen('screen-main');
      const main = $('#screen-main');
      main.classList.remove('is-pre-hidden', 'is-entering');

      applyRoleToMain();
      // Force profil tab — schedule + hours is the only sensible view
      // when off-shift, regardless of role.
      setTab('profil');
      renderSchedule();
      renderHours();
      try { renderAll(); } catch (e) {}
      // Topbar shift-meta: replace "En service · 0h 00" with "Hors service"
      const tbMeta = $('#tb-shift-meta');
      if (tbMeta) tbMeta.textContent = 'Hors service';
      lucide.createIcons();
    }

    function exitBrowseMode() {
      document.body.classList.remove('is-browse-mode');
      svApplyBrowseLock(false);
      // Reset topbar back to default for the next clock-in cycle.
      const tbMeta = $('#tb-shift-meta');
      if (tbMeta) tbMeta.textContent = 'En service · 0h 00';
    }

    function runGreetingFlash(mainEl) {
      const greetEl = $('[data-kiwi-greet]');
      if (!greetEl) {
        // Fallback: skip flash, just reveal main
        mainEl.classList.remove('is-pre-hidden');
        mainEl.classList.add('is-entering');
        const tab = $('.tab-tables');
        tab.classList.add('is-fresh');
        setTimeout(() => tab.classList.remove('is-fresh'), 1300);
        setTimeout(() => mainEl.classList.remove('is-entering'), 700);
        return;
      }

      // --- Dynamic copy — picks per role ---
      const line1El = $('#greet-line1');
      const subEl   = $('#greet-sub');
      if (line1El) line1El.textContent = `${employeeHello(activeRole.name)},`;
      if (subEl) {
        if (activeRole.restricted) {
          // Non-server staff — generic welcome, no table-counting.
          subEl.textContent = `${svName('Café Atlas') || 'Service'} · ${employeeRoleName(activeRole.role).toLocaleLowerCase(employeeLocale())} · ${employeeShiftWish()}`;
        } else {
          const myCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
          const tod = (typeof timeOfDay === 'function') ? timeOfDay() : 'ce soir';
          const paused = Object.entries(servers).filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
          let sub = `${employeeTableCount(myCount)} ${tod} · ${employeeShiftWish()}`;
          if (paused.length > 0) sub = `${employeeTableCount(myCount)} ${tod} · ${paused[0][1].name.split(' ')[0]} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}`;
          subEl.textContent = sub;
        }
      }

      // --- Wrap <em> in .em-clip + measure natural width ---
      let emClip = null;
      const greetH1 = greetEl.querySelector('h1');
      const greetEm = greetH1 && greetH1.querySelector('em');
      if (greetEm && !greetEm.parentNode.classList.contains('em-clip')) {
        const naturalW = Math.ceil(greetEm.getBoundingClientRect().width) + 6;
        emClip = document.createElement('span');
        emClip.className = 'em-clip';
        emClip.style.setProperty('--em-w', naturalW + 'px');
        greetEm.parentNode.insertBefore(emClip, greetEm);
        emClip.appendChild(greetEm);
      } else if (greetEm) {
        // Re-fire path (logout/login): wrapper exists, re-measure
        emClip = greetEm.parentNode;
        emClip.classList.remove('is-revealed', 'is-typing');
        // Force reflow before re-revealing
        void emClip.offsetWidth;
      }

      // t=0: show backdrop + slide up h1
      greetEl.classList.add('is-visible');
      greetEl.setAttribute('aria-hidden', 'false');

      // t=880: typewriter reveal begins
      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 880);

      // t=1680: caret drops
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 1680);

      // t=2280: greeting fades + main zooms in
      setTimeout(() => {
        greetEl.classList.remove('is-visible');
        greetEl.setAttribute('aria-hidden', 'true');
        mainEl.classList.remove('is-pre-hidden');
        mainEl.classList.add('is-entering');
        // The "fresh" stagger lives on tab-tables; only fire it if the user
        // lands there (servers). Restricted roles land on profil.
        if (!activeRole.restricted) {
          const tab = $('.tab-tables');
          tab.classList.add('is-fresh');
          setTimeout(() => tab.classList.remove('is-fresh'), 1300);
        }
        setTimeout(() => mainEl.classList.remove('is-entering'), 700);
      }, 2280);
    }

    function updateWelcomeCopy() {
      const myCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
      const paused = Object.entries(servers).filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
      $('#wb-line1').textContent = `${employeeHello(activeRole.name)}!`;
      const tod = timeOfDay();
      let line2 = `${employeeTableCount(myCount)} ${tod} · ${employeeShiftWish()}`;
      if (paused.length > 0) {
        line2 = `${employeeTableCount(myCount)} ${tod} · ${paused[0][1].name.split(' ')[0]} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}`;
      }
      $('#wb-line2').textContent = line2;
    }

    function showWelcomeBanner() {
      updateWelcomeCopy();
      const banner = $('#welcome-banner');
      // restart animation
      banner.classList.remove('is-visible');
      void banner.offsetWidth;
      banner.classList.add('is-visible');
      lucide.createIcons();
    }

    function resetToEmployeePortal(message) {
      window.KiwiServiceRequests?.reset();
      stopServiceSync();
      clearEmployeeOperationalState();
      shiftStart = null;
      tablesPaid = 0;
      pinInput = '';
      renderPinDots();
      pinGreetLastEmployee();
      showScreen('screen-pin');
      if (teamKit()) window.KiwiTeamPin.reset();
      if (message) toast(message);
    }

    function pinGreetLastEmployee() {
      const who = document.querySelector('[data-pin-who]');
      const sw = document.querySelector('[data-pin-switch]');
      if (!who || !sw) return;
      const first = String((document.querySelector('.tb-name') || {}).textContent || '').trim().split(/\s+/)[0];
      if (!first || first === 'Serveur') return;
      who.dataset.employee = first;
      who.dataset.venue = who.dataset.venue || who.textContent;
      who.textContent = employeeHello(first);
      sw.hidden = false;
    }

    function logoutEmployeeSession() {
      /* Clear synchronously, before the asynchronous cookie logout. A fast
         second login must not have even one event-loop turn in which the former
         employee's draft can publish under the new identity. */
      stopServiceSync();
      clearEmployeeOperationalState();
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        window.KiwiEmployeeLive.logout().catch(() => {});
      }
      resetToEmployeePortal('Session fermée');
    }

    async function finishClockOut() {
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        const saved = await window.KiwiEmployeeLive.clockOut(window.__kiwiShiftProgress || null, attendanceCode);
        if (saved && saved.queued) toast(PUNCH_SAVED, 3200);
      }
      await afterClockOut();
    }

    async function afterClockOut() {
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        consumeAttendanceCode();
        await window.KiwiEmployeeLive.logout();
      }
      resetToEmployeePortal(employeeLanguage === 'en' ? 'Shift closed' : employeeLanguage === 'ar' ? 'تم إنهاء الوردية' : 'Fin de service enregistrée');
    }

    function teamKit() { return !SV_DEMO && !!window.KiwiTeamPin; }

    function mountTeamSignIn() {
      if (!teamKit()) return;
      /* The pad only collects the code. The sign-in is the shipped form's
         KiwiEmployeeLive.login, which also hands the phone's offline punches
         to whoever signs in (owner, 2026-10-27: 2027 is a skin). */
      let signedInData = null;
      window.KiwiTeamPin.signIn($('#screen-pin'), {
        request: (email, code) => {
          signedInData = null;
          return Promise.resolve().then(() => window.KiwiEmployeeLive.login(email, code)).then(
            (data) => { signedInData = data; return { kind: 'answer', status: 200, json: true, body: Object.assign({ ok: true }, data || {}) }; },
            (err) => (err && err.status
              ? { kind: 'answer', status: err.status, json: true, body: { error: err.code || '' } }
              : { kind: 'network' }));
        },
        signedIn: () => Promise.resolve(signedInData || window.KiwiEmployeeLive.refresh()).then(openEmployeeSession),
      });
    }

    function mountTeamClock() {
      window.KiwiTeamPin.clock($('#screen-clockin'), {
        action: attendanceAction,
        /* The pad only collects the code. The punch goes through the same
           KiwiEmployeeLive call as the shipped button, so a punch made without
           a connection is kept on the phone and sent later (owner, 2026-10-27:
           2027 is a skin, it must not behave differently). The pad's opId is
           the punch's identity, so its retries cannot open a second shift. */
        request: (code, opId) => {
          const live = window.KiwiEmployeeLive;
          const punch = attendanceAction === 'clock-out'
            ? live.clockOut(window.__kiwiShiftProgress || null, code, opId)
            : live.clockIn(code, opId);
          return Promise.resolve(punch).then(
            (saved) => ({ kind: 'answer', status: 200, json: true, body: Object.assign({ ok: true }, saved || {}) }),
            (err) => (err && err.status
              ? { kind: 'answer', status: err.status, json: true, body: { error: err.code || '' } }
              : { kind: 'network' }));
        },
        done: (saved) => {
          if (saved && saved.queued) toast(PUNCH_SAVED, 3200);
          /* The answer is the session as the server now holds it. */
          window.KiwiEmployeeLive.refresh().catch(() => {});
          if (attendanceAction === 'clock-out') {
            afterClockOut().catch(() => resetToEmployeePortal());
            return;
          }
          const start = saved && saved.entry && saved.entry.inTs ? new Date(saved.entry.inTs) : new Date();
          if (liveEmployeeState && liveEmployeeState.attendance) liveEmployeeState.attendance.open = (saved && saved.entry) || null;
          consumeAttendanceCode();
          enterServiceAfterClockIn($('#ci-button'), start);
        },
        signIn: endRevokedSession,
      });
    }

    function clockOut() {
      if (!SV_DEMO && attendanceCode.length !== 6) {
        prepareAttendanceGate('clock-out');
        toast('Saisissez le code de la caisse pour pointer le départ');
        return;
      }
      finishClockOut().catch((error) => {
        if (pinError(error && error.code, error && error.status)) endRevokedSession();
      });
    }

    function moveBtPill(forceInstant) {
      const cap = $('#bt-capsule'), pill = $('#bt-pill');
      if (!cap || !pill) return;
      const active = cap.querySelector('.bt-btn[aria-pressed="true"]');
      if (!active || cap.offsetWidth === 0) return;  // hidden / not laid out yet
      const capR = cap.getBoundingClientRect(), r = active.getBoundingClientRect();
      const left = Math.round(r.left - capR.left), w = Math.round(r.width);
      const set = (l, width) => { pill.style.transform = `translateX(${l}px)`; pill.style.width = width + 'px'; };
      pill.style.opacity = '1';
      if (forceInstant || btPillLeft === null) {
        pill.style.transition = 'none'; set(left, w); void pill.offsetWidth; pill.style.transition = '';
        btPillLeft = left; btPillW = w; return;
      }
      if (left === btPillLeft && w === btPillW) return;
      // phase 1: stretch the pill to span old + new, phase 2: settle on the target
      const spanLeft = Math.min(btPillLeft, left);
      const spanW = Math.max(btPillLeft + btPillW, left + w) - spanLeft;
      set(spanLeft, spanW);
      setTimeout(() => set(left, w), 115);
      btPillLeft = left; btPillW = w;
    }

    function setTab(name) {
      if (svBrowseMode() && name !== 'profil') { svBrowseGuard(); return; }
      const content = $('#main-content');
      if (content && name !== currentTab) content.scrollTop = 0;
      currentTab = name;
      $$('.bt-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === name ? 'true' : 'false'));
      moveBtPill();
      $$('.tab').forEach(t => {
        const match = t.dataset.tab === name;
        t.hidden = !match;
        t.classList.toggle('is-active', match);
      });
      // Refresh content per tab
      if (name === 'tables')   renderTables();
      if (name === 'menu')     { renderMenuContext(); renderCatPills(); renderMenu(); }
      if (name === 'notifications') {
        serviceUnread = 0;
        serviceNotifications.forEach((item) => { item.unread = false; });
        renderNotifications();
        updateNotificationBadge();
      }
      if (name === 'profil')   renderProfil();
      // Always update cart bar visibility on tab switch
      renderCartBar();
      lucide.createIcons();
    }

    function updateFilterCounts() {
      updateNotificationBadge();
    }

    function updateNotificationBadge() {
      const badge = $('#bt-notification-badge');
      if (!badge) return;
      badge.textContent = serviceUnread > 99 ? '99+' : String(serviceUnread);
      badge.hidden = serviceUnread < 1;
    }

    function filterMatches(t) {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'occupied') return ['a-commander','ka-yaklo','bgha-ykhlass','ka-tkhdam'].includes(t.status);
      if (activeFilter === 'bgha') return t.status === 'bgha-ykhlass';
      if (activeFilter === 'khawya') return t.status === 'khawya';
      return true;
    }

    function tableCardHTML(id, t, opts = {}) {
      const total = (t.status === 'khawya' || t.status === 'khlass') ? 0 : getTableTotal(id);
      const statusTxt = employeeTranslation(statusLabel[t.status]);
      const split = tableSplits.get(id);
      const pendingOrder = svPendingOrderFor(id);
      let line2 = '';
      if (pendingOrder) {
        line2 = `Commande OrderPro à valider · ${fmtMAD(pendingOrder.total)}`;
      } else if (split) {
        line2 = `Split en cours · ${split.paidCount}/${split.parts.length} réglées`;
      } else if (t.status === 'khawya')      line2 = employeeTranslation('Disponible');
      else if (t.status === 'khlass')        line2 = employeeTranslation('Réglée');
      else                                    line2 = `${statusTxt} · ${employeeMinuteCount(t.elapsed)}`;

      const displayTotal = total > 0 ? total : (pendingOrder ? pendingOrder.total : 0);
      const showAmount = displayTotal > 0;
      const urgentDot = (t.status === 'bgha-ykhlass' || pendingOrder) ? `<span class="tc-pulse-dot${pendingOrder ? ' is-pending' : ''}"></span>` : '';
      const orderProBadge = pendingOrder ? `<span class="tc-orderpro-badge" style="font-size:9.5px;font-weight:700;letter-spacing:0.04em;color:var(--forest-deep);background:var(--mint);padding:2px 7px;border-radius:6px;margin-left:6px;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="smartphone" style="width:11px;height:11px;"></i>OrderPro</span>` : '';
      const serverInfo = t.server && servers[t.server];
      const serverChip = (opts.showServer && t.server !== currentUser && serverInfo)
        ? `<span class="tc-server-chip">${esc(serverInfo.initials)}</span>`
        : '';

      const currentActor = (activeRole && (activeRole.fullName || activeRole.name)) || 'Serveur';
      const activeLock = serviceTableLocks && serviceTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentActor && (Date.now() - Number(activeLock.ts || 0) < 60000);
      const lockChip = isLockedByOther ? `<span class="tc-lock-indicator" title="Prise en cours par ${esc(activeLock.actor)}"><i data-lucide="lock"></i></span>` : '';

      return `
        <button type="button" class="table-card${pendingOrder ? ' has-orderpro' : ''}" data-status="${esc(t.status)}" data-table="${esc(id)}">
          ${lockChip}
          <div class="tc-num">${esc(id)}</div>
          <div class="tc-info">
            <div class="tc-line1">${esc(id)} · ${employeeCoverCount(t.covers || t.seats || 0)} ${orderProBadge} ${serverChip} ${urgentDot}</div>
            <div class="tc-line2">${line2}</div>
          </div>
          <div class="tc-right">
            ${showAmount ? `<div class="tc-amount">${fmtMAD(displayTotal)}</div>` : ''}
          </div>
          <div class="tc-arrow"><i data-lucide="chevron-right"></i></div>
        </button>
      `;
    }

    function zoneDisplayLabel(table) {
      const key = String(table && table.zone || 'salle').toLowerCase();
      const labels = employeeLanguage === 'ar'
        ? { salle:'القاعة', terrasse:'الشرفة', etage:'الطابق', étage:'الطابق', comptoir:'المنضدة', patio:'الفناء', jardin:'الحديقة' }
        : employeeLanguage === 'en'
          ? { salle:'Dining room', terrasse:'Terrace', etage:'Upper floor', étage:'Upper floor', comptoir:'Counter', patio:'Patio', jardin:'Garden' }
          : { salle:'Salle', terrasse:'Terrasse', etage:'Étage', étage:'Étage', comptoir:'Comptoir', patio:'Patio', jardin:'Jardin' };
      const supplied = String(table && table.zoneLabel || '').trim();
      /* « Salle », « Terrasse »… : le nom par défaut d'une zone est un mot, pas
         un nom propre ; il suit la langue de l'app quelle que soit sa clé. */
      const FR_ZONES = { salle:'Salle', terrasse:'Terrasse', etage:'Étage', comptoir:'Comptoir', patio:'Patio', jardin:'Jardin' };
      const frKey = employeeLanguage !== 'fr' && Object.keys(FR_ZONES).find((k) => FR_ZONES[k].toLowerCase() === supplied.toLowerCase());
      if (frKey) return labels[frKey];
      return supplied && !(supplied === 'Salle' && (key !== 'salle' || employeeLanguage !== 'fr')) ? supplied : (labels[key] || supplied || labels.salle);
    }

    function renderTables() {
      updateFilterCounts();
      $$('.scope-btn').forEach(b => {
        const active = b.dataset.scope === currentScope;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      $$('.filter-chip').forEach(b => {
        const active = b.dataset.filter === activeFilter;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      // Scope counts (always reflect totals)
      const mineCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
      const allCount = Object.keys(tables).length;
      $('#scope-mine-count').textContent = mineCount;
      $('#scope-all-count').textContent = allCount;
      const scoped = Object.keys(tables).filter(id => currentScope === 'all' || isMineTable(tables[id])).map(id => tables[id]);
      const counts = {
        all: scoped.length,
        occupied: scoped.filter(t => ['a-commander','ka-yaklo','bgha-ykhlass','ka-tkhdam'].includes(t.status)).length,
        bgha: scoped.filter(t => t.status === 'bgha-ykhlass').length,
        khawya: scoped.filter(t => t.status === 'khawya').length,
      };
      Object.keys(counts).forEach(key => { const el = document.querySelector(`[data-filter-count="${key}"]`); if (el) el.textContent = counts[key]; });

      const wrap = $('#tables-zones');
      /* Plan vide : « chargement », « injoignable » ou « réellement vide »,
         jamais la boîte « modifiez le filtre » quand il n'y a rien à filtrer. */
      wrap.innerHTML = !Object.keys(tables).length
        ? svFloorEmptyHTML()
        : svFloorNoteHTML() + (currentScope === 'mine' ? renderOwnTables() : renderAllTables());
      lucide.createIcons();
    }

    function renderOwnTables() {
      const myIds = Object.keys(tables).filter(id => isMineTable(tables[id]) && filterMatches(tables[id]));

      // Pause-alert banner if any colleague on pause
      const paused = Object.entries(servers)
        .filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
      let alertHTML = '';
      if (paused.length > 0) {
        alertHTML = paused.map(([id, s]) => {
          const n = Object.keys(tables).filter(tid => tableServerIds(tables[tid]).includes(id)).length;
          return `
            <div class="colleague-alert" data-go-all="${id}">
              <div class="colleague-alert-icon"><i data-lucide="coffee"></i></div>
              <div class="colleague-alert-text">
                <div class="colleague-alert-title">${esc(s.name)} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}</div>
                <div class="colleague-alert-sub">${employeeLanguage === 'ar' ? `${employeeTableCount(n)} للتغطية · اضغط للعرض` : employeeLanguage === 'en' ? `${employeeTableCount(n)} to cover · tap to view` : `${employeeTableCount(n)} à couvrir · tapez pour voir`}</div>
              </div>
              <i data-lucide="chevron-right" class="colleague-alert-chev"></i>
            </div>`;
        }).join('');
      }

      const titleHTML = `
        <div class="scope-title">
          <span>${ownTablesTitle()}</span>
          <span class="scope-count-pill">${myIds.length}</span>
        </div>`;

      const zoneSeen = Object.create(null);
      const zones = myIds
        .map((id) => ({ key: tables[id].zone || 'salle', label: zoneDisplayLabel(tables[id]) }))
        .filter((z) => { if (zoneSeen[z.key]) return false; zoneSeen[z.key] = 1; return true; });
      const zonesHTML = zones.map(z => {
        const ids = myIds.filter(id => tables[id].zone === z.key);
        if (ids.length === 0) return '';
        return `
          <div class="zone-block">
            <div class="section-title-row">
              <span class="section-title">${z.label}</span>
              <span class="section-count">${employeeTableCount(ids.length)}</span>
            </div>
            <div class="table-list">
              ${ids.map(id => tableCardHTML(id, tables[id])).join('')}
            </div>
          </div>`;
      }).join('');

      const empty = myIds.length ? '' : `<div class="tables-empty">
        <div class="tables-empty-icon"><i data-lucide="utensils-crossed"></i></div>
        <strong>${employeeTranslation('Aucune table ici')}</strong>
        <p>${employeeTranslation('Modifiez le filtre pour retrouver vos tables.')}</p>
        <button type="button" class="empty-cta" data-reset-filter>${employeeTranslation('Afficher toutes les tables')}</button>
      </div>`;
      return alertHTML + titleHTML + zonesHTML + empty;
    }

    function renderAllTables() {
      // All 21 tables grouped by server. Order: current user first,
      // then on-pause colleagues (urgent coverage), then other colleagues.
      const filteredCount = Object.keys(tables).filter(id => filterMatches(tables[id])).length;
      const titleHTML = `
        <div class="scope-title">
          <span>Toutes les tables</span>
          <span class="scope-count-pill">${filteredCount}</span>
        </div>`;

      const orderedIds = Object.keys(servers).sort((a, b) => {
        if (a === currentUser) return -1;
        if (b === currentUser) return 1;
        const aP = servers[a].status === 'on-pause' ? 0 : 1;
        const bP = servers[b].status === 'on-pause' ? 0 : 1;
        return aP - bP;
      });

      const sectionsHTML = orderedIds.map(sid => {
        const ids = Object.keys(tables).filter(id => (sid === currentUser ? isMineTable(tables[id]) : tableServerIds(tables[id]).includes(sid)) && filterMatches(tables[id]));
        if (ids.length === 0) return '';
        const s = servers[sid];
        const isMe = sid === currentUser;
        const isOnPause = s.status === 'on-pause';
        const statusText = isOnPause
          ? (employeeLanguage === 'ar' ? 'في استراحة · يحتاج إلى تغطية' : employeeLanguage === 'en' ? 'On break · needs cover' : 'En pause · à couvrir')
          : employeeTranslation('En service');
        return `
          <div class="zone-block">
            <div class="colleague-header">
              <div class="colleague-avatar ${isOnPause ? 'on-pause' : ''} ${isMe ? 'is-me' : ''}">${esc(s.initials)}</div>
              <div class="colleague-info">
                <div class="colleague-name">${esc(s.name)}${isMe ? ' <span class="colleague-you">· vous</span>' : ''}</div>
                <div class="colleague-status ${isOnPause ? 'on-pause' : ''}">${statusText}</div>
              </div>
              <span class="colleague-count">${employeeTableCount(ids.length)}</span>
            </div>
            <div class="table-list">
              ${ids.map(id => tableCardHTML(id, tables[id], { showServer: !isMe })).join('')}
            </div>
          </div>`;
      }).join('');

      const empty = sectionsHTML ? '' : `<div class="tables-empty">
        <div class="tables-empty-icon"><i data-lucide="layout-grid"></i></div>
        <strong>${employeeTranslation('Aucune table ici')}</strong>
        <p>${employeeTranslation('Modifiez le filtre pour retrouver vos tables.')}</p>
        <button type="button" class="empty-cta" data-reset-filter>${employeeTranslation('Afficher toutes les tables')}</button>
      </div>`;
      return titleHTML + sectionsHTML + empty;
    }

    function openTableDetail(id) {
      if (svBrowseGuard()) return;
      const t = tables[id];
      if (!t) return;
      if (isEmployeePaused()) { toast('Reprenez le service pour prendre une commande'); return; }

      // Commande OrderPro en attente : ouvre directement le détail pour valider l'envoi en cuisine
      const pending = svPendingOrderFor(id);
      if (pending) {
        activeTableId = id;
        setTableLock(id, 'acquire');
        ensureTableOrder(id);
        renderTableDetail();
        showScreen('screen-table');
        lucide.createIcons();
        return;
      }

      // Khawya tables → covers picker first
      if (t.status === 'khawya') {
        openNewTableModal(id);
        return;
      }
      // Khlass tables → just show info briefly
      if (t.status === 'khlass') {
        toast(`Table ${id} déjà réglée`);
        return;
      }
      activeTableId = id;
      setTableLock(id, 'acquire');
      ensureTableOrder(id);
      renderTableDetail();
      showScreen('screen-table');
      lucide.createIcons();
    }

    function renderTableDetail() {
      svTouchDrafts();
      const id = activeTableId;
      if (!id) return;
      // Special path: if this table has a split in progress, show
      // the resume/cancel view instead of the normal order detail.
      if (tableSplits.has(id) && serviceReopenedBillsAvailable && !serviceReopenedBills.has(id)) {
        return renderTableDetailSplit(id);
      }
      const t = tables[id];
      const order = ensureTableOrder(id);
      if (!serviceReopenedBillsAvailable) {
        $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
        $('#td-table-meta').textContent = 'Vérification des notes indisponible';
        $('#td-body').innerHTML = '<div class="td-pending-banner"><div class="td-pending-copy"><strong>Vérification indisponible</strong><span>La caisse peut encaisser. Le serveur ne peut pas confirmer ici qu’une note rouverte est encore due.</span></div></div>';
        $('#td-footer').innerHTML = '<button class="td-btn ghost" disabled>Vérification en cours · encaisser au comptoir</button>';
        return;
      }
      const reopened = serviceReopenedBills.get(id);
      if (reopened) {
        /* A reopened payment is not an unsent kitchen order. Its original
         * kitchen rows remain paid on the closed visit, so show the due part
         * without offering a misleading zero-MAD employee payment or a second
         * kitchen send. The cashier owns this split until it is settled. */
        $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
        $('#td-table-meta').textContent = 'Note rouverte · règlement au comptoir';
        const pill = $('#td-status-pill');
        pill.dataset.status = 'bgha-ykhlass';
        pill.textContent = 'Note rouverte';
        const lines = (reopened.lines || []).map(line => `<div class="td-item">
          <span style="font-weight:700;width:32px;text-align:center">${esc(line.qty)}×</span>
          <span class="td-item-name">${esc(line.name)}</span>
          <span class="td-item-price">${fmtMAD(line.total)}</span></div>`).join('');
        $('#td-body').innerHTML = `<div class="td-pending-banner"><div class="td-pending-copy">
          <strong>Note ${esc(reopened.ref || '')} rouverte en caisse</strong>
          <span>Partie à régler : ${fmtMAD(reopened.amountCents / 100)}. Les autres parties déjà payées restent réglées.</span>
          </div></div><div class="td-order-list">${lines}</div>`;
        $('#td-footer').innerHTML = '<button class="td-btn ghost" disabled>Encaisser cette note au comptoir</button>';
        lucide.createIcons();
        return;
      }
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      const isDirty = dirtyOrders.has(id);

      const currentActor = (activeRole && (activeRole.fullName || activeRole.name)) || 'Serveur';
      const activeLock = serviceTableLocks && serviceTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentActor && (Date.now() - Number(activeLock.ts || 0) < 60000);
      const lockBannerHtml = isLockedByOther ? `
        <div class="td-lock-banner">
          <i data-lucide="lock"></i>
          <span><strong>${esc(activeLock.actor)}</strong> prend la commande sur cette table</span>
        </div>
      ` : '';

      /* ── UNE COMMANDE QUI ATTEND, ET LE SERVEUR QUI PEUT DIRE OUI ─────────
       * L'app prévenait déjà (« nouvelle commande »), affichait déjà les
       * lignes — et n'offrait aucun geste : il fallait traverser la salle
       * pour qu'une autre paire de mains appuie au comptoir. Le bouton est
       * ici, sur la table concernée. Refuser reste au comptoir. */
      const pendingOrder = svPendingOrderFor(id);
      const pendingBannerHtml = pendingOrder ? `
        <div class="td-pending-banner">
          <div class="td-pending-copy">
            <strong>Commande ${esc(serviceOrderRef(pendingOrder))} en attente</strong>
            <span>Arrivée par le menu en ligne · elle n'est pas encore partie en cuisine.</span>
          </div>
          <button class="td-pending-go" data-accept-order="${esc(pendingOrder.id)}">Accepter · envoyer en cuisine</button>
        </div>
      ` : '';

      $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
      $('#td-table-meta').textContent = (t.status === 'khawya' || t.status === 'khlass')
        ? employeeTranslation(statusLabel[t.status])
        : `${employeeTranslation(statusLabel[t.status])} · ${employeeMinuteCount(t.elapsed)}`;
      const pill = $('#td-status-pill');
      pill.dataset.status = t.status;
      pill.textContent = employeeTranslation(statusLabel[t.status]);

      // Body
      const body = $('#td-body');
      if (order.length === 0) {
        body.innerHTML = pendingBannerHtml + lockBannerHtml + `
          <div class="td-empty">
            <i data-lucide="utensils"></i>
            <p>Aucun article, appuyez sur <strong>Prendre la commande</strong> pour ouvrir le menu.</p>
          </div>
        `;
      } else {
        /* Once the guest asks for the bill, the priced lines become a receipt,
           not an editable cart. Extra items still go through "Ajouter", then
           must be sent before payment can resume. */
        const isEditable = (t.status === 'a-commander' || t.status === 'ka-yaklo');
        const itemsHTML = order.map(l => {
          const noteTxt = (l.note || '').trim();
          const optTxt = optsSummary(l.opts);
          const optLine = optTxt ? `<span class="td-item-optline">${SLIDERS_SVG}${esc(optTxt)}</span>` : '';
          const isPart = l.kind === 'formula-part';
          const isFormula = l.kind === 'formula';
          const displayName = isPart
            ? `<span style="color:var(--forest-ink);font-size:11px;font-weight:600;margin-right:4px;">[${esc(l.slotLabel || 'Choix')}]</span> ${esc(svLineName(l))}`
            : (isFormula ? `${esc(svLineName(l))} <span style="font-size:9.5px;font-weight:700;letter-spacing:0.05em;color:var(--forest-ink);background:var(--mint-tint);padding:1px 6px;border-radius:4px;margin-left:6px;">FORMULE</span>` : esc(svLineName(l)));
          const displayPrice = isPart
            ? `<span class="td-item-price" style="font-size:12px;color:var(--ink-4);">inclus</span>`
            : `<span class="td-item-price">${fmtMAD(l.price * l.qty)}</span>`;

          if (isEditable) {
            const stepper = isPart
              ? `<div class="td-item-qty" style="justify-content:center;color:var(--ink-4);font-size:13px;">↳</div>`
              : `
                <div class="td-item-qty">
                  <button class="td-qty-btn minus" data-qty="dec" aria-label="Annuler un ${esc(l.name)}" ${l.voidPending ? 'disabled title="En attente de la cuisine"' : ''}>−</button>
                  <span class="td-qty-num">${l.qty}</span>
                  <button class="td-qty-btn plus" data-qty="inc" aria-label="Plus">+</button>
                </div>`;
            return `
              <div class="td-item" data-order-uid="${l.uid}">
                ${stepper}
                <span class="td-item-name">${displayName}</span>
                ${displayPrice}
                ${optLine}${svPromoLine(l)}
                <input class="td-item-note${noteTxt ? ' has-note' : ''}" data-note-uid="${l.uid}"
                  placeholder="Note cuisine, ex. bien chaud, sans oignon" aria-label="Note cuisine, ${esc(l.name)}" />
              </div>
            `;
          } else {
            return `
              <div class="td-item" data-order-uid="${l.uid}">
                <span style="font-weight:700;width:32px;text-align:center;font-feature-settings:'tnum' 1;">${l.qty}×</span>
                <span class="td-item-name">${displayName}</span>
                ${displayPrice}
                ${!isPart && l.sentQty > 0 ? `<button type="button" class="td-qty-btn minus" data-qty="dec" aria-label="Annuler un ${esc(l.name)}" ${l.voidPending ? 'disabled title="En attente de la cuisine"' : ''}>−</button>` : ''}
                ${optLine}${svPromoLine(l)}
                ${noteTxt ? `<span class="td-item-noteline">Note cuisine · ${esc(noteTxt)}</span>` : ''}
              </div>
            `;
          }
        }).join('');

        body.innerHTML = pendingBannerHtml + `
          <div class="td-order-list">${itemsHTML}</div>
          <div class="td-summary">
            <div class="td-row"><span>Sous-total</span><span class="mono">${fmtMAD(total)}</span></div>
            <div class="td-row"><span>Service (compris)</span><span class="mono">0 MAD</span></div>
            <div class="td-total-row">
              <span class="lbl">Total</span>
              <span class="val">${fmtMAD(total)}</span>
            </div>
          </div>
        `;
        // Set each per-dish note input's value safely (avoids HTML-escaping issues).
        order.forEach(l => {
          const inp = body.querySelector(`.td-item-note[data-note-uid="${l.uid}"]`);
          if (inp) inp.value = l.note || '';
        });
      }

      // Footer buttons depend on status
      const footer = $('#td-footer');
      const lancerHTML = isDirty ? `
        <button class="td-btn primary lancer-btn" data-action="lancer">
          <i data-lucide="send-horizontal"></i> Lancer la commande
        </button>` : '';
      let fHTML = '';
      if (t.status === 'a-commander' || t.status === 'ka-yaklo') {
        if (order.length === 0) {
          fHTML = `
            <button class="td-btn primary" data-action="take-order">
              <i data-lucide="book-open"></i> Prendre la commande
            </button>
            <button class="td-btn danger sm" data-action="cancel-table">
              <i data-lucide="x"></i> Fermer la table
            </button>
          `;
        } else {
          fHTML = lancerHTML + `
            <button class="td-btn ${isDirty ? 'ghost' : 'primary'}" data-action="take-order">
              <i data-lucide="plus"></i> ${isDirty ? 'Ajouter encore' : 'Ajouter articles'}
            </button>
            <div class="td-btn-row">
              <button class="td-btn warn row-pair" data-action="ask-bill">
                <i data-lucide="receipt"></i> Addition
              </button>
              <button class="td-btn dark row-pair" data-action="pay" ${(liveEmployeeState?.store?.serverPayments !== false) ? '' : 'hidden'}>
                <i data-lucide="credit-card"></i> Encaisser
              </button>
            </div>
          `;
        }
      } else if (t.status === 'bgha-ykhlass') {
        fHTML = lancerHTML + `
          <button class="td-btn ${isDirty || !(liveEmployeeState?.store?.serverPayments !== false) ? 'ghost' : 'primary'}" data-action="pay" ${isDirty || !(liveEmployeeState?.store?.serverPayments !== false) ? 'disabled aria-disabled="true"' : ''}>
            <i data-lucide="credit-card"></i> ${isDirty ? 'Envoyez d’abord les modifications' : ((liveEmployeeState?.store?.serverPayments !== false) ? 'Encaisser ' : 'Encaissement à la caisse · ') + fmtMAD(total)}
          </button>
          <div class="td-btn-row">
            <button class="td-btn ghost row-pair" data-action="print-bill">
              <i data-lucide="printer"></i> Imprimer
            </button>
            <button class="td-btn ghost row-pair" data-action="take-order">
              <i data-lucide="plus"></i> Ajouter
            </button>
          </div>
        `;
      } else if (t.status === 'ka-tkhdam') {
        fHTML = `
          <button class="td-btn ghost" disabled style="opacity:.6">
            <i data-lucide="loader"></i> Paiement en cours…
          </button>
        `;
      } else if (t.status === 'khlass') {
        fHTML = `
          <button class="td-btn ghost" disabled>
            <i data-lucide="check-circle-2"></i> Table réglée
          </button>
        `;
      }
      if (t.status === 'a-commander' || t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass') {
        fHTML += `
          <button class="td-btn danger sm" data-action="cancel-table" type="button"><i data-lucide="x"></i> Annuler toute la table</button>
          <div class="td-extra-row">
            <button class="td-extra-btn" type="button" data-action="transfer-table"><i data-lucide="arrow-right-left"></i>Changer table</button>
            <button class="td-extra-btn" type="button" data-action="merge-table"><i data-lucide="merge"></i>Fusionner</button>
          </div>
        `;
      }
      footer.innerHTML = fHTML;
      lucide.createIcons();
    }

    function renderTableDetailSplit(id) {
      const t = tables[id];
      const split = tableSplits.get(id);
      const paidTotal = split.parts.reduce((s, p) => s + (p.paid ? p.amountCents : 0), 0) / 100;
      const remaining = split.parts.length - split.paidCount;
      const remainingAmt = (split.totalCents - Math.round(paidTotal * 100)) / 100;
      const pct = Math.round((split.paidCount / split.parts.length) * 100);

      $('#td-table-name').textContent = `${id} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;
      $('#td-table-meta').textContent = `Split en cours · ${split.paidCount}/${split.parts.length} réglées`;
      const pill = $('#td-status-pill');
      pill.dataset.status = 'ka-tkhdam';
      pill.textContent = `Split ${split.paidCount}/${split.parts.length}`;

      // Body: split banner with progress + read-only order
      const order = ensureTableOrder(id);
      const orderHTML = order.map(l => {
        const optTxt = optsSummary(l.opts);
        return `
        <div class="td-item" style="opacity:0.55">
          <span style="font-weight:700;width:32px;text-align:center;font-feature-settings:'tnum' 1;">${l.qty}×</span>
          <span class="td-item-name">${esc(svLineName(l))}</span>
          <span class="td-item-price">${fmtMAD(l.price * l.qty)}</span>
          ${optTxt ? `<span class="td-item-optline">${SLIDERS_SVG}${esc(optTxt)}</span>` : ''}${svPromoLine(l)}
        </div>`;
      }).join('');

      $('#td-body').innerHTML = `
        <div class="td-split-banner">
          <div class="td-split-banner-row">
            <div class="td-split-banner-icon"><i data-lucide="split"></i></div>
            <div class="td-split-banner-text">
              <div class="td-split-banner-title">Split en cours · ${split.paidCount}/${split.parts.length}</div>
              <div class="td-split-banner-sub">${fmtMAD(paidTotal)} réglés / ${fmtMAD(split.totalCents / 100)} · reste ${fmtMAD(remainingAmt)}</div>
            </div>
          </div>
          <div class="td-split-progress">
            <div class="td-split-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="td-order-list">${orderHTML}</div>
      `;

      // Footer: primary Continuer + cancel
      $('#td-footer').innerHTML = `
        <button class="td-btn primary lancer-btn" data-action="resume-split">
          <i data-lucide="play"></i> Continuer le split · ${remaining} part${remaining > 1 ? 's' : ''}
        </button>
        <button class="td-btn danger sm" data-action="cancel-split">
          <i data-lucide="x"></i> Annuler le split
        </button>
      `;
      lucide.createIcons();
    }

    function returnToFloor() {
      if (activeTableId) setTableLock(activeTableId, 'release');
      activeTableId = null;
      menuContextId = null;
      showScreen('screen-main');
      setTab('tables');  // setTab renders the tables panel + hides the cart bar
      lucide.createIcons();
    }

    function svPendingOrderFor(tableId) {
      let found = null;
      serviceCanonicalOrders.forEach((order) => {
        if (found) return;
        if (String(order.table) !== String(tableId)) return;
        if (order.status !== 'pending') return;
        found = order;
      });
      return found;
    }

    async function postServiceCancellation(body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('/api/order/queue', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `serveur ${res.status}`);
        return data;
      } catch (err) {
        if (controller.signal.aborted) throw new Error('délai dépassé · synchronisez la table avant de réessayer');
        throw err;
      } finally { clearTimeout(timer); }
    }

    function applyGroupedLineQtyDelta(lines, line, delta, adjustSentQty) {
      if (!line || line.kind === 'formula-part') return lines || [];
      const members = line.formulaUid
        ? (lines || []).filter(candidate => candidate.formulaUid === line.formulaUid)
        : [line];
      members.forEach(member => {
        member.qty = Math.max(0, (+member.qty || 0) + delta);
        if (adjustSentQty && member.sentQty != null) {
          member.sentQty = Math.max(0, (+member.sentQty || 0) + delta);
        }
      });
      return (lines || []).filter(member => (+member.qty || 0) > 0);
    }

    function openVoidReasonModal(tableId, line) {
      if (line.voidPending) { toast('Annulation déjà en attente de la cuisine'); return; }
      voidLineTarget = { tableId: tableId, line: line };
      selectedVoidReason = 'client_change';
      selectedVoidIsWaste = 0;
      $('#void-dish-name').textContent = `1× ${line.name}`;
      const chips = document.querySelectorAll('#void-reasons-chips .void-reason-chip');
      chips.forEach(c => c.classList.toggle('is-active', c.dataset.voidReason === 'client_change'));
      $('#void-reason-modal').classList.add('is-open');
      lucide.createIcons();
    }

    async function confirmVoidLine() {
      if (!voidLineTarget) return;
      const { tableId, line } = voidLineTarget;
      const confirmBtn = $('#void-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      if (!SV_DEMO) {
        try {
          const data = await postServiceCancellation({
              merchant: svSlug(),
              voidLine: {
                table: tableId,
                ...(line.orderId ? { orderId: line.orderId } : {}),
                lineId: line.canonicalUid || line.uid || line.id,
                qty: 1,
                reason: selectedVoidReason,
                isWaste: selectedVoidIsWaste,
                actor: activeRole.fullName || activeRole.name || 'Serveur'
              }
          });
          if (data.alertSent) {
            line.voidPending = true;
            toast(`Annulation demandée · attente de la cuisine · ${line.name}`);
            $('#void-reason-modal').classList.remove('is-open');
            if (confirmBtn) confirmBtn.disabled = false;
            voidLineTarget = null;
            renderTableDetail();
            return;
          }
          toast(`${line.name} annulé en cuisine`);
        } catch (err) {
          toast(`Annulation : ${err.message || 'erreur réseau'}`);
          if (confirmBtn) confirmBtn.disabled = false;
          return;
        }
      }

      tableOrders[tableId] = applyGroupedLineQtyDelta(tableOrders[tableId] || [], line, -1, true);
      markDirty(tableId);
      $('#void-reason-modal').classList.remove('is-open');
      if (confirmBtn) confirmBtn.disabled = false;
      voidLineTarget = null;
      renderTableDetail();
    }

    async function changeOrderQty(tableId, uid, delta) {
      /* One change per line at a time. Two quick taps computed the same target
         from the same line.qty before the first request returned, so one tap
         was lost, and two « − » could open two void requests. */
      const inFlight = changeOrderQty.inFlight || (changeOrderQty.inFlight = new Set());
      const flightKey = tableId + '|' + uid;
      if (inFlight.has(flightKey)) return;
      inFlight.add(flightKey);
      try {
      const order = tableOrders[tableId];
      if (!order) return;
      const line = order.find(l => l.uid === uid);
      if (!line) return;
      if (line.voidPending && delta < 0) { toast('Annulation déjà en attente de la cuisine'); return; }
      if (line.kind === 'formula-part') return;

      if (line.kind === 'formula' && delta > 0) {
        openFormulaSheet(line.id, 1);
        return;
      }

      // Pre-send local modification
      if (!line.sentQty || (line.qty > line.sentQty && delta < 0 && line.qty - 1 >= line.sentQty)) {
        tableOrders[tableId] = applyGroupedLineQtyDelta(order, line, delta, false);
        markDirty(tableId);
        renderTableDetail();
        return;
      }

      // Sent line modification
      if (delta < 0) {
        const newQty = line.qty + delta;
        if (newQty <= 0) {
          openVoidReasonModal(tableId, line);
          return;
        }

        if (!SV_DEMO) {
          try {
            const res = await fetch('/api/order/queue', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                merchant: svSlug(),
                editLine: {
                  table: tableId,
                  ...(line.orderId ? { orderId: line.orderId } : {}),
                  lineId: line.canonicalUid || line.uid || line.id,
                  qty: newQty,
                  isWaste: 0,
                  actor: activeRole.fullName || activeRole.name || 'Serveur'
                }
              })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && !data.ok)) {
              toast(`Modification refusée · ${svErrLabel(data && data.error)}`);
              return;
            }
            if (data.alertSent || data.tier === 2) {
              line.voidPending = true;
              toast(`Réduction demandée · attente de la cuisine · ${line.name}`);
              renderTableDetail();
              return;
            }
            toast(`${line.name} modifié (${newQty}×)`);
          } catch (err) {
            toast(`Erreur réseau : ${err.message || ''}`);
            return;
          }
        }
        line.qty = newQty;
        line.sentQty = Math.min(line.sentQty, line.qty);
        renderTableDetail();
        return;
      }

      if (delta > 0) {
        const targetQty = line.qty + delta;
        if (!SV_DEMO) {
          try {
            const res = await fetch('/api/order/queue', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                merchant: svSlug(),
                editLine: {
                  table: tableId,
                  ...(line.orderId ? { orderId: line.orderId } : {}),
                  lineId: line.canonicalUid || line.uid || line.id,
                  qty: targetQty,
                  actor: activeRole.fullName || activeRole.name || 'Serveur'
                }
              })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && !data.ok)) {
              toast(`Ajout refusé · ${svErrLabel(data && data.error)}`);
              return;
            }
            if (data.action === 'appended' && data.appendedLine) {
              tableOrders[tableId].push({
                uid: data.appendedLine.uid || newLineUid(),
                id: line.id,
                name: line.name,
                price: line.price,
                qty: data.appendedLine.qty || delta,
                opts: line.opts || [],
                note: '',
                sentQty: 0,
              });
              toast(`+1 ${line.name} ajouté`);
              renderTableDetail();
              return;
            }
          } catch (err) {
            toast(`Erreur réseau : ${err.message || ''}`);
            return;
          }
        }
        line.qty = targetQty;
        if (line.sentQty) line.sentQty = targetQty;
        renderTableDetail();
        return;
      }
      } finally { inFlight.delete(flightKey); }
    }

    function openNewTableModal(tableId) {
      if (svBrowseGuard()) return;
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

    async function confirmNewTable() {
      if (!newTableId) return;
      const id = newTableId;
      const confirm = $('#nt-confirm');
      if (confirm) confirm.disabled = true;
      if (!SV_DEMO) {
        try {
          const response = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: svSlug(), openTable: id, covers: newTableCovers }),
          });
          const saved = await response.json().catch(() => null);
          if (!response.ok || !saved || !saved.ok || !saved.session) throw new Error('open-failed');
          serviceTableSessions.set(id, String(saved.session));
          serviceTableSessionRevisions.set(id, Number(saved.revision) || 0);
        } catch (_) {
          if (confirm) confirm.disabled = false;
          toast(`Table ${id} · ouverture non enregistrée, réessayez`, 4800);
          return;
        }
      }
      $('#new-table-modal').classList.remove('is-open');
      const t = tables[id];
      t.covers = newTableCovers;
      t.status = 'ka-yaklo';
      t.elapsed = 0;
      /* A physical table is reusable; its previous visit is not. Drop any
         canonical rows still cached on this phone before creating the next
         bill. The new visit has no order yet, so nothing legitimate is lost. */
      Array.from(serviceCanonicalOrders.entries()).forEach(([orderId, order]) => {
        if (String(order.table) === String(id)) serviceCanonicalOrders.delete(orderId);
      });
      tableOrders[id] = [];
      publishServiceTableState(id, t.status, t.covers, false);
      activeTableId = id;
      newTableId = null;
      if (confirm) confirm.disabled = false;
      renderTableDetail();
      showScreen('screen-table');
      lucide.createIcons();
    }

    function serviceTableKitchenLocked(id) {
      return Array.from(serviceCanonicalOrders.values()).some(order =>
        String(order.table) === String(id) && ['accepted', 'ready', 'served'].includes(order.status))
        || (tableOrders[id] || []).some(line => !line.sourceCanonical && Number(line.sentQty) > 0);
    }

    function openTransferTableModal(tableId) {
      trfFromId = tableId;
      trfSelectedToId = null;
      $('#trf-from-id').textContent = tableId;
      const btnText = $('#trf-btn-text');
      if (btnText) btnText.textContent = 'Déplacer';
      const confirmBtn = $('#trf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderTransferTableGrid();
      $('#transfer-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderTransferTableGrid() {
      const grid = $('#trf-target-grid');
      if (!grid) return;
      const freeTables = Object.keys(tables).filter(id => id !== trfFromId && tables[id] && tables[id].status === 'khawya');
      if (!freeTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune table libre disponible actuellement.</div>';
        return;
      }
      grid.innerHTML = freeTables.map(id => {
        const t = tables[id];
        const isSel = id === trfSelectedToId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-trf-to="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} pl. · Libre</div>
          </div>
        `;
      }).join('');
    }

    async function confirmTransferTable() {
      if (!trfFromId || !trfSelectedToId) return;
      const from = trfFromId;
      const to = trfSelectedToId;
      const confirmBtn = $('#trf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const fromT = tables[from];
      const toT = tables[to];
      if (!fromT || !toT) return;

      if (!SV_DEMO) {
        /* Un geste, une opération : renvoyé après une réponse perdue, le même
           identifiant fait rejouer au serveur le déplacement déjà fait au lieu
           de répondre « table vide ». Oublié après un refus net (4xx). */
        let intent = confirmTransferTable.pendingIntent;
        if (!intent || intent.merchant !== svSlug() || intent.from !== from || intent.to !== to) {
          intent = confirmTransferTable.pendingIntent = { merchant: svSlug(), from, to,
            operationId: 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
            expectedSession: serviceTableSessions.get(from) || '',
            expectedRevision: serviceTableSessionRevisions.get(from) || 0 };
        }
        try {
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: svSlug(),
              transferTable: { from, to, covers: fromT.covers, server: activeRole.fullName || activeRole.name || '',
                operationId: intent.operationId,
                expectedSession: intent.expectedSession,
                expectedRevision: intent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmTransferTable.pendingIntent;
            throw new Error((data && data.error) || 'transfer-failed');
          }
          delete confirmTransferTable.pendingIntent;
          serviceTableSessionRevisions.set(to, Number(data.revision) || (serviceTableSessionRevisions.get(from) || 0));
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Déplacement impossible : ${err.message === 'table-kitchen-locked' ? 'commande déjà envoyée en cuisine' : (err.message || 'erreur réseau')}`, 4800);
          return;
        }
      }

      // Local State Migration
      toT.status = fromT.status;
      toT.covers = fromT.covers;
      toT.elapsed = fromT.elapsed;
      toT.orderNo = fromT.orderNo;
      tableOrders[to] = tableOrders[from] || [];
      if (dirtyOrders.has(from)) {
        dirtyOrders.delete(from);
        dirtyOrders.add(to);
      }
      if (tableSplits.has(from)) {
        tableSplits.set(to, tableSplits.get(from));
        tableSplits.delete(from);
      }
      // L'acompte suit la visite déplacée, comme son partage.
      if (serviceVisitCredit.has(from)) serviceVisitCredit.set(to, serviceVisitCredit.get(from));
      else serviceVisitCredit.delete(to);
      serviceVisitCredit.delete(from);
      if (serviceTableSessions.has(from)) {
        const movedRevision = serviceTableSessionRevisions.get(to) || serviceTableSessionRevisions.get(from) || 0;
        serviceTableSessions.set(to, serviceTableSessions.get(from));
        serviceTableSessionRevisions.set(to, movedRevision);
        serviceTableSessions.delete(from);
        serviceTableSessionRevisions.delete(from);
      }

      // Reset Source Table
      fromT.status = 'khawya';
      fromT.covers = 0;
      fromT.elapsed = 0;
      delete fromT.orderNo;
      delete tableOrders[from];

      // Update Canonical Orders cached on this device
      Array.from(serviceCanonicalOrders.values()).forEach(order => {
        if (order && String(order.table) === String(from)) order.table = to;
      });

      publishServiceTableState(from, 'khawya', 0, false);
      publishServiceTableState(to, toT.status, toT.covers, false);

      $('#transfer-table-modal').classList.remove('is-open');
      activeTableId = to;
      toast(`Table ${from} déplacée vers Table ${to}`);
      renderTableDetail();
      if (currentTab === 'tables') renderTables();
    }

    function openMergeTableModal(tableId) {
      mrgSourceId = tableId;
      mrgSelectedTargetId = null;
      $('#mrg-source-id').textContent = tableId;
      const btnText = $('#mrg-btn-text');
      if (btnText) btnText.textContent = 'Fusionner';
      const confirmBtn = $('#mrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderMergeTableGrid();
      $('#merge-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderMergeTableGrid() {
      const grid = $('#mrg-target-grid');
      if (!grid) return;
      // Other active tables
      const otherTables = Object.keys(tables).filter(id => id !== mrgSourceId && tables[id] && tables[id].status !== 'khawya' && tables[id].status !== 'khlass');
      if (!otherTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune autre table active à fusionner.</div>';
        return;
      }
      grid.innerHTML = otherTables.map(id => {
        const t = tables[id];
        const isSel = id === mrgSelectedTargetId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-mrg-target="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} cvts · ${employeeTranslation(statusLabel[t.status] || t.status)}</div>
          </div>
        `;
      }).join('');
    }

    async function confirmMergeTable() {
      if (!mrgSourceId || !mrgSelectedTargetId) return;
      const source = mrgSourceId;
      const target = mrgSelectedTargetId;
      const confirmBtn = $('#mrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const sourceT = tables[source];
      const targetT = tables[target];
      if (!sourceT || !targetT) return;

      let merged = null;
      if (!SV_DEMO) {
        // Même règle que le transfert : une seule opération par geste.
        let intent = confirmMergeTable.pendingIntent;
        if (!intent || intent.merchant !== svSlug() || intent.from !== source || intent.to !== target) {
          intent = confirmMergeTable.pendingIntent = { merchant: svSlug(), from: source, to: target,
            operationId: 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
            expectedSession: serviceTableSessions.get(source) || '',
            expectedRevision: serviceTableSessionRevisions.get(source) || 0 };
        }
        try {
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: svSlug(),
              mergeTables: { targetTable: target, sourceTable: source, server: activeRole.fullName || activeRole.name || '',
                operationId: intent.operationId,
                expectedSession: intent.expectedSession,
                expectedRevision: intent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmMergeTable.pendingIntent;
            throw new Error((data && data.error) || 'merge-failed');
          }
          delete confirmMergeTable.pendingIntent;
          merged = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Fusion impossible : ${err.message === 'table-kitchen-locked' ? 'commande déjà envoyée en cuisine' : (err.message || 'erreur réseau')}`, 4800);
          return;
        }
      }

      // Merge order lines
      const sourceLines = tableOrders[source] || [];
      const targetLines = tableOrders[target] || [];
      tableOrders[target] = targetLines.concat(sourceLines);
      targetT.covers = (targetT.covers || 0) + (sourceT.covers || 0);

      if (dirtyOrders.has(source)) {
        dirtyOrders.delete(source);
        dirtyOrders.add(target);
      }

      /* Ce qui a déjà été payé sur l'une ou l'autre table suit la visite
         fusionnée : on facture le reste que le serveur vient de calculer, et
         les partages en cours, bâtis sur l'ancienne addition de chaque table,
         n'ont plus de sens. Un partage repris rejouerait des parts déjà
         payées ; un nouveau partage se fait sur le reste. */
      if (merged && Number.isFinite(Number(merged.creditCents))) {
        if (Number(merged.creditCents) > 0) serviceVisitCredit.set(target, Math.round(Number(merged.creditCents)));
        else serviceVisitCredit.delete(target);
      }
      serviceVisitCredit.delete(source);
      [source, target].forEach((id) => {
        tableSplits.delete(id);
        const session = serviceTableSessions.get(id);
        if (!session || SV_DEMO) return;
        try {
          const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
          if (refs[key]) { delete refs[key]; localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs)); }
        } catch (_) {}
      });

      // Clear Source Table
      sourceT.status = 'khawya';
      sourceT.covers = 0;
      sourceT.elapsed = 0;
      delete sourceT.orderNo;
      delete tableOrders[source];
      serviceTableSessions.delete(source);
      serviceTableSessionRevisions.delete(source);

      // Update Canonical Orders cached on this device
      Array.from(serviceCanonicalOrders.values()).forEach(order => {
        if (order && String(order.table) === String(source)) order.table = target;
      });

      publishServiceTableState(source, 'khawya', 0, true);
      publishServiceTableState(target, targetT.status, targetT.covers, false);

      $('#merge-table-modal').classList.remove('is-open');
      activeTableId = target;
      toast(`Table ${source} fusionnée dans Table ${target}`);
      renderTableDetail();
      if (currentTab === 'tables') renderTables();
    }

    function renderMenuContext() {
      const block = $('#menu-context-block');
      if (menuContextId) {
        const t = tables[menuContextId];
        block.innerHTML = `
          <div class="menu-context">
            <div class="menu-context-icon">${menuContextId}</div>
            <div class="menu-context-text">
              <div class="menu-context-line1">Commande pour ${menuContextId}</div>
              <div class="menu-context-line2">${t.covers} couvert${t.covers > 1 ? 's' : ''} · ajoutez des articles ci-dessous</div>
            </div>
            <button class="menu-context-close" id="menu-context-close" aria-label="Fermer">
              <i data-lucide="x"></i>
            </button>
          </div>
        `;
      } else {
        block.innerHTML = `
          <div class="menu-banner">
            <i data-lucide="info"></i>
            <div class="menu-banner-text">Sélectionnez une table d'abord pour ajouter des articles. Vous pouvez parcourir le menu pour information.</div>
          </div>
        `;
      }
      lucide.createIcons();
    }

    function svMenuEmptyHTML() {
      const state = SV_DEMO ? 'empty' : svCarteState;
      if (state === 'empty' || state === 'ok') {
        return '<div class="menu-banner"><div class="menu-banner-text">Carte pas encore composée. ' +
          'Ajoutez vos catégories et vos plats depuis le tableau de bord · <b>Menu</b>.</div></div>';
      }
      if (state === 'error' || svKnownOffline()) {
        return '<div class="menu-banner is-down" role="status">' + SV_ICON_OFFLINE
          + '<div class="menu-banner-text">' + esc(employeeTranslation("Impossible de charger la carte. Elle s'affichera au retour du réseau.")) + '</div></div>';
      }
      return '<div class="menu-banner" role="status">' + SV_ICON_SYNC
        + '<div class="menu-banner-text">' + esc(employeeTranslation('Chargement de la carte…')) + '</div></div>';
    }

    function renderCatPills() {
      const counts = { all: menuItems.length };
      menuItems.forEach(m => { counts[m.cat] = (counts[m.cat] || 0) + 1; });
      const cats = catOrder;
      $('#cat-pills').innerHTML = cats.map(c => `
        <button class="cat-pill ${c === activeCat ? 'is-active' : ''}" data-cat="${esc(c)}">
          ${esc(window.KiwiMenuI18n ? window.KiwiMenuI18n.t(catLabels[c] || c, employeeLanguage) : (catLabels[c] || c))}<span class="count">${counts[c] || 0}</span>
        </button>
      `).join('');
      let row=$('#subcat-pills');
      if(!row){row=document.createElement('div');row.id='subcat-pills';row.className='cat-pills';row.addEventListener('click',e=>{const b=e.target.closest('[data-subcat]');if(!b)return;activeSub=b.dataset.subcat||null;renderCatPills();renderMenu();});$('#cat-pills').insertAdjacentElement('afterend',row);}
      const parent=svCats.find(c=>c.id===activeCat), subs=parent?(parent.sub||[]):[];
      row.hidden=activeCat==='all'||!subs.length;
      row.innerHTML=row.hidden?'':`<button class="cat-pill ${!activeSub?'is-active':''}" data-subcat="">Tout</button>`+subs.map(s=>`<button class="cat-pill ${activeSub===s.id?'is-active':''}" data-subcat="${esc(s.id)}">${esc(window.KiwiMenuI18n ? window.KiwiMenuI18n.t(s.name, employeeLanguage) : s.name)}<span class="count">${menuItems.filter(m=>m.cat===activeCat&&m.subId===s.id).length}</span></button>`).join('');
    }

    function renderMenu() {
      if (!menuItems.length) {
        $('#menu-grid').innerHTML = svMenuEmptyHTML();
        return;
      }
      const rawItems = activeCat === 'all' ? menuItems : menuItems.filter(m => m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const items = rawItems.map(it => Object.assign({}, it, {
        name: window.KiwiMenuI18n ? window.KiwiMenuI18n.name(it, employeeLanguage) : it.name,
        subLabel: it.subLabel && window.KiwiMenuI18n ? window.KiwiMenuI18n.t(it.subLabel, employeeLanguage) : it.subLabel,
      }));
      const localizedCats = {};
      Object.keys(catLabels).forEach(k => {
        localizedCats[k] = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(catLabels[k], employeeLanguage) : catLabels[k];
      });
      const activeOrder = menuContextId ? (tableOrders[menuContextId] || []) : [];
      $('#menu-grid').innerHTML = items.map(m => {
        const catLabels = localizedCats;
        // qty badge = total across every line of this dish (noted + plain)
        const qty = activeOrder.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0);
        const control = qty > 0
          ? `<span class="menu-item-stepper">
               <button class="step-btn step-minus" type="button" data-step="dec" aria-label="${esc(m.name)} −1">−</button>
               <span class="step-num">${qty}</span>
               <button class="step-btn step-plus" type="button" data-step="inc" aria-label="${esc(m.name)} +1">+</button>
             </span>`
          : `<span class="menu-item-add">+</span>`;
        const tag = itemHasFormula(m.id)
          ? `<span class="menu-item-optflag">Formule</span>`
          : (itemHasOptions(m.id) ? `<span class="menu-item-optflag">${SLIDERS_SVG}Options</span>` : '');
        return `
          <div class="menu-item ${qty > 0 ? 'is-in-cart' : ''}" data-menu-id="${esc(m.id)}" role="button" tabindex="0">
            ${tag}
            <span class="menu-item-cat">${esc(catLabels[m.cat] || '')}</span>
            ${m.subLabel ? `<span class="menu-item-cat">${esc(m.subLabel)}</span>` : ''}
            <span class="menu-item-name">${esc(m.name)}</span>
            <span class="menu-item-foot">
              <span class="menu-item-price">${m.price} MAD</span>
              ${control}
            </span>
          </div>
        `;
      }).join('');
    }

    function renderCartBar() {
      svTouchDrafts();
      const bar = $('#menu-cart-bar');
      if (!menuContextId || currentTab !== 'menu') {
        bar.classList.remove('is-visible');
        svRenderPair(null);
        return;
      }
      const order = tableOrders[menuContextId] || [];
      const count = order.reduce((s, l) => s + l.qty, 0);
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      if (count === 0) {
        bar.classList.remove('is-visible');
        try { window.KiwiPairs && KiwiPairs.reset('table:' + menuContextId); } catch (_) {}
        svRenderPair(null);
        return;
      }
      $('#mcb-count').textContent = count;
      $('#mcb-total').textContent = fmtMAD(total);
      bar.classList.add('is-visible');
      svRenderPair(order);
    }

    function svPairSellable(id) {
      const src = svFormulaItems.find(m => String(m.id) === String(id)) || menuItems.find(m => String(m.id) === String(id));
      if (!src || src.archived || src.formulaOnly || src.avail === false) return false;
      return !!menuItems.find(m => String(m.id) === String(id));
    }

    function svRenderPair(order) {
      const chip = $('#menu-pair-chip');
      if (!chip) return;
      let s = null;
      if (order && order.length && !SV_DEMO && window.KiwiPairs && KiwiPairs.suggest) {
        const ids = order.filter(l => l && l.kind !== 'formula-part' && l.id != null).map(l => String(l.id));
        try { s = KiwiPairs.suggest(ids, svPairSellable, 'table:' + menuContextId); } catch (_) { s = null; }
      }
      const m = s && menuItems.find(x => String(x.id) === s.id);
      const lead = s && menuItems.find(x => String(x.id) === s.lead);
      if (!m || !lead) { chip.hidden = true; chip.innerHTML = ''; return; }
      const pct = Math.round((Number(s.share) || 0) * 100);
      const name = (x) => esc(svLineName(x));
      /* Dans la langue de l'employé ; les noms de plats passent par
         KiwiMenuI18n comme les lignes de la commande (svLineName). */
      const t = KiwiPairs.say ? KiwiPairs.say(employeeLanguage) : null;
      if (!t) { chip.hidden = true; chip.innerHTML = ''; return; }
      chip.innerHTML = `
        <span class="menu-pair-txt">${t.lead(name(lead), name(m))}</span>
        <span class="menu-pair-why">${t.why(pct, name(lead))}</span>
        <button type="button" class="menu-pair-add" data-pair-add="${esc(m.id)}" aria-label="${t.add(name(m))}">+ ${fmtMAD(m.price)}</button>
        <button type="button" class="menu-pair-x" data-pair-dismiss="${esc(m.id)}" aria-label="${t.dismiss(name(m), 'table')}">×</button>`;
      chip.hidden = false;
    }

    function addToTableOrder(tableId, itemId) {
      if (!tableOrders[tableId]) tableOrders[tableId] = [];
      const source = svFormulaItems.find(m => String(m.id) === String(itemId)) || menuItems.find(m => String(m.id) === String(itemId));
      if (source && (source.archived || source.formulaOnly || source.avail === false)) { toast('Article non vendable individuellement'); return; }
      const item = menuItems.find(m => m.id === itemId);
      if (!item) return;
      // Stack onto the un-noted line; a noted line splits off so it keeps its note.
      /* Never increase a line hydrated from caisse/the order ledger. A later
         queue reconciliation replaces those rows, so the added quantity would
         disappear or be re-counted. New taps live in an explicit local draft
         until their own canonical ticket returns from /api/order/queue. */
      const priced = svPromoPrice(item, item.price);
      const line = tableOrders[tableId].find(l => l.sourceLocal === true && l.id === itemId && !(l.note || '').trim()
        && svPromoKey(l.promo) === svPromoKey(priced.promo));
      if (line) line.qty++;
      else tableOrders[tableId].push(Object.assign({ uid: newLineUid(), id: itemId, name: item.name, price: priced.price, basePrice: item.price, qty: 1, sentQty: 0, note: '', sourceLocal: true },
        priced.promo ? { promo: priced.promo } : null));
      markDirty(tableId);
      const card = document.querySelector(`.menu-item[data-menu-id="${itemId}"]`);
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderCartBar();
    }

    function openOptionsSheet(itemId) {
      const item = menuItems.find(m => m.id === itemId);
      if (!item || !itemHasOptions(itemId)) return;
      optDraft = { itemId, sel: {} };
      itemOptions[itemId].forEach(g => {
        const kind = optionGroups[g].kind;
        optDraft.sel[g] = kind === 'multi' ? new Set() : (kind === 'toggle' ? false : null);
      });
      renderOptionsSheet(false);
      $('#opt-modal').classList.add('is-open');
    }

    function closeOptionsSheet() {
      $('#opt-modal').classList.remove('is-open');
      optDraft = null;
    }

    function renderOptionsSheet(showMissing) {
      if (!optDraft) return;
      const item = menuItems.find(m => m.id === optDraft.itemId);
      const groupsHTML = itemOptions[optDraft.itemId].map(g => {
        const def = optionGroups[g], sel = optDraft.sel[g], required = isReq(def);
        const unmet = showMissing && required && sel == null;
        const pills = def.vals.map(v => {
          const on = def.kind === 'multi' ? sel.has(v.n)
                   : def.kind === 'toggle' ? sel === true
                   : sel === v.n;
          const valLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(v.n, employeeLanguage) : v.n;
          return `<button class="opt-pill ${on ? 'on' : ''}" data-opt-group="${g}" data-opt-val="${esc(v.n)}">${v.emoji ? `${esc(v.emoji)} ` : ''}${esc(valLabel)}${v.p ? `<span class="opt-pr">+${v.p}</span>` : ''}</button>`;
        }).join('');
        const grpLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(def.name, employeeLanguage) : def.name;
        return `
          <div class="opt-group ${unmet ? 'missing' : ''}">
            <div class="opt-group-head">
              <span class="opt-group-name">${esc(grpLabel)}</span>
              <span class="opt-group-tag ${required ? 'req' : 'opt'}">${required ? (employeeLanguage === 'ar' ? 'إجباري' : (employeeLanguage === 'en' ? 'Required' : 'Obligatoire')) : (employeeLanguage === 'ar' ? 'اختياري' : (employeeLanguage === 'en' ? 'Optional' : 'Optionnel'))}</span>
            </div>
            <div class="opt-vals">${pills}</div>
          </div>`;
      }).join('');
      const extra = optsExtra(optsFromSel(optDraft.itemId, optDraft.sel));
      const total = item.price + extra;
      const itemLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(item.name, employeeLanguage) : item.name;
      $('#opt-modal-body').innerHTML = `
        <h3 class="modal-title">${esc(itemLabel)}</h3>
        <p class="modal-subtle">${item.price} MAD${extra ? ` · +${extra} MAD d'options` : ''} · personnalisez avant d'ajouter à la commande</p>
        ${groupsHTML}
        <div class="opt-foot">
          <button class="td-btn ghost" id="opt-cancel">${employeeLanguage === 'ar' ? 'إلغاء' : (employeeLanguage === 'en' ? 'Cancel' : 'Annuler')}</button>
          <button class="td-btn primary" id="opt-confirm">${employeeLanguage === 'ar' ? 'إضافة' : (employeeLanguage === 'en' ? 'Add' : 'Ajouter')} · ${fmtMAD(total)}</button>
        </div>`;
    }

    function confirmOptions() {
      if (!optDraft || !menuContextId) return;
      const missing = itemOptions[optDraft.itemId].some(g => isReq(optionGroups[g]) && optDraft.sel[g] == null);
      if (missing) { renderOptionsSheet(true); toast('Choisissez les options obligatoires'); return; }
      const item = menuItems.find(m => m.id === optDraft.itemId);
      const opts = optsFromSel(optDraft.itemId, optDraft.sel);
      addConfiguredLine(menuContextId, item, opts);
      closeOptionsSheet();
    }

    function addConfiguredLine(tableId, item, opts) {
      if (!tableOrders[tableId]) tableOrders[tableId] = [];
      const priced = svPromoPrice(item, item.price + optsExtra(opts));
      const price = priced.price;
      const sig = optsSig(opts);
      const line = tableOrders[tableId].find(l => l.sourceLocal === true && l.id === item.id && !(l.note || '').trim() && (l.optsSig || '') === sig
        && svPromoKey(l.promo) === svPromoKey(priced.promo));
      if (line) line.qty++;
      else tableOrders[tableId].push(Object.assign({ uid: newLineUid(), id: item.id, name: item.name, price, basePrice: item.price, qty: 1, sentQty: 0, note: '', opts, optsSig: sig, sourceLocal: true },
        priced.promo ? { promo: priced.promo } : null));
      markDirty(tableId);
      const card = Array.from(document.querySelectorAll('.menu-item'))
        .find((node) => node.dataset.menuId === String(item.id));
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderCartBar();
      toast(`${item.name} ajouté${opts.length ? ' · ' + optsSummary(opts) : ''}`);
    }

    function itemHasFormula(itemId) {
      const it = menuItems.find(m => m.id === itemId);
      return !!(it && it.formula && Array.isArray(it.formula.slots) && it.formula.slots.length);
    }

    function isFmlSlotSatisfied(slot, selSet) {
      const count = selSet ? selSet.size : 0;
      const min = slot.min != null ? slot.min : 1;
      return count >= min;
    }

    function isFmlUnitSatisfied(slots, uSlots, uIdx) {
      return slots.every(s => isFmlSlotSatisfied(s, uSlots[s.id]))
        && (uIdx == null || !fmlChildMissing(slots, uSlots, uIdx));
    }

    function fmlChildGroups(chosenId) {
      const pool = typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems;
      const it = pool.find(x => x.id === chosenId);
      const groups = typeof optionGroups !== 'undefined' ? optionGroups : {};
      const ids = it && Array.isArray(it.opts) && it.opts.length ? it.opts
        : ((typeof itemOptions !== 'undefined' && itemOptions[chosenId]) || []);
      return ids.filter(g => groups[g] && groups[g].kind === 'radio' && isReq(groups[g]));
    }

    function fmlChildSel(uIdx, slotId, itemId) {
      const unit = (fmlDraft.childSel[uIdx] = fmlDraft.childSel[uIdx] || {});
      const key = slotId + '|' + itemId;
      return (unit[key] = unit[key] || {});
    }

    function fmlChildMissing(slots, uSlots, uIdx) {
      return slots.some(s => Array.from(uSlots[s.id] || []).some(itemId => {
        const chosen = fmlChildSel(uIdx, s.id, itemId);
        return fmlChildGroups(itemId).some(g => !chosen[g]);
      }));
    }

    function fmlChildOptsHTML(slot, sel, uIdx, showMissing) {
      const pool = typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems;
      return Array.from(sel || []).map(itemId => {
        const groups = fmlChildGroups(itemId);
        if (!groups.length) return '';
        const chItem = pool.find(x => x.id === itemId);
        const chosen = fmlChildSel(uIdx, slot.id, itemId);
        return groups.map(g => {
          const def = optionGroups[g];
          const pills = def.vals.map(v => `<button type="button" class="opt-pill ${chosen[g] === v.n ? 'on' : ''}" data-fml-child="${esc(slot.id + '|' + itemId)}" data-fml-child-group="${esc(g)}" data-fml-child-val="${esc(v.n)}">${v.emoji ? `${esc(v.emoji)} ` : ''}${esc(v.n)}</button>`).join('');
          return `<div class="opt-group fml-child-opts ${showMissing && !chosen[g] ? 'missing' : ''}"><div class="opt-group-head"><span class="opt-group-name">${esc(chItem ? chItem.name : '')} · ${esc(def.name)}</span><span class="opt-group-tag req">Obligatoire</span></div><div class="opt-vals">${pills}</div></div>`;
        }).join('');
      }).join('');
    }

    function isFmlDraftSatisfied() {
      if (!fmlDraft) return false;
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula || !item.formula.slots) return false;
      const slots = item.formula.slots;
      return fmlDraft.units.every((uSlots, uIdx) => isFmlUnitSatisfied(slots, uSlots, uIdx));
    }

    function computeFmlUnitExtra(slots, uSlots) {
      let extra = 0;
      slots.forEach(s => {
        const sel = uSlots[s.id];
        if (sel) {
          (s.choices || []).forEach(ch => {
            if (sel.has(ch.itemId)) extra += (Number(ch.extra) || 0);
          });
        }
      });
      return extra;
    }

    function openFormulaSheet(itemId, qty = 1) {
      const item = menuItems.find(m => m.id === itemId);
      if (!item || !itemHasFormula(itemId)) return;
      const slots = item.formula.slots;
      const count = Math.max(1, qty || 1);
      const units = [];

      for (let u = 0; u < count; u++) {
        const uSlots = {};
        slots.forEach(s => {
          const sel = new Set();
          if (s.choices && s.choices.length === 1) {
            const ch = s.choices[0];
            const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
            if (chItem && chItem.avail !== false) {
              sel.add(ch.itemId);
            }
          }
          uSlots[s.id] = sel;
        });
        units.push(uSlots);
      }

      const firstIncomplete = slots.find(s => (units[0][s.id] ? units[0][s.id].size : 0) < (s.min != null ? s.min : 1));

      fmlDraft = {
        itemId,
        tableId: menuContextId,
        totalUnits: count,
        activeUnit: 0,
        activeSlotId: firstIncomplete ? firstIncomplete.id : (slots[0] && slots[0].id),
        collapsedSlots: {},
        units,
        childSel: units.map(() => ({})),
        optSel: {},
      };

      const formulaOptionIds = typeof itemOptions !== 'undefined' ? (itemOptions[itemId] || []) : [];
      formulaOptionIds.forEach(g => {
        const kind = optionGroups[g].kind;
        fmlDraft.optSel[g] = kind === 'multi' ? new Set() : (kind === 'toggle' ? false : null);
      });

      slots.forEach(s => {
        if (s.choices && s.choices.length === 1) {
          if (!fmlChildGroups(s.choices[0].itemId).length) fmlDraft.collapsedSlots[s.id] = true;
        }
      });

      renderFormulaSheet(false);
      $('#formula-modal').classList.add('is-open');
    }

    function closeFormulaSheet() {
      $('#formula-modal').classList.remove('is-open');
      fmlDraft = null;
    }

    function renderFormulaSheet(showMissing) {
      if (!fmlDraft) return;
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula) return;
      const slots = item.formula.slots;
      const curUnitSlots = fmlDraft.units[fmlDraft.activeUnit] || {};

      let unitsBarHTML = '';
      if (fmlDraft.totalUnits > 1) {
        const tabsHTML = Array.from({ length: fmlDraft.totalUnits }, (_, i) => {
          const satisfied = isFmlUnitSatisfied(slots, fmlDraft.units[i], i);
          return `<button type="button" class="fml-unit-tab ${i === fmlDraft.activeUnit ? 'active' : ''}" data-fml-unit="${i}">Portion ${i + 1}${satisfied ? ' ✓' : ''}</button>`;
        }).join('');
        unitsBarHTML = `
          <div class="fml-units-bar">
            <div class="fml-units-tabs">${tabsHTML}</div>
            ${fmlDraft.activeUnit === 0 ? `<button type="button" class="fml-same-btn" data-fml-same="1">Même chose pour tous</button>` : ''}
          </div>`;
      }

      const slotsHTML = slots.map((s, idx) => {
        const sel = curUnitSlots[s.id] || new Set();
        const min = s.min != null ? s.min : 1;
        const max = s.max != null ? s.max : 1;
        const satisfied = sel.size >= min;
        const unmet = showMissing && !satisfied;
        const isSingle = s.choices && s.choices.length === 1;
        const isCollapsed = fmlDraft.collapsedSlots[s.id] && isSingle && sel.size === 1;

        if (isCollapsed) {
          const ch = s.choices[0];
          const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
          const chName = chItem ? chItem.name : 'Option indisponible';
          const extraTxt = ch.extra ? `+${ch.extra} MAD` : 'inclus';
          return `
            <div class="fml-slot">
              <div class="fml-slot-head">
                <span class="fml-slot-title">${esc(s.label || `Étape ${idx + 1}`)}</span>
                <span class="fml-slot-badge req">Sélectionné</span>
              </div>
              <div class="fml-slot-collapsed" data-fml-expand="${s.id}">
                <span>${esc(chName)} · ${esc(extraTxt)}</span>
                <span style="font-size:11px;text-decoration:underline;">Modifier</span>
              </div>
            </div>`;
        }

        const chips = (s.choices || []).map(ch => {
          const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
          const chName = chItem ? chItem.name : 'Option indisponible';
          const avail = chItem ? (chItem.avail !== false) : false;
          const on = sel.has(ch.itemId);
          const extraTxt = ch.extra ? `+${ch.extra} MAD` : 'inclus';
          return `
            <button type="button" class="fml-chip ${on ? 'on' : ''} ${!avail ? 'disabled' : ''}"
              data-fml-slot="${s.id}" data-fml-item="${ch.itemId}" ${!avail ? 'disabled' : ''}>
              <span>${esc(chName)}</span>
              <span class="fml-extra">${esc(extraTxt)}</span>
            </button>`;
        }).join('');

        const badgeText = min === max ? (min === 1 ? '1 choix' : `${min} choix`) : `${min} à ${max} choix`;

        return `
          <div class="fml-slot ${s.id === fmlDraft.activeSlotId ? 'active' : ''} ${unmet ? 'missing' : ''}" data-fml-slot-box="${s.id}">
            <div class="fml-slot-head">
              <span class="fml-slot-title">${esc(s.label || `Étape ${idx + 1}`)}</span>
              <span class="fml-slot-badge ${satisfied ? 'req' : ''}">${esc(badgeText)}${satisfied ? ' · ✓' : ''}</span>
            </div>
            <div class="fml-chips">${chips}</div>
            ${fmlChildOptsHTML(s, sel, fmlDraft.activeUnit, showMissing)}
          </div>`;
      }).join('');

      let grandTotal = 0;
      fmlDraft.units.forEach(uSlots => {
        grandTotal += item.price + computeFmlUnitExtra(slots, uSlots);
      });

      const allSatisfied = isFmlDraftSatisfied();
      const optionIds = typeof itemOptions !== 'undefined' ? (itemOptions[fmlDraft.itemId] || []) : [];
      const optionsSatisfied = optionIds.every(g => {
        if (!isReq(optionGroups[g])) return true;
        const sel = fmlDraft.optSel[g];
        return sel instanceof Set ? sel.size > 0 : sel != null && sel !== false;
      });
      const optionsHTML = optionIds.map(g => {
        const def=optionGroups[g], sel=fmlDraft.optSel[g], required=isReq(def);
        const pills=def.vals.map(v=>{const on=def.kind==='multi'?sel.has(v.n):def.kind==='toggle'?sel===true:sel===v.n;return `<button class="opt-pill ${on?'on':''}" data-fml-opt-group="${g}" data-fml-opt-val="${esc(v.n)}">${v.emoji?`${esc(v.emoji)} `:''}${esc(v.n)}${v.p?`<span class="opt-pr">+${v.p}</span>`:''}</button>`;}).join('');
        return `<div class="opt-group ${showMissing&&required&&!optionsSatisfied?'missing':''}"><div class="opt-group-head"><span class="opt-group-name">${esc(def.name)}</span><span class="opt-group-tag ${required?'req':'opt'}">${required?'Obligatoire':'Optionnel'}</span></div><div class="opt-vals">${pills}</div></div>`;
      }).join('');
      const selectedOpts = optsFromSel(fmlDraft.itemId, fmlDraft.optSel);
      grandTotal += optsExtra(selectedOpts) * fmlDraft.totalUnits;

      $('#formula-modal-body').innerHTML = `
        <h3 class="modal-title">${esc(item.name)}</h3>
        <p class="modal-subtle">${item.price} MAD · Choisissez la formule et ses options</p>
        ${unitsBarHTML}
        ${slotsHTML}
        ${optionsHTML}
        <div class="fml-foot">
          <button type="button" class="td-btn ghost" id="fml-cancel">Annuler</button>
          <button type="button" class="td-btn primary" id="fml-confirm" ${allSatisfied && optionsSatisfied ? '' : 'disabled'}>
            Ajouter · ${fmtMAD(grandTotal)}
          </button>
        </div>`;
    }

    function confirmFormula() {
      if (!fmlDraft || !menuContextId) return;
      if (!isFmlDraftSatisfied()) {
        renderFormulaSheet(true);
        toast('Complétez tous les choix obligatoires');
        return;
      }
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula) return;
      const slots = item.formula.slots;
      const tableId = menuContextId;
      const opts = typeof optsFromSel === 'function' ? optsFromSel(fmlDraft.itemId, fmlDraft.optSel) : [];
      const formulaOptionIds = typeof itemOptions !== 'undefined' ? (itemOptions[fmlDraft.itemId] || []) : [];
      if (formulaOptionIds.some(g => isReq(optionGroups[g]) && (fmlDraft.optSel[g] instanceof Set ? !fmlDraft.optSel[g].size : fmlDraft.optSel[g] == null || fmlDraft.optSel[g] === false))) {
        renderFormulaSheet(true); toast('Choisissez les options obligatoires'); return;
      }

      if (!tableOrders[tableId]) tableOrders[tableId] = [];

      fmlDraft.units.forEach((uSlots, uIdx) => {
        const unitExtra = computeFmlUnitExtra(slots, uSlots);
        const rawUid = 'fml-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const formulaUid = fmlDraft.totalUnits > 1 ? `${rawUid}-${uIdx + 1}` : rawUid;

        // 1. Parent formula line
        const parentLine = {
          uid: newLineUid(),
          id: item.id,
          name: item.name,
          kind: 'formula',
          price: item.price + unitExtra + (typeof optsExtra === 'function' ? optsExtra(opts) : 0),
          basePrice: item.price,
          unitPrice: item.price + unitExtra + (typeof optsExtra === 'function' ? optsExtra(opts) : 0),
          qty: 1,
          sentQty: 0,
          formulaUid,
          formulaName: item.name,
          note: '',
          opts: opts.map(o => ({ ...o })),
          optsSig: typeof optsSig === 'function' ? optsSig(opts) : '',
          sourceLocal: true,
        };
        tableOrders[tableId].push(parentLine);

        // 2. Children lines (one per chosen item)
        slots.forEach(s => {
          const sel = uSlots[s.id];
          if (!sel) return;
          sel.forEach(chosenId => {
            const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === chosenId);
            const chName = chItem ? chItem.name : chosenId;
            const chStation = (chItem && chItem.station) || '';
            const chosen = fmlChildSel(uIdx, s.id, chosenId);
            const childOpts = fmlChildGroups(chosenId).filter(g => chosen[g])
              .map(g => ({ group: g, label: chosen[g], price: 0 }));
            const childLine = {
              uid: newLineUid(),
              id: chosenId,
              name: chName,
              kind: 'formula-part',
              price: 0,
              basePrice: 0,
              unitPrice: 0,
              qty: 1,
              sentQty: 0,
              station: chStation,
              formulaUid,
              formulaName: item.name,
              slotLabel: s.label || '',
              formulaSlotId: s.id,
              lineId: `${formulaUid}-${s.id}`,
              note: '',
              opts: childOpts,
              optsSig: typeof optsSig === 'function' ? optsSig(childOpts) : '',
              sourceLocal: true,
            };
            tableOrders[tableId].push(childLine);
          });
        });
      });

      markDirty(tableId);
      renderMenu();
      renderCartBar();
      toast(`${item.name} ajouté`);
      closeFormulaSheet();
    }

    function changeMenuQty(tableId, itemId, delta) {
      if (delta > 0) {
        if (itemHasFormula(itemId)) { openFormulaSheet(itemId); return; }
        if (itemHasOptions(itemId)) { openOptionsSheet(itemId); return; }
        addToTableOrder(tableId, itemId); return;
      }
      const lines = (tableOrders[tableId] || []).filter(l => l.id === itemId);
      const line = lines.find(l => !(l.note || '').trim()) || lines[lines.length - 1];
      if (!line) return;
      line.qty--;
      if (line.qty <= 0) tableOrders[tableId] = tableOrders[tableId].filter(l => l.uid !== line.uid && (!line.formulaUid || l.formulaUid !== line.formulaUid));
      markDirty(tableId);
      renderMenu();
      renderCartBar();
    }

    function empPayRefsRead() {
      try {
        const raw = JSON.parse(localStorage.getItem(EMP_PAY_REFS_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
      } catch (_) { return {}; }
    }

