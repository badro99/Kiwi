#!/usr/bin/env node
/* tools/caisse-outbox-full-test.mjs · a paid sale when the till's storage is full.
 *   node tools/caisse-outbox-full-test.mjs
 *
 * Audit direction-critique-6, blocker B1 and polish 10. When localStorage is
 * full, Live Link refuses the sale (`queue-storage-full`). The money is
 * already in the drawer, so the till must:
 *   · keep exactly ONE journal entry for it, never a second on a re-tap;
 *   · tell the cashier it is recorded (never "failed", which invites a
 *     second charge) and count it in a persistent held-sales indicator;
 *   · withhold the success haptic until the queue has really taken it;
 *   · replay it on its own until it is queued, and reach the sale API once.
 * Covered for a takeaway, a table and a split share, with localStorage alone,
 * with IndexedDB taking over, and across a reload where the shift blob itself
 * could not be saved.
 *
 * It runs the ACTUAL functions of kiwi-caisse.html and the whole of
 * assets/live-link.js in a vm, against the actual middleware and /api/sale on
 * an in-memory SQLite. Local fixture only: no HTTP server, no network, no
 * merchant data (the tenant is a made-up slug).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { tillToken, TILL_COOKIE, staffToken, GATE_COOKIE } from '../functions/auth/_lib.js';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('kiwi-caisse.html'), live = read('assets/live-link.js');
const extract = name => {
  const start = page.indexOf('    function ' + name + '(');
  const end = page.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, 'actual function exists: ' + name);
  return page.slice(start, end + 6);
};
const asyncExtract = name => {
  const start = page.indexOf('    async function ' + name + '(');
  const end = page.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, 'actual async function exists: ' + name);
  return page.slice(start, end + 6);
};
const heldBlock = (() => {
  const start = page.indexOf('    /* ── VENDUE ICI, PAS ENCORE DANS LA FILE');
  const end = page.indexOf('    function recordSale(', start);
  assert.ok(start >= 0 && end > start, 'held-sales block exists');
  return page.slice(start, end);
})();
const drain = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };
const merchant = 'outbox-full-fixture';
const shiftKey = 'kiwi-caisse-shift:' + merchant;

async function fixture(t, opts = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(read('schema.sql'));
  const env = {
    AUTH_SECRET: 'memory-only-outbox-full-fixture-secret',
    SITE_PASSWORD: 'memory-only-outbox-full-gate',
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
    .run(merchant, 'Outbox fixture', 'restaurant', 'active', '{}', Date.now());
  /* `full`: localStorage refuses EVERY write, as a real quota does, so the
     shift blob fails too. `idbEnqueue`: 'ok' | 'reject' for the IndexedDB
     outbox; its meta shelf keeps working (a separate, larger quota). */
  const state = { full: false, idbEnqueue: 'ok', ...opts };
  const values = new Map([['kiwiLive', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant })]]);
  const rows = new Map(), meta = new Map(), requests = [];
  let events = [];
  const storage = {
    getItem: k => values.get(k) ?? null,
    setItem(k, v) { if (state.full) { const e = Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } values.set(k, String(v)); },
    removeItem: k => values.delete(k),
  };
  const queue = () => JSON.parse(values.get('kiwiSaleQueue') || '[]');
  const offline = {
    available: () => true, subscribe() {},
    async migrateLegacy() { for (const payload of queue()) rows.set(payload.id, { id: payload.id, payload }); storage.removeItem('kiwiSaleQueue'); },
    async stats() { return { total: rows.size, pending: rows.size, blocked: 0, sending: 0 }; },
    async enqueue(channel, tenant, payload) {
      assert.equal(channel, 'sale'); assert.equal(tenant, merchant);
      if (state.idbEnqueue === 'reject') throw Error('injected IndexedDB quota');
      rows.set(payload.id, { id: payload.id, payload });
    },
    async claim(_channel, _tenant, options) { return [...rows.values()].find(r => options.force || !r.nextAt || r.nextAt <= Date.now()) || null; },
    async acknowledge(id) { rows.delete(id); },
    async reject(id) { rows.get(id).nextAt = Date.now() + 3000; },
    async getMeta(key) { return meta.has(key) ? JSON.parse(meta.get(key)) : null; },
    async putMeta(key, value) { meta.set(key, JSON.stringify(value)); return true; },
  };
  function boot() {
    const handlers = new Map();
    const document = { readyState: 'complete', hidden: false, addEventListener() {}, dispatchEvent(e) { events.push(e); }, createElement: () => ({}) };
    const window = { localStorage: storage, document, KiwiEnv: { isReal: () => true },
      addEventListener(type, fn) { (handlers.get(type) || handlers.set(type, []).get(type)).push(fn); },
      dispatchEvent(e) { events.push(e); (handlers.get(e.type) || []).forEach(fn => fn(e)); },
      ...(opts.indexed ? { KiwiOffline: offline } : {}) };
    const order = { opId: 'ord-outbox-fixture', num: 7, type: 'takeaway', status: 'ready' };
    const context = {
      console, window, document, localStorage: storage, navigator: { onLine: true },
      location: { search: '', hostname: 'kiwi.test' }, URLSearchParams, Date, AbortController,
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
      setTimeout: () => 0, clearTimeout() {},
      fetch: async (url, init) => {
        if (url.startsWith('/api/feed?')) return Response.json({ sales: [], voided: [] });
        assert.equal(url, '/api/sale', 'Live Link cannot reach the network');
        const body = JSON.parse(init.body), attempt = { body };
        requests.push(attempt);
        const request = new Request('https://kiwi.test/api/sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: init.body,
        });
        const deferred = [];
        const ctx = { env, request, waitUntil: p => deferred.push(p) };
        const response = await gate({ ...ctx, next: () => salePost(ctx) });
        await Promise.all(deferred);
        attempt.status = response.status;
        return response;
      },
      journal: [], lastSaleId: null, mode: 'vrap', vrapEditingNum: null, kdsOrders: [], kdsOrderSeq: 0,
      registerClosing: false, lastProvisional: 0,
      toast: (message, ms, kind) => events.push({ type: 'toast', message, kind }),
      currentCashier: { id: 'cashier-local', name: 'Fixture cashier' },
      tables: { '5': { zone: 'salle', orderNo: '41', covers: 2 } }, tableOrders: {}, orders: {}, tableSplits: new Map(),
      splitState: { flow: null, sourceLines: [] }, generateOrder: () => [],
      tableClosedAt: Object.create(null), phoneMovedVisits: new Map(),
      vrapSplit: null, cart: [], vrapDiscount: null, selectedId: null, splitPayCallback: null,
      shiftOpenedAt: new Date('2026-10-13T08:00:00.000Z'), shiftOpenedBy: 'Fixture cashier', openingFloat: 0,
      cashMovements: [], shift: { discounts: 0, refunds: 0, tablesPaid: 0 },
      posteOpenedAt: null, posteOpeningFloat: 0, handovers: [],
      KC_STORE: shiftKey, shiftMerchant: merchant, SERVICE_BILL_SYNC_VERSION: 1, ORDER_BRIDGE_SYNC_VERSION: 1,
      currentMerchantSlug: () => merchant, storeIsReal: () => true, staleQueuedServerTicket: () => false,
      money: n => Math.round((Number(n) || 0) * 100) / 100, minor: n => Math.round(Number(n) * 100),
      accountActiveDiscount() {}, discountReasonCode: () => 'commercial',
      phoneSessionOf: () => state.session || '', ticketNo: o => String(o.num), genRef: () => 'fixture-ref',
      attachReceipt: entry => { entry.rc = { ref: entry.ref }; }, creditSaleToClient() {},
      renderShiftStats() {}, renderJournal() {}, refreshOpenReconciliationModals() {}, updateKdsCount() {},
      $: () => ({ classList: { contains: () => false }, style: {} }),
      /* finalizeTender's surroundings: the UI it paints is not under test. */
      dispatchUnsentKitchenBeforePayment: () => (context.mode === 'vrap' ? order : null),
      awaitCanonicalTicketNumber: async () => {},
      currentTotal: () => context.amount, payTipAmount: () => 0,
      currentSaleLines: () => [{ name: 'Pasta', qty: 1, price: context.amount, total: context.amount }],
      settleVrapPayment() {}, markPaid() {}, closeRightPanel() {},
      renderSplitFlow() {}, openCashDrawer() {}, printSaleTicket() {}, lastSaleEntry: () => null,
      lucide: { createIcons() {} }, amount: 30,
    };
    vm.createContext(context);
    vm.runInContext(live, context, { filename: 'assets/live-link.js' });
    vm.runInContext(['tableSaleLabel', 'settledOrderLabel', 'settledOrderRef', 'paidReceiptForCurrentTable',
      'activeSaleDiscount', 'recordSale', 'persistShift', 'reviveJournalEntry', 'restoreShift',
      'reconcileJournalSales', 'saveProvisional', 'nativeHapticSuccess', 'markSplitPartPaid'].map(extract).join('\n')
      + '\n' + asyncExtract('finalizeTender') + '\n' + heldBlock, context, { filename: 'kiwi-caisse-outbox-functions.js' });
    const ack = page.match(/window\.addEventListener\('kiwi:money-sync',[\s\S]*?\n    \}\);/);
    assert.ok(ack, 'caisse listens for money-sync on window');
    vm.runInContext(ack[0], context, { filename: 'kiwi-caisse-money-sync.js' });
    return context;
  }
  let ctx = boot(); await drain();
  return {
    db, state, values, rows, requests,
    get ctx() { return ctx; },
    get events() { return events; },
    clearEvents() { events = []; },
    haptics: () => events.filter(e => e.type === 'kiwi:native-haptic' && e.detail && e.detail.kind === 'success').length,
    toasts: () => events.filter(e => e.type === 'toast').map(e => e.message),
    held: () => ctx.window.KiwiCaisseHeldSales.count(),
    count: id => (id ? db.prepare('SELECT COUNT(*) AS n FROM sales WHERE id = ?').get(id).n
      : db.prepare('SELECT COUNT(*) AS n FROM sales').get().n),
    entries: id => ctx.journal.filter(e => e && e.id === id),
    /* A reload: the saved shift blob comes back, then the boot path adopts
       held rows exactly as kiwi-caisse.html does after restoreShift(). */
    reload: async () => {
      const saved = JSON.parse(values.get(shiftKey));
      ctx = boot();
      ctx.restoreShift(saved);
      ctx.adoptHeldSalesIntoJournal();
      await drain();
    },
    /* The till's five-second beat (setInterval in kiwi-caisse.html). */
    tick: async () => { try { ctx.saveProvisional(true); } catch (_) {} ctx.retryHeldSales(); await drain(); },
    session: () => {
      state.session = 'visit-outbox-fixture';
      db.prepare("INSERT INTO table_sessions (id,merchant,table_no,opened_ts,seen_ts) VALUES (?,?,'5',?,?)")
        .run(state.session, merchant, Date.now(), Date.now());
    },
  };
}

