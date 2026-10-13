// GET  /api/pair/devices?merchant=<slug>  — les caisses appairées de ce magasin.
// POST /api/pair/devices {merchant, deviceId} — retirer UNE caisse.
//
// /api/pair/revoke coupe toutes les caisses d'un coup, parce que le jeton ne
// disait pas de quel appareil il venait. Il le dit maintenant
// (functions/auth/_lib.js › tillDeviceToken) : une tablette perdue, revendue ou
// partie avec un employé se retire seule, les autres continuent d'encaisser.
// Elle ne revient qu'avec un nouveau code à six chiffres.
//
// Réservé au PROPRIÉTAIRE (session de compte) ou à un opérateur nommé, comme
// le dépairage global : une caisse ne retire pas sa voisine.

import { entitledMerchant, ensureTillDevices, forgetTillDevice, json, DEVICE_ID } from '../../auth/_lib.js';

async function owner(request, env, asked) {
  const merchant = String(asked || '').slice(0, 64);
  if (!merchant) return '';
  try { return (await entitledMerchant(request, env, merchant)) === merchant ? merchant : ''; }
  catch (_) { return ''; }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await owner(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  try {
    const rows = await env.DB.prepare(
      `SELECT device_id, label, paired_ts, last_seen_ts, revoked_ts FROM till_devices
        WHERE merchant = ? ORDER BY COALESCE(revoked_ts, 0) ASC, COALESCE(last_seen_ts, paired_ts, 0) DESC LIMIT 100`
    ).bind(merchant).all();
    const devices = ((rows && rows.results) || []).map((r) => ({
      id: String(r.device_id), label: r.label || '', pairedAt: Number(r.paired_ts) || 0,
      lastSeenAt: Number(r.last_seen_ts) || 0, revokedAt: Number(r.revoked_ts) || 0,
    }));
    return json({ ok: true, merchant, devices });
  } catch (err) {
    /* Table absente : aucune caisse ne s'est encore appairée sous son nom. */
    if (/no such table/i.test(String(err && err.message || err))) return json({ ok: true, merchant, devices: [] });
    return json({ error: 'devices-unavailable' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await owner(request, env, body.merchant);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const deviceId = String(body.deviceId || '');
  if (!DEVICE_ID.test(deviceId)) return json({ error: 'device-required' }, 400);
  await ensureTillDevices(env);
  try {
    const now = Date.now();
    const row = await env.DB.prepare(
      `UPDATE till_devices SET revoked_ts = ? WHERE merchant = ? AND device_id = ? RETURNING device_id`
    ).bind(now, merchant, deviceId).first();
    if (!row) return json({ error: 'device-not-found' }, 404);
    forgetTillDevice(merchant, deviceId);
    return json({ ok: true, merchant, deviceId, revokedAt: now });
  } catch (_) {
    return json({ error: 'devices-unavailable' }, 503);
  }
}
