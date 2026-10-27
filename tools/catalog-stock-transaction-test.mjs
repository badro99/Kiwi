#!/usr/bin/env node
import retailSource from './pos-retail-test-source.cjs';
/* Kiwi · contract for authoritative boutique stock checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __test as T, onRequestPost as catalogPost } from '../functions/api/catalog.js';
import { fixture } from './server-money-fixture.mjs';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const ok = (v, m) => { if (!v) { console.error('  ✗ ' + m); process.exitCode = 1; } else pass++; };
const eq = (a, b, m) => ok(a === b, `${m} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

const now = Date.now();
const raw = {
  v: 2, seq: 1, categories: [{ id: 'c', name: 'Textile', color: 'atlas', order: 0, metaAt: now }], removed: {}, moves: [],
  products: [{ id: 'p', name: 'Polo', priceMAD: 400, cost: 180, archived: false, metaAt: now,
    marque: 'Atlas', format: 'service', servicePieces: 2, piecePriceMAD: 210, motif: 'Uni', fragile: true,
    ownership: 'consignment', consignor: 'Maison 121', sku: 'POLO-1', photo: '/api/media/p', mediaAt: now }],
  variants: [{ id: 'v', productId: 'p', colorId: 'noir', colorFamily: 'noir', colorLabel: 'Noir', colorHex: '#111111',
    size: 'S', stock: 1, base: 1, baseAt: now - 10, metaAt: now, barcodeRemoved: { OLD: now },
    barcodes: [{ code: '2000000000015', type: 'ean13', sym: 'ean13', primary: true, at: now }] }],
};

const clean = T.sanitize(raw);
const p = clean.products[0], v = clean.variants[0];
ok(p.marque === 'Atlas' && p.ownership === 'consignment' && p.consignor === 'Maison 121' && p.sku === 'POLO-1',
  'le sanitizer serveur conserve marque, dépôt-vente, déposant et SKU');
ok(p.format === 'service' && p.servicePieces === 2 && p.mediaAt === now && p.metaAt === now,
  'le sanitizer conserve les champs Maison et les horloges de fusion');
ok(v.barcodes[0].sym === 'ean13' && v.barcodes[0].at === now && v.barcodeRemoved.OLD === now,
  'le contrat code-barres conserve ajout, symbologie et suppression');

const first = T.stockMutation(clean, { stockAction: 'reserve', ref: 'sale-a', lines: [{ pid: 'p', size: 'S', color: 'noir', qty: 1, price: 400 }] }, now);
ok(first.ok, 'la première caisse réserve la dernière pièce');
eq(clean.variants[0].stock, 0, 'la réservation retire immédiatement la pièce du disponible serveur');
const second = T.stockMutation(clean, { stockAction: 'reserve', ref: 'sale-b', lines: [{ pid: 'p', size: 'S', color: 'noir', qty: 1, price: 400 }] }, now + 1);
ok(!second.ok && second.error === 'stock-insufficient', 'une deuxième caisse ne peut pas réserver la même dernière pièce');
const confirmed = T.stockMutation(clean, { stockAction: 'confirm', ref: 'sale-a' }, now + 2);
ok(confirmed.ok && clean.moves.some((m) => m.ref === 'sale-a' && m.why === 'vente'), 'le paiement confirme le hold en vente');
const forbiddenRelease = T.stockMutation(clean, { stockAction: 'release', ref: 'sale-a' }, now + 3);
ok(!forbiddenRelease.ok && forbiddenRelease.error === 'reservation-confirmed', 'une vente payée ne peut jamais être recréditée comme un abandon');

const another = T.sanitize(raw);
T.stockMutation(another, { stockAction: 'reserve', ref: 'sale-c', lines: [{ pid: 'p', size: 'S', color: 'noir', qty: 1, price: 400 }] }, now);
const released = T.stockMutation(another, { stockAction: 'release', ref: 'sale-c' }, now + 2);
ok(released.ok, 'annuler avant paiement libère la réservation');
eq(another.variants[0].stock, 1, 'la pièce annulée redevient vendable');

const stalePrice = T.stockMutation(T.sanitize(raw), {
  stockAction: 'reserve', ref: 'sale-price', lines: [{ pid: 'p', size: 'S', color: 'noir', qty: 1, price: 399 }],
}, now);
ok(!stalePrice.ok && stalePrice.error === 'catalog-stale',
  'une vieille caisse ne peut pas encaisser un ancien prix avant resynchronisation');

const stockedTransparent = T.sanitize({
  v: 2, seq: 1, categories: raw.categories, removed: {}, moves: [],
  products: [{ id: 'pantalon-classe', name: 'Pantalon classe', priceMAD: 150, archived: false, metaAt: now }],
  variants: [{ id: 'variant-tu-transparent', productId: 'pantalon-classe', colorId: 'transparent',
    colorFamily: 'transparent', colorLabel: 'Transparent', colorHex: '#DCDCDC', size: 'TU',
    stock: 276, base: 276, baseAt: now - 10, metaAt: now, barcodes: [] }],
});
const transparentSale = T.stockMutation(stockedTransparent, {
  stockAction: 'reserve', ref: 'sale-transparent',
  lines: [{ pid: 'pantalon-classe', size: 'TU', color: 'transparent', qty: 1, price: 150 }],
}, now);
ok(transparentSale.ok && stockedTransparent.variants[0].stock === 275,
  'une variante Transparent · TU avec 276 unités est réservable et descend exactement à 275');

const api = retailSource(fs.readFileSync(path.join(ROOT, 'functions/api/catalog.js'), 'utf8'));
const pos = retailSource(fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8'));
ok(/UPDATE catalogs SET data = \?, rev = \?, updated_ts = \?[\s\S]*WHERE merchant = \? AND rev = \?/.test(api),
  'le write catalogue est un compare-and-swap atomique');
ok(api.includes('scheduleShopifySync(env, merchant, before, data, next, waitUntil);'),
  'chaque débit de vente accepté programme la quantité finale vers Shopify');
ok(pos.includes('const frozen = {') && pos.includes('lines: frozen.lines.map'),
  'prix, reçu, journal et stock lisent le snapshot immuable du checkout');
ok(pos.includes('state.checkoutBusy = true;\n    beginPay();')
    && !pos.includes('Vérification du stock…')
    && !pos.includes('cat.reserveSale(frozen.syncId, reserveLines)'),
  'aucun aller-retour réseau ne peut bloquer l’ouverture du paiement');
ok(pos.includes('stockCheck: () => ticketStockIssue({ lines: frozen.lines })')
    && pos.includes("persistStock(ln.pid, ln.size, ln.color, -ln.qty, sale.id, 'vente')"),
  'la variante exacte est revérifiée au paiement puis débitée avec la référence du ticket imprimé');
// Les réservations d'un encaissement vivent dans assets/boutique-catalog-parts.js.
const client = ['assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']
  .map((f) => retailSource(fs.readFileSync(path.join(ROOT, f), 'utf8'))).join('\n');
ok(client.includes("reason === 'catalog-missing'") && client.includes("reason === 'unmigrated'"),
  'les réponses explicites sans écriture serveur ne sont pas confondues avec une réservation ambiguë');
ok(/state\.checkoutBusy \|\| \(root && \$\$\('\.modal-veil\.is-open'/.test(pos),
  'la douchette ne peut pas modifier un ticket derrière le paiement');

/* Bornes du document : refus explicite (413), jamais une troncature muette.
 * sanitize() coupait à 200 catégories, 5 000 produits, 20 000 déclinaisons et
 * le serveur répondait « ok » : l'article 5 001 n'atteignait jamais l'autre
 * appareil. */
{
  const f = await fixture(ROOT);
  try {
    const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
    const post = async (data, baseRev = 0) => {
      const res = await catalogPost({ request: new Request('https://kiwi.test/api/catalog', { method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: f.merchant, baseRev, data }) }), env: f.env, waitUntil() {} });
      return { status: res.status, j: await res.json() };
    };
    const doc = (n = {}) => ({ v: 2, seq: 1, removed: {}, moves: [],
      categories: Array.from({ length: n.c || 0 }, (_, i) => ({ id: 'c' + i, name: 'C' + i })),
      products: Array.from({ length: n.p || 0 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, priceMAD: 10 })),
      variants: Array.from({ length: n.v || 0 }, (_, i) => ({ id: 'v' + i, productId: 'p0', colorId: 'noir', size: 'S', stock: 1 })) });
    const rows = () => f.sql.prepare('SELECT COUNT(*) AS n FROM catalogs WHERE merchant = ?').get(f.merchant).n;
    for (const [field, key, max] of [['products', 'p', 5000], ['variants', 'v', 20000], ['categories', 'c', 200]]) {
      const r = await post(doc({ p: 1, [key]: max + 1 }));
      ok(r.status === 413 && r.j.error === 'catalog-too-large' && r.j.field === field && r.j.max === max && r.j.count === max + 1,
        `${max + 1} ${field} : refus 413 explicite (catalog-too-large), pas de troncature — obtenu ${r.status} ${JSON.stringify(r.j).slice(0, 120)}`);
      eq(rows(), 0, `${field} hors borne : rien n'est écrit en ligne`);
    }
    /* Décision wave Q : une quantité fractionnaire est refusée, pas arrondie,
       par le serveur aussi (stock, socle, mouvement). */
    for (const [label, data, field] of [
      ['un stock 1,5', { ...doc({ p: 1 }), variants: [{ id: 'v0', productId: 'p0', colorId: 'noir', size: 'S', stock: 1.5 }] }, 'variants.stock'],
      ['un socle 2,5', { ...doc({ p: 1 }), variants: [{ id: 'v0', productId: 'p0', colorId: 'noir', size: 'S', stock: 2, base: 2.5, baseAt: now }] }, 'variants.base'],
      ['un mouvement de 0,5', { ...doc({ p: 1, v: 1 }), moves: [{ id: 'm1', vid: 'v0', d: -0.5, at: now + 1, why: 'vente' }] }, 'moves.d'],
    ]) {
      const r = await post(data);
      ok(r.status === 422 && r.j.error === 'fractional-quantity' && r.j.field === field,
        `${label} est refusé par le serveur (422 fractional-quantity), jamais arrondi — obtenu ${r.status} ${JSON.stringify(r.j).slice(0, 120)}`);
      eq(rows(), 0, `${label} : rien n'est écrit en ligne`);
    }
    const fracReserve = T.stockMutation(T.sanitize(raw), {
      stockAction: 'reserve', ref: 'sale-frac', lines: [{ pid: 'p', size: 'S', color: 'noir', qty: 0.5, price: 400 }],
    }, now);
    ok(!fracReserve.ok && fracReserve.error === 'fractional-quantity' && fracReserve.status === 400,
      'une réservation de 0,5 pièce est refusée, pas arrondie à 1');
    const atMax = await post(doc({ p: 5000, v: 1, c: 200 }));
    ok(atMax.status === 200 && atMax.j.products === 5000, 'exactement 5 000 produits et 200 catégories passent, entiers');
  } finally { f.close(); }
}

if (!process.exitCode) console.log(`✓ stock boutique transactionnel : ${pass} contrôles`);
