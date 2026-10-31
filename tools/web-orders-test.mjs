#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Kiwi Commerce : les commandes de la boutique en ligne, sur le vrai schéma.
 * functions/api/shop/orders.js (dépôt par la vitrine, lecture par la
 * boutique), functions/api/shop/decide.js (confirmer → vente à livrer,
 * refuser), et ce qu'elles touchent : /api/sale, le stock retenu
 * (_delivery-stock.js), les clés de canal (channel/_link.js). */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as postOrder, onRequestGet as getOrders } from '../functions/api/shop/orders.js';
import { onRequestPost as decide } from '../functions/api/shop/decide.js';
import { onRequestGet as liveCatalog } from '../functions/api/shop/catalog.js';
import { onRequestGet as orderStatus } from '../functions/api/shop/status.js';
import { onRequestPost as channelOrder } from '../functions/api/channel/order.js';
import { takeHeldStock } from '../functions/api/_delivery-stock.js';
import { saleLines } from '../functions/api/shop/_lib.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const SHOP = 'web-orders-test';
const OFF = 'web-orders-off';
const SECRET = 'web-orders-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
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
for (const [m, features, acc] of [[SHOP, '{"commerce":true}', 'acc-web'], [OFF, '{}', 'acc-off']]) {
  sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
    VALUES (?, ?, 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(m, features, now);
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
    VALUES (?, ?, 'TEST KIWI', 'salt', 'hash', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare('UPDATE merchant_config SET account_id = ? WHERE merchant = ?').run(acc, m);
}
const catalog = {
  v: 1, seq: 4, removed: {}, moves: [],
  categories: [{ id: 'cat_1', name: 'Robes' }],
  products: [
    { id: 'prod_r', name: 'Robe lin', categoryId: 'cat_1', priceMAD: 400 },
    { id: 'prod_f', name: 'Foulard', categoryId: 'cat_1', priceMAD: 150 },
    { id: 'prod_x', name: 'Retirée', categoryId: 'cat_1', priceMAD: 90, online: false },
  ],
  variants: [
    { id: 'var_r', productId: 'prod_r', size: 'M', colorId: 'noir', stock: 3, base: 3, baseAt: 1 },
    { id: 'var_f', productId: 'prod_f', size: 'TU', colorId: 'unique', stock: 1, base: 1, baseAt: 1 },
    { id: 'var_x', productId: 'prod_x', size: 'TU', colorId: 'unique', stock: 5, base: 5, baseAt: 1 },
  ],
};
for (const m of [SHOP, OFF]) sqlite.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run(m, JSON.stringify(catalog), now);

const hash = (s) => createHash('sha256').update(s).digest('hex');
const key = (id, merchant, channel) => {
  const secret = 'S'.repeat(32) + id.replace(/[^A-Za-z0-9]/g, '');
  sqlite.prepare(`INSERT INTO channel_links (id, merchant, channel, label, hash, status, created_ts) VALUES (?, ?, ?, 'test', ?, 'active', ?)`)
    .run(id, merchant, channel, hash(secret), now);
  return `kwc.${id}.${secret}`;
};
const STORE = key('chl-storefront-1', SHOP, 'storefront');
const GENERIC = key('chl-generic-1', SHOP, 'generic');
const STORE_OFF = key('chl-storefront-2', OFF, 'storefront');

const owner = `${SESS_COOKIE}=${await makeSession('acc-web', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, SHOP)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls++; console.log('  ✓ ' + message); };

const customer = { name: 'TEST KIWI', phone: '06 12 34 56 78', city: 'Rabat', address: '1 rue de test', note: '' };
const order = (ref, lines, extra = {}) => {
  const subtotal = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  return { ref, customer, lines, subtotalCents: subtotal, discountCents: 0, deliveryCents: 1900, totalCents: subtotal + 1900, ...extra };
};
async function post(token, body) {
  const r = await postOrder({ request: new Request('https://kiwi.test/api/shop/orders', {
    method: 'POST', headers: token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body),
  }), env });
  return { status: r.status, body: await r.json() };
}
async function act(cookie, body) {
  const r = await decide({ request: new Request('https://kiwi.test/api/shop/decide', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, ...body }),
  }), env, waitUntil: () => {} });
  return { status: r.status, body: await r.json() };
}
async function list(cookie) {
  const r = await getOrders({ request: new Request(`https://kiwi.test/api/shop/orders?merchant=${SHOP}&status=all`, { headers: cookie ? { cookie } : {} }), env });
  return { status: r.status, body: await r.json() };
}
const robe = (q = 1, unitCents = 40000) => ({ variantId: 'var_r', quantity: q, unitCents });

console.log('\nweb-orders · la vitrine dépose');
ok((await post('', order('a1', [robe()]))).status === 401, 'sans clé : refusé');
ok((await post(GENERIC, order('a1', [robe()]))).status === 401, 'une clé Glovo/générique ne dépose pas de commande en ligne');
ok((await post(STORE_OFF, order('a1', [robe()]))).status === 403, 'module non activé : refusé (commerce-off)');
const first = await post(STORE, order('ref-1', [robe(2)]));
ok(first.status === 200 && /^W-[A-Z0-9]{5}$/.test(first.body.number), 'commande valide : un numéro W-XXXXX');
const again = await post(STORE, order('ref-1', [robe(2)]));
ok(again.body.number === first.body.number && again.body.duplicate, 'même ref rejouée : même commande, pas de doublon');
ok(sqlite.prepare('SELECT COUNT(*) AS n FROM web_orders').get().n === 1, 'une seule ligne en base');
ok((await post(STORE, order('ref-2', [robe(1, 100)]))).body.error === 'price-changed', 'un prix modifié dans la page est refusé');
ok((await post(STORE, order('ref-3', [robe()], { totalCents: 1 }))).body.error === 'bad-total', 'un total incohérent est refusé');
ok((await post(STORE, order('ref-4', [robe()], { discountCents: 50000, totalCents: -8100 }))).status === 409, 'une remise plus grande que les articles est refusée');
ok((await post(STORE, order('ref-5', [{ variantId: 'var_x', quantity: 1, unitCents: 9000 }]))).body.error === 'unknown-variant', 'une pièce retirée de la boutique en ligne est refusée');
ok((await post(STORE, { ...order('ref-6', [robe()]), customer: { ...customer, phone: '12' } })).body.error === 'phone', 'un téléphone non marocain est refusé');
ok((await post(STORE, order('ref-7', [{ variantId: 'var_r', quantity: 11, unitCents: 40000 }]))).body.error === 'bad-line', 'plus de 10 pièces par ligne : refusé');
ok((await channelOrder({ request: new Request('https://kiwi.test/api/channel/order', {
  method: 'POST', headers: { Authorization: 'Bearer ' + STORE, 'Content-Type': 'application/json' }, body: '{}' }), env })).status === 401,
  'une clé de boutique en ligne ne dépose pas de ticket de cuisine');

console.log('\nweb-orders · la boutique lit et décide');
ok((await list('')).status === 403, 'sans session : la file reste fermée');
const read = await list(till);
ok(read.status === 200 && read.body.orders.length === 1 && read.body.orders[0].status === 'pending', 'la caisse appairée lit la commande en attente');
ok(read.body.orders[0].customer.phone === '+212612345678', 'le téléphone est rangé au format +212');
const id1 = read.body.orders[0].id;

const short = await post(STORE, order('ref-8', [{ variantId: 'var_f', quantity: 2, unitCents: 15000 }]));
const id2 = sqlite.prepare('SELECT id FROM web_orders WHERE client_ref = ?').get('ref-8').id;
ok(short.status === 200, 'une commande au-delà du stock est reçue (rien n’est retiré à la commande)');
const decline = await post(STORE, order('ref-9', [robe()]));
const id3 = sqlite.prepare('SELECT id FROM web_orders WHERE client_ref = ?').get('ref-9').id;
ok(decline.status === 200, 'troisième commande reçue');

const no = await act(till, { id: id3, action: 'decline', reason: 'Client injoignable' });
ok(no.status === 200 && no.body.order.status === 'declined' && no.body.order.reason === 'Client injoignable', 'refuser : la commande est refusée avec son motif');
ok((await act(till, { id: id3, action: 'confirm' })).status === 409, 'une commande refusée ne se confirme plus');

const yes = await act(owner, { id: id1, action: 'confirm' });
ok(yes.status === 200 && yes.body.order.status === 'confirmed' && yes.body.order.saleId === 'web-' + id1, 'confirmer : la commande devient la vente web-<id>');
const sale = sqlite.prepare('SELECT * FROM sales WHERE merchant = ? AND id = ?').get(SHOP, 'web-' + id1);
ok(sale && sale.channel === 'delivery' && Number(sale.amount_cents) === 0, 'la vente est une livraison à 0 MAD encaissé');
const lines = JSON.parse(sale.lines);
ok(lines.length === 2 && lines[0].v === 'prod_r:M:noir' && lines[0].q === 2 && lines[1].kd === 'fee' && lines[1].t === 19, 'lignes : la robe (produit:taille:couleur) et la livraison en frais');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-card'").get(SHOP, 'web-' + id1).n === 1, 'la fiche de livraison (nom, ville, adresse) est enregistrée');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-stock-held'").get(SHOP, 'web-' + id1).n === 1, 'le stock est retenu jusqu’au règlement de la livraison');
const twice = await act(owner, { id: id1, action: 'confirm' });
ok(twice.status === 200 && twice.body.duplicate && sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant = ?').get(SHOP).n === 1, 'confirmer deux fois n’écrit pas deux ventes');

const taken = await takeHeldStock(env, SHOP, 'web-' + id1);
ok(taken.applied === 1 && taken.short === 0, 'au règlement, 2 robes sortent du stock et la ligne de livraison n’est pas comptée comme manquante');

const warn = await act(owner, { id: id2, action: 'confirm' });
ok(warn.status === 409 && warn.body.error === 'short' && warn.body.short[0].inStock === 1 && warn.body.short[0].wanted === 2, 'stock insuffisant : la boutique est prévenue, rien n’est écrit');
ok(sqlite.prepare('SELECT status FROM web_orders WHERE id = ?').get(id2).status === 'pending', 'la commande reste à confirmer');
const forced = await act(owner, { id: id2, action: 'confirm', force: true });
ok(forced.status === 200 && forced.body.order.status === 'confirmed', '« Confirmer quand même » passe la commande en livraison');

const other = `${SESS_COOKIE}=${await makeSession('acc-off', SECRET)}`;
const foreign = await act(other, { id: id1, action: 'decline' });
ok(foreign.status === 403 || foreign.status === 404, 'un autre commerçant ne décide pas des commandes de celui-ci');

console.log('\nweb-orders · la vitrine lit le catalogue vivant');
const shopGet = async (handler, url, token) => {
  const r = await handler({ request: new Request(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} }), env });
  return { status: r.status, body: await r.json() };
};
ok((await shopGet(liveCatalog, 'https://kiwi.test/api/shop/catalog', '')).status === 401, 'catalogue : sans clé, refusé');
ok((await shopGet(liveCatalog, 'https://kiwi.test/api/shop/catalog', GENERIC)).status === 401, 'catalogue : une clé d’un autre canal ne le lit pas');
ok((await shopGet(liveCatalog, 'https://kiwi.test/api/shop/catalog', STORE_OFF)).status === 403, 'catalogue : module non activé, refusé');
const live = await shopGet(liveCatalog, 'https://kiwi.test/api/shop/catalog', STORE);
const liveRobe = live.body.shop && live.body.shop.variants.find((v) => v.id === 'var_r');
ok(live.status === 200 && live.body.shop.products.length === 3 && liveRobe && liveRobe.size === 'M', 'catalogue : les articles et leurs tailles, tels que la caisse les connaît');
ok(live.body.shop.products.find((p) => p.id === 'prod_x').online === false, 'catalogue : une pièce retirée de la boutique en ligne le dit (la vitrine la cache)');
ok(!JSON.stringify(live.body).includes('"cost'), 'catalogue : aucun prix d’achat ne sort');

