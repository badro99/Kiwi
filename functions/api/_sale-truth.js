// Server truth for a sale the till has already rung: what the basket adds up
// to, and whether the device clock can be believed. Shared by /api/sale and
// /api/sale/refund.
//
// Paid money is never refused for either reason. The customer has paid and the
// takings must reach the books, so a basket that disagrees with the amount, or
// a till with a wrong clock, is booked as sent and RECORDED in sale_audit
// (action 'basket-flag' / 'clock-flag', one row per sale). No schema change:
// the operator console reads those rows (functions/api/admin/_workspace.js).

import { businessDate, merchantCutoff, merchantZone } from './_business-day.js';

/* The `lines` column is a TEXT, but the dashboard and the assistant parse it on
 * every poll: a basket is bounded. */
export const BASKET_LIMIT = 24000;
/* A till clock more than this far from the server's is wrong, not late. */
export const CLOCK_TOLERANCE_MS = 5 * 60000;
const MIN_CLOSED_AGE_MS = 30 * 60000;

function foldedLine(rows, label) {
  return {
    n: label || rows.length + ' autres articles',
    q: rows.reduce((n, l) => n + (Number(l && l.q) || 0), 0),
    t: rows.reduce((n, l) => n + Math.round((Number(l && l.t) || 0) * 100), 0) / 100,
  };
}

/* A basket that does not fit is shrunk, never dropped: a `lines = null` basket
 * leaves the revenue with no product detail at all. First the optional detail
 * goes (formula choices, options, promo, base name), then the tail is folded
 * into one « N autres articles » line that keeps every centime and unit, as the
 * till does above 40 lines. */
export function fitBasket(rows, limit = BASKET_LIMIT) {
  let text = JSON.stringify(rows);
  if (text.length <= limit) return { text, rows, folded: false };
  let work = rows.map((row) => {
    const { fc, o, pm, bn, ...rest } = row;
    return rest;
  });
  text = JSON.stringify(work);
  while (text.length > limit && work.length > 1) {
    const keep = work.length > 2 ? Math.floor(work.length / 2) : 0;
    work = keep
      ? work.slice(0, keep).concat([foldedLine(work.slice(keep))])
      : [foldedLine(work, work.length + ' articles')];
    text = JSON.stringify(work);
  }
  return { text, rows: work, folded: true };
}

export function basketCents(rows) {
  return rows.reduce((n, l) => n + Math.round((Number(l && l.t) || 0) * 100), 0);
}

/* Lines are compared with every figure the till may legitimately have built the
 * basket from: the money received, the ticket (money plus a consigned or
 * credited part), the gross before a discount, money plus the store credit that
 * settled it. Only a basket that matches none of them is flagged. */
export function basketMismatch(rows, figures) {
  const linesCents = basketCents(rows);
  const candidates = figures.filter((n) => Number.isSafeInteger(n) && n >= 0);
  if (!candidates.length) return null;
  const close = candidates.some((n) => Math.abs(linesCents - n) <= Math.max(100, Math.round(n * 0.02)));
  if (close) return null;
  const nearest = candidates.reduce((a, b) => (Math.abs(linesCents - b) < Math.abs(linesCents - a) ? b : a));
  return { linesCents, expectedCents: nearest, gapCents: linesCents - nearest, candidates };
}

/* What the device clock says against what the server saw. Returns a list of
 * { code, detail }; empty = nothing to report. `sentAt` is the device clock at
 * the moment of sending (live-link.js adds it): an offline sale is legitimately
 * old, but a device whose send-time clock is off from the server's is wrong. */
export async function clockFlags(env, merchant, { rawTs, ts, sentAt, now, originalTs = 0 }) {
  const flags = [];
  const sent = Number(sentAt);
  if (Number.isFinite(sent) && sent > 0 && Math.abs(now - sent) > CLOCK_TOLERANCE_MS) {
    flags.push({ code: 'device-clock-skew', detail: { skewMs: sent - now } });
  }
  if (Number.isFinite(rawTs) && rawTs > now + 86400000) {
    flags.push({ code: 'ts-clamped', detail: { sentTs: rawTs, usedTs: ts } });
  } else if (ts > now + CLOCK_TOLERANCE_MS) {
    flags.push({ code: 'ts-ahead', detail: { aheadMs: ts - now } });
  }
  if (Number.isFinite(originalTs) && originalTs > 0 && ts < originalTs) {
    flags.push({ code: 'before-original-sale', detail: { behindMs: originalTs - ts } });
  }
  if (ts < now - MIN_CLOSED_AGE_MS) {
    try {
      const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
      const day = businessDate(ts, cutoff, zone);
      if (day < businessDate(now, cutoff, zone)) {
        const closed = await env.DB.prepare(
          'SELECT 1 AS hit FROM z_reconciliations WHERE merchant = ? AND business_day = ? LIMIT 1'
        ).bind(merchant, day).first();
        if (closed) flags.push({ code: 'closed-business-day', detail: { businessDay: day } });
      }
    } catch (_) { /* no Z table yet, or no zone: nothing to compare against */ }
  }
  return flags;
}

/* One audit row per sale and action: a till retrying the same receipt flags it
 * once. A failed audit write never un-books the money. */
export async function recordSaleFlag(env, merchant, saleId, action, flags, row) {
  if (!flags.length) return false;
  const reason = flags[0].code;
  const note = flags.map((f) => f.code).join(', ').slice(0, 200);
  try {
    await env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
       SELECT ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = ?)`
    ).bind(merchant, saleId, action, reason, note,
      Math.round((Number(row.amountCents) || 0) / 100), Math.round(Number(row.amountCents) || 0),
      String(row.method || ''), String(row.ref || ''), Math.round(Number(row.ts) || 0),
      JSON.stringify({ flags, receivedTs: row.receivedTs }), row.receivedTs, merchant, saleId, action).run();
    return true;
  } catch (_) { return false; }
}
