#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
/* retail-sale-hold-test · a boutique or Maison sale the Live Link queue refused is kept and sent again.
 *
 *   node tools/retail-sale-hold-test.mjs
 *
 * An outside review (21 October) read the boutique till's checkout: it called
 * KiwiLive.postSale() and ignored the answer, then cleared the cart. When the
 * queue refused the sale (storage full, or the shop's identity not yet
 * resolved at start-up), the customer had paid, the receipt was printed, and
 * the server never heard of it. The restaurant till already holds such a sale
 * and replays it. bqHoldPost / bqReplayHeld / bqPost give the two retail tills
 * the same behaviour; this suite runs them.
 *
 * Same review: a return rung on another till rebuilt the line from its printed
 * name and took the first model of that size, so a blue shirt came back into
 * stock as white. remoteLine() now reads the exact itemId and variantId that
 * /api/sale keeps. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); n++; console.log('  ✓ ' + msg); };

const grab = (src, name) => {
  const at = src.indexOf('  function ' + name + '(');
  assert.ok(at >= 0, name + ' is present');
  const end = src.indexOf('\n  }\n', at);
  return src.slice(at, end + 4);
};
const boutique = maisonSource(fs.readFileSync(path.join(root, 'assets/pos-boutique.js'), 'utf8'));
const maison = maisonSource(fs.readFileSync(path.join(root, 'assets/pos-maison.js'), 'utf8'));
const kit = maisonSource(fs.readFileSync(path.join(root, 'assets/retail-sale-hold.js'), 'utf8'));
for (const [name, src] of [['boutique', boutique], ['maison', maison]]) {
  ok(/window\.KiwiRetailSaleHold\.create\(\{ sales: \(\) => SALES, persist: \(\) => persistDay\(\), isDemo: IS_DEMO/.test(src),
    `${name}: the till hands its own journal to the shared hold module`);
}

function sandbox({ merchant = 'santos', on = true, answer } = {}) {
  const calls = [];
  const ctx = {
    IS_DEMO: false, SALES: [], persisted: 0,
    window: { KiwiLive: {
      isOn: () => on, merchant: () => merchant,
      postSale: (p) => { calls.push(p); return typeof answer === 'function' ? answer(p) : answer; },
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(kit, ctx);
  vm.runInContext(`const h = window.KiwiRetailSaleHold.create({ sales: () => SALES, persist: () => { persisted++; }, isDemo: IS_DEMO, slug: () => ${JSON.stringify(merchant)} });
    this.hold = h.hold; this.replay = h.replay; this.post = h.post;`, ctx);
  ctx.calls = calls;
  ctx.setAnswer = (a) => { answer = a; };
  return ctx;
}
const at = new Date('2026-10-21T11:00:00Z');
const payload = (id) => ({ id, amount: 120, method: 'cash', ref: 'BQ-' + id, time: at, lines: [{ name: 'Caftan', qty: 1, total: 120 }] });

{
  const s = sandbox({ answer: { ok: false, reason: 'storage-full' } });
  const sale = { id: 'BQ-1', at }; s.SALES.push(sale);
  s.post(sale, payload('a1'));
  ok(sale.pendingPost && sale.pendingPost.id === 'a1', 'a sale the queue refuses is kept on the sale, with its exact payload');
  ok(typeof sale.pendingPost.time === 'number' && sale.pendingPost.time === +at, 'its time is kept as a number, so the day journal stores it safely');
  ok(sale.pendingPost.merchant === 'santos', 'it remembers which shop it belongs to, so a re-paired till cannot file it elsewhere');
  ok(s.persisted === 1, 'and the day journal is written at once');
  s.setAnswer({ ok: true, queued: true, id: 'srv-a1' });
  ok(s.replay() === 1 && !sale.pendingPost, 'once the queue accepts it, the replay sends it and lets it go');
  ok(typeof s.calls[1].time.getTime === "function" && +s.calls[1].time === +at, 'the replay sends the original sale time, not the time of the retry');
  ok(s.calls[1].id === 'a1', 'with the same id, so the server counts it once');
}
{
  const s = sandbox({ merchant: '', answer: undefined });
  const sale = { id: 'BQ-2', at }; s.SALES.push(sale);
  s.post(sale, payload('a2'));
  ok(!!sale.pendingPost, 'a sale rung before the shop identity resolves is kept too');
}
{
  const s = sandbox({ merchant: 'santos', answer: undefined });
  const sale = { id: 'BQ-3', at }; s.SALES.push(sale);
  s.post(sale, { ...payload('a3'), amount: 0 });
  ok(!sale.pendingPost && s.persisted === 0, 'a sale postSale skips on purpose (nothing to report) is not retried every minute');
}
{
  const s = sandbox({ answer: { ok: true, queued: true, id: 'srv' } });
  const sale = { id: 'BQ-4', at, pendingPost: { id: 'old', time: +at } }; s.SALES.push(sale);
  s.hold(sale, payload('a4'), { ok: true, queued: true });
  ok(!sale.pendingPost, 'an accepted sale clears any older hold on it');
}
{
  const s = sandbox({ answer: { ok: false, reason: 'storage-full' } });
  const older = { id: 'BQ-5', at: new Date(+at - 60000), pendingPost: { id: 'old5', time: +at - 60000 } };
  const newer = { id: 'BQ-6', at, pendingPost: { id: 'new6', time: +at } };
  const voided = { id: 'BQ-7', at, voided: true, pendingPost: { id: 'void7', time: +at } };
  s.SALES.push(newer, voided, older);           // the till keeps the newest first
  s.replay();
  ok(s.calls.map((p) => p.id).join(',') === 'old5,new6', 'held sales go out oldest first, and a voided one is not sent');
  ok(!voided.pendingPost, 'a voided sale drops its hold');
  ok(!!older.pendingPost && !!newer.pendingPost, 'while the queue still refuses, the holds stay');
  s.calls.length = 0;
  s.setAnswer({ ok: true, queued: true, id: 'srv' });
  const fresh = { id: 'BQ-8', at }; s.SALES.unshift(fresh);
  s.post(fresh, payload('a8'));
  ok(s.calls.map((p) => p.id).join(',') === 'old5,new6,a8', 'a new sale lets the held ones go first, so the queue keeps the till order');
  ok(!older.pendingPost && !newer.pendingPost && !fresh.pendingPost, 'and nothing is left held');
}
{
  const s = sandbox({ on: false, answer: { ok: true, queued: true } });
  s.SALES.push({ id: 'BQ-9', at, pendingPost: { id: 'x', time: +at } });
  ok(s.replay() === 0 && s.calls.length === 0, 'with Live Link off nothing is sent');
}

for (const [name, src] of [['boutique', boutique], ['maison', maison]]) {
  ok((src.match(/KiwiLive\.postSale\(/g) || []).length === 1, `${name}: the only direct postSale call is inside bqPost`);
  ok((src.match(/(?<!function )bqPost\((?:sale|rec), /g) || []).length === 3, `${name}: the sale, the exchange difference and the deposit payment all go through bqPost`);
  ok(/mount\._heldTimer = setInterval\(/.test(src) && /addEventListener\('online', \(\) => \{ refresh\(\); try \{ bqReplayHeld\(\)/.test(src),
    `${name}: held sales go out again at start-up, every minute, and when the network returns`);
}

/* remoteLine: the exact variant of a remote receipt. */
for (const [name, src] of [['boutique', boutique], ['maison', maison]]) {
  const ctx = {
    P: {
      p1: { id: 'p1', name: 'Chemise', sizes: { S: 2, M: 1 }, _variants: [
        { size: 'S', colorId: 'blanc' }, { size: 'S', colorId: 'bleu' }, { size: 'M', colorId: 'blanc' }] },
    },
    sizesOf: (item) => Object.keys(item.sizes || {}),
  };
  vm.createContext(ctx);
  vm.runInContext(grab(src, 'remoteLine') + '\nthis.f = remoteLine;', ctx);
  const blue = ctx.f({ name: 'Chemise S', itemId: 'p1', variantId: 'p1:S:bleu', qty: 1, total: 90, unit: 'piece' });
  ok(blue && blue.pid === 'p1' && blue.size === 'S' && blue.color === 'bleu', `${name}: a blue shirt rung on another till comes back as a blue shirt`);
  ok(blue.unit === 90, `${name}: at the price the line was actually paid`);
  const old = ctx.f({ name: 'Chemise M', qty: 2, total: 200 });
  ok(old && old.size === 'M' && old.color === 'blanc' && old.unit === 100, `${name}: an old line without ids still finds its article by name`);
  const alien = ctx.f({ name: 'Chemise S', itemId: 'p1', variantId: 'p9:S:bleu', qty: 1, total: 90 });
  ok(alien && alien.color === 'blanc', `${name}: a variant id of another article is not trusted`);
}

console.log(`\nretail-sale-hold: ${n} passed, 0 failed`);
