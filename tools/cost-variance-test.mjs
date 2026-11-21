#!/usr/bin/env node
/* Coût théorique et coût réel (functions/api/cost-variance.js + _cost-variance.js).
 *
 * Sur la vraie route et le vrai schema.sql, avec un petit jeu de données dont
 * chaque chiffre attendu est calculé à la main ci-dessous :
 *   1. Les formules d'Inyad, une par une (b, A, I, W, v, Y, Z, L, G, el).
 *   2. Les écarts restent SIGNÉS : un surplus compté réduit la perte, une
 *      matière qui manque est positive, une matière en trop négative.
 *   3. Les journées de caisse : 04:59 appartient à la veille, 05:00 au jour,
 *      Maroc en UTC+0 depuis le 20 septembre 2026.
 *   4. Le tableau par matière entre deux inventaires, trié par argent perdu,
 *      et les matières sans comptage ou sans recette signalées, jamais à 0.
 *   5. Le motif « vol » et le motif par ligne d'inventaire, sans casser les
 *      comptages existants (même empreinte sans motif).
 *   6. Les magasins : propriétaire et opérateur oui ; caisse, employé, autre
 *      compte non ; « tous les établissements » = les magasins du compte.
 *   7. Le retour du juge : coût 0 = inconnu, retours déduits, offerts et
 *      reçus à 0 MAD, seuil de marge, transferts en route, inventaires les
 *      plus récents d'abord, instantané du stock, détail d'une matière.
 *   8. L'export CSV ne fabrique pas de formule.
 *   9. Livraisons : encaissée une fois, chez le livreur, revenue, perdue ;
 *      retours rapprochés par identifiant d'article ; remboursements sans
 *      panier signalés ; pertes rattachées à qui les a déclarées. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { onRequestGet, onRequestPost: postTarget } = await imp('functions/api/cost-variance.js');
const F = await imp('functions/api/_cost-variance.js');
const counts = await imp('functions/api/inventory/counts.js');
const auth = await imp('functions/auth/_lib.js');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); }
};
const eq = (label, got, want) => ok(`${label} = ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want), got);
console.log('■ Coût théorique et réel (tools/cost-variance-test.mjs)');

/* ── 1. Les formules, à la main ──────────────────────────────────────────── */
{
  const r = F.keyRatios({ salesCents: 22000, refundCents: 2000, discountCents: 1000, cogsCents: 9000,
    declaredWasteCents: 8000, countShrinkCents: 9000, countOverCents: 100,
    receivedCents: 40000, returnedCents: 8000, transferInCents: 500, transferOutCents: 2000,
    stockValueCents: 5, pendingPoCents: 7, pendingPoCount: 1 });
  eq('b ventes nettes', r.netSalesCents, 20000);
  eq('I marge sur coût théorique', r.marginCents, 11000);
  eq('W coût %', r.costPct, 45);
  eq('v pertes (déclarées + manquants − surplus)', r.wasteCents, 16900);
  eq('Y pertes %', r.wastePct, 84.5);
  eq('Z consommation réelle', r.consumptionCents, 25900);
  eq('b − Z', r.marginOnConsumptionCents, -5900);
  eq('L achats nets', r.purchasesCents, 32000);
  eq('G transferts nets (signé)', r.transfersCents, -1500);
  eq('el approvisionnement net', r.supplyCents, 30500);
  eq('b − el', r.marginOnSupplyCents, -10500);
  const z = F.keyRatios({});
  ok('sans ventes, les pourcentages sont null (jamais 0 %, jamais Infinity)', z.costPct === null && z.wastePct === null);
  const over = F.keyRatios({ salesCents: 1000, countOverCents: 300 });
  eq('un surplus seul rend la perte négative (signe gardé)', over.wasteCents, -300);
  const sum = F.sumRatios([F.keyRatios({ salesCents: 1000, cogsCents: 500 }), F.keyRatios({ salesCents: 9000, cogsCents: 900 })]);
  eq('tous les magasins : coût % recalculé sur les sommes, pas moyenné', sum.costPct, 14);

  eq('pickWindow : dernier comptage avant le début, dernier avant la fin',
    F.pickWindow([{ ts: 1, qty: 9 }, { ts: 5, qty: 7 }, { ts: 50, qty: 4 }, { ts: 90, qty: 2 }, { ts: 200, qty: 0 }], 10, 100),
    { status: 'ok', open: { ts: 5, qty: 7 }, close: { ts: 90, qty: 2 } });
  eq('pickWindow : sans comptage avant, le premier dans la période ouvre',
    F.pickWindow([{ ts: 20, qty: 9 }, { ts: 60, qty: 4 }], 10, 100).open, { ts: 20, qty: 9 });
  eq('pickWindow : un seul comptage', F.pickWindow([{ ts: 20, qty: 9 }], 10, 100).status, 'one-count');
  eq('pickWindow : aucun', F.pickWindow([], 10, 100).status, 'no-count');

  const v = F.itemVariance({ opening: 10, closing: 3, supply: 4, theoretical: 10, waste: 1, unitCost: 80 });
  eq('réel = début + entrées − fin', v.actualUse, 11);
  eq('écart = réel − théorique', v.gap, 1);
  eq('dont inexpliqué = écart − pertes déclarées', v.unexplained, 0);
  eq('écart en centimes', v.gapCents, 8000);
  const s = F.itemVariance({ opening: 5, closing: 4, supply: -1, theoretical: 0.5, waste: 0, unitCost: 20 });
  eq('une matière en trop reste négative', [s.gap, s.gapCents], [-0.5, -1000]);
  eq('sans coût connu : pas de montant (null, pas 0)', F.itemVariance({ opening: 1, closing: 0, theoretical: 0, unitCost: null }).gapCents, null);
  const sorted = F.sortLeaks([{ name: 'b', gapCents: -50, actualUse: 1 }, { name: 'a', status: 'no-count' }, { name: 'c', gapCents: 900, actualUse: 1 }, { name: 'd', gapCents: null, actualUse: 2 }]);
  eq('tri : plus perdu, puis en trop, puis sans montant, puis sans comptage', sorted.map((r) => r.name), ['c', 'b', 'd', 'a']);

  eq('motif vol (et ses alias)', [F.lossReason('vol'), F.lossReason('theft'), F.lossReason('Stolen'), F.lossReason('n/importe')], ['vol', 'vol', 'vol', '']);
  const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  eq('days=7 finit aujourd’hui', F.resolveDays({ days: 7 }, '2026-11-21', add), { fromDay: '2026-11-15', toDay: '2026-11-21', days: 7 });
  eq('from/to inclus', F.resolveDays({ from: '2026-11-10', to: '2026-11-16' }, '2026-11-21', add).days, 7);
  eq('période à l’envers refusée', F.resolveDays({ from: '2026-11-16', to: '2026-11-10' }, '', add).error, 'range');
  eq('plus de 400 jours refusés', F.resolveDays({ days: 401 }, '2026-11-21', add).error, 'range');
}

