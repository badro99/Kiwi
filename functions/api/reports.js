// GET /api/reports · les rapports d'une période, pour une boutique ou pour
// toutes les boutiques du compte.
//
//   ?merchant=<boutique ouverte>        la boutique du tableau de bord (obligatoire)
//   &report=summary|products|categories|staff|payments|heatmap|channels|vat|customers|sites
//   &site=<slug>|all                    une autre boutique DU MÊME COMPTE, ou toutes
//   &preset=aujourdhui|hier|septJours|trenteJours|moisDernier|trimestre|annee
//   &from=YYYY-MM-DD&to=YYYY-MM-DD      une plage choisie (journées commerciales)
//   &offset=&limit=                     pagination des longues listes (produits, clients)
//   &format=csv&lang=fr|en|ar           l'export CSV du même rapport
//
// Qui lit : la même porte que /api/sales-summary. entitledMerchant() rend la
// boutique (session du patron sur l'une de SES boutiques, opérateur nommé, slug
// de démo) et la route exige que ce soit exactement celle demandée : un slug qui
// n'est pas à l'appelant ne retombe pas sur la boutique du compte, il est
// refusé. Les autres boutiques viennent du registre (merchant_config.account_id
// du propriétaire), jamais d'une liste envoyée par le navigateur. Une caisse
// appairée et un employé n'ouvrent rien ici ; la session du patron
// déverrouillée par un gérant voit les ventes mais pas les coûts ni les marges
// (_session-tier.js : la route demande « manager », les coûts « owner »).
//
// Les montants sont des centimes entiers, les journées sont commerciales
// (coupure de la boutique, 05:00 par défaut) dans le fuseau de chaque boutique.

import { json, entitledMerchant, isOperator, activeAccountSession, storeOwner } from '../auth/_lib.js';
import { sessionTierAtLeast } from '../auth/_session-tier.js';
import { legacyBucketFor } from './_sales-scope.js';
import { validZone, businessBoundary, DEFAULT_ZONE, DEFAULT_CUTOFF } from './_business-day.js';
import { resolvePeriod, windowFor } from './_reports-period.js';
import { baseCte, Q, run } from './_reports-sql.js';
import { buildSummary, buildRanking, buildStaff, buildPayments, buildChannels, buildHeatmap, buildVat, buildCustomers, buildSites, vatFor } from './_reports-build.js';
import { reportCsv } from './_reports-csv.js';
import { memberName } from './_commissions.js';
import { weekdayName } from './_reports-words.js';

export const REPORTS = ['summary', 'products', 'categories', 'staff', 'payments', 'heatmap', 'channels', 'vat', 'customers', 'sites'];
export const MAX_SITES = 12;
export const CSV_ROWS = 20000;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LANGS = ['fr', 'en', 'ar'];

/* Les noms des moyens et des canaux. En arabe, des noms qui peuvent ouvrir une
   phrase (« حصة الأداء نقدا من المداخيل… ») : un adverbe comme « نقدا » ne
   peut pas en être le sujet. */
