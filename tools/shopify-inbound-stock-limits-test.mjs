// Stock entrant Shopify : une commande qui ne se résout jamais ne tourne pas
// pour toujours, et une vente Shopify sans stock Kiwi se voit.
//   1. une ligne sans correspondance est retentée un nombre borné de fois, puis
//      la commande passe en « dead » (file des échecs) et le panneau de santé du
//      connecteur le dit, au lieu d'un « pending » éternel ;
//   2. quand le stock Kiwi est à 0 (ou plus bas que la commande), la ligne
//      n'écrit aucun mouvement négatif, mais le panneau le signale (survente).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { missingMigratedTables } from './fixtures/migrated-tables.cjs';
import { __test as inbound } from '../functions/api/channel/shopify/[link].js';
import { enqueueInboundStock, flushInboundStock, INBOUND_MAX_ATTEMPTS } from '../functions/api/shopify/_inbound-stock.js';

function adapter(db) {
  return { prepare(sql) { let args = []; return {
    bind(...a) { args = a; return this; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
  }; } };
}
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

function world(stock) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE shopify_variant_links(merchant TEXT,kiwi_variant_id TEXT,shopify_variant_id TEXT,status TEXT);
    CREATE TABLE catalogs(merchant TEXT,data TEXT,rev INTEGER,updated_ts INTEGER);
    CREATE TABLE shopify_connections(merchant TEXT,last_error TEXT,updated_ts INTEGER);
    INSERT INTO shopify_variant_links VALUES('m','kv-1','gid://shopify/ProductVariant/901','active');
    INSERT INTO shopify_connections VALUES('m','',0);`);
  missingMigratedTables(db);
  db.prepare('INSERT INTO catalogs VALUES(?,?,1,1)').run('m', JSON.stringify({
    products: [{ id: 'kp-1', name: 'x', priceMAD: 10, createdAt: 1 }],
    variants: [{ id: 'kv-1', productId: 'kp-1', colorId: 'default', colorFamily: 'default', size: 'U', stock, base: stock, baseAt: 1, barcodes: [] }], moves: [],
  }));
  return { db, env: { DB: adapter(db) } };
}
const health = (db) => db.prepare("SELECT last_error FROM shopify_connections WHERE merchant='m'").get().last_error;

// 1. dead letter
{
  const { db, env } = world(5);
  const order = { id: 7, created_at: new Date().toISOString(), line_items: [{ id: 1, variant_id: 999, quantity: 1 }] };
  await enqueueInboundStock(env, 'm', order);
  ok(Number.isInteger(INBOUND_MAX_ATTEMPTS) && INBOUND_MAX_ATTEMPTS >= 5 && INBOUND_MAX_ATTEMPTS <= 50, 'the attempt limit is a bounded number');
  let passes = 0;
  for (; passes < INBOUND_MAX_ATTEMPTS + 5; passes++) {
    db.exec('UPDATE shopify_inbound_stock SET next_ts=0');
    await flushInboundStock(env, inbound.applyShopifyOrderStock);
    if (db.prepare('SELECT status FROM shopify_inbound_stock').get().status !== 'pending') break;
  }
  const row = db.prepare('SELECT status, attempts FROM shopify_inbound_stock').get();
  ok(row.status === 'dead', 'an order whose line never maps leaves the retry loop (status ' + row.status + ')');
  ok(row.attempts === INBOUND_MAX_ATTEMPTS, 'it stopped at the limit, not later (' + row.attempts + ')');
  ok(/abandon|manuel/i.test(health(db)) && health(db).includes('7'), 'the connector health panel names the abandoned order');
  db.exec('UPDATE shopify_inbound_stock SET next_ts=0');
  const again = await flushInboundStock(env, inbound.applyShopifyOrderStock);
  ok(again.completed === 0 && again.pending === 0, 'a dead order is not picked up again');
  db.close();
}

// 2. oversell
for (const [stock, qty, label] of [[0, 2, 'stock at zero'], [1, 3, 'stock lower than the order']]) {
  const { db, env } = world(stock);
  const order = { id: 8, created_at: new Date().toISOString(), line_items: [{ id: 1, variant_id: 901, quantity: qty }] };
  await enqueueInboundStock(env, 'm', order);
  await flushInboundStock(env, inbound.applyShopifyOrderStock);
  const row = db.prepare('SELECT status FROM shopify_inbound_stock').get();
  const data = JSON.parse(db.prepare('SELECT data FROM catalogs').get().data);
  ok(row.status === 'done', label + ': the order is closed (nothing more to apply)');
  ok(data.variants[0].stock >= 0, label + ': Kiwi stock never goes negative');
  ok(/survente|oversell/i.test(health(db)) && health(db).includes('8'), label + ': the merchant is told about the oversell');
  db.close();
}

// 3. no false alarm
{
  const { db, env } = world(5);
  const order = { id: 9, created_at: new Date().toISOString(), line_items: [{ id: 1, variant_id: 901, quantity: 2 }] };
  await enqueueInboundStock(env, 'm', order);
  await flushInboundStock(env, inbound.applyShopifyOrderStock);
  ok(health(db) === '', 'a fully covered order raises no alert');
  db.close();
}
console.log(`shopify-inbound-stock-limits: ${checks} checks passed`);
