#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

// A paid OrderPro takeaway leaves `held` once, prints once, and cannot print
// again when the server echo or a second payment callback revisits it.
const takeawayHarness = new Function(`
  const prints = [], pushes = [];
  const window = {};
  const kdsEl = { classList: { contains: () => false } };
  const printKitchenTickets = (order, items, options) => prints.push({ order, items, options });
  const opPush = (order, status, extra) => pushes.push({ order, status, extra });
  const updateKdsCount = () => {};
  const kdsPaint = () => {};
  const persistShift = () => {};
  ${extractFunction('dispatchHeldTakeaway')}
  const order = { num: 8, opId: 'op-takeout-8', status: 'held', items: [{ q: 1, n: 'Pasta' }] };
  const first = dispatchHeldTakeaway(order, true, true);
  const second = dispatchHeldTakeaway(order, true, true);
  return { first, second, order, prints, pushes };
`)();

assert.equal(takeawayHarness.first, true, 'payment dispatches a held takeaway');
assert.equal(takeawayHarness.second, false, 'the same order cannot dispatch twice');
assert.equal(takeawayHarness.order.status, 'new', 'the order becomes visible to KDS');
assert.equal(takeawayHarness.prints.length, 1, 'the kitchen ticket is printed exactly once');
assert.equal(takeawayHarness.prints[0].options.sourceId, 'op-takeout-8', 'paper dedup uses the canonical OrderPro id');
assert.equal(takeawayHarness.prints[0].options.remote, false,
  'the accepting caisse prints its own OrderPro ticket without requiring the remote hub lease');
assert.deepEqual(takeawayHarness.pushes.map(x => [x.status, x.extra.paid]), [['accepted', true]],
  'the customer queue learns that the paid order was accepted');

const freshTakeawayHarness = new Function(`
  let mode = 'vrap', vrapEditingNum = null, kdsOrderSeq = 0;
  const cart = [{ id: 'pasta', name: 'Pasta', qty: 1, price: 40 }];
  const kdsOrders = [], prints = [], relays = [];
  const window = {};
  const kdsEl = { classList: { contains: () => false } };
  const kitchenItemsFromLines = lines => lines.map(line => ({ q: line.qty, n: line.name, p: line.price }));
  const relayLinesFromCaisse = lines => lines;
  const relayToKitchen = order => relays.push(order.num);
  const printKitchenTickets = order => prints.push(order.num);
  const persistShift = () => {};
  const updateKdsCount = () => {};
  const kdsPaint = () => {};
  const opPush = () => {};
  const selectedId = null;
  const dispatchTableUnsentToKitchen = () => null;
  ${extractFunction('createTakeawayKitchenOrder')}
  ${extractFunction('dispatchHeldTakeaway')}
  ${extractFunction('dispatchUnsentKitchenBeforePayment')}
  const first = dispatchUnsentKitchenBeforePayment();
  const second = dispatchUnsentKitchenBeforePayment();
  return { first, second, vrapEditingNum, kdsOrders, prints, relays };
`)();

assert.equal(freshTakeawayHarness.kdsOrders.length, 1, 'paying a fresh counter cart creates one KDS order');
assert.equal(freshTakeawayHarness.prints.length, 1, 'the fresh counter cart prints once');
assert.equal(freshTakeawayHarness.relays.length, 1, 'the fresh counter cart reaches remote KDS once');
assert.equal(freshTakeawayHarness.vrapEditingNum, freshTakeawayHarness.kdsOrders[0].num,
  'checkout settles the exact kitchen order it just created');
assert.equal(freshTakeawayHarness.second, freshTakeawayHarness.first,
  're-entering the payment callback finds the existing order instead of creating another');

// Table acceptance dispatches each pending OrderPro order once, locally first,
// then acknowledges it to the server. Clearing orderProPending is the durable
// guard used by both the manual button and payment fallback.
const tableHarness = new Function(`
  const ingested = [], statuses = [];
  const tableOrders = { T4: [
    { orderProPending: true, orderProLine: 'op-table-a:0' },
    { orderProPending: true, orderProLine: 'op-table-a:1' },
    { orderProPending: true, orderProLine: 'op-table-b:0' },
  ] };
  const remote = {
    'op-table-a': { id: 'op-table-a', mode: 'table', table: 'T4', status: 'pending', lines: [] },
    'op-table-b': { id: 'op-table-b', mode: 'table', table: 'T4', status: 'pending', lines: [] },
  };
  const KiwiOrderInbox = {
    orders: () => remote,
    setStatus: (id, status, extra) => statuses.push({ id, status, extra }),
  };
  const window = { KiwiOrderInbox };
  const serverNameFor = () => 'Sara';
  const opIngest = (order) => {
    ingested.push(order);
    tableOrders.T4.forEach(line => {
      if (line.orderProLine.startsWith(order.id + ':')) line.orderProPending = false;
    });
  };
  ${extractFunction('orderProPendingIdsForTable')}
  ${extractFunction('dispatchPendingOrderProAtTable')}
  const first = dispatchPendingOrderProAtTable('T4', false);
  const second = dispatchPendingOrderProAtTable('T4', false);
  return { first, second, ingested, statuses };
`)();

assert.equal(tableHarness.first, 2, 'two pending table orders are dispatched independently');
assert.equal(tableHarness.second, 0, 'the manual/payment fallback cannot resend them');
assert.deepEqual(tableHarness.ingested.map(x => x.id), ['op-table-a', 'op-table-b'],
  'each original OrderPro id enters KDS once');
assert.ok(tableHarness.ingested.every(x => x.status === 'accepted'), 'local KDS sees accepted orders immediately');
assert.ok(tableHarness.ingested.every(x => x.localKitchenAction === true),
  'table acceptance is classified as a local operator print action');
assert.deepEqual(tableHarness.statuses.map(x => x.id), ['op-table-a', 'op-table-b'],
  'each acceptance is acknowledged to the server once');

assert.match(source, /function finalizeTender\(method\)\s*\{\s*[\s\S]{0,500}?dispatchUnsentKitchenBeforePayment\(\);[\s\S]{0,160}?const tenderBase = currentTotal\(\)/,
  'every confirmed tender dispatches before sale settlement');
assert.match(source, /tableKitchenPending[\s\S]{0,220}?kitchenBtn\.hidden = !tableKitchenPending/,
  'the table bill exposes a kitchen button while anything is pending');
assert.match(source, /mode === 'salle' && selectedId[\s\S]{0,180}?dispatchTableUnsentToKitchen\(selectedId, false\)/,
  'the table kitchen button uses the shared dispatch path');
assert.match(source, /confirmAccepted\(order\)[\s\S]{0,500}?opIngest\(Object\.assign/,
  'successful OrderPro acceptance returns through the idempotent ingestion bridge');
assert.match(source, /data-vrap-send[\s\S]{0,500}?dispatchHeldTakeaway\(order, false, true\)/,
  'an unpaid OrderPro takeaway exposes a separate kitchen action that keeps it unpaid');
assert.match(source, /remote: o\.localKitchenAction !== true[\s\S]{0,160}?sourceId: o\.id/,
  'operator acceptance prints locally while passive remote polling remains hub-only');
assert.match(source, /!l\.sent && !l\.orderProPending/,
  'pending remote lines cannot be merged into a second local table ticket');
assert.match(source, /if \(cart && cart\.length\)[\s\S]{0,180}?createTakeawayKitchenOrder\(cart\)[\s\S]{0,100}?vrapEditingNum = created\.num/,
  'paying a fresh counter order creates one kitchen order and then settles that same order');

console.log('✓ payment and table confirmation dispatch each unsent kitchen order exactly once');
