// POST /auth/signup — create a merchant account, start a session, mirror the
// lead. Body JSON: { email, name, business, password }.
import {
  PASSWORD_MAX, hashPassword, makeSession, sessionCookie, json, normEmail, mirrorLead,
  limitCheck, limitFail, passwordProblem, slugMerchant,
} from './_lib.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.AUTH_SECRET;
  if (!env.DB || !secret) return json({ error: 'not-configured' }, 503);

  const blocked = await limitCheck(request, env, 'signup');
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) {
    await limitFail(request, env, 'signup');
    return json({ error: 'bad-json' }, 400);
  }

  const email = normEmail(body.email);
  const name = String(body.name || '').trim().slice(0, 120);
  const business = String(body.business || '').trim().slice(0, 120);
  const password = String(body.password || '');

  if (email.length > 254 || !EMAIL_RE.test(email)) {
    await limitFail(request, env, 'signup');
    return json({ error: 'email' }, 400);
  }
  if (!name) {
    await limitFail(request, env, 'signup');
    return json({ error: 'name' }, 400);
  }
  const problem = passwordProblem(password, { email, business });
  if (problem) {
    await limitFail(request, env, 'signup');
    return json({ error: 'weak', reason: problem }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first();
  if (existing) {
    await limitFail(request, env, 'signup');
    return json({ error: 'exists' }, 409);
  }

  /* Le nom d'établissement N'EST PAS un simple libellé : tout le backend en
   * dérive l'identité du locataire (slugMerchant → tenantFor → entitledMerchant).
   * Le laisser libre revenait à laisser n'importe qui choisir de quel commerçant
   * il fait partie : s'inscrire sous le nom d'une enseigne existante suffisait à
   * hériter de son tenant. Les résolveurs refusent désormais un slug que le
   * registre attribue à un autre compte ; on ferme ici l'autre moitié, le cas
   * d'une boutique qui existe mais n'a jamais été enregistrée.
   *
   * On ne consulte que des comptes, jamais un secret, et on ne dit pas à qui
   * appartient le nom — seulement qu'il est pris. */
  const wantedSlug = slugMerchant(business);
  if (business && wantedSlug && wantedSlug !== 'client') {
    let taken = false;
    try {
      const claimed = await env.DB.prepare(
        'SELECT account_id FROM merchant_config WHERE merchant = ? LIMIT 1'
      ).bind(wantedSlug).first();
      if (claimed && claimed.account_id) taken = true;
    } catch (_) { /* registre absent (base non migrée) → on s'en remet au balayage */ }
    if (!taken) {
      try {
        const rs = await env.DB.prepare(
          "SELECT business FROM accounts WHERE business IS NOT NULL AND business <> ''"
        ).all();
        taken = (rs.results || []).some((r) => slugMerchant(r.business) === wantedSlug);
      } catch (_) { /* illisible → ne bloque pas une inscription légitime */ }
    }
    if (taken) {
      await limitFail(request, env, 'signup');
      return json({ error: 'business-taken' }, 409);
    }
  }

  const { salt, hash } = await hashPassword(password);
  const id = 'acc-' + crypto.randomUUID();
  const ts = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, name, business, salt, hash, ts).run();
  } catch (e) {
    // UNIQUE(email) race → treat as already-registered.
    await limitFail(request, env, 'signup');
    return json({ error: 'exists' }, 409);
  }

  /* Effacer le compteur à chaque succès rendait la création de comptes
   * illimitée : un script alternait les inscriptions réussies et n'était jamais
   * freiné. Un compte créé compte donc comme une tentative. */
  await limitFail(request, env, 'signup');

  // Best-effort lead mirror to the Google Sheet — never blocks the response.
  context.waitUntil(mirrorLead(env, { email, name, business, ts }));

  const token = await makeSession(id, secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token),
    },
  });
}
