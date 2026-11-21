/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT THÉORIQUE ET COÛT RÉEL — les formules, sans base ni réseau
 * ---------------------------------------------------------------------------
 * La route (functions/api/cost-variance.js) fait les sommes en SQL ; ce fichier
 * transforme ces sommes en ratios et en écarts. Pur, donc testé ligne à ligne
 * (tools/cost-variance-test.mjs).
 *
 * LES RATIOS CLÉS (les lignes d'Inyad, mêmes noms, mêmes formules) — b ventes
 * nettes après remises et remboursements, A coût théorique, v pertes :
 *   I = b − A                    marge sur coût théorique
 *   W = A / b × 100              coût %
 *   Y = v / b × 100              pertes %
 *   Z = A + v                    consommation réelle, b − Z sa marge
 *   L = reçu − retourné          achats nets
 *   G = entrées − sorties        transferts nets
 *   el = G + L                   approvisionnement net, b − el sa marge
 *
 * Inyad perd le signe de l'écart d'inventaire (Math.abs). Ici jamais : un
 * surplus compté reste négatif, une fuite reste positive, et chaque ligne dit
 * pourquoi elle n'a pas de chiffre au lieu d'afficher 0.
 *
 * Tout montant est en centimes entiers ; les quantités en unité de stock.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Motifs de perte. Les cinq premiers existaient (écran Pertes) ; « vol » est
 * le motif qui manquait, « perdu » et « erreur » viennent du comptage. */
export const LOSS_REASONS = ['perime', 'casse', 'avarie', 'offert', 'repas-equipe', 'vol', 'perdu', 'erreur', 'autre'];
const LOSS_ALIASES = {
  expiry: 'perime', 'péremption': 'perime', gift: 'offert', 'staff-meal': 'repas-equipe',
  theft: 'vol', stolen: 'vol', breakage: 'casse', damage: 'avarie', error: 'erreur', lost: 'perdu', loss: 'autre',
};
export function lossReason(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  if (LOSS_REASONS.includes(v)) return v;
  return LOSS_ALIASES[v] || '';
}

/* Les familles de mouvements du registre (inventory_movements.reason). */
export const THEORETICAL_REASONS = ['sale', 'sale-reversal', 'production-input'];
export const WASTE_REASONS = ['loss', 'expiry', 'gift', 'staff-meal'];
export function movementClass(reason, refType) {
  if (THEORETICAL_REASONS.includes(reason)) return 'theoretical';
  if (WASTE_REASONS.includes(reason) || refType === 'waste') return 'waste';
  if (reason === 'count') return 'count';
  return 'supply';
}

const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
const pct = (part, whole) => (whole > 0 ? Math.round(part / whole * 1000) / 10 : null);
const qty3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

/* Les sept lignes, à partir des sommes de la route. */
export function keyRatios(input) {
  const s = input || {};
  const gross = int(s.salesCents);
  const refunds = int(s.refundCents);
  const b = gross - refunds;
  const A = int(s.cogsCents);
  const declared = int(s.declaredWasteCents);
  const shrink = int(s.countShrinkCents);
  const over = int(s.countOverCents);
  /* Signé : un surplus compté réduit la perte, il ne l'augmente pas. */
  const v = declared + shrink - over;
  const Z = A + v;
  const received = int(s.receivedCents);
  const returned = int(s.returnedCents);
  const L = received - returned;
  const tin = int(s.transferInCents);
  const tout = int(s.transferOutCents);
  const G = tin - tout;
  const el = G + L;
  return {
    grossSalesCents: gross,
    discountCents: int(s.discountCents),
    refundCents: refunds,
    netSalesCents: b,
    cogsCents: A,
    marginCents: b - A,
    costPct: pct(A, b),
    declaredWasteCents: declared,
    countShrinkCents: shrink,
    countOverCents: over,
    wasteCents: v,
    wastePct: pct(v, b),
    consumptionCents: Z,
    consumptionPct: pct(Z, b),
    marginOnConsumptionCents: b - Z,
    receivedCents: received,
    returnedCents: returned,
    purchasesCents: L,
    transferInCents: tin,
    transferOutCents: tout,
    transfersCents: G,
    supplyCents: el,
    marginOnSupplyCents: b - el,
    stockValueCents: int(s.stockValueCents),
    pendingPoCents: int(s.pendingPoCents),
    pendingPoCount: int(s.pendingPoCount),
  };
}

/* « Tous les établissements » : on additionne les sommes, puis on recalcule
 * les pourcentages. Une moyenne de pourcentages donnerait à un kiosque le
 * même poids qu'un restaurant. */
const SUMMED = ['grossSalesCents', 'discountCents', 'refundCents', 'cogsCents', 'declaredWasteCents',
  'countShrinkCents', 'countOverCents', 'receivedCents', 'returnedCents', 'transferInCents',
  'transferOutCents', 'stockValueCents', 'pendingPoCents', 'pendingPoCount'];
export function sumRatios(list) {
  const acc = {};
  for (const r of list || []) for (const k of SUMMED) acc[k] = (acc[k] || 0) + int(r && r[k]);
  return keyRatios({
    salesCents: acc.grossSalesCents, refundCents: acc.refundCents, discountCents: acc.discountCents,
    cogsCents: acc.cogsCents, declaredWasteCents: acc.declaredWasteCents,
    countShrinkCents: acc.countShrinkCents, countOverCents: acc.countOverCents,
    receivedCents: acc.receivedCents, returnedCents: acc.returnedCents,
    transferInCents: acc.transferInCents, transferOutCents: acc.transferOutCents,
    stockValueCents: acc.stockValueCents, pendingPoCents: acc.pendingPoCents, pendingPoCount: acc.pendingPoCount,
  });
}

/* Les sommes du registre par motif → les montants des ratios. Chaque ligne :
 * { reason, refType, lossReason, valueCents (signé, qty × coût), negCents,
 *   posCents, rows, noCost }. */
export function ledgerTotals(rows) {
  const out = {
    declaredWasteCents: 0, countShrinkCents: 0, countOverCents: 0,
    receivedCents: 0, returnedCents: 0, transferInCents: 0, transferOutCents: 0,
    theoreticalLedgerCents: 0, noCostRows: 0, byReason: [],
  };
  const reasons = new Map();
  const addReason = (reason, source, cents) => {
    if (!cents) return;
    const key = source + '|' + reason;
    const cur = reasons.get(key) || { reason, source, cents: 0 };
    cur.cents += cents;
    reasons.set(key, cur);
  };
  for (const r of rows || []) {
    const value = int(r.valueCents);
    const cls = movementClass(r.reason, r.refType);
    if (r.noCost) out.noCostRows += int(r.noCost);
    if (cls === 'theoretical') out.theoreticalLedgerCents += -value;
    else if (cls === 'waste') {
      out.declaredWasteCents += -value;
      addReason(lossReason(r.lossReason || r.reason) || 'autre', 'declared', -value);
    } else if (cls === 'count') {
      const shrink = -int(r.negCents);
      const over = int(r.posCents);
      out.countShrinkCents += shrink;
      out.countOverCents += over;
      addReason(lossReason(r.lossReason) || 'non-explique', 'count', shrink - over);
    } else if (r.reason === 'receipt') out.receivedCents += value;
    else if (r.reason === 'supplier-return') out.returnedCents += -value;
    else if (r.reason === 'transfer-in') out.transferInCents += value;
    else if (r.reason === 'transfer-out') out.transferOutCents += -value;
  }
  out.byReason = [...reasons.values()].filter((x) => x.cents).sort((a, b) => b.cents - a.cents);
  return out;
}

/* Quels deux comptages encadrent la période pour un ingrédient ?
 * points : [{ ts, qty }] triés ou non. Ouverture = le dernier comptage au plus
 * tard au début de la période, sinon le premier DANS la période ; clôture = le
 * dernier avant la fin, après l'ouverture. */
export function pickWindow(points, from, to) {
  const list = (points || []).filter((p) => p && Number.isFinite(p.ts) && p.ts < to).sort((a, b) => a.ts - b.ts);
  if (!list.length) return { status: 'no-count' };
  let open = null;
  for (const p of list) if (p.ts <= from) open = p;
  if (!open) open = list.find((p) => p.ts > from) || null;
  if (!open) return { status: 'no-count' };
  let close = null;
  for (const p of list) if (p.ts > open.ts) close = p;
  if (!close) return { status: 'one-count', open };
  return { status: 'ok', open, close };
}

/* Un ingrédient entre deux comptages.
 *   utilisation réelle = début + entrées − fin
 *   écart = réelle − théorique (positif : il manque de la marchandise)
 *   dont pertes déclarées, le reste est inexpliqué.
 * unitCost en MAD par unité de stock ; null = pas de montant, jamais 0. */
export function itemVariance({ opening, closing, supply, theoretical, waste, unitCost }) {
  const actualUse = qty3(Number(opening) + Number(supply || 0) - Number(closing));
  const theo = qty3(theoretical);
  const declared = qty3(waste);
  const gap = qty3(actualUse - theo);
  const unexplained = qty3(gap - declared);
  const cost = unitCost != null && Number.isFinite(Number(unitCost)) && Number(unitCost) > 0 ? Number(unitCost) : null;
  const money = (q) => (cost == null ? null : Math.round(q * cost * 100));
  return {
    actualUse, theoretical: theo, waste: declared, gap, unexplained,
    gapPct: theo > 0 ? Math.round(gap / theo * 1000) / 10 : null,
    gapCents: money(gap), unexplainedCents: money(unexplained), wasteCents: money(declared),
    unitCostCents: cost == null ? null : Math.round(cost * 100),
  };
}

/* Le tableau « où l'argent fuit » : les montants d'abord, du plus perdu au
 * plus gagné, puis les lignes sans montant, puis celles sans comptage. */
export function sortLeaks(rows) {
  const rank = (r) => (r.gapCents != null ? 0 : (r.actualUse != null ? 1 : 2));
  return (rows || []).slice().sort((a, b) => rank(a) - rank(b)
    || (b.gapCents == null ? 0 : b.gapCents) - (a.gapCents == null ? 0 : a.gapCents)
    || (b.theoreticalInRangeCents || 0) - (a.theoreticalInRangeCents || 0)
    || String(a.name || a.itemId).localeCompare(String(b.name || b.itemId)));
}

/* La période demandée, en journées de caisse. `days` finit aujourd'hui ;
 * `from`/`to` sont deux dates civiles incluses. */
export const MAX_DAYS = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function resolveDays(params, today, addDays) {
  const p = params || {};
  const from = String(p.from || ''), to = String(p.to || '');
  if (from || to) {
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from) return { error: 'range' };
    const span = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
    if (!(span > 0)) return { error: 'range' };
    if (span > MAX_DAYS) return { error: 'range-too-long' };
    return { fromDay: from, toDay: to, days: span };
  }
  const n = Math.round(Number(p.days || 7));
  if (!(n >= 1 && n <= MAX_DAYS)) return { error: 'range' };
  return { fromDay: addDays(today, -(n - 1)), toDay: today, days: n };
}
