#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · la réception native des commandes Shopify.
 *
 *   node tools/shopify-webhook-test.js
 *
 * /api/channel/shopify/<id> est une porte SANS session ET SANS clé porteuse :
 * son adresse est publique par construction, puisque Shopify ne sait envoyer
 * aucun en-tête d'authentification. Ce qui la tient fermée, c'est uniquement la
 * signature HMAC. Une erreur ici ne se voit pas à l'écran — elle se voit quand
 * un inconnu fait imprimer des tickets chez un commerçant.
 *
 *   1. SIGNATURE   absente / fausse / calculée sur un autre corps
 *   2. CONFIG      pas de secret enregistré ⇒ la porte reste fermée
 *   3. TENANCY     le magasin vient du LIEN, jamais du corps de la requête
 *   4. IDEMPOTENCE Shopify repousse pendant 48 h : un seul ticket
 *   5. TRADUCTION  line_items, adresse, téléphone, variante, centimes
 *   6. DEVISE      autre que le dirham ⇒ refus, pas un ticket faux
 *   7. HUMAIN      rien n'est auto-accepté : la commande arrive `pending`
 *   8. SECRET      la clé de signature ne ressort jamais de l'API
 * ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as postHook } from '../functions/api/channel/shopify/[link].js';
import { onRequestPost as postKeys, onRequestGet as getKeys } from '../functions/api/channel/keys.js';

const SECRET = 'test-secret-not-a-real-key';
const ACC_A = 'acc-alpha', ACC_B = 'acc-beta';
/* Volontairement PAS de la forme d'une vraie clé Shopify (« shpss_ » + 32 hex).
 * Une valeur réaliste ici fait bloquer chaque push par le scanner de secrets de
 * GitHub — c'est arrivé — et le test n'a besoin que d'une chaîne partagée. */
const SHOP_SIG = 'cle-de-signature-factice-pour-le-test';

let pass = 0; const fails = [];
const ok = (l, c, d) => { if (c) pass++; else fails.push(l + (d ? ' — ' + d : '')); };

