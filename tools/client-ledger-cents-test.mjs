// r19b ledger lane: client spend in integer centimes (ruling 1, migration 0020)
// and the customer on the sales feed (ruling 4, migration 0021). Real routes on
// node:sqlite, real till functions in vm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { migrated } from './fixtures/migrated-tables.cjs';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as clientsGet, onRequestPost as clientsPost } from '../functions/api/clients.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import { spendCentsOf, toCents } from '../functions/api/_spend-cents.js';
import split from './split-functions.cjs';

const makeDb = (sql) => ({
  prepare(query) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
});
const merchant = 'ledger-fixture';
const clock = Date.now;
let tick = 1800000000000;
Date.now = () => (tick += 5);
let passed = 0;
const ok = (label) => { passed += 1; console.log('  ✓ ' + label); };

async function boot(prepare) {
  const sql = new DatabaseSync(':memory:');
  migrated(sql);
  if (prepare) prepare(sql);
  const env = { DB: makeDb(sql), AUTH_SECRET: 'ledger-synthetic-secret' };
  sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?)').run('owner', 'l@example.test', 'F', 's', 'h', 1);
  sql.prepare('INSERT INTO merchant_config(merchant,account_id,features,type,status,updated_ts) VALUES(?,?,?,?,?,?)').run(merchant, 'owner', '{}', 'boutique', 'active', 1);
  sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,?,?)')
    .run(merchant, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 1, threshold: 10 } }), 1, 1);
  const cookie = sessionCookie(await makeSession('owner', env.AUTH_SECRET)).split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  return {
    sql, env,
    async clients(body) {
      const r = await (body ? clientsPost : clientsGet)({ env, request: new Request('https://kiwi.test/api/clients?merchant=' + merchant, {
        method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify({ merchant, ...body }) } : {}) }) });
      return { status: r.status, body: await r.json() };
    },
    async sale(body) {
      const r = await salePost({ env, request: new Request('https://kiwi.test/api/sale', { method: 'POST', headers, body: JSON.stringify({ merchant, ...body }) }) });
      return { status: r.status, body: await r.json() };
    },
    async feed() {
      const r = await feedGet({ env, request: new Request('https://kiwi.test/api/feed?merchant=' + merchant + '&from=0', { headers }) });
      return { status: r.status, body: await r.json() };
    },
  };
}