/* ── Base de test ──────────────────────────────────────────────────────────── */
const SECRET = 'cost-variance-secret-0123456789ab';
const SHOP = 'resto-cv', SHOP2 = 'resto-cv-2', OTHER = 'autre-cv';
const now = Date.now();
const T = (day, h, m = 0) => Date.UTC(2026, 10, day, h, m);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const run = (sql, ...v) => sqlite.prepare(sql).run(...v);
run(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-1','owner@cv.ma','Resto CV','s','h',?,'active')`, now);
run(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-2','autre@cv.ma','Autre CV','s','h',?,'active')`, now);
for (const [m, acc, name] of [[SHOP, 'acc-1', 'Resto Centre'], [SHOP2, 'acc-1', 'Resto Plage'], [OTHER, 'acc-2', 'Autre']]) {
  run(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,'{}','pro','restaurant',?,?,'active',?)`, m, acc, name, now);
}
run(`INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op1','Badr','s','h',?)`, now);
const TEAM = { members: [{ id: 'm1', firstName: 'Samira', function: 'Serveur', pinCode: '0000' }] };
run(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,?)`, SHOP, JSON.stringify(TEAM), now);
run(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'employee-access',?,1,?)`, SHOP, JSON.stringify({ members: TEAM.members }), now);
run(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'stock',?,1,?)`, SHOP,
  JSON.stringify({ items: [{ id: 'poulet', name: 'Poulet fermier', unit: 'kg' }, { id: 'huile', name: 'Huile d’olive', unit: 'L' }] }), now);
run(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'costs',?,1,?)`, SHOP,
  JSON.stringify({ ingredients: [{ id: 'ing-1', stockId: 'menthe', name: 'Menthe fraîche', unit: 'botte' }], recipes: {} }), now);

let sid = 0;
const sale = (merchant, ts, cents, lines, extra = {}) => run(
  `INSERT INTO sales (id,merchant,amount,amount_cents,gross_amount_cents,discount_amount_cents,method,ts,lines,void_ts) VALUES (?,?,?,?,?,?,'cash',?,?,?)`,
  'sale-' + (++sid), merchant, Math.round(cents / 100), cents, extra.gross ?? null, extra.discount ?? null, ts,
  lines == null ? null : JSON.stringify(lines), extra.void ?? null);
sale(SHOP, T(10, 12), 10000, [{ n: 'Tajine', q: 2, t: 110, k: 30, i: 'tajine' }], { gross: 11000, discount: 1000 });
sale(SHOP, T(11, 20), 5000, [{ n: 'Thé à la menthe', q: 5, t: 50 }, { n: 'Pourboire', q: 1, t: 5, kd: 'tip' }]);
sale(SHOP, T(12, 13), -2000, null);
sale(SHOP, T(10, 4, 59), 9999, [{ n: 'Tajine', q: 1, t: 99.99, k: 30 }]); // journée du 9 : hors période
sale(SHOP, T(17, 4, 59), 3000, [{ n: 'Tajine', q: 1, t: 30, k: 30 }]);    // encore la journée du 16
sale(SHOP, T(17, 5, 0), 7777, [{ n: 'Tajine', q: 1, t: 77.77, k: 30 }]);  // journée du 17 : hors période
sale(SHOP, T(12, 14), 8888, [{ n: 'Tajine', q: 1, t: 88.88, k: 30 }], { void: T(12, 15) });
sale(SHOP, T(13, 12), 4000, null);
sale(SHOP2, T(13, 12), 6000, [{ n: 'Pizza', q: 2, t: 60, k: 9 }]);
sale(OTHER, T(13, 12), 50000, [{ n: 'Tajine', q: 10, t: 500, k: 30 }]);

let mid = 0;
const move = (merchant, item, ts, qty, reason, opts = {}) => run(
  `INSERT INTO inventory_movements (id,merchant,item_id,qty_milli,reason,unit_cost_cents,unit_cost_rate,ref_type,ref_id,occurred_ts,srv_ts,reversal_of,meta,created_ts)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  opts.id || 'mv-' + (++mid), merchant, item, Math.round(qty * 1000), reason,
  opts.cents ?? null, opts.cost != null ? Math.round(opts.cost * 10000) : null, opts.refType || '', opts.refId || '',
  ts, ts, opts.reversalOf || '', opts.meta ? JSON.stringify(opts.meta) : null, ts);
// poulet (kg) à 80 MAD
move(SHOP, 'poulet', T(5, 10), 10, 'opening', { cost: 80 });
move(SHOP, 'poulet', T(12, 9), 5, 'receipt', { cost: 80, refType: 'receipt' });
move(SHOP, 'poulet', T(13, 12), -10, 'sale', { cost: 80, refType: 'sale' });
move(SHOP, 'poulet', T(14, 11), -1, 'loss', { cost: 80, refType: 'waste', meta: { wasteReason: 'vol' } });
move(SHOP, 'poulet', T(15, 10), -1, 'supplier-return', { cost: 80 });
move(SHOP, 'poulet', T(17, 1), -1, 'count', { cents: 8000, refType: 'count', meta: { countId: 'B', lossReason: 'vol' } });
// huile (L) à 20 MAD
move(SHOP, 'huile', T(1, 10), 5, 'opening', { cost: 20 });
move(SHOP, 'huile', T(13, 12), -0.5, 'sale', { cost: 20, refType: 'sale' });
move(SHOP, 'huile', T(14, 9), -0.2, 'loss', { id: 'loss-huile', cost: 20, refType: 'waste', meta: { wasteReason: 'casse' } });
move(SHOP, 'huile', T(14, 10), 0.2, 'manual', { cost: 20, refType: 'waste', reversalOf: 'loss-huile' });
move(SHOP, 'huile', T(15, 12), -1, 'transfer-out', { cost: 20 });
move(SHOP, 'huile', T(17, 1), -0.5, 'count', { cents: 2000, refType: 'count', meta: { countId: 'B' } });
// sel, sucre, menthe, citron
move(SHOP, 'sel', T(12, 9), 1, 'transfer-in', { cost: 5 });
move(SHOP, 'sel', T(17, 1), 0.2, 'count', { cents: 500, refType: 'count', meta: { countId: 'B' } });
move(SHOP, 'sucre', T(2, 9), 2, 'opening');
move(SHOP, 'menthe', T(13, 12), -3, 'sale', { cost: 4, refType: 'sale' });
move(SHOP, 'citron', T(13, 12), -2, 'sale', { cost: 1.5, refType: 'sale' });
// un autre commerçant, les mêmes identifiants, des montants énormes
move(OTHER, 'poulet', T(13, 12), -500, 'sale', { cost: 80 });
move(OTHER, 'poulet', T(14, 12), -50, 'loss', { cost: 80, refType: 'waste', meta: { wasteReason: 'vol' } });

const countRow = (merchant, id, ts, lines, status = 'applied', engine = 'ledger') => run(
  `INSERT INTO inventory_counts (id,merchant,engine,status,submitted_at,lines_json,created_ts,updated_ts) VALUES (?,?,?,?,?,?,?,?)`,
  id, merchant, engine, status, ts, JSON.stringify(lines), ts, ts);
countRow(SHOP, 'A', T(9, 22), [{ itemId: 'poulet', countedQty: 10, unitCost: 80 }, { itemId: 'huile', countedQty: 5, unitCost: 20 }]);
countRow(SHOP, 'B', T(16, 22), [{ itemId: 'poulet', countedQty: 3 }, { itemId: 'huile', countedQty: 4 }, { itemId: 'citron', countedQty: 6, productName: 'Citron' }]);
countRow(SHOP, 'R', T(15, 22), [{ itemId: 'poulet', countedQty: 999 }], 'rejected');
countRow(OTHER, 'X', T(16, 22), [{ itemId: 'poulet', countedQty: 0 }]);

const po = (merchant, number, status, lines) => {
  run(`INSERT INTO purchase_orders (id,merchant,seq,number,supplier,status,created_ts,updated_ts) VALUES (?,?,?,?,'Fournisseur',?,?,?)`,
    merchant + number, merchant, Number(number.slice(3)), number, status, now, now);
  lines.forEach((l, i) => run(`INSERT INTO purchase_order_lines (id,merchant,number,line_no,sku,qty,unit_cents,received_qty,created_ts) VALUES (?,?,?,?,?,?,?,?,?)`,
    merchant + number + i, merchant, number, i + 1, 'sku' + i, l[0], l[1], l[2], now));
};
po(SHOP, 'PO-1', 'submitted', [[10, 1500, 4]]);
po(SHOP, 'PO-2', 'received', [[3, 1000, 3]]);
po(SHOP, 'PO-3', 'cancelled', [[3, 1000, 0]]);
po(OTHER, 'PO-4', 'submitted', [[100, 9999, 0]]);

const DB = {
  prepare(sql) {
    const st = sqlite.prepare(sql);
    let args = [];
    const api = {
      bind(...v) { args = v; return api; },
      async first() { const r = st.get(...args); return r === undefined ? null : r; },
      async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { changes: r.changes }, success: true }; },
    };
    return api;
  },
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
};
const env = { AUTH_SECRET: SECRET, DB };
const owner = auth.sessionCookie(await auth.makeSession('acc-1', SECRET)).split(';')[0];
const stranger = auth.sessionCookie(await auth.makeSession('acc-2', SECRET)).split(';')[0];
const till = `kiwi_till=${await auth.tillToken(SECRET, SHOP)}`;
const employee = auth.employeeCookie(await auth.employeeToken(SECRET, { merchant: SHOP, staffId: 'm1' })).split(';')[0];
const operator = `kiwi_op=${await auth.operatorToken(SECRET)}; kiwi_op_id=${await auth.operatorIdToken(SECRET, 'op1')}`;
const get = async (q, cookie) => {
  const r = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/cost-variance?${q}`, { headers: cookie ? { Cookie: cookie } : {} }) });
  return { status: r.status, body: await r.json() };
};
const RANGE = 'from=2026-11-10&to=2026-11-16';

