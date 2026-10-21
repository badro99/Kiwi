import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/sales-summary.js';

const DAY = 86400000;
const ms = (s) => Date.parse(s);
const from = ms('2026-10-20T05:00:00+01:00');
const to = ms('2026-10-22T05:00:00+01:00');
const evening = ms('2026-10-20T20:00:00+01:00');
const night = ms('2026-10-21T01:15:00+01:00');
const morning = ms('2026-10-21T10:00:00+01:00');
const merchant = 'summary-store', secret = 'sales-summary-test-only';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const queries = [];
  let oldSchema = false, id = 0;
  const DB = { prepare(sql) { let args = []; return {
    bind(...values) { assert.ok(values.length <= 100, 'D1 parameter budget'); args = values; return this; },
    first() { return sqlite.prepare(sql).get(...args) || null; },
    all() {
      queries.push(sql);
      if (oldSchema && /SELECT [^;]*payment_parts[^;]*FROM sales/.test(sql)) throw new Error('no such column: payment_parts');
      return { results: sqlite.prepare(sql).all(...args) };
    },
    run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
  }; } };
  function store(slug = merchant, aid = null, zone = 'Africa/Casablanca') {
    sqlite.prepare("INSERT INTO merchant_config (merchant, account_id, features, status, updated_ts, timezone, business_cutoff) VALUES (?, ?, '{}', 'active', 1, ?, 5)").run(slug, aid, zone);
  }
  function account(aid, business, epoch = 3) {
    sqlite.prepare('INSERT INTO accounts (id, email, business, salt, hash, created_ts, session_epoch) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(aid, `${aid}@example.test`, business, 'test-salt', 'test-hash', Date.now(), epoch);
  }
  function sale({ slug = merchant, ts = evening, cents = 1000, amount = 999, method = 'cash', parts = null, voidTs = null } = {}) {
    sqlite.prepare('INSERT INTO sales (id, merchant, ts, amount, amount_cents, method, payment_parts, void_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`summary-${++id}`, slug, ts, amount, cents, method, parts, voidTs);
  }
  async function get({ start = from, end = to, slug = merchant, cookie = '', auth = false, params } = {}) {
    const query = params ?? new URLSearchParams({ merchant: slug, from: String(start), to: String(end) });
    const response = await onRequestGet({ request: new Request(`https://kiwi.test/api/sales-summary?${query}`, { headers: { Cookie: cookie } }), env: { DB, ...(auth ? { AUTH_SECRET: secret } : {}) } });
    return { status: response.status, data: await response.json() };
  }
  store();
  return { sqlite, store, account, sale, get, queries, fallback() { oldSchema = true; } };
}
const cookieFor = async (aid, epoch = 3) => `kiwi_sess=${await makeSession(aid, secret, epoch)}`;
const total = (data) => data.days.reduce((sum, d) => sum + d.cents, 0);
const cases = [
  ['Business days and boundaries', async (f) => {
    f.sale({ cents: 1200 }); f.sale({ ts: night, cents: 2300 }); f.sale({ ts: morning, cents: 3400 });
    const { status, data } = await f.get(); assert.equal(status, 200);
    assert.equal(data.zone, 'Africa/Casablanca'); assert.equal(data.cutoff, 5);
    assert.deepEqual(data.days.map(({ day, from, to, count, cents }) => ({ day, from, to, count, cents })), [
      { day: '2026-10-20', from, to: ms('2026-10-21T05:00:00+01:00'), count: 2, cents: 3500 },
      { day: '2026-10-21', from: ms('2026-10-21T05:00:00+01:00'), to, count: 1, cents: 3400 },
    ]);
  }],
  ['Store-clock hours', async (f) => {
    f.sale({ cents: 1200 }); f.sale({ ts: night, cents: 2300 }); f.sale({ ts: morning, cents: 3400 });
    const { data } = await f.get();
    assert.deepEqual(data.days.map(d => d.hours), [{ 20: 1200, 1: 2300 }, { 10: 3400 }]);
  }],
  ['Refunds', async (f) => {
    f.sale({ cents: 1234 }); f.sale({ cents: -567, method: 'card' });
    const { data } = await f.get(); const d = data.days[0];
    assert.equal(d.count, 1); assert.equal(d.cents, 1234);
    assert.equal(d.refundCount, 1); assert.equal(d.refundCents, 567); assert.deepEqual(d.refunds, { card: 567 });
    assert.deepEqual(d.methods, { cash: { count: 1, cents: 1234 } });
  }],
  ['Voided and zero rows', async (f) => {
    f.sale({ cents: 4321 }); f.sale({ cents: 8888, voidTs: evening + 1 });
    f.sale({ cents: -7777, voidTs: evening + 1 }); f.sale({ cents: 0 });
    const { data } = await f.get();
    assert.equal(total(data), 4321); assert.equal(data.days[0].count, 1); assert.equal(data.days[0].refundCount, 0);
    assert.deepEqual(data.days[0].whole, { cash: 4321 }); assert.deepEqual(data.days[0].hours, { 20: 4321 });
  }],
  ['Authoritative and legacy centimes', async (f) => {
    f.sale({ cents: 2345, amount: 999, method: 'card' }); f.sale({ cents: null, amount: 12.345 });
    const { data } = await f.get();
    const legacy = Math.round((12.345 + Number.EPSILON) * 100); assert.equal(legacy, 1235);
    assert.equal(total(data), 3580); assert.deepEqual(data.days[0].whole, { cash: legacy, card: 2345 });
  }],
  ['Split and invalid tender parts', async (f) => {
    const parts = [{ method: 'cash', amountCents: 3000 }, { method: 'card', amountCents: 7000 }];
    f.sale({ cents: 10000, method: 'split', parts: JSON.stringify(parts) });
    for (const [i, parts] of ['[]', 'null', '{broken', '[{"method":"cash","amountCents":-100}]'].entries()) {
      f.sale({ cents: 101 + i, method: 'card', parts });
    }
    const { data } = await f.get(); const d = data.days[0];
    assert.equal(d.count, 5); assert.equal(d.cents, 10410);
    assert.deepEqual(d.methods, { split: { count: 1, cents: 10000 }, card: { count: 4, cents: 410 } });
    assert.deepEqual(d.whole, { card: 410 });
    assert.deepEqual(data.splits, [{ ts: evening, cents: 10000, method: 'split', parts }]);
  }],
  ['Tenancy and revoked sessions', async (f) => {
    f.account('owner', 'Owner Business'); f.account('other', 'Other Business');
    f.sqlite.prepare('UPDATE merchant_config SET account_id = ? WHERE merchant = ?').run('owner', merchant);
    f.store('other-business', 'other'); f.sale({ cents: 1234 }); f.sale({ slug: 'other-business', cents: 6789 });
    assert.equal(total((await f.get()).data), 1234);
    const denied = await f.get({ auth: true }); assert.equal(denied.status, 403); assert.deepEqual(denied.data.days, []);
    const own = await f.get({ auth: true, cookie: await cookieFor('owner') });
    assert.equal(own.status, 200); assert.equal(own.data.merchant, merchant); assert.equal(total(own.data), 1234);
    const other = await f.get({ auth: true, cookie: await cookieFor('other') });
    assert.equal(other.status, 200); assert.equal(other.data.merchant, 'other-business'); assert.equal(total(other.data), 6789);
    const cookie = await cookieFor('owner');
    f.sqlite.prepare('UPDATE accounts SET session_epoch = 4 WHERE id = ?').run('owner');
    const revoked = await f.get({ auth: true, cookie }); assert.equal(revoked.status, 403); assert.deepEqual(revoked.data.days, []);
  }],
  ['Pre-split account bucket', async (f) => {
    // accountSlug uses the accent-normalized latin slug for this business.
    f.account('legacy-owner', 'Café Amira');
    f.sqlite.prepare('UPDATE merchant_config SET account_id = ? WHERE merchant = ?').run('legacy-owner', merchant);
    f.sale({ cents: 1001 }); f.sale({ slug: 'cafe-amira', cents: 2002 });
    const options = { auth: true, cookie: await cookieFor('legacy-owner') };
    assert.equal(total((await f.get(options)).data), 3003);
    f.store('second-store', 'legacy-owner'); f.sale({ slug: 'second-store', cents: 4004 });
    assert.equal(total((await f.get(options)).data), 1001);
  }],
  ['Range validation and 400-day maximum', async (f) => {
    for (const params of [
      `merchant=${merchant}&to=${to}`, `merchant=${merchant}&from=${from}`,
      `from=abc&to=${to}`, `from=${from}&to=nope`, `from=${to}&to=${from}`, `from=${from}&to=${from}`,
    ]) {
      const result = await f.get({ params }); assert.equal(result.status, 400, params); assert.deepEqual(result.data, { error: 'range' });
    }
    const exact = await f.get({ end: from + 400 * DAY }); assert.equal(exact.status, 200);
    assert.equal(exact.data.days.length, 400); assert.equal(total(exact.data), 0);
    const dst = await f.get({ end: from + 400 * DAY + 3600000 }); assert.equal(dst.status, 200, 'a DST hour on top of 400 days is still accepted');
    for (const span of [400 * DAY + 2 * 3600000 + 1, 401 * DAY, 402 * DAY]) {
      const result = await f.get({ end: from + span });
      assert.equal(result.status, 400, `${span / DAY} days must be rejected`);
      assert.equal(result.data.error, 'range-too-long');
    }
  }],
  ['Partial business day', async (f) => {
    const start = ms('2026-10-20T19:30:00+01:00');
    f.sale({ ts: start - 1, cents: 9999 }); f.sale({ ts: start, cents: 1111 });
    f.sale({ cents: 2222 }); f.sale({ ts: to, cents: 8888 });
    const { data } = await f.get({ start });
    assert.equal(data.days[0].from, start); assert.equal(data.days[0].to, ms('2026-10-21T05:00:00+01:00'));
    assert.equal(data.days[0].count, 2); assert.equal(total(data), 3333);
  }],
  ['Paris DST and early sale', async (f) => {
    f.sqlite.prepare('UPDATE merchant_config SET timezone = ? WHERE merchant = ?').run('Europe/Paris', merchant);
    f.sale({ ts: ms('2026-03-27T05:30:00+01:00'), cents: 1234 });
    f.sale({ ts: ms('2026-03-28T20:00:00+01:00'), cents: 2345 });
    const start = ms('2026-03-27T05:00:00+01:00'), end = ms('2026-03-29T05:00:00+02:00');
    const { status, data } = await f.get({ start, end }); assert.equal(status, 200);
    assert.deepEqual(data.days.map(d => [d.day, d.from, d.to, d.cents]), [
      ['2026-03-27', start, ms('2026-03-28T05:00:00+01:00'), 1234],
      ['2026-03-28', ms('2026-03-28T05:00:00+01:00'), end, 2345],
    ]);
    assert.equal(data.days[1].to - data.days[1].from, 23 * 3600000);
    assert.deepEqual(data.days[0].hours, { 5: 1234 });
  }],
  ['Old schema second-shape fallback', async (f) => {
    f.sale({ cents: 10000, method: 'split', parts: '[{"method":"cash","amountCents":10000}]' });
    f.sale({ cents: 1234, method: 'card' }); f.fallback();
    const { status, data } = await f.get(); assert.equal(status, 200);
    assert.equal(f.queries.length, 3); assert.match(f.queries[0], /payment_parts/); assert.match(f.queries[1], /payment_parts/);
    assert.doesNotMatch(f.queries[2], /payment_parts/); assert.match(f.queries[2], /amount_cents.*void_ts IS NULL/);
    assert.deepEqual(data.splits, []); assert.equal(total(data), 11234);
    assert.deepEqual(data.days[0].whole, { split: 10000, card: 1234 });
  }],
  ['Tips and channels', async (f) => {
    f.sale({ cents: 5000 }); f.sale({ cents: 2000, method: 'card' }); f.sale({ cents: -700 });
    f.sqlite.prepare("UPDATE sales SET tip_cents = 300, channel = 'takeaway' WHERE amount_cents = 5000").run();
    f.sqlite.prepare("UPDATE sales SET tip_cents = -5, channel = 'dining' WHERE amount_cents = 2000").run();
    const { data } = await f.get();
    assert.equal(data.days[0].tipCents, 300, 'only positive tips count');
    assert.deepEqual(data.days[0].channels, { takeaway: { count: 1, cents: 5000 }, dining: { count: 1, cents: 2000 } }, 'refunds stay out of channels');
  }],
];
let failures = 0;
for (const [i, [name, test]] of cases.entries()) {
  const f = fixture();
  try { await test(f); console.log(`PASS ${i + 1}. ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${i + 1}. ${name}\n${error.stack}`); }
  finally { f.sqlite.close(); }
}
process.exitCode = failures ? 1 : 0;
