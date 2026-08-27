// Public OAuth callback. The short-lived hashed state binds the Shopify shop
// back to the authenticated Kiwi merchant that initiated the connection.

import {
  encryptToken, exchangeAuthorizationCode, normalizeShopDomain, sha256Hex,
  shopifyGraphQL, verifyOAuthHmac,
} from './_lib.js';

const redirect = (request, value) => {
  const target = new URL('/dashboard.html', request.url);
  target.searchParams.set('shopify', value);
  return Response.redirect(target.toString(), 302);
};

async function registerWebhooks(env, merchant, linkId, request) {
  const appUrl = String(env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(/\/$/, '');
  const uri = `${appUrl}/api/channel/shopify/${linkId}`;
  const query = `mutation KiwiWebhook($topic: WebhookSubscriptionTopic!, $webhook: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhook) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`;
  const failures = [];
  for (const topic of ['ORDERS_CREATE', 'INVENTORY_LEVELS_UPDATE', 'APP_UNINSTALLED']) {
    try {
      const out = await shopifyGraphQL(env, merchant, query, { topic, webhook: { uri } });
      const errors = (out.data.webhookSubscriptionCreate && out.data.webhookSubscriptionCreate.userErrors) || [];
      // Re-authorising can encounter an already-existing subscription. That is
      // healthy and must not make the connector look broken.
      const real = errors.filter((e) => !/already|taken|exists/i.test(String(e && e.message || '')));
      if (real.length) failures.push(`${topic}: ${real.map((e) => e.message).join(' · ')}`);
    } catch (e) { failures.push(`${topic}: ${e && e.message || e}`); }
  }
  return failures.join(' · ').slice(0, 600);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET || !env.SHOPIFY_TOKEN_KEY) return redirect(request, 'not-configured');
  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get('shop'));
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!shop || !state || !code || !(await verifyOAuthHmac(url, env.SHOPIFY_CLIENT_SECRET))) return redirect(request, 'invalid');

  let stateRow;
  try {
    stateRow = await env.DB.prepare(
      `DELETE FROM shopify_oauth_states
        WHERE state_hash = ? AND shop_domain = ? AND expires_ts >= ?
        RETURNING merchant, shop_domain`
    ).bind(await sha256Hex(state), shop, Date.now()).first();
  } catch (_) { return redirect(request, 'schema-missing'); }
  if (!stateRow || stateRow.shop_domain !== shop) return redirect(request, 'expired');

  let token;
  try { token = await exchangeAuthorizationCode(env, shop, code); }
  catch (_) { return redirect(request, 'oauth-failed'); }

  const merchant = stateRow.merchant;
  const now = Date.now();
  let existing = null;
  try { existing = await env.DB.prepare('SELECT merchant, shop_domain, channel_link_id, connected_ts FROM shopify_connections WHERE merchant = ?').bind(merchant).first(); }
  catch (_) {}
  const linkId = existing && existing.channel_link_id || `chl-${crypto.randomUUID()}`;
  const linkSecret = crypto.randomUUID() + crypto.randomUUID();
  try {
    const collision = await env.DB.prepare('SELECT merchant FROM shopify_connections WHERE shop_domain = ? AND merchant <> ?').bind(shop, merchant).first();
    if (collision) return redirect(request, 'already-connected');
    const writes = [
      env.DB.prepare(
        `INSERT INTO shopify_connections
          (merchant, shop_domain, access_token_enc, refresh_token_enc, token_expires_ts,
           refresh_expires_ts, scopes, location_id, location_name, channel_link_id,
           status, connected_ts, updated_ts, last_sync_ts, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, 'needs_location', ?, ?, 0, '')
         ON CONFLICT (merchant) DO UPDATE SET
           shop_domain = excluded.shop_domain,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           token_expires_ts = excluded.token_expires_ts,
           refresh_expires_ts = excluded.refresh_expires_ts,
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
        await encryptToken(token.refresh_token, env.SHOPIFY_TOKEN_KEY),
        now + Math.max(60, Number(token.expires_in) || 3600) * 1000,
        now + Math.max(3600, Number(token.refresh_token_expires_in) || 7776000) * 1000,
        String(token.scope || ''), linkId, existing && existing.connected_ts || now, now
      ),
      env.DB.prepare(
        `INSERT INTO channel_links (id, merchant, channel, label, hash, config, status, created_ts)
         VALUES (?, ?, 'shopify', ?, ?, ?, 'active', ?)
         ON CONFLICT (id) DO UPDATE SET config = excluded.config, status = 'active', label = excluded.label`
      ).bind(linkId, merchant, shop, await sha256Hex(linkSecret), JSON.stringify({ oauth: true, shop }), now),
    ];
    if (existing && existing.shop_domain !== shop) {
      writes.push(
        env.DB.prepare('DELETE FROM shopify_variant_links WHERE merchant = ?').bind(merchant),
        env.DB.prepare('DELETE FROM shopify_sync_outbox WHERE merchant = ?').bind(merchant)
      );
    }
    await env.DB.batch(writes);
  } catch (_) { return redirect(request, 'save-failed'); }

  const webhookError = await registerWebhooks(env, merchant, linkId, request);
  if (webhookError) {
    await env.DB.prepare('UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?')
      .bind(webhookError, Date.now(), merchant).run().catch(() => {});
  }
  return redirect(request, webhookError ? 'connected-warning' : 'connected');
}

export const __test = { registerWebhooks };
