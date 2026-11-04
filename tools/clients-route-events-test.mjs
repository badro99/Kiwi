// Public route contract on SQLite-backed D1, with atomic batches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { migrated } from './fixtures/migrated-tables.cjs';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/clients.js';
const sql = new DatabaseSync(':memory:');
migrated(sql);
const DB = {
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
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: 'clients-route-synthetic-secret' };
const merchant = 'route-fixture';
const now = Date.now;
Date.now = () => 1800000000000;
try {
  sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?)')
    .run('owner', 'route@example.test', 'Fixture', 's', 'h', Date.now());
  sql.prepare('INSERT INTO merchant_config(merchant,account_id,features,type,status,updated_ts) VALUES(?,?,?,?,?,?)')
    .run(merchant, 'owner', '{}', 'boutique', 'active', Date.now());
  sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,?,?)')
    .run(merchant, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 1, threshold: 10 } }), 1, Date.now());
  const cookie = sessionCookie(await makeSession('owner', env.AUTH_SECRET)).split(';')[0];
  async function call(body) {
    const response = await (body ? onRequestPost : onRequestGet)({ env, request: new Request(
      'https://kiwi.test/api/clients?merchant=' + merchant, {
        method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify({ merchant, ...body }) } : {}),
      }) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const created = await call({ id: 'client', name: 'Fixture', points: 999, visits: 999, spend: 999 });
  assert.deepEqual(created, { ok: true, merchant, id: 'client', cursor: Date.now() });
  const purchase = { clientId: 'client', ref: 'purchase:client:sale', saleRef: 'sale', amount: 25.37, method: 'cash' };
  assert.deepEqual(await call({ purchase }), { ok: true, points: 25, stamps: 0, visits: 1, spend: 25.37, amountSource: 'device' });
  assert.deepEqual(await call({ purchase }), { ok: true, replayed: true, spend: 25.37, points: 25, stamps: 0 });
  const redemption = { clientId: 'client', ref: 'reward:client:one' };
  assert.deepEqual(await call({ redemption }), { ok: true, pointsDelta: 10, stampsDelta: 0 });
  assert.deepEqual(await call({ redemption }), { ok: true, replayed: true, pointsDelta: 10, stampsDelta: 0 });
  const read = await call();
  assert.equal(read.merchant, merchant); assert.equal(read.more, false); assert.equal(read.clients.length, 1);
  const row = read.clients[0];
  assert.deepEqual([row.id, row.name, row.points, row.stamps, row.visits, row.spend], ['client', 'Fixture', 15, 0, 1, 25.37]);
  assert.equal(read.cursor, Date.now() + 2);
  assert.deepEqual(row.purchase_refs, [purchase.ref]); assert.deepEqual(row.reward_refs, [redemption.ref]);
  assert.deepEqual(row.purchase_history, [{ ref: purchase.ref, saleRef: 'sale', amount: 25.37, method: 'cash', items: [], createdAt: Date.now() }]);
  assert.deepEqual(row.loyalty_sales, { sale: { paid: 25.37, earned: 25, stamped: 0, refunded: 0, clawed: 0, unstamped: 0 } });
  console.log('clients route: create, purchase, points redemption, retries and read contract passed');
} finally { Date.now = now; sql.close(); }

// The behavior contract above also guards the responsibility boundary.
const route = readFileSync(new URL('../functions/api/clients.js', import.meta.url), 'utf8');
assert.match(route, /from '\.\/clients\/_events\.js'/);
assert.doesNotMatch(route, /(?:async function apply(?:Purchase|Refund|Redemption)|ensurePurchaseEvents|ensureRewardEvents|ensureClientSyncSequence)/);
