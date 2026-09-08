#!/usr/bin/env node
/* Local operating-day integration coverage.  This deliberately calls the route
 * handlers against a real node:sqlite copy of schema.sql: no browser, network,
 * production data, or fabricated sales/refunds. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { managerRefundProof, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as verifyPin } from '../functions/api/pin/verify.js';
import { onRequestPost as placeOrder } from '../functions/api/order/index.js';
import { onRequestPost as openSession } from '../functions/api/order/session.js';
import { onRequestPost as queueOrder } from '../functions/api/order/queue.js';
import { onRequestPost as channelOrder } from '../functions/api/channel/order.js';
import { onRequestPost as sale } from '../functions/api/sale.js';
import { onRequestPost as refund } from '../functions/api/sale/refund.js';
import { onRequestPost as inventoryMovement } from '../functions/api/inventory/movements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MERCHANT = 'operating-day-cafe';
const SECRET = 'operating-day-local-secret';
const ACCOUNT = 'account-operating-day';
const STAFF = 'staff-operating-day';
const now = Date.now();

function makeDB() {
  const db = new DatabaseSync(':memory:');
  for (const statement of fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8')
    .replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) db.exec(statement);
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...values) { args = values.map((v) => v === undefined ? null : v); return st; },
      first() { const row = db.prepare(query).get(...args); return row === undefined ? null : row; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const result = db.prepare(query).run(...args); return { success: true, meta: { changes: result.changes } }; },
    };
    return st;
  };
  const facade = { prepare, _db: db };
  facade.batch = async (statements) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = statements.map((statement) => statement.run()); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  };
  return facade;
}

const DB = makeDB();
const env = { DB, AUTH_SECRET: SECRET };
const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, condition, detail });
  console.log(`${condition ? '✓' : '✗'} ${label}${condition || !detail ? '' : ` — ${detail}`}`);
}
async function json(response) { try { return await response.json(); } catch (_) { return null; } }
async function call(handler, body, headers = {}, url = 'https://kiwi.test/api') {
  const response = await handler({ request: new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), env });
  return { status: response.status, body: await json(response) };
}
const till = async () => ({ Cookie: `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}` });

function seed() {
  const menu = {
    cats: [{ id: 'food', name: 'Food', station: 'kitchen', sub: [] }],
    stations: [{ id: 'kitchen', name: 'Kitchen' }],
    items: [
      { id: 'sandwich', name: 'Cafe sandwich', price: 90, catId: 'food', avail: true, opts: ['bread'] },
      { id: 'tea', name: 'Mint tea', price: 15, catId: 'food', avail: true },
      { id: 'sold-out', name: 'Sold out dish', price: 70, catId: 'food', avail: false },
    ],
    opts: [{ id: 'bread', name: 'Bread', kind: 'one', required: true, choices: [{ id: 'white', name: 'White', price: 0 }] }],
  };
  DB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACCOUNT, 'operating-day@example.test', 'Operating Day', 'Operating Day Cafe', 's', 'h', now);
  DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,till_epoch,updated_ts) VALUES (?,?,?,?,?,?)')
    .run(MERCHANT, JSON.stringify({ orderpro: true }), 'restaurant', ACCOUNT, 0, now);
  DB._db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'Operating Day Cafe', 'restaurant', JSON.stringify(menu), now);
  DB._db.prepare('INSERT INTO order_desk (merchant,seen_ts) VALUES (?,?)').run(MERCHANT, now);
  DB._db.prepare('INSERT INTO channel_links (id,merchant,channel,label,hash,status,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('glovo-local', MERCHANT, 'glovo', 'Local Glovo fixture', 'placeholder', 'active', now);
  DB._db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'employee-access', JSON.stringify({ members: [{ id: STAFF, merchant: MERCHANT, active: true }] }), 1, now);
  DB._db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'team', JSON.stringify({ members: [{ id: STAFF, name: 'Local Operator', role: 'manager' }] }), 1, now);
  DB._db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .run('pin-operating-day', MERCHANT, '4826', 'Local Operator', 'Caisse', now);
}

async function main() {
  seed();
  const tillHeaders = await till();
  const pin = await call(verifyPin, { merchant: MERCHANT, pin: '4826' }, tillHeaders, 'https://kiwi.test/api/pin/verify');
  const actorProof = pin.body?.actorProof;
  check('real PIN verifier mints the handover actor proof', pin.status === 200 && actorProof && pin.body?.staff?.id === 'pin-operating-day');

  const pickup = [];
  const pickupSessions = [];
  for (let i = 1; i <= 6; i++) {
    const session = await call(openSession, { merchant: MERCHANT, mode: 'takeout' }, {}, 'https://kiwi.test/api/order/session');
    pickupSessions.push(session.body?.session);
    check(`independent pickup session ${i} opens`, session.status === 200 && session.body?.session, JSON.stringify(session.body));
    const result = await call(placeOrder, {
      merchant: MERCHANT, mode: 'takeout', session: session.body?.session, ref: `pickup-${i}`,
      lines: [{ id: 'sandwich', qty: 1, optionChoices: [{ group: 'bread', choiceId: 'white' }] }],
    }, {}, 'https://kiwi.test/api/order');
    pickup.push(result.body?.id);
    check(`pickup order ${i} is accepted by the real OrderPro route`, result.status === 200 && result.body?.ok, JSON.stringify(result.body));
  }
  const duplicate = await call(placeOrder, {
    merchant: MERCHANT, mode: 'takeout', session: pickupSessions[0], ref: 'pickup-1',
    lines: [{ id: 'sandwich', qty: 1, optionChoices: [{ group: 'bread', choiceId: 'white' }] }],
  }, {}, 'https://kiwi.test/api/order');
  check('pickup duplicate retry is replayed without a second order', duplicate.status === 200 && duplicate.body?.replayed && duplicate.body.id === pickup[0]);
  const omittedRequiredOption = await call(placeOrder, {
    merchant: MERCHANT, mode: 'takeout', session: pickupSessions[0], ref: 'required-option-omitted',
    lines: [{ id: 'sandwich', qty: 1 }],
  }, {}, 'https://kiwi.test/api/order');
  check('required menu modifier omission is rejected', omittedRequiredOption.status === 409
    && omittedRequiredOption.body?.error === 'menu-changed'
    && omittedRequiredOption.body?.invalidOptions?.includes('Cafe sandwich'));
  const badOption = await call(placeOrder, {
    merchant: MERCHANT, mode: 'takeout', session: pickupSessions[0], ref: 'invalid-option',
    lines: [{ id: 'sandwich', qty: 1, optionChoices: [{ group: 'missing', label: 'Ghost' }] }],
  }, {}, 'https://kiwi.test/api/order');
  check('menu option validation rejects an unknown option', badOption.status === 409 && badOption.body?.error === 'menu-changed');
  const unavailable = await call(placeOrder, {
    merchant: MERCHANT, mode: 'takeout', session: pickupSessions[0], ref: 'sold-out', lines: [{ id: 'sold-out', qty: 1 }],
  }, {}, 'https://kiwi.test/api/order');
  check('menu availability validation rejects sold-out item', unavailable.status === 409 && unavailable.body?.unavailable?.includes('Sold out dish'));

  const deliverySecret = 'local-glovo-secret-0123456789';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deliverySecret)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  DB._db.prepare('UPDATE channel_links SET hash=? WHERE id=?').run(hash, 'glovo-local');
  const delivery = [];
  for (let i = 1; i <= 6; i++) {
    const result = await call(channelOrder, {
      ref: `delivery-${i}`, mode: 'delivery', total: 102 + i,
      customer: { name: `Guest ${i}`, phone: `06000000${i}`, address: `${i} Rue Test, Casablanca`, note: 'Ring once' },
      lines: [{ id: 'sandwich', name: 'Cafe sandwich', qty: 1, unitPrice: 90 }],
    }, { Authorization: `Bearer kwc.glovo-local.${deliverySecret}` }, 'https://kiwi.test/api/channel/order');
    delivery.push(result.body?.id);
    check(`delivery order ${i} persists through the channel handler`, result.status === 200 && result.body?.ok, JSON.stringify(result.body));
  }
  const deliveryDuplicate = await call(channelOrder, {
    ref: 'delivery-1', mode: 'delivery', total: 999,
    customer: { name: 'Changed', phone: '0600000000', address: 'Changed address' },
    lines: [{ id: 'sandwich', name: 'Cafe sandwich', qty: 1, unitPrice: 90 }],
  }, { Authorization: `Bearer kwc.glovo-local.${deliverySecret}` }, 'https://kiwi.test/api/channel/order');
  check('delivery provider retry is idempotent and preserves the first ticket', deliveryDuplicate.status === 200 && deliveryDuplicate.body?.duplicate && deliveryDuplicate.body.id === delivery[0]);
  const persistedDelivery = DB._db.prepare('SELECT total, customer, mode, channel FROM orders WHERE id=?').get(delivery[0]);
  const customer = JSON.parse(persistedDelivery?.customer || '{}');
  check('delivery address and fee-inclusive total persist on the order', persistedDelivery?.mode === 'delivery'
    && persistedDelivery?.channel === 'glovo' && persistedDelivery?.total === 103
    && customer.address === '1 Rue Test, Casablanca');

  const all = [...pickup, ...delivery].filter(Boolean);
  check('at least twelve real handler-created orders exist', all.length === 12 && DB._db.prepare('SELECT COUNT(*) AS n FROM orders WHERE merchant=?').get(MERCHANT).n === 12);

  async function transition(id, status, paid = false) {
    return call(queueOrder, { merchant: MERCHANT, id, status, paid }, tillHeaders, 'https://kiwi.test/api/order/queue');
  }
  const flow = [
    [pickup[0], ['accepted', 'ready']], [pickup[1], ['rejected']], [pickup[2], ['accepted', 'rejected']],
    [pickup[3], []], [pickup[4], ['accepted', 'ready']], [pickup[5], ['accepted', 'ready']],
    [delivery[0], ['accepted', 'ready']], [delivery[1], ['rejected']], [delivery[2], ['accepted']],
    [delivery[3], []], [delivery[4], ['accepted', 'ready']], [delivery[5], ['accepted', 'ready']],
  ];
  for (const [id, statuses] of flow) for (const status of statuses) {
    const result = await transition(id, status);
    check(`real queue transition ${id} → ${status}`, result.status === 200 && result.body?.ok, JSON.stringify(result.body));
  }
  const completed = [pickup[0], pickup[5], delivery[0], delivery[5]];
  for (const orderId of completed) {
    const isPickup = pickup.includes(orderId);
    const result = await call(queueOrder, {
      merchant: MERCHANT, id: orderId, status: 'served', paid: true,
      ...(isPickup ? { actorProof } : {}),
    }, tillHeaders, 'https://kiwi.test/api/order/queue');
    check(`paid-before-handover serves completed ${isPickup ? 'pickup' : 'delivery'} order ${orderId}`,
      result.status === 200 && result.body?.ok
        && DB._db.prepare('SELECT status, paid_ts FROM orders WHERE id=?').get(orderId)?.status === 'served'
        && DB._db.prepare('SELECT paid_ts FROM orders WHERE id=?').get(orderId)?.paid_ts != null,
      JSON.stringify(result.body));
  }
  const rows = DB._db.prepare('SELECT status, COUNT(*) AS n FROM orders WHERE merchant=? GROUP BY status').all(MERCHANT);
  check('persisted status mix includes fulfilled, rejected, accepted, and pending',
    new Set(rows.map((row) => row.status)).size >= 4, JSON.stringify(rows));
  const paidRetry = await transition(completed[2], 'served', true);
  check('delivered paid retry is idempotent under the queue contract', paidRetry.status === 200 && paidRetry.body?.paid === true && paidRetry.body?.replayed === true);
  check('queue payment state is persisted for every completed pickup/delivery order',
    completed.every((id) => DB._db.prepare('SELECT paid_ts FROM orders WHERE id=?').get(id)?.paid_ts != null));

  const saleIds = [];
  for (const orderId of completed) {
    const order = DB._db.prepare('SELECT number, total, lines, mode, channel FROM orders WHERE id=?').get(orderId);
    const saleId = `sale-${orderId}`;
    const saleResult = await call(sale, {
      merchant: MERCHANT, id: saleId, amountCents: Math.round(Number(order.total) * 100), method: 'card',
      label: `OrderPro ${orderId}`, ref: orderId, channel: order.channel || 'kiwi',
      lines: JSON.parse(order.lines || '[]').map((line) => ({ id: line.id, name: line.name, qty: line.qty, total: line.unitPrice * line.qty })),
    }, await till(), 'https://kiwi.test/api/sale');
    saleIds.push(saleId);
    check(`sale handler records completed order ${orderId} with stable order reference`, saleResult.status === 200
      && saleResult.body?.ok
      && DB._db.prepare('SELECT amount_cents, ref FROM sales WHERE id=?').get(saleId)?.ref === orderId,
    JSON.stringify(saleResult.body));
  }
  const linkedCompleted = DB._db.prepare(
    `SELECT COUNT(*) AS n FROM sales s JOIN orders o ON o.id = s.ref
      WHERE s.merchant=? AND s.channel IN ('kiwi','glovo') AND o.status='served' AND o.paid_ts IS NOT NULL`
  ).get(MERCHANT).n;
  check('persisted sales link back to paid completed pickup/delivery orders', linkedCompleted === completed.length);
  const grossCompletedCents = DB._db.prepare(
    `SELECT COALESCE(SUM(s.amount_cents),0) AS cents FROM sales s JOIN orders o ON o.id=s.ref
      WHERE s.merchant=? AND o.status='served' AND o.paid_ts IS NOT NULL`
  ).get(MERCHANT).cents;
  check('money sum covers all completed pickup and delivery orders', grossCompletedCents === 39100, `cents=${grossCompletedCents}`);
  const saleRetry = await call(sale, {
    merchant: MERCHANT, id: saleIds[0], amountCents: 9000, method: 'card', label: `OrderPro ${completed[0]}`, ref: completed[0],
  }, await till(), 'https://kiwi.test/api/sale');
  check('linked sale retry does not duplicate its money row', saleRetry.status === 200
    && DB._db.prepare('SELECT COUNT(*) AS n FROM sales WHERE id=?').get(saleIds[0]).n === 1);

  const proof = await managerRefundProof(SECRET, {
    merchant: MERCHANT, staffId: STAFF, staffName: 'Local Operator', staffRole: 'manager',
    refundId: 'refund-operating-day-1', originalSaleId: saleIds[0], amountCents: 9000,
  });
  const refundResult = await call(refund, {
    merchant: MERCHANT, id: 'refund-operating-day-1', originalSaleId: saleIds[0], amountCents: 9000,
    approval: proof, actorId: STAFF, actor: 'Local Operator', actorRole: 'manager', reason: 'integration test', ref: 'pickup-1-refund',
  }, await till(), 'https://kiwi.test/api/sale/refund');
  check('actual manager-approved full refund appends a negative ledger row', refundResult.status === 200
    && DB._db.prepare('SELECT amount_cents, channel FROM sales WHERE id=?').get('refund-operating-day-1')?.amount_cents === -9000);
  const overRefundProof = await managerRefundProof(SECRET, {
    merchant: MERCHANT, staffId: STAFF, staffName: 'Local Operator', staffRole: 'manager',
    refundId: 'refund-operating-day-over', originalSaleId: saleIds[0], amountCents: 1,
  });
  const overRefund = await call(refund, {
    merchant: MERCHANT, id: 'refund-operating-day-over', originalSaleId: saleIds[0], amountCents: 1,
    approval: overRefundProof, reason: 'over-refund test', ref: `${completed[0]}-over`,
  }, await till(), 'https://kiwi.test/api/sale/refund');
  check('over-refund is blocked after the full refund', overRefund.status === 409
    && !DB._db.prepare('SELECT id FROM sales WHERE id=?').get('refund-operating-day-over'));
  const refundRetry = await call(refund, {
    merchant: MERCHANT, id: 'refund-operating-day-1', originalSaleId: saleIds[0], amountCents: 9000, approval: proof,
  }, await till(), 'https://kiwi.test/api/sale/refund');
  check('refund retry remains one negative row', refundRetry.status === 200 && DB._db.prepare('SELECT COUNT(*) AS n FROM sales WHERE id=?').get('refund-operating-day-1').n === 1);

  const consumption = await call(inventoryMovement, {
    merchant: MERCHANT, movement: {
      id: `recipe-consumption-${completed[0]}`, itemId: 'tomato', qty: -0.25, reason: 'sale',
      refType: 'order', refId: completed[0], meta: { recipe: 'sandwich-v1', sourceSale: saleIds[0] },
    },
  }, await till(), 'https://kiwi.test/api/inventory/movements');
  const stockBalance = DB._db.prepare('SELECT COALESCE(SUM(qty_milli),0) AS qty FROM inventory_movements WHERE merchant=? AND item_id=?').get(MERCHANT, 'tomato').qty;
  check('inventory API accepts an order-linked recipe consumption movement', consumption.status === 200
    && stockBalance === -250 && DB._db.prepare('SELECT ref_id FROM inventory_movements WHERE id=?').get(`recipe-consumption-${completed[0]}`)?.ref_id === completed[0],
  `consumption=${consumption.status}/${JSON.stringify(consumption.body)} balance=${stockBalance}`);

  console.log('\nActual-route coverage: OrderPro menu/session/order idempotency, delivery intake/address persistence, queue paid-state transitions, order-linked sale rows and completed-order money sums, full/over-refund behavior, and order-linked inventory movement API.');
  console.log('Not covered: browser/UI behavior, provider network behavior, automatic recipe expansion from sale.js, and deployment/authentication against a live merchant.');
  const failed = checks.filter((item) => !item.condition);
  if (failed.length) { console.error(`\n${failed.length} integration checks failed.`); process.exitCode = 1; }
  else console.log(`\n✓ ${checks.length} operating-day integration checks green`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