const saysRecorded = toasts => toasts.some(m => /enregistrée sur cette caisse/.test(m) && /ne pas encaisser à nouveau/.test(m));
const saysFailed = toasts => toasts.some(m => /Échec|échec|failed|réessayez/i.test(m));

test('the success haptic probe works: a healthy takeaway buzzes once and reaches the API once', async t => {
  const f = await fixture(t);
  f.ctx.mode = 'vrap';
  assert.equal(await f.ctx.finalizeTender('cash'), 'complete');
  await drain();
  assert.equal(f.haptics(), 1);
  assert.equal(f.ctx.journal.length, 1);
  assert.equal(f.count(), 1);
  assert.equal(f.held(), 0);
});

test('takeaway · localStorage full, no IndexedDB: one entry, no haptic, no re-charge, sent once storage frees', async t => {
  const f = await fixture(t);
  f.ctx.mode = 'vrap';
  f.state.full = true;
  assert.equal(await f.ctx.finalizeTender('cash'), 'complete', 'the sale completes at the till');
  await drain();
  const id = f.ctx.journal[0] && f.ctx.journal[0].id;
  assert.ok(id, 'the receipt is in the journal');
  assert.equal(f.ctx.journal.length, 1, 'exactly one journal entry');
  assert.equal(f.ctx.journal[0].saleHeldLocal, true);
  assert.equal(f.ctx.journal[0].saleSyncError, 'queue-storage-full');
  assert.equal(f.haptics(), 0, 'no success haptic while the queue refused it');
  assert.ok(saysRecorded(f.toasts()), 'the cashier is told it is recorded, not to charge again');
  assert.ok(!saysFailed(f.toasts()), 'nothing says it failed');
  assert.equal(f.held(), 1, 'the indicator counts it');
  assert.equal(f.count(), 0, 'nothing reached the API yet');

  /* The cashier taps Encaisser again on the same takeaway: same OrderPro
     receipt, no second booking, still no success haptic. */
  assert.equal(await f.ctx.finalizeTender('cash'), 'complete');
  assert.equal(f.ctx.journal.length, 1, 'a second tap books nothing');
  assert.equal(f.haptics(), 0);

  /* The beat while storage is still full changes nothing. */
  await f.tick();
  assert.equal(f.held(), 1); assert.equal(f.count(), 0);

  f.state.full = false;
  await f.tick();
  assert.equal(f.held(), 0, 'released once queued');
  assert.equal(f.count(), 1, 'the API holds exactly one sale');
  assert.equal(f.entries(id).length, 1);
  assert.ok(f.ctx.journal[0].serverSaleId);
  assert.equal(f.ctx.journal[0].saleHeldLocal, undefined);
  assert.equal(f.ctx.journal[0].saleSyncPending, undefined, 'server acknowledgement clears the debt');

  await f.tick(); f.ctx.reconcileJournalSales(false); await drain();
  assert.equal(f.count(), 1, 'later replays never book it twice');
});

