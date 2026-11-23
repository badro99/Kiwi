/* Échange sans ticket · caisse Maison · la feuille.
 * docs/specs/2026-11-23-maison-echange-sans-ticket.md
 * Preuves : tools/gift-exchange-core-test.mjs (calcul), tools/maison-gift-exchange-browser-test.mjs (clics).
 *
 * Le −1 / +1 que les vendeuses faisaient à la main, fait proprement : ce qui
 * revient remonte en stock, ce qui part en sort, la différence s'encaisse par
 * la feuille de paiement habituelle. Marchandise contre marchandise : tant que
 * ce qui part vaut moins que ce qui revient, rien ne se règle (« il reste … à
 * choisir »). Aucun avoir ici : le serveur n'en émet que sur une vente connue. */
import { P, root, toast, lineDeal, persistStock, persistDay, recordReturn, refreshOps, nextStandaloneTicketNumber, SALES, STAFF, newSaleId, bqPost, bqPaymentMethod, bqPaymentParts, bqSaveProvisional, queueIfOffline, headSubVente, renderBadges } from '../pos-maison.js?v=261';
import { $, esc, fmtMAD, icons, artOf, holdStock, releaseStock, canHoldStock, renderGrid, rayonOf } from './sales.js?v=174';
import { openPay } from './checkout.js?v=174';
import { searchProducts, exchangeTotals, allocateCents, phrase, tillLang } from './gift-exchange-core.js?v=2';

const L = (fr, vars) => phrase(fr, tillLang(), vars);
const money = (cents) => fmtMAD(cents / 100);

let gx = null;   /* { back: Map, out: Map } ; clé = pid|taille */

const sizes = (p) => Object.keys((p && p.sizes) || {});
const valueCents = (pid) => Math.round(lineDeal({ pid, isPiece: false, remise: 0 }).price * 100);
const lines = (m) => Array.from(m.values());

function css() {
  if (document.getElementById('mz-gx-css')) return;
  const s = document.createElement('style');
  s.id = 'mz-gx-css';
  s.textContent = `
.modal.mz-gx { width: min(880px, 94vw); max-height: 92vh; overflow: auto; display: block; height: auto; min-height: 0; }
.mz-gx #mz-gx-diff { margin-top: 14px; }
.mz-gx .mz-search { margin: 12px 0 8px; }
.mz-gx-results { max-height: 236px; overflow: auto; border: 1px solid var(--line, rgba(10,15,13,.1)); border-radius: 12px; }
.mz-gx-hit { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--line, rgba(10,15,13,.08)); }
.mz-gx-hit:last-child { border-bottom: 0; }
.mz-gx-hit .mid { flex: 1; min-width: 0; }
.mz-gx-hit .mid b { display: block; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.mz-gx-hit .mid span { display: block; font-size: 11px; color: var(--ink-3); }
.mz-gx-hit .mz-btn { min-height: 40px; padding: 0 14px; }
.mz-gx-empty { padding: 14px; font-size: 12.5px; color: var(--ink-3); }
.mz-gx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.mz-gx-cols h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ink-2, var(--ink-3)); }
.mz-gx-qty { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.mz-gx-qty button { width: 32px; height: 32px; border-radius: 9px; background: var(--paper-soft, rgba(10,15,13,.05)); }
@media (max-width: 720px) { .mz-gx-cols { grid-template-columns: 1fr; } }`;
  document.head.appendChild(s);
}

function veil() {
  let v = $('#mz-gx-veil', root);
  if (!v) {
    v = document.createElement('div');
    v.className = 'modal-veil';
    v.id = 'mz-gx-veil';
    v.innerHTML = '<div class="modal mz-gx mz-rel" id="mz-gxm" role="dialog" aria-modal="true"></div>';
    /* À côté des autres feuilles de la caisse, pour en prendre exactement le style. */
    const sibling = $('#mz-exch-veil', root);
    (sibling && sibling.parentNode ? sibling.parentNode : root).appendChild(v);
  }
  return v;
}
const close = () => { const v = $('#mz-gx-veil', root); if (v) v.classList.remove('is-open'); gx = null; };

