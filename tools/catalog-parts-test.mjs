#!/usr/bin/env node
/* Kiwi · un catalogue plus grand qu'une ligne D1 (functions/api/_catalog-parts.js).
 *
 * La Maison en Vogue arrive d'une autre caisse avec ~3 000 références : son
 * catalogue pèse ~2,5 Mo, D1 refuse toute valeur au-delà de 2 Mo. Ce test passe
 * par la VRAIE route /api/catalog, sur une vraie base SQLite au schéma de
 * schema.sql (tools/server-money-fixture.mjs), et prouve :
 *   · qu'un petit catalogue s'écrit exactement comme avant, sans jamais toucher
 *     catalog_parts ;
 *   · qu'un grand catalogue s'écrit, se relit à l'identique, se vend et se
 *     réécrit, sans qu'aucune valeur stockée ne dépasse la limite D1 ;
 *   · qu'une écriture qui perd la course ne laisse pas de parts orphelines ;
 *   · qu'une part manquante n'est JAMAIS servie comme un catalogue complet ;
 *   · que la garde SQL des transferts trouve un mouvement rangé dans une part. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost as catalogPost, onRequestGet as catalogGet } from '../functions/api/catalog.js';
import { packCatalog, joinCatalog, loadParts, runCatalogWrite, catalogContains, SPLIT_BYTES, PART_BYTES } from '../functions/api/_catalog-parts.js';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D1_MAX = 2_000_000;
const bytes = (s) => Buffer.byteLength(String(s), 'utf8');
let pass = 0;
const ok = (v, m) => { if (!v) { console.error('  ✗ ' + m); process.exitCode = 1; } else { pass++; console.log('  ✓ ' + m); } };

/* Un catalogue « Maison » de n articles, une déclinaison TU chacun, un code-barres
 * importé, et un journal de mouvements : la forme réelle d'un import La Caisse. */
function bigCatalog(n, moves = 0) {
  const at = 1795000000000;
  const categories = Array.from({ length: 19 }, (_, i) => ({ id: 'cat_' + i, name: 'Catégorie ' + i, color: 'atlas', order: i, metaAt: at }));
  const products = [], variants = [];
  for (let i = 0; i < n; i++) {
    products.push({ id: 'prod_' + i, legacyId: '', name: 'SCN.' + String(i).padStart(4, '0') + ' Plat à servir « Fès »', categoryId: 'cat_' + (i % 19),
      priceMAD: 100 + (i % 900), cost: 0, art: '', kind: 'tu', flag: '', grad: null, marque: '', format: 'piece', servicePieces: null,
      piecePriceMAD: null, motif: '', fragile: false, ownership: 'outright', consignor: '', sku: '', photo: '', video: '', mediaAt: 0,
      createdAt: at + i, archived: false, metaAt: at + i });
    variants.push({ id: 'var_' + i, productId: 'prod_' + i, colorId: 'sans_couleur', colorFamily: 'sans_couleur', colorSource: '',
      colorSourceHex: '', colorWas: '', colorLabel: 'Sans couleur', colorHex: '#DCDCDC', size: 'TU', stock: i % 7, base: i % 7,
      baseAt: at, stockAt: 0, sku: '', note: '', metaAt: at + i, barcodeRemoved: {},
      barcodes: [{ code: String(1000000000 + i), type: 'imported', sym: 'numeric', primary: true, at: at + i }] });
  }
  const mv = Array.from({ length: moves }, (_, i) => ({ id: 'mv-' + i + '-abcdefgh', vid: 'var_' + (i % n), d: 0, at: at + 10 + i, why: 'ajust' }));
  return { v: 1, categories, products, variants, seq: n * 2 + 1, removed: {}, moves: mv };
}
const canon = (o) => JSON.stringify(o, Object.keys(o).sort());

