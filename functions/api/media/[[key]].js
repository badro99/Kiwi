// GET /api/media/media/<merchant>/<file> — serve one uploaded photo or video
// from R2. Legacy /api/media/<merchant>/<file> keys remain readable: object URLs
// are immutable and already published on customer menus.
//
// PUBLIC on purpose: the phone showing a menu has no account and no passcode, so
// the site gate carves this read out (functions/_middleware.js). What it exposes
// is exactly what the merchant chose to put on their public menu — the same
// pictures they print on the card. Nothing else is reachable: the key is an
// opaque timestamp+uuid under the merchant's own prefix, this handler is
// read-only, and it can never list a bucket.
//
// Objects are written immutable (a new upload = a new key), so they are cached
// hard at the edge and a customer's phone re-downloads nothing.

const NOT_FOUND = () => new Response('Not found', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

// This bucket also contains private invoices and support attachments. Only
// public product/room media shapes may cross this unauthenticated boundary.
export function publicMediaKey(key) {
  if (typeof key !== 'string' || key.length > 200 || key.includes('..')) return false;
  const parts = key.split('/');
  if (parts[0] === 'media') parts.shift();
  if (parts.length !== 2 && parts.length !== 3) return false;
  const merchant = parts.shift();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(merchant || '')
      || ['intake', 'support', 'private', 'archives'].includes(merchant)) return false;
  if (parts.length === 2 && parts.shift() !== 'hotel-room') return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(?:jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i.test(parts[0] || '');
}

export async function onRequestGet(context) {
  const { params, env, request } = context;

  // [[key]] catches the rest of the path as an array of segments.
  const raw = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');

  // Sans clé, c'est la sonde « le stockage média est-il actif ? » que le
  // tableau de bord envoie sur GET /api/media (orderpro-publish.js mediaReady).
  // Ce fourre-tout prend aussi le chemin nu et masquait le onRequestGet de
  // index.js : la sonde recevait « Not found » et répondait « pas activé » même
  // une fois le seau lié. On rend ici la même réponse que index.js.
  if (!raw) {
    return new Response(JSON.stringify({ ok: true, media: !!env.MEDIA }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (!env.MEDIA) return NOT_FOUND();
  let key;
  try { key = decodeURIComponent(raw); } catch (_) { return NOT_FOUND(); }
  // Defence in depth: no traversal, no absolute paths, nothing but the shape we
  // write in index.js (merchant-slug / optional safe scope / file).
  if (!publicMediaKey(key)) return NOT_FOUND();

  const object = await env.MEDIA.get(key);
  if (!object) return NOT_FOUND();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  // Menu clips are played inline in a <video>; never let one render as a page.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', 'inline');

  // Honour conditional requests so a returning phone gets a 304, not the bytes.
  const inm = request.headers.get('If-None-Match');
  if (inm && inm === object.httpEtag) return new Response(null, { status: 304, headers });

  return new Response(object.body, { headers });
}
