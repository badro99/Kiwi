// /api/admin/glovo-stores — quelle adresse Glovo est quel commerçant.
//   GET  ?merchant=slug (facultatif) → { stores:[…], recent:[…] }  (dernières commandes et refus)
//   POST { storeId, merchant, prepMinutes?, status? }               → crée ou modifie la liaison
// Opérateurs seulement. Le store_id est l'« external id » que Kiwi donne à Glovo
// pour chaque adresse ; sans liaison active, le webhook Glovo répond 404 et
// n'écrit rien. Voir functions/api/channel/glovo/_glovo.js.
import { json, isOperator } from '../../auth/_lib.js';
import { upsertGlovoStore } from '../channel/glovo/_glovo.js';

export async function onRequestGet({ request, env }) {
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const merchant = String(new URL(request.url).searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 80);
  try {
    const where = merchant ? ' WHERE merchant = ?' : '';
    const stores = await env.DB.prepare(
      'SELECT store_id, merchant, prep_minutes, status, created_ts, updated_ts, last_ts, last_err FROM glovo_stores'
      + where + ' ORDER BY merchant, store_id LIMIT 200'
    ).bind(...(merchant ? [merchant] : [])).all();
    const recent = await env.DB.prepare(
      'SELECT order_id, store_id, merchant, order_code, created_ts, cancelled_ts, cancel_reason, last_call, last_call_ts, last_call_err FROM glovo_orders'
      + where + ' ORDER BY created_ts DESC LIMIT 50'
    ).bind(...(merchant ? [merchant] : [])).all();
    return json({ ok: true, configured: !!env.GLOVO_TOKEN, stores: stores.results || [], recent: recent.results || [] });
  } catch (_) {
    return json({ error: 'not-migrated', hint: 'migrations/0026_glovo.sql' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((b && b.merchant) || '').trim().toLowerCase();
  try {
    const known = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (!known) return json({ error: 'merchant-not-found' }, 404);
    const r = await upsertGlovoStore(env, b);
    return r.ok ? json(r) : json(r, 400);
  } catch (_) {
    return json({ error: 'not-migrated', hint: 'migrations/0026_glovo.sql' }, 503);
  }
}
