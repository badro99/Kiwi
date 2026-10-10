// POST /api/agent/oauth/register — dynamic client registration (RFC 7591) for
// the remote Kiwi connector. Public clients only: no secret is issued, PKCE is
// what binds the code to the client that asked for it.
//
// Registering grants NOTHING. A client id is a name and a list of redirect
// URIs; access to a store still needs its owner to sign in and approve on
// agent-connect.html. That is why this route is open, and why it is not rate
// limited per IP: claude.ai registers from shared egress addresses, and a
// per-IP cap would lock every merchant out because of one noisy neighbour.
// Abandoned registrations (never used for a token) are pruned after a day.
import { ensureOAuthTables, newClientId, oauthError, redirectOk } from '../_oauth.js';

export async function onRequestPost({ request, env }) {
  if (!env?.DB) return oauthError('temporarily_unavailable', 'Database unavailable.', 503);
  if (Number(request.headers.get('content-length') || 0) > 8192) return oauthError('invalid_client_metadata', 'Registration too large.');
  let data;
  try { data = await request.json(); } catch (_) { return oauthError('invalid_client_metadata', 'Body must be JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return oauthError('invalid_client_metadata', 'Body must be a JSON object.');
  const uris = Array.isArray(data.redirect_uris) ? data.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectOk))
    return oauthError('invalid_redirect_uri', 'One to five https redirect URIs (or http on localhost) are required.');
  const method = data.token_endpoint_auth_method;
  if (method && method !== 'none') return oauthError('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported.');
  const grants = data.grant_types;
  if (grants && (!Array.isArray(grants) || !grants.includes('authorization_code')))
    return oauthError('invalid_client_metadata', 'grant_types must include authorization_code.');
  const name = String(data.client_name || 'Assistant IA').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'Assistant IA';
  try {
    await ensureOAuthTables(env);
    const now = Date.now();
    await env.DB.prepare('DELETE FROM agent_oauth_clients WHERE last_used_ts = 0 AND created_ts < ?').bind(now - 86400000).run();
    const id = newClientId();
    await env.DB.prepare('INSERT INTO agent_oauth_clients (client_id, name, redirect_uris, created_ts) VALUES (?,?,?,?)')
      .bind(id, name, JSON.stringify(uris), now).run();
    return new Response(JSON.stringify({
      client_id: id, client_id_issued_at: Math.floor(now / 1000), client_name: name,
      redirect_uris: uris, grant_types: ['authorization_code'], response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }), { status: 201, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (_) { return oauthError('temporarily_unavailable', 'Registration failed.', 503); }
}
