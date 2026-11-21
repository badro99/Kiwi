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
 *   · la boutique en ligne et les factures prennent le tarif de leur canal ;
 *   · un arrondi ne rend jamais un article gratuit ; 0 MAD seulement offert exprès ;
 *   · la fiche client attachée n'autorise rien seule : code responsable ou signalement ;
 *   · une facture s'enregistre sur une base encore à 0027 (colonne absente) ;
 *   · un tarif cité par une facture est archivé, pas effacé ;
 *   · l'aperçu d'un recalcul (articles changés, sous le prix d'achat) n'écrit rien.
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
const salesRoute = await imp('functions/api/price-lists/sales.js');
const invoicesRoute = await imp('functions/api/invoices.js');
const { listMigrations, MIGRATIONS_DIR } = await imp('tools/d1-migrations.mjs');
const lib = await imp('functions/api/_price-lists.js');
const { priceListProof, readPriceListProof } = await imp('functions/api/_price-list-sale.js');
const { stampSale } = await imp('functions/api/_sale-stamp.js');
const { readCatalog: shopCatalog } = await imp('functions/api/shop/_lib.js');
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
/* La production n'a pas encore 0028 : une base faite des migrations jusqu'à 0027. */
const db27 = new DatabaseSync(':memory:');
for (const f of listMigrations().filter((n) => Number(n.slice(0, 4)) <= 27)) db27.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
const seed = (d) => {
  const account = (id, business) => d.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,'s','h',?,'active')`).run(id, id + '@x.test', business, now);
  const shop = (merchant, acc, features = {}) => d.prepare(
    `INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,?,'boutique',?,?,'active',0,?)`,
  ).run(merchant, JSON.stringify(features), acc, merchant, now);
  account('acc-a', 'Hanout A'); account('acc-b', 'Hanout B');
  shop(A, 'acc-a'); shop(B, 'acc-b');
};
const A = 'hanout-a', B = 'hanout-b';
seed(db); seed(db27);
const catalog = (m, products) => db.prepare('INSERT OR REPLACE INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,1,?)').run(m, JSON.stringify({
  v: 1, categories: [], products: products.map((p) => ({ name: p.id, createdAt: now, ...p })),
  variants: products.map((p) => ({ id: 'v-' + p.id, productId: p.id, size: 'TU', colorId: 'noir', stock: 10, base: 10, baseAt: now })),
  seq: 0, removed: {}, moves: [],
}), now);
/* L'épicerie vend aussi des bonbons à 0,40 MAD : un tarif « -10 % au dirham » ne doit pas les offrir. */
catalog(A, [{ id: 'huile', priceMAD: 24, cost: 20.5 }, { id: 'sucre', priceMAD: 12.5, cost: 9 }, { id: 'the', priceMAD: 19 }, { id: 'bonbon', priceMAD: 0.4, cost: 0.25 },
  { id: 'vieux', priceMAD: 5, archived: true }]);
catalog(B, [{ id: 'huile', priceMAD: 99 }]);

const dbEnv = (d) => ({ AUTH_SECRET, DB: {
  prepare(q) {
    const st = d.prepare(q);
    return { bind(...p) { const args = p.map((x) => (x === undefined ? null : x)); return {
      async first() { const row = st.get(...args); return row === undefined ? null : row; },
      async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    d.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); d.exec('COMMIT'); return out; }
    catch (error) { try { d.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} });
const env = dbEnv(db), env27 = dbEnv(db27);

const ownerA = sessionCookie(await makeSession('acc-a', AUTH_SECRET)).split(';')[0];
const ownerB = sessionCookie(await makeSession('acc-b', AUTH_SECRET)).split(';')[0];
const tillA = `kiwi_till=${await tillToken(AUTH_SECRET, A)}`;
const H = (cookie) => ({ Cookie: cookie, 'CF-Connecting-IP': '10.0.0.7', 'Content-Type': 'application/json' });
async function call(fn, url, { cookie = ownerA, body, on = env } = {}) {
  const init = { headers: H(cookie) };
  if (body !== undefined) { init.method = 'POST'; init.body = JSON.stringify(body); }
  const res = await fn({ request: new Request('https://k' + url, init), env: on });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, body: j || {} };
}

console.log('\nL’arithmétique : ± x %, arrondi au pas');
ok('-10 % de 24 MAD, au dirham → 22 MAD', lib.derivePrice(2400, -10, 100) === 2200, lib.derivePrice(2400, -10, 100));
ok('-10 % de 12,50 MAD, au demi-dirham → 11,50 MAD', lib.derivePrice(1250, -10, 50) === 1150, lib.derivePrice(1250, -10, 50));
ok('+15 % de 19 MAD, aux 5 MAD → 20 MAD', lib.derivePrice(1900, 15, 500) === 2000, lib.derivePrice(1900, 15, 500));
ok('sans pas, au centime', lib.derivePrice(1999, 7.5, 0) === 2149, lib.derivePrice(1999, 7.5, 0));
ok('jamais négatif', lib.derivePrice(1000, -90, 100) === 100 && lib.roundToStep(-5, 100) === 0);
ok('jamais gratuit par arrondi : 0,40 MAD au dirham reste 0,40', lib.derivePrice(40, 0, 100) === 40, lib.derivePrice(40, 0, 100));
ok('0,20 MAD -10 % au dirham → 0,18 (pas 0)', lib.derivePrice(20, -10, 100) === 18, lib.derivePrice(20, -10, 100));
ok('un centime -90 % reste un centime', lib.derivePrice(1, -90, 500) === 1, lib.derivePrice(1, -90, 500));
ok('un article à 0 au principal reste à 0 (rien à dériver)', lib.derivePrice(0, 10, 100) === 0);
ok('un pas inconnu est refusé, un pourcentage fou aussi', lib.cleanStep(30) === null && lib.cleanPct(-95) === null && lib.cleanPct('x') === null);

console.log('\nCréer un tarif « Gros » depuis le principal, -10 % au dirham');
let r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'Gros', channels: ['till', 'invoices', 'bogus'], base: 'main', pct: -10, step: 100 } });
ok('créé', r.status === 200 && r.body.ok && /^pl_/.test(r.body.id), r);
const GROS = r.body.id;
ok('un prix par article actif (l’article archivé n’est pas recopié)', r.body.seeded === 4, r.body);
r = await call(pricesRoute.onRequestGet, `/api/price-lists/prices?merchant=${A}&list=${GROS}`);
const grosPrices = Object.fromEntries((r.body.prices || []).map((p) => [p.itemKey, p.cents]));
ok('huile 24 → 22, sucre 12,50 → 11, thé 19 → 17', grosPrices.huile === 2200 && grosPrices.sucre === 1100 && grosPrices.the === 1700, grosPrices);
ok('le bonbon à 0,40 MAD n’est pas offert : 0,36 MAD', grosPrices.bonbon === 36, grosPrices);
ok('chaque prix dit son prix d’achat (la marge à l’écran)', (r.body.prices || []).find((p) => p.itemKey === 'huile').costCents === 2050, r.body.prices);
r = await call(lists.onRequestGet, `/api/price-lists?merchant=${A}`);
ok('la liste : le principal d’abord, puis Gros (canaux nettoyés)', r.body.lists[0].id === 'main' && r.body.lists[0].isMain
  && r.body.lists[1].id === GROS && JSON.stringify(r.body.lists[1].channels) === '["till","invoices"]' && r.body.lists[1].priced === 4, r.body.lists);
ok('le principal non renommé est marqué defaultName (l’écran le dit dans sa langue)', r.body.lists[0].defaultName === true, r.body.lists[0]);
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
ok('un prix par déclinaison est refusé : un article, un prix, comme le catalogue', r.status === 400 && r.body.error === 'variant-not-supported', r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, listId: GROS, items: [{ itemKey: 'huile', variantKey: 'v-huile' }, { itemKey: 'huile', variantKey: 'v-autre' }] } });
ok('chaque déclinaison au prix de son article', r.body.lines[0].unitCents === 2200 && r.body.lines[1].unitCents === 2200, r.body.lines);
r = await call(pricesRoute.onRequestGet, `/api/price-lists/prices?merchant=${A}&item=the`);
ok('vue article : tous ses prix, le repli dit « main »', r.body.item.mainCents === 1900 && r.body.lists.length === 2
  && r.body.lists[1].source === 'main' && r.body.lists[1].cents === 1900, r.body);

console.log('\nÉcriture en masse : tout ou rien');
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'sucre', price: 1000 }, { listId: GROS, itemKey: 'huile', price: 12.5 }] } });
ok('un prix non entier (centimes) refuse l’appel', r.status === 400 && r.body.error === 'bad-price' && r.body.row === 1, r);
ok('…et rien n’a été écrit', db.prepare("SELECT price_cents FROM item_prices WHERE merchant=? AND list_id=? AND item_key='sucre'").get(A, GROS).price_cents === 1100);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'bonbon', price: 0 }] } });
ok('0 MAD sans « offert » est refusé (zero-price)', r.status === 400 && r.body.error === 'zero-price', r);
let refused = false;
try { db.prepare("INSERT INTO item_prices (merchant,list_id,item_key,variant_key,price_cents,updated_ts) VALUES (?,?,'the','',0,1)").run(A, GROS); } catch (_) { refused = true; }
ok('la base elle-même refuse un prix à 0 non offert (CHECK)', refused);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'bonbon', price: 0, free: true }] } });
ok('offert exprès : accepté', r.status === 200 && r.body.written === 1, r);
r = await call(resolveRoute.onRequestPost, '/api/price-lists/resolve', { body: { merchant: A, listId: GROS, items: [{ itemKey: 'bonbon' }] } });
ok('…et vendu à 0 au tarif Gros', r.body.lines[0].unitCents === 0 && r.body.lines[0].source === 'list', r.body.lines);
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, rows: [{ listId: GROS, itemKey: 'bonbon', price: 36 }] } });
r = await call(pricesRoute.onRequestPost, '/api/price-lists/prices', { body: { merchant: A, action: 'derive', listId: GROS, pct: -20, step: 50, preview: true } });
ok('aperçu du recalcul : combien changent, combien passent sous le prix d’achat', r.status === 200 && r.body.preview === true
  && r.body.total === 4 && r.body.changed === 4 && r.body.belowCost === 1 && r.body.samples.some((x) => x.itemKey === 'huile' && x.belowCost), r.body);
ok('…sans rien écrire', db.prepare("SELECT price_cents FROM item_prices WHERE merchant=? AND list_id=? AND item_key='huile'").get(A, GROS).price_cents === 2200);
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
  && r.body.prices[GROS].sucre === 1000 && r.body.prices[GROS].huile === 2200 && r.body.clients['cl-grossiste'] === GROS && r.body.at > 0, r.body);

console.log('\nLa vente enregistre le tarif · changer de tarif demande un responsable');
const sale = (id, extra = {}) => db.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES (?, ?, 44, 4400, 'cash', 'Vente', ?, ?)`).run(id, extra.merchant || A, id, extra.ts || now);
const audit = (id) => db.prepare("SELECT reason FROM sale_audit WHERE merchant=? AND sale_id=? AND action='price-list-policy'").get(A, id);
const listOf = (id) => (db.prepare('SELECT price_list_id FROM sales WHERE merchant=? AND id=?').get(A, id) || {}).price_list_id;

