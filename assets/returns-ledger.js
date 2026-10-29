/* Kiwi · le registre des retours, une seule lecture pour deux écrans.
 *
 * /api/sale/refund rend, pour un commerce, les remboursements (sale_audit) ET
 * les avoirs émis sur retour (store_credit_events, action 'issue'). La page
 * « Retours & échanges » l'affiche ; la tuile « Taux retour » de l'accueil en
 * tire la part rendue en avoir, qui n'est pas de l'argent sorti et n'entre donc
 * jamais dans le journal des remboursements. Avant ce module, la tuile ne
 * voyait que les remboursements : un jour de retours tous réglés en avoir
 * affichait « 0,0 % ».
 *
 * La période vient du sélecteur du tableau de bord (dateRange.js, source
 * unique) : la page des retours suit « Aujourd'hui », « 7 jours »… comme
 * l'accueil. Sans sélecteur (page isolée), tout l'historique. */

const KEY = 'kiwi:returnsLedger';     // { m: slug, v: venue, at, list: [{ ts, amount }] } · avoirs seulement
const MAX_AGE = 60000;
let warming = null, lastChanged = false, lastTry = '';   // « ms@slug » : un échec ne relance pas à chaque rendu

/* Toutes les pages du registre serveur. Lève une erreur si une page manque :
   un registre incomplet ne doit pas se lire comme un registre vide. */
export async function readReturnsLedger(slug) {
  const { deadlineFetch } = await import('./request-deadline.mjs').catch(() => ({ deadlineFetch: (url, options) => fetch(url, options) }));
  const list = [];
  let offset = 0;
  do {
    const response = await deadlineFetch('/api/sale/refund?merchant=' + encodeURIComponent(slug) + '&offset=' + offset, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.list)) throw new Error('returns-read');
    list.push(...data.list);
    if (data.next !== null && (!Number.isSafeInteger(data.next) || data.next <= offset)) throw new Error('returns-page');
    offset = data.next;
  } while (offset !== null);
  lastChanged = remember(slug, list);
  return list;
}

/* Les avoirs émis, gardés pour la tuile de l'accueil (lecture synchrone au
   rendu). Les remboursements n'y sont pas : le journal des ventes les a déjà. */
