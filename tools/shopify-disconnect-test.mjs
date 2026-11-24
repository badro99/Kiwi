#!/usr/bin/env node
/* Kiwi · shopify-disconnect-test · une boutique Shopify change de commerce Kiwi.
 *
 * 24 Nov 2026: Startoner's Shopify (64arxg-03) had been connected to Amira
 * Boutique since 27 August as a test; the owner wants it on CHICTRATEC SL, his
 * father's store. A Shopify shop belongs to one Kiwi store (shop_domain is unique,
 * and a second store's connect answers already-connected), and nothing could
 * release it. Holds, against the real routes and an in-memory D1:
 *   - POST /api/shopify/status {action:'disconnect'} removes Kiwi's webhook
 *     subscriptions from Shopify (only the ones pointing at this store's link),
 *     pauses the link (a late webhook is refused), deletes the connection, its
 *     variant links and queued writes, and journals it;
 *   - the same shop then connects to another Kiwi store;
 *   - without a connection: 404; without rights on the store: 401.
 *   node tools/shopify-disconnect-test.mjs
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken, OP_COOKIE, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as connectDirect } from '../functions/api/shopify/connect-direct.js';
import { onRequestPost as statusPost } from '../functions/api/shopify/status.js';

let n = 0, bad = 0;
const ok = (c, m, d) => { if (c) { n++; console.log('  ✓ ' + m); } else { bad++; console.log('  ✗ ' + m + (d !== undefined ? ' · ' + JSON.stringify(d) : '')); } };
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const [acc, m] of [['acc-a', 'amira-test'], ['acc-c', 'chic-test']]) {
  sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,'00','00',?)").run(acc, acc + '@t.ma', 'S', m, Date.now());
  sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES (?,'{}',?,?,'active',?)").run(m, acc, m, Date.now());
}
const DB = {
  prepare(q) { let args = []; const st = { bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
    first() { const r = sql.prepare(q).get(...args); return r === undefined ? null : r; },
    all() { return { results: sql.prepare(q).all(...args) }; },
    run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; } }; return st; },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET: 'shopify-disconnect-auth-secret-32b!!', SHOPIFY_CLIENT_ID: 'id-factice', SHOPIFY_CLIENT_SECRET: 'secret-factice-de-test', SHOPIFY_TOKEN_KEY: 'cle-de-chiffrement-factice-de-plus-de-24-caracteres', SHOPIFY_APP_URL: 'https://kiwi.test' };

/* Shopify simulé : les abonnements existants, ceux qu'on supprime. Aucun réseau. */
let subs = [], deleted = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/admin/oauth/access_token')) return reply({ access_token: 'jeton-factice', scope: 'read_orders', expires_in: 86400 });
  const body = JSON.parse(init && init.body || '{}'), q = String(body.query || '');
  if (/webhookSubscriptionCreate/.test(q)) { subs.push({ id: 'gid://shopify/WebhookSubscription/' + (subs.length + 1), uri: body.variables.webhook.uri, topic: body.variables.topic }); return reply({ data: { webhookSubscriptionCreate: { userErrors: [] } } }); }
  if (/webhookSubscriptionDelete/.test(q)) { deleted.push(body.variables.id); subs = subs.filter((s) => s.id !== body.variables.id); return reply({ data: { webhookSubscriptionDelete: { deletedWebhookSubscriptionId: body.variables.id, userErrors: [] } } }); }
  if (/webhookSubscriptions/.test(q)) return reply({ data: { webhookSubscriptions: { nodes: subs.map((s) => ({ id: s.id, uri: s.uri, endpoint: { __typename: 'WebhookHttpEndpoint', callbackUrl: s.uri } })) } } });
  if (/shop\s*\{/.test(q)) return reply({ data: { shop: { myshopifyDomain: 'startoner-test.myshopify.com' } } });
  return reply({ data: {} });
};
const cookie = async (acc) => `${SESS_COOKIE}=${await makeSession(acc, env.AUTH_SECRET)}`;
const call = async (fn, url, acc, body) => { const r = await fn({ env, request: new Request('https://kiwi.test' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: await cookie(acc) }, body: JSON.stringify(body) }), waitUntil() {} }); return { status: r.status, body: await r.json() }; };

