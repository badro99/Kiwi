// « Servi » après minuit arrive aux autres écrans (audit du 26 nov. 2026).
//
// La file ne renvoyait un bon `served` que s'il avait été CRÉÉ depuis minuit :
// envoyé à 23:50, servi à 00:10, il restait « prêt » sur la tablette cuisine et
// les autres caisses jusqu'à six heures. Le servi suit maintenant la même
// fenêtre cuisine que les autres états. Vraie route /api/order/queue sur schema.sql.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = { prepare(sql) { let a = []; const st = { bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return st; },
  async first() { return sqlite.prepare(sql).get(...a) || null; }, async all() { return { results: sqlite.prepare(sql).all(...a) }; },
  async run() { const r = sqlite.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; },
  async batch(s) { const o = []; for (const x of s) o.push(await x.run()); return o; } };
const env = { DB, AUTH_SECRET: 'served-midnight-secret' }, SHOP = 'midnight-resto';
const realNow = Date.now;
let clock = Date.UTC(2026, 10, 26, 23, 50, 0);
Date.now = () => clock;
let checks = 0;
try {
  sqlite.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc','a@a.ma','A','S','0','0',?)").run(clock);
  sqlite.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','pro','restaurant','acc','S','active',0,?)").run(SHOP, clock);
  const AUTH = await mod('functions/auth/_lib.js');
  const Q = await mod('functions/api/order/queue.js');
  const cookie = `${AUTH.TILL_COOKIE}=${await AUTH.tillToken(env.AUTH_SECRET, SHOP)}`;
  const post = async (b) => (await Q.onRequestPost({ request: new Request('https://k.test/api/order/queue', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ merchant: SHOP, ...b }) }), env, waitUntil() {} })).json();
  const poll = async (role, since) => (await Q.onRequestGet({ request: new Request(`https://k.test/api/order/queue?merchant=${SHOP}&since=${since}&role=${role}`, { headers: { Cookie: cookie } }), env, waitUntil() {} })).json();
  await post({ create: { id: 'ord-late0001', mode: 'takeout', lines: [{ name: 'Pizza', qty: 1, unitPrice: 60, station: 'cuisine' }] } });
  const k0 = await poll('kitchen', 0);
  clock = Date.UTC(2026, 10, 27, 0, 5, 0);
  await post({ id: 'ord-late0001', status: 'ready' });
  const k1 = await poll('kitchen', k0.now);
  clock = Date.UTC(2026, 10, 27, 0, 10, 0);
  await post({ id: 'ord-late0001', status: 'served' });
  assert.equal(sqlite.prepare('SELECT status FROM orders').get().status, 'served'); checks++;
  const kitchen = (await poll('kitchen', k1.now)).orders.map((o) => o.id + ':' + o.status);
  const till = (await poll('', k1.now)).orders.map((o) => o.id + ':' + o.status);
  assert.deepEqual(kitchen, ['ord-late0001:served'], 'the kitchen tablet hears « served » for a ticket sent before midnight'); checks++;
  assert.deepEqual(till, ['ord-late0001:served'], 'and so does the till'); checks++;
} finally { Date.now = realNow; }
console.log(`✓ queue-served-midnight-test : ${checks} contrôles (servi après minuit livré à la cuisine et à la caisse)`);
