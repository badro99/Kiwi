#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : annulation et remboursement rendent les pièces au stock
 *
 *   node tools/shopify-order-reversal-test.mjs
 *
 * Avant : seuls orders/create, orders/paid, inventory_levels/update et
 * app/uninstalled étaient traités. Une commande annulée ou remboursée dans
 * Shopify laissait le stock Kiwi retiré et le ticket en attente.
 * Vraie base (schema.sql en mémoire), vraie porte de webhooks, HMAC réel.
 * ═══════════════════════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as webhook } from '../functions/api/channel/shopify/[link].js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Shopify · annulations et remboursements (tools/shopify-order-reversal-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(q) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      async first() { const r = sql.prepare(q).get(...args); return r === undefined ? null : r; },
      async all() { return { results: sql.prepare(q).all(...args) }; },
      async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
const env = { DB };
const SECRET = 'cle-factice-de-signature-pour-le-test';
const MERCHANT = 'reversal-shop';
const SHOP = 'reversal-shop.myshopify.com';

sql.prepare("INSERT INTO channel_links (id,merchant,channel,label,hash,config,status,created_ts) VALUES ('chl-rev',?, 'shopify','t','h',?, 'active', ?)")
  .run(MERCHANT, JSON.stringify({ shopifySecret: SECRET, shop: SHOP }), Date.now());
sql.prepare("INSERT INTO shopify_variant_links (merchant,kiwi_variant_id,shopify_variant_id,inventory_item_id,location_id,match_method,status,updated_ts) VALUES (?,?,?,?,?,?,?,?)")
  .run(MERCHANT, 'kv-1', 'gid://shopify/ProductVariant/901', 'gid://shopify/InventoryItem/1', 'gid://shopify/Location/1', 'sku', 'active', Date.now());
const catalog = (stock, baseAt = 1) => JSON.stringify({
  v: 1, seq: 1, categories: [], removed: {}, moves: [],
  products: [{ id: 'kp-1', name: 'Tajine', priceMAD: 100, createdAt: 1 }],
  variants: [{ id: 'kv-1', productId: 'kp-1', colorId: 'default', colorFamily: 'default', size: 'U', stock, base: stock, baseAt, barcodes: [] }],
});
sql.prepare('INSERT INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)').run(MERCHANT, catalog(10), 1, Date.now());

const stockNow = () => {
  const row = sql.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(MERCHANT);
  return JSON.parse(row.data).variants[0].stock;
};
const orderOf = (id) => sql.prepare("SELECT * FROM orders WHERE merchant = ? AND ext_ref = ?").get(MERCHANT, String(id));

let wid = 0;
async function hook(topic, payload, { secret = SECRET, id } = {}) {
  const body = JSON.stringify(payload);
  const res = await webhook({
    env, params: { link: 'chl-rev' },
    request: new Request('https://kiwi.test/api/channel/shopify/chl-rev', {
      method: 'POST',
      headers: {
        'X-Shopify-Hmac-Sha256': crypto.createHmac('sha256', secret).update(body).digest('base64'),
        'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': SHOP,
        'X-Shopify-Webhook-Id': id || ('wh-' + (++wid)),
      },
      body,
    }),
  });
  return { status: res.status, body: await res.json() };
}
const order = (id, qty, over = {}) => ({
  id, currency: 'MAD', total_price: String(100 * qty), created_at: new Date(Date.now() - 60000).toISOString(),
  line_items: [{ id: id * 10 + 1, variant_id: 901, quantity: qty, title: 'Tajine', price: '100.00' }], ...over,
});

/* ── 1 · annulation ────────────────────────────────────────────────────── */
let r = await hook('orders/create', order(1, 3));
ok('la commande 1 est reçue', r.status === 200 && r.body.ok, JSON.stringify(r.body));
ok('…elle retire 3 pièces', stockNow() === 7, String(stockNow()));
ok('…et le ticket attend (pending)', orderOf(1).status === 'pending');

