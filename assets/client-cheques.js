/* Fiche cliente (tableau de bord) · ses chèques.
 *
 * Une ligne sous les coordonnées : combien de chèques de cette cliente sont
 * en main (nombre, somme, prochaine échéance), et ce qui est revenu impayé.
 * La dette d'un chèque rejeté est déjà dans « doit » (note ouverte au carnet
 * de crédit, functions/api/_cheque-debt.js) : ici on dit d'où elle vient.
 * Un toucher ouvre le portefeuille filtré sur elle (nav-cheques).
 *
 * Lit /api/cheques?party=customer|<id> : patron et gérant seulement ; un autre
 * rôle, une démo ou une coupure réseau n'affichent rien, jamais un faux zéro.
 * Module ES chargé à l'ouverture de la fiche (assets/clients-directory.js). */

const T = {
  fr: { title: 'Chèques', hand: (n) => (n === 1 ? '1 chèque en main' : `${n} chèques en main`), next: 'prochaine échéance', bad: (n) => (n === 1 ? '1 revenu impayé' : `${n} revenus impayés`), open: 'Voir ses chèques' },
  en: { title: 'Cheques', hand: (n) => (n === 1 ? '1 cheque in hand' : `${n} cheques in hand`), next: 'next due', bad: (n) => (n === 1 ? '1 bounced' : `${n} bounced`), open: 'See her cheques' },
  ar: { title: 'الشيكات', hand: (n) => (n === 1 ? 'شيك واحد فاليد' : n === 2 ? 'جوج شيكات فاليد' : `${n} شيكات فاليد`), next: 'الأجل الجاي', bad: (n) => (n === 1 ? 'واحد رجع بلا رصيد' : `${n} رجعو بلا رصيد`), open: 'شوف الشيكات ديالها' },
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const locale = (lg) => (lg === 'ar' ? 'ar-MA-u-nu-latn' : lg === 'en' ? 'en-GB' : 'fr-FR');
const mad = (cents, lg) => { let s; try { s = new Intl.NumberFormat(locale(lg), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100); } catch (_) { s = (cents / 100).toFixed(2); } return s + (lg === 'ar' ? ' درهم' : ' MAD'); };
const day = (ymd, lg) => { try { return new Date(ymd + 'T12:00:00Z').toLocaleDateString(locale(lg), { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch (_) { return ymd; } };

/* Ce que la ligne dit, à partir de la liste du serveur (testé sans navigateur). */
export function chequeSummary(cheques) {
  const out = { handCount: 0, handCents: 0, nextDue: '', badCount: 0, badCents: 0 };
  for (const c of cheques || []) {
    if (!c || c.direction !== 'received') continue;
    if (c.status === 'received') {
      out.handCount++; out.handCents += Number(c.amountCents) || 0;
      const due = c.dueDate || c.receptionDate || '';
      if (due && (!out.nextDue || due < out.nextDue)) out.nextDue = due;
    } else if (c.debtOpen && (c.status === 'rejected' || c.status === 'in_litigation')) {
      out.badCount++; out.badCents += (c.debt && c.debt.onAccount ? c.debt.remainingCents : Number(c.amountCents)) || 0;
    }
  }
  return out;
}

export function chequeLine(sum, clientId, lg) {
  const t = T[lg] || T.fr;
  if (!sum || (!sum.handCount && !sum.badCount)) return '';
  const parts = [];
  if (sum.handCount) parts.push(`${t.hand(sum.handCount)} · ${mad(sum.handCents, lg)}${sum.nextDue ? ` · ${t.next} ${day(sum.nextDue, lg)}` : ''}`);
  if (sum.badCount) parts.push(`<b style="font-weight:600;color:var(--danger,#C94A3A)">${esc(t.bad(sum.badCount))} · ${esc(mad(sum.badCents, lg))}</b>`);
  return `<div class="cd-drow" data-client-cheques><span class="k">${esc(t.title)}</span><span class="v">${parts.map((p, i) => (i === 0 && sum.handCount ? esc(p) : p)).join('<br>')}<br>`
    + `<button type="button" class="cd-act" data-action="nav-cheques" data-arg="${esc('party:customer|' + clientId)}">${esc(t.open)}</button></span></div>`;
}

/* Pose la ligne dans la fiche ouverte ; `close` ferme la fiche quand on part au portefeuille. */
export async function mountClientCheques(host, { merchant, clientId, lang, close, fetchImpl } = {}) {
  if (!host || !merchant || !clientId) return false;
  const f = fetchImpl || globalThis.fetch;
  let list;
  try {
    const r = await f('/api/cheques?merchant=' + encodeURIComponent(merchant) + '&party=' + encodeURIComponent('customer|' + clientId), { credentials: 'same-origin' });
    if (!r.ok) return false;
    const j = await r.json();
    list = j && Array.isArray(j.cheques) ? j.cheques : null;
  } catch (_) { return false; }
  if (!list || !host.isConnected) return false;
  const html = chequeLine(chequeSummary(list), clientId, lang);
  if (!html) return false;
  const anchor = host.querySelector('.cd-history');
  if (anchor) anchor.insertAdjacentHTML('beforebegin', html); else host.insertAdjacentHTML('beforeend', html);
  const btn = host.querySelector('[data-client-cheques] [data-action="nav-cheques"]');
  if (btn && typeof close === 'function') btn.addEventListener('click', () => setTimeout(close, 0));
  return true;
}