sale('s-client');
await stampSale(env, A, 's-client', { priceListId: GROS, clientId: 'cl-grossiste' });
ok('fiche client attachée sans code : tarif écrit, mais signalé (n’importe qui peut attacher une fiche)', listOf('s-client') === GROS
  && audit('s-client') && audit('s-client').reason === 'customer-default-no-approval', audit('s-client'));

sale('s-free');
await stampSale(env, A, 's-free', { priceListId: GROS });
ok('tarif choisi sans accord : la vente reste, le tarif est écrit', listOf('s-free') === GROS);
ok('…et l’écart est consigné (no-approval)', audit('s-free') && audit('s-free').reason === 'no-approval', audit('s-free'));
await stampSale(env, A, 's-free', { priceListId: GROS });
ok('un renvoi de la même vente ne double pas le signalement', db.prepare("SELECT COUNT(*) n FROM sale_audit WHERE sale_id='s-free'").get().n === 1);

const manager = { id: 'st-1', name: 'Rachid', role: 'Gérant' };
const proof = await priceListProof(AUTH_SECRET, A, manager, GROS, now);
sale('s-client-ok');
await stampSale(env, A, 's-client-ok', { priceListId: GROS, clientId: 'cl-grossiste', priceListApproval: proof });
ok('fiche client + code responsable : aucun signalement', listOf('s-client-ok') === GROS && !audit('s-client-ok'));
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

