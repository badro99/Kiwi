// Internal incident board. Merchant requests belong to /api/support/tickets.
import { namedOperatorId } from '../../auth/_lib.js';
import { json } from './_lib.js';
export async function ticketActor(request, env) {
  return request ? namedOperatorId(request, env) : null;
}
export const forbidden = () => json({ error: 'forbidden' }, 403);
export function ticketAudit(env, actor, action, id, status, filter) {
  return env.DB.prepare(`INSERT INTO account_audit
    (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
    SELECT '', '', 'ticket-' || ?, status, ?, '', ?, ?, CAST(id AS TEXT), ?
    FROM kiwi_tickets WHERE id = ${id == null ? 'last_insert_rowid()' : '?'}${status ? ' AND status = ?' : ''}${filter ? ' AND ' + filter.sql : ''}`)
    .bind(action, action, actor, actor, Date.now(), ...(id == null ? [] : [id]), ...(status ? [status] : []), ...(filter ? filter.values : []));
}
export async function ticketUpdate(env, statement, actor, action, id, status, filter) {
  const results = await env.DB.batch([ticketAudit(env, actor, action, id, status, filter), statement]);
  return results[1];
}
export async function ticketInsert(env, statement, actor) {
  const results = await env.DB.batch([statement, ticketAudit(env, actor, 'create', null)]);
  return results[0];
}
