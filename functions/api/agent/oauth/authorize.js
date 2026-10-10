// /api/agent/oauth/authorize — the server side of agent-connect.html.
//
//   GET  ?client_id&redirect_uri  → who is asking, and which stores the
//        signed-in owner may connect. 401 {error:'sign-in'} without a session.
//   POST {client_id, redirect_uri, state, code_challenge, code_challenge_method,
//         merchant, scopes} → a one-time code (5 min) and the URL to send the
//        browser back to.
//
// Only the store's OWNER account approves. owner() is the same check
// agent-access.html uses to mint a key by hand: account session, account not
// suspended, merchant_config.account_id equal to that account, store not
// suspended. A till, a staff PIN, the team passcode or an operator session
// cannot approve a connection.
import { activeAccountSession } from '../../../auth/_lib.js';
import { SCOPES, body, owner, response, sameOrigin, text } from '../_core.js';
import { CODE_TTL_MS, DEFAULT_SCOPES, ensureOAuthTables, findClient, hash, newCode, origin } from '../_oauth.js';

async function check(env, clientId, redirectUri) {
  const client = await findClient(env, clientId);
  if (!client) return { error: 'unknown-client' };
  if (!client.redirectUris.includes(redirectUri)) return { error: 'redirect-mismatch' };
  return { client };
}

export async function onRequestGet({ request, env }) {
  if (!env?.DB || !env?.AUTH_SECRET) return response({ error: 'unavailable' }, 503);
  const url = new URL(request.url);
  try {
    await ensureOAuthTables(env);
    const c = await check(env, url.searchParams.get('client_id'), url.searchParams.get('redirect_uri') || '');
    // A bad client or redirect is reported to the page, never redirected to:
    // sending the browser to an unverified URI is the open-redirect this check exists for.
    if (c.error) return response({ error: c.error }, 400);
    const session = await activeAccountSession(request, env);
    if (!session?.aid) return response({ error: 'sign-in', client: { name: c.client.name } }, 401);
    const rows = await env.DB.prepare(`SELECT merchant, name, type, city FROM merchant_config
      WHERE account_id = ? AND COALESCE(status,'active') != 'suspended' ORDER BY name`).bind(session.aid).all();
    return response({ client: { name: c.client.name, host: new URL(url.searchParams.get('redirect_uri')).host },
      stores: rows.results || [], scopes: SCOPES, defaults: DEFAULT_SCOPES });
  } catch (_) { return response({ error: 'unavailable' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return response({ error: 'cross-origin' }, 403);
  const data = await body(request);
  if (!data) return response({ error: 'invalid-json' }, 400);
  const redirectUri = text(data.redirect_uri, 500), merchant = text(data.merchant, 64);
  const challenge = text(data.code_challenge, 128), state = text(data.state, 500);
  try {
    await ensureOAuthTables(env);
    const c = await check(env, text(data.client_id, 80), redirectUri);
    if (c.error) return response({ error: c.error }, 400);
    if (data.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
      return response({ error: 'pkce-required' }, 400);
    const who = await owner(request, env, merchant);
    if (!who) return response({ error: 'not-owner' }, 403);
    const scopes = Array.isArray(data.scopes) ? [...new Set(data.scopes)] : [];
    if (!scopes.length || scopes.some(s => !SCOPES.includes(s))) return response({ error: 'invalid-scopes' }, 400);
    const code = newCode(), now = Date.now();
    await env.DB.prepare(`INSERT INTO agent_oauth_codes
      (code_hash, client_id, redirect_uri, merchant, account_id, account_epoch, scopes, challenge, created_ts, expires_ts)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(await hash(code), c.client.id, redirectUri, merchant, who.id, who.epoch,
      JSON.stringify(scopes), challenge, now, now + CODE_TTL_MS).run();
    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    if (state) back.searchParams.set('state', state);
    back.searchParams.set('iss', origin(request));
    return response({ ok: true, redirect: back.toString() });
  } catch (_) { return response({ error: 'unavailable' }, 503); }
}
