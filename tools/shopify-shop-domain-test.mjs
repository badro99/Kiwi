#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : un webhook signé par le domaine PERMANENT de la boutique
 *
 * Vu en production le 21 octobre : Maison 121, reliée sous le domaine tapé
 * maison121.myshopify.com, refusait depuis le 6 septembre chaque webhook,
 * parce que Shopify les signe de son domaine permanent, qtrh13-p1.myshopify.com
 * (« boutique inattendue »). Aucune commande en ligne n'atteignait le stock
 * Kiwi, et 37 variantes ont fini en écart. La porte demande maintenant une fois
 * à Shopify le domaine permanent, le garde, et l'accepte ; une autre boutique
 * reste refusée.
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
console.log('■ Shopify · domaine permanent (tools/shopify-shop-domain-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
sql.exec(raw);
sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-pd','pd@t.ma','S','Maison Test','00','00',?)").run(Date.now());
sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES ('maison-test','{}','acc-pd','Maison Test','active',?)").run(Date.now());
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

let permanent = 'qtrh13-p1.myshopify.com', domainCalls = 0, apiDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.endsWith('/admin/oauth/access_token')) {
    return new Response(JSON.stringify({ access_token: 'jeton-factice', scope: 'read_orders', expires_in: 86400 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const q = String((init && init.body) || '');
  if (q.includes('myshopifyDomain')) {
    domainCalls++;
    if (apiDown) throw new Error('network-down');
    return new Response(JSON.stringify({ data: { shop: { myshopifyDomain: permanent } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { userErrors: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

try {
  const cookie = `${SESS_COOKIE}=${await makeSession('acc-pd', env.AUTH_SECRET)}`;
  const res = await connectDirect({
    env,
    request: new Request('https://kiwi.test/api/shopify/connect-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ merchant: 'maison-test', shop: 'maison121.myshopify.com' }),
    }),
  });
  ok('la connexion sous le domaine tapé aboutit', res.status === 200, res.status + ' ' + await res.text());
  let link = sql.prepare("SELECT id, config FROM channel_links WHERE channel = 'shopify'").get();
  let cfg = JSON.parse(link.config);
  ok('la connexion garde le domaine tapé et apprend le domaine permanent', cfg.shop === 'maison121.myshopify.com' && cfg.myshopifyDomain === permanent, link.config);

  const hook = async (shop) => {
    const payload = JSON.stringify({ id: 1 });
    const hmac = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('base64');
    const r = await webhook({
      env, params: { link: link.id },
      request: new Request('https://kiwi.test/api/channel/shopify/' + link.id, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Topic': 'refunds/create',
          'X-Shopify-Shop-Domain': shop, 'X-Shopify-Webhook-Id': 'wh-' + Math.random().toString(36).slice(2),
        },
        body: payload,
      }),
    });
    return { status: r.status, body: await r.json() };
  };

  /* La ligne telle qu'elle est en production : sans domaine permanent. */
  sql.prepare('UPDATE channel_links SET config = ? WHERE id = ?')
    .run(JSON.stringify({ oauth: false, grant: 'client_credentials', shop: 'maison121.myshopify.com' }), link.id);
  apiDown = true;
  const down = await hook(permanent);
  ok('sans réponse de Shopify, le webhook est refusé : Shopify le renverra', down.status === 401 && down.body.error === 'wrong-shop', JSON.stringify(down));
  apiDown = false;
  domainCalls = 0;
  const healed = await hook(permanent);
  ok('un webhook signé du domaine permanent est accepté', healed.status === 200 && healed.body.ok === true, JSON.stringify(healed));
  cfg = JSON.parse(sql.prepare('SELECT config FROM channel_links WHERE id = ?').get(link.id).config);
  ok('… et le domaine permanent est gardé sur la ligne du canal', cfg.myshopifyDomain === permanent && cfg.shop === 'maison121.myshopify.com', JSON.stringify(cfg));
  const again = await hook(permanent);
  ok('le webhook suivant passe sans redemander à Shopify', again.status === 200 && domainCalls === 1, 'appels ' + domainCalls);
  const typed = await hook('maison121.myshopify.com');
  ok('le domaine tapé reste accepté', typed.status === 200);
  const other = await hook('quelqu-un-dautre.myshopify.com');
  ok('une autre boutique reste refusée, même signée', other.status === 401 && other.body.error === 'wrong-shop' && domainCalls === 1, JSON.stringify(other));
  /* Une reconnexion écrit la ligne pendant que Shopify répond : sa nouvelle
     configuration n'est pas écrasée par la copie lue au début du webhook. */
  sql.prepare('UPDATE channel_links SET config = ? WHERE id = ?')
    .run(JSON.stringify({ oauth: false, grant: 'client_credentials', shop: 'maison121.myshopify.com' }), link.id);
  const realPrepare = DB.prepare;
  let swapped = false;
  DB.prepare = (q) => {
    if (!swapped && /json_set\(config/.test(q)) {
      swapped = true;
      sql.prepare('UPDATE channel_links SET config = ? WHERE id = ?')
        .run(JSON.stringify({ oauth: false, grant: 'client_credentials', shop: 'maison121.myshopify.com', label: 'reconnectée' }), link.id);
    }
    return realPrepare.call(DB, q);
  };
  const raced = await hook(permanent);
  DB.prepare = realPrepare;
  const after = JSON.parse(sql.prepare('SELECT config FROM channel_links WHERE id = ?').get(link.id).config);
  ok('une configuration écrite entre-temps n\'est pas écrasée', swapped && raced.status === 200 && after.label === 'reconnectée' && !after.myshopifyDomain, JSON.stringify(after));
} finally {
  globalThis.fetch = realFetch;
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ Shopify : le domaine permanent signe ses webhooks, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
