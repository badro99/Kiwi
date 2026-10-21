import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, LEGACY_SLUG } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/feed.js';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const secret = 'void-stream-test-only', merchant = 'void-fixture';
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { assert.ok(v.length <= 100); args = v; return this; },
  first() { return db.prepare(sql).get(...args) || null; },
  all() { return { results: db.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
function store(slug, aid = null) { db.prepare("INSERT INTO merchant_config (merchant, account_id, features, status, updated_ts) VALUES (?, ?, '{}', 'active', 1)").run(slug, aid); }
function account(id, business) { db.prepare('INSERT INTO accounts (id, email, business, salt, hash, created_ts, session_epoch) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, id + '@x.test', business, 's', 'h', Date.now()); }
const add = (id, m, vts, ts = 100) => db.prepare('INSERT INTO sales (id, merchant, amount, method, ref, ts, void_ts) VALUES (?, ?, 10, ?, ?, ?, ?)').run(id, m, 'cash', 'R-' + id, ts, vts);
store(merchant);
const till = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
const owner = async (id, epoch = 1) => `${SESS_COOKIE}=${await makeSession(id, secret, epoch)}`;
async function get(query, { m = merchant, cookies = till, status = 200 } = {}) {
  const response = await onRequestGet({ request: new Request('https://kiwi.test/api/feed?merchant=' + m + query, { headers: { Cookie: cookies } }), env });
  assert.equal(response.status, status, query); return response;
}
const json = async (query, options) => (await get(query, options)).json();
const oldNow = Date.now; Date.now = () => 1800000000000;
try {
  add('seed-b', merchant, 200, 300); add('seed-a', merchant, 200, 200); add('seed-c', merchant, 201);
  add('foreign', 'foreign-tenant', 200); add('live', merchant, null);
  const legacy = await (await get('&voids=1')).text();
  assert.equal(legacy, fs.readFileSync(new URL('./fixtures/feed-voids-legacy.json', import.meta.url), 'utf8').trim(), 'byte-for-byte untouched HEAD voidsOnly fixture');
  assert.equal(await (await get('&voids=1&after=ignored')).text(), legacy);
  assert.equal(await (await get('&voids=0&since=0')).json().then(d => d.sales.length), 1);
  add('negative-marker', merchant, -10); add('zero-marker', merchant, 0);
  for (let i = 0; i < 1003; i++) add('void-' + i, merchant, 300 + Math.floor(i / 3));
  // Compare tied latest-500 results with and without the optional stream index.
  const indexedLegacy = await (await get('&voids=1')).text();
  const legacyPlan = db.prepare('EXPLAIN QUERY PLAN SELECT rowid, id, ref, ts, void_ts FROM sales WHERE merchant IN (?, ?) AND void_ts IS NOT NULL ORDER BY void_ts DESC LIMIT 500').all(merchant, merchant).map(r => r.detail).join('\n');
  assert.ok(!legacyPlan.includes('idx_sales_merchant_void_ts'));
  const newPlan = db.prepare('EXPLAIN QUERY PLAN SELECT rowid, id, ref, ts, void_ts FROM sales WHERE merchant IN (?, ?) AND void_ts IS NOT NULL AND void_ts >= 0 AND (void_ts > ? OR (void_ts = ? AND rowid > ?)) ORDER BY void_ts ASC, rowid ASC LIMIT 51').all(merchant, merchant, 0, 0, 0).map(r => r.detail).join('\n');
  assert.ok(newPlan.includes('idx_sales_merchant_void_ts'), newPlan);
  db.exec('DROP INDEX idx_sales_merchant_void_ts');
  assert.equal(await (await get('&voids=1')).text(), indexedLegacy);
  assert.equal((await json('&voids=1&afterVoid=&limit=50')).voided.length, 50, 'stream works without migration');
  db.exec('CREATE INDEX idx_sales_merchant_void_ts ON sales (merchant, void_ts) WHERE void_ts >= 0');
  let pages = 0, eof;
  for (const limit of [50, 500]) {
    let after = '', rows = [];
    do {
      const data = await json('&voids=1&limit=' + limit + '&afterVoid=' + encodeURIComponent(after));
      pages++; assert.equal(data.merchant, merchant); assert.equal(data.complete, data.next === null); assert.ok(data.voided.length <= limit);
      rows.push(...data.voided); after = data.next; eof = data;
    } while (after);
    assert.equal(rows.length, 1008); assert.equal(new Set(rows.map(r => r.c)).size, 1008);
    assert.ok(rows.every(r => r.i !== 'foreign' && r.i !== 'live'));
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].vts > rows[i - 1].vts || (rows[i].vts === rows[i - 1].vts && rows[i].c > rows[i - 1].c));
    assert.deepEqual(Object.keys(rows[0]).sort(), ['c', 'i', 'r', 'ts', 'vts']);
  }
  const empty = await json('&voids=1&afterVoid=' + encodeURIComponent(eof.checkpoint));
  assert.deepEqual(empty.voided, []); assert.equal(empty.complete, true); assert.equal(empty.checkpoint, eof.checkpoint);
  add('after-eof', merchant, 1000);
  assert.deepEqual((await json('&voids=1&afterVoid=' + encodeURIComponent(eof.checkpoint))).voided.map(r => r.i), ['after-eof']);
  const page = await json('&voids=1&afterVoid=&limit=50');
  for (const token of ['!', 'eyJ4IjoxfQ', page.next.slice(0, -3)]) await get('&voids=1&afterVoid=' + encodeURIComponent(token), { status: 400 });
  const [body, signature] = page.next.split('.'), tampered = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  tampered[4]++;
  await get('&voids=1&afterVoid=' + encodeURIComponent(btoa(JSON.stringify(tampered)).replace(/=+$/, '') + '.' + signature), { status: 400 });
  // A window token and a void token are different protocols, even when signed.
  await get('&window=1&from=1&to=1000&after=' + encodeURIComponent(page.next), { status: 400 });
  // Produce a multipage live window for the reverse protocol mismatch.
  for (let i = 0; i < 51; i++) add('active-' + i, merchant, null, 101);
  const multi = await json('&window=1&from=1&to=1000&limit=50');
  assert.ok(multi.next); await get('&voids=1&afterVoid=' + encodeURIComponent(multi.next), { status: 400 });
  for (const [limit, expected] of [[1, 50], [999, 500], ['bad', 50]]) assert.equal((await json('&voids=1&afterVoid=&limit=' + limit)).voided.length, expected);

  store('negative-only');
  const negativeTill = `${TILL_COOKIE}=${await tillToken(secret, 'negative-only')}`;
  for (let i = 0; i < 60; i++) add('negative-' + i, 'negative-only', -100 + Math.floor(i / 3));
  const negativeFirst = await json('&voids=1&afterVoid=&limit=50', { m: 'negative-only', cookies: negativeTill });
  assert.equal(negativeFirst.voided.length, 50); assert.ok(negativeFirst.next);
  const negativeLast = await json('&voids=1&afterVoid=' + encodeURIComponent(negativeFirst.next), { m: 'negative-only', cookies: negativeTill });
  assert.equal(negativeLast.voided.length, 10); assert.equal(negativeLast.complete, true);
  store('empty-stream'); const emptyTill = `${TILL_COOKIE}=${await tillToken(secret, 'empty-stream')}`;
  const initiallyEmpty = await json('&voids=1&afterVoid=', { m: 'empty-stream', cookies: emptyTill });
  assert.deepEqual(initiallyEmpty.voided, []); assert.equal(initiallyEmpty.complete, true);
  add('first-negative', 'empty-stream', -1);
  assert.equal((await json('&voids=1&afterVoid=' + encodeURIComponent(initiallyEmpty.checkpoint), { m: 'empty-stream', cookies: emptyTill })).voided[0].i, 'first-negative');

  account('owner-a', 'Pre Split A'); store('store-a', 'owner-a');
  account('owner-b', 'Other Business'); store('store-b', 'owner-b');
  add('owned', 'store-a', 100); add('legacy-a', 'pre-split-a', 101); add('other-b', 'store-b', 102);
  const a = await owner('owner-a'), bTill = `${TILL_COOKIE}=${await tillToken(secret, 'store-b')}`;
  assert.deepEqual((await json('&voids=1&afterVoid=', { m: 'store-a', cookies: a })).voided.map(r => r.i), ['owned', 'legacy-a']);
  const ownedWindow = await json('&window=1&from=1&to=1000', { m: 'store-a', cookies: a });
  assert.deepEqual(ownedWindow.sales, []);
  assert.equal(ownedWindow.fence, db.prepare("SELECT MAX(rowid) AS f FROM sales WHERE merchant IN ('store-a','pre-split-a')").get().f);
  // A paired foreign till plus an unrelated owner session must never union A's old bucket.
  assert.deepEqual((await json('&voids=1&afterVoid=', { m: 'store-b', cookies: bTill + '; ' + a })).voided.map(r => r.i), ['other-b']);
  await get('&voids=1&afterVoid=' + encodeURIComponent(page.next), { m: 'store-b', cookies: bTill, status: 400 });
  const ownTill = `${TILL_COOKIE}=${await tillToken(secret, 'store-a')}`;
  assert.deepEqual((await json('&voids=1&afterVoid=', { m: 'store-a', cookies: ownTill + '; ' + await owner('owner-a', 0) })).voided.map(r => r.i), ['owned']);
  // Pagination tokens also bind the legacy union, so a store-count change fails closed.
  for (let i = 0; i < 51; i++) add('owned-many-' + i, 'store-a', 200);
  const oneStorePage = await json('&voids=1&afterVoid=&limit=50', { m: 'store-a', cookies: a });
  store('store-a-second', 'owner-a');
  await get('&voids=1&afterVoid=' + encodeURIComponent(oneStorePage.next), { m: 'store-a', cookies: a, status: 400 });
  assert.ok(!(await json('&voids=1&afterVoid=', { m: 'store-a', cookies: a })).voided.some(r => r.i === 'legacy-a'));
  db.prepare('DELETE FROM merchant_config WHERE merchant = ?').run('store-a-second');
  store('pre-split-a', 'owner-b');
  assert.ok(!(await json('&voids=1&afterVoid=', { m: 'store-a', cookies: a })).voided.some(r => r.i === 'legacy-a'));
  account('owner-d', 'مقهى الأطلس'); db.prepare('UPDATE accounts SET created_ts=1 WHERE id=?').run('owner-d'); store('store-d', 'owner-d'); add('shared-legacy', LEGACY_SLUG, 300);
  assert.deepEqual((await json('&voids=1&afterVoid=', { m: 'store-d', cookies: await owner('owner-d') })).voided, []);
  console.log(`PASS feed void stream: 1008 voids, ${pages} pages, equal timestamps, signed cursors/checkpoints, tenant/legacy isolation, scope changes, migration-free reads, byte-identical legacy and query plans`);
} finally { Date.now = oldNow; db.close(); }
