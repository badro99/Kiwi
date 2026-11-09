/* POST /api/directory/report · « Signaler ou demander la suppression / correction ».
 *
 * Chaque fiche publique porte ce lien. La demande entre dans la même file que
 * les inscriptions (directory_requests), et un opérateur la traite dans la
 * console : corriger, ou retirer la fiche en un geste. Mêmes défenses que
 * l'inscription (piège, temps de saisie signé, limiteur par IP, champs
 * bornés). Le contact laissé est privé : il ne sort que vers la console. */
import { json, limitCheck, limitFail } from '../../auth/_lib.js';
import { formTokenAge, listingBySlug, REQUEST_KINDS, readBody } from '../_directory.js';
import { renderReportPage, BASE, WORDS } from '../_directory-page.js';

const SCOPE = 'directory-report';
const MAX_PER_WINDOW = 5;
const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').trim().slice(0, max);

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && origin !== new URL(request.url).origin) return json({ error: 'cross-origin' }, 403);
  const { form, body } = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);
  const lang = ['fr', 'en', 'ar'].includes(body.lang) ? body.lang : 'fr';
  const slug = text(body.slug, 90).toLowerCase();
  const fail = (error, status) => (form ? renderReportPage(env, lang, slug, { values: body, error, status }) : json({ error }, status));
  const thanks = () => (form
    ? new Response(null, { status: 303, headers: { Location: `${BASE[lang]}${slug}/${WORDS[lang].report}/?merci=1`, 'Cache-Control': 'no-store' } })
    : json({ ok: true }));

  if (!env || !env.DB) return fail('unavailable', 503);
  const blocked = await limitCheck(request, env, SCOPE);
  if (blocked) return fail('rate', 429);
  if (String(body.homepage || '').trim()) return thanks();
  if (await formTokenAge(env, body.t) < 0) return fail('expired', 400);

  const kind = REQUEST_KINDS.includes(body.kind) ? body.kind : '';
  const message = text(body.message, 1000);
  const contact = text(body.contact, 160);
  if (!kind || message.length < 3) return fail('message', 400);

  let listing;
  try {
    listing = await env.DB.prepare("SELECT id FROM directory_listings WHERE slug = ? AND status = 'approved'").bind(slug).first();
  } catch (_) { return fail('unavailable', 503); }
  if (!listing || !(await listingBySlug(env, slug))) return json({ error: 'not-found' }, 404);

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO directory_requests (id, listing_id, kind, message, contact, status, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    ).bind('dr-' + crypto.randomUUID(), listing.id, kind, message, contact, now, now).run();
  } catch (_) { return fail('unavailable', 503); }
  await limitFail(request, env, SCOPE, '', MAX_PER_WINDOW);
  return thanks();
}
