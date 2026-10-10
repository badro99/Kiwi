// /api/agent/mcp — Kiwi as a REMOTE MCP server (Streamable HTTP, JSON replies).
//
// This is what a merchant adds to claude.ai as a custom connector, so Claude
// (and Claude Dashboards) can read their own store's numbers. It adds no data
// access of its own: every tool call is forwarded, with the caller's bearer, to
// the existing private gateway handlers (query.js / action.js), which check the
// key, its per-tool scope, the tenant and the bounds, and write the audit line.
// The merchant is ALWAYS the key's merchant; no argument can name another one.
//
// Auth: `Authorization: Bearer kwa.…` — a key minted on agent-access.html or
// obtained through the OAuth flow (_oauth.js). Without one the reply is 401
// with the protected-resource metadata pointer, which is how claude.ai finds
// the sign-in page.
//
// Stateless: no session id, no server-initiated stream. GET (SSE) answers 405,
// which the transport allows for servers that never push.
import { keyGrant } from './_core.js';
import { TOOLS, BY_NAME } from './_tools.js';
import { origin } from './_oauth.js';
import { onRequestPost as queryHandler } from './query.js';
import { onRequestPost as actionHandler } from './action.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 65536;
const INSTRUCTIONS = [
  'Kiwi is the point-of-sale of one store; every tool reads or writes that store only.',
  'Amounts ending in _cents are centimes of Moroccan dirham (MAD): divide by 100 for MAD.',
  'Date ranges are UTC days, YYYY-MM-DD, at most 31 days per call: for longer periods call once per month and add the results.',
  'sales_summary is the right source for revenue over time; payment_events and orders_list are paged (25 per call, follow nextOffset).',
  'Voided sales are excluded from sales_summary and flagged (void_ts) in payment_events.',
].join(' ');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
};
function reply(body, status = 200, extra = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers: {
    ...(body == null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store', ...CORS, ...extra } });
}
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function unauthorized(request) {
  const meta = origin(request) + '/.well-known/oauth-protected-resource/api/agent/mcp';
  const presented = /^Bearer\s/i.test(request.headers.get('Authorization') || '');
  return reply({ error: 'unauthorized' }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${meta}"` + (presented ? ', error="invalid_token"' : ''),
  });
}

function visibleTools(grant) {
  return TOOLS.filter(t => grant.scopes.includes(t.scope) && (!t.write || grant.merchantStatus === 'active'));
}

async function callTool(request, env, grant, name, args) {
  const t = BY_NAME.get(String(name || ''));
  if (!t || !visibleTools(grant).includes(t))
    return { content: [{ type: 'text', text: 'Unknown tool, or this connection was not granted it: ' + String(name).slice(0, 60) }], isError: true };
  const input = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {};
  delete input.tool; delete input.action; delete input.merchant;
  const inner = new Request(new URL(t.write ? '/api/agent/action' : '/api/agent/query', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('Authorization') },
    body: JSON.stringify({ ...input, [t.write ? 'action' : 'tool']: t.name }),
  });
  const res = await (t.write ? actionHandler : queryHandler)({ request: inner, env });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || !data || data.ok === false) {
    const why = (data && data.error) || ('http-' + res.status);
    return { content: [{ type: 'text', text: 'Kiwi refused the call: ' + why }], isError: true };
  }
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

async function handle(request, env, grant, msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
    return rpcError(msg && msg.id, -32600, 'Invalid request');
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null;
  try {
    if (method === 'initialize') {
      const asked = params && params.protocolVersion;
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kiwi', title: 'Kiwi', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      } };
    }
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: visibleTools(grant).map(t => t.definition) } };
    if (method === 'tools/call') return { jsonrpc: '2.0', id, result: await callTool(request, env, grant, params && params.name, params && params.arguments) };
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    return rpcError(id, -32601, 'Method not found');
  } catch (_) { return rpcError(id, -32603, 'Internal error'); }
}

export function onRequestOptions() { return reply(null, 204); }
export function onRequestGet() { return reply(null, 405, { Allow: 'POST' }); }
export function onRequestDelete() { return reply(null, 405, { Allow: 'POST' }); }

export async function onRequestPost({ request, env }) {
  const grant = await keyGrant(request, env);
  if (!grant) return unauthorized(request);
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) return reply(rpcError(null, -32700, 'Content-Type must be application/json'), 415);
  let raw;
  try { raw = await request.text(); } catch (_) { return reply(rpcError(null, -32700, 'Parse error'), 400); }
  if (raw.length > MAX_BODY) return reply(rpcError(null, -32600, 'Request too large'), 413);
  let msg;
  try { msg = JSON.parse(raw); } catch (_) { return reply(rpcError(null, -32700, 'Parse error'), 400); }
  if (Array.isArray(msg)) {
    if (!msg.length || msg.length > 20) return reply(rpcError(null, -32600, 'Invalid batch'), 400);
    const out = [];
    for (const m of msg) { const r = await handle(request, env, grant, m); if (r) out.push(r); }
    return out.length ? reply(out) : reply(null, 202);
  }
  const r = await handle(request, env, grant, msg);
  return r ? reply(r) : reply(null, 202);
}
