import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { runWithPayloadFallback } from '../functions/api/ai/_payload-fallback.js';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as genericOrder } from '../functions/api/channel/order.js';
import { onRequestPost as shopifyOrder, __test as shopify } from '../functions/api/channel/shopify/[link].js';
import { onRequestGet as queueGet } from '../functions/api/order/queue.js';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const calls = [];
const gateway = { gateway: { id: 'kiwi', cacheTtl: 0 } };
const fallbackEnv = { AI: { async run(model, payload, options) {
  calls.push({ model, payload, options });
  if (calls.length === 1) throw Object.assign(new Error('temporary gateway failure'), { status: 503 });
  return { text: 'ok' };
} } };
const fallback = await runWithPayloadFallback(fallbackEnv, 'primary', { audio: 'AQ==' }, 'fallback', { audio: [1] });
check(fallback.model === 'fallback' && calls.length === 2, 'transient AI failure reaches the intended fallback once');
check(calls.every(call => JSON.stringify(call.options) === JSON.stringify(gateway)), 'primary and fallback both use the gateway');
check(Array.isArray(calls[1].payload.audio), 'payload-shape fallback preserves the alternate native payload');

calls.length = 0;
const policyEnv = { AI: { async run(model, payload, options) {
  calls.push({ model, payload, options });
  throw Object.assign(new Error('quota exceeded'), { status: 429 });
} } };
await assert.rejects(() => runWithPayloadFallback(policyEnv, 'primary', {}, 'fallback'), /quota exceeded/);
check(calls.length === 1 && calls[0].options.gateway.id === 'kiwi', 'policy/quota refusal never invokes a fallback or direct AI call');

const sourceFiles = [
  'vision-inspect.js', 'expense-ocr.js', 'tpe-reconcile.js', 'voice.js',
  'menu-import.js', 'salle-import.js',
];
for (const file of sourceFiles) {
  const source = fs.readFileSync(new URL(`../functions/api/ai/${file}`, import.meta.url), 'utf8');
  check(source.includes("./_payload-fallback.js"), `${file} routes fallback through the guarded payload helper`);
}

check(shopify.translate({ total_price: '12.35', line_items: [{ price: '12.35', quantity: 1, title: 'item' }] }).total === 12.35,
  'Shopify preserves valid centimes');
check(Number.isNaN(shopify.translate({ total_price: 'Infinity', line_items: [{ price: '12.35', quantity: 1, title: 'item' }] }).total),
  'Shopify rejects non-finite totals before the route accepts them');
check(Number.isNaN(shopify.translate({ total_price: '1.00', line_items: [{ price: 'Infinity', quantity: 1, title: 'item' }] }).lines[0].unitPrice),
  'Shopify marks non-finite unit prices invalid instead of serializing Infinity as null');

function sqliteAdapter(db) {
  return { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
}

const genericDb = new DatabaseSync(':memory:');
genericDb.exec(`CREATE TABLE channel_links(id TEXT PRIMARY KEY, merchant TEXT, channel TEXT, hash TEXT, status TEXT, last_ts INTEGER, last_err TEXT);
  CREATE TABLE orders(id TEXT PRIMARY KEY, merchant TEXT, number INTEGER, mode TEXT, table_no TEXT, total REAL, lines TEXT, status TEXT,
    created_ts INTEGER, updated_ts INTEGER, channel TEXT, ext_ref TEXT, customer TEXT);`);
const genericSecret = 'generic-channel-secret';
const genericLink = 'chl-audit-1';
const genericHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(genericSecret));
genericDb.prepare('INSERT INTO channel_links VALUES (?, ?, ?, ?, ?, 0, NULL)').run(
  genericLink, 'audit', 'generic', Array.from(new Uint8Array(genericHash), (v) => v.toString(16).padStart(2, '0')).join(''), 'active'
);
const genericResponse = await genericOrder({
  env: { DB: sqliteAdapter(genericDb) },
  request: new Request('https://kiwi.test/api/channel/order', {
    method: 'POST',
    headers: { Authorization: `Bearer kwc.${genericLink}.${genericSecret}`, 'content-type': 'application/json' },
    body: '{"total":1,"lines":[{"name":"bad","qty":1,"unitPrice":1e999}]}'
  }),
});
check(genericResponse.status === 400 && genericDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n === 0,
  'generic channel refuses non-finite line prices before creating an order');
genericDb.close();