console.log('\nweb-orders · « Suivre ma commande »');
ok(/^[a-f0-9]{32}$/.test(first.body.statusToken || '') && again.body.statusToken === first.body.statusToken, 'la commande rend sa clé de suivi, la même au renvoi');
const track = (token, number, t) => shopGet(orderStatus, `https://kiwi.test/api/shop/status?number=${number}&t=${t}`, token);
ok((await track('', first.body.number, first.body.statusToken)).status === 401, 'suivi : sans clé de boutique, refusé');
ok((await track(STORE, first.body.number, '0'.repeat(32))).status === 404, 'suivi : un numéro sans sa clé n’ouvre rien');
ok((await track(STORE_OFF, first.body.number, first.body.statusToken)).status === 404, 'suivi : la vitrine d’un autre commerçant ne la voit pas');
const seen = await track(STORE, first.body.number, first.body.statusToken);
ok(seen.status === 200 && seen.body.order.status === 'confirmed' && seen.body.order.lines[0].quantity === 2, 'suivi : la cliente voit sa commande confirmée');
ok(!JSON.stringify(seen.body).includes('+212') && !JSON.stringify(seen.body).includes('rue de test'), 'suivi : ni téléphone ni adresse dans la réponse');
sqlite.prepare(`INSERT INTO ozon_parcels (merchant, tracking, sale_id, city_id, price_cents, status, status_label, created_ts)
  VALUES (?, 'OZ-TEST-1', ?, 1, 81900, 'shipped', 'Expédié', ?)`).run(SHOP, 'web-' + id1, now);
