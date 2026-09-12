import { json, activeAccountSession } from '../../auth/_lib.js';

export const SCOPES = ['overview:read', 'sales:read', 'catalog:read', 'hotel:read', 'clients:read', 'clients:create'];
export const response = (body, status = 200) => json(body, status);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const text = str;
export async function hash(s) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function secret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const n = Number(request.headers.get('content-length') || 0);
  if (n > 8192) return null;
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}
export async function ensureTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_keys (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, account_id TEXT NOT NULL,
    account_epoch INTEGER NOT NULL, label TEXT NOT NULL, token_hash TEXT NOT NULL,
    scopes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, last_used_ts INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_agent_keys_owner ON agent_keys (account_id, merchant)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_audit (
    id TEXT PRIMARY KEY, key_id TEXT NOT NULL, merchant TEXT NOT NULL,
    action TEXT NOT NULL, target_id TEXT NOT NULL, request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL DEFAULT '',
    created_ts INTEGER NOT NULL, UNIQUE (key_id, request_id)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_agent_audit_merchant ON agent_audit (merchant, created_ts)').run();
}
export async function owner(request, env, merchant) {
  if (!env?.DB || !env?.AUTH_SECRET || !merchant) return null;
  const session = await activeAccountSession(request, env);
  if (!session?.aid) return null;
  try {
    const row = await env.DB.prepare(`SELECT m.account_id, m.status, a.session_epoch
      FROM merchant_config m JOIN accounts a ON a.id = m.account_id WHERE m.merchant = ?`)
      .bind(merchant).first();
    if (!row || row.account_id !== session.aid || row.status === 'suspended') return null;
    return { id: session.aid, epoch: Number(row.session_epoch) || 0, merchant };
  } catch (_) { return null; }
}
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
function equalHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function authorize(request, env, scope) {
  if (!env?.DB || !env?.AUTH_SECRET) return null;
  const match = /^Bearer (kwa\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') || '');
  if (!match) return null;
  const parts = match[1].split('.');
  let row;
  try {
    row = await env.DB.prepare(`SELECT k.*, m.account_id AS current_owner, m.status AS merchant_status,
      a.status AS account_status, a.session_epoch AS current_epoch
      FROM agent_keys k JOIN merchant_config m ON m.merchant = k.merchant
      JOIN accounts a ON a.id = k.account_id WHERE k.id = ?`).bind(parts[1]).first();
  } catch (_) { return null; }
  if (!row || row.status !== 'active' || row.merchant_status === 'suspended' ||
      row.account_status === 'suspended' || row.current_owner !== row.account_id ||
      Number(row.account_epoch) !== Number(row.current_epoch) ||
      Number(row.expires_ts) <= Date.now()) return null;
  if (scope.endsWith(':create') && row.merchant_status !== 'active') return null;
  if (!equalHash(await hash(match[1]), row.token_hash)) return null;
  let scopes;
  try { scopes = JSON.parse(row.scopes); } catch (_) { return null; }
  if (!Array.isArray(scopes) || !scopes.includes(scope)) return null;
  return { id: row.id, merchant: row.merchant, scopes };
}
