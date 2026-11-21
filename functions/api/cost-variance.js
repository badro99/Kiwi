/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT THÉORIQUE ET COÛT RÉEL · GET /api/cost-variance
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
  returnsCost, targetCheck, cleanTargetPct, mergeStockAggregates, stockFromAggregates,
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

/* Chaque ligne de panier, une fois : son genre de ticket, son nom, sa
 * quantité, son coût gelé (k ; un coût nul ou absent est INCONNU, comme
 * assets/cost.js › frozen : la caisse épicerie envoie 0 pour un produit sans
 * coût) et son montant. Les retours en avoir écrivent leurs lignes avec
 * `qty`/`amountCents` : les deux formes sont lues.
 *   sale   vente payée        gift  ticket offert (complimentary)
 *   zero   reçu à 0 MAD au carnet : la marchandise part, son coût entre en A
 *   delivery reçu à 0 MAD d'une livraison : JAMAIS dans A. Le chiffre d'une
 *          livraison entre à l'encaissement (receivables.js › writeCollection
 *          recopie le panier sur la vente encaissée, comptée « sale ») ; ce
 *          reçu-là ne fait que dire que le colis est parti (deliveryBlock)
 *   refund remboursement ou retour : la marchandise revient
 * `id` est l'identifiant de l'article (i, itemId), seul lien sûr entre une
 * ligne rendue et le coût moyen de ses ventes ; `n` n'est qu'un libellé. */
const LINE_ROWS = (inRangeOnly) => `WITH raw AS (
    SELECT CASE WHEN ${CENTS.replace(/amount/g, 's.amount')} < 0 THEN 'refund'
                WHEN s.method = 'complimentary' THEN 'gift'
                WHEN ${CENTS.replace(/amount/g, 's.amount')} = 0 AND (s.method IN ('delivery', 'consignment') OR COALESCE(s.channel, '') = 'delivery') THEN 'delivery'
                WHEN ${CENTS.replace(/amount/g, 's.amount')} = 0 THEN 'zero' ELSE 'sale' END AS kind,
      s.ts >= ? AS inRange,
      COALESCE(json_extract(l.value, '$.n'), json_extract(l.value, '$.name'), 'Article') AS n,
      NULLIF(CAST(COALESCE(json_extract(l.value, '$.i'), json_extract(l.value, '$.itemId')) AS TEXT), '') AS id,
      COALESCE(json_extract(l.value, '$.q'), json_extract(l.value, '$.qty'), 0) AS q,
      COALESCE(json_extract(l.value, '$.k'), json_extract(l.value, '$.unitCost')) AS kr,
      COALESCE(json_extract(l.value, '$.t'), json_extract(l.value, '$.amountCents') / 100.0, json_extract(l.value, '$.total'), 0) AS t,
      COALESCE(json_extract(l.value, '$.kd'), json_extract(l.value, '$.kind'), '') AS kd
    FROM sales s, ${LINES} l
    WHERE s.merchant IN (?, ?) AND s.ts >= ? AND s.ts < ? AND s.void_ts IS NULL AND json_type(l.value) = 'object'
  ), ln AS (
    SELECT kind, inRange, n, id, q, t, CASE WHEN typeof(kr) IN ('integer', 'real') AND kr > 0 THEN kr END AS k
    FROM raw WHERE kd NOT IN ('service', 'tip', 'tax', 'payment')${inRangeOnly ? ' AND inRange' : ''}
  )`;
const AVG_LOOKBACK_MS = 90 * 86400000;

