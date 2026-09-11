/* Connexion Shopify par DON D'IDENTIFIANTS (client credentials).
 *
 * ── Pourquoi ce second chemin existe ───────────────────────────────────────
 * `connect.js` ouvre la ronde classique : on envoie le marchand chez Shopify,
 * il autorise, Shopify le renvoie sur `/api/shopify/callback` avec un `code`.
 * Cette ronde suppose deux choses que toutes les installations n'ont pas : une
 * App URL publique et joignable, et une app qui appartient à une organisation
 * DIFFÉRENTE de la boutique. Une app dont l'App URL est restée sur
 * `https://example.com` affiche « Example Domain » et ne peut rien renvoyer.
 *
 * Quand l'app et la boutique sont dans la MÊME organisation Shopify, la
 * boutique nous connaît déjà : Shopify accepte alors un simple POST serveur à
 * serveur, sans redirection, sans `state`, sans callback public. C'est ce que
 * fait ce fichier. Rien d'autre ne change : le jeton est chiffré au repos par
 * la même clé, les webhooks sont les mêmes, la suite du connecteur ne sait pas
 * lequel des deux dons l'a produit.
 *
 * ── Ce qui ne franchit jamais la frontière du navigateur ───────────────────
 * Le secret client vit dans `env.SHOPIFY_CLIENT_SECRET`, côté Cloudflare. Le
 * navigateur n'envoie QUE le domaine de la boutique et ne reçoit jamais ni le
 * secret ni le jeton — seulement l'état de la connexion. Aucune des deux
 * valeurs n'est journalisée, y compris dans les messages d'erreur : on ne
 * relaie que le code HTTP de Shopify.
 */

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import {
  encryptToken, exchangeClientCredentials, normalizeShopDomain,
  registerWebhooks, sha256Hex,
} from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET || !env.SHOPIFY_CLIENT_ID
      || !env.SHOPIFY_CLIENT_SECRET || !env.SHOPIFY_TOKEN_KEY) {
    return json({ error: 'shopify-not-configured' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  /* `strict` : seule la session propriétaire relie une boutique. Un jeton de
   * caisse appairée lit beaucoup de choses ; il ne relie pas un compte
   * marchand à une boutique Shopify. */
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const shop = normalizeShopDomain(body && body.shop);
  if (!shop) return json({ error: 'bad-shop-domain' }, 400);

  /* Mêmes verrous d'exclusivité que la ronde OAuth : un marchand n'a qu'une
   * boutique, une boutique n'a qu'un marchand. Vérifiés AVANT de demander un
   * jeton, pour ne pas en créer un qu'on jetterait. */
  let existing = null;
  try {
    existing = await env.DB.prepare(
      'SELECT merchant, shop_domain, channel_link_id, connected_ts, status FROM shopify_connections WHERE merchant = ?'
    ).bind(merchant).first();
    if (existing && existing.shop_domain !== shop && existing.status !== 'disconnected') {
      return json({ error: 'merchant-already-connected', shop: existing.shop_domain }, 409);
    }
    const owner = await env.DB.prepare(
      'SELECT merchant FROM shopify_connections WHERE shop_domain = ? AND merchant <> ?'
    ).bind(shop, merchant).first();
    if (owner) return json({ error: 'shop-already-connected' }, 409);
  } catch (_) { return json({ error: 'shopify-schema-missing' }, 503); }

  let token;
  try { token = await exchangeClientCredentials(env, shop); }
  catch (e) {
    /* 401/403 côté Shopify veut presque toujours dire l'une de trois choses :
     * l'app n'est pas installée sur cette boutique, les deux ne sont pas dans
     * la même organisation, ou les identifiants configurés sont ceux d'une
     * autre app. Le message le dit sans rien révéler des identifiants.
     *
     * ── Pourquoi 409 et surtout pas 5xx ───────────────────────────────────
     * Cloudflare REMPLACE le corps de toute réponse 5xx d'une Pages Function
     * par sa propre page « Error 502: Bad gateway ». Mesuré en production le
     * 2026-09-06 : `{shop:'pas-un-domaine'}` revenait bien en 400 avec notre
     * JSON, tandis que le refus d'identifiants revenait en 502 avec la page
     * de Cloudflare — le `detail` qui dit POURQUOI n'atteignait donc jamais
     * l'écran, et le refus ressemblait à une panne de Kiwi. Un code 4xx passe
     * intact. Ce n'est pas une préférence de style : c'est la différence entre
     * un diagnostic et un cul-de-sac. */
    const code = String((e && e.message) || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 60);
    return json({ error: 'client-credentials-refused', detail: code, shop }, 409);
  }

  const now = Date.now();
  const linkId = (existing && existing.channel_link_id) || `chl-${crypto.randomUUID()}`;
  const linkSecret = crypto.randomUUID() + crypto.randomUUID();
  try {
    const writes = [
      env.DB.prepare(
        `INSERT INTO shopify_connections
          (merchant, shop_domain, access_token_enc, refresh_token_enc, token_expires_ts,
           refresh_expires_ts, scopes, location_id, location_name, channel_link_id,
           status, connected_ts, updated_ts, last_sync_ts, last_error)
         VALUES (?, ?, ?, NULL, ?, 0, ?, '', '', ?, 'needs_location', ?, ?, 0, '')
         ON CONFLICT (merchant) DO UPDATE SET
           shop_domain = excluded.shop_domain,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = NULL,
           token_expires_ts = excluded.token_expires_ts,
           refresh_expires_ts = 0,
           scopes = excluded.scopes,
           channel_link_id = excluded.channel_link_id,
           location_id = CASE WHEN shopify_connections.shop_domain <> excluded.shop_domain THEN '' ELSE shopify_connections.location_id END,
           location_name = CASE WHEN shopify_connections.shop_domain <> excluded.shop_domain THEN '' ELSE shopify_connections.location_name END,
           status = CASE
             WHEN shopify_connections.shop_domain <> excluded.shop_domain THEN 'needs_location'
             WHEN shopify_connections.location_id = '' THEN 'needs_location'
             WHEN shopify_connections.status = 'active' THEN 'active'
             ELSE 'ready'
           END,
           updated_ts = excluded.updated_ts,
           last_error = ''`
      ).bind(
        merchant, shop,
        await encryptToken(token.access_token, env.SHOPIFY_TOKEN_KEY),
        /* Shopify annonce ~24 h. On lit `expires_in` plutôt que de le supposer,
         * et `accessTokenFor` en redemande un deux minutes avant la fin. */
        now + Math.max(60, Number(token.expires_in) || 86400) * 1000,
        String(token.scope || ''), linkId,
        (existing && existing.connected_ts) || now, now
      ),
      env.DB.prepare(
        `INSERT INTO channel_links (id, merchant, channel, label, hash, config, status, created_ts)
         VALUES (?, ?, 'shopify', ?, ?, ?, 'active', ?)
         ON CONFLICT (id) DO UPDATE SET config = excluded.config, status = 'active', label = excluded.label`
      ).bind(linkId, merchant, shop, await sha256Hex(linkSecret),
        JSON.stringify({ oauth: false, grant: 'client_credentials', shop }), now),
    ];
    /* Changer de boutique invalide toute correspondance d'articles : les
     * identifiants de variantes appartiennent à l'ancienne. */
    if (existing && existing.shop_domain !== shop) {
      writes.push(
        env.DB.prepare('DELETE FROM shopify_variant_links WHERE merchant = ?').bind(merchant),
        env.DB.prepare('DELETE FROM shopify_sync_outbox WHERE merchant = ?').bind(merchant)
      );
    }
    await env.DB.batch(writes);
  } catch (_) { return json({ error: 'save-failed' }, 503); }

  const webhookError = await registerWebhooks(env, merchant, linkId, request);
  if (webhookError) {
    await env.DB.prepare('UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?')
      .bind(webhookError, Date.now(), merchant).run().catch(() => {});
  }

  /* Jamais le jeton, jamais le secret : seulement de quoi peindre l'écran. */
  return json({
    ok: true, shop, grant: 'client_credentials',
    status: 'needs_location',
    warning: webhookError ? 'webhooks-partial' : undefined,
  });
}
