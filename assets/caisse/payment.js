/* Owner: caisse card, cash and payment settlement.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */
     // custom % when mode === 'autre'

    function payTipPct() {
      if (splitPayCallback) return 0;       // split has its own tip
      if (payTipMode === 'autre') return Math.max(0, Math.min(100, Number.isFinite(payTipCustom) ? payTipCustom : 0));
      return parseFloat(payTipMode) || 0;
    }
    function payTipAmount() {
      /* money(), pas Math.round : un pourboire de 5 % sur 47,50 doit rendre
         2,38 · l'arrondi au dirham entier faussait le rendu au centime près. */
      /* En centimes entiers : 21,35 × 10 / 100 vaut 2,13499… en virgule
         flottante et rendait 2,13 au lieu de 2,14. */
      const cents = Math.round(money(currentTotal()) * 100);
      return Math.round(cents * payTipPct() / 100 + 1e-9) / 100;
    }
    function resetPayTip() {
      payTipMode = '0';
      payTipCustom = 0;
    }
    /* Render the tip selector for whichever modal is open (card and/or cash). */
    function renderPayTip() {
      const opts = [
        { label: 'Sans pourboire', val: '0'   },
        { label: '5 %',            val: '5'   },
        { label: '10 %',           val: '10'  },
        { label: '15 %',           val: '15'  },
        { label: 'Autre',          val: 'autre'},
      ];
      const isSplit = !!splitPayCallback;
      ['card', 'cash'].forEach(which => {
        const wrap = $('#' + which + '-tip');
        if (!wrap) return;
        // Hide the whole tip block while a split part is being paid.
        wrap.style.display = isSplit ? 'none' : '';
        if (isSplit) return;
        $('#' + which + '-tip-chips').innerHTML = opts.map(o =>
          `<button class="pay-tip-chip ${o.val === payTipMode ? 'is-active' : ''}" data-pay-tip="${o.val}">${o.label}</button>`
        ).join('');
        const customVisible = payTipMode === 'autre';
        $('#' + which + '-tip-custom').classList.toggle('is-visible', customVisible);
        if (customVisible) $('#' + which + '-tip-input').value = payTipCustom || '';
        const bd = $('#' + which + '-tip-breakdown');
        const tip = payTipAmount();
        if (tip > 0) {
          const base = currentTotal();
          bd.innerHTML =
            `Addition <span class="mono">${fmtMAD(base)}</span>`
            + `<span class="pay-tip-sep">·</span>`
            + `Pourboire <span class="mono">${fmtMAD(tip)}</span>`
            + `<span class="pay-tip-sep">·</span>`
            + `Total <span class="mono">${fmtMAD(base + tip)}</span>`;
          bd.classList.add('is-visible');
        } else {
          bd.innerHTML = '';
          bd.classList.remove('is-visible');
        }
      });
    }
    /* Tip changed · refresh the open modal's customer-facing figure. */
    function applyPayTipChange() {
      renderPayTip();
      const base = currentTotal();
      const tip  = payTipAmount();
      if ($('#card-modal').classList.contains('is-open')) {
        $('#card-amount').textContent = fmtMADcents(base + tip);
      }
      if ($('#cash-modal').classList.contains('is-open')) {
        $('#cash-amount').textContent = fmtMADcents(base + tip);
        const ci = $('#cash-received');
        if (ci) ci.value = base + tip;
        updateRendu();
      }
    }
    
    function openCardModal() {
      try { window.KiwiHardware && window.KiwiHardware.warmPrinter && window.KiwiHardware.warmPrinter(); } catch (_) {}
      const attempt = ++cardAttemptSeq;
      cardPaymentCommitted = false;
      cardTenderMethod = 'card';
      // Reset to pulsing state
      $('#card-modal-title').textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Payer par carte');
      reader.disc.classList.remove('is-success', 'flash');
      reader.disc.classList.add('is-pulsing');
      reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
      reader.status.classList.remove('is-success');
      reader.status.innerHTML = 'Approchez la carte ou le téléphone<span class="ellipsis"></span>';
      reader.method.style.display = '';
      reader.method.textContent = 'Kiwi Tap · NFC · QR';
      reader.foot.classList.remove('is-visible');
      /* Sans lecteur branché, « Carte » veut dire : le client paie sur le TPE du
         commerçant. Aucun lecteur n'est en attente d'une carte, et rien ne dit
         que le client a payé · c'est au caissier de le confirmer. Avant, la vente
         s'écrivait toute seule deux secondes après le toucher de « Carte ». */
      const hw0 = window.KiwiHardware;
      const externalTerminal = !!(hw0 && hw0.externalCardTerminal && hw0.externalCardTerminal());
      if (reader.confirm) reader.confirm.hidden = !externalTerminal;
      if (externalTerminal) {
        reader.disc.classList.remove('is-pulsing');
        reader.status.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Faites payer sur votre terminal, puis confirmez');
        reader.method.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Terminal de paiement externe');
        reader.foot.classList.add('is-visible');
      }
      // Reset the tip so the figure opens on the base addition.
      resetPayTip();
      $('#card-amount').textContent = fmtMADcents(currentTotal());
      cardModal.classList.add('is-open');
      renderPayTip();
      lucide.createIcons();

      if (externalTerminal) return;
      cardSuccessTimer = setTimeout(() => {
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) {
          reader.disc.classList.remove('is-pulsing', 'is-success');
          reader.status.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Paiement non confirmé · lecteur indisponible');
          reader.foot.classList.add('is-visible');
          return;
        }
        Promise.resolve(hw.authorizeCard(currentTotal() + payTipAmount(), reader.disc, reader.status))
          .then((result) => {
            if (attempt !== cardAttemptSeq || !cardModal.classList.contains('is-open')) return;
            if (result && result.approved) triggerCardSuccess(result);
            else { reader.method.style.display = 'none'; reader.foot.classList.add('is-visible'); lucide.createIcons(); }
          });
      }, 2000);
    }
    async function triggerCardSuccess(result) {
      if (cardPaymentCommitted) return;
      cardPaymentCommitted = true;
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender(cardTenderMethod); }
      catch (_) { tenderInFlight = false; toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Encaissement à vérifier dans le journal avant de réessayer')); return; }
      tenderInFlight = false;
      if (settled === 'split') { closeCardModal(); return; }
      const sale = lastSaleEntry();
      closeCardModal();
      printSaleTicket(sale);
    }
    /* A settled row identifies the order, not the physical table. Keep the
       first kitchen ticket attached to this bill; later sends are additions. */
    /* ── Ce qu'une ligne de journal doit dire ──────────────────────────────
     * Une vente à emporter s'écrivait « À emporter #79 » ; une vente de salle
     * s'écrivait « 51 ». Un nombre nu ne désigne rien : trois mois plus tard,
     * face à une réclamation ou à un écart de caisse, on ne peut ni retrouver
     * la table ni même savoir qu'il s'agissait d'une table. La moitié du
     * journal était donc intraçable.
     *
     * On compose la même forme que pour l'emporter : « Table 5 #56 ».
     *
     * Le numéro BRUT reste stocké dans `t.orderNo`, et ce n'est pas un détail :
     * il est comparé à `order.num` (migration d'un ancien numéro local) et il
     * est TRANSFÉRÉ tel quel d'une table à l'autre lors d'un changement de
     * table. Y coller le nom de la table ferait voyager l'ancienne table avec
     * le ticket. L'étiquette est donc une vue, jamais la donnée. */
    function tableSaleLabel(tableId, ref) {
      const id = String(tableId || '').trim();
      const num = String(ref == null ? '' : ref).trim();
      if (!id) return num || 'Commande';
      if (!num || num === id) return `Table ${id}`;
      return `Table ${id} #${num}`;
    }

    function settledOrderLabel(tableId) {
      return tableSaleLabel(tableId, settledOrderRef(tableId));
    }

    function settledOrderRef(tableId) {
      const t = tableId && tables[tableId];
      if (t && t.orderNo != null && String(t.orderNo).trim()) return String(t.orderNo);
      /* Migration for a table already open when this fix is deployed: only a
         ticket from the current occupancy window may be adopted. Old served
         tickets for the same physical table stay in KDS history. */
      const openedAfter = Date.now() - ((Math.max(0, +(t && t.elapsed) || 0) + 2) * 60000);
      const order = kdsOrders.slice().reverse().find(o => {
        if (!o || o.type !== 'dineIn' || String(o.table) !== String(tableId)) return false;
        const sent = o.sentAt instanceof Date ? o.sentAt.getTime() : new Date(o.sentAt).getTime();
        return Number.isFinite(sent) && sent >= openedAfter;
      });
      if (order) {
        const label = ticketNo(order);
        if (t) tableSettlement().project(t, { orderNo: label });
        return label;
      }
      return tableId || 'Commande';
    }

    function closeCardModal() {
      if (tenderInFlight) return;
      cardModal.classList.remove('is-open');
      cardAttemptSeq++;
      clearTimeout(cardSuccessTimer);
      cashAmountOverride = null;
      /* Le modal de paiement s'ouvre PAR-DESSUS le modal de partage : l'abandonner
         laissait `splitPayCallback` armé. Or `finalizeTender()` ne comptabilise une
         vente que si ce callback est vide · l'encaissement suivant, sans rapport,
         était donc absorbé par la part abandonnée : montant de l'ancienne part
         enregistré, vente réelle jamais écrite. On désarme à la fermeture ; sur le
         chemin nominal `finalizeTender()` l'a déjà mis à null avant d'arriver ici. */
      splitPayCallback = null;
      restorePayBindings();
    }
    

    function currentTotal() {
      if (cashAmountOverride !== null) return cashAmountOverride;
      if (mode === 'vrap') {
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        return Math.max(0, gross - vrapDiscountAmount(gross));
      }
      if (!selectedId) return 0;
      const lines = generateOrder(selectedId, tables[selectedId]);
      const gross = lines.reduce((s, l) => s + l.total, 0);
      // Net of any manager-approved remise on this table.
      return Math.max(0, gross - discountAmountFor(selectedId, gross));
    }
    /* Commit at the payment truth boundary, not when a decorative success modal
       is later dismissed. A reload/Escape after cash was accepted or the reader
       approved must never leave the order due and invite a second charge. */
    async function finalizeTender(method) {
      /* The loyalty reward approves first (caisse-loyalty-reward.js). */
      const holds = [];
      document.dispatchEvent(new CustomEvent('kiwi:tender-gate', { detail: { method, hold: (p) => holds.push(p) } }));
      for (const h of holds) if (!(await h)) return 'reward-refused';
      /* Paiement = confirmation ferme. Avant d'écrire la vente ou de libérer
         la table, rattraper tout ce qui n'est pas encore parti en cuisine.
         Chaque chemin garde sa propre preuve durable (ligne.sent, statut held,
         ou identifiant OrderPro), donc les encaissements/retours suivants ne
         peuvent jamais produire un second bon. */
      const tenderOrder = dispatchUnsentKitchenBeforePayment();
      /* A new counter order gets its permanent restaurant number from the
         shared order queue. Never freeze a customer receipt or send a sale to
         Dashboard while that allocation is still in flight: the temporary
         till counter was the source of the #74 / #14 disagreement. */
      await awaitCanonicalTicketNumber(tenderOrder);
      const tenderBase = currentTotal();
      const tenderTip = payTipAmount();
      const saleLabel = mode === 'vrap'
        ? (tenderOrder ? 'À emporter #' + ticketNo(tenderOrder)
          : (vrapEditingNum != null ? 'À emporter #' + vrapEditingNum : 'À emporter'))
        : settledOrderLabel(selectedId);
      const lines = currentSaleLines();
      let recorded = null;
      if (!splitPayCallback) {
        const sale = recordSale(tenderBase, method, saleLabel, tenderTip, lines,
          mode !== 'vrap' ? selectedId : '', tenderOrder);
        if (!sale) throw new Error('sale-not-recorded');
        recorded = sale;
      }
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        /* The share's receipt, or nothing if it was not recorded. Only a
           receipt the queue has taken earns the success haptic. */
        if (saleRecordConfirmed(cb())) nativeHapticSuccess();
        return 'split';
      }
      if (mode === 'vrap') settleVrapPayment();
      else if (selectedId) { markPaid(selectedId); closeRightPanel(); }
      if (saleRecordConfirmed(recorded)) nativeHapticSuccess();
      /* The paid moment in the native app (native-runtime.js). The haptic
         above already played, so the app only draws. */
      try { window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: tenderBase + tenderTip, method: method, haptic: false } })); } catch (_) {}
      return 'complete';
    }
    function updateRendu() {
      // The customer pays base + pourboire; rendu is computed off that.
      /* In cents: a percentage remise leaves 44.700000000000003 as the due,
         and a cashier typing 44.7 was told « manque 0 MAD » and blocked. */
      const total = Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = Math.round((parseFloat(String(cashInput.value).replace(',', '.')) || 0) * 100) / 100;
      const diff = Math.round((got - total) * 100) / 100;
      cashRendu.classList.remove('is-positive', 'is-short');
      if (diff >= 0) {
        cashRendu.classList.toggle('is-positive', diff > 0);
        cashRenduVal.textContent = fmtMADcents(diff);
        cashConfirm.disabled = false;
      } else {
        cashRendu.classList.add('is-short');
        cashRenduVal.textContent = 'Insuffisant · manque ' + fmtMAD(total - got);
        cashConfirm.disabled = true;
      }
      // Un billet trop petit pour couvrir le dû ne sert à rien : on le grise.
      $$('.cash-preset').forEach(b => {
        if (!b.dataset.set || b.dataset.set === 'exact') return;
        b.disabled = parseFloat(b.dataset.set) < total;
      });
    }
    function openCashModal() {
      try { window.KiwiHardware && window.KiwiHardware.warmPrinter && window.KiwiHardware.warmPrinter(); } catch (_) {}
      cashPaymentCommitted = false;
      cashStepInput.hidden = false;
      cashStepInput.style.display = '';
      // Reset the tip so the figure opens on the base addition.
      resetPayTip();
      const total = currentTotal();
      cashInput.value = total;
      $('#cash-amount').textContent = fmtMADcents(total);
      cashModal.classList.add('is-open');
      renderPayTip();
      updateRendu();
    }
    function closeCashModal() {
      if (tenderInFlight) return;
      cashAmountOverride = null;
      cashPaymentCommitted = false;
      cashConfirm.disabled = false;
      // Même désarmement qu'en carte · voir closeCardModal().
      splitPayCallback = null;
      restorePayBindings();
      cashModal.classList.remove('is-open');
    }
    
    function dismissModalVeil(veil) {
      if (!veil) return;
      const id = veil.id;
      if (id === 'card-modal') { closeCardModal(); return; }
      if (id === 'cash-modal') { closeCashModal(); return; }
      if (id === 'order-review-modal') { closeOrderReviewModal(); return; }
      if (id === 'client-modal') { closeClientModal(); return; }
      if (id === 'split-modal') { closeSplitModal(); return; }
      if (id === 'receipt-modal') { closeReceipt(); return; }
      if (id === 'cash-move-modal') { closeCashMove(); return; }
      if (id === 'manager-modal') { closeManagerModal(); return; }
      if (id === 'attendance-code-modal') { closeAttendanceCode(); return; }
      if (id === 'msg-modal') { closeMsgModal(); return; }
      if (id === 'reassign-modal') { closeReassignModal(); return; }
      if (id === 'remise-modal') { closeRemiseModal(); return; }
      if (id === 'refund-modal') { closeRefund(); return; }
      if (id === 'handover-modal') { closeHandover(); return; }
      if (id === 'sk-modal') { closeSkModal(); return; }
      if (id === 'team-drawer') { closeTeamDrawer(); return; }
      if (id === 'journal-drawer') { closeJournal(); return; }
      const closeBtn = veil.querySelector('[data-modal-action="close"], #cl-cancel, #nt-cancel, #wl-cancel, #ctrf-cancel, #cmrg-cancel, #split-done-close, #attendance-code-close, #receipt-close, .modal-close, .drawer-close');
      if (closeBtn) {
        closeBtn.click();
      } else {
        veil.classList.remove('is-open');
      }
    }

    

    /* ---------- Live elapsed minutes ---------- */
    function resetTableTimer(t) {
      if (!t) return;
      tableSettlement().project(t, { elapsed: 0 });
      tableSettlement().project(t, {}, ['orderStartedAt']);
      tableSettlement().project(t, {}, ['timerSession']);
    }
    function startTableTimer(id, createdAt = 0) {
      const t = tables[id];
      if (!t) return 0;
      const now = Date.now();
      if (!(Number(t.orderStartedAt) > 0)) {
        const created = Number(createdAt);
        // Old shift snapshots have only elapsed minutes. Preserve that age;
        // canonical orders supply their timestamp when a till reconnects.
        tableSettlement().project(t, { orderStartedAt: created > 0 ? Math.min(now, created)
          : now - Math.max(0, Number(t.elapsed) || 0) * 60000 });
      } else if (Number(createdAt) > 0) {
        // A reconnect can deliver the newest ticket first. Earlier tickets
        // move the anchor back; additional orders never restart the clock.
        tableSettlement().project(t, { orderStartedAt: Math.min(t.orderStartedAt, Number(createdAt), now) });
      }
      tableSettlement().project(t, { elapsed: Math.max(0, Math.floor((now - t.orderStartedAt) / 60000)) });
      return t.orderStartedAt;
    }
    function updateTableTimers() {
      Object.keys(tables).forEach(id => {
        const t = tables[id];
        const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
        if (hasOrder && (t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'a-commander')) {
          startTableTimer(id);
          // Update DOM in place (cheaper than full re-render)
          const node = document.querySelector(`[data-table="${id}"] .tbl-elapsed`);
          if (node) node.textContent = `${t.elapsed} mn`;
          // Update right panel substatus if this is the selected one
          if (id === selectedId) {
            const sub = $('#rp-substatus');
            if (!sub) return;
            const flag = sub.dataset.flag;
            const map = {
              'bgha-ykhlass': 'Addition',
              'a-commander':  'À commander',
              'ka-yaklo':     'En cours',
            };
            sub.textContent = `${map[flag]} · ${t.elapsed} mn`;
          }
        } else if (!hasOrder || t.status === 'khawya' || t.status === 'khlass') resetTableTimer(t);
      });
    }
    