async function salesBlock(env, merchant, legacy, from, to) {
  const scope = [merchant, legacy || merchant, from, to];
  const lineScope = [from, merchant, legacy || merchant, from, to];
  const [tot, kinds, uncosted, returned] = await Promise.all([
    one(env, `SELECT
        SUM(CASE WHEN c >= 0 THEN c ELSE 0 END) AS pos,
        SUM(CASE WHEN c < 0 THEN -c ELSE 0 END) AS refunds,
        SUM(CASE WHEN c >= 0 THEN COALESCE(d, 0) ELSE 0 END) AS disc,
        SUM(CASE WHEN c > 0 AND (lines IS NULL OR NOT json_valid(lines) OR lines = '[]') THEN c ELSE 0 END) AS bare,
        SUM(CASE WHEN c < 0 AND (lines IS NULL OR NOT json_valid(lines) OR lines = '[]') THEN -c ELSE 0 END) AS bareRefunds,
        SUM(CASE WHEN c > 0 THEN 1 ELSE 0 END) AS n
      FROM (SELECT ${CENTS} AS c, discount_amount_cents AS d, lines FROM sales
            WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL)`, ...scope),
    all(env, `${LINE_ROWS(true)}
      SELECT kind, SUM(CASE WHEN k IS NOT NULL THEN q * k ELSE 0 END) AS cogs,
             SUM(CASE WHEN k IS NOT NULL THEN t ELSE 0 END) AS costed, SUM(t) AS total, COUNT(*) AS lines
      FROM ln GROUP BY kind`, ...lineScope),
    all(env, `${LINE_ROWS(true)}
      SELECT n AS name, SUM(q) AS qty, SUM(t) AS total FROM ln
      WHERE kind IN ('sale', 'zero', 'gift') AND k IS NULL GROUP BY n ORDER BY total DESC LIMIT 12`, ...lineScope),
    /* Les lignes rendues dans la période, et le coût moyen gelé du MÊME
       article (son identifiant) vendu dans les 90 jours qui précèdent la fin
       de la période. Une ligne rendue sans identifiant forme le groupe NULL :
       pas de moyenne, elle est signalée (returnsCost). */
    all(env, `${LINE_ROWS(false)}
      SELECT id,
        SUM(CASE WHEN kind = 'refund' AND inRange AND k IS NOT NULL THEN ABS(q) * k ELSE 0 END) AS costedMad,
        SUM(CASE WHEN kind = 'refund' AND inRange AND k IS NULL THEN ABS(q) ELSE 0 END) AS qty,
        SUM(CASE WHEN kind = 'refund' AND inRange AND k IS NULL THEN ABS(t) ELSE 0 END) AS total,
        SUM(CASE WHEN kind = 'refund' AND inRange AND k IS NULL THEN 1 ELSE 0 END) AS lines,
        CASE WHEN id IS NOT NULL THEN SUM(CASE WHEN kind IN ('sale', 'zero') AND k IS NOT NULL THEN q * k END)
          / SUM(CASE WHEN kind IN ('sale', 'zero') AND k IS NOT NULL THEN q END) END AS avgCost
      FROM ln GROUP BY id HAVING SUM(CASE WHEN kind = 'refund' AND inRange THEN 1 ELSE 0 END) > 0 LIMIT 500`,
      from, merchant, legacy || merchant, from - AVG_LOOKBACK_MS, to),
  ]);
  const k = Object.fromEntries(kinds.map((r) => [r.kind, r]));
  const cents = (kind, col) => Math.round(n0(k[kind] && k[kind][col]) * 100);
  const back = returnsCost(returned.map((r) => ({ id: r.id, costedCents: Math.round(n0(r.costedMad) * 100), qty: n0(r.qty), lines: n0(r.lines), cents: Math.round(n0(r.total) * 100), avgCost: r.avgCost })));
  const lineTotal = cents('sale', 'total');
  const costed = cents('sale', 'costed');
  return {
    salesCents: n0(tot.pos), refundCents: n0(tot.refunds), discountCents: n0(tot.disc), saleCount: n0(tot.n),
    cogsCents: cents('sale', 'cogs') + cents('zero', 'cogs'),
    returnsCostCents: back.returnsCostCents,
    giftCostCents: cents('gift', 'cogs'),
    /* Un remboursement de caisse sans panier (sale/refund.js) baisse les
       ventes, mais rien ne dit quelle marchandise est revenue : le coût n'en
       est pas déduit, et on le dit. */
    refundUndetailedCents: n0(tot.bareRefunds),
    coverage: {
      lineRevenueCents: lineTotal,
      costedRevenueCents: costed,
      costedPct: lineTotal > 0 ? Math.round(costed / lineTotal * 1000) / 10 : null,
      undetailedCents: n0(tot.bare),
      creditSalesCostCents: cents('zero', 'cogs'),
      giftLines: n0(k.gift && k.gift.lines),
      uncostedReturnCents: back.uncostedReturnCents,
      uncostedReturnLines: back.uncostedReturnLines,
      uncosted: uncosted.map((r) => ({ name: str(r.name, 60) || 'Article', qty: Math.round(n0(r.qty) * 1000) / 1000, cents: Math.round(n0(r.total) * 100) })),
    },
  };
}

