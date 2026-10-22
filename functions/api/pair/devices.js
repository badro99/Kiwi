// GET  /api/pair/devices?merchant=<slug>[&cursor=…][&limit=…]  — les caisses
//      appairées de ce magasin, par pages de 100 au plus (nextCursor).
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

/* Pagination par curseur (clé composée, stable même si des lignes s'ajoutent) :
   ordre « actives d'abord, vues le plus récemment d'abord, puis identifiant ».
   Le curseur est « revoked.seen.device_id » de la dernière ligne rendue ;
   `nextCursor` vaut null sur la dernière page. Sans curseur la réponse garde sa
   forme d'origine ({ok, merchant, devices}) et ses 100 premières caisses. */
const PAGE = 100;
function readCursor(raw) {
  const m = /^(\d{1,16})\.(\d{1,16})\.([A-Za-z0-9_-]{12,80})$/.exec(String(raw || ''));
  return m ? { revoked: Number(m[1]), seen: Number(m[2]), id: m[3] } : null;
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await owner(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? readCursor(rawCursor) : null;
  if (rawCursor && !cursor) return json({ error: 'bad-cursor' }, 400);
  const asked = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, PAGE) : PAGE;
  try {
    const after = cursor
      ? `AND (COALESCE(revoked_ts, 0) > ?1 OR (COALESCE(revoked_ts, 0) = ?1 AND (COALESCE(last_seen_ts, paired_ts, 0) < ?2
           OR (COALESCE(last_seen_ts, paired_ts, 0) = ?2 AND device_id > ?3))))`
      : '';
    const rows = await env.DB.prepare(
      `SELECT device_id, label, paired_ts, last_seen_ts, revoked_ts,
              COALESCE(revoked_ts, 0) AS k_revoked, COALESCE(last_seen_ts, paired_ts, 0) AS k_seen
         FROM till_devices
        WHERE merchant = ?4 ${after}
        ORDER BY k_revoked ASC, k_seen DESC, device_id ASC LIMIT ?5`
    ).bind(cursor ? cursor.revoked : 0, cursor ? cursor.seen : 0, cursor ? cursor.id : '', merchant, limit + 1).all();
    const all = (rows && rows.results) || [];
    const page = all.slice(0, limit);
    const devices = page.map((r) => ({
      id: String(r.device_id), label: r.label || '', pairedAt: Number(r.paired_ts) || 0,
      lastSeenAt: Number(r.last_seen_ts) || 0, revokedAt: Number(r.revoked_ts) || 0,
    }));
    const last = page[page.length - 1];
    const nextCursor = all.length > limit && last
      ? `${Number(last.k_revoked) || 0}.${Number(last.k_seen) || 0}.${last.device_id}` : null;
    return json({ ok: true, merchant, devices, nextCursor });
  } catch (err) {
    /* Table absente : aucune caisse ne s'est encore appairée sous son nom. */
    if (/no such table/i.test(String(err && err.message || err))) return json({ ok: true, merchant, devices: [], nextCursor: null });
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
