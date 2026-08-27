#!/usr/bin/env node

import cryptoNode from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildExactVariantMapping, decryptToken, encryptToken, normalizeShopDomain,
  enqueueStockChanges, flushShopifyOutbox, sha256Hex, stockSnapshot,
  verifyOAuthHmac, verifyWebhookHmac,
} from '../functions/api/shopify/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0; const failures = [];
const ok = (label, condition, detail = '') => condition ? pass++ : failures.push(`${label}${detail ? ` — ${detail}` : ''}`);

// Domain input is the only attacker-controlled part of the OAuth destination.
ok('bare shop name becomes a myshopify domain', normalizeShopDomain('Atlas-Casa') === 'atlas-casa.myshopify.com');
ok('full shop URL is normalized', normalizeShopDomain('https://Atlas-Casa.myshopify.com/admin') === 'atlas-casa.myshopify.com');
ok('lookalike host is rejected', normalizeShopDomain('atlas.myshopify.com.evil.test') === '');
ok('path-only injection is rejected', normalizeShopDomain('evil.test/@atlas.myshopify.com') === '');

// Token ciphertext must be randomized and authenticated.
const tokenKey = 'unit-test-token-key-with-more-than-32-bytes';
const first = await encryptToken('offline-token-for-test', tokenKey);
const second = await encryptToken('offline-token-for-test', tokenKey);
ok('access token encrypts with an explicit version', first.startsWith('v1.'));
ok('AES-GCM uses a fresh nonce', first !== second);
ok('encrypted token decrypts exactly', await decryptToken(first, tokenKey) === 'offline-token-for-test');
let wrongKeyRejected = false;
try { await decryptToken(first, 'a-different-unit-test-key-over-32-bytes'); } catch (_) { wrongKeyRejected = true; }
ok('wrong encryption key cannot decrypt', wrongKeyRejected);

// Independent Node HMAC implementations verify the two Shopify signature forms.
const oauthSecret = 'oauth-secret-for-test';
const params = new URLSearchParams({ code: 'abc', shop: 'atlas.myshopify.com', state: 'state', timestamp: '1787860000' });
const message = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('&');
params.set('hmac', cryptoNode.createHmac('sha256', oauthSecret).update(message).digest('hex'));
ok('OAuth callback HMAC is accepted', await verifyOAuthHmac(new URL(`https://kiwi.test/callback?${params}`), oauthSecret));
params.set('state', 'tampered');
ok('tampered OAuth callback is rejected', !(await verifyOAuthHmac(new URL(`https://kiwi.test/callback?${params}`), oauthSecret)));
const raw = '{"inventory_item_id":12,"available":3}';
const webhookSig = cryptoNode.createHmac('sha256', oauthSecret).update(raw).digest('base64');
ok('raw webhook HMAC is accepted', await verifyWebhookHmac(raw, webhookSig, oauthSecret));
ok('changed webhook body is rejected', !(await verifyWebhookHmac(raw + ' ', webhookSig, oauthSecret)));

// Mapping is exact and unique. Product names intentionally look similar but do
// not create a match.
const catalog = {
  products: [
    { id: 'p1', name: 'Polo Stretch', sku: '' },
    { id: 'p2', name: 'Chemise', sku: '' },
    { id: 'p3', name: 'Nom identique seulement', sku: '' },
  ],
  variants: [
    { id: 'k-bar', productId: 'p1', size: 'S', colorLabel: 'Noir', stock: 2, sku: '', barcodes: [{ code: '6111111111111' }] },
    { id: 'k-sku', productId: 'p2', size: 'M', colorLabel: 'Blanc', stock: 7, sku: 'CHEM-M', barcodes: [] },
    { id: 'k-name', productId: 'p3', size: 'L', colorLabel: 'Bleu', stock: 4, sku: '', barcodes: [] },
    { id: 'k-dup-a', productId: 'p1', size: 'L', colorLabel: 'Noir', stock: 1, sku: 'DUP', barcodes: [] },
    { id: 'k-dup-b', productId: 'p1', size: 'XL', colorLabel: 'Noir', stock: 1, sku: 'DUP', barcodes: [] },
  ],
};
const shop = [
  { id: 's-bar', inventoryItemId: 'i-bar', title: 'Different title', barcode: '6111111111111', sku: '', tracked: true, quantity: 9 },
  { id: 's-sku', inventoryItemId: 'i-sku', title: 'Another title', barcode: '', sku: 'chem-m', tracked: true, quantity: 3 },
  { id: 's-name', inventoryItemId: 'i-name', title: 'Nom identique seulement', barcode: '', sku: '', tracked: true, quantity: 4 },
  { id: 's-dup', inventoryItemId: 'i-dup', title: 'Duplicate', barcode: '', sku: 'DUP', tracked: true, quantity: 5 },
];
const mapping = buildExactVariantMapping(catalog, shop);
ok('unique barcode matches first', mapping.matches.some((x) => x.kiwi.id === 'k-bar' && x.shopify.id === 's-bar' && x.method === 'barcode'));
ok('unique SKU matches second', mapping.matches.some((x) => x.kiwi.id === 'k-sku' && x.shopify.id === 's-sku' && x.method === 'sku'));
ok('same product name alone never matches', mapping.unmatched.some((x) => x.id === 'k-name'));
ok('duplicate SKU is reported ambiguous', mapping.ambiguous.filter((x) => x.id.startsWith('k-dup')).length === 2);
ok('stock snapshot keeps exact variant ids', stockSnapshot(catalog).get('k-bar') === 2);

