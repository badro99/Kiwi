import { onRequestPost } from '../../functions/api/inventory/internal-requests.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function rows(statement) {
  const result = await statement.all();
  return (result && result.results) || [];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/inventory/internal-requests' && request.method === 'POST') {
      return onRequestPost({ request, env });
    }
    if (url.pathname === '/__test__/health') return json({ ok: true });
    if (url.pathname === '/__test__/fail-transfer-in' && request.method === 'POST') {
      await env.DB.prepare(`CREATE TRIGGER fail_test_transfer_in
        BEFORE INSERT ON inventory_movements
        WHEN NEW.reason = 'transfer-in' AND NEW.ref_id LIKE 'request:req-rollback:%'
        BEGIN
          SELECT RAISE(ABORT, 'forced second movement failure');
        END`).run();
      return json({ ok: true });
    }
    if (url.pathname === '/__test__/snapshot') {
      return json({
        movements: await rows(env.DB.prepare(
          `SELECT id, item_id, location_id, qty_milli, reason, unit_cost_cents,
                  ref_id, srv_ts, meta
             FROM inventory_movements
            ORDER BY srv_ts, id`
        )),
        requests: await rows(env.DB.prepare(
          `SELECT id, state, revision, last_command_key
             FROM hotel_internal_requests
            ORDER BY id`
        )),
        events: await rows(env.DB.prepare(
          `SELECT request_id, event, idempotency_key, revision
             FROM hotel_internal_request_events
            ORDER BY request_id, revision`
        )),
        sequences: await rows(env.DB.prepare(
          'SELECT merchant, last_ts FROM inventory_sync_sequences ORDER BY merchant'
        )),
        requestLineColumns: await rows(env.DB.prepare(
          'PRAGMA table_info(hotel_internal_request_lines)'
        )),
      });
    }
    return json({ error: 'not-found' }, 404);
  },
};