export function openGiftExchange() {
  if (!root) return;
  css();
  gx = { back: new Map(), out: new Map() };
  const v = veil();
  const el = $('#mz-gxm', v);
  el.innerHTML = `
    <button class="mz-modal-x" type="button" data-gx-close aria-label="${esc(L('Fermer'))}"><i data-lucide="x"></i></button>
    <h3 class="modal-title">${esc(L('Échange sans ticket'))}</h3>
    <p class="modal-subtle">${esc(L('Un cadeau rapporté sans ticket : ce qui revient en stock, ce qui part, et la différence.'))}</p>
    <div class="mz-search"><i data-lucide="search"></i>
      <input id="mz-gx-q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(L('Référence ou nom de l’article'))}" /></div>
    <div class="mz-gx-results" id="mz-gx-results"></div>
    <div class="mz-gx-cols">
      <div><h4>${esc(L('Revient en stock'))}</h4><div id="mz-gx-back"></div></div>
      <div><h4>${esc(L('Part avec la cliente'))}</h4><div id="mz-gx-out"></div></div>
    </div>
    <div id="mz-gx-diff"></div>
    <div class="mz-sheet-foot">
      <button class="mz-btn secondary" type="button" data-gx-close>${esc(L('Fermer'))}</button>
      <button class="mz-btn primary" type="button" id="mz-gx-go" disabled></button>
    </div>`;
  v.classList.add('is-open');
  const q = $('#mz-gx-q', el);
  q.oninput = () => renderResults(q.value);
  el.onclick = onClick;
  renderResults('');
  renderTotals();
  q.focus();
}

function renderResults(q) {
  const box = $('#mz-gx-results', root);
  if (!box) return;
  /* Un article peut figurer sous deux clés dans P : une seule ligne par article. */
  const seen = new Set();
  const hits = searchProducts(Object.values(P).filter((p) => p && !seen.has(p.id) && seen.add(p.id)), q, 30);
  if (!String(q || '').trim()) { box.innerHTML = `<div class="mz-gx-empty">${esc(L('Tapez la référence lue sur l’article ou sa boîte, ou son nom.'))}</div>`; return; }
  if (!hits.length) { box.innerHTML = `<div class="mz-gx-empty">${esc(L('Aucune référence ne correspond.'))}</div>`; return; }
  box.innerHTML = hits.flatMap((p) => sizes(p).map((size) => `
    <div class="mz-gx-hit">
      <span class="mz-line-art">${artOf(p)}</span>
      <span class="mid"><b>${esc(p.name)}${sizes(p).length > 1 ? ' · ' + esc(size) : ''}</b>
        <span>${money(valueCents(p.id))} · ${Number((p.sizes || {})[size]) || 0} ${esc(L('en stock'))}</span></span>
      <button class="mz-btn secondary" type="button" data-gx-back="${esc(p.id)}" data-gx-size="${esc(size)}">${esc(L('Revient'))}</button>
      <button class="mz-btn primary" type="button" data-gx-out="${esc(p.id)}" data-gx-size="${esc(size)}">${esc(L('Part'))}</button>
    </div>`)).join('');
  icons();
}

function lineRow(side, l) {
  const p = P[l.pid] || { name: l.name };
  return `<div class="mz-exch-row ${side === 'back' ? 'is-ret' : 'is-new'}" data-gx-line="${esc(l.pid)}">
    <span class="mz-line-art">${artOf(p)}</span>
    <span class="mid"><b>${esc(p.name)}</b><span>${esc(l.size)} · ${money(l.unitCents)}</span></span>
    <span class="mz-gx-qty">
      <button type="button" data-gx-step="${side}|${esc(l.key)}|-1" aria-label="−">−</button><b>${l.qty}</b>
      <button type="button" data-gx-step="${side}|${esc(l.key)}|1" aria-label="+">+</button>
    </span>
    <span class="amt">${side === 'back' ? '−' : '+'}${money(l.unitCents * l.qty)}</span>
  </div>`;
}

