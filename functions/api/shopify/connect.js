// Starts the standalone OAuth grant from Kiwi's authenticated Integrations UI.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { normalizeShopDomain, sha256Hex, SHOPIFY_SCOPES } from './_lib.js';

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET || !env.SHOPIFY_TOKEN_KEY) {
    return json({ error: 'shopify-not-configured' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const shop = normalizeShopDomain(body && body.shop);
  if (!shop) return json({ error: 'bad-shop-domain' }, 400);

  const now = Date.now();
  const state = randomState();
  try {
    const current = await env.DB.prepare(
      'SELECT shop_domain, status FROM shopify_connections WHERE merchant = ?'
    ).bind(merchant).first();
    if (current && current.shop_domain !== shop && current.status !== 'disconnected') {
      return json({ error: 'merchant-already-connected', shop: current.shop_domain }, 409);
    }
    const owner = await env.DB.prepare('SELECT merchant FROM shopify_connections WHERE shop_domain = ?').bind(shop).first();
    if (owner && owner.merchant !== merchant) return json({ error: 'shop-already-connected' }, 409);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM shopify_oauth_states WHERE expires_ts < ?').bind(now),
      env.DB.prepare(
        `INSERT INTO shopify_oauth_states (state_hash, merchant, shop_domain, created_ts, expires_ts)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(await sha256Hex(state), merchant, shop, now, now + 10 * 60 * 1000),
    ]);
  } catch (_) { return json({ error: 'shopify-schema-missing' }, 503); }

  const appUrl = String(env.SHOPIFY_APP_URL || 'https://kiwi-os.com').replace(/\/$/, '');
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set('client_id', env.SHOPIFY_CLIENT_ID);
  authorize.searchParams.set('scope', SHOPIFY_SCOPES);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);
  return json({ ok: true, authorize: authorize.toString(), shop });
}