/* Les livraisons (reçu à 0 MAD, functions/api/receivables.js). Le chiffre
 * et le coût d'une livraison entrent à l'encaissement : la vente encaissée
 * porte le panier (moins les retours connus à cet instant, keptLines).
 * Trois lectures, chacune bornée sur ce qu'elle cherche :
 *   · ouvertes : pas encaissées, pas remboursées, pas passées en perte. Leur
 *     coût est « chez le livreur », à part, ni vendu ni perdu. Le plafond ne
 *     compte QUE ces colis-là, et s'il est atteint, l'écran le dit ;
 *   · pertes : les passages en perte DATÉS DANS LA PÉRIODE (sale_audit.ts),
 *     quelle que soit la date d'envoi du colis ;
 *   · retours tardifs : un colis revenu APRÈS que son panier a été compté
 *     (encaissement antérieur, ou acompte déjà passé avec ses articles) : sa
 *     marchandise rentre, son coût sort de A à la date du retour.
 * Les retours partiels ({i, q} dans sale_audit 'delivery-return') sont
 * retirés ligne par ligne. */
const OPEN_LOOKBACK_MS = 365 * 86400000;
const DELIVERY_CAP = 500;
const NOT_GOODS = new Set(['service', 'tip', 'tax', 'payment']);
const IS_DELIVERY = `${CENTS.replace(/amount/g, 's.amount')} = 0
        AND (s.method IN ('delivery', 'consignment') OR COALESCE(s.channel, '') = 'delivery')`;
const BACKS = `(SELECT json_group_array(b.impact) FROM sale_audit b
          WHERE b.merchant = s.merchant AND b.sale_id = s.id AND b.action = 'delivery-return'%) AS backs`;
const parseLines = (raw) => { try { const l = JSON.parse(raw || '[]'); return Array.isArray(l) ? l : []; } catch (_) { return []; } };
function returnedQty(rawList) {
  const back = new Map();
  let list = [];
  try { list = Array.isArray(rawList) ? rawList : JSON.parse(rawList || '[]'); } catch (_) { list = []; }
  for (const raw of list) {
    let imp = {};
    try { imp = (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw) || {}; } catch (_) { imp = {}; }
    for (const l of Array.isArray(imp.lines) ? imp.lines : []) {
      const i = Number(l && l.i), q = Number(l && l.q);
      if (Number.isSafeInteger(i) && q > 0) back.set(i, (back.get(i) || 0) + q);
    }
  }
  return back;
}
/* Le coût d'un panier, ligne i par ligne i, avec la quantité que `qtyOf`
 * retient (gardée, ou rendue). */
function basketCost(lines, qtyOf) {
  let cents = 0, uncosted = 0, pieces = 0;
  lines.forEach((l, i) => {
    if (!l || typeof l !== 'object' || NOT_GOODS.has(String(l.kd || l.kind || ''))) return;
    const q = qtyOf(Number(l.q != null ? l.q : l.qty) || 0, i);
    if (!(q > 0)) return;
    pieces += q;
    const k = Number(l.k != null ? l.k : l.unitCost);
    if (k > 0) cents += q * k * 100; else uncosted++;
  });
  return { cents: Math.round(cents), uncosted, pieces };
}