/* ── D1 de poche ─────────────────────────────────────────────────────────── */
function makeDB() {
  const T = { channel_links: [], orders: [], merchant_config: [], accounts: {}, catalogs: [], shopify_variant_links: [], hideDuplicateOnce: false };
  T.accounts[ACC_A] = { business: 'Atlas Casa' };
  T.accounts[ACC_B] = { business: 'Chez Rival' };

  const db = {
    _t: T,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let a = [];
      const api = {
        bind(...x) { a = x; return api; },
        async run() { return api.first(); },
        async all() {
          if (q.startsWith('SELECT id, channel, label, status, created_ts, last_ts, last_err FROM channel_links')) {
            return { results: T.channel_links.filter((r) => r.merchant === a[0]) };
          }
          if (q.startsWith('SELECT kiwi_variant_id, shopify_variant_id FROM shopify_variant_links')) {
            return { results: T.shopify_variant_links.filter((r) => r.merchant === a[0] && ['active', 'drift'].includes(r.status)) };
          }
          throw new Error('unexpected all(): ' + q);
        },
        async first() {
          if (q.startsWith('SELECT id, merchant, channel, config, status FROM channel_links WHERE id')) {
            return T.channel_links.find((r) => r.id === a[0]) || null;
          }
          if (q.startsWith('SELECT business FROM accounts')) return T.accounts[a[0]] || null;
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const r = T.merchant_config.find((x) => x.merchant === a[0]);
            return r ? { account_id: r.account_id } : null;
          }
          if (q.startsWith('UPDATE channel_links SET config')) {
            const r = T.channel_links.find((x) => x.id === a[1] && x.merchant === a[2] && x.channel === 'shopify');
            if (!r) return null; r.config = a[0]; return { id: r.id };
          }
          if (q.startsWith('UPDATE channel_links SET last_ts')) {
            const r = T.channel_links.find((x) => x.id === a[1]); if (r) { r.last_ts = a[0]; r.last_err = null; }
            return r || null;
          }
          if (q.startsWith('UPDATE channel_links SET last_err')) {
            const r = T.channel_links.find((x) => x.id === a[1]); if (r) r.last_err = a[0];
            return r || null;
          }
          if (q.startsWith('UPDATE channel_links SET status')) {
            const r = T.channel_links.find((x) => x.id === a[1] && x.merchant === a[2]);
            if (!r) return null; r.status = a[0]; return { id: r.id };
          }
          if (q.startsWith('SELECT COUNT(*) AS n FROM channel_links')) {
            return { n: T.channel_links.filter((r) => r.merchant === a[0]).length };
          }
          if (q.startsWith('INSERT INTO channel_links')) {
            T.channel_links.push({ id: a[0], merchant: a[1], channel: a[2], label: a[3], hash: a[4], config: null, status: 'active', created_ts: a[5], last_ts: 0, last_err: null });
            return { id: a[0] };
          }
          if (q.startsWith('SELECT id, number FROM orders WHERE merchant = ? AND channel')) {
            if (T.hideDuplicateOnce) { T.hideDuplicateOnce = false; return null; }
            return T.orders.find((o) => o.merchant === a[0] && o.channel === a[1] && o.ext_ref === a[2]) || null;
          }
          if (q.startsWith('SELECT COUNT(*) AS n FROM orders')) {
            return { n: T.orders.filter((o) => o.merchant === a[0] && o.status === 'pending').length };
          }
          if (q.startsWith('SELECT data, rev FROM catalogs WHERE merchant')) {
            return T.catalogs.find((c) => c.merchant === a[0]) || null;
          }
          if (q.startsWith('UPDATE catalogs SET data')) {
            const r = T.catalogs.find((c) => c.merchant === a[3] && c.rev === a[4]);
            if (!r) return { meta: { changes: 0 } };
            r.data = a[0]; r.rev = a[1]; r.updated_ts = a[2];
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO orders')) {
            const [id, merchant, mode, total, lines, created, updated, channel, ref, customer] = a;
            if (ref && T.orders.some((o) => o.merchant === merchant && o.channel === channel && o.ext_ref === ref)) {
              throw new Error('UNIQUE constraint failed: orders.merchant, orders.channel, orders.ext_ref');
            }
            const number = T.orders.filter((o) => o.merchant === merchant).reduce((m, o) => Math.max(m, o.number), 0) + 1;
            T.orders.push({ id, merchant, number, mode, table_no: '', total, lines, status: 'pending', created_ts: created, updated_ts: updated, channel, ext_ref: ref, customer });
            return { number };
          }
          throw new Error('unexpected first(): ' + q);
        },
      };
      return api;
    },
  };
  return db;
}

let DB = makeDB();
const env = () => ({ AUTH_SECRET: SECRET, DB });

/* La signature telle que Shopify la calcule : HMAC-SHA256 du corps BRUT, en
 * base64. On la refabrique ici avec node:crypto — une implémentation
 * indépendante de celle qu'on teste, sinon on ne testerait rien. */
const sign = (secret, raw) => crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');

/* On envoie une CHAÎNE, jamais un objet : c'est tout l'enjeu. Le corps signé
 * et le corps analysé doivent être exactement les mêmes octets. */
async function hook(linkId, raw, headers) {
  const res = await postHook({
    request: new Request('https://kiwi.test/api/channel/shopify/' + linkId, {
      method: 'POST', body: raw,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    }),
    env: env(),
    params: { link: linkId },
  });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, body: j };
}

const signed = (linkId, raw, extra) => hook(linkId, raw, Object.assign({
  'X-Shopify-Hmac-Sha256': sign(SHOP_SIG, raw),
  'X-Shopify-Topic': 'orders/create',
  'X-Shopify-Shop-Domain': 'atlas-casa.myshopify.com',
}, extra || {}));

