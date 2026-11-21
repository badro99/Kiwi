/* Caisse maison · la fiche cliente, complète (20 nov. 2026).
 *
 * La fiche ne montrait que l'avoir actif et le total dépensé. Une cliente qui
 * achète à crédit (Acomptes) n'y voyait pas ce qu'elle doit, et la caissière
 * devait changer d'écran pour le savoir. La fiche dit maintenant tout, dans
 * l'ordre où on en a besoin au comptoir :
 *   qui elle est (contact, depuis quand, dernière visite),
 *   l'argent (dépensé, doit, avoirs disponibles, points),
 *   ce qu'elle doit, ticket par ticket, avec « Encaisser » qui ouvre Acomptes
 *   directement sur elle,
 *   ses achats (nombre, panier moyen, historique), le registre de ses avoirs,
 *   ses notes et étiquettes.
 * Les notes ouvertes viennent de KiwiRetailBalances (serveur + journal de la
 * caisse, lisible hors ligne), comme l'écran Acomptes : les deux disent le même
 * montant. */

const tr = (x) => (globalThis.window?.KiwiCaisseLang || { tr: (y) => y }).tr(x);
const icon = (name) => `<i data-icon="${name}"></i>`;
const cents = (v) => Math.round(Number(v) || 0);
const dueOf = (r) => Math.max(0, cents(r.totalCents) - cents(r.paidCents) - cents(r.pendingCents));

/* Les chiffres de la fiche, sans DOM. */
export function ficheModel({ client = {}, raw = null, owed = [], avoirs = [], now = Date.now() } = {}) {
  const id = String(client.id || '');
  const r = raw || {};
  const notes = (owed || []).filter((b) => b && String(b.customerId || '') === id && dueOf(b) > 0)
    .sort((a, b) => (+a.createdTs || 0) - (+b.createdTs || 0) || String(a.ticketRef).localeCompare(String(b.ticketRef)))
    .map((b) => ({ id: b.id, ref: String(b.ticketRef || ''), ts: +b.createdTs || 0, totalCents: cents(b.totalCents),
      paidCents: cents(b.paidCents) + cents(b.pendingCents), dueCents: dueOf(b),
      kind: String(b.kind || ''), expiresAt: Number(b.expiresAt) || 0, lines: Array.isArray(b.lines) ? b.lines : [] }));
  const live = (avoirs || []).filter((a) => a && a.holderId === id && (+a.balance || 0) > 0 && !(a.until && +new Date(a.until) < now));
  const spent = +client.spent || 0, achats = +client.achats || 0;
  return {
    owedCents: notes.reduce((s, n) => s + n.dueCents, 0), notes,
    avoirCount: live.length, avoirTotal: Math.round(live.reduce((s, a) => s + (+a.balance || 0), 0) * 100) / 100,
    spent, achats, basket: achats ? Math.round((spent / achats) * 100) / 100 : 0,
    since: +(r.firstSeen || r.createdAt || 0) || 0, last: +(client.lastSeen || r.lastSeen || 0) || 0,
    email: String(r.email || ''), city: String(r.city || ''), birthday: String(r.birthday || ''), address: String(r.address || ''),
    tags: Array.isArray(r.tags) ? r.tags.filter(Boolean).map(String) : [],
  };
}

const STYLE = `
.mz-fstats.is-4{grid-template-columns:repeat(4,1fr)}
@media (max-width:560px){.mz-fstats.is-4{grid-template-columns:repeat(2,1fr)}}
.mz-fstat[data-owe="1"] b{color:#a8321f}
.mz-fstat .sub{display:block;font-size:10.5px;color:var(--ink-3);margin-top:2px;text-transform:none;letter-spacing:0}
.mz-fid{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;font-size:12px;color:var(--ink-2)}
.mz-fid span{display:inline-flex;align-items:center;gap:5px}
.mz-fid i[data-icon]{width:15px;height:15px;color:var(--ink-3)}
.mz-fowe{border:1px solid #e6c9c2;background:#fbf3f1;border-radius:14px;padding:12px 14px;margin:0 0 14px}
.mz-fowe-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mz-fowe-head>span{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.mz-fowe-head i[data-icon]{width:18px;height:18px;color:#a8321f}
.mz-fowe-head b{font-family:var(--mono);font-size:16px;color:#a8321f}
.mz-fowe-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-top:1px solid #f0dcd7;font-size:12.5px}
.mz-fowe-row:first-of-type{margin-top:8px}
.mz-fowe-row small{color:var(--ink-3)}
.mz-fowe-row .amt{font-family:var(--mono);font-weight:700;text-align:right}
.mz-ftags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.mz-ftag{font-size:11px;padding:3px 9px;border-radius:999px;background:var(--paper-soft,#f2f0ea);color:var(--ink-2)}
.mz-fkpi{font-size:11.5px;color:var(--ink-3);margin:-2px 0 6px}`;
function ensureStyle() {
  const d = globalThis.document;
  if (!d || d.getElementById('mz-fiche-style')) return;
  const style = d.createElement('style'); style.id = 'mz-fiche-style'; style.textContent = STYLE; d.head.appendChild(style);
}

