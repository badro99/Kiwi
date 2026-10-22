#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : les commandes en ligne jamais reçues sont rattrapées
 *
 * Maison 121 refusait ses webhooks depuis le 6 septembre (domaine permanent) :
 * les ventes en ligne ont baissé le stock Shopify, jamais le stock Kiwi.
 * L'action « replay-orders » relit les commandes chez Shopify et retire chaque
 * pièce une seule fois, datée de la commande ; une variante comptée après la
 * commande est sautée ; une variante ne passe jamais sous zéro (la pièce déjà
 * sortie de Kiwi n'est pas retirée deux fois) ; dryRun ne touche à rien.
 * ═══════════════════════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as connectDirect } from '../functions/api/shopify/connect-direct.js';
import { onRequestPost as status } from '../functions/api/shopify/status.js';
import { planReplay } from '../functions/api/shopify/_replay-orders.js';
import { __test as catalogFns } from '../functions/api/catalog.js';
const catalogMaterialize = catalogFns.materialize;

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Shopify · commandes en ligne rattrapées (tools/shopify-replay-orders-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
sql.exec(raw);
sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-rp','rp@t.ma','S','Maison Test','00','00',?)").run(Date.now());
sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES ('maison-test','{}','acc-rp','Maison Test','active',?)").run(Date.now());
const DB = {
  prepare(q) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(q).get(...args); return r === undefined ? null : r; },
      all() { return { results: sql.prepare(q).all(...args) }; },
      run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
/* Valeurs factices, volontairement sans la forme d'une vraie clé Shopify. */
const APP_SECRET = 'cle-factice-de-lapp-pour-le-test-seulement';
const env = {
  DB, AUTH_SECRET: 'shopify-direct-auth-secret-32-bytes!!',
  SHOPIFY_CLIENT_ID: 'id-factice', SHOPIFY_CLIENT_SECRET: APP_SECRET,
  SHOPIFY_TOKEN_KEY: 'cle-de-chiffrement-factice-de-plus-de-24-caracteres',
};

const T0 = Date.parse('2026-09-10T10:00:00Z');
const orders = [
  { id: 'gid://shopify/Order/5001', name: '#1001', createdAt: new Date(T0).toISOString(), cancelledAt: null, test: false,
    lineItems: { nodes: [
      { id: 'gid://shopify/LineItem/9001', currentQuantity: 2, variant: { id: 'gid://shopify/ProductVariant/701' } },
      { id: 'gid://shopify/LineItem/9002', currentQuantity: 1, variant: { id: 'gid://shopify/ProductVariant/799' } },
    ] } },
  { id: 'gid://shopify/Order/5002', name: '#1002', createdAt: new Date(T0 + 86400000).toISOString(), cancelledAt: null, test: false,
    lineItems: { nodes: [
      { id: 'gid://shopify/LineItem/9003', currentQuantity: 1, variant: { id: 'gid://shopify/ProductVariant/702' } },
      { id: 'gid://shopify/LineItem/9004', currentQuantity: 0, variant: { id: 'gid://shopify/ProductVariant/701' } },
    ] } },
  { id: 'gid://shopify/Order/5003', name: '#1003', createdAt: new Date(T0 + 2 * 86400000).toISOString(), cancelledAt: new Date().toISOString(), test: false,
    lineItems: { nodes: [{ id: 'gid://shopify/LineItem/9005', currentQuantity: 3, variant: { id: 'gid://shopify/ProductVariant/701' } }] } },
];
let orderCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.endsWith('/admin/oauth/access_token')) {
    return new Response(JSON.stringify({ access_token: 'jeton-factice', scope: 'read_orders', expires_in: 86400 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const q = String((init && init.body) || '');
  if (q.includes('KiwiMissedOrders')) {
    orderCalls++;
    return new Response(JSON.stringify({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: 'c:' + (orders.length - 1) }, nodes: orders, edges: orders.map((node, i) => ({ cursor: 'c:' + i, node })) } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (q.includes('myshopifyDomain')) return new Response(JSON.stringify({ data: { shop: { myshopifyDomain: 'maison-test.myshopify.com' } } }), { status: 200 });
  return new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { userErrors: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

try {
  const cookie = `${SESS_COOKIE}=${await makeSession('acc-rp', env.AUTH_SECRET)}`;
  const res = await connectDirect({
    env,
    request: new Request('https://kiwi.test/api/shopify/connect-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ merchant: 'maison-test', shop: 'maison-test.myshopify.com' }),
    }),
  });
  ok('la boutique est reliée', res.status === 200);
  sql.prepare("UPDATE shopify_connections SET connected_ts = ?, location_id = 'gid://shopify/Location/1', status = 'active' WHERE merchant = 'maison-test'").run(T0 - 86400000);
  const link = (kiwi, shop, st = 'drift') => sql.prepare(`INSERT INTO shopify_variant_links (merchant,kiwi_variant_id,shopify_variant_id,inventory_item_id,location_id,match_method,last_shopify_quantity,status,updated_ts)
    VALUES ('maison-test', ?, ?, ?, 'gid://shopify/Location/1', 'barcode', 0, ?, ?)`).run(kiwi, shop, 'gid://shopify/InventoryItem/' + kiwi, st, Date.now());
  link('v-a', 'gid://shopify/ProductVariant/701');
  link('v-b', 'gid://shopify/ProductVariant/702');
  /* v-a : 10 pièces comptées avant les commandes. v-b : comptée APRÈS la commande #1002. */
  const catalog = { products: [{ id: 'p1', name: 'Coussin' }], variants: [
    { id: 'v-a', productId: 'p1', size: 'TU', stock: 10, base: 10, baseAt: T0 - 3600000 },
    { id: 'v-b', productId: 'p1', size: 'TU', stock: 4, base: 4, baseAt: T0 + 2 * 86400000 },
  ], moves: [] };
  sql.prepare("INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES ('maison-test', ?, 1, ?)").run(JSON.stringify(catalog), Date.now());
  const stockOf = (vid) => {
    const d = JSON.parse(sql.prepare("SELECT data FROM catalogs WHERE merchant = 'maison-test'").get().data);
    const v = d.variants.find((x) => x.id === vid);
    const moves = (d.moves || []).filter((m) => m.vid === vid && m.at > (v.baseAt || 0));
    return { stock: v.base + moves.reduce((n, m) => n + m.d, 0), moves: (d.moves || []).filter((m) => m.vid === vid) };
  };
  const call = async (extra) => {
    const r = await status({ env, request: new Request('https://kiwi.test/api/shopify/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(Object.assign({ merchant: 'maison-test', action: 'replay-orders' }, extra || {})),
    }) });
    return { status: r.status, body: await r.json() };
  };

  const dry = await call({ dryRun: true });
  const r = dry.body.result || {};
  ok('l\'aperçu lit les commandes depuis la connexion', dry.status === 200 && r.orders === 2 && r.skippedOrders === 1, JSON.stringify(dry.body));
  ok('… il annonce 2 pièces sur 1 ligne, 1 déjà comptée, 1 sans correspondance', r.pieces === 2 && r.lines === 1 && r.counted === 1 && r.unmatched === 1, JSON.stringify(r));
  ok('… et n\'écrit rien', stockOf('v-a').stock === 10 && !stockOf('v-a').moves.length);

  const real = await call();
  ok('le rattrapage retire les 2 pièces vendues en ligne', real.status === 200 && real.body.result.applied === 1 && stockOf('v-a').stock === 8, JSON.stringify(real.body));
  const mv = stockOf('v-a').moves[0];
  ok('le mouvement est daté de la commande et porte l\'identifiant du webhook', mv && mv.at === T0 && mv.id === 'so-5001-9001' && mv.why === 'vente', JSON.stringify(mv));
  ok('la variante comptée après la commande garde son chiffre', stockOf('v-b').stock === 4 && !stockOf('v-b').moves.length);
  ok('une commande annulée et une ligne rendue (quantité 0) ne retirent rien', stockOf('v-a').moves.length === 1);
  const twice = await call();
  ok('rejouer ne retire jamais deux fois', twice.status === 200 && twice.body.result.applied === 0 && twice.body.result.already === 1 && stockOf('v-a').stock === 8, JSON.stringify(twice.body.result));
  const before = orderCalls;
  const outsider = await status({ env, request: new Request('https://kiwi.test/api/shopify/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: 'maison-test', action: 'replay-orders' }),
  }) });
  ok('sans session du commerce, rien n\'est lu ni écrit', outsider.status === 401 && orderCalls === before);

  /* Le même identifiant que le webhook : une commande reçue par webhook puis rejouée ne compte qu'une fois. */
  const plan = planReplay({ variants: [{ id: 'v-a', baseAt: 0 }], moves: [{ id: 'so-5001-9001', vid: 'v-a', d: -2, at: T0 }] },
    new Map([['gid://shopify/ProductVariant/701', 'v-a']]), orders.slice(0, 1));
  ok('une commande déjà reçue par webhook n\'est pas rejouée', plan.apply.length === 0 && plan.already === 1);

  /* Vu sur Maison 121 le 21 octobre : 16 variantes déjà à 0 chez Kiwi avaient une
     commande en ligne. La pièce était sortie (caisse ou correction) : on ne la
     retire pas une deuxième fois, et le stock ne passe jamais sous zéro. */
  const mk = (id, line, vid, qty, at) => ({ id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: new Date(at).toISOString(),
    cancelledAt: null, test: false, lineItems: { nodes: [{ id: `gid://shopify/LineItem/${line}`, currentQuantity: qty, variant: { id: `gid://shopify/ProductVariant/${vid}` } }] } });
  const links2 = new Map([['gid://shopify/ProductVariant/801', 'v-zero'], ['gid://shopify/ProductVariant/802', 'v-one']]);
  const cat2 = () => ({ variants: [{ id: 'v-zero', base: 0, baseAt: 0, stock: 0 }, { id: 'v-one', base: 1, baseAt: 0, stock: 1 }], moves: [] });
  const zero = planReplay(cat2(), links2, [mk(6001, 9101, 801, 1, T0 + 1000)]);
  ok('une variante déjà à 0 chez Kiwi n\'est pas retirée encore, la pièce est dite déjà sortie',
    zero.apply.length === 0 && zero.pieces === 0 && zero.short === 1 && zero.shortLines === 1, JSON.stringify(zero));
  const partial = planReplay(cat2(), links2, [mk(6002, 9102, 802, 3, T0 + 1000)]);
  ok('une commande de 3 sur un stock de 1 n\'en retire qu\'une',
    partial.apply.length === 1 && partial.apply[0].qty === 1 && partial.pieces === 1 && partial.short === 2, JSON.stringify(partial));
  const seq = planReplay(cat2(), links2, [mk(6003, 9103, 802, 1, T0 + 1000), mk(6004, 9104, 802, 1, T0 + 2000)]);
  ok('deux commandes sur la dernière pièce : la plus ancienne la retire, la seconde est déjà sortie',
    seq.apply.length === 1 && seq.apply[0].order === '#6003' && seq.short === 1, JSON.stringify(seq));
  const neg = cat2(); neg.moves.push({ id: 'x', vid: 'v-one', d: -1, at: T0, why: 'vente' });
  catalogMaterialize(neg);
  const afterSale = planReplay(neg, links2, [mk(6005, 9105, 802, 1, T0 + 1000)]);
  ok('le stock lu est celui que Kiwi montre après ses ventes, pas la base de l\'inventaire',
    afterSale.apply.length === 0 && afterSale.short === 1, JSON.stringify(afterSale));
} finally {
  globalThis.fetch = realFetch;
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ Shopify : les commandes en ligne manquées sont rattrapées, une fois, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
