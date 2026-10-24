import { ticketActor } from '../tickets/_access.js';
const notFound = () => new Response('Not found', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
});

export async function onRequestGet({ request, params, env }) {
  if (!(await ticketActor(request, env))) return notFound();
  if (!env.MEDIA) return notFound();
  const raw = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  let key;
  try { key = decodeURIComponent(raw); } catch (_) { return notFound(); }
  const match = /^kiwi-tickets\/\d+\/(?:followups\/)?[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.exec(key);
  if (!match) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Only the raster type named by the key is served, whatever the stored metadata says.
  headers.set('Content-Type', { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[match[1].toLowerCase()]);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', 'inline');
  return new Response(object.body, { headers });
}
