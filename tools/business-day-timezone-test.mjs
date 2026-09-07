import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as calendar from '../functions/api/_business-day.js';

const stamp = Date.parse;
const cases = [
  ['2026-07-10T03:59:59Z', '2026-07-09', '2026-07-09T04:00:00Z'],
  ['2026-07-10T04:00:00Z', '2026-07-10', '2026-07-10T04:00:00Z'],
  ['2026-02-20T04:59:59Z', '2026-02-19', '2026-02-19T05:00:00Z'],
  ['2026-02-20T05:00:00Z', '2026-02-20', '2026-02-20T05:00:00Z'],
  ['2026-02-15T04:30:00Z', '2026-02-14', '2026-02-14T04:00:00Z'],
  ['2026-03-22T03:30:00Z', '2026-03-21', '2026-03-21T05:00:00Z'],
  ['2027-01-01T03:59:59Z', '2026-12-31', '2026-12-31T04:00:00Z'],
];
for (const tz of ['UTC', 'Europe/Berlin', 'America/New_York', 'Africa/Casablanca']) {
  process.env.TZ = tz;
  for (const [now, day, boundary] of cases) {
    assert.equal(calendar.businessDate(stamp(now)), day, `${tz} ${now}`);
    assert.equal(calendar.businessDayStart(stamp(now)), stamp(boundary), `${tz} ${now}`);
  }
}
assert.equal(calendar.businessDayStart(stamp('2026-07-10T05:30:00Z'), 7), stamp('2026-07-09T06:00:00Z'));
assert.equal(calendar.businessBoundary('2026-02-15') - calendar.businessBoundary('2026-02-14'), 25 * 3600000);
assert.equal(calendar.businessBoundary('2026-03-22') - calendar.businessBoundary('2026-03-21'), 23 * 3600000);
console.log('  ✓ Casablanca cutoff, year rollover, custom cutoff, 23/25-hour days and host timezone independence');

// Real route bodies and real SQLite queries, with only authentication stubbed.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
sqlite.exec(`INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES
  ('test-owner','owner@example.test','test-restaurant','','',1)`);
sqlite.exec(`INSERT INTO merchant_config (merchant,features,account_id,updated_ts) VALUES ('test-restaurant','{}','test-owner',1)`);
const DB = { prepare(sql) {
  let args = [];
  const st = {
    bind(...values) { assert.ok(values.length <= 100, 'D1 parameter budget'); args = values; return st; },
    all() { return { results: sqlite.prepare(sql).all(...args) }; },
    first() { return sqlite.prepare(sql).get(...args) || null; },
  };
  return st;
} };
async function route(file, now) {
  const src = fs.readFileSync(new URL('../functions/api/admin/' + file, import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/export /g, '');
  class FixedDate extends Date { static now() { return now; } }
  const ctx = vm.createContext({
    ...calendar, Date: FixedDate, console, isOperator: async () => true,
    isSeniorOperator: async () => true, slugMerchant: value => value,
    json: (data, status = 200) => ({ status, data }),
  });
  vm.runInContext(src, ctx);
  const response = await ctx.onRequestGet({ request: {}, env: { DB } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}
for (const now of ['2026-07-10T04:30:00Z', '2026-02-20T05:30:00Z', '2026-03-25T12:00:00Z']) {
  sqlite.exec('DELETE FROM sales');
  const windows = calendar.businessDayWindows(stamp(now));
  const insert = sqlite.prepare("INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,void_ts) VALUES (?,?,0,?,'cash',?,?)");
  for (const [i, day] of windows.entries()) {
    insert.run('real-' + i, 'test-restaurant', 125, day.from, null);
    insert.run('demo-' + i, 'demo-restaurant', 900, day.from, null);
  }
  insert.run('previous', 'test-restaurant', 250, windows.at(-1).from - 1, null);
  const clients = await route('clients.js', stamp(now));
  const overview = await route('overview.js', stamp(now));
  assert.equal(clients.dayStart, windows.at(-1).from);
  assert.equal(overview.dayStart, clients.dayStart);
  assert.equal(clients.clients.find(c => c.merchant === 'test-restaurant').today_amount, 1.25);
  assert.equal(overview.gmv.today, 1.25);
  assert.equal(overview.series.length, 30);
  for (const [i, day] of windows.entries()) {
    assert.equal(overview.series[i].d, day.d);
    assert.equal(overview.series[i].amount, i === 28 ? 3.75 : 1.25);
  }
}
sqlite.close();
console.log('  ✓ real admin queries agree on today and all 30 buckets, including DST, centimes and demos');
