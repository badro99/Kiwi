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
import { $, $$, esc, fmtMAD, icons, artOf, colorDot, colorLabel, renderExchNote, renderGrid, rayonOf } from './sales.js?v=308';
import { state, root, P, toast, findSale, saleClient, openVeil, closeVeil, issueAvoir, stableCreditIssueId, creditErrorDetail, recordReturn, refreshOps, persistStock, stockAdd, persistDay, newSaleId, variantStock, IS_DEMO, colorKey, showStockIssue, queueIfOffline, renderBadges, nextStandaloneTicketNumber, releaseTicketNumber, firstName, STAFF, bqSaveProvisional, bqPaymentMethod, bqPost, bqPaymentParts, headSubVente, merchantSlug, lineUnit, SALES, switchView } from '../pos-boutique.js?v=414';
import { openPay, openVoucher, paidAmount, markLineReturned } from './checkout.js?v=308';
import { ticketOwner } from './ticket-owner.js?v=9';
import { tillDate } from './till-clock.js?v=2';
const M = globalThis.KiwiMoney;

/* L'écran d'échange en EN et AR : FR -> [EN, AR], trous {x} remplis par tr(clé, valeurs). */
const PHRASES = {
  'Échange {id}, {n} pièce rendue, choisissez les articles qui partent': ['Exchange {id}, {n} item returned, choose the items going out', 'استبدال {id}، قطعة واحدة مُرجعة، اختر المنتجات التي ستخرج'],
  'Échange {id}, {n} pièces rendues, choisissez les articles qui partent': ['Exchange {id}, {n} items returned, choose the items going out', 'استبدال {id}، {n} قطع مُرجعة، اختر المنتجات التي ستخرج'],
  'Échange <b>{id}</b>, {n} pièce rendue ({amt}).': ['Exchange <b>{id}</b>, {n} item returned ({amt}).', 'استبدال <b>{id}</b>، قطعة واحدة مُرجعة ({amt}).'],
  'Échange <b>{id}</b>, {n} pièces rendues ({amt}).': ['Exchange <b>{id}</b>, {n} items returned ({amt}).', 'استبدال <b>{id}</b>، {n} قطع مُرجعة ({amt}).'],
  '{k} article choisi': ['{k} item chosen', 'منتج واحد مختار'],
  '{k} articles choisis': ['{k} items chosen', '{k} منتجات مختارة'],
  'touchez-en un autre ou ouvrez l\'échange.': ['tap another or open the exchange.', 'المس منتجاً آخر أو افتح الاستبدال.'],
  'Touchez les articles qui partent, un par un.': ['Tap the items going out, one by one.', 'المس المنتجات التي ستخرج، واحداً تلو الآخر.'],
  'Voir l\'échange': ['View exchange', 'عرض الاستبدال'],
  'Annuler l\'échange': ['Cancel exchange', 'إلغاء الاستبدال'],
  'Échange annulé, rien n\'a bougé': ['Exchange cancelled, nothing changed', 'أُلغي الاستبدال، لم يتغيّر شيء'],
  'Article retiré du catalogue': ['Item removed from the catalogue', 'منتج حُذف من الكتالوج'],
  'retour': ['return', 'إرجاع'],
  'part': ['going out', 'يخرج'],
  'payé avec −{r} %': ['paid with −{r} %', 'دُفع بخصم {r} %'],
  'Retirer': ['Remove', 'إزالة'],
  'Fermer': ['Close', 'إغلاق'],
  'Échange, {id}': ['Exchange, {id}', 'استبدال، {id}'],
  'Client non renseigné': ['Customer not entered', 'زبون غير مُسجّل'],
  'Cliente de passage': ['Walk-in customer', 'زبون عابر'],
  'les pièces rendues repartent en stock': ['returned items go back into stock', 'القطع المُرجعة تعود إلى المخزون'],
  'Rendu': ['Returned', 'مُرجع'],
  'Part avec la cliente': ['Leaves with the customer', 'يخرج مع الزبون'],
  'Aucun article choisi pour l\'instant.': ['No item chosen yet.', 'لم يُختر أي منتج بعد.'],
  'Ajouter un article': ['Add an item', 'إضافة منتج'],
  'Choisissez au moins un article': ['Choose at least one item', 'اختر منتجاً واحداً على الأقل'],
  'Différence à encaisser': ['Difference to collect', 'الفرق المطلوب تحصيله'],
  'Différence en faveur de la cliente, part en avoir': ['Difference in the customer\'s favour, issued as a credit note', 'الفرق لصالح الزبون، يُصدر كسند رصيد'],
  'Aucun écart, échange direct': ['No difference, straight exchange', 'لا فرق، استبدال مباشر'],
  'Retour': ['Back', 'رجوع'],
  'Encaisser {amt}': ['Collect {amt}', 'تحصيل {amt}'],
  'Échanger + avoir {amt}': ['Exchange + credit note {amt}', 'استبدال + سند رصيد {amt}'],
  'Confirmer l\'échange': ['Confirm exchange', 'تأكيد الاستبدال'],
  'Touchez l\'article suivant dans la grille ou cherchez-le': ['Tap the next item in the grid or search for it', 'المس المنتج التالي في الشبكة أو ابحث عنه'],
  'Échange suspendu': ['Exchange on hold', 'الاستبدال معلّق'],
  'Impossible de réserver les articles choisis.': ['The chosen items could not be reserved.', 'تعذّر حجز المنتجات المختارة.'],
  'Échange enregistré, retour à rapprocher': ['Exchange saved, return to reconcile', 'سُجّل الاستبدال، الإرجاع بحاجة إلى مطابقة'],
  'Une variante d’origine a été supprimée du catalogue.': ['An original variant was deleted from the catalogue.', 'حُذف أحد الأصناف الأصلية من الكتالوج.'],
  'Numéro de ticket indisponible': ['Ticket number unavailable', 'رقم التذكرة غير متاح'],
  'Reconnectez cette caisse pour réserver sa prochaine série.': ['Reconnect this till to reserve its next series.', 'أعد ربط هذا الصندوق لحجز سلسلته التالية.'],
  'Avoir non émis': ['Credit note not issued', 'لم يُصدر سند الرصيد'],
  'Avoir émis, échange à régulariser': ['Credit note issued, exchange to settle', 'صدر سند الرصيد، الاستبدال بحاجة إلى تسوية'],
  '{code} existe mais un article choisi est devenu indisponible.': ['{code} exists but a chosen item became unavailable.', '{code} موجود لكن أحد المنتجات المختارة لم يعد متاحاً.'],
  'Échange {id} enregistré, aucun écart': ['Exchange {id} saved, no difference', 'سُجّل الاستبدال {id}، لا فرق'],
};
const tr = (s, vars) => {
  const C = globalThis.window?.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  let out = own && (lang === 'en' || lang === 'ar') ? own[lang === 'en' ? 0 : 1] : (C && typeof C.tr === 'function' ? C.tr(s) : s);
  if (vars) for (const k of Object.keys(vars)) out = out.split('{' + k + '}').join(String(vars[k]));
  return out;
};

