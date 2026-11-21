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
 *      compte non ; « tous les établissements » = les magasins du compte. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { onRequestGet } = await imp('functions/api/cost-variance.js');
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

/* L'index qui garde les sommes sur la période. */
const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT SUM(qty_milli) FROM inventory_movements WHERE merchant = ? AND occurred_ts >= ? AND occurred_ts < ?`).all(SHOP, 1, 2);
ok('les sommes du registre passent par l’index (merchant, occurred_ts)', plan.some((r) => /idx_inventory_movements_merchant_time/.test(r.detail)), plan);

console.log(`\n${fail ? '✗' : '✓'} cost-variance : ${pass} ok, ${fail} en échec`);
process.exit(fail ? 1 : 0);
