#!/usr/bin/env node
/* Kiwi · exchange-price-cut-test · « La cliente paie » under an exchange difference.
 *
 * Owner, 25 Nov 2026 (photo of the till): a customer returned a 181 MAD
 * trouser for a 350 piece, the till asked 169 and the shop gave it for 150.
 * There was no way to say so. assets/pos-boutique/exch-cut.js now puts
 * « La cliente paie » under the difference; checkout.js › openExchSummary
 * charges exactly that, and the 19 MAD gap is a discount by the seller on duty,
 * like a sale's (no code since 23 Nov, her name and the time on the ticket).
 * Held here, with the shipped till code (retail-money-harness):
 *   · the payment sheet asks the lowered amount, not the difference;
 *   · the exchange ticket's total is what was paid, its discount the gap,
 *     its remiseAuth the seller and the amount;
 *   · the sale sent to the server keeps gross − discount = amount received;
 *   · nothing typed (or a figure not below the difference) charges it whole;
 *   · cutPay reads « 150 », « 150,5 » and refuses 0, the difference itself,
 *     anything above, and text.
 *   node tools/exchange-price-cut-test.mjs */
import assert from 'node:assert/strict';
import { world, load } from './retail-money-harness.cjs';
import { cutPay, cutFields } from '../assets/pos-boutique/exch-cut.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log('  ok ' + checks + ' - ' + name); };

async function exchange(pay) {
  const w = world('boutique');
  const c = w.c;
  load(c, 'assets/pos-boutique.js', ['lineDeal', 'promoFor', 'stockOf']);
  c.P = { old: { id: 'old', name: 'PAN00106/00', price: 181, sizes: { S: 1 } }, new: { id: 'new', name: 'ESP/0014', price: 350, sizes: { TU: 3 } } };
  c.SALES = [{ id: '2025', total: 181, lines: [{ pid: 'old', unit: 181, qty: 1, size: 'S' }] }];
  c.state = { exchange: { saleId: '2025', idx: 0 } };
  c.KiwiPromos = { priceFor: () => null };
  const posted = [];
  Object.assign(c, { firstName: (s) => s, variantStock: () => 1, canHoldStock: () => true, holdStock: () => false, persistStock: () => true, showStockIssue() {}, nextStandaloneTicketNumber: async () => '2031', stableCreditIssueId: () => 'return', refreshOps() {}, openVoucher() {}, creditErrorDetail: (e) => String(e) });
  const no = () => {};
  Object.assign(c, { stockAdd: no, markLineReturned: no, recordReturn: no, nextExchange: () => null, queueIfOffline: no, renderExchNote: no, renderGrid: no, renderBadges: no,
    bqPaymentMethod: () => 'cash', bqPaymentParts: (parts) => parts, headSubVente: () => '' });
  const $0 = c.$; c.$ = (sel, r) => (sel === '#bq-today' ? { textContent: '' } : $0(sel, r));
  c.KiwiLive = Object.assign(c.KiwiLive || {}, { isOn: () => true });
  c.bqPost = (rec, payload) => posted.push(payload);
  let sheet = null;
  c.openPay = (opts) => { sheet = opts; };
  c.openExchSummary('new', 'TU', '');
  assert.ok(c.__exchCut, 'the exchange sheet mounts « La cliente paie »');
  assert.equal(c.__exchCut.diff, 169);
  if (pay != null) c.__exchCut.onPay(pay);
  w.click('#bq-exch-go');
  await flush();
  assert.ok(sheet, 'the payment sheet opens');
  const done = sheet.onPaid([{ m: 'espèces', amount: sheet.amount }]);
  return { sheet, rec: done && done.sale, posted, line: done && done.line };
}

await check('150 typed: the payment sheet asks 150, not 169', async () => {
  const r = await exchange(150);
  assert.equal(r.sheet.amount, 150);
  assert.equal(r.sheet.subtotal, 150);
  assert.match(r.sheet.lines[0].name, /remise 19/);
});

await check('the exchange ticket keeps 150 paid, a 19 MAD discount and who gave it', async () => {
  const r = await exchange(150);
  assert.equal(r.rec.total, 150);
  assert.equal(r.rec.lines[0].unit, 150);
  assert.equal(r.rec.discount, 19);
  assert.equal(r.rec.remiseAuth.by, 'Test');
  assert.equal(r.rec.remiseAuth.mode, 'mad');
  assert.equal(r.rec.remiseAuth.amount, 19);
  assert.match(r.line, /différence 150/);
});

await check('the server receives 150 with gross 169 and a 19 MAD commercial discount', async () => {
  const r = await exchange(150);
  assert.equal(r.posted.length, 1);
  const p = r.posted[0];
  assert.equal(p.amount, 150);
  assert.equal(p.ticketAmountCents, 15000);
  assert.equal(p.grossAmountCents, 16900);
  assert.equal(p.discountAmountCents, 1900);
  assert.equal(p.discountReason, 'commercial');
  assert.equal(p.grossAmountCents - p.discountAmountCents, Math.round(p.amount * 100), 'gross − discount = amount received');
  assert.equal(p.lines[0].total, 150);
  assert.equal(p.agreedMaxPercent, 6, '19 off a 350 piece is 5,4 %, sent as 6 % like a negotiated sale price');
});

await check('a real till sends the signed proof of the seller on duty; a demo till sends none', async () => {
  assert.deepEqual(cutFields({ diff: 169, pay: 150, base: 350, real: false }), { agreedMaxPercent: 6 });
  globalThis.window = { KiwiStaff: { sellerProof: 'proof-abc' } };
  try {
    assert.deepEqual(cutFields({ diff: 169, pay: 150, base: 350, real: true }), { agreedMaxPercent: 6, seller: { proof: 'proof-abc' } });
    assert.deepEqual(cutFields({ diff: 169, pay: 169, base: 350, real: true }), {}, 'nothing lowered, nothing sent');
  } finally { delete globalThis.window; }
});

await check('nothing lowered: the whole difference, no discount on the ticket or the server', async () => {
  const r = await exchange(null);
  assert.equal(r.sheet.amount, 169);
  assert.equal(r.rec.total, 169);
  assert.equal(r.rec.discount, undefined);
  assert.equal(r.rec.remiseAuth, undefined);
  assert.equal(r.posted[0].ticketAmountCents, 16900);
  assert.equal(r.posted[0].discountAmountCents, undefined);
  assert.equal(r.posted[0].agreedMaxPercent, undefined);
});

await check('cutPay reads what the seller types and refuses what lowers nothing', async () => {
  assert.equal(cutPay(169, '150'), 150);
  assert.equal(cutPay(169, ' 150,5 '), 150.5);
  assert.equal(cutPay(169, '168.99'), 168.99);
  for (const bad of ['', '0', '169', '200', 'abc', '-5', '150,555']) assert.equal(cutPay(169, bad), null, JSON.stringify(bad));
});

console.log(`\n${checks} exchange price cut checks passed`);