/* ── 2-4. La route sur le jeu de données ───────────────────────────────────── */
const res = await get(`merchant=${SHOP}&${RANGE}`, owner);
eq('propriétaire : 200', res.status, 200);
const site = (res.body.sites || [])[0] || {};
const R = site.ratios || {};
eq('période en journées de caisse (05:00 UTC, Maroc UTC+0)', [res.body.range && res.body.range.from, res.body.range && res.body.range.to], [T(10, 5), T(17, 5)]);
eq('ventes : 04:59 compte la veille, 05:00 le jour, annulées exclues', R.grossSalesCents, 22000);
eq('remboursements', R.refundCents, 2000);
eq('remises', R.discountCents, 1000);
eq('b ventes nettes', R.netSalesCents, 20000);
eq('A coût théorique (quantité × coût gelé à la vente)', R.cogsCents, 9000);
eq('W coût %', R.costPct, 45);
eq('pertes déclarées (annulation de perte déduite)', R.declaredWasteCents, 8000);
eq('manquants d’inventaire', R.countShrinkCents, 9000);
eq('surplus d’inventaire', R.countOverCents, 100);
eq('v pertes, signées', R.wasteCents, 16900);
eq('Z consommation réelle', R.consumptionCents, 25900);
eq('L achats nets (reçu − retourné)', [R.receivedCents, R.returnedCents, R.purchasesCents], [40000, 8000, 32000]);
eq('G transferts nets', [R.transferInCents, R.transferOutCents, R.transfersCents], [500, 2000, -1500]);
eq('el et b − el', [R.supplyCents, R.marginOnSupplyCents], [30500, -10500]);
eq('valeur du stock maintenant (poulet 2 kg, huile 3 L, sel 1,2)', R.stockValueCents, 16000 + 6000 + 600);
eq('un article en stock sans coût est compté à part', site.coverage && site.coverage.stockNoCost, 1);
eq('commandes fournisseur en attente', [R.pendingPoCents, R.pendingPoCount], [9000, 1]);
const C = site.coverage || {};
eq('couverture : 140 MAD chiffrés sur 190 (pourboire exclu)', [C.costedRevenueCents, C.lineRevenueCents, C.costedPct], [14000, 19000, 73.7]);
eq('ventes sans détail article', C.undetailedCents, 4000);
eq('produits vendus sans coût, par chiffre d’affaires', (C.uncosted || []).map((u) => [u.name, u.cents]), [['Thé à la menthe', 5000]]);
const L = new Map((site.losses || []).map((x) => [x.source + ':' + x.reason, x.cents]));
eq('pertes par motif : vol déclaré', L.get('declared:vol'), 8000);
eq('pertes par motif : vol constaté à l’inventaire', L.get('count:vol'), 8000);
eq('pertes par motif : écart sans motif (manquant − surplus)', L.get('count:non-explique'), 900);
ok('une perte annulée ne reste pas dans les motifs', !L.has('declared:casse'), [...L.entries()]);

