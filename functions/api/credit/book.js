/* GET  /api/credit/book?merchant=…                       le carnet du patron
 * GET  /api/credit/book?merchant=…&source=…&customer=…   la fiche d'un client
 * POST /api/credit/book { merchant, source, customer, action, … }
 *   action 'schedule' : { rows:[{id?,amountCents,dueDate,note}], baseRev } ou { seed:true, dueDate? }
 *   action 'limit'    : { limitCents | null }   (palier patron)
 *   action 'prefs'    : { lang?, reminded? }    (langue des rappels, « relancé »)
 * Tout se lit dans les carnets existants (ardoise, notes boutique) ; voir
 * functions/api/_credit-accounts.js. */
import { json } from '../../auth/_lib.js';
import { creditBook, customerDetail, saveSchedule, setLimit, setPrefs, validTarget, missingTable } from '../_credit-accounts.js';
import { creditReader } from './_reader.js';

const fail = (e) => json({ error: missingTable(e) ? 'credit-not-migrated' : (e && e.code) || 'credit-unavailable' }, 503);
const noStore = { 'Cache-Control': 'no-store' };

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await creditReader(request, env, String(url.searchParams.get('merchant') || '').slice(0, 64));
  if (!merchant) return json({ error: 'forbidden' }, 403);
  const source = url.searchParams.get('source');
  const key = url.searchParams.get('customer');
  try {
    if (source || key) {
      if (!validTarget(source, key)) return json({ error: 'bad-customer' }, 400);
      const detail = await customerDetail(env, merchant, source, key);
      return detail ? json({ ok: true, merchant, ...detail }, 200, noStore) : json({ error: 'unknown-customer' }, 404);
    }
    return json({ ok: true, merchant, ...await creditBook(env, merchant) }, 200, noStore);
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);
  const action = String(body.action || '');
  const merchant = await creditReader(request, env, String(body.merchant || '').slice(0, 64), action === 'limit' ? 'owner' : 'manager');
  if (!merchant) return json({ error: 'forbidden' }, 403);
  const source = String(body.source || ''), key = String(body.customer || '');
  if (!validTarget(source, key)) return json({ error: 'bad-customer' }, 400);
  const actor = 'dashboard';
  try {
    let out;
    if (action === 'schedule') out = await saveSchedule(env, merchant, source, key, body, actor);
    else if (action === 'limit') out = await setLimit(env, merchant, source, key, body.limitCents === undefined ? NaN : body.limitCents, actor);
    else if (action === 'prefs') out = await setPrefs(env, merchant, source, key, body, actor);
    else return json({ error: 'bad-action' }, 400);
    if (out.error) return json({ error: out.error, ...(out.owedCents != null ? { owedCents: out.owedCents } : {}) }, out.status || 409);
    return json(out, 200, noStore);
  } catch (e) { return fail(e); }
}