function renderTotals() {
  if (!gx) return;
  const back = lines(gx.back), out = lines(gx.out);
  const empty = `<div class="mz-gx-empty">${esc(L('Rien pour l’instant.'))}</div>`;
  $('#mz-gx-back', root).innerHTML = back.map((l) => lineRow('back', l)).join('') || empty;
  $('#mz-gx-out', root).innerHTML = out.map((l) => lineRow('out', l)).join('') || empty;
  const t = exchangeTotals(back, out);
  const diff = $('#mz-gx-diff', root);
  const go = $('#mz-gx-go', root);
  let label, amt = '', tone = 'zero';
  if (!t.backCents) label = L('Ajoutez l’article rapporté, puis ce que la cliente emporte.');
  else if (t.remainingCents > 0) { label = L('Il reste {x} à choisir', { x: money(t.remainingCents) }); tone = 'neg'; }
  else if (t.diffCents > 0) { label = L('Différence à encaisser'); amt = money(t.diffCents); tone = 'pos'; }
  else label = L('Même valeur, échange direct');
  diff.className = 'mz-exch-diff ' + tone;
  diff.innerHTML = `<span>${esc(label)}</span>${amt ? `<span class="amt">${amt}</span>` : ''}`;
  go.disabled = !t.ready;
  go.textContent = t.ready && t.diffCents > 0 ? L('Encaisser {x}', { x: money(t.diffCents) }) : L('Confirmer l’échange');
  icons();
}

function add(side, pid, size) {
  const p = P[pid];
  if (!p || !gx) return;
  const key = pid + '|' + size;
  const m = side === 'back' ? gx.back : gx.out;
  const cur = m.get(key);
  const qty = (cur ? cur.qty : 0) + 1;
  if (side === 'out' && !canHoldStock(pid, size, qty, false)) { toast(L('Plus de stock pour cet article'), p.name); return; }
  m.set(key, cur ? { ...cur, qty } : { key, pid, size, color: (p.colors && p.colors[0]) || 'defaut', name: p.name, qty, unitCents: valueCents(pid) });
  renderTotals();
}

function step(side, key, delta) {
  const m = side === 'back' ? gx.back : gx.out;
  const l = m.get(key);
  if (!l) return;
  const qty = l.qty + delta;
  if (qty <= 0) m.delete(key);
  else if (side === 'out' && !canHoldStock(l.pid, l.size, qty, false)) { toast(L('Plus de stock pour cet article'), l.name); return; }
  else m.set(key, { ...l, qty });
  renderTotals();
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !gx) return;
  if (b.hasAttribute('data-gx-close')) { close(); return; }
  if (b.dataset.gxBack) { add('back', b.dataset.gxBack, b.dataset.gxSize); return; }
  if (b.dataset.gxOut) { add('out', b.dataset.gxOut, b.dataset.gxSize); return; }
  if (b.dataset.gxStep) { const [side, key, d] = b.dataset.gxStep.split('|'); step(side, key, Number(d)); return; }
  if (b.id === 'mz-gx-go') settle();
}

/* Les deux sens du stock, puis le registre des retours. Tout ce qui part est
   pris AVANT que quoi que ce soit ne remonte : une rupture n'en bouge aucun. */
function applyMoves(back, out, ref) {
  const taken = [];
  for (const l of out) {
    const held = holdStock(l.pid, l.size, l.qty, false);
    if (held === false) { taken.forEach(([x, h]) => releaseStock(x.pid, x.size, h, false)); return false; }
    taken.push([l, held]);
  }
  for (const l of back) persistStock(l.pid, l.size, l.color, releaseStock(l.pid, l.size, l.qty, false), { ref, why: 'retour' });
  for (const [l, held] of taken) persistStock(l.pid, l.size, l.color, -held, { ref, why: 'vente' });
  const sale = { id: ref, clientId: null, lines: back.map((l) => ({ pid: l.pid, name: l.name, size: l.size, qty: l.qty, unit: l.unitCents / 100 })) };
  recordReturn(sale, back.map((_, i) => i), exchangeTotals(back, out).backCents / 100, 'Cadeau, sans ticket', 'echange', ref, new Map(back.map((l, i) => [i, l.qty])));
  persistDay();
  queueIfOffline(L('Échange sans ticket') + ' ' + ref);
  renderGrid(); renderBadges(); refreshOps();
  return true;
}