console.log('\nCe que le patron voit : ventes par tarif, ventes signalées');
r = await call(salesRoute.onRequestGet, `/api/price-lists/sales?merchant=${A}&days=30`);
const grosSales = (r.body.lists || []).find((x) => x.listId === GROS);
ok('Gros : 5 ventes, 220 MAD, 3 signalées', r.status === 200 && grosSales && grosSales.sales === 5 && grosSales.amountCents === 22000 && grosSales.flagged === 3, r.body.lists);
ok('les signalements disent pourquoi (fiche client sans code, sans accord, preuve fausse)', ['customer-default-no-approval', 'no-approval', 'approval-invalid'].every((c) => r.body.flags.some((f) => f.reason === c && f.listId === GROS)), r.body.flags);
r = await call(salesRoute.onRequestGet, `/api/price-lists/sales?merchant=${A}`, { cookie: tillA });
ok('une caisse ne lit pas les montants par tarif', r.status === 403, r);
r = await call(salesRoute.onRequestGet, `/api/price-lists/sales?merchant=${A}`, { cookie: ownerB });
ok('ni le patron d’un autre magasin', r.status === 403, r);
const workspaceSrc = fs.readFileSync(path.join(ROOT, 'functions/api/admin/_workspace.js'), 'utf8');
ok('la console Kiwi lit aussi les signalements de tarif', /action IN \('basket-flag','clock-flag','price-list-policy'\)/.test(workspaceSrc));

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
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'Web', channels: ['online'], base: 'main', pct: -10, step: 100 } });
ok('un tarif Web (-10 % au dirham)', r.status === 200, r);
const WEB = r.body.id;
const shopCat = await shopCatalog(env, A);
const huile = shopCat.products.find((p) => p.id === 'huile');
ok('la vitrine et le contrôle des commandes lisent 22 MAD', huile.priceMAD === 22 && huile.compareMAD === undefined, huile);
const live = liveShop(shopCat, null).products.find((p) => p.id === 'huile');
ok('/api/shop/catalog sert le prix du tarif en ligne, sans prix barré', live.priceMAD === 22 && !('compareMAD' in live), live);
ok('le bonbon en ligne reste payant (0,36 MAD)', shopCat.products.find((p) => p.id === 'bonbon').priceMAD === 0.36);
ok('B, sans tarif en ligne, garde son prix', (await shopCatalog(env, B)).products[0].priceMAD === 99);

