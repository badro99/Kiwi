// /auth/logout — clear EVERY Kiwi auth cookie and land on the gate.
//
// Three cookies can authorize a request past the middleware, in order:
//   · kiwi_sess  (merchant account session — email + password login)
//   · kiwi_gate  (staff bypass — the shared SITE_PASSWORD "Accès équipe")
//   · kiwi_op    (operator God mode — a code from the operators table)
//
// A merchant tapping "Changer de compte" wants the auth screen. If we only
// clear kiwi_sess (the old behavior), any lingering staff/operator cookie on
// this browser makes the middleware keep serving pages, so the redirect to `/`
// silently returns index.html — the landing page, not the login screen. Nuke
// all three so the very next request hits the middleware's lockout branch and
// renders the account form.
//
// Owner + partner: yes, this also logs YOU out of the staff bypass and the
// operator console. That's the honest semantic of an explicit "logout" click;
// re-entering SITE_PASSWORD (or the operator code) restores access in one tap.
//
// Effacer le cookie ne suffit pas : le jeton est signé et sans état, une copie
// (autre navigateur, journal, poste partagé) restait valable jusqu'à son
// échéance. La session présentée est donc aussi révoquée côté serveur
// (session_revocations, par son sid) : cette session-là seulement, pas les
// autres appareils du compte. Au mieux : si la base ne répond pas, les cookies
// partent quand même.
import {
  clearSessionCookie, GATE_COOKIE, OP_COOKIE, OPID_COOKIE,
  SESS_COOKIE, readCookie, readSession, revokeSession,
} from './_lib.js';

const CLEAR = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

/* « Sortir » sur la caisse ferme la session du patron, pas la caisse. Une
 * tablette appairée doit revenir à son écran de code, pas sur la page d'accueil
 * publique : elle rouvre la caisse avec sa propre preuve (functions/_middleware.js
 * › TILL_PATHS). Destination fixe, jamais une URL reçue telle quelle. */
const NEXT = { '/kiwi-caisse': '/kiwi-caisse' };

export async function onRequest(context) {
  let to = '/';
  try { to = NEXT[new URL(context.request.url).searchParams.get('next') || ''] || '/'; } catch (_) {}
  const env = context.env || {};
  if (env.AUTH_SECRET && env.DB) {
    try {
      const sess = await readSession(readCookie(context.request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess) await revokeSession(env, sess);
    } catch (_) { /* la déconnexion du navigateur passe avant tout */ }
  }
  const headers = new Headers({ Location: to });
  headers.append('Set-Cookie', clearSessionCookie());
  headers.append('Set-Cookie', `${GATE_COOKIE}=; ${CLEAR}`);
  headers.append('Set-Cookie', `${OP_COOKIE}=; ${CLEAR}`);
  headers.append('Set-Cookie', `${OPID_COOKIE}=; ${CLEAR}`);
  return new Response(null, { status: 303, headers });
}
