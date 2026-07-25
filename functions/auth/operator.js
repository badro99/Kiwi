// POST /auth/operator — operator unlock from ANYWHERE in the app.
//
// The middleware's POST /__operator only runs on the locked login screen. Once a
// user is inside an app they're already authenticated, so that handler is skipped.
// This /auth/* route runs in BOTH states (the gate always lets /auth/* through, and
// an authenticated request passes to next() anyway), so the "long-press any Kiwi
// logo" gesture can open the console from any stage. Verifies a code against the
// operators table and sets the kiwi_op cookie; the client then navigates to the
// console.

import { operatorToken, OP_COOKIE, verifyPassword, json, limitCheck, limitFail, limitClear } from './_lib.js';

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  // Ce code ouvre la console d'administration : les ventes, les PIN et les
  // clients de TOUS les commerçants. Il n'avait aucun plafond d'essais.
  const blocked = await limitCheck(request, env, 'op');
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const code = (body.code || '').toString().trim();

  let ok = false;
  if (env.DB && code) {
    try {
      const rows = await env.DB.prepare('SELECT salt, hash FROM operators').all();
      for (const r of (rows.results || [])) {
        if (await verifyPassword(code, r.salt, r.hash)) { ok = true; break; }
      }
    } catch (_) { /* table missing / db error → no match */ }
  }
  if (!ok) { await limitFail(request, env, 'op'); return json({ error: 'bad-code' }, 401); }
  await limitClear(request, env, 'op');

  const op = await operatorToken(env.AUTH_SECRET);
  return new Response(JSON.stringify({ ok: true, redirect: '/kiwi-admin.html' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': `${OP_COOKIE}=${op}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
    },
  });
}
