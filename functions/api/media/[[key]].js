// GET /api/media/<merchant>/<file> — serve one uploaded photo or video from R2.
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

export async function onRequestGet(context) {
  const { params, env, request } = context;
  if (!env.MEDIA) return NOT_FOUND();

  // [[key]] catches the rest of the path as an array of segments.
  const raw = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  let key;
  try { key = decodeURIComponent(raw); } catch (_) { return NOT_FOUND(); }
  // Defence in depth: no traversal, no absolute paths, nothing but the shape we
  // write in index.js (merchant-slug / file).
  if (!key || key.includes('..') || key.startsWith('/') || key.length > 200) return NOT_FOUND();

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
