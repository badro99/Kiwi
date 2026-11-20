/* Mouvements de caisse de la caisse maison : sorties (achat fournisseur,
 * dépôt banque, avance, une dépense du jour) et entrées (appoint de monnaie).
 *
 * La caisse restaurant les tient depuis longtemps (caisse-accounting/drawer.js)
 * et les commerçants s'en servent pour noter leurs dépenses payées dans le
 * tiroir. La caisse maison n'en avait aucun : la clôture attendait
 * fond + espèces, donc une dépense payée en liquide passait pour un écart, et
 * le rapport du jour envoyait `cashMovements: []`.
 *
 * Les mouvements vivent sur le poste (kiwi:bqShift) : ils naissent avec lui,
 * partent dans le Z à la clôture et s'effacent avec lui. Chaque mouvement est
 * aussi annoncé au rapprochement (KiwiCashSessions, événement `movement`),
 * comme côté restaurant. Le sens et les motifs sont ceux de la caisse
 * restaurant, mêmes mots, mêmes traductions (caisse-lang.js). */

const REASONS = {
  out: ['Achat fournisseur', 'Dépôt banque', 'Avance personnel', 'Autre'],
  in: ['Appoint monnaie', 'Correction', 'Autre'],
};
const tr = (x) => (globalThis.window?.KiwiCaisseLang || { tr: (y) => y }).tr(x);
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cents = (v) => Math.round((+v || 0) * 100);

/* Les mouvements d'un poste, propres : un montant positif au centime, un sens. */
export function mzMoves(shift) {
  return (shift && Array.isArray(shift.moves) ? shift.moves : [])
    .filter((m) => m && (m.type === 'in' || m.type === 'out') && cents(m.amount) > 0);
}

/* Entrées et sorties du poste, additionnées en centimes entiers. */
export function mzMoveTotals(shift) {
  let inC = 0, outC = 0;
  mzMoves(shift).forEach((m) => { if (m.type === 'in') inC += cents(m.amount); else outC += cents(m.amount); });
  return { movesIn: inC / 100, movesOut: outC / 100 };
}

/* Ce que KiwiDayReport.build lit dans session.cashMovements. */
export function mzReportMoves(shift) {
  return mzMoves(shift).map((m) => ({ ts: +m.ts, type: m.type, amount: cents(m.amount) / 100, reason: String(m.reason || 'Autre') }));
}

/* Ouvre la feuille. ctx : { shift() , save(), emit(kind, cents, reason, who),
 * expected() en MAD, fmt(MAD), toast(msg), actor() nom, off() vrai si coupé,
 * approve(label, kind, go(who)) : le code qui autorise le mouvement }. */
