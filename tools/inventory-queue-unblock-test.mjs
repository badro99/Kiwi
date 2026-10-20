#!/usr/bin/env node
/* Kiwi · a refused stock movement never blocks the ones behind it
 * (tools/inventory-queue-unblock-test.mjs)
 *
 * Pasta Corner, October 2026: the till kept selling, the server kept the
 * sales, and from one evening on not a single stock movement reached D1 for
 * three weeks. Nothing was logged. The ledger posts its queue 200 rows at a
 * time; when the server refused the batch for ONE row (a reason it does not
 * know, an id another device had already written with other contents), the
 * till sent the same batch again every twenty seconds, forever, and every
 * sale behind it stayed on the tablet.
 *
 * This loads the real assets/inventory-ledger.js against a server double
 * that applies the same rules as functions/api/inventory/movements.js, and
 * checks:
 *   1. a loss declared as « waste » (the old Stock page) reaches the server
 *      as « loss », and the sale behind it arrives too;
 *   2. a 409 naming an id sets that row aside, the rest goes through;
 *   3. a 400 that names nothing is retried row by row, and only the row the
 *      server refuses alone is set aside;
 *   4. a transient 503 keeps the whole queue for the next pass;
 *   5. a full storage compacts harder instead of dropping the movement, and
 *      compaction never drops a row the server has not acknowledged;
 *   6. the till's heartbeat carries the stock queue and the operator console
 *      raises « Stock bloqué en caisse »;
 *   7. every reason any screen writes is one the server accepts.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
console.log('■ File de stock : un refus ne bloque plus les mouvements derrière lui (tools/inventory-queue-unblock-test.mjs)');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' · ' + detail : '')); }
}

const api = read('functions/api/inventory/movements.js');
const REASONS = new Set([...api.match(/const REASONS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]));

/* ── server double ─────────────────────────────────────────────────────── */
function makeServer() {
  const stored = new Map();          // id -> JSON payload the server keeps
  const srv = { stored, posts: 0, down: false, poison: new Set(), seen: [] };
  const payload = (m) => JSON.stringify([m.itemId, m.qty, m.reason, m.occurredTs, m.unitCost, m.note, m.refId]);
  srv.fetch = async (url, opts = {}) => {
    const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (!opts.method || opts.method === 'GET') return res(200, { movements: [], cursor: 0, more: false });
    srv.posts++;
    if (srv.down) return res(503, { error: 'db' });
    const body = JSON.parse(opts.body);
    const rows = body.movements;
    srv.seen.push(rows.map((r) => r.id));
    if (rows.some((r) => !REASONS.has(r.reason) || srv.poison.has(r.id))) return res(400, { error: 'bad-movement' });
    for (const r of rows) {
      if (stored.has(r.id) && stored.get(r.id) !== payload(r)) return res(409, { error: 'id-conflict', ids: [r.id] });
    }
    const accepted = rows.map((r) => { stored.set(r.id, payload(r)); return { id: r.id, cursor: stored.size }; });
    return res(200, { ok: true, accepted });
  };
  return srv;
}