const METHOD = {
  cash: ['Espèces', 'Cash', 'الأداء نقدا'], card: ['Carte', 'Card', 'الأداء بالبطاقة'], tap: ['Sans contact', 'Contactless', 'الأداء بدون تلامس'],
  transfer: ['Virement', 'Bank transfer', 'التحويل البنكي'], cheque: ['Chèque', 'Cheque', 'الشيك'], split: ['Paiement mixte', 'Split payment', 'الأداء المختلط'],
  qr: ['QR', 'QR', 'الأداء عبر QR'], wallet: ['Portefeuille', 'Wallet', 'المحفظة الإلكترونية'], credit: ['Avoir / compte client', 'Store credit / account', 'رصيد الزبون وحسابه'],
  delivery: ['À la livraison', 'Cash on delivery', 'الأداء عند التسليم'], complimentary: ['Offert', 'On the house', 'ما قُدّم مجانا'], '': ['Non précisé', 'Not recorded', 'وسيلة غير محددة'],
};
const CHANNEL = {
  '': ['Non renseigné', 'Not recorded', 'قناة غير محددة'], surplace: ['Sur place', 'Dine-in', 'الأكل في المحل'], dining: ['Sur place', 'Dine-in', 'الأكل في المحل'],
  emporter: ['À emporter', 'Takeaway', 'الطلبات للأخذ'], takeaway: ['À emporter', 'Takeaway', 'الطلبات للأخذ'], terrace: ['Terrasse', 'Terrace', 'التراس'],
  delivery: ['Livraison', 'Delivery', 'التوصيل'], counter: ['Comptoir', 'Counter', 'الكونطوار'], walkin: ['En boutique', 'Walk-in', 'البيع في المحل'],
  glovo: ['Glovo', 'Glovo', 'Glovo'], yassir: ['Yassir', 'Yassir', 'Yassir'], shopify: ['Shopify', 'Shopify', 'Shopify'],
  storefront: ['Boutique en ligne', 'Online shop', 'المتجر الإلكتروني'], orderpro: ['OrderPro', 'OrderPro', 'OrderPro'],
  whatsapp: ['WhatsApp', 'WhatsApp', 'واتساب'], ozon: ['Ozon Express', 'Ozon Express', 'Ozon Express'], hotel: ['Hôtel', 'Hotel', 'الفندق'],
  kiwi: ['Kiwi', 'Kiwi', 'Kiwi'], direct: ['Direct', 'Direct', 'البيع المباشر'],
};
export function labels(lang) {
  const i = Math.max(0, LANGS.indexOf(lang));
  const title = (k) => String(k || '').replace(/^\w/, (c) => c.toUpperCase());
  return {
    method: (m) => (METHOD[m] ? METHOD[m][i] : title(m)),
    channel: (c) => (CHANNEL[c] ? CHANNEL[c][i] : title(c)),
    weekday: (w) => weekdayName(w, lang),
  };
}

function cleanJSON(raw) { try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }

/* Les boutiques que l'appelant peut voir ensemble : celles du même compte,
   lues dans le registre. Un opérateur voit celles du propriétaire de la boutique
   ouverte ; une démo ou une boutique hors registre reste seule. */
async function siblingStores(request, env, anchor) {
  let aid = '';
  try {
    const owner = await storeOwner(env, anchor);
    if (owner) {
      if (await isOperator(request, env)) aid = owner;
      else {
        const sess = await activeAccountSession(request, env);
        if (sess && sess.aid === owner) aid = owner;
      }
    }
  } catch (_) { aid = ''; }
  let rows = [];
  if (aid) {
    try {
      const rs = await env.DB.prepare(
        'SELECT merchant, name, timezone, business_cutoff, features FROM merchant_config WHERE account_id = ? ORDER BY name, merchant LIMIT 40'
      ).bind(aid).all();
      rows = ((rs && rs.results) || []).filter((r) => SLUG.test(String(r.merchant || '')));
    } catch (_) { rows = []; }
  }
  if (!rows.find((r) => r.merchant === anchor)) {
    let own = null;
    try { own = await env.DB.prepare('SELECT merchant, name, timezone, business_cutoff, features FROM merchant_config WHERE merchant = ?').bind(anchor).first(); } catch (_) { own = null; }
    rows.unshift(own || { merchant: anchor, name: anchor });
  }
  const anchorRow = rows.find((r) => r.merchant === anchor);
  rows = [anchorRow].concat(rows.filter((r) => r !== anchorRow)).slice(0, MAX_SITES);
  return rows.map((r) => {
    const cutoff = Number(r.business_cutoff);
    return {
      merchant: r.merchant, name: String(r.name || r.merchant).slice(0, 80),
      zone: validZone(r.timezone) || DEFAULT_ZONE,
      cutoff: Number.isInteger(cutoff) && cutoff >= 0 && cutoff <= 12 ? cutoff : DEFAULT_CUTOFF,
      atSale: cleanJSON(r.features).revenueAtSale === true,
    };
  });
}

/* La TVA de chaque boutique : le taux du ticket (document `receipt`) et les
   périodes datées par rayon (document `monthreport`, Mois comptable). */
