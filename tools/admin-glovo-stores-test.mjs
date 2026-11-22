#!/usr/bin/env node
/* Console opérateur · « Glovo » : relier une adresse Glovo (store_id) à un
 * commerçant Kiwi. La route réelle (functions/api/admin/glovo-stores.js) sur
 * SQLite en mémoire construit depuis schema.sql.
 *
 * Ce qui doit tenir :
 *   · opérateurs seulement, et une écriture venue d'une autre origine est refusée ;
 *   · un store_id ne pointe jamais vers un commerçant qui n'existe pas, et ne
 *     change pas de commerçant en silence (409 : on le retire d'abord) ;
 *   · pause / reprise / délai de préparation / retrait, chacun en un geste ;
 *   · le webhook dispatched lit bien ce que la console écrit (même table) ;
 *   · table absente (migration 0026 non appliquée) : 503 lisible, jamais 500.
 *
 *   node tools/admin-glovo-stores-test.mjs */
import assert from 'node:assert/strict';
import { operatorToken, operatorIdToken, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost, onRequestPatch, onRequestDelete } from '../functions/api/admin/glovo-stores.js';
import { storeFor } from '../functions/api/channel/glovo/_glovo.js';
import { directoryDb } from './directory-fixture.mjs';

const secret = 'glovo-console-test-secret-0123456789abcdef';
const { sql, DB } = directoryDb({ seed: false });
const env = { DB, AUTH_SECRET: secret };
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?,?,?,?,?)").run('test-kiwi-cafe', '{}', 'TEST KIWI Café', 'cafe', 1);
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?,?,?,?,?)").run('test-kiwi-pizza', '{}', 'TEST KIWI Pizza', 'restaurant', 1);
sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-1', 'o@test', 'TEST KIWI Café', 's', 'h', 1);

sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-glovo','Salma (équipe)','','',1)");
const opCookie = `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'op-glovo')}`;
const ownerCookie = sessionCookie(await makeSession('acc-1', secret)).split(';')[0];
const URL_ = 'https://kiwi-os.com/api/admin/glovo-stores';
function req(method, body, { cookie = opCookie, origin = 'https://kiwi-os.com' } = {}) {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return { env, request: new Request(URL_, { method, headers, body: body == null ? undefined : JSON.stringify(body) }) };
}
const call = async (r) => ({ status: r.status, body: await r.json() });
let checks = 0;
const t = async (name, fn) => { await fn(); checks++; };

await t('non-opérateur refusé, en lecture comme en écriture', async () => {
  assert.equal((await onRequestGet(req('GET', null, { cookie: ownerCookie }))).status, 403);
  assert.equal((await onRequestPost(req('POST', { storeId: 'S1', merchant: 'test-kiwi-cafe' }, { cookie: ownerCookie }))).status, 403);
  assert.equal((await onRequestPost(req('POST', { storeId: 'S1', merchant: 'test-kiwi-cafe' }, { origin: 'https://evil.example' }))).status, 403);
});

await t('liste vide, avec les commerçants pour le choix', async () => {
  const { status, body } = await call(await onRequestGet(req('GET')));
  assert.equal(status, 200);
  assert.deepEqual(body.stores, []);
  assert.deepEqual(body.merchants.map((m) => m.merchant), ['test-kiwi-cafe', 'test-kiwi-pizza']);
});

await t('relier un magasin, et le webhook le retrouve', async () => {
  const { status, body } = await call(await onRequestPost(req('POST', { storeId: 'glovo-cafe-1', merchant: 'test-kiwi-cafe', prepMinutes: 20 })));
  assert.equal(status, 200);
  assert.equal(body.merchant, 'test-kiwi-cafe');
  assert.equal(body.prepMinutes, 20);
  assert.equal(body.status, 'active');
  const row = await storeFor(env, 'glovo-cafe-1');
  assert.equal(row && row.merchant, 'test-kiwi-cafe');
  const list = (await call(await onRequestGet(req('GET')))).body.stores;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'TEST KIWI Café');
});

await t('délai par défaut 15 min, borné à 120', async () => {
  const a = (await call(await onRequestPost(req('POST', { storeId: 'glovo-pizza-1', merchant: 'test-kiwi-pizza' })))).body;
  assert.equal(a.prepMinutes, 15);
  assert.equal((await call(await onRequestPost(req('POST', { storeId: 'glovo-pizza-1', merchant: 'test-kiwi-pizza', prepMinutes: 500 })))).body.prepMinutes, 120);
});

