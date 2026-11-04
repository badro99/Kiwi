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
let warming = null, lastChanged = false, lastTry = '';
/* La copie en mémoire fait foi : si localStorage refuse l'écriture (quota,
   navigation privée), le résultat serveur tout frais ne se perd pas et les
   lecteurs synchrones (tuile « Taux retour ») le lisent ici. */
let snapshot = null, persisted = true;
function cachedLedger() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  if (snapshot && (!stored || Number(snapshot.at) >= Number(stored.at || 0))) return snapshot;
  return stored;
}
function saveLedger(rec) {
  snapshot = rec;
  try { localStorage.setItem(KEY, JSON.stringify(rec)); persisted = true; } catch (_) { persisted = false; }
  return persisted;
}
/* Lecture synchrone du registre mémorisé (mémoire d'abord), et état de la persistance. */
export function ledgerSnapshot() { return cachedLedger(); }
/* Le registre, seulement s'il appartient à la venue demandée ET au commerce
   actuellement à l'écran : un total en retard d'un autre magasin n'entre jamais
   dans la tuile. */
export function ledgerFor(venue) {
  const d = cachedLedger();
  if (!d || d.v !== venue) return null;
  const now = currentIdentity();
  return now.slug && d.m !== now.slug ? null : d;
}
export function ledgerPersisted() { return persisted; }
/* Qui est à l'écran : commerce du document et venue de l'accueil. */
function currentIdentity() {
  let slug = '', venue = '';
  try { slug = String((window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || ''); } catch (_) {}
  try { venue = String((window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || ''); } catch (_) {}
  return { slug, venue };
}   // « ms@slug » : un échec ne relance pas à chaque rendu

/* Toutes les pages du registre serveur. Lève une erreur si une page manque :
   un registre incomplet ne doit pas se lire comme un registre vide. */
export async function readReturnsLedger(slug, period = null) {
  const { deadlineFetch } = await import('./request-deadline.mjs');
  /* L'identité est prise AVANT la requête : un retour tardif d'un commerce
     quitté ne doit pas se ranger sous le commerce affiché à son arrivée. */
  const asked = currentIdentity();
  const query = period ? '&since=' + period[0] + (Number.isFinite(period[1]) ? '&until=' + period[1] : '') : '';
  const list = [];
  let offset = 0;
  do {
    const response = await deadlineFetch('/api/sale/refund?merchant=' + encodeURIComponent(slug) + '&offset=' + offset + query, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.list)) throw new Error('returns-read');
    list.push(...data.list);
    if (data.next !== null && (!Number.isSafeInteger(data.next) || data.next <= offset)) throw new Error('returns-page');
    offset = data.next;
  } while (offset !== null);
  const now = currentIdentity();
  const sameStore = (!asked.slug || !now.slug || now.slug === slug) && now.venue === asked.venue;
  lastChanged = sameStore ? remember(slug, list, period, asked.venue) : false;
  return list;
}

/* Les avoirs émis, gardés pour la tuile de l'accueil (lecture synchrone au
   rendu). Les remboursements n'y sont pas : le journal des ventes les a déjà. */
function remember(slug, list, period, venue) {
  const avoirs = list.filter((r) => r && r.kind === 'avoir').map((r) => ({ ts: Number(r.ts) || 0, amount: Math.abs(Number(r.amount) || 0) }));
  const prev = cachedLedger();
  const changed = !prev || prev.stale || prev.m !== slug || JSON.stringify(prev.list) !== JSON.stringify(avoirs) || JSON.stringify(prev.window) !== JSON.stringify(period);
  /* `v` : l'identifiant de venue sous lequel l'accueil range ses chiffres ;
     la tuile ne lit le registre que s'il est celui du magasin à l'écran. */
  saveLedger({ m: slug, v: venue, at: Date.now(), window: period, list: avoirs });
  return changed;
}

/* Relit le registre au plus une fois par minute. Résout `true` si les avoirs
   ont changé (l'appelant repeint), `false` sinon ou en cas d'échec. */
export function coversWindow(cache, period) {
  if (!cache || !Object.hasOwn(cache, 'window')) return false;
  if (cache.window === null) return true;
  return !!period && cache.window[0] <= period[0] && (cache.window[1] == null ? Infinity : cache.window[1]) >= period[1];
}
export function warmCreditReturns(period = selectedPeriod()) {
  const selected = selectedPeriod();
  if (period && selected && period[0] === selected[0] && selected[1] === Infinity) period = [period[0], Infinity];
  let slug = '';
  try { slug = String((window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || ''); } catch (_) {}
  if (!slug) return Promise.resolve(false);
  if (warming) return warming.then(changed => warmCreditReturns(period).then(next => changed || next));
  const signature = slug + ':' + JSON.stringify(period);
  const at = lastTry.indexOf('@');
  if (lastTry.slice(at + 1) === signature && Date.now() - Number(lastTry.slice(0, at)) < MAX_AGE) return Promise.resolve(false);
  lastTry = Date.now() + '@' + signature;
  try {
    const prev = cachedLedger();
    if (prev && prev.m === slug && coversWindow(prev, period) && Date.now() - (Number(prev.at) || 0) < MAX_AGE) return Promise.resolve(false);
    // Keep the previous read when widening, so current and comparison periods coexist.
    if (period && prev && prev.m === slug && Date.now() - (Number(prev.at) || 0) < MAX_AGE && Array.isArray(prev.window)) period = [Math.min(period[0], prev.window[0]), Math.max(period[1], prev.window[1] == null ? Infinity : prev.window[1])];
  } catch (_) {}
  warming = readReturnsLedger(slug, period).then(() => lastChanged, () => {
    try {
      const cached = cachedLedger();
      if (cached && cached.m === slug) { const changed = !cached.stale; cached.stale = true; saveLedger(cached); return changed; }
    } catch (_) {}
    return false;
  }).finally(() => { warming = null; });
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
const watchers = new Set();
let unwatch = null, lastSig = '';
const periodSig = () => JSON.stringify(selectedPeriod()) + (document.documentElement.lang || '');
export function watchPeriod(onChange) {
  watchers.add(onChange);
  if (!unwatch && window.KiwiDateRange?.subscribe) {
    lastSig = periodSig();
    unwatch = window.KiwiDateRange.subscribe(() => {
      const sig = periodSig();
      if (sig !== lastSig) { lastSig = sig; for (const fn of watchers) fn(); }
    });
  }
  return () => {
    watchers.delete(onChange);
    if (!watchers.size && unwatch) { unwatch(); unwatch = null; }
  };
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
    const cents = Number.isFinite(credited) && credited >= 0 ? Math.round(credited * 100) : Math.round(lineSum * 100);
    let allocated = 0, weight = 0;
    const shares = items.map((item, i) => {
      weight += lineSum > 0 ? (Number(item.amount) || 0) / lineSum : 1 / items.length;
      const cumulative = i === items.length - 1 ? cents : Math.round(cents * weight);
      const share = cumulative - allocated; allocated = cumulative;
      return share / 100;
    });
    const owner = typeof window === 'undefined' ? {} : window;
    const slug = owner.KiwiCloudDoc?.currentSlug?.();
    const venue = owner.KiwiVenue?.getCurrentVenueData?.();
    const timeZone = owner.KiwiDayReport?.timezone?.(slug) || venue?.timezone || venue?.timeZone || venue?.tz || owner.KiwiConfig?.timezone || owner.KiwiConfig?.timeZone || 'Africa/Casablanca';
    return items.map((item, i) => ({
      id: String(ret.id || 'RET') + (items.length > 1 ? '-' + (i + 1) : ''),
      ticket: ret.saleRef ? rL('Ticket', 'Receipt', 'إيصال') + ' ' + ret.saleRef : '',
      // Loi des fuseaux du Maroc : un navigateur à tzdata ancien date un remboursement du soir au lendemain.
      d: new (owner.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(rL('fr-FR', 'en-GB', 'ar-MA-u-nu-latn'), { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Number(ret.ts) || Date.now())),
      ts: Number(ret.ts) || 0,
      qty: Number(item.qty) || 1,
      name: (Number(item.qty) || 1) + ' × ' + (item.name || rL('Article', 'Item', 'منتج')) + (item.size ? ' · ' + item.size : ''),
      amt: shares[i],
      reason: ret.reason || (ret.kind === 'refund' ? rL('Motif non renseigné', 'Reason not recorded', 'السبب غير مسجل') : ret.kind === 'echange' ? rL('Échange', 'Exchange', 'استبدال') : rL('Avoir', 'Store credit', 'رصيد المتجر')),
      /* Le type de retour est une donnée, pas une chaîne d'affichage. */
      kind: ret.kind || 'avoir',
      client: ret.client || rL('Cliente de passage', 'Walk-in customer', 'زبون عابر'), status: 'ok', emoji: '', actor: ret.actor || rL('Caisse', 'Till', 'الصندوق'),
    }));
  }).sort((a, b) => b.ts - a.ts);
}
