const FIELDS = ['acceptedAt', 'sentAt', 'readyAt', 'servedAt', 'closedAt'];

function timestamp(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function recordOrderCourse(env, fact) {
  if (!env || !env.DB || !fact) return false;
  const merchant = String(fact.merchant || '').slice(0, 64);
  const orderId = String(fact.orderId || '').slice(0, 64);
  if (!merchant || !orderId) return false;
  const values = FIELDS.map((key) => timestamp(fact[key]));
  const occurred = values.filter(Boolean);
  if (!occurred.length) return false;
  const now = Math.max(...occurred);
  const number = Number.isInteger(Number(fact.orderNumber)) ? Number(fact.orderNumber) : null;
  try {
    await env.DB.prepare(`INSERT INTO order_course
      (merchant, order_id, order_number, accepted_ts, sent_ts, ready_ts,
       served_ts, closed_ts, created_ts, updated_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (merchant, order_id) DO UPDATE SET
        order_number = COALESCE(order_course.order_number, excluded.order_number),
        accepted_ts = COALESCE(order_course.accepted_ts, excluded.accepted_ts),
        sent_ts = COALESCE(order_course.sent_ts, excluded.sent_ts),
        ready_ts = COALESCE(order_course.ready_ts, excluded.ready_ts),
        served_ts = COALESCE(order_course.served_ts, excluded.served_ts),
        closed_ts = COALESCE(order_course.closed_ts, excluded.closed_ts),
        updated_ts = MAX(order_course.updated_ts, excluded.updated_ts)`)
      .bind(merchant, orderId, number, ...values, now, now).run();
    return true;
  } catch (_) { return false; }
}

export async function closeOrderCourses(env, fact) {
  if (!env || !env.DB || !fact) return false;
  const merchant = String(fact.merchant || '').slice(0, 64);
  const sessionId = String(fact.sessionId || '').slice(0, 80);
  const table = String(fact.table || '').slice(0, 24);
  const closedAt = timestamp(fact.closedAt);
  if (!merchant || !closedAt || (!sessionId && !table)) return false;
  try {
    const where = sessionId
      ? 'o.merchant = ? AND o.session_id = ?'
      : 'o.merchant = ? AND o.session_id IN (SELECT id FROM table_sessions WHERE merchant = ? AND table_no = ? AND closed_ts = ?)';
    const binds = sessionId ? [merchant, sessionId] : [merchant, merchant, table, closedAt];
    await env.DB.prepare(`INSERT INTO order_course
      (merchant, order_id, order_number, closed_ts, created_ts, updated_ts)
      SELECT o.merchant, o.id, o.number, ?, ?, ? FROM orders o WHERE ${where}
      ON CONFLICT (merchant, order_id) DO UPDATE SET
        order_number = COALESCE(order_course.order_number, excluded.order_number),
        closed_ts = COALESCE(order_course.closed_ts, excluded.closed_ts),
        updated_ts = MAX(order_course.updated_ts, excluded.updated_ts)`)
      .bind(closedAt, closedAt, closedAt, ...binds).run();
    return true;
  } catch (_) { return false; }
}