r = await hook('orders/cancelled', order(1, 3), { id: 'cancel-1' });
ok('orders/cancelled est accepté (plus ignoré)', r.status === 200 && r.body.ok && !r.body.ignored, JSON.stringify(r.body));
ok('…les 3 pièces reviennent au stock', stockNow() === 10, String(stockNow()));
ok('…le ticket est annulé par Shopify', orderOf(1).status === 'rejected' && orderOf(1).cancel_actor_name === 'Shopify' && orderOf(1).cancel_ts > 0, JSON.stringify(orderOf(1)));
ok('…et il garde la trace de l\'annulation', JSON.parse(orderOf(1).customer).shopifyState === 'cancelled');

r = await hook('orders/cancelled', order(1, 3), { id: 'cancel-1' });
ok('le même webhook rejoué est un doublon', r.status === 200 && r.body.duplicate === true, JSON.stringify(r.body));
r = await hook('orders/cancelled', order(1, 3));
ok('un nouvel envoi de la même annulation ne rend pas deux fois', r.status === 200 && stockNow() === 10, String(stockNow()));
r = await hook('orders/paid', order(1, 3));
ok('un orders/paid rejoué après l\'annulation ne retire rien de plus', stockNow() === 10, String(stockNow()));
ok('…et ne ressuscite pas le ticket', orderOf(1).status === 'rejected');

/* ── 2 · remboursement partiel puis annulation : plafond partagé ───────── */
await hook('orders/create', order(2, 4));
ok('la commande 2 retire 4 pièces', stockNow() === 6, String(stockNow()));
const refund = (id, orderId, lineId, qty, restock, amount) => ({
  id, order_id: orderId,
  refund_line_items: [{ line_item_id: lineId, quantity: qty, restock_type: restock }],
  transactions: [{ kind: 'refund', status: 'success', amount }],
});
r = await hook('refunds/create', refund(5001, 2, 21, 1, 'return', '100.00'));
ok('refunds/create est accepté', r.status === 200 && r.body.ok && !r.body.ignored, JSON.stringify(r.body));
ok('…la pièce remboursée et remise en rayon revient', stockNow() === 7, String(stockNow()));
let cust = JSON.parse(orderOf(2).customer);
ok('…le ticket est marqué partiellement remboursé', cust.shopifyState === 'partially-refunded' && cust.refunds.length === 1 && cust.refunds[0].amount === 100, JSON.stringify(cust));
ok('…et reste en cours (remboursement partiel)', orderOf(2).status === 'pending');
await hook('refunds/create', refund(5001, 2, 21, 1, 'return', '100.00'));
ok('le même remboursement rejoué ne rend rien de plus', stockNow() === 7 && JSON.parse(orderOf(2).customer).refunds.length === 1, String(stockNow()));
await hook('refunds/create', refund(5002, 2, 21, 1, 'no_restock', '50.00'));
ok('un remboursement « no_restock » ne touche pas au stock', stockNow() === 7, String(stockNow()));
r = await hook('orders/cancelled', order(2, 4));
ok('annuler ensuite ne rend que le reste (4 retirées, 1 déjà rendue)', stockNow() === 10 && r.body.restored === 3, stockNow() + ' ' + JSON.stringify(r.body));
await hook('refunds/create', refund(5003, 2, 21, 4, 'cancel', '0.00'));
ok('un remboursement de plus ne dépasse jamais ce qui a été retiré', stockNow() === 10, String(stockNow()));

/* ── 3 · remboursement total sans remise en rayon ──────────────────────── */
await hook('orders/create', order(3, 1));
ok('la commande 3 retire une pièce', stockNow() === 9);
r = await hook('refunds/create', refund(5010, 3, 31, 1, 'no_restock', '100.00'));
ok('remboursée en totalité sans retour : le stock ne bouge pas', stockNow() === 9, String(stockNow()));
ok('…mais le ticket est clos et marqué remboursé', orderOf(3).status === 'rejected' && JSON.parse(orderOf(3).customer).shopifyState === 'refunded', JSON.stringify(orderOf(3)));

