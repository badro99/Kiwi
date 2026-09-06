// Shopify inventory connector shared by Pages Functions and the retry worker.
// No token is ever returned to the browser: D1 stores AES-GCM ciphertext only.

export const SHOPIFY_API_VERSION = '2026-07';
export const SHOPIFY_SCOPES = 'read_products,read_inventory,write_inventory,read_orders,read_locations';

const enc = new TextEncoder();
const dec = new TextDecoder();
const clampQty = (v) => Math.max(0, Math.min(1000000000, Math.round(Number(v) || 0)));
const small = (v, n = 240) => String(v == null ? '' : v).slice(0, n);

function bytesToB64(bytes) {
  let s = '';
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(value) {
  const s = atob(String(value || ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function normalizeShopDomain(value) {
  let s = String(value || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
  if (!s.includes('.')) s += '.myshopify.com';
  return /^[a-z0-9][a-z0-9-]{1,62}\.myshopify\.com$/.test(s) ? s : '';
}

export async function sha256Hex(value) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(String(value || '')));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTime(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmac(secret, message, format) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(message || ''))));
  if (format === 'hex') return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  return bytesToB64(sig);
}

export async function verifyOAuthHmac(url, secret) {
  if (!secret) return false;
  const u = url instanceof URL ? url : new URL(url);
  const sent = u.searchParams.get('hmac') || '';
  const pairs = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (key !== 'hmac' && key !== 'signature') pairs.push([key, value]);
  }
  pairs.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const message = pairs.map(([key, value]) => `${key}=${value}`).join('&');
  return constantTime(sent, await hmac(secret, message, 'hex'));
}

export async function verifyWebhookHmac(raw, sent, secret) {
  return !!secret && constantTime(sent, await hmac(secret, raw, 'base64'));
}

async function tokenKey(secret) {
  if (!secret || String(secret).length < 24) throw new Error('shopify-token-key-missing');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(String(secret)));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(value, secret) {
  if (!value) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(secret), enc.encode(String(value)));
  return `v1.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(body))}`;
}

export async function decryptToken(value, secret) {
  if (!value) return '';
  const parts = String(value).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('shopify-token-format');
  const body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(parts[1]) }, await tokenKey(secret), b64ToBytes(parts[2]));
  return dec.decode(body);
}

export async function exchangeAuthorizationCode(env, shop, code) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.SHOPIFY_CLIENT_ID || '',
      client_secret: env.SHOPIFY_CLIENT_SECRET || '',
      code: String(code || ''),
      expiring: '1',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token || !data.refresh_token) throw new Error(`shopify-oauth-${res.status}`);
  return data;
}

/* ── Le don d'identifiants client (client credentials) ──────────────────────
 * Shopify n'impose la ronde du navigateur — autoriser, rediriger, revenir avec
 * un `code` — que lorsque l'app et la boutique appartiennent à des
 * organisations DIFFÉRENTES. Quand elles sont dans la même organisation, la
 * boutique nous connaît déjà : un POST serveur à serveur suffit, sans `state`,
 * sans redirection, sans callback public. C'est le seul chemin praticable quand
 * l'app n'a pas d'App URL publique — Shopify affiche alors « Example Domain »
 * et l'autorisation ne peut pas revenir.
 *
 * Ce que Shopify rend ici ne comporte PAS de `refresh_token` : le jeton vit
 * environ 24 h et on en redemande un, avec les mêmes identifiants, quand il
 * approche de sa fin. C'est précisément ce qui distingue les deux modes en
 * base, et pourquoi aucune colonne nouvelle n'est nécessaire : voir
 * `isClientCredentials`. */
export async function exchangeClientCredentials(env, shop) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.SHOPIFY_CLIENT_ID || '',
      client_secret: env.SHOPIFY_CLIENT_SECRET || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  /* Le corps d'erreur de Shopify peut contenir de quoi identifier l'app. On ne
   * relaie que le code HTTP : ni le secret, ni le corps, ne doivent atteindre
   * un log ou une réponse. */
  if (!res.ok || !data.access_token) throw new Error(`shopify-client-credentials-${res.status}`);
  return data;
}

/* Une connexion par don d'identifiants n'a pas de jeton de rafraîchissement —
 * `exchangeAuthorizationCode` en exige un et refuse sans, donc son absence
 * identifie le mode sans ambiguïté et sans colonne supplémentaire. C'est
 * délibéré : une colonne neuve serait absente de la base DÉPLOYÉE tant que la
 * migration n'a pas été passée, et tout ce fichier retomberait en silence dans
 * le mauvais mode — l'exacte panne que ce dépôt a déjà connue trois fois. */
