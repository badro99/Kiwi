
    /* ═══════════ UN BON PAR POSTE ═══════════════════════════════════════════
     * L'encodeur du bon de cuisine (escpos.kitchenTicket : gros caractères,
     * notes en dessous) existait et n'était appelé de nulle part · les cuisines
     * sans écran ne recevaient rien. Il l'est maintenant, et par POSTE.
     *
     * Un bon unique qui liste le café ET le tajine oblige le cuisinier à trier
     * à la main ce que la caisse sait déjà, et le bar ne voit jamais sa ligne.
     * Chaque poste reçoit donc SES lignes, sous son nom, avec le numéro de
     * commande pour tout recoller au passe. Un plat affecté à deux postes (une
     * pastilla : cuisson + pâtisserie) sort sur les deux, volontairement.
     *
     * Les bons partent l'un APRÈS l'autre : une thermique ne mélange pas deux
     * jobs simultanés, elle en perd un. Et un seul poste concerné redonne
     * exactement le bon d'avant.
     *
     * Silencieux sans imprimante : l'écran cuisine reste le chemin nominal, le
     * papier est un plus, jamais une condition d'envoi. */
    /* Paper-only hierarchy for composed menus. KDS keeps its richer parent +
       component model; the thermal ticket needs a faster visual scan:

         1× Prépare ton Plat
           > Gnocchi
           > Crema di Formaggi

       Grouping happens AFTER station routing. A formula split between cuisine
       and bar is therefore headed on both tickets, but each printer receives
       only the choices it must prepare. Non-formula items follow the exact old
       mapping and are intentionally untouched. */
    function kitchenPaperItems(items, station, fallback) {
      const source = (Array.isArray(items) ? items : []).filter(Boolean);
      const parents = new Map();
      source.forEach((it) => {
        if (it.kind === 'formula' && it.formulaUid) parents.set(it.formulaUid, it);
      });
      const grouped = new Map();
      const out = [];
      const stationIds = (it) => (it.stations && it.stations.length) ? it.stations : [fallback];
      const visualText = (it) => (Array.isArray(it.visuals) ? it.visuals : [])
        .map(v => v && (v.name || v.label || v.cn)).filter(Boolean).join(' · ');
      const withoutFormulaTag = (value) => String(value || '')
        .replace(/^\s*\[[^\]]*\]\s*(?:·\s*)?/, '').trim();

      /* A formula parent is sometimes the actual dish while its components
         are optional, or routed to another station. It must remain printable
         on its own station; otherwise it exists on the final receipt but no
         cook ever receives it. */
      source.forEach((parent) => {
        if (parent.kind !== 'formula' || stationIds(parent).indexOf(station) < 0) return;
        const hasChoiceHere = source.some((part) => part.kind === 'formula-part'
          && part.formulaUid && part.formulaUid === parent.formulaUid
          && stationIds(part).indexOf(station) >= 0);
        if (hasChoiceHere) return;
        const parentVisual = visualText(parent);
        out.push({
          qty: parent.q,
          name: parent.formulaName || parent.n,
          note: [parentVisual, parentVisual ? parent.note : (parent.paperNote || parent.note)]
            .filter(Boolean).join(' · '),
        });
      });

      source.forEach((it) => {
        if (stationIds(it).indexOf(station) < 0) return;
        /* The formula parent is a billing/container line, not a preparation
           line. Its heading is emitted when the first component for THIS
           station is encountered. */
        if (it.kind === 'formula') return;
        if (it.kind === 'formula-part' && it.formulaUid) {
          let formula = grouped.get(it.formulaUid);
          if (!formula) {
            const parent = parents.get(it.formulaUid);
            const parentVisual = parent ? visualText(parent) : '';
            formula = {
              qty: (parent && parent.q) || it.q || 1,
              name: (parent && (parent.formulaName || parent.n))
                || it.formulaName || 'Formule',
              note: parent
                ? [parentVisual, parentVisual ? parent.note : (parent.paperNote || parent.note)]
                    .filter(Boolean).join(' · ')
                : '',
              formulaChoices: [],
            };
            grouped.set(it.formulaUid, formula);
            out.push(formula);
          }
          const choiceVisual = visualText(it);
          const rawDetail = withoutFormulaTag(choiceVisual ? it.note : (it.paperNote || it.note));
          const detail = [choiceVisual, rawDetail].filter(Boolean).join(' · ');
          if (it.n) formula.formulaChoices.push({ name: it.n, note: detail });
          return;
        }
        const visualNote = visualText(it);
        out.push({ qty: it.q, name: it.n,
          note: [visualNote, visualNote ? it.note : (it.paperNote || it.note)].filter(Boolean).join(' · ') });
      });
      return out;
    }

    function printKitchenTickets(order, items, options) {
      try {
        const KP = window.KiwiPrinter;
        const sentAt = order.sentAt instanceof Date ? order.sentAt : new Date(order.sentAt || Date.now());
        const jobAt = new Date((options && options.createdAt) || sentAt);
        const time = pad2HO(sentAt.getHours()) + ':' + pad2HO(sentAt.getMinutes());
        /* Le numéro de table voyage déjà dans les trois chemins restaurant :
           caisse locale (`sendTableToKitchen`), application employé et lien
           NFC/OrderPro (`opIngest`). Il était perdu seulement à la dernière
           frontière, au moment de construire le document ESC/POS. Le préfixe
           lisible évite au passe de devoir traduire un numéro de commande en
           table ; les bons à emporter gardent volontairement cette ligne vide. */
        const rawTable = String((order && order.table) || '').trim();
        const tableLabel = rawTable
          ? (/^table(?:\s|$)/i.test(rawTable) ? rawTable : `Table ${rawTable}`)
          : '';
        const fallback = kdsStationFor(null);
        const byStation = new Map();
        (items || []).filter(Boolean).forEach((it) => {
          const sids = (it.stations && it.stations.length) ? it.stations : [fallback];
          sids.forEach((sid) => {
            if (!byStation.has(sid)) byStation.set(sid, null);
          });
        });
        byStation.forEach((_, sid) => { byStation.set(sid, kitchenPaperItems(items, sid, fallback)); });
        const list = kdsStations();
        const names = {};
        list.forEach((s) => { names[s.id] = s.name; });
        const rank = (id) => { const i = list.findIndex(s => s.id === id); return i < 0 ? 999 : i; };
        const sourceId = String((options && options.sourceId) || order.opId
          || `local-${order.num}-${sentAt.getTime()}`);
        const plan = Array.from(byStation.keys()).sort((a, b) => rank(a) - rank(b)).map((sid) => ({
          id: `${sourceId}:${sid}`,
          createdAt: jobAt.getTime(),
          station: sid,
          payload: {
            title: ((options && options.voided) ? 'ANNULÉ · ' : order.course === 'suite' ? 'SUITE · ' : '') + String(names[sid] || 'Cuisine').toUpperCase(),
            station: sid,
            table: tableLabel,
            order: order.opNum != null ? '#' + order.opNum : order.num != null ? '#' + order.num : '', time: time,
            items: byStation.get(sid),
            following: (!(options && options.voided) && Array.isArray(order.following) && order.following.length)
              ? kitchenPaperItems(order.following, sid, fallback).map(i => ({ qty: i.qty, name: i.name }))
              : undefined,
          },
        }));
        /* Le chemin normal est durable, réessayable et dédupliqué. Le repli
           garde les anciennes caisses fonctionnelles si le nouveau module ne
           s'est pas chargé, mais il ne ment plus sur un échec d'impression. */
        if (window.KiwiKitchenPrint && KiwiKitchenPrint.enqueue) {
          /* `force` était construit par l'appelant puis jeté ici : la demande
             de réimpression n'atteignait jamais la file, qui refusait le bon
             comme un doublon (#0063). */
          return KiwiKitchenPrint.enqueue(plan, {
            remote: options && options.remote,
            force: !!(options && options.force),
          });
        }
        // Without the hub's durable dispatcher, remote tickets must wait for
        // recovery. A direct fallback on every connected till duplicates food.
        if (options && (options.remote === true || options.remote === 'connected')) {
          return { accepted: 0, skipped: 'print-hub-unavailable' };
        }
        if (!KP || !KP.printKitchen || (KP.isConnected && !KP.isConnected())) return;
        return plan.reduce((chain, job) => chain.then(() => Promise.resolve(KP.printKitchen(job.payload, { station: job.station || fallback })).then((result) => {
          if (!result || !result.ok) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket cuisine non imprimé'), 5200, 'warn', (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vérifiez l’imprimante puis réimprimez le bon.'));
        })), Promise.resolve());
      } catch (_) {}
    }

    /* À emporter / Table · push current items to the kitchen */
    function createTakeawayKitchenOrder(lines) {
      const source = (Array.isArray(lines) ? lines : []).filter(l => l && l.qty > 0);
      if (!source.length) return null;
      const total = source.reduce((s, l) => s + l.price * l.qty, 0);
      const items = kitchenItemsFromLines(source);
      const order = {
        num: ++kdsOrderSeq, type: 'takeaway', status: 'new',
        /* Provenance connue DÈS la création, sans attendre que la file la
           renvoie : c'est elle qui décide que cette vente n'a pas à passer par
           « Marquer prêt » puis « Remettre au client » (voir vrapOrderCard). */
        opChannel: 'caisse',
        readyAt: null, items, relayLines: relayLinesFromCaisse(source), sentAt: new Date(),
        kitchenDispatchedAt: Date.now(),
        paid: false, pickedUp: false, pickedUpAt: null, total,
      };
      kdsOrders.push(order);
      /* Print only after the permanent queue number has had its first chance
         to land on the same object used by Caisse, KDS and the receipt. */
      /* Keep the allocation promise on the order. finalizeTender() awaits this
         exact field before freezing the sale, receipt and report row. The old
         fire-and-forget call let local sequence #25 reach accounting while the
         same order became permanent #86 moments later. */
      order.canonicalNumberPromise = relayToKitchen(order);
      order.canonicalNumberPromise.then(() => printKitchenTickets(order, items));
      try { persistShift(); } catch (_) {}
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      return order;
    }

    function sendToKitchen() {
      if (mode === 'order' && selectedId) {
        validateOrder(selectedId);
        return;
      }
      if (mode === 'salle' && selectedId) {
        /* Rien de neuf, mais une suite qui attend : ce bouton s'appelle alors
           « Envoyer la suite » et c'est elle qu'il lance. */
        const suite = tableSuiteOnly(selectedId);
        const held = suite ? tableHeldQty(selectedId) : 0;
        const sent = dispatchTableUnsentToKitchen(selectedId, false, suite);
        const count = sent.remote + (sent.local ? 1 : 0);
        if (suite && sent.local) toast(`Suite envoyée en cuisine · table ${selectedId} · ${held} article${held > 1 ? 's' : ''}`);
        else if (count) toast(`${count} commande${count > 1 ? 's' : ''} envoyée${count > 1 ? 's' : ''} en cuisine`);
        else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rien de neuf à envoyer'));
        renderRightPanel(selectedId);
        return;
      }
      if (mode === 'order' && !selectedId) {
        backToSalle();
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune table en cours'));
        return;
      }
      const list = (cart && cart.length) ? cart : [];
      if (!list.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajoute des articles d\'abord')); return; }

      if (vrapEditingNum != null) {
        const o = kdsOrders.find(x => x.num === vrapEditingNum);
        if (o) {
          saveVrapEdits();
          if (o.status === 'held') {
            dispatchHeldTakeaway(o, false, true);
            clearCart();
            setVrapView('board');
            toast(`Commande ${ticketNo(o)} envoyée en cuisine · paiement en attente`);
            return;
          }
          const items = kitchenItemsFromLines(cart);
          printKitchenTickets(o, items);
          try { persistShift(); } catch (_) {}
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          clearCart();
          setVrapView('board');
          toast(`Commande #${o.num} mise à jour en cuisine`);
          return;
        }
      }

      const order = createTakeawayKitchenOrder(cart);
      if (!order) return;
      const count = list.reduce((s, l) => s + l.qty, 0);
      clearCart();
      setVrapView('board');
      toast(`Commande #${order.num} envoyée en cuisine · ${count} article${count > 1 ? 's' : ''}`);
    }
