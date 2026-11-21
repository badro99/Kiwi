/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT THÉORIQUE ET COÛT RÉEL · les formules, sans base ni réseau
 * ---------------------------------------------------------------------------
 * La route (functions/api/cost-variance.js) fait les sommes en SQL ; ce fichier
 * transforme ces sommes en ratios et en écarts. Pur, donc testé ligne à ligne
 * (tools/cost-variance-test.mjs).
 *
 * LES RATIOS CLÉS (les lignes d'Inyad, mêmes noms, mêmes formules) : b ventes
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

/* Les sept lignes, à partir des sommes de la route.
 *   cogsCents       coût gelé des lignes vendues (ventes payées et reçus à
 *                   0 MAD au carnet : la marchandise est partie)
 *   returnsCostCents coût des lignes rendues (remboursement, retour en avoir) :
 *                   la marchandise revient, son coût sort de A
 *   giftCostCents   coût des tickets offerts : une perte, motif « offert » */
export function keyRatios(input) {
  const s = input || {};
  const gross = int(s.salesCents);
  const refunds = int(s.refundCents);
  const b = gross - refunds;
  const sold = int(s.cogsCents);
  const back = int(s.returnsCostCents);
  const A = sold - back;
  const declared = int(s.declaredWasteCents);
  const gifts = int(s.giftCostCents);
  const shrink = int(s.countShrinkCents);
  const over = int(s.countOverCents);
  /* Signé : un surplus compté réduit la perte, il ne l'augmente pas. */
  const v = declared + gifts + shrink - over;
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
    soldCostCents: sold,
    returnsCostCents: back,
    cogsCents: A,
    marginCents: b - A,
    costPct: pct(A, b),
    declaredWasteCents: declared,
    giftCostCents: gifts,
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
    inTransitCents: int(s.inTransitCents),
    inTransitPieces: int(s.inTransitPieces),
    inTransitCount: int(s.inTransitCount),
    pendingPoCents: int(s.pendingPoCents),
    pendingPoCount: int(s.pendingPoCount),
  };
}

/* « Tous les établissements » : on additionne les sommes, puis on recalcule
 * les pourcentages. Une moyenne de pourcentages donnerait à un kiosque le
 * même poids qu'un restaurant. */
const SUMMED = {
  salesCents: 'grossSalesCents', refundCents: 'refundCents', discountCents: 'discountCents',
  cogsCents: 'soldCostCents', returnsCostCents: 'returnsCostCents', giftCostCents: 'giftCostCents',
  declaredWasteCents: 'declaredWasteCents', countShrinkCents: 'countShrinkCents', countOverCents: 'countOverCents',
  receivedCents: 'receivedCents', returnedCents: 'returnedCents', transferInCents: 'transferInCents',
  transferOutCents: 'transferOutCents', stockValueCents: 'stockValueCents', inTransitCents: 'inTransitCents',
  inTransitPieces: 'inTransitPieces', inTransitCount: 'inTransitCount', pendingPoCents: 'pendingPoCents',
  pendingPoCount: 'pendingPoCount',
};
export function sumRatios(list) {
  const acc = {};
  for (const r of list || []) for (const [k, from] of Object.entries(SUMMED)) acc[k] = (acc[k] || 0) + int(r && r[from]);
  return keyRatios(acc);
}

/* Le seuil de marge minimum (Inyad : « Minimum margin threshold ») : le
 * propriétaire fixe la marge brute qu'il veut garder, en % des ventes nettes.
 * L'alerte compare la marge sur consommation RÉELLE (b − Z) au seuil. */
export function targetCheck(ratios, minMarginPct) {
  const p = Number(minMarginPct);
  if (!(p > 0 && p < 100)) return null;
  const b = int(ratios && ratios.netSalesCents);
  const threshold = Math.round(b * p / 100);
  const real = int(ratios && ratios.marginOnConsumptionCents);
  const theo = int(ratios && ratios.marginCents);
  return {
    minMarginPct: Math.round(p * 10) / 10,
    thresholdCents: threshold,
    maxConsumptionCents: b - threshold,
    realMarginPct: pct(real, b),
    theoreticalBreached: b > 0 && theo < threshold,
    breached: b > 0 && real < threshold,
    shortfallCents: b > 0 ? Math.max(0, threshold - real) : 0,
  };
}
export function cleanTargetPct(value) {
  if (value === null || value === '' || value === undefined) return null;
  const n = Math.round(Number(value) * 10) / 10;
  return Number.isFinite(n) && n > 0 && n < 100 ? n : NaN;
}

/* Le coût des lignes rendues. Une ligne rendue porte rarement son coût (un
 * retour en avoir ne transporte que le prix payé) : elle prend alors le coût
 * moyen gelé du même article vendu ces 90 derniers jours ; à défaut, elle
 * reste « non chiffrée » et le dit, jamais à 0.
 * rows : [{ name, costedCents (déjà chiffré), qty (sans coût), cents (prix),
 *           avgCost (MAD, ou null) }] */
export function returnsCost(rows) {
  let costed = 0, uncostedCents = 0, uncostedLines = 0;
  for (const r of rows || []) {
    costed += int(r.costedCents);
    const q = Number(r.qty) || 0;
    if (!(q > 0)) continue;
    const k = Number(r.avgCost);
    if (k > 0) costed += Math.round(q * k * 100);
    else { uncostedCents += int(r.cents); uncostedLines++; }
  }
  return { returnsCostCents: costed, uncostedReturnCents: uncostedCents, uncostedReturnLines: uncostedLines };
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

/* Valeur du stock sans relire tout l'historique : un instantané par magasin
 * (sommes par article jusqu'à un curseur srv_ts) + les mouvements arrivés
 * depuis. Le registre est append-only, donc instantané + suite = tout.
 * Une entrée : [qtyMilli, valeur des entrées, qty des entrées, valeur de
 * tout mouvement chiffré, qty de tout mouvement chiffré] (valeurs en
 * qty_milli × MAD). */
export function mergeStockAggregates(base, rows) {
  const out = {};
  for (const [id, v] of Object.entries(base || {})) if (Array.isArray(v) && v.length === 5) out[id] = v.map((x) => Number(x) || 0);
  for (const r of rows || []) {
    const id = String(r.itemId);
    const cur = out[id] || [0, 0, 0, 0, 0];
    const add = [r.q, r.inV, r.inQ, r.anyV, r.anyQ].map((x) => Number(x) || 0);
    out[id] = cur.map((x, i) => x + add[i]);
  }
  return out;
}
export function stockFromAggregates(agg) {
  const cost = new Map();
  let value = 0, items = 0, noCost = 0;
  for (const [id, [q, inV, inQ, anyV, anyQ]] of Object.entries(agg || {})) {
    const c = inQ > 0 ? inV / inQ : (anyQ > 0 ? anyV / anyQ : null);
    if (c != null && c > 0) cost.set(id, c);
    const onHand = q / 1000;
    if (onHand > 0.0005) {
      items++;
      if (c != null && c > 0) value += onHand * c * 100;
      else noCost++;
    }
  }
  return { cost, stockValueCents: Math.round(value), stockItems: items, stockNoCost: noCost };
}
