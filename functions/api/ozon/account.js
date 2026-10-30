// /api/ozon/account — the merchant's Ozon Express connection.
//
//   GET    ?merchant=slug  → { connected, customerTail, pickupMode, connectedTs }
//   POST   { merchant, customerId, apiKey, pickupMode? } → connect (checked live with Ozon)
//   PATCH  { merchant, pickupMode }                    → change pickup mode only
//   DELETE ?merchant=slug  → disconnect (parcels and their history stay)
//
// Reading the state is open to the paired till (it decides whether to offer
// « Envoyer avec Ozon »). Changing the connection is the owner's (or a named
// operator's): entitledMerchant without the till. The key is checked against
// Ozon before it is stored, stored encrypted, and never sent back: the reply
// shows the last three digits of the customer id and nothing of the key.
import { json, sealKey, readAccount, ozonCall, exactMerchant, CUSTOMER_RE, KEY_RE } from './_lib.js';

const view = (row) => row
  ? { connected: true, customerTail: String(row.customer_id).slice(-3), pickupMode: Number(row.pickup_mode) || 0, connectedTs: Number(row.connected_ts) || 0 }
  : { connected: false };

const merchantOf = exactMerchant;
async function body(request) { try { return await request.json(); } catch (_) { return null; } }

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const merchant = await merchantOf(request, env, new URL(request.url).searchParams.get('merchant'), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  return json(view(await readAccount(env, merchant)));
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const b = await body(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  const merchant = await merchantOf(request, env, b.merchant, false);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const customerId = String(b.customerId || '').trim();
  const apiKey = String(b.apiKey || '').trim();
  if (!CUSTOMER_RE.test(customerId)) return json({ error: 'bad-customer-id' }, 400);
  if (!KEY_RE.test(apiKey)) return json({ error: 'bad-api-key' }, 400);
  const pickupMode = Number(b.pickupMode) === 1 ? 1 : 0;

  let sealed;
  try { sealed = await sealKey(env, apiKey); } catch (_) { return json({ error: 'not-configured' }, 503); }
  /* Ozon dit si la clé est bonne : un suivi d'un numéro inexistant passe le
     contrôle CHECK_API avec une bonne clé, et le refuse avec une mauvaise. */
  const probe = await ozonCall(env, { customer_id: customerId, api_key_enc: sealed }, 'tracking', (() => { const f = new FormData(); f.append('tracking-number', 'KIWI-CHECK'); return f; })());
  if (!probe.ok && probe.error === 'ozon-key-refused') return json({ error: 'ozon-key-refused' }, 400);
  if (!probe.ok && probe.error === 'ozon-unreachable') return json({ error: 'ozon-unreachable' }, 502);

  const now = Date.now();
  await env.DB.prepare(`INSERT INTO ozon_accounts (merchant, customer_id, api_key_enc, pickup_mode, connected_ts, updated_ts, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(merchant) DO UPDATE SET customer_id = excluded.customer_id, api_key_enc = excluded.api_key_enc,
        pickup_mode = excluded.pickup_mode, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`)
    .bind(merchant, customerId, sealed, pickupMode, now, now, 'dashboard').run();
  return json({ ok: true, ...view(await readAccount(env, merchant)) });
}

export async function onRequestPatch({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const b = await body(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  const merchant = await merchantOf(request, env, b.merchant, false);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const r = await env.DB.prepare('UPDATE ozon_accounts SET pickup_mode = ?, updated_ts = ? WHERE merchant = ?')
    .bind(Number(b.pickupMode) === 1 ? 1 : 0, Date.now(), merchant).run();
  if (!Number(r && r.meta && r.meta.changes)) return json({ error: 'not-connected' }, 404);
  return json({ ok: true, ...view(await readAccount(env, merchant)) });
}

export async function onRequestDelete({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const merchant = await merchantOf(request, env, new URL(request.url).searchParams.get('merchant'), false);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  await env.DB.prepare('DELETE FROM ozon_accounts WHERE merchant = ?').bind(merchant).run();
  return json({ ok: true, connected: false });
}
