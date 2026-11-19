#!/usr/bin/env node
/* Un catalogue, plusieurs boutiques · Santos Store (Rabat) et Santos Store
 * Casablanca, 19 nov. 2026.
 *
 * Le propriétaire a choisi (option B) : Casablanca reste son propre
 * établissement (sa caisse, ses ventes, sa clôture), mais vend LES MÊMES
 * articles que Rabat, avec les mêmes tailles, prix et codes-barres. Seul le
 * stock est à chaque boutique : tout le stock existant reste à Rabat,
 * Casablanca part de zéro.
 *
 * Deux boutiques du même compte et du même métier, chacune avec
 * `features.sharedCatalog = true`, forment une famille :
 *   · un article créé, renommé, re-prixé ou supprimé d'un côté l'est de l'autre ;
 *   · les codes-barres voyagent avec l'article ;
 *   · le stock, les mouvements et les ventes ne traversent jamais ;
 *   · une boutique d'un autre compte, ou sans l'interrupteur, n'est jamais touchée.
 *   node tools/catalog-family-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost: catalogPost, onRequestGet: catalogGet } = await import(pathToFileURL(path.join(ROOT, 'functions/api/catalog.js')).href);
const { materialize } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_rules-catalog.js')).href);
const { tillToken, makeSession, sessionCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  fails++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'catalog-family-secret-0123456789';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-s','o@santos.test','Santos Store','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-x','o@other.test','Other Shop','s','h',?,'active')`).run(now);
const shop = (merchant, account, features, type = 'boutique') => db.prepare(
  `INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,?,?,?,?,'active',0,?)`,
).run(merchant, JSON.stringify(features), type, account, merchant, now);
shop('santos-store', 'acc-s', { sharedCatalog: true });
shop('santos-store-casablanca', 'acc-s', { sharedCatalog: true });
shop('santos-store-marrakech', 'acc-s', {});                 // même compte, pas d'interrupteur
shop('other-shop', 'acc-x', { sharedCatalog: true });        // autre compte

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} };

const owner = sessionCookie(await makeSession('acc-s', AUTH_SECRET)).split(';')[0];
const till = async (m) => `kiwi_till=${await tillToken(AUTH_SECRET, m)}`;
const RABAT = 'santos-store', CASA = 'santos-store-casablanca', MARRAKECH = 'santos-store-marrakech';

const row = (m) => {
  const r = db.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').get(m);
  return r ? { rev: r.rev, data: JSON.parse(r.data) } : null;
};
const put = (m, data, rev = 1) => db.prepare('INSERT OR REPLACE INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)').run(m, JSON.stringify(data), rev, now);
const get = async (m, cookie = owner) => {
  const res = await catalogGet({ request: new Request(`https://k/api/catalog?merchant=${m}`, { headers: { Cookie: cookie, 'CF-Connecting-IP': '10.0.0.9' } }), env });
  return { status: res.status, body: await res.json() };
};
const post = async (m, body, cookie = owner) => {
  const res = await catalogPost({ request: new Request('https://k/api/catalog', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.0.0.9' },
    /* Comme le navigateur : le stock transporté est toujours recalculé (socle + mouvements). */
    body: JSON.stringify({ merchant: m, ...body, ...(body.data ? { data: materialize(body.data) } : {}) }) }), env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const variant = (d, id) => (d.variants || []).find((v) => v.id === id);
const product = (d, id) => (d.products || []).find((p) => p.id === id);

const T0 = now - 86400000;
const rabatDoc = {
  v: 1, seq: 12, removed: {},
  categories: [{ id: 'cat_1', name: 'Jeans', color: 'atlas', order: 0, metaAt: T0 }],
  products: [{ id: 'prod_2', name: 'Jean slim', categoryId: 'cat_1', priceMAD: 299, cost: 150, metaAt: T0, createdAt: T0 }],
  variants: [
    { id: 'var_3', productId: 'prod_2', colorId: 'bleu', colorFamily: 'bleu', size: '38', stock: 7, base: 7, baseAt: T0, metaAt: T0,
      barcodes: [{ code: '2010000023383', type: 'ean13', primary: true, at: T0 }] },
    { id: 'var_4', productId: 'prod_2', colorId: 'bleu', colorFamily: 'bleu', size: '40', stock: 3, base: 3, baseAt: T0, metaAt: T0,
      barcodes: [{ code: '2010000024007', type: 'ean13', primary: true, at: T0 }] },
  ],
  moves: [{ id: 'mv-a', vid: 'var_3', d: -2, at: T0 + 1000, why: 'vente', ref: 't1' }],
};
put(RABAT, rabatDoc, 5);