/* ── 1 · pack / join, sans base ─────────────────────────────────────────── */
const small = bigCatalog(50);
const ps = packCatalog(small);
ok(ps.head === JSON.stringify(small) && ps.parts.length === 0, 'petit catalogue : la tête est exactement JSON.stringify(data), aucune part');

const big = bigCatalog(3100, 2000);
const pb = packCatalog(big);
ok(bytes(JSON.stringify(big)) > D1_MAX, `le catalogue de test dépasse bien la limite D1 (${bytes(JSON.stringify(big))} octets)`);
ok(pb.parts.length >= 3 && pb.parts.every((p) => bytes(p) < PART_BYTES * 1.05), `grand catalogue : ${pb.parts.length} parts, chacune sous ~${PART_BYTES} octets`);
ok(bytes(pb.head) < 20_000 && pb.head.startsWith('{"_parts":'), 'la tête ne garde que le reste du document');
const back = JSON.parse(joinCatalog(pb.head, pb.parts));
ok(['products', 'variants', 'moves', 'categories', 'removed'].every((k) => JSON.stringify(back[k]) === JSON.stringify(big[k]))
  && back.seq === big.seq && back.v === big.v, 'tête + parts recomposent le document à l\'identique');
ok(pb.parts.every((p) => { try { JSON.parse(p); return true; } catch (_) { return false; } }), 'chaque part est un JSON complet (aucun élément coupé en deux)');

/* ── 2 · la vraie route, sur une vraie base ─────────────────────────────── */
/* Un D1 sur SQLite, au schéma de schema.sql, avec ce que D1 impose et que
 * SQLite n'impose pas : 100 paramètres liés au plus, et AUCUNE valeur au-delà
 * de 2 000 000 octets (sans cette limite, le bug d'origine ne se verrait pas). */
