export const RETENTION_MS = 20 * 24 * 60 * 60 * 1000;
export const MAX_TEXT = 4000;
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 36 * 1024 * 1024;

export const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function ticketNumber(id) {
  return '#' + String(id).padStart(4, '0');
}

export async function purgeExpired(env, now = Date.now()) {
  const rows = await env.DB.prepare(
    `SELECT id FROM kiwi_tickets
     WHERE status = 'done' AND expires_ts IS NOT NULL AND expires_ts <= ?
     ORDER BY id LIMIT 250`
  ).bind(now).all();
  const ids = (rows.results || []).map((row) => Number(row.id)).filter(Number.isInteger);
  if (!ids.length) return 0;

  const marks = ids.map(() => '?').join(',');
  const images = await env.DB.prepare(
    `SELECT object_key FROM kiwi_ticket_images WHERE ticket_id IN (${marks})`
  ).bind(...ids).all();
  const keys = (images.results || []).map((row) => row.object_key).filter(Boolean);

  if (keys.length) {
    if (!env.MEDIA) throw new Error('Ticket media storage is unavailable');
    await env.MEDIA.delete(keys);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM kiwi_ticket_images WHERE ticket_id IN (${marks})`).bind(...ids),
    env.DB.prepare(`DELETE FROM kiwi_ticket_followups WHERE ticket_id IN (${marks})`).bind(...ids),
    env.DB.prepare(`DELETE FROM kiwi_tickets WHERE id IN (${marks})`).bind(...ids),
  ]);
  return ids.length;
}

export function schemaError(error) {
  const message = String((error && error.message) || error || '');
  return /no such table|no such column/i.test(message);
}