async function vatConfigs(env, sites) {
  return Promise.all(sites.map(async (s) => {
    const cfg = { defaultRate: null, included: true, periods: [] };
    try {
      const rs = await env.DB.prepare("SELECT feature, data FROM store_docs WHERE merchant = ? AND feature IN ('receipt', 'monthreport')").bind(s.merchant).all();
      for (const row of (rs && rs.results) || []) {
        const doc = cleanJSON(row.data);
        if (row.feature === 'receipt') {
          const v = doc.vat;
          if (v && v.mode === 'rate' && Number(v.rate) > 0 && Number(v.rate) <= 100) { cfg.defaultRate = Number(v.rate); cfg.included = v.included !== false; }
        } else if (Array.isArray(doc.taxPeriods)) {
          cfg.periods = doc.taxPeriods.filter((p) => p && typeof p.category === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(p.effectiveFrom || ''))
            && Number.isFinite(Number(p.rate))).slice(0, 200);
        }
      }
    } catch (_) { /* pas de réglage : taux inconnu, jamais deviné */ }
    return cfg;
  }));
}

/* Les journées où un taux daté commence, par boutique, et le début (ms) de
   chacune dans l'horloge de la boutique : _reports-sql.js segExpr() range
   chaque vente dans son segment, donc dans sa journée commerciale. Soixante
   changements au plus par boutique, les plus récents. */
export function vatSegments(configs, sites, toDay) {
  return sites.map((s, i) => {
    const daysList = [...new Set(((configs[i] && configs[i].periods) || []).map((p) => String(p.effectiveFrom)))]
      .filter((d) => d <= toDay).sort().slice(-60);
    return { days: daysList, ms: daysList.map((d) => businessBoundary(d, s.cutoff, s.zone)) };
  });
}

/* Les noms des vendeurs sans nom sur la vente : la fiche Équipe, le nom seul. */
async function sellerNames(env, sites) {
  const names = new Map();
  for (const s of sites) {
    try {
      const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(s.merchant).first();
      const members = cleanJSON(row && row.data).members;
      for (const m of Array.isArray(members) ? members : []) {
        const id = String((m && m.id) || '');
        const name = memberName(m).slice(0, 80);
        if (id && name && !names.has(id)) names.set(id, name);
      }
    } catch (_) { /* pas d'équipe : l'identifiant reste */ }
  }
  return names;
}

