/* Owner: caisse refunds and voids.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    function refundApprovalExpiry(entry) {
      try {
        const token = String(entry && entry.refundActor && entry.refundActor.approval || '');
        const raw = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        if (!raw) return 0;
        const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
        const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        return Number(payload && payload.exp) || 0;
      } catch (_) { return 0; }
    }
    function refundHasCashException(entry) {
      return !!(entry && (entry.cashHandedOut === true || Number(entry.cashHandedOutAt) > 0
        || entry.refundReconciliation === 'cash-handed-out'));
    }
    function applyAcceptedRefund(entry) {
      if (!entry || entry.refundSyncStatus !== 'accepted' || !entry.refundLedgerReversed) return;
      const amount = money(Math.abs(Number(entry.amount) || 0));
      const original = refundOriginalFor(entry);
      if (original) {
        original.refundedAmount = money(refundedSoFar(original) + amount);
        original.refunded = refundableLeft(original) <= 0;
      }
      shift.refunds = money((shift.refunds || 0) + amount);
      delete entry.refundLedgerReversed;
    }
    function markRejectedRefund(entry, status) {
      if (!entry || entry.kind !== 'refund') return;
      entry.refundSyncStatus = 'rejected';
      entry.refundRejectedStatus = Number(status) || 0;
      entry.refundRejectedAt = Date.now();
      entry.refundSyncNeedsApproval = false;
      /* Keep the rejected negative receipt as evidence. If cash really left the
         drawer, retain that exception instead of rewriting the physical fact. */
      if (refundHasCashException(entry)) {
        entry.refundReconciliation = 'cash-handed-out';
        entry.refundLedgerReversed = false;
        return;
      }
      if (entry.refundLedgerReversed) return;
      const amount = money(Math.abs(Number(entry.amount) || 0));
      const original = refundOriginalFor(entry);
      if (original) {
        original.refundedAmount = money(Math.max(0, refundedSoFar(original) - amount));
        original.refunded = refundableLeft(original) <= 0;
      }
      shift.refunds = money(Math.max(0, (shift.refunds || 0) - amount));
      entry.refundLedgerReversed = true;
    }
    function refundRecoveryCandidates() {
      if (!storeIsReal()) return [];
      return journal.filter((entry) => entry && entry.kind === 'refund' && Number(entry.amount) < 0
        && !entry.voided && !entry.refundSynced && entry.refundSyncStatus !== 'rejected'
        && (entry.refundSyncNeedsApproval || refundApprovalExpiry(entry) <= Date.now() + 30000));
    }
    function renderRefundRecovery() {
      const host = $('#rf-recovery');
      if (!host) return;
      const rows = refundRecoveryCandidates();
      host.hidden = rows.length === 0;
      if (!rows.length) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="rf-recovery-head"><strong>Remboursements à synchroniser</strong>`
        + `<span class="rf-recovery-count mono">${rows.length}</span></div>`
        + `<p>Ils sont déjà déduits de cette caisse, mais pas encore des rapports. Un manager doit confirmer chaque montant.</p>`
        + rows.map((entry) => {
          const original = refundOriginalFor(entry);
          const label = original ? original.label : (entry.refundOf || 'Vente introuvable');
          return `<div class="rf-recovery-row"><span class="rf-recovery-main">`
            + `<b>${escTeam(label)}</b><span>${escTeam(entry.refundOf || '')} · <bdi dir="ltr">−${fmtMAD(Math.abs(Number(entry.amount) || 0))}</bdi></span></span>`
            + `<button type="button" class="ma-btn danger rf-recovery-btn" data-rf-recover="${escTeam(entry.id || entry.ref)}">Autoriser et synchroniser</button></div>`;
        }).join('');
      try { window.KiwiCaisseLang?.apply?.(host); } catch (_) {}
    }

    function recoverRefund(entry) {
      const original = refundOriginalFor(entry);
      if (!original) { toast('Ticket original introuvable · aucune écriture envoyée'); return; }
      const amountCents = Math.abs(Math.round(Number(entry.amount) * 100));
      const originalSaleId = String(original.serverSaleId || window.KiwiLive?.moneyId?.(original) || '');
      const refundServerId = String(entry.serverSaleId || window.KiwiLive?.moneyId?.(entry) || '');
      if (!amountCents || !originalSaleId || !refundServerId) {
        toast('Synchronisation impossible · aucune écriture envoyée'); return;
      }
      window.KiwiAuthAct?.({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amountCents / 100) } });
      requireManager('Synchroniser le remboursement · ' + fmtMAD(amountCents / 100), () => {
        const manager = window.KiwiCaissePairing?.lastManager?.() || {};
        if (!manager.approval) { toast('Autorisation manager non reçue'); return; }
        entry.refundActor = {
          id: String(manager.id || '').slice(0, 96), name: String(manager.name || '').slice(0, 80),
          role: String(manager.role || '').slice(0, 80), approval: String(manager.approval).slice(0, 1400),
        };
        entry.refundSyncNeedsApproval = false;
        entry.refundSyncStatus = 'pending';
        entry.refundRecoveryRequestedAt = Date.now();
        const queued = window.KiwiLive?.postRefund?.(entry, original, manager, { replaceExisting: true }) || null;
        if (queued && queued.id) entry.serverSaleId = queued.id;
        try { persistShift(); } catch (_) {}
        try { saveProvisional(true); } catch (_) {}
        renderRefundRecovery();
        toast(queued && queued.ok !== false
          ? 'Remboursement autorisé · synchronisation en cours'
          : 'Remboursement conservé · synchronisation impossible');
      }, { kind: 'refund', refundId: refundServerId, originalSaleId, amountCents });
    }

    function refundedSoFar(entry) {
      if (!entry) return 0;
      if (entry.refundedAmount != null) return money(Math.max(0, entry.refundedAmount));
      return entry.refunded ? money(entry.amount) : 0;   // legacy full-refund flag
    }
    function refundableLeft(entry) { return money(Math.max(0, money(entry.amount) - refundedSoFar(entry))); }

    function refundOriginalFor(entry) {
      if (!entry || entry.kind !== 'refund') return null;
      const id = String(entry.refundOfId || '').trim();
      if (id) return journal.find((sale) => sale && sale.kind !== 'refund' && sale.id === id) || null;
      /* Legacy refunds kept only the printed ref. It is not a payment ID:
         split parts share it, so never attach an ambiguous old refund to the
         first matching receipt. */
      const ref = String(entry.refundOf || '').trim();
      if (!ref) return null;
      const matches = journal.filter((sale) => {
        if (!sale || sale.kind === 'refund') return false;
        let cloudId = '';
        try { cloudId = String(window.KiwiLive?.saleIdFor?.(sale, currentMerchantSlug()) || ''); } catch (_) {}
        return [sale.ref, sale.id, sale.serverSaleId, cloudId]
          .some((value) => String(value || '').trim() === ref);
      });
      return matches.length === 1 ? matches[0] : null;
    }

    function refundableJournal() {
      // Newest first · only real sales (positive, not already refunded).
      return journal.slice().reverse()
        .filter(e => !e.voided && e.kind !== 'refund' && e.amount > 0);
    }
    function renderRefundList() {
      const q    = refundState.search.trim().toLowerCase();
      const list = refundableJournal().filter(e =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );
      const body = $('#rf-list');
      if (!body) return;
      if (list.length === 0) {
        body.innerHTML = '<div class="rf-empty">Walo, aucune transaction ne correspond.</div>';
        return;
      }
      body.innerHTML = list.map(e => {
        const hh = String(e.time.getHours()).padStart(2, '0');
        const mm = String(e.time.getMinutes()).padStart(2, '0');
        const icon   = e.method === 'cash' ? 'banknote' : 'credit-card';
        const mLabel = e.method === 'cash' ? 'Espèces'  : 'Carte';
        const done   = refundableLeft(e) <= 0;
        return `<button class="rf-entry" data-rf-id="${escTeam(e.id || '')}"${done || !e.id ? ' disabled' : ''}>`
             + `<span class="rf-entry-ic rf-entry-ic--${e.method}"><i data-lucide="${icon}"></i></span>`
             + `<span class="rf-entry-main">`
             +   `<span class="rf-entry-label">${escTeam(e.label)}`
             +     (done ? `<span class="rf-done-tag">remboursé</span>` : '')
             +   `</span>`
             +   `<span class="rf-entry-meta">${hh}:${mm} · ${mLabel} · ${escTeam(e.ref)}</span>`
             + `</span>`
             + `<span class="rf-entry-amount">${fmtMAD(e.amount)}</span>`
             + `</button>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }
    function renderRefundPreview() {
      const o  = refundState.orig;
      const pv = $('#rf-preview');
      if (!o) return;
      const amt  = refundState.amount;
      const left = money(refundableLeft(o) - amt);
      pv.innerHTML =
        `<span class="rf-pv-from mono">Vente ${fmtMAD(o.amount)}</span>`
        + `<span class="rf-pv-arrow">→</span>`
        + `<span class="rf-pv-to mono">${left > 0 ? 'Reste ' + fmtMAD(left) : 'Remboursé en entier'}</span>`
        + `<span class="rf-pv-cut mono">−${fmtMAD(amt)}</span>`;
      $('#rf-confirm-label').textContent = 'Rembourser ' + fmtMAD(amt);
    }
    function showRefundStep(step) {
      $('#rf-step-pick').hidden    = step !== 'pick';
      $('#rf-step-confirm').hidden = step !== 'confirm';
    }
    function openRefundConfirm(orig) {
      refundState.orig   = orig;
      refundState.amount = refundableLeft(orig);  // default · remaining refundable amount
      refundState.reason = 'Erreur de saisie';
      const hh = String(orig.time.getHours()).padStart(2, '0');
      const mm = String(orig.time.getMinutes()).padStart(2, '0');
      const icon   = orig.method === 'cash' ? 'banknote' : 'credit-card';
      const mLabel = orig.method === 'cash' ? 'Espèces'  : 'Carte';
      $('#rf-picked').innerHTML =
        `<span class="rf-picked-ic rf-picked-ic--${orig.method}"><i data-lucide="${icon}"></i></span>`
        + `<span class="rf-picked-main">`
        +   `<span class="rf-picked-label">${orig.label}</span>`
        +   `<span class="rf-picked-meta">${hh}:${mm} · ${mLabel} · ${orig.ref}</span>`
        + `</span>`
        + `<span class="rf-picked-amount">${fmtMAD(orig.amount)}</span>`;
      $('#rf-amount').value = String(refundState.amount);
      $('#rf-amount').max   = String(refundableLeft(orig));
      $$('#rf-reasons .rf-reason').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rfReason === 'Erreur de saisie'));
      renderRefundPreview();
      showRefundStep('confirm');
      if (window.lucide) lucide.createIcons();
    }
    function openRefund() {
      if (isFeatureOff('remboursement') || isFeatureOff('refund')) {
        toast('Remboursements désactivés pour cet établissement');
        return;
      }
      refundState.search = '';
      refundState.orig   = null;
      $('#rf-search-input').value = '';
      renderRefundRecovery();
      renderRefundList();
      showRefundStep('pick');
      refundModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      // A hardware keyboard gets the search focused; a touch screen does not
      // get its keyboard thrown over the list it came to scan.
      if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) setTimeout(() => { const s = $('#rf-search-input'); if (s) s.focus(); }, 60);
    }
    function closeRefund() { refundModal.classList.remove('is-open'); }

    function clampRefundAmount() {
      const o = refundState.orig;
      if (!o) return;
      let amt = money(parseFloat($('#rf-amount').value) || 0);
      const left = refundableLeft(o);
      amt = left <= 0 ? 0 : Math.max(0.01, Math.min(amt, left));
      refundState.amount = money(amt);
    }
    function confirmRefund() {
      const orig = refundState.orig;
      if (!orig) { showRefundStep('pick'); return; }
      if (refundableLeft(orig) <= 0) { toast('Transaction déjà remboursée'); return; }
      clampRefundAmount();
      const amount = refundState.amount;
      if (amount <= 0) { toast('Saisis un montant'); return; }
      const refundLocalId = 'refund-' + Date.now() + '-' + journal.length;
      const originalSaleId = String(orig.serverSaleId || window.KiwiLive?.moneyId?.(orig) || '');
      const refundServerId = String(window.KiwiLive?.moneyId?.({ id: refundLocalId }) || '');
      window.KiwiAuthAct?.({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amount) } });
      requireManager('Remboursement', () => {
        if (refundableLeft(orig) <= 0) { toast('Transaction déjà remboursée'); return; }
        /* Un autre remboursement du même ticket a pu être accepté pendant la
           validation : le montant validé dépasserait alors ce qui reste. */
        if (Math.round(amount * 100) > Math.round(refundableLeft(orig) * 100)) {
          toast('Le ticket a changé pendant la validation · relancez le remboursement'); return;
        }
        const manager = window.KiwiCaissePairing?.lastManager?.() || {};
        // NEGATIVE journal entry · NOT via recordSale (it rejects amount<=0).
        const entry = {
          id: refundLocalId,
          time: new Date(),
          label: 'Remboursement · ' + orig.label,
          amount: -amount,
          method: orig.method,
          ref: genRef(),
          kind: 'refund',
          refundOf: orig.ref,
          refundOfId: orig.id,
          reason: refundState.reason,
          refundSyncStatus: 'pending',
          refundLedgerReversed: false,
          cashier: (currentCashier && currentCashier.name) || '',
          refundActor: {
            id: String(manager.id || '').slice(0, 96),
            name: String(manager.name || '').slice(0, 80),
            role: String(manager.role || '').slice(0, 80),
            approval: String(manager.approval || '').slice(0, 1400),
          },
          /* Le panier remboursé, quand le ticket d'origine le portait · un
             remboursement partiel n'en reprend pas les lignes (le montant seul
             est vrai), un remboursement total les reprend toutes. */
          lines: (amount === orig.amount && Array.isArray(orig.lines)) ? orig.lines : null,
        };
        /* Un remboursement est un reçu comme un autre : le client repart avec.
           Il porte son propre numéro, la référence du ticket d'origine, et il
           se fige au même titre. */
        attachReceipt(entry);
        window.KiwiTillTenant?.stamp(entry);
        journal.push(entry);
        orig.refundedAmount = money(refundedSoFar(orig) + amount);
        orig.refunded = refundableLeft(orig) <= 0;
        shift.refunds = money(shift.refunds + amount); // positive · Clôture renders it as a row
        lastSaleId = entry.id;
        try { persistShift(); } catch (_) {}
        renderShiftStats();
        /* Un remboursement change le TOTAL. Il passe par son endpoint append-only
           (l'endpoint vente continue de refuser les montants ≤ 0), puis le même
           flux alimente Caisse, Dashboard et God Mode avec le contre-mouvement. */
        let refundQueued = null;
        try {
          refundQueued = window.KiwiLive?.postRefund?.(entry, orig, manager) || null;
          if (refundQueued && refundQueued.id) entry.serverSaleId = refundQueued.id;
        } catch (_) {}
        try { persistShift(); } catch (_) {}
        try { saveProvisional(true); } catch (_) {}
        if ($('#journal-drawer').classList.contains('is-open')) renderJournal();
        refreshOpenReconciliationModals();
        closeRefund();
        if (window.KiwiEnv?.isReal?.() && (!refundQueued || refundQueued.ok === false)) {
          toast('Remboursement enregistré ici · synchronisation à reprendre');
        } else toast('Remboursement · −' + fmtMAD(amount));
      }, { kind: 'refund', refundId: refundServerId, originalSaleId, amountCents: Math.round(amount * 100) });
    }

    