test('table · localStorage full: IndexedDB takes it on its own; a second tap books nothing', async t => {
  const f = await fixture(t, { indexed: true });
  f.session();
  f.ctx.mode = 'salle'; f.ctx.selectedId = '5'; f.ctx.amount = 95;
  f.state.full = true;
  assert.equal(await f.ctx.finalizeTender('cash'), 'complete');
  assert.equal(f.ctx.journal.length, 1, 'exactly one journal entry');
  assert.equal(f.ctx.journal[0].table, '5');
  assert.equal(f.haptics(), 0, 'no success haptic at the refused write-ahead');
  assert.ok(saysRecorded(f.toasts()) && !saysFailed(f.toasts()));

  /* localStorage stays full; IndexedDB's own quota is not. */
  await drain();
  assert.equal(f.count(), 1, 'reached the API through IndexedDB');
  assert.equal(f.held(), 0);
  assert.equal(f.ctx.journal[0].saleHeldLocal, undefined);

  /* Before the critique's fix, paidReceiptForCurrentTable() returned this
     receipt early and it was never queued again. Now a re-tap is harmless. */
  assert.equal(await f.ctx.finalizeTender('cash'), 'complete');
  assert.equal(f.ctx.journal.length, 1, 'a second tap on the table books nothing');
  await f.tick();
  assert.equal(f.count(), 1);
});

