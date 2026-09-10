import {
  IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TEXT, MAX_TOTAL_IMAGE_BYTES,
  json, RETENTION_MS, schemaError, ticketNumber,
} from './_lib.js';

export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'bad-ticket' }, 400);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared && declared > MAX_TOTAL_IMAGE_BYTES + 1024 * 1024) {
    return json({ error: 'images-too-large', max: MAX_TOTAL_IMAGE_BYTES }, 413);
  }

  let payload;
  let files = [];
  const multipart = String(request.headers.get('Content-Type') || '').toLowerCase().includes('multipart/form-data');
  try {
    if (multipart) {
      payload = await request.formData();
      files = payload.getAll('images').filter((item) => item && typeof item.arrayBuffer === 'function' && item.size > 0);
    } else {
      payload = await request.json();
    }
  } catch (_) {
    return json({ error: multipart ? 'bad-form' : 'bad-json' }, 400);
  }

  const action = String(multipart ? payload.get('action') : ((payload && payload.action) || ''));
  if (action !== 'fixed' && action !== 'tested' && action !== 'failed') return json({ error: 'bad-action' }, 400);

  const note = action === 'failed'
    ? String(multipart ? payload.get('note') : ((payload && payload.note) || '')).trim()
    : '';
  if (action === 'failed') {
    if (!note) return json({ error: 'note-required' }, 400);
    if (note.length > MAX_TEXT) return json({ error: 'text-too-long', max: MAX_TEXT }, 413);
    if (files.length > MAX_IMAGES) return json({ error: 'too-many-images', max: MAX_IMAGES }, 413);
    let total = 0;
    for (const file of files) {
      const type = String(file.type || '').toLowerCase();
      if (!IMAGE_EXTENSIONS[type]) return json({ error: 'bad-image-type', filename: file.name || '' }, 415);
      if (file.size > MAX_IMAGE_BYTES) return json({ error: 'image-too-large', filename: file.name || '', max: MAX_IMAGE_BYTES }, 413);
      total += file.size;
    }
    if (total > MAX_TOTAL_IMAGE_BYTES) return json({ error: 'images-too-large', max: MAX_TOTAL_IMAGE_BYTES }, 413);
    if (files.length && !env.MEDIA) return json({ error: 'no-media' }, 503);
  }

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

    if (action === 'failed') {
      if (ticket.status !== 'testing') return json({ error: 'wrong-status', status: ticket.status }, 409);
      const followupId = 'followup-' + crypto.randomUUID();
      const storedKeys = [];
      const statements = [env.DB.prepare(
        `INSERT INTO kiwi_ticket_followups (id, ticket_id, body, created_ts)
         VALUES (?, ?, ?, ?)`
      ).bind(followupId, id, note, now)];
      try {
        for (const file of files) {
          const type = String(file.type || '').toLowerCase();
          const imageId = 'img-' + crypto.randomUUID();
          const objectKey = `kiwi-tickets/${id}/followups/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
          await env.MEDIA.put(objectKey, await file.arrayBuffer(), {
            httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
            customMetadata: { ticket: String(id), followup: followupId },
          });
          storedKeys.push(objectKey);
          statements.push(env.DB.prepare(
            `INSERT INTO kiwi_ticket_images
             (id, ticket_id, object_key, filename, content_type, byte_size, followup_id, created_ts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(imageId, id, objectKey, String(file.name || 'image').slice(0, 180), type, file.size, followupId, now));
        }
        statements.push(env.DB.prepare(
          `UPDATE kiwi_tickets
           SET status = 'problem', updated_ts = ?, completed_ts = NULL, expires_ts = NULL
           WHERE id = ? AND status = 'testing'`
        ).bind(now, id));
        const results = await env.DB.batch(statements);
        const update = results[results.length - 1];
        if (!update || !update.meta || update.meta.changes !== 1) {
          if (storedKeys.length) await env.MEDIA.delete(storedKeys);
          await env.DB.batch([
            env.DB.prepare('DELETE FROM kiwi_ticket_images WHERE followup_id = ?').bind(followupId),
            env.DB.prepare('DELETE FROM kiwi_ticket_followups WHERE id = ?').bind(followupId),
          ]);
          return json({ error: 'changed-elsewhere' }, 409);
        }
        return json({ ok: true, id, number: ticketNumber(id), status: 'problem', followupId });
      } catch (error) {
        if (storedKeys.length && env.MEDIA) {
          try { await env.MEDIA.delete(storedKeys); } catch (_) {}
        }
        try {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM kiwi_ticket_images WHERE followup_id = ?').bind(followupId),
            env.DB.prepare('DELETE FROM kiwi_ticket_followups WHERE id = ?').bind(followupId),
          ]);
        } catch (_) {}
        throw error;
      }
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
