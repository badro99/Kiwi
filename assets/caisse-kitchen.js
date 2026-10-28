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

    /* ═══════ REVENIR À LA SALLE · LA SORTIE QUI N'EXISTAIT PAS ══════════════
     * `mode` et `selectedId` sont les deux moitiés d'un même état, et rien ne
     * les obligeait à bouger ensemble. La croix du panneau appelait
     * closeRightPanel(), qui efface `selectedId` et laisse `mode` à 'order' :
     * un seul appui, et la caisse n'était plus utilisable du tout.
     *   · les pastilles Salle / À emporter répondaient « valide ou annule
     *     d'abord » · mais il n'y avait plus rien à valider ni à annuler ;
     *   · « Envoyer en cuisine » et « Annuler commande » partaient avec le
     *     panneau masqué, et de toute façon les deux commençaient par
     *     `if (!selectedId) return` : ils ne faisaient rien, sans un mot ;
     *   · on pouvait continuer à taper des plats et voir le total monter · ils
     *     tombaient dans le panier « à emporter » (voir la ligne `const list =`
     *     du gestionnaire de notes) · puis appuyer sur « Envoyer en cuisine »
     *     sans que rien ne parte nulle part.
     * Seul un rechargement de la page en sortait. C'est le « on ne peut pas
     * revenir en arrière, plus aucun bouton ne marche » remonté du comptoir.
     *
     * D'où cette fonction : tout retour à la salle passe par elle, et elle
     * n'exige PAS de table. C'est précisément quand la table a disparu qu'il
     * faut pouvoir sortir.
     *
     * `keepId` · la mesa reste ouverte et sélectionnée, son addition à l'écran.
     * C'est le retour d'un ENVOI ou d'un ajout annulé : le serveur n'a pas
     * fermé la table, il vient d'en finir avec le menu. Sans argument, la
     * salle revient à vide (annulation, table disparue). */
    function backToSalle(keepId) {
      if (selectedId) setCaisseTableLock(selectedId, 'release');
      const vrapTitle = $('.main-head[data-mode-section="vrap"] .main-title');
      if (vrapTitle) vrapTitle.innerHTML = 'À emporter<em>· vente au comptoir</em>';
      mode = 'salle';
      document.body.dataset.mode = 'salle';
      $$('.mode-pill').forEach(p =>
        p.setAttribute('aria-pressed', p.dataset.mode === 'salle' ? 'true' : 'false'));
      $$('[data-mode-section]').forEach(el => {
        const m = el.dataset.modeSection;
        el.hidden = m !== 'salle';
        el.classList.toggle('is-active', m === 'salle');
      });
      const cancelLabel = $('[data-cancel-label]');
      if (cancelLabel) cancelLabel.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Annuler la table');
      showPayButtons(false);
      if (keepId && tables[keepId]) {
        selectedId = keepId;
        markSelectedTable(keepId);
        renderRightPanel(keepId);
        $('#rp-empty').hidden = true;
        $('#rp-empty').style.display = 'none';
        $('#rp-active').hidden = false;
        $('#rp-active').style.display = 'flex';
      } else {
        showEmpty();
      }
      lucide.createIcons();
    }

    /* Combien de plats sont saisis mais PAS ENCORE PARTIS sur la mesa en cours.
       Sert à distinguer une sortie GRATUITE (le client n'était pas prêt à
       commander, rien n'est tapé) d'une sortie COÛTEUSE (le serveur a déjà pris
       la commande). La première doit être immédiate ; la seconde ne doit jamais
       partir sur un doigt distrait.
       Ce sont bien les lignes NON ENVOYÉES qui comptent : sur une mesa rouverte
       pour un dessert, les quatre plats déjà en cuisine ne risquent rien · les
       compter aurait re-fermé la sortie qu'on vient d'ouvrir. */
    function orderInProgressCount() {
      if (mode !== 'order' || !selectedId) return 0;
      return (tableOrders[selectedId] || []).reduce((s, l) => s + ((l.sent || l.committed) ? 0 : l.qty), 0);
    }

    /* Cette mesa a-t-elle déjà de la matière en cuisine ? C'est ce qui sépare
       « annuler la mesa » (rien n'est parti, la table redevient libre) de
       « annuler mes ajouts » (le repas est en cours, on ne touche pas à ce qui
       cuit). Le même bouton, deux gestes · et confondre les deux effacerait le
       repas d'une table qui mange. */
    function tableSentCount(id) {
      return (tableOrders[id] || []).reduce((s, l) => s + (l.sent ? l.qty : 0), 0);
    }

    function canonicalOrdersForTable(id) {
      const found = new Map();
      const add = (order) => {
        if (!order || order.paid || order.status === 'rejected') return;
        if (tableKey(caisseTableId(order.table) || order.table) !== tableKey(id)) return;
        const orderId = String(order.opId || order.id || '').trim();
        if (orderId) found.set(orderId, order);
      };
      try { Object.values(window.KiwiOrderInbox?.orders?.() || {}).forEach(add); } catch (_) {}
      try { opTickets.forEach(add); } catch (_) {}
      try { kdsOrders.forEach(add); } catch (_) {}
      return Array.from(found.entries()).map(([id, order]) => ({ id, order }));
    }

    /* Annuler une table est une écriture serveur sans file d'attente dès qu'elle
       a une visite côté serveur OU un seul ticket envoyé : c'est la condition
       même où cancelSentTable publie l'annulation, ou refuse « visite en cours
       de synchronisation ». Une table sans rien d'envoyé s'annule en local. */
    function tableCancelNeedsServer(id) {
      return !!(phoneSessionOf(id) || String(tables[id]?.timerSession || '')
        || tableSentCount(id) > 0 || canonicalOrdersForTable(id).length
        || kdsOrders.some(order => order && order.type === 'dineIn'
          && String(order.table) === String(id) && !order.paid && order.status !== 'rejected'));
    }

    async function cancelSentTable(id, who) {
      /* A whole-table cancellation is a terminal kitchen event, not a local
         reset. Wait for any in-flight relay, reject every unpaid canonical
         ticket with the operator proof, and only then release the table. */
      const localTickets = kdsOrders.filter(order => order && order.type === 'dineIn'
        && String(order.table) === String(id) && !order.paid && order.status !== 'rejected');
      let expectedSession = phoneSessionOf(id) || String(tables[id]?.timerSession || '');
      if (!expectedSession && localTickets.length) {
        await Promise.race([
          Promise.all(localTickets.map(order => Promise.resolve(order.canonicalNumberPromise).catch(() => null))),
          new Promise(resolve => setTimeout(resolve, 8000)),
        ]);
        expectedSession = phoneSessionOf(id) || String(tables[id]?.timerSession || '');
      }
      if (!expectedSession) {
        if (localTickets.length || tableSentCount(id) > 0 || canonicalOrdersForTable(id).length) {
          throw new Error('visite en cours de synchronisation · réessayez');
        }
        cancelOpenTable(id, who);
        return;
      }
      await postCaisseCancellation({ merchant: currentMerchantSlug(),
        cancelTable: { table: id, expectedSession }, actorProof: (who && who.actorProof) || '' });
      canonicalOrdersForTable(id).forEach(entry => {
        entry.order.status = 'rejected'; entry.order.paid = false;
        const kitchenTicket = kdsOrders.find(order => order && String(order.opId || '') === entry.id);
        if (kitchenTicket) retireRejectedKitchenTicket(kitchenTicket);
        opTickets.delete(entry.id);
      });
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      currentOrder().removeTable(id);
      delete orders[id];
      tableSplits.delete(id);
      const t = tables[id];
      if (t) {
        tableSettlement().project(t, { status: 'khawya' }); tableSettlement().project(t, { covers: 0 }); resetTableTimer(t);
        tableSettlement().project(t, {}, ['orderNo']); tableSettlement().project(t, {}, ['server']); tableSettlement().project(t, {}, ['discount']);
      }
      releasePhoneTable(id, 'cancelled', true, (who && who.actorProof) || '', true);
      try { persistShift(); publishServiceFloor(); } catch (_) {}
      refreshTableNode(id);
      if (selectedId === id) selectedId = null;
      backToSalle();
      toast(`Table ${id} annulée · cuisine prévenue · table libérée`);
    }

    /* Cancel an open table from Salle without touching a kitchen order. Salle
       has no unsent-order editor, but it can still own an OrderPro phone
       session that must be closed. */
    function cancelOpenTable(id, who = null) {
      if (!id || tableSentCount(id) > 0) return false;
      if (!who) { window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: id } }); requireTillOperator(`Annuler la table ${id}`, actor => cancelOpenTable(id, actor)); return false; }
      currentOrder().removeTable(id);
      tableSplits.delete(id);
      const t = tables[id];
      if (t) {
        tableSettlement().project(t, { status: 'khawya' });
        tableSettlement().project(t, { covers: 0 });
        resetTableTimer(t);
        tableSettlement().project(t, {}, ['discount']);
        tableSettlement().project(t, {}, ['orderNo']);
      }
      /* Force the event when this caisse missed the local phone-seat badge.
         orderpro-inbox.js safely falls back to closing by table number. */
      releasePhoneTable(id, 'caisse', true, who.actorProof || '');
      try { persistShift(); publishServiceFloor(); } catch (_) {}
      refreshTableNode(id);
      if (selectedId === id) selectedId = null;
      backToSalle();
      toast(`Table ${id} annulée · table remise à zéro`);
      return true;
    }

    /* ---- cancel new order ---- */
    function cancelNewOrder(who = null) {
      /* ── UNE MESA QUI MANGE DÉJÀ ────────────────────────────────────────────
         Le serveur a rouvert la table pour un dessert, puis se ravise. Ce qui
         s'annule, ce sont SES ajouts · pas le repas en cours. Vider
         `tableOrders` ici et rendre la table « khawya » effacerait une addition
         de quatre couverts au motif qu'on a hésité sur un thé. */
      if (selectedId && (tableSentCount(selectedId) > 0 || (tableOrders[selectedId] || []).some(l => l && l.committed))) {
        const id = selectedId;
        const dropped = (tableOrders[id] || []).reduce((s, l) => s + ((l.sent || l.committed) ? 0 : l.qty), 0);
        currentOrder().replaceTable(id, (tableOrders[id] || []).filter(l => l.sent || l.committed));
        renderMenu();
        backToSalle(id);
        toast(dropped > 0
          ? `Ajouts annulés · la table ${id} reste ouverte`
          : `Table ${id}`);
        return;
      }
      /* Pas de table sous la main ? On sort quand même. Refuser ici était le
         cœur du blocage : la dernière issue ne faisait rien. */
      if (selectedId) {
        if (!who || !who.name) {
          const target = selectedId;
          window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: target } });
          requireTillOperator(`Annuler la table ${target}`, actor => { if (selectedId === target) cancelNewOrder(actor); });
          return;
        }
        currentOrder().removeTable(selectedId);
        const t = tables[selectedId];
        /* La table peut avoir disparu sous nos pieds · setupRealSalle() efface
           et reconstruit `tables` dès que le patron touche son plan depuis son
           téléphone. Ce n'est pas une raison pour rester coincé. */
        if (t) { tableSettlement().project(t, { status: 'khawya' }); resetTableTimer(t); tableSettlement().project(t, {}, ['discount']); }
        /* La table est rendue sans encaissement. Sans ça, le téléphone resterait
           « assis » à une table redevenue libre et pourrait continuer à commander
           · le trou exact que la session existe pour boucher. */
        releasePhoneTable(selectedId, 'caisse', true, who.actorProof || '');
        // Restore original covers (2 by default if we changed it)
        refreshTableNode(selectedId);
        selectedId = null;
      }
      backToSalle();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Commande annulée · table remise à zéro'));
    }

    /* ═══════ ROUVRIR LA COMMANDE D'UNE MESA INSTALLÉE ═══════════════════════
     * Un repas ne se commande pas d'un bloc. Quelqu'un arrive en retard, la
     * table demande un dessert, un deuxième thé, une bouteille d'eau · et la
     * caisse n'avait aucun chemin pour ça : une fois la mesa validée, cliquer
     * dessus n'ouvrait plus que l'addition et ses moyens de paiement. Le seul
     * contournement était d'annuler la mesa (donc son repas) et de tout
     * ressaisir, ou d'ouvrir « À emporter » · ce qui décroche l'article de la
     * table et fausse l'addition. Deux mauvaises réponses à une question qui
     * revient à chaque service.
     *
     * On retourne donc dans le MÊME mode commande, sur la MÊME liste. Ce qui
     * est déjà parti garde son drapeau `sent` : la cuisine ne recevra que les
     * nouveaux plats (sendTableToKitchen filtre là-dessus depuis toujours), et
     * l'addition, elle, porte les deux. */
    function resumeTableOrder(id) {
      if (!id) return;
      const t = tables[id];
      /* La table a disparu du plan pendant le service · le patron l'a retirée
         depuis son téléphone. On ne relance pas une commande sur un fantôme. */
      if (!t) { backToSalle(); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Cette table n\'existe plus sur le plan')); return; }
      if (t.status === 'khlass') { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Table déjà encaissée')); return; }
      if (!tableOrders[id]) currentOrder().replaceTable(id, []);
      selectedId = id;
      markSelectedTable(id);
      currentOrder().replaceCart([]);
      setMode('order');
      const n = tableSentCount(id);
      if (n > 0) toast(`Table ${id} · ${n} article${n > 1 ? 's' : ''} déjà en cuisine`);
    }

    /* ===========================================================
       KITCHEN-DISPLAY MODE (PIN 0001)
       -----------------------------------------------------------
       This terminal can also serve as the kitchen display · a wall
       screen for the cooks to glance at. There is no user; the
       0001 code unlocks the terminal STRAIGHT INTO the KDS, the
       cashier shell stays hidden, and the close button becomes
       "Verrouiller" to send the terminal back to its PIN screen.
       (0000 → pressing mode, see assets/pressing-caisse.js.)
       =========================================================== */
    function unlockKitchenScreen() {
      // Identical dot success animation to unlockApp().
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });

      // t=460: PIN fades out, body flips into kitchen-display mode.
      setTimeout(() => {
        pinScreen.classList.add('is-leaving');
        document.body.classList.add('is-kitchen', 'is-unlocked');
      }, 460);

      // t=940: PIN gone, kitchen entry sequence starts.
      setTimeout(() => {
        pinScreen.style.display = 'none';
        runKitchenEntrySequence();
      }, 940);
    }

    /* Kitchen-display intro flash → KDS open. No person addressed ·
       the screen just announces itself as the kitchen station. */
    function runKitchenEntrySequence() {
      const greetEl  = document.querySelector('[data-kiwi-greet]');
      const line1El  = document.getElementById('greet-line1');
      const emEl     = document.getElementById('greet-em');
      const subEl    = document.getElementById('greet-sub');
      if (line1El) line1El.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('L-cuisine,');
      if (emEl)    emEl.textContent    = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('service bda.');
      if (subEl)   subEl.innerHTML     = `${escTeam(storeName())} <em>·</em> file de préparation`;

      // Wrap <em> in .em-clip and measure natural width (same as cashier path).
      let emClip = null;
      if (greetEl) {
        const greetH1 = greetEl.querySelector('h1');
        const greetEm = greetH1 && greetH1.querySelector('em');
        if (greetEm && !greetEm.parentNode.classList.contains('em-clip')) {
          const naturalW = Math.ceil(greetEm.getBoundingClientRect().width) + 6;
          emClip = document.createElement('span');
          emClip.className = 'em-clip';
          emClip.style.setProperty('--em-w', naturalW + 'px');
          greetEm.parentNode.insertBefore(emClip, greetEm);
          emClip.appendChild(greetEm);
        }
      }

      // t=0: greeting fades in.
      if (greetEl) {
        greetEl.classList.add('is-visible');
        greetEl.setAttribute('aria-hidden', 'false');
      }
      // t=700: typewriter starts
      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 700);
      // t=1700: caret drops
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 1700);

      // t=2400: greeting fades, KDS opens underneath. Close-btn becomes
      // "Verrouiller" · the kitchen mode exit signals "lock this station".
      setTimeout(() => {
        if (greetEl) {
          greetEl.classList.remove('is-visible');
          greetEl.setAttribute('aria-hidden', 'true');
        }
        openKds();
        const labelEl = document.getElementById('kds-close-label');
        if (labelEl) labelEl.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Verrouiller');
      }, 2400);

      // t=3200: greeting element removed.
      setTimeout(() => { if (greetEl && greetEl.parentNode) greetEl.remove(); }, 3200);
    }

    /* Kitchen "Verrouiller" · lock the station back to the PIN screen. */
    function lockoutKitchen() {
      closeKds();
      document.body.classList.remove('is-kitchen', 'is-unlocked');
      const labelEl = document.getElementById('kds-close-label');
      if (labelEl) labelEl.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer');
      window.__kiwiPinReset();
    }
    function kdsStations() {
      if (IS_DEMO) return KDS_STATIONS_DEMO;
      return carteState.stations.length ? carteState.stations : [KDS_STATION_SOLO];
    }

    /* La cuisine · le poste qui reçoit tout ce qu'aucune catégorie n'a envoyé
       ailleurs. Elle est nommée dans la carte (kitchenId) plutôt que déduite de
       l'ordre de la liste : un patron qui réordonne ses onglets ne doit pas
       détourner sa carte sans le savoir. Le premier poste reste le secours,
       pour une carte écrite avant que ce réglage existe. */
    function kdsKitchenId() {
      const list = kdsStations();
      if (!IS_DEMO) {
        const want = carteState.kitchenId;
        if (want && list.some(s => s.id === want)) return want;
      }
      return list[0].id;
    }
    /* Où part CE plat. Une seule réponse pour toute la caisse : le poste de sa
       catégorie s'il existe encore, la table par catégorie en démo, la cuisine
       sinon. Un plat n'atterrit jamais dans un filtre fantôme. */
    function kdsStationFor(m) {
      const list = kdsStations();
      const want = m && m.station;
      if (want && list.some(s => s.id === want || String(s.name).toLowerCase().trim() === String(want).toLowerCase().trim())) {
        const found = list.find(s => s.id === want || String(s.name).toLowerCase().trim() === String(want).toLowerCase().trim());
        return found ? found.id : want;
      }
      if (m && m.cat && carteState.cats) {
        const catObj = carteState.cats.find(c => c.id === m.cat || String(c.name).toLowerCase().trim() === String(m.cat).toLowerCase().trim());
        if (catObj && catObj.station) {
          const found = list.find(s => s.id === catObj.station || String(s.name).toLowerCase().trim() === String(catObj.station).toLowerCase().trim());
          if (found) return found.id;
        }
      }
      if (IS_DEMO && m && KDS_CAT_STATION[m.cat]) return KDS_CAT_STATION[m.cat];
      return kdsKitchenId();
    }
    /* Le patron a supprimé ou renommé un poste : refaire la barre, et rendre la
       vue « Toutes » si le filtre actif pointait vers un poste disparu · sinon
       l'écran cuisine resterait vide sans dire pourquoi. */
    function kdsRepaintStations() {
      if (kdsActiveStation !== 'all' && !kdsStations().some(s => s.id === kdsActiveStation)) kdsActiveStation = 'all';
      const bar = $('#kit-bar');
      if (bar) bar.innerHTML = kdsStationBar();
    }

    function kdsHasRecipe(name) {
      const r = KDS_RECIPES[name];
      return !!(r && r.ingredients && r.ingredients.length);
    }
    function isDemoSeedOrder(o) {
      if (!o) return false;
      if (o.demoSeed) return true;
      if (o.opId) return false;
      const s = KDS_DEMO_SEED.find(x => x.num === o.num);
      if (!s || !Array.isArray(o.items)) return false;
      return o.items.map(i => i && i.n).join('|') === s.items.map(i => i.n).join('|');
    }

    function kdsSeed() {
      // A REAL / paired store opens with an EMPTY order board · no demo orders
      // (Méchoui, Pastilla poulet, Thé à la menthe…). They arrive from real sales.
      if (storeIsReal()) return;
      KDS_DEMO_SEED.forEach(s => kdsOrders.push({
        demoSeed: true, num: s.num, type: s.type, table: s.table || null, code: s.code || null,
        status: s.status, readyAt: s.readyAt || null,
        items: s.items.map(i => Object.assign({}, i, { stations: i.stations.slice() })),
        sentAt: new Date(Date.now() - s.ago * 1000),
        paid: !!s.paid, pickedUp: !!s.pickedUp, pickedUpAt: s.pickedUpAt || null, total: s.total || 0,
      }));
    }

    function kdsEsc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function kdsElapsed(o) { return Math.max(0, Math.floor((Date.now() - o.sentAt.getTime()) / 1000)); }
    function kdsUrgency(s) { return s < 480 ? 'ok' : s < 900 ? 'warn' : 'over'; }
    function kdsFmt(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    function kdsNowHM() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
    function kdsEnsureFormulaParents(o) {
      if (!o || !Array.isArray(o.items)) return [];
      const missing = new Map();
      o.items.forEach((item) => {
        if (!item || item.kind !== 'formula-part' || !item.formulaUid) return;
        if (o.items.some(parent => parent && parent.kind === 'formula' && parent.formulaUid === item.formulaUid)) return;
        if (!missing.has(item.formulaUid)) missing.set(item.formulaUid, item);
      });
      missing.forEach((child, formulaUid) => {
        const name = child.formulaName || '';
        const menuItem = menuLineFind(item => String(item.name || '') === String(name));
        if (!name) return;
        const inheritedVisuals = Array.isArray(child.visuals) ? child.visuals.slice() : [];
        o.items.unshift({
          q: child.q || 1, n: name, p: menuItem ? menuItem.price : 0,
          note: '', paperNote: '', visuals: inheritedVisuals,
          kind: 'formula', formulaUid, formulaName: name,
          stations: [kdsStationFor(menuItem)],
        });
        if (inheritedVisuals.length) {
          o.items.forEach((part) => {
            if (part && part.kind === 'formula-part' && part.formulaUid === formulaUid) part.visuals = [];
          });
        }
      });
      return o.items;
    }
    function kdsMatches(o, sid) { return sid === 'all' || kdsEnsureFormulaParents(o).some(i => i.stations.includes(sid)); }
    function kdsViewStatus(o, sid) {
      if (o.status === 'ready') return 'ready';
      const allItems = kdsEnsureFormulaParents(o);
      const lines = sid === 'all' ? allItems : allItems.filter(i => i.stations.includes(sid));
      if (!lines.length) return o.status;
      if (sid !== 'all' && lines.every(i => i.stationReady === true)) return 'ready';
      if (lines.every(i => i.stationAccepted === true)) return 'cooking';
      return o.status === 'cooking' && sid === 'all' ? 'cooking' : 'new';
    }
    function kdsGroup(status) {
      return kdsOrders.filter(o => kdsViewStatus(o, kdsActiveStation) === status && kdsMatches(o, kdsActiveStation))
        .slice().sort((a, b) => kdsElapsed(b) - kdsElapsed(a));
    }

    function kdsTypeChip(o) {
      if (o.type === 'glovo')    return `<span class="kit-type glovo">Glovo · ${kdsEsc(o.code)}</span>`;
      if (o.type === 'yassir')   return `<span class="kit-type yassir">Yassir · ${kdsEsc(o.code)}</span>`;
      if (o.type === 'takeaway') return `<span class="kit-type takeaway">À emporter</span>`;
      /* Le serveur de la table, sur le ticket. La brigade avait la table mais
         jamais le nom, donc « c'est pour qui, la 7 ? » se criait à travers la
         cuisine à chaque service. L'affectation existe sur le plan de salle
         (tables[id].server) ; elle est posée sur la commande au moment où elle
         est acceptée, pour qu'elle reste vraie même si la table change de main
         ensuite. */
      const sv = o.server ? ` <span class="kit-server">· ${kdsEsc(o.server)}</span>` : '';
      return `<span class="kit-type dineIn">Table ${kdsEsc(o.table)}${o.course === 'suite' ? ' · Suite' : ''}${sv}</span>`;
    }

    function kdsOrderInner(o, withEye) {
      kdsEnsureFormulaParents(o);
      const el = kdsElapsed(o), u = kdsUrgency(el);
      const viewStatus = kdsViewStatus(o, kdsActiveStation);
      const isNew = viewStatus === 'new', isReady = viewStatus === 'ready';
      const items = o.items.map(i => {
        const off = kdsActiveStation !== 'all' && !i.stations.includes(kdsActiveStation);
        const note = (i.note || '').trim();
        const visuals = (Array.isArray(i.visuals) ? i.visuals : []).filter(v => v && (v.name || v.label || v.cn)).map(v => ({
          emoji: v.emoji || v.e || '',
          name: v.name || v.label || v.cn,
        }));
        const visualHtml = visuals.length ? `<span class="kit-visuals">${visuals.map(v => `<span class="kit-visual">${v.emoji ? `<span class="kit-visual-emoji">${kdsEsc(v.emoji)}</span>` : ''}<span>${kdsEsc(v.name)}</span></span>`).join('')}</span>` : '';
        const hasRec = kdsHasRecipe(i.n);
        return `<li class="kit-item${off ? ' kit-item-off' : ''}${hasRec ? ' has-recipe' : ''}"${hasRec ? ` data-kit-recipe="${kdsEsc(i.n)}"` : ''}><span class="kit-q">${i.q}</span><span class="kit-nm">${kdsEsc(i.n)}${visualHtml}${note ? `<span class="kit-inote">${KDS_SVG.note}<span>${kdsEsc(note)}</span></span>` : ''}</span>${hasRec ? KDS_SVG.book : ''}</li>`;
      }).join('');
      /* Un bon prêt se rappelle depuis la vue agrandie (l'historique y mène) :
         « Prête » tapé par erreur au coup de feu ne doit pas faire disparaître
         un plat qui n'est pas fait. Pas sur une carte de colonne, et jamais
         sur une commande déjà remise au client. */
      const act = isReady ? (withEye || o.pickedUp ? ''
          : `<button class="kit-act kit-act-recall" data-kit-recall="${o.num}">Rappeler en cuisine</button>`)
        : isNew ? `<button class="kit-act kit-act-accept" data-kit-accept="${o.num}">Accepter</button>`
        : `<button class="kit-act kit-act-ready" data-kit-ready="${o.num}">${KDS_SVG.check}Prête</button>`;
      const eye = withEye ? `<button class="kit-eye" data-kit-eye="${o.num}" aria-label="Agrandir #${o.num}">${KDS_SVG.eye}</button>` : '';
      const topRight = isReady
        ? `<span class="kit-served-at">${KDS_SVG.check}${kdsEsc(o.readyAt || '')}</span>`
        : `<span class="kit-timer ${u}">${KDS_SVG.clock}<span class="kit-timer-v">${kdsFmt(el)}</span></span>`;
      return `
        <div class="kit-order-top">
          <span class="kit-order-num">${ticketNo(o)}</span>
          <div class="kit-order-tr">${topRight}${eye}</div>
        </div>
        <div class="kit-order-meta">
          ${kdsTypeChip(o)}
          <span class="kit-status">${isReady ? (o.pickedUp ? 'Servie' : 'Prête') : isNew ? 'Nouvelle' : 'En préparation'}</span>
        </div>
        <ul class="kit-items">${items}</ul>
        ${Array.isArray(o.following) && o.following.length && !isReady ? `<div class="kit-following">À suivre · ${o.following.map(i => `${i.q}× ${kdsEsc(i.n)}`).join(', ')}</div>` : ''}
        ${act}`;
    }

    function kdsOrderCard(o) {
      const u = kdsUrgency(kdsElapsed(o));
      return `<div class="kit-order ${kdsViewStatus(o, kdsActiveStation) === 'new' ? 'is-new' : 'is-cooking'}${u === 'over' ? ' is-late' : ''}" data-kit-num="${o.num}">${kdsOrderInner(o, true)}</div>`;
    }

    function kdsHistoryRow(o) {
      /* `ticketNo(o)`, et non `#${o.num}` : l'historique était le seul endroit
         qui affichait encore le compteur LOCAL. Une commande qui porte un
         numéro serveur · celles du téléphone, et depuis le relais cuisine
         toutes les autres · s'y retrouvait donc sous un numéro que personne
         d'autre ne connaît, alors que la carte juste au-dessus, l'écran de la
         cuisine et le client en annonçaient un troisième. */
      return `<button class="kit-hrow" data-kit-eye="${o.num}" aria-label="Agrandir ${ticketNo(o)}">
        <span class="kit-hrow-num">${ticketNo(o)}</span>
        ${kdsTypeChip(o)}
        <span class="kit-hrow-time">${KDS_SVG.check}Prête ${kdsEsc(o.readyAt || '')}</span>
        <span class="kit-hrow-eye">${KDS_SVG.eye}</span>
      </button>`;
    }

    function kdsEmpty(msg) {
      return `<div class="kit-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>${kdsEsc(msg)}</span></div>`;
    }

    function kdsStationBar() {
      const btn = (id, dot, label) => {
        const count = kdsOrders.filter(o => kdsViewStatus(o, id) !== 'ready' && kdsMatches(o, id)).length;
        return `<button class="kit-station ${kdsActiveStation === id ? 'on' : ''}" data-kit-st="${id}"><i style="background:${dot};"></i><span>${kdsEsc(label)}</span><span class="kit-station-ct">${count}</span></button>`;
      };
      const list = kdsStations();
      /* Un seul poste ne se filtre pas : « Toutes » et « Cuisine » afficheraient
         rigoureusement la même chose. On garde la barre pour le compteur. */
      return (list.length > 1 ? btn('all', 'var(--ink)', 'Toutes') : '') + list.map(s => btn(s.id, s.raw, s.name)).join('');
    }

    function updateKdsCount() {
      const el = $('#kds-count');
      // `held` = commande client à emporter, pas encore payée : elle est sur le
      // tableau À emporter mais la cuisine ne l'a pas encore, donc elle ne doit
      // pas gonfler le compteur de l'écran cuisine.
      if (el) el.textContent = String(kdsOrders.filter(o => o.status !== 'ready' && o.status !== 'held').length);
    }

    /* Le numéro QUE LE CLIENT CONNAÎT. Toute commande restaurant relayée reçoit
       le compteur simple et hebdomadaire du serveur ; pendant le bref instant
       hors ligne avant sa réponse, on garde le compteur local en repli. */
    function orderServerInitials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      return ((parts[0][0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase();
    }
    /* ── UN NUMÉRO LOCAL N'EST PAS UN NUMÉRO ──────────────────────────────
     * Hors ligne, le relais ne peut pas attribuer le numéro canonique, et le
     * bon sortait sur le papier avec le compteur LOCAL du comptoir — un « 64 »
     * qui ressemble en tout point à un numéro de serveur. Au retour du réseau
     * la commande recevait son vrai numéro, disons 3 : à partir de là le
     * papier, la cuisine et la caisse désignaient trois choses différentes.
     * Un numéro provisoire porte donc sa marque, « L », qu'aucun numéro
     * serveur ne peut prendre. Il ne prétend pas être ce qu'il n'est pas, et
     * il redevient le vrai numéro dès que celui-ci arrive. */
    function ticketNo(o) {
      if (o && o.opNum == null && o.provisionalNumber) return 'L' + String(o.num);
      if (o && o.opNum != null) {
        const n = String(o.opNum);
        if (o.opChannel === 'kiwi') {
          const employeePrefix = orderServerInitials(o.server);
          if (employeePrefix) return employeePrefix + '-' + n;
          return (o.type === 'takeaway' ? 'OPD-' : 'OP-') + n;
        }
        return n;
      }
      return String(o.num);
    }

    function kdsPaint() {
      /* Une caisse laissée ouverte toute la nuit ne refait pas un premier pull
         complet. Purger aussi le tableau déjà en mémoire, pas seulement le
         snapshot restauré au prochain rechargement. */
      for (let i = kdsOrders.length - 1; i >= 0; i--) {
        if (staleQueuedServerTicket(kdsOrders[i])) {
          const ticket = kdsOrders[i];
          kdsOrders.splice(i, 1);
          if (ticket.opId && opTickets.get(ticket.opId) === ticket) opTickets.delete(ticket.opId);
        }
      }
      $('#kit-bar').innerHTML = kdsStationBar();
      $('#kit-history-toggle').innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 2.5-6.2"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg><span>Historique</span><span class="kit-htg-ct">${kdsGroup('ready').length}</span>`;
      const newList = kdsGroup('new'), cookList = kdsGroup('cooking'), readyList = kdsGroup('ready');
      if (kdsKitOn()) { kdsKitPaint(newList, cookList, readyList); updateKdsCount(); return; }
      $('#kit-new').innerHTML =
        `<div class="kit-col-head"><span>Nouvelles</span><span class="kit-col-ct">${newList.length}</span></div>`
        + `<div class="kit-col-stack">${newList.length ? newList.map(kdsOrderCard).join('') : kdsEmpty('Aucune nouvelle commande')}</div>`;
      $('#kit-cook').innerHTML =
        `<div class="kit-col-head"><span>En préparation</span><span class="kit-col-ct">${cookList.length}</span></div>`
        + `<div class="kit-grid3">${cookList.length ? cookList.map(kdsOrderCard).join('') : kdsEmpty('Aucune commande en préparation')}</div>`;
      /* Ce volet liste les bons PRÊTS (`kdsGroup('ready')`), chaque ligne dit
         « Prête 14:20 » : l'intitulé « Servies aujourd'hui » annonçait une
         remise au client que la caisse ne sait pas, elle, constater. */
      $('#kit-history-inner').innerHTML =
        `<div class="kit-col-head"><span>Prêtes aujourd'hui</span><span class="kit-col-ct">${readyList.length}</span><button class="kit-history-x" data-kit-history-toggle aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        + `<div class="kit-history-rows">${readyList.length ? readyList.map(kdsHistoryRow).join('') : kdsEmpty('Aucune commande prête pour l\'instant')}</div>`;
      updateKdsCount();
    }
    function kkt(k, a) { return String(window.KiwiKit.t(k, a)).replace(/[\u2066-\u2069]/g, ''); }
    function kdsKitOn() {
      if (kdsKit) return true;
      if (!window.KiwiKdsBoard || !window.KiwiKit) return false;
      const shell = (title, extra) => `<div class="kit-col-head"><span>${kdsEsc(title)}</span><span class="kit-col-ct" data-kit-ct>0</span>${extra || ''}</div><div class="kit-lane-box"></div>`;
      $('#kit-new').innerHTML = shell(kkt('kds.new'));
      $('#kit-cook').innerHTML = shell(kkt('kds.preparing'));
      $('#kit-history-inner').innerHTML = shell(kkt('kds.ready'), `<button class="kit-history-x" data-kit-history-toggle aria-label="${kdsEsc(kkt('action.close'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`);
      kdsKit = !!window.KiwiKdsBoard.mount({
        stacks: { new: $('#kit-new .kit-lane-box'), cook: $('#kit-cook .kit-lane-box'), pass: $('#kit-history-inner .kit-lane-box') },
        columns: { new: '1', cook: 'auto', pass: '1' },
        fit: { new: 'none', cook: 'none', pass: 'none' },
        surface: false,
        act: kdsKitAct,
      });
      return kdsKit;
    }
    function kdsKitTicket(o, lane) {
      const items = kdsEnsureFormulaParents(o).map(i => ({
        qty: String(i.q || 1),
        name: i.n,
        tag: i.kind === 'formula-part' ? (i.formulaName || '') : '',
        mods: (Array.isArray(i.visuals) ? i.visuals : []).filter(v => v && (v.name || v.label || v.cn)).map(v => String(v.name || v.label || v.cn)),
        note: String(i.note || '').trim(),
        off: kdsActiveStation !== 'all' && !i.stations.includes(kdsActiveStation),
        recipe: kdsHasRecipe(i.n),
      }));
      const chips = [];
      let source;
      if (o.type === 'glovo' || o.type === 'yassir') source = { kind: 'delivery', label: (o.type === 'glovo' ? 'Glovo' : 'Yassir') + (o.code ? ' ' + o.code : '') };
      else if (o.type === 'takeaway') source = { kind: 'takeaway', label: kkt('kds.source.takeaway') };
      else {
        source = { kind: 'table', label: kkt('kds.source.table', { table: String(o.table == null ? '' : o.table) }) };
        if (o.course === 'suite') chips.push(kkt('kds.suite'));
        if (o.server) chips.push(String(o.server));
      }
      const tk = { id: String(o.num), number: ticketNo(o), minutes: Math.floor(kdsElapsed(o) / 60), source, chips, items };
      if (lane === 'pass') { tk.doneAt = o.readyAt || ''; tk.serve = false; tk.recall = !o.pickedUp; }
      else if (Array.isArray(o.following) && o.following.length) {
        tk.following = kkt('kds.following', { items: o.following.map(i => `${i.q}× ${i.n}`).join(', ') });
      }
      return tk;
    }
    function kdsKitPaint(newList, cookList, readyList) {
      const ct = (sel, n) => { const el = $(sel + ' [data-kit-ct]'); if (el) el.textContent = String(n); };
      ct('#kit-new', newList.length); ct('#kit-cook', cookList.length); ct('#kit-history-inner', readyList.length);
      window.KiwiKdsBoard.paint({
        new: newList.map(o => kdsKitTicket(o, 'new')),
        cook: cookList.map(o => kdsKitTicket(o, 'cook')),
        pass: readyList.map(o => kdsKitTicket(o, 'pass')),
      });
    }
    function kdsKitAct(action, id, value) {
      const num = Number(id);
      if (action === 'start') kdsAccept(num);
      else if (action === 'ready') kdsReady(num);
      else if (action === 'recall') kdsRecall(num);
      else if (action === 'recipe') {
        const o = kdsOrders.find(x => x.num === num);
        const item = o && value && value.item != null ? kdsEnsureFormulaParents(o)[value.item] : null;
        if (item) kdsOpenRecipe(item.n);
      }
    }

    function kdsAccept(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || kdsViewStatus(o, kdsActiveStation) !== 'new') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      o.items.forEach(i => {
        if (!station || i.stations.includes(station)) i.stationAccepted = true;
      });
      if (o.items.length && o.items.every(i => i.stationAccepted === true)) o.status = 'cooking';
      kdsPaint();
      opPush(o, 'cooking', station ? { station } : {});
    }
    function kdsReady(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || kdsViewStatus(o, kdsActiveStation) === 'ready') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      if (station) {
        o.items.forEach(i => { if (i.stations.includes(station)) i.stationReady = true; });
        if (o.items.length && o.items.every(i => i.stationReady === true)) o.status = 'ready';
      } else {
        o.items.forEach(i => { i.stationReady = true; });
        o.status = 'ready';
      }
      if (o.status === 'ready') o.readyAt = kdsNowHM();
      kdsPaint();
      if (o.status === 'ready' && o.type === 'takeaway') renderVrapBoard();
      // Le client apprend que c'est prêt sur son propre téléphone, sans avoir
      // rien à rafraîchir : c'est tout l'intérêt d'avoir posé la commande là.
      opPush(o, 'ready', station ? { station } : {});
      toast(station && o.status !== 'ready'
        ? `${kdsStations().find(s => s.id === station)?.name || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Poste')} · ${ticketNo(o)} prêt`
        : `Commande ${ticketNo(o)} prête`);
    }

    /* ── RAPPELER UN BON MARQUÉ PRÊT PAR ERREUR ───────────────────────────
       Le serveur refuse `ready → accepted` en transition ordinaire : le rappel
       est un geste nommé (`recall`), journalisé, et marqué sur les lignes
       (`recalledAt`) pour que les autres écrans le suivent. Ici on le montre
       tout de suite, et on le défait si le serveur ne le confirme pas (bon
       servi entre-temps, réseau tombé) : l'écran ne doit pas mentir. */
    function kdsRecall(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.pickedUp || kdsViewStatus(o, kdsActiveStation) !== 'ready') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      const before = { status: o.status, readyAt: o.readyAt,
        ready: o.items.map(i => i.stationReady), accepted: o.items.map(i => i.stationAccepted) };
      const wasReady = o.status === 'ready';
      o.items.forEach(i => {
        if (!station || i.stations.includes(station)) { i.stationReady = false; i.stationAccepted = true; }
        else if (wasReady) i.stationReady = true;
      });
      o.status = 'cooking';
      o.readyAt = null;
      /* Une échéance plutôt qu'un drapeau : un instantané sauvé pendant le vol
         et rechargé ne doit pas geler ce bon pour toujours. */
      o.recallPendingUntil = Date.now() + 30000;
      kdsPaint();
      if (o.type === 'takeaway') renderVrapBoard();
      toast(`${ticketNo(o)} rappelée en cuisine`);
      Promise.resolve(opPush(o, 'recall', station ? { station } : {})).then((j) => {
        o.recallPendingUntil = 0;
        if (j && j.ok) {
          o.recallSeen = Math.max(Number(o.recallSeen) || 0,
            ...(Array.isArray(j.lines) ? j.lines : []).map(l => Number(l && l.recalledAt) || 0));
          return;
        }
        if (!o.opId) return;
        o.status = before.status;
        o.readyAt = before.readyAt;
        o.items.forEach((i, k) => { i.stationReady = before.ready[k]; i.stationAccepted = before.accepted[k]; });
        kdsPaint();
        if (o.type === 'takeaway') renderVrapBoard();
        if (!j) toast(`Rappel de ${ticketNo(o)} non confirmé · réessayez`);
        else if (j.httpStatus === 409 && j.error === 'bad-transition') toast(`${ticketNo(o)} est déjà servie`);
      }).catch(() => { o.recallPendingUntil = 0; });
    }

    function kdsOpenZoom(o) {
      document.querySelectorAll('.kit-zoom-backdrop').forEach(b => b.remove());
      const bd = document.createElement('div');
      bd.className = 'kit-zoom-backdrop';
      bd.innerHTML = `<div class="kit-zoom" data-kit-num="${o.num}">${kdsOrderInner(o, false)}</div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 300);
      };
      bd.addEventListener('click', (e) => {
        const acc = e.target.closest('[data-kit-accept]');
        if (acc) { kdsAccept(Number(acc.dataset.kitAccept)); close(); return; }
        const rdy = e.target.closest('[data-kit-ready]');
        if (rdy) { kdsReady(Number(rdy.dataset.kitReady)); close(); return; }
        const rcl = e.target.closest('[data-kit-recall]');
        if (rcl) { kdsRecall(Number(rcl.dataset.kitRecall)); close(); return; }
        const rec = e.target.closest('[data-kit-recipe]');
        if (rec) { kdsOpenRecipe(rec.dataset.kitRecipe); return; }
        if (!e.target.closest('.kit-zoom')) close();
      });
    }

    /* Recipe popup · opens when cuisinier taps a dish on a ticket. Shows
     * ingredients (qty + name) and a one-line prep note. The "fingertip
     * recipe" pattern that lets new staff prepare any plate without
     * memorising the menu. */
    function kdsOpenRecipe(dishName) {
      document.querySelectorAll('.kit-recipe-backdrop').forEach(b => b.remove());
      const r = KDS_RECIPES[dishName];
      const bd = document.createElement('div');
      bd.className = 'kit-recipe-backdrop';
      let body;
      if (!r) {
        body = `
          <div class="kit-recipe-empty">
            ${KDS_SVG.book}
            <div class="kit-recipe-empty-t">Recette pas encore définie</div>
            <div class="kit-recipe-empty-b">Demandez au chef de la compléter dans Menu › Recettes pour la voir ici.</div>
          </div>`;
      } else {
        const yld = r.yield || 1;
        const rows = r.ingredients.map(ing =>
          `<li class="kit-recipe-ing"><span class="kit-recipe-ing-q">${kdsEsc(ing.q)}</span><span class="kit-recipe-ing-n">${kdsEsc(ing.n)}</span></li>`
        ).join('');
        body = `
          <div class="kit-recipe-meta">
            <span class="kit-recipe-yield">Rendement · ${yld} portion${yld > 1 ? 's' : ''}</span>
          </div>
          <div class="kit-recipe-section">
            <div class="kit-recipe-section-t">Ingrédients</div>
            <ul class="kit-recipe-ings">${rows}</ul>
          </div>
          ${r.prep ? `
            <div class="kit-recipe-section">
              <div class="kit-recipe-section-t">Préparation</div>
              <div class="kit-recipe-prep">${kdsEsc(r.prep)}</div>
            </div>
          ` : ''}
          <div class="kit-recipe-foot">Tapez sur un plat pour réafficher sa recette à tout moment.</div>`;
      }
      bd.innerHTML = `
        <div class="kit-recipe" role="dialog" aria-labelledby="kit-recipe-title">
          <div class="kit-recipe-head">
            <div>
              <div class="kit-recipe-eyebrow">Recette · par portion</div>
              <h3 id="kit-recipe-title" class="kit-recipe-title">${kdsEsc(dishName)}</h3>
            </div>
            <button class="kit-recipe-close" data-kit-recipe-close aria-label="Fermer">${KDS_SVG.close}</button>
          </div>
          <div class="kit-recipe-body">${body}</div>
        </div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 260);
      };
      bd.addEventListener('click', (e) => {
        if (e.target.closest('[data-kit-recipe-close]') || !e.target.closest('.kit-recipe')) close();
      });
    }

    function kdsTick() {
      if (!kdsEl.classList.contains('is-open')) return;
      if (kdsKit) {
        window.KiwiKdsBoard.retime(id => { const o = kdsOrders.find(x => x.num === Number(id)); return o ? Math.floor(kdsElapsed(o) / 60) : 0; });
        return;
      }
      document.querySelectorAll('.kit-order, .kit-zoom').forEach(card => {
        const o = kdsOrders.find(x => x.num === Number(card.dataset.kitNum));
        if (!o || o.status === 'ready') return;
        const el = kdsElapsed(o), u = kdsUrgency(el);
        const v = card.querySelector('.kit-timer-v');
        const tEl = card.querySelector('.kit-timer');
        if (v) v.textContent = kdsFmt(el);
        if (tEl) tEl.className = `kit-timer ${u}`;
        if (card.classList.contains('kit-order')) card.classList.toggle('is-late', u === 'over');
      });
    }

    function isKdsOff() {
      return isFeatureOff('kds');
    }

    function openKds() {
      if (isKdsOff()) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Écran cuisine désactivé pour cet établissement'));
        return;
      }
      kdsPaint();
      kdsEl.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      clearInterval(kdsTimer);
      kdsTimer = setInterval(kdsTick, 1000);
    }
    function closeKds() {
      kdsEl.classList.remove('is-open');
      clearInterval(kdsTimer);
      kdsTimer = null;
      document.querySelectorAll('.kit-zoom-backdrop').forEach(b => b.remove());
    }

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
      /* The client on the note follows it onto the board (sale-client.js). */
      try { if (window.KiwiCaisseSaleClient && window.KiwiCaisseSaleClient.carry) window.KiwiCaisseSaleClient.carry(order); } catch (_) {}
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

    function setVrapView(v) {
      vrapView = v;
      const board = $('#vrap-board'), builder = $('#vrap-builder');
      if (board)   board.hidden   = v !== 'board';
      if (builder) builder.hidden = v !== 'builder';
      const back = $('#vrap-back-board');
      if (back) back.style.display = (v === 'builder' && mode === 'vrap') ? '' : 'none';
      const meta = $('.main-head[data-mode-section="vrap"] .vrap-meta');
      if (meta) meta.style.display = (v === 'builder') ? '' : 'none';
      if (v === 'board') renderVrapBoard();
    }

    function vrapElapsed(o) {
      const min = Math.max(0, Math.floor((Date.now() - o.sentAt.getTime()) / 60000));
      return min < 1 ? "à l'instant" : `il y a ${min} min`;
    }
    function vrapItemsLine(o) {
      return o.items.map(i => `${i.q}× ${kdsEsc(i.n)}`).join(', ');
    }

    function vrapFinancialItems(o) {
      return o && Array.isArray(o.billItems) && o.billItems.length ? o.billItems : ((o && o.items) || []);
    }

    /* ── Vente au comptoir ou commande à distance ? ────────────────────────
     * Une commande OrderPro est passée par un client ABSENT : il faut pouvoir
     * lui dire « c'est prêt », puis constater qu'il est venu la chercher. Ces
     * deux étapes sont la raison d'être de « Marquer prêt » et « Remettre au
     * client ».
     *
     * Une vente saisie AU COMPTOIR n'a ni l'une ni l'autre : le client est
     * devant la caisse, il paie, il attend son sachet et il repart. Lui faire
     * traverser les deux mêmes boutons n'informait personne — ça ajoutait deux
     * gestes au coup de feu et laissait la carte traîner dans « EN COURS ».
     *
     * `opChannel` porte la provenance : 'kiwi' = OrderPro / téléphone, tout le
     * reste = ce comptoir. Une commande purement locale (pas encore de numéro
     * de file) est forcément du comptoir elle aussi. */
    function vrapIsCounterSale(o) {
      if (!o) return false;
      if (o.opChannel) return o.opChannel !== 'kiwi';
      return o.opNum == null;
    }

    function vrapOrderCard(o) {
      const ready = o.status === 'ready';
      const counterSale = vrapIsCounterSale(o);
      const savedSplit = savedTakeawaySplitFor(o);
      const splitRemaining = savedSplit ? splitRemainingTotal(savedSplit) : null;
      /* Readiness is an ORDER state, not a merchant or printer capability.
         The counter must be able to mark every accepted takeaway ready even
         when a KDS is configured: some restaurants run the pass from the
         caisse, and the same OrderPro workflow must work for every tenant. */
      const readyBtn = (!ready && o.status !== 'held' && !counterSale)
        ? `<button class="vrap-act vrap-act-ready" data-vrap-ready="${o.num}" title="Prévenir le client que la commande est prête">Marquer prêt</button>`
        : '';
      const sendBtn = o.status === 'held'
        ? `<button class="vrap-act vrap-act-send" data-vrap-send="${o.num}">Envoyer en cuisine</button>`
        : '';
      const cancelBtn = o.opId
        ? `<button class="vrap-act vrap-act-cancel" data-vrap-cancel="${o.num}">Annuler</button>`
        : '';
      let action = '';
      if (!o.paid) {
        action = `<div class="vrap-order-acts">${cancelBtn}${sendBtn}${readyBtn}<button class="vrap-act vrap-act-pay">${savedSplit ? 'Reprendre le split · ' : 'Encaisser · '}${fmtMAD(splitRemaining != null ? splitRemaining : o.total)}</button></div>`;
      } else if (!o.pickedUp) {
        if (!counterSale) {
          /* Do not offer handover while the card still says "En préparation".
             That shortcut silently marked the order ready and served in one
             click, hiding the readiness step from every KDS-enabled merchant. */
          action = readyBtn || `<button class="vrap-act" data-vrap-handover="${o.num}">Remettre au client</button>`;
        }
        /* Older paid counter sales can lack a served milestone. They need the
           same audited, non-financial escape hatch as phone orders; payment
           alone must not fabricate a customer handover. */
        if (o.opId) action += `<button class="vrap-act vrap-act-archive" data-vrap-archive="${o.num}">Retirer du suivi</button>`;
      }
      const notes = o.items.filter(i => (i.note || '').trim())
        .map(i => `<div class="vrap-order-note"><i data-lucide="pencil-line"></i> <strong>${kdsEsc(i.n)}</strong> · ${kdsEsc(i.note)}</div>`)
        .join('');
      const paidDetails = o.paid && vrapSelectedPaidNum === o.num
        ? `<div class="vrap-order-details"><strong>Commande payée · ${kdsEsc(new Date(o.sentAt).toLocaleString('fr-FR'))}</strong>
            ${o.pickedUp ? 'Remise au client.' : 'En attente de remise. « Retirer du suivi » ne modifie ni le paiement ni les ventes.'}</div>` : '';
      return `<div class="vrap-order${ready ? ' is-ready' : ''}${o.paid ? ' is-paid' : ' is-open'}" data-vrap-num="${o.num}">
        <div class="vrap-order-head">
          <span class="vrap-order-num">${ticketNo(o)}</span>
          <span class="vrap-order-time"><i data-lucide="clock"></i> ${vrapElapsed(o)}</span>
        </div>
        <div class="vrap-order-badges">
          <span class="vrap-badge ${ready ? 'k-ready' : 'k-cooking'}">${
            ready ? 'Prête'
            /* `held` = commande passée depuis un téléphone, pas encore réglée.
               Elle n'est PAS en préparation : la cuisine ne l'a même pas vue,
               et c'est justement le paiement qui l'y enverra. Le dire « en
               préparation » aurait fait attendre le client pour rien, et
               laissé croire au comptoir que le travail était lancé. */
            : o.status === 'held' ? 'En attente de paiement'
            : 'En préparation'}</span>
          <span class="vrap-badge ${o.paid ? 'p-paid' : 'p-unpaid'}">${o.paid ? 'Payé' : savedSplit ? `Partiel · reste ${fmtMAD(splitRemaining)}` : 'Non payé'}</span>
        </div>
        <div class="vrap-order-items">${vrapItemsLine(o)}</div>
        ${notes}
        ${paidDetails}
        <div class="vrap-order-foot">
          <span class="vrap-order-total">${fmtMAD(o.total)}</span>
          ${action}
        </div>
      </div>`;
    }

    function vrapHandoverTimestamp(value) {
      if (typeof value !== 'number' && typeof value !== 'string') return null;
      const ts = Number(value);
      return Number.isInteger(ts) && ts > 0 && ts <= 8640000000000000 ? ts : null;
    }

    function vrapHistoryDay(ts) {
      const DR = window.KiwiDayReport;
      if (DR && typeof DR.businessDay === 'function') return DR.businessDay(ts, opMerchant());
      // Same default as day-report.js when that optional module is unavailable.
      const d = new Date(ts - 5 * 3600000);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-');
    }

    function vrapHandoverTime(ts) {
      return ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    }

    function vrapHistoryRow(o) {
      const ts = vrapHandoverTimestamp(o.pickedUpTs);
      return `<div class="vrap-hrow">
        <span class="vrap-hrow-num">${ticketNo(o)}</span>
        <span class="vrap-hrow-items">${vrapItemsLine(o)}</span>
        <span class="vrap-hrow-total">${fmtMAD(o.total)}</span>
        <span class="vrap-hrow-done"><i data-lucide="check"></i> ${ts ? 'Remise ' + kdsEsc(vrapHandoverTime(ts)) : 'Remise · heure inconnue'}</span>
      </div>`;
    }

    /* Une expirée n'est plus une commande, c'est un souvenir avec des lignes :
       on la réaffiche en lecture seule, et la reprise en fait une vente neuve
       (nouveau numéro, nouveau bon) — jamais une résurrection, le serveur ne
       saurait pas la rouvrir. */
    function expiredRow(e) {
      const items = (e.lines || []).map(l => `${l.qty}× ${l.name}`).join(', ') || '·';
      const when = (() => { try {
        const mins = Math.max(0, Math.round((Date.now() - Number(e.updated_ts || 0)) / 60000));
        return mins < 1 ? "à l'instant" : `il y a ${mins} min`;
      } catch (_) { return ''; } })();
      const where = e.mode === 'table' && e.table ? `Table ${kdsEsc(e.table)}` : 'À emporter';
      return `<div class="vrap-hrow" data-exp-row="${kdsEsc(e.id)}">
        <span class="vrap-hrow-num">N°${kdsEsc(e.number)} · ${where}</span>
        <span class="vrap-hrow-items">${kdsEsc(items)} <span style="opacity:.6">· ${kdsEsc(when)}</span></span>
        <span class="vrap-hrow-total">${fmtMAD(e.total || 0)}</span>
        <div style="display:inline-flex;gap:6px;align-items:center;flex-shrink:0;">
          <button class="vrap-act vrap-act-send" data-exp-reprendre="${kdsEsc(e.id)}">Reprendre</button>
          <button class="vrap-act vrap-act-cancel" data-exp-dismiss="${kdsEsc(e.id)}" title="Supprimer de la liste">Supprimer</button>
        </div>
      </div>`;
    }

    /* Recharger les lignes d'une expirée dans le panier, comme une vente neuve :
       re-saisie revue par le caissier, re-chiffrée au passage en caisse. Un
       second tap recharge le même panier — jamais un doublon en cuisine. */
    function reprendreExpired(id) {
      const e = (expiredOrders || []).find(x => x && String(x.id) === String(id));
      if (!e || !(e.lines || []).length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Expirée introuvable')); return; }
      if (mode !== 'vrap') setMode('vrap');
      vrapResumedExpiredId = String(id);
      dismissExpired(id);
      currentOrder().setEditing(null);
      currentOrder().setDiscount(null);
      currentOrder().replaceCart((e.lines || []).map(l => {
        const m = menuLineFind(x => String(x.name || '').toLowerCase() === String(l.name || '').toLowerCase());
        return {
          uid: newLineUid(),
          id: (m && m.id) || ('x-' + l.name),
          name: l.name || (m && m.name) || '',
          price: Math.max(0, +l.unitPrice || (m ? m.price : 0)),
          qty: Math.max(1, +l.qty || 1),
          note: l.note || '',
          kind: '', formulaUid: '', formulaChoices: [],
        };
      }).filter(c => c.name));
      if (!cart.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Expirée vide · rien à reprendre')); return; }
      setVrapView('builder');
      renderMenu();
      renderCart();
      renderVrapBoard();
      toast(`N°${e.number} reprise · vérifie et encaisse`);
    }

    function renderVrapBoard() {
      const body = $('#vrap-board-body');
      if (!body) return;
      const orders = kdsOrders.filter(o => o.type === 'takeaway');
      const active = orders.filter(o => !o.pickedUp)
        .sort((a, b) => ((b.status === 'ready') - (a.status === 'ready')) || (b.num - a.num));
      const today = vrapHistoryDay(Date.now());
      const done = orders.filter(o => o.pickedUp && vrapHandoverTimestamp(o.pickedUpTs)
        && vrapHistoryDay(Number(o.pickedUpTs)) === today)
        .sort((a, b) => Number(b.pickedUpTs) - Number(a.pickedUpTs) || b.num - a.num);
      // An old HH:mm value has no date and may have been fabricated on import.
      // Neither order creation nor payment is evidence of the handover day.
      const undated = orders.filter(o => o.pickedUp && !vrapHandoverTimestamp(o.pickedUpTs))
        .sort((a, b) => b.num - a.num);

      const cntEl = $('#vrap-board-count');
      if (cntEl) cntEl.textContent = active.length
        ? `${active.length} commande${active.length > 1 ? 's' : ''} en cours · ${done.length} servie${done.length > 1 ? 's' : ''}`
        : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune commande en cours');

      let html = `<div class="vrap-section"><div class="vrap-section-label">En cours</div>`;
      html += active.length
        ? `<div class="vrap-orders">${active.map(vrapOrderCard).join('')}</div>`
        : `<div class="vrap-empty"><i data-lucide="package"></i><span>Aucune commande à emporter, clique « Nouvelle commande » pour démarrer.</span></div>`;
      html += `</div>`;
      /* ── LES EXPIRÉES ─────────────────────────────────────────────────
       * Refus récents du serveur (TTL ou comptoir), lecture seule. Sans
       * cette section, une commande jamais validée à temps n'existait plus
       * nulle part : « on ne trouve rien ». Ici elle garde son numéro, ses
       * lignes et son total, et « Reprendre » la recharge dans le panier
       * comme une vente neuve — le client repart avec son sac, pas avec
       * une excuse. */
      const expList = (expiredOrders || []).filter(e => e && e.id);
      if (expList.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Expirées · à reprendre (${expList.length})</div>`
          + `<div class="vrap-hrows">${expList.map(expiredRow).join('')}</div></div>`;
      }
      if (done.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Historique · servies aujourd'hui</div>`
          + `<div class="vrap-hrows">${done.map(vrapHistoryRow).join('')}</div></div>`;
      }
      if (undated.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Historique · date de remise inconnue</div>`
          + `<div class="vrap-hrows">${undated.map(vrapHistoryRow).join('')}</div></div>`;
      }
      body.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }

    /* Clicking a board order re-opens it in the menu builder: its lines load
       into the cart, you add from the menu / adjust with +/−, apply a
       réduction, then pay through the real card / cash modals.
       State (vrapEditingNum / vrapDiscount) is declared up top. */

    /* cart lines → order item objects, preserving each line's kitchen station + note */
    function vrapCartItems(o) {
      return cart.map(c => {
        const orig = o && vrapFinancialItems(o).find(it => it.n === c.name);
        const m = menuLineFind(x => x.id === c.id);
        /* Cette branche ignorait m.station : rouvrir une commande à emporter pour
           y ajouter un plat renvoyait TOUTE la commande en cuisson, y compris le
           café qui devait aller au bar. Même résolution que partout ailleurs. */
        return { q: c.qty, n: c.name, p: c.price, note: (c.note || '').trim(),
          kind: (orig && orig.kind) || c.kind || '', formulaUid: (orig && orig.formulaUid) || c.formulaUid || '',
          formulaChoices: Array.isArray(c.formulaChoices) ? c.formulaChoices.map(choice => ({ ...choice })) : [],
          stations: orig ? orig.stations : [kdsStationFor(m)] };
      });
    }

    function saveVrapBillItems(o, items) {
      if (!o) return;
      if (!Array.isArray(o.billItems)) { o.items = items; return; }
      o.billItems = items;
      o.items.forEach((kitchenItem) => {
        const billed = kitchenItem.formulaUid
          ? items.find(item => item.formulaUid === kitchenItem.formulaUid)
          : items.find(item => item.n === kitchenItem.n);
        if (billed) kitchenItem.q = billed.q;
      });
    }

    /* Persist the working cart back onto the order being edited (no payment). */
    function saveVrapEdits() {
      if (vrapEditingNum == null) return;
      const o = kdsOrders.find(x => x.num === vrapEditingNum);
      if (!o || o.paid || cart.length === 0) return;
      saveVrapBillItems(o, vrapCartItems(o));
      o.total = cart.reduce((s, c) => s + c.price * c.qty, 0);  // gross · réduction is checkout-only
    }

    function cancelOrderProTakeaway(o, authorizedWho = null) {
      if (!o || !o.opId || o.paid) return false;
      const label = ticketNo(o);
      const proceed = (who) => {
        toast(`Annulation de ${label}…`);
        postCaisseCancellation({ merchant: currentMerchantSlug(), id: o.opId,
          status: 'rejected', server: 'dismissed', actorProof: who && who.actorProof || '' }).then(() => {
          dismissExpired(o.opId);
          opTickets.delete(o.opId);
          const index = kdsOrders.indexOf(o);
          if (index >= 0) kdsOrders.splice(index, 1);
          if (vrapEditingNum === o.num) {
            currentOrder().setEditing(null);
            clearCart();
            setVrapView('board');
          } else renderVrapBoard();
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          try { persistShift(); } catch (_) {}
          const by = who && who.name ? ` · ${who.name}` : '';
          toast(`Commande ${label} annulée${by}`);
        }).catch((error) => {
          toast(`Commande ${label} conservée · ${error.message || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('annulation non transmise')}`);
        });
      };
      if (authorizedWho) { proceed(authorizedWho); return true; }
      window.KiwiAuthAct?.({ kind: 'cancel_order', key: 'act.cancel_order', args: { order: label } });
      requireTillOperator(`Annuler la commande ${label}`, proceed, TILL_NEEDS_SERVER);
      return true;
    }

    /* Card / cash cleared in À emporter mode. For an order being edited this
       settles it on the board; for a fresh counter sale it just clears. */
    function settleVrapPayment() {
      if (vrapResumedExpiredId) {
        dismissExpired(vrapResumedExpiredId);
        vrapResumedExpiredId = null;
      }
      if (vrapEditingNum != null) {
        const o = kdsOrders.find(x => x.num === vrapEditingNum);
        if (o) {
          o.paid  = true;
          /* Split parts are tenders against the original order. The working
             cart can reflect the last resumed slice, so currentTotal() is not
             authoritative at finalisation; keep the saved gross/net order
             amount for the board and history. */
          o.total = splitState.flow && Number.isFinite(Number(splitState.total))
            ? money(splitState.total)
            : currentTotal();
          if (cart.length) saveVrapBillItems(o, vrapCartItems(o));
          /* Une commande client à emporter attendait le paiement (`held`) : le
             client vient d'annoncer son numéro et de payer, donc elle part en
             cuisine MAINTENANT, et pas avant. C'est ce que le paiement protège
             · on ne prépare rien pour quelqu'un qui n'est jamais venu. */
          dispatchHeldTakeaway(o, true, true);
          /* Already-sent orders are no longer `held`, so dispatchHeldTakeaway
             correctly does nothing. Payment still has to cross the server
             boundary; the queue endpoint accepts this same-state paid stamp
             idempotently without replaying the kitchen transition. */
          /* ── La vente au comptoir se termine en étant payée ────────────────
           * Elle n'a plus « Marquer prêt » ni « Remettre au client » (voir
           * vrapIsCounterSale) : sans cela elle resterait EN COURS pour le
           * reste du service, et surtout sa session `takeout` resterait OUVERTE
           * dans D1 — la journée d'exploitation se fermerait sur des sessions
           * qui ne se refermeront jamais. Le paiement EST la fin : le client est
           * devant la caisse, il repart avec son sachet.
           *
           * `served` emprunte exactement le chemin qu'empruntait « Remettre » —
           * même transition, même fermeture de session, même événement
           * `takeout-handover` au journal. Rien de neuf côté serveur. */
          if (vrapIsCounterSale(o) || o.offPlan) {
            o.pickedUp = true;
            o.pickedUpTs = Date.now();
            o.pickedUpAt = vrapHandoverTime(o.pickedUpTs);
            /* On ne force PAS `ready` au passage : le serveur accepte
             * `served` depuis `accepted` autant que depuis `ready`
             * (FROM.served = ['ready','accepted']), et mentir sur l'état
             * cuisine ferait disparaître un plat encore à faire de l'écran de
             * production. La cuisine garde son bon ; c'est la carte du
             * comptoir qui se range. */
          }
          if (o.opId) {
            const remoteStatus = o.pickedUp ? 'served' : (o.status === 'ready' ? 'ready' : 'accepted');
            opPush(o, remoteStatus, { paid: true });
          }
          /* Une table hors plan payée au comptoir : sa visite se ferme comme
             celle d'une table du plan (markPaid › releasePhoneTable), sans quoi
             le téléphone du client resterait un terminal de commande. */
          /* Mais SEULEMENT si plus rien n'est dû sur cette visite : la fermer
             avec « settle » estampille payée chaque commande de la session, et
             une deuxième commande de la même table, pas encore encaissée,
             partirait gratuite. Elle se fermera avec la dernière. */
          let visitOwes = false;
          if (o.offPlan && o.session) {
            try {
              const inbox = (window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders()) || {};
              visitOwes = Object.keys(inbox).some((id) => {
                const other = inbox[id];
                return other && id !== String(o.opId) && other.mode === 'table'
                  && String(other.session || '') === String(o.session)
                  && !other.paid && other.status !== 'rejected';
              });
            } catch (_) { visitOwes = true; }
          }
          if (o.offPlan && o.session && !visitOwes) {
            try {
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: String(o.table || ''), session: String(o.session), why: 'settle', actorProof: '' },
              }));
            } catch (_) {}
          }
          /* dispatchHeldTakeaway persists before this function flips `paid`.
             Persist again at the money boundary so closing the success modal,
             refreshing, or a PWA takeover cannot resurrect an unpaid card. */
          try { persistShift(); } catch (_) {}
          toast(`Commande ${ticketNo(o)} encaissée · ${fmtMAD(o.total)}`);
        }
        currentOrder().setEditing(null);
        clearCart();
        setVrapView('board');
      } else {
        clearCart();
      }
    }

    /* Click a board order → load it into the builder for editing + checkout. */
    function openVrapOrder(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.paid) return;
      if (mode !== 'vrap') setMode('vrap');
      currentOrder().setEditing(num);
      currentOrder().setDiscount(null);
      currentOrder().replaceCart(vrapFinancialItems(o).map(i => {
        const m = menuLineFind(x => x.name === i.n);
        return {
          uid:   newLineUid(),
          id:    m ? m.id : ('x-' + i.n),
          name:  i.n,
          price: i.p != null ? i.p : (m ? m.price : 0),
          qty:   i.q,
          note:  i.note || '',
          kind: i.kind || '', formulaUid: i.formulaUid || '',
          formulaChoices: Array.isArray(i.formulaChoices) ? i.formulaChoices.map(choice => ({ ...choice })) : [],
        };
      }));
      setVrapView('builder');
      const vrapTitle = $('.main-head[data-mode-section="vrap"] .main-title');
      if (vrapTitle) {
        vrapTitle.innerHTML = `Commande <strong style="color:var(--forest)">${ticketNo(o)}</strong>
          <span class="order-mode-badge"><i data-lucide="package"></i> à emporter</span>`;
      }
      renderMenu();
      renderCart();
      if (savedTakeawaySplitFor(o)) openSplitModal(null);
      // Re-trigger the panel slide-in so the order visibly lands.
      const active = $('#rp-active');
      if (active) { active.style.animation = 'none'; void active.offsetWidth; active.style.animation = ''; }
    }

    /* Réduction on the À emporter cart · same modal as the Salle remise. */
    function openVrapRemise() {
      if (mode === 'order' && selectedId) {
        openRemiseModal(selectedId);
        return;
      }
      const list = (cart && cart.length) ? cart : [];
      if (!list.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajoute des articles d\'abord')); return; }
      const gross = list.reduce((s, l) => s + l.price * l.qty, 0);
      remiseState.target  = 'vrap';
      remiseState.tableId = null;
      remiseState.gross   = gross;
      const existing = vrapDiscount;
      if (existing) {
        remiseState.kind   = existing.kind || 'pct';
        remiseState.value  = Number(existing.value || 0);
        remiseState.reason = existing.reason || 'Geste commercial';
      } else {
        remiseState.kind   = 'pct';
        remiseState.value  = 0;
        remiseState.reason = 'Geste commercial';
      }
      $('#rm-subtle').innerHTML = `À emporter · addition <span class="mono">${fmtMAD(gross)}</span>`;
      renderRemiseChips();
      $('#rm-amount').value = (remiseState.kind === 'amount' && remiseState.value) ? remiseState.value : '';
      $$('#rm-pct-chips .rm-pct-chip').forEach(c => {
        c.classList.toggle('is-active', remiseState.kind === 'pct' && parseFloat(c.dataset.rmPct) === remiseState.value);
      });
      $$('#rm-reasons .rm-reason').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rmReason === remiseState.reason));
      const rmRemoveBtn = $('#rm-remove');
      if (rmRemoveBtn) {
        rmRemoveBtn.hidden = !existing;
        rmRemoveBtn.style.display = existing ? '' : 'none';
      }
      syncRemiseType();
      renderRemisePreview();
      remiseModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }

    function vrapMarkReady(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.status === 'ready') return;
      o.items.forEach(i => { i.stationReady = true; });
      o.status = 'ready';
      o.readyAt = kdsNowHM();
      kdsPaint();
      renderVrapBoard();
      // Le client apprend que sa commande est prête sur son téléphone (OrderPro)
      opPush(o, 'ready');
      try { persistShift(); } catch (_) {}
      toast(`Commande ${ticketNo(o)} prête · client notifié`);
    }

    function vrapHandover(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.pickedUp) return;
      if (o.status !== 'ready') {
        o.items.forEach(i => { i.stationReady = true; });
        o.status = 'ready';
        o.readyAt = kdsNowHM();
      }
      o.pickedUp = true;
      o.pickedUpTs = Date.now();
      o.pickedUpAt = vrapHandoverTime(o.pickedUpTs);
      renderVrapBoard();
      /* Remise en main propre : c'est le point final. Le téléphone bascule sur
         le remerciement et ne peut plus commander · pour un retrait au
         comptoir, il n'y a pas d'addition à encaisser plus tard qui viendrait
         fermer la session à sa place. */
      opPush(o, 'served');
      /* La remise est un état persisté (`kdsOrders` part dans le blob de
         service) : sans écriture ici, un F5 dans les secondes qui suivent
         ressuscitait une commande déjà donnée au client, prête à être remise
         une seconde fois. L'autosave l'aurait rattrapée · dans cinq secondes.
         Tous les autres points finaux écrivent tout de suite ; celui-ci aussi. */
      try { persistShift(); } catch (_) {}
      toast(`Commande ${ticketNo(o)} remise au client`);
    }

    function vrapArchivePaid(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || !o.opId || !o.paid || o.pickedUp) return;
      const label = ticketNo(o);
      if (!window.confirm((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr(`Retirer ${label} du suivi à emporter ?\n\nLa vente et le paiement restent enregistrés. Cette action ne signifie PAS « remise au client ». Elle ne crée aucune transaction aujourd'hui.`))) return;
      window.KiwiAuthAct?.({ kind: 'untrack_order', key: 'act.untrack_order', args: { order: label } });
      requireTillOperator(`Retirer ${label} du suivi`, (who) => {
        Promise.resolve(opPush(o, 'archived', { actorProof: who && who.actorProof || '' })).then((result) => {
          if (!result || !result.ok) { toast(`Impossible de retirer ${label} · réessayez`); return; }
          rememberArchivedTakeaway(o.opId);
          // The inbox bridge also retires this ticket. Repeat safely if an old
          // inbox version has not learned the new terminal state yet.
          retireRejectedKitchenTicket(o);
          if (vrapSelectedPaidNum === num) vrapSelectedPaidNum = null;
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          renderVrapBoard();
          toast(`${label} retirée du suivi · vente conservée`);
        });
      }, /* Retirer du suivi est une écriture serveur sans file d'attente : hors
            connexion, pas de code (« connexion requise · rien n'a changé »). */
      TILL_NEEDS_SERVER);
    }

    function archivedTakeawaySet() {
      const merchant = currentMerchantSlug();
      if (merchant !== archivedTakeawayScope) {
        archivedTakeawayScope = merchant;
        try {
          const saved = JSON.parse(localStorage.getItem('kiwi-archived-takeaways:' + merchant) || '[]');
          archivedTakeawayIds = new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string').slice(-1000) : []);
        } catch (_) { archivedTakeawayIds = new Set(); }
      }
      return archivedTakeawayIds;
    }

    function rememberArchivedTakeaway(id) {
      if (!id || !currentMerchantSlug()) return;
      const ids = archivedTakeawaySet();
      ids.add(String(id));
      try { localStorage.setItem('kiwi-archived-takeaways:' + archivedTakeawayScope,
        JSON.stringify(Array.from(ids).slice(-1000))); } catch (_) {}
    }

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
