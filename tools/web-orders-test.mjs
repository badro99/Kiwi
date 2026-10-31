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
import { cleanStorefront } from '../functions/api/shop/_settings.js';
import { onRequestPost as storePost, onRequestGet as storeGet } from '../functions/api/store.js';
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
const OZON_CITIES = { CITIES: { a: { ID: 42, NAME: 'Rabat' }, b: { ID: 7, NAME: 'Fes' } } };
const env = { DB, AUTH_SECRET: SECRET, __ozonFetch: async () => new Response(JSON.stringify(OZON_CITIES)) };
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

console.log('\nweb-orders · les réglages de la boutique en ligne (store doc storefront)');
const messy = cleanStorefront({
  name: '  Santos   Store ' + 'x'.repeat(80), tagline: 't'.repeat(300), announcement: 'Livraison\n offerte ' + 'a'.repeat(200),
  whatsapp: '+212 6 12-34-56-78', instagram: '@santos.store_ma', accent: '#0b6e4f',
  shipping: { feeMAD: 900, freeFromMAD: '500', extra: 1 }, bundles: { 2: 10, 3: 75, 4: 20 },
  coupons: { bienvenue: 10, 'ab': 5, 'BAD CODE': 10, ZERO: 0, TROP: 95, ['X'.repeat(21)]: 10 },
  password: 'jamais', owner: { id: 1 },
}, 1234);
ok(messy.name.length === 60 && messy.name.startsWith('Santos Store x') && messy.tagline.length === 140 && messy.announcement.length === 120 && !messy.announcement.includes('\n'),
  'réglages : les textes sont nettoyés et coupés (60 / 140 / 120)');
ok(messy.whatsapp === '212612345678' && messy.instagram === 'santos.store_ma' && messy.accent === '#0B6E4F', 'réglages : WhatsApp en chiffres, Instagram sans @, couleur #RRGGBB');
ok(messy.shipping.feeMAD === 500 && messy.shipping.freeFromMAD === 500, 'réglages : livraison bornée à 500 MAD, seuil de gratuité lu comme un entier');
ok(messy.bundles[2] === 10 && messy.bundles[3] === 50 && Object.keys(messy.bundles).join() === '2,3', 'réglages : packs 2 et 3 pièces seulement, remise bornée à 50 %');
ok(JSON.stringify(messy.coupons) === JSON.stringify({ BIENVENUE: 10, TROP: 90 }), 'réglages : codes promo en majuscules, 3 à 20 caractères, 1 à 90 %');
ok(Object.keys(messy).sort().join() === 'accent,announcement,bundles,coupons,instagram,name,pieces,shipping,tagline,updatedTs,url,whatsapp' && Object.keys(messy.shipping).join() === 'feeMAD,freeFromMAD' && messy.updatedTs === 1234,
  'réglages : toute clé inconnue est jetée, l’heure est celle du serveur');
const bad = cleanStorefront({ whatsapp: '1234', instagram: 'a b', accent: 'red', shipping: { feeMAD: -3, freeFromMAD: null }, bundles: { 2: 'x' }, coupons: ['CODE1'] }, 0);
ok(bad.whatsapp === '' && bad.instagram === '' && bad.accent === '' && bad.shipping.feeMAD === 0 && bad.shipping.freeFromMAD === null && bad.bundles[2] === 0 && Object.keys(bad.coupons).length === 0,
  'réglages : valeurs illisibles ramenées à vide, 0 ou null');
ok(['0612345678', '00212 6 12 34 56 78', '07-12-34-56-78'].map((w) => cleanStorefront({ whatsapp: w }, 0).whatsapp).join() === '212612345678,212612345678,212712345678',
  'réglages : un numéro marocain écrit 06…, 07… ou 00212… devient 2126…, 2127…');
const urls = ['amira.kiwi-os.com', 'https://Amira.Kiwi-OS.com/collections/all?x=1', 'http://amira.kiwi-os.com', 'javascript:alert(1)', 'localhost', 'https://a b.com', 'x'.repeat(130) + '.com']
  .map((u) => cleanStorefront({ url: u }, 0).url);
