#!/usr/bin/env node
/* The remote Kiwi connector: OAuth (register → owner consent → PKCE token)
 * and the Streamable-HTTP MCP endpoint, run as the REAL Pages Functions
 * against an in-memory SQLite loaded from schema.sql. Plus the parity check
 * between the remote tool list and the local stdio client's.
 *
 *   node tools/agent-mcp-remote-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as register } from '../functions/api/agent/oauth/register.js';
import { onRequestGet as authGet, onRequestPost as authPost } from '../functions/api/agent/oauth/authorize.js';
import { onRequestPost as token } from '../functions/api/agent/oauth/token.js';
import { onRequestPost as mcp, onRequestGet as mcpGet } from '../functions/api/agent/mcp.js';
import { onRequestPost as changeKeys } from '../functions/api/agent/keys.js';
import { TOOLS } from '../functions/api/agent/_tools.js';
import { protectedResourceMetadata, authorizationServerMetadata } from '../functions/api/agent/_oauth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const now = Date.now(), secret = 'mcp-remote-secret-01234567890123456789', aid = 'acc-mcp-owner', other = 'acc-mcp-other';
for (const id of [aid, other]) sql.prepare('INSERT INTO accounts (id,email,salt,hash,created_ts) VALUES (?,?,?,?,?)').run(id, id + '@mcp.test', 's', 'h', now);
for (const [m, a] of [['mcp-shop', aid], ['mcp-other', other]])
  sql.prepare('INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?)').run(m, '{}', a, m, 'active', now);
sql.prepare('INSERT INTO sales (id,merchant,amount,amount_cents,method,ts) VALUES (?,?,?,?,?,?)').run('s-own', 'mcp-shop', 120, 12000, 'card', now);
sql.prepare('INSERT INTO sales (id,merchant,amount,amount_cents,method,ts) VALUES (?,?,?,?,?,?)').run('s-other', 'mcp-other', 900, 90000, 'cash', now);
sql.prepare('INSERT INTO clients (id,merchant,name,phone,deleted,srv_ts) VALUES (?,?,?,?,?,?)').run('c-own', 'mcp-shop', 'Client Secret', '0600000000', 0, now);

class Statement {
  constructor(q) { this.q = q; this.args = []; }
  bind(...a) { this.args = a.map(x => x === undefined ? null : x); return this; }
  async first() { return sql.prepare(this.q).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.q).all(...this.args) }; }
  async run() { const r = sql.prepare(this.q).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}
const env = { DB: { prepare: q => new Statement(q), async batch(s) { const o = []; for (const x of s) o.push(await x.run()); return o; } }, AUTH_SECRET: secret };
const base = 'https://kiwi.test';
const ownerCookie = sessionCookie(await makeSession(aid, secret)).split(';')[0];
const otherCookie = sessionCookie(await makeSession(other, secret)).split(';')[0];
const json = (p, data, headers = {}, method = 'POST') => new Request(base + p, { method,
  headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(data) }) });
const out = async r => ({ status: r.status, headers: r.headers, data: r.status === 202 || r.status === 204 ? null : await r.json() });
let n = 0; const check = (v, msg) => { assert.ok(v, msg); n++; };

/* ── discovery ─────────────────────────────────────────────────────────── */
const pr = protectedResourceMetadata(new Request(base + '/.well-known/oauth-protected-resource'));
check(pr.resource === base + '/api/agent/mcp' && pr.authorization_servers[0] === base, 'protected-resource metadata names the MCP URL and issuer');
const as = authorizationServerMetadata(new Request(base + '/.well-known/oauth-authorization-server'));
check(as.code_challenge_methods_supported.join() === 'S256' && as.token_endpoint_auth_methods_supported.join() === 'none', 'PKCE S256, public clients only');
check(as.authorization_endpoint === base + '/agent-connect.html', 'consent page is the authorization endpoint');