console.log('\nLes factures');
const fail = (status, code) => Object.assign(new Error(code), { status, code });
ok('à la création, le tarif de la fiche client', (await lib.invoicePriceList(env, A, {}, {}, { clientId: 'cl-grossiste' }, fail)) === GROS);
ok('un tarif choisi l’emporte', (await lib.invoicePriceList(env, A, { priceListId: WEB }, {}, { clientId: 'cl-grossiste' }, fail)) === WEB);
ok('« main » = prix principal (null)', (await lib.invoicePriceList(env, A, { priceListId: 'main' }, {}, {}, fail)) === null);
let threw = null;
try { await lib.invoicePriceList(env, B, { priceListId: GROS }, {}, {}, fail); } catch (e) { threw = e; }
ok('le tarif d’un autre magasin est refusé', threw && threw.code === 'unknown-price-list');
ok('un brouillon existant garde son tarif', (await lib.invoicePriceList(env, A, {}, { id: 'inv_1', price_list_id: WEB }, { clientId: 'cl-grossiste' }, fail)) === WEB);
const inv = async (body, on = env) => call(invoicesRoute.onRequestPost, '/api/invoices', { on, body: { merchant: A, action: 'save', type: 'invoice',
  customer: { name: 'Si Brahim', clientId: 'cl-grossiste' }, lines: [{ description: 'Huile', qty: 2, unitHT: 1833, vatRate: 20 }], ...body } });
