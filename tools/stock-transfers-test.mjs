#!/usr/bin/env node
/* Transferts de stock entre boutiques · Santos Casablanca → Rabat (19 nov. 2026).
 *
 * Ce que le propriétaire a demandé :
 *   · Casablanca crée « Transfert vers Rabat » et scanne les pièces UNE fois :
 *     elles quittent le stock de Casablanca et sont « en route » ;
 *   · Rabat reçoit le transfert tout de suite et confirme avec un de trois
 *     boutons : « Tout reçu » (tout entre au stock), « Reçu en partie » (ce qui
 *     est arrivé entre, le reste reste en route, le transfert reste ouvert),
 *     « Il manque quelque chose » (on dit ce qui manque, le reste entre, le
 *     transfert se ferme et le propriétaire voit l'écart) ;
 *   · sans confirmation après 3 jours, le propriétaire voit « non reçu ».
 * Vrai functions/api/stock-transfers.js et vrai catalog.js, sur une D1 en mémoire.
 *   node tools/stock-transfers-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const { onRequestGet: trGet, onRequestPost: trPost } = await imp('functions/api/stock-transfers.js');
const { materialize } = await imp('functions/api/_rules-catalog.js');
const { tillToken, makeSession, sessionCookie } = await imp('functions/auth/_lib.js');

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  fails++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'stock-transfers-secret-0123456789';
const now = Date.now();
const DAY = 86400000;
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-s','o@santos.test','Santos Store','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-x','o@other.test','Other Shop','s','h',?,'active')`).run(now);
const shop = (merchant, account, features, city) => db.prepare(
  `INSERT INTO merchant_config (merchant,features,type,account_id,name,city,status,till_epoch,updated_ts) VALUES (?,?,'boutique',?,?,?,'active',0,?)`,
).run(merchant, JSON.stringify(features), account, merchant, city, now);
const RABAT = 'santos-store', CASA = 'santos-store-casablanca', SOLO = 'santos-store-marrakech', OTHER = 'other-shop';
shop(RABAT, 'acc-s', { sharedCatalog: true }, 'Rabat');
shop(CASA, 'acc-s', { sharedCatalog: true }, 'Casablanca');
shop(SOLO, 'acc-s', {}, 'Marrakech');
shop(OTHER, 'acc-x', { sharedCatalog: true }, 'Fès');

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
const tillOf = async (m) => `kiwi_till=${await tillToken(AUTH_SECRET, m)}`;
const casaTill = await tillOf(CASA), rabatTill = await tillOf(RABAT);

const T0 = now - 10 * DAY;
const defs = (stock) => ({
  v: 1, seq: 20, removed: {},
  categories: [{ id: 'cat_1', name: 'Jeans', metaAt: T0 }],
  products: [{ id: 'prod_2', name: 'Jean slim', categoryId: 'cat_1', priceMAD: 299, metaAt: T0 }],
  variants: [
    { id: 'var_3', productId: 'prod_2', colorId: 'bleu', colorFamily: 'bleu', size: '38', base: stock[0], baseAt: T0, metaAt: T0,
      barcodes: [{ code: '2010000023383', type: 'ean13', primary: true, at: T0 }] },
    { id: 'var_4', productId: 'prod_2', colorId: 'bleu', colorFamily: 'bleu', size: '40', base: stock[1], baseAt: T0, metaAt: T0, barcodes: [] },
  ],
  moves: [],
});
const put = (m, d) => db.prepare('INSERT OR REPLACE INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)').run(m, JSON.stringify(materialize(d)), 3, now);
put(RABAT, defs([7, 3]));
put(CASA, defs([5, 2]));
const stockOf = (m, vid) => {
  const r = db.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(m);
  const d = materialize(JSON.parse(r.data));
  const v = d.variants.find((x) => x.id === vid);
  return v ? v.stock : null;
};
const call = async (fn, method, url, body, cookie) => {
  const init = { method, headers: { Cookie: cookie, 'CF-Connecting-IP': '10.0.0.9' } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fn({ request: new Request('https://k' + url, init), env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const send = (body, cookie = casaTill) => call(trPost, 'POST', '/api/stock-transfers', { merchant: CASA, action: 'send', ...body }, cookie);
const receive = (body, cookie = rabatTill) => call(trPost, 'POST', '/api/stock-transfers', { merchant: RABAT, action: 'receive', ...body }, cookie);
const list = (m, cookie) => call(trGet, 'GET', `/api/stock-transfers?merchant=${m}`, null, cookie);

console.log('■ Casablanca envoie : les pièces quittent son stock, une seule fois');
let r = await send({ to: RABAT, ref: 'casa-1', lines: [{ vid: 'var_3', qty: 3 }, { vid: 'var_4', qty: 1 }] });
ok('« Transfert vers Rabat » est créé (200)', r.status === 200 && r.body.transfer && r.body.transfer.status === 'en-route', JSON.stringify(r.body));
const t1 = r.body.transfer && r.body.transfer.id;
ok('Casablanca : 38 passe de 5 à 2, 40 de 2 à 1', stockOf(CASA, 'var_3') === 2 && stockOf(CASA, 'var_4') === 1, `${stockOf(CASA, 'var_3')} / ${stockOf(CASA, 'var_4')}`);
ok('Rabat ne bouge pas tant qu’il n’a rien confirmé (7 et 3)', stockOf(RABAT, 'var_3') === 7 && stockOf(RABAT, 'var_4') === 3);
ok('le transfert dit le nom de l’article, la taille et la couleur', r.body.transfer && r.body.transfer.lines[0].name === 'Jean slim' && r.body.transfer.lines[0].size === '38');
r = await send({ to: RABAT, ref: 'casa-1', lines: [{ vid: 'var_3', qty: 3 }, { vid: 'var_4', qty: 1 }] });
ok('le même envoi rejoué (réseau qui hoquette) ne décompte pas deux fois', r.status === 200 && r.body.transfer.id === t1 && stockOf(CASA, 'var_3') === 2);
r = await send({ to: RABAT, ref: 'casa-2', lines: [{ vid: 'var_3', qty: 9 }] });
ok('envoyer plus que le stock est refusé (409), rien ne bouge', r.status === 409 && r.body.error === 'stock-insufficient' && stockOf(CASA, 'var_3') === 2, JSON.stringify(r.body));
r = await send({ to: SOLO, ref: 'casa-3', lines: [{ vid: 'var_3', qty: 1 }] });
ok('vers une boutique hors du catalogue partagé : refusé', r.status === 403 && stockOf(CASA, 'var_3') === 2, JSON.stringify(r.body));
r = await send({ to: OTHER, ref: 'casa-4', lines: [{ vid: 'var_3', qty: 1 }] });
ok('vers une boutique d’un autre compte : refusé', r.status === 403 && stockOf(CASA, 'var_3') === 2);
r = await send({ to: RABAT, ref: 'casa-5', lines: [{ vid: 'var_3', qty: 1 }] }, rabatTill);
ok('la caisse de Rabat ne peut pas faire partir le stock de Casablanca', r.status === 401 || r.status === 403, String(r.status));
r = await send({ to: RABAT, ref: 'casa-6', lines: [{ vid: 'var_3', qty: 1.5 }] });
ok('une demi-pièce est refusée', r.status === 400 && stockOf(CASA, 'var_3') === 2);

console.log('■ Rabat le voit tout de suite, et seulement Rabat le confirme');
r = await list(RABAT, rabatTill);
ok('la caisse de Rabat a un transfert entrant en route', r.status === 200 && r.body.incoming.length === 1 && r.body.incoming[0].id === t1 && r.body.incoming[0].from === CASA, JSON.stringify(r.body).slice(0, 300));
ok('…avec le nom de la boutique d’origine (Casablanca)', r.body.incoming[0].fromName === 'Casablanca', r.body.incoming[0].fromName);
r = await list(CASA, casaTill);
ok('Casablanca le voit dans ses envois', r.body.outgoing.length === 1 && r.body.incoming.length === 0);
ok('…et sait vers où elle peut envoyer (Rabat seulement)', JSON.stringify(r.body.shops.map((s) => s.merchant)) === JSON.stringify([RABAT]), JSON.stringify(r.body.shops));
ok('…et se nomme elle-même (« Envoyé de » sur la fiche de livraison)', r.body.self && r.body.self.merchant === CASA && r.body.self.name === 'Casablanca', JSON.stringify(r.body.self));
r = await call(trPost, 'POST', '/api/stock-transfers', { merchant: CASA, action: 'receive', id: t1, mode: 'all' }, casaTill);
ok('Casablanca ne peut pas confirmer à la place de Rabat', r.status === 403 || r.status === 404, String(r.status));

console.log('■ « Reçu en partie » : ce qui est arrivé entre, le reste reste en route');
r = await receive({ id: t1, mode: 'partial', lines: [{ vid: 'var_3', qty: 2 }] });
ok('Rabat reçoit 2 jeans en 38 sur 3 (200)', r.status === 200 && r.body.transfer.status === 'partiel', JSON.stringify(r.body));
ok('Rabat : 38 passe de 7 à 9, 40 reste à 3', stockOf(RABAT, 'var_3') === 9 && stockOf(RABAT, 'var_4') === 3);
ok('le transfert reste ouvert : 1 en 38 et 1 en 40 encore en route',
  r.body.transfer.lines.find((l) => l.vid === 'var_3').received === 2 && r.body.transfer.lines.find((l) => l.vid === 'var_4').received === 0);
r = await receive({ id: t1, mode: 'partial', lines: [{ vid: 'var_3', qty: 5 }] });
ok('recevoir plus que ce qui est en route est refusé', r.status === 409 && stockOf(RABAT, 'var_3') === 9, JSON.stringify(r.body));

console.log('■ « Il manque quelque chose » : on dit ce qui manque, le reste entre, on ferme');
r = await receive({ id: t1, mode: 'missing', lines: [{ vid: 'var_3', qty: 1 }] });
ok('il manque 1 jean en 38 : le transfert se ferme (200)', r.status === 200 && r.body.transfer.status === 'manque' && r.body.transfer.closedAt > 0, JSON.stringify(r.body));
ok('le 40 qui restait entre au stock de Rabat (3 → 4), pas la pièce manquante (38 reste à 9)', stockOf(RABAT, 'var_4') === 4 && stockOf(RABAT, 'var_3') === 9);
ok('l’écart est écrit : 1 jean en 38 manquant', r.body.transfer.lines.find((l) => l.vid === 'var_3').missing === 1);
ok('Casablanca ne retrouve pas la pièce manquante (2)', stockOf(CASA, 'var_3') === 2);
r = await receive({ id: t1, mode: 'all' });
ok('un transfert fermé ne se reçoit plus', r.status === 409 && stockOf(RABAT, 'var_3') === 9);

console.log('■ « Tout reçu »');
r = await send({ to: RABAT, ref: 'casa-7', lines: [{ vid: 'var_3', qty: 2 }] });
const t2 = r.body.transfer.id;
r = await receive({ id: t2, mode: 'all' });
ok('tout entre au stock de Rabat (9 → 11), le transfert est « reçu »', r.status === 200 && r.body.transfer.status === 'recu' && stockOf(RABAT, 'var_3') === 11, JSON.stringify(r.body));
ok('Casablanca : 0 en 38', stockOf(CASA, 'var_3') === 0);

console.log('■ Un article créé à Casablanca que Rabat ne connaît pas encore');
const casaDoc = JSON.parse(db.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(CASA).data);
casaDoc.products.push({ id: 'prod_30_7hq1m', name: 'Ceinture cuir', categoryId: 'cat_1', priceMAD: 150, metaAt: now });
casaDoc.variants.push({ id: 'var_31_7hq1m', productId: 'prod_30_7hq1m', colorId: 'noir', colorFamily: 'noir', size: 'TU', base: 4, baseAt: now, metaAt: now, barcodes: [] });
db.prepare('UPDATE catalogs SET data = ? WHERE merchant = ?').run(JSON.stringify(materialize(casaDoc)), CASA);
r = await send({ to: RABAT, ref: 'casa-8', lines: [{ vid: 'var_31_7hq1m', qty: 2 }] });
const t3 = r.body.transfer && r.body.transfer.id;
r = await receive({ id: t3, mode: 'all' });
ok('Rabat reçoit les 2 ceintures : l’article est ajouté à son catalogue, avec ses 2 pièces',
  r.status === 200 && stockOf(RABAT, 'var_31_7hq1m') === 2, JSON.stringify(r.body).slice(0, 200));

console.log('■ Le propriétaire voit tout, et « non reçu » après 3 jours');
r = await send({ to: RABAT, ref: 'casa-9', lines: [{ vid: 'var_4', qty: 1 }] });
const t4 = r.body.transfer.id;
const doc = db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = 'stock-transfers'`).get(CASA);
ok('les transferts sont gardés chez la boutique qui envoie', !!doc);
const d = JSON.parse(doc.data);
d.list.find((x) => x.id === t4).at = now - 4 * DAY;
db.prepare(`UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'stock-transfers'`).run(JSON.stringify(d), CASA);
r = await list(RABAT, owner);
const late = r.body.incoming.find((x) => x.id === t4);
ok('le propriétaire voit le transfert de 4 jours « non reçu »', r.status === 200 && late && late.overdue === true, JSON.stringify(late));
ok('…et pas celui qui est fermé', !r.body.incoming.find((x) => x.id === t1).overdue);
r = await list(OTHER, owner);
ok('le propriétaire de Santos ne lit pas les transferts d’un autre compte', r.status === 401 || r.status === 403 || r.body.merchant !== OTHER, JSON.stringify(r.body).slice(0, 160));

console.log(`stock-transfers: ${passed} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