let r = await call(connectDirect, '/api/shopify/connect-direct', 'acc-a', { merchant: 'amira-test', shop: 'startoner-test.myshopify.com' });
ok(r.status === 200, 'la boutique Shopify se relie au premier commerce', r);
const linkA = sql.prepare("SELECT channel_link_id FROM shopify_connections WHERE merchant = 'amira-test'").get().channel_link_id;
subs.push({ id: 'gid://shopify/WebhookSubscription/999', uri: 'https://ailleurs.example/hook', topic: 'ORDERS_CREATE' });
sql.prepare("INSERT INTO shopify_variant_links (merchant, kiwi_variant_id, shopify_variant_id, inventory_item_id, location_id, match_method, status, updated_ts) VALUES ('amira-test','p1:v1','gid://v/1','gid://i/1','gid://l/1','barcode','active',1)").run();
r = await call(connectDirect, '/api/shopify/connect-direct', 'acc-c', { merchant: 'chic-test', shop: 'startoner-test.myshopify.com' });
ok(r.status !== 200, 'tant qu’elle est reliée, un autre commerce ne peut pas la prendre', r);

r = await call(statusPost, '/api/shopify/status', 'acc-c', { merchant: 'amira-test', action: 'disconnect' });
ok(r.status === 401, 'un autre compte ne peut pas la déconnecter', r.status);
{ // une caisse appairée lit et règle le canal, elle ne détache pas la boutique du commerce
  const till = await statusPost({ env, request: new Request('https://kiwi.test/api/shopify/status', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: TILL_COOKIE + '=' + await tillToken(env.AUTH_SECRET, 'amira-test', 0) }, body: JSON.stringify({ merchant: 'amira-test', action: 'disconnect' }) }), waitUntil() {} });
  // un opérateur retiré de la table garde un cookie signé valide : il ne doit plus rien détacher
  const ghost = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, 'amira-test', 0)}; ${OP_COOKIE}=${await operatorToken(env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(env.AUTH_SECRET, 'op-retire')}`;
  const gone = await statusPost({ env, request: new Request('https://kiwi.test/api/shopify/status', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ghost }, body: JSON.stringify({ merchant: 'amira-test', action: 'disconnect' }) }), waitUntil() {} });
  ok(gone.status === 403 && sql.prepare("SELECT COUNT(*) n FROM shopify_connections WHERE merchant = 'amira-test'").get().n === 1, 'un opérateur retiré (cookie encore signé) ne peut pas déconnecter Shopify', gone.status);
  ok(till.status === 403 && sql.prepare("SELECT COUNT(*) n FROM shopify_connections WHERE merchant = 'amira-test'").get().n === 1, 'une caisse appairée ne peut pas déconnecter Shopify (propriétaire ou opérateur nommé seulement)', till.status);
}
r = await call(statusPost, '/api/shopify/status', 'acc-a', { merchant: 'amira-test', action: 'disconnect' });
ok(r.status === 200 && r.body.ok && r.body.webhooksRemoved === 6, 'déconnecter retire les six abonnements de Kiwi chez Shopify', r);
ok(subs.length === 1 && subs[0].uri === 'https://ailleurs.example/hook', 'un abonnement qui n’est pas celui de ce commerce reste', subs);
ok(!sql.prepare("SELECT 1 FROM shopify_connections WHERE merchant = 'amira-test'").get(), 'la connexion est supprimée');
ok(!sql.prepare("SELECT 1 FROM shopify_variant_links WHERE merchant = 'amira-test'").get(), 'ses liens de variantes aussi');
ok(sql.prepare('SELECT status FROM channel_links WHERE id = ?').get(linkA).status === 'paused', 'le lien est en pause : un webhook en retard est refusé');
const audit = sql.prepare("SELECT action FROM account_audit WHERE merchant = 'amira-test' AND action = 'shopify-disconnect'").all();
ok(audit.length === 1, 'le journal le garde', audit);
r = await call(statusPost, '/api/shopify/status', 'acc-a', { merchant: 'amira-test', action: 'disconnect' });
ok(r.status === 404, 'sans connexion : 404', r);

r = await call(connectDirect, '/api/shopify/connect-direct', 'acc-c', { merchant: 'chic-test', shop: 'startoner-test.myshopify.com' });
ok(r.status === 200 && sql.prepare("SELECT merchant FROM shopify_connections WHERE shop_domain = 'startoner-test.myshopify.com'").get().merchant === 'chic-test', 'la même boutique se relie ensuite à l’autre commerce', r);

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ Shopify · déconnecter puis relier ailleurs : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
