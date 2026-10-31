// Persist the cache in D1: isolate restarts must not repeat activity probes.
export async function pollMode(env, merchant, now = Date.now()) {
  try {
    const row = await env.DB.prepare(`SELECT test_account, poll_checked_ts, poll_mode
      FROM merchant_config WHERE merchant = ?`).bind(merchant).first();
    /* A test account (Amira) stays quiet while nobody uses it, but not while
       someone is testing it: forced quiet made an idle caisse read the floor
       and the order queue once every ten minutes, so tables and orders sent
       from the server phone never seemed to arrive. Its window is 30 minutes
       of activity instead of seven days. */
    const windowMs = row?.test_account ? 30 * 60000 : 7 * 86400000;
    if (row && row.poll_checked_ts > now - 600000 && /^(live|quiet)$/.test(row.poll_mode)) return row.poll_mode;
    // Claim the cache window atomically, across worker isolates. Contenders
    // keep the previous verdict while the winner runs the indexed probes.
    const claim = await env.DB.prepare(`UPDATE merchant_config SET poll_checked_ts = ?
      WHERE merchant = ? AND (poll_checked_ts IS NULL OR poll_checked_ts <= ?)`)
      .bind(now, merchant, now - 600000).run();
    if (!claim.meta?.changes) return row?.poll_mode || 'live';
    const since = now - windowMs;
    const activity = await env.DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM sales WHERE merchant = ? AND ts >= ?) OR
      EXISTS(SELECT 1 FROM orders WHERE merchant = ? AND updated_ts >= ?) OR
      EXISTS(SELECT 1 FROM hotel_reservations WHERE merchant = ? AND updated_ts >= ?) OR
      EXISTS(SELECT 1 FROM store_docs WHERE merchant = ?
        AND feature IN ('reservations', 'attendance') AND updated_ts >= ?) AS active`)
      .bind(merchant, since, merchant, since, merchant, since, merchant, since).first();
    const mode = activity?.active ? 'live' : 'quiet';
    await env.DB.prepare('UPDATE merchant_config SET poll_mode = ? WHERE merchant = ? AND poll_checked_ts = ?')
      .bind(mode, merchant, now).run();
    return mode;
  } catch (_) { return 'live'; }
}
