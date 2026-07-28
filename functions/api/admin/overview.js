// GET /api/admin/overview — la vue d'ensemble de Kiwi, pas celle d'un client.
//
// La console s'ouvrait sur la liste des clients : une ligne par établissement,
// le chiffre du jour de chacun, et rien qui réponde aux quatre questions qu'on
// se pose en ouvrant son propre back-office — combien de clients avons-nous,
// combien gagnons-nous, combien font-ils, et où sont-ils. Cette route les
// calcule. Réservée à l'opérateur, comme tout /api/admin/*.
//
// TROIS RÈGLES D'HONNÊTETÉ, parce que ce sont NOS chiffres et qu'on les
// regardera pour décider :
//
//  1. Les démos ne comptent pas. Un établissement que personne n'a réclamé
//     (aucun compte ne le possède) est une donnée de démonstration ; il est
//     compté à part et jamais additionné aux clients réels.
//  2. Les ventes sorties des livres ne comptent pas. `void_ts` non NULL a déjà
//     retiré la ligne du chiffre d'affaires du commerçant ; elle ne peut pas
//     revenir dans le nôtre.
//  3. Ce qu'on ne sait pas est dit, pas estimé. Un établissement sans ville
//     n'est pas rangé dans « autre », il est compté comme non situé. Un palier
//     sans tarif et sans montant convenu n'est pas compté zéro dans le MRR, il
//     sort dans `untariffed`. Les colonnes pas encore appliquées en base sont
//     annoncées dans `columns` pour que la vue dise « colonne absente » plutôt
//     que d'afficher un zéro qui ressemble à un fait.

import { isOperator, slugMerchant, json } from '../../auth/_lib.js';

/* Le tarif public, tel qu'il est vendu (voir CLAUDE.md § Phase 1). Ultimate est
 * SUR DEVIS : il n'a pas de prix ici, et c'est exactement pourquoi
 * merchant_config.mrr existe — l'opérateur y inscrit le montant convenu. Un
 * établissement Ultimate sans montant saisi n'est pas compté 0, il est compté
 * comme non tarifé et la vue le réclame. */
const TIER_PRICE = { basic: 199, pro: 399, ultra: 1499 };
const TIER_ORDER = ['basic', 'pro', 'ultra', 'ultimate'];

const DAY = 86400000;

/* Une requête qui peut porter sur une colonne pas encore appliquée. On tente,
 * et on retombe sur la version sans elle plutôt que de rendre 500 : une base en
 * retard d'un ALTER doit dégrader la vue, pas la fermer. Le booléen rendu dit
 * laquelle des deux a répondu, et il remonte jusqu'à l'écran. */