const shopifyDb = new DatabaseSync(':memory:');
shopifyDb.exec(`CREATE TABLE channel_links(id TEXT PRIMARY KEY, merchant TEXT, channel TEXT, config TEXT, status TEXT, last_ts INTEGER, last_err TEXT);`);
const shopifySecret = 'shopify-channel-secret';
const shopifyLink = 'link-audit';
shopifyDb.prepare('INSERT INTO channel_links VALUES (?, ?, ?, ?, ?, 0, NULL)').run(
  shopifyLink, 'audit', 'shopify', JSON.stringify({ shopifySecret }), 'active'
);
const invalidShopifyRaw = '{"id":42,"currency":"MAD","total_price":"1.00","line_items":[{"id":1,"title":"bad","quantity":1,"price":1e999}]}';
const invalidShopifyResponse = await shopifyOrder({
  env: { DB: sqliteAdapter(shopifyDb) },
  params: { link: shopifyLink },
  request: new Request(`https://kiwi.test/api/channel/shopify/${shopifyLink}`, {
    method: 'POST',
    headers: {
      'X-Shopify-Shop-Domain': 'audit.myshopify.com',
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Hmac-Sha256': createHmac('sha256', shopifySecret).update(invalidShopifyRaw).digest('base64'),
    },
    body: invalidShopifyRaw,
  }),
});
check(invalidShopifyResponse.status === 400, 'Shopify webhook refuses non-finite line prices before order persistence');
shopifyDb.close();

const queueSource = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
check(queueSource.includes('unitPrice: displayMoney(l && l.unitPrice)'),
  'rejected ticket reconstruction keeps centimes');
check(queueSource.includes('Number.isFinite(amount)'),
  'rejected ticket reconstruction does not expose non-finite stored prices');

const genericSource = fs.readFileSync(new URL('../functions/api/channel/order.js', import.meta.url), 'utf8');
check(genericSource.includes("return json({ error: 'bad-line-price' }, 400)"),
  'generic channel rejects non-finite line prices');

const queueDb = new DatabaseSync(':memory:');
queueDb.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY, business TEXT, status TEXT DEFAULT 'active', session_epoch INTEGER DEFAULT 0);
  CREATE TABLE merchant_config(merchant TEXT PRIMARY KEY, account_id TEXT, status TEXT DEFAULT 'active');
  CREATE TABLE store_docs(merchant TEXT, feature TEXT, data TEXT, updated_ts INTEGER);
  CREATE TABLE operators(id TEXT PRIMARY KEY);
  CREATE TABLE orders(id TEXT PRIMARY KEY, merchant TEXT, number INTEGER, mode TEXT, table_no TEXT, total REAL, lines TEXT,
    status TEXT, created_ts INTEGER, updated_ts INTEGER, channel TEXT, ext_ref TEXT, customer TEXT, session_id TEXT,
    server_name TEXT, paid_ts INTEGER, server TEXT, menu_rev INTEGER, priced_ts INTEGER, client_ref TEXT);
  INSERT INTO accounts VALUES ('audit-owner', 'Audit', 'active', 0);
  INSERT INTO merchant_config VALUES ('audit', 'audit-owner', 'active');`);
const oldOrder = Date.now() - 60 * 60 * 1000;
queueDb.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel, ext_ref, customer, session_id, server_name, paid_ts)
  VALUES (?, 'audit', 1, 'takeout', '', 12.35, ?, 'rejected', ?, ?, 'shopify', 'old-1', '{}', '', '', NULL)`).run(
  'ord-audit-1', JSON.stringify([{ name: 'Centime', qty: 1, unitPrice: 12.35 }]), oldOrder, oldOrder
);
queueDb.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel, ext_ref, customer, session_id, server_name, paid_ts)
  VALUES (?, 'audit', 2, 'takeout', '', 1, ?, 'rejected', ?, ?, 'shopify', 'old-2', '{}', '', '', NULL)`).run(
  'ord-audit-2', JSON.stringify([{ name: 'Malformed', qty: 1, unitPrice: 'Infinity' }]), oldOrder, oldOrder
);
const queueCookie = sessionCookie(await makeSession('audit-owner', 'queue-secret')).split(';')[0];
const queueResponse = await queueGet({
  env: { AUTH_SECRET: 'queue-secret', DB: sqliteAdapter(queueDb) },
  request: new Request('https://kiwi.test/api/order/queue?merchant=audit', { headers: { Cookie: queueCookie } }),
});
const queueBody = await queueResponse.json();
const expired = queueBody.expired || [];
check(queueResponse.status === 200 && expired.find((row) => row.id === 'ord-audit-1')?.lines[0]?.unitPrice === 12.35,
  'actual queue route reconstructs rejected centime prices');
check(expired.find((row) => row.id === 'ord-audit-2')?.lines[0]?.unitPrice === 0,
  'actual queue route sanitizes a non-finite rejected price');
queueDb.close();

console.log(`audit-remediation-ai-channel-surfaces: ${checks} checks passed`);
