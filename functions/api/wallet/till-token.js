// POST /api/wallet/till-token {merchant, clientId} — the till (or dashboard)
// shows a QR that hands an already-known customer their own card. Signed-in or
// paired surfaces only; the token is single use and lives ten minutes.
import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { loadMerchant } from './_merchant.js';
import { cardView } from './_card.js';
import { mintTillToken } from './_store.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'bad-json' }, 400);
  const merchant = await tenantFor(request, env, body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  try {
    const m = await loadMerchant(env.DB, merchant);
    if (!m || !m.on || !cardView({ fidelity: m.fidelity, client: {} })) return json({ error: 'no-card' }, 404);
    const id = String(body.clientId || '').slice(0, 64);
    const c = id && await env.DB.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, id).first();
    if (!c) return json({ error: 'client-not-found' }, 404);
    const token = await mintTillToken(env.DB, merchant, id);
    return json({ ok: true, url: `${new URL(request.url).origin}/carte/${merchant}?t=${token}`, expiresIn: 600 });
  } catch (error) {
    if (/no such table/i.test(String(error && error.message))) return json({ error: 'unmigrated' }, 503);
    throw error;
  }
}