test('split share · both stores refuse, reload loses the shift blob: share adopted once, sent once', async t => {
  const f = await fixture(t, { indexed: true });
  f.session();
  f.ctx.mode = 'salle'; f.ctx.selectedId = '5';
  f.ctx.splitState = {
    tableId: '5', sourceLabel: 'Table 5', isVrap: false, total: 60, splitMode: 'equal', sourceLines: [],
    flow: { id: 'flow-outbox', paidCount: 0, parts: [
      { amount: 30, base: 30, tip: 0, lines: [{ name: 'Pasta', qty: 1, price: 30, total: 30 }] },
      { amount: 30, base: 30, tip: 0, lines: [{ name: 'Salade', qty: 1, price: 30, total: 30 }] },
    ] },
  };
  f.ctx.persistShift();                       // the last good shift blob, before the quota
  f.state.full = true; f.state.idbEnqueue = 'reject';
  f.ctx.splitPayCallback = () => f.ctx.markSplitPartPaid(0, 'cash');
  assert.equal(await f.ctx.finalizeTender('cash'), 'split');
  await drain();
  const share = f.ctx.journal[0];
  assert.equal(f.ctx.journal.length, 1, 'exactly one journal entry for the share');
  assert.deepEqual(share.split && { index: share.split.index, count: share.split.count }, { index: 0, count: 2 });
  assert.equal(f.ctx.splitState.flow.parts[0].paid, true, 'the share is paid, it is not offered again');
  assert.equal(f.haptics(), 0, 'no success haptic on the refused share');
  assert.equal(f.held(), 1);
  assert.equal(f.count(), 0);
  assert.equal(JSON.parse(f.values.get(shiftKey)).journal.length, 0, 'the shift blob itself could not be saved');

  /* Reload with storage still full: the journal comes back without the share,
     the IndexedDB shelf puts it back, once. */
  await f.reload();
  assert.equal(f.entries(share.id).length, 1, 'adopted back into the journal exactly once');
  assert.equal(f.ctx.journal[0].saleHeldLocal, true);
  assert.equal(f.held(), 1);
  f.ctx.adoptHeldSalesIntoJournal(); await drain();
  assert.equal(f.entries(share.id).length, 1, 'adoption is idempotent');

  /* IndexedDB accepts again (localStorage still full): the beat queues it. */
  f.state.idbEnqueue = 'ok';
  await f.tick(); await drain();
  assert.equal(f.held(), 0);
  assert.equal(f.count(), 1, 'the share reached the API once');
  const body = f.requests.find(r => r.status === 200).body;
  assert.deepEqual({ index: body.split.index, count: body.split.count }, { index: 0, count: 2 });
  await f.tick(); f.ctx.reconcileJournalSales(false); await drain();
  assert.equal(f.count(), 1);
});

test('a held sale from a closed shift is replayed to the queue but never added to the next shift', async t => {
  const f = await fixture(t, { indexed: true });
  f.ctx.mode = 'vrap';
  f.state.full = true; f.state.idbEnqueue = 'reject';
  await f.ctx.finalizeTender('cash'); await drain();
  assert.equal(f.held(), 1);
  /* A new shift opens on this till (the previous Z is closed). */
  f.ctx.journal.length = 0;
  f.ctx.shiftOpenedAt = new Date('2026-10-13T20:00:00.000Z');
  assert.equal(f.ctx.adoptHeldSalesIntoJournal(), 0, 'not counted into another shift');
  assert.equal(f.ctx.journal.length, 0);
  f.state.idbEnqueue = 'ok';
  await f.tick(); await drain();
  assert.equal(f.held(), 0);
  assert.equal(f.count(), 1, 'still reaches the API once');
});