try {
  // ── Ruling 1 · spend in centimes ────────────────────────────────────────────
  {
    const t = await boot();
    await t.clients({ id: 'c1', name: 'Float' });
    // 0.1 + 0.2 and awkward fractions: the old float column drifts, the cents do not.
    const amounts = [0.1, 0.2, 19.99, 0.07, 1234.56, 0.35, 8.05];
    for (const [i, amount] of amounts.entries()) {
      const r = await t.clients({ purchase: { clientId: 'c1', ref: 'purchase:c1:' + i, saleRef: 'S' + i, amount, method: 'cash' } });
      assert.equal(r.status, 200);
    }
    const expectedCents = amounts.reduce((sum, a) => sum + Math.round(a * 100), 0);
    const stored = t.sql.prepare('SELECT spend, spend_cents FROM clients WHERE id = ?').get('c1');
    assert.equal(stored.spend_cents, expectedCents, 'the server writes the exact integer');
    assert.equal(Number.isInteger(stored.spend_cents), true);
    const row = (await t.clients()).body.clients[0];
    assert.equal(row.spend_cents, expectedCents);
    assert.equal(row.spend, expectedCents / 100, 'devices see the same total to the centime');
    ok('purchases of 0.1, 0.2 … accumulate to the exact centime in spend_cents');

    // Refund (partial): cents follow, floor at zero.
    const refund = await t.clients({ refund: { clientId: 'c1', ref: 'refund:c1:r1', amount: 19.99, saleRef: 'S2', items: [] } });
    assert.equal(refund.status, 200);
    const after = t.sql.prepare('SELECT spend_cents FROM clients WHERE id = ?').get('c1');
    assert.equal(after.spend_cents, expectedCents - 1999);
    ok('a refund lowers spend_cents by the refunded centimes');
  }
  // Float legacy rows after the migration (no backfill): reads are identical to the centime.
  {
    const t = await boot();
    const floats = [0.30000000000000004, 1234.5600000001, 19.990000000000002, 0.1 + 0.7, 45.5, 0];
    floats.forEach((spend, i) => t.sql.prepare(
      "INSERT INTO clients (merchant,id,name,spend,srv_ts,updated_ts) VALUES (?,?,?,?,?,?)").run(merchant, 'f' + i, 'F' + i, spend, i + 1, 1));
    const migration = fs.readFileSync(new URL('../migrations/0020_client_spend_cents.sql', import.meta.url), 'utf8');
    assert.equal(/^\s*UPDATE/m.test(migration), false, 'the migration does not backfill');
    assert.equal(t.sql.prepare('SELECT COUNT(*) n FROM clients WHERE spend_cents IS NOT NULL').get().n, 0);
    const read = (await t.clients()).body.clients;
    for (const [i, r] of read.entries()) assert.equal(r.spend, Math.round(floats[i] * 100) / 100, r.id + ' unchanged to the centime');
    assert.deepEqual(read.map((r) => r.spend_cents), floats.map((v) => Math.round(v * 100)));
    ok('untouched rows (spend_cents NULL) read identically to the centime');
  }
  // Old code after the migration writes spend only: still the right cents; new code writes both.
  {
    const t = await boot();
    t.sql.prepare("INSERT INTO clients (merchant,id,name,spend,srv_ts,updated_ts) VALUES (?,?,?,0,1,1)").run(merchant, 'o', 'Old');
    t.sql.prepare('UPDATE clients SET spend = spend + 0.1 WHERE id = ?').run('o');
    t.sql.prepare('UPDATE clients SET spend = spend + 0.2 WHERE id = ?').run('o');
    const oldRead = (await t.clients()).body.clients[0];
    assert.equal(oldRead.spend_cents, 30, 'old path: spend only, cents read from spend');
    assert.equal(t.sql.prepare('SELECT spend_cents FROM clients WHERE id = ?').get('o').spend_cents, null);
    await t.clients({ purchase: { clientId: 'o', ref: 'purchase:o:1', saleRef: 'A', amount: 0.35, method: 'cash' } });
    const row = t.sql.prepare('SELECT spend, spend_cents FROM clients WHERE id = ?').get('o');
    assert.equal(row.spend_cents, 65);
    assert.equal(Math.round(row.spend * 100), row.spend_cents, 'new path: both columns agree');
    ok('old-path rows read right and new-path rows carry both columns in agreement');
  }
  // NULL rows (written by an older deploy after the column exists) keep working.
  {
    const t = await boot();
    t.sql.prepare("INSERT INTO clients (merchant,id,name,spend,spend_cents,srv_ts,updated_ts) VALUES (?,?,?,?,NULL,?,?)").run(merchant, 'old', 'Old', 12.34, 1, 1);
    assert.equal((await t.clients()).body.clients[0].spend, 12.34, 'NULL cents read through the float');
    const r = await t.clients({ purchase: { clientId: 'old', ref: 'purchase:old:1', saleRef: 'X', amount: 0.66, method: 'cash' } });
    assert.equal(r.status, 200);
    assert.equal(t.sql.prepare('SELECT spend_cents FROM clients WHERE id = ?').get('old').spend_cents, 1300, 'the next write starts from the float, in centimes');
    assert.equal(spendCentsOf({ spend: 0.30000000000000004 }), 30);
    assert.equal(toCents(0.1 + 0.2), 30);
    ok('NULL spend_cents rows are read and extended without loss');
  }
  // Prod lagging: the column does not exist yet; reading and creating still work.
  {
    const t = await boot((sql) => sql.exec('ALTER TABLE clients DROP COLUMN spend_cents'));
    const created = await t.clients({ id: 'lag', name: 'Lag' });
    assert.equal(created.status, 200, 'profile create before the migration');
    t.sql.prepare('UPDATE clients SET spend = 7.5 WHERE id = ?').run('lag');
    const row = (await t.clients()).body.clients.find((r) => r.id === 'lag');
    assert.equal(row.spend, 7.5);
    ok('before migration 0020 the book still reads and creates profiles');
  }

  // ── Ruling 4 · customer on the sales feed ───────────────────────────────────
  {
    const t = await boot();
    const sale = await t.sale({ id: 's-with', amountCents: 5000, method: 'cash', ref: 'T-1', ts: Date.now(), label: 'Robe', clientId: 'client-7',
      lines: [{ itemId: 'p', name: 'Robe', qty: 1, total: 5000 }] });
    assert.equal(sale.status, 200);
    await t.sale({ id: 's-without', amountCents: 2000, method: 'cash', ref: 'T-2', ts: Date.now(), label: 'Foulard',
      lines: [{ itemId: 'q', name: 'Foulard', qty: 1, total: 2000 }] });
    assert.equal(t.sql.prepare('SELECT client_id FROM sales WHERE id = ?').get('s-with').client_id, 'client-7');
    // A replay never overwrites the stored customer.
    await t.sale({ id: 's-with', amountCents: 5000, method: 'cash', ref: 'T-1', ts: Date.now(), label: 'Robe', clientId: 'someone-else' });
    assert.equal(t.sql.prepare('SELECT client_id FROM sales WHERE id = ?').get('s-with').client_id, 'client-7');
    const feed = await t.feed();
    assert.equal(feed.status, 200);
    const by = new Map(feed.body.sales.map((s) => [s.id, s]));
    assert.equal(by.get('s-with').clientId, 'client-7', '/api/feed returns the customer');
    assert.equal(by.has('s-without') && by.get('s-without').clientId, undefined, 'older / anonymous rows carry no clientId');
    ok('sale POST stores client_id once and /api/feed returns it; NULL rows stay NULL');
  }
  {
    const t = await boot((sql) => sql.exec('ALTER TABLE sales DROP COLUMN client_id'));
    const sale = await t.sale({ id: 's-lag', amountCents: 1000, method: 'cash', ref: 'T-9', ts: Date.now(), label: 'x', clientId: 'c',
      lines: [{ itemId: 'p', name: 'x', qty: 1, total: 1000 }] });
    assert.equal(sale.status, 200, 'the sale is booked even before migration 0021');
    const feed = await t.feed();
    assert.equal(feed.status, 200);
    assert.equal(feed.body.sales.length, 1);
    ok('before migration 0021 the sale is booked and the feed still answers');
  }

  // ── Till: an imported sale keeps its customer; the credit note attaches to it ─
  {
    const src = fs.readFileSync(new URL('../assets/pos-boutique.js', import.meta.url), 'utf8');
    const pick = (...n) => n.map((x) => split.declaration(src, x)).join('\n');
    const businessDay = (t) => new Date(t - 5 * 3600000).toISOString().slice(0, 10);
    const SALES = [];
    const now = Date.now();
    const feed = { sales: [
      { id: 'srv-1', ref: 'T-100', ts: now, method: 'cash', amountCents: 5000, lines: [{ x: 1 }], clientId: 'client-7' },
      { id: 'srv-2', ref: 'T-101', ts: now, method: 'cash', amountCents: 2000, lines: [{ x: 1 }] },
    ] };
    const book = { 'client-7': { id: 'client-7', name: 'Salma' } };
    const ctx = vm.createContext({ window: { KiwiDayReport: { businessDay }, KiwiPosSale: { feedDay: () => Promise.resolve(feed) } },
      Date, Number, Math, isNaN, RegExp, String, Array, encodeURIComponent, fetch() {}, IS_DEMO: false, merchantSlug: () => 'm', SALES, RETAIN_DAYS: 7,
      remoteLine: (l) => l, srvMethod: (m) => [m], remoteMoney: () => ({}), persistDay() {}, root: null, state: {}, renderEchanges() {}, renderBadges() {}, icons() {},
      clById: (id) => book[id] || null });
    vm.runInContext(pick('retDayKey', 'retShiftDay', 'syncReturnSales', 'saleClient') + ';this.sync=syncReturnSales;this.saleClient=saleClient;', ctx);
    await ctx.sync();
    const withClient = SALES.find((s) => s.id === 'T-100'), without = SALES.find((s) => s.id === 'T-101');
    assert.equal(withClient.clientId, 'client-7', 'imported sale keeps its customer');
    assert.equal(ctx.saleClient(withClient).name, 'Salma', 'the credit note path (saleClient) resolves the right record');
    assert.equal(without.clientId, null);
    assert.equal(ctx.saleClient(without), null, 'older rows stay unattached');
    ok('an imported sale keeps its customer and a credit note attaches to that record');
  }
  console.log(`\n✓ client-ledger-cents: ${passed} groups green`);
} finally { Date.now = clock; }