const TRIAL = ['amira-boutique'];
/* La couleur de la différence : en faveur de la cliente, nulle, à encaisser. */
const DIFF_CLASS = ['neg', 'zero', 'pos'];

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
  toast(tr(n > 1 ? 'Échange {id}, {n} pièces rendues, choisissez les articles qui partent' : 'Échange {id}, {n} pièce rendue, choisissez les articles qui partent', { id: sale.id, n }));
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
  const lead = tr(n > 1 ? 'Échange <b>{id}</b>, {n} pièces rendues ({amt}).' : 'Échange <b>{id}</b>, {n} pièce rendue ({amt}).', { id: esc(sale.id), n, amt: fmtMAD(M.toMad(returnedValue(sale, ex))) });
  const next = k ? `<b>${tr(k > 1 ? '{k} articles choisis' : '{k} article choisi', { k })}</b>, ${tr('touchez-en un autre ou ouvrez l\'échange.')}` : tr('Touchez les articles qui partent, un par un.');
  slot.innerHTML = `
    <div class="bq-exch-note">
      <i data-icon="sync_alt"></i>
      <span class="l">${lead}
      ${next}</span>
      ${k ? `<button class="bq-exch-cancel" id="bq-cx-open">${tr('Voir l\'échange')}</button>` : ''}
      <button class="bq-exch-cancel" id="bq-exch-cancel">${tr('Annuler l\'échange')}</button>
    </div>`;
  const open = $('#bq-cx-open', slot);
  if (open) open.onclick = () => openCombined();
  $('#bq-exch-cancel', slot).onclick = () => {
    state.exchange = null;
    renderExchNote();
    toast(tr('Échange annulé, rien n\'a bougé'));
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
    const p = P[ln.pid] || { name: ln.name || tr('Article retiré du catalogue'), art: '' };
    return `<div class="bq-exch-row is-ret">
        <span class="bq-line-art">${artOf(p)}</span>
        <span class="mid"><b>${esc(p.name)}${r.qty > 1 ? ` × ${r.qty}` : ''}</b><span>${tr('retour')} · ${esc(ln.size)} · ${colorDot(ln.color)} ${esc(colorLabel(ln.color))}${ln.remise ? ` · ${tr('payé avec −{r} %', { r: ln.remise })}` : ''}</span></span>
        <span class="amt">−${fmtMAD(paidAmount(sale, ln, r.qty))}</span>
      </div>`;
  }).join('');
  const newRows = ex.picks.map((pk, i) => {
    const p = P[pk.pid];
    return `<div class="bq-exch-row is-new">
        <span class="bq-line-art">${artOf(p)}</span>
        <span class="mid"><b>${esc(p.name)}</b><span>${tr('part')} · ${esc(pk.size)} · ${colorDot(pk.color)} ${esc(colorLabel(pk.color))} · <button type="button" class="bq-cx-del" data-bq-cx-del="${i}">${tr('Retirer')}</button></span></span>
        <span class="amt">+${fmtMAD(lineUnit({ pid: pk.pid, remise: 0 }))}</span>
      </div>`;
  }).join('');
  el.innerHTML = `
    <button class="bq-modal-x" data-bq-close aria-label="${tr('Fermer')}"><i data-icon="close"></i></button>
    <h3 class="modal-title">${tr('Échange, {id}', { id: esc(sale.id) })}</h3>
    <p class="modal-subtle">${c ? esc(c.name) : (sale.remote && !sale.clientId ? tr('Client non renseigné') : tr('Cliente de passage'))} · ${tr('les pièces rendues repartent en stock')}</p>
    <div class="bq-cx-lbl">${tr('Rendu')}</div>
    ${retRows}
    <div class="bq-cx-lbl">${tr('Part avec la cliente')}</div>
    ${newRows || `<p class="modal-subtle bq-cx-empty">${tr('Aucun article choisi pour l\'instant.')}</p>`}
    <button type="button" class="bq-btn secondary bq-cx-add" id="bq-cx-add"><i data-icon="add"></i>${tr('Ajouter un article')}</button>
    <div class="bq-exch-diff ${DIFF_CLASS[none ? 1 : Math.sign(diffCents) + 1]}">
      <span>${tr(none ? 'Choisissez au moins un article' : diffCents > 0 ? 'Différence à encaisser' : diffCents < 0 ? 'Différence en faveur de la cliente, part en avoir' : 'Aucun écart, échange direct')}</span>
      <span class="amt">${fmtMAD(none ? 0 : Math.abs(diff))}</span>
    </div>
    <div class="bq-sheet-foot">
      <button class="bq-btn secondary" data-bq-close>${tr('Retour')}</button>
      ${diffCents > 0
        ? `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-icon="payments"></i>${tr('Encaisser {amt}', { amt: fmtMAD(diff) })}</button>`
        : diffCents < 0
          ? `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-icon="confirmation_number"></i>${tr('Échanger + avoir {amt}', { amt: fmtMAD(-diff) })}</button>`
          : `<button class="bq-btn primary" id="bq-exch-go" ${none ? 'disabled' : ''}><i data-icon="check"></i>${tr('Confirmer l\'échange')}</button>`}
    </div>`;
  if (!$('#bq-cx-style', document)) {
    const styleEl = document.createElement('style');
    styleEl.id = 'bq-cx-style';
    styleEl.textContent = '.bq-cx-lbl{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6b6b6b);margin:12px 0 6px}'
      + '.bq-cx-del{border:0;background:none;padding:0;font:inherit;color:var(--atlas,#0B6E4F);text-decoration:underline;cursor:pointer}'
      + '.bq-cx-add{margin:10px 0 4px;width:100%;justify-content:center}.bq-cx-empty{margin:4px 0}';
    document.head.appendChild(styleEl);
  }
  openVeil('#bq-exch-veil');
  icons();
  $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-exch-veil'); });
  $('#bq-cx-add', el).onclick = () => { closeVeil('#bq-exch-veil'); toast(tr('Touchez l\'article suivant dans la grille ou cherchez-le')); };
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
    else toast(tr('Échange suspendu'), 6000, 'warn', tr('Impossible de réserver les articles choisis.'));
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
    if (lost) toast(tr('Échange enregistré, retour à rapprocher'), 6000, 'warn', tr('Une variante d’origine a été supprimée du catalogue.'));
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
      toast(tr('Numéro de ticket indisponible'), 6000, 'warn', tr('Reconnectez cette caisse pour réserver sa prochaine série.'));
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
        toast(tr('Avoir non émis'), 6000, 'danger', creditErrorDetail(error));
        return;
      }
      closeVeil('#bq-exch-veil');
      if (!apply(!!reservation.ok)) {
        toast(tr('Avoir émis, échange à régulariser'), 6000, 'warn', tr('{code} existe mais un article choisi est devenu indisponible.', { code: av.code }));
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
      toast(tr('Échange {id} enregistré, aucun écart', { id: sale.id }));
    });
  }
}