export async function buildReport(env, request, url) {
  const q = (k, n) => String(url.searchParams.get(k) || '').slice(0, n || 64);
  const report = q('report', 24) || 'summary';
  if (!REPORTS.includes(report)) return { status: 400, body: { error: 'report' } };
  const asked = q('merchant');
  if (!asked || !SLUG.test(asked)) return { status: 400, body: { error: 'merchant' } };
  if (!env || !env.DB) return { status: 503, body: { error: 'db' } };

  const anchor = await entitledMerchant(request, env, asked);
  if (!anchor || anchor !== asked) return { status: 403, body: { error: 'forbidden' } };

  const stores = await siblingStores(request, env, anchor);
  const want = q('site') || anchor;
  let sites;
  if (want === 'all' || report === 'sites') sites = stores;
  else {
    const one = stores.find((s) => s.merchant === want);
    if (!one) return { status: 403, body: { error: 'site' } };
    sites = [one];
  }

  /* Coûts et marges : le patron (ou un opérateur, ou une démo sans session).
     Un gérant qui a déverrouillé l'appareil du patron voit tout le reste. */
  let showCost = false;
  try { showCost = (await isOperator(request, env)) || (await sessionTierAtLeast(request, env, 'owner')); } catch (_) { showCost = false; }

  const now = Date.now();
  const period = resolvePeriod({ preset: q('preset', 24), from: q('from', 10), to: q('to', 10) }, now, sites[0].zone, sites[0].cutoff);
  if (period.error) return { status: 400, body: period };

  const scoped = [];
  for (const s of sites) {
    const buckets = [s.merchant];
    if (sites.length === 1) {
      const legacy = await legacyBucketFor(request, env, s.merchant);
      if (legacy && SLUG.test(legacy) && legacy !== s.merchant) buckets.push(legacy);
    }
    scoped.push({ ...s, buckets,
      cur: windowFor(period.fromDay, period.toDay, period.cutMs, s.zone, s.cutoff),
      prev: windowFor(period.prev.fromDay, period.prev.toDay, period.cutMs, s.zone, s.cutoff) });
  }
  /* Le CSV exporte tout le rapport, pas la page affichée : D1 regroupe déjà,
     une ligne par produit ou par client, et 20 000 lignes restent légères. */
  const csv = url.searchParams.get('format') === 'csv';
  const limit = csv ? CSV_ROWS : Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get('limit')) || 50)));
  const offset = csv ? 0 : Math.max(0, Math.min(100000, Math.floor(Number(url.searchParams.get('offset')) || 0)));
  const ctx = { period, sites: scoped, showCost, page: { limit, offset } };
  const lang = LANGS.includes(q('lang', 2)) ? q('lang', 2) : 'fr';
  const L = labels(lang);
  /* Les noms des moyens et des canaux dans les trois langues : la phrase
     d'ouverture est rendue dans les trois, quelle que soit la langue du CSV. */
  const tri = (kind) => (code) => Object.fromEntries(LANGS.map((l) => [l, labels(l)[kind](code)]));

  const base = baseCte({ sites: scoped });
  let data;
  try {
    if (report === 'summary' || report === 'vat') {
      ctx.vatConfig = await vatConfigs(env, scoped);
      ctx.vatSegs = vatSegments(ctx.vatConfig, scoped, period.toDay);
    }
    if (report === 'summary') {
      const segs = ctx.vatSegs.map((x) => x.ms);
      const [hours, lineTotals, drivers, vl, vr] = await run(env, base,
        [Q.hours(), Q.lineTotals(), Q.drivers('name'), Q.vatLines(segs), Q.vatRest(segs)]);
      const vc = vatFor(ctx, [vl, vr], 'c').totals, vp = vatFor(ctx, [vl, vr], 'p').totals;
      ctx.vat = { cur: vc, prev: vp };
      data = buildSummary(ctx, [hours, lineTotals, drivers]);
    } else if (report === 'products' || report === 'categories') {
      const key = report === 'products' ? 'name' : 'cat';
      data = buildRanking(ctx, report, await run(env, base, [Q.ranking(key, ctx.page), Q.lineTotals(), Q.hours()]));
    } else if (report === 'staff') {
      data = buildStaff(ctx, await run(env, base, [Q.staff(), Q.staffRefunds()]), await sellerNames(env, scoped));
    } else if (report === 'payments') {
      data = buildPayments(ctx, await run(env, base, [Q.payments(), Q.refundMethods()]), tri('method'));
    } else if (report === 'channels') {
      data = buildChannels(ctx, await run(env, base, [Q.channels()]), tri('channel'));
    } else if (report === 'heatmap') {
      data = buildHeatmap(ctx, await run(env, base, [Q.hours()]));
    } else if (report === 'vat') {
      const segs = ctx.vatSegs.map((x) => x.ms);
      data = buildVat(ctx, await run(env, base, [Q.vatLines(segs), Q.vatRest(segs)]));
    } else if (report === 'customers') {
      data = buildCustomers(ctx, await run(env, base, [Q.customers(ctx.page), Q.topTen(), Q.hours()]));
    } else {
      data = buildSites(ctx, await run(env, base, [Q.hours(), Q.lineTotals()]));
    }
  } catch (_) {
    return { status: 500, body: { error: 'db' } };
  }

  const envelope = {
    report, merchant: anchor, scope: sites.length > 1 || want === 'all' ? 'all' : 'site', site: sites.length === 1 ? sites[0].merchant : 'all',
    sites: stores.map((s) => ({ merchant: s.merchant, name: s.name })),
    period: { preset: period.preset, fromDay: period.fromDay, toDay: period.toDay, days: period.days, live: period.live, today: period.today },
    previous: period.prev, showCost, generatedAt: now,
  };
  return { status: 200, body: Object.assign(envelope, data), lang, labels: L };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const out = await buildReport(env, request, url);
  if (out.status !== 200 || url.searchParams.get('format') !== 'csv') return json(out.body, out.status);
  const b = out.body;
  const file = `kiwi-${b.report}-${b.site}-${b.period.fromDay}_${b.period.toDay}.csv`;
  return new Response(reportCsv(b.report, b, out.lang, out.labels), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file.replace(/[^a-z0-9._-]/gi, '-')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