await t('entrées invalides refusées', async () => {
  assert.equal((await call(await onRequestPost(req('POST', { storeId: 'a b/c', merchant: 'test-kiwi-cafe' })))).body.error, 'bad-store-id');
  const r = await call(await onRequestPost(req('POST', { storeId: 'X', merchant: 'inconnu' })));
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'merchant-not-found');
});

await t('un store_id ne change pas de commerçant en silence', async () => {
  const r = await call(await onRequestPost(req('POST', { storeId: 'glovo-cafe-1', merchant: 'test-kiwi-pizza' })));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'store-taken');
  assert.equal((await storeFor(env, 'glovo-cafe-1')).merchant, 'test-kiwi-cafe');
  // Le même commerçant : simple mise à jour du délai.
  const same = await call(await onRequestPost(req('POST', { storeId: 'glovo-cafe-1', merchant: 'test-kiwi-cafe', prepMinutes: 25 })));
  assert.equal(same.status, 200);
  assert.equal(same.body.prepMinutes, 25);
});

await t('pause puis reprise, le webhook suit', async () => {
  const p = await call(await onRequestPatch(req('PATCH', { storeId: 'glovo-cafe-1', status: 'paused' })));
  assert.equal(p.status, 200);
  assert.equal(p.body.status, 'paused');
  assert.equal((await call(await onRequestGet(req('GET')))).body.stores.find((x) => x.store_id === 'glovo-cafe-1').prep_minutes, 25, 'la pause garde le délai');
  assert.equal(await storeFor(env, 'glovo-cafe-1'), null, 'un magasin en pause ne reçoit plus de commande');
  await onRequestPatch(req('PATCH', { storeId: 'glovo-cafe-1', status: 'active' }));
  assert.equal((await storeFor(env, 'glovo-cafe-1')).merchant, 'test-kiwi-cafe');
  assert.equal((await onRequestPatch(req('PATCH', { storeId: 'glovo-cafe-1', status: 'nope' }))).status, 400);
  assert.equal((await onRequestPatch(req('PATCH', { storeId: 'absent', status: 'paused' }))).status, 404);
});

await t('livreurs du magasin (Marketplace) : la fiche le montre, le webhook le lit, et la fiche porte la carte et la fermeture', async () => {
  const r = await call(await onRequestPatch(req('PATCH', { storeId: 'glovo-pizza-1', marketplace: true })));
  assert.equal(r.status, 200); assert.equal(r.body.marketplace, true);
  assert.equal(Number((await storeFor(env, 'glovo-pizza-1')).marketplace), 1);
  sql.prepare("UPDATE glovo_stores SET menu_status = 'SUCCESS', closing_until = '2099-01-01T00:00:00+00:00', api_err = 'HTTP 503' WHERE store_id = 'glovo-pizza-1'").run();
  const row = (await call(await onRequestGet(req('GET')))).body.stores.find((x) => x.store_id === 'glovo-pizza-1');
  assert.deepEqual([row.marketplace, row.menu_status, row.closing_until, row.api_err], [1, 'SUCCESS', '2099-01-01T00:00:00+00:00', 'HTTP 503']);
  assert.equal((await call(await onRequestPatch(req('PATCH', { storeId: 'glovo-pizza-1', marketplace: false })))).body.marketplace, false);
  assert.equal(Number((await storeFor(env, 'glovo-pizza-1')).marketplace), 0);
  assert.equal((await onRequestPatch(req('PATCH', { storeId: 'glovo-pizza-1', marketplace: true }, { cookie: ownerCookie }))).status, 403, 'operators only');
});

await t('retirer un magasin', async () => {
  assert.equal((await onRequestDelete(req('DELETE', { storeId: 'glovo-pizza-1' }))).status, 200);
  assert.equal(await storeFor(env, 'glovo-pizza-1'), null);
  assert.equal((await onRequestDelete(req('DELETE', { storeId: 'glovo-pizza-1' }))).status, 404);
  assert.equal((await onRequestDelete(req('DELETE', { storeId: 'glovo-cafe-1' }, { origin: 'https://evil.example' }))).status, 403);
});

await t('table absente : 503 lisible, jamais 500', async () => {
  const bare = directoryDb({ seed: false });
  bare.sql.exec('DROP TABLE glovo_stores');
  bare.sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-glovo','Salma (équipe)','','',1)");
  const r = await onRequestGet({ env: { DB: bare.DB, AUTH_SECRET: secret }, request: new Request(URL_, { headers: { Cookie: opCookie } }) });
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(body.error, 'not-migrated');
});

console.log(`✓ console Glovo · ${checks} scénarios : opérateurs seulement, commerçant existant, pas de changement silencieux, pause/reprise/retrait lus par le webhook`);