const V = site.variance || {};
const rows = V.rows || [];
const row = (id) => rows.find((r) => r.itemId === id) || {};
eq('ordre « où l’argent fuit »', rows.map((r) => r.itemId), ['poulet', 'huile', 'menthe', 'citron']);
const p = row('poulet');
eq('poulet : début, entrées, fin', [p.opening, p.supply, p.closing], [10, 4, 3]);
eq('poulet : réel, théorique, pertes déclarées', [p.actualUse, p.theoretical, p.waste], [11, 10, 1]);
eq('poulet : écart signé et en MAD', [p.gap, p.gapCents, p.unexplained], [1, 8000, 0]);
eq('poulet : nom lu dans la fiche Stock', [p.name, p.unit], ['Poulet fermier', 'kg']);
const h = row('huile');
eq('huile : matière en trop, écart négatif', [h.actualUse, h.theoretical, h.gap, h.gapCents], [0, 0.5, -0.5, -1000]);
eq('menthe : consommée sans aucun inventaire, signalée', [row('menthe').status, row('menthe').name, row('menthe').theoreticalInRange], ['no-count', 'Menthe fraîche', 3]);
eq('citron : un seul inventaire, signalé', row('citron').status, 'one-count');
eq('fuite totale / surplus / net', [V.leakCents, V.surplusCents, V.netGapCents], [8000, -1000, 7000]);
eq('le comptage refusé n’ouvre aucune fenêtre', (V.windows || []).map((w) => [w.open, w.close]), [[T(9, 22), T(16, 22)]]);

/* Rien de l'autre commerçant. */
ok('aucune vente, perte ou commande d’un autre magasin', R.netSalesCents === 20000 && R.declaredWasteCents === 8000 && R.pendingPoCents === 9000);

/* ── 6. Qui lit ───────────────────────────────────────────────────────────── */
eq('autre compte : 403', (await get(`merchant=${SHOP}&${RANGE}`, stranger)).status, 403);
eq('caisse appairée : 403 (marges et prix d’achat)', (await get(`merchant=${SHOP}&${RANGE}`, till)).status, 403);
eq('employé : 403', (await get(`merchant=${SHOP}&${RANGE}`, employee)).status, 403);
eq('sans session : 403', (await get(`merchant=${SHOP}&${RANGE}`)).status, 403);
eq('opérateur nommé : 200', (await get(`merchant=${SHOP}&${RANGE}`, operator)).status, 200);
eq('période invalide : 400', (await get(`merchant=${SHOP}&from=2026-11-16&to=2026-11-10`, owner)).status, 400);
const allSites = await get(`merchant=${SHOP}&${RANGE}&scope=all`, owner);
eq('tous les établissements : les deux magasins du compte, pas celui d’un autre', (allSites.body.sites || []).map((s) => s.merchant).sort(), [SHOP, SHOP2].sort());
eq('tous les établissements : sommes recalculées', [allSites.body.total.ratios.netSalesCents, allSites.body.total.ratios.cogsCents], [26000, 9000 + 1800]);
const otherAll = await get(`merchant=${OTHER}&${RANGE}&scope=all`, stranger);
eq('l’autre compte ne voit que son magasin', (otherAll.body.sites || []).map((s) => s.merchant), [OTHER]);
const opAll = await get(`merchant=${SHOP}&${RANGE}&scope=all`, operator);
eq('opérateur, tous les établissements du client consulté', (opAll.body.sites || []).map((s) => s.merchant).sort(), [SHOP, SHOP2].sort());

/* Une base vide ne ment pas : pas de coût %, pas de fenêtre. */
const empty = await get(`merchant=${SHOP2}&from=2026-10-01&to=2026-10-02`, owner);
const E = empty.body.sites[0];
ok('base vide : coût % null, aucun inventaire trouvé', E.ratios.costPct === null && E.variance.countsFound === false && E.variance.rows.length === 0, E);