/* ── unauthenticated MCP ───────────────────────────────────────────────── */
const anon = await out(await mcp({ env, request: json('/api/agent/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) }));
check(anon.status === 401 && /resource_metadata="https:\/\/kiwi\.test\/\.well-known\/oauth-protected-resource\/api\/agent\/mcp"/.test(anon.headers.get('WWW-Authenticate')), '401 points at resource metadata');
check((await mcpGet()).status === 405, 'no SSE stream: GET is 405');

/* ── registration ──────────────────────────────────────────────────────── */
const badReg = await out(await register({ env, request: json('/api/agent/oauth/register', { client_name: 'X', redirect_uris: ['http://evil.test/cb'] }) }));
check(badReg.status === 400 && badReg.data.error === 'invalid_redirect_uri', 'plain-http non-loopback redirect refused');
const reg = await out(await register({ env, request: json('/api/agent/oauth/register', { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }) }));
check(reg.status === 201 && /^kwc_/.test(reg.data.client_id) && !('client_secret' in reg.data), 'public client registered without secret');
const clientId = reg.data.client_id, redirect = 'https://claude.ai/api/mcp/auth_callback';

/* ── consent ───────────────────────────────────────────────────────────── */
const q = `/api/agent/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}`;
check((await out(await authGet({ env, request: json(q, null, {}, 'GET') }))).status === 401, 'consent requires owner sign-in');
const wrongRedirect = await out(await authGet({ env, request: json(`/api/agent/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent('https://evil.test/cb')}`, null, { Cookie: ownerCookie }, 'GET') }));
check(wrongRedirect.status === 400 && wrongRedirect.data.error === 'redirect-mismatch', 'unregistered redirect never accepted');
const seen = await out(await authGet({ env, request: json(q, null, { Cookie: ownerCookie }, 'GET') }));
check(seen.status === 200 && seen.data.stores.length === 1 && seen.data.stores[0].merchant === 'mcp-shop', 'owner sees only their own store');
check(!seen.data.defaults.includes('clients:read') && !seen.data.defaults.some(s => s.endsWith(':write') || s.endsWith(':create')), 'defaults exclude personal data and writes');

const verifier = 'v'.repeat(20) + crypto.randomUUID().replace(/-/g, '');
const challengeOf = async v => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toString('base64url');
const challenge = await challengeOf(verifier);
const approve = (body, cookie = ownerCookie, origin = base) => authPost({ env, request: json('/api/agent/oauth/authorize', body, { Cookie: cookie, Origin: origin }) });
const grantBody = { client_id: clientId, redirect_uri: redirect, state: 'st-1', code_challenge: challenge, code_challenge_method: 'S256',
  merchant: 'mcp-shop', scopes: ['overview:read', 'sales:read'] };
check((await approve(grantBody, otherCookie)).status === 403, 'another owner cannot approve this store');
check((await approve({ ...grantBody, merchant: 'mcp-other' })).status === 403, 'owner cannot approve a store they do not own');
check((await approve(grantBody, ownerCookie, 'https://evil.test')).status === 403, 'cross-origin approval refused');
check((await approve({ ...grantBody, code_challenge_method: 'plain' })).status === 400, 'PKCE S256 required');
check((await approve({ ...grantBody, scopes: ['all'] })).status === 400, 'unknown scope refused');
const ok1 = await out(await approve(grantBody));
const back = new URL(ok1.data.redirect);
check(ok1.status === 200 && back.origin + back.pathname === redirect && back.searchParams.get('state') === 'st-1' && back.searchParams.get('iss') === base, 'redirect carries code, state and issuer');
const code1 = back.searchParams.get('code');
check(!JSON.stringify(sql.prepare('SELECT * FROM agent_oauth_codes').all()).includes(code1), 'code stored only as a hash');

/* ── token ─────────────────────────────────────────────────────────────── */
const form = body => new Request(base + '/api/agent/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
const swap = async body => out(await token({ env, request: form(body) }));
const badVerifier = await swap({ grant_type: 'authorization_code', code: code1, code_verifier: 'x'.repeat(50), client_id: clientId, redirect_uri: redirect });
check(badVerifier.status === 400 && badVerifier.data.error === 'invalid_grant', 'wrong PKCE verifier refused');
const replay = await swap({ grant_type: 'authorization_code', code: code1, code_verifier: verifier, client_id: clientId, redirect_uri: redirect });
check(replay.status === 400, 'a failed attempt burns the code');
const code2 = new URL((await out(await approve(grantBody))).data.redirect).searchParams.get('code');
const wrongClient = await swap({ grant_type: 'authorization_code', code: code2, code_verifier: verifier, client_id: 'kwc_' + 'a'.repeat(32), redirect_uri: redirect });
check(wrongClient.status === 400, 'code bound to its client');
const code3 = new URL((await out(await approve(grantBody))).data.redirect).searchParams.get('code');
const tok = await swap({ grant_type: 'authorization_code', code: code3, code_verifier: verifier, client_id: clientId, redirect_uri: redirect });
check(tok.status === 200 && /^kwa\./.test(tok.data.access_token) && tok.data.token_type === 'Bearer' && tok.data.scope === 'overview:read sales:read', 'token issued with granted scopes');
check((await swap({ grant_type: 'authorization_code', code: code3, code_verifier: verifier, client_id: clientId, redirect_uri: redirect })).status === 400, 'code single-use');
const access = tok.data.access_token;
const keyRow = sql.prepare("SELECT * FROM agent_keys WHERE status='active'").all();
check(keyRow.length === 1 && keyRow[0].merchant === 'mcp-shop' && keyRow[0].issuer === 'owner' && keyRow[0].token_hash !== access, 'access token is an owner agent key, hashed');

/* ── MCP with the token ────────────────────────────────────────────────── */
const call = async (msg, t = access) => out(await mcp({ env, request: json('/api/agent/mcp', msg, { Authorization: 'Bearer ' + t, Accept: 'application/json, text/event-stream' }) }));
const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
check(init.status === 200 && init.data.result.protocolVersion === '2025-06-18' && init.data.result.capabilities.tools, 'initialize negotiates version');
check((await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202, 'notification answered 202');
const list = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
const names = list.data.result.tools.map(t => t.name).sort();
check(names.join() === 'merchant_overview,sales_summary', 'tools/list shows only granted tools');
const day = new Date(now).toISOString().slice(0, 10);
const sales = await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sales_summary', arguments: { from: day, to: day, merchant: 'mcp-other' } } });
const sc = sales.data.result.structuredContent;
check(!sales.data.result.isError && sc.merchant === 'mcp-shop' && sc.rows.length === 1 && sc.rows[0].amount_cents === 12000, 'tool call tenant-bound; merchant argument ignored');
const pii = await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'clients_search', arguments: { query: 'Client' } } });
check(pii.data.result.isError && !JSON.stringify(pii.data).includes('Client Secret'), 'ungranted personal-data tool refused');
const batch = await call([{ jsonrpc: '2.0', id: 5, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }]);
check(Array.isArray(batch.data) && batch.data.length === 1 && batch.data[0].id === 5, 'batch answered without notifications');
check((await call({ jsonrpc: '2.0', id: 6, method: 'nope' })).data.error.code === -32601, 'unknown method');
check(sql.prepare("SELECT COUNT(*) AS n FROM agent_audit WHERE action='sales_summary'").get().n === 1, 'tool call audited');

/* ── reconnect replaces; revoke disconnects ────────────────────────────── */
const code4 = new URL((await out(await approve(grantBody))).data.redirect).searchParams.get('code');
const tok2 = await swap({ grant_type: 'authorization_code', code: code4, code_verifier: verifier, client_id: clientId, redirect_uri: redirect });
check(tok2.status === 200 && (await call({ jsonrpc: '2.0', id: 7, method: 'ping' })).status === 401, 'reconnecting revokes the previous connection');
const access2 = tok2.data.access_token, keyId = access2.split('.')[1];
const rev = await changeKeys({ env, request: json('/api/agent/keys', { action: 'revoke', merchant: 'mcp-shop', id: keyId }, { Cookie: ownerCookie, Origin: base }) });
check(rev.status === 200 && (await call({ jsonrpc: '2.0', id: 8, method: 'ping' }, access2)).status === 401, 'revoking on agent-access disconnects the assistant');

/* ── an epoch change between consent and exchange voids the code ───────── */
const code5 = new URL((await out(await approve(grantBody))).data.redirect).searchParams.get('code');
sql.prepare('UPDATE accounts SET session_epoch = 1 WHERE id = ?').run(aid);
check((await swap({ grant_type: 'authorization_code', code: code5, code_verifier: verifier, client_id: clientId, redirect_uri: redirect })).status === 400, 'password rotation voids a pending approval');

/* ── parity with the local stdio client ────────────────────────────────── */
const local = [...fs.readFileSync(path.join(root, 'tools/kiwi-agent-mcp/server.js'), 'utf8').matchAll(/read\('([a-z_]+)'/g)].map(m => m[1]).sort();
check(local.join() === TOOLS.map(t => t.name).sort().join(), 'remote and local tool lists match');
const queryTools = fs.readFileSync(path.join(root, 'functions/api/agent/query.js'), 'utf8');
check(TOOLS.filter(t => !t.write).every(t => queryTools.includes(`${t.name}: '${t.scope}'`)), 'every remote read tool maps to the gateway scope');

console.log(`agent-mcp-remote-test: ${n} controls green`);
