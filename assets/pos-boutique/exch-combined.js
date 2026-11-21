/* La caisse boutique · l'échange groupé : un seul écran, un seul total.
 *
 * La cliente rapporte plusieurs pièces d'un même ticket et repart avec
 * d'autres, pas forcément autant. L'échange pièce par pièce réglait une
 * différence par pièce (deux reçus, parfois un avoir ET un encaissement pour
 * la même visite). Ici les pièces rendues et les pièces choisies sont posées
 * côte à côte et la caisse règle UNE différence : encaissée si la cliente doit,
 * en avoir si la boutique doit, rien si c'est égal.
 *
 * Essai : allumé pour Amira Boutique seulement (et sur une caisse locale qui
 * pose kiwiExchCombined = '1', pour la démo). Les autres boutiques gardent
 * l'échange pièce par pièce.
 *
 * Les règles sont celles de l'échange d'une pièce (checkout.js ›
 * openExchSummary) : les remplaçantes sont réservées AVANT tout paiement,
 * l'avoir est émis AVANT que le stock bouge, la valeur reprise est ce que la
 * cliente a payé (paid-share), et chaque pièce rendue revient au stock par son
 * propre mouvement. */
import { $, $$, esc, fmtMAD, icons, artOf, colorDot, colorLabel, renderExchNote, renderGrid, rayonOf } from './sales.js?v=240';
import { state, root, P, toast, findSale, saleClient, openVeil, closeVeil, issueAvoir, stableCreditIssueId, creditErrorDetail, recordReturn, refreshOps, persistStock, stockAdd, persistDay, newSaleId, variantStock, IS_DEMO, colorKey, showStockIssue, queueIfOffline, renderBadges, nextStandaloneTicketNumber, releaseTicketNumber, firstName, STAFF, bqSaveProvisional, bqPaymentMethod, bqPost, bqPaymentParts, headSubVente, merchantSlug, lineUnit, SALES, switchView } from '../pos-boutique.js?v=344';
import { openPay, openVoucher, paidAmount, markLineReturned } from './checkout.js?v=240';
import { ticketOwner } from './ticket-owner.js?v=5';
import { tillDate } from './till-clock.js?v=2';
const M = globalThis.KiwiMoney;

const TRIAL = ['amira-boutique'];

/* L'essai est-il allumé sur cette caisse ? */
export function combinedOn() {
  try { if (localStorage.getItem('kiwiExchCombined') === '1') return true; } catch (_) {}
  try { return TRIAL.includes(String(merchantSlug() || '')); } catch (_) { return false; }
}

/* « Échanger les pièces » sur la fiche de retour : les pièces cochées partent
   ensemble, la vendeuse choisit ensuite autant de remplaçantes qu'elle veut. */
export function startCombined(ret, sale, qtyOf) {
  const returns = Array.from(ret.picks).sort((a, b) => a - b).map((idx) => ({ idx, qty: qtyOf(idx) }));
  ticketOwner.startReturn(state, { saleId: ret.saleId, combined: true, returns, picks: [], motif: ret.motif || '' });
  switchView('vente');
  const n = returns.reduce((t, r) => t + r.qty, 0);
  toast(`Échange ${sale.id}, ${n} pièce${n > 1 ? 's' : ''} rendue${n > 1 ? 's' : ''}, choisissez les articles qui partent`);
}

function returnedValue(sale, ex) {
  return ex.returns.reduce((t, r) => t + M.toCents(paidAmount(sale, sale.lines[r.idx], r.qty)), 0);
}
function pickedValue(ex) {
  return ex.picks.reduce((t, p) => t + M.toCents(lineUnit({ pid: p.pid, remise: 0 })), 0);
}