async function tryAll(env, sql, fallbackSql, binds = []) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return { rows: r.results || [], full: true };
  } catch (_) {
    if (!fallbackSql) return { rows: [], full: false };
    try {
      const r = await env.DB.prepare(fallbackSql).bind(...binds).all();
      return { rows: r.results || [], full: false };
    } catch (__) {
      return { rows: [], full: false };
    }
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);

  const now = Date.now();
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();
  const d7 = now - 7 * DAY;
  const d30 = now - 30 * DAY;

  try {
    /* ── 1. Le parc : un établissement par ligne, et qui le possède ─────────
     * Même construction que /api/admin/clients — l'union de ce qui apparaît
     * dans la config, dans les comptes et dans les ventes — pour que les deux
     * écrans ne puissent pas compter deux nombres différents de clients. */
    const stores = new Map();  // slug → { city, plan, mrr, accountId, status }
    const store = (m) => {
      let s = stores.get(m);
      if (!s) { s = { merchant: m, city: '', plan: '', mrr: null, accountId: '', status: 'active' }; stores.set(m, s); }
      return s;
    };

    const cfg = await tryAll(env,
      'SELECT merchant, plan, account_id, status, city, mrr FROM merchant_config',
      'SELECT merchant, plan, account_id, status FROM merchant_config');
    const columns = { city: cfg.full, mrr: cfg.full };
    for (const c of cfg.rows) {
      const s = store(c.merchant);
      s.plan = (c.plan || '').toLowerCase();
      s.accountId = c.account_id || '';
      if (c.status === 'suspended') s.status = 'suspended';
      s.city = (c.city || '').trim();
      s.mrr = (c.mrr == null || c.mrr === '') ? null : Number(c.mrr);
    }

    /* Les comptes. Chacun tient au moins l'établissement avec lequel il s'est
     * inscrit, retrouvé par slug — c'est le rattachement historique, gardé pour
     * qu'un compte qui n'a jamais synchronisé soit quand même un client. */
    const accts = await env.DB.prepare(
      'SELECT id, email, business, status, created_ts FROM accounts').all();
    const accounts = new Map();
    for (const a of (accts.results || [])) {
      accounts.set(a.id, a);
      const s = store(slugMerchant(a.business || a.email));
      if (!s.accountId) s.accountId = a.id;
    }

    /* Les ventes révèlent des établissements que ni la config ni les comptes ne
     * connaissent (une caisse appairée avant tout compte). Ils existent, donc
     * ils apparaissent — en démo, faute de propriétaire. */
    const perStore = await tryAll(env,
      `SELECT merchant,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS today,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS w,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS m,
              COALESCE(SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END),0)      AS mcount,
              COALESCE(SUM(amount),0)                                   AS total,
              COALESCE(COUNT(*),0)                                      AS tcount,
              MAX(ts)                                                   AS last_ts
         FROM sales WHERE void_ts IS NULL GROUP BY merchant`,
      `SELECT merchant,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS today,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS w,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END),0) AS m,
              COALESCE(SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END),0)      AS mcount,
              COALESCE(SUM(amount),0)                                   AS total,
              COALESCE(COUNT(*),0)                                      AS tcount,
              MAX(ts)                                                   AS last_ts
         FROM sales GROUP BY merchant`,
      [dayStart, d7, d30, d30]);
    const voidAware = perStore.full;
    const salesOf = new Map();
    for (const r of perStore.rows) {
      store(r.merchant);
      salesOf.set(r.merchant, r);
    }

    /* ── 2. Réel ou démo ────────────────────────────────────────────────────
     * Un établissement est réel quand un compte existant le possède. Un compte
     * supprimé laisse un magasin orphelin : il retombe en démo, ce qui est
     * exact — plus personne ne le paie. */
    let real = [], demo = [];
    for (const s of stores.values()) {
      const owner = s.accountId && accounts.get(s.accountId);
      if (owner) { s.owner = owner; real.push(s); } else demo.push(s);
    }

    /* Un CLIENT n'est pas un établissement : une même personne peut en tenir
     * deux. Compter les lignes donnerait « 8 clients » pour 6 personnes. */
    const owners = new Set(real.map((s) => s.accountId));
    let suspendedAccounts = 0, activeAccounts = 0;
    for (const id of owners) {
      const a = accounts.get(id);
      if (a && a.status === 'suspended') suspendedAccounts++; else activeAccounts++;
    }
    const newAccounts30 = [...owners]
      .filter((id) => { const a = accounts.get(id); return a && (a.created_ts || 0) >= d30; }).length;

    /* ── 3. Ce que font nos clients ─────────────────────────────────────────*/
    const gmv = { today: 0, d7: 0, d30: 0, all: 0, count30: 0, countAll: 0, basket30: 0, activeToday: 0, silent7: 0 };
    let demoGmv30 = 0;
    for (const s of real) {
      const r = salesOf.get(s.merchant);
      if (!r) { gmv.silent7++; continue; }
      gmv.today += r.today || 0;
      gmv.d7 += r.w || 0;
      gmv.d30 += r.m || 0;
      gmv.all += r.total || 0;
      gmv.count30 += r.mcount || 0;
      gmv.countAll += r.tcount || 0;
      if ((r.today || 0) > 0) gmv.activeToday++;
      if ((r.last_ts || 0) < d7) gmv.silent7++;
    }
    for (const s of demo) demoGmv30 += (salesOf.get(s.merchant) || {}).m || 0;
    gmv.basket30 = gmv.count30 ? Math.round(gmv.d30 / gmv.count30) : 0;

    /* La courbe des 30 jours. Groupée en SQL par (magasin, jour) — au plus
     * trente lignes par établissement — puis partagée réel/démo ici, parce que
     * SQL ne connaît pas la règle « un magasin sans propriétaire est une démo ». */
    const perDay = await tryAll(env,
      `SELECT merchant, date(ts/1000,'unixepoch') AS d, COALESCE(SUM(amount),0) AS amount
         FROM sales WHERE ts >= ? AND void_ts IS NULL GROUP BY merchant, d`,
      `SELECT merchant, date(ts/1000,'unixepoch') AS d, COALESCE(SUM(amount),0) AS amount
         FROM sales WHERE ts >= ? GROUP BY merchant, d`,
      [d30]);
    const realSet = new Set(real.map((s) => s.merchant));
    const byDay = new Map();
    for (const r of perDay.rows) {
      if (!realSet.has(r.merchant)) continue;
      byDay.set(r.d, (byDay.get(r.d) || 0) + (r.amount || 0));
    }
    // Trente entrées, y compris les jours sans vente : une courbe qui saute les
    // jours creux dessine une activité qui n'a pas eu lieu.
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY).toISOString().slice(0, 10);
      series.push({ d, amount: byDay.get(d) || 0 });
    }

    /* ── 4. Ce que NOUS faisons ─────────────────────────────────────────────
     * Le montant convenu (mrr) l'emporte sur le tarif du palier : c'est lui qui
     * porte les Ultimate sur devis et les remises accordées. Ni l'un ni
     * l'autre ⇒ non tarifé, compté nulle part, réclamé à l'écran. Un
     * établissement suspendu ne facture plus : il sort du MRR et se compte à
     * part, sinon un client parti resterait du chiffre d'affaires. */
    const tiers = new Map();
    const mrr = { total: 0, custom: 0, customStores: 0, untariffed: 0, suspended: 0, suspendedAmount: 0 };
    for (const s of real) {
      const suspended = s.status === 'suspended' ||
        (s.owner && s.owner.status === 'suspended');
      const plan = TIER_PRICE[s.plan] ? s.plan : (s.plan === 'ultimate' ? 'ultimate' : (s.plan || ''));
      const agreed = Number.isFinite(s.mrr) && s.mrr > 0 ? s.mrr : null;
      const listed = TIER_PRICE[plan] || null;
      const amount = agreed != null ? agreed : listed;

      const key = plan || '—';
      let t = tiers.get(key);
      if (!t) { t = { plan: key, stores: 0, amount: 0, unit: listed, untariffed: 0, suspended: 0 }; tiers.set(key, t); }
      t.stores++;

      if (suspended) { mrr.suspended++; if (amount) mrr.suspendedAmount += amount; t.suspended++; continue; }
      if (amount == null) { mrr.untariffed++; t.untariffed++; continue; }
      mrr.total += amount;
      t.amount += amount;
      if (agreed != null) { mrr.custom += agreed; mrr.customStores++; }
    }
    const tierList = [...tiers.values()].sort(
      (a, b) => (TIER_ORDER.indexOf(a.plan) + 1 || 99) - (TIER_ORDER.indexOf(b.plan) + 1 || 99));

    /* ── 5. Où nous sommes ──────────────────────────────────────────────────
     * Une ville par établissement, saisie par l'opérateur. Ce qui n'est pas
     * saisi est compté comme non situé et rendu tel quel : un classement bâti
     * sur la moitié du parc, présenté comme complet, décide de vrais budgets. */
    const cityMap = new Map();
    let untagged = 0;
    for (const s of real) {
      const raw = (s.city || '').trim();
      if (!raw) { untagged++; continue; }
      const key = raw.toLocaleLowerCase('fr');
      let c = cityMap.get(key);
      if (!c) { c = { city: raw, stores: 0, clients: new Set(), gmv30: 0 }; cityMap.set(key, c); }
      c.stores++;
      c.clients.add(s.accountId);
      c.gmv30 += (salesOf.get(s.merchant) || {}).m || 0;
    }
    const cities = [...cityMap.values()]
      .map((c) => ({ city: c.city, stores: c.stores, clients: c.clients.size, gmv30: c.gmv30 }))
      .sort((a, b) => b.stores - a.stores || b.gmv30 - a.gmv30 || a.city.localeCompare(b.city, 'fr'));

    /* Les cinq plus gros sur trente jours. Cinq, pas quinze : c'est un repère,
     * la recherche du roster est faite pour trouver quelqu'un en particulier. */
    const top = real
      .map((s) => ({
        merchant: s.merchant,
        name: (s.owner && s.owner.business) || s.merchant,
        city: s.city || '',
        plan: s.plan || '',
        gmv30: (salesOf.get(s.merchant) || {}).m || 0,
      }))
      .sort((a, b) => b.gmv30 - a.gmv30)
      .slice(0, 5);

    return json({
      now, dayStart,
      columns,                 // city / mrr appliquées en base, ou pas encore
      voidAware,               // les ventes de test sont-elles exclues du calcul
      clients: {
        accounts: owners.size,
        active: activeAccounts,
        suspended: suspendedAccounts,
        stores: real.length,
        suspendedStores: mrr.suspended,
        new30: newAccounts30,
        demo: demo.length,
        demoGmv30,
      },
      gmv, series,
      mrr: { ...mrr, tiers: tierList, prices: TIER_PRICE },
      cities, untagged,
      top,
    });
  } catch (e) {
    return json({ error: 'query-failed', detail: String(e) }, 500);
  }
}
