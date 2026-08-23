// POST /auth/login — verify credentials, start a session.
// Body JSON: { email, password }.
import { PASSWORD_MAX, verifyPassword, makeSession, sessionCookie, json, normEmail, limitCheck, limitFail, limitClear, targetKey } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.AUTH_SECRET;
  if (!env.DB || !secret) return json({ error: 'not-configured' }, 503);

  // Sans plafond, le mot de passe d'un commerçant se devine au script — et sa
  // boutique, ce sont ses ventes et ses clients. Compteur par IP, fenêtre de
  // 15 min ; une connexion réussie l'efface, donc un oubli honnête ne coûte rien.
  /* Le compteur était rattaché à l'IP SEULE, et `limitClear` supprimait la ligne
   * à chaque succès : quiconque possède un compte alternait sept essais contre
   * la victime et une connexion chez lui, indéfiniment depuis une seule adresse.
   * Deux compteurs désormais : celui de la SOURCE, qui ne s'efface jamais, et
   * celui de la CIBLE, que seule la réussite de CETTE adresse remet à zéro. */
  const blocked = await limitCheck(request, env, 'login');
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const email = normEmail(body.email);
  const target = await targetKey(secret, 'login', email);
  const blockedTarget = target ? await limitCheck(request, env, 'login', target) : null;
  if (blockedTarget) return blockedTarget;
  const failBoth = async () => {
    await limitFail(request, env, 'login');
    if (target) await limitFail(request, env, 'login', target);
  };
  const password = String(body.password || '');

  // Reject hostile oversized inputs before a DB lookup or an expensive PBKDF2.
  // Keep the same generic response as ordinary invalid credentials.
  if (email.length > 254 || password.length > PASSWORD_MAX) {
    await failBoth();
    return json({ error: 'bad-creds' }, 401);
  }

  const row = await env.DB.prepare('SELECT id, salt, hash FROM accounts WHERE email = ?').bind(email).first();
  // Verify even when the row is missing to avoid leaking which emails exist.
  const ok = row
    ? await verifyPassword(password, row.salt, row.hash)
    : await verifyPassword(password, '00', '00');
  if (!row || !ok) { await failBoth(); return json({ error: 'bad-creds' }, 401); }
  // Seul le compteur de la CIBLE s'efface : celui de la source garde sa mémoire.
  if (target) await limitClear(request, env, 'login', target);

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