console.log('■ Casablanca ouvre : les articles de Rabat, son propre stock à zéro');
let r = await get(CASA);
ok('la caisse de Casablanca lit un catalogue (200)', r.status === 200, 'status ' + r.status);
ok('…qui porte l’article de Rabat, ses deux tailles et ses codes-barres',
  r.body.data && product(r.body.data, 'prod_2') && variant(r.body.data, 'var_3')
  && variant(r.body.data, 'var_3').barcodes[0].code === '2010000023383' && variant(r.body.data, 'var_4'),
  JSON.stringify(r.body.data && r.body.data.variants));
ok('…avec un stock à zéro à Casablanca, sans les ventes de Rabat',
  r.body.data && variant(r.body.data, 'var_3').stock === 0 && variant(r.body.data, 'var_4').stock === 0
  && !(r.body.data.moves || []).length);
ok('le catalogue de Casablanca existe désormais sur le serveur (une vente peut y réserver)', !!row(CASA));
ok('Rabat n’a pas bougé : 5 pièces en 38 (7 moins la vente), 3 en 40, révision 5',
  row(RABAT).rev === 5 && variant(row(RABAT).data, 'var_4').stock === 3);
const tagCasa = r.body.idTag;
const tagRabat = (await get(RABAT)).body.idTag;
ok('chaque boutique de la famille reçoit une étiquette d’identifiant, différente de l’autre',
  /^[a-z0-9]{3,8}$/.test(String(tagCasa || '')) && /^[a-z0-9]{3,8}$/.test(String(tagRabat || '')) && tagCasa !== tagRabat,
  `${tagCasa} / ${tagRabat}`);
ok('une boutique hors famille n’en reçoit pas (ses identifiants restent ceux d’avant)', !(await get(MARRAKECH)).body.idTag);

console.log('■ Un article créé à Rabat arrive à Casablanca, sans stock');
let rabat = row(RABAT).data;
rabat.seq = 14;
rabat.products.push({ id: 'prod_13', name: 'Veste lin', categoryId: 'cat_1', priceMAD: 450, metaAt: now, createdAt: now });
rabat.variants.push({ id: 'var_14', productId: 'prod_13', colorId: 'beige', colorFamily: 'beige', size: 'M', stock: 6, base: 6, baseAt: now, metaAt: now,
  barcodes: [{ code: '2101300014M05', type: 'ean13', primary: true, at: now }] });
r = await post(RABAT, { baseRev: 5, data: rabat });
ok('Rabat enregistre (200)', r.status === 200, JSON.stringify(r.body));
let casa = row(CASA).data;
ok('la veste est à Casablanca', !!product(casa, 'prod_13') && !!variant(casa, 'var_14'));
ok('…à zéro pièce, quand Rabat en a 6', variant(casa, 'var_14').stock === 0 && variant(row(RABAT).data, 'var_14').stock === 6);
ok('le compteur d’identifiants suit (seq 14 des deux côtés)', casa.seq >= 14);

console.log('■ Un prix changé à Casablanca change à Rabat ; le stock de Rabat reste le sien');
let casaRev = row(CASA).rev;
casa.products.find((p) => p.id === 'prod_2').priceMAD = 279;
casa.products.find((p) => p.id === 'prod_2').metaAt = now + 5000;
r = await post(CASA, { baseRev: casaRev, data: casa });
ok('Casablanca enregistre (200)', r.status === 200, JSON.stringify(r.body));
rabat = row(RABAT).data;
ok('Rabat vend le jean à 279', product(rabat, 'prod_2').priceMAD === 279, String(product(rabat, 'prod_2').priceMAD));
ok('…et garde ses 5 pièces en 38, sa vente et ses 6 vestes',
  variant(rabat, 'var_3').stock === 5 && rabat.moves.some((m) => m.id === 'mv-a') && variant(rabat, 'var_14').stock === 6);

