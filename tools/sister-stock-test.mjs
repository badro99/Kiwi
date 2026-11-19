#!/usr/bin/env node
/* Kiwi · /api/sister-stock — le stock d'une autre boutique du même propriétaire,
 * en lecture seule, depuis la caisse (Santos Rabat ⇄ Casablanca, 2026-11-19).
 *
 * Tenu ici :
 *   · rien sans le catalogue partagé de la console (features.sharedCatalog) sur chaque boutique ;
 *   · jamais une boutique d'un autre propriétaire, même liée de son côté ;
 *   · une caisse ne parle que pour SA boutique (preuve contre le slug demandé) ;
 *   · une boutique suspendue disparaît de la liste ;
 *   · la réponse ne porte ni coût, ni déposant, ni journal ; le stock est matérialisé ;
 *   · la route n'a QUE GET : aucune écriture n'existe ;
 *   · la porte du site l'ouvre aux caisses, /api/stock/lookup reste fermé. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { TILL_COOKIE, TILL_STORE_COOKIE, tillDeviceToken } from '../functions/auth/_lib.js';
import * as route from '../functions/api/sister-stock.js';
import { TILL_PATHS } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const check = (ok, label, detail) => { assert.ok(ok, label + (detail ? ' · ' + detail : '')); n++; console.log('  ✓ ' + label); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
const store = (m, name, aid, features, status = 'active') => sql.prepare(
  'INSERT INTO merchant_config (merchant, features, status, account_id, name, type, updated_ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(m, JSON.stringify(features), status, aid, name, 'boutique', now);
store('santos-rabat', 'Santos Store', 'acc-santos', { sharedCatalog: true });
store('santos-casa', 'Santos Store Casablanca', 'acc-santos', { sharedCatalog: true }, 'pending');
store('santos-tanger', 'Santos Store Tanger', 'acc-santos', {});                      // pas liée
store('santos-fes', 'Santos Store Fès', 'acc-santos', { sharedCatalog: true }, 'suspended');
store('rival', 'Rival', 'acc-rival', { sharedCatalog: true });                          // autre propriétaire
sql.prepare('INSERT INTO merchant_config (merchant, features, status, account_id, name, type, updated_ts) VALUES (?, ?, ?, ?, ?, ?, ?)').run('santos-cafe', JSON.stringify({ sharedCatalog: true }), 'active', 'acc-santos', 'Santos Café', 'cafe', now);   // même propriétaire, autre métier
store('solo', 'Solo', 'acc-solo', {});

const cat = {
  v: 1,
  categories: [{ id: 'c1', name: 'Chemises' }],
  products: [
    { id: 'p1', name: 'Chemise lin', categoryId: 'c1', priceMAD: 249, cost: 90, consignor: 'Fournisseur X', sku: 'CHM-1' },
    { id: 'p2', name: 'Ancien modèle', priceMAD: 100, cost: 40, archived: true },
  ],
  variants: [
    { id: 'v1', productId: 'p1', size: 'M', colorLabel: 'Bleu', colorHex: '#2244aa', base: 5, baseAt: 1000, barcodes: [{ code: '6111234567890', primary: true }] },
    { id: 'v2', productId: 'p1', size: 'L', colorLabel: 'Bleu', base: 0, baseAt: 1000, barcodes: [] },
    { id: 'v3', productId: 'p2', size: 'U', base: 9, baseAt: 1000, barcodes: [] },
  ],
  moves: [{ id: 'm1', vid: 'v1', d: -2, at: 2000, why: 'sale' }],
};
sql.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run('santos-casa', JSON.stringify(cat), now);
sql.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run('rival', JSON.stringify(cat), now);

const d1 = { prepare(q) { let a = []; return {
  bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return this; },
  async first() { return sql.prepare(q).get(...a) ?? null; },
  async all() { return { results: sql.prepare(q).all(...a) }; },
  async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
const SECRET = 'sister-stock-fixture-only';
const env = { AUTH_SECRET: SECRET, DB: d1 };
const DEVICE = 'term_sisterstock00000001';
const till = async (m) => `${TILL_COOKIE}=${await tillDeviceToken(SECRET, m, 0, DEVICE)}; ${TILL_STORE_COOKIE}=${m}`;
async function get(qs, cookie) {
  const request = new Request('https://k.invalid/api/sister-stock?' + qs, { headers: cookie ? { Cookie: cookie } : {} });
  const res = await route.onRequestGet({ request, env });
  return { status: res.status, body: await res.json() };
}

console.log('Qui peut lire');
const rabat = await till('santos-rabat');
check((await get('merchant=santos-rabat')).status === 401, 'sans preuve, rien');
check((await get('merchant=santos-rabat', await till('rival'))).status === 401, 'la caisse d’une autre boutique ne parle pas pour Rabat');
check((await get('merchant=santos-casa&store=santos-rabat', rabat)).status === 401, 'la caisse de Rabat ne se fait pas passer pour Casablanca');

console.log('\nLes boutiques liées');
let r = await get('merchant=santos-rabat', rabat);
check(r.status === 200 && r.body.self.name === 'Santos Store', 'la caisse de Rabat reçoit sa liste', JSON.stringify(r.body));
const slugs = r.body.stores.map((s) => s.merchant);
check(slugs.join() === 'santos-casa', 'seule Casablanca : ni Tanger (non liée), ni Fès (suspendue), ni le café (autre métier), ni le concurrent', slugs.join());
check((await get('merchant=santos-tanger', await till('santos-tanger'))).body.stores.length === 0, 'une boutique non liée ne voit aucune sœur');
check((await get('merchant=solo', await till('solo'))).body.stores.length === 0, 'un compte d’une seule boutique ne voit rien changer');
check((await get('merchant=santos-rabat&store=santos-tanger', rabat)).status === 403, 'demander une boutique non liée est refusé');
check((await get('merchant=santos-rabat&store=rival', rabat)).status === 403, 'demander le concurrent est refusé');
check((await get('merchant=santos-rabat&store=santos-fes', rabat)).status === 403, 'demander une boutique suspendue est refusé');

console.log('\nCe que la réponse porte');
r = await get('merchant=santos-rabat&store=santos-casa', rabat);
check(r.status === 200 && r.body.known === true, 'l’inventaire de Casablanca est lu', JSON.stringify(r.body).slice(0, 200));
check(r.body.products.length === 1 && r.body.products[0].name === 'Chemise lin' && r.body.products[0].category === 'Chemises', 'les articles archivés restent dehors, le rayon est nommé');
const v1 = r.body.variants.find((v) => v.size === 'M');
check(v1 && v1.stock === 3 && v1.color === 'Bleu' && v1.codes[0] === '6111234567890', 'le stock est matérialisé (5 − 1 vente de 2 = 3) et le code-barres suit');
const raw = JSON.stringify(r.body);
check(!/cost|consignor|Fournisseur|"moves"|"base"/.test(raw), 'ni coût, ni déposant, ni journal, ni socle');
check(typeof r.body.read_ts === 'number', 'l’heure de lecture est donnée, pour « Relu il y a … »');
r = await get('merchant=santos-casa&store=santos-rabat', await till('santos-casa'));
check(r.status === 200 && r.body.known === false && r.body.products.length === 0, 'une sœur sans inventaire en base répond « inconnu », pas « zéro »');

console.log('\nLecture seule');
check(!route.onRequestPost && !route.onRequestPut && !route.onRequestPatch && !route.onRequestDelete && !route.onRequest, 'la route n’exporte que GET');
check(TILL_PATHS.has('/api/sister-stock'), 'la porte du site l’ouvre aux caisses appairées');
check(!TILL_PATHS.has('/api/stock/lookup'), 'et garde /api/stock/lookup fermé aux caisses');

const ui = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/sister-stock.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check(!/localStorage|sessionStorage|catDB|KiwiPosSale|method:\s*'(POST|PUT|DELETE)'/.test(ui), 'le module de la caisse ne touche ni au catalogue local, ni au stockage, ni à la vente, et n’écrit rien');

console.log(`\n${n} checks passed`);
