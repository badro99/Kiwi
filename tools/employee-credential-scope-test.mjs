#!/usr/bin/env node
/* Connexion employé · findEmployeeCredential ne lit que les magasins concernés.
 *
 * Vague 14, voie A. La fonction chargeait et analysait (JSON.parse) les
 * documents `team` et `employee-access` de TOUS les commerçants à chaque
 * connexion : le coût suivait la base entière. Elle filtre maintenant en SQL
 * sur l'adresse et ne rapporte que la paire de documents des magasins touchés.
 * Mesuré ici sur la vraie fonction et un vrai SQLite : combien de lignes
 * remontent, et que le verdict ne change pas. Codes synthétiques, jamais
 * imprimés.
 *   node tools/employee-credential-scope-test.mjs
 */
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { findEmployeeCredential } from '../functions/auth/_lib.js';

const f = await fixture(new URL('..', import.meta.url).pathname);
const { sql, env } = f;
let passed = 0;
async function ok(label, fn) { await fn(); passed++; console.log(`  ok  ${label}`); }

const SHOPS = Array.from({ length: 12 }, (_, i) => 'scope-shop-' + i);
for (const m of SHOPS) sql.prepare("INSERT INTO merchant_config(merchant,account_id,features,name,type,status,till_epoch,updated_ts) VALUES(?,'money-owner','{}','Scope','boutique','active',0,?)").run(m, Date.now());
const doc = (merchant, feature, data, ts = Date.now()) => sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?)').run(merchant, feature, JSON.stringify(data), ts);
const person = (merchant, n, over = {}) => ({ id: `${merchant}-m${n}`, firstName: 'Emp' + n, lastName: 'Z.', email: `emp${n}@${merchant}.example.test`, function: 'cashier', pinCode: String(2000 + n), password: String(2000 + n), venueSlug: merchant, ...over });
for (const m of SHOPS) {
  const staff = Array.from({ length: 8 }, (_, n) => person(m, n));
  doc(m, 'team', { members: staff }, 1);
  doc(m, 'employee-access', { members: staff }, 1);
}

/* Compte les lignes de store_docs qui remontent d'une connexion. */
async function countedLookup(email, pin) {
  const returned = [];
  const spy = { ...env, DB: { ...env.DB, prepare(q) {
    const st = env.DB.prepare(q);
    if (!/FROM store_docs/i.test(q)) return st;
    const wrap = (s) => ({ ...s, bind: (...a) => wrap(s.bind(...a)), all: async () => { const r = await s.all(); returned.push(...r.results.map((x) => x.merchant)); return r; } });
    return wrap(st);
  } } };
  const result = await findEmployeeCredential(spy, email, pin);
  return { result, returned };
}

console.log('employee credential · only the stores that mention the address are read');
await ok('a login reads the two documents of ONE store out of twelve', async () => {
  const { result, returned } = await countedLookup('emp3@scope-shop-5.example.test', '2003');
  assert.ok(result && result.merchant === 'scope-shop-5' && result.id === 'scope-shop-5-m3');
  assert.equal(returned.length, 2, 'team + employee-access of one store, not 24 documents');
  assert.ok(returned.every((m) => m === 'scope-shop-5'));
});
await ok('an unknown address reads nothing at all', async () => {
  const { result, returned } = await countedLookup('nobody@elsewhere.example.test', '2003');
  assert.equal(result, null);
  assert.equal(returned.length, 0);
});
await ok('the verdict is unchanged for every store: right code in, wrong code out', async () => {
  for (const m of SHOPS) {
    const hit = await findEmployeeCredential(env, `emp5@${m}.example.test`, '2005');
    assert.ok(hit && hit.merchant === m && hit.id === `${m}-m5`);
    assert.equal(await findEmployeeCredential(env, `emp5@${m}.example.test`, '2006'), null);
  }
});
await ok('the address match is case-insensitive, as before', async () => {
  const { result } = await countedLookup('EMP2@Scope-Shop-1.Example.TEST', '2002');
  assert.ok(result && result.merchant === 'scope-shop-1');
  doc('scope-shop-2', 'employee-access', { members: [person('scope-shop-2', 9, { email: 'Mixed.Case@Scope-Shop-2.example.test', pinCode: '3939', password: '3939' })] });
  assert.ok(await findEmployeeCredential(env, 'mixed.case@scope-shop-2.example.test', '3939'));
});
await ok('a longer address that merely contains the typed one is not a match', async () => {
  doc('scope-shop-3', 'team', { members: [person('scope-shop-3', 1, { email: 'long.emp1@scope-shop-3.example.test', pinCode: '4141', password: '4141' })] });
  assert.equal(await findEmployeeCredential(env, 'emp1@scope-shop-3.example.test', '4141'), null);
  assert.ok(await findEmployeeCredential(env, 'long.emp1@scope-shop-3.example.test', '4141'));
});
await ok('two stores holding the same address and code stay ambiguous', async () => {
  const twin = (m) => person(m, 0, { email: 'twin@shared.example.test', pinCode: '5151', password: '5151' });
  doc('scope-shop-6', 'team', { members: [twin('scope-shop-6')] });
  doc('scope-shop-7', 'team', { members: [twin('scope-shop-7')] });
  const r = await findEmployeeCredential(env, 'twin@shared.example.test', '5151');
  assert.equal(r && r.ambiguous, true);
});
await ok('a removed employee (tombstone in the team document) still cannot log in', async () => {
  const gone = person('scope-shop-8', 4, { email: 'gone@scope-shop-8.example.test', pinCode: '6161', password: '6161' });
  doc('scope-shop-8', 'employee-access', { members: [gone] });
  doc('scope-shop-8', 'team', { members: [], removed: [{ id: gone.id, ts: 5 }] });
  assert.equal(await findEmployeeCredential(env, gone.email, '6161'), null);
});
await ok('a newer team document alone (a fresh hire, no access mirror) is found', async () => {
  const fresh = person('scope-shop-9', 7, { email: 'fresh@scope-shop-9.example.test', pinCode: '7171', password: '7171' });
  sql.prepare("DELETE FROM store_docs WHERE merchant='scope-shop-9' AND feature='employee-access'").run();
  doc('scope-shop-9', 'team', { members: [fresh] }, 9);
  const r = await findEmployeeCredential(env, fresh.email, '7171');
  assert.ok(r && r.merchant === 'scope-shop-9');
});
await ok('an address JSON would store escaped still works (full-read fallback)', async () => {
  const odd = person('scope-shop-10', 2, { email: "o'brien+tag@scope-shop-10.example.test", pinCode: '8181', password: '8181' });
  doc('scope-shop-10', 'team', { members: [odd] });
  const r = await findEmployeeCredential(env, odd.email, '8181');
  assert.ok(r && r.merchant === 'scope-shop-10');
  const quoted = person('scope-shop-11', 2, { email: 'q"uote@scope-shop-11.example.test', pinCode: '8282', password: '8282' });
  doc('scope-shop-11', 'team', { members: [quoted] });
  assert.ok(await findEmployeeCredential(env, quoted.email, '8282'));
});
await ok('a malformed address or code never reaches the database', async () => {
  const { result, returned } = await countedLookup('not-an-address', '2003');
  assert.equal(result, null);
  assert.equal(returned.length, 0);
  assert.equal(await findEmployeeCredential(env, 'emp3@scope-shop-5.example.test', '20'), null);
});

f.close();
console.log(`\n${passed} passed`);
