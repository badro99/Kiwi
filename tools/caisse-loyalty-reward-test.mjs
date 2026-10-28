#!/usr/bin/env node
/* The restaurant till gives the loyalty reward (assets/caisse-loyalty-reward.js).
 *
 * Before: the till credited points and said « récompense atteinte », and the
 * card never reset (Amira Cafe, 27 Oct 2026: 529 points for a 300-point
 * reward, no reward ever recorded). Each case runs the shipped file in a vm
 * against a stub of the till's shared globals and a stub client book. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(root, 'assets/caisse-loyalty-reward.js'), 'utf8');

function till({ cfg, rec, cart = [], tables = {}, mode = 'vrap', selectedId = null, reserve = 'accepted', discount = null } = {}) {
  const calls = { redeem: [], reserve: [], toasts: [] };
  const btn = { hidden: true, attrs: {}, setAttribute(k, v) { btn.attrs[k] = v; }, classes: new Set(), classList: { toggle(c, on) { on ? btn.classes.add(c) : btn.classes.delete(c); } }, addEventListener() {} };
  const lab = { textContent: '' };
  const book = {
    loyaltyOn: () => true,
    config: () => cfg,
    get: (id) => (id === rec.id ? rec : null),
    progress: (r, c) => c.model === 'amount' ? (r.points || 0) / c.amount.threshold : (r.stamps || 0) / ((c.product || c.visit).target),
    redemptionRef: (id) => 'redemption:' + id + ':1',
    reserveRedemption: (id, b, ev) => { calls.reserve.push(ev); return Promise.resolve({ ref: ev.ref, accepted: reserve === 'accepted', refused: reserve === 'refused' }); },
    redeem: (id, b, r) => { calls.redeem.push({ id, r }); },
    bookId: () => 'amira-cafe',
  };
  const ctx = {
    console, Promise, setTimeout, clearTimeout,
    navigator: { onLine: true },
    document: { readyState: 'complete', getElementById: (id) => (id === 'rp-reward' ? btn : id === 'rp-reward-label' ? lab : null), addEventListener() {} },
    KiwiClients: book,
    mode, cart, tables, selectedId, vrapDiscount: discount,
    saleClient: { id: rec.id, name: rec.name, ctx: 'note' },
    currentCashier: { id: 'staff-1' },
    saleContextKey: () => 'note',
    clientsOn: () => true,
    toast: (m, s) => calls.toasts.push(m + (s ? ' | ' + s : '')),
    renderCart() {}, renderRightPanel() {}, refreshTableNode() {},
    generateOrder: (id, t) => t.lines,
  };
  ctx.currentOrder = () => ({ setDiscount(d) { ctx.vrapDiscount = d ? JSON.parse(JSON.stringify(d)) : null; } });
  ctx.tableSettlement = () => ({ project(t, patch, removed = []) { Object.assign(t, patch); removed.forEach((k) => delete t[k]); } });
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'caisse-loyalty-reward.js' });
  return { ctx, calls, btn, lab, R: ctx.KiwiSaleReward };
}

const PTS = { model: 'amount', amount: { perMad: 1, threshold: 300, reward: '−10 %' } };
const CAFE = { model: 'product', product: { item: 'Café', target: 10, reward: '1 offert' } };
const ready = { id: 'c1', name: 'Test', points: 529 };
let n = 0;
const J = (v) => JSON.parse(JSON.stringify(v));
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

await test('a full card shows « Récompense prête » and applies −10 % as a loyalty discount', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  t.R.paint();
  assert.equal(t.btn.hidden, false);
  assert.match(t.lab.textContent, /Récompense prête · −10 %/);
  t.R.toggle();
  const d = t.ctx.vrapDiscount;
  assert.equal(d.kind, 'pct'); assert.equal(d.value, 10); assert.equal(d.amount, 18);
  assert.equal(d.reason, 'Fidélité client'); assert.equal(d.reward.clientId, 'c1'); assert.equal(d.accounted, false);
  assert.ok(t.btn.classes.has('is-on'));
  assert.equal(t.btn.attrs['aria-pressed'], 'true');
});

await test('cash confirm reserves on the server, the recorded sale burns the card once', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  t.R.toggle();
  assert.equal(await t.R.gate('cash'), true);
  assert.equal(t.calls.reserve.length, 1);
  t.R.settle('c1');
  assert.deepEqual(J(t.calls.redeem), [{ id: 'c1', r: { ref: 'redemption:c1:1', accepted: true } }]);
  t.R.settle('c1');
  assert.equal(t.calls.redeem.length, 1);
});

await test('refused at a cash confirm: the reward comes off and the payment stops', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }], reserve: 'refused' });
  t.R.toggle();
  assert.equal(await t.R.gate('cash'), false);
  assert.equal(t.ctx.vrapDiscount, null);
  t.R.settle('c1');
  assert.equal(t.calls.redeem.length, 0);
});

await test('a card already approved is never blocked; offline still queues the redemption', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }], reserve: 'refused' });
  t.R.toggle();
  assert.equal(await t.R.gate('card'), true);
  const o = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  o.ctx.navigator.onLine = false;
  o.R.toggle();
  assert.equal(await o.R.gate('cash'), true);
  assert.equal(o.calls.reserve.length, 0);
  o.R.settle('c1');
  assert.deepEqual(J(o.calls.redeem), [{ id: 'c1', r: { ref: 'redemption:c1:1' } }]);
});

await test('the paid sale detaches its client before the card burns, online and offline', async () => {
  for (const online of [true, false]) {
    const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
    t.ctx.navigator.onLine = online;
    t.R.toggle();
    assert.equal(await t.R.gate('cash'), true);
    // creditSaleToClient: « une note = un passage », then the book repaints.
    t.ctx.saleClient = null;
    t.R.sync();
    assert.equal(t.ctx.vrapDiscount.amount, 18, 'the recorded sale keeps its reward');
    t.R.settle('c1');
    assert.deepEqual(J(t.calls.redeem), [{ id: 'c1', r: online ? { ref: 'redemption:c1:1', accepted: true } : { ref: 'redemption:c1:1' } }]);
  }
});

await test('backing out of the payment burns nothing', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  t.R.toggle();
  t.R.settle('c1');
  assert.equal(t.calls.redeem.length, 0);
  assert.equal(t.calls.reserve.length, 0);
});

await test('a card not full yet gives nothing', async () => {
  const t = till({ cfg: PTS, rec: { id: 'c1', name: 'Test', points: 120 }, cart: [{ name: 'Tajine', price: 90, qty: 1 }] });
  t.R.paint();
  assert.equal(t.btn.hidden, true);
  t.R.toggle();
  assert.equal(t.ctx.vrapDiscount, null);
});

await test('« 1 offert » on a product card takes one unit of that product, and asks for it when absent', async () => {
  const rec = { id: 'c1', name: 'Test', stamps: 10 };
  const t = till({ cfg: CAFE, rec, cart: [{ name: 'Tajine', price: 90, qty: 1 }] });
  t.R.toggle();
  assert.equal(t.ctx.vrapDiscount, null);
  assert.ok(t.calls.toasts.some((m) => /article de la récompense/.test(m)));
  const c = till({ cfg: CAFE, rec, cart: [{ name: 'Tajine', price: 90, qty: 1 }, { name: 'Café crème', price: 15, qty: 2 }] });
  c.R.toggle();
  assert.equal(c.ctx.vrapDiscount.kind, 'amount');
  assert.equal(c.ctx.vrapDiscount.amount, 15);
});

await test('detaching the client takes the reward off the note', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  t.R.toggle();
  t.ctx.saleClient = null;
  t.R.sync();
  assert.equal(t.ctx.vrapDiscount, null);
});

await test('a manager discount already on the note is never replaced', async () => {
  const manager = { kind: 'pct', value: 5, reason: 'Geste commercial', accounted: false };
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }], discount: manager });
  t.R.toggle();
  assert.equal(t.ctx.vrapDiscount.reason, 'Geste commercial');
});

await test('a table note carries the reward on the table', async () => {
  const tables = { T4: { lines: [{ name: 'Harira', qty: 2, total: 70 }] } };
  const t = till({ cfg: PTS, rec: ready, mode: 'salle', selectedId: 'T4', tables });
  t.R.toggle();
  assert.equal(tables.T4.discount.reason, 'Fidélité client');
  assert.equal(tables.T4.discount.amount, 7);
  t.R.toggle();
  assert.equal(tables.T4.discount, undefined);
});

await test('a new takeaway sent to the kitchen keeps its reward under its board number', async () => {
  const t = till({ cfg: PTS, rec: ready, cart: [{ name: 'Tajine', price: 90, qty: 2 }] });
  t.R.toggle();
  t.R.rekey('note', 'vrap:12');
  t.ctx.saleClient = { id: 'c1', name: 'Test', ctx: 'vrap:12' };
  t.R.sync();
  assert.equal(t.ctx.vrapDiscount.reason, 'Fidélité client');
});

console.log(`caisse-loyalty-reward: ${n} cases`);
