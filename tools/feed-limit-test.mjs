import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/feed.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'feed-limit-fixture', secret = 'feed-limit-test-only';
sqlite.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts) VALUES (?, '{}', 'active', ?)").run(merchant, Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
let fallback = 0;
const queries = [];
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { assert.ok(values.length <= 100, 'D1 parameter budget'); args = values; return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() {
    if (/SELECT rowid AS cursor, id, amount/.test(sql) && /rowid >/.test(sql)) {
      queries.push(sql);
      if (fallback > 0 && sql.includes('amount_cents')) { fallback--; throw new Error('no such column: lines'); }
    }
    return { results: sqlite.prepare(sql).all(...args) };
  },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const insert = sqlite.prepare('INSERT INTO sales (id, merchant, amount, method, ts) VALUES (?, ?, 10, ?, ?)');
for (let i = 1; i <= 2848; i++) insert.run(`sale-${i}`, merchant, 'cash', i);
sqlite.prepare("UPDATE sales SET payment_parts = ?, tip_cents = 25 WHERE id IN ('sale-1', 'sale-500')").run(JSON.stringify([{ method: 'cash', amountCents: 1000 }]));
async function get(params = '') {
  const response = await onRequestGet({ request: new Request(`https://kiwi.test/api/feed?merchant=${merchant}${params}`, { headers: { Cookie: cookie } }), env });
  assert.equal(response.status, 200);
  return response.json();
}
for (const [param, expected] of [['', 50], ['10', 50], ['9999', 500], ['abc', 50], ['50.5', 50], ['500', 500]]) {
  const data = await get(param ? `&limit=${param}` : '');
  assert.equal(data.limit, expected); assert.equal(data.sales.length, expected);
  for (const row of [data.sales[0], ...(expected === 500 ? [data.sales.at(-1)] : [])]) {
    assert.equal(row.tipCents, 25);
    assert.deepEqual(row.paymentParts, [{ method: 'cash', amountCents: 1000 }]);
  }
}
for (const failures of [1, 2]) {
  fallback = failures; queries.length = 0;
  const data = await get('&limit=500');
  assert.equal(data.sales.length, 500); assert.equal(data.limit, 500);
  assert.equal(queries.length, failures + 1);
  assert.ok(queries.every(sql => sql.endsWith('LIMIT 500')));
}
const byDay = await get('&from=1&limit=50');
assert.equal(byDay.sales.length, 2000); assert.ok(!('limit' in byDay));
let cursor = 0, rows = 0, pages = 0;
while (true) {
  const data = await get(`&since=${cursor}&limit=500`);
  rows += data.sales.length; pages++; cursor = data.cursor;
  if (data.sales.length < data.limit) break;
}
assert.equal(rows, 2848); assert.equal(pages, 6);
sqlite.close();
console.log('feed-limit-test: defaults, clamping, fallback queries, byDay and six-page history passed');