ok(JSON.stringify(urls) === JSON.stringify(['https://amira.kiwi-os.com', 'https://amira.kiwi-os.com', '', '', '', '', '']),
  'réglages : l’adresse de la boutique est un hôte https seul (pas de http, de javascript:, de localhost ni de chemin)');
const texts = cleanStorefront({ pieces: {
  prod_1: { about: '  Coton lourd.\r\n\r\n\r\nLavable à 30°. \u0007 ' + 'x'.repeat(700), fabric: 'Coton  bio', fit: 'Ample', extra: 1 },
  prod_2: { about: '', fabric: '', fit: '' }, 'bad id': { about: 'non' }, prod_3: 'texte',
} }, 0).pieces;
ok(Object.keys(texts).join() === 'prod_1' && texts.prod_1.about.startsWith('Coton lourd.\n\nLavable à 30°.') && texts.prod_1.about.length === 600
  && texts.prod_1.fabric === 'Coton bio' && texts.prod_1.fit === 'Ample' && !('extra' in texts.prod_1),
  'réglages : le texte d’une pièce garde ses paragraphes, matière et coupe nettoyées, entrées vides ou mal nommées jetées');
const looks = cleanStorefront({ pieces: {
  seen: { look: '/api/media/media/amira-boutique/lx9-ab12cd34.jpg' },
  far: { look: 'https://evil.example/x.jpg' }, up: { look: '/api/media/../auth/x' }, js: { look: 'javascript:alert(1)' },
  both: { fit: 'Droite', look: '/api/media/media/amira-boutique/a.webp' },
} }, 0).pieces;
ok(Object.keys(looks).sort().join() === 'both,seen' && looks.seen.look === '/api/media/media/amira-boutique/lx9-ab12cd34.jpg'
  && looks.both.look === '/api/media/media/amira-boutique/a.webp' && looks.both.fit === 'Droite',
  'réglages : « Vu dans la campagne » ne garde qu’une image du stockage Kiwi (/api/media/…), jamais une adresse extérieure ni un chemin qui remonte');
const lots = cleanStorefront({ pieces: Object.fromEntries(Array.from({ length: 320 }, (_, i) => ['p' + i, { fit: 'Droite' }])) }, 0).pieces;
ok(Object.keys(lots).length === 300, 'réglages : 300 pièces décrites au plus');
const many = cleanStorefront({ coupons: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['CODE' + i, 5])) }, 0);
ok(Object.keys(many.coupons).length === 20, 'réglages : 20 codes promo au plus');

const storeCall = async (cookie, body) => {
  const r = await storePost({ request: new Request('https://kiwi.test/api/store', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, feature: 'storefront', ...body }),
  }), env, waitUntil: () => {} });
  return { status: r.status, body: await r.json() };
};
const settingsOf = async () => (await shopGet(liveCatalog, 'https://kiwi.test/api/shop/catalog', STORE)).body;
const before = await settingsOf();
ok(before.ok && before.settings === null && before.shop.products.length === 3, 'catalogue : settings vaut null tant que le commerçant n’a rien enregistré');
const fromTill = await storeCall(till, { baseRev: 0, data: { name: 'Caisse', shipping: { feeMAD: 0 } } });
ok(fromTill.status === 403 && fromTill.body.error === 'forbidden-feature', 'réglages : la caisse appairée ne les écrit pas');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM store_docs WHERE merchant = ? AND feature = 'storefront'").get(SHOP).n === 0, 'réglages : rien n’est écrit après le refus');
const saved = await storeCall(owner, { baseRev: 0, data: { name: 'Santos', whatsapp: '0612345678', shipping: { feeMAD: 35, freeFromMAD: 600 }, bundles: { 2: 10, 3: 15 }, coupons: { kiwi10: 10 }, secret: 'x' } });
ok(saved.status === 200 && saved.body.ok, 'réglages : le propriétaire les enregistre');
const stored = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'storefront'").get(SHOP).data);
ok(stored.secret === undefined && stored.coupons.KIWI10 === 10 && stored.updatedTs > 0, 'réglages : la base garde la forme nettoyée, heure du serveur comprise');
const tillRead = await storeGet({ request: new Request(`https://kiwi.test/api/store?feature=storefront&merchant=${SHOP}`, { headers: { cookie: till } }), env });
ok(tillRead.status === 200 && (await tillRead.json()).data.shipping.feeMAD === 35, 'réglages : la caisse appairée les lit');
sqlite.prepare("UPDATE store_docs SET data = json_set(data, '$.leak', 'x', '$.shipping.feeMAD', 9999) WHERE merchant = ? AND feature = 'storefront'").run(SHOP);
const after = await settingsOf();
ok(after.settings && after.settings.name === 'Santos' && after.settings.shipping.freeFromMAD === 600 && after.settings.bundles[3] === 15 && after.settings.coupons.KIWI10 === 10,
  'catalogue : settings rend les réglages du commerçant');