r = await inv({ priceListId: WEB });
const docId = r.body.doc && r.body.doc.id;
ok('le compositeur envoie le tarif choisi : la facture le garde', r.status === 200 && r.body.doc.priceListId === WEB, r.body);
r = await inv({ id: docId, priceListId: 'main' });
ok('repasser au principal efface le tarif du brouillon', r.status === 200 && r.body.doc.priceListId === null, r.body);
r = await inv({ id: docId });
ok('sans choix, un brouillon garde ce qu’il avait', r.status === 200 && r.body.doc.priceListId === null, r.body);
r = await inv({}, env27);
ok('base encore à 0027 (sans colonne price_list_id) : la facture s’enregistre', r.status === 200 && r.body.doc && r.body.doc.id, r.body);
const id27 = r.body.doc && r.body.doc.id;
r = await inv({ id: id27, note: 'modifiée' }, env27);
ok('…et se modifie', r.status === 200 && r.body.doc.note === 'modifiée', r.body);
r = await inv({ priceListId: 'main' }, env27);
ok('…même quand le compositeur dit « principal »', r.status === 200, r.body);
r = await inv({ priceListId: WEB });
ok('un devis/facture au tarif Web, gardé', r.status === 200 && r.body.doc.priceListId === WEB, r.body);

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
ok('un tarif jamais vendu mais cité par une facture est archivé, pas effacé', r.body.archived === true && r.body.deleted === false
  && db.prepare('SELECT archived FROM price_lists WHERE id=?').get(WEB).archived === 1, r);
ok('et sa fiche client retombe sur le principal', !db.prepare("SELECT 1 FROM price_list_clients WHERE client_id='cl-grossiste'").get());
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'create', name: 'Essai', channels: ['till'], base: 'empty' } });
const ESSAI = r.body.id;
r = await call(lists.onRequestPost, '/api/price-lists', { body: { merchant: A, action: 'delete', id: ESSAI } });
ok('un tarif ni vendu ni facturé s’efface pour de bon', r.body.deleted === true && !db.prepare('SELECT 1 FROM price_lists WHERE id=?').get(ESSAI), r);