async function deliveryBlock(env, merchant, legacy, from, to, now = Date.now()) {
  const scope = [merchant, legacy || merchant];
  const [open, lost, late] = await Promise.all([
    all(env, `SELECT s.id AS id, s.ts AS ts, s.lines AS lines, ${BACKS.replace('%', '')}
      FROM sales s
      WHERE s.merchant IN (?, ?) AND s.ts >= ? AND s.void_ts IS NULL AND ${IS_DELIVERY}
        AND NOT EXISTS (SELECT 1 FROM delivery_collections c WHERE c.merchant = s.merchant AND c.sale_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = s.merchant AND a.sale_id = s.id
                          AND a.action IN ('refund', 'delivery-writeoff'))
      ORDER BY s.ts DESC LIMIT ${DELIVERY_CAP + 1}`, ...scope, now - OPEN_LOOKBACK_MS),
    all(env, `SELECT a.ts AS lostTs, s.lines AS lines, ${BACKS.replace('%', ' AND b.ts <= a.ts')},
          EXISTS (SELECT 1 FROM delivery_collections c WHERE c.merchant = s.merchant AND c.sale_id = s.id AND c.ts <= a.ts) AS collected
      FROM sale_audit a JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
      WHERE a.merchant IN (?, ?) AND a.action = 'delivery-writeoff' AND a.ts >= ? AND a.ts < ?
        AND s.void_ts IS NULL AND ${IS_DELIVERY}
      ORDER BY a.ts DESC LIMIT ${DELIVERY_CAP + 1}`, ...scope, from, to),
    all(env, `SELECT a.impact AS impact, s.lines AS lines
      FROM sale_audit a JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
      WHERE a.merchant IN (?, ?) AND a.action = 'delivery-return' AND a.ts >= ? AND a.ts < ? AND s.void_ts IS NULL
        AND (${CENTS.replace(/amount/g, 's.amount')} > 0
          OR EXISTS (SELECT 1 FROM delivery_collections c WHERE c.merchant = a.merchant AND c.sale_id = a.sale_id AND c.ts <= a.ts))
      ORDER BY a.ts DESC LIMIT ${DELIVERY_CAP + 1}`, ...scope, from, to),
  ]);
  const out = { atCourierCents: 0, atCourierCount: 0, atCourierOldestTs: null, lostDeliveryCents: 0, lostDeliveryCount: 0,
    lateReturnCostCents: 0, lateReturnCount: 0, deliveryUncostedLines: 0,
    deliveryCapped: open.length > DELIVERY_CAP || lost.length > DELIVERY_CAP || late.length > DELIVERY_CAP };
  for (const r of open.slice(0, DELIVERY_CAP)) {
    const back = returnedQty(r.backs);
    const c = basketCost(parseLines(r.lines), (q, i) => q - (back.get(i) || 0));
    if (!(c.pieces > 0)) continue;                       // tout est revenu
    out.atCourierCents += c.cents; out.atCourierCount++; out.deliveryUncostedLines += c.uncosted;
    const ts = n0(r.ts);
    if (out.atCourierOldestTs == null || ts < out.atCourierOldestTs) out.atCourierOldestTs = ts;
  }
  for (const r of lost.slice(0, DELIVERY_CAP)) {
    if (Number(r.collected)) continue;                   // le panier est déjà parti avec l'encaissement
    const back = returnedQty(r.backs);
    const c = basketCost(parseLines(r.lines), (q, i) => q - (back.get(i) || 0));
    if (!(c.pieces > 0)) continue;
    out.lostDeliveryCents += c.cents; out.lostDeliveryCount++; out.deliveryUncostedLines += c.uncosted;
  }
  for (const r of late.slice(0, DELIVERY_CAP)) {
    const back = returnedQty([r.impact]);
    const c = basketCost(parseLines(r.lines), (q, i) => Math.min(q, back.get(i) || 0));
    if (!(c.pieces > 0)) continue;
    out.lateReturnCostCents += c.cents; out.lateReturnCount++; out.deliveryUncostedLines += c.uncosted;
  }
  return out;
}

async function ledgerBlock(env, merchant, from, to) {
  const rows = await all(env, `SELECT m.reason AS reason, m.ref_type AS refType,
        COALESCE(${META('m.meta', 'wasteReason')}, ${META('m.meta', 'lossReason')}, ${META('o.meta', 'wasteReason')}, o.reason, '') AS lossReason,
        CASE WHEN ${CLASS_SQL} = 'w' THEN COALESCE(NULLIF(o.actor, ''), m.actor, '') ELSE '' END AS declarer,
        SUM(m.qty_milli * ${RATE}) / 10.0 AS valueCents,
        SUM(CASE WHEN m.qty_milli < 0 THEN m.qty_milli * ${RATE} END) / 10.0 AS negCents,
        SUM(CASE WHEN m.qty_milli > 0 THEN m.qty_milli * ${RATE} END) / 10.0 AS posCents,
        SUM(CASE WHEN ${RATE} IS NULL THEN 1 ELSE 0 END) AS noCost,
        COUNT(*) AS rows
      FROM inventory_movements m
      LEFT JOIN inventory_movements o ON m.reversal_of != '' AND o.id = m.reversal_of AND o.merchant = m.merchant
      WHERE m.merchant = ? AND m.occurred_ts >= ? AND m.occurred_ts < ?
      GROUP BY m.reason, m.ref_type, lossReason, declarer`, merchant, from, to);
  return ledgerTotals(rows.map((r) => ({ ...r, actor: r.declarer, valueCents: Math.round(n0(r.valueCents)), negCents: Math.round(n0(r.negCents)), posCents: Math.round(n0(r.posCents)) })));
}

