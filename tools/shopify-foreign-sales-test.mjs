#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify hors Maroc : une commande payée entre dans les ventes
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, boutique Startoner en Espagne) : « when
 * an order comes thru, we'll see it here? ». La porte des webhooks refusait
 * toute devise autre que le dirham et rangeait les commandes en tickets
 * « pending » qu'aucune caisse boutique ne règle (42 chez Maison 121, jamais
 * entrés dans le chiffre). Pour un commerce hors Maroc, une commande Shopify
 * PAYÉE devient une vente, dans la devise du pays, sous le même id que la
 * reprise d'historique (shp:<commerce>:<numéro>) : rien ne double. Annulation
 * et remboursement y ajoutent une contre-écriture négative, plafonnée.
 * Le chemin marocain ne change pas.
 * ═══════════════════════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as webhook } from '../functions/api/channel/shopify/[link].js';
import { encryptToken } from '../functions/api/shopify/_lib.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' · ' + detail : ''));
}
console.log('■ Shopify hors Maroc · ventes (tools/shopify-foreign-sales-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
sql.prepare("INSERT INTO merchant_config (merchant,features,name,status,updated_ts,country) VALUES ('es-shop','{}','ES Shop','active',?,'ES')").run(now);
sql.prepare("INSERT INTO merchant_config (merchant,features,name,status,updated_ts) VALUES ('ma-shop','{}','MA Shop','active',?)").run(now);
sql.prepare("INSERT INTO channel_links (id,merchant,channel,label,hash,config,status,created_ts) VALUES ('chl-es','es-shop','shopify','es','h',?,'active',?)").run(JSON.stringify({ oauth: true, shop: 'es-shop.myshopify.com' }), now);
sql.prepare("INSERT INTO channel_links (id,merchant,channel,label,hash,config,status,created_ts) VALUES ('chl-ma','ma-shop','shopify','ma','h',?,'active',?)").run(JSON.stringify({ oauth: true, shop: 'ma-shop.myshopify.com' }), now);

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
const APP_SECRET = 'cle-factice-de-lapp-pour-le-test-seulement';
const env = {
  DB, AUTH_SECRET: 'shopify-foreign-auth-secret-32-bytes!',
  SHOPIFY_CLIENT_ID: 'id-factice', SHOPIFY_CLIENT_SECRET: APP_SECRET,
  SHOPIFY_TOKEN_KEY: 'cle-de-chiffrement-factice-de-plus-de-24-caracteres',
};
sql.prepare(`INSERT INTO shopify_connections (merchant, shop_domain, access_token_enc, refresh_token_enc, token_expires_ts, refresh_expires_ts, scopes, location_id, location_name, channel_link_id, status, connected_ts, updated_ts, last_sync_ts, last_error)
  VALUES ('es-shop','es-shop.myshopify.com',?,NULL,?,0,'read_orders','','','chl-es','needs_location',?,?,0,'')`)
  .run(await encryptToken('jeton-factice', env.SHOPIFY_TOKEN_KEY), now + 86400e3, now, now);

/* Shopify simulé : la seule question posée est « quel est le numéro de la commande N ». */
const NAMES = { 'gid://shopify/Order/5003': '#1074' };
globalThis.fetch = async (url, init) => {
  const body = JSON.parse((init && init.body) || '{}');
  const id = body.variables && body.variables.id;
  return new Response(JSON.stringify({ data: { order: NAMES[id] ? { name: NAMES[id] } : null } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

let delivery = 0;
async function hook(link, topic, payload, shop) {
  const raw = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', APP_SECRET).update(raw).digest('base64');
  const res = await webhook({
    env, params: { link },
    request: new Request('https://kiwi.test/api/channel/shopify/' + link, {
      method: 'POST', body: raw,
      headers: {
        'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Topic': topic,
        'X-Shopify-Shop-Domain': shop || (link === 'chl-es' ? 'es-shop.myshopify.com' : 'ma-shop.myshopify.com'),
        'X-Shopify-Webhook-Id': 'wh-' + (++delivery),
      },
    }),
  });
  let json = {};
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
const order = (over) => ({
  id: 5001, name: '#1073', currency: 'EUR', total_price: '32.88', financial_status: 'paid',
  created_at: '2026-11-24T10:15:00+01:00', processed_at: '2026-11-24T10:15:00+01:00',
  payment_gateway_names: ['paypal'],
  line_items: [
    { id: 11, title: 'Toner HP 85A', variant_title: 'Negro', quantity: 2, price: '12.00', discount_allocations: [{ amount: '2.00' }] },
    { id: 12, title: 'Papel A4', variant_title: 'Default Title', quantity: 1, price: '10.88', discount_allocations: [] },
  ],
  ...over,
});
const sale = (id) => sql.prepare('SELECT * FROM sales WHERE merchant = ? AND id = ?').get('es-shop', id);
const count = (where, ...a) => sql.prepare('SELECT COUNT(*) n FROM sales WHERE ' + where).get(...a).n;

/* 1 · une commande payée en euros devient une vente */
let r = await hook('chl-es', 'orders/create', order());
ok('commande payée en euros acceptée (200)', r.status === 200, r.status + ' ' + JSON.stringify(r.json));
let s = sale('shp:es-shop:1073');
ok('la vente porte l\'id de la reprise d\'historique', !!s, JSON.stringify(sql.prepare('SELECT id FROM sales').all()));
ok('montant en centimes, sans arrondi', s && s.amount_cents === 3288 && s.amount === 33, s && `${s.amount_cents}/${s.amount}`);
ok('PayPal compte comme portefeuille', s && s.method === 'wallet', s && s.method);
ok('canal shopify, libellé et référence comme la reprise', s && s.channel === 'shopify' && s.label === 'Shopify 1073' && s.ref === '1073', s && `${s.channel}|${s.label}|${s.ref}`);
ok('l\'heure est celle de la commande, pas de la réception', s && s.ts === Date.parse('2026-11-24T10:15:00+01:00'));
const lines = s ? JSON.parse(s.lines) : [];
ok('lignes : article · variante, remise déduite', lines.length === 2 && lines[0].n === 'Toner HP 85A · Negro' && lines[0].q === 2 && lines[0].t === 22 && lines[1].n === 'Papel A4' && lines[1].t === 10.88, JSON.stringify(lines));
ok('aucun ticket en attente pour un commerce hors Maroc', sql.prepare("SELECT COUNT(*) n FROM orders WHERE merchant = 'es-shop'").get().n === 0);

/* 2 · un renvoi (orders/paid après orders/create) n'ajoute rien */
r = await hook('chl-es', 'orders/paid', order());
ok('le renvoi répond 200', r.status === 200, r.status + ' ' + JSON.stringify(r.json));
ok('une seule vente pour la commande', count("merchant = 'es-shop' AND id LIKE 'shp:es-shop:1073%'") === 1);

/* 3 · une commande déjà reprise par l'import n'est pas réécrite */
sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, received_ts, written_by)
  VALUES ('shp:es-shop:1072','es-shop',33,3300,'card','Shopify 1072','1072',?, '[]','shopify',?,'import:shopify')`).run(now - 86400e3, now);
r = await hook('chl-es', 'orders/create', order({ id: 5000, name: '#1072', total_price: '99.00' }));
s = sale('shp:es-shop:1072');
ok('la vente importée garde son montant et son auteur', r.status === 200 && s.amount_cents === 3300 && s.written_by === 'import:shopify', JSON.stringify(s));

/* 4 · commande pas encore payée : rien, puis orders/paid la fait entrer */
r = await hook('chl-es', 'orders/create', order({ id: 5003, name: '#1074', total_price: '50.00', financial_status: 'pending', payment_gateway_names: ['manual'] }));
ok('commande en attente de paiement : 200 sans vente', r.status === 200 && !sale('shp:es-shop:1074'), r.status + ' ' + JSON.stringify(r.json));
r = await hook('chl-es', 'orders/paid', order({ id: 5003, name: '#1074', total_price: '50.00', financial_status: 'paid', payment_gateway_names: ['manual'] }));
s = sale('shp:es-shop:1074');
ok('payée ensuite : la vente entre', r.status === 200 && s && s.amount_cents === 5000, r.status + ' ' + JSON.stringify(r.json));
ok('paiement manuel compte comme virement', s && s.method === 'transfer', s && s.method);

/* 5 · une devise qui n'est pas celle du pays est refusée */
r = await hook('chl-es', 'orders/create', order({ id: 5009, name: '#1079', currency: 'USD' }));
ok('dollars chez un commerce espagnol : anomalie visible, aucune vente', r.status === 200 && r.json.issue === 'unsupported-currency' && !sale('shp:es-shop:1079'), r.status + ' ' + JSON.stringify(r.json));

/* 6 · annulation : contre-écriture négative, une seule fois */
r = await hook('chl-es', 'orders/cancelled', order({ cancelled_at: '2026-11-24T12:00:00+01:00' }));
ok('annulation acceptée', r.status === 200, r.status + ' ' + JSON.stringify(r.json));
let back = sale('shp:es-shop:1073:cancel');
ok('une contre-écriture de −32,88 € entre au canal refund', back && back.amount_cents === -3288 && back.channel === 'refund', JSON.stringify(back));
ok('la vente d\'origine reste intacte', sale('shp:es-shop:1073').amount_cents === 3288);
ok('l\'audit relie le retour à la vente', sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE merchant='es-shop' AND sale_id='shp:es-shop:1073' AND action='refund' AND amount_cents=-3288").get().n === 1);
r = await hook('chl-es', 'refunds/create', { id: 901, order_id: 5001, transactions: [{ kind: 'refund', status: 'success', amount: '32.88' }] });
const totalBack = sql.prepare("SELECT COALESCE(SUM(amount_cents),0) s FROM sales WHERE merchant='es-shop' AND id LIKE 'shp:es-shop:1073:%'").get().s;
ok('le remboursement qui suit l\'annulation ne reprend rien de plus', totalBack === -3288, String(totalBack));

/* 7 · remboursement partiel, retrouvé par l'id de commande */
r = await hook('chl-es', 'refunds/create', { id: 902, order_id: 5003, transactions: [{ kind: 'refund', status: 'success', amount: '20.00' }, { kind: 'refund', status: 'failure', amount: '30.00' }] });
back = sale('shp:es-shop:1074:rf902');
ok('remboursement partiel de 20 € (la transaction échouée ignorée)', r.status === 200 && back && back.amount_cents === -2000, r.status + ' ' + JSON.stringify(back));
r = await hook('chl-es', 'refunds/create', { id: 903, order_id: 5003, transactions: [{ kind: 'refund', status: 'success', amount: '45.00' }] });
const left = sql.prepare("SELECT COALESCE(SUM(amount_cents),0) s FROM sales WHERE merchant='es-shop' AND id LIKE 'shp:es-shop:1074%'").get().s;
ok('un remboursement trop gros est plafonné au reste', left === 0, String(left));

/* 8 · Maroc : rien ne change */
r = await hook('chl-ma', 'orders/create', order({ id: 7001, name: '#2001' }));
ok('commerce marocain : les euros restent refusés', r.status === 200 && r.json.issue === 'unsupported-currency', r.status + ' ' + JSON.stringify(r.json));
r = await hook('chl-ma', 'orders/create', order({ id: 7002, name: '#2002', currency: 'MAD', total_price: '240.00' }));
ok('commerce marocain : la commande en dirhams devient un ticket en attente', r.status === 200 && sql.prepare("SELECT COUNT(*) n FROM orders WHERE merchant='ma-shop' AND status='pending'").get().n === 1, r.status + ' ' + JSON.stringify(r.json));
ok('commerce marocain : aucune vente écrite par le webhook', count("merchant = 'ma-shop'") === 0);

/* 9 · les nouvelles connexions s'abonnent aussi à orders/paid */
const lib = fs.readFileSync(path.join(ROOT, 'functions/api/shopify/_lib.js'), 'utf8');
ok('ORDERS_PAID fait partie des abonnements', /'ORDERS_PAID'/.test(lib));

if (failures) { console.log(`\n  ${failures} échec(s)`); process.exit(1); }
console.log('\n  tout est vert');
