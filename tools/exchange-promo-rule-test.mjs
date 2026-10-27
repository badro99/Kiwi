#!/usr/bin/env node
/* Wave 15 · lane G · l'échange boutique applique la règle de promotion d'une vente.
 * Le code de caisse (openExchSummary, lineDeal, promoFor) est chargé depuis les
 * fichiers livrés ; seuls le navigateur et le catalogue sont des doubles. */
import assert from 'node:assert/strict';
import { world, load } from './retail-money-harness.cjs';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const cents = (x) => Math.round(x * 100);
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log('  ok ' + checks + ' - ' + name); };

/** @param {{ live: any, oldPaid?: number, newPrice?: number }} o */
async function exchange(o) {
  const w = world('boutique');
  const c = w.c;
  // La vraie règle : lineDeal, promoFor et stockOf viennent de pos-boutique.js.
  load(c, 'assets/pos-boutique.js', ['lineDeal', 'promoFor', 'stockOf']);
  const oldPaid = o.oldPaid ?? 500;
  const newPrice = o.newPrice ?? 600;
  c.P = { old: { id: 'old', name: 'Ancien', price: oldPaid, sizes: { M: 1 } }, new: { id: 'new', name: 'Nouveau', price: newPrice, sizes: { M: 3 } } };
  c.SALES = [{ id: 'original', total: oldPaid, lines: [{ pid: 'old', unit: oldPaid, qty: 1, size: 'M' }] }];
  c.state = { exchange: { saleId: 'original', idx: 0 } };
  c.KiwiPromos = { priceFor: (p) => (o.live && p.id === 'new' ? o.live : null) };
  Object.assign(c, { firstName: (s) => s, variantStock: () => 1, canHoldStock: () => true, holdStock: () => false, persistStock: () => false, showStockIssue() {}, nextStandaloneTicketNumber: async () => 'next', stableCreditIssueId: () => 'return', refreshOps() {}, openVoucher() {}, creditErrorDetail: (e) => String(e) });
  const requests = [];
  c.openPay = (opts) => requests.push(cents(opts.amount));
  c.issueAvoir = async (amount) => { requests.push(-cents(amount)); return { code: 'AV' }; };
  c.openExchSummary('new', 'M', '');
  const shown = w.exchange.innerHTML;
  w.click('#bq-exch-go');
  await flush();
  return { requests, shown };
}

const promo = (price, was = 600) => ({ price, was, badge: '-20 %', promo: { id: 'soldes', name: 'Soldes' } });

await check('without a promotion the exchange still charges the shelf price difference', async () => {
  const r = await exchange({ live: null });
  assert.deepEqual(r.requests, [10000]);
});

await check('a live promotion on the replacement lowers the difference, as it would on a sale', async () => {
  const r = await exchange({ live: promo(520) });
  assert.deepEqual(r.requests, [2000], 'difference = 520 - 500, not 600 - 500');
  assert.match(r.shown, /\+520/, 'the summary shows the promoted price');
});

await check('a promotion that brings the replacement under the paid price turns into a credit note', async () => {
  const r = await exchange({ live: promo(450) });
  assert.deepEqual(r.requests, [-5000], 'avoir of 50, not a 100 charge');
});

await check('a promotion that is not cheaper than the shelf price changes nothing', async () => {
  const r = await exchange({ live: promo(700) });
  assert.deepEqual(r.requests, [10000]);
});

await check('the promoted price keeps its centimes', async () => {
  const r = await exchange({ live: promo(519.5) });
  assert.deepEqual(r.requests, [1950]);
});

console.log(`\n${checks} exchange promo checks passed`);