/* Stock maintenant, et le coût moyen d'entrée de chaque article (les entrées
 * chiffrées d'abord ; à défaut, tout mouvement chiffré). Lu depuis un
 * instantané (cost_stock_snapshots) + les mouvements arrivés depuis son
 * curseur srv_ts, par l'index (merchant, srv_ts) : un rafraîchissement ne
 * relit plus tout l'historique. L'instantané avance quand la suite grossit ou
 * vieillit, et seulement jusqu'à « maintenant − 5 min » : un mouvement dont le
 * curseur a été tiré mais pas encore écrit (movements.js › nextCursor) ne peut
 * pas tomber derrière lui. */
const SNAPSHOT_SETTLE_MS = 5 * 60000;
const SNAPSHOT_REFRESH_ROWS = 200;
const SNAPSHOT_MAX_AGE_MS = 6 * 3600000;
const IN_REASONS = "('opening', 'receipt', 'transfer-in', 'production-output')";
async function stockBlock(env, merchant, now = Date.now()) {
  let snap = null;
  try { snap = await one(env, 'SELECT cursor, items_json, updated_ts FROM cost_stock_snapshots WHERE merchant = ?', merchant); } catch (_) { snap = null; }
  let base = {};
  const cursor = snap && snap.cursor != null ? Number(snap.cursor) : -1;
  if (cursor >= 0) { try { base = JSON.parse(snap.items_json || '{}') || {}; } catch (_) { base = {}; } }
  const settleAt = now - SNAPSHOT_SETTLE_MS;
  const rows = await all(env, `SELECT m.item_id AS itemId, m.srv_ts <= ? AS settled, COUNT(*) AS n,
        SUM(m.qty_milli) AS q,
        SUM(CASE WHEN m.qty_milli > 0 AND m.reason IN ${IN_REASONS} AND ${RATE} IS NOT NULL THEN m.qty_milli * ${RATE} ELSE 0 END) AS inV,
        SUM(CASE WHEN m.qty_milli > 0 AND m.reason IN ${IN_REASONS} AND ${RATE} IS NOT NULL THEN m.qty_milli ELSE 0 END) AS inQ,
        SUM(CASE WHEN ${RATE} IS NOT NULL THEN ABS(m.qty_milli) * ${RATE} ELSE 0 END) AS anyV,
        SUM(CASE WHEN ${RATE} IS NOT NULL THEN ABS(m.qty_milli) ELSE 0 END) AS anyQ
      FROM inventory_movements m WHERE m.merchant = ? AND m.srv_ts > ?
      GROUP BY m.item_id, settled`, settleAt, merchant, cursor);
  const settled = rows.filter((r) => Number(r.settled) === 1);
  const settledRows = settled.reduce((a, r) => a + n0(r.n), 0);
  const nextBase = mergeStockAggregates(base, settled);
  const agg = mergeStockAggregates(nextBase, rows.filter((r) => Number(r.settled) !== 1));
  const stale = cursor < 0 || settledRows >= SNAPSHOT_REFRESH_ROWS || now - n0(snap && snap.updated_ts) > SNAPSHOT_MAX_AGE_MS;
  let snapshot = cursor >= 0 ? 'read' : 'none';
  if (stale && settleAt > cursor) {
    try {
      await env.DB.prepare(`INSERT INTO cost_stock_snapshots (merchant, cursor, items_json, updated_ts) VALUES (?, ?, ?, ?)
          ON CONFLICT (merchant) DO UPDATE SET cursor = excluded.cursor, items_json = excluded.items_json, updated_ts = excluded.updated_ts
          WHERE excluded.cursor > cost_stock_snapshots.cursor`).bind(merchant, settleAt, JSON.stringify(nextBase), now).run();
      snapshot = 'written';
    } catch (_) { /* table absente : le calcul reste juste, seulement plus lent */ }
  }
  return { ...stockFromAggregates(agg), snapshot, deltaRows: rows.reduce((a, r) => a + n0(r.n), 0) };
}

/* Ce qui voyage entre deux magasins du compte.
 *   · registre : une sortie `transfer-out` sans l'entrée `transfer-in` de même
 *     référence chez le destinataire (90 jours), valorisée à son coût de sortie ;
 *   · boutiques : les transferts « en route » ou « partiel » du document
 *     stock-transfers (functions/api/stock-transfers.js), en pièces : ce
 *     document ne porte pas de coût, la valeur n'est pas inventée. */