const post = async (fn, body, headers) => {
  const res = await fn({
    request: new Request('https://kiwi.test/api/channel/keys', {
      method: 'POST', body: JSON.stringify(body), headers: headers || {},
    }),
    env: env(),
  });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, body: j };
};

/* Une commande Shopify réelle, réduite aux champs qu'on lit. */
const ORDER = (over) => JSON.stringify(Object.assign({
  id: 5432109876543,
  name: '#1042',
  currency: 'MAD',
  total_price: '240.00',
  note: 'Sonner deux fois',
  line_items: [
    { id: 11, variant_id: 901, title: 'Tajine kefta', quantity: 2, price: '120.00', variant_title: 'Default Title' },
  ],
  customer: { first_name: 'Karim', last_name: 'B.' },
  shipping_address: {
    name: 'Karim B.', address1: '12 rue Tarik', address2: '', zip: '20250',
    city: 'Casablanca', phone: '0661234567',
  },
}, over || {}));

(async function run() {
  const sessA = sessionCookie(await makeSession(ACC_A, SECRET)).split(';')[0];
  const sessB = sessionCookie(await makeSession(ACC_B, SECRET)).split(';')[0];
  DB._t.merchant_config.push({ merchant: 'atlas-casa', account_id: ACC_A });
  DB._t.merchant_config.push({ merchant: 'chez-rival', account_id: ACC_B });
  DB._t.shopify_variant_links.push({ merchant: 'atlas-casa', kiwi_variant_id: 'kv-1', shopify_variant_id: 'gid://shopify/ProductVariant/901', status: 'active' });
  DB._t.catalogs.push({
    merchant: 'atlas-casa', rev: 1, updated_ts: Date.now(),
    data: JSON.stringify({
      v: 1, seq: 1, categories: [], removed: {}, moves: [],
      products: [{ id: 'kp-1', name: 'Tajine kefta', priceMAD: 120, createdAt: 1 }],
      variants: [{ id: 'kv-1', productId: 'kp-1', colorId: 'default', colorFamily: 'default', size: 'U', stock: 10, base: 10, baseAt: 1, barcodes: [] }],
    }),
  });

  /* ── 1 · le lien, et l'adresse qu'on remet au commerçant ────────────────── */
  let r = await post(postKeys, { channel: 'shopify', label: 'Boutique' }, { Cookie: sessA });
  ok('le commerçant crée un lien Shopify', r.status === 200 && !!r.body.ok, JSON.stringify(r.body));
  const linkId = r.body.key.id;
  ok('…et reçoit une adresse de webhook qui porte cet identifiant',
    typeof r.body.webhook === 'string' && r.body.webhook.endsWith('/api/channel/shopify/' + linkId), r.body.webhook);

  r = await post(postKeys, { channel: 'glovo' }, { Cookie: sessA });
  ok('un canal non-Shopify ne reçoit pas d\'adresse de webhook', r.body.webhook === '', JSON.stringify(r.body.webhook));

  /* ── 2 · tant que la signature n'est pas enregistrée, tout est refusé ───── */
  r = await signed(linkId, ORDER());
  ok('sans clé de signature enregistrée, la porte refuse', r.status === 401 && r.body.error === 'unconfigured', JSON.stringify(r.body));
  ok('…et aucun ticket n\'a été créé', DB._t.orders.length === 0);
  ok('…et le commerçant peut lire pourquoi sur sa ligne de canal',
    /signature Shopify non enregistrée/.test(DB._t.channel_links.find((l) => l.id === linkId).last_err || ''));

  /* ── 3 · enregistrer la clé de signature ────────────────────────────────── */
  r = await post(postKeys, { id: linkId, config: { shopifySecret: SHOP_SIG, shop: 'Atlas-Casa.myshopify.com' } }, { Cookie: sessA });
  ok('le commerçant enregistre la clé de signature', r.status === 200 && r.body.configured === true, JSON.stringify(r.body));

  r = await post(postKeys, { id: linkId, config: { shopifySecret: 'x' } }, { Cookie: sessB });
  ok('un autre commerçant ne peut pas écrire dans ce lien', r.status === 404);
  ok('…et la clé enregistrée n\'a pas bougé',
    JSON.parse(DB._t.channel_links.find((l) => l.id === linkId).config).shopifySecret === SHOP_SIG);

  r = await post(postKeys, { id: linkId, config: { shopifySecret: '' } }, { Cookie: sessA });
  ok('une clé de signature vide est refusée', r.status === 400);

  /* Le secret ne doit ressortir par aucune route. */
  const listed = await getKeys({
    request: new Request('https://kiwi.test/api/channel/keys', { headers: { Cookie: sessA } }),
    env: env(),
  });
  const listedJson = JSON.stringify(await listed.json());
  ok('la clé de signature ne ressort jamais de l\'API', !listedJson.includes(SHOP_SIG), listedJson.slice(0, 160));

  /* ── 4 · la signature ───────────────────────────────────────────────────── */
  const raw = ORDER();
  r = await hook(linkId, raw, { 'X-Shopify-Topic': 'orders/create' });
  ok('sans en-tête de signature, refus', r.status === 401 && r.body.error === 'bad-signature');

  r = await hook(linkId, raw, { 'X-Shopify-Hmac-Sha256': 'bm90LWEtc2lnbmF0dXJl', 'X-Shopify-Topic': 'orders/create' });
  ok('avec une signature inventée, refus', r.status === 401);

  r = await hook(linkId, raw, { 'X-Shopify-Hmac-Sha256': sign('un-autre-secret', raw), 'X-Shopify-Topic': 'orders/create' });
  ok('signée avec le mauvais secret, refus', r.status === 401);

  /* Le cœur du sujet : la signature porte sur les OCTETS. Un corps modifié
   * après signature — ne serait-ce qu'une espace — ne doit plus passer. */
  r = await hook(linkId, raw.replace('"total_price":"240.00"', '"total_price":"1.00"'), {
    'X-Shopify-Hmac-Sha256': sign(SHOP_SIG, raw), 'X-Shopify-Topic': 'orders/create',
  });
  ok('un corps modifié après signature ne passe plus', r.status === 401, JSON.stringify(r.body));
  ok('…toujours aucun ticket', DB._t.orders.length === 0);

  /* ── 5 · la vraie commande ──────────────────────────────────────────────── */
  r = await signed(linkId, raw);
  ok('une commande correctement signée est acceptée', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
  ok('…un seul ticket existe', DB._t.orders.length === 1);
  ok('…la variante Kiwi liée est décrémentée une fois', JSON.parse(DB._t.catalogs[0].data).variants[0].stock === 8);

  const t = DB._t.orders[0];
  ok('le ticket appartient au magasin du LIEN', t.merchant === 'atlas-casa', t.merchant);
  ok('le ticket porte le canal shopify', t.channel === 'shopify', t.channel);
  ok('le ticket attend une décision humaine', t.status === 'pending', t.status);
  ok('le total est en dirhams entiers', t.total === 240, String(t.total));
  ok('le mode est « livraison » quand il y a une adresse', t.mode === 'delivery', t.mode);
  ok('la référence est l\'identifiant Shopify', t.ext_ref === '5432109876543', t.ext_ref);

  const lines = JSON.parse(t.lines);
  ok('la ligne est traduite depuis line_items', lines.length === 1 && lines[0].name === 'Tajine kefta', t.lines);
  ok('la quantité vient de `quantity`', lines[0].qty === 2, String(lines[0].qty));
  ok('le prix vient de `price`', lines[0].unitPrice === 120, String(lines[0].unitPrice));
  ok('« Default Title » n\'est pas recopié comme une option', lines[0].options === '', lines[0].options);

  const cust = JSON.parse(t.customer);
  ok('le nom du destinataire est repris', cust.name === 'Karim B.', cust.name);
  ok('le téléphone est repris', cust.phone === '0661234567', cust.phone);
  ok('l\'adresse est assemblée lisiblement', /12 rue Tarik/.test(cust.address) && /Casablanca/.test(cust.address), cust.address);
  ok('la note du client est reprise', /Sonner deux fois/.test(cust.note), cust.note);

  /* ── 6 · Shopify repousse ───────────────────────────────────────────────── */
  r = await signed(linkId, raw);
  ok('rejouer la même commande ne crée pas un second ticket', r.status === 200 && r.body.duplicate === true, JSON.stringify(r.body));
  ok('…il n\'y a toujours qu\'un ticket', DB._t.orders.length === 1);
  ok('…et le rejeu ne décrémente pas une deuxième fois', JSON.parse(DB._t.catalogs[0].data).variants[0].stock === 8);

  DB._t.hideDuplicateOnce = true;
  r = await signed(linkId, raw);
  ok('une course perdue sur l\'INSERT est traitée comme un rejeu réussi',
    r.status === 200 && r.body.duplicate === true && r.body.id === t.id, JSON.stringify(r.body));
  ok('…sans second ticket Shopify', DB._t.orders.length === 1);

  /* ── 7 · les centimes ───────────────────────────────────────────────────── */
  const cents = ORDER({ id: 777, total_price: '129.90', note: '' });
  r = await signed(linkId, cents);
  ok('une commande à centimes est acceptée', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
  const t2 = DB._t.orders[1];
  ok('…arrondie au dirham pour la base', t2.total === 130, String(t2.total));
  ok('…mais le montant exact part sur le ticket',
    /129,90 MAD/.test(JSON.parse(t2.customer).note), JSON.parse(t2.customer).note);

  const round = ORDER({ id: 778, total_price: '240.00', note: '' });
  r = await signed(linkId, round);
  ok('un montant rond n\'ajoute aucune mention inutile',
    JSON.parse(DB._t.orders[2].customer).note === '', JSON.parse(DB._t.orders[2].customer).note);

  /* ── 8 · la devise ──────────────────────────────────────────────────────── */
  const eur = ORDER({ id: 999, currency: 'EUR', total_price: '240.00' });
  r = await signed(linkId, eur);
  ok('une commande en euros est refusée, pas imprimée en dirhams',
    r.status === 422 && r.body.error === 'bad-currency', JSON.stringify(r.body));
  ok('…aucun ticket n\'a été créé pour elle', DB._t.orders.length === 3);
  ok('…et la raison est lisible par le commerçant',
    /devise EUR/.test(DB._t.channel_links.find((l) => l.id === linkId).last_err || ''));

  /* ── 9 · la boutique déclarée ───────────────────────────────────────────── */
  const other = ORDER({ id: 1001 });
  r = await signed(linkId, other, { 'X-Shopify-Shop-Domain': 'quelqu-un-dautre.myshopify.com' });
  ok('une boutique inattendue est refusée même avec une signature valide', r.status === 401, JSON.stringify(r.body));

  /* ── 10 · les autres sujets ─────────────────────────────────────────────── */
  const before = DB._t.orders.length;
  r = await signed(linkId, ORDER({ id: 1002 }), { 'X-Shopify-Topic': 'products/update' });
  ok('un sujet hors liste répond 200 sans rien fabriquer', r.status === 200 && !!r.body.ignored, JSON.stringify(r.body));
  ok('…et aucun ticket n\'apparaît', DB._t.orders.length === before);

  /* ── 11 · commande à emporter, sans adresse ─────────────────────────────── */
  const pickup = ORDER({ id: 2002, shipping_address: null, note: '' });
  r = await signed(linkId, pickup);
  ok('sans adresse, la commande est « à emporter »',
    DB._t.orders[DB._t.orders.length - 1].mode === 'takeout',
    DB._t.orders[DB._t.orders.length - 1].mode);

  /* ── 12 · le HMAC porte sur les OCTETS REÇUS, pas sur du JSON re-sérialisé ─
   * C'est le piège classique de ce genre de porte : faire request.json(), puis
   * re-sérialiser pour calculer la signature. Ça passe tous les tests tant que
   * le corps d'essai ressort identique de JSON.parse/stringify — ce qu'un vrai
   * webhook Shopify ne fait jamais. On signe donc un corps INDENTÉ : une
   * implémentation qui re-sérialise calcule sur la forme compacte et rejette
   * une commande parfaitement valide. Sans ce contrôle, les deux versions du
   * code sont indiscernables (vérifié par mutation). */
  const pretty = JSON.stringify(JSON.parse(ORDER({ id: 6006, note: '' })), null, 2);
  const nBefore = DB._t.orders.length;
  r = await signed(linkId, pretty);
  ok('un corps indenté, correctement signé, est accepté', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
  ok('…et il a bien produit un ticket', DB._t.orders.length === nBefore + 1);

  /* ── 13 · lien inconnu, lien en pause, mauvais canal ────────────────────── */
  r = await signed('chl-nexistepas', ORDER({ id: 3003 }));
  ok('un identifiant de lien inconnu ne dit pas qu\'il est inconnu', r.status === 401 && r.body.error === 'unauthorized');

  const glovoLink = DB._t.channel_links.find((l) => l.channel === 'glovo');
  glovoLink.config = JSON.stringify({ shopifySecret: SHOP_SIG });
  r = await signed(glovoLink.id, ORDER({ id: 4004 }));
  ok('un lien Glovo ne s\'ouvre pas par la porte Shopify', r.status === 401, JSON.stringify(r.body));

  await post(postKeys, { id: linkId, status: 'paused' }, { Cookie: sessA });
  r = await signed(linkId, ORDER({ id: 5005 }));
  ok('un lien en pause refuse, signature valide ou non', r.status === 401);

  /* ── 14 · la porte du site, qui doit s'ouvrir juste assez ────────────────
   * Shopify n'a ni session ni cookie : sans exception dans _middleware.js, son
   * webhook reçoit l'écran de connexion et aucune commande n'arrive jamais —
   * en répondant 200, donc sans que rien ne le signale. Mais une exception trop
   * large ouvrirait la gestion des clés, qui elle doit rester fermée.
   * On relit donc la règle telle qu'elle est écrite et on la met à l'épreuve. */
  {
    const src = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
    const m = /path === '\/api\/channel\/order'\) return next\(\);[\s\S]{0,900}?&& (\/\^[^\n]+?\/)\.test\(path\)/.exec(src);
    ok('la règle du webhook Shopify existe dans _middleware.js', !!m, 'aucune exception trouvée');
    if (m) {
      const re = new RegExp(m[1].slice(1, -1));
      ok('…elle laisse passer une adresse de webhook', re.test('/api/channel/shopify/chl-0e4a1b2c-1111-2222-3333-444455556666'));
      ok('…elle n\'ouvre PAS la gestion des clés', !re.test('/api/channel/keys'));
      ok('…ni /api/channel/ tout court', !re.test('/api/channel/'));
      ok('…ni un second segment ajouté après l\'identifiant', !re.test('/api/channel/shopify/chl-0001/keys'));
      ok('…ni une remontée de chemin', !re.test('/api/channel/shopify/../keys'));
      ok('…ni un identifiant vide', !re.test('/api/channel/shopify/'));
    }
  }

  console.log('');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log(`\n✗ shopify-webhook: ${pass} ok, ${fails.length} échec(s)\n`);
    process.exit(1);
  }
  console.log(`  ✓ réception Shopify native (${pass} contrôles : signature, corps brut, config, tenancy, idempotence, devise, traduction)\n`);
})().catch((e) => { console.log('  ✗ ' + (e && e.stack || e)); process.exit(1); });