function creditHistoryRows(credits, k) {
  const { esc, fmtMAD, whenLabel, fmtValidUntil } = k;
  const rows = Array.isArray(credits) ? credits : [];
  if (!rows.length) return `<div class="mz-empty" style="padding:16px;">${tr('Aucun avoir enregistré.')}</div>`;
  return rows.map((credit) => {
    const issued = (credit.events || []).find((event) => event.action === 'issue') || {};
    const lines = Array.isArray(issued.lines) ? issued.lines : [];
    const eventRows = (credit.events || []).filter((event) => event.action !== 'issue').map((event) =>
      `<small style="display:block;margin-top:4px;color:var(--ink-3);">${event.action === 'redeem' ? tr('Utilisé') : event.action === 'cancel' ? tr('Annulé') : esc(event.action)} · ${fmtMAD((event.amountCents || 0) / 100)} · ${whenLabel(event.ts)} · ${esc(event.actor || 'Caisse')} · ${tr('solde')} ${fmtMAD((event.balanceAfterCents || 0) / 100)}</small>`
    ).join('');
    return `<div class="mz-fhist-row" style="align-items:flex-start;">
      <span class="when">${whenLabel(credit.at)}<small style="display:block;">${tr('expire')} ${fmtValidUntil(credit.until)}</small></span>
      <span class="what"><b>${esc(credit.code)}</b> · ${tr('vente')} ${esc(credit.from || '·')}<small style="display:block;">${lines.length ? esc(lines.map((line) => `${line.qty || 1}× ${line.name || 'Article'}`).join(' + ')) : esc(credit.motif || 'Retour')} · ${esc(issued.actor || 'Caisse')}</small>${eventRows}</span>
      <span class="amt">${fmtMAD(credit.amount)}<small style="display:block;color:var(--ink-3);">${tr('reste')} ${fmtMAD(credit.balance)}</small></span>
    </div>`;
  }).join('');
}

async function fillCredits(cid, host, k) {
  if (!host) return;
  try {
    const credits = k.demo ? k.AVOIRS.filter((item) => item.holderId === cid)
      : (await k.creditRequest(null, '&customerId=' + encodeURIComponent(cid))).credits.map(k.creditFromServer);
    if (!host.isConnected) return;
    host.innerHTML = creditHistoryRows(credits, k);
    k.icons();
  } catch (_) {
    if (host.isConnected) host.innerHTML = `<div class="mz-empty" style="padding:16px;">${tr('Historique des avoirs indisponible. Réessayez.')}</div>`;
  }
}

function dayLabel(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString(globalThis.document?.documentElement?.lang || 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; }
}

/* La section « Doit », remplie quand les notes arrivent (serveur ou journal). */
function oweHtml(m, k) {
  const { esc, fmtMAD } = k;
  if (!m.owedCents) return '';
  return `<div class="mz-fowe" id="mz-fiche-owe">
    <div class="mz-fowe-head"><span>${icon('payments')} ${tr('Doit')} <b>${fmtMAD(m.owedCents / 100)}</b> · ${m.notes.length} ${m.notes.length > 1 ? tr('notes') : tr('note')}</span>
      <button class="mz-btn primary" id="mz-fiche-settle" type="button">${tr('Encaisser')}</button></div>
    ${m.notes.map((n) => `<div class="mz-fowe-row"><span>${tr('Ticket')} <b>${esc(n.ref)}</b><small style="display:block;">${dayLabel(n.ts)} · ${tr('total')} ${fmtMAD(n.totalCents / 100)} · ${tr('payé')} ${fmtMAD(n.paidCents / 100)}${n.kind ? ' · ' + esc(noteDetail(n)) : ''}</small></span><span class="amt">${fmtMAD(n.dueCents / 100)}</span></div>`).join('')}
  </div>`;
}

