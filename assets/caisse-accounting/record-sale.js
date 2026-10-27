
    function recordSale(amount, method, label, tip, lines, settlementTable, tenderOrder, split) {
      /* Le coût du plat GELÉ au moment de la vente (fiche technique complète,
         sinon coût saisi, via KiwiCost.of, le même moteur que le dashboard).
         Sans lui, l'Analyse du menu appliquait le coût d'aujourd'hui à toutes
         les ventes passées : une hausse du prix d'achat réécrivait l'historique.
         Inconnu : rien n'est écrit, jamais 0. */
      function frozenUnitCost(l) {
        try {
          if (!l || !l.itemId || l.kind === 'formula' || l.kind === 'formula-part' || !(+l.total > 0)) return null;
          const C = window.KiwiCost;
          if (!C || typeof C.of !== 'function') return null;
          const hit = C.of({ kind: l.kind || '', id: String(l.itemId), name: l.baseName || l.name || '' });
          const c = hit ? Number(hit.mad) : NaN;
          return Number.isFinite(c) && c > 0 ? Math.round(c * 100) / 100 : null;
        } catch (_) { return null; }
      }
      amount = money(amount);
      /* A cashier ticket can temporarily have no server visit (offline relay).
         Its immutable order number is still enough to recognize a second tap
         on the same uncleared bill. Never book that money or stock twice. */
      if (settlementTable && !split) {
        const paid = paidReceiptForCurrentTable(settlementTable);
        if (paid) { lastSaleId = paid.id; if (paid.saleHeldLocal) retryHeldSalesSafely(); return paid; }
      }
      const discount = activeSaleDiscount(amount, lines, settlementTable);
      const complimentary = amount === 0 && discount
        && discount.grossAmountCents === discount.discountAmountCents
        && /^[A-Za-z0-9:_-]{1,96}$/.test(discount.actorId || '')
        && !/^\d{4}$/.test(discount.actorId || '')
        && Array.isArray(lines) && lines.length > 0;
      if (amount < 0 || (amount === 0 && !complimentary)) return;
      /* An OrderPro takeaway is one commercial event even if the success modal
         is closed, the PWA reloads, or the remote paid flag arrives late. Tie
         the ledger row to the immutable OrderPro id instead of minting a new
         sale id on every tap. This is the financial last line of defence: a
         second Encaisser can reconcile the UI, never book the money twice. */
      /* `finalizeTender()` captures the order before any asynchronous relay can
         repaint or clear the takeaway editor. Keep that exact object attached
         to the receipt instead of rediscovering it through mutable UI state. */
      const vrapOrder = tenderOrder && tenderOrder.type === 'takeaway'
        ? tenderOrder
        : (mode === 'vrap' && vrapEditingNum != null
          ? kdsOrders.find(o => o && o.num === vrapEditingNum) : null);
      const orderProSaleId = vrapOrder && vrapOrder.opId
        ? ('sale-' + String(vrapOrder.opId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 58)) : '';
      if (orderProSaleId) {
        const existingSale = journal.find(row => row && row.id === orderProSaleId);
        if (existingSale) { lastSaleId = existingSale.id; if (existingSale.saleHeldLocal) retryHeldSalesSafely(); return existingSale; }
      }
      const entry = {
        id: orderProSaleId || ('sale-' + (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2))),
        time: new Date(),
        label: label || 'Vente',
        /* Le reçu client, la caisse et la cuisine parlent du MÊME numéro de
           commande. La clé comptable reste `entry.id`; `ref` est le repère
           humain imprimé et doit être le numéro opérationnel. */
        amount: amount, method: method,
        ref: vrapOrder ? ticketNo(vrapOrder)
          : (settlementTable ? (tables[settlementTable]?.reopenRef || settledOrderLabel(settlementTable)) : genRef()),
        tip: money(tip),
        cashier: currentCashier.name,
      };
      if (complimentary) {
        entry.kind = 'complimentary';
        entry.settlementKind = 'complimentary';
      }
      if (vrapOrder && vrapOrder.opId) entry.orderId = String(vrapOrder.opId);
      if (discount) Object.assign(entry, discount);
      if (settlementTable) {
        entry.table = String(settlementTable);
        const visit = phoneSessionOf(settlementTable);
        if (visit) {
          entry.session = String(visit);
        }
        entry.channel = tables[settlementTable] && tables[settlementTable].zone === 'terrasse' ? 'terrace' : 'dining';
      } else if (mode === 'vrap') {
        entry.channel = 'takeaway';
        if (split && Number.isFinite(split.index)) {
          entry.id = entry.id + '-split-' + Number(split.index);
        }
      } else if (split && Number.isFinite(split.index)) {
        entry.id = entry.id + '-split-' + Number(split.index);
      }
      if (split && Number.isFinite(split.index) && Number.isFinite(split.count)) {
        entry.split = { index: Number(split.index), count: Number(split.count), flowId: String(split.flowId || '') };
      }
      if (Array.isArray(lines) && lines.length) {
        entry.lines = lines.filter(l => l.kind !== 'formula-part').map(l => {
          const unitPrice = l.price != null ? l.price : (l.unit != null ? l.unit : (l.qty ? money(l.total / l.qty) : l.total));
          const saved = Object.assign(
            {
              name: l.name,
              baseName: String(l.baseName || '').slice(0, 60),
              qty: l.qty,
              unit: unitPrice,
              price: unitPrice,
              total: money(l.total != null ? l.total : (unitPrice * l.qty)),
              cat: l.cat || '',
            },
            l.itemId ? { itemId: l.itemId } : null,
            l.kind ? { kind: l.kind } : null,
            l.shareDen > 1 ? { shareDen: Number(l.shareDen) } : null,
            /* La promotion de la carte qui a fixé ce prix : son id, son nom et
               ce que la ligne aurait coûté sans elle (le rapport compte la
               différence). */
            (l.promo && l.promo.id) ? { promo: { id: String(l.promo.id), name: String(l.promo.name || ''),
              full: money((+l.promo.before || 0) * (+l.qty || 0)) } } : null);
          const frozenCost = frozenUnitCost(l);
          if (frozenCost != null) saved.unitCost = frozenCost;
          if (Array.isArray(l.formulaChoices)) {
            saved.formulaChoices = l.formulaChoices.map(choice => ({
              name: String((choice && choice.name) || 'Choix'),
              qty: Math.max(1, +(choice && choice.qty) || +l.qty || 1),
              total: money(Math.max(0, +(choice && choice.total) || 0)),
            }));
          }
          return saved;
        });
      }
      if (settlementTable && tables[settlementTable]) {
        /* markPaid() clears the table immediately after the final tender. Keep
         * a bounded bill snapshot on the immutable local receipt so an audited
         * void can restore the same note after a reload, not manufacture a new
         * kitchen order or silently charge the whole split again. */
        const table = tables[settlementTable];
        const source = split && splitState && Array.isArray(splitState.sourceLines) && splitState.sourceLines.length
          ? splitState.sourceLines : generateOrder(settlementTable, table);
        entry.reopenSnapshot = {
          table: String(settlementTable), covers: Math.max(1, Number(table.covers) || 1),
          orderNo: String(table.orderNo || settledOrderRef(settlementTable) || ''),
          ref: String(entry.ref || ''),
          lines: source.slice(0, 40).map(line => ({
            name: String(line.name || ''), qty: Math.max(1, Number(line.qty) || 1),
            total: money(Number(line.total) || 0),
            price: money(Number(line.price ?? line.unit) || ((Number(line.total) || 0) / (Number(line.qty) || 1))),
          })),
          split: split && splitState.flow ? {
            id: String(splitState.flow.id || split.flowId || ''),
            parts: splitState.flow.parts.slice(0, 50).map(part => ({
              ...part, lines: Array.isArray(part.lines) ? part.lines.slice(0, 40).map(line => ({ ...line })) : [],
            })),
            total: splitState.total, mode: splitState.splitMode,
          } : null,
        };
      }
      accountActiveDiscount(settlementTable, split ? null : discount);
      /* Le reçu se fige ICI, au moment de la vente. Si le propriétaire change
         de raison sociale, de logo ou de pied de page en septembre, les tickets
         de juillet ne se réécrivent pas : une réimpression ressort celui qui a
         été remis au client, avec son numéro. */
      attachReceipt(entry);
      /* Une addition partagée à parts égales écrivait le plat entier dans CHAQUE
         part : trois parts d'un tajine comptaient trois tajines au rapport Z, au
         tableau de bord et dans la sortie de stock. Le reçu (figé ci-dessus) garde
         « 1× Tajine · 1/3 » ; la ligne comptable compte 1/3 de plat, de sorte que
         les N parts additionnées redonnent exactement le plat vendu. */
      if (Array.isArray(entry.lines)) {
        entry.lines.forEach(l => {
          if (l && l.shareDen > 1) { l.qty = Math.round((Number(l.qty) || 1) / l.shareDen * 1000) / 1000; delete l.shareDen; }
        });
      }
      window.KiwiTillTenant?.stamp(entry);
      if (settlementTable && tables[settlementTable]) {
        const billLines = split && splitState.sourceLines?.length ? splitState.sourceLines : generateOrder(settlementTable, tables[settlementTable]);
        const totalCents = !split ? minor(amount) : splitState.flow
          ? minor(splitState.flow.parts.reduce((sum, part) => sum + Number(part.base ?? (part.amount - (part.tip || 0))), 0))
          : Math.max(0, minor(billLines.reduce((sum, line) => sum + Number(line.total || 0), 0)) - Number(discount?.discountAmountCents || 0));
        tableSettlement().bill(settlementTable, { totalCents, lines: entry.reopenSnapshot?.lines || [],
          payments: split && splitState.flow ? splitState.flow.parts.flatMap((part, index) => part.paid ? [{
            id: part.saleId || ('legacy:' + splitState.flow.id + ':' + index),
            amountCents: minor(part.base ?? (part.amount - (part.tip || 0))), tipCents: minor(part.tip || 0), method: part.payMethod,
          }] : []) : [] });
        tableSettlement().addPayment(settlementTable, { id: entry.id, amountCents: minor(amount), tipCents: minor(tip || 0), method });
      }
      journal.push(entry);
      lastSaleId = entry.id;
      /* Do not leave a five-second loss window between taking money and the
         autosave. The offline server queue is durable too, but the till's own
         journal must survive an immediate reload on its own. */
      try { persistShift(); } catch (_) {}
      /* ── LA MARCHANDISE SORT AVEC L'ARGENT ────────────────────────────────
       * Les quatorze métiers en pos-*.js encaissent par KiwiPosSale.record(),
       * qui sort le stock au passage (assets/pos-sale.js). Le service à table
       * est le flux NATIF de cette caisse : il ne passe pas par là, et rien
       * d'autre n'appelait le moteur de consommation. Un restaurant pouvait
       * donc servir un service entier · dix-neuf tables réglées · sans qu'un
       * gramme de poulet ne quitte l'inventaire. La fiche technique, le coût
       * matière et la valeur de stock disaient tous la vérité séparément ; le
       * pont entre la vente et la matière n'existait pas.
       *
       * Les lignes portent déjà leur itemId (currentSaleLines), donc la
       * recette se résout directement. Les identifiants de mouvement dérivent
       * de la référence du ticket : un rechargement ne consomme jamais deux
       * fois. Le moteur ignore de lui-même services, pourboires et taxes. */
      try { window.KiwiInventoryConsumption?.record?.(entry); } catch (_) {}
      /* Fidélité. Le carnet du commerçant vivait déjà sur ce comptoir mais rien
         ne l'appelait ici : on pouvait inscrire un client, jamais lui compter
         un passage. Une note = un passage, même réglée en quatre parts · d'où
         le détachement immédiat (voir creditSaleToClient). */
      try { creditSaleToClient(entry); } catch (_) {}
      // Live Link (opt-in, off by default): mirror this sale to the owner's
      // dashboard via /api/sale. No-op unless kiwiLive is on. Never blocks the sale.
      try {
        if (window.KiwiLive) {
          // Le reçu reste détaillé ; le miroir conserve le solde au-delà de 40 lignes.
          const mirrored = window.KiwiPosSale?.foldLines ? Object.assign({}, entry, { lines: window.KiwiPosSale.foldLines(entry.lines) }) : entry;
          const posted = window.KiwiLive.postSale(mirrored);
          if (posted && posted.ok === true && posted.queued === true && posted.id) {
            entry.serverSaleId = posted.id;
            // Queue durability is not server acceptance. Only kiwi:money-sync
            // with state=accepted may clear this debt from the local journal.
            entry.saleSyncPending = true;
            delete entry.saleSyncError;
            /* The feed echoes this same sale under `posted.id`. Persist that
               bridge immediately: without it, a reload before the next
               autosave forgot the relationship and displayed the local row
               plus its cloud echo as two cash transactions. */
            try { persistShift(); } catch (_) {}
          } else if (posted && posted.ok === false) {
            /* Refused by the queue (storage full): the money is taken, so the
               sale stays, once, and is held for replay. The cashier is told it
               is recorded, never that it failed, or the customer pays twice. */
            const durable = holdSaleLocally(entry, posted.reason || 'sale-enqueue-failed');
            try { persistShift(); } catch (_) {}
            warnSaleHeld(durable);
          } else {
            entry.saleSyncPending = true;
            entry.saleSyncError = String((posted && posted.reason) || 'sale-sync-unavailable').slice(0, 96);
            try { persistShift(); } catch (_) {}
          }
        }
      } catch (_) {
        const durable = holdSaleLocally(entry, 'sale-enqueue-failed');
        try { persistShift(); } catch (_) {}
        warnSaleHeld(durable);
      }
      /* Once the receipt is journaled, optional UI/loyalty failures must not
         skip markPaid() and leave the same cash sale payable again. */
      try { renderShiftStats(); } catch (_) {}
      try { if ($('#journal-drawer').classList.contains('is-open')) renderJournal(); } catch (_) {}
      try { refreshOpenReconciliationModals(); } catch (_) {}
      return entry;
    }
