/* Owner: caisse shift close counting pane.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* La clôture sur le kit (étape 4 (7), §18.9). Drapeau allumé, Clôturer
       ouvre <k-cash-count> dans une feuille de comptage (k-sheet size count) au
       lieu de la fenêtre livrée. renderCloture() tourne d'abord, fenêtre gardée
       fermée : il calcule l'attendu et le total carte de Kiwi comme avant. Le
       comptage rend le compté, le motif de l'écart hors tolérance et le total
       carte du terminal ; la caisse les pose dans les champs livrés
       (#clo-count, #clo-card-z) et appelle closeRegister() : rapport, Z,
       événement de caisse et fin de poste restent les livrés. Le motif part
       avec l'événement de clôture (gapReason, cash_session_events.gap_reason).
       « Saisir le total » rouvre la fenêtre livrée, déjà remplie. */
    /* closeGapReason et tillKitCount sont déclarés avec registerClosed, plus bas,
       là où closeRegisterSteps() les lit. */
    function tillKitOpenCount() {
      if (!tillKitOn() || !customElements.get('k-cash-count') || !customElements.get('k-sheet')) return false;
      renderCloture(false);
      const tot = journalTotals();
      if (tillKitCount) tillKitCount.sheet.remove();
      const sheet = document.createElement('k-sheet');
      sheet.setAttribute('size', 'count');
      const cc = document.createElement('k-cash-count');
      cc.setAttribute('mode', 'close');
      sheet.appendChild(cc);
      document.body.appendChild(sheet);
      tillKitCount = { sheet, cc };
      sheet.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action === 'k.sheet.close') { sheet.removeAttribute('open'); return; }
        if (d.action === 'k.cash-count.enter-total') { sheet.removeAttribute('open'); $('#cloture-modal').classList.add('is-open'); return; }
        if (d.action !== 'k.cash-count.close') return;
        const v = d.value || {};
        $('#clo-count').value = String(v.counted);
        $('#clo-card-z').value = String(v.cardTotal == null ? clotureCardExpected : v.cardTotal);
        closeGapReason = v.reason || null;
        sheet.removeAttribute('open');
        /* La clôture tourne encore quelques secondes (synchro du jour, Z) :
           sans la fenêtre livrée et son « Clôture en cours… », la caisse
           restait à l'écran comme si le bouton n'avait rien fait. */
        $('#cloture-modal').classList.add('is-open');
        closeRegister();
      });
      cc.cardKiwi = clotureCardExpected;
      cc.count = { opening: openingFloat, cashSales: tot.cash, cashTips: tot.cashTips, cashIn: tot.movesIn, cashOut: tot.movesOut, refundsCash: 0 };
      sheet.setAttribute('open', '');
      return true;
    }

    
