
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
