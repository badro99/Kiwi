import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { onRequestPost as operation, onRequestGet as operationGet } from '../functions/api/operations.js';
import { makeSession } from '../functions/auth/_lib.js';
import { onRequestPost as shopify, __test as inbound } from '../functions/api/channel/shopify/[link].js';
import { flushInboundStock } from '../functions/api/shopify/_inbound-stock.js';

// Execute production SQL, not hand-modelled balances or permissive query mocks.
function adapter(db, before = () => {}) {
  return { prepare(sql) { let args = []; return {
    bind(...a) { args = a; return this; },
    async run() { before(sql); const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    async first() { before(sql); return db.prepare(sql).get(...args) || null; },
    async all() { before(sql); return { results: db.prepare(sql).all(...args) }; },
  }; } };
}
let checks = 0;
const verify = (condition, message) => { assert.ok(condition, message); checks++; };
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,business TEXT,session_epoch INTEGER DEFAULT 0,status TEXT DEFAULT 'active');
  CREATE TABLE merchant_config(merchant TEXT PRIMARY KEY,account_id TEXT,status TEXT);
  CREATE TABLE store_docs(merchant TEXT,feature TEXT,data TEXT,updated_ts INTEGER);
  CREATE TABLE operators(id TEXT PRIMARY KEY);
  INSERT INTO accounts(id,business) VALUES('audit-owner','Audit');
  INSERT INTO merchant_config VALUES('audit','audit-owner','active');`);
const env = { DB: adapter(db), AUTH_SECRET: 'synthetic-secret', PAYMENT_LINK_WEBHOOK: 'https://synthetic.invalid/no-network' };
const cookie = 'kiwi_sess=' + await makeSession('audit-owner', env.AUTH_SECRET);
const originalFetch = globalThis.fetch;
let sent = 0, totalSent = 0, ambiguous = false, empty = false, ledgerDown = false, inquiries = 0;
env.DB = adapter(db, sql => { if (ledgerDown && sql.includes('INSERT INTO payment_refunds')) throw new Error('synthetic ledger outage'); });
globalThis.fetch = async (_url, options) => {
  const b = JSON.parse(options.body);
  if (b.kind === 'payment-link') return Response.json({ url: 'https://synthetic.invalid/link', reference: 'fixture' });
  if (b.kind === 'payment-status') return Response.json({ status: 'paid', paidAmount: 100 });
  if (b.kind === 'payment-refund-status') {
    inquiries++;
    return Response.json({ status: 'refunded', commandId: b.commandId, amount: 20, reference: 'verified-' + b.commandId });
  }
  assert.equal(b.kind, 'payment-refund');
  assert.equal(options.headers['Idempotency-Key'], b.commandId);
  sent++; totalSent += b.amount;
  if (ambiguous) throw new Error('synthetic response lost after provider accepted');
  if (empty) return Response.json({});
  return Response.json({ reference: 'refund-' + b.commandId });
};
async function post(id, action, payload) {
  const response = await operation({ env, request: new Request('https://kiwi.test/api/operations', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: 'audit', id, idempotencyKey: id, domain: 'payment', action, confirmed: true, payload }),
  }) });
  const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
}
async function reconcile(commandId, transition = 'processing') {
  const response = await operation({ env, request: new Request('https://kiwi.test/api/operations', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: 'audit', commandId, transition, confirmed: true }),
  }) });
  return { status: response.status, body: await response.json() };
}
try {
  const created = await post('audit:create', 'create-link', { amount: 100 });
  const reference = created.command.result.reference;
  await post('audit:settle', 'settle-link', { reference });
  const results = await Promise.all([
    post('audit:refund-1', 'refund-link', { reference, amount: 80 }),
    post('audit:refund-2', 'refund-link', { reference, amount: 80 }),
  ]);
  verify(sent === 1 && totalSent === 80, 'parallel refunds never send more than paid to provider');
  verify(db.prepare('SELECT SUM(amount_cents) n FROM payment_refunds').get().n === 8000, 'confirmed provider refund persists');
  verify(results.filter(r => r.command.status === 'completed').length === 1, 'one reservation wins');
  await post('audit:refund-1', 'refund-link', { reference, amount: 80 });
  verify(sent === 1, 'same command retry never contacts provider twice');
  ambiguous = true;
  const unknown = await post('audit:refund-3', 'refund-link', { reference, amount: 20 });
  verify(unknown.command.status === 'blocked' && unknown.command.result.reconciliationRequired, 'ambiguous provider response is explicit');
  await post('audit:refund-4', 'refund-link', { reference, amount: 20 });
  verify(sent === 2, 'unknown reservation cannot be spent by another command');
  const listed = await operationGet({ env, request: new Request('https://kiwi.test/api/operations?merchant=audit&view=payments', { headers: { cookie } }) });
  const list = await listed.json(); assert.equal(listed.status, 200, JSON.stringify(list));
  verify(list.links[0].refundableCents === 0 && list.links[0].reservedCents === 2000, 'payment view exposes held balance');
  const confirmed = await reconcile('audit:refund-3');
  verify(confirmed.status === 200 && confirmed.body.command.status === 'completed' && sent === 2 && inquiries === 1,
    'unknown refund reconciles through status inquiry without another refund');
  await reconcile('audit:refund-3');
  verify(db.prepare('SELECT SUM(amount_cents) n FROM payment_refunds').get().n === 10000 && inquiries === 1,
    'reconciliation replay does not duplicate ledger or external calls');

  ambiguous = false; empty = true;
  const link2 = (await post('audit:create2', 'create-link', { amount: 100 })).command.result.reference;
  await post('audit:settle2', 'settle-link', { reference: link2 });
  const noEvidence = await post('audit:empty', 'refund-link', { reference: link2, amount: 20 });
  verify(noEvidence.command.status === 'blocked' && !db.prepare('SELECT 1 FROM payment_refunds WHERE command_id=?').get('audit:empty'),
    'empty HTTP success is not refund evidence');
  verify((await reconcile('audit:empty', 'completed')).status === 409, 'manual lifecycle transition cannot forge financial completion');
  await reconcile('audit:empty');
  empty = false; ledgerDown = true;
  const heldLedger = await post('audit:ledger', 'refund-link', { reference: link2, amount: 20 });
  verify(heldLedger.command.status === 'blocked' && !!db.prepare('SELECT provider_ref FROM payment_refund_reservations WHERE command_id=?').get('audit:ledger').provider_ref,
    'accepted provider evidence survives ledger failure');
  ledgerDown = false;
  const sentBefore = sent, inquiriesBefore = inquiries;
  const recovered = await reconcile('audit:ledger');
  verify(recovered.body.command.status === 'completed' && sent === sentBefore && inquiries === inquiriesBefore,
    'ledger-only recovery uses saved provider evidence without contacting provider');
} finally { globalThis.fetch = originalFetch; db.close(); }

const stock = new DatabaseSync(':memory:');
stock.exec(`CREATE TABLE channel_links(id TEXT,merchant TEXT,channel TEXT,config TEXT,status TEXT,last_ts INTEGER,last_err TEXT);
 CREATE TABLE orders(id TEXT,merchant TEXT,number INTEGER,mode TEXT,table_no TEXT,total INTEGER,lines TEXT,status TEXT,created_ts INTEGER,updated_ts INTEGER,channel TEXT,ext_ref TEXT,customer TEXT, UNIQUE(merchant,channel,ext_ref));
 CREATE TABLE shopify_variant_links(merchant TEXT,kiwi_variant_id TEXT,shopify_variant_id TEXT,status TEXT);
 CREATE TABLE catalogs(merchant TEXT,data TEXT,rev INTEGER,updated_ts INTEGER);
 CREATE TABLE shopify_connections(merchant TEXT,last_error TEXT,updated_ts INTEGER);
 INSERT INTO shopify_variant_links VALUES('audit','kv-1','gid://shopify/ProductVariant/901','active');`);
stock.prepare('INSERT INTO channel_links VALUES(?,?,?,?,?,NULL,NULL)').run('link-audit', 'audit', 'shopify', JSON.stringify({ shop: 'audit.myshopify.com', shopifySecret: 'synthetic' }), 'active');
stock.prepare('INSERT INTO catalogs VALUES(?,?,1,1)').run('audit', JSON.stringify({
  products: [{ id: 'kp-1', name: 'synthetic', priceMAD: 12.35, createdAt: 1 }],
  variants: [{ id: 'kv-1', productId: 'kp-1', colorId: 'default', colorFamily: 'default', size: 'U', stock: 10, base: 10, baseAt: 1, barcodes: [] }], moves: [],
}));
let outage = true;
const stockEnv = { DB: adapter(stock, sql => { if (outage && sql.startsWith('UPDATE catalogs SET data')) throw new Error('synthetic catalog unavailable'); }) };
const raw = JSON.stringify({ id: 42, currency: 'MAD', total_price: '12.35', line_items: [{ id: 91, variant_id: 901, title: 'synthetic', quantity: 1, price: '12.35' }] });
function hook() { return shopify({ env: stockEnv, params: { link: 'link-audit' }, request: new Request('https://kiwi.test/api/channel/shopify/link-audit', {
  method: 'POST', headers: { 'X-Shopify-Shop-Domain': 'audit.myshopify.com', 'X-Shopify-Topic': 'orders/create',
    'X-Shopify-Hmac-Sha256': createHmac('sha256', 'synthetic').update(raw).digest('base64') }, body: raw,
}) }); }
try {
  const response = await hook(); assert.equal(response.status, 200, await response.text());
  const order = stock.prepare('SELECT * FROM orders').get();
  verify(order.total === 12.35 && JSON.parse(order.lines)[0].unitPrice === 12.35, 'Shopify preserves MAD centimes in stored ticket');
  verify(stock.prepare('SELECT status FROM shopify_inbound_stock').get().status === 'pending', 'acknowledged stock failure has a durable retry');
  outage = false; stock.exec('UPDATE shopify_inbound_stock SET next_ts=0');
  await flushInboundStock(stockEnv, inbound.applyShopifyOrderStock);
  const catalog = () => JSON.parse(stock.prepare('SELECT data FROM catalogs').get().data);
  verify(stock.prepare('SELECT status FROM shopify_inbound_stock').get().status === 'done' && catalog().variants[0].stock === 9, 'scheduled retry recovers stock without webhook redelivery');
  await hook(); await flushInboundStock(stockEnv, inbound.applyShopifyOrderStock);
  verify(catalog().variants[0].stock === 9 && catalog().moves.length === 1, 'webhook and scheduler retries do not decrement twice');
} finally { stock.close(); }
console.log(`audit-remediation-connectors: ${checks} checks passed`);
