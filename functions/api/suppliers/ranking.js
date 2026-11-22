// GET /api/suppliers/ranking?merchant=<slug>&days=30
//
// Fournisseurs en compétition (build 48, 20 nov. 2026). Chaque fournisseur a
// son dossier : les articles qu'il fournit, ce qu'ils ont vendu, la marge
// qu'ils laissent, la part du stock qui part, et ce qui revient. Le classement
// dit lequel mérite la prochaine commande.
//
// Pourquoi côté serveur : le grand livre d'un navigateur ne garde qu'une partie
// des ventes ; le tableau de bord d'un propriétaire qui vend au comptoir n'en a
// parfois aucune. D1 a toutes les lignes (`sales.lines`, `i` = id d'article).
//
// D'où vient le fournisseur d'un article : sa fiche (`supplierId`), sinon le
// dernier bon de réception qui l'a fait entrer (un BL scanné crée ce bon,
// procurement.receipts[].lines[].itemId). Un article sans l'un ni l'autre est
// compté à part (`untagged`) pour que la boutique le range.
//
// Aucune écriture. Lecture réservée au patron, au gérant et aux opérateurs :
// les marges (donc les prix d'achat) ne sont pas affaire de caisse. Le palier
// de la session (code prouvé, auth/_session-tier.js) le décide, pas l'écran.
import { entitledMerchant, isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { loadParts } from '../_catalog-parts.js';
import { readDoc } from '../_doc-cas.js';

const DAY = 86400000;
const MAX_SALES = 20000;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => Math.round(v * 100) / 100;
const key = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const arr = (v) => (Array.isArray(v) ? v : []);
const tsOf = (r) => num(r && (r.receivedAt || r.createdAt || r.ts));

/* Le score (0 à 100) se lit d'un coup d'œil et s'explique en une phrase :
 * 40 % le chiffre d'affaires (rapporté au meilleur), 30 % le taux de marge
 * (plafonné à 60 %), 20 % l'écoulement du stock, 10 % l'absence de retours
 * (25 % de pièces rendues = zéro). Sans prix d'achat, la marge compte pour
 * moitié : ni récompensée ni punie, et l'écran dit qu'elle manque. */
function scoreParts(s, maxRevenue) {
  const rev = maxRevenue > 0 ? s.revenue / maxRevenue : 0;
  const margin = s.marginRate == null ? 0.5 : Math.max(0, Math.min(s.marginRate, 0.6)) / 0.6;
  const st = s.sellThrough == null ? 0 : s.sellThrough;
  const ret = s.returnRate == null ? 1 : 1 - Math.min(s.returnRate * 4, 1);
  /* Les points de chaque critère, pour que l'écran montre d'où vient le score. */
  return { sales: 40 * rev, margin: 30 * margin, sell: 20 * st, returns: 10 * ret };
}
function score(s, maxRevenue) {
  const p = scoreParts(s, maxRevenue);
  return Math.round(p.sales + p.margin + p.sell + p.returns);
}

/* La courbe des ventes d'un fournisseur : la période coupée en SERIES tranches égales. */
const SERIES = 12;

export function rankSuppliers({ products, variants, suppliers, receipts, sales, returns, days, now }) {
  const from = now - days * DAY;
  const prodById = new Map(), prodByName = new Map();
  arr(products).forEach((p) => {
    if (!p || !p.id) return;
    prodById.set(String(p.id), p);
    const k = key(p.name); if (k && !prodByName.has(k)) prodByName.set(k, String(p.id));
  });
  const stock = new Map();
  arr(variants).forEach((v) => { if (v && v.productId) stock.set(String(v.productId), (stock.get(String(v.productId)) || 0) + Math.max(0, num(v.stock))); });

  const bySupplier = new Map();
  const ensure = (id, name) => {
    if (!bySupplier.has(id)) bySupplier.set(id, { id, name: name || '', productIds: [] });
    return bySupplier.get(id);
  };
  arr(suppliers).forEach((s) => { if (s && s.id && !s.archived) ensure(String(s.id), String(s.name || '')); });

  /* Le dernier bon de réception d'un article désigne son fournisseur. */
  const fromReceipt = new Map(), lastLine = new Map();
  arr(receipts).slice().sort((a, b) => tsOf(a) - tsOf(b)).forEach((r) => {
    if (!r || !r.supplierId) return;
    arr(r.lines).forEach((l) => {
      if (!l || !l.itemId) return;
      fromReceipt.set(String(l.itemId), String(r.supplierId));
      lastLine.set(String(l.itemId), l);
    });
  });

  /* Un article vendu puis supprimé du catalogue (une boutique de mode retire
   * ce qui est épuisé) garde ses ventes : si un bon de réception dit d'où il
   * venait, elles comptent pour ce fournisseur, au prix d'achat du bon. La
   * caisse écrit aussi le fournisseur sur chaque ligne (`sp`, depuis le
   * 21 nov. 2026) : la dernière ligne qui le nomme vaut un bon. Sans l'un ni
   * l'autre, on ne sait pas à qui les rendre : elles sont comptées à part
   * (`retired`), pour que l'écran ne fasse pas croire qu'elles n'existent pas.
   * Un article encore au catalogue suit son fournisseur d'aujourd'hui. */
  const retired = { products: 0, revenue: 0, units: 0 };
  const orphan = new Map(), fromLine = new Map();
  arr(sales).forEach((s) => {
    if (!s || num(s.ts) < from || num(s.ts) > now) return;
    arr(s.lines).forEach((l) => {
      const id = l && l.i != null ? String(l.i) : '';
      if (!id || prodById.has(id)) return;
      const sp = String((l && l.sp) || '').trim();
      const seen = fromLine.get(id);
      if (sp && (!seen || num(s.ts) >= seen.ts)) fromLine.set(id, { ts: num(s.ts), sp, name: String(l.n || '') });
      const o = orphan.get(id) || { units: 0, revenue: 0, ts: -1, name: '' };
      o.units += Math.max(0, num(l.q)); o.revenue += num(l.t);
      if (l.n && num(s.ts) >= o.ts) { o.ts = num(s.ts); o.name = String(l.n); }
      orphan.set(id, o);
    });
  });
  orphan.forEach((o, id) => {
    const bon = lastLine.get(id), ln = fromLine.get(id);
    if (bon || ln) {
      prodById.set(id, { id, name: String((bon && bon.name) || (ln && ln.name) || o.name || ''), cost: bon ? num(bon.unitCost) : 0, retired: true, supplierId: ln ? ln.sp : '' });
      return;
    }
    retired.products += 1; retired.units += o.units; retired.revenue += o.revenue;
  });
  retired.revenue = money(retired.revenue);
  const supplierOf = new Map();
  prodById.forEach((p, id) => {
    const sid = String(p.supplierId || '').trim() || fromReceipt.get(id) || '';
    if (!sid) return;
    supplierOf.set(id, sid);
    ensure(sid, '').productIds.push(id);
  });

  const perProduct = new Map();
  const stat = (id) => { if (!perProduct.has(id)) perProduct.set(id, { units: 0, revenue: 0, returned: 0, series: new Array(SERIES).fill(0) }); return perProduct.get(id); };
  const span = Math.max(1, now - from);
  const bucket = (ts) => Math.min(SERIES - 1, Math.max(0, Math.floor(((ts - from) / span) * SERIES)));
  arr(sales).forEach((s) => {
    if (!s || num(s.ts) < from || num(s.ts) > now) return;
    arr(s.lines).forEach((l) => {
      const id = l && l.i != null ? String(l.i) : '';
      if (!id || !prodById.has(id)) return;
      const st = stat(id);
      st.units += Math.max(0, num(l.q));
      st.revenue += num(l.t);
      st.series[bucket(num(s.ts))] += num(l.t);
    });
  });
  arr(returns).forEach((r) => {
    if (!r || num(r.ts) < from || num(r.ts) > now) return;
    arr(r.items).forEach((it) => {
      const id = prodByName.get(key(it && it.name));
      if (id) stat(id).returned += Math.max(0, num(it.qty) || 1);
    });
  });

  const untagged = { products: 0, revenue: 0, units: 0 };
  prodById.forEach((p, id) => {
    if (supplierOf.has(id) || p.retired) return;
    const st = perProduct.get(id);
    untagged.products += 1;
    if (st) { untagged.revenue += st.revenue; untagged.units += st.units; }
  });
  untagged.revenue = money(untagged.revenue);

  const list = [...bySupplier.values()].map((s) => {
    let units = 0, revenue = 0, cost = 0, costed = 0, costKnown = true, returned = 0, inStock = 0, stockValue = 0, dead = 0;
    const series = new Array(SERIES).fill(0);
    const rows = s.productIds.map((id) => {
      const p = prodById.get(id), st = perProduct.get(id) || { units: 0, revenue: 0, returned: 0, series: null };
      if (st.series) st.series.forEach((v, k) => { series[k] += v; });
      const unitCost = num(p.cost), left = stock.get(id) || 0;
      units += st.units; revenue += st.revenue; returned += st.returned; inStock += left;
      /* Un article retiré sans prix d'achat compte dans les ventes mais pas dans
         la marge : il ne doit pas rendre inconnue celle des autres. */
      if (unitCost > 0) { cost += unitCost * st.units; costed += st.revenue; stockValue += unitCost * left; } else if (st.units > 0 && !p.retired) costKnown = false;
      if (left > 0 && st.units === 0) dead += 1;
      return { id, name: String(p.name || ''), retired: !!p.retired, units: st.units, revenue: money(st.revenue), stock: left, returned: st.returned, cost: unitCost > 0 ? unitCost : null,
        margin: unitCost > 0 ? money(st.revenue - unitCost * st.units) : null };
    }).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));
    /* La marge ne se lit que sur au moins la moitié des ventes : un gros
       article retiré sans prix d'achat la rend inconnue (demi-note neutre),
       au lieu d'une marge flatteuse mesurée sur une petite part. */
    const margin = costKnown && costed > 0 && costed * 2 >= revenue ? money(costed - cost) : null;
    return {
      id: s.id, name: s.name, productCount: rows.length, products: rows,
      revenue: money(revenue), units, margin,
      marginRate: margin == null ? null : margin / costed,
      sellThrough: units + inStock > 0 ? units / (units + inStock) : null,
      stock: inStock, stockValue: money(stockValue),
      returnedUnits: returned, returnRate: units > 0 ? returned / units : null,
      series: series.map(money),
      deadProducts: dead, top: rows.length && rows[0].units > 0 ? { id: rows[0].id, name: rows[0].name } : null,
      // Filled once every supplier is known (score needs the best revenue, rank the sorted list).
      score: /** @type {number|null} */ (null), rank: 0,
      parts: /** @type {{sales:number,margin:number,sell:number,returns:number}|null} */ (null),
      prevRank: /** @type {number|null} */ (null), prevScore: /** @type {number|null} */ (null),
    };
  });
  const maxRevenue = Math.max(0, ...list.map((s) => s.revenue));
  list.forEach((s) => {
    if (!s.productCount) return;
    const p = scoreParts(s, maxRevenue);
    s.parts = { sales: Math.round(p.sales * 10) / 10, margin: Math.round(p.margin * 10) / 10, sell: Math.round(p.sell * 10) / 10, returns: Math.round(p.returns * 10) / 10 };
    s.score = score(s, maxRevenue);
  });
  list.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || b.revenue - a.revenue || a.name.localeCompare(b.name));
  list.forEach((s, i) => { s.rank = i + 1; });
  return { suppliers: list, untagged, retired, period: { days, from, to: now } };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  let operator = false;
  try { operator = await isOperator(request, env); } catch (_) { operator = false; }
  if (!operator) {
    let tier = false;
    try { tier = await sessionTierAtLeast(request, env, 'manager'); } catch (_) { tier = false; }
    if (!tier) return json({ error: 'manager-required' }, 403);
  }
  const days = Math.max(7, Math.min(365, parseInt(url.searchParams.get('days'), 10) || 30));
  const now = Date.now();
  let catalog = {};
  try {
    const row = await loadParts(env.DB, merchant, await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first());
    catalog = row && row.data ? JSON.parse(row.data) || {} : {};
  } catch (_) { return json({ error: 'catalog-unreadable' }, 503); }
  const procurement = (await readDoc(env, merchant, 'procurement', {})).data || {};
  const returnsDoc = (await readDoc(env, merchant, 'returns', {})).data || {};
  let sales = [];
  try {
    const rs = await env.DB.prepare(`SELECT ts, lines FROM sales WHERE merchant = ? AND ts >= ? AND void_ts IS NULL
      AND lines IS NOT NULL ORDER BY ts DESC LIMIT ${MAX_SALES}`).bind(merchant, now - 2 * days * DAY).all();
    sales = ((rs && rs.results) || []).map((r) => { let lines = []; try { lines = JSON.parse(r.lines); } catch (_) { lines = []; } return { ts: Number(r.ts), lines }; });
  } catch (_) { sales = []; }
  const input = {
    products: catalog.products, variants: catalog.variants,
    suppliers: procurement.suppliers, receipts: procurement.receipts,
    sales, returns: returnsDoc.list, days,
  };
  const out = rankSuppliers({ ...input, now });
  withPrevious(out, rankSuppliers({ ...input, now: now - days * DAY }));
  const current = sales.filter((s) => s.ts >= now - days * DAY).length;
  return json({ merchant, ...out, salesRead: current, truncated: sales.length >= MAX_SALES });
}

/* La place qu'avait chaque fournisseur sur la période d'avant, de même durée.
 * Approché : le stock d'avant n'est pas connu, l'écoulement d'avant se lit sur
 * le stock d'aujourd'hui. Un fournisseur qui ne vendait rien n'a pas de place. */
export function withPrevious(out, prev) {
  const before = new Map(prev.suppliers.filter((s) => s.revenue > 0).map((s) => [s.id, s]));
  let rank = 0;
  const ranks = new Map();
  prev.suppliers.forEach((s) => { if (before.has(s.id)) ranks.set(s.id, ++rank); });
  out.suppliers.forEach((s) => {
    const p = before.get(s.id);
    s.prevRank = p ? ranks.get(s.id) : null;
    s.prevScore = p ? p.score : null;
  });
  return out;
}
