
    /* ═══════════════════════════════════════════════════════════════════════
       LE TÉLÉPHONE DU CLIENT, SUR LE PLAN DE SALLE
       ---------------------------------------------------------------------
       Deux choses différentes, et il faut les distinguer d'un coup d'œil :
         · un client est ASSIS et lit la carte sur son téléphone · discret, une
           pastille ; il n'y a rien à faire, c'est juste bon à savoir ;
         · une commande ATTEND d'être acceptée · ça clignote et ça porte un
           compte, parce que tant que personne ne tape, la cuisine ne voit rien.
       L'état ne vit PAS dans `tables` : setupRealSalle() efface et reconstruit
       cet objet dès que le patron touche son plan depuis son téléphone, ce qui
       emporterait les sessions avec. Il vit dans sa propre carte, indexée par
       table, et survit à la reconstruction.
       ═══════════════════════════════════════════════════════════════════════ */
    /* La même normalisation que le serveur (functions/api/order/_lib.js) :
       « T7 », « t7 » et « T 7 » désignent la table que le patron a nommée T7. */
    function tableKey(v) {
      return String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '').trim();
    }
    function phoneBadgeHTML(id) {
      const k = tableKey(id);
      const n = phonePending.get(k) || 0;
      if (n > 0) {
        return `<span class="cplan-order" aria-label="${n} commande${n > 1 ? 's' : ''} à accepter">${n}</span>`;
      }
      if (phoneSeats.has(k)) {
        return '<span class="cplan-phone" aria-label="Un client commande depuis son téléphone"></span>';
      }
      return '';
    }
    function phoneSessionOf(id) {
      const s = phoneSeats.get(tableKey(id));
      // The queue create response may arrive before the next floor poll. The
      // cashier must still settle that exact visit, not a reusable table no.
      return (s && s.session) || String(tables[id]?.timerSession || '');
    }
    function locallySettledVisit(id, session) {
      return !!session && journal.some(entry => entry && entry.visitClosed === true
        && entry.table === String(id) && entry.session === String(session));
    }
    /* The visits of this table already paid at this till. The first ticket of
       a new party used to join the previous visit whenever that visit's close
       had not reached the server yet; the old party's replayed settlement then
       paid the new ticket and emptied the table (Pasta Corner, table 6, #86).
       The queue closes these visits, without marking anything paid, before
       it files the ticket. */
    function settledVisitsFor(id) {
      if (!id) return undefined;
      return [...new Set(journal.filter(e => e && e.visitClosed === true && e.session
        && e.table === String(id)).map(e => String(e.session)))].slice(-20);
    }
    /* A closed visit may only clear the bill it belonged to. The floor poll
       hides a fresh visit for a minute after the previous party leaves, and a
       poll read before "Envoyer en cuisine" can land after it: in both cases
       the previous party's closure used to wipe the new party's bill. */
    function billBelongsToOtherVisit(id, closedId) {
      const own = String(tables[id]?.timerSession || '');
      if (own && own !== String(closedId || '')) return true;
      /* A ticket the server never acknowledged belongs to a visit the server
         has not seen, so no server closure can be about it. This guard used to
         expire after two minutes: at Pasta Corner (#0163) the first relay of a
         new table 9 visit stalled past that, and the earlier, already-paid
         table 9 visit (closedSessions spans twelve hours) erased the new bill. */
      return kdsOrders.some(o => o && o.type === 'dineIn' && String(o.table) === String(id)
        && !o.paid && o.opId && !o.session && o.opNum == null);
    }
    function locallySettledOrder(id, number) {
      if (number == null || String(number).trim() === '') return false;
      const ref = tableSaleLabel(id, String(number));
      return journal.some(entry => entry && entry.table === String(id)
        && entry.ref === ref && entry.kind !== 'refund' && !entry.voided && !entry.split);
    }
    function paidReceiptForCurrentTable(id) {
      const table = tables[id];
      if (!table) return null;
      const session = phoneSessionOf(id);
      const orderNo = String(table.orderNo || '').trim();
      return journal.find(entry => entry && entry.table === String(id)
        && entry.kind !== 'refund' && !entry.voided && !entry.split
        && ((session && entry.session === session)
          || (orderNo && entry.ref === tableSaleLabel(id, orderNo)
            && (!session || !entry.session || entry.session === session)))) || null;
    }

    /* Libérer la table côté téléphone. Appelée quand l'addition est réglée, et
       aussi quand la table est rendue sans encaissement · sinon un téléphone
       resterait « assis » à une table libre et pourrait continuer à commander.
       L'état local part TOUT DE SUITE (la pastille s'éteint sous le doigt du
       caissier) et le réseau suit à son rythme, porté par orderpro-inbox.js. */
    function releasePhoneTable(id, why, force, actorProof = '', alreadyClosed = false) {
      const k = tableKey(id);
      tableClosedAt[k] = Date.now();
      const seat = phoneSeats.get(k);
      const session = (seat && seat.session) || String(tables[id]?.timerSession || '');
      phoneSeats.delete(k);
      phonePending.delete(k);
      /* A caisse may not have observed the phone session yet. A forced
         release must still close the table remotely, otherwise OrderPro keeps
         the guest seated after the cashier has made the table free. */
      if (alreadyClosed || (!seat && !force)) return;
      document.dispatchEvent(new CustomEvent('kiwi-table-released', {
        detail: { table: String(id), session, why: why || 'settle', actorProof },
      }));
    }
    function markSelectedTable(id) {
      $$(TBL_SEL).forEach(c => {
        const on = c.dataset.table === id;
        // La carte a un fond intérieur à teinter ; la table dessinée, non.
        const inner = c.querySelector('.tbl');
        if (inner) inner.classList.toggle('is-selected', on);
        else c.classList.toggle('is-selected', on);
      });
    }

    /* UNE table du plan spatial. Extraite de renderRealGrid pour qu'on puisse
       en redessiner une seule : elle vivait dans un .map() anonyme, donc le
       seul moyen de rafraîchir une table était de reconstruire la salle
       entière · ce qui coupe toute animation en cours et efface la sélection.
       refreshTableNode() s'en sert maintenant, exactement comme la démo se sert
       de tableHTML(). */
    function planTableOf(id) {
      const list = (__realPlan && __realPlan.tables) || [];
      return list.find(t => String(t.num || t.id) === String(id)) || null;
    }
