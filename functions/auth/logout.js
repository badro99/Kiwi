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
import { clearSessionCookie, GATE_COOKIE, OP_COOKIE, OPID_COOKIE } from './_lib.js';

const CLEAR = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export async function onRequest() {
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', clearSessionCookie());
  headers.append('Set-Cookie', `${GATE_COOKIE}=; ${CLEAR}`);
  headers.append('Set-Cookie', `${OP_COOKIE}=; ${CLEAR}`);
  headers.append('Set-Cookie', `${OPID_COOKIE}=; ${CLEAR}`);
  return new Response(null, { status: 303, headers });
}
