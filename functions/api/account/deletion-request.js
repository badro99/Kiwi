// Owner-initiated account deletion, not a till/store deletion API. A durable
// request enters the existing operator queue; it never erases books on submit.
import { json, readSession, readCookie, SESS_COOKIE, PASSWORD_MAX, verifyPassword, limitCheck, limitFail } from '../../auth/_lib.js';

async function identity(request, env) {
  const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (!session || !session.aid) return null;
  return env.DB.prepare('SELECT id,email,business,salt,hash FROM accounts WHERE id = ?').bind(session.aid).first();
}
async function requestId(accountId) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('account-deletion:' + accountId));
  return 'deletion-' + Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function existing(env, id) {
  return env.DB.prepare("SELECT reference,status,created_ts FROM support_tickets WHERE id = ? AND category = 'account-deletion'").bind(id).first();
}
function publicRequest(row) {
  return row ? { reference: row.reference, status: row.status, createdAt: row.created_ts, deadline: row.created_ts + 30 * 86400000 } : null;
}
export async function onRequestGet({ request, env }) {
  if (!env?.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  try {
    const account = await identity(request, env);
    if (!account) return json({ error: 'unauthenticated' }, 401);
    return json({ account: { email: account.email, business: account.business || '' }, request: publicRequest(await existing(env, await requestId(account.id))) });
  } catch (_) { return json({ error: 'db-unavailable' }, 503); }
}
export async function onRequestPost({ request, env }) {
  if (!env?.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin && !['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'].includes(origin)) return json({ error: 'forbidden-origin' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'bad-content-type' }, 415);
  try {
    const account = await identity(request, env);
    if (!account) return json({ error: 'unauthenticated' }, 401);
    const id = await requestId(account.id);
    const blocked = await limitCheck(request, env, 'account-deletion', id);
    if (blocked) return blocked;
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: 'body-too-large' }, 413);
    let body; try { body = JSON.parse(raw); } catch (_) { return json({ error: 'bad-json' }, 400); }
    if (!body || body.confirm !== true) return json({ error: 'confirmation-required' }, 400);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > PASSWORD_MAX || !await verifyPassword(password, account.salt, account.hash)) {
      await limitFail(request, env, 'account-deletion', id);
      return json({ error: 'bad-creds' }, 401);
    }
    const prior = await existing(env, id);
    if (prior) return json({ ok: true, duplicate: true, request: publicRequest(prior) });
    // Account-wide, including accounts without a store. Empty merchant keeps
    // this request out of paired-till support feeds; the global operator queue
    // still displays it. The authenticated account is the sole authority.
    const now = Date.now(), reference = 'D-' + id.slice(9, 21).toUpperCase();
    const summary = 'Demande de suppression du compte Kiwi et de toutes ses données associées. Traitement sous 30 jours, confirmation au titulaire. Conserver uniquement les données légalement requises, en informer le titulaire.';
    const diagnostics = JSON.stringify({ account_id: account.id, scope: 'entire-account', requested_ts: now, deadline_ts: now + 30 * 86400000 });
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO support_tickets (id,reference,merchant,category,priority,status,channel,contact,summary,diagnostics,assignee,created_ts,updated_ts)
        VALUES (?,?,'','account-deletion','urgent','open','email',?,?,?,'',?,?)`).bind(id, reference, account.email, summary, diagnostics, now, now),
      env.DB.prepare(`INSERT OR IGNORE INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts)
        VALUES (?,?,'client','internal','account-owner',?,'received',?)`).bind(id + '-request', id, summary, now)
    ]);
    const saved = await existing(env, id);
    if (!saved) return json({ error: 'db-unavailable' }, 503);
    return json({ ok: true, request: publicRequest(saved) });
  } catch (_) { return json({ error: 'db-unavailable' }, 503); }
}
function methodNotAllowed() {
  return json({ error: 'method-not-allowed' }, 405, { Allow: 'GET, POST' });
}
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
