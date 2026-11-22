#!/usr/bin/env node
/* Kiwi · Meilleures ventes, l'onglet d'ouverture des caisses boutique et maison
 * (décision propriétaire, 2026-11-21).
 *
 * Tenu ici :
 *   · /api/bestsellers classe par quantité sur 30 jours, par identifiant d'article ;
 *   · ventes annulées, remboursements et ventes de plus de 30 jours n'y entrent pas ;
 *   · un magasin de moins de 7 jours de ventes n'a pas de classement (« Tous » reste) ;
 *   · une caisse ne lit que SON magasin ; la route n'a que GET ; la porte l'ouvre aux caisses ;
 *   · la réponse ne porte ni montant, ni nom, ni ticket ;
 *   · côté caisse : l'onglet s'ouvre sur les meilleures ventes une fois prêtes, garde le
 *     choix de la caissière, retombe sur « Tous » s'il n'y a plus rien à montrer ;
 *   · les deux caisses (boutique et maison) le branchent. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { TILL_COOKIE, TILL_STORE_COOKIE, tillDeviceToken } from '../functions/auth/_lib.js';
import * as route from '../functions/api/bestsellers.js';
import { TILL_PATHS } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const check = (ok, label, detail) => { assert.ok(ok, label + (detail ? ' · ' + detail : '')); n++; console.log('  ✓ ' + label); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now(), DAY = 86400000;
for (const m of ['vieille', 'neuve', 'rival']) {
  sql.prepare('INSERT INTO merchant_config (merchant, features, status, account_id, name, type, updated_ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(m, '{}', 'active', 'acc-' + m, m, 'boutique', now);
}
let k = 0;
const sale = (m, ts, lines, extra = {}) => sql.prepare(
  'INSERT INTO sales (id, merchant, amount, amount_cents, method, ts, lines, channel, void_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
).run('s' + (++k), m, extra.amount ?? 100, (extra.amount ?? 100) * 100, 'cash', ts, typeof lines === 'string' ? lines : JSON.stringify(lines), extra.channel ?? 'counter', extra.void ?? null);
const L = (i, q, t = 100) => ({ n: 'Article ' + i, q, t, i });

sale('vieille', now - 60 * DAY, [L('prod_old', 50)]);                       // première vente, hors fenêtre
sale('vieille', now - 3 * DAY, [L('prod_a', 2), L('prod_b', 5)]);
sale('vieille', now - 2 * DAY, [L('prod_a', 4), L('prod_c', 1)]);
sale('vieille', now - 1 * DAY, [L('prod_c', 9)], { void: now });            // annulée
sale('vieille', now - 1 * DAY, [L('prod_c', 9)], { channel: 'refund', amount: -100 });
sale('vieille', now - 1 * DAY, [{ n: 'Sans id', q: 40, t: 10 }]);         // pas d'identifiant : pas classé
sale('vieille', now - 1 * DAY, 'pas du json');                             // un panier illisible ne casse rien
sale('vieille', now - 1 * DAY, [L('prod_c', 1)], { amount: 0 });          // compte client, encaissé à 0
sale('neuve', now - 3 * DAY, [L('prod_x', 30)]);
sale('rival', now - 20 * DAY, [L('prod_r', 3)]);

const d1 = { prepare(q) { let a = []; return {
  bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return this; },
  async first() { return sql.prepare(q).get(...a) ?? null; },
  async all() { return { results: sql.prepare(q).all(...a) }; },
}; } };
const SECRET = 'bestsellers-fixture-only';
const env = { AUTH_SECRET: SECRET, DB: d1 };
const till = async (m) => `${TILL_COOKIE}=${await tillDeviceToken(SECRET, m, 0, 'term_bestsellers0000001')}; ${TILL_STORE_COOKIE}=${m}`;
async function get(qs, cookie) {
  const request = new Request('https://k.invalid/api/bestsellers?' + qs, { headers: cookie ? { Cookie: cookie } : {} });
  const res = await route.onRequestGet({ request, env });
  return { status: res.status, body: await res.json() };
}

console.log('Qui peut lire');
check((await get('merchant=vieille')).status === 401, 'sans preuve, rien');
check((await get('merchant=vieille', await till('rival'))).status === 401, 'la caisse d’un autre magasin ne lit pas ce classement');
check((await get('merchant=Pas Un Slug', await till('vieille'))).status === 400, 'un slug invalide est refusé');
check(!route.onRequestPost && !route.onRequestPut && !route.onRequestDelete && !route.onRequest, 'la route n’exporte que GET');
check(TILL_PATHS.has('/api/bestsellers'), 'la porte du site l’ouvre aux caisses appairées');

console.log('\nLe classement');
let r = await get('merchant=vieille', await till('vieille'));
check(r.status === 200 && r.body.ready === true, 'un magasin qui vend depuis plus de 7 jours est prêt', JSON.stringify(r.body));
const ids = r.body.items.map((x) => x.i + ':' + x.q).join(' ');
check(ids === 'prod_a:6 prod_b:5 prod_c:2', 'par quantité sur 30 jours : annulée, remboursement, hors fenêtre et lignes sans id écartés ; la vente à 0 compte', ids);
check(!/"t"|"n"|Article|amount|ticket/.test(JSON.stringify(r.body.items)), 'ni montant, ni nom, ni ticket dans la réponse');
r = await get('merchant=neuve', await till('neuve'));
check(r.status === 200 && r.body.ready === false && r.body.items.length === 0, 'un magasin de moins d’une semaine n’a pas de classement : « Tous » reste', JSON.stringify(r.body));
check(route.shape(0, [], now).ready === false, 'un magasin sans aucune vente n’est pas prêt');
check(route.shape(now - 7 * DAY, [], now).ready === true && route.shape(now - 7 * DAY + 1000, [], now).ready === false, 'prêt à 7 jours pleins, pas une seconde avant');

console.log('\nLa caisse');
const store = {};
globalThis.localStorage = { getItem: (key) => (key in store ? store[key] : null), setItem: (key, v) => { store[key] = String(v); } };
let served = { ok: true, ready: true, items: [{ i: 'p2', q: 9 }, { i: 'gone', q: 8 }, { i: 'p3', q: 7 }, { i: 'p1', q: 1 }] }, calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, json: async () => served }; };
const mod = await import('../assets/retail-bestsellers.js');
const RAY = [{ id: 'r1', items: [{ id: 'p1' }, { id: 'p2' }] }, { id: 'r2', items: [{ id: 'p3', out: true }] }];
check(mod.bestItems('shop', RAY) === null, 'au premier dessin, sans classement en mémoire, rien ne change');
let redrawn = 0;
mod.bestItems('shop', RAY, null, () => redrawn++);
await new Promise((res) => setTimeout(res, 10));
check(calls === 1 && redrawn === 0, 'un seul appel en vol à la fois');
await new Promise((res) => setTimeout(res, 10));
const got = mod.bestItems('shop', RAY, (p) => !p.out);
check(got && got.map((p) => p.id).join() === 'p2,p1', 'dans l’ordre du classement, pris dans le catalogue du jour, sans l’épuisé ni l’article supprimé', got && got.map((p) => p.id).join());
check(JSON.parse(store['kiwiBestsellers@shop']).ids[0] === 'p2', 'gardé par magasin pour le prochain chargement');
check(calls === 1, 'relu au plus toutes les 30 minutes, pas à chaque dessin');
const state = { rayon: 'tous' };
mod.bestOpen(state, 'shop', got);
check(state.rayon === '_best', 'l’ouverture se fait sur « Meilleures ventes » une fois le classement prêt');
mod.bestOpen(state, 'shop', null);
check(state.rayon === 'tous', 'plus rien à montrer : retour sur « Tous », jamais une grille vide sans onglet');
mod.bestTouched('shop');
mod.bestOpen(state, 'shop', got);
check(state.rayon === 'tous', 'la caissière a choisi « Tous » : son choix reste le sien');
const other = { rayon: 'r2' };
mod.bestOpen(other, 'autre', got);
check(other.rayon === 'r2', 'un rayon choisi n’est jamais remplacé');
served = { ok: true, ready: false, items: [] };
check(mod.bestItems('neuve', RAY) === null, 'un magasin pas encore prêt garde « Tous »');
check(mod.bestItems('', RAY) === null, 'hors d’un vrai magasin, rien');

console.log('\nBranché sur les deux caisses');
for (const f of ['assets/pos-boutique/sales.js', 'assets/pos-maison/sales.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(/from '\.\.\/retail-bestsellers\.js\?v=\d+'/.test(src) && /data-(bq|mz)-cat="_best"/.test(src) && /bestOpen\(state/.test(src) && /bestTouched\(/.test(src),
    f + ' : onglet, ouverture et choix de la caissière');
}
const lang = fs.readFileSync(path.join(ROOT, 'assets/caisse-lang.js'), 'utf8');
check(/'Meilleures ventes': 'Best sellers'/.test(lang) && /'Meilleures ventes': '[^']*[؀-ۿ]/.test(lang), 'traduit en anglais et en arabe');

console.log(`\n${n} checks green.`);