const shipped = await track(STORE, first.body.number, first.body.statusToken);
ok(shipped.body.order.parcel && shipped.body.order.parcel.tracking === 'OZ-TEST-1' && shipped.body.order.parcel.label === 'Expédié', 'suivi : le colis Ozon et son état apparaissent');

console.log('\nweb-orders · la ville Ozon suit la commande');
const withCity = await post(STORE, { ...order('ref-city', [robe()]), customer: { ...customer, cityId: 42 } });
const cityRow = sqlite.prepare('SELECT id, customer FROM web_orders WHERE client_ref = ?').get('ref-city');
ok(withCity.status === 200 && JSON.parse(cityRow.customer).cityId === 42, 'l’identifiant de ville Ozon est gardé avec la commande');
const cityYes = await act(owner, { id: cityRow.id, action: 'confirm' });
const cityCard = sqlite.prepare("SELECT impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-card'").get(SHOP, 'web-' + cityRow.id);
ok(cityYes.status === 200 && cityCard && JSON.parse(cityCard.impact).cityId === 42, 'à la confirmation, la fiche de livraison porte la ville Ozon (le colis peut partir seul)');
ok((await post(STORE, { ...order('ref-city2', [robe()]), customer: { ...customer, cityId: 'x' } })).status === 200
  && JSON.parse(sqlite.prepare('SELECT customer FROM web_orders WHERE client_ref = ?').get('ref-city2').customer).cityId === undefined, 'une ville illisible est ignorée, la commande passe');

console.log('\nweb-orders · la remise se répartit sans perdre un centime');
const split = saleLines({ number: 'W-T', discountCents: 1001, deliveryCents: 0, lines: [
  { productId: 'a', size: 'S', colorId: 'n', title: 'A', quantity: 1, unitCents: 3333 },
  { productId: 'b', size: 'M', colorId: 'n', title: 'B', quantity: 2, unitCents: 3334 },
] });
ok(Math.round(split.reduce((s, l) => s + l.t * 100, 0)) === 3333 + 6668 - 1001 && split.length === 2, 'les lignes valent exactement le total des articles moins la remise');

console.log(`\n✓ web-orders : ${controls} contrôles`);
