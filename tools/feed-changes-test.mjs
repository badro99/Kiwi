import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet as feed } from '../functions/api/feed.js';
import { freshDb, applyMigrations } from './d1-migrations.mjs';
const secret = 'feed-changes-fixture-only';
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:'); db.exec(schema);
const m = 'changes-fixture';
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { assert.ok(v.length <= 100, 'D1 binding limit'); args = v; return this; },
  first() { return db.prepare(sql).get(...args) || null; },
  all() { return { results: db.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
}; }, async batch(stmts) { db.exec('BEGIN'); try { const result = stmts.map(s => s.run()); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
const env = { DB, AUTH_SECRET: secret };
const store = (merchant, owner = null) => db.prepare("INSERT INTO merchant_config (merchant, account_id, features, status, updated_ts) VALUES (?, ?, '{}', 'active', 1)").run(merchant, owner);
const add = (id, ts = 100, merchant = m, cents = 1000) => db.prepare("INSERT INTO sales (id,merchant,amount,amount_cents,method,ref,ts,lines) VALUES (?,?,?,?,'cash',?,?,?)").run(id, merchant, cents / 100, cents, 'R-' + id, ts, JSON.stringify([{ n: 'Bread', q: 2, t: 10 }]));
const tip = id => db.prepare('SELECT tip_cents FROM sales WHERE id=?').get(id).tip_cents;
const max = merchant => db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM sale_changes WHERE merchant=?').get(merchant).n;
store(m); store('foreign-fixture');
const cookie = `${TILL_COOKIE}=${await tillToken(secret, m)}`;
async function get(query, { merchant = m, cookies = cookie, status = 200 } = {}) {
  const r = await feed({ request: new Request('https://kiwi.test/api/feed?merchant=' + merchant + query, { headers: { Cookie: cookies } }), env });
  assert.equal(r.status, status, query); return r.json();
}
async function changes(after, options, limit = 500) {
  let token = String(after), list = [], pages = 0, checkpoint;
  do {
    const data = await get('&changes=1&afterChange=' + encodeURIComponent(token) + '&limit=' + limit, options);
    assert.equal(data.complete, data.next === null); assert.ok(data.changes.length <= limit);
    list.push(...data.changes); checkpoint = data.checkpoint; token = data.next; pages++;
    assert.ok(pages < 100);
  } while (token);
  return { list, checkpoint, pages };
}
let checks = 0;
function passed(name) { checks++; console.log('  ✓ ' + name); }
try {
  // Execute both schema sources, not a regex approximation of trigger presence.
  const migrated = applyMigrations(freshDb());
  for (const database of [db, migrated]) {
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('sales_change_log','sales_change_insert','sales_change_delete')").get().n, 3);
    assert.match(database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sale_changes'").get().sql, /AUTOINCREMENT/);
  }
  migrated.close(); passed('triggers and monotonic sequence installed by schema and migrations');

  add('restored', 100);
  for (let i = 0; i < 120; i++) add('bootstrap-' + i, 101 + i);
  db.prepare("UPDATE sales SET void_ts=1000 WHERE id='restored'").run();
  const first = await get('&window=1&from=100&to=1000&limit=50');
  assert.ok(first.next); assert.ok(first.changeFence > 0);
  assert.ok(!first.sales.some(r => r.id === 'restored'));
  const captured = first.changeFence;
  // Same mutation as admin restore: no sales rowid changes, no manual log write.
  db.prepare("UPDATE sales SET void_ts=NULL WHERE id='restored'").run();
  let after = first.next, boot = first.sales.slice();
  while (after) {
    const data = await get('&window=1&from=100&to=1000&after=' + encodeURIComponent(after));
    assert.equal(data.fence, first.fence); assert.equal(data.changeFence, captured);
    boot.push(...data.sales); after = data.next;
  }
  assert.ok(!boot.some(r => r.id === 'restored'));
  const updated = await changes(captured), tail = await get('&since=' + first.fence + '&limit=500');
  const hits = boot.concat(updated.list, tail.sales).filter(r => r.id === 'restored');
  assert.equal(hits.length, 1); assert.equal(hits[0].voided, false); assert.equal(hits[0].amountCents, 1000);
  passed('B2 restoration regression: window + changes from CF + rowid catch-up sees the restored sale exactly once');

  for (const [column, value] of [['tip_cents', 125], ['payment_parts', JSON.stringify([{ method: 'card', amountCents: 1000 }])], ['ref', 'R-UPDATED']]) {
    const cf = max(m); db.prepare(`UPDATE sales SET ${column}=? WHERE id='restored'`).run(value);
    const events = (await changes(cf)).list;
    assert.equal(events.length, 1); assert.equal(events[0].id, 'restored'); assert.ok(events[0].seq > cf);
    assert.equal(events[0].lines[0].name, 'Bread');
    if (column === 'tip_cents') assert.equal(events[0].tipCents, 125);
    if (column === 'payment_parts') assert.deepEqual(events[0].paymentParts, JSON.parse(value));
    if (column === 'ref') assert.equal(events[0].ref, value);
  }
  passed('tip, split tender and receipt-reference updates return full enriched current rows');
  let cf = max(m); db.prepare("UPDATE sales SET method=method WHERE id='restored'").run();
  assert.equal(max(m), cf + 1); passed('no-op updates are deliberately logged');

  // A failed log insert aborts the original UPDATE, not just the notification.
  const before = max(m), oldTip = tip('restored');
  db.exec("CREATE TRIGGER reject_change BEFORE INSERT ON sale_changes BEGIN SELECT RAISE(ABORT,'fixture log failure'); END;");
  assert.throws(() => db.prepare("UPDATE sales SET tip_cents=999 WHERE id='restored'").run(), /fixture log failure/);
  assert.equal(tip('restored'), oldTip); assert.equal(max(m), before); db.exec('DROP TRIGGER reject_change');
  db.exec('BEGIN'); db.prepare("UPDATE sales SET tip_cents=888 WHERE id='restored'").run(); db.exec('ROLLBACK');
  assert.equal(tip('restored'), oldTip); assert.equal(max(m), before);
  passed('trigger failure and transaction rollback preserve atomicity');

  add('original-void'); add('linked-refund', 102, m, -200);
  db.prepare("UPDATE sales SET void_ts=1234 WHERE id='original-void'").run();
  db.prepare("INSERT INTO sale_audit (merchant,sale_id,action,note,ts) VALUES (?,?,'refund',?,1)").run(m, 'original-void', 'linked-refund');
  cf = max(m);
  const repaired = await changes(cf); // GET itself repairs the refund and must log it.
  const refund = repaired.list.find(r => r.id === 'linked-refund');
  assert.ok(refund); assert.equal(refund.voided, true); assert.equal(refund.amountCents, -200); assert.ok(refund.seq > cf);
  assert.equal((await changes(repaired.checkpoint)).list.length, 0, 'repair is idempotent');
  passed('linked-test-sale void inside GET is visible in the change stream');

  cf = max(m);
  db.prepare("UPDATE sales SET merchant='foreign-fixture' WHERE id='restored'").run();
  assert.deepEqual((await changes(cf)).list.map(r => Object.keys(r).sort()), [['cursor', 'deleted', 'id', 'seq']]);
  const foreignCookie = `${TILL_COOKIE}=${await tillToken(secret, 'foreign-fixture')}`;
  const moved = (await changes(0, { merchant: 'foreign-fixture', cookies: foreignCookie })).list;
  assert.equal(moved.length, 1); assert.equal(moved[0].id, 'restored'); assert.equal(moved[0].voided, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sale_changes WHERE seq>?').get(cf).n, 2);
  passed('merchant moves log both scopes: old tenant gets only a tombstone, new tenant gets the row');

  add('highest', 999); cf = max(m);
  const oldCursor = db.prepare("SELECT rowid AS c FROM sales WHERE id='highest'").get().c;
  db.prepare("DELETE FROM sales WHERE id='highest'").run();
  const tombstones = await changes(cf); assert.equal(tombstones.list.length, 1); assert.equal(tombstones.list[0].deleted, true);
  add('reused-rowid', 998);
  assert.equal(db.prepare("SELECT rowid AS c FROM sales WHERE id='reused-rowid'").get().c, oldCursor);
  const reuse = await changes(tombstones.checkpoint); assert.equal(reuse.list[0].id, 'reused-rowid');
  const allReuse = (await changes(cf)).list;
  assert.equal(allReuse.find(r => r.id === 'highest').deleted, true);
  assert.ok(!allReuse.find(r => r.id === 'reused-rowid').deleted);
  passed('hard deletes emit tombstones; rowid reuse remains visible and cannot resolve an old event to another sale');

  cf = max(m); add('duplicate');
  db.prepare("UPDATE sales SET ref='A' WHERE id='duplicate'").run(); db.prepare("UPDATE sales SET ref='B' WHERE id='duplicate'").run();
  const duplicate = await changes(cf);
  assert.equal(duplicate.list.length, 1); assert.equal(duplicate.list[0].ref, 'B'); assert.equal(duplicate.list[0].seq, max(m));
  const empty = await get('&changes=1&afterChange=' + encodeURIComponent(duplicate.checkpoint));
  assert.deepEqual(empty.changes, []); assert.equal(empty.checkpoint, duplicate.checkpoint); assert.equal(empty.complete, true);
  assert.deepEqual(await get('&afterChange=' + encodeURIComponent(duplicate.checkpoint)), empty);
  assert.ok(Array.isArray((await get('&afterChange=')).changes));
  passed('duplicates collapse to latest seq within a page; EOF checkpoints preserve position; presence selects changes');

  cf = max(m);
  for (let i = 0; i < 1003; i++) add('page-' + i, 300 + i);
  const paged = await changes(cf, undefined, 50);
  assert.equal(paged.pages, 21); assert.equal(paged.list.length, 1003);
  assert.equal(new Set(paged.list.map(r => r.id)).size, 1003);
  assert.ok(paged.list.every((r, i, a) => !i || r.seq > a[i - 1].seq));
  passed('1003 changes paginate exactly once across 21 pages');

  const token = paged.checkpoint;
  for (const value of ['!', '9007199254740992', '-1', '1.5', String(max(m) + 1), token.slice(0, -3)]) await get('&changes=1&afterChange=' + encodeURIComponent(value), { status: 400 });
  const [body, signature] = token.split('.'), forged = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  forged[4]++;
  await get('&changes=1&afterChange=' + encodeURIComponent(btoa(JSON.stringify(forged)).replace(/=+$/, '') + '.' + signature), { status: 400 });
  await get('&changes=1&afterChange=' + encodeURIComponent(token), { merchant: 'foreign-fixture', cookies: foreignCookie, status: 400 });
  await get('&window=1&from=100&to=1000&after=' + encodeURIComponent(token), { status: 400 });
  const window = await get('&window=1&from=100&to=1000');
  await get('&changes=1&afterChange=' + encodeURIComponent(window.next), { status: 400 });
  await get('&window=1&from=100&to=1000&after=' + encodeURIComponent(window.next) + '&changeFence=' + (window.changeFence - 1), { status: 400 });
  const restart = await get('&window=1&from=100&to=1000&fence=' + window.fence + '&changeFence=' + window.changeFence);
  assert.equal(restart.changeFence, window.changeFence);
  await get('&changes=1&afterChange=0', { merchant: 'foreign-fixture', status: 403 });
  passed('tampered, wrong-protocol, cross-scope and impossible positions fail closed; numeric CF and paired fences resume');

  db.prepare("INSERT INTO accounts (id,email,business,salt,hash,created_ts,session_epoch) VALUES ('owner-a','a@example.test','Pre Split A','s','h',1,1)").run();
  store('owner-store', 'owner-a'); add('own', 1, 'owner-store'); add('pre-split', 1, 'pre-split-a');
  const owner = `${SESS_COOKIE}=${await makeSession('owner-a', secret, 1)}`;
  assert.deepEqual((await changes(0, { merchant: 'owner-store', cookies: owner })).list.map(r => r.id), ['own', 'pre-split']);
  const paired = `${TILL_COOKIE}=${await tillToken(secret, 'owner-store')}`;
  assert.deepEqual((await changes(0, { merchant: 'owner-store', cookies: paired })).list.map(r => r.id), ['own']);
  const ownersTail = (await changes(0, { merchant: 'owner-store', cookies: owner })).checkpoint;
  store('second-store', 'owner-a');
  await get('&changes=1&afterChange=' + encodeURIComponent(ownersTail), { merchant: 'owner-store', cookies: owner, status: 400 });
  assert.deepEqual((await changes(0, { merchant: 'owner-store', cookies: owner })).list.map(r => r.id), ['own']);
  passed('legacy buckets are owner-only and changing the union invalidates checkpoints');

  // Real purge body with only authorization/audit stubbed: privacy deletion
  // must not leave trigger-created merchant records after its table loop.
  const purgeSource = fs.readFileSync(new URL('../functions/api/admin/clients.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm, '').replace(/export /g, '');
  const ctx = vm.createContext({ URL, isOperator: async () => true, isSeniorOperator: async () => true,
    accountSlug: async (_env, value) => value, logStoreAction: async () => {}, json: (data, status = 200) => ({ data, status }) });
  vm.runInContext(purgeSource, ctx);
  const result = await ctx.onRequestDelete({ request: new Request('https://kiwi.test/api/admin/clients?merchant=' + m + '&confirm=' + m), env: { ...env, MEDIA: { list: async () => ({ objects: [] }), delete: async () => {} } } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(m).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sale_changes WHERE merchant=?').get(m).n, 0);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM sale_changes WHERE merchant=?').get('foreign-fixture').n > 0);
  passed('store purge clears its own trigger log last without touching another tenant');

  db.exec('DROP TRIGGER sales_change_log');
  await get('&changes=1&afterChange=', { merchant: 'foreign-fixture', cookies: foreignCookie, status: 500 });
  passed('missing change-log triggers never produce false completeness');
  console.log(`PASS feed changes: ${checks} scenarios, atomic update/insert/delete triggers, fenced bootstrap regression, pagination, full rows, privacy purge and scope isolation`);
} finally { db.close(); }
