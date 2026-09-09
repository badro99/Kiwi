const notFound = () => new Response('Not found', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
});

export async function onRequestGet({ params, env }) {
  if (!env.MEDIA) return notFound();
  const raw = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  let key;
  try { key = decodeURIComponent(raw); } catch (_) { return notFound(); }
  if (!/^kiwi-tickets\/\d+\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(key)) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', 'inline');
  return new Response(object.body, { headers });
}
