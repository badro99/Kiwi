    function empPayRefsWrite(map) {
      try { localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(map)); } catch (_) { console.warn("[serveur] auxiliary payment-reference storage unavailable"); }
    }

    function empPayRefKey(tableId) {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      return merchant + '::' + String(tableId);
    }

    function employeePaymentId(tableId) {
      let id = employeePaymentRefs.get(tableId);
      if (!id) {
        const stored = empPayRefsRead();
        const saved = stored[empPayRefKey(tableId)];
        if (saved && typeof saved === 'string') {
          id = saved;
          employeePaymentRefs.set(tableId, id);
          return id;
        }
        const random = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        /* The -emp suffix survives Live Link's bounded stable-id encoding and
           lets the caisse import employee settlements without replaying its own
           sales back into its local journal. */
        id = 'employee-' + String(random).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) + '-emp';
        employeePaymentRefs.set(tableId, id);
        stored[empPayRefKey(tableId)] = id;
        empPayRefsWrite(stored);
      }
      return id;
    }

    function employeePaymentRefForget(tableId) {
      employeePaymentRefs.delete(tableId);
      const stored = empPayRefsRead();
      if (stored[empPayRefKey(tableId)] == null) return;
      delete stored[empPayRefKey(tableId)];
      empPayRefsWrite(stored);
    }

    function keepServiceBillOpen(tableId, saved) {
      const t = tables[tableId];
      (Array.isArray(saved.settledOrders) ? saved.settledOrders : [])
        .forEach((orderId) => serviceCanonicalOrders.delete(String(orderId)));
      employeePaymentRefForget(tableId);
      employeePaymentsInFlight.delete(tableId);
      tableSplits.delete(tableId);
      const session = serviceTableSessions.get(tableId);
      if (session && !SV_DEMO) {
        try {
          const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
          if (refs[key]) { delete refs[key]; localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs)); }
        } catch (_) {}
      }
      if (t) t.status = 'bgha-ykhlass';
      try { reconcileCanonicalServiceBill(tableId); } catch (_) {}
      if (currentTab === 'tables') renderTables();
      if (activeTableId === tableId) renderTableDetail();
      const rest = Math.max(0, Number(saved.remainingCents) || 0) / 100;
      toast(employeePick( `Table ${tableId} · reste ${fmtMADcents(rest)} : une commande est arrivée pendant l'encaissement`, `Table ${tableId} · ${fmtMADcents(rest)} left: an order arrived during payment`, `الطاولة ${tableId} · المتبقي ${fmtMADcents(rest)} : وصل طلب أثناء الدفع`), 6500);
    }

    function employeePaymentRefsForgetAll() {
      employeePaymentRefs.clear();
      try { localStorage.removeItem(EMP_PAY_REFS_KEY); } catch (_) {}
    }

    function renderPayClient() {
      const client = payTableId && tableClients.get(payTableId);
      $('#pc-client-label').textContent = client ? `${client.name} · ${Number(client.points) || 0} pts` : 'Client & fidélité';
    }

    function renderServiceClients() {
      const q = String($('#service-client-search').value || '').trim();
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      serviceClientRows = [];
      $('#service-client-list').textContent = employeeTranslation('Saisissez le numéro de téléphone complet.');
      if (q.replace(/\D/g, '').length < 10) return;
      fetch('/api/employee-clients?merchant=' + encodeURIComponent(merchant) + '&q=' + encodeURIComponent(q), {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then((r) => { if (!r.ok) throw new Error('lookup'); return r.json(); }).then((data) => {
        if ($('#service-client-search').value.trim() !== q) return;
        serviceClientRows = Array.isArray(data.clients) ? data.clients : [];
        $('#service-client-list').innerHTML = serviceClientRows.length ? serviceClientRows.map((c) => `
          <button class="td-btn ghost sm" type="button" data-service-client="${esc(c.id)}" style="text-align:left;justify-content:space-between;">
            <span><strong>${esc(c.name || 'Client')}</strong><br><small>${esc(c.phone || '')}</small></span>
            <span class="mono">${Number(c.points) || 0} pts</span>
          </button>`).join('') : '<p class="modal-subtle">' + employeeTranslation('Aucun client trouvé.') + '</p>';
      }).catch(() => { $('#service-client-list').textContent = employeeTranslation('Carnet indisponible.'); });
    }

    function openServiceClients() {
      $('#service-client-modal').classList.add('is-open');
      $('#service-client-search').value = '';
      renderServiceClients();
    }

    function openPayChoice(tableId) {
      if (svBrowseGuard()) return;
      payTableId = tableId;
      $('#pc-table-id').textContent = tableId;
      $('#pc-total').textContent = fmtMAD(getTableTotal(tableId));
      renderPayClient();
      $('#pay-choice-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function closePayChoice() {
      $('#pay-choice-modal').classList.remove('is-open');
    }

function serveurPaymentEvents1() {
$('#pay-choice-modal').addEventListener('click', (e) => {
      if (e.target.closest('#pc-client')) { openServiceClients(); return; }
      const choice = e.target.closest('[data-pay]');
      if (choice) {
        const method = choice.dataset.pay;
        closePayChoice();
        if (method === 'card')  openCardModal(payTableId);
        if (method === 'cash')  openCashModal(payTableId);
        if (method === 'split') openSplitModal(payTableId);
        return;
      }
      if (e.target.closest('#pc-cancel') || e.target === $('#pay-choice-modal')) {
        closePayChoice();
      }
    });
}

function serveurPaymentEvents2() {
$('#service-client-search').addEventListener('input', renderServiceClients);
}

function serveurPaymentEvents3() {
$('#service-client-modal').addEventListener('click', (e) => {
      const choice = e.target.closest('[data-service-client]');
      if (choice && payTableId) {
        const client = serviceClientRows.find((c) => String(c.id) === choice.dataset.serviceClient);
        if (client) tableClients.set(payTableId, client);
        $('#service-client-modal').classList.remove('is-open');
        renderPayClient();
        return;
      }
      if (e.target.closest('#service-client-none')) {
        if (payTableId) tableClients.delete(payTableId);
        $('#service-client-modal').classList.remove('is-open'); renderPayClient(); return;
      }
      if (e.target.closest('#service-client-close') || e.target === $('#service-client-modal')) {
        $('#service-client-modal').classList.remove('is-open');
      }
    });
}

    function cardReaderArm(tableId) {
      cardApproved = false;
      if (cardConfirmBtn) cardConfirmBtn.hidden = true;
      if (SV_DEMO) { cardSuccessTimer = setTimeout(() => triggerCardSuccess(tableId), 2000); return; }
      reader.disc.classList.remove('is-pulsing');
      reader.status.textContent = 'Encaissez sur le terminal carte, puis confirmez';
      reader.method.style.display = 'none';
      if (cardConfirmBtn) cardConfirmBtn.hidden = false;
    }

function serveurPaymentEvents4() {
if (cardConfirmBtn) cardConfirmBtn.addEventListener('click', () => triggerCardSuccess(payTableId));
}

    function openCardModal(tableId) {
      if (svBrowseGuard()) return;
      // Initial setup
      $$('[data-bind="table"]').forEach(el => el.textContent = tableId);
      const amount = currentPayAmount(tableId);
      $('#card-amount').textContent = fmtMADcents(amount);

      // Reset reader state
      reader.disc.classList.remove('is-success', 'flash');
      reader.disc.classList.add('is-pulsing');
      reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
      reader.status.classList.remove('is-success');
      reader.status.innerHTML = 'Approchez la carte ou le téléphone<span class="ellipsis"></span>';
      reader.method.style.display = '';
      reader.txn.hidden = true;
      reader.actions.classList.remove('is-visible');
      reader.foot.classList.remove('is-visible');

      // Mark table ka-tkhdam during payment (if it was bgha-ykhlass or ka-yaklo)
      if (tableId && !splitPayCallback && tables[tableId]) {
        const t = tables[tableId];
        if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
          t.status = 'ka-tkhdam';
          if (currentTab === 'tables') renderTables();
          if (activeTableId === tableId) renderTableDetail();
        }
      }

      cardModal.classList.add('is-open');
      lucide.createIcons();
      cardReaderArm(tableId);
    }

    function triggerCardSuccess(tableId) {
      reader.disc.classList.remove('is-pulsing');
      reader.disc.classList.add('flash', 'is-success');
      reader.disc.innerHTML = '<i data-lucide="check"></i>';
      reader.status.classList.add('is-success');
      cardApproved = true;
      if (cardConfirmBtn) cardConfirmBtn.hidden = true;
      reader.method.style.display = 'none';
      if (SV_DEMO) {
        reader.status.textContent = 'Carte approuvée';
        reader.txn.textContent = 'TXN #KW-' + (28000 + Math.floor(Math.random()*999));
        reader.txn.hidden = false;
      } else {
        reader.status.textContent = 'Paiement carte confirmé';
      }
      lucide.createIcons();
      setTimeout(() => reader.disc.classList.remove('flash'), 600);
      cardFootTimer = setTimeout(() => reader.foot.classList.add('is-visible'), 1000);
    }

    function closeCardModal({ paid = false, tableId = null } = {}) {
      paid = paid && cardApproved; // Fermer ne vaut jamais confirmation du terminal.
      cardModal.classList.remove('is-open');
      clearTimeout(cardSuccessTimer);
      clearTimeout(cardFootTimer);
      // Cancelled mid-split flow → restore split modal
      if (!paid && splitPayCallback) {
        splitPayCallback = null;
        $('#split-modal').classList.add('is-open');
        return;
      }
      if (!paid) {
        if (tableId && tables[tableId]?.status === 'ka-tkhdam') {
          tables[tableId].status = 'bgha-ykhlass';
          if (currentTab === 'tables') renderTables();
        }
        /* Toujours relire la fiche : le sondage peut avoir ramené la table à
           « en cours » pendant que la feuille était ouverte, et la fiche
           restait alors bloquée sur « Paiement en cours… » sans bouton. */
        if (tableId && activeTableId === tableId) renderTableDetail();
        return;
      }
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        cb();
        return;
      }
      if (tableId) markTablePaid(tableId, 'card');
    }

function serveurPaymentEvents5() {
cardModal.addEventListener('click', (e) => {
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      const tableId = payTableId;
      if (e.target === cardModal && !splitPayCallback) closeCardModal({ paid: cardApproved, tableId });
      if (action === 'close') closeCardModal({ paid: true, tableId });
    });
}

    function currentPayAmount(tableId) {
      if (cashAmountOverride !== null) return cashAmountOverride;
      if (!tableId) return 0;
      return getTableTotal(tableId);
    }

    function updateRendu() {
      const total = currentPayAmount(payTableId);
      const got = parseFloat(cashInput.value) || 0;
      const diff = got - total;
      cashRendu.classList.remove('is-positive', 'is-short');
      if (got >= total) {
        cashRendu.classList.toggle('is-positive', diff > 0);
        cashRenduVal.textContent = fmtMADcents(diff);
        cashConfirm.disabled = false;
      } else {
        cashRendu.classList.add('is-short');
        cashRenduVal.textContent = 'Manque ' + fmtMAD(total - got);
        cashConfirm.disabled = true;
      }
    }

    function openCashModal(tableId) {
      if (svBrowseGuard()) return;
      $$('[data-bind="table"]').forEach(el => el.textContent = tableId);
      cashSettled = false;
      if (!splitPayCallback) cashPay = null;
      cashStepInput.hidden = false;
      cashStepSuccess.hidden = true;
      const total = currentPayAmount(tableId);
      cashInput.value = total;
      $('#cash-amount').textContent = fmtMADcents(total);
      updateRendu();
      // mark ka-tkhdam if applicable
      if (tableId && !splitPayCallback && tables[tableId]) {
        const t = tables[tableId];
        if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
          t.status = 'ka-tkhdam';
          if (currentTab === 'tables') renderTables();
          if (activeTableId === tableId) renderTableDetail();
        }
      }
      cashModal.classList.add('is-open');
      lucide.createIcons();
      setTimeout(() => cashInput.focus(), 60);
    }

    function closeCashModal({ paid = false, tableId = null } = {}) {
      cashAmountOverride = null;
      if (!paid) { cashSettled = false; cashPay = null; }
      cashModal.classList.remove('is-open');
      // Cancelled mid-split flow → restore split modal
      if (!paid && splitPayCallback) {
        splitPayCallback = null;
        $('#split-modal').classList.add('is-open');
        return;
      }
      if (!paid) {
        if (tableId && tables[tableId]?.status === 'ka-tkhdam') {
          tables[tableId].status = 'bgha-ykhlass';
          if (currentTab === 'tables') renderTables();
        }
        /* Toujours relire la fiche : le sondage peut avoir ramené la table à
           « en cours » pendant que la feuille était ouverte, et la fiche
           restait alors bloquée sur « Paiement en cours… » sans bouton. */
        if (tableId && activeTableId === tableId) renderTableDetail();
        return;
      }
      cashSettled = false;
      cashPay = null;
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        cb();
        return;
      }
      /* La vente est déjà enregistrée par « Confirmer ». */
    }