/* ── 4 · un comptage physique postérieur à la vente ───────────────────── */
sql.prepare('UPDATE catalogs SET data = ?, rev = rev + 1 WHERE merchant = ?').run(catalog(9, 1), MERCHANT);
await hook('orders/create', order(4, 1));
ok('la commande 4 retire une pièce', stockNow() === 8, String(stockNow()));
{
  const row = sql.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(MERCHANT);
  const d = JSON.parse(row.data);
  d.variants[0].base = 5; d.variants[0].stock = 5; d.variants[0].baseAt = Date.now() + 1000;   // inventaire fait après la vente
  sql.prepare('UPDATE catalogs SET data = ?, rev = rev + 1 WHERE merchant = ?').run(JSON.stringify(d), MERCHANT);
}
r = await hook('orders/cancelled', order(4, 1));
ok('un comptage plus récent que la vente contient déjà la pièce : rien n\'est rendu', stockNow() === 5 && r.body.restored === 0, stockNow() + ' ' + JSON.stringify(r.body));
ok('…le ticket est tout de même annulé', orderOf(4).status === 'rejected');

/* ── 5 · cas limites ───────────────────────────────────────────────────── */
r = await hook('orders/cancelled', order(999, 1));
ok('une commande inconnue de Kiwi répond 200 (jamais d\'échec que Shopify réessaierait 48 h)', r.status === 200 && r.body.ok, JSON.stringify(r));
r = await hook('refunds/create', { id: 1, order_id: 999, refund_line_items: [] });
ok('un remboursement sur commande inconnue aussi', r.status === 200 && r.body.ok);

r = await hook('orders/cancelled', order(1, 3), { secret: 'une-autre-cle' });
ok('la signature est vérifiée comme pour les autres sujets', r.status === 401 && r.body.error === 'bad-signature', JSON.stringify(r));

/* Annulée avant que le stock d'entrée soit passé : la file ne retire plus rien. */
await hook('orders/create', order(6, 1, { line_items: [{ id: 61, variant_id: 12345, quantity: 1, title: 'Inconnu', price: '100.00' }] }));
ok('une ligne sans lien reste en file d\'attente', sql.prepare("SELECT status FROM shopify_inbound_stock WHERE merchant = ? AND order_ref = '6'").get(MERCHANT).status === 'pending');
await hook('orders/cancelled', order(6, 1));
ok('…l\'annulation la solde, plus aucune pièce ne sera retirée', sql.prepare("SELECT status FROM shopify_inbound_stock WHERE merchant = ? AND order_ref = '6'").get(MERCHANT).status === 'done');

r = await hook('orders/create', order(7, 1, { cancelled_at: new Date().toISOString() }));
ok('une commande déjà annulée à la livraison ne crée ni ticket ni mouvement', r.body.ignored === 'cancelled' && !orderOf(7), JSON.stringify(r.body));

/* ── 6 · abonnements ───────────────────────────────────────────────────── */
const lib = fs.readFileSync(path.join(ROOT, 'functions/api/shopify/_lib.js'), 'utf8');
ok('l\'enregistrement des webhooks abonne aussi ORDERS_CANCELLED et REFUNDS_CREATE',
  /\['ORDERS_CREATE', 'ORDERS_CANCELLED', 'REFUNDS_CREATE', 'INVENTORY_LEVELS_UPDATE', 'APP_UNINSTALLED'\]/.test(lib));
const status = fs.readFileSync(path.join(ROOT, 'functions/api/shopify/status.js'), 'utf8');
ok('une boutique déjà reliée peut enregistrer les nouveaux abonnements (action register-webhooks)', status.includes("action === 'register-webhooks'"));

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ Shopify : annulations et remboursements rendent le stock, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
