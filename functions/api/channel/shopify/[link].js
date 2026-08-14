// /api/channel/shopify/<link-id> — Shopify parle enfin à Kiwi sans intermédiaire.
//
//   POST  X-Shopify-Hmac-Sha256: <base64(HMAC-SHA256(corps brut, secret))>
//         X-Shopify-Topic: orders/create
//         X-Shopify-Shop-Domain: boutique.myshopify.com
//         { id, name, currency, total_price, line_items:[…], shipping_address:{…} }
//     →   { ok, id, number }
//
// ── Pourquoi cette porte est différente de /api/channel/order ────────────────
// L'autre porte demande « Authorization: Bearer kwc.… ». Shopify ne sait pas
// l'envoyer : dans son écran Notifications on ne configure QU'UNE URL, aucun
// en-tête. Jusqu'ici la seule issue était un relais (Make, Zapier) qui recevait
// le webhook et le reposait avec la clé. Un relais, c'est un troisième compte à
// payer, un quota mensuel qui saute un jour de forte affluence, et un endroit de
// plus où la clé de caisse dort en clair.
//
// Alors on inverse : l'identité voyage dans le CHEMIN, et l'authentification
// dans la signature. L'identifiant de lien (chl-<uuid>) n'est pas un secret —
// c'est une poignée de recherche. Ce qui prouve l'appel, c'est le HMAC que
// Shopify calcule avec un secret que lui et nous sommes seuls à connaître.
//
// ── Le corps BRUT, et rien d'autre ──────────────────────────────────────────
// Le HMAC se calcule sur les octets exacts reçus. Faire request.json() puis
// re-sérialiser change une espace, un ordre de clés, la notation d'un nombre —
// et la signature ne correspond plus. Pire : elle correspondrait sur un corps
// qui n'est plus celui qu'on a vérifié. On lit donc le texte une fois, on
// vérifie, et seulement ensuite on analyse cette même chaîne.
//
// ── Ce que cette porte refuse ───────────────────────────────────────────────
// Pas de secret enregistré → 401. Une boutique dont le commerçant n'a pas fini
// la configuration ne doit PAS avoir une porte ouverte en attendant : accepter
// du non-signé, c'est accepter n'importe qui.
// Devise autre que MAD → refus. Imprimer « 240 MAD » pour une commande de
// 240 EUR est une erreur qu'aucun écran ne rattrape ensuite.
//
// Comme l'autre porte : rien n'est auto-accepté. La commande arrive `pending`
// et attend le même geste humain qu'une commande au comptoir.

import { json } from '../../../auth/_lib.js';
import { startOfWeek } from '../../order/_lib.js';

const MAX_LINES = 60;
const MAX_TOTAL = 200000;          // 200 000 MAD — garde-fou, pas une règle
const MAX_PENDING = 60;
const MAX_BODY = 512 * 1024;       // un webhook Shopify normal pèse quelques Ko
const CHANNEL = 'shopify';

/* Shopify pousse une trentaine de sujets sur la même URL si on l'y abonne.
 * Seuls ceux-ci créent un ticket ; les autres reçoivent 200 (sans quoi Shopify
 * réessaie pendant 48 h) mais ne fabriquent rien. */
const TOPICS = { 'orders/create': 1, 'orders/paid': 1 };

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

/* Comparaison à temps constant — même raison que dans order.js : comparer avec
 * === laisse fuir, par le temps de réponse, combien de tête est juste. */
