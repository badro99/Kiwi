import orderProTestSource from './orderpro-test-source.cjs';
import serveurTestSource from './serveur-test-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const api = read('functions/api/menu/availability.js');
const caisse = read('assets/caisse-menu-availability.js');
const orderPro = orderProTestSource(root);
const server = serveurTestSource(read('kiwi-serveur.html'));

assert.match(api, /tenantFor\(request, env, asked, \{ strict: true \}\)/, 'availability writes must require an exact authenticated tenant');
assert.match(api, /WHERE merchant = \? AND updated_ts = \?/, 'availability writes must use compare-and-swap');
assert.match(api, /item\.avail = body\.available/, 'only the target availability is changed');
assert.match(caisse, /\/api\/menu\/availability/, 'cashier must use the narrow availability endpoint');
assert.match(caisse, /formulaItems/, 'formula choices must also be manageable');
assert.match(orderPro, /setInterval\(async \(\) =>[\s\S]*availabilityOf/, 'OrderPro must refresh availability while open');
assert.match(server, /setInterval\(\(\) => \{ if \(!SV_DEMO && svSlug\(\)\) svFetchCarte\(\); \}, 15000\)/, 'employee app must refresh availability while open');
assert.match(orderPro, /i\.avail !== false/, 'OrderPro must exclude unavailable items');
assert.match(server, /it\.avail !== false/, 'employee app must exclude unavailable items');

/* Run the real authenticated route on schema.sql. Mutation invert available
 * only in the success response: text checks stay green, the API lies below. */
const { DatabaseSync } = await import('node:sqlite');
const { onRequestPost } = await import('../functions/api/menu/availability.js');
const { tillToken, TILL_COOKIE } = await import('../functions/auth/_lib.js');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(statement) {
    let args = [];
    const q = {
      bind(...v) { args = v; return q; },
      first() { return sql.prepare(statement).get(...args) || null; },
      all() { return { results: sql.prepare(statement).all(...args) }; },
      run() { const r = sql.prepare(statement).run(...args); return { meta: { changes: r.changes } }; },
    };
    return q;
  },
  batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const result = statements.map(q => q.run()); sql.exec('COMMIT'); return result; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB, AUTH_SECRET: 'availability-fixture-secret' };
const now = Date.now();
sql.prepare(`INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch)
 VALUES ('account-availability','availability@example.test','Owner','availability-fixture',?,?,?,'active',0)`)
  .run('00'.repeat(16), '11'.repeat(32), now);
sql.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts)
 VALUES ('availability-fixture','{}','boutique','account-availability','Availability test','active',1,?)`).run(now);



sql.prepare('INSERT INTO menus (merchant, type, data, updated_ts) VALUES (?, ?, ?, ?)')
  .run('availability-fixture', 'restaurant', JSON.stringify({ cats: [{ id: 'c', name: 'Cat' }],
    items: [{ id: 'one', name: 'One', cat: 'c', price: 12.5 }, { id: 'two', name: 'Two', cat: 'c', price: 8 }] }), now);
const token = await tillToken(env.AUTH_SECRET, 'availability-fixture', 1);
async function availability(body, authenticated = true) {
  const request = new Request('https://kiwi.test/api/menu/availability', { method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: authenticated ? `kiwi_gate=1; ${TILL_COOKIE}=${token}` : '' },
    body: JSON.stringify({ merchant: 'availability-fixture', itemId: 'one', available: false, ...body }) });
  const response = await onRequestPost({ request, env });
  return { status: response.status, body: await response.json() };
}
const savedMenu = () => JSON.parse(sql.prepare('SELECT data FROM menus WHERE merchant=?').get('availability-fixture').data);
let result = await availability({});
assert.equal(result.status, 200); assert.equal(result.body.available, false, 'run: API confirms the requested availability');
assert.equal(savedMenu().items.find(i => i.id === 'one').avail, false);
assert.equal(savedMenu().items.find(i => i.id === 'two').price, 8, 'run: neighboring price preserved');
assert.notEqual(savedMenu().items.find(i => i.id === 'two').avail, false);
result = await availability({ available: true });
assert.equal(result.status, 200); assert.equal(savedMenu().items.find(i => i.id === 'one').avail, true);
assert.equal((await availability({}, false)).status, 401, 'run: unpaired browser refused');
assert.equal((await availability({ merchant: 'another-merchant' })).status, 401, 'run: paired till cannot write another tenant');
assert.equal((await availability({ itemId: 'absent' })).status, 404);
assert.equal((await availability({ available: 'false' })).status, 400);
assert.equal((await availability({ until: now - 1000 })).status, 400);
// Three failed compare-and-swap attempts must refuse, never report success.
const prepare = DB.prepare;
DB.prepare = statement => statement.startsWith('UPDATE menus')
  ? { bind() { return this; }, run() { return { meta: { changes: 0 } }; } } : prepare(statement);
result = await availability({});
assert.equal(result.status, 409); assert.equal(result.body.error, 'menu-busy');
assert.equal(savedMenu().items.find(i => i.id === 'one').avail, true, 'run: conflict preserves persisted availability');
sql.close();

console.log('menu availability contract: PASS');
