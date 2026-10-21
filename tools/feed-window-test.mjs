import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/feed.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'window-fixture', secret = 'window-fixture-secret';
sqlite.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts) VALUES (?, '{}', 'active', 1)").run(merchant);
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
let failColumn = '', unavailable = false;
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { assert.ok(values.length <= 100, 'D1 bound parameter budget'); args = values; return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() {
    if (sql.includes('ORDER BY ts ASC, rowid ASC')) {
      if (unavailable) throw Error('no such column: void_ts');
      if (failColumn && new RegExp('\\b' + failColumn + '\\b').test(sql)) throw Error('no such column: ' + failColumn);
    }
    return { results: sqlite.prepare(sql).all(...args) };
  },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const insert = sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, payment_parts, tip_cents, void_ts) VALUES (?, ?, 10, 1000, ?, ?, ?, ?, ?, ?, 25, ?)');
function add(id, ts, owner = merchant, voidTs = null) {
  insert.run(id, owner, 'cash', 'Fixture', 'R-' + id, ts, JSON.stringify([{ n: 'Bread', q: 2, t: 10, c: 'Food' }]), JSON.stringify([{ method: 'cash', amountCents: 1000 }]), voidTs);
}
add('first', 1);
for (let i = 0; i < 1203; i++) add('row-' + i, 100 + Math.floor(i / 3));
add('exclusive', 999); add('voided', 200, merchant, 1234); add('foreign', 200, 'foreign-tenant');
for (let i = 0; i < 51; i++) add('fraction-' + i, 1500.5);
add('byday-a', 2000); add('byday-b', 2001);
add('newer-first', 1401); add('backdated-late', 1400);
async function get(params, status = 200, asked = merchant) {
  const response = await onRequestGet({ request: new Request('https://kiwi.test/api/feed?merchant=' + asked + params,
    { headers: { Cookie: cookie } }), env });
  assert.equal(response.status, status, params);
  return response;
}
const oldNow = Date.now; Date.now = () => 1800000000000;
try {
  const legacy = await (await get('&from=2000')).text();
  assert.equal(legacy, fs.readFileSync(new URL('./fixtures/feed-window-byday.json', import.meta.url), 'utf8').trim(), 'byte-for-byte untouched HEAD byDay fixture');
  for (const extra of ['&to=2001', '&window=0&to=2001', '&window=1']) {
    assert.equal(await (await get('&from=2000' + extra)).text(), legacy, 'window requires flag and both bounds');
  }
  await get('&window=1&from=100&to=999', 403, 'foreign-tenant');
  assert.equal((await onRequestGet({ request: new Request('https://kiwi.test/api/feed?window=1&from=1&to=2'), env: {} })).status, 503);
  const one = await (await get('&window=1&from=1&to=2')).json();
  assert.equal(one.sales.length, 1); assert.equal(one.sales[0].ts, 1); assert.equal(one.next, null); assert.equal(one.complete, true);
  let pages = 0;
  for (const limit of [50, 500]) {
    let after = '', rows = [];
    do {
      const data = await (await get('&window=1&from=100&to=999&limit=' + limit + (after ? '&after=' + encodeURIComponent(after) : ''))).json();
      pages++; assert.equal(data.merchant, merchant); assert.equal(data.from, 100); assert.equal(data.to, 999);
      assert.ok(data.sales.length <= limit); assert.equal(data.complete, data.next === null);
      rows.push(...data.sales); after = data.next;
    } while (after);
    assert.equal(rows.length, 1203); assert.equal(new Set(rows.map(r => r.cursor)).size, 1203);
    assert.deepEqual(rows.map(r => r.id), Array.from({ length: 1203 }, (_, i) => 'row-' + i));
    assert.ok(rows.every(r => r.ts >= 100 && r.ts < 999 && r.id !== 'voided' && r.id !== 'foreign'));
    assert.ok(rows.every(r => r.lines[0].name === 'Bread' && r.lines[0].qty === 2 && r.tipCents === 25 && r.paymentParts[0].amountCents === 1000));
  }
  const backdated = await (await get('&window=1&from=1400&to=1402')).json();
  assert.deepEqual(backdated.sales.map(r => r.id), ['backdated-late', 'newer-first']);
  assert.ok(backdated.sales[0].cursor > backdated.sales[1].cursor);
  const fractions = await (await get('&window=1&from=1500&to=1502&limit=50')).json();
  assert.equal(fractions.sales.length, 50); assert.ok(fractions.next);
  const fractionEnd = await (await get('&window=1&from=1500&to=1502&after=' + encodeURIComponent(fractions.next))).json();
  assert.equal(fractionEnd.sales.length, 1); assert.equal(fractionEnd.sales[0].ts, 1500.5); assert.equal(fractionEnd.complete, true);
  const exact = await (await get('&window=1&from=100&to=150&limit=150')).json();
  assert.equal(exact.sales.length, 150); assert.equal(exact.complete, true); assert.equal(exact.next, null);
  const empty = await (await get('&window=1&from=2&to=3')).json();
  assert.deepEqual(empty.sales, []); assert.equal(empty.complete, true);
  const page = await (await get('&window=1&from=100&to=999')).json();
  for (const value of ['!', 'eyJ4IjoxfQ', page.next.slice(0, -3)]) await get('&window=1&from=100&to=999&after=' + encodeURIComponent(value), 400);
  await get('&window=1&from=101&to=999&after=' + encodeURIComponent(page.next), 400);
  // Altering the opaque tenant field does not grant entitlement or leak foreign rows.
  const token = JSON.parse(atob(page.next.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); token[2] = 'foreign-tenant';
  await get('&window=1&from=100&to=999&after=' + encodeURIComponent(btoa(JSON.stringify(token)).replace(/=+$/, '') + '.' + page.next.split('.')[1]), 400);
  for (const query of ['from=2&to=1', 'from=1&to=1', 'from=0&to=2', 'from=x&to=2', 'from=1.5&to=2', 'from=1&to=Infinity', 'from=1&to=' + (400 * 86400000 + 7200002)]) await get('&window=1&' + query, 400);
  await get('&window=1&from=1&to=' + (400 * 86400000 + 7200001));
  for (const [asked, size] of [[1, 50], [999, 500], ['bad', 50]]) {
    const data = await (await get('&window=1&from=100&to=999&limit=' + asked)).json(); assert.equal(data.sales.length, size);
  }
  for (const column of ['gross_amount_cents', 'lines', 'amount_cents']) {
    failColumn = column;
    const data = await (await get('&window=1&from=100&to=999&limit=500')).json();
    assert.equal(data.sales.length, 500); assert.ok(data.sales.every(r => r.id !== 'voided' && r.id !== 'foreign'));
    if (column !== 'lines') assert.equal(data.sales[0].lines[0].name, 'Bread');
  }
  failColumn = ''; unavailable = true;
  await get('&window=1&from=100&to=999', 500);
  unavailable = false;
  assert.equal(await (await get('&from=2000')).text(), legacy, 'window reads leave byDay unchanged');
  // Fence is scoped, includes voids and timestamps outside the requested window.
  add('fence-void', 3000, merchant, 1235);
  add('foreign-high-water', 4000, 'foreign-tenant');
  const frozen = await (await get('&window=1&from=100&to=999&limit=50')).json();
  const wantedFence = sqlite.prepare("SELECT rowid AS c FROM sales WHERE id='fence-void'").get().c;
  assert.equal(frozen.fence, wantedFence);
  add('late-earlier', 101); add('late-later', 700);
  let checkpoint = frozen.next, fencedRows = frozen.sales.slice();
  while (checkpoint) {
    const data = await (await get('&window=1&from=100&to=999&limit=500&fence=' + frozen.fence + '&after=' + encodeURIComponent(checkpoint))).json();
    assert.equal(data.fence, frozen.fence); fencedRows.push(...data.sales); checkpoint = data.next;
  }
  assert.equal(fencedRows.length, 1203);
  assert.ok(fencedRows.every(r => r.cursor <= frozen.fence && !r.id.startsWith('late-')));
  const resumed = await (await get('&window=1&from=100&to=999&limit=50&fence=' + frozen.fence)).json();
  assert.deepEqual(resumed.sales, frozen.sales); assert.equal(resumed.fence, frozen.fence);
  assert.ok((await (await get('&window=1&from=100&to=999&limit=500')).json()).sales.some(r => r.id === 'late-earlier'));
  for (const fence of ['', '-1', '1.5', 'bad', '9007199254740992', String(wantedFence + 9999)]) await get('&window=1&from=100&to=999&fence=' + fence, 400);
  await get('&window=1&from=100&to=999&fence=' + (frozen.fence - 1) + '&after=' + encodeURIComponent(frozen.next), 400);
  const forged = JSON.parse(atob(frozen.next.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
  forged[6]++;
  await get('&window=1&from=100&to=999&after=' + encodeURIComponent(btoa(JSON.stringify(forged)).replace(/=+$/, '') + '.' + frozen.next.split('.')[1]), 400);
  const v1 = btoa(JSON.stringify([1, merchant, 100, 999, 200, 1])).replace(/=+$/, '');
  await get('&window=1&from=100&to=999&after=' + encodeURIComponent(v1), 400);
  const zero = await (await get('&window=1&from=100&to=999&fence=0')).json();
  assert.equal(zero.fence, 0); assert.equal(zero.complete, true); assert.deepEqual(zero.sales, []);
  console.log(`PASS feed window: 1203 rows, ${pages} pages, equal timestamps, exclusive bounds, voids, tenant isolation, cursor/range guards, details, schema fallbacks, byte-for-byte byDay`);
} finally { Date.now = oldNow; sqlite.close(); }
