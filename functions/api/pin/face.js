// POST /api/pin/face: confirm, for the signed-in account, that a Face ID unlock
// record enrolled on this device still stands. No code is sent or compared.
//
// Body JSON: { access: 'owner' | 'manager', mark }  → { ok, access }
//
// `mark` is issued ONLY by POST /api/pin/verify, next to a code the server has just
// proven, for that code's tier (faceMarkState in functions/auth/_lib.js). This
// route never issues one: a session alone cannot enrol Face ID, nor claim a tier
// it did not prove. The mark is an HMAC (AUTH_SECRET) over the tier and the
// account's dashboard codes, so a change to any owner or manager code, or to who
// holds those roles, makes the old mark fail with 403 { ok: false }. A cashier's
// code is not part of it.
//
// Session-bound: no session, or a suspended / revoked account, answers 401. Answers
// are JSON with no code, no name list, and no roster.
import { faceMarkState, json } from '../../auth/_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ ok: false, error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'bad-json' }, 400); }
  const access = String(body && body.access || '');
  if (access !== 'owner' && access !== 'manager') return json({ ok: false, error: 'bad-access' }, 400);
  const mark = typeof (body && body.mark) === 'string' ? body.mark : '';
  if (!mark) return json({ ok: false, error: 'missing-mark' }, 400);

  const st = await faceMarkState(request, env, access);
  if (st.status === 'unauthorized') return json({ ok: false, error: 'unauthorized' }, 401);
  if (st.status === 'unavailable') return json({ ok: false, error: 'staff-unavailable' }, 503);
  if (st.status !== 'ok') return json({ ok: false, error: 'no-such-access' }, 403);
  if (mark !== st.mark) return json({ ok: false, error: 'changed' }, 403);
  return json({ ok: true, access }, 200);
}
