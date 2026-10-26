// OAuth 2.1 for the remote Kiwi connector, so a merchant can add Kiwi to
// claude.ai (Connectors → Add custom connector → https://kiwi-os.com/api/agent/mcp)
// and build a Claude Dashboard on their own numbers.
//
// The flow is the MCP authorization profile, and nothing more:
//   1. The client hits /api/agent/mcp without a token → 401 whose
//      WWW-Authenticate points at the protected-resource metadata.
//   2. It reads /.well-known/oauth-protected-resource and
//      /.well-known/oauth-authorization-server (served by _middleware.js).
//   3. It registers itself (RFC 7591, public client, no secret).
//   4. The OWNER signs in on /agent-connect.html, picks one store and the
//      scopes, and approves. Only the store's owner account can approve —
//      never a till, a staff PIN, the shared team passcode or an operator.
//   5. The client swaps the one-time code (PKCE S256 required) for an access
//      token. That token IS an ordinary `kwa.` agent key: same table, same
//      per-tool scopes, same audit, visible and revocable on agent-access.html.
//      Revoking it there disconnects Claude.
//
// No refresh tokens: a connection lasts CONNECT_DAYS, then the owner approves
// again. That keeps "who can read my books" a decision the owner renews.
import { SCOPES, ensureTables, hash, secret } from './_core.js';

export const CONNECT_DAYS = 30;
export const CODE_TTL_MS = 5 * 60 * 1000;
/* What a new connection gets unless the owner ticks more. Read-only and free
 * of personal data: enough for a sales dashboard. Customer search, hotel
 * guests and every write stay opt-in on the consent screen. */
export const DEFAULT_SCOPES = ['overview:read', 'sales:read', 'payments:read', 'orders:read', 'catalog:read', 'cash:read', 'tables:read'];
export const CONNECT_PATH = '/agent-connect.html';

export function origin(request) { return new URL(request.url).origin; }
export function resourceUrl(request) { return origin(request) + '/api/agent/mcp'; }

export function protectedResourceMetadata(request) {
  return {
    resource: resourceUrl(request),
    authorization_servers: [origin(request)],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Kiwi',
    resource_documentation: origin(request) + '/support',
  };
}
export function authorizationServerMetadata(request) {
  const o = origin(request);
  return {
    issuer: o,
    authorization_endpoint: o + CONNECT_PATH,
    token_endpoint: o + '/api/agent/oauth/token',
    registration_endpoint: o + '/api/agent/oauth/register',
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SCOPES,
    service_documentation: o + '/support',
  };
}
export function metadataResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*' } });
}

export async function ensureOAuthTables(env) {
  await ensureTables(env);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_oauth_clients (
    client_id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL,
    created_ts INTEGER NOT NULL, last_used_ts INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_oauth_codes (
    code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
    merchant TEXT NOT NULL, account_id TEXT NOT NULL, account_epoch INTEGER NOT NULL,
    scopes TEXT NOT NULL, challenge TEXT NOT NULL, created_ts INTEGER NOT NULL,
    expires_ts INTEGER NOT NULL, used_ts INTEGER
  )`).run();
}

/* A redirect URI a client may register: https anywhere, or http on the
 * loopback interface only (desktop clients, the MCP inspector). No fragment,
 * no credentials in the URL, nothing that is not a web address. */
export function redirectOk(u) {
  let url;
  try { url = new URL(String(u || '')); } catch (_) { return false; }
  if (url.hash || url.username || url.password || String(u).length > 500) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export async function findClient(env, clientId) {
  if (!/^kwc_[A-Za-z0-9_-]{20,64}$/.test(String(clientId || ''))) return null;
  const row = await env.DB.prepare('SELECT client_id, name, redirect_uris FROM agent_oauth_clients WHERE client_id = ?')
    .bind(clientId).first();
  if (!row) return null;
  let uris = [];
  try { uris = JSON.parse(row.redirect_uris); } catch (_) {}
  return { id: row.client_id, name: row.name, redirectUris: Array.isArray(uris) ? uris : [] };
}

export function newClientId() { return 'kwc_' + secret().slice(0, 32); }
export function newCode() { return 'kwo_' + secret(); }
export { hash };

/* PKCE S256: base64url(sha256(verifier)) must equal the stored challenge. */
export async function pkceOk(verifier, challenge) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(verifier || ''))) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (b64.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < b64.length; i++) diff |= b64.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

export function parseScopes(raw, fallback = DEFAULT_SCOPES) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/).filter(Boolean);
  const valid = [...new Set(list)].filter(s => SCOPES.includes(s));
  return valid.length ? valid : fallback.slice();
}

export function oauthError(error, description, status = 400) {
  return new Response(JSON.stringify({ error, error_description: description }), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
}
