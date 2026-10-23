import { json } from '../auth/_lib.js';

// HTTP bodies cannot supply `settlement`: it is passed only by the authenticated
// owner endpoint when composing the existing sale/refund handlers on the server.
export async function quarantineGuard(env, merchant, operationId, settlement = '') {
  const args = [merchant, 'quarantine:' + operationId, settlement];
  let row;
  try {
    row = await env.DB.prepare(`SELECT id,status FROM operational_commands
      WHERE merchant = ? AND domain = 'quarantine' AND idempotency_key = ?`)
      .bind(merchant, args[1]).first();
  } catch (error) {
    // Deploying this code must not make ordinary sales depend on a migration.
    if (/no such table.*operational_commands/i.test(String(error))) return { sql:'', args:[] };
    return { response:json({error:'quarantine-verification-unavailable'},503) };
  }
  if (row && row.status !== 'approved' && !(row.status === 'approving' && row.id === settlement)) {
    return { response:json({error:row.status === 'declined' ? 'operation-declined' : 'owner-settlement-required'},409) };
  }
  return {
    sql:` AND NOT EXISTS (SELECT 1 FROM operational_commands WHERE merchant = ?
      AND domain = 'quarantine' AND idempotency_key = ? AND status != 'approved'
      AND NOT (status = 'approving' AND id = ?))`, args,
  };
}
