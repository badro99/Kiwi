#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : une app par organisation
 *
 * Le don d'identifiants n'est accepté que si l'app et la boutique sont dans la
 * même organisation Shopify. CHICTRATEC (boutique 64arxg-03) est dans une autre
 * organisation que Maison 121 : la seule app connue de Kiwi ne pouvait pas le
 * relier, et la ronde publique échouait sur « redirect_uri and application url
 * must have matching hosts » (24 nov. 2026).
 *
 * SHOPIFY_EXTRA_APPS ajoute des apps, chacune réservée aux boutiques qu'elle
 * nomme. Ce test tient : le choix de l'app par boutique (domaine saisi ou
 * permanent), le repli sur l'app par défaut, les identifiants envoyés à
 * Shopify par chaque chemin, et la signature des webhooks par le bon secret.
 * ═══════════════════════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { shopifyApp, shopifyAppAllows, exchangeAuthorizationCode } from '../functions/api/shopify/_lib.js';
import { onRequestPost as connectDirect } from '../functions/api/shopify/connect-direct.js';
import { onRequestPost as connectOAuth } from '../functions/api/shopify/connect.js';
import { onRequestPost as webhook } from '../functions/api/channel/shopify/[link].js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Shopify · une app par organisation (tools/shopify-extra-apps-test.mjs)');

/* Valeurs factices, volontairement sans la forme d'une vraie clé Shopify. */
const DEFAULT_SECRET = 'secret-factice-app-par-defaut-pour-le-test';
const EXTRA_SECRET = 'secret-factice-seconde-app-pour-le-test';
const EXTRA = JSON.stringify([
  { id: 'id-seconde-app', secret: EXTRA_SECRET, shops: ['second-org.myshopify.com', 'zz99-01'], merchants: ['shop-two'] },
  { id: 'sans-liste', secret: 'x' },
  { id: 'sans-commerces', secret: 'y', shops: ['orphan-shop.myshopify.com'] },
]);

// ── 1. Le choix de l'app ───────────────────────────────────────────────────
{
  const base = { SHOPIFY_CLIENT_ID: 'id-defaut', SHOPIFY_CLIENT_SECRET: DEFAULT_SECRET };
  ok('sans SHOPIFY_EXTRA_APPS, l\'app par défaut', shopifyApp(base, 'second-org.myshopify.com').id === 'id-defaut');
  const env = { ...base, SHOPIFY_EXTRA_APPS: EXTRA };
  ok('une boutique nommée prend sa propre app', shopifyApp(env, 'second-org.myshopify.com').id === 'id-seconde-app');
  ok('… même écrite sans .myshopify.com ni casse', shopifyApp(env, 'Second-Org').id === 'id-seconde-app');
  ok('… ou par son domaine permanent, en second argument', shopifyApp(env, 'boutique.example', 'zz99-01.myshopify.com').id === 'id-seconde-app');
  ok('une autre boutique garde l\'app par défaut', shopifyApp(env, 'maison121.myshopify.com').secret === DEFAULT_SECRET);
  ok('une app sans liste de boutiques n\'est jamais choisie', shopifyApp(env, '').id === 'id-defaut');
  ok('un JSON illisible retombe sur l\'app par défaut', shopifyApp({ ...base, SHOPIFY_EXTRA_APPS: '{pas du json' }, 'second-org').id === 'id-defaut');
  ok('un objet seul (pas un tableau) est accepté', shopifyApp({ ...base, SHOPIFY_EXTRA_APPS: JSON.stringify({ id: 'solo', secret: 's', shops: ['solo-shop'], merchants: ['m'] }) }, 'solo-shop').id === 'solo');
  ok('une app sans liste de commerces n\'est jamais choisie', shopifyApp(env, 'orphan-shop').id === 'id-defaut');
  ok('le commerce nommé peut relier la boutique', shopifyAppAllows(env, 'shop-two', 'second-org'));
  ok('un autre commerce ne le peut pas', !shopifyAppAllows(env, 'shop-one', 'second-org'));
  ok('… ni par le domaine permanent', !shopifyAppAllows(env, 'shop-one', 'x.myshopify.com', 'zz99-01'));
  ok('une boutique de l\'app par défaut reste ouverte (règle d\'avant)', shopifyAppAllows(env, 'shop-one', 'maison121'));
}

// ── 2. Les chemins de connexion et les webhooks ────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
for (const [acc, merchant] of [['acc-one', 'shop-one'], ['acc-two', 'shop-two']]) {
  sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,'S','B','00','00',?)").run(acc, acc + '@t.ma', Date.now());
  sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES (?,'{}',?,'B','active',?)").run(merchant, acc, Date.now());
}
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
const env = {
  DB, AUTH_SECRET: 'shopify-extra-apps-auth-secret-32-bytes!!',
  SHOPIFY_CLIENT_ID: 'id-defaut', SHOPIFY_CLIENT_SECRET: DEFAULT_SECRET,
  SHOPIFY_EXTRA_APPS: EXTRA,
  SHOPIFY_TOKEN_KEY: 'cle-de-chiffrement-factice-de-plus-de-24-caracteres',
};

