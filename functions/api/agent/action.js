// No generic API proxy, financial/stock mutation, or staff PIN impersonation.
// Every write requires its own scope and same-batch audit proof.
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
  if (!['create_client', 'create_operations_note', 'create_task'].includes(data.action)) return response({ error: 'unknown-action' }, 400);
  const grant = await authorize(request, env, data.action === 'create_client' ? 'clients:create' : 'operations:write');
  if (!grant) return response({ error: 'forbidden' }, 403);
  if (!requestIdOk(data.requestId)) return response({ error: 'request-id-required' }, 400);
  const name = text(data.name, 120), phone = text(data.phone, 40), email = text(data.email, 160);
  const note = text(data.note, 1000);
  const title = text(data.title, 160), detail = text(data.detail, 1000), priority = Number(data.priority ?? 3);
  if (data.action === 'create_client' &&
      (name.length < 2 || (!phone && !email) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
    return response({ error: 'invalid-client' }, 400);
  }
  if (data.action === 'create_operations_note' && (note.length < 3 || String(data.note).trim().length > 1000))
    return response({ error: 'invalid-note' }, 400);
  if (data.action === 'create_task' && (title.length < 3 || String(data.title).trim().length > 160 ||
      String(data.detail ?? '').trim().length > 1000 || !Number.isInteger(priority) || priority < 1 || priority > 4))
    return response({ error: 'invalid-task' }, 400);
  const inputHash = await hash(JSON.stringify(data.action === 'create_client' ? [name, phone, email] :
    data.action === 'create_task' ? [title, detail, priority] : [note]));
  try {
    const prior = await previous(env, grant, data.requestId);
    if (prior) return prior.action === data.action && prior.input_hash === inputHash
      ? response({ ok: true, id: prior.target_id, replayed: true })
      : response({ error: 'request-id-conflict' }, 409);
    const id = 'agent-' + crypto.randomUUID();
    const now = Date.now();
    const cursor = data.action === 'create_client' ? await nextSrvTs(env, grant.merchant) : null;
    const statements = [
      env.DB.prepare(`INSERT INTO agent_audit
        (id,key_id,merchant,action,target_id,request_id,input_hash,created_ts) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), grant.id, grant.merchant, data.action, id, data.requestId, inputHash, now),
      data.action === 'create_client'
        ? env.DB.prepare(`INSERT INTO clients
          (merchant,id,name,phone,email,source,first_seen,last_seen,updated_ts,srv_ts)
          VALUES (?,?,?,?,?,'agent',?,?,?,?)`)
          .bind(grant.merchant, id, name, phone, email, now, now, now, cursor)
        : data.action === 'create_operations_note'
          ? env.DB.prepare(`INSERT INTO operator_notes (id,merchant,body,actor_id,actor,ts)
            VALUES (?,?,?,?,?,?)`).bind(id, grant.merchant, note, grant.id, 'agent', now)
          : env.DB.prepare(`INSERT INTO operator_tasks
            (id,merchant,title,detail,priority,mutation_id,created_ts,updated_ts,created_by)
            VALUES (?,?,?,?,?,?,?,?,?)`)
            .bind(id, grant.merchant, title, detail, priority, data.requestId, now, now, grant.id),
    ];
    if (data.action === 'create_task') statements.push(env.DB.prepare(`INSERT INTO operator_task_events
      (id,task_id,merchant,actor_id,actor,action,detail,ts) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), id, grant.merchant, grant.id, 'agent', 'create', '', now));
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
