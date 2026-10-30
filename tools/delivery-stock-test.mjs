#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Le stock d'une livraison sort à la confirmation (propriétaire, 30 octobre 2026),
 * sur le vrai schéma : functions/api/_delivery-stock.js, branché dans
 * /api/sale (vente marquée retenue) et /api/receivables (confirmation, perte,
 * retour, lecture).
 *
 * Avant, la caisse retirait les articles à l'encaissement de la livraison :
 * trois colis d'essai jamais confirmés avaient vidé le stock de Santos. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/receivables.js';
import { markStockHeld, isStockHeld, takeHeldStock } from '../functions/api/_delivery-stock.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'boutique-dlv-stock-test';
const SECRET = 'dlv-stock-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map((s) => s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
  VALUES (?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(MERCHANT, now);
sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
  VALUES ('acc-dlv-stock', 'dlv-stock@example.test', 'TEST KIWI', 'salt', 'hash', ?, 'active')`).run(now);
sqlite.prepare("UPDATE merchant_config SET account_id = 'acc-dlv-stock' WHERE merchant = ?").run(MERCHANT);

// Le catalogue : un ensemble (TU, noir) à 10 pièces, une tranche (M, blanc) à 10.
const catalog = {
  v: 1, seq: 4, removed: {}, moves: [],
  categories: [{ id: 'cat_1', name: 'Ensembles' }],
  products: [{ id: 'prod_e', name: 'Ensemble Classe', categoryId: 'cat_1', price: 300 },
    { id: 'prod_t', name: 'Tranche', categoryId: 'cat_1', price: 200 }],
  variants: [{ id: 'var_e', productId: 'prod_e', size: 'TU', colorId: 'noir', stock: 10, base: 10, baseAt: 1 },
    { id: 'var_t', productId: 'prod_t', size: 'M', colorId: 'blanc', stock: 10, base: 10, baseAt: 1 }],
};
sqlite.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run(MERCHANT, JSON.stringify(catalog), now);
const stock = () => {
  const data = JSON.parse(sqlite.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(MERCHANT).data);
  const by = new Map(data.variants.map((v) => [v.id, Number(v.base) || 0]));
  for (const m of data.moves || []) by.set(m.vid, by.get(m.vid) + m.d);
  return Object.fromEntries(by);
};

const basket = [
  { n: 'Ensemble Classe TU', q: 1, t: 300, i: 'prod_e', v: 'prod_e:TU:noir' },
  { n: 'Tranche M', q: 2, t: 400, i: 'prod_t', v: 'prod_t:M:blanc' },
];
const sale = async (id, held = true) => {
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, void_ts, lines, channel)
    VALUES (?, ?, 0, 0, 'delivery', ?, 'Livraison', ?, ?, NULL, ?, 'delivery')`).run(id, MERCHANT,
    JSON.stringify([{ method: 'delivery', amountCents: 70000 }]), id.toUpperCase(), now - 3600e3, JSON.stringify(basket));
  if (held) await markStockHeld(DB, MERCHANT, id, now - 3600e3);
};

const owner = `${SESS_COOKIE}=${await makeSession('acc-dlv-stock', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls++; console.log('  ✓ ' + message); };
async function get(cookie = till) {
  const r = await onRequestGet({ request: new Request(`https://kiwi.test/api/receivables?merchant=${MERCHANT}`, { headers: { cookie } }), env });
  return { status: r.status, body: await r.json() };
}
async function post(body, cookie = till) {
  const r = await onRequestPost({ request: new Request('https://kiwi.test/api/receivables', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }) }), env });
  return { status: r.status, body: await r.json() };
}

console.log('■ À l’encaissement, rien ne sort');
await sale('d-cash');
ok(stock().var_e === 10 && stock().var_t === 10, 'a held delivery leaves the stock untouched');
await markStockHeld(DB, MERCHANT, 'd-cash', now);
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id = 'd-cash' AND action = 'delivery-stock-held'").get().n === 1, 'the hold is written once');
let r = await get();
ok(r.body.open.find((d) => d.saleId === 'd-cash').stockHeld === true, 'the list tells the till the stock is still held');

console.log('■ Payée en deux fois : le stock sort au dernier paiement, une fois');
r = await post({ saleId: 'd-cash', method: 'cash', amountCents: 30000, id: 'col-cash-1' });
ok(r.status === 200 && stock().var_e === 10, 'a partial payment takes nothing');
r = await post({ saleId: 'd-cash', method: 'cash', amountCents: 40000, id: 'col-cash-2' });
ok(r.status === 200 && stock().var_e === 9 && stock().var_t === 8, 'the last payment takes the basket out: 1 set, 2 slices');
ok(!(await isStockHeld(DB, MERCHANT, 'd-cash')), 'the delivery is no longer held');
await takeHeldStock(env, MERCHANT, 'd-cash');
await get();
ok(stock().var_e === 9 && stock().var_t === 8, 'calling again and reading again take nothing more');

console.log('■ Retour partiel puis paiement du reste');
await sale('d-part');
r = await post({ saleId: 'd-part', action: 'return', id: 'ret-part-1', lines: [{ i: 1, q: 1 }] });
ok(r.status === 200 && r.body.stockHeld === true && stock().var_t === 8, 'a return of a held delivery puts nothing back and says so');
r = await post({ saleId: 'd-part', method: 'cash', amountCents: r.body.dueCents, id: 'col-part-1' });
ok(r.status === 200 && stock().var_e === 8 && stock().var_t === 7, 'paying the rest takes only what the customer kept');

console.log('■ Retour complet');
await sale('d-back');
r = await post({ saleId: 'd-back', action: 'return', id: 'ret-back-1', all: true });
ok(r.status === 200 && r.body.dueCents === 0 && stock().var_e === 8 && stock().var_t === 7, 'a fully returned delivery never touches the stock');

console.log('■ Passée en perte');
await sale('d-lost');
r = await post({ saleId: 'd-lost', action: 'writeoff' }, owner);
ok(r.status === 200 && stock().var_e === 7 && stock().var_t === 5, 'a written-off delivery takes its basket out: the goods are not coming back');

console.log('■ Virement au tableau de bord');
await sale('d-wire');
r = await post({ saleId: 'd-wire', method: 'transfer' }, owner);
ok(r.status === 200 && stock().var_e === 6 && stock().var_t === 3, 'a transfer confirmed on the dashboard takes the basket out');

console.log('■ Rattrapage à la lecture');
await sale('d-late');
sqlite.prepare(`INSERT INTO delivery_collections (merchant, collection_sale_id, sale_id, method, amount_cents, ts)
  VALUES (?, 'col-late', 'd-late', 'transfer', 70000, ?)`).run(MERCHANT, now);
ok(stock().var_e === 6, 'a delivery paid while the catalogue was busy is still held');
await get();
ok(stock().var_e === 5 && stock().var_t === 1, 'the next read takes it out');

console.log('■ Stock insuffisant, livraisons d’avant');
await sale('d-short');
r = await post({ saleId: 'd-short', method: 'transfer' }, owner);
const taken = JSON.parse(sqlite.prepare("SELECT impact FROM sale_audit WHERE sale_id = 'd-short' AND action = 'delivery-stock-taken'").get().impact);
ok(stock().var_t === 0 && taken.short === 1, 'stock never goes below zero; the missing piece is noted');
await sale('d-legacy', false);
r = await post({ saleId: 'd-legacy', method: 'transfer' }, owner);
ok(r.status === 200 && stock().var_e === 4, 'a delivery from before (stock taken at the till) is not taken twice');

console.log(`delivery-stock: ${controls} controls passed`);
