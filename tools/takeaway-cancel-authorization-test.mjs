#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = caisseTestSource(fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8'));
const start = source.indexOf('function cancelOrderProTakeaway(o, authorizedWho = null)');
const end = source.indexOf('function settleVrapPayment()', start);
assert.ok(start >= 0 && end > start, 'the guarded cancellation function is present');
const fn = source.slice(start, end);

assert.ok(!source.includes('vrapCancellingAuthorized'),
  'no ambient authorization flag remains in the caisse');
assert.match(source, /cancelOrderProTakeaway\(editingOrder,\s*who\)/,
  'the already-authorized cart path passes the operator identity directly');
assert.match(fn, /if \(authorizedWho\) \{ proceed\(authorizedWho\); return true; \}/,
  'an explicit authorization executes without opening a second PIN prompt');
assert.match(fn, /requireTillOperator\(`Annuler la commande \$\{label\}`, proceed, TILL_NEEDS_SERVER\)/,
  'an unauthenticated board click still opens the operator gate, and offline it takes no code (server write, no outbox)');
assert.ok(fn.indexOf('const proceed =') < fn.indexOf('postCaisseCancellation(')
  && fn.indexOf('postCaisseCancellation(') < fn.indexOf('}).then(() => {')
  && fn.indexOf('}).then(() => {') < fn.indexOf('dismissExpired(')
  && fn.indexOf('dismissExpired(') < fn.indexOf('opTickets.delete('),
  'all destructive work follows server confirmation inside the approved callback');

/* Run the shipped function: the text above can survive a change that breaks
 * the order of events, so drive it with a server that answers or refuses. */
const { declarations } = createRequire(import.meta.url)('./caisse-test-source.cjs');
function till({ serverOk }) {
  const log = [];
  let release;
  const order = { opId: 'op-7', num: 7, paid: false };
  const ctx = {
    window: { KiwiAuthAct: (a) => log.push('audit:' + a.kind) },
    TILL_NEEDS_SERVER: 'server',
    toast: (m) => log.push('toast:' + m),
    ticketNo: (o) => '#' + o.num,
    currentMerchantSlug: () => 'cancel-fixture',
    postCaisseCancellation: (body) => { log.push('server:' + body.status + ':' + (body.actorProof || '-'));
      return new Promise((ok, ko) => { release = () => serverOk ? ok() : ko(new Error('refusé')); }); },
    requireTillOperator: (label, proceed, mode) => { log.push('gate:' + mode); ctx.__proceed = proceed; },
    dismissExpired: (id) => log.push('dismiss:' + id),
    opTickets: new Map([['op-7', {}]]),
    kdsOrders: [order],
    vrapEditingNum: null, clearCart() {}, setVrapView() {}, renderVrapBoard: () => log.push('board'),
    updateKdsCount() {}, kdsEl: { classList: { contains: () => false } }, kdsPaint() {}, persistShift() {},
  };
  vm.createContext(ctx);
  vm.runInContext(declarations('cancelOrderProTakeaway') + '\nthis.cancel = cancelOrderProTakeaway;', ctx);
  return { ctx, log, order, release: async () => { release(); for (let i = 0; i < 5; i++) await null; } };
}
{
  const t = till({ serverOk: true });
  assert.equal(t.ctx.cancel(t.order, { name: 'Sara', actorProof: 'proof-1' }), true);
  assert.ok(!t.log.some((l) => l.startsWith('gate:')), 'run: an authorized cancel opens no second operator prompt');
  assert.ok(t.ctx.opTickets.has('op-7') && t.ctx.kdsOrders.length === 1, 'run: nothing is removed before the server answers');
  await t.release();
  assert.ok(t.log.includes('server:rejected:proof-1'), 'run: the operator proof reaches the server');
  assert.ok(!t.ctx.opTickets.has('op-7') && t.ctx.kdsOrders.length === 0 && t.log.includes('dismiss:op-7'), 'run: the order leaves the till once the server confirmed');
}
{
  const t = till({ serverOk: false });
  t.ctx.cancel(t.order, { name: 'Sara', actorProof: 'proof-1' });
  await t.release();
  assert.ok(t.ctx.opTickets.has('op-7') && t.ctx.kdsOrders.length === 1 && !t.log.some((l) => l.startsWith('dismiss:')), 'run: a refused cancellation keeps the order');
  assert.ok(t.log.some((l) => /conservée/.test(l)), 'run: the cashier is told the order was kept');
}
{
  const t = till({ serverOk: true });
  t.ctx.cancel(t.order);
  assert.ok(t.log.includes('gate:server') && !t.log.some((l) => l.startsWith('server:')), 'run: without an operator the gate opens and the server is not called');
  t.ctx.__proceed({ name: 'Ali', actorProof: 'proof-2' });
  await t.release();
  assert.ok(t.log.includes('server:rejected:proof-2') && !t.ctx.opTickets.has('op-7'), 'run: once the gate approves, the cancel goes through with that operator');
}
{
  const t = till({ serverOk: true });
  assert.equal(t.ctx.cancel({ ...t.order, paid: true }), false, 'run: a paid order cannot be cancelled here');
}

console.log('✓ takeaway cancellation authorization — 6 source controls and 9 run controls green');
