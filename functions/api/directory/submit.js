/* POST /api/directory/submit · un commerce demande sa fiche dans l'annuaire.
 *
 * Route publique (aucun compte), défendue sans service payant :
 *   · même origine quand le navigateur en déclare une ;
 *   · un champ piège (`homepage`) : un robot qui le remplit reçoit « merci »
 *     et rien n'est écrit ;
 *   · un temps minimum de saisie, signé dans le formulaire (formTokenAge) ;
 *   · au plus 5 envois par adresse IP et par quart d'heure (le limiteur de
 *     functions/auth/_lib.js) ;
 *   · champs bornés, liens refusés dans le texte, site web et téléphone validés
 *     (functions/api/_phone.js), doublons refusés (même nom ou même numéro
 *     dans la même ville).
 * La fiche entre en `pending` : rien n'est public avant qu'un opérateur
 * l'approuve (functions/api/admin/directory.js).
 *
 * Le formulaire HTML poste en application/x-www-form-urlencoded et reçoit une
 * page (303 vers le merci, ou le formulaire réaffiché avec l'erreur). Un appel
 * JSON reçoit du JSON. */
import { json, limitCheck, limitFail } from '../../auth/_lib.js';
import { normalizePhone, phoneKey } from '../_phone.js';
import { sanitizeListing, baseSlug, uniqueSlug, dedupeKey, findDuplicate, formTokenAge, readBody } from '../_directory.js';
import { renderAddPage, BASE, WORDS } from '../_directory-page.js';

const SCOPE = 'directory-submit';
const MAX_PER_WINDOW = 5;


export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && origin !== new URL(request.url).origin) return json({ error: 'cross-origin' }, 403);
  const { form, body } = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);
  const lang = ['fr', 'en', 'ar'].includes(body.lang) ? body.lang : 'fr';
  const fail = async (error, status) => (form
    ? renderAddPage(env, lang, { values: body, error, status })
    : json({ error }, status));
  const thanks = () => (form
    ? new Response(null, { status: 303, headers: { Location: `${BASE[lang]}${WORDS[lang].add}/?merci=1`, 'Cache-Control': 'no-store' } })
    : json({ ok: true }));

  if (!env || !env.DB) return fail('unavailable', 503);
  const blocked = await limitCheck(request, env, SCOPE);
  if (blocked) return fail('rate', 429);

  /* Le piège : invisible pour une personne, rempli par un robot. */
  if (String(body.homepage || '').trim()) return thanks();
  if (await formTokenAge(env, body.t) < 0) return fail('expired', 400);

  const clean = sanitizeListing(body, normalizePhone);
  if (!clean.ok) return fail(clean.field, 400);
  const v = clean.value;
  if (!v.contact_email && !v.contact_phone) return fail('contact', 400);

  const now = Date.now();
  try {
    if (await findDuplicate(env, v, phoneKey)) {
      await limitFail(request, env, SCOPE, '', MAX_PER_WINDOW);
      return fail('duplicate', 409);
    }
    const slug = await uniqueSlug(env, baseSlug(v.name, v.trade, v.city));
    await env.DB.prepare(
      `INSERT INTO directory_listings (id, slug, kind, merchant, status, name, trade, city, address, description, website,
         show_phone, whatsapp, contact_name, contact_email, contact_phone, dedupe_key, lang, created_ts, updated_ts)
       VALUES (?, ?, 'public', NULL, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('dl-' + crypto.randomUUID(), slug, v.name, v.trade, v.city, v.address, v.description, v.website,
      v.show_phone, v.whatsapp, v.contact_name, v.contact_email || '', v.contact_phone, dedupeKey(v.name, v.city), v.lang, now, now).run();
  } catch (e) {
    return fail('unavailable', 503);
  }
  /* Une demande enregistrée compte dans le quota de l'adresse IP. */
  await limitFail(request, env, SCOPE, '', MAX_PER_WINDOW);
  return thanks();
}
