/* Owner: caisse manager discounts.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* ===========================================================
       REMISE · manager-gated discount on a table addition
       -----------------------------------------------------------
       Data model, on the table:
         tables[id].discount = {
           kind:   'pct' | 'amount',
           value:  number,   // % when pct, MAD when amount
           amount: number,   // computed MAD cut, rounded, clamped <= gross
           reason: string,
         }
       discountAmountFor(id, gross) recomputes the live cut against the
       current gross so the figure stays correct if the order changes.
       =========================================================== */
    function discountAmountFor(id, gross) {
      const d = tables[id] && tables[id].discount;
      if (!d) return 0;
      let amt = d.kind === 'pct'
        ? Math.round(minor(gross) * (d.value || 0) / 100 + 1e-9) / 100 /* centimes entiers : 5 % de 43 871,10 vaut 2 193,555 */
        : money(d.value || 0);
      return money(Math.max(0, Math.min(amt, money(gross))));
    }

    
    function renderRemiseChips() {
      const values = window.KiwiDiscountPolicy?.percentages() || [5, 10, 15, 20];
      $('#rm-pct-chips').innerHTML = values.map(n => `<button class="rm-pct-chip" data-rm-pct="${n}">${n} %</button>`).join('');
    }
    

    function remiseCutPreview() {
      const g = remiseState.gross;
      let cut = remiseState.kind === 'pct'
        ? money(g * (remiseState.value || 0) / 100)
        : money(remiseState.value || 0);
      return money(Math.max(0, Math.min(cut, g)));
    }
    function renderRemisePreview() {
      const pv = $('#rm-preview');
      const cut = remiseCutPreview();
      if (cut <= 0) {
        pv.classList.add('is-empty');
        pv.textContent = "Choisis une remise pour voir l'aperçu.";
        return;
      }
      pv.classList.remove('is-empty');
      const net = remiseState.gross - cut;
      pv.innerHTML =
        `<span class="rm-pv-from mono">Addition ${fmtMAD(remiseState.gross)}</span>`
        + `<span class="rm-pv-arrow">→</span>`
        + `<span class="rm-pv-to mono">${fmtMAD(net)}</span>`
        + `<span class="rm-pv-cut mono">−${fmtMAD(cut)}</span>`;
    }
    function syncRemiseType() {
      $$('#rm-type .rm-type-btn').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rmType === remiseState.kind));
      $('#rm-pct-block').hidden    = remiseState.kind !== 'pct';
      $('#rm-amount-block').hidden = remiseState.kind !== 'amount';
    }
    function openRemiseModal(id) {
      window.KiwiDiscountPolicy?.refresh?.(true); // the owner may have changed the allowed percentages
      // A split in progress locks the addition · finish it first.
      if (typeof tableSplits !== 'undefined' && tableSplits.has(id)) {
        toast("Termine le split d'abord");
        return;
      }
      const lines = generateOrder(id, tables[id]);
      const gross = lines.reduce((s, l) => s + l.total, 0);
      remiseState.target  = 'table';
      remiseState.tableId = id;
      remiseState.gross   = gross;
      const existing = tables[id] && tables[id].discount;
      if (existing) {
        remiseState.kind   = existing.kind || 'pct';
        remiseState.value  = Number(existing.value || 0);
        remiseState.reason = existing.reason || 'Geste commercial';
      } else {
        remiseState.kind   = 'pct';
        remiseState.value  = 0;
        remiseState.reason = 'Geste commercial';
      }
      $('#rm-subtle').innerHTML = `Table ${id} · addition <span class="mono">${fmtMAD(gross)}</span>`;
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
    function closeRemiseModal() { remiseModal.classList.remove('is-open'); }

    function applyRemise() {
      const target = remiseState.target;
      const targetTableId = remiseState.tableId;
      const targetKind = remiseState.kind;
      const targetValue = remiseState.value;
      const targetReason = remiseState.reason;
      if (targetKind === 'pct' && window.KiwiDiscountPolicy?.configured() && !window.KiwiDiscountPolicy.allowed(targetValue)) {
        toast('Pourcentage non autorisé · rechargez la remise'); return;
      }
      const cut = remiseCutPreview();
      if (cut <= 0) { toast('Choisis une remise'); return; }

      window.KiwiAuthAct?.(targetKind === 'pct' ? { kind: 'discount', key: 'act.discount.pct', args: { pct: `${targetValue}\u202f%` } } : { kind: 'discount', key: 'act.discount.amount', args: { amount: fmtMAD(cut) } });
      requireManager("Remise sur l'addition", () => {
        if (target === 'vrap') {
          const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
          let amount = targetKind === 'pct'
            ? money(gross * (targetValue || 0) / 100)
            : money(targetValue || 0);
          amount = money(Math.max(0, Math.min(amount, money(gross))));
          if (amount <= 0) { toast('Remise sans effet'); return; }
          vrapDiscount = {
            kind:   targetKind,
            value:  targetValue,
            amount: amount,
            reason: targetReason,
            actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
            accounted: false,
          };
          closeRemiseModal();
          renderCart();
          toast(`Remise appliquée · −${fmtMAD(amount)}`);
          return;
        }

        const id = targetTableId;
        if (!id || !tables[id]) { closeRemiseModal(); return; }
        const t = tables[id];
        // Re-clamp against the live gross at approval time.
        const lines = generateOrder(id, t);
        const gross = lines.reduce((s, l) => s + l.total, 0);
        let amount = targetKind === 'pct'
          ? money(gross * (targetValue || 0) / 100)
          : money(targetValue || 0);
        amount = money(Math.max(0, Math.min(amount, money(gross))));
        if (amount <= 0) { toast('Remise sans effet'); return; }
        t.discount = {
          kind:   targetKind,
          value:  targetValue,
          amount: amount,
          reason: targetReason,
          actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
          accounted: false,
        };
        closeRemiseModal();
        if (selectedId === id) renderRightPanel(id);
        refreshTableNode(id);
        toast(`Remise appliquée · −${fmtMAD(amount)}`);
      });
    }

    function removeRemise() {
      const target = remiseState.target;
      const targetTableId = remiseState.tableId;
      if (target === 'vrap') {
        vrapDiscount = null;
        closeRemiseModal();
        renderCart();
        toast('Remise supprimée');
        return;
      }
      const id = targetTableId;
      if (id && tables[id]) {
        delete tables[id].discount;
        closeRemiseModal();
        if (selectedId === id) renderRightPanel(id);
        refreshTableNode(id);
        toast('Remise supprimée');
      } else {
        closeRemiseModal();
      }
    }

    