export function isClientCredentials(row) {
  return !!row && !row.refresh_token_enc;
}

async function refreshConnectionToken(env, row) {
  /* Deux façons d'obtenir un jeton neuf, un seul appelant. Le don
   * d'identifiants n'a rien à rafraîchir : on redemande simplement, avec les
   * mêmes identifiants d'app, ce que la boutique nous donnerait aujourd'hui. */
  let data;
  if (isClientCredentials(row)) {
    data = await exchangeClientCredentials(env, row.shop_domain);
  } else {
    const refresh = await decryptToken(row.refresh_token_enc, env.SHOPIFY_TOKEN_KEY);
    if (!refresh) throw new Error('shopify-refresh-missing');
    const res = await fetch(`https://${row.shop_domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.SHOPIFY_CLIENT_ID || '',
        client_secret: env.SHOPIFY_CLIENT_SECRET || '',
        refresh_token: refresh,
      }),
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token || !data.refresh_token) throw new Error(`shopify-refresh-${res.status}`);
  }
  const now = Date.now();
  // Refreshing a token must never activate inventory writes before the merchant
  // confirms the mapping preview.
  const status = row.status === 'active' ? 'active' : row.location_id ? 'ready' : 'needs_location';
  await env.DB.prepare(
    `UPDATE shopify_connections
        SET access_token_enc = ?, refresh_token_enc = ?, token_expires_ts = ?,
            refresh_expires_ts = ?, status = ?, updated_ts = ?, last_error = ''
      WHERE merchant = ?`
  ).bind(
    await encryptToken(data.access_token, env.SHOPIFY_TOKEN_KEY),
    /* NULL, et non une chaîne chiffrée vide : c'est cette absence qui dit
     * « don d'identifiants » au prochain passage. L'écraser romprait le mode. */
    data.refresh_token ? await encryptToken(data.refresh_token, env.SHOPIFY_TOKEN_KEY) : null,
    now + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    data.refresh_token ? now + Math.max(3600, Number(data.refresh_token_expires_in) || 7776000) * 1000 : 0,
    status, now, row.merchant
  ).run();
  return data.access_token;
}

/* Les abonnements aux webhooks sont identiques quel que soit le don qui a
 * produit le jeton. Ils vivaient dans callback.js ; les deux chemins de
 * connexion les partagent désormais, pour qu'un sujet ajouté ici n'oublie
 * jamais l'autre mode. */
export async function registerWebhooks(env, merchant, linkId, request) {
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


export async function connectionFor(env, merchant) {
  return env.DB.prepare(
    `SELECT merchant, shop_domain, access_token_enc, refresh_token_enc,
            token_expires_ts, refresh_expires_ts, scopes, location_id,
            location_name, channel_link_id, status, connected_ts, updated_ts,
            last_sync_ts, last_error
       FROM shopify_connections WHERE merchant = ?`
  ).bind(merchant).first();
}

export async function accessTokenFor(env, merchant) {
  let row = await connectionFor(env, merchant);
  if (!row || row.status === 'disconnected') throw new Error('shopify-not-connected');
  if (Number(row.token_expires_ts || 0) > Date.now() + 120000) {
    return { row, token: await decryptToken(row.access_token_enc, env.SHOPIFY_TOKEN_KEY) };
  }
  /* Se réautoriser n'a de sens que pour le code d'autorisation : là, le jeton
   * de rafraîchissement finit par périmer et seul le marchand peut le renouveler
   * dans son navigateur. Le don d'identifiants, lui, n'a pas de fin — tant que
   * l'app reste installée, on redemande un jeton. Faire tomber cette branche
   * dessus déconnecterait la boutique toutes les 24 h. */
  if (!isClientCredentials(row) && Number(row.refresh_expires_ts || 0) <= Date.now()) {
    throw new Error('shopify-reauthorize');
  }
  const lock = await sha256Hex(`shopify-refresh:${merchant}`);
  const now = Date.now();
  let acquired = false;
  try {
    await env.DB.prepare(
      'DELETE FROM shopify_oauth_states WHERE state_hash = ? AND expires_ts <= ?'
    ).bind(lock, now).run();
    const write = await env.DB.prepare(
      `INSERT OR IGNORE INTO shopify_oauth_states (state_hash, merchant, shop_domain, created_ts, expires_ts)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(lock, merchant, row.shop_domain, now, now + 120000).run();
    acquired = !!(write && write.meta && Number(write.meta.changes) === 1);
  } catch (_) {}
  if (!acquired) {
    // Another request is refreshing. The old access token remains valid during
    // the two-minute early-refresh window, so concurrent sales keep flowing.
    if (Number(row.token_expires_ts || 0) > now) {
      return { row, token: await decryptToken(row.access_token_enc, env.SHOPIFY_TOKEN_KEY) };
    }
    throw new Error('shopify-refresh-in-progress');
  }
  try {
    const token = await refreshConnectionToken(env, row);
    row = await connectionFor(env, merchant);
    return { row, token };
  } finally {
    await env.DB.prepare('DELETE FROM shopify_oauth_states WHERE state_hash = ?').bind(lock).run().catch(() => {});
  }
}

export async function shopifyGraphQL(env, merchant, query, variables) {
  const { row, token } = await accessTokenFor(env, merchant);
  const res = await fetch(`https://${row.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || (Array.isArray(payload.errors) && payload.errors.length)) {
    const message = (payload.errors || []).map((e) => e && e.message).filter(Boolean).join(' · ');
    throw new Error(small(message || `shopify-graphql-${res.status}`, 300));
  }
  return { row, data: payload.data || {} };
}

export async function listLocations(env, merchant) {
  const q = `query KiwiLocations { locations(first: 100, includeInactive: false) { nodes { id name isActive } } }`;
  const out = await shopifyGraphQL(env, merchant, q, {});
  return ((out.data.locations && out.data.locations.nodes) || []).filter((x) => x && x.id && x.isActive !== false);
}

export async function listShopifyVariants(env, merchant, locationId) {
  const query = `query KiwiVariants($after: String, $location: ID!) {
    productVariants(first: 100, after: $after) {
      nodes {
        id title sku barcode
        product { id title }
        inventoryItem {
          id tracked
          inventoryLevel(locationId: $location) { quantities(names: ["available"]) { name quantity } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  const all = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const out = await shopifyGraphQL(env, merchant, query, { after, location: locationId });
    const conn = out.data.productVariants || {};
    for (const v of conn.nodes || []) {
      const level = v && v.inventoryItem && v.inventoryItem.inventoryLevel;
      const available = level && (level.quantities || []).find((q) => q && q.name === 'available');
      all.push({
        id: small(v && v.id, 120),
        productId: small(v && v.product && v.product.id, 120),
        productTitle: small(v && v.product && v.product.title, 120),
        variantTitle: small(v && v.title, 80),
        inventoryItemId: small(v && v.inventoryItem && v.inventoryItem.id, 120),
        title: small(`${v && v.product && v.product.title || ''} · ${v && v.title || ''}`, 220),
        sku: small(v && v.sku, 120).trim(),
        barcode: small(v && v.barcode, 120).trim(),
        tracked: !!(v && v.inventoryItem && v.inventoryItem.tracked),
        quantity: available ? clampQty(available.quantity) : null,
      });
    }
    if (!conn.pageInfo || !conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return all.filter((v) => v.id && v.inventoryItemId && v.tracked);
}

function indexUnique(rows, valuesFor) {
  const map = new Map();
  for (const row of rows) {
    for (const raw of valuesFor(row)) {
      const key = String(raw || '').trim().toLowerCase();
      if (!key) continue;
      const list = map.get(key) || [];
      if (!list.includes(row)) list.push(row);
      map.set(key, list);
    }
  }
  return map;
}

export function buildExactVariantMapping(catalog, shopifyVariants) {
  const products = new Map(((catalog && catalog.products) || []).map((p) => [String(p.id), p]));
  const kiwi = ((catalog && catalog.variants) || []).map((v) => ({
    id: String(v.id || ''),
    title: `${(products.get(String(v.productId)) || {}).name || ''} · ${v.colorLabel || v.colorFamily || ''} · ${v.size || ''}`,
    sku: String(v.sku || (products.get(String(v.productId)) || {}).sku || '').trim(),
    barcodes: (Array.isArray(v.barcodes) ? v.barcodes : []).map((b) => String(typeof b === 'string' ? b : b && b.code || '').trim()).filter(Boolean),
    stock: clampQty(v.stock),
  })).filter((v) => v.id);
  const shop = (shopifyVariants || []).filter((v) => v && v.id && v.inventoryItemId);
  const kb = indexUnique(kiwi, (v) => v.barcodes);
  const sb = indexUnique(shop, (v) => [v.barcode]);
  const ks = indexUnique(kiwi, (v) => [v.sku]);
  const ss = indexUnique(shop, (v) => [v.sku]);
  const used = new Set();
  const matches = [], ambiguous = [], unmatched = [];
  for (const v of kiwi) {
    let hit = null, method = '', hasAmbiguousIdentifier = false;
    const barcodeCandidates = new Set();
    for (const code of v.barcodes) {
      const key = code.toLowerCase();
      const left = kb.get(key) || [], right = sb.get(key) || [];
      if (left.length === 1 && right.length === 1) barcodeCandidates.add(right[0]);
      else if (left.length && right.length) hasAmbiguousIdentifier = true;
    }
    if (barcodeCandidates.size === 1) { hit = [...barcodeCandidates][0]; method = 'barcode'; }
    if (!hit && v.sku) {
      const key = v.sku.toLowerCase();
      const left = ks.get(key) || [], right = ss.get(key) || [];
      if (left.length === 1 && right.length === 1) { hit = right[0]; method = 'sku'; }
      else if (left.length && right.length) hasAmbiguousIdentifier = true;
    }
    if (hit && !used.has(hit.id)) {
      used.add(hit.id);
      matches.push({ kiwi: v, shopify: hit, method });
    } else if (hasAmbiguousIdentifier || barcodeCandidates.size > 1 || (hit && used.has(hit.id))) {
      ambiguous.push(v);
    } else {
      unmatched.push(v);
    }
  }
  return { matches, ambiguous, unmatched, unmatchedShopify: shop.filter((v) => !used.has(v.id)) };
}

export function stockSnapshot(catalog) {
  const out = new Map();
  for (const v of (catalog && catalog.variants) || []) if (v && v.id) out.set(String(v.id), clampQty(v.stock));
  return out;
}

export async function enqueueStockChanges(env, merchant, before, after, sourceRev, forceAll) {
  if (!env.DB) return 0;
  let connection;
  try { connection = await connectionFor(env, merchant); } catch (_) { return 0; }
  if (!connection || connection.status !== 'active' || !connection.location_id) return 0;
  const prior = stockSnapshot(before), next = stockSnapshot(after);
  const ids = [...next.keys()].filter((id) => forceAll || prior.get(id) !== next.get(id));
  if (!ids.length) return 0;
  let links = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT kiwi_variant_id FROM shopify_variant_links
        WHERE merchant = ? AND location_id = ? AND status = 'active'`
    ).bind(merchant, connection.location_id).all();
    links = (rs.results || []).map((r) => String(r.kiwi_variant_id));
  } catch (_) { return 0; }
  const allowed = new Set(links);
  const now = Date.now();
  const statements = ids.filter((id) => allowed.has(id)).map((id) => env.DB.prepare(
    `INSERT INTO shopify_sync_outbox
       (id, merchant, kiwi_variant_id, target_quantity, source_rev, status, attempts,
        next_attempt_ts, last_error, created_ts, updated_ts)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, '', ?, ?)
     ON CONFLICT (merchant, kiwi_variant_id) DO UPDATE SET
       id = excluded.id, target_quantity = excluded.target_quantity,
       source_rev = excluded.source_rev, status = 'pending', attempts = 0,
       next_attempt_ts = 0, last_error = '', updated_ts = excluded.updated_ts`
  ).bind(crypto.randomUUID(), merchant, id, next.get(id), Number(sourceRev) || 0, now, now));
  if (!statements.length) return 0;
  await env.DB.batch(statements);
  return statements.length;
}

function retryDelay(attempts) {
  return Math.min(3600000, Math.max(15000, (2 ** Math.min(8, attempts)) * 5000));
}

export async function flushShopifyOutbox(env, merchant, limit = 10) {
  if (!env.DB) return { processed: 0, failed: 0 };
  const now = Date.now();
  let rs;
  try {
    rs = await env.DB.prepare(
      `SELECT o.id, o.merchant, o.kiwi_variant_id, o.target_quantity, o.attempts,
              l.inventory_item_id, l.location_id, l.last_shopify_quantity
         FROM shopify_sync_outbox o
         JOIN shopify_variant_links l
           ON l.merchant = o.merchant AND l.kiwi_variant_id = o.kiwi_variant_id
        WHERE ((o.status IN ('pending','failed') AND o.next_attempt_ts <= ?)
               OR (o.status = 'processing' AND o.updated_ts < ?))
          AND l.status = 'active' AND (? = '' OR o.merchant = ?)
        ORDER BY o.updated_ts LIMIT ?`
    ).bind(now, now - 5 * 60 * 1000, merchant || '', merchant || '', Math.max(1, Math.min(50, Number(limit) || 10))).all();
  } catch (_) { return { processed: 0, failed: 0 }; }
  let processed = 0, failed = 0;
  for (const row of rs.results || []) {
    const claimed = await env.DB.prepare(
      `UPDATE shopify_sync_outbox SET status = 'processing', updated_ts = ?
        WHERE id = ? AND (status IN ('pending','failed') OR (status = 'processing' AND updated_ts < ?))`
    ).bind(Date.now(), row.id, Date.now() - 5 * 60 * 1000).run();
    if (!claimed || !claimed.meta || Number(claimed.meta.changes) !== 1) continue;
    const key = String(row.id);
    const input = {
      name: 'available',
      reason: 'correction',
      referenceDocumentUri: `https://kiwi-os.com/inventory-sync/${key}`,
      quantities: [{
        inventoryItemId: row.inventory_item_id,
        locationId: row.location_id,
        quantity: clampQty(row.target_quantity),
        changeFromQuantity: row.last_shopify_quantity == null ? null : clampQty(row.last_shopify_quantity),
      }],
    };
    const mutation = `mutation KiwiInventorySet($input: InventorySetQuantitiesInput!, $key: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $key) {
        inventoryAdjustmentGroup { changes { name delta quantityAfterChange } }
        userErrors { code field message }
      }
    }`;
    try {
      const out = await shopifyGraphQL(env, row.merchant, mutation, { input, key });
      const payload = out.data.inventorySetQuantities || {};
      const errors = payload.userErrors || [];
      if (errors.length) {
        const stale = errors.some((e) => /STALE/.test(String(e && e.code || '')));
        const message = small(errors.map((e) => e && e.message).filter(Boolean).join(' · ') || 'inventory-rejected', 300);
        await env.DB.batch([
          env.DB.prepare(`UPDATE shopify_sync_outbox SET id = ?, status = 'failed', attempts = attempts + 1, next_attempt_ts = ?, last_error = ?, updated_ts = ? WHERE id = ?`)
            .bind(crypto.randomUUID(), stale ? Date.now() + 86400000 : Date.now() + retryDelay(Number(row.attempts) + 1), message, Date.now(), row.id),
          env.DB.prepare(`UPDATE shopify_variant_links SET status = ?, updated_ts = ? WHERE merchant = ? AND kiwi_variant_id = ?`)
            .bind(stale ? 'drift' : 'active', Date.now(), row.merchant, row.kiwi_variant_id),
          env.DB.prepare(`UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?`)
            .bind(message, Date.now(), row.merchant),
        ]);
        failed++; continue;
      }
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM shopify_sync_outbox WHERE id = ?`).bind(row.id),
        env.DB.prepare(`UPDATE shopify_variant_links SET last_shopify_quantity = ?, status = 'active', updated_ts = ? WHERE merchant = ? AND kiwi_variant_id = ?`)
          .bind(clampQty(row.target_quantity), Date.now(), row.merchant, row.kiwi_variant_id),
        env.DB.prepare(`UPDATE shopify_connections SET last_sync_ts = ?, last_error = '', updated_ts = ? WHERE merchant = ?`)
          .bind(Date.now(), Date.now(), row.merchant),
      ]);
      processed++;
    } catch (e) {
      const message = small(e && e.message || e, 300);
      await env.DB.batch([
        env.DB.prepare(`UPDATE shopify_sync_outbox SET status = 'failed', attempts = attempts + 1, next_attempt_ts = ?, last_error = ?, updated_ts = ? WHERE id = ?`)
          .bind(Date.now() + retryDelay(Number(row.attempts) + 1), message, Date.now(), row.id),
        env.DB.prepare(`UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?`)
          .bind(message, Date.now(), row.merchant),
      ]).catch(() => {});
      failed++;
    }
  }
  return { processed, failed };
}