/* ── 5. Motif par ligne d'inventaire ──────────────────────────────────────── */
const post = async (body, cookie) => {
  const r = await counts.onRequestPost({ env, request: new Request(`https://kiwi.test/api/inventory/counts?merchant=${SHOP}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
};
const line = { itemId: 'poulet', countedQty: 1, unitCost: 80, productName: 'Poulet fermier' };
const sub = await post({ merchant: SHOP, id: 'cnt_reason_1', engine: 'ledger', lines: [{ ...line, reason: 'vol' }, { itemId: 'huile', countedQty: 1, unitCost: 20, reason: 'pas-un-motif' }] }, owner);
ok('comptage avec motifs accepté', sub.status === 200 && sub.body.success, sub.body);
const stored = JSON.parse(sqlite.prepare("SELECT lines_json FROM inventory_counts WHERE id = 'cnt_reason_1'").get().lines_json);
eq('le motif est gardé ligne par ligne, un code inconnu reste vide', stored.map((l) => l.reason), ['vol', '']);
const replay = await post({ merchant: SHOP, id: 'cnt_reason_1', engine: 'ledger', lines: [{ ...line, reason: 'theft' }, { itemId: 'huile', countedQty: 1, unitCost: 20, reason: 'pas-un-motif' }] }, owner);
ok('un renvoi avec le même motif (alias) est un rejeu', replay.body.replayed === true, replay.body);
const legacy = await post({ merchant: SHOP, id: 'cnt_noreason', engine: 'ledger', lines: [line] }, owner);
const legacyAgain = await post({ merchant: SHOP, id: 'cnt_noreason', engine: 'ledger', lines: [{ ...line, reason: '' }] }, owner);
ok('sans motif, l’empreinte est celle d’avant (un ancien brouillon se rejoue)', legacy.status === 200 && legacyAgain.body.replayed === true, legacyAgain.body);
const approve = await post({ merchant: SHOP, action: 'approve', id: 'cnt_reason_1', reviewerName: 'Patron' }, owner);
ok('validation propriétaire', approve.status === 200 && approve.body.success, approve.body);
const mv = sqlite.prepare("SELECT meta FROM inventory_movements WHERE merchant = ? AND ref_id = 'cnt_reason_1' AND item_id = 'poulet'").get(SHOP);
eq('le mouvement d’inventaire porte le motif « vol »', mv && JSON.parse(mv.meta).lossReason, 'vol');
const mv2 = sqlite.prepare("SELECT meta FROM inventory_movements WHERE merchant = ? AND ref_id = 'cnt_reason_1' AND item_id = 'huile'").get(SHOP);
ok('sans motif valide, aucun motif inventé', mv2 && JSON.parse(mv2.meta).lossReason === undefined, mv2);
const tillCount = await post({ merchant: SHOP, action: 'approve', id: 'cnt_noreason' }, till);
eq('une caisse ne valide pas un écart', tillCount.status, 403);

/* ── 7. Épicerie : coût 0, retours, offerts, carnet, seuil, transferts ─────── */
const EPI = 'epi-cv', EPI2 = 'epi-cv-2';
run(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-3','epi@cv.ma','Epi CV','s','h',?,'active')`, now);
for (const m of [EPI, EPI2]) run(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,'{}','basic','epicerie','acc-3',?,'active',?)`, m, m, now);
const owner3 = auth.sessionCookie(await auth.makeSession('acc-3', SECRET)).split(';')[0];
const till3 = `kiwi_till=${await auth.tillToken(SECRET, EPI)}`;
const sale3 = (merchant, ts, cents, method, lines) => run(
  `INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines) VALUES (?,?,?,?,?,?,?)`,
  'sale-' + (++sid), merchant, cents / 100, cents, method, ts, JSON.stringify(lines));
/* Lait : la caisse épicerie envoie k:0 pour un produit sans coût. */
sale3(EPI, T(11, 12), 50000, 'cash', [{ n: 'Lait', q: 2, t: 250, k: 0 }, { n: 'Huile', q: 1, t: 250, k: 20 }]);
sale3(EPI, T(5, 12), 3000, 'cash', [{ n: 'Savon', q: 1, t: 30, k: 12, i: 'sv' }]);                       // avant la période : donne le coût moyen du savon
sale3(EPI, T(12, 10), -5000, 'cash', [{ n: 'Huile', q: 1, t: -50, k: 20 }]);                    // remboursement qui porte son coût
sale3(EPI, T(12, 11), -3000, 'credit', [{ itemId: 'sv', name: 'Savon', qty: 2, unitCents: 1500, amountCents: 3000 }]); // retour en avoir
sale3(EPI, T(12, 12), -1000, 'cash', [{ n: 'Inconnu', q: 1, t: -10 }]);                         // retour sans coût connu
sale3(EPI, T(13, 12), 0, 'complimentary', [{ n: 'Huile', q: 1, t: 0, k: 20 }]);                  // ticket offert
sale3(EPI, T(13, 13), 0, 'credit', [{ n: 'Huile', q: 2, t: 100, k: 20 }]);                       // reçu à 0 MAD (carnet)
const e = await get(`merchant=${EPI}&${RANGE}`, owner3);
const ES = (e.body.sites || [])[0] || {};
const ER = ES.ratios || {}, EC = ES.coverage || {};
eq('épicerie : 200', e.status, 200);
eq('coût 0 = inconnu : seul l’huile entre au coût vendu (k:0 ne compte pas)', ER.soldCostCents, 2000 + 4000);
eq('coût 0 = inconnu : couverture 250 MAD chiffrés sur 500', [EC.costedRevenueCents, EC.lineRevenueCents, EC.costedPct], [25000, 50000, 50]);
eq('coût 0 = inconnu : le lait est listé « sans coût », pas à 0', (EC.uncosted || []).map((u) => u.name), ['Lait']);
eq('remboursements : 50 + 30 + 10 MAD', ER.refundCents, 9000);
eq('coût des retours : 20 MAD gelés + 2 savons au coût moyen de 12 MAD', ER.returnsCostCents, 2000 + 2400);
eq('retour sans coût connu : dit, pas compté à 0', [EC.uncostedReturnCents, EC.uncostedReturnLines], [1000, 1]);
eq('A = coût vendu − coût des retours', ER.cogsCents, 6000 - 4400);
eq('reçu à 0 MAD (carnet) : la marchandise part, son coût entre en A', EC.creditSalesCostCents, 4000);
eq('ticket offert : coût rangé en perte « offert », hors A', [ER.giftCostCents, ER.wasteCents], [2000, 2000]);
const EL = new Map((ES.losses || []).map((x) => [x.source + ':' + x.reason, x.cents]));
eq('motif « offert » venu des tickets', EL.get('ticket:offert'), 2000);
eq('b ventes nettes', ER.netSalesCents, 41000);
eq('Z = A + pertes', ER.consumptionCents, 1600 + 2000);
ok('sans seuil : pas d’alerte', ES.target === null, ES.target);

/* Le seuil de marge minimum. */
const target = async (body, cookie) => {
  const r = await postTarget({ env, request: new Request('https://kiwi.test/api/cost-variance', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
};
eq('seuil : la caisse ne le fixe pas', (await target({ merchant: EPI, action: 'target', minMarginPct: 60 }, till3)).status, 403);
eq('seuil : un autre compte non plus', (await target({ merchant: EPI, action: 'target', minMarginPct: 60 }, owner)).status, 403);
eq('seuil : 150 % refusé', (await target({ merchant: EPI, action: 'target', minMarginPct: 150 }, owner3)).status, 400);
eq('seuil : du texte refusé', (await target({ merchant: EPI, action: 'target', minMarginPct: 'beaucoup' }, owner3)).status, 400);
eq('seuil : 70 % enregistré', (await target({ merchant: EPI, action: 'target', minMarginPct: 70 }, owner3)).body, { ok: true, minMarginPct: 70 });
let tg = ((await get(`merchant=${EPI}&${RANGE}`, owner3)).body.sites[0] || {}).target || {};
eq('seuil 70 % : plafond de consommation 123 MAD, marge réelle tenue', [tg.thresholdCents, tg.maxConsumptionCents, tg.breached, tg.shortfallCents], [28700, 12300, false, 0]);
await target({ merchant: EPI, action: 'target', minMarginPct: 95 }, owner3);
tg = ((await get(`merchant=${EPI}&${RANGE}`, owner3)).body.sites[0] || {}).target || {};
eq('seuil 95 % : alerte, il manque 15,50 MAD de marge', [tg.breached, tg.shortfallCents, tg.realMarginPct], [true, 41000 * 0.95 - 37400, 91.2]);
eq('seuil : vide l’efface', (await target({ merchant: EPI, action: 'target', minMarginPct: null }, owner3)).body.minMarginPct, null);
eq('seuil effacé : plus d’alerte', ((await get(`merchant=${EPI}&${RANGE}`, owner3)).body.sites[0] || {}).target, null);

/* Transferts en route, chez l'expéditeur seulement. */
move(EPI, 'huile', T(14, 10), -4, 'transfer-out', { cost: 20, refType: 'transfer', refId: 'tr-1' });
move(EPI2, 'huile', T(15, 10), 1, 'transfer-in', { cost: 20, refType: 'transfer', refId: 'tr-1' });
move(EPI, 'huile', T(14, 11), -2, 'transfer-out', { cost: 20, refType: 'transfer', refId: 'tr-2' });
move(EPI2, 'huile', T(15, 11), 2, 'transfer-in', { cost: 20, refType: 'transfer', refId: 'tr-2' });
run(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'stock-transfers',?,1,?)`, EPI, JSON.stringify({ v: 1, list: [
  { id: 't1', from: EPI, to: EPI2, status: 'en-route', lines: [{ qty: 5, received: 0, missing: 0 }] },
  { id: 't2', from: EPI, to: EPI2, status: 'recu', lines: [{ qty: 3, received: 3, missing: 0 }] },
  { id: 't3', from: EPI, to: EPI2, status: 'partiel', lines: [{ qty: 4, received: 1, missing: 1 }] },
] }), now);
const tr = await get(`merchant=${EPI}&${RANGE}&scope=all`, owner3);
const trR = (tr.body.sites.find((x) => x.merchant === EPI) || {}).ratios || {};
const trR2 = (tr.body.sites.find((x) => x.merchant === EPI2) || {}).ratios || {};
eq('en route : 3 L d’huile sur 4 pas arrivés (60 MAD) + 7 pièces boutique', [trR.inTransitCents, trR.inTransitPieces, trR.inTransitCount], [6000, 7, 3]);
eq('le destinataire ne le compte pas une deuxième fois', [trR2.inTransitCents, trR2.inTransitPieces], [0, 0]);
eq('tous les établissements : somme des transferts en route', tr.body.total.ratios.inTransitCents, 6000);

/* Inventaires : les plus récents d'abord, l'inventaire de clôture n'est jamais perdu. */
for (let i = 0; i < 60; i++) countRow(EPI2, 'old-' + i, T(9, 21) - (i + 1) * 3600000, [{ itemId: 'riz', countedQty: 99 }]);
countRow(EPI2, 'open-riz', T(9, 21), [{ itemId: 'riz', countedQty: 10 }]);
countRow(EPI2, 'close-riz', T(16, 22), [{ itemId: 'riz', countedQty: 7 }]);
move(EPI2, 'riz', T(1, 9), 10, 'opening', { cost: 10 });
move(EPI2, 'riz', T(12, 12), -2, 'sale', { cost: 10, refType: 'sale' });
/* Le jeu de test date srv_ts dans le passé (la vraie base l'écrit au présent) :
   l'instantané écrit plus haut ne verrait pas ces lignes. */
sqlite.prepare('DELETE FROM cost_stock_snapshots WHERE merchant = ?').run(EPI2);
const rz = ((await get(`merchant=${EPI2}&${RANGE}`, owner3)).body.sites[0].variance.rows || []).find((x) => x.itemId === 'riz') || {};
eq('62 inventaires : ouverture et clôture retrouvées', [rz.status, rz.opening, rz.closing, rz.closeTs], ['ok', 10, 7, T(16, 22)]);
eq('riz : écart 1 kg = 10 MAD', [rz.actualUse, rz.theoretical, rz.gapCents], [3, 2, 1000]);

/* Instantané du stock : relu, puis complété par les mouvements récents. */
sqlite.prepare('DELETE FROM cost_stock_snapshots WHERE merchant = ?').run(EPI2);
const s1 = (await get(`merchant=${EPI2}&${RANGE}`, owner3)).body.sites[0];
const s2 = (await get(`merchant=${EPI2}&${RANGE}`, owner3)).body.sites[0];
eq('premier calcul : instantané écrit, le second le relit', [s1.coverage.stockSnapshot, s2.coverage.stockSnapshot], ['written', 'read']);
eq('même valeur du stock par l’instantané (riz 8 kg + huile 3 L)', [s1.ratios.stockValueCents, s2.ratios.stockValueCents], [8000 + 6000, 8000 + 6000]);
run(`INSERT INTO inventory_movements (id,merchant,item_id,qty_milli,reason,unit_cost_rate,occurred_ts,srv_ts,created_ts) VALUES ('fresh',?,'riz',5000,'receipt',100000,?,?,?)`, EPI2, Date.now(), Date.now(), Date.now());
const s3 = (await get(`merchant=${EPI2}&${RANGE}`, owner3)).body.sites[0];
sqlite.prepare('DELETE FROM cost_stock_snapshots WHERE merchant = ?').run(EPI2);
const s4 = (await get(`merchant=${EPI2}&${RANGE}`, owner3)).body.sites[0];
eq('un mouvement arrivé après l’instantané compte (+50 MAD), comme un recalcul complet', [s3.ratios.stockValueCents, s4.ratios.stockValueCents], [19000, 19000]);

/* Le détail d'une matière : ses mouvements et ses inventaires, du seul magasin. */
const d = await get(`merchant=${SHOP}&${RANGE}&item=poulet&open=${T(9, 22)}&close=${T(16, 22)}`, owner);
const DI = d.body.item || {};
eq('détail : 200, nom de la fiche', [d.status, DI.name], [200, 'Poulet fermier']);
ok('détail : aucun mouvement de l’autre commerçant (−500 kg)', (DI.movements || []).length > 0 && !(DI.movements || []).some((m) => m.qty === -500 || m.qty === -50), DI.movements);
ok('détail : la perte « vol » y est, avec son montant', (DI.movements || []).some((m) => m.reason === 'loss' && m.lossReason === 'vol' && m.cents === -8000), DI.movements);
eq('détail : les inventaires, le plus récent d’abord', (DI.counts || []).slice(0, 2).map((c) => c.qty), [3, 10]);
eq('détail : un autre compte, 403', (await get(`merchant=${SHOP}&${RANGE}&item=poulet`, stranger)).status, 403);
eq('détail : la caisse, 403', (await get(`merchant=${SHOP}&${RANGE}&item=poulet`, till)).status, 403);

/* ── 8. Export CSV : pas de formule venue d'un nom saisi ─────────────────── */
{
  const vm = await import('node:vm');
  const blobs = [];
  const el = () => ({ click() {}, remove() {}, style: {} });
  let LANG = 'fr';
  const window = { Kiwi: { handlers: {}, toast() {} }, KiwiI18n: { getLang: () => LANG }, KiwiCloudDoc: { currentSlug: () => 'resto-cv' } };
  const rows = [
    { itemId: 'a', name: '=HYPERLINK("http://x","clic")', unit: 'kg', status: 'ok', opening: 1, supply: 0, closing: 2, actualUse: -1, theoretical: 0, waste: 0, gap: -1, gapCents: -2500 },
    { itemId: 'b', name: '+1+1', unit: '@u', status: 'ok', opening: 1, supply: 0, closing: 0, actualUse: 1, theoretical: 0, waste: 0, gap: 1, gapCents: 900 },
    { itemId: 'c', name: '-2+3', unit: '\tkg', status: 'ok', opening: 1, supply: 0, closing: 0, actualUse: 1, theoretical: 1, waste: 0, gap: 0, gapCents: 0 },
    { itemId: 'd', name: '\rcmd', unit: '', status: 'no-count', theoreticalInRange: 2 },
    { itemId: 'e', name: 'Poulet, fermier', unit: 'kg', status: 'ok', opening: 1, supply: 0, closing: 1, actualUse: 0, theoretical: 0, waste: 0, gap: 0, gapCents: 0 },
  ];
  const payload = { merchant: 'resto-cv', scope: 'all', storeCount: 2, canEdit: true, range: { fromDay: '2026-11-10', toDay: '2026-11-16', from: T(10, 5), to: T(17, 5) },
    total: { ratios: { netSalesCents: 100000 }, target: { minMarginPct: 65, realMarginPct: 55.7, breached: true, shortfallCents: 9300, thresholdCents: 65000, maxConsumptionCents: 35000 }, leakCents: 0, netGapCents: 0 },
    sites: [{ merchant: 'resto-cv', name: '@Centre', ratios: {}, coverage: {}, losses: [], variance: { rows, countsFound: true, windows: [] } }] };
  const ctx = {
    window, navigator: { onLine: true }, console, setTimeout: () => 0,
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => ({}), createElement: el, querySelector: () => null, body: { appendChild() {} }, head: { appendChild() {} } },
    fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
    Blob: class { constructor(parts) { blobs.push(parts.join('')); } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Intl,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/pages-pro/cost-variance.js'), 'utf8'), ctx);
  const H = window.Kiwi.handlers;
  H['costvar-scope']({ dataset: { scope: 'all' } });
  const slot = { nodeType: 1, isConnected: true, innerHTML: '' };
  H['costvar-mount'](slot, { real: true });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  H['costvar-csv']();
  const csv = (blobs[0] || '').replace(/^﻿/, '').split('\r\n');
  const parse = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const body = csv.slice(1).map(parse);
  const byName = (prefix) => body.find((r) => r[0].startsWith(prefix)) || [];
  ok('CSV : une ligne par matière', body.length === 5, csv);
  eq('CSV : « =HYPERLINK… » part en texte (apostrophe), jamais en formule', byName("'=HYPERLINK")[0], '\'=HYPERLINK("http://x","clic")');
  eq('CSV : + - @ tabulation retour chariot neutralisés en tête', [byName("'+1")[0], byName("'+1")[1], byName("'-2")[0], byName("'-2")[1], byName("'\r")[0]], ["'+1+1", "'@u", "'-2+3", "'\tkg", "'\rcmd"]);
  eq('CSV : le nom du magasin aussi', byName("'=HYPERLINK")[2], "'@Centre");
  eq('CSV : un écart négatif reste un nombre (pas d’apostrophe)', [byName("'=HYPERLINK")[7], byName("'=HYPERLINK")[10], byName("'=HYPERLINK")[11]], ['-1', '-1', '-25.00']);
  eq('CSV : une virgule dans un nom reste dans sa cellule', byName('Poulet')[0], 'Poulet, fermier');
  /* RTL : dans la phrase d'alerte arabe, le pourcentage est un vrai <bdi dir="ltr">. */
  LANG = 'ar';
  H['costvar-mount'](slot, { real: true });
  const alertHtml = (/<div class="cv-alert bad"[^]*?<\/div>/.exec(slot.innerHTML) || [''])[0];
  ok('alerte arabe : « 55,7 % » et « 65 % » isolés en <bdi dir="ltr">', /<bdi dir="ltr">55[,٫.]7 %<\/bdi>/.test(alertHtml) && /<bdi dir="ltr">65[,٫.]0 %<\/bdi>/.test(alertHtml), alertHtml);
  ok('aucun isolat Unicode ne reste dans le HTML posé', !/[\u2066\u2069]/.test(slot.innerHTML));
  ok('CSV : aucune cellule ne commence par un déclencheur de formule', body.every((r) => r.slice(0, 4).every((x) => !/^[=+\-@\t\r]/.test(x))), body);
}

/* ── 9. Livraisons, retours sans identifiant, remboursements sans panier ──── */
{
  /* La sonde du juge (cv-double.mjs), telle quelle : une robe à 120 MAD de
     coût vendue en livraison comptait 245 MAD (120 au reçu à 0 MAD + 120 à
     l'encaissement + 5 d'un autre « Article » prêté à un retour de 400 MAD). */
  const D = 864e5;
  run(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-x','o@x.t','Shop X','s','h',?,'active')`, now);
  run(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES ('shop-x','{}','plus','boutique','acc-x','Shop X','active',?)`, now);
  const RL = JSON.stringify([{ n: 'Robe', q: 1, t: 300, k: 120, i: 'robe' }]);
  run(`INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines) VALUES ('px-s1','shop-x',0,0,'consignment',?,?)`, now - 2 * D, RL);
  run(`INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines,channel) VALUES ('px-c1','shop-x',300,30000,'cash',?,?,'delivery')`, now - D, RL);
  run(`INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines,channel) VALUES ('px-s2','shop-x',50,5000,'cash',?,?,NULL)`, now - 3 * D, JSON.stringify([{ n: 'Article', q: 1, t: 50, k: 5 }]));
  run(`INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines,channel) VALUES ('px-r1','shop-x',-400,-40000,'credit',?,?,'refund')`, now - D, JSON.stringify([{ qty: 1, amountCents: 40000 }]));
  const ownerX = auth.sessionCookie(await auth.makeSession('acc-x', SECRET)).split(';')[0];
  const px = await get('merchant=shop-x&days=7', ownerX);
  const PR = px.body.sites[0].ratios, PC = px.body.sites[0].coverage;
  eq('sonde : coût vendu 125 MAD (robe une fois + article), plus 245', PR.soldCostCents, 12000 + 500);
  eq('sonde : le retour de 400 MAD sans identifiant n’emprunte aucun coût', [PR.returnsCostCents, PC.uncostedReturnCents, PC.uncostedReturnLines], [0, 40000, 1]);

  /* Une boutique et ses livraisons, une par cas. */
  const BTQ = 'btq-cv';
  run(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-4','btq@cv.ma','Btq CV','s','h',?,'active')`, now);
  run(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,'{}','plus','boutique','acc-4','Btq CV','active',?)`, BTQ, now);
  const owner4 = auth.sessionCookie(await auth.makeSession('acc-4', SECRET)).split(';')[0];
  const ins = (id, cents, method, ts, lines, channel = null) => run(
    `INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines,channel) VALUES (?,?,?,?,?,?,?,?)`,
    id, BTQ, cents / 100, cents, method, ts, lines == null ? null : JSON.stringify(lines), channel);
  const audit = (saleId, action, ts, impact) => run(
    `INSERT INTO sale_audit (merchant,sale_id,action,reason,amount,amount_cents,method,sale_ts,impact,ts) VALUES (?,?,?,'test',0,0,'delivery',?,?,?)`,
    BTQ, saleId, action, ts, JSON.stringify(impact || {}), ts);
  const ROBE = { n: 'Robe', q: 1, t: 300, k: 120, i: 'robe' };
  ins('b-big', 100000, 'cash', T(11, 9), [{ n: 'Manteau', q: 1, t: 1000, k: 400, i: 'manteau' }]);
  // livrée puis encaissée : le panier voyage avec l'encaissement (receivables.js)
  ins('b-d1', 0, 'delivery', T(11, 10), [ROBE], 'delivery');
  run(`INSERT INTO delivery_collections (merchant,collection_sale_id,sale_id,method,amount_cents,ts) VALUES (?,'b-c1','b-d1','cash',30000,?)`, BTQ, T(12, 10));
  ins('b-c1', 30000, 'cash', T(12, 10), [ROBE], 'delivery');
  // livrée, pas encore encaissée (méthode « consignment » comme la sonde)
  ins('b-d2', 0, 'consignment', T(13, 10), [{ n: 'Jupe', q: 2, t: 200, k: 50, i: 'jupe' }]);
  // revenue chez nous par le livreur
  ins('b-d3', 0, 'delivery', T(13, 11), [ROBE], 'delivery');
  audit('b-d3', 'delivery-return', T(14, 9), { lines: [{ i: 0, q: 1 }] });
  // une sur deux revenue, l'autre toujours dehors
  ins('b-d5', 0, 'delivery', T(13, 12), [{ ...ROBE, q: 2, t: 600 }], 'delivery');
  audit('b-d5', 'delivery-return', T(14, 10), { lines: [{ i: 0, q: 1 }] });
  // passée en perte par le propriétaire
  ins('b-d4', 0, 'delivery', T(14, 10), [{ n: 'Sac', q: 1, t: 150, k: 70, i: 'sac' }], 'delivery');
  audit('b-d4', 'delivery-writeoff', T(15, 10));
  // remboursement de caisse sans panier (sale/refund.js)
  ins('b-rb', -2500, 'cash', T(12, 12), null);
  // pertes déclarées, avec qui les a déclarées ; une annulation revient à l'auteur
  const loss = (id, ts, qty, why, actor, extra = {}) => run(
    `INSERT INTO inventory_movements (id,merchant,item_id,qty_milli,reason,unit_cost_rate,ref_type,ref_id,occurred_ts,srv_ts,reversal_of,meta,actor,created_ts)
     VALUES (?,?,?,?,?,?,'waste','',?,?,?,?,?,?)`, id, BTQ, 'robe', Math.round(qty * 1000), extra.reason || 'loss', 1200000, ts, ts, extra.reversalOf || '',
    why ? JSON.stringify({ wasteReason: why }) : null, actor, ts);
  loss('bl-1', T(14, 12), -1, 'vol', 'Karim');
  loss('bl-2', T(14, 13), -1, 'vol', 'Karim');
  loss('bl-2r', T(14, 14), 1, '', 'Patron', { reason: 'manual', reversalOf: 'bl-2' });
  loss('bl-3', T(15, 12), -0.5, 'casse', 'Nadia');
  const bq = await get(`merchant=${BTQ}&${RANGE}`, owner4);
  const BR = bq.body.sites[0].ratios, BC = bq.body.sites[0].coverage;
  const BL = bq.body.sites[0].losses || [];
  eq('livrée puis encaissée : la robe compte une fois (à l’encaissement), le reçu à 0 MAD jamais', BR.soldCostCents, 40000 + 12000);
  eq('livrées pas encore encaissées : chez le livreur, hors du coût vendu (jupes 100 MAD + 1 robe sur 2)', [BR.atCourierCents, BC.atCourierCount], [10000 + 12000, 2]);
  eq('revenue par le livreur : ni vendue, ni chez le livreur, ni perdue', [BR.lostDeliveryCents, BC.lostDeliveryCount], [7000, 1]);
  eq('passée en perte : motif « perdu », source livraison', (BL.find((x) => x.source === 'livraison') || {}).cents, 7000);
  eq('pertes v = déclarées + livraison perdue', BR.wasteCents, 12000 + 6000 + 7000);
  eq('remboursement sans panier : 25 MAD signalés, coût non déduit', [BR.refundUndetailedCents, BR.returnsCostCents], [2500, 0]);
  const vol = BL.find((x) => x.source === 'declared' && x.reason === 'vol') || {};
  eq('vol déclaré : 120 MAD, par Karim (son annulation lui revient)', [vol.cents, vol.by], [12000, [{ name: 'Karim', cents: 12000 }]]);
  eq('casse déclarée par Nadia', (BL.find((x) => x.reason === 'casse') || {}).by, [{ name: 'Nadia', cents: 6000 }]);
}

/* L'index qui garde les sommes sur la période. */
const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT SUM(qty_milli) FROM inventory_movements WHERE merchant = ? AND occurred_ts >= ? AND occurred_ts < ?`).all(SHOP, 1, 2);
ok('les sommes du registre passent par l’index (merchant, occurred_ts)', plan.some((r) => /idx_inventory_movements_merchant_time/.test(r.detail)), plan);

console.log(`\n${fail ? '✗' : '✓'} cost-variance : ${pass} ok, ${fail} en échec`);
process.exit(fail ? 1 : 0);