function settle() {
  const back = lines(gx.back), out = lines(gx.out);
  const t = exchangeTotals(back, out);
  if (!t.ready) return;
  if (out.some((l) => !canHoldStock(l.pid, l.size, l.qty, false))) { toast(L('Plus de stock pour cet article')); return; }
  if (t.diffCents === 0) {
    const ref = 'EST-' + Date.now().toString(36).toUpperCase();
    if (!applyMoves(back, out, ref)) { toast(L('Plus de stock pour cet article')); return; }
    close();
    toast(L('Échange enregistré'), back.map((l) => l.name).join(', ') + ' → ' + out.map((l) => l.name).join(', '));
    return;
  }
  const go = $('#mz-gx-go', root);
  if (go) go.disabled = true;
  const diff = t.diffCents / 100;
  const shares = allocateCents(t.diffCents, out.map((l) => l.unitCents * l.qty));
  const names = out.map((l) => l.name).join(', ');
  nextStandaloneTicketNumber().then((num) => {
    close();
    openPay({
      amount: diff, customerId: null, ref: num,
      title: 'Différence échange', subtitle: L('Échange sans ticket') + ' · ' + names,
      lines: [{ qty: 1, name: L('Échange sans ticket') + ' · ' + names, amount: diff, ref: out[0].pid, barcode: '' }],
      subtotal: diff, doneLabel: 'Terminer', waName: null, waPhone: null,
      onPaid: (parts) => {
        const moved = applyMoves(back, out, num);
        const rec = {
          id: num, syncId: newSaleId(), tenderVersion: 2, at: new Date(), clientId: null,
          by: (STAFF.caissiere && STAFF.caissiere.name) || '', kind: 'echange',
          methods: parts.map((x) => x.m).join(' + '),
          parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
          lines: moved ? out.map((l, i) => ({ pid: l.pid, size: l.size, color: l.color, qty: l.qty, remise: 0, unit: Math.round(shares[i] / l.qty) / 100, isPiece: false, returned: false, note: 'échange sans ticket' })) : [],
          total: diff,
          note: moved ? 'échange sans ticket' : 'échange sans ticket non appliqué (rupture entre-temps), différence encaissée à régulariser',
        };
        SALES.unshift(rec);
        persistDay();
        bqSaveProvisional();
        try {
          if (window.KiwiLive && window.KiwiLive.isOn()) {
            const cashIn = parts.reduce((s, x) => s + (x.m === 'avoir' || x.m === 'livraison' ? 0 : (+x.amount || 0)), 0);
            const delivery = parts.some((x) => x.m === 'livraison');
            bqPost(rec, {
              id: rec.syncId, amount: cashIn, method: bqPaymentMethod(parts),
              paymentParts: bqPaymentParts(parts), ticketAmountCents: t.diffCents,
              ...(cashIn <= 0 ? { settlementKind: delivery ? 'receivable' : 'store-credit',
                creditAmountCents: Math.round(parts.filter((x) => x.m === 'avoir').reduce((s, x) => s + (+x.amount || 0), 0) * 100) } : {}),
              channel: delivery ? 'delivery' : 'counter',
              label: 'Différence échange sans ticket', ref: rec.id, time: rec.at,
              lines: moved ? out.map((l, i) => ({ name: l.name + (l.size ? ' ' + l.size : ''), qty: l.qty, total: shares[i] / 100, cat: rayonOf(l.pid) || '' })) : [],
            });
          }
        } catch (_) {}
        try { const today = $('#mz-today', root); if (today) today.textContent = headSubVente(); } catch (_) {}
        if (!moved) toast(L('Différence encaissée, échange à régulariser'), 5200, 'danger', names);
        return { ref: rec.id, sale: rec, line: L('Échange sans ticket réglé, différence {x}', { x: fmtMAD(diff) }) };
      },
    });
  }).catch(() => {
    if (go) go.disabled = false;
    toast(L('Numéro de ticket indisponible'), 5200, 'danger', 'Reconnectez cette caisse pour réserver sa prochaine série.');
  });
}
