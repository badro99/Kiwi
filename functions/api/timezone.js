// POST /api/timezone {merchant, timeZone} — the store's paired till reports the
// IANA zone of the device it runs on. The till is the one device physically at
// the store, so its clock defines the store's business day for every other
// surface (dashboard abroad, waiter phones, server reports). Only a till proven
// for that merchant may write it; a browser elsewhere never moves a store's day.
import { isTillFor, json } from '../auth/_lib.js';
import { validZone } from './_business-day.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'cross-origin' }, 403);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 64);
  const zone = validZone(body && body.timeZone);
  if (!merchant || !zone) return json({ error: 'bad-zone' }, 400);
  let till = false;
  try { till = await isTillFor(request, env, merchant); } catch (_) { till = false; }
  if (!till) return json({ error: 'till-required' }, 403);
  try { await env.DB.prepare('ALTER TABLE merchant_config ADD COLUMN timezone TEXT').run(); }
  catch (error) { if (!/duplicate column/i.test(String(error && error.message || error))) return json({ error: 'unavailable' }, 503); }
  try {
    await env.DB.prepare('UPDATE merchant_config SET timezone = ? WHERE merchant = ? AND (timezone IS NULL OR timezone <> ?)')
      .bind(zone, merchant, zone).run();
  } catch (_) { return json({ error: 'unavailable' }, 503); }
  return json({ ok: true, merchant, timeZone: zone });
}