console.log('\nLa caisse (assets/till-price-list.js) : copie hors ligne, fiche client, code responsable');
{
  const vm = await import('node:vm');
  const store = new Map();
  const snapshot = { ok: true, at: now, lists: [{ id: 'main', name: 'Prix principal', isMain: true, defaultName: true }, { id: 'pl_gros', name: 'Gros', isMain: false, channels: ['till'] },
    { id: 'pl_web', name: 'Vitrine', isMain: false, channels: ['till'] }],
    prices: { pl_gros: { huile: 2200, the: 0, bonbon: 0 }, pl_web: { huile: 2600 } }, free: { pl_gros: ['bonbon'] }, clients: { 'cl-1': 'pl_gros', 'cl-2': 'pl_web' } };
  let lang = 'fr';
  const asks = [];
  const win = {
    KiwiLive: { merchant: () => A }, KiwiEnv: { isReal: () => true }, KiwiPosSale: {},
    KiwiCaissePairing: { lastManager: () => ({ name: 'Rachid', approval: 'proof-xyz' }) },
    KiwiCaisseLang: { get: () => lang },
    requireManager: (label, ok, ctx) => { asks.push(ctx); ok(); },
    addEventListener() {},
  };
  const ctx = vm.createContext({
    window: win, document: { addEventListener() {}, hidden: false, getElementById: () => ({}), head: { appendChild() {} } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    fetch: async () => ({ ok: true, json: async () => snapshot }), setInterval: () => 0, setTimeout: (fn) => fn(), console,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/till-price-list.js'), 'utf8'), ctx);
  const T = win.KiwiTillPriceList;
  await new Promise((r) => setImmediate(r));
  ok('posé aussi sur le service de vente (épicerie)', win.KiwiPosSale.priceList === T);
  ok('la copie est gardée pour le hors-ligne', JSON.parse(store.get('kiwiPriceLists:' + A)).prices.pl_gros.huile === 2200);
  const P = () => ({ huile: { id: 'huile', price: 24 }, sucre: { id: 'sucre', price: 12.5 }, the: { id: 'the', price: 19 }, bonbon: { id: 'bonbon', price: 0.4 } });
  let p = T.apply(P());
  ok('au départ : prix principal, rien à joindre à la vente', p.huile.price === 24 && JSON.stringify(T.saleFields()) === '{}');
  ok('« dernière mise à jour » de la copie, à l’écran', /^Dernière mise à jour des prix : /.test(T.freshness()), T.freshness());
  T.onCustomer('cl-2');
  ok('fiche dont le tarif ne baisse rien (Vitrine, plus cher) : appliqué sans code', T.current().id === 'pl_web' && asks.length === 0);
  T.onCustomer('passage');
  T.onCustomer('cl-1');
  p = T.apply(P());
  ok('fiche grossiste attachée : Gros, mais avec le code d’un responsable', T.current().id === 'pl_gros' && T.current().why === 'client'
    && asks.length === 1 && asks[0].kind === 'price-list' && asks[0].listId === 'pl_gros');
  ok('huile 22 MAD, sucre sans prix de gros garde 12,50 (repli)', p.huile.price === 22 && p.huile.mainPrice === 24 && p.sucre.price === 12.5);
  ok('un 0 non offert à la caisse : le thé garde 19 MAD', p.the.price === 19);
  ok('un article offert exprès : le bonbon à 0', p.bonbon.price === 0);
  ok('la vente porte le tarif ET la preuve du code', T.saleFields().priceListId === 'pl_gros' && T.saleFields().priceListApproval === 'proof-xyz');
  T.onCustomer('passage');
  ok('la fiche retirée : retour au principal', T.current().isMain);
  win.requireManager = (label, ok2, c, opts) => { asks.push(c); opts.onCancel(); };
  T.onCustomer('cl-1');
  ok('fiche grossiste, pavé refermé sans code : le ticket reste au principal', T.current().isMain && asks.length === 2);
  T.onCustomer('passage');
  win.requireManager = (label, ok2, ctx2) => { asks.push(ctx2); ok2(); };
  T.choose('pl_gros');
  ok('changer de tarif sans fiche : le pavé responsable, lié à CE tarif', asks.length === 3 && asks[2].kind === 'price-list' && asks[2].listId === 'pl_gros');
  ok('…et la preuve signée part avec la vente', T.saleFields().priceListApproval === 'proof-xyz' && T.current().approvedBy === 'Rachid');
  ok('le reçu dit le tarif', T.receiptLabel() === 'Tarif · Gros');
  T.reset();
  ok('ticket suivant : principal', T.current().isMain && JSON.stringify(T.saleFields()) === '{}');
  lang = 'ar';
  ok('le principal non renommé se dit dans la langue de la caisse', T.current().name === 'الثمن الأساسي' && T.lists()[0].name === 'الثمن الأساسي', T.current());
  lang = 'fr';
  win.requireManager = (label, ok2, c, opts) => { asks.push(c); opts.onCancel(); };
  T.choose('pl_gros');
  ok('pavé refermé sans code : le tarif ne change pas', T.current().isMain);
}

console.log('\nL’écran Tarifs (assets/pages-pro/price-lists.js) : saisie des prix');
{
  const vm = await import('node:vm');
  const listeners = {}, toasts = [], writes = [];
  const btn = { disabled: true, textContent: '' };
  const inp = { value: '', attrs: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener: (type, fn) => { listeners.price = fn; }, getAttribute: () => 'huile' };
  const note = { innerHTML: '' };
  const page = {
    querySelectorAll: (sel) => (sel === '[data-pl-price]' ? [inp] : []),
    querySelector: (sel) => (sel === '[data-action="pl-save-prices"]' ? btn : sel.startsWith('[data-pl-note') ? note : null),
  };
  const handlers = {};
  let shown = null;
  const win = {
    Kiwi: { handlers, toast: (m, o) => toasts.push([m, o]), modal: () => null, appPage: (_n, o) => { shown = o; } },
    KiwiPriceListsApi: { lists: async () => [{ id: 'main', name: 'Prix principal', isMain: true, defaultName: true, channels: [] }, { id: 'pl_g', name: 'Gros', isMain: false, channels: ['till'] }],
      listPrices: async () => [{ itemKey: 'huile', cents: 2200, costCents: 2050 }],
      sales: async () => ({ ok: true, lists: [{ listId: 'pl_g', name: 'Gros', sales: 5, amountCents: 22000, flagged: 3 }],
        flags: [{ saleId: 's-1', ref: 'T-12', amountCents: 4400, reason: 'customer-default-no-approval', note: '', saleTs: now, listId: 'pl_g' }] }) },
    KiwiPriceLists: { setPrices: async (rows) => { writes.push(rows); return { written: rows.length, removed: 0 }; } },
    KiwiBoutiqueCatalog: { listProducts: () => [{ id: 'huile', name: 'Huile', priceMAD: 24, cost: 20.5 }] },
  };
  const ctx = vm.createContext({ window: win, CSS: { escape: String }, console, setTimeout,
    document: { querySelector: (sel) => (sel === '[data-pl-page]' ? page : null), getElementById: () => ({}), head: { appendChild() {} }, createElement: () => ({}) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/pages-pro/price-lists.js'), 'utf8'), ctx);
  await handlers['nav-pricelists']();
  await handlers['pl-open']('pl_g');
  inp.value = '21,5'; listeners.price();
  ok('21,5 MAD tapé : un prix à enregistrer, bouton actif', !btn.disabled && /1 prix/.test(btn.textContent), btn);
  ok('la marge sur le prix d’achat s’affiche à côté (21,50 sur 20,50)', /marge/.test(note.innerHTML), note.innerHTML);
  inp.value = '21,555'; listeners.price();
  ok('trois décimales : invalide, l’ancien brouillon n’est PAS gardé, Enregistrer bloqué', inp.attrs['aria-invalid'] === 'true' && btn.disabled && /deux décimales/.test(btn.textContent), btn);
  await handlers['pl-save-prices'](btn, 'pl_g');
  ok('Enregistrer refusé tant que la saisie est invalide : rien n’est écrit', writes.length === 0 && toasts.length >= 1);
  inp.value = '19'; listeners.price();
  ok('sous le prix d’achat : l’écran le dit', /sous le prix d’achat/.test(note.innerHTML), note.innerHTML);
  await handlers['pl-save-prices'](btn, 'pl_g');
  ok('19 MAD part tel quel (1 900 centimes)', writes.length === 1 && writes[0][0].price === 1900 && writes[0][0].itemKey === 'huile', writes);
  await handlers['pl-tab']('sales');
  ok('onglet Ventes : chaque tarif, ses ventes, et les ventes signalées avec leur raison', /Ventes signalées/.test(shown.body) && /T-12/.test(shown.body)
    && /fiche client, sans code responsable/.test(shown.body) && /220 MAD/.test(shown.body), shown && shown.body.slice(0, 200));
}

console.log(`\n${passed} vérifications · ${fails} échec(s)`);
process.exit(fails ? 1 : 0);