function sameStr(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmacB64(secret, raw) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function mark(env, id, ok, err) {
  try {
    await env.DB.prepare(
      ok ? 'UPDATE channel_links SET last_ts = ?, last_err = NULL WHERE id = ?'
         : 'UPDATE channel_links SET last_err = ? WHERE id = ?'
    ).bind(ok ? Date.now() : str(err, 120), id).run();
  } catch (_) {}
}

/* ── Shopify → Kiwi ──────────────────────────────────────────────────────────
 * Le format de Shopify n'est pas le nôtre et n'a aucune raison de l'être. Les
 * montants arrivent en CHAÎNES décimales ("129.90"), les articles s'appellent
 * line_items, et l'adresse vit dans shipping_address quand il y en a une. */
function translate(o) {
  const rawLines = Array.isArray(o && o.line_items) ? o.line_items : [];
  const lines = rawLines.slice(0, MAX_LINES).map((l) => {
    const variant = str(l && l.variant_title, 120);
    return {
      id: str(l && l.id, 40),
      name: str((l && (l.title || l.name)) || '', 80),
      qty: Math.min(99, Math.max(1, Math.round(Number(l && l.quantity) || 1))),
      unitPrice: Math.max(0, Math.round(Number(l && l.price) || 0)),
      // « Taille M / Rouge » : sans ça le comptoir prépare le mauvais article.
      options: variant && variant !== 'Default Title' ? variant : '',
      note: '',
    };
  });

  const ship = (o && o.shipping_address) || null;
  const cust = (o && o.customer) || {};
  const bill = (o && o.billing_address) || {};
  const addr = ship || null;
  const address = addr
    ? [addr.address1, addr.address2, addr.zip, addr.city].filter(Boolean).join(', ')
    : '';

  const name = str(
    (addr && addr.name) ||
    [cust.first_name, cust.last_name].filter(Boolean).join(' ') ||
    bill.name || '', 80
  );

  /* Kiwi range les commandes en dirhams entiers (schema.sql : `total INTEGER
   * -- MAD, whole dirhams`). Shopify, lui, envoie des centimes. Arrondir sans
   * le dire serait grave ici : au Maroc le paiement à la livraison domine, et
   * le coursier encaisse le chiffre imprimé sur le ticket. On arrondit donc
   * pour la base, mais le montant EXACT part sur le ticket dès qu'il diffère —
   * mieux vaut une ligne en plus qu'un dirham de travers dans la poche. */
  const exact = Number(o && o.total_price) || 0;
  const total = Math.round(exact);
  const cents = Math.abs(exact - total) > 0.004
    ? exact.toFixed(2).replace('.', ',') + ' MAD'
    : '';

  const shopNote = str(o && o.note, 180);
  const note = [cents ? 'Total exact : ' + cents : '', shopNote].filter(Boolean).join(' · ');

  return {
    total,
    lines,
    // Un client qui se fait livrer et un client qui vient chercher n'occupent
    // pas la cuisine de la même façon.
    mode: ship ? 'delivery' : 'takeout',
    customer: {
      name,
      phone: str((addr && addr.phone) || o.phone || cust.phone || '', 32),
      address: str(address, 240),
      note: str(note, 240),
    },
    // `name` est le numéro visible par le client (« #1042 ») ; `id` est stable
    // et numérique. On préfère l'id : c'est lui qui ne bouge pas d'un renvoi à
    // l'autre.
    ref: str((o && (o.id || o.name)) || '', 48),
  };
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  const linkId = str(params && params.link, 64);
  if (!linkId) return json({ error: 'unauthorized' }, 401);

  let link;
  try {
    link = await env.DB.prepare(
      'SELECT id, merchant, channel, config, status FROM channel_links WHERE id = ?'
    ).bind(linkId).first();
  } catch (_) { return json({ error: 'unauthorized' }, 401); }
  // Un seul message pour « lien inconnu », « lien en pause » et « mauvais
  // canal » : les distinguer dirait à qui cherche laquelle de ses tentatives
  // approche.
  if (!link || link.status !== 'active' || link.channel !== CHANNEL) {
    return json({ error: 'unauthorized' }, 401);
  }

  let cfg = {};
  try { cfg = link.config ? JSON.parse(link.config) : {}; } catch (_) { cfg = {}; }
  const secret = str(cfg && cfg.shopifySecret, 200);
  if (!secret) {
    /* La configuration n'est pas finie. On refuse — et on l'écrit sur la ligne
     * du canal, parce que c'est le seul endroit où le commerçant peut le lire
     * sans ouvrir les journaux Cloudflare. */
    await mark(env, link.id, false, 'clé de signature Shopify non enregistrée');
    return json({ error: 'unconfigured' }, 401);
  }

  /* Le corps brut, lu UNE fois. Tout le reste en découle. */
  let raw;
  try { raw = await request.text(); } catch (_) {
    await mark(env, link.id, false, 'corps illisible');
    return json({ error: 'bad-body' }, 400);
  }
  if (!raw || raw.length > MAX_BODY) {
    await mark(env, link.id, false, 'corps vide ou trop gros');
    return json({ error: 'bad-body' }, 400);
  }

  const sent = str(request.headers.get('X-Shopify-Hmac-Sha256'), 100);
  if (!sent || !sameStr(sent, await hmacB64(secret, raw))) {
    await mark(env, link.id, false, 'signature Shopify invalide');
    return json({ error: 'bad-signature' }, 401);
  }

  /* La boutique déclarée, quand le commerçant l'a enregistrée. Le HMAC reste la
   * vraie porte ; ceci n'attrape que le cas d'un secret recopié d'une boutique
   * à l'autre. */
  const shop = str(request.headers.get('X-Shopify-Shop-Domain'), 120).toLowerCase();
  const known = str(cfg && cfg.shop, 120).toLowerCase();
  if (known && shop && known !== shop) {
    await mark(env, link.id, false, 'boutique inattendue : ' + shop);
    return json({ error: 'wrong-shop' }, 401);
  }

  /* Sujet hors liste : 200 sans rien fabriquer. Répondre en erreur ferait
   * réessayer Shopify pendant 48 h pour un message qu'on ne veut pas. */
  const topic = str(request.headers.get('X-Shopify-Topic'), 60);
  if (!TOPICS[topic]) return json({ ok: true, ignored: topic || 'sans-sujet' });

  let o;
  try { o = JSON.parse(raw); } catch (_) {
    await mark(env, link.id, false, 'corps JSON illisible');
    return json({ error: 'bad-json' }, 400);
  }

  /* La devise, avant tout le reste. Un ticket marocain affiche des dirhams ;
   * une commande en euros imprimée telle quelle ferait encaisser dix fois
   * trop, et rien en aval ne le rattraperait. */
  const cur = str(o && (o.currency || o.presentment_currency), 8).toUpperCase();
  if (cur && cur !== 'MAD') {
    await mark(env, link.id, false, 'devise ' + cur + ' — seul le dirham est géré');
    return json({ error: 'bad-currency', currency: cur }, 422);
  }

  const t = translate(o);
  const merchant = String(link.merchant || '').toLowerCase();

  if (t.total <= 0 || t.total > MAX_TOTAL) {
    await mark(env, link.id, false, 'total absent ou hors bornes');
    return json({ error: 'bad-total' }, 400);
  }
  if (!t.lines.length) {
    await mark(env, link.id, false, 'commande sans ligne');
    return json({ error: 'empty-order' }, 400);
  }

  /* Shopify REPOUSSE : toute réponse hors 2xx est réessayée jusqu'à 48 h, et un
   * pic de latence suffit. Deux tickets pour une commande, c'est un plat
   * préparé deux fois. */
  if (t.ref) {
    try {
      const dup = await env.DB.prepare(
        'SELECT id, number FROM orders WHERE merchant = ? AND channel = ? AND ext_ref = ?'
      ).bind(merchant, CHANNEL, t.ref).first();
      if (dup) {
        await mark(env, link.id, true);
        return json({ ok: true, id: dup.id, number: dup.number, duplicate: true });
      }
    } catch (_) { /* colonnes pas encore ajoutées → l'insert le dira */ }
  }

  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'"
    ).bind(merchant).first();
    if (pending && pending.n >= MAX_PENDING) {
      await mark(env, link.id, false, 'file d\'attente pleine');
      return json({ error: 'queue-full' }, 429);
    }
  } catch (_) {}

  const now = Date.now();
  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);

  let row;
  try {
    // Le numéro est attribué DANS l'insert : deux canaux qui déposent la même
    // seconde ne peuvent pas recevoir le même numéro.
    row = await env.DB.prepare(
      `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                           created_ts, updated_ts, channel, ext_ref, customer)
       SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, '', ?, ?, 'pending', ?, ?, ?, ?, ?
         FROM orders WHERE merchant = ? AND created_ts >= ?
       RETURNING number`
    ).bind(
      id, merchant, t.mode, t.total, JSON.stringify(t.lines), now, now,
      CHANNEL, t.ref, JSON.stringify(t.customer),
      merchant, startOfWeek(now)
    ).first();
  } catch (e) {
    /* The SELECT before INSERT cannot serialize concurrent Shopify retries.
     * The unique database index does; after losing that race, return the row
     * created by the winner as a successful replay. */
    if (t.ref) {
      try {
        const raced = await env.DB.prepare(
          'SELECT id, number FROM orders WHERE merchant = ? AND channel = ? AND ext_ref = ?'
        ).bind(merchant, CHANNEL, t.ref).first();
        if (raced) {
          await mark(env, link.id, true);
          return json({ ok: true, id: raced.id, number: raced.number, duplicate: true });
        }
      } catch (_) { /* preserve the original write error below */ }
    }
    const detail = String((e && e.message) || e);
    await mark(env, link.id, false, detail);
    return json({ error: 'write-failed', detail }, 500);
  }

  await mark(env, link.id, true);
  return json({ ok: true, id, number: (row && row.number) || 1 });
}