export function openMzCashMove(ctx) {
  if (ctx.off && ctx.off()) { ctx.toast(tr('Mouvements de caisse désactivés pour cet établissement')); return; }
  const shift = ctx.shift();
  if (!shift) return;
  let veil = document.getElementById('mz-cash-move-sheet');
  if (!veil) {
    veil = document.createElement('div');
    veil.className = 'modal-veil';
    veil.id = 'mz-cash-move-sheet'; /* pas l'id du bouton de la caisse : getElementById rendait le bouton et la feuille s'y peignait */
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    document.body.appendChild(veil);
  }
  let type = 'out', reason = REASONS.out[0];
  const paint = () => {
    const list = mzMoves(ctx.shift()).slice().reverse();
    veil.innerHTML = `
      <div class="modal">
        <h3 class="modal-title">${escHtml(tr('Mouvement de caisse'))}</h3>
        <p class="modal-subtle"><span>${escHtml(tr('Caisse actuelle'))}</span> · <span class="mono">${escHtml(ctx.fmt(ctx.expected()))}</span></p>
        <div class="cm-type">
          <button class="cm-type-btn" data-mzcm-type="out"><span class="cm-type-label">${escHtml(tr('Sortie'))}</span></button>
          <button class="cm-type-btn" data-mzcm-type="in"><span class="cm-type-label">${escHtml(tr('Entrée'))}</span></button>
        </div>
        <div class="cash-input-row" style="margin-bottom:10px;">
          <label class="cash-input-label" for="mzcm-amount">${escHtml(tr('Montant'))}</label>
          <input class="cash-input mono" id="mzcm-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" />
        </div>
        <div class="cm-reasons">${REASONS[type].map((r) => `<button class="cm-reason" data-mzcm-reason="${escHtml(r)}">${escHtml(tr(r))}</button>`).join('')}</div>
        <div class="cm-custom-wrap">
          <label class="cash-input-label" for="mzcm-custom">${escHtml(tr(type === 'in' ? "Précisez le motif de l'entrée" : 'Précisez le motif de la sortie'))}</label>
          <input class="cm-custom-input" id="mzcm-custom" type="text" maxlength="80" placeholder="${escHtml(tr('Ex. Pain, taxi, courses, réparation...'))}" autocomplete="off" enterkeyhint="done" />
        </div>
        <div class="modal-actions is-visible">
          <button class="ma-btn secondary" data-mzcm-cancel style="flex:1;">${escHtml(tr('Annuler'))}</button>
          <button class="ma-btn primary" data-mzcm-confirm style="flex:2;"><span>${escHtml(tr('Enregistrer'))}</span></button>
        </div>
        <div class="cm-list-wrap">
          <div class="cm-list-label">${escHtml(tr('Mouvements ce service'))}</div>
          <div class="cm-list">${list.length ? list.map((m) => {
            const d = new Date(+m.ts);
            const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            return `<div class="cm-row"><span class="cm-row-reason">${escHtml(m.reason)}${m.by ? ` · <span style="opacity:0.8">${escHtml(m.by)}</span>` : ''}</span>`
              + `<span class="cm-row-time">${hm}</span><span class="cm-row-amt cm-row-amt--${m.type}">${m.type === 'in' ? '+ ' : '− '}${escHtml(ctx.fmt(m.amount))}</span></div>`;
          }).join('') : `<div class="cm-empty">${escHtml(tr('Aucun mouvement enregistré.'))}</div>`}</div>
        </div>
      </div>`;
    veil.querySelectorAll('[data-mzcm-type]').forEach((b) => b.classList.toggle('is-active', b.dataset.mzcmType === type));
    veil.querySelectorAll('[data-mzcm-reason]').forEach((b) => b.classList.toggle('is-active', b.dataset.mzcmReason === reason));
    const wrap = veil.querySelector('.cm-custom-wrap'); if (wrap) wrap.hidden = reason !== 'Autre';
  };
  const close = () => veil.classList.remove('is-open');
  const confirm = () => {
    const amount = cents(parseFloat((veil.querySelector('#mzcm-amount') || {}).value)) / 100;
    if (!(amount > 0)) { ctx.toast(tr('Saisis un montant')); return; }
    const custom = String((veil.querySelector('#mzcm-custom') || {}).value || '').trim().slice(0, 80);
    if (reason === 'Autre' && !custom) {
      ctx.toast(tr(type === 'in' ? "Précisez le motif de l'entrée" : 'Précisez le motif de la sortie'));
      return;
    }
    const said = reason === 'Autre' ? custom : reason;
    /* Une sortie de caisse justifie un tiroir plus léger : sans code, quiconque
       devant une caisse ouverte pouvait couvrir un manque. Comme le restaurant
       (requireTillOperator), le mouvement n'existe qu'une fois approuvé, et il
       porte le nom de celui qui l'a approuvé. ctx.approve refuse (fermé) quand
       le portier manque sur une vraie boutique. */
    const asked = ctx.approve(`${tr(type === 'in' ? 'Entrée' : 'Sortie')} · ${ctx.fmt(amount)} · ${said}`, type, (who) => {
      const s = ctx.shift();
      if (!s) { close(); return; }
      const move = { id: 'mzcm-' + Date.now(), ts: Date.now(), type, amount, reason: said, by: String((who && who.name) || ctx.actor() || '').slice(0, 80) };
      s.moves = mzMoves(s).concat([move]);
      ctx.save();
      try { ctx.emit(type, cents(amount), move.reason, who); } catch (_) {}
      ctx.toast(`${tr(type === 'in' ? 'Entrée' : 'Sortie')} · ${ctx.fmt(amount)} · ${move.reason}`);
      close();
    });
    if (asked === false) ctx.toast(tr('Code manager ou propriétaire requis'));
  };
  veil.onclick = (e) => {
    if (e.target === veil || e.target.closest('[data-mzcm-cancel]')) { close(); return; }
    const t = e.target.closest('[data-mzcm-type]');
    if (t) {
      const keep = (veil.querySelector('#mzcm-amount') || {}).value || '';
      type = t.dataset.mzcmType; reason = REASONS[type][0]; paint();
      const a = veil.querySelector('#mzcm-amount'); if (a) a.value = keep;
      return;
    }
    const r = e.target.closest('[data-mzcm-reason]');
    if (r) {
      const keep = (veil.querySelector('#mzcm-amount') || {}).value || '';
      reason = r.dataset.mzcmReason; paint();
      const a = veil.querySelector('#mzcm-amount'); if (a) a.value = keep;
      const c = veil.querySelector('#mzcm-custom'); if (c && reason === 'Autre') c.focus();
      return;
    }
    if (e.target.closest('[data-mzcm-confirm]')) confirm();
  };
  veil.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); confirm(); } };
  paint();
  veil.classList.add('is-open');
  setTimeout(() => { const a = veil.querySelector('#mzcm-amount'); if (a) a.focus(); }, 60);
}

/* La caisse maison branchée sur la feuille. pos-maison.js ne passe que ses
 * accesseurs : t = { shift(), save(), cashToday() espèces du jour en MAD,
 * real() vraie boutique, emit(type, extra) = bqCashEvent, name() caissière,
 * fmt, toast }. L'attendu est celui de la clôture : fond + espèces + entrées −
 * sorties. Sur une vraie boutique, le code responsable (vérifié par le
 * serveur) autorise chaque mouvement ; sans portier, rien n'est écrit. */
export function mzCashMoveFor(t) {
  const off = () => { try { const C = window.KiwiConfig; return !!(C && typeof C.off === 'function' && (C.off('cash-move') || C.off('cashMove'))); } catch (_) { return false; } };
  const expected = () => { const s = t.shift(), mv = mzMoveTotals(s); return Math.round(((s ? +s.float || 0 : 0) + (+t.cashToday() || 0) + mv.movesIn - mv.movesOut) * 100) / 100; };
  openMzCashMove({
    shift: t.shift, save: t.save, off, expected, fmt: t.fmt, toast: t.toast, actor: t.name,
    approve: (label, kind, go) => {
      if (!t.real()) { go(null); return true; }
      if (typeof window.requireManager !== 'function') return false;
      if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: kind === 'in' ? 'cash_in' : 'cash_out', key: kind === 'in' ? 'act.cash_in' : 'act.cash_out', args: { amount: label } });
      window.requireManager(label, go);
      return true;
    },
    emit: (kind, amountCents, reason, who) => t.emit('movement', Object.assign({ movementKind: kind, movementAmountCents: amountCents, movementReason: reason, expectedCents: Math.round(expected() * 100) },
      who && who.id ? { actorId: String(who.id).slice(0, 96) } : {})),
  });
}
