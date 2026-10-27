/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse · la cuisine : envoi en cuisine depuis la salle, mode écran
 * cuisine (PIN 0001), écran cuisine, bons par poste, tableau à emporter et le
 * pont qui fait d'une commande du téléphone un ticket de cette caisse.
 *
 * Sorti de caisse-app.js le 22 octobre 2026 : uniquement des déclarations de
 * fonction de premier niveau, recopiées à l'octet et dans leur ordre. Script
 * classique bloquant, chargé après caisse-floor.js et avant caisse-app.js :
 * ces fonctions sont globales comme avant, l'état (let/const) et tout ce qui
 * s'exécute au chargement restent dans caisse-app.js, où elles le lisent à
 * l'appel. Rien ici ne s'exécute au chargement.
 * ═══════════════════════════════════════════════════════════════════════════ */


    /* ═══════ LA SALLE PART EN CUISINE, ELLE AUSSI ═══════════════════════════
     * Seul « À emporter » atteignait l'écran cuisine. Une mesa validée ne
     * produisait ni ticket sur le board ni bon papier · dans un restaurant,
     * c'est-à-dire dans le cas le plus courant.
     *
     * On n'envoie que ce qui n'est PAS déjà parti (`l.sent`) : rouvrir une
     * mesa pour ajouter deux cafés doit envoyer deux cafés, pas relancer tout
     * le repas. Le drapeau vit sur la ligne, donc il survit au rechargement
     * avec le reste du service (persistShift). */
    function kitchenItemsFromLines(lines) {
      const source = Array.isArray(lines) ? lines : [];
      return source.filter(Boolean).map((l) => {
        const parent = l.kind === 'formula-part' && l.formulaUid
          ? source.find(p => p && p.kind === 'formula' && p.formulaUid === l.formulaUid)
          : null;
        const m = menuLineFind(x => x.id === l.id);
        const formulaTag = parent
          ? `[${parent.formulaName || parent.name || 'Formule'}${l.slotLabel ? ' · ' + l.slotLabel : ''}]`
          : '';
        const ownVisuals = optVisuals(l.opts);
        return {
          q: l.qty, n: l.name, p: l.price,
          note: [formulaTag, (l.note || '').trim()].filter(Boolean).join(' · '),
          paperNote: parent ? [formulaTag, kitchenNote(l)].filter(Boolean).join(' · ') : kitchenNote(l),
          visuals: ownVisuals, kind: l.kind || '',
          formulaUid: l.formulaUid || '', formulaName: l.formulaName || '', slotLabel: l.slotLabel || '',
          stations: [(l.station && kdsStations().some(s => s.id === l.station)) ? l.station : kdsStationFor(m)],
        };
      });
    }

    function relayLinesFromCaisse(lines) {
      return (Array.isArray(lines) ? lines : []).filter(Boolean).map((l) => {
        const optionChoices = (Array.isArray(l.opts) ? l.opts : []).map(o => ({
          group: o.g || o.group || '', label: o.cn || o.label || o.name || '',
        })).filter(o => o.group && o.label);
        const line = {
          id: l.id || '', uid: l.uid || '', name: l.name || '', qty: l.qty || 1,
          unitPrice: Math.max(0, +l.price || +l.unitPrice || 0),
          options: optionChoices.map(o => o.label).join(' · '), optionChoices,
          visuals: optVisuals(l.opts), note: (l.note || '').trim(),
          station: l.station || kdsStationFor(menuLineFind(x => x.id === l.id)),
        };
        ['kind', 'formulaUid', 'formulaName', 'slotLabel', 'formulaSlotId', 'lineId'].forEach(key => {
          if (l[key]) line[key] = l[key];
        });
        if (l.kind === 'formula-part') line.formulaExtra = Math.max(0, +l.formulaExtra || 0);
        return line;
      });
    }

    /* ═══════ À SUIVRE · ENVOYER LA SUITE ═══════════════════════════════════
     * Une table commande entrées et plats d'un coup. Tout partait au même
     * envoi : la cuisine lançait les tajines avec les salades, et les plats
     * attendaient vingt minutes au passe, ou le serveur gardait la commande
     * en tête et la ressaisissait plus tard.
     *
     * Un plat marqué « À suivre » reste sur l'addition sans partir. L'envoi
     * suivant le confirme (`committed` : annuler des ajouts ne l'efface plus)
     * et le bon de cuisine l'annonce en bas (« À SUIVRE »), pour que la
     * cuisine sache ce qui vient. « Envoyer la suite » le lance comme un
     * bon titré SUITE. Encaisser lance tout : un plat payé ne reste jamais
     * en attente. Une partie de formule suit sa formule. */
    function lineHeld(l, all) {
      if (!l || l.sent) return false;
      if (l.kind === 'formula-part' && l.formulaUid) {
        const parent = (all || []).find(p => p && p.kind === 'formula' && p.formulaUid === l.formulaUid);
        return !!(parent && parent.hold);
      }
      return !!l.hold;
    }
    function tableHeldQty(tableId) {
      const all = tableOrders[tableId] || [];
      return all.filter(l => l && l.qty > 0 && l.kind !== 'formula-part' && lineHeld(l, all)).reduce((s, l) => s + l.qty, 0);
    }
    function tableFreshQty(tableId) {
      const all = tableOrders[tableId] || [];
      return all.filter(l => l && l.qty > 0 && !l.sent && !l.orderProPending && !lineHeld(l, all)).reduce((s, l) => s + l.qty, 0);
    }
    /* Rien de neuf à envoyer, mais une suite qui attend : le bouton d'envoi
       de l'addition devient « Envoyer la suite ». */
    function tableSuiteOnly(tableId) {
      return tableFreshQty(tableId) === 0 && tableHeldQty(tableId) > 0
        && !(tableOrders[tableId] || []).some(l => l && l.orderProPending);
    }
    function toggleLineHold(tableId, uid) {
      const line = (tableOrders[tableId] || []).find(l => l && l.uid === uid);
      if (!line || line.sent || line.kind === 'formula-part') return;
      if (line.hold) currentOrder().patchLine(line, {}, ["hold"]);
      else currentOrder().patchLine(line, { ["hold"]: true });
      renderOrderPanel(tableId);
      try { persistShift(); } catch (_) {}
    }

    function sendTableToKitchen(tableId, opts) {
      const fire = !!(opts && opts.fire);
      const all = tableOrders[tableId] || [];
      /* Ce qui reste « à suivre » après cet envoi est confirmé : il fait
         désormais partie du repas, plus d'un ajout qu'on peut annuler. */
      if (!fire) all.forEach((l) => { if (l && lineHeld(l, all)) currentOrder().patchLine(l, { ["committed"]: true }); });
      /* Les lignes OrderPro pending ont leur propre identifiant canonique et
         doivent être acceptées comme leur commande d'origine, pas fusionnées
         dans un nouveau bon caisse. */
      const lines = all.filter(l => l && l.qty > 0 && !l.sent && !l.orderProPending && (fire || !lineHeld(l, all)));
      if (!lines.length) return null;
      const firing = fire && lines.some(l => lineHeld(l, all));
      const following = fire ? [] : all.filter(l => l && l.qty > 0 && lineHeld(l, all));
      const items = kitchenItemsFromLines(lines);
      const order = {
        num: ++kdsOrderSeq, type: 'dineIn', table: tableId, code: null, status: 'new',
        // Qui suit cette table. Le bon sortait avec le numéro et rien d'autre,
        // ce qui obligeait à demander « c'est pour qui, la 7 ? » à voix haute.
        server: serverNameFor(tableId),
        readyAt: null, items: items, relayLines: relayLinesFromCaisse(lines), sentAt: new Date(),
        paid: false, pickedUp: false, pickedUpAt: null,
        total: lines.reduce((s, l) => s + l.price * l.qty, 0),
      };
      if (firing) order.course = 'suite';
      if (following.length) order.following = kitchenItemsFromLines(following);
      /* La suite est partie : l'annonce « à suivre » des bons précédents de
         cette table n'a plus rien à annoncer. */
      if (firing) kdsOrders.forEach((o) => { if (o && o.following && String(o.table) === String(tableId)) delete o.following; });
      kdsOrders.push(order);
      if (tables[tableId] && !tables[tableId].orderNo) tableSettlement().project(tables[tableId], { orderNo: ticketNo(order) });
      lines.forEach((l) => { currentOrder().patchLine(l, { ["sent"]: true }); currentOrder().patchLine(l, {}, ["hold"]); currentOrder().patchLine(l, {}, ["committed"]); });
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      /* Le relais donne immédiatement au bon son identifiant canonique. La file
         papier l'utilise ensuite comme clé d'idempotence : l'écho du serveur ou
         un rechargement ne peut donc pas réimprimer le même plat. */
      /* The queue owns the permanent customer-facing number. Wait for that
         allocation before freezing the paper document, otherwise the caisse
         can show local #64 while the server echo (and later reprints) use #3. */
      order.canonicalNumberPromise = relayToKitchen(order);
      order.canonicalNumberPromise.then(() => printKitchenTickets(order, items));
      try { persistShift(); } catch (_) {}
      return order;
    }

    /* ═══════ LE BON QUITTE L'APPAREIL ═══════════════════════════════════════
     * Tout ce qui précède se passait dans CETTE page et nulle part ailleurs :
     * `kdsOrders` est un tableau JavaScript, `printKitchenTickets` parle à une
     * imprimante branchée sur ce comptoir. Une tablette posée en cuisine ne
     * recevait donc rien de ce qu'un serveur venait de saisir · et sans
     * imprimante thermique, la cuisine n'avait aucun chemin du tout.
     *
     * On pose donc le bon sur le serveur. Deux détails qui comptent :
     *  · le poste voyage AVEC la ligne (`station`). La cuisine ne relit pas la
     *    carte : le bon porte sa propre vérité, figée à l'instant de l'envoi,
     *    comme le ticket papier. Un plat renommé au bureau ne redirige pas un
     *    bon déjà parti.
     *  · on inscrit le bon dans `opTickets` sous l'identifiant qu'on vient de
     *    minter. Sans ça, le sondage de la file le retrouverait six secondes
     *    plus tard, ne le reconnaîtrait pas, et en ferait un SECOND ticket sur
     *    l'écran cuisine de la caisse · le même plat, deux fois.
     * Injoignable (pas de backend, pas de réseau, magasin non appairé) : on ne
     * fait rien de plus, la caisse se comporte exactement comme avant et la
     * file de secours du relais réessaiera toute seule. */
    /* Un relais refusé ne doit pas être un silence. Le seul refus qu'un
       caissier puisse corriger lui-même est le bon trop long : au-delà de
       MAX_LINES le serveur refuse le bon ENTIER — il le tronquait sans le dire
       (#0064), et l'écran cuisine distant ne voyait que les soixante premiers
       plats. Le ticket papier local, lui, est déjà sorti complet : la commande
       n'est pas perdue, il reste à la renvoyer en deux fois pour que la cuisine
       distante la voie en entier. */
    function tooLongForKitchen(r) {
      toast('Bon trop long pour la cuisine · ' + (r.sent || '') + ' articles, maximum '
        + (r.max || 60) + ' · envoie-le en deux fois', 'danger');
    }
    function relayToKitchen(order) {
      try {
        if (!order || !window.KiwiKitchenRelay || !KiwiKitchenRelay.merchant()) return Promise.resolve(null);
        const id = KiwiKitchenRelay.newId();
        order.opId = id;
        opTickets.set(id, order);
        return KiwiKitchenRelay.send({
          id: id,
          mode: order.type === 'dineIn' ? 'table' : 'takeout',
          table: order.table || '',
          settledSessions: order.type === 'dineIn' ? settledVisitsFor(order.table) : undefined,
          server: order.server || '',
          course: order.course === 'suite' ? 'suite' : undefined,
          following: Array.isArray(order.following)
            ? order.following.map(i => ({ name: i.n, qty: i.q })) : undefined,
          lines: (order.relayLines || (order.items || []).map(i => ({
            /* Le relais doit porter la phrase d'options, pas seulement les
               emojis. Une tablette KDS distante doit encore lire « Tomates ·
               Oignons » si le patron n'a pas associé de repère à ces choix. */
            name: i.n, qty: i.q, unitPrice: i.p || 0, note: i.paperNote || i.note || '', visuals: i.visuals || [],
            station: (i.stations && i.stations[0]) || '',
          }))),
        }).then((r) => {
          /* #0064 · voir tooLongForKitchen. */
          if (r && r.error === 'too-many-lines') tooLongForKitchen(r);
          // #0163 · queue only in memory (disk full): a reload would lose it.
          if (r && r.full) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Cuisine injoignable et file pleine · annoncez ce bon à la cuisine'), 'danger');
          else if (r && r.queued === false) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Bon en attente du réseau · ne rechargez pas la caisse'), 'danger');
          /* Le numéro du serveur devient le numéro affiché. C'est le SEUL que
             les deux écrans puissent connaître : la cuisine ne voit pas le
             compteur local de ce comptoir. Sans ça, un cuisinier annonçant
             « bon 7 prêt » aurait désigné un autre bon que celui que le
             caissier a sous les yeux. */
          if (!(r && r.ok && r.number != null)) {
            /* Pas de numéro canonique : la commande est partie en file de
               secours (ou pas du tout). Ce qu'on imprime doit le DIRE. */
            order.provisionalNumber = true;
            if (order.table && tables[order.table] && !tables[order.table].orderNo) {
              tableSettlement().project(tables[order.table], { orderNo: ticketNo(order) });
            }
          }
          if (r && r.ok && r.number != null) {
            order.opNum = r.number;
            order.provisionalNumber = false;
            if (order.table && r.session && tables[order.table]) {
              order.session = String(r.session);
              tableSettlement().project(tables[order.table], { timerSession: order.session });
            }
            /* A fresh counter takeaway can be paid while this request is in
               flight. Its customer receipt was already snapshotted with the
               temporary local counter; replace that frozen reference as soon
               as the permanent number lands. */
            reconcileReceiptOrderNumber(order);
            if (order.table && tables[order.table]
                && (String(tables[order.table].orderNo) === String(order.num)
                  || String(tables[order.table].orderNo) === 'L' + String(order.num))) {
              tableSettlement().project(tables[order.table], { orderNo: ticketNo(order) });
              try { persistShift(); } catch (_) {}
            }
            updateKdsCount();
            if (kdsEl.classList.contains('is-open')) kdsPaint();
            if (mode === 'vrap' && vrapView === 'board') renderVrapBoard();
            try { persistShift(); } catch (_) {}
          }
          return r || null;
        });
      } catch (_) { return Promise.resolve(null); }
    }
