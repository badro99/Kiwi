// POST /api/expenses/receipt?merchant=<slug>&id=<expenseId>   (corps = l'image)
// GET  /api/expenses/receipt?merchant=<slug>&id=<expenseId>
// DELETE /api/expenses/receipt?merchant=<slug>&id=<expenseId>  (la dépense est supprimée)
//
// La photo d'un ticket de dépense. Elle vit dans R2 (binding MEDIA) sous
// private/expenses/<slug>/<id>.jpg : le lecteur public des médias refuse le
// préfixe private/ (functions/api/media/[[key]].js), et seule cette route la
// rend, au patron et aux opérateurs Kiwi (./_owner.js). Le navigateur réduit la
// photo avant l'envoi (bord long 1 600 px) ; le plafond ici est un filet.
// Sans MEDIA : 503, et la dépense s'enregistre quand même sans sa photo.
import { json } from '../../auth/_lib.js';
import { expensesReader } from './_owner.js';

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 4 * 1024 * 1024;

async function target(request, env) {
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const id = String(url.searchParams.get('id') || '');
  if (!(await expensesReader(request, env, merchant))) return { error: json({ error: 'owner-required' }, 403) };
  if (!ID.test(id)) return { error: json({ error: 'bad-id' }, 400) };
  return { key: `private/expenses/${merchant}/${id}.jpg` };
}

export async function onRequestPost({ request, env }) {
  const t = await target(request, env);
  if (t.error) return t.error;
  const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type)) return json({ error: 'image-only' }, 415);
  if (!env || !env.MEDIA) return json({ error: 'no-media' }, 503);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: 'empty' }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: 'too-large' }, 413);
  try {
    await env.MEDIA.put(t.key, body, { httpMetadata: { contentType: type } });
  } catch (_) {
    return json({ error: 'media-unavailable' }, 503);
  }
  return json({ ok: true, key: t.key });
}

export async function onRequestGet({ request, env }) {
  const t = await target(request, env);
  if (t.error) return t.error;
  if (!env || !env.MEDIA) return json({ error: 'no-media' }, 503);
  let obj = null;
  try { obj = await env.MEDIA.get(t.key); } catch (_) { return json({ error: 'media-unavailable' }, 503); }
  if (!obj) return json({ error: 'not-found' }, 404);
  const type = (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg';
  return new Response(obj.body, { headers: {
    'Content-Type': TYPES.has(type) ? type : 'image/jpeg',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  } });
}

/* La dépense supprimée emporte sa photo. Supprimer deux fois n'est pas une
   erreur : la page peut réessayer sans savoir si la première fois a abouti. */
export async function onRequestDelete({ request, env }) {
  const t = await target(request, env);
  if (t.error) return t.error;
  if (!env || !env.MEDIA) return json({ error: 'no-media' }, 503);
  try { await env.MEDIA.delete(t.key); } catch (_) { return json({ error: 'media-unavailable' }, 503); }
  return json({ ok: true });
}