function remember(slug, list) {
  const avoirs = list.filter((r) => r && r.kind === 'avoir').map((r) => ({ ts: Number(r.ts) || 0, amount: Math.abs(Number(r.amount) || 0) }));
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  const changed = !prev || prev.m !== slug || JSON.stringify(prev.list) !== JSON.stringify(avoirs);
  /* `v` : l'identifiant de venue sous lequel l'accueil range ses chiffres ;
     la tuile ne lit le registre que s'il est celui du magasin à l'écran. */
  let v = '';
  try { v = String((window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || ''); } catch (_) {}
  try { localStorage.setItem(KEY, JSON.stringify({ m: slug, v, at: Date.now(), list: avoirs })); } catch (_) {}
  return changed;
}

/* Relit le registre au plus une fois par minute. Résout `true` si les avoirs
   ont changé (l'appelant repeint), `false` sinon ou en cas d'échec. */
export function warmCreditReturns() {
  let slug = '';
  try { slug = String((window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || ''); } catch (_) {}
  if (!slug || warming) return warming || Promise.resolve(false);
  const at = lastTry.indexOf('@');
  if (lastTry.slice(at + 1) === slug && Date.now() - Number(lastTry.slice(0, at)) < MAX_AGE) return Promise.resolve(false);
  lastTry = Date.now() + '@' + slug;
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (prev && prev.m === slug && Date.now() - (Number(prev.at) || 0) < MAX_AGE) return Promise.resolve(false);
  } catch (_) {}
  warming = readReturnsLedger(slug).then(() => lastChanged, () => false).finally(() => { warming = null; });
  return warming;
}

/* ── La période du sélecteur ──────────────────────────────────────────── */
export function selectedPeriod() {
  try {
    const b = window.KiwiDateRange && window.KiwiDateRange.bounds && window.KiwiDateRange.bounds();
    if (Array.isArray(b) && Number.isFinite(b[0])) return [b[0], Number(b[1]) || Infinity];
  } catch (_) {}
  return null;
}
const RANGE = {
  aujourdhui: ["Aujourd'hui", 'Today', 'اليوم'], hier: ['Hier', 'Yesterday', 'أمس'], septJours: ['7 derniers jours', 'Last 7 days', 'آخر 7 أيام'],
  trenteJours: ['30 derniers jours', 'Last 30 days', 'آخر 30 يوما'], moisDernier: ['Mois dernier', 'Last month', 'الشهر الماضي'],
  trimestre: ['Ce trimestre', 'This quarter', 'هذا الربع'], annee: ['Cette année', 'This year', 'هذه السنة'], personnalise: ['Période personnalisée', 'Custom period', 'فترة مخصصة'],
};
export function periodLabel(rL) {
  if (!selectedPeriod()) return rL('Tout l’historique', 'Full history', 'كل السجل');
  let k = '';
  try { k = window.KiwiDateRange.getDateRange(); } catch (_) {}
  const w = RANGE[k] || RANGE.aujourdhui;
  return rL(w[0], w[1], w[2]);
}
/* Les abonnés de dateRange sont réveillés à chaque vente : on ne rappelle
   que si la période (ou la langue) a vraiment changé. */
let watched = null, lastSig = '';
const periodSig = () => JSON.stringify(selectedPeriod()) + (document.documentElement.lang || '');
export function watchPeriod(onChange) {
  lastSig = periodSig();
  watched = onChange;
  if (watchPeriod.bound || !window.KiwiDateRange || !window.KiwiDateRange.subscribe) return;
  watchPeriod.bound = true;
  window.KiwiDateRange.subscribe(() => { const sig = periodSig(); if (sig !== lastSig) { lastSig = sig; if (watched) watched(); } });
}

/* ── Les lignes de la page ─────────────────────────────────────────────
   Un retour → une ligne par article. Le montant d'une ligne est ce qui a été
   rendu ou crédité, pas le prix de la ligne vendue : un Hoodie à 190 avec
   remise a donné un avoir de 171, et la page disait 190. Le registre porte le
   montant crédité du retour ; on le répartit au prorata des articles. La
   référence affichée est le ticket d'origine, jamais l'identifiant interne
   (« RET-22512-1793… », « credit:credit-issue:sale-… »). */
export function returnRows(returns, rL) {
  const period = selectedPeriod();
  return (returns || []).filter((ret) => { const ts = Number(ret && ret.ts) || 0; return !period || (ts >= period[0] && ts < period[1]); }).flatMap((ret) => {
    const items = Array.isArray(ret.items) && ret.items.length ? ret.items : [{ name: rL('Retour', 'Return', 'مرتجع'), qty: 1, amount: ret.amount }];
    const lineSum = items.reduce((t, it) => t + (Number(it && it.amount) || 0), 0);
    const credited = Number(ret.amount);
    const share = (item) => !(credited > 0) ? Number(item.amount) || 0
      : items.length === 1 ? credited
      : lineSum > 0 ? Math.round(credited * (Number(item.amount) || 0) / lineSum * 100) / 100 : credited / items.length;
    return items.map((item, i) => ({
      id: String(ret.id || 'RET') + (items.length > 1 ? '-' + (i + 1) : ''),
      ticket: ret.saleRef ? rL('Ticket', 'Receipt', 'إيصال') + ' ' + ret.saleRef : '',
      d: new Date(Number(ret.ts) || Date.now()).toLocaleDateString(rL('fr-FR', 'en-GB', 'ar-MA-u-nu-latn'), { day: '2-digit', month: '2-digit', year: 'numeric' }),
      ts: Number(ret.ts) || 0,
      qty: Number(item.qty) || 1,
      name: (Number(item.qty) || 1) + ' × ' + (item.name || rL('Article', 'Item', 'منتج')) + (item.size ? ' · ' + item.size : ''),
      amt: share(item),
      reason: ret.reason || (ret.kind === 'refund' ? rL('Motif non renseigné', 'Reason not recorded', 'السبب غير مسجل') : ret.kind === 'echange' ? rL('Échange', 'Exchange', 'استبدال') : rL('Avoir', 'Store credit', 'رصيد المتجر')),
      /* Le type de retour est une donnée, pas une chaîne d'affichage. */
      kind: ret.kind || 'avoir',
      client: ret.client || rL('Cliente de passage', 'Walk-in customer', 'زبون عابر'), status: 'ok', emoji: '', actor: ret.actor || rL('Caisse', 'Till', 'الصندوق'),
    }));
  }).sort((a, b) => b.ts - a.ts);
}
