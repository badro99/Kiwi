/* Chiffre d'affaires « à la vente » (merchant_config.features.revenueAtSale).
   La Maison en Vogue vient de caisse.ma, qui compte le ticket entier le jour
   de la vente (espèces, carte, avoir, compte client) moins les retours, et ne
   compte pas une seconde fois le règlement d'un compte client. Sans le
   réglage, rien ne change : une vente vaut l'argent reçu.
   Couvre les tuiles (sales-history.js), le résumé serveur (sales-summary.js),
   le rapport journalier (KiwiDayReportVat.sale, z-reconciliation.js) et l'avoir
   émis pour un retour (store-credits.js). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { summarize } from '../functions/api/sales-summary.js';
import { onRequestPost } from '../functions/api/store-credits.js';
import { managerRefundProof, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const T0 = Date.UTC(2026, 10, 18, 10);   // 18 nov. 2026, 11:00 à Casablanca
const day = (h) => T0 + h * 3600000;

/* Une journée chez Vogue, en lignes du feed (KiwiSales / KiwiRefunds). */
const sales = [
  { ts: day(0), amount: 500, method: 'cash', label: 'Vente' },
  { ts: day(1), amount: 300, method: 'card', label: 'Vente' },
  { ts: day(2), amount: 0, method: 'compte', label: 'Vente', paymentParts: [{ method: 'compte', amountCents: 40000 }] },
  { ts: day(3), amount: 100, method: 'cash', label: 'Vente', paymentParts: [{ method: 'credit', amountCents: 39000 }, { method: 'cash', amountCents: 10000 }] },
  { ts: day(4), amount: 200, method: 'cash', label: 'Règlement acompte · Mme Tazi', paymentParts: [{ method: 'cash', amountCents: 20000 }] },
];
const refunds = [{ ts: day(5), amount: 850, method: 'credit', label: 'Retour en avoir' }];

function salesMath(features) {
  const w = { KiwiVenue: { revenueAtSale: () => !!(features && features.revenueAtSale === true) }, KiwiDayReportVat: {} };
  const ctx = vm.createContext({ window: w });
  vm.runInContext(fs.readFileSync(new URL('../assets/sales-history.js', import.meta.url), 'utf8'), ctx);
  return w;
}

/* 1 · Les tuiles du tableau de bord. */
{
  const off = salesMath(null).KiwiSalesMath.statsFromSales(sales, refunds, T0 - 1, T0 + 86400000);
  assert.equal(off.revenue, 500 + 300 + 0 + 100 + 200 - 850, 'sans le réglage : l’argent reçu, comme toujours');
  assert.equal(off.count, 5);

  const w = salesMath({ revenueAtSale: true });
  const M = w.KiwiSalesMath;
  const on = M.statsFromSales(sales, refunds, T0 - 1, T0 + 86400000);
  assert.equal(on.revenue, 500 + 300 + 400 + 490 - 850, 'à la vente : le ticket entier, moins le retour');
  assert.equal(on.count, 4, 'le règlement d’un compte client n’est pas une vente');
  assert.equal(on.cash, 600, 'les espèces restent ce qui est entré au tiroir pour les ventes');
  assert.equal(on.card, 300);
  assert.equal(on.collected, 900, 'encaissé = espèces + carte des ventes');
  assert.equal(on.receivable, 400 + 390, 'compte client et avoir ne sont pas de l’argent reçu');
  assert.equal(on.refunds, 0, 'un retour en avoir ne gonfle pas le taux de remboursement');
  assert.equal(M.saleValue(sales[2]), 400);
  assert.equal(M.saleValue(sales[4]), 0);
}

/* 2 · Le résumé serveur (/api/sales-summary) suit la même règle. */
{
  const rows = sales.map((s) => ({ ts: s.ts, amount: s.amount, amount_cents: Math.round(s.amount * 100), method: s.method,
    label: s.label, payment_parts: s.paymentParts ? JSON.stringify(s.paymentParts) : null }))
    .concat(refunds.map((r) => ({ ts: r.ts, amount: -r.amount, amount_cents: -r.amount * 100, method: r.method, label: r.label,
      channel: 'refund', payment_parts: JSON.stringify([{ method: 'credit', amountCents: r.amount * 100 }]) })));
  const net = (atSale) => { const out = summarize(rows, T0 - 1, T0 + 86400000, 5, 'Africa/Casablanca', atSale); return out.days.reduce((n, d) => n + (d.cents - d.refundCents), 0); };
  assert.equal(net(false), (500 + 300 + 0 + 100 + 200 - 850) * 100, 'serveur, sans le réglage');
  assert.equal(net(true), (500 + 300 + 400 + 490 - 850) * 100, 'serveur, à la vente');
}

