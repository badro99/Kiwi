// POST /api/media — upload one photo or video for a menu item / product.
//
// The merchant picks a file in the dashboard; it lands in Cloudflare R2 and this
// returns a URL. The catalogue then stores THAT URL, never the bytes — which is
// the whole point: localStorage caps out around 5 MB, and a single base64 clip
// would blow both it and the published-catalogue row.
//
// Session-gated (the optional merchant query is accepted only when tenantFor
// proves that store belongs to this caller). Reading them back is public — see [[key]].js — since
// a customer's phone has no session and must be able to see the photos.
//
// Requires an R2 bucket bound as MEDIA (see docs/specs/ORDERPRO_SPEC.md). If the binding is
// missing this fails soft with 503 {error:'no-media'} and the dashboard tells the
// merchant plainly that media storage isn't switched on yet — the button stays
// live rather than silently doing nothing.
//
// Body = the raw file (not multipart): the client PUTs the File object straight
// through, so there is no parser to get wrong and no size doubling from base64.
//   ?name=<original filename>   → only used to pick the extension
//   Content-Type: image/… | video/…

import { json } from '../../auth/_lib.js';
import { ownerMerchant } from '../_private.js';

// Le navigateur rétrécit la photo avant l'envoi (orderpro-publish.js shrinkPhoto :
// ~300 Ko), donc ces plafonds sont un filet, pas la norme. 16 Mo couvre le JPEG
// brut d'un capteur 50 Mpx si le recodage a échoué ; 48 Mo ≈ 20 s de 1080p.
// Les trois copies doivent dire la même chose : ici, assets/platform-ops.js
// (pré-contrôle local) et assets/orderpro-publish.js (message affiché).
const MAX_IMAGE = 16 * 1024 * 1024;
const MAX_VIDEO = 48 * 1024 * 1024;

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  if (!env.MEDIA) return json({ error: 'no-media' }, 503);

  /* Media publishing remains owner-session-only — enforced, not just
   * documented. The previous code checked the session, then resolved the
   * tenant via tenantFor(), which honours a paired-till cookie FIRST: an
   * owner-A session carrying a till-B cookie filed under B's prefix, exactly
   * what a compromised cashier's device would do. ownerMerchant() never
   * consults the till (nor an operator cookie alone); { strict: true } keeps
   * the suspended/pending write block this upload route always had. */
  const asked = new URL(request.url).searchParams.get('merchant');
  /* A proprietor may own several stores. The old route always filed media
   * under the account's first business name, even while the dashboard edited
   * a second hotel. The owner check keeps the caller-derived boundary, but
   * lets an explicitly selected, actually-owned store receive its own R2
   * prefix. */
  let merchant = '';
  try { merchant = await ownerMerchant(request, env, asked, { strict: true }); }
  catch (_) { merchant = ''; }
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url), scope = url.searchParams.get('scope') === 'hotel-room' ? 'hotel-room' : '';
  const ctype = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[ctype];
  if (!ext) return json({ error: 'bad-type', accepted: Object.keys(EXT) }, 415);

  const isVideo = ctype.startsWith('video/');
  if (scope === 'hotel-room' && isVideo) return json({ error: 'bad-type', accepted: Object.keys(EXT).filter((x) => x.startsWith('image/')) }, 415);
  const limit = isVideo ? MAX_VIDEO : MAX_IMAGE;

  // Trust Content-Length when present so an oversized upload is refused before
  // it is buffered; still re-check the real size after reading.
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared && declared > limit) return json({ error: 'too-large', max: limit }, 413);

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'empty' }, 400);
  if (bytes.byteLength > limit) return json({ error: 'too-large', max: limit }, 413);

  // Key is namespaced by merchant so one client's media can never collide with
  // (or be guessed from) another's, and a whole store can be purged by prefix.
  const key = `${merchant}/${scope ? scope + '/' : ''}${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: ctype, cacheControl: 'public, max-age=31536000, immutable' },
    });
  } catch (e) {
    return json({ error: 'upload-failed', detail: String((e && e.message) || e) }, 500);
  }

  return json({ ok: true, key, url: '/api/media/' + key, kind: isVideo ? 'video' : 'photo' });
}

// A stray GET on the collection root — report whether media storage is live, so
// the dashboard can tell the merchant the truth before they pick a file.
export function onRequestGet({ env }) {
  return json({ ok: true, media: !!(env && env.MEDIA) });
}
