// /api/channel/keys — les clés qu'un commerçant remet à ses canaux extérieurs.
//
//   GET                         → { ok, keys:[{id, channel, label, status, created_ts, last_ts, last_err}] }
//   POST { channel, label }     → { ok, key:{…}, token }   ← le secret, UNE seule fois
//   POST { id, status }         → { ok }                   ← 'paused' | 'active'
//   POST { id, revoke:true }    → { ok }
//
// Derrière la porte normale du site, contrairement à /api/channel/order : c'est
// le commerçant qui gère ses propres clés, avec sa session. La tenancy passe par
// `tenantFor` — la même règle que l'inventaire, la carte et le carnet clients,
// pour qu'il n'existe pas une deuxième idée de qui possède quoi.
//
// ── Le secret n'est montré qu'une fois ──────────────────────────────────────
// La base ne garde qu'un SHA-256. Un écran qui saurait réafficher le jeton
// serait un écran où le voler suffit à déposer des commandes chez le
// commerçant ; et « je l'ai perdu » se répare en créant une clé et en
// supprimant l'ancienne, ce qui est de toute façon le bon geste.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

const CHANNELS = { glovo: 1, yassir: 1, shopify: 1, generic: 1 };
const MAX_KEYS = 12;              // par magasin : au-delà, c'est un oubli, pas un besoin
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 32 octets de hasard, en base64url. C'est l'entropie du secret — et non un
 * étirement de type PBKDF2 — qui le rend impossible à deviner ; voir la note de
 * schema.sql sur channel_links. */
function mintSecret() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const shape = (r) => ({
  id: r.id, channel: r.channel, label: r.label || '', status: r.status,
  created_ts: r.created_ts || 0, last_ts: r.last_ts || 0, last_err: r.last_err || '',
});

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: true, keys: [] });
  const merchant = await tenantFor(request, env, new URL(request.url).searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  try {
    const rs = await env.DB.prepare(
      `SELECT id, channel, label, status, created_ts, last_ts, last_err
         FROM channel_links WHERE merchant = ? ORDER BY created_ts DESC LIMIT ?`
    ).bind(merchant, MAX_KEYS + 4).all();
    return json({ ok: true, merchant, keys: (rs.results || []).map(shape) });
  } catch (_) {
    // Table pas encore migrée : aucune clé, pas une erreur. L'écran affiche
    // « aucun canal connecté », ce qui est exactement la vérité.
    return json({ ok: true, merchant, keys: [], unmigrated: true });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = await tenantFor(request, env, b && b.merchant);
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  /* ── Modifier une clé existante ──────────────────────────────────────────
   * `merchant` est dans le WHERE, et il est dérivé du serveur : connaître
   * l'identifiant d'une clé ne suffit pas à la mettre en pause chez autrui. */
  const id = str(b && b.id, 64);

  /* ── Enregistrer la clé de signature Shopify ──────────────────────────────
   * Shopify fabrique ce secret lui-même et ne le montre qu'une fois, dans
   * l'écran qui crée le webhook. Il voyage donc dans l'autre sens que le nôtre :
   * c'est le commerçant qui nous le confie, pour qu'on puisse vérifier le HMAC
   * de chaque commande (functions/api/channel/shopify/[link].js).
   *
   * Il ne ressort JAMAIS. `shape()` ne le lit pas, aucune route ne le renvoie —
   * un écran capable de le réafficher serait un écran où le voler suffit à
   * signer de fausses commandes. « Je l'ai perdu » se répare dans Shopify, en
   * regénérant le webhook. */
  if (id && b && b.config && typeof b.config === 'object') {
    const secret = str(b.config.shopifySecret, 200);
    if (!secret) return json({ error: 'bad-config' }, 400);
    const cfg = JSON.stringify({
      shopifySecret: secret,
      shop: str(b.config.shop, 120).toLowerCase(),
    });
    try {
      const row = await env.DB.prepare(
        "UPDATE channel_links SET config = ? WHERE id = ? AND merchant = ? AND channel = 'shopify' RETURNING id"
      ).bind(cfg, id, merchant).first();
      if (!row) return json({ error: 'not-found' }, 404);
      return json({ ok: true, id, configured: true });
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  if (id) {
    const revoke = !!(b && b.revoke);
    const status = b && b.status === 'paused' ? 'paused' : 'active';
    try {
      const row = await env.DB.prepare(
        revoke ? 'DELETE FROM channel_links WHERE id = ? AND merchant = ? RETURNING id'
               : 'UPDATE channel_links SET status = ? WHERE id = ? AND merchant = ? RETURNING id'
      ).bind(...(revoke ? [id, merchant] : [status, id, merchant])).first();
      if (!row) return json({ error: 'not-found' }, 404);
      return json({ ok: true, id, revoked: revoke, status: revoke ? '' : status });
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* ── Créer une clé ───────────────────────────────────────────────────────── */
  const channel = CHANNELS[str(b && b.channel, 16)] ? String(b.channel) : '';
  if (!channel) return json({ error: 'bad-channel' }, 400);

  try {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM channel_links WHERE merchant = ?')
      .bind(merchant).first();
    if (n && n.n >= MAX_KEYS) return json({ error: 'too-many-keys' }, 409);
  } catch (_) {
    // La table n'existe pas : le dire, plutôt que de remettre au commerçant un
    // jeton qui ne servira jamais.
    return json({ error: 'unmigrated' }, 503);
  }

  const keyId = 'chl-' + crypto.randomUUID();
  const secret = mintSecret();
  const now = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO channel_links (id, merchant, channel, label, hash, config, status, created_ts)
       VALUES (?, ?, ?, ?, ?, NULL, 'active', ?)`
    ).bind(keyId, merchant, channel, str(b && b.label, 60), await sha256Hex(secret), now).run();
  } catch (e) {
    return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
  }

  return json({
    ok: true,
    key: shape({ id: keyId, channel, label: str(b && b.label, 60), status: 'active', created_ts: now }),
    // La seule fois où il sort de la base. Le client doit l'afficher tout de
    // suite et prévenir qu'il ne reviendra pas.
    token: 'kwc.' + keyId + '.' + secret,
    endpoint: new URL('/api/channel/order', request.url).toString(),
    /* Shopify ne peut pas envoyer d'en-tête : son adresse porte donc l'identité
     * dans le chemin, et c'est la signature qui authentifie. L'identifiant de
     * lien n'est pas un secret — il ne vaut rien sans la clé de signature que
     * le commerçant nous confiera ensuite. */
    webhook: channel === 'shopify'
      ? new URL('/api/channel/shopify/' + keyId, request.url).toString()
      : '',
  });
}
