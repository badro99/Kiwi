import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/sale.js';
import { tillToken } from '../functions/auth/_lib.js';

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const merchant = 'recovery-test', now = Date.now() - 10000;
  db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'pro', 'restaurant', 'active', 'Recovery test', now);
  const doc = (feature, data) => db.prepare('INSERT OR REPLACE INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?)')
    .run(merchant, feature, JSON.stringify(data), Date.now());
  doc('floorplan', { tables: [{ num: '5' }] });
  const occupy = () => doc('service-events', { states: { '5': { status: 'ka-yaklo', covers: 4 } }, events: [] });
  const visit = (id, ts) => db.prepare('INSERT INTO table_sessions (id,merchant,table_no,opened_ts,seen_ts) VALUES (?,?,?,?,?)').run(id, merchant, '5', ts, ts);
  visit('old-visit', now); occupy();
  let hook = async () => {};
  const DB = { prepare(sql) {
    let args = [];
    return { bind(...v) { args = v; return this; },
      async first() { await hook(sql, 'first'); return db.prepare(sql).get(...args) || null; },
      async all() { await hook(sql, 'all'); return { results: db.prepare(sql).all(...args) }; },
      async run() { if (await hook(sql, 'run') === 'skip') return { meta: { changes: 0 } }; const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    };
  } };
  const env = { DB, AUTH_SECRET: 'local-recovery-fixture-secret-only' };
  const cookie = await tillToken(env.AUTH_SECRET, merchant);
  const post = async () => {
    const res = await onRequestPost({ env, request: new Request('https://kiwi.test/api/sale', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `kiwi_till=${cookie}` },
      body: JSON.stringify({ merchant, table: '5', session: 'old-visit', id: 'local-receipt', amount: 60, amountCents: 6000, method: 'cash' }),
    }) });
    assert.equal(res.status, 200);
    return res.json();
  };
  const state = () => JSON.parse(db.prepare("SELECT data FROM store_docs WHERE feature='service-events'").get().data);
  const session = () => db.prepare("SELECT * FROM table_sessions WHERE id='old-visit'").get();
  return { db, post, state, session, occupy, setHook: f => { hook = f; },
    newer() { visit('new-visit', Date.now()); occupy(); },
    order(id, sessionId, ts = Date.now()) {
      db.prepare(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
        VALUES (?, ?, 1, 'table', '5', 60, '[]', 'served', ?, ?, ?)`).run(id, merchant, ts, ts, sessionId);
    },
  };
}

for (const boundary of ['close', 'finalize']) test(`${boundary} failure stays pending and recovers once`, async () => {
  const f = await fixture();
  f.setHook(async (sql, op) => {
    if (op === 'run' && sql.includes(boundary === 'close' ? "SET status = 'closed'" : "SET closed_by = 'service-payment'")) throw Error('injected write outage');
  });
  assert.equal((await f.post()).settlementPending, true);
  if (boundary === 'close') assert.equal(f.state().states['5'].status, 'ka-yaklo');
  f.setHook(async () => {});
  assert.equal((await f.post()).settlementPending, undefined);
  assert.equal(f.session().status, 'closed');
  assert.equal(f.session().closed_by, 'service-payment');
  assert.equal(f.state().states['5'].status, 'khawya');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 1);
  f.db.close();
});

for (const boundary of ['close', 'finalize']) test(`${boundary} zero-row update is not success`, async () => {
  const f = await fixture();
  f.setHook(async (sql, op) => {
    if (op === 'run' && sql.includes(boundary === 'close' ? "SET status = 'closed'" : "SET closed_by = 'service-payment'")) return 'skip';
  });
  assert.equal((await f.post()).settlementPending, true);
  f.setHook(async () => {});
  assert.equal((await f.post()).settlementPending, undefined);
  f.db.close();
});

test('failed orders remain pending and recover without a second receipt', async () => {
  const f = await fixture(); f.order('old-order', 'old-visit');
  f.setHook(async (sql, op) => { if (op === 'run' && sql.startsWith('UPDATE orders')) throw Error('injected order failure'); });
  assert.equal((await f.post()).settlementPending, true);
  assert.equal(f.db.prepare("SELECT paid_ts FROM orders WHERE id='old-order'").get().paid_ts, null);
  f.setHook(async () => {}); await f.post();
  assert.ok(f.db.prepare("SELECT paid_ts FROM orders WHERE id='old-order'").get().paid_ts);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 1);
  f.db.close();
});

test('parallel caisse close may arrive before the money command', async () => {
  const f = await fixture(); f.order('old-order', 'old-visit');
  f.db.prepare("UPDATE table_sessions SET status='closed', closed_by='caisse', closed_ts=? WHERE id='old-visit'").run(Date.now());
  assert.equal((await f.post()).settlementPending, undefined);
  assert.equal(f.session().closed_by, 'service-payment');
  assert.equal(f.state().states['5'].status, 'khawya');
  f.db.close();
});

test('zero-row order write cannot abandon an eligible unlinked receipt', async () => {
  const f = await fixture(); f.order('unlinked-order', null);
  f.setHook(async (sql, op) => { if (op === 'run' && sql.startsWith('UPDATE orders')) return 'skip'; });
  assert.equal((await f.post()).settlementPending, true);
  f.setHook(async () => {});
  assert.equal((await f.post()).settlementPending, undefined);
  assert.ok(f.db.prepare("SELECT paid_ts FROM orders WHERE id='unlinked-order'").get().paid_ts);
  f.db.close();
});

test('new visit at order-write boundary cannot pay its unlinked orders', async () => {
  const f = await fixture(); f.order('old-order', 'old-visit');
  let raced = false;
  f.setHook(async (sql, op) => {
    if (!raced && op === 'run' && sql.startsWith('UPDATE orders')) {
      raced = true; f.newer();
      // Same-millisecond legacy order: timestamp range alone cannot protect it.
      f.order('new-order', null, f.session().closed_ts);
    }
  });
  await f.post(); assert.equal(raced, true);
  assert.equal(f.db.prepare("SELECT paid_ts FROM orders WHERE id='new-order'").get().paid_ts, null);
  assert.ok(f.db.prepare("SELECT paid_ts FROM orders WHERE id='old-order'").get().paid_ts);
  assert.equal(f.state().states['5'].status, 'ka-yaklo');
  f.db.close();
});

test('new visit at floor INSERT boundary cannot receive an old free-table event', async () => {
  const f = await fixture();
  f.db.prepare("DELETE FROM store_docs WHERE feature='service-events'").run();
  let raced = false;
  f.setHook(async (sql, op) => {
    if (!raced && op === 'run' && sql.startsWith('INSERT OR IGNORE INTO store_docs')) { raced = true; f.newer(); }
  });
  await f.post(); assert.equal(raced, true);
  assert.equal(f.state().states['5'].status, 'ka-yaklo');
  assert.equal(f.state().events.length, 0);
  f.db.close();
});

test('ownership read outage cannot clear a newer party', async () => {
  const f = await fixture(); await f.post(); f.newer();
  f.setHook(async (sql, op) => { if (op === 'first' && sql.includes('AND id <> ?')) throw Error('injected ownership read outage'); });
  assert.equal((await f.post()).settlementPending, true);
  assert.equal(f.state().states['5'].status, 'ka-yaklo');
  f.setHook(async () => {});
  assert.equal((await f.post()).settlementPending, undefined);
  assert.equal(f.state().states['5'].status, 'ka-yaklo');
  f.db.close();
});

test('new visit between ownership check and floor UPDATE is protected', async () => {
  const f = await fixture(); await f.post(); f.occupy();
  let raced = false;
  f.setHook(async (sql, op) => {
    if (!raced && op === 'run' && sql.startsWith('UPDATE store_docs SET data')) { raced = true; f.newer(); }
  });
  await f.post(); assert.equal(raced, true);
  assert.equal(f.state().states['5'].status, 'ka-yaklo');
  assert.equal(f.state().events.length, 0);
  f.db.close();
});

test('reference-authority void survives a delayed active response', () => {
  const html = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
  const start = html.indexOf('    function journalEntryMatchesCloudSale(');
  const end = html.indexOf('    /* Reconcile this OPEN SERVICE', start);
  const now = Date.now();
  const journal = [{ id: 'ref-void', amount: 50, time: new Date(now - 10000), ref: '260907-0001-Q2', voided: true, voidAuthority: 'ref', voidAt: now, voidTs: now }];
  const ctx = vm.createContext({ journal, money: Number, window: {}, shiftOpenedAt: new Date(now - 20000), Date,
    activeCloudSaleIds: new Set(), persistShift() {}, saveProvisional() {}, renderShiftStats() {}, refreshOpenReconciliationModals() {},
    $: () => ({ classList: { contains: () => false } }),
  });
  vm.runInContext(html.slice(start, end), ctx);
  const sale = { id: 'ref-void', amount: 50, ts: now - 10000, ref: '260907-0001-Q2' };
  ctx.ingestSettledCloudSales([sale], { requestTime: now - 1000 });
  assert.equal(journal[0].voided, true);
  ctx.ingestSettledCloudSales([sale], { requestTime: now + 1000 });
  assert.equal(journal[0].voided, false);
});
