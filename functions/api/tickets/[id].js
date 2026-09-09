import { json, RETENTION_MS, schemaError, ticketNumber } from './_lib.js';

export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'bad-ticket' }, 400);

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: 'bad-json' }, 400); }

  const action = String((body && body.action) || '');
  if (action !== 'fixed' && action !== 'tested') return json({ error: 'bad-action' }, 400);

  try {
    const ticket = await env.DB.prepare(
      'SELECT id, status FROM kiwi_tickets WHERE id = ?'
    ).bind(id).first();
    if (!ticket) return json({ error: 'not-found' }, 404);

    const now = Date.now();
    if (action === 'fixed') {
      if (ticket.status !== 'problem') return json({ error: 'wrong-status', status: ticket.status }, 409);
      const result = await env.DB.prepare(
        `UPDATE kiwi_tickets SET status = 'testing', updated_ts = ?
         WHERE id = ? AND status = 'problem'`
      ).bind(now, id).run();
      if (!result.meta || result.meta.changes !== 1) return json({ error: 'changed-elsewhere' }, 409);
      return json({ ok: true, id, number: ticketNumber(id), status: 'testing' });
    }

    if (ticket.status !== 'testing') return json({ error: 'wrong-status', status: ticket.status }, 409);
    const imageRows = await env.DB.prepare(
      'SELECT object_key FROM kiwi_ticket_images WHERE ticket_id = ?'
    ).bind(id).all();
    const keys = (imageRows.results || []).map((row) => row.object_key).filter(Boolean);
    if (keys.length) {
      if (!env.MEDIA) return json({ error: 'no-media' }, 503);
      await env.MEDIA.delete(keys);
    }

    const expires = now + RETENTION_MS;
    const result = await env.DB.batch([
      env.DB.prepare('DELETE FROM kiwi_ticket_images WHERE ticket_id = ?').bind(id),
      env.DB.prepare(
        `UPDATE kiwi_tickets
         SET status = 'done', updated_ts = ?, completed_ts = ?, expires_ts = ?
         WHERE id = ? AND status = 'testing'`
      ).bind(now, now, expires, id),
    ]);
    const update = result[1];
    if (!update || !update.meta || update.meta.changes !== 1) return json({ error: 'changed-elsewhere' }, 409);
    return json({ ok: true, id, number: ticketNumber(id), status: 'done', expiresAt: expires, imagesDeleted: keys.length });
  } catch (error) {
    if (schemaError(error)) return json({ error: 'schema-not-ready' }, 503);
    return json({ error: 'update-failed' }, 500);
  }
}
