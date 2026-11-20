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
// Aucune écriture. Lecture réservée au propriétaire et aux opérateurs : les
// marges ne sont pas affaire de caisse.
import { entitledMerchant } from '../../auth/_lib.js';
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
function score(s, maxRevenue) {
  const rev = maxRevenue > 0 ? s.revenue / maxRevenue : 0;
  const margin = s.marginRate == null ? 0.5 : Math.max(0, Math.min(s.marginRate, 0.6)) / 0.6;
  const st = s.sellThrough == null ? 0 : s.sellThrough;
  const ret = s.returnRate == null ? 1 : 1 - Math.min(s.returnRate * 4, 1);
  return Math.round(100 * (0.4 * rev + 0.3 * margin + 0.2 * st + 0.1 * ret));
}

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
  const fromReceipt = new Map();
  arr(receipts).slice().sort((a, b) => tsOf(a) - tsOf(b)).forEach((r) => {
    if (!r || !r.supplierId) return;
    arr(r.lines).forEach((l) => { if (l && l.itemId) fromReceipt.set(String(l.itemId), String(r.supplierId)); });
  });
  const supplierOf = new Map();
  prodById.forEach((p, id) => {
    const sid = String(p.supplierId || '').trim() || fromReceipt.get(id) || '';
    if (!sid) return;
    supplierOf.set(id, sid);
    ensure(sid, '').productIds.push(id);
  });

  const perProduct = new Map();
  const stat = (id) => { if (!perProduct.has(id)) perProduct.set(id, { units: 0, revenue: 0, returned: 0 }); return perProduct.get(id); };
  arr(sales).forEach((s) => {
    if (!s || num(s.ts) < from || num(s.ts) > now) return;
    arr(s.lines).forEach((l) => {
      const id = l && l.i != null ? String(l.i) : '';
      if (!id || !prodById.has(id)) return;
      const st = stat(id);
      st.units += Math.max(0, num(l.q));
      st.revenue += num(l.t);
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
    if (supplierOf.has(id)) return;
    const st = perProduct.get(id);
    untagged.products += 1;
    if (st) { untagged.revenue += st.revenue; untagged.units += st.units; }
  });
  untagged.revenue = money(untagged.revenue);

  const list = [...bySupplier.values()].map((s) => {
    let units = 0, revenue = 0, cost = 0, costKnown = true, returned = 0, inStock = 0, stockValue = 0, dead = 0;
    const rows = s.productIds.map((id) => {
      const p = prodById.get(id), st = perProduct.get(id) || { units: 0, revenue: 0, returned: 0 };
      const unitCost = num(p.cost), left = stock.get(id) || 0;
      units += st.units; revenue += st.revenue; returned += st.returned; inStock += left;
      if (unitCost > 0) { cost += unitCost * st.units; stockValue += unitCost * left; } else if (st.units > 0) costKnown = false;
      if (left > 0 && st.units === 0) dead += 1;
      return { id, name: String(p.name || ''), units: st.units, revenue: money(st.revenue), stock: left, returned: st.returned,
        margin: unitCost > 0 ? money(st.revenue - unitCost * st.units) : null };
    }).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));
    const margin = costKnown && revenue > 0 ? money(revenue - cost) : null;
    return {
      id: s.id, name: s.name, productCount: rows.length, products: rows,
      revenue: money(revenue), units, margin,
      marginRate: margin == null ? null : margin / revenue,
      sellThrough: units + inStock > 0 ? units / (units + inStock) : null,
      stock: inStock, stockValue: money(stockValue),
      returnedUnits: returned, returnRate: units > 0 ? returned / units : null,
      deadProducts: dead, top: rows.length && rows[0].units > 0 ? { id: rows[0].id, name: rows[0].name } : null,
      // Filled once every supplier is known (score needs the best revenue, rank the sorted list).
      score: /** @type {number|null} */ (null), rank: 0,
    };
  });
  const maxRevenue = Math.max(0, ...list.map((s) => s.revenue));
  list.forEach((s) => { s.score = s.productCount ? score(s, maxRevenue) : null; });
  list.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || b.revenue - a.revenue || a.name.localeCompare(b.name));
  list.forEach((s, i) => { s.rank = i + 1; });
  return { suppliers: list, untagged, period: { days, from, to: now } };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
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
      AND lines IS NOT NULL ORDER BY ts DESC LIMIT ${MAX_SALES}`).bind(merchant, now - days * DAY).all();
    sales = ((rs && rs.results) || []).map((r) => { let lines = []; try { lines = JSON.parse(r.lines); } catch (_) { lines = []; } return { ts: Number(r.ts), lines }; });
  } catch (_) { sales = []; }
  const out = rankSuppliers({
    products: catalog.products, variants: catalog.variants,
    suppliers: procurement.suppliers, receipts: procurement.receipts,
    sales, returns: returnsDoc.list, days, now,
  });
  return json({ merchant, ...out, salesRead: sales.length, truncated: sales.length >= MAX_SALES });
}
