// POST /api/comptable/session {token}  échange le jeton du lien contre le cookie.
//
// Le jeton arrive dans le fragment de l'URL (comptable.html#<jeton>) : il ne
// part jamais dans une requête GET ni dans un Referer. La page le poste ici une
// fois, efface le fragment, et ne le garde pas. En échange : le cookie
// `kiwi_acct` (HttpOnly, Secure, SameSite=Lax, Path=/api/comptable) lié À CET
// ACCÈS, que seul books.js sait lire.
//
// Le jeton reste valable jusqu'à sa révocation ou son expiration : l'expert peut
// rouvrir son lien depuis un deuxième appareil. Le propriétaire le coupe d'un
// geste (access.js), et books.js revérifie la base à chaque lecture.
//
// Endpoint de type « identifiant » : limité comme les autres (pair_attempts),
// vérifié AVANT de regarder le jeton pour qu'une entrée malformée ne soit pas
// une sonde gratuite.

import { json, limitCheck, limitFail, limitClear } from '../../auth/_lib.js';
import {
  ensureAccountantAccess, sha256Hex, accessStatus, TOKEN_RE,
  accountantCookie, accountantCookieValue,
} from './_lib.js';

const SCOPE = 'comptable-exchange';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, { Allow: 'POST' });
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const blocked = await limitCheck(request, env, SCOPE);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch (_) { body = null; }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  const invalid = async () => {
    const counted = await limitFail(request, env, SCOPE);
    if (!counted) return json({ error: 'rate-limit-unavailable' }, 503);
    return json({ error: 'invalid-link' }, 401);
  };
  if (!TOKEN_RE.test(token)) return invalid();

  if (!(await ensureAccountantAccess(env))) return json({ error: 'unavailable' }, 503);
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT id, merchant, label, revoked_ts, expires_ts FROM accountant_access WHERE token_hash = ?'
    ).bind(await sha256Hex(token)).first();
  } catch (_) { return json({ error: 'unavailable' }, 503); }
  if (!row) return invalid();

  const status = accessStatus(row);
  if (status !== 'active') return json({ error: status }, 401);

  await limitClear(request, env, SCOPE);
  const now = Date.now();
  try { await env.DB.prepare('UPDATE accountant_access SET last_seen_ts = ? WHERE id = ?').bind(now, row.id).run(); } catch (_) {}
  const value = await accountantCookieValue(env.AUTH_SECRET, row.id);
  return json(
    { ok: true, merchant: String(row.merchant), label: row.label || '', expiresTs: Number(row.expires_ts) },
    200,
    { 'Set-Cookie': accountantCookie(value, (Number(row.expires_ts) - now) / 1000) },
  );
}
