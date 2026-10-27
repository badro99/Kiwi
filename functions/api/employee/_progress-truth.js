// What a shift really earned, from the server's own ledger.
//
// The clock-out used to turn `progress.paid` and `progress.revenue` (numbers the
// employee app sends) straight into XP and personal records, so anyone holding
// an employee session could award themselves a record night. The sales the
// employee's own session wrote carry `seller_id` (functions/api/sale.js, from the
// signed employee session, never from the body); XP is now capped by those, and
// by the length of the shift. The app's figures can only lower what is credited.
// If the ledger cannot be read, nothing is credited: a missing XP is repaired
// by the next shift, an invented one is not.

export async function servedDuring(env, merchant, staffId, fromTs, toTs) {
  const from = Number(fromTs) || 0;
  const to = Number(toTs) || 0;
  if (!env || !env.DB || !staffId || !(from > 0) || !(to >= from)) return { paid: 0, revenue: 0 };
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS paid, COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS cents
         FROM sales
        WHERE merchant = ? AND seller_id = ? AND ts >= ? AND ts <= ?
          AND void_ts IS NULL AND COALESCE(amount_cents, amount * 100) > 0`
    ).bind(merchant, String(staffId), from, to + 60000).first();
    return { paid: Math.max(0, Number(row && row.paid) || 0), revenue: Math.max(0, Number(row && row.cents) || 0) / 100 };
  } catch (_) { return { paid: 0, revenue: 0 }; }
}

export function verifiedProgress(claim, served, shiftMs) {
  const raw = claim && typeof claim === 'object' ? claim : {};
  const paid = Math.min(200, Math.max(0, Math.floor(Number(raw.paid) || 0)), served.paid);
  const revenue = Math.min(1000000, Math.max(0, Number(raw.revenue) || 0), served.revenue);
  /* `turnMinutes` is the sum of the table turns; tables overlap, so it can exceed
     the shift, but no single turn can: between 2 minutes and the whole shift per
     table. Otherwise the claim would set `bestSpeed` to anything. */
  const shiftMinutes = Math.max(0, Math.floor((Number(shiftMs) || 0) / 60000));
  const asked = Math.max(0, Number(raw.turnMinutes) || 0);
  const turnMinutes = paid > 0 && asked > 0 ? Math.min(100000, Math.max(paid * 2, Math.min(asked, paid * shiftMinutes))) : 0;
  return { paid, revenue, turnMinutes };
}