ok(after.settings.leak === undefined && after.settings.shipping.feeMAD === 500, 'catalogue : settings est rebordé à la lecture (clé inconnue jetée, livraison ≤ 500)');
ok(Object.keys(after).sort().join() === 'ok,settings,shop', 'catalogue : rien d’autre des documents du magasin ne sort');
const offSettings = await storeCall(`${SESS_COOKIE}=${await makeSession('acc-off', SECRET)}`, { baseRev: 0, data: { name: 'Intrus' } });
ok(offSettings.status === 401 || offSettings.status === 403, 'réglages : un autre commerçant ne les écrit pas');

console.log('\nweb-orders · « Suivre ma commande »');
ok(/^[a-f0-9]{32}$/.test(first.body.statusToken || '') && again.body.statusToken === first.body.statusToken, 'la commande rend sa clé de suivi, la même au renvoi');
const track = (token, number, t) => shopGet(orderStatus, `https://kiwi.test/api/shop/status?number=${number}&t=${t}`, token);
ok((await track('', first.body.number, first.body.statusToken)).status === 401, 'suivi : sans clé de boutique, refusé');
ok((await track(STORE, first.body.number, '0'.repeat(32))).status === 404, 'suivi : un numéro sans sa clé n’ouvre rien');
ok((await track(STORE_OFF, first.body.number, first.body.statusToken)).status === 403, 'suivi : la vitrine d’un commerçant sans boutique en ligne ne lit rien');
const replay = await post(STORE, { ...order('ref-1', [robe(2)]), customer: { ...customer, phone: '0699999999' } });
ok(replay.body.number === first.body.number && !replay.body.statusToken, 'une ref rejouée avec un autre téléphone ne rend pas la clé de suivi');
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
const wrongCity = await post(STORE, { ...order('ref-city3', [robe()]), customer: { ...customer, city: 'Rabat', cityId: 7 } });
const wrongRow = sqlite.prepare('SELECT id FROM web_orders WHERE client_ref = ?').get('ref-city3');
ok(wrongCity.status === 200 && (await act(owner, { id: wrongRow.id, action: 'confirm' })).status === 200, 'une ville Ozon qui ne correspond pas : la commande se confirme quand même');
const wrongCard = sqlite.prepare("SELECT impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-card'").get(SHOP, 'web-' + wrongRow.id);
ok(wrongCard && JSON.parse(wrongCard.impact).cityId === undefined, 'un identifiant de ville qui ne nomme pas la ville de la commande ne part pas chez Ozon');
ok((await post(STORE, { ...order('ref-city2', [robe()]), customer: { ...customer, cityId: 'x' } })).status === 200
  && JSON.parse(sqlite.prepare('SELECT customer FROM web_orders WHERE client_ref = ?').get('ref-city2').customer).cityId === undefined, 'une ville illisible est ignorée, la commande passe');

console.log('\nweb-orders · la remise se répartit sans perdre un centime');
const split = saleLines({ number: 'W-T', discountCents: 1001, deliveryCents: 0, lines: [
  { productId: 'a', size: 'S', colorId: 'n', title: 'A', quantity: 1, unitCents: 3333 },
  { productId: 'b', size: 'M', colorId: 'n', title: 'B', quantity: 2, unitCents: 3334 },
] });
ok(Math.round(split.reduce((s, l) => s + l.t * 100, 0)) === 3333 + 6668 - 1001 && split.length === 2, 'les lignes valent exactement le total des articles moins la remise');

console.log(`\n✓ web-orders : ${controls} contrôles`);
