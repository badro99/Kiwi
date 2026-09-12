// Owner-only provisioning. No operator/till/staff credential can mint an
// agent key. The raw bearer appears in one response and is never persisted.
import { SCOPES, body, ensureTables, hash, owner, response, sameOrigin, secret, text } from './_core.js';

export async function onRequestGet({ request, env }) {
  const merchant = text(new URL(request.url).searchParams.get('merchant'), 64);
  const who = await owner(request, env, merchant);
  if (!who) return response({ error: 'unauthorized' }, 401);
  try {
    await ensureTables(env);
    const keys = await env.DB.prepare(`SELECT id, label, scopes, status, created_ts, expires_ts, last_used_ts
      FROM agent_keys WHERE merchant = ? AND account_id = ? ORDER BY created_ts DESC LIMIT 30`)
      .bind(merchant, who.id).all();
    const audit = await env.DB.prepare(`SELECT key_id, action, target_id, created_ts
      FROM agent_audit WHERE merchant = ? ORDER BY created_ts DESC LIMIT 30`).bind(merchant).all();
    return response({ merchant, keys: (keys.results || []).map(k => ({ ...k, scopes: JSON.parse(k.scopes) })),
      recentActions: audit.results || [] });
  } catch (_) { return response({ error: 'unavailable' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return response({ error: 'cross-origin' }, 403);
  const data = await body(request);
  if (!data) return response({ error: 'invalid-json' }, 400);
  const merchant = text(data.merchant, 64);
  const who = await owner(request, env, merchant);
  if (!who) return response({ error: 'unauthorized' }, 401);
  try {
    await ensureTables(env);
    if (data.action === 'revoke' || data.action === 'pause' || data.action === 'resume') {
      const status = data.action === 'revoke' ? 'revoked' : data.action === 'pause' ? 'paused' : 'active';
      const id = text(data.id, 36);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response({ error: 'invalid-id' }, 400);
      const r = await env.DB.prepare(`UPDATE agent_keys SET status = ?
        WHERE id = ? AND merchant = ? AND account_id = ? AND status != 'revoked'`)
        .bind(status, id, merchant, who.id).run();
      return Number(r.meta?.changes) ? response({ ok: true, status }) : response({ error: 'not-found' }, 404);
    }
    if (data.action !== 'create') return response({ error: 'invalid-action' }, 400);
    const label = text(data.label, 80);
    const scopes = data.scopes;
    const days = Math.round(Number(data.expiresInDays));
    if (label.length < 3 || !Array.isArray(scopes) || !scopes.length ||
      new Set(scopes).size !== scopes.length || scopes.some(s => !SCOPES.includes(s)) ||
      !Number.isSafeInteger(days) || days < 1 || days > 90) return response({ error: 'invalid-grant' }, 400);
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agent_keys
      WHERE merchant = ? AND account_id = ? AND status != 'revoked' AND expires_ts > ?`)
      .bind(merchant, who.id, Date.now()).first();
    if (Number(count?.n) >= 8) return response({ error: 'key-limit' }, 409);
    const id = crypto.randomUUID();
    const token = `kwa.${id}.${secret()}`;
    const now = Date.now();
    const expires = now + days * 86400000;
    await env.DB.prepare(`INSERT INTO agent_keys
      (id,merchant,account_id,account_epoch,label,token_hash,scopes,status,created_ts,expires_ts)
      VALUES (?,?,?,?,?,?,?,'active',?,?)`)
      .bind(id, merchant, who.id, who.epoch, label, await hash(token), JSON.stringify(scopes), now, expires).run();
    return response({ ok: true, key: { id, merchant, label, scopes, status: 'active', expires_ts: expires }, token }, 201);
  } catch (_) { return response({ error: 'unavailable' }, 503); }
}
