// POST /auth/login — verify credentials, start a session.
// Body JSON: { email, password }.
import { PASSWORD_MAX, verifyPassword, makeSession, sessionCookie, json, normEmail, limitCheck, limitFail, limitClear } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.AUTH_SECRET;
  if (!env.DB || !secret) return json({ error: 'not-configured' }, 503);

  // Sans plafond, le mot de passe d'un commerçant se devine au script — et sa
  // boutique, ce sont ses ventes et ses clients. Compteur par IP, fenêtre de
  // 15 min ; une connexion réussie l'efface, donc un oubli honnête ne coûte rien.
  const blocked = await limitCheck(request, env, 'login');
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const email = normEmail(body.email);
  const password = String(body.password || '');

  // Reject hostile oversized inputs before a DB lookup or an expensive PBKDF2.
  // Keep the same generic response as ordinary invalid credentials.
  if (email.length > 254 || password.length > PASSWORD_MAX) {
    await limitFail(request, env, 'login');
    return json({ error: 'bad-creds' }, 401);
  }

  const row = await env.DB.prepare('SELECT id, salt, hash FROM accounts WHERE email = ?').bind(email).first();
  // Verify even when the row is missing to avoid leaking which emails exist.
  const ok = row
    ? await verifyPassword(password, row.salt, row.hash)
    : await verifyPassword(password, '00', '00');
  if (!row || !ok) { await limitFail(request, env, 'login'); return json({ error: 'bad-creds' }, 401); }
  await limitClear(request, env, 'login');

  const token = await makeSession(row.id, secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token),
    },
  });
}
