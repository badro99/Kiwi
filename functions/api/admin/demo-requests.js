/* /api/admin/demo-requests · les demandes de démo du site, pour l'équipe.
 *   GET   ?status=new|contacted|…|all  → { requests, counts }
 *   PATCH { id, status, handledBy? }   → { ok, request }
 * Opérateurs seulement (guard). Les coordonnées d'un prospect ne sortent
 * jamais d'ici vers une autre route. */
import { json, operatorActor } from '../../auth/_lib.js';
import { guard, clean } from './_workspace.js';
import { ensureDemoRequests, DEMO_STATUSES } from '../_demo-requests.js';

const COLUMNS = 'id, reference, created_ts, first_name, business, trade, phone, email, slot_day, slot_part, note, lang, page, status, handled_by, notified, updated_ts';

export async function onRequestGet(context) {
  const bad = await guard(context);
  if (bad) return bad;
  const status = new URL(context.request.url).searchParams.get('status') || 'all';
  try {
    await ensureDemoRequests(context.env);
    const DB = context.env.DB;
    const rows = DEMO_STATUSES.includes(status)
      ? await DB.prepare(`SELECT ${COLUMNS} FROM demo_requests WHERE status = ? ORDER BY created_ts DESC LIMIT 300`).bind(status).all()
      : await DB.prepare(`SELECT ${COLUMNS} FROM demo_requests ORDER BY created_ts DESC LIMIT 300`).all();
    const counted = await DB.prepare('SELECT status, COUNT(*) AS n FROM demo_requests GROUP BY status').all();
    const counts = {};
    (counted.results || []).forEach((r) => { counts[r.status] = Number(r.n) || 0; });
    return json({ requests: rows.results || [], counts });
  } catch (_) {
    return json({ error: 'demo-storage-unavailable' }, 503);
  }
}

export async function onRequestPatch(context) {
  const bad = await guard(context, true);
  if (bad) return bad;
  let b;
  try { b = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const id = clean(b && b.id, 64);
  const status = String(b && b.status || '');
  if (!id || !DEMO_STATUSES.includes(status)) return json({ error: 'invalid' }, 400);
  try {
    await ensureDemoRequests(context.env);
    const actor = await operatorActor(context.request, context.env);
    const by = clean((b && b.handledBy) || (actor && actor.label) || '', 80);
    const r = await context.env.DB.prepare('UPDATE demo_requests SET status = ?, handled_by = ?, updated_ts = ? WHERE id = ?')
      .bind(status, by, Date.now(), id).run();
    if (!(r && r.meta && r.meta.changes)) return json({ error: 'not-found' }, 404);
    const row = await context.env.DB.prepare(`SELECT ${COLUMNS} FROM demo_requests WHERE id = ?`).bind(id).first();
    return json({ ok: true, request: row });
  } catch (_) {
    return json({ error: 'demo-storage-unavailable' }, 503);
  }
}