// Exercise the real coalesced outbox and real GraphQL request builder against a
// pocket D1. A second local write must replace the target/idempotency key, not
// append another deduction.
function syncDB(connection) {
  const state = { connection, links: [{ merchant: 'atlas', kiwi_variant_id: 'k-bar', inventory_item_id: 'i-bar', location_id: 'loc-1', last_shopify_quantity: 9, status: 'active' }], outbox: [] };
  const db = {
    state,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim(); let a = [];
      const api = {
        bind(...args) { a = args; return api; },
        async first() {
          if (q.includes('FROM shopify_connections WHERE merchant = ?')) return state.connection.merchant === a[0] ? { ...state.connection } : null;
          throw new Error(`unexpected first: ${q}`);
        },
        async all() {
          if (q.startsWith('SELECT kiwi_variant_id FROM shopify_variant_links')) return { results: state.links.filter((x) => x.merchant === a[0] && x.location_id === a[1] && x.status === 'active') };
          if (q.startsWith('SELECT o.id, o.merchant')) {
            return { results: state.outbox.filter((x) => ['pending', 'failed'].includes(x.status) && x.next_attempt_ts <= a[0]).map((x) => ({ ...x, ...state.links.find((l) => l.merchant === x.merchant && l.kiwi_variant_id === x.kiwi_variant_id) })) };
          }
          throw new Error(`unexpected all: ${q}`);
        },
        async run() {
          if (q.startsWith('INSERT INTO shopify_sync_outbox')) {
            const [id, merchant, kiwi_variant_id, target_quantity, source_rev, created_ts, updated_ts] = a;
            const prior = state.outbox.find((x) => x.merchant === merchant && x.kiwi_variant_id === kiwi_variant_id);
            const next = { id, merchant, kiwi_variant_id, target_quantity, source_rev, status: 'pending', attempts: 0, next_attempt_ts: 0, last_error: '', created_ts: prior ? prior.created_ts : created_ts, updated_ts };
            if (prior) state.outbox[state.outbox.indexOf(prior)] = next; else state.outbox.push(next);
            return { meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE shopify_sync_outbox SET status = 'processing'")) {
            const row = state.outbox.find((x) => x.id === a[1] && ['pending', 'failed'].includes(x.status));
            if (row) { row.status = 'processing'; row.updated_ts = a[0]; }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (q.startsWith('DELETE FROM shopify_sync_outbox')) {
            const before = state.outbox.length; state.outbox = state.outbox.filter((x) => x.id !== a[0]);
            return { meta: { changes: before - state.outbox.length } };
          }
          if (q.startsWith('UPDATE shopify_variant_links SET last_shopify_quantity')) {
            const row = state.links.find((x) => x.merchant === a[2] && x.kiwi_variant_id === a[3]);
            if (row) { row.last_shopify_quantity = a[0]; row.status = 'active'; }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (q.startsWith("UPDATE shopify_connections SET last_sync_ts")) {
            state.connection.last_sync_ts = a[0]; state.connection.last_error = ''; return { meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE shopify_sync_outbox SET status = 'failed'")) return { meta: { changes: 1 } };
          if (q.startsWith('UPDATE shopify_connections SET last_error')) { state.connection.last_error = a[0]; return { meta: { changes: 1 } }; }
          if (q.startsWith('UPDATE shopify_variant_links SET status')) return { meta: { changes: 1 } };
          throw new Error(`unexpected run: ${q}`);
        },
      };
      return api;
    },
    async batch(statements) { const out = []; for (const stmt of statements) out.push(await stmt.run()); return out; },
  };
  return db;
}

const syncKey = 'another-test-encryption-key-with-32-bytes';
const DB = syncDB({
  merchant: 'atlas', shop_domain: 'atlas.myshopify.com',
  access_token_enc: await encryptToken('test-admin-token', syncKey), refresh_token_enc: '',
  token_expires_ts: Date.now() + 3600000, refresh_expires_ts: Date.now() + 86400000,
  scopes: 'write_inventory', location_id: 'loc-1', location_name: 'Boutique', channel_link_id: 'chl-test',
  status: 'active', connected_ts: Date.now(), updated_ts: Date.now(), last_sync_ts: 0, last_error: '',
});
const syncEnv = { DB, SHOPIFY_TOKEN_KEY: syncKey, SHOPIFY_CLIENT_ID: 'test-client', SHOPIFY_CLIENT_SECRET: 'test-secret' };
await enqueueStockChanges(syncEnv, 'atlas', { variants: [{ id: 'k-bar', stock: 2 }] }, { variants: [{ id: 'k-bar', stock: 3 }] }, 10, false);
const firstOutboxId = DB.state.outbox[0] && DB.state.outbox[0].id;
await enqueueStockChanges(syncEnv, 'atlas', { variants: [{ id: 'k-bar', stock: 3 }] }, { variants: [{ id: 'k-bar', stock: 2 }] }, 11, false);
ok('rapid stock changes coalesce to one outbox row', DB.state.outbox.length === 1 && DB.state.outbox[0].target_quantity === 2);
ok('coalescing rotates the idempotency key when parameters change', DB.state.outbox[0].id !== firstOutboxId);

const realFetch = globalThis.fetch;
let sentMutation = null;
globalThis.fetch = async (_url, init) => {
  sentMutation = JSON.parse(init.body);
  return new Response(JSON.stringify({ data: { inventorySetQuantities: { inventoryAdjustmentGroup: { changes: [] }, userErrors: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const flushed = await flushShopifyOutbox(syncEnv, 'atlas', 5);
globalThis.fetch = realFetch;
ok('outbox flush processes the coalesced target', flushed.processed === 1 && flushed.failed === 0);
ok('successful Shopify write removes the durable target', DB.state.outbox.length === 0);
ok('successful Shopify write advances known remote quantity', DB.state.links[0].last_shopify_quantity === 2);
ok('GraphQL carries the durable row UUID as idempotency key', sentMutation && sentMutation.variables.key === firstOutboxId ? false : /^[0-9a-f-]{36}$/.test(sentMutation && sentMutation.variables.key || ''));
ok('GraphQL CAS starts from last observed Shopify quantity', sentMutation && sentMutation.variables.input.quantities[0].changeFromQuantity === 9);

const schema = read('schema.sql');
for (const table of ['shopify_connections', 'shopify_oauth_states', 'shopify_variant_links', 'shopify_sync_outbox', 'shopify_webhook_events']) {
  ok(`schema defines ${table}`, schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
ok('OAuth state stores a hash, not the state token', /shopify_oauth_states[\s\S]{0,500}state_hash\s+TEXT PRIMARY KEY/.test(schema));
ok('variant outbox coalesces per merchant and variant', /UNIQUE \(merchant, kiwi_variant_id\)/.test(schema));

const connector = read('functions/api/shopify/_lib.js');
ok('inventory mutation uses Shopify idempotency directive', connector.includes('@idempotent(key: $key)'));
ok('inventory mutation uses current CAS field', connector.includes('changeFromQuantity'));
ok('outbound queue stores target quantities before Shopify writes', connector.indexOf('INSERT INTO shopify_sync_outbox') < connector.indexOf('inventorySetQuantities(input: $input)'));
ok('an abandoned token-refresh lock expires instead of blocking forever', connector.includes('DELETE FROM shopify_oauth_states WHERE state_hash = ? AND expires_ts <= ?'));
ok('tokens are never selected by status route', !read('functions/api/shopify/status.js').includes('access_token_enc'));

const middleware = read('functions/_middleware.js');
ok('OAuth callback has one exact public GET path', middleware.includes("isRead && path === '/api/shopify/callback'"));
ok('Shopify control API is not publicly allow-listed', !middleware.includes("path.startsWith('/api/shopify/')"));

const connect = read('functions/api/shopify/connect.js');
const callback = read('functions/api/shopify/callback.js');
ok('a connected merchant cannot silently switch Shopify shops', connect.includes("current.shop_domain !== shop && current.status !== 'disconnected'"));
ok('reauthorisation cannot turn a merely ready connection active', callback.includes("WHEN shopify_connections.status = 'active' THEN 'active'"));
ok('a legitimate shop replacement drops the old variant links', callback.includes("DELETE FROM shopify_variant_links WHERE merchant = ?"));

const webhook = read('functions/api/channel/shopify/[link].js');
ok('OAuth webhook verifies with app secret', webhook.includes('oauth ? env.SHOPIFY_CLIENT_SECRET'));
ok('online order movement is deterministic', webhook.includes('const moveId = `so-'));
ok('online order path does not call outbound enqueuer', !/applyShopifyOrderStock[\s\S]{0,5000}enqueueStockChanges/.test(webhook));
ok('inventory webhook detects external drift', webhook.includes("drift ? 'drift' : 'active'"));

const ui = read('assets/channel-link.js');
ok('Shopify card starts OAuth instead of creating a manual key', ui.includes("if (channel === 'shopify') return openShopify()"));
ok('activation warning states Kiwi quantities will replace linked Shopify quantities', ui.includes('Shopify prendra les quantités Kiwi'));

ok('state hashes are deterministic but do not expose input', (await sha256Hex('state')) !== 'state');

console.log(`\nShopify connector · ${pass} checks`);
if (failures.length) {
  failures.forEach((f) => console.error(`✗ ${f}`));
  process.exit(1);
}
console.log('✓ OAuth, encryption, exact mapping, CAS outbox and webhook loop guards');