function d1(sql) {
  const tooBig = (args) => args.some((a) => typeof a === 'string' && bytes(a) > D1_MAX);
  const prepare = (query) => {
    let args = [];
    const s = {
      query,
      bind(...values) { if (values.length > 100) throw Error('D1 bound parameter limit'); args = values; return s; },
      run() {
        if (tooBig(args)) throw Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG');
        const r = sql.prepare(query).run(...args);
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      first() { return sql.prepare(query).get(...args) || null; },
      all() { return { results: sql.prepare(query).all(...args) }; },
    };
    return s;
  };
  const batch = (statements) => {
    sql.exec('BEGIN IMMEDIATE');
    try { const r = statements.map((st) => st.run()); sql.exec('COMMIT'); return r; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  };
  return { prepare, batch };
}
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const MERCHANT = 'vogue-like-shop', SECRET = 'fake-catalog-parts-secret';
sqlite.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('money-owner','owner@example.test','Parts','s','h',?,'active')").run(Date.now());
sqlite.prepare("INSERT INTO merchant_config(merchant,account_id,features,name,type,status,till_epoch,updated_ts) VALUES(?,'money-owner','{}','Parts','maison','active',0,?)").run(MERCHANT, Date.now());
const f = { sql: sqlite, DB: d1(sqlite), env: { AUTH_SECRET: SECRET }, merchant: MERCHANT };
f.env.DB = f.DB;

/* La preuve du bug : l'ancienne écriture, une seule valeur, est refusée par D1. */
let oldWay = null;
try { f.DB.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').bind('probe', JSON.stringify(big), 1).run(); }
catch (e) { oldWay = String(e.message || e); }
ok(oldWay && /TOOBIG/.test(oldWay), 'sans les parts, D1 refuse le grand catalogue (la panne d\'origine)');
const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
const seen = [];
const DB = { ...f.DB, prepare(q) { seen.push(q); return f.DB.prepare(q); }, batch: (s) => f.DB.batch(s) };
const env = { ...f.env, DB };
const post = async (body) => {
  const res = await catalogPost({ request: new Request('https://kiwi.test/api/catalog', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: f.merchant, ...body }) }), env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const get = async () => {
  const res = await catalogGet({ request: new Request('https://kiwi.test/api/catalog?merchant=' + f.merchant, { headers: { Cookie: cookie } }), env });
  return { status: res.status, body: await res.json() };
};
const row = () => f.sql.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').get(f.merchant);
const parts = () => f.sql.prepare('SELECT gen, part, length(data) AS n FROM catalog_parts WHERE merchant = ? ORDER BY gen, part').all(f.merchant);

// 2a · petit catalogue : rien ne change
seen.length = 0;
let r = await post({ baseRev: 0, data: small });
ok(r.status === 200 && r.body.rev === 1, 'petit catalogue : premier enregistrement accepté');
ok(!seen.some((q) => /catalog_parts/.test(q)), 'petit catalogue : aucune requête ne touche catalog_parts');
ok(!row().data.startsWith('{"_parts":') && parts().length === 0, 'petit catalogue : document entier dans catalogs.data');
seen.length = 0;
let g = await get();
ok(g.body.data && g.body.data.products.length === 50 && !seen.some((q) => /catalog_parts/.test(q)), 'petit catalogue : relu sans requête de plus');

// 2b · le même magasin grandit à 3 100 articles
r = await post({ baseRev: 1, data: big });
ok(r.status === 200 && r.body.rev === 2 && r.body.products === 3100, `grand catalogue : enregistrement accepté (rev ${r.body.rev})`);
const head = row();
ok(head.data.startsWith('{"_parts":') && bytes(head.data) < D1_MAX, 'grand catalogue : catalogs.data est une tête');
const p1 = parts();
ok(p1.length >= 3 && new Set(p1.map((x) => x.gen)).size === 1 && p1.every((x) => x.n < D1_MAX), `grand catalogue : ${p1.length} parts d'une seule génération, toutes sous 2 Mo`);
g = await get();
ok(g.status === 200 && g.body.rev === 2 && g.body.data.products.length === 3100 && g.body.data.variants.length === 3100,
  'grand catalogue : relu en entier (3 100 articles, 3 100 déclinaisons)');
ok(g.body.data.variants[2999].barcodes[0].code === '1000002999' && g.body.data.products[3099].name.includes('Fès'),
  'grand catalogue : codes-barres et accents relus tels quels');

// 2c · une vente sur le grand catalogue (réservation puis confirmation)
const v = g.body.data.variants.find((x) => x.stock >= 2), pr = g.body.data.products.find((x) => x.id === v.productId);
r = await post({ stockAction: 'reserve', ref: 'sale-big-1', lines: [{ pid: pr.id, size: v.size, color: v.colorId, qty: 1, price: pr.priceMAD }] });
ok(r.status === 200 && r.body.ok, 'grand catalogue : une caisse réserve une pièce');
r = await post({ stockAction: 'confirm', ref: 'sale-big-1' });
ok(r.status === 200 && r.body.ok, 'grand catalogue : la vente est confirmée');
g = await get();
ok(g.body.data.variants.find((x) => x.id === v.id).stock === v.stock - 1, 'grand catalogue : le stock relu a bien baissé d\'une pièce');
ok(new Set(parts().map((x) => x.gen)).size === 1, 'après la vente : une seule génération de parts, l\'ancienne est effacée');

// 2d · une écriture périmée est refusée et ne laisse rien derrière elle
const revNow = g.body.rev;
r = await post({ baseRev: revNow - 1, data: bigCatalog(3100) });
ok(r.status === 409 && r.body.error === 'stale' && r.body.data.products.length === 3100, 'écriture périmée : 409 avec la copie serveur complète');
ok(new Set(parts().map((x) => x.gen)).size === 1, 'écriture périmée : aucune part orpheline');

// 2e · course perdue au niveau SQL : la révision bouge entre la lecture et l'écriture
const before = await loadParts(DB, f.merchant, row());
f.sql.prepare('UPDATE catalogs SET rev = rev + 1 WHERE merchant = ?').run(f.merchant);
const lost = packCatalog(bigCatalog(3100, 10));
const w = await runCatalogWrite(DB, f.merchant, lost, DB.prepare('UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?')
  .bind(lost.head, before.rev + 1, Date.now(), f.merchant, before.rev), before.split);
ok(Number(w.meta.changes) === 0, 'course perdue : l\'UPDATE conditionné ne passe pas');
ok(parts().every((x) => x.gen !== lost.gen) && new Set(parts().map((x) => x.gen)).size === 1, 'course perdue : nos parts orphelines sont effacées, le gagnant reste lisible');
g = await get();
ok(g.body.data && g.body.data.products.length === 3100, 'course perdue : le catalogue du gagnant se relit en entier');
const syncRev = g.body.rev;

// 2f · une part manquante n'est jamais servie comme un catalogue complet
const victim = parts()[1];
const saved = f.sql.prepare('SELECT * FROM catalog_parts WHERE merchant = ? AND gen = ? AND part = ?').get(f.merchant, victim.gen, victim.part);
f.sql.prepare('DELETE FROM catalog_parts WHERE merchant = ? AND gen = ? AND part = ?').run(f.merchant, victim.gen, victim.part);
g = await get();
ok(g.body.data === null, 'part manquante : la lecture rend « rien », jamais un catalogue tronqué');
r = await post({ baseRev: syncRev, data: big });
ok(r.status === 503, 'part manquante : l\'écriture est refusée (le client garde sa copie et réessaie)');
f.sql.prepare('INSERT INTO catalog_parts (merchant, gen, part, data) VALUES (?, ?, ?, ?)').run(saved.merchant, saved.gen, saved.part, saved.data);

// 2g · la garde SQL des transferts trouve un mouvement rangé dans une part
const cur = await loadParts(DB, f.merchant, row());
const curMoves = JSON.parse(cur.data).moves || [];
/* Un identifiant réellement stocké (le serveur compacte le journal à
   l'écriture) : la vente de 2c en a laissé au moins un. */
const needle = String((curMoves.find((m) => m.ref === 'sale-big-1') || curMoves[curMoves.length - 1] || {}).id || 'none');
ok(cur.split && !row().data.includes(needle) && cur.data.includes(needle), 'le mouvement cherché est dans une part, pas dans la tête');
const guard = catalogContains(true, f.merchant, needle);
const found = f.sql.prepare('SELECT 1 AS hit WHERE ' + guard.sql).get(...guard.args);
const plain = catalogContains(false, f.merchant, needle);
const missed = f.sql.prepare('SELECT 1 AS hit WHERE ' + plain.sql).get(...plain.args);
ok(found && found.hit === 1 && !missed, 'garde des transferts : trouvé dans les parts (et l\'ancienne garde l\'aurait manqué)');

// 2h · le catalogue redevient petit : les parts disparaissent
/* Omettre 3 060 articles sans les supprimer n'est pas une suppression : c'est
   une copie partielle (le rayon d'un gros catalogue). Refusée, copie rendue. */
r = await post({ baseRev: syncRev, data: bigCatalog(40) });
ok(r.status === 409 && r.body.error === 'items-omitted' && r.body.count === 3060 && r.body.data.products.length > 3000, 'omission muette : refusée, copie serveur rendue');
const shrunk = bigCatalog(40);
for (let i = 40; i < 3100; i++) shrunk.removed['prod_' + i] = 1795000000000 + 99;
r = await post({ baseRev: syncRev, data: shrunk });
ok(r.status === 200, 'retour à un petit catalogue : accepté');
ok(!row().data.startsWith('{"_parts":') && parts().length === 0, 'retour à un petit catalogue : document entier, plus aucune part');
g = await get();
ok(g.body.data.products.length === 40, 'retour à un petit catalogue : relu à 40 articles');

console.log(`\n${process.exitCode ? '✗' : '✓'} catalog-parts : ${pass} vérifications (seuil ${SPLIT_BYTES} octets)`);