/* ── one till: a fresh ledger with its own storage ─────────────────────── */
function till(srv, opts = {}) {
  const memory = new Map();
  const quota = opts.quota || Infinity;
  const localStorage = {
    getItem: (k) => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => {
      const total = [...memory].reduce((s, [kk, vv]) => s + (kk === k ? 0 : vv.length), 0) + String(v).length;
      if (total > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      memory.set(k, String(v));
    },
    removeItem: (k) => memory.delete(k),
  };
  const window = {
    localStorage, KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'test-pasta' },
    addEventListener() {},
  };
  window.window = window;
  const ctx = vm.createContext({
    window, localStorage, navigator: { onLine: true }, crypto: globalThis.crypto, fetch: srv.fetch,
    console, Date, Math, JSON, Map, Set, Promise, Number, String, Array, Object, Error,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
  });
  vm.runInContext(read('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });
  return { I: window.KiwiInventory, memory, window };
}
const sale = (I, id, item, qty = 1) => I.add({ id, itemId: item, qty: -qty, reason: 'sale', refType: 'sale', refId: 'T-' + id, occurredTs: 1790800000000 + pass });

/* 1 · « waste » goes out as « loss », and the sale behind it arrives */
{
  const srv = makeServer();
  const { I } = till(srv);
  I.add({ id: 'w1', itemId: 'tomate', qty: -2, reason: 'waste', refType: 'waste', refId: 'waste-1', note: 'Déclaration perte' });
  sale(I, 's1', 'penne');
  await I.sync();
  ok(srv.stored.has('s1'), 'a sale queued behind an old « waste » loss reaches the server', `server holds ${[...srv.stored.keys()].join(',') || 'nothing'}`);
  ok(srv.stored.has('w1') && JSON.parse(srv.stored.get('w1'))[2] === 'loss', 'the « waste » loss itself arrives, under the server reason « loss »');
  ok(I.pending() === 0, 'the queue is empty after one pass', `${I.pending()} still queued`);
}

/* 2 · a 409 that names its id sets that row aside, the rest goes through */
{
  const srv = makeServer();
  srv.stored.set('dup', JSON.stringify(['penne', -1, 'sale-reversal', 1, null, 'another device', 'T-9']));
  const { I } = till(srv);
  I.add({ id: 'dup', itemId: 'penne', qty: 1, reason: 'sale-reversal', refType: 'sale', refId: 'T-9', note: 'this device' });
  sale(I, 's2', 'penne'); sale(I, 's3', 'jus');
  await I.sync();
  ok(srv.stored.has('s2') && srv.stored.has('s3'), 'sales behind an id another device already wrote reach the server');
  ok(I.pending() === 0, 'the conflicting row leaves the queue', `${I.pending()} still queued`);
  const st = I.status();
  ok(st.refused === 1 && st.refusedEntries[0] && st.refusedEntries[0].id === 'dup' && st.refusedEntries[0].why === 'id-conflict',
    'status() reports the refused row and why', JSON.stringify(st.refusedEntries));
  ok(I.balance('penne') === 0, 'the row set aside still counts in the local stock (reversal +1, sale −1 → 0)', `balance ${I.balance('penne')}`);
  await I.sync();
  ok(srv.seen.flat().filter((id) => id === 'dup').length === 1, 'the refused row is never sent again');
}

/* 3 · a 400 naming nothing: one row at a time, only the poison is set aside */
{
  const srv = makeServer();
  srv.poison.add('p1');
  const { I } = till(srv);
  sale(I, 'a1', 'penne'); I.add({ id: 'p1', itemId: 'sel', qty: -0.001, reason: 'sale', refType: 'sale', refId: 'T-p' }); sale(I, 'a2', 'jus');
  await I.sync();
  ok(srv.stored.has('a1') && srv.stored.has('a2') && !srv.stored.has('p1'), 'an unexplained 400 is retried row by row and the good rows land');
  ok(I.pending() === 0 && I.status().refused === 1, 'only the row refused on its own is set aside', JSON.stringify(I.status()));
  ok(I.status().lastStatus === 400 && I.status().lastError === 'bad-movement', 'the last refusal is kept for the heartbeat', `${I.status().lastStatus} ${I.status().lastError}`);
}

/* 4 · a transient failure keeps everything for the next pass */
{
  const srv = makeServer();
  srv.down = true;
  const { I } = till(srv);
  sale(I, 't1', 'penne'); sale(I, 't2', 'jus');
  const r = await I.sync();
  ok(r === false && I.pending() === 2 && I.status().refused === 0, 'a 503 sets nothing aside and keeps the queue', `pending ${I.pending()}, refused ${I.status().refused}`);
  ok(I.status().lastStatus === 503, 'the 503 is reported', String(I.status().lastStatus));
  srv.down = false;
  await I.sync();
  ok(srv.stored.has('t1') && srv.stored.has('t2') && I.pending() === 0, 'the queue drains once the server is back');
}

/* 5 · storage: compaction never drops an unacknowledged row; a full storage compacts harder */
{
  const srv = makeServer();
  srv.down = true;  // nothing gets acknowledged
  const { I } = till(srv);
  for (let i = 0; i < 6100; i++) sale(I, 'q' + i, 'penne');
  ok(I.pending() === 6100, 'past 6 000 rows, every unacknowledged movement is still queued', `${I.pending()} queued of 6100`);
  ok(Math.abs(I.balance('penne') + 6100) < 1e-6, 'and still counted in the local stock', `balance ${I.balance('penne')}`);
}
{
  const srv = makeServer();
  /* A till whose storage holds about 2 000 rows: acknowledged history is folded
   * into the base balance so new sales still persist and queue. */
  const probe = till(makeServer());
  sale(probe.I, 'probe', 'penne');
  const perRow = [...probe.memory.values()][0].length;
  const { I } = till(srv, { quota: perRow * 2000 });
  let i = 0;
  for (; i < 2500; i++) { sale(I, 'h' + i, 'penne'); if (i % 200 === 199) await I.sync(); }
  await I.sync();
  sale(I, 'late', 'jus');
  ok(I.pending() === 1 && !I.status().storageError, 'with a full storage the next sale is still saved and queued', `pending ${I.pending()}, storageError ${I.status().storageError}`);
  ok(Math.abs(I.balance('penne') + 2500) < 1e-6, 'folded history keeps the balance exact', `balance ${I.balance('penne')}`);
  await I.sync();
  ok(srv.stored.has('late'), 'and reaches the server');
}
{
  const srv = makeServer();
  srv.down = true;
  const probe = till(makeServer());
  sale(probe.I, 'probe', 'penne');
  const perRow = [...probe.memory.values()][0].length;
  const { I } = till(srv, { quota: perRow * 50 });
  for (let i = 0; i < 80; i++) sale(I, 'f' + i, 'penne');
  ok(I.status().storageError === true, 'when even compaction cannot fit the queue, status() says the storage is full');
}

/* 6 · heartbeat and operator console */
const ops = read('assets/operations.js');
ok(/stock:\s*stock/.test(ops) && /KiwiInventory\.status/.test(ops), 'the till heartbeat carries the stock queue (KiwiInventory.status)');
const ws = read('functions/api/admin/_workspace.js');
ok(/stock:\s*beat\.stock/.test(ws) && /refusedEntries/.test(ws), 'the operator workspace normalises the stock block of a heartbeat');
const aw = read('assets/admin-workspace.js');
ok(/Stock bloqué en caisse/.test(aw) && /r\.stock/.test(aw), 'the operator console raises « Stock bloqué en caisse »');

/* 7 · every reason a screen writes is one the server accepts */
const WIRE = (() => {
  const m = read('assets/inventory-ledger.js').match(/var WIRE_REASON = \{([^}]*)\}/);
  return new Set(m ? [...m[1].matchAll(/([a-z-]+):/g)].map((x) => x[1]) : []);
})();
const sources = [...fs.readdirSync(path.join(root, 'assets')).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f), 'kiwi-caisse.html', 'dashboard.html'];
const bad = [];
for (const f of sources) {
  const src = read(f);
  for (const m of src.matchAll(/(?:KiwiInventory|\bI|\bInv|\binv)\??\.add\(\{([\s\S]{0,700}?)\}\)/g)) {
    const r = /reason:\s*'([a-z-]+)'/.exec(m[1]);
    if (r && !REASONS.has(r[1])) bad.push(`${f}: ${r[1]}`);
  }
}
ok(bad.length === 0, 'every literal reason written to KiwiInventory is a server reason', bad.join(' · '));
ok(['waste'].every((r) => !REASONS.has(r) && WIRE.has(r)), 'the legacy « waste » is mapped before it is sent');

console.log(`\n${fail ? '✗' : '✓'} inventory-queue-unblock-test · ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
