
    /* Versions OrderPro restées ouvertes avant le protocole parent+composants
       ont pu déposer uniquement les composants d'une formule. Le serveur ne
       doit plus accepter ce cas (voir /api/order), mais les tickets déjà en
       file doivent rester encaissables et atteindre le bon poste. La carte
       publiée est l'unique autorité : on ne reconstruit que si le nom de la
       formule correspond exactement à un article composé connu. */
    function opRepairFormulaParents(o) {
      if (!o || !Array.isArray(o.lines)) return false;
      let repaired = false;
      const groups = new Map();
      o.lines.forEach((line) => {
        if (!line || line.kind !== 'formula-part' || !line.formulaUid) return;
        if (!groups.has(line.formulaUid)) groups.set(line.formulaUid, []);
        groups.get(line.formulaUid).push(line);
      });
      groups.forEach((children, formulaUid) => {
        if (o.lines.some(line => line && line.kind === 'formula' && line.formulaUid === formulaUid)) return;
        const formulaName = String((children[0] && children[0].formulaName) || '');
        const item = menuItems.find(candidate => candidate && candidate.formula
          && String(candidate.name || '') === formulaName);
        if (!item) return;
        let formulaExtra = 0;
        const slots = Array.isArray(item.formula.slots) ? item.formula.slots : [];
        children.forEach((child) => {
          const slot = slots.find(candidate => String(candidate.id || '') === String(child.formulaSlotId || ''));
          const choice = slot && Array.isArray(slot.choices)
            ? slot.choices.find(candidate => String(candidate.itemId || '') === String(child.id || '')) : null;
          const choiceExtra = Math.max(0, +(choice && choice.extra) || 0);
          child.formulaExtra = choiceExtra;
          formulaExtra += choiceExtra;
        });
        const inheritedVisuals = children.flatMap(child => Array.isArray(child.visuals) ? child.visuals : []);
        let optionExtra = 0;
        (item.opts || []).forEach((groupId) => {
          const group = (carteState.opts || []).find(candidate => candidate.id === groupId);
          (group && group.choices || []).forEach((choice) => {
            if (inheritedVisuals.some(visual => String((visual && visual.name) || '') === choice.name)) {
              optionExtra += Math.max(0, +choice.price || 0);
            }
          });
        });
        const qty = Math.max(1, +(children[0] && children[0].qty) || 1);
        o.lines.unshift({
          id: item.id, name: item.name, qty,
          unitPrice: Math.max(0, +item.price || 0) + formulaExtra + optionExtra,
          options: inheritedVisuals.map(visual => visual && visual.name).filter(Boolean).join(' · '),
          visuals: inheritedVisuals, note: '', station: kdsStationFor(item),
          kind: 'formula', formulaUid, formulaName: item.name,
        });
        children.forEach(child => { child.visuals = []; });
        repaired = true;
      });
      if (repaired) o.total = o.lines.reduce((sum, line) => sum + ((+line.unitPrice || 0) * (+line.qty || 1)), 0);
      return repaired;
    }

    /* Une commande OrderPro en salle appartient aussi à l'addition de la
       table. Jusqu'ici elle devenait un bon KDS et une pastille, mais jamais
       une table occupée : taper la table relançait donc le choix des couverts
       et présentait une addition vide. On rattache les lignes serveur une
       seule fois, sans les rendre modifiables ni les renvoyer en cuisine. */
    function attachOrderProTable(o) {
      if (!o || o.mode !== 'table' || !o.table) return false;
      const orderId = String(o.id || o.opId || '').trim();
      if (!orderId) return false;
      if (o.paid && o.status !== 'rejected') return false;
      const id = caisseTableId(o.table);
      const t = id && tables[id];
      if (!t) return false;
      if (locallySettledVisit(id, o.session)) return false;
      if (o.number != null && locallySettledOrder(id, ticketNo({ opNum: o.number, opChannel: o.channel || 'kiwi',
        type: 'dineIn', server: o.server || '' }))) return false;
      /* Rejection is terminal and its line marker is globally unique. Remove
         that exact order before checking the current phone session: the visit
         may already have closed or the physical table may already belong to a
         new party, but neither fact can make an old rejected line legitimate.
         This is deliberately narrower than clearing the table. */
      if (o.status === 'rejected') {
        const before = (tableOrders[id] || []).length;
        currentOrder().replaceTable(id, (tableOrders[id] || []).filter(l => !String(l.orderProLine || '').startsWith(orderId + ':')));
        const changed = tableOrders[id].length !== before;
        if (changed) {
          refreshTableNode(id);
          if (selectedId === id) mode === 'order' ? renderOrderPanel(id) : renderRightPanel(id);
          try { persistShift(); } catch (_) {}
        }
        return changed;
      }
      const incomingLines = Array.isArray(o.lines)
        ? o.lines.filter(line => line && Math.max(0, Number(line.qty) || 0) > 0) : [];
      /* A queue shell with no billable line is not a table visit. Importing it
         used to occupy the table, render “Annuler commande undefined”, and
         leave a zero-MAD bill that could never be settled or cancelled. */
      if (!incomingLines.length) return false;
      const activeSeat = phoneSeats.get(tableKey(id));
      /* ── UNE TABLE RÉGLÉE NE SE ROUVRE PAS TOUTE SEULE ──────────────────
       * This bridge handles cashier and staff tickets as well as customer
       * orders. Ticket #0068 shows a cashier receipt for table 13 while the
       * same bill stayed open; it does NOT establish an OrderPro cause.
       * Session-bearing tickets are blocked by the durable paid receipt above.
       * This timestamp guard covers older sessionless rows in the same tab.
       * `tableClosedAt` porte déjà l'heure de la fermeture locale (markPaid →
       * releasePhoneTable) et se lève dès qu'une table légitime rouvre. Un bon
       * créé AVANT cette heure appartient au service qu'on vient de payer.
       * On exige un horodatage réel : sans lui on ne sait pas, et refuser une
       * commande authentique coûte plus cher que d'en rouvrir une. */
      const closedAt = Number(tableClosedAt[tableKey(id)] || 0);
      const createdTs = Number(o.created_ts || 0);
      const acknowledgedMove = o.session && phoneMovedVisits.get(String(o.session));
      const movedHere = acknowledgedMove && acknowledgedMove.to === tableKey(id)
        && Number(acknowledgedMove.closedAt || 0) === closedAt;
      if (!movedHere && closedAt && createdTs && createdTs <= closedAt
        && !(activeSeat && Number(activeSeat.since || 0) > closedAt)) return false;
      /* A table is reused hundreds of times. Only tickets from its CURRENT
         session belong to this bill. Legacy employee rows have a server but no
         session; importing them is precisely how one new item became eight in
         caisse while KDS correctly showed only the new ticket. */
      if (o.session && (!activeSeat || String(activeSeat.session) !== String(o.session))) return false;
      if (!o.session && o.server) return false;
      if (!o.session && activeSeat && Number(o.created_ts || 0) < Number(activeSeat.since || 0)) return false;

      if (o.number != null && !t.orderNo) {
        tableSettlement().project(t, { orderNo: ticketNo({
          opNum: o.number, opChannel: o.channel || 'kiwi',
          type: o.mode === 'takeout' ? 'takeaway' : 'dineIn', server: o.server || '',
        }) });
      }

      let changed = false;
      if (t.status === 'khawya' || t.status === 'a-commander') {
        if (t.status === 'khawya') resetTableTimer(t);
        tableSettlement().project(t, { status: 'ka-yaklo' });
        changed = true;
      }
      if (o.server && !t.server) {
        const serverId = Object.keys(servers).find(k => servers[k] && servers[k].name === o.server);
        if (serverId) { tableSettlement().project(t, { server: serverId }); changed = true; }
      }

      if (activeSeat && activeSeat.session) {
        if (t.timerSession && t.timerSession !== String(activeSeat.session)) resetTableTimer(t);
        tableSettlement().project(t, { timerSession: String(activeSeat.session) });
      }
      let lines = tableOrders[id] || (currentOrder().replaceTable(id, []));
      if (activeSeat && activeSeat.session) {
        const curSession = String(activeSeat.session);
        const filtered = lines.filter(l => !l.orderSession || String(l.orderSession) === curSession);
        if (filtered.length !== lines.length) {
          lines = currentOrder().replaceTable(id, filtered);
          changed = true;
        }
      }
      incomingLines.forEach((l, index) => {
        const marker = orderId + ':' + String(l.uid || l.lineId || index);
        const existing = lines.find(x => x.orderProLine === marker);
        if (existing) {
          const pending = o.status === 'pending';
          const canonicalUid = l.uid || l.id || '';
          if (existing.orderProPending !== pending) { currentOrder().patchLine(existing, { ["orderProPending"]: pending }); changed = true; }
          const nextQty = Math.max(1, Number(l.qty) || 1);
          if (existing.qty !== nextQty || existing.voidPending !== !!l.voidAlert
            || existing.name !== (l.name || '') || existing.price !== (+l.unitPrice || 0)
            /* A caisse-created line and its canonical server line normally have
             * identical display values. Identity must still converge: otherwise
             * cancellation posts the temporary local uid and the API correctly
             * answers line-not-on-order. */
            || existing.canonicalUid !== canonicalUid
            || existing.canonicalOrderId !== orderId) {
            currentOrder().patchLine(existing, { ["qty"]: nextQty });
            currentOrder().patchLine(existing, { ["voidPending"]: !!l.voidAlert });
            currentOrder().patchLine(existing, { ["canonicalUid"]: canonicalUid });
            currentOrder().patchLine(existing, { ["canonicalOrderId"]: orderId });
            currentOrder().patchLine(existing, { ["id"]: l.id || existing.id });
            currentOrder().patchLine(existing, { ["name"]: l.name || existing.name });
            currentOrder().patchLine(existing, { ["price"]: +l.unitPrice || 0 });
            changed = true;
          }
          return;
        }
        const menuHit = menuLineFind(x => String(x.id) === String(l.id))
          || menuLineFind(x => String(x.name || '').toLowerCase() === String(l.name || '').toLowerCase());
        currentOrder().append(lines, {
          uid: newLineUid(), canonicalUid: l.uid || l.id || '', canonicalOrderId: orderId,
          id: (menuHit && menuHit.id) || l.id || ('op-' + marker),
          name: l.name || (menuHit && menuHit.name) || '', price: +l.unitPrice || 0,
          /* Le prix vient du serveur, déjà remisé ; son cachet de promotion
             l'accompagne pour que la note dise pourquoi. */
          ...(l.promo && l.promo.id ? { promo: l.promo } : {}),
          qty: Math.max(1, +l.qty || 1), note: l.note || '', opts: [], optSig: '',
          options: l.options || '', visuals: Array.isArray(l.visuals) ? l.visuals.slice() : [],
          station: l.station || (menuHit && menuHit.station) || '',
          kind: l.kind || '', formulaUid: l.formulaUid || '', formulaName: l.formulaName || '',
          slotLabel: l.slotLabel || '', formulaSlotId: l.formulaSlotId || '', lineId: l.lineId || '',
          formulaExtra: l.kind === 'formula-part' ? Math.max(0, +l.formulaExtra || 0) : undefined,
          sent: true, orderProLine: marker, orderSession: String(o.session || ''),
          caisseRecovered: o.channel === 'caisse',
          orderProPending: o.status === 'pending',
          voidPending: !!l.voidAlert,
        });
        changed = true;
      });
      const activeMarkers = new Set(incomingLines.map((l, index) => orderId + ':' + String(l.uid || l.lineId || index)));
      const kept = lines.filter(line => !String(line.orderProLine || '').startsWith(orderId + ':')
        || activeMarkers.has(String(line.orderProLine)));
      if (kept.length !== lines.length) { currentOrder().replaceTable(id, kept); changed = true; }
      if (changed) {
        if ((tableOrders[id] || []).length) startTableTimer(id, o.created_ts);
        refreshTableNode(id);
        if (selectedId === id && mode === 'salle') renderRightPanel(id);
        try { persistShift(); } catch (_) {}
      }
      return changed;
    }

    /* Une commande du serveur → un ticket d'ici. Idempotent : le sondage repasse
       toutes les six secondes sur les mêmes lignes, et il ne doit jamais en
       naître un deuxième ticket. */
    function retireRejectedKitchenTicket(ticket) {
      if (!ticket || !ticket.opId) return false;
      const index = kdsOrders.indexOf(ticket);
      let retired = false;
      // This is a live-work projection, not the financial ledger. The server's
      // rejected record and cancellation history remain the durable evidence.
      if (index >= 0) {
        kdsOrders.splice(index, 1);
        opTickets.delete(String(ticket.opId));
        retired = true;
        if (vrapEditingNum === ticket.num) {
          currentOrder().setEditing(null);
          clearCart();
          setVrapView('board');
        }
      }
      /* A rejected/expired OrderPro ticket can already be absent from the
         local kitchen projection after a reload or TTL sweep. Its bridge line
         must still be removed from the table bill, otherwise the table stays
         permanently "sent" and cannot be cancelled or closed. */
      try {
        const id = ticket.table ? caisseTableId(ticket.table) : null;
        if (id && Array.isArray(tableOrders[id])) {
          const before = tableOrders[id].length;
          currentOrder().replaceTable(id, tableOrders[id].filter(line =>
            !String(line.orderProLine || '').startsWith(String(ticket.opId) + ':')));
          if (tableOrders[id].length !== before) {
            refreshTableNode(id);
            if (selectedId === id && mode === 'salle') renderRightPanel(id);
            try { persistShift(); } catch (_) {}
          }
        }
      } catch (_) {}
      try { persistShift(); } catch (_) {}
      return retired;
    }
    function canRecoverCaisseTable(o) {
      if (!o || o.channel !== 'caisse' || o.mode !== 'table' || !o.session || o.paid || o.status === 'rejected') return false;
      const id = caisseTableId(o.table);
      const seat = id && phoneSeats.get(tableKey(id));
      if (!seat || String(seat.session) !== String(o.session)) return false;
      // Unmarked local lines cannot be safely matched to a canonical ticket by
      // product/price alone. Leave that ambiguous bill intact, without importing.
      if ((orders[id] || []).length || (tableOrders[id] || []).some(l => !l.orderProLine)) return false;
      if (!Array.isArray(o.lines) || !o.lines.length || !Number.isFinite(o.total) || o.total <= 0) return false;
      if (!o.lines.every(l => l && Number.isFinite(l.unitPrice) && l.unitPrice >= 0
          && Number.isInteger(l.qty) && l.qty > 0)) return false;
      const total = o.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
      return Math.round(total * 100) === Math.round(o.total * 100);
    }

    function opIngest(o) {
      if (!o || !o.id) return;
      if (o.status === 'archived') {
        rememberArchivedTakeaway(o.id);
        const archived = opTickets.get(o.id) || kdsOrders.find(t => t && t.opId === o.id)
          // Older saved shifts carried the server number but not its opaque id.
          // Reconcile only an exact same-store number, amount and near-identical
          // creation time: a recycled weekly number alone is not enough.
          || kdsOrders.find(t => t && t.type === 'takeaway' && !t.opId
            && String(t.opNum) === String(o.number)
            && Math.abs(Number(t.total) - Number(o.total)) < 0.01
            && Math.abs(new Date(t.sentAt).getTime() - Number(o.created_ts)) < 60 * 60000);
        if (archived && archived.type === 'takeaway') {
          archived.opId = o.id;
          retireRejectedKitchenTicket(archived);
        }
        opTickets.delete(o.id);
        return;
      }
      if (o.mode === 'takeout' && archivedTakeawaySet().has(String(o.id))) return;
      if (o.channel !== 'caisse') opRepairFormulaParents(o);
      /* La carte des tickets vit en mémoire ; le SERVICE, lui, survit au
         rechargement (persistShift). Après un F5 en plein service, `opTickets`
         repart vide alors que `kdsOrders` contient encore les bons de la caisse
         avec leur `opId` · le sondage suivant ne les aurait donc pas reconnus
         et en aurait fabriqué un DEUXIÈME exemplaire pour chacun. On rattache
         par balayage, une seule fois par bon. Même mécanique quand un SECOND
         comptoir découvre les bons du premier. */
      let known = opTickets.get(o.id);
      if (!known) {
        known = kdsOrders.find(t => t && t.opId === o.id);
        if (known) opTickets.set(o.id, known);
      }
      /* A cashier-created ticket has sent lines in the local bill as well as
       * the canonical queue. Kitchen voids must reconcile that local copy by
       * its immutable uid; otherwise an approved cancellation appears again
       * after refresh (or the next poll) and can be charged twice. */
      if (o.channel === 'caisse' && o.mode === 'table' && known?.relayLines?.length) {
        const tableId = caisseTableId(o.table);
        const localBill = tableId && tableOrders[tableId];
        if (localBill) {
          const owned = new Set(known.relayLines.map(line => String(line.uid || '')).filter(Boolean));
          const current = new Map((o.lines || []).filter(line => line?.uid)
            .map(line => [String(line.uid), line]));
          let changed = false;
          const next = localBill.filter(line => {
            if (!line?.sent || line.orderProLine || !owned.has(String(line.uid || ''))) return true;
            const remote = current.get(String(line.uid));
            if (o.status === 'rejected' || !remote) { changed = true; return false; }
            const qty = Math.max(1, Number(remote.qty) || 1);
            if (line.qty !== qty || line.voidPending !== !!remote.voidAlert) {
              currentOrder().patchLine(line, { qty, voidPending: !!remote.voidAlert }); changed = true;
            }
            return true;
          });
          if (changed) {
            currentOrder().replaceTable(tableId, next);
            refreshTableNode(tableId);
            if (selectedId === tableId) mode === 'order' ? renderOrderPanel(tableId) : renderRightPanel(tableId);
            try { persistShift(); } catch (_) {}
          }
        }
      }
      /* A ticket created by THIS cashier is already present in tableOrders.
         The queue returns it so remote KDS screens can see it; feeding that
         same ticket through the OrderPro/employee bill bridge added its lines
         a second time to the table while KDS (correctly idempotent on opId)
         still showed only one. */
      /* Bill attachment has its own idempotent line markers. Run it even when
         the KDS ticket is already known: after the one-time browser cleanup,
         the current session must be able to rebuild its legitimate bill from
         the canonical queue without manufacturing another KDS ticket. */
      if (o.channel !== 'caisse' || canRecoverCaisseTable(o)) {
        attachOrderProTable(o);
      } else if (o.channel === 'caisse' && o.mode === 'table') {
        const id = caisseTableId(o.table);
        const bill = id && tableOrders[id];
        if (bill && bill.length) {
          const local = bill.filter(l => !l.orderProLine && l.sent && !l.orderProPending);
          const kept = bill.filter(line => {
            if (line.caisseRecovered || !String(line.orderProLine || '').startsWith(String(o.id) + ':')) return true;
            // Only the old echo of an existing sent cashier line qualifies.
            // Recovered canonical-only rows remain real bill lines, even if a
            // cashier subsequently adds the same product at the same price.
            return !local.some(l => String(l.id || '') === String(line.id || '')
              && l.name === line.name && l.qty === line.qty && l.price === line.price
              && String(l.note || '') === String(line.note || ''));
          });
          if (kept.length !== bill.length) {
            currentOrder().replaceTable(id, kept);
            refreshTableNode(id);
            if (selectedId === id) mode === 'order' ? renderOrderPanel(id) : renderRightPanel(id);
            try { persistShift(); } catch (_) {}
          }
        }
      }

      /* En salle, une commande EN ATTENTE n'entre pas dans la cuisine : elle
         attend la décision humaine, et c'est la pastille sur la table qui la
         signale. À emporter, en revanche, elle doit être VISIBLE au comptoir
         tout de suite avec son numéro · c'est ce numéro que le client vient
         annoncer pour payer. D'où l'état local `held` : le tableau À emporter
         l'affiche, l'écran cuisine l'ignore (kdsGroup ne connaît que
         new/cooking/ready), et le paiement le promeut. */
      if (o.status === 'rejected') {
        if (known) retireRejectedKitchenTicket(known);
        opTickets.delete(o.id);
        return;
      }
      if (known && ['pending', 'accepted', 'ready', 'served'].includes(o.status)) {
        // Repair a legacy age purge that removed the card but left its index.
        if (!kdsOrders.includes(known)) kdsOrders.push(known);
        if (o.mode === 'table' || o.mode === 'takeout') {
          // Une table hors plan s'encaisse au comptoir (checkoutOrder) : le
          // sondage suivant ne doit pas la renvoyer en salle sous le panier.
          const type = o.mode === 'table' && !known.offPlan ? 'dineIn' : 'takeaway';
          if (known.type !== type && vrapEditingNum === known.num) {
            currentOrder().setEditing(null);
            clearCart();
            setVrapView('board');
          }
          known.type = type;
          known.table = o.mode === 'table' ? o.table : null;
        }
        if (o.session) known.session = String(o.session);
      }
      if (!known) {
        if (o.mode === 'table' && o.status === 'pending') return;   // la pastille suffit
        const isTakeaway = o.mode !== 'table';
        const t = {
          num: ++kdsOrderSeq,
          opId: o.id,
          opNum: o.number,
          opChannel: o.channel || 'kiwi',
          type: isTakeaway ? 'takeaway' : 'dineIn',
          table: o.mode === 'table' ? (o.table || '') : null,
          session: o.session || '',
          server: o.server || (o.mode === 'table' ? serverNameFor(o.table) : ''),
          status: (isTakeaway && o.status === 'pending') ? 'held'
                : (o.status === 'ready' ? 'ready' : 'new'),
          readyAt: o.status === 'ready' ? kdsNowHM() : null,
          items: (o.lines || []).map(l => {
            const formulaTag = l.kind === 'formula-part' ? (l.formulaName ? `${l.formulaName}${l.slotLabel ? ' · ' + l.slotLabel : ''}` : (l.slotLabel || 'Formule')) : '';
            const formulaNote = formulaTag ? `[${formulaTag}]` : '';
            const ownVisuals = Array.isArray(l.visuals) ? l.visuals : [];
            return {
              q: l.qty || 1, n: l.name || '', p: l.unitPrice || 0,
              kind: l.kind || '',
              formulaUid: l.formulaUid || '',
              slotLabel: l.slotLabel || '',
              formulaName: l.formulaName || '',
              formulaExtra: l.kind === 'formula-part' ? Math.max(0, +l.formulaExtra || 0) : 0,
              note: [formulaNote, ownVisuals.length ? '' : l.options, l.note].filter(Boolean).join(' · '),
              visuals: ownVisuals.slice(),
              /* Le poste porté PAR LA LIGNE gagne. Un bon posé par une caisse le
                 transporte (kitchen-relay.js), figé à l'instant de l'envoi : le
                 retrouver par le nom du plat serait le recalculer contre une
                 carte qui a pu changer depuis. Le repli par nom reste pour les
                 commandes du téléphone, qui n'ont jamais porté de poste. */
              stations: [(l.station && kdsStations().some(s => s.id === l.station))
                ? l.station : kdsStationForName(l.name)],
              stationReady: l.stationReady === true,
              stationAccepted: l.stationAccepted === true,
            };
          }),
          billItems: (o.lines || []).filter(l => l.kind !== 'formula-part').map(l => ({
            q: l.qty || 1, n: l.name || '', p: l.unitPrice || 0, note: l.note || '',
            visuals: Array.isArray(l.visuals) ? l.visuals.slice() : [],
            kind: l.kind || '', formulaUid: l.formulaUid || '', formulaName: l.formulaName || '',
            formulaChoices: l.kind === 'formula' ? (o.lines || [])
              .filter(part => part.kind === 'formula-part'
                && String(part.formulaUid || '') === String(l.formulaUid || ''))
              .map(part => ({
                name: part.name || 'Choix', qty: Math.max(1, +part.qty || +l.qty || 1),
                total: Math.max(0, +part.formulaExtra || 0) * Math.max(1, +part.qty || +l.qty || 1),
              })) : [],
            stations: [(l.station && kdsStations().some(s => s.id === l.station))
              ? l.station : kdsStationForName(l.name)],
          })),
          sentAt: new Date(o.created_ts || Date.now()),
          paid: !!o.paid, pickedUp: o.status === 'served',
          pickedUpTs: o.status === 'served' ? vrapHandoverTimestamp(o.served_ts) : null,
          pickedUpAt: o.status === 'served' ? vrapHandoverTime(vrapHandoverTimestamp(o.served_ts)) : null,
          total: o.total || 0,
        };
        kdsOrders.push(t);
        opTickets.set(o.id, t);
        /* Un seul poste, choisi comme hub d'impression, reçoit les bons saisis
           sur le téléphone serveur, une autre caisse ou OrderPro. Les bons en
           attente ne passent jamais ici ; les prêts/servis retrouvés après un
           redémarrage ne ressortent pas non plus. */
        if (o.status === 'accepted') printKitchenTickets(t, t.items, {
          /* A table-service order carrying both a visit and a named employee
             has already been authorised in the employee app. “Lancer” (or the
             employee accepting its OrderPro table request) is the kitchen
             confirmation; a connected printer must act immediately. */
          remote: o.localKitchenAction === true ? false
            : (o.mode === 'table' && o.session && o.server ? 'connected' : true),
          sourceId: o.id, createdAt: o.updated_ts || o.created_ts,
        });
        return;
      } else {
        /* Après un rechargement, un ancien instantané peut ne pas avoir gardé
           la provenance. La file serveur la rend : on restaure donc le préfixe
           exact sans recréer le ticket. */
        known.opChannel = o.channel || known.opChannel || 'kiwi';
        /* Recovery is as important as the first POST response. A reload,
           transient network failure or queued retry can make the poll the
           first place this till learns the permanent number. Never leave the
           recognized local ticket on its private kdsOrderSeq value. */
        if (o.number != null && String(o.number).trim()) known.opNum = o.number;
      }

      /* Partial KDS readiness is stored on the canonical order lines. Pull it
         back into the local ticket so bar and kitchen tablets immediately see
         each other's progress without completing the entire order. */
      /* Un rappel (« Rappeler en cuisine », ici ou sur la tablette) laisse
         `recalledAt` sur les lignes. Le seul moyen de distinguer un bon
         rappelé d'un sondage parti AVANT le rappel, qui le dirait encore
         prêt : le rappel le plus récent vu, et l'horodatage de la réponse. */
      const recalledAt = (o.lines || []).reduce((m, l) => Math.max(m, Number(l && l.recalledAt) || 0), 0);
      const recallSeen = Number(known.recallSeen) || 0;
      const recallInFlight = (Number(known.recallPendingUntil) || 0) > Date.now();
      const staleAfterRecall = recallInFlight
        || (recallSeen > 0 && recalledAt < recallSeen && (Number(o.updated_ts) || 0) < recallSeen);
      if (!staleAfterRecall) {
        (o.lines || []).forEach((line, index) => {
          if (known.items && known.items[index]) {
            known.items[index].stationReady = line.stationReady === true;
            known.items[index].stationAccepted = line.stationAccepted === true;
          }
        });
      }
      if (recalledAt > recallSeen && !recallInFlight) {
        known.recallSeen = recalledAt;
        if (o.status === 'accepted' && known.status === 'ready' && !known.pickedUp) {
          known.status = 'cooking';
          known.readyAt = null;
          try {
            toast(known.table ? `Table ${known.table} · ${ticketNo(known)} rappelée en cuisine`
                              : `${ticketNo(known)} rappelée en cuisine`);
          } catch (_) {}
          if (known.type === 'takeaway') { try { renderVrapBoard(); } catch (_) {} }
        }
      }

      /* Déjà connue : on ne suit QUE ce que le serveur peut nous apprendre de
         neuf (une autre caisse, ou le téléphone du client). L'état local de la
         cuisine · `cooking` · n'existe pas côté serveur et ne doit donc jamais
         être écrasé par ce sondage. */
      if (o.status === 'ready' && known.status !== 'ready' && !staleAfterRecall) {
        known.status = 'ready'; known.readyAt = known.readyAt || kdsNowHM();
        /* La cuisine vient de bumper depuis SA tablette. Sans un mot ici, le
           plat attendait au passe pendant que le comptoir regardait ailleurs ·
           c'est la moitié retour du relais, et elle ne sert à rien si personne
           ne l'entend. (Un « prête » déclenché depuis CETTE caisse ne repasse
           pas par ici : `known.status` est déjà à 'ready' quand le sondage
           revient, donc pas de double annonce.) */
        try {
          toast(known.table ? `Table ${known.table} · ${ticketNo(known)} prête`
                            : `${ticketNo(known)} prête`);
        } catch (_) {}
      }
      if (o.status === 'served') {
        known.pickedUp = true;
        // The immutable server milestone replaces a local handover observation
        // or a legacy load-time string, including tickets already marked served.
        known.pickedUpTs = vrapHandoverTimestamp(o.served_ts) || vrapHandoverTimestamp(known.pickedUpTs);
        known.pickedUpAt = vrapHandoverTime(known.pickedUpTs);
      }
      if (o.status === 'accepted' && known.status === 'held') {
        known.status = 'new';
        /* Une commande OrderPro à emporter existe localement en `held` pendant
           l'attente du paiement. Son passage à accepted ne recrée donc pas le
           ticket dans la branche !known : il faut lancer le papier ici. */
        printKitchenTickets(known, known.items, {
          remote: o.localKitchenAction === true ? false
            : (o.mode === 'table' && o.session && o.server ? 'connected' : true),
          sourceId: o.id, createdAt: o.updated_ts || Date.now(),
        });
      }
      if (o.paid && !known.paid) known.paid = true;
      /* Le timbre « payé » ne voyage que par UN appel non attendu (opPush dans
         settleVrapPayment) : un trou réseau à cet instant, et l'argent est au
         journal pendant que la file dit « impayé » pour toujours — le faux
         impayé, avec son risque de double encaissement. Le serveur accepte ce
         timbre en idempotent (branche `replayed`), donc on le repousse à
         chaque sondage tant que le serveur le nie : ça s'arrête tout seul dès
         qu'il l'accuse. Jamais sur une refusée — une décision humaine ne se
         rejoue pas en boucle. */
      if (known.paid && !o.paid && o.status !== 'rejected'
          && (o.status === 'pending' || o.status === 'accepted' || o.status === 'ready' || o.status === 'served')) {
        try {
          opPush(known, o.status === 'ready' ? 'ready' : (o.status === 'served' ? 'served' : 'accepted'), { paid: true });
        } catch (_) {}
      }
      if (o.server && !known.server) known.server = o.server;
    }

    /* À quel poste envoyer un plat dont on ne connaît que le nom. La commande
       vient du téléphone : elle porte le nom de la carte, pas la catégorie. On
       retrouve le plat dans la carte chargée par la caisse, et on lui applique
       LA règle commune · pas une seconde, écrite à côté.
       Le repli était « cuisson », l'identifiant d'un poste de la DÉMO : chez un
       vrai commerçant ce poste n'existe pas, et le plat partait dans un filtre
       que personne ne regarde · c'est-à-dire nulle part. La cuisine, elle,
       existe toujours. Un ticket au mauvais poste reste un ticket ; un ticket
       nulle part, non. */
    function kdsStationForName(name) {
      const n = String(name || '').toLowerCase().trim();
      try {
        const pool = (Array.isArray(menuItems) && menuItems.length) ? menuItems : (Array.isArray(menu) ? menu : []);
        const hit = pool.find(m => String(m.name || '').toLowerCase().trim() === n);
        if (hit) return kdsStationFor(hit);
      } catch (_) {}
      return kdsKitchenId();
    }

    function sameMap(a, b, eq) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a) { const o = b.get(k); if (o === undefined || !eq(v, o)) return false; }
      return true;
    }