/* 3 · Le rapport journalier : le détail, et les chiffres de tête qui suivent. */
{
  const src = fs.readFileSync(new URL('../assets/z-reconciliation.js', import.meta.url), 'utf8');
  const part = src.slice(src.lastIndexOf('/* ═', src.indexOf('KiwiDayReportVat.sale')));
  const w = salesMath({ revenueAtSale: true });
  vm.runInContext(part, vm.createContext({ window: w }));
  const S = w.KiwiDayReportVat.sale;
  /* normSale (day-report.js) : amount = argent reçu, parts compte/avoir à part. */
  const rows = [
    { amount: 500, method: 'cash', label: 'Vente', creditCents: 0, compteCents: 0 },
    { amount: 300, method: 'card', label: 'Vente', creditCents: 0, compteCents: 0 },
    { amount: 0, method: 'compte', label: 'Vente', creditCents: 0, compteCents: 40000 },
    { amount: 100, method: 'cash', label: 'Vente', creditCents: 39000, compteCents: 0 },
    { amount: 200, method: 'cash', label: 'Règlement acompte · Mme Tazi', creditCents: 0, compteCents: 0 },
    { amount: -850, method: 'credit', kind: 'refund', label: 'Retour en avoir', creditCents: 0, compteCents: 0 },
  ];
  const report = () => ({ gross: 1100, net: 250, txns: 5, basket: 220, refunds: { count: 1, amount: 850 },
    methods: { cash: 800, card: 300, credit: -850 }, receivable: 0 });
  const untouched = S.apply(report(), rows, { source: 'caisse' }, true);
  assert.equal(untouched.net, 250, 'le Z de la caisse ne change pas : son journal ne porte pas les comptes clients');
  assert.equal(untouched.sale, undefined);
  const r = S.apply(report(), rows, { source: 'dashboard' }, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.sale)), { sold: 1690, paid: 900, avoir: 390, compte: 400, count: 4,
    returnsAvoir: { count: 1, amount: 850 }, returnsOther: { count: 0, amount: 0 },
    settlements: { count: 1, amount: 200 }, ca: 840 });
  assert.equal(r.gross, 1690); assert.equal(r.net, 840); assert.equal(r.txns, 4);
  assert.equal(r.methods.credit, undefined, 'un retour en avoir n’apparaît pas dans les moyens de paiement');
  assert.equal(r.methods.cash, 800, 'le tiroir garde le règlement du compte client');
  assert.equal(r.receivable, 400);
  const ui = { LANG: () => 'fr', esc: (x) => String(x), money: (v) => v.toFixed(2), CUR: () => 'MAD', row: (a, b) => a + ' = ' + b + '\n' };
  const html = S.html(r, ui);
  for (const label of ['Encaissé (espèces, carte) = 900.00', 'Réglé en avoir = 390.00', 'Vendu sur compte client = 400.00',
    'Retours en avoir (1) = − 850.00', 'Chiffre d’affaires = 840.00', 'Règlements de comptes clients (1) = 200.00'])
    assert.ok(html.includes(label), 'le rapport détaille : ' + label);
  assert.ok(!/—/.test(html), 'pas de tiret cadratin');
  assert.equal(S.apply(report(), rows, { source: 'dashboard' }, false).net, 250, 'sans le réglage, rien ne bouge');
}

/* 4 · Un retour en avoir entre au journal comme une vente négative payée en avoir. */
{
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) { let args = []; const st = { bind(...v) { args = v; return st; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; }, all() { return { results: sqlite.prepare(sql).all(...args) }; } }; return st; },
    batch(sts) { sqlite.exec('BEGIN IMMEDIATE'); try { const o = sts.map((s) => s.run()); sqlite.exec('COMMIT'); return o; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  const SECRET = 'at-sale-secret', env = { DB, AUTH_SECRET: SECRET };
  for (const [m, features] of [['vogue-test', '{"revenueAtSale":true}'], ['plain-test', '{}']]) {
    sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts) VALUES (?, ?, ?, 'maison', 'active', 0, ?)`).run(m, features, m, Date.now());
    sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines) VALUES (?, ?, 100, 10000, 'card', 'Vente', '0042', ?, NULL, '[]')`).run('sale-' + m, m, Date.now());
  }
  async function issue(m) {
    const id = 'issue:return:' + m;
    const approval = await managerRefundProof(SECRET, { merchant: m, staffId: 'staff-manager', staffName: 'Sara', staffRole: 'Manager',
      refundId: id, originalSaleId: 'sale-' + m, amountCents: 6000, refundMethod: 'avoir' });
    const res = await onRequestPost({ request: new Request('https://kiwi.test/api/store-credits', { method: 'POST',
      headers: { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, m)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: m, action: 'issue', id, originalSaleId: 'sale-' + m, originalRef: '0042', amountCents: 6000,
        customerId: 'client-1', customerName: 'Cliente', reason: 'Retour', lines: [{ n: 'Robe', q: 1, t: 60 }], approval }) }), env });
    assert.equal(res.status, 200, m + ': avoir émis');
    return sqlite.prepare(`SELECT * FROM sales WHERE merchant = ? AND channel = 'refund'`).all(m);
  }
  const rows = await issue('vogue-test');
  assert.equal(rows.length, 1, 'à la vente : le retour entre au journal');
  assert.equal(rows[0].amount_cents, -6000);
  assert.equal(rows[0].method, 'credit', 'payé en avoir : le tiroir n’est pas touché');
  assert.deepEqual(JSON.parse(rows[0].payment_parts), [{ method: 'credit', amountCents: 6000 }]);
  assert.equal(rows[0].ref, '0042');
  assert.equal(JSON.parse(rows[0].lines)[0].n, 'Robe');
  assert.equal((await issue('plain-test')).length, 0, 'sans le réglage, un avoir n’écrit aucune vente');
}

console.log('✓ revenue-at-sale-test: tiles, server summary, day report detail and returns to credit note count at sale');
