// What /api/sale writes beside a sale once it is booked: the customer's record
// (migration 0021, `client_id`) and the two clocks (migration 0023,
// `received_ts` set by the server on arrival, `device_ts` the tablet's own).
//
// One UPDATE, each column set once: a till replaying the same receipt never
// moves the customer or the arrival time. Best effort: a failure here never
// un-books the money, the sale stands as written.

export async function stampSale(env, merchant, id, body) {
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim().slice(0, 64) : '';
  const deviceTs = Number(body?.deviceTs);
  try {
    await env.DB.prepare(
      `UPDATE sales SET client_id = COALESCE(client_id, ?), received_ts = COALESCE(received_ts, ?), device_ts = COALESCE(device_ts, ?)
        WHERE merchant = ? AND id = ?`
    ).bind(clientId || null, Date.now(), Number.isFinite(deviceTs) && deviceTs > 0 ? Math.round(deviceTs) : null, merchant, id).run();
  } catch (_) { /* the sale stands */ }
}