const TRANSIT_LOOKBACK_MS = 90 * 86400000;
async function transitBlock(env, merchant, family, now = Date.now()) {
  const list = family.length ? family : [merchant];
  const [ledger, pieces] = await Promise.all([
    all(env, `SELECT m.ref_id AS ref,
          MIN(CASE WHEN m.reason = 'transfer-out' THEN m.merchant END) AS sender,
          SUM(CASE WHEN m.reason = 'transfer-out' THEN -m.qty_milli ELSE 0 END) AS outQ,
          SUM(CASE WHEN m.reason = 'transfer-out' THEN -m.qty_milli * ${RATE} ELSE 0 END) / 10.0 AS outCents,
          SUM(CASE WHEN m.reason = 'transfer-in' THEN m.qty_milli ELSE 0 END) AS inQ
        FROM inventory_movements m
        WHERE m.merchant IN (${list.map(() => '?').join(',')}) AND m.occurred_ts >= ?
          AND m.reason IN ('transfer-out', 'transfer-in') AND m.ref_id != ''
        GROUP BY m.ref_id`, ...list, now - TRANSIT_LOOKBACK_MS),
    one(env, `SELECT COUNT(DISTINCT t.key) AS n,
          SUM(MAX(0, COALESCE(json_extract(l.value, '$.qty'), 0) - COALESCE(json_extract(l.value, '$.received'), 0) - COALESCE(json_extract(l.value, '$.missing'), 0))) AS pieces
        FROM store_docs d, json_each(CASE WHEN json_valid(d.data) THEN json_extract(d.data, '$.list') END) t,
             json_each(json_extract(t.value, '$.lines')) l
        WHERE d.merchant = ? AND d.feature = 'stock-transfers'
          AND json_extract(t.value, '$.status') IN ('en-route', 'partiel')
          AND COALESCE(json_extract(t.value, '$.from'), d.merchant) = d.merchant`, merchant).catch(() => ({})),
  ]);
  let cents = 0, count = 0;
  for (const r of ledger) {
    if (r.sender !== merchant) continue;
    const out = n0(r.outQ), back = n0(r.inQ);
    if (!(out > back)) continue;
    count++;
    cents += n0(r.outCents) * (out - back) / out;
  }
  return { inTransitCents: Math.round(cents), inTransitPieces: Math.round(n0(pieces.pieces)), inTransitCount: count + n0(pieces.n) };
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
async function countPoints(env, merchant, from, to, itemId) {
  /* Les inventaires les PLUS RÉCENTS d'abord : 40 avant la fin de la période,
   * plus les 10 derniers avant son début (l'ouverture). Une longue histoire
   * de comptages ne fait plus tomber l'inventaire de clôture. */
  const pick = `SELECT id FROM inventory_counts WHERE merchant = ? AND engine = 'ledger' AND status = 'applied'`;
  const rows = await all(env, `SELECT c.id AS countId, c.submitted_at AS ts,
        json_extract(l.value, '$.itemId') AS itemId, json_extract(l.value, '$.countedQty') AS counted,
        json_extract(l.value, '$.unitCost') AS unitCost, json_extract(l.value, '$.productName') AS name,
        json_extract(l.value, '$.unit') AS unit
      FROM inventory_counts c, json_each(CASE WHEN json_valid(c.lines_json) THEN c.lines_json ELSE '[]' END) l
      WHERE c.merchant = ? AND c.id IN (
          SELECT id FROM (${pick} AND submitted_at < ? AND submitted_at >= ? ORDER BY submitted_at DESC LIMIT 40)
          UNION SELECT id FROM (${pick} AND submitted_at <= ? AND submitted_at >= ? ORDER BY submitted_at DESC LIMIT 10))
        ${itemId ? "AND json_extract(l.value, '$.itemId') = ?" : ''}`,
    merchant, merchant, to, from - COUNT_LOOKBACK_MS, merchant, from, from - COUNT_LOOKBACK_MS, ...(itemId ? [itemId] : []));
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

async function targetOf(env, merchant) {
  try {
    const r = await one(env, 'SELECT min_margin_pct FROM cost_targets WHERE merchant = ?', merchant);
    return r.min_margin_pct != null ? Number(r.min_margin_pct) : null;
  } catch (_) { return null; }
}

async function siteReport(env, site, legacy, from, to, family) {
  const missing = [];
  const [sales, ledger, stock, po, names, transit, target, delivery] = await Promise.all([
    salesBlock(env, site.merchant, legacy, from, to),
    soft(ledgerBlock(env, site.merchant, from, to), ledgerTotals([]), missing, 'ledger'),
    soft(stockBlock(env, site.merchant), { cost: new Map(), stockValueCents: 0, stockItems: 0, stockNoCost: 0 }, missing, 'stock'),
    soft(poBlock(env, site.merchant), { pendingPoCents: 0, pendingPoCount: 0 }, missing, 'purchase-orders'),
    namesBlock(env, site.merchant),
    soft(transitBlock(env, site.merchant, family), { inTransitCents: 0, inTransitPieces: 0, inTransitCount: 0 }, missing, 'transfers'),
    targetOf(env, site.merchant),
    soft(deliveryBlock(env, site.merchant, legacy, from, to), { atCourierCents: 0, atCourierCount: 0, atCourierOldestTs: null, lostDeliveryCents: 0, lostDeliveryCount: 0,
      lateReturnCostCents: 0, lateReturnCount: 0, deliveryUncostedLines: 0, deliveryCapped: false }, missing, 'deliveries'),
  ]);
  const variance = await soft(varianceBlock(env, site.merchant, from, to, stock, names),
    { rows: [], countsFound: false, windows: [], leakCents: 0, surplusCents: 0, netGapCents: 0, measured: 0, missingCount: 0, noCost: 0 }, missing, 'variance');
  const ratios = keyRatios({ ...sales, ...ledger, stockValueCents: stock.stockValueCents, ...transit, ...po,
    returnsCostCents: sales.returnsCostCents + delivery.lateReturnCostCents,
    lostDeliveryCents: delivery.lostDeliveryCents, atCourierCents: delivery.atCourierCents });
  /* Un ticket offert est une perte, rangée sous son motif. */
  const losses = ledger.byReason.slice();
  if (sales.giftCostCents) losses.push({ reason: 'offert', source: 'ticket', cents: sales.giftCostCents });
  if (delivery.lostDeliveryCents) losses.push({ reason: 'perdu', source: 'livraison', cents: delivery.lostDeliveryCents });
  losses.sort((a, b) => b.cents - a.cents);
  return {
    merchant: site.merchant, name: site.name || site.merchant,
    ratios,
    target: targetCheck(ratios, target),
    coverage: { ...sales.coverage, saleCount: sales.saleCount, ledgerNoCostRows: ledger.noCostRows, theoreticalLedgerCents: ledger.theoreticalLedgerCents, stockItems: stock.stockItems, stockNoCost: stock.stockNoCost, stockSnapshot: stock.snapshot || 'none',
      atCourierCount: delivery.atCourierCount, atCourierOldestTs: delivery.atCourierOldestTs, lostDeliveryCount: delivery.lostDeliveryCount,
      lateReturnCostCents: delivery.lateReturnCostCents, lateReturnCount: delivery.lateReturnCount,
      deliveryUncostedLines: delivery.deliveryUncostedLines, deliveryCapped: delivery.deliveryCapped },
    losses,
    variance,
    missing,
  };
}

/* Une matière, un tap : ses mouvements et ses inventaires sur la fenêtre. */
const DETAIL_LIMIT = 300;
async function itemDetail(env, merchant, itemId, from, to) {
  const [moves, counts, names] = await Promise.all([
    all(env, `SELECT m.occurred_ts AS ts, m.reason AS reason, m.ref_type AS refType, m.qty_milli / 1000.0 AS qty,
          ROUND(m.qty_milli * ${RATE} / 10.0) AS cents, m.note AS note, m.actor AS actor,
          COALESCE(${META('m.meta', 'wasteReason')}, ${META('m.meta', 'lossReason')}, '') AS lossReason
        FROM inventory_movements m
        WHERE m.merchant = ? AND m.item_id = ? AND m.occurred_ts >= ? AND m.occurred_ts < ?
        ORDER BY m.occurred_ts DESC LIMIT ${DETAIL_LIMIT}`, merchant, itemId, from, to),
    countPoints(env, merchant, from, to, itemId),
    namesBlock(env, merchant),
  ]);
  const c = counts.get(itemId);
  return {
    itemId, name: (names.get(itemId) || {}).name || (c && c.name) || itemId, unit: (names.get(itemId) || {}).unit || (c && c.unit) || '',
    movements: moves.map((r) => ({ ts: n0(r.ts), reason: r.reason, refType: r.refType, qty: Math.round(n0(r.qty) * 1000) / 1000,
      cents: r.cents == null ? null : n0(r.cents), note: str(r.note, 120), actor: str(r.actor, 60), lossReason: r.lossReason || '' })),
    counts: c ? [...c.points.values()].sort((a, b) => b.ts - a.ts) : [],
    truncated: moves.length >= DETAIL_LIMIT,
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

  const item = str(url.searchParams.get('item'), 80);
  if (item) {
    /* La fenêtre de la matière (entre ses deux inventaires) peut déborder la
       période : open/close la donnent, bornés à 400 jours. */
    const open = Math.round(Number(url.searchParams.get('open')));
    const close = Math.round(Number(url.searchParams.get('close')));
    const wf = Number.isSafeInteger(open) && open > 0 ? open : from;
    const wt = Number.isSafeInteger(close) && close > wf ? close + 1 : to;
    if (wt - wf > 401 * 86400000) return json({ error: 'range-too-long' }, 400, noStore);
    try { return json({ merchant, item: await itemDetail(env, merchant, item, wf, wt) }, 200, noStore); }
    catch (_) { return json({ error: 'storage' }, 503, noStore); }
  }

  const wantAll = url.searchParams.get('scope') === 'all';
  /* Les magasins du compte : la liste du sélecteur, le périmètre de « tous
   * les établissements » et celui des transferts en route. Le magasin demandé
   * y reste même si le registre ne le connaît pas encore : il a déjà passé la
   * porte ci-dessus. */
  let owned = [];
  try { owned = ((await ownedStores(request, env, merchant)).stores || []).filter((s) => s && s.merchant); } catch (_) { owned = []; }
  if (!owned.some((s) => s.merchant === merchant)) owned.unshift({ merchant, name: '' });
  owned = owned.slice(0, MAX_SITES);
  const family = owned.map((s) => s.merchant);
  let sites = wantAll ? owned : owned.filter((s) => s.merchant === merchant);
  try {
    const nameRows = await all(env, `SELECT merchant, name FROM merchant_config WHERE merchant IN (${sites.map(() => '?').join(',')})`, ...sites.map((s) => s.merchant));
    const byMerchant = new Map(nameRows.map((r) => [r.merchant, r.name]));
    sites = sites.map((s) => ({ ...s, name: s.name || byMerchant.get(s.merchant) || s.merchant }));
  } catch (_) {}

  try {
    const legacy = await legacyBucketFor(request, env, merchant);
    const reports = await Promise.all(sites.map((s) => siteReport(env, s, s.merchant === merchant ? legacy : '', from, to, family)));
    let total = null;
    if (wantAll) {
      const ratios = sumRatios(reports.map((r) => r.ratios));
      const own = reports.find((r) => r.merchant === merchant);
      total = {
        ratios,
        target: targetCheck(ratios, own && own.target ? own.target.minMarginPct : null),
        leakCents: reports.reduce((a, r) => a + r.variance.leakCents, 0),
        netGapCents: reports.reduce((a, r) => a + r.variance.netGapCents, 0),
      };
    }
    return json({
      merchant, scope: wantAll ? 'all' : 'site', storeCount: owned.length, canEdit: true,
      range: { fromDay: span.fromDay, toDay: span.toDay, days: span.days, from, to, cutoff, zone },
      sites: reports, total, generatedAt: Date.now(),
    }, 200, noStore);
  } catch (_) {
    return json({ error: 'storage' }, 503, noStore);
  }
}

/* Le seuil de marge minimum, par magasin. Même porte que la lecture :
 * le propriétaire de CE magasin ou un opérateur nommé. null l'efface. */
export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'storage' }, 503, noStore);
  let body;
  try { const text = await request.text(); if (text.length > 4096) return json({ error: 'too-large' }, 413, noStore); body = JSON.parse(text || '{}'); }
  catch (_) { return json({ error: 'bad-json' }, 400, noStore); }
  const merchant = str(body && body.merchant, 64);
  const actor = await foodCostActor(request, env, merchant);
  if (!actor) return json({ error: 'forbidden' }, 403, noStore);
  if (str(body.action, 20) !== 'target') return json({ error: 'bad-action' }, 400, noStore);
  const pct = cleanTargetPct(body.minMarginPct);
  if (Number.isNaN(pct)) return json({ error: 'bad-target' }, 400, noStore);
  try {
    if (pct == null) await env.DB.prepare('DELETE FROM cost_targets WHERE merchant = ?').bind(merchant).run();
    else await env.DB.prepare(`INSERT INTO cost_targets (merchant, min_margin_pct, updated_ts, updated_by) VALUES (?, ?, ?, ?)
        ON CONFLICT (merchant) DO UPDATE SET min_margin_pct = excluded.min_margin_pct, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`)
      .bind(merchant, pct, Date.now(), actor.label).run();
    return json({ ok: true, minMarginPct: pct }, 200, noStore);
  } catch (_) {
    return json({ error: 'storage' }, 503, noStore);
  }
}
