// POST /api/timezone {merchant, timeZone?, businessCutoff?}
//
// B24 · A store's time zone is DECLARED by its owner (or a named operator), never
// inferred from a device. The paired till used to report the IANA zone of the
// computer it ran on: a till paired on a Mac set to Berlin wrote Europe/Berlin for
// two Moroccan hotels, and their business day, stay times, cancellation deadline
// and reports would have moved by an hour whenever Berlin and Casablanca differ
// (Ramadan, European summer time). The till still reports its business-day cutoff
// (it closes the day); a zone it sends is ignored. No stored zone = Africa/Casablanca.
import { activeAccountSession, isTillFor, json, namedOperatorId, storeOwner } from '../auth/_lib.js';
import { validZone } from './_business-day.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'cross-origin' }, 403);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 64);
  const asked = body && body.timeZone != null && body.timeZone !== '';
  const zone = asked ? validZone(body.timeZone) : '';
  const cutoff = body && body.businessCutoff;
  if (!merchant || (asked && !zone)) return json({ error: 'bad-zone' }, 400);
  if (cutoff != null && (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 12))
    return json({ error: 'bad-business-cutoff' }, 400);
  if (!asked && cutoff == null) return json({ error: 'nothing-to-set' }, 400);

  let declares = false, till = false;
  try {
    const session = await activeAccountSession(request, env);
    const owner = session && await storeOwner(env, merchant);
    declares = !!(session && owner && owner === session.aid);
  } catch (_) { declares = false; }
  if (!declares) { try { declares = !!(await namedOperatorId(request, env)); } catch (_) { declares = false; } }
  if (!declares) { try { till = await isTillFor(request, env, merchant); } catch (_) { till = false; } }
  if (!declares && !till) return json({ error: asked ? 'owner-required' : 'till-required' }, 403);
  const writeZone = asked && declares;
  try {
    if (writeZone) await env.DB.prepare('UPDATE merchant_config SET timezone = ? WHERE merchant = ? AND (timezone IS NULL OR timezone <> ?)')
      .bind(zone, merchant, zone).run();
    if (cutoff != null) await env.DB.prepare('UPDATE merchant_config SET business_cutoff = ? WHERE merchant = ? AND (business_cutoff IS NULL OR business_cutoff <> ?)')
      .bind(cutoff, merchant, cutoff).run();
  } catch (_) { return json({ error: 'unavailable' }, 503); }
  return json({ ok: true, merchant, timeZone: writeZone ? zone : null, zoneIgnored: asked && !writeZone, businessCutoff: cutoff ?? null });
}
