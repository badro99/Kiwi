// POST /api/agent/oauth/token — swap a one-time code for an access token.
//
// The access token is an ordinary `kwa.` agent key (agent_keys), issued as if
// the owner had minted it on agent-access.html: same scopes, same audit, same
// kill switches (password rotation, suspension, ownership transfer, expiry,
// revocation). So "Disconnect Claude" is simply revoking that key.
//
// The code is consumed BEFORE anything else is checked, in one conditional
// UPDATE: a replayed, raced or wrong-verifier code is burned, never retried.
import { body as jsonBody } from '../_core.js';
import { CONNECT_DAYS, ensureOAuthTables, findClient, hash, oauthError, pkceOk } from '../_oauth.js';
import { secret } from '../_core.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const withCors = (res) => { for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v); return res; };

export function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }

async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (Number(request.headers.get('content-length') || 0) > 8192) return null;
  if (/^application\/json/i.test(type)) return jsonBody(request);
  if (/^application\/x-www-form-urlencoded/i.test(type)) {
    try {
      const raw = await request.text();
      if (raw.length > 8192) return null;
      return Object.fromEntries(new URLSearchParams(raw));
    } catch (_) { return null; }
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env?.DB || !env?.AUTH_SECRET) return withCors(oauthError('temporarily_unavailable', 'Database unavailable.', 503));
  const f = await readForm(request);
  if (!f) return withCors(oauthError('invalid_request', 'Form-encoded or JSON body required.'));
  if (f.grant_type !== 'authorization_code') return withCors(oauthError('unsupported_grant_type', 'Only authorization_code is supported.'));
  const code = String(f.code || ''), verifier = String(f.code_verifier || '');
  const clientId = String(f.client_id || ''), redirectUri = String(f.redirect_uri || '');
  if (!/^kwo_[A-Za-z0-9_-]{43}$/.test(code)) return withCors(oauthError('invalid_grant', 'Unknown or expired code.'));
  try {
    await ensureOAuthTables(env);
    const now = Date.now(), codeHash = await hash(code);
    const burn = await env.DB.prepare(`UPDATE agent_oauth_codes SET used_ts = ?
      WHERE code_hash = ? AND used_ts IS NULL AND expires_ts > ?`).bind(now, codeHash, now).run();
    if (Number(burn.meta?.changes) !== 1) return withCors(oauthError('invalid_grant', 'Unknown, expired or already used code.'));
    const row = await env.DB.prepare('SELECT * FROM agent_oauth_codes WHERE code_hash = ?').bind(codeHash).first();
    const client = await findClient(env, clientId);
    if (!row || !client || row.client_id !== client.id || row.redirect_uri !== redirectUri)
      return withCors(oauthError('invalid_grant', 'Code was issued to another client or redirect URI.'));
    if (!(await pkceOk(verifier, row.challenge))) return withCors(oauthError('invalid_grant', 'PKCE verification failed.'));

    // The approval must still hold at exchange time: same owner, same session
    // generation, neither the account nor the store suspended since.
    const live = await env.DB.prepare(`SELECT m.account_id, m.status AS store_status, a.status AS account_status, a.session_epoch
      FROM merchant_config m JOIN accounts a ON a.id = m.account_id WHERE m.merchant = ?`).bind(row.merchant).first();
    if (!live || live.account_id !== row.account_id || live.store_status === 'suspended' || live.account_status === 'suspended' ||
        Number(live.session_epoch || 0) !== Number(row.account_epoch))
      return withCors(oauthError('invalid_grant', 'The approval is no longer valid. Connect again.'));

    let scopes = [];
    try { scopes = JSON.parse(row.scopes); } catch (_) {}
    // One live key per (store, owner, client): reconnecting replaces the old
    // connection instead of piling up keys against the eight-key ceiling.
    const label = (client.name + ' · connecteur ' + client.id.slice(4, 10)).slice(0, 80);
    await env.DB.prepare(`UPDATE agent_keys SET status = 'revoked'
      WHERE merchant = ? AND account_id = ? AND label = ? AND status != 'revoked'`).bind(row.merchant, row.account_id, label).run();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agent_keys
      WHERE merchant = ? AND account_id = ? AND status != 'revoked' AND expires_ts > ?`).bind(row.merchant, row.account_id, now).first();
    if (Number(count?.n) >= 8)
      return withCors(oauthError('invalid_grant', 'This store already has eight active agent keys. Revoke one on agent-access.html.'));
    const id = crypto.randomUUID(), token = `kwa.${id}.${secret()}`, expires = now + CONNECT_DAYS * 86400000;
    await env.DB.prepare(`INSERT INTO agent_keys
      (id,merchant,account_id,account_epoch,label,token_hash,scopes,status,created_ts,expires_ts,issuer)
      VALUES (?,?,?,?,?,?,?,'active',?,?,'owner')`)
      .bind(id, row.merchant, row.account_id, row.account_epoch, label, await hash(token), JSON.stringify(scopes), now, expires).run();
    await env.DB.prepare('UPDATE agent_oauth_clients SET last_used_ts = ? WHERE client_id = ?').bind(now, client.id).run();
    return withCors(new Response(JSON.stringify({
      access_token: token, token_type: 'Bearer', expires_in: CONNECT_DAYS * 86400, scope: scopes.join(' '),
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } }));
  } catch (_) { return withCors(oauthError('temporarily_unavailable', 'Token exchange failed.', 503)); }
}
