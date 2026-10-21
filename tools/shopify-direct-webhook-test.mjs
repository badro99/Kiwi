#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify « don d'identifiants » : les webhooks se vérifient
 *
 * Avant : connect-direct.js rangeait la ligne du canal avec
 * `{ oauth:false, grant:'client_credentials' }`, et la porte des webhooks
 * (channel/shopify/[link].js) ne cherchait la clé de signature que dans
 * `env.SHOPIFY_CLIENT_SECRET` quand `oauth` était vrai, sinon dans
 * `config.shopifySecret`, que cette connexion n'a jamais. Résultat : 401
 * « unconfigured » à CHAQUE webhook, commandes et stocks jamais reçus.
 *
 * La signature d'un webhook de l'app est celle de l'APP (secret d'environnement,
 * jamais recopié en base). La porte le sait maintenant pour les deux dons.
 * ═══════════════════════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as connectDirect } from '../functions/api/shopify/connect-direct.js';
import { onRequestPost as webhook } from '../functions/api/channel/shopify/[link].js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Shopify direct · webhooks (tools/shopify-direct-webhook-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
sql.exec(raw);
sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-sh','sh@t.ma','S','Direct Shop','00','00',?)").run(Date.now());
sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES ('direct-shop','{}','acc-sh','Direct Shop','active',?)").run(Date.now());
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

/* Shopify est simulé : l'échange d'identifiants rend un jeton factice, l'enregistrement
   des webhooks répond « rien à signaler ». Aucun réseau. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/admin/oauth/access_token')) {
    return new Response(JSON.stringify({ access_token: 'jeton-factice', scope: 'read_orders', expires_in: 86400 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { userErrors: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

try {
  const cookie = `${SESS_COOKIE}=${await makeSession('acc-sh', env.AUTH_SECRET)}`;
  const res = await connectDirect({
    env,
    request: new Request('https://kiwi.test/api/shopify/connect-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ merchant: 'direct-shop', shop: 'direct-shop.myshopify.com' }),
    }),
  });
  const body = await res.text();
  ok('la connexion par identifiants aboutit', res.status === 200, res.status + ' ' + body);
  ok('la réponse ne contient ni le secret de l\'app ni le jeton', !body.includes(APP_SECRET) && !body.includes('jeton-factice'));

  const link = sql.prepare("SELECT id, config FROM channel_links WHERE channel = 'shopify'").get();
  ok('la ligne du canal existe', !!link);
  ok('aucun secret n\'est recopié dans la ligne du canal', !link.config.includes(APP_SECRET) && !/shopifySecret/.test(link.config), link.config);

  const hook = async (signWith, topic = 'app/uninstalled') => {
    const payload = JSON.stringify({ id: 1 });
    const hmac = crypto.createHmac('sha256', signWith).update(payload).digest('base64');
    const r = await webhook({
      env, params: { link: link.id },
      request: new Request('https://kiwi.test/api/channel/shopify/' + link.id, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Topic': topic,
          'X-Shopify-Shop-Domain': 'direct-shop.myshopify.com', 'X-Shopify-Webhook-Id': 'wh-' + Math.random().toString(36).slice(2),
        },
        body: payload,
      }),
    });
    return { status: r.status, body: await r.json() };
  };

  const bad = await hook('une-autre-cle');
  ok('une signature fausse est refusée (401 bad-signature)', bad.status === 401 && bad.body.error === 'bad-signature', JSON.stringify(bad));
  const good = await hook(APP_SECRET);
  ok('un webhook signé par l\'app est accepté (plus de 401 unconfigured)', good.status === 200 && good.body.ok === true, JSON.stringify(good));
  const conn = sql.prepare("SELECT status FROM shopify_connections WHERE merchant = 'direct-shop'").get();
  ok('… et il est traité (désinstallation = déconnecté)', conn && conn.status === 'disconnected', JSON.stringify(conn));

  /* Une ligne saisie à la main garde son propre secret : rien n'a changé pour elle. */
  sql.prepare("INSERT INTO channel_links (id,merchant,channel,label,hash,config,status,created_ts) VALUES ('chl-manual','direct-shop','shopify','m','h',?, 'active', ?)")
    .run(JSON.stringify({ shopifySecret: 'secret-manuel-factice', shop: 'direct-shop.myshopify.com' }), Date.now());
  const manual = async (signWith) => {
    const payload = JSON.stringify({ id: 2 });
    const r = await webhook({
      env, params: { link: 'chl-manual' },
      request: new Request('https://kiwi.test/api/channel/shopify/chl-manual', {
        method: 'POST',
        headers: { 'X-Shopify-Hmac-Sha256': crypto.createHmac('sha256', signWith).update(payload).digest('base64'), 'X-Shopify-Topic': 'refunds/create', 'X-Shopify-Shop-Domain': 'direct-shop.myshopify.com' },
        body: payload,
      }),
    });
    return r.status;
  };
  ok('une ligne manuelle se signe toujours avec son secret propre', (await manual('secret-manuel-factice')) === 200);
  ok('… et refuse le secret de l\'app', (await manual(APP_SECRET)) === 401);
} finally {
  globalThis.fetch = realFetch;
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ Shopify direct : webhooks vérifiés, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