console.log('■ Le stock ne traverse jamais');
const rabatRev = row(RABAT).rev;
casa = row(CASA).data; casaRev = row(CASA).rev;
casa.moves.push({ id: 'rcv-casa-1', vid: 'var_3', d: 4, at: now + 6000, why: 'reception' });
r = await post(CASA, { baseRev: casaRev, data: casa });
ok('Casablanca reçoit 4 jeans en 38 (200)', r.status === 200 && variant(row(CASA).data, 'var_3').stock === 4, JSON.stringify(r.body));
ok('…Rabat n’est pas réécrit pour un mouvement de stock (même révision)', row(RABAT).rev === rabatRev, `${row(RABAT).rev} vs ${rabatRev}`);
ok('…et garde 5 pièces', variant(row(RABAT).data, 'var_3').stock === 5);
casa = row(CASA).data; casaRev = row(CASA).rev;
variant(casa, 'var_4').base = 9; variant(casa, 'var_4').baseAt = now + 7000;
r = await post(CASA, { baseRev: casaRev, data: casa });
ok('un comptage d’inventaire à Casablanca (9 en 40) ne touche pas Rabat (3)',
  r.status === 200 && variant(row(CASA).data, 'var_4').stock === 9 && variant(row(RABAT).data, 'var_4').stock === 3);

console.log('■ Une vente ne décompte que la boutique de la caisse');
r = await post(CASA, { stockAction: 'reserve', ref: 'sale-casa-1', lines: [{ pid: 'prod_13', size: 'M', color: 'beige', qty: 1, price: 450 }] }, await till(CASA));
ok('Casablanca ne peut pas vendre une veste qu’elle n’a pas (409, 0 en main)',
  r.status === 409 && r.body.error === 'stock-insufficient' && r.body.issue.onHand === 0, JSON.stringify(r.body));
r = await post(CASA, { stockAction: 'reserve', ref: 'sale-casa-2', lines: [{ pid: 'prod_2', size: '38', color: 'bleu', qty: 1, price: 279 }] }, await till(CASA));
ok('Casablanca vend un jean en 38 (4 → 3)', r.status === 200 && variant(row(CASA).data, 'var_3').stock === 3, JSON.stringify(r.body).slice(0, 200));
ok('…Rabat en a toujours 5', variant(row(RABAT).data, 'var_3').stock === 5);

console.log('■ Une suppression voyage');
casa = row(CASA).data; casaRev = row(CASA).rev;
casa.removed = { ...(casa.removed || {}), prod_13: now + 9000, var_14: now + 9000 };
casa.products = casa.products.filter((p) => p.id !== 'prod_13');
casa.variants = casa.variants.filter((v) => v.id !== 'var_14');
r = await post(CASA, { baseRev: casaRev, data: casa });
ok('la veste supprimée à Casablanca disparaît à Rabat', r.status === 200 && !product(row(RABAT).data, 'prod_13'), JSON.stringify(r.body) + ' rabat.removed=' + JSON.stringify(row(RABAT).data.removed) + ' casa.removed=' + JSON.stringify(row(CASA).data.removed));

console.log('■ Hors famille : personne n’est touché');
put(MARRAKECH, { v: 1, seq: 1, removed: {}, categories: [], products: [{ id: 'prod_1', name: 'Seul', priceMAD: 10, metaAt: now }], variants: [], moves: [] }, 1);
put('other-shop', { v: 1, seq: 1, removed: {}, categories: [], products: [{ id: 'prod_9', name: 'Autre', priceMAD: 10, metaAt: now }], variants: [], moves: [] }, 1);
rabat = row(RABAT).data;
rabat.products.push({ id: 'prod_20', name: 'Chemise', categoryId: 'cat_1', priceMAD: 199, metaAt: now + 10000 });
r = await post(RABAT, { baseRev: row(RABAT).rev, data: rabat });
ok('Rabat enregistre une chemise (200)', r.status === 200);
ok('la chemise arrive à Casablanca', !!product(row(CASA).data, 'prod_20'));
ok('…pas à Marrakech (même compte, interrupteur éteint)', !product(row(MARRAKECH).data, 'prod_20') && row(MARRAKECH).rev === 1);
ok('…ni chez un autre compte, même interrupteur allumé', !product(row('other-shop').data, 'prod_20') && row('other-shop').rev === 1);
r = await get('other-shop', owner);
ok('le propriétaire de Santos ne lit pas le catalogue d’un autre compte', r.status === 401 || !(r.body.data && product(r.body.data, 'prod_9')), JSON.stringify(r.body).slice(0, 120));

console.log(`catalog-family: ${passed} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
