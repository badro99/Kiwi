// Inbound stock retries are separate from the outbound Shopify stock outbox.
// No customer/address data is necessary to replay an inventory movement.
async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS shopify_inbound_stock (
    merchant TEXT NOT NULL, order_ref TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_ts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
    created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, order_ref)
  )`).run();
}

export async function enqueueInboundStock(env, merchant, order) {
  await ensure(env.DB);
  const ref = String(order.id || order.name || '').slice(0, 96);
  if (!ref) throw new Error('order-ref-required');
  const payload = JSON.stringify({ id: ref, line_items: (order.line_items || []).map(line => ({
    id: String(line.id || line.variant_id || ''), variant_id: String(line.variant_id || ''), quantity: line.quantity,
  })) });
  await env.DB.prepare(`INSERT INTO shopify_inbound_stock
    (merchant, order_ref, payload, created_ts, updated_ts) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(merchant, order_ref) DO NOTHING`).bind(merchant, ref, payload, Date.now(), Date.now()).run();
}

export async function flushInboundStock(env, apply, merchant = '', ref = '', limit = 50) {
  await ensure(env.DB);
  const rows = await env.DB.prepare(`SELECT * FROM shopify_inbound_stock
    WHERE status = 'pending' AND next_ts <= ?
      AND (? = '' OR merchant = ?) AND (? = '' OR order_ref = ?)
    ORDER BY next_ts, created_ts LIMIT ?`)
    .bind(Date.now(), merchant, merchant, ref, ref, Math.min(100, Math.max(1, limit))).all();
  let completed = 0, pending = 0;
  for (const row of rows.results || []) {
    let result, error = '';
    try { result = await apply(env, row.merchant, JSON.parse(row.payload)); }
    catch (_) { error = 'inventory-write-failed'; }
    const done = !!result && !result.unmatched;
    if (!done && !error) error = 'inventory-mapping-or-write-pending';
    const attempts = Number(row.attempts || 0) + 1;
    await env.DB.prepare(`UPDATE shopify_inbound_stock
      SET status = ?, attempts = ?, next_ts = ?, last_error = ?, updated_ts = ?
      WHERE merchant = ? AND order_ref = ? AND status = 'pending'`)
      .bind(done ? 'done' : 'pending', attempts,
        done ? 0 : Date.now() + Math.min(3600000, 15000 * Math.pow(2, Math.min(attempts, 8))),
        error, Date.now(), row.merchant, row.order_ref).run();
    // Expose the outstanding reconciliation in the existing merchant connector
    // health panel; never erase an unrelated outbound/provider error.
    try {
      if (!done) await env.DB.prepare(`UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?`)
        .bind('Stock Shopify à synchroniser : commande ' + row.order_ref, Date.now(), row.merchant).run();
      else await env.DB.prepare(`UPDATE shopify_connections SET last_error = '', updated_ts = ?
        WHERE merchant = ? AND last_error = ? AND NOT EXISTS
          (SELECT 1 FROM shopify_inbound_stock WHERE merchant = ? AND status = 'pending')`)
        .bind(Date.now(), row.merchant, 'Stock Shopify à synchroniser : commande ' + row.order_ref, row.merchant).run();
    } catch (_) { /* Retry ownership is durable even if the health projection fails. */ }
    if (done) completed++; else pending++;
  }
  return { completed, pending };
}
