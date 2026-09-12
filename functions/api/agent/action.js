// Deliberately narrow: no generic "call Kiwi API", no financial or stock
// mutation, no ability to impersonate a staff PIN. New actions need their own
// scope, validation, idempotency and same-batch audit proof.
import { nextSrvTs } from '../clients.js';
import { authorize, body, hash, response, text } from './_core.js';

const requestIdOk = x => typeof x === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(x);
async function previous(env, grant, requestId) {
  return env.DB.prepare(`SELECT action,target_id,input_hash FROM agent_audit WHERE key_id = ? AND request_id = ?`)
    .bind(grant.id, requestId).first();
}

export async function onRequestPost({ request, env }) {
  const data = await body(request);
  if (!data) return response({ error: 'invalid-json' }, 400);
  if (data.action !== 'create_client') return response({ error: 'unknown-action' }, 400);
  const grant = await authorize(request, env, 'clients:create');
  if (!grant) return response({ error: 'forbidden' }, 403);
  if (!requestIdOk(data.requestId)) return response({ error: 'request-id-required' }, 400);
  const name = text(data.name, 120), phone = text(data.phone, 40), email = text(data.email, 160);
  if (name.length < 2 || (!phone && !email) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return response({ error: 'invalid-client' }, 400);
  }
  const inputHash = await hash(JSON.stringify([name, phone, email]));
  try {
    const prior = await previous(env, grant, data.requestId);
    if (prior) return prior.action === data.action && prior.input_hash === inputHash
      ? response({ ok: true, id: prior.target_id, replayed: true })
      : response({ error: 'request-id-conflict' }, 409);
    const id = 'agent-' + crypto.randomUUID();
    const now = Date.now();
    const cursor = await nextSrvTs(env, grant.merchant);
    const statements = [
      env.DB.prepare(`INSERT INTO agent_audit
        (id,key_id,merchant,action,target_id,request_id,input_hash,created_ts) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), grant.id, grant.merchant, data.action, id, data.requestId, inputHash, now),
      env.DB.prepare(`INSERT INTO clients
        (merchant,id,name,phone,email,source,first_seen,last_seen,updated_ts,srv_ts)
        VALUES (?,?,?,?,?,'agent',?,?,?,?)`)
        .bind(grant.merchant, id, name, phone, email, now, now, now, cursor),
    ];
    await env.DB.batch(statements);
    await env.DB.prepare('UPDATE agent_keys SET last_used_ts = ? WHERE id = ?').bind(now, grant.id).run();
    return response({ ok: true, id }, 201);
  } catch (_) {
    // A concurrent identical request may have won the UNIQUE audit key.
    try {
      const prior = await previous(env, grant, data.requestId);
      if (prior) return prior.action === data.action && prior.input_hash === inputHash
        ? response({ ok: true, id: prior.target_id, replayed: true })
        : response({ error: 'request-id-conflict' }, 409);
    } catch (_) {}
    return response({ error: 'unavailable' }, 503);
  }
}
