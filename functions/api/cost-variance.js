/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT THÉORIQUE ET COÛT RÉEL — GET /api/cost-variance
 * ---------------------------------------------------------------------------
 * Remplace le moteur de démonstration (assets/venues/data.js : réel = théorique
 * × 1,04, ou consommation hebdomadaire × 4,33) par les vrais livres :
 *
 *   · ventes nettes      sales (remises déduites, remboursements retirés)
 *   · coût théorique     le coût GELÉ À LA VENTE sur chaque ligne (`k`,
 *                        fiche technique complète ou coût saisi, coût
 *                        d'achat pour la revente) × la quantité vendue
 *   · pertes             registre de stock : pertes déclarées (motif par
 *                        ligne, vol compris) + écarts d'inventaire, SIGNÉS
 *   · achats, transferts réceptions − retours fournisseur, entrées − sorties
 *   · stock et commandes valeur du stock maintenant, commandes en attente
 *   · écart par matière  entre deux inventaires validés : début + entrées −
 *                        fin = utilisation réelle, contre l'utilisation
 *                        théorique que les ventes ont sortie par les recettes
 *
 * Qui : le propriétaire de CE magasin, ou un opérateur nommé (la même porte
 * que les fiches de coût, foodCostActor) : ce sont des marges et des prix
 * d'achat, jamais lisibles depuis une caisse ou un employé.
 *
 * Période : des journées de caisse (heure de coupure du magasin, 5 h par
 * défaut, fuseau du magasin, Maroc en UTC+0 depuis le 20 septembre 2026 via
 * _zone-law.js). Toutes les sommes sont faites par D1 ; le Worker n'additionne
 * que des lignes déjà regroupées (docs/ops/CPU.md).
 *
 *   GET ?merchant=slug&days=7                    → ce magasin, 7 journées
 *   GET ?merchant=slug&from=YYYY-MM-DD&to=…      → dates incluses
 *   GET …&scope=all                              → tous les magasins du compte
 * ═══════════════════════════════════════════════════════════════════════════ */
import { json } from '../auth/_lib.js';
import { foodCostActor } from './foodcost.js';
import { ownedStores } from './_private.js';
import { legacyBucketFor } from './_sales-scope.js';
import {
  businessDate, businessBoundary, addBusinessDays, merchantZone, merchantCutoff,
} from './_business-day.js';
import {
  keyRatios, sumRatios, ledgerTotals, pickWindow, itemVariance, sortLeaks, resolveDays,
} from './_cost-variance.js';

const noStore = { 'Cache-Control': 'no-store' };
const MAX_SITES = 12;
const MAX_WINDOWS = 6;
const COUNT_LOOKBACK_MS = 120 * 86400000;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Le montant d'une vente, comme partout (sales-summary.js › saleCents). */
const CENTS = 'COALESCE(amount_cents, CAST(ROUND(amount * 100) AS INTEGER))';
/* Le panier d'une vente ; un panier illisible compte comme « sans détail ». */
const LINES = "json_each(CASE WHEN s.lines IS NOT NULL AND json_valid(s.lines) THEN s.lines ELSE '[]' END)";
/* Les lignes qui ne sont pas de la marchandise ne comptent ni comme chiffrées
 * ni comme à chiffrer (pourboire, service, taxe). */
const GOODS = "COALESCE(json_extract(l.value, '$.kd'), '') NOT IN ('service', 'tip', 'tax', 'payment')";
/* Valeur d'un mouvement en centimes : qty_milli × taux (MAD) ÷ 10. */
const RATE = 'COALESCE(m.unit_cost_rate / 10000.0, m.unit_cost_cents / 100.0)';
const META = (col, key) => `CASE WHEN ${col} IS NOT NULL AND json_valid(${col}) THEN NULLIF(json_extract(${col}, '$.${key}'), '') END`;
const CLASS_SQL = `CASE WHEN m.reason IN ('sale', 'sale-reversal', 'production-input') THEN 't'
  WHEN m.reason IN ('loss', 'expiry', 'gift', 'staff-meal') OR m.ref_type = 'waste' THEN 'w'
  WHEN m.reason = 'count' THEN 'c' ELSE 's' END`;

async function all(env, sql, ...args) {
  const r = await env.DB.prepare(sql).bind(...args).all();
  return (r && r.results) || [];
}
async function one(env, sql, ...args) {
  return (await env.DB.prepare(sql).bind(...args).first()) || {};
}
/* Une requête optionnelle (table absente sur une base pas encore migrée) ne
 * fait pas tomber le rapport : elle rend sa valeur vide et le dit. */
async function soft(promise, fallback, missing, key) {
  try { return await promise; } catch (_) { missing.push(key); return fallback; }
}

async function salesBlock(env, merchant, legacy, from, to) {
  const scope = [merchant, legacy || merchant, from, to];
  const [tot, lines, uncosted] = await Promise.all([
    one(env, `SELECT
        SUM(CASE WHEN c >= 0 THEN c ELSE 0 END) AS pos,
        SUM(CASE WHEN c < 0 THEN -c ELSE 0 END) AS refunds,
        SUM(CASE WHEN c >= 0 THEN COALESCE(d, 0) ELSE 0 END) AS disc,
        SUM(CASE WHEN c > 0 AND (lines IS NULL OR NOT json_valid(lines) OR lines = '[]') THEN c ELSE 0 END) AS bare,
        SUM(CASE WHEN c > 0 THEN 1 ELSE 0 END) AS n
      FROM (SELECT ${CENTS} AS c, discount_amount_cents AS d, lines FROM sales
            WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL)`, ...scope),
    one(env, `SELECT
        SUM(CASE WHEN json_type(l.value, '$.k') IN ('integer', 'real')
                 THEN json_extract(l.value, '$.q') * json_extract(l.value, '$.k') ELSE 0 END) AS cogs,
        SUM(CASE WHEN json_type(l.value, '$.k') IN ('integer', 'real') THEN json_extract(l.value, '$.t') ELSE 0 END) AS costed,
        SUM(json_extract(l.value, '$.t')) AS total
      FROM sales s, ${LINES} l
      WHERE s.merchant IN (?, ?) AND s.ts >= ? AND s.ts < ? AND s.void_ts IS NULL
        AND ${CENTS.replace(/amount/g, 's.amount')} > 0 AND ${GOODS}`, ...scope),
    all(env, `SELECT json_extract(l.value, '$.n') AS name, SUM(json_extract(l.value, '$.q')) AS qty,
             SUM(json_extract(l.value, '$.t')) AS total
      FROM sales s, ${LINES} l
      WHERE s.merchant IN (?, ?) AND s.ts >= ? AND s.ts < ? AND s.void_ts IS NULL
        AND ${CENTS.replace(/amount/g, 's.amount')} > 0 AND ${GOODS}
        AND json_type(l.value, '$.k') IS NULL
      GROUP BY name ORDER BY total DESC LIMIT 12`, ...scope),
  ]);
  const lineTotal = Math.round(n0(lines.total) * 100);
  const costed = Math.round(n0(lines.costed) * 100);
  return {
    salesCents: n0(tot.pos), refundCents: n0(tot.refunds), discountCents: n0(tot.disc), saleCount: n0(tot.n),
    cogsCents: Math.round(n0(lines.cogs) * 100),
    coverage: {
      lineRevenueCents: lineTotal,
      costedRevenueCents: costed,
      costedPct: lineTotal > 0 ? Math.round(costed / lineTotal * 1000) / 10 : null,
      undetailedCents: n0(tot.bare),
      uncosted: uncosted.map((r) => ({ name: str(r.name, 60) || 'Article', qty: Math.round(n0(r.qty) * 1000) / 1000, cents: Math.round(n0(r.total) * 100) })),
    },
  };
}

async function ledgerBlock(env, merchant, from, to) {
  const rows = await all(env, `SELECT m.reason AS reason, m.ref_type AS refType,
        COALESCE(${META('m.meta', 'wasteReason')}, ${META('m.meta', 'lossReason')}, ${META('o.meta', 'wasteReason')}, o.reason, '') AS lossReason,
        SUM(m.qty_milli * ${RATE}) / 10.0 AS valueCents,
        SUM(CASE WHEN m.qty_milli < 0 THEN m.qty_milli * ${RATE} END) / 10.0 AS negCents,
        SUM(CASE WHEN m.qty_milli > 0 THEN m.qty_milli * ${RATE} END) / 10.0 AS posCents,
        SUM(CASE WHEN ${RATE} IS NULL THEN 1 ELSE 0 END) AS noCost,
        COUNT(*) AS rows
      FROM inventory_movements m
      LEFT JOIN inventory_movements o ON m.reversal_of != '' AND o.id = m.reversal_of AND o.merchant = m.merchant
      WHERE m.merchant = ? AND m.occurred_ts >= ? AND m.occurred_ts < ?
      GROUP BY m.reason, m.ref_type, lossReason`, merchant, from, to);
  return ledgerTotals(rows.map((r) => ({ ...r, valueCents: Math.round(n0(r.valueCents)), negCents: Math.round(n0(r.negCents)), posCents: Math.round(n0(r.posCents)) })));
}

/* Stock maintenant, et le coût moyen d'entrée de chaque article (les entrées
 * chiffrées d'abord ; à défaut, tout mouvement chiffré). */
async function stockBlock(env, merchant) {
  const rows = await all(env, `SELECT m.item_id AS itemId, SUM(m.qty_milli) / 1000.0 AS onHand,
        SUM(CASE WHEN m.qty_milli > 0 AND m.reason IN ('opening', 'receipt', 'transfer-in', 'production-output') AND ${RATE} IS NOT NULL THEN m.qty_milli * ${RATE} END)
          / SUM(CASE WHEN m.qty_milli > 0 AND m.reason IN ('opening', 'receipt', 'transfer-in', 'production-output') AND ${RATE} IS NOT NULL THEN m.qty_milli END) AS inCost,
        SUM(CASE WHEN ${RATE} IS NOT NULL THEN ABS(m.qty_milli) * ${RATE} END)
          / SUM(CASE WHEN ${RATE} IS NOT NULL THEN ABS(m.qty_milli) END) AS anyCost
      FROM inventory_movements m WHERE m.merchant = ? GROUP BY m.item_id`, merchant);
  const cost = new Map();
  let value = 0, noCost = 0, items = 0;
  for (const r of rows) {
    const c = r.inCost != null ? n0(r.inCost) : (r.anyCost != null ? n0(r.anyCost) : null);
    if (c != null && c > 0) cost.set(String(r.itemId), c);
    const q = n0(r.onHand);
    if (q > 0) {
      items++;
      if (c != null && c > 0) value += q * c * 100;
      else noCost++;
    }
  }
  return { cost, stockValueCents: Math.round(value), stockItems: items, stockNoCost: noCost };
}

async function poBlock(env, merchant) {
  const r = await one(env, `SELECT SUM((l.qty - l.received_qty) * l.unit_cents) AS cents, COUNT(DISTINCT o.number) AS n
      FROM purchase_orders o JOIN purchase_order_lines l ON l.merchant = o.merchant AND l.number = o.number
      WHERE o.merchant = ? AND o.status IN ('submitted', 'partial') AND l.qty > l.received_qty`, merchant);
  return { pendingPoCents: Math.round(n0(r.cents)), pendingPoCount: n0(r.n) };
}

/* Les noms : fiche Stock, puis matières des recettes. Lus par D1 (json_each),
 * le Worker ne parse jamais le document entier. */
async function namesBlock(env, merchant) {
  const names = new Map();
  const put = (id, name, unit) => { id = str(id, 80); if (id && name && !names.has(id)) names.set(id, { name: str(name, 80), unit: str(unit, 20) }); };
  try {
    (await all(env, `SELECT json_extract(i.value, '$.id') AS id, json_extract(i.value, '$.name') AS name, json_extract(i.value, '$.unit') AS unit
        FROM store_docs d, json_each(CASE WHEN json_valid(d.data) THEN json_extract(d.data, '$.items') END) i
        WHERE d.merchant = ? AND d.feature = 'stock' AND json_type(i.value) = 'object' LIMIT 2000`, merchant)).forEach((r) => put(r.id, r.name, r.unit));
  } catch (_) {}
  try {
    (await all(env, `SELECT COALESCE(json_extract(i.value, '$.stockId'), json_extract(i.value, '$.id')) AS id, json_extract(i.value, '$.name') AS name, json_extract(i.value, '$.unit') AS unit
        FROM store_docs d, json_each(CASE WHEN json_valid(d.data) THEN json_extract(d.data, '$.ingredients') END) i
        WHERE d.merchant = ? AND d.feature = 'costs' AND json_type(i.value) = 'object' LIMIT 2000`, merchant)).forEach((r) => put(String(r.id || '').replace(/^stock:/, ''), r.name, r.unit));
  } catch (_) {}
  return names;
}

/* Les inventaires validés qui encadrent la période, matière par matière. */
async function countPoints(env, merchant, from, to) {
  const rows = await all(env, `SELECT c.id AS countId, c.submitted_at AS ts,
        json_extract(l.value, '$.itemId') AS itemId, json_extract(l.value, '$.countedQty') AS counted,
        json_extract(l.value, '$.unitCost') AS unitCost, json_extract(l.value, '$.productName') AS name,
        json_extract(l.value, '$.unit') AS unit
      FROM inventory_counts c, json_each(CASE WHEN json_valid(c.lines_json) THEN c.lines_json ELSE '[]' END) l
      WHERE c.merchant = ? AND c.engine = 'ledger' AND c.status = 'applied'
        AND c.submitted_at >= ? AND c.submitted_at < ?
      ORDER BY c.submitted_at LIMIT 20000`, merchant, from - COUNT_LOOKBACK_MS, to);
  const byItem = new Map();
  for (const r of rows) {
    const id = str(r.itemId, 80);
    if (!id) continue;
    const item = byItem.get(id) || { points: new Map(), name: '', unit: '', unitCost: null };
    /* Une matière comptée dans deux emplacements du même inventaire : une
     * seule mesure, la somme. */
    const key = String(r.countId);
    const p = item.points.get(key) || { ts: n0(r.ts), qty: 0 };
    p.qty += n0(r.counted);
    item.points.set(key, p);
    if (r.name) item.name = str(r.name, 80);
    if (r.unit) item.unit = str(r.unit, 20);
    if (n0(r.unitCost) > 0) item.unitCost = n0(r.unitCost);
    byItem.set(id, item);
  }
  return byItem;
}

async function windowSums(env, merchant, open, close) {
  const rows = await all(env, `SELECT m.item_id AS itemId, ${CLASS_SQL} AS cls, SUM(m.qty_milli) AS q
      FROM inventory_movements m
      WHERE m.merchant = ? AND m.occurred_ts > ? AND m.occurred_ts <= ?
      GROUP BY m.item_id, cls`, merchant, open, close);
  const out = new Map();
  for (const r of rows) {
    const id = String(r.itemId);
    const cur = out.get(id) || { t: 0, w: 0, c: 0, s: 0 };
    cur[r.cls] = (cur[r.cls] || 0) + n0(r.q) / 1000;
    out.set(id, cur);
  }
  return out;
}

async function varianceBlock(env, merchant, from, to, stock, names) {
  const [counted, theoRows] = await Promise.all([
    countPoints(env, merchant, from, to),
    all(env, `SELECT m.item_id AS itemId, -SUM(m.qty_milli) / 1000.0 AS q, -SUM(m.qty_milli * ${RATE}) / 10.0 AS cents
        FROM inventory_movements m
        WHERE m.merchant = ? AND m.occurred_ts >= ? AND m.occurred_ts < ? AND m.reason IN ('sale', 'sale-reversal', 'production-input')
        GROUP BY m.item_id`, merchant, from, to),
  ]);
  const theoInRange = new Map(theoRows.map((r) => [String(r.itemId), { q: n0(r.q), cents: Math.round(n0(r.cents)) }]));
  const ids = new Set([...counted.keys(), ...theoInRange.keys()]);
  const plans = new Map();
  const windows = new Map();
  for (const id of ids) {
    const c = counted.get(id);
    const w = pickWindow(c ? [...c.points.values()] : [], from, to);
    plans.set(id, w);
    if (w.status === 'ok') {
      const key = w.open.ts + ':' + w.close.ts;
      if (!windows.has(key)) windows.set(key, { open: w.open.ts, close: w.close.ts });
    }
  }
  /* Le plus souvent un seul couple d'inventaires couvre toutes les matières ;
   * au-delà de MAX_WINDOWS, les matières restantes le disent. */
  const keys = [...windows.keys()].slice(0, MAX_WINDOWS);
  const sums = new Map();
  await Promise.all(keys.map(async (k) => { const w = windows.get(k); sums.set(k, await windowSums(env, merchant, w.open, w.close)); }));
  const rows = [];
  for (const id of ids) {
    const c = counted.get(id);
    const w = plans.get(id);
    const label = (names.get(id) || {}).name || (c && c.name) || id;
    const unit = (names.get(id) || {}).unit || (c && c.unit) || '';
    const unitCost = stock.cost.get(id) ?? (c && c.unitCost) ?? null;
    const theo = theoInRange.get(id) || { q: 0, cents: 0 };
    const base = { itemId: id, name: label, unit, theoreticalInRange: Math.round(theo.q * 1000) / 1000, theoreticalInRangeCents: theo.cents };
    if (w.status !== 'ok') {
      if (theo.q > 0) rows.push({ ...base, status: w.status, lastCountTs: w.open ? w.open.ts : null });
      continue;
    }
    const k = w.open.ts + ':' + w.close.ts;
    if (!sums.has(k)) { rows.push({ ...base, status: 'window-skipped' }); continue; }
    const s = sums.get(k).get(id) || { t: 0, w: 0, c: 0, s: 0 };
    const v = itemVariance({ opening: w.open.qty, closing: w.close.qty, supply: s.s, theoretical: -s.t, waste: -s.w, unitCost });
    if (!v.actualUse && !v.theoretical && !v.waste && !v.gap) continue;
    rows.push({
      ...base, status: unitCost == null ? 'no-cost' : 'ok',
      openTs: w.open.ts, closeTs: w.close.ts, opening: Math.round(w.open.qty * 1000) / 1000,
      closing: Math.round(w.close.qty * 1000) / 1000, supply: Math.round(s.s * 1000) / 1000, ...v,
    });
  }
  const sorted = sortLeaks(rows);
  const measured = sorted.filter((r) => r.status === 'ok');
  return {
    rows: sorted.slice(0, 200),
    countsFound: counted.size > 0,
    windows: keys.map((k) => windows.get(k)),
    leakCents: measured.reduce((a, r) => a + Math.max(0, r.gapCents || 0), 0),
    surplusCents: measured.reduce((a, r) => a + Math.min(0, r.gapCents || 0), 0),
    netGapCents: measured.reduce((a, r) => a + (r.gapCents || 0), 0),
    measured: measured.length,
    missingCount: sorted.filter((r) => r.status === 'no-count' || r.status === 'one-count').length,
    noCost: sorted.filter((r) => r.status === 'no-cost').length,
  };
}

async function siteReport(env, site, legacy, from, to) {
  const missing = [];
  const [sales, ledger, stock, po, names] = await Promise.all([
    salesBlock(env, site.merchant, legacy, from, to),
    soft(ledgerBlock(env, site.merchant, from, to), ledgerTotals([]), missing, 'ledger'),
    soft(stockBlock(env, site.merchant), { cost: new Map(), stockValueCents: 0, stockItems: 0, stockNoCost: 0 }, missing, 'stock'),
    soft(poBlock(env, site.merchant), { pendingPoCents: 0, pendingPoCount: 0 }, missing, 'purchase-orders'),
    namesBlock(env, site.merchant),
  ]);
  const variance = await soft(varianceBlock(env, site.merchant, from, to, stock, names),
    { rows: [], countsFound: false, windows: [], leakCents: 0, surplusCents: 0, netGapCents: 0, measured: 0, missingCount: 0, noCost: 0 }, missing, 'variance');
  const ratios = keyRatios({ ...sales, ...ledger, stockValueCents: stock.stockValueCents, ...po });
  return {
    merchant: site.merchant, name: site.name || site.merchant,
    ratios,
    coverage: { ...sales.coverage, saleCount: sales.saleCount, ledgerNoCostRows: ledger.noCostRows, theoreticalLedgerCents: ledger.theoreticalLedgerCents, stockItems: stock.stockItems, stockNoCost: stock.stockNoCost },
    losses: ledger.byReason,
    variance,
    missing,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const merchant = str(url.searchParams.get('merchant'), 64);
  if (!env || !env.DB) return json({ error: 'storage' }, 503, noStore);
  const actor = await foodCostActor(request, env, merchant);
  if (!actor) return json({ error: 'forbidden' }, 403, noStore);
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  const today = businessDate(Date.now(), cutoff, zone);
  const span = resolveDays({ days: url.searchParams.get('days'), from: url.searchParams.get('from'), to: url.searchParams.get('to') }, today, addBusinessDays);
  if (span.error) return json({ error: span.error }, 400, noStore);
  const from = businessBoundary(span.fromDay, cutoff, zone);
  const to = Math.min(businessBoundary(addBusinessDays(span.toDay, 1), cutoff, zone), Date.now() + 1);

  const wantAll = url.searchParams.get('scope') === 'all';
  /* Les magasins du compte : la liste du sélecteur, et le périmètre de
   * « tous les établissements ». Le magasin demandé y reste même si le
   * registre ne le connaît pas encore : il a déjà passé la porte ci-dessus. */
  let owned = [];
  try { owned = ((await ownedStores(request, env, merchant)).stores || []).filter((s) => s && s.merchant); } catch (_) { owned = []; }
  if (!owned.some((s) => s.merchant === merchant)) owned.unshift({ merchant, name: '' });
  owned = owned.slice(0, MAX_SITES);
  let sites = wantAll ? owned : owned.filter((s) => s.merchant === merchant);
  try {
    const nameRows = await all(env, `SELECT merchant, name FROM merchant_config WHERE merchant IN (${sites.map(() => '?').join(',')})`, ...sites.map((s) => s.merchant));
    const byMerchant = new Map(nameRows.map((r) => [r.merchant, r.name]));
    sites = sites.map((s) => ({ ...s, name: s.name || byMerchant.get(s.merchant) || s.merchant }));
  } catch (_) {}

  try {
    const legacy = await legacyBucketFor(request, env, merchant);
    const reports = await Promise.all(sites.map((s) => siteReport(env, s, s.merchant === merchant ? legacy : '', from, to)));
    const total = wantAll ? {
      ratios: sumRatios(reports.map((r) => r.ratios)),
      leakCents: reports.reduce((a, r) => a + r.variance.leakCents, 0),
      netGapCents: reports.reduce((a, r) => a + r.variance.netGapCents, 0),
    } : null;
    return json({
      merchant, scope: wantAll ? 'all' : 'site', storeCount: owned.length,
      range: { fromDay: span.fromDay, toDay: span.toDay, days: span.days, from, to, cutoff, zone },
      sites: reports, total, generatedAt: Date.now(),
    }, 200, noStore);
  } catch (_) {
    return json({ error: 'storage' }, 503, noStore);
  }
}
