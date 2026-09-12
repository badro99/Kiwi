#!/usr/bin/env node
// A paid pickup from yesterday may be filed away, but neither its sale nor its
// handover history may be invented or erased. Exercise the real queue SQL and
// the caisse's archived-ticket ingestion against an in-memory production schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/order/queue.js';
import { onRequestPost as verifyPin } from '../functions/api/pin/verify.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = [];
      for (const item of statements) result.push(await item.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const merchant = 'pasta-corner-archive-test';
const now = Date.now();
const env = { DB, AUTH_SECRET: 'stale-takeaway-memory-only-test-secret' };
db.prepare('INSERT INTO merchant_config (merchant, features, type, updated_ts) VALUES (?, ?, ?, ?)')
  .run(merchant, '{"orderpro":true}', 'restaurant', now);
db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
  .run('pin-archive', merchant, '4826', 'Archive Operator', 'Caisse', now);
const cookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const pin = await verifyPin({ env, request: new Request('https://kiwi.test/api/pin/verify', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, pin: '4826' }),
}) });
assert.equal(pin.status, 200);
const actorProof = (await pin.json()).actorProof;

function insert(id, number, mode, status, paid) {
  db.prepare(`INSERT INTO orders
    (id,merchant,number,mode,total,lines,status,created_ts,updated_ts,paid_ts)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, merchant, number, mode, 35,
      JSON.stringify([{ name: 'Tiramisu', qty: 1, unitPrice: 35 }]),
      status, now - 16 * 3600000, now - 15 * 3600000, paid ? now - 15 * 3600000 : null);
}
insert('ord-stale-134', 134, 'takeout', 'ready', true);
insert('ord-stale-135', 135, 'takeout', 'ready', true);
insert('ord-unpaid-aa', 136, 'takeout', 'ready', false);
insert('ord-table-bb', 137, 'table', 'ready', true);
db.prepare(`INSERT INTO sales (id,merchant,amount,method,ts) VALUES (?,?,?,?,?)`)
  .run('sale-stale-134', merchant, 35, 'cash', now - 15 * 3600000);
const saleBefore = db.prepare('SELECT * FROM sales WHERE id = ?').get('sale-stale-134');

async function post(id, proof = actorProof) {
  const response = await onRequestPost({ env, request: new Request('https://kiwi.test/api/order/queue', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, id, status: 'archived', ...(proof ? { actorProof: proof } : {}) }),
  }) });
  return { http: response.status, ...await response.json() };
}
async function poll(since = 0) {
  const response = await onRequestGet({ env, request: new Request(
    `https://kiwi.test/api/order/queue?merchant=${merchant}&since=${since}&role=kitchen`,
    { headers: { Cookie: cookie } }) });
  assert.equal(response.status, 200);
  return response.json();
}

const before = await poll();
assert.equal(before.orders.some(o => o.id === 'ord-stale-134'), false,
  'six-hour kitchen filter hides yesterday’s pickup from the server queue');
assert.equal((await post('ord-stale-134', null)).http, 403, 'filing a paid order needs a named operator');
assert.equal((await post('ord-unpaid-aa')).http, 409, 'unpaid takeaway cannot be filed');
assert.equal((await post('ord-table-bb')).http, 409, 'a table bill cannot be filed as takeaway');
assert.equal((await post('ord-stale-134')).status, 'archived');
assert.equal((await post('ord-stale-134')).replayed, true, 'repeat is idempotent');
assert.equal((await post('ord-stale-135')).status, 'archived');
const archived = db.prepare('SELECT status,paid_ts,created_ts,lines FROM orders WHERE id = ?').get('ord-stale-134');
assert.equal(archived.status, 'archived');
assert.ok(archived.paid_ts, 'original paid timestamp is retained');
assert.equal(archived.created_ts, now - 16 * 3600000, 'original order date is retained');
assert.equal(db.prepare('SELECT * FROM sales WHERE id = ?').get('sale-stale-134').ts, saleBefore.ts,
  'sale remains on its original day');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 1, 'no new sale or transaction created');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_course').get().n, 0,
  'archival cannot fabricate a kitchen-ready or customer-handover milestone');
const archiveAudit = db.prepare("SELECT command_id, event, detail FROM operational_events WHERE merchant = ? AND event = 'takeout-archived' ORDER BY created_ts")
  .all(merchant);
assert.deepEqual(archiveAudit.map(row => row.command_id), ['ord-stale-134', 'ord-stale-135'],
  'each filed order has one tenant-scoped audit record, even after a replay');
assert.equal(JSON.parse(archiveAudit[0].detail).actorName, 'Archive Operator');
const after = await poll();
assert.deepEqual(after.orders.filter(o => o.status === 'archived').map(o => o.number).sort(), [134, 135],
  'old archived orders reach other tills as terminal tombstones');

const page = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
function extract(name) {
  const start = page.indexOf('    function ' + name + '(');
  const end = page.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, `production function ${name} exists`);
  return page.slice(start, end + 6);
}
const ids = new Set();
const ticket = { num: 134, opId: 'ord-stale-134', opNum: 134, type: 'takeaway', paid: true };
const context = vm.createContext({
  kdsOrders: [ticket], opTickets: new Map([[ticket.opId, ticket]]),
  archivedTakeawaySet: () => ids, rememberArchivedTakeaway: id => ids.add(id),
  retireRejectedKitchenTicket: t => { context.kdsOrders.splice(context.kdsOrders.indexOf(t), 1); },
  opRepairFormulaParents() {}, Date,
});
vm.runInContext(['staleQueuedServerTicket', 'opIngest'].map(extract).join('\n'), context);
context.opIngest(after.orders.find(o => o.id === ticket.opId));
assert.equal(context.kdsOrders.length, 0, 'server tombstone retires the saved paid card');
assert.ok(ids.has(ticket.opId), 'retirement survives a later saved-shift reload');
assert.equal(context.staleQueuedServerTicket(ticket), true, 'local snapshot cannot resurrect the card');
context.opIngest({ ...after.orders.find(o => o.id === ticket.opId), status: 'ready' });
assert.equal(context.kdsOrders.length, 0, 'a delayed old poll cannot resurrect an archived card');
const legacyTicket = { num: 135, opNum: 135, type: 'takeaway', paid: true,
  total: 35, sentAt: new Date(now - 16 * 3600000) };
context.kdsOrders.push(legacyTicket);
context.opIngest(after.orders.find(o => o.number === 135));
assert.equal(context.kdsOrders.length, 0, 'a legacy card without opId is matched by number, amount and origin time');

const cardContext = vm.createContext({
  vrapSelectedPaidNum: 134,
  vrapIsCounterSale: () => false, savedTakeawaySplitFor: () => null,
  vrapElapsed: () => 'il y a 936 min', vrapItemsLine: () => '1× Tiramisu',
  fmtMAD: value => `${value} MAD`, kdsEsc: value => String(value), ticketNo: o => String(o.opNum),
});
vm.runInContext(extract('vrapOrderCard'), cardContext);
const card = cardContext.vrapOrderCard({ ...ticket, status: 'ready', pickedUp: false,
  sentAt: new Date(now - 16 * 3600000), items: [{ n: 'Tiramisu' }], total: 35 });
assert.match(card, /data-vrap-archive="134"/, 'paid pickup has an explicit remove-from-tracking action');
assert.match(card, /Commande payée/, 'tapping a paid card reveals read-only details');
assert.match(card, /ne modifie ni le paiement ni les ventes/, 'the UI states the nonfinancial effect');

console.log('Takeaway stale archive: server, ledger, tombstone and local replay checks passed.');
db.close();
