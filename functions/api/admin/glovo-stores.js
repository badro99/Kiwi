// /api/admin/glovo-stores — quelle adresse Glovo est quel commerçant.
//   GET    ?merchant=slug (facultatif) → { stores:[…], recent:[…], merchants:[{merchant,name}] }
//   POST   { storeId, merchant, prepMinutes?, status? } → crée ou modifie la liaison
//   PATCH  { storeId, status?: 'active'|'paused', prepMinutes? } → pause, reprise, délai
//   DELETE { storeId }                                  → retire la liaison
// Opérateurs seulement, et une écriture venue d'une autre origine est refusée
// (guard). Le store_id est l'« external id » que Kiwi donne à Glovo pour chaque
// adresse ; sans liaison active, le webhook Glovo répond 404 et n'écrit rien.
// Un store_id déjà relié ne passe pas à un autre commerçant en silence (409) :
// on le retire d'abord, sinon les commandes d'un magasin tomberaient chez un
// autre. Le panneau est assets/admin-glovo.js. Voir functions/api/channel/glovo/_glovo.js.
import { json } from '../../auth/_lib.js';
import { guard } from './_workspace.js';
import { upsertGlovoStore } from '../channel/glovo/_glovo.js';

const NOT_MIGRATED = { error: 'not-migrated', hint: 'migrations/0026_glovo.sql' };
const sid = (v) => String(v == null ? '' : v).trim().slice(0, 64);
async function body(request) { try { return await request.json(); } catch (_) { return null; } }

export async function onRequestGet(context) {
  const bad = await guard(context);
  if (bad) return bad;
  const { request, env } = context;
  const merchant = String(new URL(request.url).searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 80);
  try {
    const where = merchant ? ' WHERE merchant = ?' : '';
    const stores = await env.DB.prepare(
      'SELECT g.store_id, g.merchant, m.name, g.prep_minutes, g.status, g.created_ts, g.updated_ts, g.last_ts, g.last_err'
      + ' FROM glovo_stores g LEFT JOIN merchant_config m ON m.merchant = g.merchant'
      + (merchant ? ' WHERE g.merchant = ?' : '') + ' ORDER BY g.merchant, g.store_id LIMIT 200'
    ).bind(...(merchant ? [merchant] : [])).all();
    const recent = await env.DB.prepare(
      'SELECT order_id, store_id, merchant, order_code, created_ts, cancelled_ts, cancel_reason, last_call, last_call_ts, last_call_err FROM glovo_orders'
      + where + ' ORDER BY created_ts DESC LIMIT 50'
    ).bind(...(merchant ? [merchant] : [])).all();
    const merchants = await env.DB.prepare(
      'SELECT merchant, name FROM merchant_config ORDER BY merchant LIMIT 2000'
    ).all();
    return json({ ok: true, configured: !!env.GLOVO_TOKEN, stores: stores.results || [], recent: recent.results || [], merchants: merchants.results || [] });
  } catch (_) {
    return json(NOT_MIGRATED, 503);
  }
}

export async function onRequestPost(context) {
  const bad = await guard(context, true);
  if (bad) return bad;
  const { request, env } = context;
  const b = await body(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  const merchant = String(b.merchant || '').trim().toLowerCase();
  try {
    const known = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (!known) return json({ error: 'merchant-not-found' }, 404);
    const held = await env.DB.prepare('SELECT merchant FROM glovo_stores WHERE store_id = ?').bind(sid(b.storeId)).first();
    if (held && held.merchant !== merchant) return json({ error: 'store-taken', merchant: held.merchant }, 409);
    const r = await upsertGlovoStore(env, b);
    return r.ok ? json(r) : json(r, 400);
  } catch (_) {
    return json(NOT_MIGRATED, 503);
  }
}

export async function onRequestPatch(context) {
  const bad = await guard(context, true);
  if (bad) return bad;
  const { request, env } = context;
  const b = await body(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  if (b.status != null && b.status !== 'active' && b.status !== 'paused') return json({ error: 'bad-status' }, 400);
  try {
    const row = await env.DB.prepare('SELECT store_id, merchant, prep_minutes, status FROM glovo_stores WHERE store_id = ?').bind(sid(b.storeId)).first();
    if (!row) return json({ error: 'not-found' }, 404);
    const status = b.status || row.status;
    const prep = b.prepMinutes == null ? row.prep_minutes : Math.min(120, Math.max(1, Math.round(Number(b.prepMinutes) || 15)));
    await env.DB.prepare('UPDATE glovo_stores SET status = ?, prep_minutes = ?, updated_ts = ? WHERE store_id = ?')
      .bind(status, prep, Date.now(), row.store_id).run();
    return json({ ok: true, storeId: row.store_id, merchant: row.merchant, prepMinutes: prep, status });
  } catch (_) {
    return json(NOT_MIGRATED, 503);
  }
}

export async function onRequestDelete(context) {
  const bad = await guard(context, true);
  if (bad) return bad;
  const { request, env } = context;
  const b = await body(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  try {
    const r = await env.DB.prepare('DELETE FROM glovo_stores WHERE store_id = ?').bind(sid(b.storeId)).run();
    return (r && r.meta && r.meta.changes) ? json({ ok: true }) : json({ error: 'not-found' }, 404);
  } catch (_) {
    return json(NOT_MIGRATED, 503);
  }
}
