import {
  IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TEXT, MAX_TOTAL_IMAGE_BYTES,
  json, purgeExpired, schemaError, ticketNumber,
} from './_lib.js';

function publicImage(row) {
  return {
    id: row.id,
    filename: row.filename || 'Ticket image',
    url: '/api/ticket-images/' + row.object_key,
  };
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  try {
    await purgeExpired(env);
    const [ticketRows, imageRows] = await Promise.all([
      env.DB.prepare(
        `SELECT id, body, status, created_ts, updated_ts, completed_ts, expires_ts
         FROM kiwi_tickets ORDER BY id DESC`
      ).all(),
      env.DB.prepare(
        `SELECT i.id, i.ticket_id, i.object_key, i.filename
         FROM kiwi_ticket_images i
         JOIN kiwi_tickets t ON t.id = i.ticket_id
         WHERE t.status != 'done'
         ORDER BY i.created_ts, i.id`
      ).all(),
    ]);

    const imagesByTicket = new Map();
    for (const row of (imageRows.results || [])) {
      const id = Number(row.ticket_id);
      if (!imagesByTicket.has(id)) imagesByTicket.set(id, []);
      imagesByTicket.get(id).push(publicImage(row));
    }
    const tickets = (ticketRows.results || []).map((row) => ({
      id: Number(row.id),
      number: ticketNumber(row.id),
      body: row.body,
      status: row.status,
      createdAt: Number(row.created_ts),
      updatedAt: Number(row.updated_ts),
      completedAt: row.completed_ts == null ? null : Number(row.completed_ts),
      expiresAt: row.expires_ts == null ? null : Number(row.expires_ts),
      images: row.status === 'done' ? [] : (imagesByTicket.get(Number(row.id)) || []),
    }));
    return json({ tickets, retentionDays: 20 });
  } catch (error) {
    if (schemaError(error)) return json({ error: 'schema-not-ready' }, 503);
    return json({ error: 'read-failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared && declared > MAX_TOTAL_IMAGE_BYTES + 1024 * 1024) {
    return json({ error: 'images-too-large', max: MAX_TOTAL_IMAGE_BYTES }, 413);
  }

  let form;
  try { form = await request.formData(); }
  catch (_) { return json({ error: 'bad-form' }, 400); }

  const body = String(form.get('body') || '').trim();
  if (!body) return json({ error: 'text-required' }, 400);
  if (body.length > MAX_TEXT) return json({ error: 'text-too-long', max: MAX_TEXT }, 413);

  const files = form.getAll('images').filter((item) => item && typeof item.arrayBuffer === 'function' && item.size > 0);
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

  const now = Date.now();
  let ticketId = null;
  const storedKeys = [];
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO kiwi_tickets (body, status, created_ts, updated_ts)
       VALUES (?, 'problem', ?, ?)`
    ).bind(body, now, now).run();
    ticketId = Number(inserted.meta && inserted.meta.last_row_id);
    if (!Number.isInteger(ticketId) || ticketId < 1) throw new Error('Ticket number was not created');

    const imageStatements = [];
    for (const file of files) {
      const type = String(file.type || '').toLowerCase();
      const imageId = 'img-' + crypto.randomUUID();
      const objectKey = `kiwi-tickets/${ticketId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
      const bytes = await file.arrayBuffer();
      await env.MEDIA.put(objectKey, bytes, {
        httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
        customMetadata: { ticket: String(ticketId) },
      });
      storedKeys.push(objectKey);
      imageStatements.push(env.DB.prepare(
        `INSERT INTO kiwi_ticket_images
         (id, ticket_id, object_key, filename, content_type, byte_size, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(imageId, ticketId, objectKey, String(file.name || 'image').slice(0, 180), type, file.size, now));
    }
    if (imageStatements.length) await env.DB.batch(imageStatements);

    return json({ ok: true, id: ticketId, number: ticketNumber(ticketId) }, 201);
  } catch (error) {
    if (storedKeys.length && env.MEDIA) {
      try { await env.MEDIA.delete(storedKeys); } catch (_) {}
    }
    if (ticketId) {
      try {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM kiwi_ticket_images WHERE ticket_id = ?').bind(ticketId),
          env.DB.prepare('DELETE FROM kiwi_tickets WHERE id = ?').bind(ticketId),
        ]);
      } catch (_) {}
    }
    if (schemaError(error)) return json({ error: 'schema-not-ready' }, 503);
    return json({ error: 'publish-failed' }, 500);
  }
}
