#!/usr/bin/env node
// Executes the production queue/course SQL against memory-only SQLite and the
// actual caisse functions in a VM. No network or merchant data is accessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as verifyPin } from '../functions/api/pin/verify.js';
import { onRequestGet, onRequestPost } from '../functions/api/order/queue.js';
import { recordOrderCourse } from '../functions/api/order/_course.js';

process.env.TZ = 'Africa/Casablanca';
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('kiwi-caisse.html');
const extract = (name) => {
  const start = page.indexOf('    function ' + name + '(');
  const end = page.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, 'production function exists: ' + name);
  return page.slice(start, end + 6);
};
let checks = 0;
function check(name, run) { run(); checks++; console.log('✓ ' + name); }
const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const env = {
  AUTH_SECRET: 'takeaway-history-memory-only-test-secret',
  DB: {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { assert.ok(values.length <= 100, 'D1 bound-value limit'); args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
      };
    },
  },
};
const merchant = 'history-test';
const nativeNow = Date.now;
let now = new Date('2026-09-07T13:00:00Z').getTime();
Date.now = () => now;
try {
  // The queue is tenant-gated even for the in-memory kitchen fixture. Seed the
  // explicit feature row instead of weakening production entitlement checks.
  db.prepare('INSERT INTO merchant_config (merchant, features, type, updated_ts) VALUES (?, ?, ?, ?)')
    .run(merchant, JSON.stringify({ orderpro: true }), 'restaurant', now);
  db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .run('pin-history', merchant, '4826', 'History Operator', 'Caisse', now);
  const cookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
  const pinResponse = await verifyPin({ env, request: new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, pin: '4826' }),
  }) });
  assert.equal(pinResponse.status, 200);
  const actorProof = (await pinResponse.json()).actorProof;
  assert.ok(actorProof);
  const insert = (id, status, paid, created = now - 3600000) => db.prepare(
    `INSERT INTO orders (id, merchant, number, mode, total, lines, status, created_ts, updated_ts, paid_ts)
     VALUES (?, ?, ?, 'takeout', 30, ?, ?, ?, ?, ?)`
  ).run(id, merchant, db.prepare('SELECT COUNT(*) AS n FROM orders').get().n + 1,
    JSON.stringify([{ name: 'Sandwich', qty: 1, unitPrice: 30 }]), status, created, now, paid ? now - 1800000 : null);
  const served = now - 1200000;
  insert('ord-history-a', 'served', true);
  insert('ord-history-b', 'served', false);
  insert('ord-legacy-aa', 'served', true);
  insert('ord-paidonly', 'ready', true);
  await recordOrderCourse(env, { merchant, orderId: 'ord-history-a', servedAt: served });
  await recordOrderCourse(env, { merchant, orderId: 'ord-history-b', servedAt: served + 60000 });
  await recordOrderCourse(env, { merchant: 'other-merchant', orderId: 'ord-history-a', servedAt: now - 1000 });
  await recordOrderCourse(env, { merchant, orderId: 'ord-paidonly', readyAt: now - 10000 });
  const poll = async () => {
    const response = await onRequestGet({ env, request: new Request(
      `https://kiwi.test/api/order/queue?merchant=${merchant}&role=kitchen`, { headers: { Cookie: cookie } }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  let payload = await poll();
  let rows = Object.fromEntries(payload.orders.map((o) => [o.id, o]));
  check('queue projects the tenant-scoped served milestone, independently of payment/update clocks', () => {
    assert.equal(rows['ord-history-a'].served_ts, served);
    assert.notEqual(rows['ord-history-a'].served_ts, rows['ord-history-a'].updated_ts);
    assert.equal(rows['ord-history-b'].served_ts, served + 60000);
    assert.equal(rows['ord-history-b'].paid, false);
    assert.equal(rows['ord-legacy-aa'].served_ts, null);
    assert.equal(rows['ord-paidonly'].served_ts, null);
    assert.equal(rows['ord-paidonly'].paid, true);
  });

  insert('ord-handover', 'ready', true);
  const deferred = [];
  const response = await onRequestPost({ env, waitUntil: (p) => deferred.push(p), request: new Request(
    'https://kiwi.test/api/order/queue', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, id: 'ord-handover', status: 'served', actorProof }) }) });
  assert.equal(response.status, 200);
  await Promise.all(deferred);
  await recordOrderCourse(env, { merchant, orderId: 'ord-handover', servedAt: now + 60000 });
  payload = await poll();
  rows = Object.fromEntries(payload.orders.map((o) => [o.id, o]));
  check('the real served transition reaches the GET unchanged and its first milestone is immutable', () => {
    assert.equal(rows['ord-handover'].served_ts, now);
  });

  const storage = new Map();
  const body = { innerHTML: '' }, count = { textContent: '' };
  const pushes = [];
  let persisted = null;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, console, kdsOrders: [], kdsOrderSeq: 0, opTickets: new Map(), expiredOrders: [],
    window: { addEventListener() {}, dispatchEvent() {} },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    $: (selector) => selector === '#vrap-board-body' ? body : count,
    opMerchant: () => merchant, opRepairFormulaParents() {}, attachOrderProTable() {},
    kdsStations: () => [], kdsStationForName: () => 'kitchen',
    kdsNowHM: () => new Clock().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    printKitchenTickets() { throw new Error('historical import must not print'); },
    kdsEsc: (s) => String(s), ticketNo: (o) => `#${o.num}`,
    vrapItemsLine: (o) => o.items.map((i) => i.n).join(', '), fmtMAD: (n) => String(n),
    vrapOrderCard: (o) => `<active>${o.num}</active>`,
    archivedTakeawaySet: () => new Set(), rememberArchivedTakeaway() {},
    opPush: (...args) => { pushes.push(args); return Promise.resolve(null); },
    persistShift: () => { persisted = JSON.stringify(context.kdsOrders); }, toast() {},
  });
  vm.runInContext(read('assets/day-report.js'), context);
  vm.runInContext(['vrapHandoverTimestamp', 'vrapHistoryDay', 'vrapHandoverTime', 'vrapHistoryRow',
    'renderVrapBoard', 'vrapHandover', 'opIngest'].map(extract).join('\n'), context);
  Object.values(rows).forEach(context.opIngest);
  const find = (id) => context.kdsOrders.find((o) => o.opId === id);
  check('actual import retains distinct served times; payment alone never marks a ticket handed over', () => {
    assert.equal(find('ord-history-a').pickedUpTs, served);
    assert.equal(find('ord-history-b').pickedUpTs, served + 60000);
    assert.notEqual(find('ord-history-a').pickedUpAt, find('ord-history-b').pickedUpAt);
    assert.equal(find('ord-paidonly').pickedUp, false);
    assert.equal(find('ord-paidonly').pickedUpTs, null);
    assert.equal(find('ord-legacy-aa').pickedUpTs, null);
    assert.equal(pushes.length, 0);
  });
  check('polling repairs an already-served legacy timestamp without creating another ticket', () => {
    const ticket = find('ord-history-a');
    delete ticket.pickedUpTs;
    ticket.pickedUpAt = '23:59';
    context.opIngest(rows['ord-history-a']);
    assert.equal(ticket.pickedUpTs, served);
    assert.equal(ticket.pickedUpAt, context.vrapHandoverTime(served));
    assert.equal(context.kdsOrders.length, Object.keys(rows).length);
  });
  check('reload and repeated polling preserve the dated milestone, even across a missing course response', () => {
    context.kdsOrders = JSON.parse(JSON.stringify(context.kdsOrders));
    context.opTickets = new Map();
    now += 600000;
    context.opIngest({ ...rows['ord-history-a'], served_ts: null, updated_ts: now });
    assert.equal(find('ord-history-a').pickedUpTs, served);
    context.opIngest(rows['ord-history-a']);
    assert.equal(context.kdsOrders.length, Object.keys(rows).length);
  });
  check('local handover persists its actual instant once, then accepts the canonical server instant', () => {
    const ticket = find('ord-paidonly');
    const paidBefore = ticket.paid;
    context.vrapHandover(ticket.num);
    assert.equal(ticket.pickedUpTs, now);
    assert.equal(JSON.parse(persisted).find((o) => o.opId === ticket.opId).pickedUpTs, now);
    now += 60000;
    context.vrapHandover(ticket.num);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0][1], 'served');
    assert.equal(pushes[0].length, 2);
    assert.equal(ticket.paid, paidBefore);
    context.opIngest({ ...rows['ord-paidonly'], status: 'served', served_ts: now - 30000 });
    assert.equal(ticket.pickedUpTs, now - 30000);
  });
  check('invalid or time-only legacy values never acquire an invented date or time', () => {
    for (const invalid of [null, undefined, '', '14:00', 'invalid', true, {}, -1, 0, Infinity, 1.5, 8640000000000001]) {
      assert.equal(context.vrapHandoverTimestamp(invalid), null);
    }
    const ticket = find('ord-legacy-aa');
    ticket.pickedUpAt = '23:59';
    assert.match(context.vrapHistoryRow(ticket), /heure inconnue/);
    assert.doesNotMatch(context.vrapHistoryRow(ticket), /23:59/);
  });
  const ts = (local) => new Date(local).getTime();
  const historyTicket = (num, when, extra = {}) => ({ num, type: 'takeaway', pickedUp: true,
    pickedUpTs: when && ts(when), items: [{ n: 'item' }], total: 30, ...extra });
  context.kdsOrders = [
    historyTicket(1, '2026-09-07T04:59:59'),
    historyTicket(2, '2026-09-07T05:00:00', { sentAt: new Date('2026-09-06T21:00:00') }),
    historyTicket(3, '2026-09-07T23:30:00'),
    historyTicket(4, '2026-09-08T01:30:00'),
    historyTicket(5, '2026-09-08T05:00:00'),
    historyTicket(6, null, { pickedUpAt: '15:45' }),
    historyTicket(7, null, { pickedUp: false, paid: true }),
  ];
  now = ts('2026-09-08T04:59:59');
  check('before 05:00, history follows the previous business day and sorts by handover, not ticket number', () => {
    context.renderVrapBoard();
    assert.doesNotMatch(body.innerHTML, />#1<|>#5</);
    assert.match(body.innerHTML, />#2</);
    assert.ok(body.innerHTML.indexOf('>#4<') < body.innerHTML.indexOf('>#3<'));
    assert.ok(body.innerHTML.indexOf('>#3<') < body.innerHTML.indexOf('>#2<'));
    assert.match(body.innerHTML, /date de remise inconnue/);
    assert.match(body.innerHTML, /heure inconnue/);
    assert.match(body.innerHTML, /<active>7<\/active>/);
    assert.match(count.textContent, /3 servies/);
    assert.doesNotMatch(body.innerHTML, /15:45/);
  });
  check('at exactly 05:00 yesterday drops out and only the new business day remains', () => {
    now = ts('2026-09-08T05:00:00');
    context.renderVrapBoard();
    assert.doesNotMatch(body.innerHTML, />#1<|>#2<|>#3<|>#4</);
    assert.match(body.innerHTML, />#5</);
    assert.match(count.textContent, /1 servie/);
  });
  check('merchant cutoff configuration and the default fallback both follow the existing day-report rule', () => {
    context.window.KiwiDayReport.setCutoff(7, merchant);
    assert.equal(context.vrapHistoryDay(now), '2026-09-07');
    context.window.KiwiDayReport.setCutoff(5, merchant);
    const report = context.window.KiwiDayReport;
    for (const date of ['2026-09-08T04:59:59', '2026-09-08T05:00:00']) {
      context.window.KiwiDayReport = report;
      const expected = context.vrapHistoryDay(ts(date)).split('-').map(Number);
      context.window.KiwiDayReport = null;
      assert.deepEqual(context.vrapHistoryDay(ts(date)).split('-').map(Number), expected);
    }
    context.window.KiwiDayReport = report;
  });

  now = new Date('2026-09-07T13:00:00Z').getTime();
  for (let i = 0; i < 100; i++) {
    const id = 'ord-batch-' + String(i).padStart(3, '0');
    insert(id, 'served', true, now - 7200000);
    await recordOrderCourse(env, { merchant, orderId: id, servedAt: served - i * 1000 });
  }
  payload = await poll();
  check('a full 100-served-ticket page projects every timestamp within D1 binding limits', () => {
    assert.equal(payload.orders.length, 100);
    assert.ok(payload.orders.every((o) => o.served_ts === served - Number(o.id.slice(-3)) * 1000));
    assert.equal(payload.degraded, undefined);
  });
  db.exec('DROP TABLE order_course');
  payload = await poll();
  check('an unmigrated course table leaves the queue usable and reports unknown served timestamps', () => {
    assert.equal(payload.orders.length, 100);
    assert.ok(payload.orders.every((o) => o.served_ts === null));
    assert.ok(payload.degraded.includes('order_course'));
  });
  db.exec('ALTER TABLE orders DROP COLUMN paid_ts');
  payload = await poll();
  check('the existing orders-column fallback still delivers legacy tickets without fabricating handover', () => {
    assert.equal(payload.orders.length, 100);
    assert.ok(payload.orders.every((o) => o.served_ts === null));
    assert.ok(payload.degraded.includes('paid_ts'));
  });
  console.log(`\nTakeaway history timestamps: ${checks} behavioral checks passed.`);
} finally {
  Date.now = nativeNow;
  db.close();
}
