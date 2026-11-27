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

    
    /* Sans réglage du propriétaire, la caisse restaurant propose aussi 50 % et
       100 % : une addition offerte passe par la remise approuvée, puis
       « Encaisser » l'enregistre en vente offerte (caisse/payment.js). */
    const REMISE_PCTS = Object.freeze([5, 10, 15, 20, 50, 100]);
    function renderRemiseChips() {
      /* Remises nommées du propriétaire (« Étudiant · 10 % ») : la caisse ne
         propose qu'elles, ni montant ni motif à choisir, le nom est le motif. */
      const presets = window.KiwiDiscountPolicy?.presets?.() || [];
      const named = presets.length > 0;
      const typeRow = $('#rm-type'), reasons = $('#rm-reasons');
      if (typeRow) { typeRow.hidden = named; typeRow.style.display = named ? 'none' : ''; }
      const reasonBlock = reasons && reasons.closest('.rm-block');
      if (reasonBlock) { reasonBlock.hidden = named; reasonBlock.style.display = named ? 'none' : ''; }
      if (named) {
        if (remiseState.kind !== 'pct') { remiseState.kind = 'pct'; remiseState.value = 0; }
        $('#rm-pct-chips').innerHTML = presets.map(p => `<button class="rm-pct-chip" data-rm-pct="${p.pct}" data-rm-name="${kdsEsc(p.name)}">${kdsEsc(p.name)} · ${p.pct} %</button>`).join('');
        return;
      }
      const values = window.KiwiDiscountPolicy?.percentages(undefined, REMISE_PCTS) || REMISE_PCTS;
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
        pv.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Choisis une remise pour voir l'aperçu.");
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
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Termine le split d'abord"));
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
      const namedChip = $('#rm-pct-chips .rm-pct-chip.is-active[data-rm-name]');
      const targetReason = namedChip && targetKind === 'pct' ? namedChip.dataset.rmName : remiseState.reason;
      if ((window.KiwiDiscountPolicy?.presets?.() || []).length && targetKind !== 'pct') {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Choisis une remise de la liste')); return;
      }
      if (targetKind === 'pct' && window.KiwiDiscountPolicy?.configured() && !window.KiwiDiscountPolicy.allowed(targetValue)) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Pourcentage non autorisé · rechargez la remise')); return;
      }
      const cut = remiseCutPreview();
      if (cut <= 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Choisis une remise')); return; }

      window.KiwiAuthAct?.(targetKind === 'pct' ? { kind: 'discount', key: 'act.discount.pct', args: { pct: `${targetValue}\u202f%` }, pct: Number(targetValue) } : { kind: 'discount', key: 'act.discount.amount', args: { amount: fmtMAD(cut) }, amountCents: Math.round(cut * 100) });
      requireManager("Remise sur l'addition", () => {
        if (target === 'vrap') {
          const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
          let amount = targetKind === 'pct'
            ? money(gross * (targetValue || 0) / 100)
            : money(targetValue || 0);
          amount = money(Math.max(0, Math.min(amount, money(gross))));
          if (amount <= 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Remise sans effet')); return; }
          currentOrder().setDiscount({
            kind:   targetKind,
            value:  targetValue,
            amount: amount,
            reason: targetReason,
            actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
            accounted: false,
          });
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
        if (amount <= 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Remise sans effet')); return; }
        tableSettlement().project(t, { discount: {
          kind:   targetKind,
          value:  targetValue,
          amount: amount,
          reason: targetReason,
          actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
          accounted: false,
        } });
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
        currentOrder().setDiscount(null);
        closeRemiseModal();
        renderCart();
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Remise supprimée'));
        return;
      }
      const id = targetTableId;
      if (id && tables[id]) {
        tableSettlement().project(tables[id], {}, ['discount']);
        closeRemiseModal();
        if (selectedId === id) renderRightPanel(id);
        refreshTableNode(id);
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Remise supprimée'));
      } else {
        closeRemiseModal();
      }
    }

    
    /* ===========================================================
       OFFERT · un article donné au client (le cookie du fidèle)
       -----------------------------------------------------------
       L'article reste une vraie ligne de vente : la cuisine le reçoit, le
       stock le sort, son coût matière est figé comme pour un plat payé. Seul
       son prix passe à 0 et la ligne garde ce qu'il valait :
         line.price     = 0
         line.offered   = prix unitaire d'origine (MAD)
         line.offeredBy = le responsable qui l'a approuvé
       À l'encaissement, la valeur offerte entre dans le brut et dans la remise
       de la vente (activeSaleDiscount), donc une addition entièrement offerte
       devient une vente « Offerte » à 0 MAD, et une addition mixte dit au
       tableau de bord combien a été donné. Une quantité > 1 n'offre qu'une
       unité : elle part sur sa propre ligne.
       =========================================================== */
    function offeredValue(lines) {
      return money((lines || []).reduce((s, l) => s + (+(l && l.offered) > 0 ? +l.offered * (+l.qty || 0) : 0), 0));
    }
    function offerDiscount(d, lines) {
      if (d || !(offeredValue(lines) > 0)) return d;
      const by = (lines || []).find(l => l && +l.offered > 0 && l.offeredBy);
      return { kind: 'amount', value: 0, reason: 'Geste commercial', actorId: by ? by.offeredBy : '' };
    }
    function offerPrice(l) {
      const tr = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr;
      const off = +l.offered > 0;
      const can = l.uid && l.kind !== 'formula-part' && (off || +l.price > 0);
      const label = off ? tr('Remettre au prix') : tr('Offrir cet article');
      return `<span class="rp-item-price mono${off ? ' is-offered' : ''}">`
        + (off ? `<s class="rp-offer-was">${fmtMAD(l.offered * l.qty)}</s> ${kdsEsc(tr('Offert'))}` : fmtMAD(l.price * l.qty))
        + (can ? `<button type="button" class="rp-offer${off ? ' is-on' : ''}" data-offer-uid="${kdsEsc(l.uid)}" aria-pressed="${off}" title="${kdsEsc(label)}" aria-label="${kdsEsc(label + ', ' + (l.name || ''))}"></button>` : '')
        + '</span>';
    }
    function toggleLineOffer(uid) {
      const tr = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr;
      const isVrap = mode === 'vrap';
      const tableId = isVrap ? '' : (selectedId && tableOrders[selectedId] ? selectedId : '');
      if (!isVrap && !tableId) return;
      if (tableId && typeof tableSplits !== 'undefined' && tableSplits.has(tableId)) { toast(tr("Termine le split d'abord")); return; }
      const list = () => (isVrap ? cart : (tableOrders[tableId] || []));
      const repaint = () => { if (isVrap) renderCart(); else if (mode === 'order') { renderMenu(); renderOrderPanel(tableId); } else renderRightPanel(tableId); };
      const line = list().find(l => l.uid === uid);
      if (!line || line.kind === 'formula-part') return;
      if (+line.offered > 0) {
        currentOrder().patchLine(line, { price: money(+line.offered) }, ['offered', 'offeredBy']);
        repaint();
        toast(tr('Article remis au prix'));
        return;
      }
      if (!(+line.price > 0)) return;
      requireManager(tr('Offrir un article'), () => {
        const live = list().find(l => l.uid === uid);
        if (!live || +live.offered > 0 || !(+live.price > 0)) return;
        const gift = { price: 0, offered: money(+live.price),
          offeredBy: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96) };
        if (+live.qty > 1 && !live.formulaUid) {
          const one = Object.assign(JSON.parse(JSON.stringify(live)), gift, { uid: newLineUid(), qty: 1 });
          currentOrder().patchLine(live, { qty: +live.qty - 1 });
          currentOrder().append(isVrap ? cart : tableOrders[tableId], one);
        } else currentOrder().patchLine(live, gift);
        repaint();
        toast(tr('Article offert') + ' · ' + (live.name || ''));
      });
    }