/* Les notes ouvertes de la boutique : le journal de la caisse tout de suite,
   puis serveur + journal (KiwiRetailBalances, comme l'écran Acomptes). */
import { noteDetail } from '../retail-avance.js?v=3';   /* avance ou compte, pièce gardée jusqu'au… */
const balances = () => globalThis.window?.KiwiRetailBalances || null;
const owedCache = (slug) => { const R = balances(); return R ? R.read(slug) : []; };
const owedFresh = (slug) => { const R = balances(); return R ? R.list(slug) : null; };

/* Ouvre la fiche. k = dépendances de la caisse (sales.js). */
export function mzOpenFiche(cid, k) {
  const c = k.clById(cid);
  if (!c) return;
  ensureStyle();
  const { esc, fmtMAD, el } = k;
  const raw = k.raw(cid) || {};
  const av = k.clAvoirOf(c);
  const cloudHistory = (c.history || []).map((h) => ({
    when: h.when || k.whenLabel(h.ts || h.createdAt || 0),
    what: h.what || (Array.isArray(h.items) && h.items.length ? h.items.map((it) => `${it.qty || 1}× ${it.name || 'Article'}`).join(' + ') : (h.ref || 'Achat')),
    amt: h.amt != null ? h.amt : h.amount,
    method: h.method || '', ref: h.ref || '', ts: +(h.ts || h.createdAt || 0),
  }));
  const syncedRefs = new Set(cloudHistory.map((h) => String(h.ref || '')).filter(Boolean));
  const localOnly = k.SALES.filter((s) => s.clientId === cid && !s.voided
    && !syncedRefs.has(String(s.id || '')) && !syncedRefs.has(String(s.num || ''))).map((s) => ({
    when: k.whenLabel(s.at),
    what: s.lines.map((l) => `${(k.P[l.pid] && k.P[l.pid].name) || l.name || 'Article'} · ${l.size}`).join(' + '),
    amt: s.total, method: s.methods || '', ref: s.id || s.num || '', ts: +s.at || 0,
  }));
  const hist = localOnly.concat(cloudHistory).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  /* c.spent compte déjà les achats locaux et synchronisés : ne pas rajouter les lignes du jour. */
  const lastTs = hist.length ? hist[0].ts : 0;
  let m = ficheModel({ client: { ...c, lastSeen: c.lastSeen || lastTs, achats: c.achats || hist.length }, raw, owed: owedCache(k.merchant), avoirs: k.avoirs(), now: Date.now() });
  const reward = k.reward ? k.reward(cid) : null;
  const ident = [
    m.email ? `<span>${icon('send')}${esc(m.email)}</span>` : '',
    m.city ? `<span>${icon('location_on')}${esc(m.city)}</span>` : '',
    m.birthday ? `<span>${icon('cake')}${esc(m.birthday)}</span>` : '',
    m.since ? `<span>${icon('person')}${tr('Cliente depuis')} ${dayLabel(m.since)}</span>` : '',
    m.last ? `<span>${icon('schedule')}${tr('Dernière visite')} ${dayLabel(m.last)}</span>` : '',
  ].filter(Boolean).join('');
  const notes = (c.prefs || []).filter(Boolean);
  el.innerHTML = `
    <button class="mz-modal-x" data-mz-close aria-label="${tr('Fermer')}">${icon('close')}</button>
    <div class="mz-fiche-head">
      <span class="mz-fiche-ava">${esc(k.initials(c.name))}</span>
      <div>
        <h3>${esc(c.name)} ${c.vip ? `<span class="mz-vip-chip">${tr('VIP')}</span>` : ''}</h3>
        <div class="tel">${esc(c.phone || tr('sans téléphone'))}${c.taille ? ' · ' + tr('taille') + ' ' + esc(c.taille) : ''}</div>
      </div>
    </div>
    ${ident ? `<div class="mz-fid">${ident}</div>` : ''}
    <div class="mz-fstats is-4">
      <div class="mz-fstat"><b>${fmtMAD(m.spent)}</b><span>${tr('dépensé')}</span></div>
      <div class="mz-fstat" data-owe="${m.owedCents ? 1 : 0}" id="mz-fstat-owe"><b>${fmtMAD(m.owedCents / 100)}</b><span>${tr('doit')}</span></div>
      <div class="mz-fstat"><b>${fmtMAD(m.avoirTotal)}</b><span>${tr('avoirs dispo.')}</span></div>
      <div class="mz-fstat"><b>${c.points || 0}</b><span>${tr('points')}${reward && reward.ready ? ` <em class="sub">${tr('récompense prête')} · ${esc(reward.label)}</em>` : ''}</span></div>
    </div>
    <div id="mz-fiche-owe-slot">${oweHtml(m, k)}</div>
    ${av ? `<button class="mz-favoir" id="mz-fiche-av">${icon('confirmation_number')}${tr('Avoir actif')} <b>${esc(av.code)}</b> · ${fmtMAD(av.balance)}, ${tr('utilisable en caisse')}<span class="see">${tr('Voir')}</span></button>` : ''}
    ${m.tags.length ? `<div class="mz-ftags">${m.tags.map((t) => `<span class="mz-ftag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${notes.length ? `<div class="mz-fnotes">${notes.map((p) => `<div class="mz-fnote">${icon('favorite')}${esc(p)}</div>`).join('')}</div>` : ''}
    <div class="mz-f-lbl" style="margin-bottom:6px;">${tr('Achats')}</div>
    <div class="mz-fkpi">${m.achats} ${m.achats > 1 ? tr('achats') : tr('achat')}${m.basket ? ' · ' + tr('panier moyen') + ' ' + fmtMAD(m.basket) : ''}</div>
    <div class="mz-fhist">
      ${hist.length ? hist.map((h) => `<div class="mz-fhist-row"><span class="when">${esc(h.when)}${h.method ? `<small style="display:block;">${esc(h.method)}</small>` : ''}</span><span class="what">${esc(h.what)}${h.ref ? `<small style="display:block;">${tr('Ticket')} ${esc(h.ref)}</small>` : ''}</span><span class="amt">${fmtMAD(h.amt)}</span></div>`).join('') : `<div class="mz-empty">${tr('Aucun achat enregistré.')}</div>`}
    </div>
    <div class="mz-f-lbl" style="margin:16px 0 6px;">${tr('Avoirs et remboursements')}</div>
    <div class="mz-fhist" id="mz-fiche-credits"><div class="mz-empty" style="padding:16px;">${tr('Chargement du registre…')}</div></div>
    <div class="mz-sheet-foot">
      <button class="mz-btn secondary" data-mz-close>${tr('Fermer')}</button>
      <button class="mz-btn primary" id="mz-fiche-sell">${icon('shopping_bag')}${tr('Nouvelle vente pour elle')}</button>
    </div>`;
  k.openVeil('#mz-fiche-veil');
  k.icons();
  k.$$('[data-mz-close]', el).forEach((b) => { b.onclick = () => k.closeVeil('#mz-fiche-veil'); });
  const avB = el.querySelector('#mz-fiche-av');
  if (avB) avB.onclick = () => { k.closeVeil('#mz-fiche-veil'); k.openVoucher(av, { mode: 'view' }); };
  el.querySelector('#mz-fiche-sell').onclick = () => { k.closeVeil('#mz-fiche-veil'); k.onSell(c); };
  const wireSettle = () => {
    const b = el.querySelector('#mz-fiche-settle');
    if (b) b.onclick = () => { k.closeVeil('#mz-fiche-veil'); k.onSettle(cid); };
  };
  wireSettle();
  /* Les notes à jour (serveur + journal), puis la section « Doit » se redessine. */
  Promise.resolve(owedFresh(k.merchant)).then((rows) => {
    if (!el.isConnected || !rows) return;
    m = ficheModel({ client: { ...c, lastSeen: c.lastSeen || lastTs, achats: c.achats || hist.length }, raw, owed: rows, avoirs: k.avoirs(), now: Date.now() });
    const slot = el.querySelector('#mz-fiche-owe-slot'), tile = el.querySelector('#mz-fstat-owe');
    if (slot) slot.innerHTML = oweHtml(m, k);
    if (tile) { tile.dataset.owe = m.owedCents ? '1' : '0'; tile.querySelector('b').textContent = fmtMAD(m.owedCents / 100); }
    wireSettle(); k.icons();
  }, () => {});
  void fillCredits(cid, el.querySelector('#mz-fiche-credits'), k);
}
