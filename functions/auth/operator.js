// POST /auth/operator — operator unlock from ANYWHERE in the app.
//
// The middleware's POST /__operator only runs on the locked login screen. Once a
// user is inside an app they're already authenticated, so that handler is skipped.
// This /auth/* route runs in BOTH states (the gate always lets /auth/* through, and
// an authenticated request passes to next() anyway), so the "long-press any Kiwi
// logo" gesture can open the console from any stage. Verifies a code against the
// operators table and sets the kiwi_op cookie; the client then navigates to the
// console.

import {
  operatorToken, OP_COOKIE, operatorIdToken, OPID_COOKIE,
  verifyPassword, json, limitClear, limitReserve,
} from './_lib.js';

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  // Ce code ouvre la console d'administration : les ventes, les PIN et les
  // clients de TOUS les commerçants. Il n'avait aucun plafond d'essais.
  const hold = await limitReserve(request, env, 'op');   // l'essai est compté AVANT la comparaison : une rafale ne passe plus (audit du 26 nov.)
  if (!hold.ok) return hold.response;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const code = (body.code || '').toString().trim();

  let ok = false;
  let opId = '';
  if (env.DB && code) {
    try {
      const rows = await env.DB.prepare('SELECT id, salt, hash FROM operators').all();
      for (const r of (rows.results || [])) {
        if (await verifyPassword(code, r.salt, r.hash)) { ok = true; opId = r.id || ''; break; }
      }
    } catch (_) { /* table missing / db error → no match */ }
  }
  if (!ok) return json({ error: 'bad-code' }, 401);
  await limitClear(request, env, 'op');

  if (!opId) return json({ error: 'operator-identity-missing' }, 503);
  const op = await operatorToken(env.AUTH_SECRET);
  const opIdentity = await operatorIdToken(env.AUTH_SECRET, opId);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', `${OP_COOKIE}=${op}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
  headers.append('Set-Cookie', `${OPID_COOKIE}=${opIdentity}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
  return new Response(JSON.stringify({ ok: true, redirect: '/kiwi-admin.html' }), {
    status: 200,
    headers,
  });
}