function serveurPaymentEvents6() {
cashInput.addEventListener('input', updateRendu);
}

function serveurPaymentEvents7() {
$$('.cash-preset').forEach(b => b.addEventListener('click', () => {
      cashInput.value = (parseFloat(cashInput.value) || 0) + parseFloat(b.dataset.add);
      updateRendu();
    }));
}

function serveurPaymentEvents8() {
cashConfirm.addEventListener('click', async () => {
      if (cashConfirm.dataset.busy === '1' || cashSettled) return;
      const tableId = payTableId;
      const total = currentPayAmount(tableId);
      const got = parseFloat(cashInput.value) || 0;
      cashConfirm.dataset.busy = '1';
      cashConfirm.disabled = true;
      let ok = false;
      try { ok = cashPay ? await cashPay() : (tableId ? await markTablePaid(tableId, 'cash') : false); }
      catch (_) { ok = false; }
      cashConfirm.dataset.busy = '';
      if (!ok) { updateRendu(); return; }
      cashSettled = true;
      cashStepInput.hidden = true;
      cashStepSuccess.hidden = false;
      cashSuccessRendu.textContent = fmtMADcents(got - total);
      lucide.createIcons();
    });
}

function serveurPaymentEvents9() {
cashModal.addEventListener('click', (e) => {
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      const tableId = payTableId;
      if (e.target === cashModal) closeCashModal({ paid: cashSettled, tableId });
      if (action === 'close') closeCashModal({ paid: cashSettled, tableId });
    });
}

    async function markTablePaid(id, method) {
      if (svBrowseGuard()) return false;
      const t = tables[id];
      if (!t || employeePaymentsInFlight.has(id)) return false;
      const hasUnsent = (tableOrders[id] || []).some((line) =>
        Math.max(0, Number(line.qty) || 0) > Math.max(0, Number(line.sentQty) || 0));
      if (hasUnsent || dirtyOrders.has(id)) {
        toast(employeePick(`Table ${id} · envoyez d'abord la commande en cuisine`, `Table ${id} · send the order to the kitchen first`, `الطاولة ${id} · أرسل الطلب إلى المطبخ أولاً`), 4800);
        return false;
      }
      const paidAmount = getTableTotal(id);
      const paidClient = tableClients.get(id);
      const paidLines = (tableOrders[id] || []).map((line) => {
        const item = ((typeof svFormulaItems !== 'undefined' && svFormulaItems.length) ? svFormulaItems : menuItems).find((candidate) => String(candidate.id) === String(line.id)) || menuItems.find((candidate) => String(candidate.id) === String(line.id));
        return {
          name: String(line.name || 'Article'), qty: Math.max(1, Number(line.qty) || 1),
          total: Math.max(0, Number(line.price) || 0) * Math.max(1, Number(line.qty) || 1),
          cat: item && item.cat ? String(catLabels[item.cat] || item.cat) : '',
        };
      });
      const paymentId = employeePaymentId(id);
      const orderRef = serviceTableOrderRef(id);
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      const canonical = Array.from(serviceCanonicalOrders.values()).find((order) => order && !order.paid
        && String(order.table) === String(id) && order.session);
      const session = serviceTableSessions.get(id) || (canonical && String(canonical.session)) || '';
      if (!merchant || !session || paidAmount <= 0) {
        toast(employeePick(`Table ${id} · paiement impossible`, `Table ${id} · payment failed`, `الطاولة ${id} · تعذّر الدفع`), 4200);
        return false;
      }
      /* Hors ligne connu : échec immédiat, la table revient à « addition
         demandée », rien n'est écrit. */
      if (svKnownOffline()) {
        if (t.status === 'ka-tkhdam') t.status = 'bgha-ykhlass';
        if (currentTab === 'tables') renderTables();
        if (activeTableId === id) renderTableDetail();
        toast(SV_PAY_OFFLINE_MSG, 6000);
        return false;
      }
      employeePaymentsInFlight.add(id);
      const previousStatus = t.status;
      t.status = 'ka-tkhdam';
      if (currentTab === 'tables') renderTables();
      if (activeTableId === id) renderTableDetail();

      /* One server-confirmed settlement boundary. Previously postSale(), the
         floor close and the OrderPro-session close were three fire-and-forget
         calls; the phone showed “paid” even when D1 never received the sale.
         `/api/sale` now returns success only after the ledger and table are in
         agreement. Never free a table locally before that acknowledgement. */
      let saved = null;
      /* Délai réel (SV_PAY_TIMEOUT_MS). L'identifiant de paiement est stable :
         relancer après un délai rejoue la MÊME vente, jamais une seconde. */
      const payCtl = (typeof AbortController === 'function') ? new AbortController() : null;
      const payTimer = payCtl ? setTimeout(() => payCtl.abort(), SV_PAY_TIMEOUT_MS) : null;
      try {
        const response = await fetch('/api/sale', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          signal: payCtl ? payCtl.signal : undefined,
          body: JSON.stringify({
            id: paymentId, merchant, table: id, session, amount: paidAmount,
            amountCents: Math.round(paidAmount * 100),
            method: method || 'card', ts: Date.now(),
            label: orderRef,
            ref: orderRef, lines: paidLines,
          }),
        });
        saved = await response.json().catch(() => null);
        if (!response.ok || !saved || !saved.ok) throw Object.assign(new Error((saved && saved.error) || ('http-' + response.status)), { refused: true });
      } catch (err) {
        t.status = previousStatus === 'ka-tkhdam' ? 'bgha-ykhlass' : previousStatus;
        employeePaymentsInFlight.delete(id);
        if (currentTab === 'tables') renderTables();
        if (activeTableId === id) renderTableDetail();
        /* Refus du serveur, pas de réponse à temps (la vente a PU passer :
           on ne dit pas « non enregistré »), ou réseau tombé avant l'envoi. */
        /* Une carte a peut-être déjà été débitée au terminal : la relance rejoue
           la même vente (identifiant stable), repasser la carte la débiterait deux fois. */
        if (payCtl && payCtl.signal.aborted) {
          if ((method || 'card') === 'card') toast(employeePick(`Table ${id} · paiement non confirmé, ne repassez pas la carte, réessayez`, `Table ${id} · payment not confirmed, do not run the card again, just retry`, `الطاولة ${id} · لم يتأكد الدفع، لا تمرّر البطاقة مرة أخرى، أعد المحاولة فقط`), 6000);
          else toast(employeePick(`Table ${id} · paiement non confirmé, réessayez`, `Table ${id} · payment not confirmed, try again`, `الطاولة ${id} · لم يتأكد الدفع، أعد المحاولة`), 6000);
        } else if (err && !err.refused) toast(SV_PAY_OFFLINE_MSG, 6000);
        else toast(employeePick(`Table ${id} · paiement non enregistré, réessayez`, `Table ${id} · payment not saved, try again`, `الطاولة ${id} · لم يُسجَّل الدفع، أعد المحاولة`), 5200);
        return false;
      } finally {
        if (payTimer) clearTimeout(payTimer);
      }
      if (paidClient && !SV_DEMO) {
        fetch('/api/employee-clients', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          /* La fidélité se tire de LA vente que le serveur vient d'enregistrer
             (son montant vient de la base) : `saleId` lie les points à
             l'encaissement, et deux envois pour la même vente créditent une fois. */
          body: JSON.stringify({ merchant, clientId: paidClient.id, amount: paidAmount,
            saleId: String((saved && saved.id) || paymentId),
            ref: 'employee-payment:' + id + ':' + Date.now() }),
        }).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data && data.ok && !data.replayed) toast(employeePick(`${paidClient.name} · fidélité mise à jour`, `${paidClient.name} · loyalty updated`, `${paidClient.name} · تم تحديث الوفاء`));
        }).catch(() => {});
      }
      if (saved && saved.billOpen) {
        keepServiceBillOpen(id, saved);
        return true;
      }
      tableClients.delete(id);
      t.status = 'khawya';
      t.covers = 0;
      t.elapsed = 0;
      delete t.orderNo;
      serviceTableSessions.delete(id);
      delete tableOrders[id];
      dirtyOrders.delete(id);
      tableSplits.delete(id);
      /* La vente est enregistrée mais l'état du plan de salle n'a pas pu
         s'écrire (verrou optimiste perdu sous charge). L'argent est en sécurité
         — c'est pour ça que le serveur répond désormais 200 — et il ne reste
         qu'à rattraper l'affichage : on repousse l'état libre de la table, ce
         que le document partagé accepte comme n'importe quel autre battement. */
      if (saved && saved.settlementPending) {
        publishServiceTableState(id, 'khawya', 0, true);
      }
      employeePaymentRefForget(id);
      employeePaymentsInFlight.delete(id);
      tablesPaid++;
      // Update views
      if (activeTableId === id) {
        returnToFloor();  // land on the floor, not a stale tab panel
      }
      if (currentTab === 'tables')   renderTables();
      if (currentTab === 'notifications') renderNotifications();
      if (currentTab === 'profil')   renderProfil();
      toast(employeePick(`Table ${id} · réglée ✓`, `Table ${id} · paid ✓`, `الطاولة ${id} · مدفوعة ✓`));
      return true;
    }

    function splitItemTotals(order) {
      const itemTotals = {};
      (order || []).forEach(l => {
        const unitPrice = Number(l.price) || 0;
        let key = l.name;
        if (itemTotals[key] && Math.round(itemTotals[key].unitPrice * 100) !== Math.round(unitPrice * 100)) key = `${l.name} · ${fmtMADcents(unitPrice)}`;
        if (!itemTotals[key]) itemTotals[key] = { totalQty: 0, unitPrice, ...(key !== l.name ? { baseName: l.name } : {}) };
        itemTotals[key].totalQty += l.qty;
      });
      return itemTotals;
    }

    function saveSplitFlow(state = splitState) {
      if (!state.tableId || !state.flow) return;
      const saved = {
        v: 2,
        mode: state.splitMode,
        totalCents: state.totalCents,
        parts: state.flow.parts,
        paidCount: state.flow.paidCount,
        id: state.flow.id,
      };
      tableSplits.set(state.tableId, saved);
      if (SV_DEMO) return true;
      const session = serviceTableSessions.get(state.tableId);
      if (!session) return false;
      // Avant tout envoi : le flux et ses parts survivent au recyclage iOS.
      try {
        const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
        for (const old of Object.keys(refs)) {
          if (old !== key && old.startsWith('split:' + empPayRefKey('visit') + ':')
            && Array.isArray(refs[old]?.parts) && refs[old].parts.every(p => p.paid)) delete refs[old];
        }
        refs[key] = saved;
        localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs));
        return true;
      } catch (_) { return false; }
    }

    function loadSplitFlow(tableId) {
      let saved = tableSplits.get(tableId);
      if (!saved && !SV_DEMO) {
        const session = serviceTableSessions.get(tableId);
        saved = session && empPayRefsRead()['split:' + empPayRefKey('visit') + ':' + session];
        /* Enregistré avant les centimes (v absent) : montants en dirhams, convertis une fois à la lecture. */
        if (saved && saved.v !== 2) saved = { ...saved, v: 2, totalCents: Math.round(saved.total * 100), parts: Array.isArray(saved.parts) ? saved.parts.map(p => p && { ...p, amountCents: Math.round(p.amount * 100) }) : saved.parts };
        if (saved && (!Array.isArray(saved.parts) || !saved.id || !saved.parts.length || !Number.isInteger(saved.totalCents)
          || saved.parts.some(p => !p || !Number.isInteger(p.amountCents) || p.amountCents < 0))) saved = null;
        if (saved) tableSplits.set(tableId, saved);
      }
      if (!saved) return false;
      splitState.tableId  = tableId;
      splitState.totalCents = saved.totalCents;
      splitState.splitMode = saved.mode;
      splitState.flow = {
        parts: saved.parts,
        paidCount: saved.paidCount,
        id: saved.id,
      };
      return true;
    }

    function effectiveTipPct() {
      if (splitState.tipMode === 'autre') return splitState.customTipPct;
      return parseFloat(splitState.tipMode) || 0;
    }

    function openSplitModal(tableId) {
      const t = tables[tableId];

      // If a split is already in progress for this table, resume it
      // directly on the payment-flow screen (skip setup).
      if (tableSplits.has(tableId) || loadSplitFlow(tableId)) {
        loadSplitFlow(tableId);
        $('#split-table-label').textContent = tableId;
        $('#split-setup').hidden = true;
        $('#split-flow').hidden  = false;
        $('#split-all-done').hidden = true;
        $('#split-parts-list').style.opacity = '';
        // Keep ka-tkhdam status (it's already ka-tkhdam from when split was launched)
        renderSplitFlow();
        $('#split-modal').classList.add('is-open');
        lucide.createIcons();
        return;
      }

      const order = ensureTableOrder(tableId);
      // Aggregate per unique item name (so the pool shows one row per
      // dish with its remaining count, not one card per unit)
      const itemTotals = splitItemTotals(order);
      // Le reste dû : un acompte déjà encaissé sur la visite n'est pas repartagé.
      const totalCents = Math.round(getTableTotal(tableId) * 100);
      Object.assign(splitState, {
        tableId, totalCents, itemTotals,
        splitMode: 'egal',
        numParts: Math.max(2, t.covers || 2),
        tipMode: '0', customTipPct: 0,
        numConvives: Math.max(2, t.covers || 2),
        perConvive: {}, activeConvive: 1, flow: null,
      });
      $('#split-table-label').textContent = tableId;
      $('#split-setup').hidden = false;
      $('#split-flow').hidden = true;
      $('#split-all-done').hidden = true;
      // mark ka-tkhdam
      if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
        t.status = 'ka-tkhdam';
        if (currentTab === 'tables') renderTables();
      }
      renderSplitSetup();
      $('#split-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function closeSplitModal({ skipRevert = false } = {}) {
      // If a flow exists and isn't fully paid, persist it so the server
      // can resume later. Table stays ka-tkhdam during the suspended split.
      const hasUnfinishedFlow = splitState.flow && splitState.tableId
        && splitState.flow.paidCount < splitState.flow.parts.length;
      if (hasUnfinishedFlow) {
        saveSplitFlow();
      } else if (!skipRevert && splitState.tableId && !tableSplits.has(splitState.tableId)) {
        // Setup phase only (no flow launched) — revert ka-tkhdam to bgha-ykhlass
        const t = tables[splitState.tableId];
        if (t?.status === 'ka-tkhdam') t.status = 'bgha-ykhlass';
      }

      $('#split-modal').classList.remove('is-open');
      splitPayCallback = null;
      cashAmountOverride = null;

      // Refresh views so list/detail reflect the new state
      if (currentTab === 'tables') renderTables();
      if (currentTab === 'notifications') renderNotifications();
      if (activeTableId && $('#screen-table').classList.contains('is-active')) {
        renderTableDetail();
      }
    }

    function renderSplitSetup() {
      $$('[data-split-tab]').forEach(t => t.classList.toggle('is-active', t.dataset.splitTab === splitState.splitMode));
      $('#split-egal-content').hidden = splitState.splitMode !== 'egal';
      $('#split-article-content').hidden = splitState.splitMode !== 'article';
      if (splitState.splitMode === 'egal') {
        $('#split-launch').disabled = false;
        $('#split-launch').textContent = 'Lancer le split';
        $('#split-launch').title = '';
        renderPartsChips(); renderTipChips(); updateSplitSummary();
      } else {
        renderArticleMode();
      }
      lucide.createIcons();
    }

    function remainingQty(itemName) {
      const total = splitState.itemTotals[itemName]?.totalQty || 0;
      let assigned = 0;
      for (const c in splitState.perConvive) {
        assigned += splitState.perConvive[c][itemName] || 0;
      }
      return total - assigned;
    }

    function conviveTotal(c) {
      const map = splitState.perConvive[c] || {};
      let sum = 0;
      for (const name in map) {
        sum += map[name] * (splitState.itemTotals[name]?.unitPrice || 0);
      }
      return sum;
    }

    function assignUnit(itemName) {
      if (!Number.isInteger(remainingQty(itemName)) || remainingQty(itemName) <= 0) return;
      const c = splitState.activeConvive;
      if (!splitState.perConvive[c]) splitState.perConvive[c] = {};
      splitState.perConvive[c][itemName] = (splitState.perConvive[c][itemName] || 0) + 1;
    }

    function unassignUnit(itemName) {
      const c = splitState.activeConvive;
      const map = splitState.perConvive[c];
      if (!map || !map[itemName]) return;
      map[itemName]--;
      if (map[itemName] <= 0) delete map[itemName];
    }

    function renderArticleMode() {
      renderConvivesChips();
      renderConvivesTabs();
      renderPool();
      renderConviveCart();
      const allocation = splitArticleAllocation();
      $('#split-launch').disabled = !allocation.ok;
      $('#split-launch').textContent = allocation.ok ? 'Encaisser les articles attribués' : allocation.message;
      $('#split-launch').title = allocation.message || '';
      lucide.createIcons();
    }

    function splitArticleAllocation() {
      const items = Object.entries(splitState.itemTotals || {});
      const n = Number(splitState.numConvives);
      const invalid = () => ({ ok: false, message: 'Attribution invalide : vérifiez les articles' });
      if (!items.length || !Number.isInteger(n) || n < 1) return invalid();
      const totals = new Map(items.map(([name, info]) => [name, info.totalQty]));
      const assigned = new Map();
      for (const [convive, cart] of Object.entries(splitState.perConvive || {})) {
        if (!Number.isInteger(Number(convive)) || Number(convive) < 1 || Number(convive) > n || !cart || typeof cart !== 'object') return invalid();
        for (const [name, qty] of Object.entries(cart)) {
          if (!totals.has(name) || !Number.isInteger(qty) || qty < 0) return invalid();
          assigned.set(name, (assigned.get(name) || 0) + qty);
        }
      }
      let remaining = 0;
      for (const [name, qty] of totals) {
        if (!Number.isInteger(qty) || qty < 0 || (assigned.get(name) || 0) > qty) return invalid();
        remaining += qty - (assigned.get(name) || 0);
      }
      return remaining ? { ok: false, message: `${remaining} article${remaining > 1 ? 's' : ''} à attribuer` } : { ok: true, message: '' };
    }

    function renderConvivesTabs() {
      const n = splitState.numConvives;
      $('#split-convives-tabs').innerHTML = Array.from({ length: n }, (_, i) => {
        const c = i + 1;
        const isActive = c === splitState.activeConvive;
        return `
          <button class="split-conv-tab ${isActive ? 'is-active' : ''}" data-conv-tab="${c}">
            <span class="split-conv-tab-label">Conv ${c}</span>
            <span class="split-conv-tab-total">${fmtMAD(conviveTotal(c))}</span>
          </button>`;
      }).join('');
    }

    function renderPool() {
      const items = Object.entries(splitState.itemTotals);
      $('#split-pool').innerHTML = items.map(([name, info]) => {
        const rem = remainingQty(name);
        const isEmpty = rem <= 0;
        return `
          <button class="split-pool-item ${isEmpty ? 'is-empty' : ''}" data-pool-item="${name}">
            <div class="split-pool-item-info">
              <div class="split-pool-item-name">${name}</div>
              <div class="split-pool-item-meta">
                <span class="remaining">${rem}</span> / ${info.totalQty} restant${info.totalQty > 1 ? 's' : ''} · ${info.unitPrice} MAD chacun
              </div>
            </div>
            <div class="split-pool-item-add">+</div>
          </button>`;
      }).join('');
    }

    function renderConviveCart() {
      const c = splitState.activeConvive;
      const cart = splitState.perConvive[c] || {};
      const entries = Object.entries(cart);
      const wrap = $('#split-convive-cart');

      if (entries.length === 0) {
        wrap.innerHTML = `<div class="split-convive-cart-empty-state">Convive ${c} n'a encore rien · tapez un article ci-dessus</div>`;
        return;
      }
      const total = conviveTotal(c);
      const rowsHTML = entries.map(([name, qty]) => {
        const unitPrice = splitState.itemTotals[name].unitPrice;
        const lineTotal = qty * unitPrice;
        const qtyPrefix = qty > 1 ? `${qty}× ` : '';
        return `
          <div class="split-convive-cart-row">
            <span class="split-convive-cart-name">${qtyPrefix}${name}</span>
            <div class="split-convive-cart-actions">
              <span class="split-convive-cart-price">${fmtMAD(lineTotal)}</span>
              <button class="split-convive-cart-remove" data-remove-item="${name}" aria-label="Retirer">×</button>
            </div>
          </div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="split-convive-cart">
          <div class="split-convive-cart-title">
            <span>Articles de Convive ${c}</span>
            <span class="split-convive-cart-total">${fmtMAD(total)}</span>
          </div>
          ${rowsHTML}
        </div>`;
    }

    function renderArticleItems() { renderArticleMode(); }

    function updateArticleTotals() { /* totals are now baked into convive tabs */ }

    function renderPartsChips() {
      $('#split-parts-chips').innerHTML = [2,3,4,5,6,8].map(n =>
        `<button class="split-chip ${n === splitState.numParts ? 'is-active' : ''}" data-parts="${n}">${n}</button>`
      ).join('');
    }

    function renderTipChips() {
      const opts = [{l:'0%',v:'0'},{l:'5%',v:'5'},{l:'10%',v:'10'},{l:'15%',v:'15'},{l:'autre',v:'autre'}];
      $('#split-tip-chips').innerHTML = opts.map(o =>
        `<button class="split-chip ${o.v === splitState.tipMode ? 'is-active' : ''}" data-tip="${o.v}">${o.l}</button>`
      ).join('');
      $('#split-tip-custom').classList.toggle('is-visible', splitState.tipMode === 'autre');
      if (splitState.tipMode === 'autre') {
        const inp = $('#split-tip-input');
        inp.value = splitState.customTipPct || '';
        setTimeout(() => inp.focus(), 60);
      }
    }

    function updateSplitSummary() {
      const tipPct = effectiveTipPct();
      const tipCents = Math.round(splitState.totalCents * tipPct / 100 + 1e-9);
      const perPerson = Math.round((splitState.totalCents + tipCents) / splitState.numParts) / 100;
      $('#split-total-display').textContent = fmtMADcents(splitState.totalCents / 100);
      const tipRow = $('#split-tip-row');
      if (tipPct > 0) {
        tipRow.style.display = '';
        $('#split-tip-label').textContent = `+ pourboire ${tipPct}%`;
        $('#split-tip-display').textContent = `+ ${fmtMADcents(tipCents / 100)}`;
      } else tipRow.style.display = 'none';
      $('#split-per-person').textContent = fmtMADcents(perPerson);
      $('#split-egal-desc').textContent = `${splitState.numParts} parts · ${fmtMADcents(perPerson)} chacun`;
    }

    function renderConvivesChips() {
      $('#split-convives-chips').innerHTML = [2,3,4,5,6,8].map(n =>
        `<button class="split-chip ${n === splitState.numConvives ? 'is-active' : ''}" data-convives="${n}">${n}</button>`
      ).join('');
    }

    function renderArticleItems() {
      const n = splitState.numConvives;
      $('#split-items-list').innerHTML = splitState.lines.map((l, idx) => {
        const assigned = splitState.assignments[idx] || 0;
        const isAssigned = assigned > 0;
        const chips = Array.from({length: n}, (_, i) => {
          const c = i + 1;
          return `<button class="split-convive-pick ${assigned === c ? 'is-assigned' : ''}" data-item="${idx}" data-convive="${c}" aria-label="Convive ${c}">${c}</button>`;
        }).join('');
        return `
          <div class="split-item-card ${isAssigned ? 'is-assigned' : ''}">
            <div class="split-item-card-head">
              <div class="split-item-card-name">${l.qty > 1 ? `${l.qty}× ` : ''}${esc(l.name)}</div>
              <div class="split-item-card-price">${fmtMAD(l.total)}</div>
            </div>
            <div class="split-item-card-body">
              <span class="split-item-card-prompt">Pour qui?</span>
              <div class="split-convive-chips-row">${chips}</div>
            </div>
          </div>`;
      }).join('');
    }

    function updateArticleTotals() {
      const n = splitState.numConvives;
      const totals = {};
      for (let c = 1; c <= n; c++) totals[c] = 0;
      splitState.lines.forEach((l, idx) => {
        const c = splitState.assignments[idx] || 0;
        if (c >= 1 && c <= n) totals[c] += l.total;
      });
      const unassigned = splitState.lines.reduce((s, l, idx) =>
        (splitState.assignments[idx] || 0) === 0 ? s + l.total : s, 0);
      $('#split-article-totals').innerHTML =
        Array.from({length: n}, (_, i) => {
          const c = i + 1;
          return `<div class="split-convive-total">
            <div class="lbl">Conv. ${c}</div>
            <div class="val">${fmtMAD(totals[c])}</div>
          </div>`;
        }).join('') +
        (unassigned > 0 ? `<div class="split-convive-total is-unassigned">
            <div class="lbl">Non assigné</div>
            <div class="val">${fmtMAD(unassigned)}</div>
          </div>` : '');
    }

    function launchSplitFlow() {
      /* Le partage par article attribue des plats entiers : avec un acompte
         déjà encaissé sur la visite, il ferait payer ces plats une seconde
         fois. Le reste se partage à parts égales. */
      if (splitState.splitMode !== 'egal' && Number(serviceVisitCredit.get(splitState.tableId)) > 0) {
        toast(employeePick('Un acompte est déjà réglé sur cette table · partagez le reste à parts égales', 'A deposit is already paid on this table · split the rest in equal shares', 'تم دفع عربون على هذه الطاولة · قسّم المتبقي بحصص متساوية'));
        return;
      }
      if (splitState.splitMode !== 'egal') {
        const allocation = splitArticleAllocation();
        if (!allocation.ok) { toast(allocation.message); return; }
      }
      const parts = [];
      if (splitState.splitMode === 'egal') {
        const cents = splitState.totalCents, n = splitState.numParts;
        if (!Number.isInteger(n) || n < 1 || !Number.isInteger(cents) || cents < n) { toast(employeePick('Montant insuffisant pour ces parts', 'Amount too small for these shares', 'المبلغ غير كافٍ لهذه الحصص')); return; }
        // Le dernier convive reçoit le reliquat, le pourboire reste hors recette.
        const pct = effectiveTipPct();
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast(employeePick('Pourboire invalide (0 à 100 %)', 'Invalid tip (0 to 100 %)', 'بقشيش غير صالح (0 إلى 100 %)')); return; }
        const tips = Math.round(cents * pct / 100 + 1e-9);
        const items = Object.entries(splitState.itemTotals);
        const allocate = (total, weights) => {
          const sum = weights.reduce((a, b) => a + b, 0);
          const values = weights.map(w => sum ? Math.floor(total * w / sum) : 0);
          let left = total - values.reduce((a, b) => a + b, 0);
          for (let j = 0; left > 0; j = (j + 1) % values.length) {
            if (weights[j] > 0) { values[j]++; left--; }
          }
          return values;
        };
        const weights = items.map(([, info]) => Math.round(info.totalQty * info.unitPrice * 100));
        if (!weights.length || !weights.some(w => w > 0)) { toast(employeePick('Addition sans article', 'Bill without items', 'فاتورة بلا أصناف')); return; }
        let remaining = allocate(cents, weights);
        const bases = Array.from({ length: n }, (_, i) => i === n - 1 ? cents - Math.floor(cents / n) * (n - 1) : Math.floor(cents / n));
        const tipShares = allocate(tips, bases);
        for (let i = 0; i < n; i++) {
          const base = bases[i], tipCents = tipShares[i];
          const shares = allocate(base, remaining);
          const lines = items.map(([name, info], j) => {
            remaining[j] -= shares[j];
            return { name: `${name} · 1/${n}`, qty: info.totalQty, unit: shares[j] / 100 / info.totalQty,
              price: shares[j] / 100 / info.totalQty, total: shares[j] / 100 };
          });
          parts.push({ amountCents: base, tipCents, label: tips ? 'Part égale · pourboire inclus' : 'Part égale', lines, paid: false, payMethod: null });
        }
      } else {
        const n = splitState.numConvives;

        for (let c = 1; c <= n; c++) {
          const cart = splitState.perConvive[c] || {};
          const amtCents = Object.entries(cart).reduce((s, [name, qty]) => s + qty * Math.round((splitState.itemTotals[name]?.unitPrice || 0) * 100), 0);
          if (amtCents < 1) continue; // skip empty convives

          const items = Object.entries(cart)
            .map(([name, qty]) => qty > 1 ? `${qty}× ${name}` : name)
            .join(', ');
          const assignedLines = Object.entries(cart).map(([name, qty]) => {
            const unitPrice = splitState.itemTotals[name]?.unitPrice || 0;
            const baseName = splitState.itemTotals[name]?.baseName;
            return {
              name, ...(baseName ? { baseName } : {}),
              qty,
              unit: unitPrice,
              price: unitPrice,
              total: (qty * Math.round(unitPrice * 100)) / 100,
            };
          });
          const partLines = assignedLines;
          parts.push({
            amountCents: amtCents,
            label: items || 'Part équilibrée',
            lines: partLines,
            paid: false, payMethod: null,
          });
        }
      }
      splitState.flow = { parts, paidCount: 0, id: 'split-' + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) };
      $('#split-setup').hidden = true;
      $('#split-flow').hidden = false;
      renderSplitFlow();
      lucide.createIcons();
    }

    function renderSplitFlow() {
      const { parts, paidCount } = splitState.flow;
      $('#split-flow-progress').textContent = `${paidCount} / ${parts.length} réglées`;
      $('#split-parts-list').innerHTML = parts.map((p, idx) => {
        if (p.paid) {
          return `<div class="split-part-card is-paid">
            <div class="split-part-num"><i data-lucide="check"></i></div>
            <div class="split-part-info">
              <div class="split-part-amount">${fmtMADcents((p.amountCents + (p.tipCents || 0)) / 100)}</div>
              <div class="split-part-paid-label">Réglé · ${p.payMethod === 'carte' ? 'Carte' : 'Espèces'}</div>
            </div>
          </div>`;
        }
        return `<div class="split-part-card">
          <div class="split-part-num">${idx + 1}</div>
          <div class="split-part-info">
            <div class="split-part-amount">${fmtMADcents((p.amountCents + (p.tipCents || 0)) / 100)}</div>
            <div class="split-part-label">${esc(p.label)}</div>
          </div>
          <div class="split-part-btns">
            <button class="split-part-btn carte" data-pay-part="${idx}" data-pay-method="carte">
              <i data-lucide="credit-card"></i> Carte
            </button>
            <button class="split-part-btn cash-dark" data-pay-part="${idx}" data-pay-method="cash">
              <i data-lucide="banknote"></i> Cash
            </button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    function paySplitPart(partIdx, method) {
      const part = splitState.flow.parts[partIdx];
      if (!part || part.paid) return;
      payTableId = splitState.tableId;

      // Hide the split modal while the sub-modal (card/cash) is active.
      // The close handlers will re-open it.
      $('#split-modal').classList.remove('is-open');

      if (method === 'carte') {
        $('#card-amount').textContent = fmtMADcents((part.amountCents + (part.tipCents || 0)) / 100);
        $$('[data-bind="table"]').forEach(el => el.textContent = `Part ${partIdx + 1} · ${splitState.tableId}`);
        splitPayCallback = () => {
          markSplitPartPaid(partIdx, 'carte');
          $('#split-modal').classList.add('is-open');
        };
        reader.disc.classList.remove('is-success', 'flash');
        reader.disc.classList.add('is-pulsing');
        reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
        reader.status.classList.remove('is-success');
        reader.status.innerHTML = 'Approchez la carte<span class="ellipsis"></span>';
        reader.method.style.display = '';
        reader.txn.hidden = true;
        reader.actions.classList.remove('is-visible');
        reader.foot.classList.remove('is-visible');
        cardModal.classList.add('is-open');
        lucide.createIcons();
        cardReaderArm(payTableId);
      } else {
        cashAmountOverride = (part.amountCents + (part.tipCents || 0)) / 100;
        $$('[data-bind="table"]').forEach(el => el.textContent = `Part ${partIdx + 1} · ${splitState.tableId}`);
        cashPay = () => markSplitPartPaid(partIdx, 'cash');
        cashSettled = false;
        splitPayCallback = () => {
          $('#split-modal').classList.add('is-open');
        };
        cashStepInput.hidden = false;
        cashStepSuccess.hidden = true;
        cashInput.value = cashAmountOverride;
        $('#cash-amount').textContent = fmtMADcents((part.amountCents + (part.tipCents || 0)) / 100);
        updateRendu();
        cashModal.classList.add('is-open');
        lucide.createIcons();
        setTimeout(() => cashInput.focus(), 60);
      }
    }

    async function markSplitPartPaid(partIdx, method) {
      if (svBrowseGuard()) return false;
      const state = { ...splitState };
      const flow = state.flow;
      const p = flow && flow.parts && flow.parts[partIdx];
      if (!p || p.paid) return false;

      const tableId = state.tableId;
      const t = tableId && tables[tableId];
      const payMethod = (method === 'carte' || method === 'card') ? 'card' : 'cash';

      const partFlightKey = tableId ? (tableId + ':split:' + partIdx) : ('split:' + partIdx);
      if (employeePaymentsInFlight.has(partFlightKey)) return false;

      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      const canonical = Array.from(serviceCanonicalOrders.values()).find((order) => order && !order.paid
        && String(order.table) === String(tableId) && order.session);
      const session = (tableId && serviceTableSessions.get(tableId)) || (canonical && String(canonical.session)) || '';
      if (!SV_DEMO && (!merchant || !session)) {
        toast(employeePick('Session de service expirée · reconnectez-vous', 'Service session expired · sign in again', 'انتهت جلسة الخدمة · أعد تسجيل الدخول'), 5200);
        return false;
      }
      const orderRef = tableId ? serviceTableOrderRef(tableId) : '';
      const partPaymentId = p.saleId || (tableId ? employeePaymentId(tableId + ':split:' + partIdx) : '');

      /* Hors ligne connu : échec immédiat, la part reste due, la feuille
         reste ouverte avec son montant. (navigator absent hors navigateur.) */
      if (!SV_DEMO && typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        toast(employeePick("Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.", 'No network. The payment is not recorded, try again when the network is back.', 'لا توجد شبكة. لم يُسجَّل الدفع، أعد المحاولة عند عودة الشبكة.'), 6000);
        return false;
      }

      let saved = null;
      let payTimer = null;
      const payCtl = (typeof AbortController === 'function' && typeof setTimeout === 'function') ? new AbortController() : null;
      if (!SV_DEMO && saveSplitFlow(state) === false) {
        toast(employeePick('Stockage indisponible : paiement non envoyé, gardez cette addition ouverte', 'Storage unavailable: payment not sent, keep this bill open', 'التخزين غير متاح: لم يُرسَل الدفع، أبقِ هذه الفاتورة مفتوحة'), 6000);
        return false;
      }
      employeePaymentsInFlight.add(partFlightKey);
      try {
        if (!SV_DEMO) {
          /* Délai réel (15 s) : l'identifiant de la part est stable, une
             relance après délai rejoue la même vente, jamais une seconde. */
          if (payCtl) payTimer = setTimeout(() => payCtl.abort(), 15000);
          const response = await fetch('/api/sale', {
            ...(payCtl ? { signal: payCtl.signal } : {}),
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: partPaymentId,
              merchant,
              table: tableId,
              session,
              split: { index: partIdx, count: flow.parts.length, flowId: flow.id },
              amount: p.amountCents / 100,
              amountCents: p.amountCents,
              tipCents: p.tipCents || 0,
              method: payMethod,
              ts: Date.now(),
              label: (orderRef ? (orderRef + ' · ') : '') + `Part ${partIdx + 1}`,
              ref: (orderRef ? (orderRef + ' · ') : '') + `Part ${partIdx + 1}`,
              lines: (Array.isArray(p.lines) && p.lines.length) ? p.lines : [{
                name: (tableId ? `Table ${tableId}` : 'Table') + ` · part ${partIdx + 1}`,
                qty: 1,
                total: p.amountCents / 100,
                cat: '',
              }],
            }),
          });
          saved = await response.json().catch(() => null);
          if (!response.ok || !saved || !saved.ok) {
            const refused = new Error((saved && saved.error) || ('http-' + response.status));
            refused.refused = true;
            throw refused;
          }
        }
      } catch (err) {
        if (payCtl && payCtl.signal.aborted) {
          if (payMethod === 'card') toast(employeePick(`Table ${tableId || ''} · part ${partIdx + 1} non confirmée, ne repassez pas la carte, réessayez`, `Table ${tableId || ''} · share ${partIdx + 1} not confirmed, do not run the card again, just retry`, `الطاولة ${tableId || ''} · لم يتأكد الجزء ${partIdx + 1}، لا تمرّر البطاقة مرة أخرى، أعد المحاولة فقط`), 6000);
          else toast(employeePick(`Table ${tableId || ''} · part ${partIdx + 1} non confirmée, réessayez`, `Table ${tableId || ''} · share ${partIdx + 1} not confirmed, try again`, `الطاولة ${tableId || ''} · لم يتأكد الجزء ${partIdx + 1}، أعد المحاولة`), 6000);
        } else if (err && !err.refused) toast(employeePick("Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.", 'No network. The payment is not recorded, try again when the network is back.', 'لا توجد شبكة. لم يُسجَّل الدفع، أعد المحاولة عند عودة الشبكة.'), 6000);
        else toast(employeePick(`Table ${tableId || ''} · part ${partIdx + 1} non enregistrée, réessayez`, `Table ${tableId || ''} · share ${partIdx + 1} not saved, try again`, `الطاولة ${tableId || ''} · لم يُسجَّل الجزء ${partIdx + 1}، أعد المحاولة`), 5200);
        return false;
      } finally {
        if (payTimer) clearTimeout(payTimer);
        employeePaymentsInFlight.delete(partFlightKey);
      }

      p.paid = true;
      p.payMethod = method;
      if (partPaymentId) p.saleId = (saved && saved.id) || partPaymentId;
      flow.paidCount = flow.parts.filter(part => part.paid).length;
      const completesTable = Boolean(tableId && flow.parts.every(part => part.paid));
      try { servicePaymentTally(p.amountCents / 100, completesTable ? (t && t.elapsed) || 0 : 0); } catch (_) {}
      const visibleFlow = splitState.flow && splitState.flow.parts === flow.parts;
      if (visibleFlow) splitState.flow.paidCount = flow.paidCount;

      // Persist progress so it survives a modal dismissal
      saveSplitFlow(state);
      if (visibleFlow) renderSplitFlow();

      // Live-update the underlying table card if visible
      if (currentTab === 'tables') renderTables();
      if (currentTab === 'notifications') renderNotifications();

      if (completesTable && saved && saved.billOpen) {
        for (let i = 0; i < flow.parts.length; i++) employeePaymentRefForget(tableId + ':split:' + i);
        if (visibleFlow) splitState.flow = null;
        keepServiceBillOpen(tableId, saved);
        if (visibleFlow) closeSplitModal({ skipRevert: true });
        return true;
      }
      if (completesTable) {
        if (visibleFlow) {
          $('#split-parts-list').style.opacity = '0.45';
          $('#split-all-done').hidden = false;
        }

        const paidClient = tableId && tableClients.get(tableId);
        if (paidClient && !SV_DEMO) {
          fetch('/api/employee-clients', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant, clientId: paidClient.id, amount: state.totalCents / 100,
              ref: 'employee-payment:' + tableId + ':' + Date.now(),
            }),
          }).then((r) => r.ok ? r.json() : null).then((data) => {
            if (data && data.ok && !data.replayed) toast(employeePick(`${paidClient.name} · fidélité mise à jour`, `${paidClient.name} · loyalty updated`, `${paidClient.name} · تم تحديث الوفاء`));
          }).catch(() => {});
        }

        if (tableId) {
          tableClients.delete(tableId);
          if (t) {
            t.status = 'khawya';
            t.covers = 0;
            t.elapsed = 0;
            delete t.orderNo;
          }
          serviceTableSessions.delete(tableId);
          delete tableOrders[tableId];
          dirtyOrders.delete(tableId);
          tableSplits.delete(tableId);
          if (saved && saved.settlementPending) {
            publishServiceTableState(tableId, 'khawya', 0, true);
          }
          for (let i = 0; i < flow.parts.length; i++) {
            employeePaymentRefForget(tableId + ':split:' + i);
          }
          employeePaymentRefForget(tableId);
          employeePaymentsInFlight.delete(tableId);
          tablesPaid++;
          try { servicePaymentTally(0); } catch (_) {} // Sauver aussi le nombre de tables réglées.

          if (activeTableId === tableId) {
            returnToFloor();
          }
          if (currentTab === 'tables') renderTables();
          if (currentTab === 'notifications') renderNotifications();
          if (currentTab === 'profil') renderProfil();
          toast(employeePick(`Table ${tableId} · réglée ✓`, `Table ${tableId} · paid ✓`, `الطاولة ${tableId} · مدفوعة ✓`));
        }
        lucide.createIcons();
      }
      return true;
    }

function serveurPaymentEvents10() {
$('#split-modal').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-split-tab]');
      if (tab) { splitState.splitMode = tab.dataset.splitTab; renderSplitSetup(); return; }
      const partsChip = e.target.closest('[data-parts]');
      if (partsChip) { splitState.numParts = parseInt(partsChip.dataset.parts); renderPartsChips(); updateSplitSummary(); return; }
      const tipChip = e.target.closest('[data-tip]');
      if (tipChip) { splitState.tipMode = tipChip.dataset.tip; renderTipChips(); updateSplitSummary(); return; }
      // 1 · Number of convives → reset assignments
      const convivesChip = e.target.closest('[data-convives]');
      if (convivesChip) {
        splitState.numConvives = parseInt(convivesChip.dataset.convives);
        splitState.perConvive = {};
        splitState.activeConvive = 1;
        renderArticleMode();
        return;
      }
      // 2 · Switch the active convive (tab)
      const convTab = e.target.closest('[data-conv-tab]');
      if (convTab) {
        splitState.activeConvive = parseInt(convTab.dataset.convTab);
        renderArticleMode();
        return;
      }
      // 3 · Tap an item in the pool → assign one unit to active convive
      const poolItem = e.target.closest('[data-pool-item]');
      if (poolItem) {
        assignUnit(poolItem.dataset.poolItem);
        renderArticleMode();
        return;
      }
      // × on an assigned item → remove one unit from active convive
      const removeBtn = e.target.closest('[data-remove-item]');
      if (removeBtn) {
        unassignUnit(removeBtn.dataset.removeItem);
        renderArticleMode();
        return;
      }
      if (e.target.closest('#split-launch')) { launchSplitFlow(); return; }
      if (e.target.closest('#split-cancel')) { closeSplitModal(); return; }
      if (e.target.closest('#split-done-close')) { closeSplitModal({ skipRevert: true }); return; }
      // "Plus tard" — close the flow without losing progress
      if (e.target.closest('#split-flow-close')) { closeSplitModal(); return; }
      const payBtn = e.target.closest('[data-pay-part]');
      if (payBtn) { paySplitPart(parseInt(payBtn.dataset.payPart), payBtn.dataset.payMethod); return; }
      // Tap on backdrop — always allowed now (progress persists per-table)
      if (e.target === $('#split-modal')) closeSplitModal();
    });
}

function serveurPaymentEvents11() {
document.addEventListener('input', (e) => {
      if (e.target.id === 'split-tip-input') {
        splitState.customTipPct = parseFloat(e.target.value) || 0;
        updateSplitSummary();
      }
    });
}

