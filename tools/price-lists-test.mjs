#!/usr/bin/env node
/* Les tarifs (listes de prix) · détail, gros / jomla, en ligne, livraison.
 *
 * Tenu ici, sans navigateur, contre le vrai schéma et les vraies routes :
 *   · un article sans prix dans un tarif retombe sur le prix principal ;
 *   · un tarif créé depuis le principal, ± x %, arrondi au pas ;
 *   · le tarif par défaut d'une fiche client s'applique tout seul ;
 *   · changer de tarif à la caisse demande un responsable, vérifié côté serveur
 *     (preuve signée liée au magasin, au tarif et à l'heure de la vente) ;
 *   · la vente enregistre le tarif ; un tarif sans accord est consigné, jamais
 *     refusé (l'argent est déjà encaissé) ;
 *   · un panier entier se résout côté serveur ;
 *   · cloisonnement : un magasin ne lit ni n'écrit les tarifs d'un autre, une
 *     caisse lit mais n'écrit pas ;
 *   · la boutique en ligne et les factures prennent le tarif de leur canal.
 *   node tools/price-lists-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const lists = await imp('functions/api/price-lists/index.js');
const pricesRoute = await imp('functions/api/price-lists/prices.js');
const resolveRoute = await imp('functions/api/price-lists/resolve.js');
const snapshotRoute = await imp('functions/api/price-lists/snapshot.js');
const clientsRoute = await imp('functions/api/price-lists/clients.js');
const lib = await imp('functions/api/_price-lists.js');
const { priceListProof, readPriceListProof } = await imp('functions/api/_price-list-sale.js');
const { stampSale } = await imp('functions/api/_sale-stamp.js');
const { readCatalog } = await imp('functions/api/shop/_lib.js');
const { liveShop } = await imp('functions/api/shop/catalog.js');
const { tillToken, makeSession, sessionCookie } = await imp('functions/auth/_lib.js');

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  fails++;
  console.log(`  ✗ ${label}${detail ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

const AUTH_SECRET = 'price-lists-secret-0123456789abcdef';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const account = (id, business) => db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,'s','h',?,'active')`).run(id, id + '@x.test', business, now);
const shop = (merchant, acc, features = {}) => db.prepare(
  `INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,?,'boutique',?,?,'active',0,?)`,
).run(merchant, JSON.stringify(features), acc, merchant, now);
account('acc-a', 'Hanout A'); account('acc-b', 'Hanout B');
const A = 'hanout-a', B = 'hanout-b';
shop(A, 'acc-a'); shop(B, 'acc-b');
const catalog = (m, products) => db.prepare('INSERT OR REPLACE INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,1,?)').run(m, JSON.stringify({
  v: 1, categories: [], products: products.map((p) => ({ name: p.id, createdAt: now, ...p })),
  variants: products.map((p) => ({ id: 'v-' + p.id, productId: p.id, size: 'TU', colorId: 'noir', stock: 10, base: 10, baseAt: now })),
  seq: 0, removed: {}, moves: [],
}), now);
catalog(A, [{ id: 'huile', priceMAD: 24 }, { id: 'sucre', priceMAD: 12.5 }, { id: 'the', priceMAD: 19 }, { id: 'vieux', priceMAD: 5, archived: true }]);
catalog(B, [{ id: 'huile', priceMAD: 99 }]);

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { const args = p.map((x) => (x === undefined ? null : x)); return {
      async first() { const row = st.get(...args); return row === undefined ? null : row; },
      async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} };

const ownerA = sessionCookie(await makeSession('acc-a', AUTH_SECRET)).split(';')[0];
const ownerB = sessionCookie(await makeSession('acc-b', AUTH_SECRET)).split(';')[0];
const tillA = `kiwi_till=${await tillToken(AUTH_SECRET, A)}`;
const H = (cookie) => ({ Cookie: cookie, 'CF-Connecting-IP': '10.0.0.7', 'Content-Type': 'application/json' });
async function call(fn, url, { cookie = ownerA, body } = {}) {
  const init = { headers: H(cookie) };
  if (body !== undefined) { init.method = 'POST'; init.body = JSON.stringify(body); }
  const res = await fn({ request: new Request('https://k' + url, init), env });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, body: j || {} };
}

console.log('\nL’arithmétique : ± x %, arrondi au pas');
ok('-10 % de 24 MAD, au dirham → 22 MAD', lib.derivePrice(2400, -10, 100) === 2200, lib.derivePrice(2400, -10, 100));
ok('-10 % de 12,50 MAD, au demi-dirham → 11,50 MAD', lib.derivePrice(1250, -10, 50) === 1150, lib.derivePrice(1250, -10, 50));
ok('+15 % de 19 MAD, aux 5 MAD → 20 MAD', lib.derivePrice(1900, 15, 500) === 2000, lib.derivePrice(1900, 15, 500));
ok('sans pas, au centime', lib.derivePrice(1999, 7.5, 0) === 2149, lib.derivePrice(1999, 7.5, 0));
ok('jamais négatif', lib.derivePrice(1000, -90, 100) === 100 && lib.roundToStep(-5, 100) === 0);
ok('un pas inconnu est refusé, un pourcentage fou aussi', lib.cleanStep(30) === null && lib.cleanPct(-95) === null && lib.cleanPct('x') === null);

console.log('\nCréer un tarif « Gros » depuis le principal, -10 % au dirham');
let r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'Gros', channels: ['till', 'invoices', 'bogus'], base: 'main', pct: -10, step: 100 } });
ok('créé', r.status === 200 && r.body.ok && /^pl_/.test(r.body.id), r);
const GROS = r.body.id;
ok('un prix par article actif (l’article archivé n’est pas recopié)', r.body.seeded === 3, r.body);
r = await call(pricesRoute.onRequestGet, `/api/price-lists/prices?merchant=${A}&list=${GROS}`);
const grosPrices = Object.fromEntries((r.body.prices || []).map((p) => [p.itemKey, p.cents]));
ok('huile 24 → 22, sucre 12,50 → 11, thé 19 → 17', grosPrices.huile === 2200 && grosPrices.sucre === 1100 && grosPrices.the === 1700, grosPrices);
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${A}`);
ok('la liste : le principal d’abord, puis Gros (canaux nettoyés)', r.body.lists[0].id === 'main' && r.body.lists[0].isMain
  && r.body.lists[1].id === GROS && JSON.stringify(r.body.lists[1].channels) === '["till","invoices"]' && r.body.lists[1].priced === 3, r.body.lists);
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'gros' } });
ok('deux tarifs du même nom sont refusés', r.status === 409 && r.body.error === 'name-taken', r);

console.log('\nRepli sur le prix principal');
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'the', price: null }] } });
ok('retirer le prix du thé dans Gros', r.status === 200 && r.body.removed === 1, r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, listId: GROS, items: [{ itemKey: 'huile', qty: 2 }, { itemKey: 'the', qty: 1 }, { itemKey: 'inconnu', qty: 1 }] } });
const line = (k) => (r.body.lines || []).find((l) => l.itemKey === k) || {};
ok('huile au prix de gros (source list)', line('huile').unitCents === 2200 && line('huile').source === 'list', line('huile'));
ok('thé sans prix dans Gros → principal 19 MAD (source main)', line('the').unitCents === 1900 && line('the').source === 'main', line('the'));
ok('article inconnu : pas de prix inventé', line('inconnu').unitCents == null && line('inconnu').source === 'unknown', line('inconnu'));
ok('le panier entier : 2 × 22 + 19 = 63 MAD', r.body.totalCents === 6300, r.body);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, items: [{ itemKey: 'huile' }] } });
ok('sans tarif nommé ni client : le principal', r.body.list && r.body.list.isMain && r.body.lines[0].unitCents === 2400, r.body);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'huile', variantKey: 'v-huile', price: 2100 }] } });
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, listId: GROS, items: [{ itemKey: 'huile', variantKey: 'v-huile' }, { itemKey: 'huile', variantKey: 'v-autre' }] } });
ok('prix d’une déclinaison, puis de l’article, puis principal', r.body.lines[0].unitCents === 2100 && r.body.lines[1].unitCents === 2200, r.body.lines);
r = await call(pricesRoute.onRequestGet, `/api/price-lists/prices?merchant=${A}&item=the`);
ok('vue article : tous ses prix, le repli dit « main »', r.body.item.mainCents === 1900 && r.body.lists.length === 2
  && r.body.lists[1].source === 'main' && r.body.lists[1].cents === 1900, r.body);

console.log('\nÉcriture en masse : tout ou rien');
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'sucre', price: 1000 }, { listId: GROS, itemKey: 'huile', price: 12.5 }] } });
ok('un prix non entier (centimes) refuse l’appel', r.status === 400 && r.body.error === 'bad-price' && r.body.row === 1, r);
ok('…et rien n’a été écrit', db.prepare("SELECT price_cents FROM item_prices WHERE merchant=? AND list_id=? AND item_key='sucre'").get(A, GROS).price_cents === 1100);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: 'main', itemKey: 'sucre', price: 1000 }] } });
ok('le principal ne s’écrit pas ici (c’est le catalogue)', r.status === 400 && r.body.error === 'main-is-catalogue', r);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, action: 'derive', listId: GROS, pct: -20, step: 50, items: ['sucre'] } });
ok('« -20 % depuis le principal » sur un article', r.status === 200 && r.body.written === 1
  && db.prepare("SELECT price_cents FROM item_prices WHERE merchant=? AND list_id=? AND item_key='sucre' AND variant_key=''").get(A, GROS).price_cents === 1000, r);

console.log('\nLe tarif par défaut d’une fiche client');
r = await call(clientsRoute.onRequestPost, '/api/price-lists/clients', { body: { merchant: A, clientId: 'cl-grossiste', listId: GROS } });
ok('Si Brahim (grossiste) passe au tarif Gros', r.status === 200, r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, clientId: 'cl-grossiste', items: [{ itemKey: 'sucre' }] } });
ok('la fiche attachée suffit : tarif Gros, why client-default', r.body.list.id === GROS && r.body.why === 'client-default' && r.body.lines[0].unitCents === 1000, r.body);
r = await call(snapshotRoute.onRequestGet, `/api/price-lists/snapshot?merchant=${A}`, { cookie: tillA });
ok('la caisse appairée lit la copie hors ligne (tarifs till, prix, clients)', r.status === 200 && r.body.lists.some((l) => l.id === GROS)
  && r.body.prices[GROS].sucre === 1000 && r.body.prices[GROS]['huile|v-huile'] === 2100 && r.body.clients['cl-grossiste'] === GROS, r.body);

console.log('\nLa vente enregistre le tarif · changer de tarif demande un responsable');
const sale = (id, extra = {}) => db.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES (?, ?, 44, 4400, 'cash', 'Vente', ?, ?)`).run(id, extra.merchant || A, id, extra.ts || now);
const audit = (id) => db.prepare("SELECT reason FROM sale_audit WHERE merchant=? AND sale_id=? AND action='price-list-policy'").get(A, id);
const listOf = (id) => (db.prepare('SELECT price_list_id FROM sales WHERE merchant=? AND id=?').get(A, id) || {}).price_list_id;

sale('s-client');
await stampSale(env, A, 's-client', { priceListId: GROS, clientId: 'cl-grossiste' });
ok('vente au tarif de la fiche client : tarif écrit, aucun signalement', listOf('s-client') === GROS && !audit('s-client'));

sale('s-free');
await stampSale(env, A, 's-free', { priceListId: GROS });
ok('tarif choisi sans accord : la vente reste, le tarif est écrit', listOf('s-free') === GROS);
ok('…et l’écart est consigné (no-approval)', audit('s-free') && audit('s-free').reason === 'no-approval', audit('s-free'));
await stampSale(env, A, 's-free', { priceListId: GROS });
ok('un renvoi de la même vente ne double pas le signalement', db.prepare("SELECT COUNT(*) n FROM sale_audit WHERE sale_id='s-free'").get().n === 1);

const manager = { id: 'st-1', name: 'Rachid', role: 'Gérant' };
const proof = await priceListProof(AUTH_SECRET, A, manager, GROS, now);
sale('s-approved');
await stampSale(env, A, 's-approved', { priceListId: GROS, priceListApproval: proof });
ok('avec la preuve du responsable : aucun signalement', listOf('s-approved') === GROS && !audit('s-approved'));
ok('la preuve ne vaut pas pour un autre tarif', !(await readPriceListProof(proof, AUTH_SECRET, A, 'pl_autre', now)));
ok('ni pour un autre magasin', !(await readPriceListProof(proof, AUTH_SECRET, B, GROS, now)));
ok('ni cinq heures plus tard', !(await readPriceListProof(proof, AUTH_SECRET, A, GROS, now + 5 * 3600000)));
ok('une vente restée hors ligne une heure la garde', !!(await readPriceListProof(proof, AUTH_SECRET, A, GROS, now + 3600000)));
ok('une preuve retouchée est refusée', !(await readPriceListProof(proof.slice(0, -2) + '00', AUTH_SECRET, A, GROS, now)));
sale('s-forged');
await stampSale(env, A, 's-forged', { priceListId: GROS, priceListApproval: proof.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) });
ok('une preuve fausse sur la vente : signalée approval-invalid', audit('s-forged') && audit('s-forged').reason === 'approval-invalid', audit('s-forged'));
sale('s-main');
await stampSale(env, A, 's-main', { priceListId: 'main' });
ok('au prix principal : rien à écrire, rien à signaler', listOf('s-main') == null && !audit('s-main'));
sale('s-alien');
await stampSale(env, A, 's-alien', { priceListId: 'pl_inexistant' });
ok('un tarif inconnu du magasin est signalé unknown-list', audit('s-alien') && audit('s-alien').reason === 'unknown-list', audit('s-alien'));

const verifySrc = fs.readFileSync(path.join(ROOT, 'functions/api/pin/verify.js'), 'utf8');
ok('/api/pin/verify ne signe un changement de tarif que pour un rôle de responsable',
  /action\.kind === 'price-list'\s*\n\s*&& employeeRoleOpensDashboard\(verified\.staff\.role\)/.test(verifySrc));
const saleSrc = fs.readFileSync(path.join(ROOT, 'functions/api/sale.js'), 'utf8');
ok('/api/sale passe le corps de la vente à stampSale (le tarif y est relu)', /await stampSale\(env, merchant, id, b\)/.test(saleSrc));

console.log('\nCloisonnement');
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${B}`, { cookie: ownerA });
ok('le patron de A qui demande B ne voit pas les tarifs de B', r.status !== 200 || (r.body.merchant === A), r.body);
r = await call(lists.onRequestPost, '/api/price-lists', { cookie: ownerA, body: { merchant: B, action: 'create', name: 'Pirate' } });
ok('le patron de A ne crée rien chez B', r.status === 403, r);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { cookie: ownerB, body: { merchant: B, rows: [{ listId: GROS, itemKey: 'huile', price: 1 }] } });
ok('B ne touche pas aux prix du tarif de A, même en le nommant', r.status === 404 && r.body.error === 'unknown-list', r);
r = await call(clientsRoute.onRequestPost, '/api/price-lists/clients', { cookie: ownerB, body: { merchant: B, clientId: 'x', listId: GROS } });
ok('B n’attache pas une de ses fiches au tarif de A', r.status === 404, r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { cookie: ownerB, body: { merchant: B, listId: GROS, items: [{ itemKey: 'huile' }] } });
ok('B ne résout pas un panier au tarif de A', r.status === 404 && r.body.error === 'unknown-list', r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { cookie: ownerB, body: { merchant: B, items: [{ itemKey: 'huile' }] } });
ok('B résout au prix de SON catalogue (99 MAD)', r.body.lines && r.body.lines[0].unitCents === 9900, r.body);
r = await call(snapshotRoute.onRequestGet, `/api/price-lists/snapshot?merchant=${B}`, { cookie: tillA });
ok('la caisse de A ne lit pas la copie de B', r.status === 401, r);
r = await call(lists.onRequestPost, '/api/price-lists', { cookie: tillA, body: { merchant: A, action: 'create', name: 'Caisse' } });
ok('une caisse appairée ne crée pas de tarif', r.status === 403, r);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { cookie: tillA, body: { merchant: A, rows: [{ listId: GROS, itemKey: 'huile', price: 1 }] } });
ok('ni n’écrit un prix', r.status === 403, r);
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${A}`, { cookie: '' });
ok('sans session ni caisse : rien', r.status === 401, r);
await stampSale(env, B, 's-free', { priceListId: GROS });
ok('le tarif de A ne s’écrit pas sur une vente de B', db.prepare('SELECT COUNT(*) n FROM sales WHERE merchant=? AND price_list_id IS NOT NULL').get(B).n === 0);

console.log('\nLa boutique en ligne');
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'Web', channels: ['online'], base: 'main', pct: -10, step: 100, compareListId: 'main' } });
ok('un tarif Web (-10 %, prix barré = principal)', r.status === 200, r);
const WEB = r.body.id;
const shopCat = await readCatalog(env, A);
const huile = shopCat.products.find((p) => p.id === 'huile');
ok('la vitrine et le contrôle des commandes lisent 22 MAD, barré 24', huile.priceMAD === 22 && huile.compareMAD === 24, huile);
const live = liveShop(shopCat, null).products.find((p) => p.id === 'huile');
ok('/api/shop/catalog sert compareMAD', live.priceMAD === 22 && live.compareMAD === 24, live);
const sucreWeb = shopCat.products.find((p) => p.id === 'sucre');
ok('le sucre aussi : 11 MAD, barré 12,50', sucreWeb.priceMAD === 11 && sucreWeb.compareMAD === 12.5, sucreWeb);
ok('B, sans tarif en ligne, garde son prix', (await readCatalog(env, B)).products[0].priceMAD === 99);

console.log('\nLes factures');
const fail = (status, code) => Object.assign(new Error(code), { status, code });
ok('à la création, le tarif de la fiche client', (await lib.invoicePriceList(env, A, {}, {}, { clientId: 'cl-grossiste' }, fail)) === GROS);
ok('un tarif choisi l’emporte', (await lib.invoicePriceList(env, A, { priceListId: WEB }, {}, { clientId: 'cl-grossiste' }, fail)) === WEB);
ok('« main » = prix principal (null)', (await lib.invoicePriceList(env, A, { priceListId: 'main' }, {}, {}, fail)) === null);
let threw = null;
try { await lib.invoicePriceList(env, B, { priceListId: GROS }, {}, {}, fail); } catch (e) { threw = e; }
ok('le tarif d’un autre magasin est refusé', threw && threw.code === 'unknown-price-list');
ok('un brouillon existant garde son tarif', (await lib.invoicePriceList(env, A, {}, { id: 'inv_1', price_list_id: WEB }, { clientId: 'cl-grossiste' }, fail)) === WEB);

console.log('\nRetirer un tarif');
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'delete', id: GROS, replacement: WEB } });
ok('Gros, déjà porté par des ventes, est archivé, pas effacé', r.status === 200 && r.body.archived === true && r.body.deleted === false, r);
ok('ses fiches clients passent au remplaçant', db.prepare("SELECT list_id FROM price_list_clients WHERE client_id='cl-grossiste'").get().list_id === WEB);
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${A}`);
ok('il ne s’offre plus', !r.body.lists.some((l) => l.id === GROS));
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'delete', id: 'main' } });
ok('le principal ne se retire pas', r.status === 400 && r.body.error === 'main-is-permanent', r);
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'update', id: 'main', name: 'Détail' } });
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${A}`);
ok('renommer le principal (nom affiché seulement)', r.body.lists[0].name === 'Détail' && r.body.lists[0].isMain, r.body.lists[0]);
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'delete', id: WEB } });
ok('un tarif jamais vendu s’efface pour de bon, ses prix avec', r.body.deleted === true
  && db.prepare('SELECT COUNT(*) n FROM item_prices WHERE list_id=?').get(WEB).n === 0, r);
ok('et sa fiche client retombe sur le principal', !db.prepare("SELECT 1 FROM price_list_clients WHERE client_id='cl-grossiste'").get());

console.log(`\n${passed} vérifications · ${fails} échec(s)`);
process.exit(fails ? 1 : 0);
