#!/usr/bin/env node
// Local investigation: execute the actual caisse payment/persistence functions,
// complete Live Link module, middleware and API handlers against memory SQLite.
// No HTTP server, external requests, production secrets or merchant state.
// Regression assertions require recovery, including the local WAL/IndexedDB boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestPost as orderPost } from '../functions/api/order/queue.js';
import { tillToken, TILL_COOKIE, staffToken, GATE_COOKIE } from '../functions/auth/_lib.js';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('kiwi-caisse.html'), live = read('assets/live-link.js');
const extract = name => {
  const start = page.indexOf('    function ' + name + '(');
  const end = page.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, 'actual function exists: ' + name);
  return page.slice(start, end + 6);
};
const drain = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };
const merchant = 'receipt-upload-test';
const shiftKey = 'kiwi-caisse-shift:' + merchant;

async function fixture(t, opts = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(read('schema.sql'));
  const env = {
    AUTH_SECRET: 'memory-only-payment-upload-fixture-secret',
    SITE_PASSWORD: 'memory-only-payment-upload-gate',
    DB: { prepare(sql) {
      let args = [];
      return {
        bind(...v) { args = v; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
      };
    } },
  };
  const cookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}; ${GATE_COOKIE}=${await staffToken(env.SITE_PASSWORD)}`;
  db.prepare('INSERT INTO merchant_config (merchant,name,type,status,features,updated_ts) VALUES (?,?,?,?,?,?)')
    .run(merchant, 'Memory fixture', 'restaurant', 'active', '{}', Date.now());
  const state = { failQueue: false, networkDown: false, authenticated: true, enqueue: 'ok', ...opts };
  const values = new Map([['kiwiLive', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant })]]);
  const rows = new Map(), requests = [], events = [], timers = new Map();
  let timerId = 0, releaseEnqueue;
  const storage = {
    getItem: k => values.get(k) ?? null,
    setItem(k, v) { if (state.failQueue && k === 'kiwiSaleQueue') throw Error('injected queue quota'); values.set(k, String(v)); },
    removeItem: k => values.delete(k),
  };
  const queue = () => JSON.parse(values.get('kiwiSaleQueue') || '[]');
  const call = async (path, body, authenticated = true) => {
    assert.ok(['/api/sale', '/api/order/queue'].includes(path), 'only in-memory routes');
    const request = new Request('https://kiwi.test' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const deferred = [];
    const context = { env, request, waitUntil: p => deferred.push(p) };
    const response = await gate({ ...context, next: () => (path === '/api/sale' ? salePost : orderPost)(context) });
    await Promise.all(deferred);
    return response;
  };
  // Controlled outbox boundary, not an IndexedDB implementation: lets us stop
  // before commit or reject it. Actual Live Link owns write-ahead/fallback logic.
  const offline = {
    available: () => true, subscribe() {},
    async migrateLegacy() { for (const payload of queue()) rows.set(payload.id, { id: payload.id, payload }); storage.removeItem('kiwiSaleQueue'); },
    async stats() { return { total: rows.size, pending: rows.size, blocked: 0, sending: 0 }; },
    async enqueue(channel, tenant, payload) {
      assert.equal(channel, 'sale'); assert.equal(tenant, merchant);
      if (state.enqueue === 'reject') throw Error('injected IndexedDB commit failure');
      if (state.enqueue === 'delay') await new Promise(r => { releaseEnqueue = r; });
      rows.set(payload.id, { id: payload.id, payload });
    },
    async claim(_channel, _tenant, options) { return [...rows.values()].find(r => options.force || !r.nextAt || r.nextAt <= Date.now()) || null; },
    async acknowledge(id) { rows.delete(id); },
    async reject(id) { rows.get(id).nextAt = Date.now() + 3000; },
  };
  function boot() {
    timers.clear();
    const document = { readyState: 'complete', hidden: false, addEventListener() {}, dispatchEvent(e) { events.push(e); }, createElement: () => ({}) };
    const window = { localStorage: storage, document, KiwiEnv: { isReal: () => true }, addEventListener() {}, dispatchEvent(e) { events.push(e); }, ...(opts.indexed ? { KiwiOffline: offline } : {}) };
    const context = {
      console, window, document, localStorage: storage, navigator: { onLine: true },
      location: { search: '', hostname: 'kiwi.test' }, URLSearchParams, Date, AbortController,
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
      setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
      fetch: async (url, init) => {
        if (url.startsWith('/api/feed?')) return Response.json({ sales: [], voided: [] });
        assert.equal(url, '/api/sale', 'Live Link cannot access the network');
        const body = JSON.parse(init.body), attempt = { body };
        requests.push(attempt);
        if (state.networkDown) { attempt.error = 'network'; throw Error('injected offline'); }
        const response = await call(url, body, state.authenticated);
        attempt.status = response.status; attempt.response = await response.clone().json();
        return response;
      },
      journal: [], lastSaleId: null, mode: 'vrap', vrapEditingNum: null, kdsOrders: [], kdsOrderSeq: 0,
      registerClosing: false, lastProvisional: 0, toast: message => events.push({ type: 'toast', message }),
      currentCashier: { id: 'cashier-local', name: 'Fixture cashier' },
      tables: { '5': { zone: 'salle' } }, tableOrders: {}, orders: {}, tableSplits: new Map(),
      /* L'heure de fermeture locale des tables · persistShift l'écrit dans
         l'instantané depuis qu'un bon payé ne doit plus rouvrir sa table. */
      tableClosedAt: Object.create(null),
      vrapSplit: null, cart: [], vrapDiscount: null, selectedId: null,
      shiftOpenedAt: new Date(), shiftOpenedBy: 'Fixture cashier', openingFloat: 0,
      cashMovements: [], shift: { discounts: 0, refunds: 0, tablesPaid: 0 },
      posteOpenedAt: null, posteOpeningFloat: 0, handovers: [],
      KC_STORE: shiftKey, shiftMerchant: merchant, SERVICE_BILL_SYNC_VERSION: 1, ORDER_BRIDGE_SYNC_VERSION: 1,
      currentMerchantSlug: () => merchant, storeIsReal: () => true, staleQueuedServerTicket: () => false,
      money: n => Math.round((Number(n) || 0) * 100) / 100, minor: n => Math.round(Number(n) * 100),
      accountActiveDiscount() {}, discountReasonCode: () => 'commercial',
      phoneSessionOf: () => state.session || '', ticketNo: o => String(o.num), settledOrderLabel: () => '5', genRef: () => 'fixture-ref',
      attachReceipt: entry => { entry.rc = { ref: entry.ref }; }, creditSaleToClient() {},
      renderShiftStats() {}, renderJournal() {}, refreshOpenReconciliationModals() {}, updateKdsCount() {},
      $: () => ({ classList: { contains: () => false } }),
    };
    vm.createContext(context);
    vm.runInContext(live, context, { filename: 'assets/live-link.js' });
    vm.runInContext(['activeSaleDiscount', 'recordSale', 'persistShift', 'restoreShift', 'reconcileJournalSales', 'saveProvisional', 'opPush'].map(extract).join('\n'), context, { filename: 'kiwi-caisse-payment-functions.js' });
    window.KiwiOrderInbox = context.KiwiOrderInbox = {
      setStatus: async (id, status, extra) => {
        const response = await call('/api/order/queue', { merchant, id, status, ...extra });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result)); return result;
      },
    };
    return context;
  }
  const order = { opId: 'ord-upload-fixture', num: 7, type: 'takeaway', status: 'ready' };
  db.prepare("INSERT INTO orders (id,merchant,number,mode,total,lines,status,created_ts,updated_ts) VALUES (?,?,7,'takeout',30,'[]','ready',?,?)")
    .run(order.opId, merchant, Date.now(), Date.now());
  let ctx = boot(); await drain();
  const record = (amount = 30, table = null, split = null, tender = order) =>
    ctx.recordSale(amount, 'cash', 'Fixture payment', 0, [{ name: 'Pasta', qty: 1, price: amount, total: amount }], table, tender, split);
  return { db, state, values, queue, rows, requests, events, timers, order, record, call,
    get ctx() { return ctx; }, get live() { return ctx.window.KiwiLive; },
    saved: () => JSON.parse(values.get(shiftKey)),
    reload: async () => { const saved = JSON.parse(values.get(shiftKey)); ctx = boot(); ctx.restoreShift(saved); await drain(); },
    release: () => releaseEnqueue(),
    count: () => db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,
    session: () => { state.session = 'visit-fixture'; db.prepare("INSERT INTO table_sessions (id,merchant,table_no,opened_ts,seen_ts) VALUES (?,?,'5',?,?)").run(state.session, merchant, Date.now(), Date.now()); ctx.mode = 'salle'; },
  };
}

test('recordSale -> Live Link -> middleware -> sale API -> SQLite preserves cents and replay idempotency', async t => {
  const f = await fixture(t);
  const entry = f.record(1326.55); await drain();
  assert.equal(f.count(), 1); assert.equal(f.queue().length, 0);
  assert.equal(f.requests[0].status, 200);
  assert.equal(f.requests[0].body.orderId, f.order.opId);
  const row = f.db.prepare('SELECT * FROM sales').get();
  assert.equal(row.amount_cents, 132655); assert.equal(row.ref, '7');
  assert.equal(f.saved().journal[0].serverSaleId, row.id);
  assert.equal(f.saved().journal[0].amount, 1326.55);
  f.live.postSale(entry); await drain(); assert.equal(f.count(), 1);
  await f.reload(); f.ctx.reconcileJournalSales(false); await drain(); assert.equal(f.count(), 1);
});

test('actual opPush can mark an order paid while receipt POST fails independently; replay recovers once', async t => {
  const f = await fixture(t, { networkDown: true });
  f.record(); await drain();
  await f.ctx.opPush(f.order, 'ready', { paid: true });
  assert.ok(f.db.prepare('SELECT paid_ts FROM orders').get().paid_ts);
  assert.equal(f.count(), 0); assert.equal(f.queue().length, 1);
  assert.equal(f.saved().journal.length, 1);
  f.state.networkDown = false; await f.live.flush(true); await drain();
  assert.equal(f.count(), 1); assert.equal(f.queue().length, 0);
});

test('403 from actual receipt API retains retryable command until local fixture authorization restored', async t => {
  const f = await fixture(t, { authenticated: false });
  f.record(); await drain();
  assert.equal(f.requests[0].status, 403); assert.equal(f.requests[0].response.error, 'forbidden-merchant');
  assert.equal(f.count(), 0); assert.equal(f.queue().length, 1); assert.ok(!f.queue()[0]._blocked);
  f.state.authenticated = true; await f.live.flush(true); await drain(); assert.equal(f.count(), 1);
});

test('missing explicit table session returns actual 404; queued receipt retains session across reload', async t => {
  const f = await fixture(t); f.state.session = 'missing-visit'; f.ctx.mode = 'salle';
  f.record(30, '5', null, null); await drain();
  assert.equal(f.requests[0].status, 404); assert.equal(f.requests[0].response.error, 'table-session-missing');
  assert.equal(f.count(), 0); assert.equal(f.queue()[0].session, 'missing-visit');
  await f.reload(); assert.equal(f.queue()[0].session, 'missing-visit');
  f.db.prepare("INSERT INTO table_sessions (id,merchant,table_no,opened_ts,seen_ts) VALUES ('missing-visit',?,'5',?,?)").run(merchant, Date.now(), Date.now());
  await f.live.flush(true); await drain(); assert.equal(f.count(), 1);
});

test('queue quota failure stays visibly unsynced and provisional replay recovers after reload', async t => {
  const f = await fixture(t, { failQueue: true });
  const entry = f.record(); await drain();
  assert.equal(f.count(), 0); assert.equal(f.queue().length, 0);
  assert.equal(entry.serverSaleId, undefined); assert.equal(f.saved().journal[0].serverSaleId, undefined);
  assert.equal(entry.saleSyncPending, true); assert.equal(entry.saleSyncError, 'queue-storage-full');
  assert.ok(f.events.some(e => e.type === 'toast' && /synchronisation/.test(e.message)));
  assert.equal(f.live.queueStatus().storageError, true);
  await f.reload();
  assert.equal(f.ctx.journal[0].saleSyncError, 'queue-storage-full');
  assert.equal(f.ctx.reconcileJournalSales(true), 0); await drain();
  assert.equal(f.saved().journal[0].serverSaleId, undefined); assert.equal(f.count(), 0);
  f.state.failQueue = false;
  f.ctx.saveProvisional(true); await drain(); assert.equal(f.count(), 1);
  assert.ok(f.saved().journal[0].serverSaleId);
  assert.equal(f.saved().journal[0].saleSyncPending, undefined);
  assert.equal(f.saved().journal[0].saleSyncError, undefined);
  f.ctx.saveProvisional(true); await drain(); assert.equal(f.count(), 1);
});

test('restored partial split keeps its visit identity and replay closes only after the second API receipt', async t => {
  const f = await fixture(t); f.session();
  const first = f.record(15, '5', { index: 0, count: 2 }, null); await drain();
  const firstServerId = first.serverSaleId;
  assert.equal(f.count(), 1); assert.equal(f.db.prepare('SELECT status FROM table_sessions').get().status, 'open');
  f.state.failQueue = true;
  const entry = f.record(15, '5', { index: 1, count: 2 }, null); await drain();
  assert.equal(entry.session, 'visit-fixture'); assert.equal(entry.table, '5'); assert.equal(entry.split.count, 2);
  await f.reload(); const restored = f.ctx.journal[1];
  assert.equal(f.ctx.journal[0].serverSaleId, firstServerId);
  for (const field of ['session', 'table', 'split']) assert.deepEqual(restored[field], JSON.parse(JSON.stringify(entry[field])), 'preserves ' + field);
  assert.equal(f.count(), 1); assert.equal(f.db.prepare('SELECT status FROM table_sessions').get().status, 'open');
  f.state.failQueue = false; f.ctx.saveProvisional(true); await drain();
  assert.equal(f.count(), 2); assert.equal(f.requests.at(-1).status, 200);
  assert.equal(f.requests.at(-1).body.session, 'visit-fixture');
  assert.deepEqual(f.requests.at(-1).body.split, { index: 1, count: 2 });
  assert.equal(f.db.prepare('SELECT status FROM table_sessions').get().status, 'closed');
  assert.equal(f.db.prepare('SELECT SUM(amount_cents) AS cents FROM sales').get().cents, 3000);
  f.ctx.reconcileJournalSales(false); await drain(); assert.equal(f.count(), 2);
});

test('restored discount and order metadata reach the actual sale API unchanged on journal-only replay', async t => {
  const f = await fixture(t, { failQueue: true });
  f.ctx.vrapDiscount = { reason: 'Commercial', actorId: 'cashier-local' };
  const entry = f.ctx.recordSale(25, 'cash', 'Discounted pasta', 0, [{ name: 'Pasta', qty: 1, price: 30, total: 30 }], null, f.order);
  entry.amountCents = 2500; f.ctx.persistShift();
  assert.equal(entry.discountAmountCents, 500); assert.equal(entry.orderId, f.order.opId);
  await f.reload();
  const fields = ['orderId', 'amountCents', 'grossAmountCents', 'discountAmountCents', 'discountReason', 'actorId'];
  for (const field of fields) assert.equal(f.ctx.journal[0][field], entry[field], 'preserves ' + field);
  f.state.failQueue = false; f.ctx.saveProvisional(true); await drain();
  assert.equal(f.requests.at(-1).status, 200);
  for (const field of fields) assert.equal(f.requests.at(-1).body[field], entry[field], 'API receives ' + field);
  const row = f.db.prepare('SELECT amount_cents,gross_amount_cents,discount_amount_cents,discount_reason,discount_actor_id FROM sales').get();
  assert.deepEqual({ ...row }, { amount_cents: 2500, gross_amount_cents: 3000, discount_amount_cents: 500, discount_reason: 'commercial', discount_actor_id: 'cashier-local' });
  f.ctx.reconcileJournalSales(false); await drain(); assert.equal(f.count(), 1);
});

test('valid visit split posts distinct receipts and closes only when both actual API rows exist', async t => {
  const f = await fixture(t); f.session();
  f.record(15, '5', { index: 0, count: 2 }, null); await drain();
  assert.equal(f.count(), 1); assert.equal(f.db.prepare('SELECT status FROM table_sessions').get().status, 'open');
  f.record(15, '5', { index: 1, count: 2 }, null); await drain();
  assert.equal(f.count(), 2); assert.equal(f.db.prepare('SELECT status FROM table_sessions').get().status, 'closed');
  f.ctx.reconcileJournalSales(false); await drain(); assert.equal(f.count(), 2);
});

test('delayed IndexedDB enqueue leaves synchronous write-ahead command until commit', async t => {
  const f = await fixture(t, { indexed: true, enqueue: 'delay' });
  const entry = f.record();
  assert.equal(f.queue().length, 1); assert.equal(f.rows.size, 0); assert.ok(entry.serverSaleId);
  f.release(); await drain();
  assert.equal(f.count(), 1); assert.equal(f.queue().length, 0); assert.equal(f.rows.size, 0);
});

test('IndexedDB mode exposes write-ahead quota failure and journal recovery remains retryable', async t => {
  const f = await fixture(t, { indexed: true, failQueue: true });
  f.record(); await drain();
  assert.equal(f.queue().length, 0); assert.equal(f.rows.size, 0); assert.equal(f.count(), 0);
  assert.equal(f.saved().journal[0].serverSaleId, undefined);
  assert.equal(f.saved().journal[0].saleSyncError, 'queue-storage-full');
  assert.equal(f.live.queueStatus().engine, 'indexeddb');
  assert.equal(f.live.queueStatus().storageError, true);
  assert.equal(f.live.queueStatus().total, 0);
  f.state.failQueue = false; f.ctx.saveProvisional(true); await drain(); assert.equal(f.count(), 1);
});

test('rejected IndexedDB enqueue plus offline fallback stays visible and flush recovers without reload', async t => {
  const f = await fixture(t, { indexed: true, enqueue: 'reject', networkDown: true });
  f.record(); await drain();
  assert.equal(f.queue().length, 1); assert.equal(f.rows.size, 0); assert.equal(f.count(), 0);
  assert.equal(f.live.queueStatus().total, 1);
  f.state.networkDown = false; await f.live.flush(true); await drain();
  assert.equal(f.count(), 1); assert.equal(f.queue().length, 0); assert.equal(f.live.queueStatus().total, 0);
  f.state.enqueue = 'ok'; await f.reload();
  assert.equal(f.count(), 1); assert.equal(f.queue().length, 0);
});

test('explicit Live Link off and unresolved tenant each leave journal-only receipts; full replay heals later', async t => {
  for (const cause of ['off', 'tenant']) {
    const f = await fixture(t);
    if (cause === 'off') f.values.set('kiwiLive', '0'); else f.values.delete('kiwiPairedVenue');
    f.record(); await drain();
    assert.equal(f.count(), 0); assert.equal(f.queue().length, 0); assert.equal(f.ctx.journal[0].serverSaleId, undefined);
    f.values.set('kiwiLive', '1'); f.values.set('kiwiPairedVenue', JSON.stringify({ merchant }));
    assert.equal(f.ctx.reconcileJournalSales(true), 1); await drain(); assert.equal(f.count(), 1);
  }
});

test('restore preserves an exact legacy serverSaleId without inventing missing settlement metadata or acknowledgement', async t => {
  const f = await fixture(t);
  const original = { id: 'legacy-local-receipt', serverSaleId: 'ORIGINAL-server_id:keep-exact',
    time: new Date().toISOString(), amount: 30, method: 'cash', label: 'Legacy', ref: '42' };
  f.ctx.restoreShift({ openedAt: new Date().toISOString(), journal: [original] });
  assert.equal(f.ctx.journal[0].serverSaleId, original.serverSaleId);
  assert.equal(f.ctx.journal[0].id, original.id);
  for (const key of ['orderId', 'table', 'session', 'split', 'amountCents', 'grossAmountCents',
    'discountAmountCents', 'discountReason', 'actorId', 'saleSyncPending', 'saleSyncError']) {
    assert.equal(Object.hasOwn(f.ctx.journal[0], key), false, 'absent legacy field remains absent: ' + key);
  }
  // This old identity alone cannot prove whether a command was ever enqueued.
  // Leave that unknown state intact; never create or rekey a historical sale.
  assert.equal(f.ctx.reconcileJournalSales(true), 0); await drain();
  assert.equal(f.requests.length, 0); assert.equal(f.count(), 0);
});

test('synchronous enqueue exception remains durable in the journal and provisional recovery retries', async t => {
  const f = await fixture(t), actual = f.live.postSale;
  f.live.postSale = () => { throw Error('injected synchronous enqueue failure'); };
  const entry = f.record();
  assert.equal(entry.serverSaleId, undefined); assert.equal(entry.saleSyncError, 'sale-enqueue-failed');
  assert.equal(f.saved().journal[0].saleSyncPending, true);
  assert.equal(f.ctx.reconcileJournalSales(true), 0);
  assert.equal(f.saved().journal[0].saleSyncError, 'sale-enqueue-failed');
  f.live.postSale = actual; f.ctx.saveProvisional(true); await drain();
  assert.equal(f.count(), 1); assert.equal(f.saved().journal[0].saleSyncPending, undefined);
});
