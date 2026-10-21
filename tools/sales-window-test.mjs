import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/sales-history.js', import.meta.url), 'utf8');
const rows = Array.from({ length: 1203 }, (_, i) => ({ cursor: i + 1, id: 'sale-' + i,
  ts: 100 + Math.floor(i / 3), amount: 10, amountCents: 1000, lines: [{ name: 'Bread', qty: 2 }] }));
function setup(reply, timers = {}) {
  let merchant = 'alpha', calls = 0, now = 1800000000000;
  class Clock extends Date { static now() { return now; } }
  const ctx = vm.createContext({ window: { KiwiLive: { merchant: () => merchant } }, Date: Clock,
    localStorage: new Proxy({}, { get() { throw Error('raw windows must never use localStorage'); } }),
    setTimeout: timers.setTimeout || setTimeout, clearTimeout: timers.clearTimeout || clearTimeout, AbortController,
    fetch: async (url, options) => {
      calls++;
      assert.equal(options.headers.Accept, 'application/json'); assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store');
      const q = new URL(url, 'https://kiwi.test').searchParams;
      assert.equal(q.get('window'), '1'); assert.equal(q.get('limit'), '500');
      const m = q.get('merchant'), from = +q.get('from'), to = +q.get('to'), offset = +(q.get('after') || 0);
      const selected = rows.filter(r => r.ts >= from && r.ts < to), sales = selected.slice(offset, offset + 500);
      const next = offset + 500 < selected.length ? String(offset + 500) : null;
      const data = { merchant: m, from, to, sales, next, complete: next === null };
      return reply ? reply({ data, q, options, calls }) : { ok: true, json: async () => data };
    } });
  vm.runInContext(source, ctx);
  return { raw: ctx.window.KiwiSalesWindow.fetchRaw, calls: () => calls, merchant: m => { merchant = m; }, advance: n => { now += n; } };
}
const json = data => ({ ok: true, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));
let release;
const gate = new Promise(resolve => { release = resolve; });
const t = setup(async ({ data }) => { await gate; return json(data); });
const first = t.raw(100, 999), second = t.raw(100, 999);
await settle(); assert.equal(t.calls(), 1); release();
const [a, b] = await Promise.all([first, second]);
assert.equal(a.length, 1203); assert.equal(b.length, 1203); assert.equal(t.calls(), 3);
assert.deepEqual(JSON.parse(JSON.stringify(a)), rows);
a[0].lines[0].name = 'Changed'; b.pop();
const cached = await t.raw(100, 999);
assert.equal(cached[0].lines[0].name, 'Bread'); assert.equal(cached.length, 1203); assert.equal(t.calls(), 3);
t.merchant('beta'); assert.equal((await t.raw(100, 999)).length, 1203); assert.equal(t.calls(), 6);
t.merchant('alpha'); await t.raw(100, 999); assert.equal(t.calls(), 6);
t.advance(60001); await t.raw(100, 999); assert.equal(t.calls(), 9);
const fractional = setup(({ data, calls }) => json({ ...data, sales: [{ ts: 100.5, cursor: calls, amount: 1 }], next: calls === 1 ? 'next' : null, complete: calls === 2 }));
assert.equal((await fractional.raw(100, 999)).length, 2);
const backdated = setup(({ data }) => json({ ...data, sales: [{ ts: 100, cursor: 20, amount: 1 }, { ts: 101, cursor: 10, amount: 1 }], next: null, complete: true }));
assert.equal((await backdated.raw(100, 999)).length, 2);
let scenarios = 0;
for (const reply of [
  () => { throw Error('offline'); },
  ...[401, 404, 500].map(status => () => ({ ok: false, status })),
  () => ({ ok: true, json: async () => { throw Error('json'); } }),
  ({ data }) => json({ ...data, merchant: 'foreign' }),
  ({ data }) => json({ ...data, from: 101 }),
  ({ data }) => json({ ...data, to: 998 }),
  ({ data }) => json({ ...data, complete: true }),
  ({ data }) => json({ ...data, next: null }),
  ({ data }) => json({ ...data, sales: [] }),
  ({ data }) => json({ ...data, sales: data.sales.slice().reverse() }),
  ({ data }) => json({ ...data, sales: [data.sales[0], data.sales[0]] }),
  ({ data }) => json({ ...data, sales: [{ ...data.sales[0], ts: 999 }] }),
  ({ data }) => json({ ...data, sales: [{ ...data.sales[0], amountCents: 'wrong' }] }),
  ({ data }) => json({ ...data, sales: rows.slice(0, 501) }),
  ({ data, calls }) => calls === 1 ? json(data) : ({ ok: false, status: 404 }),
  ({ data }) => json({ ...data, sales: null }),
  () => json(null),
]) {
  const f = setup(reply); assert.equal(await f.raw(100, 999), null); scenarios++;
}
// Repeated continuation token, even with increasing rows, cannot loop forever.
const repeated = setup(({ data, calls }) => json({ ...data, sales: [rows[calls - 1]], next: 'same', complete: false }));
assert.equal(await repeated.raw(100, 999), null); assert.equal(repeated.calls(), 2);
// A prefix is discarded after 20 pages, but a complete twentieth page is valid.
for (const completeAt20 of [false, true]) {
  const capped = setup(({ data, calls }) => json({ ...data, sales: [rows[calls - 1]],
    next: completeAt20 && calls === 20 ? null : String(calls), complete: completeAt20 && calls === 20 }));
  const value = await capped.raw(100, 999);
  if (completeAt20) assert.equal(value.length, 20); else assert.equal(value, null);
  assert.equal(capped.calls(), 20);
}
const invalid = setup();
for (const [from, to] of [[0, 10], [2, 1], [1, Infinity], [1.5, 10], [1, 400 * 86400000 + 7200002]]) assert.equal(await invalid.raw(from, to), null);
assert.equal(invalid.calls(), 0); invalid.merchant(''); assert.equal(await invalid.raw(100, 999), null);
const empty = setup(); assert.equal((await empty.raw(2, 3)).length, 0); assert.equal(empty.calls(), 1);
// Failed attempts do not poison the cache.
let fail = true;
const retry = setup(({ data }) => fail ? { ok: false, status: 401 } : json(data));
assert.equal(await retry.raw(100, 999), null); fail = false;
assert.equal((await retry.raw(100, 999)).length, 1203); assert.equal(retry.calls(), 4);
let resume;
const switched = setup(async ({ data }) => { await new Promise(resolve => { resume = resolve; }); return json(data); });
const stale = switched.raw(100, 999); await settle(); switched.merchant('beta'); resume(); assert.equal(await stale, null);
let timeout, aborted = false;
const hung = setup(({ options }) => { options.signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); },
  { setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {} });
const timeoutResult = hung.raw(100, 999); await settle(); timeout();
assert.equal(await timeoutResult, null); assert.equal(aborted, true);
// Cache holds four windows, expires in one minute, and is never durable.
const bounded = setup();
for (let i = 0; i < 5; i++) await bounded.raw(2 + i, 3 + i);
assert.equal(bounded.calls(), 5); await bounded.raw(2, 3); assert.equal(bounded.calls(), 6);
console.log(`PASS raw sales windows: 1203 rows/3 pages, dedupe, cache copies/expiry/bound, tenant isolation/switch, ${scenarios} failure shapes, retry, timeout, exact 20-page cap, no localStorage`);
