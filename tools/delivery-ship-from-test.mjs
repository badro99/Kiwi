#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Livraison « Envoyée de » (Santos, 19 nov. 2026).
 *
 * Les colis partent de Casablanca comme de Rabat, et le propriétaire veut que
 * le stock sorte de la boutique d'où part le colis. La fiche de livraison porte
 * « Envoyé de » (par défaut la boutique de la caisse) ; à la confirmation de la
 * livraison, les pièces sortent du catalogue de CETTE boutique, pas de celle
 * qui a encaissé. Une boutique hors du catalogue partagé ne peut pas être
 * nommée : le stock sort alors de la caisse, comme avant.
 * Vrais sale.js, receivables.js, _delivery-stock.js sur une D1 en mémoire. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestPost as receivablesPost } from '../functions/api/receivables.js';
import { materialize } from '../functions/api/_rules-catalog.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const SECRET = 'ship-from-secret';
const RABAT = 'santos-store', CASA = 'santos-store-casablanca', SOLO = 'other-shop';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
sqlite.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-s','o@santos.test','TEST KIWI','s','h',?,'active')`).run(now);
sqlite.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-x','o@x.test','Other','s','h',?,'active')`).run(now);
for (const [m, acc, f] of [[RABAT, 'acc-s', { sharedCatalog: true }], [CASA, 'acc-s', { sharedCatalog: true }], [SOLO, 'acc-x', { sharedCatalog: true }]]) {
  sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, account_id, status, till_epoch, updated_ts) VALUES (?, ?, 'TEST KIWI', 'boutique', ?, 'active', 0, ?)`)
    .run(m, JSON.stringify(f), acc, now);
}
const catalog = (n) => materialize({ v: 1, seq: 4, removed: {}, moves: [],
  categories: [{ id: 'cat_1', name: 'Robes' }],
  products: [{ id: 'prod_1', name: 'Robe lin', categoryId: 'cat_1', priceMAD: 450 }],
  variants: [{ id: 'var_1', productId: 'prod_1', size: 'M', colorId: 'bleu', base: n, baseAt: 1 }] });
for (const [m, n] of [[RABAT, 10], [CASA, 6], [SOLO, 4]]) sqlite.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run(m, JSON.stringify(catalog(n)), now);
const stock = (m) => materialize(JSON.parse(sqlite.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(m).data)).variants[0].stock;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, RABAT)}`;

let controls = 0;
const ok = (cond, label) => { assert.ok(cond, label); controls += 1; console.log('  ✓ ' + label); };
const CARD = { name: 'Salma Benali', phone: '0612345678', city: 'Casablanca', address: 'Maarif, rue 12' };
const sell = async (id, from) => {
  const body = { id, merchant: RABAT, amount: 0, amountCents: 0, method: 'delivery', channel: 'delivery', settlementKind: 'receivable', stockHeld: true,
    paymentParts: [{ method: 'delivery', amountCents: 90000 }], ticketAmountCents: 90000, label: 'Robe lin', ref: id.toUpperCase(), ts: now,
    lines: [{ itemId: 'prod_1', variantId: 'prod_1:M:bleu', name: 'Robe lin M', qty: 2, total: 900, cat: 'Robes', unit: 'piece', kind: 'product' }],
    deliveryCard: from === undefined ? CARD : { ...CARD, from } };
  const res = await salePost({ request: new Request('https://kiwi.test/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify(body) }), env, waitUntil() {} });
  return res.status;
};
const collect = async (saleId) => {
  const res = await receivablesPost({ request: new Request('https://kiwi.test/api/receivables', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify({ merchant: RABAT, saleId, method: 'transfer', amountCents: 90000, id: 'col-' + saleId }) }), env });
  return res.status;
};

console.log('■ Vendue à Rabat, envoyée de Casablanca');
ok(await sell('dlv-casa', CASA) === 200, 'the delivery sale is recorded at Rabat (200)');
ok(stock(RABAT) === 10 && stock(CASA) === 6, 'nothing leaves while the parcel is out');
ok(await collect('dlv-casa') === 200, 'the customer paid: the delivery is confirmed (200)');
ok(stock(CASA) === 4, 'the two dresses leave Casablanca (6 → 4)');
ok(stock(RABAT) === 10, 'Rabat keeps its 10');

console.log('■ Sans « Envoyé de », ou envoyée de la caisse elle-même : comme avant');
ok(await sell('dlv-own') === 200 && await collect('dlv-own') === 200, 'a delivery without a sending shop is confirmed');
ok(stock(RABAT) === 8 && stock(CASA) === 4, 'its stock leaves the till’s own shop (10 → 8)');
ok(await sell('dlv-self', RABAT) === 200 && await collect('dlv-self') === 200 && stock(RABAT) === 6, 'naming the till’s own shop is the same (8 → 6)');

console.log('■ Une boutique hors du catalogue partagé ne peut pas être nommée');
ok(await sell('dlv-other', SOLO) === 200 && await collect('dlv-other') === 200, 'the sale itself still goes through');
ok(stock(SOLO) === 4, 'another account’s shop is never touched');
ok(stock(RABAT) === 4, 'the stock leaves the till’s shop instead (6 → 4)');

console.log(`delivery-ship-from: ${controls} passed`);
