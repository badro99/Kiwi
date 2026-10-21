/* POST /api/demo-request · « Demander une démo », depuis le site public.
 *
 * Route publique (aucun compte), donc défendue comme telle :
 *   · même origine seulement quand le navigateur en déclare une ;
 *   · un champ piège (`website`) que seuls les robots remplissent : on leur
 *     répond « reçu » sans rien écrire ;
 *   · au plus 8 demandes par adresse IP et par quart d'heure (le limiteur
 *     partagé de functions/auth/_lib.js) ;
 *   · chaque champ borné et typé (functions/api/_demo-requests.js).
 *
 * La ligne D1 est la demande. Prévenir l'équipe (courriel SUPPORT_ALERT_EMAIL
 * via MAIL_WEBHOOK) et la recopier vers le webhook des leads du partenaire
 * (LEADS_WEBHOOK, comme les inscriptions) se fait après la réponse, au mieux :
 * un envoi raté ne fait jamais échouer la demande, et la console opérateur
 * l'affiche quoi qu'il arrive. */
import { json, limitCheck, limitFail, sendMail, mirrorLead } from '../auth/_lib.js';
import { alertRecipients } from './_support-triage.js';
import { ensureDemoRequests, sanitizeDemoRequest, demoReference, slotText } from './_demo-requests.js';

const SCOPE = 'demo-request';

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'cross-origin' }, 403);
  if (!env || !env.DB) return json({ error: 'unavailable' }, 503);

  const blocked = await limitCheck(request, env, SCOPE);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);

  /* Le piège : invisible pour une personne, rempli par un robot. */
  if (String(body.website || '').trim()) return json({ ok: true, reference: demoReference() });

  const clean = sanitizeDemoRequest(body);
  if (!clean.ok) return json({ error: 'invalid', field: clean.field }, 400);
  const v = clean.value;

  const now = Date.now();
  const id = crypto.randomUUID();
  let reference = demoReference(now);
  try {
    await ensureDemoRequests(env);
    for (let attempt = 0; ; attempt++) {
      try {
        await env.DB.prepare(
          `INSERT INTO demo_requests (id, reference, created_ts, first_name, business, trade, phone, email,
             slot_day, slot_part, note, lang, page, status, updated_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
        ).bind(id, reference, now, v.first_name, v.business, v.trade, v.phone, v.email || '',
          v.slot_day, v.slot_part, v.note, v.lang, v.page, now).run();
        break;
      } catch (e) {
        if (attempt < 2 && /UNIQUE/i.test(String(e && e.message || e))) { reference = demoReference(now); continue; }
        throw e;
      }
    }
  } catch (_) {
    return json({ error: 'storage-unavailable' }, 503);
  }
  /* Une demande enregistrée compte dans le quota de l'adresse IP. */
  await limitFail(request, env, SCOPE);

  const notify = (async () => {
    const lines = [
      'Nouvelle demande de démo depuis le site.',
      '',
      'Référence : ' + reference,
      'Prénom : ' + v.first_name,
      'Commerce : ' + v.business + (v.trade ? ' (' + v.trade + ')' : ''),
      'Téléphone : ' + v.phone,
      v.email ? 'E-mail : ' + v.email : '',
      'Rappel souhaité : ' + slotText(v, now),
      v.note ? 'Précisions : ' + v.note : '',
      '',
      'À traiter dans la console Kiwi, rubrique Démos.',
    ].filter((x) => x !== '').join('\n');
    const to = alertRecipients(env);
    let state = 'unconfigured';
    if (to.length && env.MAIL_WEBHOOK) {
      const sent = await Promise.all(to.map((address) => sendMail(env, {
        to: address, subject: 'Démo · ' + v.business + ' · ' + reference, text: lines,
      })));
      state = sent.some((r) => r && r.ok) ? 'sent' : 'failed';
    }
    await mirrorLead(env, { kind: 'demo', reference, name: v.first_name, business: v.business,
      trade: v.trade, phone: v.phone, email: v.email || '', slot: slotText(v, now), note: v.note, ts: now });
    try {
      await env.DB.prepare('UPDATE demo_requests SET notified = ? WHERE id = ?').bind(state, id).run();
    } catch (_) {}
  })().catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(notify);

  return json({ ok: true, reference });
}
