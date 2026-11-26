/* Kiwi · caisse restaurant · « Remboursement » d'une sortie de caisse.
 *
 * 25 nov. 2026 : le patron (ou un employé) prend 100 MAD au tiroir pour une
 * course, puis les rend. On saisissait −100 puis +100, et la liste du service
 * lisait deux mouvements sans lien. Le troisième sens du « Mouvement de
 * caisse » choisit la sortie remboursée (en tout ou en partie) : l'argent
 * rentre au tiroir comme une entrée (l'attendu, la clôture et le serveur ne
 * changent pas de règle), liée à sa sortie par `refundOf`, et la liste montre
 * la sortie « Remboursée » au lieu de deux lignes.
 *
 * Script classique chargé après caisse-accounting.js (registre data-caisse-script
 * de kiwi-caisse.html) : cashMovements, emitCashSession, drawerExpected,
 * requireTillOperator, carteLang… sont les déclarations de tête de la caisse,
 * lues à l'appel. renderCmList et openCashMove sont enveloppées ici. */
(function () {
  const PREFIX = 'Remboursement · ';
  const S = {
    fr: { btn: 'Remboursement', pick: 'Sortie remboursée', none: 'Aucune sortie à rembourser dans ce service.', choose: 'Choisissez la sortie remboursée', max: 'Au plus', done: 'Remboursement', tag: 'Remboursée', left: 'reste' },
    en: { btn: 'Refund', pick: 'Cash out being refunded', none: 'No cash out to refund this shift.', choose: 'Pick the cash out being refunded', max: 'At most', done: 'Refund', tag: 'Refunded', left: 'left' },
    ar: { btn: 'استرجاع', pick: 'السحب المسترجع', none: 'لا يوجد سحب لاسترجاعه في هذه الخدمة.', choose: 'اختر السحب المسترجع', max: 'الحد الأقصى', done: 'استرجاع', tag: 'مسترجع', left: 'متبقٍ' },
  };
  const L = () => { try { return S[carteLang()] || S.fr; } catch (_) { return S.fr; } };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const c = n => Math.round((Number(n) || 0) * 100);
  const hm = t => { const d = t instanceof Date ? t : new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  let on = false, picked = '';

  /* Ce qui a déjà été rendu sur chaque sortie. Une entrée sans `refundOf`
     (reprise du serveur après un plantage) se rattache par son motif. */
  function ledger() {
    const outs = cashMovements.filter(m => m && m.type === 'out' && c(m.amount) > 0);
    const back = Object.create(null), refunds = new Set();
    cashMovements.forEach((m) => {
      if (!m || m.type !== 'in' || String(m.reason || '').indexOf(PREFIX) !== 0) return;
      let o = m.refundOf && outs.find(x => x.id === m.refundOf);
      if (!o) o = outs.find(x => PREFIX + x.reason === m.reason && (back[x.id] || 0) + c(m.amount) <= c(x.amount));
      if (!o) return;
      back[o.id] = (back[o.id] || 0) + c(m.amount); refunds.add(m);
    });
    return { outs, back, refunds, left: o => c(o.amount) - (back[o.id] || 0) };
  }

  function css() {
    if (document.getElementById('cm-refund-css')) return;
    const st = document.createElement('style'); st.id = 'cm-refund-css';
    st.textContent = '#cash-move-modal.cm-refunding .cash-presets,#cash-move-modal.cm-refunding #cm-reasons,#cash-move-modal.cm-refunding #cm-custom-wrap{display:none!important}'
      + '#cm-refund-pick{display:none;margin:0 0 12px}#cash-move-modal.cm-refunding #cm-refund-pick{display:block}'
      + '.cm-rf-list{display:flex;flex-direction:column;gap:6px;max-height:210px;overflow:auto}'
      + '.cm-rf-row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:var(--r-lg,12px);background:var(--paper-mute);color:var(--ink-2,inherit);font-size:13px;text-align:start}'
      + '.cm-rf-row.is-active,.cm-rf-row.is-active .cm-row-reason,.cm-rf-row.is-active .cm-row-amt{background:var(--forest);color:#fff}.cm-rf-row .cm-row-reason{flex:1;min-width:0}'
      + '.cm-rf-row .cm-row-time{color:inherit;opacity:.7}.cm-rf-empty{font-size:12.5px;color:var(--ink-4);padding:6px 2px}'
      + '.cm-row-was{text-decoration:line-through;opacity:.55;font-weight:500;margin-inline-end:6px}'
      + '.cm-row-tag{display:inline-block;margin-inline-start:6px;padding:1px 7px;border-radius:999px;background:rgba(63,182,122,.14);color:var(--forest);font-size:11px;font-weight:600}';
    document.head.appendChild(st);
  }

  function paint() {
    const b = document.getElementById('cm-type-refund');
    if (b) b.querySelector('.cm-type-label').textContent = L().btn;
    const lab = document.getElementById('cm-refund-label');
    if (lab) lab.textContent = L().pick;
  }

  function mount() {
    const row = document.getElementById('cm-type'), modal = document.getElementById('cash-move-modal');
    if (!row || !modal || document.getElementById('cm-type-refund')) return;
    css();
    row.insertAdjacentHTML('beforeend', '<button class="cm-type-btn" id="cm-type-refund" data-cm-refund type="button"><i data-icon="undo"></i> <span class="cm-type-label" data-nolang></span></button>');
    row.insertAdjacentHTML('afterend', '<div id="cm-refund-pick"><div class="cash-input-label" id="cm-refund-label"></div><div class="cm-rf-list" id="cm-rf-list"></div></div>');
    paint();
    if (window.KiwiCaisseLang && window.KiwiCaisseLang.subscribe) window.KiwiCaisseLang.subscribe(() => { paint(); if (on) list(); });
    /* Capture : le gestionnaire de la caisse ne voit ni ce bouton ni « Enregistrer » en mode remboursement. */
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-cm-refund]')) { e.stopPropagation(); enter(); return; }
      if (e.target.closest('[data-cm-type]')) { leave(); return; }
      const r = e.target.closest('[data-rf-id]');
      if (r && on) { e.stopPropagation(); choose(r.dataset.rfId); return; }
      if (on && e.target.closest('#cm-confirm')) { e.stopPropagation(); confirm(); }
    }, true);
    const amt = document.getElementById('cm-amount');
    if (amt) amt.addEventListener('keydown', (e) => { if (on && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); confirm(); } }, true);
    if (window.lucide) lucide.createIcons();
  }

  function enter() {
    on = true; picked = '';
    document.querySelectorAll('#cm-type .cm-type-btn').forEach(b => b.classList.toggle('is-active', b.id === 'cm-type-refund'));
    document.getElementById('cash-move-modal').classList.add('cm-refunding');
    document.getElementById('cm-amount').value = '';
    list();
    const first = ledger(), open = first.outs.filter(o => first.left(o) > 0);
    if (open.length === 1) choose(open[0].id);   // une seule sortie : déjà choisie
  }
  function leave() {
    on = false; picked = '';
    const m = document.getElementById('cash-move-modal');
    if (m) m.classList.remove('cm-refunding');
  }
  function list() {
    const box = document.getElementById('cm-rf-list'); if (!box) return;
    const g = ledger(), open = g.outs.filter(o => g.left(o) > 0).reverse();
    if (!open.length) { box.innerHTML = '<div class="cm-rf-empty">' + esc(L().none) + '</div>'; return; }
    box.innerHTML = open.map((o) => {
      const left = g.left(o), part = left < c(o.amount);
      return '<button type="button" class="cm-rf-row' + (o.id === picked ? ' is-active' : '') + '" data-rf-id="' + esc(o.id) + '">'
        + '<span class="cm-row-reason">' + esc(o.reason || 'Autre') + (o.actorName ? ' · <span style="opacity:.8">' + esc(o.actorName) + '</span>' : '') + '</span>'
        + '<span class="cm-row-time">' + hm(o.time) + '</span>'
        + '<span class="cm-row-amt">' + (part ? esc(L().left) + ' ' : '') + fmtMAD(left / 100) + '</span></button>';
    }).join('');
  }
  function choose(id) {
    const g = ledger(), o = g.outs.find(x => x.id === id);
    if (!o || g.left(o) <= 0) return;
    picked = id;
    document.getElementById('cm-amount').value = String(g.left(o) / 100);
    list();
  }

  function confirm() {
    const tr = (window.KiwiCaisseLang || { tr: s => s }).tr;
    const g = ledger(), o = g.outs.find(x => x.id === picked);
    if (!o) { toast(L().choose); return; }
    const amount = money(parseFloat(document.getElementById('cm-amount').value) || 0), left = g.left(o);
    if (amount <= 0) { toast(tr('Saisis un montant')); return; }
    if (c(amount) > left) { toast(L().max + ' · ' + fmtMAD(left / 100)); document.getElementById('cm-amount').value = String(left / 100); return; }
    const reason = (PREFIX + (o.reason || 'Autre')).slice(0, 80);
    window.KiwiAuthAct?.({ kind: 'cash_in', key: 'act.cash_in', args: { amount: fmtMAD(amount) }, amountCents: c(amount), move: 'in' });
    requireTillOperator(reason + ' · ' + fmtMAD(amount), (actor) => {
      const actorId = String((actor && actor.id) || cashActorId()).slice(0, 96);
      const actorName = String((actor && actor.name) || (currentCashier && currentCashier.name) || 'Caissier').slice(0, 80);
      cashMovements.push({ id: 'cm-' + Date.now(), time: new Date(), type: 'in', amount, reason, refundOf: o.id, actorId, actorName });
      emitCashSession({
        sessionId: cashSessionId(), eventType: 'movement', expectedCents: Math.round(drawerExpected() * 100),
        countedCents: null, gapCents: null, movementKind: 'in', movementAmountCents: c(amount), movementReason: reason,
        actorId, openedAt: shiftOpenedAt.getTime(), occurredAt: Date.now(),
      });
      try { persistShift(); } catch (_) {}
      refreshOpenReconciliationModals();
      toast(L().done + ' · ' + fmtMAD(amount) + ' (' + actorName + ')');
      leave(); closeCashMove();
    });
  }

  /* La liste du service : une sortie remboursée se lit « Remboursée », sa
     contrepartie ne fait pas une deuxième ligne. */
  const baseList = renderCmList;
  renderCmList = function () {
    const box = document.getElementById('cm-list');
    const g = ledger();
    if (!box || !g.refunds.size) return baseList.apply(this, arguments);
    const rows = cashMovements.filter(m => !g.refunds.has(m));
    box.innerHTML = rows.slice().reverse().map((m) => {
      const back = g.back[m.id] || 0, full = back && back >= c(m.amount);
      const amt = back
        ? '<span class="cm-row-was">' + fmtMAD(m.amount) + '</span>' + (full ? '' : '− ' + fmtMAD((c(m.amount) - back) / 100))
        : (m.type === 'in' ? '+ ' : '− ') + fmtMAD(m.amount);
      return '<div class="cm-row"><span class="cm-row-ic cm-row-ic--' + m.type + '"><i data-icon="' + (m.type === 'in' ? 'download' : 'upload') + '"></i></span>'
        + '<span class="cm-row-reason">' + esc(m.reason || 'Autre') + (m.actorName ? ' · <span style="opacity:0.8">' + esc(m.actorName) + '</span>' : '')
        + (back ? '<span class="cm-row-tag">' + esc(L().tag) + (full ? '' : ' · ' + fmtMAD(back / 100)) + '</span>' : '') + '</span>'
        + '<span class="cm-row-time">' + hm(m.time) + '</span>'
        + '<span class="cm-row-amt cm-row-amt--' + m.type + '">' + amt + '</span></div>';
    }).join('');
    if (window.lucide) lucide.createIcons();
  };
  const baseOpen = openCashMove;
  openCashMove = function () { mount(); leave(); return baseOpen.apply(this, arguments); };
})();
