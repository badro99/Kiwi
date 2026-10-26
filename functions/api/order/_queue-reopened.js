// Contrat : sessions actives vers projections des additions réouvertes ; lecture seule.
export async function reopenedFloorBills(env, merchant, sessions, now = Date.now()) {
  if (!sessions.length) return [];
  try {
    const active = new Map(sessions.map(s => [String(s.id), s]));
    const visitIds = sessions.map(s => String(s.id));
    const where = `FROM sale_audit a WHERE a.merchant = ? AND a.action = 'reopen' AND a.ts > ?
      AND json_valid(a.impact) AND json_extract(a.impact, '$.sessionId') IN (${visitIds.map(() => '?').join(',')})
      ORDER BY a.ts DESC`;
    let rows;
    try {
      rows = await env.DB.prepare(`SELECT a.sale_id, a.ref, a.amount, a.amount_cents, a.impact ${where}`)
        .bind(merchant, now - 36 * 60 * 60 * 1000, ...visitIds).all();
    } catch (_) {
      rows = await env.DB.prepare(`SELECT a.sale_id, a.ref, a.amount, a.impact ${where}`)
        .bind(merchant, now - 36 * 60 * 60 * 1000, ...visitIds).all();
    }
    const seen = new Set();
    return (rows.results || []).flatMap(row => {
      let impact;
      try { impact = JSON.parse(row.impact || '{}'); } catch (_) { return []; }
      const visit = active.get(String(impact.sessionId || ''));
      if (!visit || seen.has(visit.id)) return [];
      seen.add(visit.id);
      const cents = row.amount_cents != null ? Number(row.amount_cents)
        : impact.totals && impact.totals.amountCents != null && Number.isFinite(Number(impact.totals.amountCents))
          ? Number(impact.totals.amountCents) : Math.round(Number(row.amount || 0) * 100);
      return [{ session: visit.id, table: visit.table, saleId: row.sale_id,
        ref: String(row.ref || '').slice(0, 96), amountCents: Math.max(0, Math.round(cents) || 0),
        lines: Array.isArray(impact.lines) ? impact.lines.slice(0, 40).map(line => ({
          name: String(line && line.name || 'Article').slice(0, 80),
          qty: Math.max(0, Number(line && line.qty) || 0),
          total: Math.max(0, Number(line && line.total) || 0),
        })) : [] }];
    });
  } catch (_) { return null; }
}