/* Shopify simulé : on note quels identifiants chaque boutique a reçus. */
const sentTo = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.endsWith('/admin/oauth/access_token')) {
    const body = new URLSearchParams(String(init && init.body || ''));
    sentTo.push({ host: new URL(u).host, id: body.get('client_id'), secret: body.get('client_secret') });
    return new Response(JSON.stringify({ access_token: 'jeton-factice', refresh_token: 'rafraichir-factice', scope: 'read_orders', expires_in: 86400 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { userErrors: [] }, shop: { myshopifyDomain: null } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const post = async (fn, acc, route, body) => fn({
  env,
  request: new Request('https://kiwi.test' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESS_COOKIE}=${await makeSession(acc, env.AUTH_SECRET)}` },
    body: JSON.stringify(body),
  }),
});

try {
  /* Avant toute connexion : sinon le verrou « boutique déjà reliée » répondrait
   * 409 à la place de la garde testée ici. */
  const thief = await post(connectDirect, 'acc-one', '/api/shopify/connect-direct', { merchant: 'shop-one', shop: 'second-org.myshopify.com' });
  ok('un autre commerce ne relie pas la boutique de la seconde app (409)', thief.status === 409, String(thief.status));
  ok('… et Shopify n\'est même pas appelé', sentTo.length === 0, JSON.stringify(sentTo.map((x) => x.host)));
  const thiefOAuth = await post(connectOAuth, 'acc-one', '/api/shopify/connect', { merchant: 'shop-one', shop: 'second-org.myshopify.com' });
  ok('… ni par la ronde publique (409, aucun lien d\'autorisation)', thiefOAuth.status === 409 && !(await thiefOAuth.text()).includes('authorize'));

  sentTo.length = 0;

  const r2 = await post(connectDirect, 'acc-two', '/api/shopify/connect-direct', { merchant: 'shop-two', shop: 'second-org.myshopify.com' });
  const b2 = await r2.text();
  ok('la boutique de la seconde organisation se relie', r2.status === 200, r2.status + ' ' + b2);
  const two = sentTo.find((s) => s.host === 'second-org.myshopify.com');
  ok('… avec les identifiants de SA app', two && two.id === 'id-seconde-app' && two.secret === EXTRA_SECRET, JSON.stringify(two && two.id));
  ok('… et la réponse ne montre aucun secret', !b2.includes(EXTRA_SECRET) && !b2.includes(DEFAULT_SECRET));

  const r1 = await post(connectDirect, 'acc-one', '/api/shopify/connect-direct', { merchant: 'shop-one', shop: 'first-org.myshopify.com' });
  ok('la boutique de l\'organisation d\'origine se relie toujours', r1.status === 200, String(r1.status));
  const one = sentTo.find((s) => s.host === 'first-org.myshopify.com');
  ok('… avec l\'app par défaut', one && one.id === 'id-defaut' && one.secret === DEFAULT_SECRET);

  sentTo.length = 0;
  await exchangeAuthorizationCode(env, 'second-org.myshopify.com', 'code-factice');
  ok('l\'échange du code OAuth prend aussi l\'app de la boutique', sentTo[0] && sentTo[0].id === 'id-seconde-app');

  /* La ronde publique : le lien d'autorisation nomme l'app de la boutique. */
  sql.prepare("DELETE FROM shopify_connections WHERE merchant = 'shop-two'").run();
  const ro = await post(connectOAuth, 'acc-two', '/api/shopify/connect', { merchant: 'shop-two', shop: 'second-org.myshopify.com' });
  const jo = await ro.json();
  ok('le lien d\'autorisation nomme l\'app de la boutique', jo.authorize && new URL(jo.authorize).searchParams.get('client_id') === 'id-seconde-app', JSON.stringify(jo));
  ok('… et jamais son secret', !JSON.stringify(jo).includes(EXTRA_SECRET));

  /* Les webhooks : chaque ligne se vérifie avec le secret de l'app de SA boutique. */
  const linkOf = (merchant) => sql.prepare("SELECT id FROM channel_links WHERE channel = 'shopify' AND merchant = ?").get(merchant).id;
  const hook = async (linkId, shop, signWith) => {
    const payload = JSON.stringify({ id: 7 });
    const r = await webhook({
      env, params: { link: linkId },
      request: new Request('https://kiwi.test/api/channel/shopify/' + linkId, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-Shopify-Topic': 'refunds/create',
          'X-Shopify-Hmac-Sha256': crypto.createHmac('sha256', signWith).update(payload).digest('base64'),
          'X-Shopify-Shop-Domain': shop, 'X-Shopify-Webhook-Id': 'wh-' + Math.random().toString(36).slice(2),
        },
        body: payload,
      }),
    });
    return r.status;
  };
  const l2 = linkOf('shop-two');
  const l1 = linkOf('shop-one');
  ok('un webhook de la seconde boutique signé par sa app est accepté', (await hook(l2, 'second-org.myshopify.com', EXTRA_SECRET)) === 200);
  ok('… signé par l\'app par défaut, il est refusé', (await hook(l2, 'second-org.myshopify.com', DEFAULT_SECRET)) === 401);
  ok('un webhook de la boutique d\'origine signé par l\'app par défaut est accepté', (await hook(l1, 'first-org.myshopify.com', DEFAULT_SECRET)) === 200);
  ok('… signé par la seconde app, il est refusé', (await hook(l1, 'first-org.myshopify.com', EXTRA_SECRET)) === 401);
  ok('… même si l\'en-tête prétend venir de la seconde boutique', (await hook(l1, 'second-org.myshopify.com', EXTRA_SECRET)) === 401);
} finally {
  globalThis.fetch = realFetch;
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ Shopify : chaque boutique parle avec l\'app de son organisation, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
