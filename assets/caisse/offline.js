/* Owner: caisse tenant isolation, persistence and service restoration.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* ===========================================================
       === Persistence ===  (the shift survives a reload)
       =========================================================== */
    function kcStoreKey(slug) {
      const s = slug != null ? slug : currentMerchantSlug();
      return s ? ('kiwi-caisse-shift:' + s) : 'kiwi-caisse-shift';
    }
    

    /* Un bon portant `opNum` vient du relais serveur. Les anciens instantanés
       n'ont pas tous gardé `opId`, mais ils ont gardé `opNum`. Une attente non
       acceptée expire après 30 minutes ; une préparation oubliée expire après
       six heures. Le snapshot local ne doit pas pouvoir ressusciter un bon que
       la file serveur a correctement laissé dans le service précédent. */
    function staleQueuedServerTicket(o, now) {
      if (!o || o.opNum == null) return false;
      if (o.opId && archivedTakeawaySet().has(String(o.opId))) return true;
      // Age is not cancellation or payment evidence. Keep active bills and
      // paid takeaway orders awaiting collection until a canonical terminal event.
      if (!o.pickedUp && (o.type === 'takeaway' || !o.paid)) return false;
      const at = new Date(o.sentAt).getTime();
      if (!Number.isFinite(at)) return false;
      const age = (now || Date.now()) - at;
      if (o.status === 'held') return age > 30 * 60 * 1000;
      return (o.status === 'new' || o.status === 'cooking') && age > 6 * 60 * 60 * 1000;
    }

    /* À QUEL commerçant appartient le service actuellement EN MÉMOIRE. Posé à
       l'ouverture et à la reprise, relu à chaque autosave. Sans lui, réappairer
       la caisse en cours de service laissait le journal de A en mémoire et le
       prochain autosave le réécrivait estampillé B : un enregistrement qui dit
       B en contenant A, et qui passe donc tous les contrôles au rechargement.
       Effacer le stockage à l'appairage (assets/caisse-pairing.js) ne suffit
       pas · cinq secondes plus tard il est reconstitué. */
    function currentMerchantSlug() {
      try { return (storePaired() || {}).merchant || ''; } catch (_) { return ''; }
    }
    
    function serviceFloorSnapshot() {
      return Object.keys(tables).map((id) => ({
        table: String(id), status: String(tables[id].status || 'khawya'),
        covers: Math.max(0, Number(tables[id].covers) || 0),
        syncVersion: SERVICE_BILL_SYNC_VERSION,
        lines: (tableOrders[id] || []).filter((line) => !serviceFloorLegacyTables.has(String(id)) || line.sent === true).slice(0, 80).map((line) => ({
          key: String(line.orderProLine ? ('order:' + line.orderProLine) : (line.cloudKey || line.uid || line.id || '')), id: String(line.id || ''),
          name: String(line.name || ''), price: Math.max(0, Number(line.price) || 0),
          qty: Math.max(1, Number(line.qty) || 1), note: String(line.note || ''),
          sentQty: line.sent ? Math.max(1, Number(line.qty) || 1) : Math.max(0, Number(line.sentQty) || 0),
          opts: Array.isArray(line.opts) ? line.opts : [],
        })),
      })).sort((a, b) => a.table.localeCompare(b.table, undefined, { numeric: true }));
    }
    function publishServiceFloor() {
      if (operatorCaisseRequested() && !shiftOpenedAt) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      if (serviceFloorPublishing || !storeIsReal()) return;
      const merchant = currentMerchantSlug();
      if (!merchant) return;
      const live = serviceFloorSnapshot();
      if (!live.length) return;
      const signature = JSON.stringify(live);
      if (signature === serviceFloorSignature) return;
      let before = [];
      try { before = JSON.parse(serviceFloorSignature || '[]'); } catch (_) { before = []; }
      const oldByTable = Object.create(null);
      before.forEach((state) => { oldByTable[state.table] = state; });
      const localAt = Date.now();
      live.forEach((state) => {
        const old = oldByTable[state.table];
        if (!old || old.status !== state.status || Number(old.covers || 0) !== state.covers
          || JSON.stringify(old.lines || []) !== JSON.stringify(state.lines || [])) {
          serviceFloorLocalVersion[state.table] = localAt;
        }
      });
      serviceFloorPublishing = true;
      fetch('/api/service/events', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, snapshot: { tables: live } }),
      }).then((r) => {
        if (!r.ok) throw new Error('floor-sync-' + r.status);
        serviceFloorSignature = signature;
      }).catch(() => {}).finally(() => { serviceFloorPublishing = false; });
    }
    function pollEmployeeFloor() {
      /* A socket poke can arrive while the previous HTTP read is still in
         flight. Dropping that poke made the caisse wait for the eight-second
         live fallback even though the employee had already paid. Queue one
         immediate replay instead; one bit is enough because every read returns
         the complete latest table-state map. */
      if (serviceFloorPolling) { serviceFloorPollQueued = true; return; }
      if (!storeIsReal()) return;
      /* Lire la salle d'un autre commerce dans ce service mélangerait les
         deux : la réponse rattacherait ses tables aux additions d'ici. */
      if (window.KiwiTillTenant?.mismatch()) return;
      const merchant = currentMerchantSlug();
      if (!merchant) return;
      serviceFloorPolling = true;
      fetch('/api/service/events?merchant=' + encodeURIComponent(merchant) + '&role=caisse&since=' + serviceFloorSince, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then((r) => r.ok ? r.json() : null).then((data) => {
        if (!data || !data.ok) return;
        serviceFloorSince = Number(data.now) || serviceFloorSince;
        if (merchant !== currentMerchantSlug()) return;
        if (shiftOpenedAt && document.body.classList.contains('is-unlocked') && !document.body.classList.contains('is-kitchen')) window.KiwiServiceRequests?.ingest(data, {
          merchant, notify: toast, refresh: pollEmployeeFloor,
          openTable: value => { const id = caisseTableId(value); if (id && tables[id]) openTable(id); },
        });
        else window.KiwiServiceRequests?.reset();
        if (data.locks && typeof data.locks === 'object') caisseTableLocks = data.locks;
        let changed = false;
        Object.keys(data.states || {}).forEach((key) => {
          const state = data.states[key] || {};
          if (state.source !== 'employee' && state.source !== 'guest') return;
          /* A brand-new till service must not resurrect the previous service's
             employee tables. Keep a 30-minute handover window so an employee
             order placed just before the till opens is still recovered. A
             restored till keeps its original shiftOpenedAt and therefore
             accepts every state from its own ongoing service. */
          const stateTs = Number(state.ts) || 0;
          const serviceCutoff = (shiftOpenedAt instanceof Date && !isNaN(shiftOpenedAt.getTime()))
            ? shiftOpenedAt.getTime() - 30 * 60 * 1000 : Date.now() - 12 * 60 * 60 * 1000;
          if (stateTs && stateTs < serviceCutoff) return;
          /* Older employee/caisse bills could contain the removed automatic
             menu generator. Never ingest one here: otherwise this caisse's
             four-second snapshot promotes the fake lines back into every
             employee phone. */
          if (Array.isArray(state.lines) && Number(state.syncVersion || 0) < SERVICE_BILL_SYNC_VERSION) return;
          const id = caisseTableId(state.table || key);
          if (!id || !tables[id] || !state.status) return;
          if (mode === 'order' && selectedId === id) return;
          /* Compare only server timestamps with server timestamps. The old
             non-terminal guard compared `state.ts` (Cloudflare's clock) with
             `serviceFloorLocalVersion` (this iPad's clock). An iPad even a few
             seconds ahead rejected Addition forever. The API now keeps every
             employee transition authoritative until this caisse echoes the
             exact state, so no client-clock arbitration belongs here. */
          const terminalEmployeeState = state.status === 'khawya' || state.status === 'khlass';
          const lastRemoteTs = Number(serviceFloorRemoteVersion[String(id)] || 0);
          if (stateTs && stateTs <= lastRemoteTs) return;
          const statusChanged = tables[id].status !== state.status;
          const terminalHadLocalBill = terminalEmployeeState
            && (!!orders[id] || Array.isArray(tableOrders[id]) && tableOrders[id].length > 0);
          if (state.status === 'bgha-ykhlass' && state.reopenSessionId
            && (!tables[id].timerSession || String(tables[id].timerSession) === String(state.reopenSessionId))
            && !(tableOrders[id] || []).length && !(orders[id] || []).length) {
            tableSettlement().project(tables[id], { reopenSessionId: String(state.reopenSessionId) });
          } else if (terminalEmployeeState) tableSettlement().project(tables[id], {}, ['reopenSessionId']);
          /* Remember even an already-matching free state. Otherwise opening a
             new party later would make that old close look new and close the
             freshly seated table. */
          serviceFloorRemoteVersion[String(id)] = Math.max(lastRemoteTs, stateTs);
          /* Employee snapshots synchronize OCCUPANCY, never the bill. Every
             sent employee line already travels through /api/order/queue, the
             same canonical ledger as caisse/KDS/OrderPro. Importing `lines`
             here created a second mutable copy of the bill; a later kitchen
             ready event could merge that copy back and manufacture products.
             Drafts stay on the employee phone until they are sent. */
          /* A terminal state also clears a stale local bill when occupancy is
             already free. Status equality must not skip that cleanup: this was
             the exact path that left the previous party's items in memory and
             attached the next party's order to the old bill. */
          if (!statusChanged && !terminalHadLocalBill) return;
          tableSettlement().project(tables[id], { status: state.status });
          tableSettlement().project(tables[id], { covers: state.status === 'khawya' ? 0 : Math.max(0, Number(state.covers) || tables[id].covers || 0) });
          if (terminalEmployeeState) resetTableTimer(tables[id]);
          else if ((tableOrders[id] || []).length || (orders[id] || []).length) startTableTimer(id);
          serviceFloorLocalVersion[String(id)] = Number(state.ts) || Date.now();
          if (state.status === 'khawya' || state.status === 'khlass') {
            delete orders[id];
            delete tableOrders[id];
            tableSettlement().project(tables[id], {}, ['discount']);
            if (selectedId === id) closeRightPanel();
          }
          refreshTableNode(id);
          changed = true;
        });
        if (changed) {
          /* Force one terminal echo back to the service-event store. That echo
             is the acknowledgement which releases the server-side settlement
             barrier and allows a genuinely new visit to open on this table. */
          serviceFloorSignature = '';
          try { persistShift(); } catch (_) {}
          setTimeout(publishServiceFloor, 0);
        }
      }).catch(() => {}).finally(() => {
        serviceFloorPolling = false;
        if (serviceFloorPollQueued) {
          serviceFloorPollQueued = false;
          pollEmployeeFloor();
        }
      });
    }
    

    function persistShift() {
      if (registerClosing || !shiftOpenedAt) return;
      /* Le service en mémoire n'est plus celui de ce comptoir : on n'écrit pas.
         Rien de précieux n'est perdu · les ventes déjà encaissées sont dans la
         file de synchronisation, estampillées de LEUR commerçant au moment de
         la vente (live-link.js postSale), et le serveur refuse déjà de les
         classer ailleurs. */
      if (shiftMerchant !== currentMerchantSlug()) {
        /* Le refus est volontaire, mais il était muet : à partir de cet instant
           TOUTES les écritures de service échouent en silence, cinq secondes
           après l'autre, et rien à l'écran ne dit que la caisse a cessé de
           sauvegarder. Une ligne dans la console, une seule fois · pas un toast
           qui reviendrait toutes les cinq secondes · pour que le diagnostic soit
           possible au lieu d'être deviné. */
        if (!persistShift._warned) {
          persistShift._warned = true;
          try { console.warn('[kiwi] service ouvert chez « ' + shiftMerchant + ' », caisse appairée chez « ' + currentMerchantSlug() + ' » : sauvegarde du service suspendue.'); } catch (_) {}
        }
        return;
      }
      try {
        localStorage.setItem(KC_STORE, JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          /* À QUI est ce service. Le blob ne portait aucun commerçant, et la
             relecture ne comparait donc rien : une caisse appairée chez A puis
             réappairée chez B rouvrait le service de A sous le nom de B. Ce
             n'est pas cosmétique · le rapport de journée se construit avec
             `sales: journal`, c'est-à-dire le journal RESTAURÉ de A, et avec le
             slug résolu depuis kiwiLiveMerchant, c'est-à-dire B. Le chiffre de
             A, ses tickets, son mix de paiement et ses lignes par caissier
             partaient donc dans le rapport de B · en local, puis sur le serveur,
             poussés par saveProvisional toutes les 90 secondes. Une tablette
             prêtée d'un commerce à l'autre suffisait. */
          merchant: shiftMerchant,
          serviceBillSyncVersion: SERVICE_BILL_SYNC_VERSION,
          orderBridgeSyncVersion: ORDER_BRIDGE_SYNC_VERSION,
          openedAt: shiftOpenedAt.toISOString(),
          openedBy: shiftOpenedBy,
          openingFloat: openingFloat,
          terminalCardTotal: typeof terminalCardTotal === 'number' ? terminalCardTotal : null,
          journal: journal,
          cashMovements: cashMovements,
          shift: shift,
          currentCashier: currentCashier,
          posteOpenedAt: posteOpenedAt ? posteOpenedAt.toISOString() : null,
          posteOpeningFloat: posteOpeningFloat,
          handovers: handovers,
          /* Offline settlement closes the physical table before the server can
             acknowledge it. Persist that close tombstone so a reload/reconnect
             cannot reattach an older kitchen row and charge it again. */
          tableClosedAt: tableClosedAt,
          /* A transfer may legitimately move an older visit onto a table that
             has a close tombstone. Keep the acknowledgement alongside the
             tombstone so reload does not mistake that moved visit for a ghost. */
          phoneMovedVisits: Array.from(phoneMovedVisits.entries()),
          tables: tables,
          /* ── ON N'ENREGISTRE PAS CE QUE LA FILE SAIT DÉJÀ ──────────────────
           * Les lignes venues du relais portent le marqueur `orderProLine`.
           * Les garder dans l'instantané du service en faisait une DEUXIÈME
           * mémoire de l'addition, à côté de la file · et un instantané ne
           * périme pas. C'est de là que venaient les additions fantômes au
           * démarrage : on ouvrait la caisse et une table portait déjà une
           * note que personne n'avait passée, ou une note déjà encaissée.
           *
           * Elles se reconstruisent seules au premier sondage : la file les
           * rend, et le rattrapage de `ingest` les rattache par leur marqueur.
           * Ce qu'on garde ici, c'est ce que la file NE connaît pas · les
           * lignes tapées au comptoir et pas encore envoyées en cuisine. Un
           * brouillon mérite de survivre à un F5 ; une addition déjà écrite
           * ailleurs n'a pas à être recopiée. */
          tableOrders: (function () {
            const kept = {};
            Object.keys(tableOrders).forEach(function (tid) {
              const local = (tableOrders[tid] || []).filter(function (l) { return !l.orderProLine; });
              if (local.length) kept[tid] = local;
            });
            return kept;
          })(),
          orders: orders,
          /* Une part déjà payée est de l'argent réel. Le flux de split vivait
             seulement dans une Map en mémoire : F5 l'oubliait et remettait la
             note entière à encaisser. */
          tableSplits: Array.from(tableSplits.entries()),
          vrapSplits: Array.from(vrapSplits.entries()),
          vrapSplit: vrapSplits.get('new') || null,
          cart: cart,
          vrapDiscount: vrapDiscount,
          vrapEditingNum: vrapEditingNum,
          /* Le board cuisine, chez un VRAI commerçant seulement. Les lignes
             envoyées portent un drapeau `sent` qui, lui, était déjà persisté :
             sans le board en face, un simple rechargement au comptoir effaçait
             les tickets tout en interdisant de les renvoyer · la cuisine perdait
             la commande pour de bon. La démo garde son board éphémère, réensemé
             à chaque chargement (kdsSeed), sinon les quinze commandes d'exemple
             se dupliqueraient à chaque visite. */
          kdsOrders: storeIsReal() ? kdsOrders.filter(o => !staleQueuedServerTicket(o)).map(o => Object.assign({}, o, {
            sentAt: o.sentAt instanceof Date ? o.sentAt.toISOString() : o.sentAt,
          })) : undefined,
          kdsOrderSeq: storeIsReal() ? kdsOrderSeq : undefined,
        }));
        /* Le service est écrit : la caisse 2027 lit ce oui (sync.saved_here) ;
           un stockage plein rend non (sync.not_saved, sync.screen_only). */
        return true;
      } catch (e) { return false; }
    }
    function migrateLegacyShift() {
      try {
        const legacyRaw = localStorage.getItem('kiwi-caisse-shift');
        if (!legacyRaw) return;
        const legacy = JSON.parse(legacyRaw);
        if (!legacy || legacy.v !== 1) return;
        const targetSlug = legacy.merchant || currentMerchantSlug();
        if (!targetSlug) return;
        const targetKey = 'kiwi-caisse-shift:' + targetSlug;
        if (!localStorage.getItem(targetKey)) {
          localStorage.setItem(targetKey, legacyRaw);
        }
        localStorage.removeItem('kiwi-caisse-shift');
      } catch (_) {}
    }
    function clearPersistedShift() {
      try {
        localStorage.removeItem(KC_STORE);
        localStorage.removeItem('kiwi-caisse-shift');
      } catch (e) {}
    }
    function loadPersistedShift() {
      migrateLegacyShift();
      try {
        let raw = localStorage.getItem(KC_STORE);
        /* Le service mis de côté au réappairage (assets/till-tenant.js) revient
           quand la caisse retrouve son commerce. take() ne rend que la copie de
           CE commerce, de moins de douze heures, et la retire. */
        if (!raw) {
          const kept = window.KiwiTillTenant && window.KiwiTillTenant.take(currentMerchantSlug());
          if (kept) { localStorage.setItem(KC_STORE, kept); raw = kept; }
        }
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== 1 || !d.openedAt) return null;
        if (Date.now() - (d.savedAt || 0) > 12 * 3600 * 1000) { clearPersistedShift(); return null; }
        return d;
      } catch (e) { return null; }
    }
    /* Un reçu relu depuis le stockage : le service sauvegardé (restoreShift)
       ou l'étagère des ventes retenues (heldSales). Les deux passent par ici
       pour qu'une vente ressorte de l'une ou de l'autre avec les MÊMES champs. */
    function reviveJournalEntry(e) {
      const entry = {
        id: e.id, time: new Date(e.time), label: e.label,
        amount: e.amount, method: e.method, ref: e.ref,
      };
      if (e.kind)            entry.kind     = e.kind;      // 'refund'
      if (e.refundOf)        entry.refundOf = e.refundOf;
      if (e.refundOfId)      entry.refundOfId = e.refundOfId;
      if (e.refunded)        entry.refunded = true;
      if (e.refundedAmount != null) entry.refundedAmount = money(e.refundedAmount);
      if (e.reason)          entry.reason   = e.reason;
      if (e.voided)          entry.voided   = true;
      if (e.voidConfirmed)   entry.voidConfirmed = true;
      if (e.voidAuthority)   entry.voidAuthority = String(e.voidAuthority).slice(0, 32);
      if (e.voidTs != null)  entry.voidTs   = Number(e.voidTs);
      if (e.voidAt != null)  entry.voidAt   = Number(e.voidAt);
      if (e.tip)             entry.tip      = e.tip;       // pourboire
      if (e.lines)           entry.lines    = e.lines;     // itemised receipt
      if (e.cashier)         entry.cashier  = e.cashier;   // ringing cashier
      /* Journal-only recovery must replay the payment as it was captured.
         Do not infer a visit, split or discount from today's mutable order;
         legacy receipts keep absent metadata absent. The API validates it. */
      if (e.serverSaleId)    entry.serverSaleId = e.serverSaleId;
      if (e.reopenSnapshot && typeof e.reopenSnapshot === 'object') entry.reopenSnapshot = e.reopenSnapshot;
      if (e.visitClosed === true) entry.visitClosed = true;
      ['orderId', 'table', 'session', 'split', 'settlementKind', 'amountCents', 'grossAmountCents',
        'discountAmountCents', 'discountReason', 'actorId', 'saleSyncPending', 'saleSyncError', 'saleHeldLocal'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(e, key)) entry[key] = e[key];
      });
      if (e.refundActor && typeof e.refundActor === 'object') {
        entry.refundActor = {
          id: String(e.refundActor.id || '').slice(0, 96), name: String(e.refundActor.name || '').slice(0, 80),
          role: String(e.refundActor.role || '').slice(0, 80), approval: String(e.refundActor.approval || '').slice(0, 1400),
        };
      }
      if (e.refundSynced) entry.refundSynced = true;
      if (e.refundSyncNeedsApproval) entry.refundSyncNeedsApproval = true;
      if (e.refundSyncStatus) entry.refundSyncStatus = String(e.refundSyncStatus).slice(0, 24);
      if (e.refundLedgerReversed) entry.refundLedgerReversed = true;
      if (e.refundRejectedStatus != null) entry.refundRejectedStatus = Number(e.refundRejectedStatus) || 0;
      if (e.refundRejectedAt) entry.refundRejectedAt = Number(e.refundRejectedAt) || 0;
      if (e.refundReconciliation) entry.refundReconciliation = String(e.refundReconciliation).slice(0, 32);
      if (e.cashHandedOut) entry.cashHandedOut = true;
      if (e.cashHandedOutAt) entry.cashHandedOutAt = Number(e.cashHandedOutAt) || 0;
      if (e.refundRecoveryRequestedAt) entry.refundRecoveryRequestedAt = Number(e.refundRecoveryRequestedAt) || 0;
      if (e.channel)         entry.channel  = e.channel;   // dining / takeaway / OrderPro
      if (e.origin)          entry.origin   = e.origin;    // caisse / employee / OrderPro
      /* Le reçu figé au moment de la vente. Cette boucle recopie champ par
         champ (elle ne fait pas Object.assign), donc tout ce qui n'est pas
         nommé ici est PERDU au rechargement · et une caisse recharge tous les
         jours. Sans cette ligne, réimprimer le ticket d'hier ne ressortait
         plus l'enseigne et les mentions de l'époque : exactement ce que le
         figeage est censé garantir. */
      if (e.rc)              entry.rc       = e.rc;
      /* Le commerce où la vente a été encaissée : sans lui, postSale ne peut
         pas refuser de la poster ailleurs après un rechargement. */
      if (e.merchant)        entry.merchant = String(e.merchant).slice(0, 96);
      return entry;
    }
    function restoreShift(d) {
      shiftOpenedAt = new Date(d.openedAt);
      shiftOpenedBy = d.openedBy || '';
      /* `|| 500` transformait un fond de 0 en 500 à la reprise du poste : le
         tiroir ouvert vide se voyait alors réclamer 500 MAD d'écart à la
         clôture. Depuis que la saisie libre accepte 0, il faut le distinguer
         d'une valeur absente. */
      openingFloat  = (Number.isFinite(d.openingFloat) && d.openingFloat >= 0) ? d.openingFloat : 500;
      terminalCardTotal = (d.terminalCardTotal !== null && d.terminalCardTotal !== undefined &&
        Number.isFinite(Number(d.terminalCardTotal)) && Number(d.terminalCardTotal) >= 0)
        ? money(Number(d.terminalCardTotal)) : null;
      journal.length = 0;
      (d.journal || []).forEach(e => {
        const entry = reviveJournalEntry(e);
        // Une ligne d'avant ce champ prend le commerce du service entier.
        if (!entry.merchant && d.merchant) entry.merchant = String(d.merchant).slice(0, 96);
        journal.push(entry);
      });
      cashMovements.length = 0;
      (d.cashMovements || []).forEach(m => cashMovements.push({
        id: m.id, time: new Date(m.time), type: m.type, amount: m.amount, reason: m.reason,
        actorId: m.actorId, actorName: m.actorName,
      }));
      if (d.shift) {
        shift.discounts  = d.shift.discounts;
        shift.refunds    = d.shift.refunds;
        shift.tablesPaid = d.shift.tablesPaid;
        /* Postes enregistrés avant que le rapport ne compte les remises : on ne
           sait pas combien il y en avait, mais un montant non nul en implique au
           moins une. Mieux vaut « 1 remise · 95 MAD » que « 0 remise · 95 MAD »,
           qui se lit comme un bug. */
        shift.discountsCount = (d.shift.discountsCount != null)
          ? d.shift.discountsCount : (d.shift.discounts > 0 ? 1 : 0);
        shift.cancels = d.shift.cancels || 0;
      }
      if (d.currentCashier && d.currentCashier.name) {
        currentCashier = {
          id:   d.currentCashier.id   || 'othmane',
          name: d.currentCashier.name,
          role: d.currentCashier.role || 'Caissier',
        };
      }
      Object.keys(tableClosedAt).forEach(key => delete tableClosedAt[key]);
      if (d.tableClosedAt && typeof d.tableClosedAt === 'object') {
        const oldestUseful = Date.now() - 12 * 3600 * 1000;
        Object.keys(d.tableClosedAt).forEach(key => {
          const at = Number(d.tableClosedAt[key] || 0);
          if (at >= oldestUseful && at <= Date.now() + 60000) tableClosedAt[tableKey(key)] = at;
        });
      }
      phoneMovedVisits.clear();
      if (Array.isArray(d.phoneMovedVisits)) {
        d.phoneMovedVisits.forEach(pair => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) return;
          const move = pair[1];
          if (!move.from || !move.to) return;
          phoneMovedVisits.set(String(pair[0]), {
            from: tableKey(move.from), to: tableKey(move.to),
            revision: Number(move.revision || 0), closedAt: Number(move.closedAt || 0),
          });
        });
      }
      posteOpenedAt     = d.posteOpenedAt ? new Date(d.posteOpenedAt) : shiftOpenedAt;
      posteOpeningFloat = (typeof d.posteOpeningFloat === 'number') ? d.posteOpeningFloat : openingFloat;
      handovers.length  = 0;
      (d.handovers || []).forEach(h => handovers.push({
        id: h.id, time: new Date(h.time),
        fromName: h.fromName, toName: h.toName,
        posteOpenedAt: new Date(h.posteOpenedAt),
        expected: h.expected, counted: h.counted, ecart: h.ecart,
        confirmedById: h.confirmedById || '', confirmedByName: h.confirmedByName || '',
      }));
      if (d.tables) Object.keys(d.tables).forEach(id => {
        if (tables[id]) tableSettlement().project(tables[id], d.tables[id]);
      });
      if (d.tableOrders) {
        Object.keys(tableOrders).forEach(k => delete tableOrders[k]);
        Object.assign(tableOrders, d.tableOrders);
      }
      if (d.orders) {
        Object.keys(orders).forEach(k => delete orders[k]);
        Object.assign(orders, d.orders);
      }
      /* The payment receipt is the durable fact. A crash after recording cash
         but before markPaid() must not restore that same bill as payable. The
         order number/session ties this cleanup to this visit, not a later party
         that happens to use the same physical table. */
      Object.keys(tables).forEach(id => {
        const paid = paidReceiptForCurrentTable(id);
        if (!paid) return;
        tableSettlement().project(tables[id], { status: 'khawya' });
        tableSettlement().project(tables[id], { covers: 0 });
        resetTableTimer(tables[id]);
        tableSettlement().project(tables[id], {}, ['orderNo']);
        tableSettlement().project(tables[id], {}, ['discount']);
        delete tableOrders[id];
        delete orders[id];
      });
      tableSplits.clear();
      if (Array.isArray(d.tableSplits)) {
        d.tableSplits.forEach((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) return;
          tableSplits.set(String(pair[0]), pair[1]);
        });
      }
      vrapSplits.clear();
      if (Array.isArray(d.vrapSplits)) {
        d.vrapSplits.forEach((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1] || !Array.isArray(pair[1].parts)) return;
          vrapSplits.set(String(pair[0]), pair[1]);
        });
      } else if (d.vrapSplit && Array.isArray(d.vrapSplit.parts)) {
        /* Shift saved before per-order splits: one slot, keyed by its order. */
        vrapSplits.set(vrapSplitKey(d.vrapSplit.orderNum), d.vrapSplit);
      }
      if (Array.isArray(d.cart)) cart = d.cart;
      vrapDiscount = d.vrapDiscount || null;
      vrapEditingNum = d.vrapEditingNum != null ? d.vrapEditingNum : null;
      /* Le board cuisine. `sentAt` revient en texte du JSON alors que tout
         l'écran cuisine calcule un âge dessus (kdsElapsed lit .getTime()) :
         sans cette reprise en Date, la première peinture jetterait. */
      if (Array.isArray(d.kdsOrders) && storeIsReal()) {
        kdsOrders.length = 0;
        d.kdsOrders.forEach((o) => {
          if (!o || staleQueuedServerTicket(o) || isDemoSeedOrder(o)) return;
          const at = new Date(o.sentAt);
          kdsOrders.push(Object.assign({}, o, { sentAt: isNaN(at.getTime()) ? new Date() : at }));
        });
        if (typeof d.kdsOrderSeq === 'number') kdsOrderSeq = d.kdsOrderSeq;
        updateKdsCount();
      }
    }
    function signalTillServiceReady() {
      window.KiwiTillServiceReady = currentMerchantSlug();
      document.dispatchEvent(new CustomEvent('kiwi:caisse-service-ready'));
    }

    function enterShellDirectly() {
      const pin = $('#pin-screen');    if (pin) pin.style.display = 'none';
      const ci  = $('#clockin-screen'); if (ci)  ci.style.display = 'none';
      const greet = document.querySelector('[data-kiwi-greet]'); if (greet) greet.remove();
      document.body.classList.add('is-unlocked');
      renderSalle();
      /* Slice D · même atterrissage qu'après l'animation : le registre. */
      setMode('vrap');
      setVrapView('builder');
      /* A restored draft must show on the tiles too, not only in the bill. */
      try { renderMenu(); renderCart(); } catch (_) {}
      renderShiftStats();
      renderCashierCard();
      if (window.lucide) lucide.createIcons();
      signalTillServiceReady();
    }

    
    /* L'abonnement se retente à chaque tour, et c'est voulu : live-socket.js est
       chargé en `defer` (donc après ce script), une caisse peut être appairée
       bien après le premier rendu, et elle peut CHANGER de commerçant sans
       qu'on repasse par une connexion. Un appel de plus quand tout est déjà en
       place ne coûte rien · KiwiLiveSocket.on ressort aussitôt si la salle est la
       bonne, et rouvre proprement si le slug a changé. */
    function joinFloorSocket() {
      try {
        if (!window.KiwiLiveSocket || !storeIsReal()) return;
        const slug = currentMerchantSlug();
        if (slug) KiwiLiveSocket.on(slug, 'caisse', pollEmployeeFloor);
      } catch (_) {}
    }
    function scheduleEmployeeFloor() {
      if (employeeFloorTimer) clearTimeout(employeeFloorTimer);
      const live = window.KiwiLiveSocket && KiwiLiveSocket.live();
      employeeFloorTimer = setTimeout(() => {
        joinFloorSocket();
        try { pollEmployeeFloor(); } catch (_) {}
        scheduleEmployeeFloor();
      }, live ? FLOOR_POLL_LIVE : FLOOR_POLL_FAST);
    }
    
