// Run this predicate inside the transfer claim transaction, as well as the
// preflight. A printer acknowledgement is not the kitchen-submission boundary.
export function kitchenLock(merchant, tables) {
  return {
    sql: `EXISTS (SELECT 1 FROM orders o
      WHERE o.merchant = ? AND o.mode = 'table' AND o.table_no IN (${tables.map(() => '?').join(',')})
        AND (o.paid_ts IS NULL OR EXISTS (SELECT 1 FROM table_sessions s
          WHERE s.id = o.session_id AND s.merchant = o.merchant AND s.status = 'open'))
        AND (o.status IN ('accepted','ready','served')
          OR EXISTS (SELECT 1 FROM order_course c WHERE c.merchant = o.merchant AND c.order_id = o.id AND c.sent_ts IS NOT NULL)
          OR EXISTS (SELECT 1 FROM kitchen_voids v WHERE v.merchant = o.merchant AND v.order_id = o.id)))`,
    args: [merchant, ...tables],
  };
}

export async function kitchenLocked(env, guard) {
  return !!await env.DB.prepare('SELECT 1 AS locked WHERE ' + guard.sql).bind(...guard.args).first();
}