/* Le bandeau de la grille pendant l'échange groupé. */
export function combinedNote(slot) {
  const ex = state.exchange;
  const sale = findSale(ex.saleId);
  const n = ex.returns.reduce((t, r) => t + r.qty, 0);
  const k = ex.picks.length;
  slot.innerHTML = `
    <div class="bq-exch-note">
      <i data-lucide="arrow-left-right"></i>
      <span class="l">Échange <b>${esc(sale.id)}</b>, ${n} pièce${n > 1 ? 's' : ''} rendue${n > 1 ? 's' : ''} (${fmtMAD(M.toMad(returnedValue(sale, ex)))}).
      ${k ? `<b>${k} article${k > 1 ? 's' : ''} choisi${k > 1 ? 's' : ''}</b>, touchez-en un autre ou ouvrez l'échange.` : 'Touchez les articles qui partent, un par un.'}</span>
      ${k ? '<button class="bq-exch-cancel" id="bq-cx-open">Voir l\'échange</button>' : ''}
      <button class="bq-exch-cancel" id="bq-exch-cancel">Annuler l'échange</button>
    </div>`;
  const open = $('#bq-cx-open', slot);
  if (open) open.onclick = () => openCombined();
  $('#bq-exch-cancel', slot).onclick = () => {
    state.exchange = null;
    renderExchNote();
    toast('Échange annulé, rien n\'a bougé');
    icons();
  };
  icons();
}

/* La fiche « Choisir cet article » ajoute une remplaçante, puis montre l'échange. */
export function addCombinedPick(pid, size, color) {
  const ex = state.exchange;
  if (!ex || !ex.combined || !P[pid]) return;
  ex.picks.push({ pid, size, color });
  renderExchNote();
  openCombined();
}

/* L'écran unique : ce qui revient, ce qui part, une différence. */
export function openCombined() {
  const ex = state.exchange;
  if (!ex || !ex.combined) return;
  const sale = findSale(ex.saleId);
  if (!sale) return;
  const c = saleClient(sale);
  const backCents = returnedValue(sale, ex);
  const outCents = pickedValue(ex);
  const diffCents = outCents - backCents;
  const diff = M.toMad(diffCents);
  const none = !ex.picks.length;
  const el = $('#bq-exchm', root);
  const retRows = ex.returns.map((r) => {
    const ln = sale.lines[r.idx];
    const p = P[ln.pid] || { name: ln.name || 'Article retiré du catalogue', art: '' };
    return `<div class="bq-exch-row is-ret">
        <span class="bq-line-art">${artOf(p)}</span>
        <span class="mid"><b>${esc(p.name)}${r.qty > 1 ? ` × ${r.qty}` : ''}</b><span>retour · ${esc(ln.size)} · ${colorDot(ln.color)} ${esc(colorLabel(ln.color))}${ln.remise ? ` · payé avec −${ln.remise} %` : ''}</span></span>
        <span class="amt">−${fmtMAD(paidAmount(sale, ln, r.qty))}</span>
      </div>`;
  }).join('');
  const newRows = ex.picks.map((pk, i) => {
    const p = P[pk.pid];
    return `<div class="bq-exch-row is-new">
        <span class="bq-line-art">${artOf(p)}</span>
        <span class="mid"><b>${esc(p.name)}</b><span>part · ${esc(pk.size)} · ${colorDot(pk.color)} ${esc(colorLabel(pk.color))} · <button type="button" class="bq-cx-del" data-bq-cx-del="${i}">Retirer</button></span></span>
        <span class="amt">+${fmtMAD(lineUnit({ pid: pk.pid, remise: 0 }))}</span>
      </div>`;
  }).join('');
  el.innerHTML = `
    <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
    <h3 class="modal-title">Échange, ${esc(sale.id)}</h3>
    <p class="modal-subtle">${c ? esc(c.name) : (sale.remote && !sale.clientId ? 'Client non renseigné' : 'Cliente de passage')} · les pièces rendues repartent en stock</p>
    <div class="bq-cx-lbl">Rendu</div>
    ${retRows}
    <div class="bq-cx-lbl">Part avec la cliente</div>
    ${newRows || '<p class="modal-subtle bq-cx-empty">Aucun article choisi pour l\'instant.</p>'}
    <button type="button" class="bq-btn secondary bq-cx-add" id="bq-cx-add"><i data-lucide="plus"></i>Ajouter un article</button>
    <div class="bq-exch-diff ${none ? 'zero' : diffCents > 0 ? 'pos' : diffCents < 0 ? 'neg' : 'zero'}">
      <span>${none ? 'Choisissez au moins un article' : diffCents > 0 ? 'Différence à encaisser' : diffCents < 0 ? 'Différence en faveur de la cliente, part en avoir' : 'Aucun écart, échange direct'}</span>
      <span class="amt">${none || diffCents === 0 ? '0 MAD' : fmtMAD(Math.abs(diff))}</span>
    </div>
    <div class="bq-sheet-foot">
      <button class="bq-btn secondary" data-bq-close>Retour</button>
      ${diffCents > 0
        ? `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-lucide="banknote"></i>Encaisser ${fmtMAD(diff)}</button>`
        : diffCents < 0
          ? `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-lucide="ticket"></i>Échanger + avoir ${fmtMAD(-diff)}</button>`
          : `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-lucide="check"></i>Confirmer l'échange</button>`}
    </div>`;
  if (!$('#bq-cx-style', document)) {
    const st = document.createElement('style');
    st.id = 'bq-cx-style';
    st.textContent = '.bq-cx-lbl{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6b6b6b);margin:12px 0 6px}'
      + '.bq-cx-del{border:0;background:none;padding:0;font:inherit;color:var(--atlas,#0B6E4F);text-decoration:underline;cursor:pointer}'
      + '.bq-cx-add{margin:10px 0 4px;width:100%;justify-content:center}.bq-cx-empty{margin:4px 0}';
    document.head.appendChild(st);
  }
  openVeil('#bq-exch-veil');
  icons();
  $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-exch-veil'); });
  $('#bq-cx-add', el).onclick = () => { closeVeil('#bq-exch-veil'); toast('Touchez l\'article suivant dans la grille ou cherchez-le'); };
  $$('[data-bq-cx-del]', el).forEach((b) => {
    b.onclick = () => { ex.picks.splice(+b.dataset.bqCxDel, 1); renderExchNote(); openCombined(); };
  });
  $('#bq-exch-go', el).onclick = () => settle(sale, ex, diffCents, el);
}

/* ── Le règlement : une seule différence ── */
function settle(sale, ex, diffCents, el) {
  if (!ex.picks.length) return;
  const go = $('#bq-exch-go', el);
  if (go) go.disabled = true;
  const c = saleClient(sale);
  const diff = M.toMad(diffCents);
  const cat = window.KiwiBoutiqueCatalog;
  const stockRef = `exch-${newSaleId()}`;
  const moveRef = String(sale.id || '');
  const moveActor = STAFF && STAFF.caissiere ? STAFF.caissiere.name : '';
  const picks = ex.picks.slice();
  const returns = ex.returns.slice();
  const idxs = returns.map((r) => r.idx);
  const quantities = new Map(returns.map((r) => [r.idx, r.qty]));
  const backMad = M.toMad(returnedValue(sale, ex));
  const names = picks.map((pk) => P[pk.pid].name).join(', ');

  /* Deux remplaçantes identiques ont besoin de deux pièces en stock. */
  const need = new Map();
  picks.forEach((pk) => { const k = pk.pid + '|' + pk.size + '|' + pk.color; need.set(k, (need.get(k) || 0) + 1); });
  const short = () => {
    for (const [k, n] of need) {
      const [pid, size, color] = k.split('|');
      const onHand = variantStock(pid, size, color);
      if (onHand < n) return { pid, size, color, needed: n, onHand };
    }
    return null;
  };
  const reserve = () => {
    const issue = short();
    if (issue) return Promise.resolve({ ok: false, issue });
    if (IS_DEMO || state.offline || !cat || !cat.reserveSale) return Promise.resolve({ ok: false, offline: true });
    try { window.KiwiMaisonStock?.enable('boutique'); } catch (_) {}
    return cat.reserveSale(stockRef, picks.map((pk) => ({ pid: pk.pid, size: pk.size, color: colorKey(pk.pid, pk.color), qty: 1, price: lineUnit({ pid: pk.pid, remise: 0 }) })));
  };
  const refused = (reservation) => {
    if (go) go.disabled = false;
    if (reservation.issue) showStockIssue(reservation.issue);
    else toast('Échange suspendu', 6000, 'warn', 'Impossible de réserver les articles choisis.');
  };

  let applied = false;
  const apply = (reserved) => {
    if (applied) return true;
    if (!reserved) {
      const done = [];
      for (const pk of picks) {
        if (!persistStock(pk.pid, pk.size, pk.color, -1, moveRef, 'vente')) {
          done.forEach((d) => persistStock(d.pid, d.size, d.color, 1, moveRef, 'retour'));
          showStockIssue({ pid: pk.pid, size: pk.size, color: pk.color, needed: 1, onHand: variantStock(pk.pid, pk.size, pk.color) });
          return false;
        }
        done.push(pk);
      }
    }
    applied = true;
    if (reserved && cat && cat.confirmSale) cat.confirmSale(stockRef, { ref: moveRef, actor: moveActor });
    picks.forEach((pk) => stockAdd(pk.pid, pk.size, -1));
    let lost = false;
    returns.forEach((r) => {
      const ln = sale.lines[r.idx];
      if (!persistStock(ln.pid, ln.size, ln.color, r.qty, moveRef, 'retour')) lost = true;
      stockAdd(ln.pid, ln.size, r.qty);
    });
    returns.forEach((r) => markLineReturned(sale.lines[r.idx], r.qty, `échangée → ${names}`));
    recordReturn(sale, idxs, backMad, ex.motif || 'Non précisé', 'echange', '', quantities);
    state.exchange = null;
    persistDay();
    queueIfOffline(`Échange · ${sale.id}`);
    renderExchNote(); renderGrid(); renderBadges();
    if (lost) toast('Échange enregistré, retour à rapprocher', 6000, 'warn', 'Une variante d’origine a été supprimée du catalogue.');
    return true;
  };

  if (diffCents > 0) {
    /* La part encaissée se répartit sur les pièces qui partent, au prorata de
       leur prix : le dashboard voit quels articles sont sortis, et la somme des
       lignes vaut exactement la différence. */
    const units = picks.map((pk) => M.toCents(lineUnit({ pid: pk.pid, remise: 0 })));
    const tot = units.reduce((a, b) => a + b, 0) || 1;
    let left = diffCents;
    const shares = units.map((u, i) => { const s = i === units.length - 1 ? left : Math.round(diffCents * u / tot); left -= s; return s; });
    nextStandaloneTicketNumber().then((exchangeNumber) => reserve().then((reservation) => {
      if (!reservation.ok && !reservation.offline) { releaseTicketNumber(exchangeNumber); refused(reservation); return; }
      const reserved = !!reservation.ok;
      closeVeil('#bq-exch-veil');
      openPay({
        amount: diff,
        customerId: sale.clientId || null,
        title: 'Différence échange',
        subtitle: `${sale.id} · ${esc(names)}`,
        ref: exchangeNumber,
        lines: [{ qty: 1, name: `Différence échange ${sale.id} · ${names}`, amount: diff, ref: picks[0].pid, barcode: P[picks[0].pid].barcode || '' }],
        subtotal: diff,
        doneLabel: 'Terminer',
        waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
        onCancel: () => {
          if (reserved && cat && cat.releaseSale) cat.releaseSale(stockRef);
          releaseTicketNumber(exchangeNumber);
        },
        onPaid: (parts) => {
          if (!apply(reserved)) return { line: 'Échange non enregistré · stock insuffisant' };
          const rec = {
            id: exchangeNumber, syncId: newSaleId(), tenderVersion: 2, at: tillDate(), clientId: sale.clientId, by: STAFF.caissiere.name, kind: 'echange',
            methods: parts.map((x) => x.m).join(' + '),
            parts: parts.map((x) => ({ m: x.m, amount: M.toMad(M.toCents(+x.amount || 0)) })),
            lines: picks.map((pk, i) => ({ pid: pk.pid, size: pk.size, color: pk.color, qty: 1, remise: 0, unit: M.toMad(shares[i]), returned: false, note: `différence échange ${sale.id}` })),
            total: diff,
          };
          SALES.unshift(rec);
          persistDay();
          bqSaveProvisional();
          try {
            if (window.KiwiLive && window.KiwiLive.isOn()) {
              const pm = (parts || []).map((x) => x.m);
              const isDelivery = pm.indexOf('livraison') >= 0;
              const cashIn = (parts || []).reduce((s, x) => s + (x.m === 'avoir' || x.m === 'livraison' ? 0 : (+x.amount || 0)), 0);
              bqPost(rec, {
                id: rec.syncId,
                amount: cashIn,
                method: bqPaymentMethod(parts),
                paymentParts: bqPaymentParts(parts), ticketAmountCents: diffCents,
                ...(cashIn <= 0 ? { settlementKind: isDelivery ? 'receivable' : 'store-credit',
                  creditAmountCents: M.sumCents((parts || []).filter((x) => x.m === 'avoir').map((x) => +x.amount || 0)) } : {}),
                channel: isDelivery ? 'delivery' : 'counter',
                label: `Différence échange ${sale.id}`,
                ref: rec.id,
                time: rec.at,
                lines: picks.map((pk, i) => ({ name: P[pk.pid].name + (pk.size ? ' ' + pk.size : ''), qty: 1, total: M.toMad(shares[i]), cat: rayonOf(pk.pid) || '' })),
              });
            }
          } catch (_) {}
          $('#bq-today', root).textContent = headSubVente();
          refreshOps();
          return { ref: rec.id, sale: rec, line: `Échange ${sale.id} réglé, différence ${fmtMAD(diff)}` };
        },
      });
    })).catch(() => {
      if (go) go.disabled = false;
      toast('Numéro de ticket indisponible', 6000, 'warn', 'Reconnectez cette caisse pour réserver sa prochaine série.');
    });
  } else if (diffCents < 0) {
    reserve().then(async (reservation) => {
      if (!reservation.ok && !reservation.offline) { refused(reservation); return; }
      /* La dette d'abord : si le registre refuse, rien n'a bougé. */
      let av;
      try {
        av = await issueAvoir(-diff, c, `Différence échange ${sale.id}`, sale.serverId || sale.syncId || sale.id, {
          requestId: stableCreditIssueId(sale, quantities, -diffCents),
          originalRef: sale.id, originalSale: sale, resellable: true,
          lines: returns.map((r) => {
            const ln = sale.lines[r.idx];
            return { itemId: ln.pid, variantId: [ln.pid || '', ln.size || '', ln.color || ''].join(':'),
              name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', size: ln.size || '', qty: r.qty,
              unitCents: Math.round(M.toCents(paidAmount(sale, ln, r.qty)) / r.qty) };
          }),
        });
      } catch (error) {
        if (reservation.ok && cat && cat.releaseSale) cat.releaseSale(stockRef);
        if (go) go.disabled = false;
        toast('Avoir non émis', 6000, 'danger', creditErrorDetail(error));
        return;
      }
      closeVeil('#bq-exch-veil');
      if (!apply(!!reservation.ok)) {
        toast('Avoir émis, échange à régulariser', 6000, 'warn', `${av.code} existe mais un article choisi est devenu indisponible.`);
        refreshOps(); openVoucher(av, { mode: 'fresh' });
        return;
      }
      refreshOps(); openVoucher(av, { mode: 'fresh' });
    });
  } else {
    reserve().then((reservation) => {
      if (!reservation.ok && !reservation.offline) { refused(reservation); return; }
      closeVeil('#bq-exch-veil');
      if (!apply(!!reservation.ok)) return;
      refreshOps();
      toast(`Échange ${sale.id} enregistré, aucun écart`);
    });
  }
}
