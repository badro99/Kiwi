// GET /api/floor/live?merchant=<slug> — the room as the till sees it, for the
// owner's Plan de salle.
//
// The dashboard plan used to show a status the owner typed by hand: a table
// ticked "Occupée" on a Tuesday was still "occupied for 1514 h" two months
// later, and the KPI "1 occ." disagreed with the counter. The till already
// publishes every table's state to the `service-events` document (see
// functions/api/service/events.js › syncTableSnapshot), and every open visit
// is a `table_sessions` row with its orders. This route only READS those:
// no write, no counter check-in, no lock — opening the plan must never look
// like a device coming online.
//
// Read access is the same as the till's own reader: the owner session, a
// named operator, or a paired till of this merchant (entitledMerchant).
// Nothing credential-shaped is returned: no session ids (they are bearer
// capabilities for the guest phone), no staff codes.
//
// Every query has a fallback. Prod D1 lags schema.sql, and a SELECT that
// names a missing column must degrade one field, never blank the room.

import { json, entitledMerchant } from '../../auth/_lib.js';
import { businessDayStart, merchantZone, merchantCutoff } from '../_business-day.js';

const STATUSES = new Set(['khawya', 'a-commander', 'ka-yaklo', 'bgha-ykhlass', 'ka-tkhdam', 'khlass']);
const OPEN_ORDER = "('pending','accepted','ready','served')";

export function tableKey(value) {
  return String(value || '').trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
}

function parse(raw) {
  try { const d = JSON.parse(raw || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; }
  catch (_) { return {}; }
}

/* A failed query still degrades to null (one missing statistic must not blank
 * the room), but never silently: the failure is logged with its label (never
 * the SQL arguments, which carry the merchant) and pushed on `errors`, which
 * the response returns so the plan can say the picture is incomplete. */
async function all(env, sql, args, label, errors) {
  try { const r = await env.DB.prepare(sql).bind(...args).all(); return r.results || []; }
  catch (err) {
    if (errors) errors.push(label);
    try { console.error('[floor/live] query failed: ' + label + ': ' + String((err && err.message) || err).slice(0, 200)); } catch (_) {}
    return null;
  }
}

/* Builds the per-table picture from already-fetched rows. Pure, so the test
 * can feed it rows without a database. */
export function assemble({ states, requests, sessions, bills, turns, sales, now }) {
  const out = Object.create(null);
  const at = (k) => (out[k] = out[k] || { status: 'khawya', covers: 0, since: 0, billCents: 0, orders: 0, requests: 0, askBill: false });
  Object.keys(states || {}).forEach((raw) => {
    const s = states[raw];
    const k = tableKey((s && s.table) || raw);
    if (!k || !s || !STATUSES.has(String(s.status))) return;
    const t = at(k);
    t.status = String(s.status);
    t.covers = Math.max(0, Math.min(99, Number(s.covers) || 0));
    t.changed = Number(s.ts) || 0;
  });
  (sessions || []).forEach((row) => {
    const k = tableKey(row.table_no);
    if (!k) return;
    const t = at(k);
    const opened = Number(row.opened_ts) || 0;
    if (!t.since || (opened && opened < t.since)) t.since = opened;
    /* A visit open on the server with no till snapshot yet (a guest phone,
       a waiter tap) is still an occupied table. */
    if (t.status === 'khawya') t.status = 'ka-yaklo';
  });
  (bills || []).forEach((row) => {
    const k = tableKey(row.table_no);
    if (!k) return;
    const t = at(k);
    t.billCents += Math.max(0, Math.round((Number(row.total) || 0) * 100));
    t.orders += Math.max(0, Number(row.n) || 0);
  });
  /* A guest request outlives nothing: once its visit closes it is history,
     exactly as activeGuestRequests() reads it for the till. */
  const live = new Map((sessions || []).map((s) => [String(s.id), tableKey(s.table_no)]));
  (Array.isArray(requests) ? requests : []).forEach((r) => {
    const k = tableKey(r && r.table);
    if (!k || live.get(String(r.sessionId || '')) !== k) return;
    const t = at(k);
    t.requests += 1;
    if (r.action === 'ask-bill') t.askBill = true;
  });
  Object.keys(out).forEach((k) => {
    const t = out[k];
    /* No open visit: the seated time is when the till last changed state. */
    if (!t.since && t.status !== 'khawya' && t.changed) t.since = t.changed;
    if (t.askBill && (t.status === 'ka-yaklo' || t.status === 'a-commander')) t.status = 'bgha-ykhlass';
    delete t.changed;
  });
  const day = Object.create(null);
  (turns || []).forEach((row) => {
    const k = tableKey(row.table_no);
    if (!k) return;
    const d = (day[k] = day[k] || { turns: 0, open: 0, minutes: 0, timed: 0, revenueCents: 0 });
    /* A turn is a visit that ended. A table still seated is "en cours":
       counting it as a turn made a room of four seated tables read
       "4 tours" before anyone had left. */
    const o = Number(row.opened_ts) || 0, c = Number(row.closed_ts) || 0;
    if (!c) { d.open += 1; return; }
    d.turns += 1;
    if (o && c > o) { d.minutes += (c - o) / 60000; d.timed += 1; }
  });
  (sales || []).forEach((row) => {
    const k = tableKey(row.table_no);
    if (!k) return;
    const d = (day[k] = day[k] || { turns: 0, open: 0, minutes: 0, timed: 0, revenueCents: 0 });
    d.revenueCents += Math.max(0, Math.round(Number(row.cents) || 0));
  });
  const stats = Object.create(null);
  Object.keys(day).forEach((k) => {
    const d = day[k];
    stats[k] = { turns: d.turns, open: d.open, avgMinutes: d.timed ? Math.round(d.minutes / d.timed) : 0, revenueCents: d.revenueCents };
  });
  return { tables: out, stats, now };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ ok: false, error: 'merchant-required' }, 400);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ ok: false, error: 'forbidden-merchant' }, 403);

  const now = Date.now();
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  const dayStart = businessDayStart(now, cutoff, zone);

  const errors = [];
  let doc = {};
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'")
      .bind(merchant).first();
    doc = parse(row && row.data);
  } catch (err) {
    doc = {}; errors.push('states');
    try { console.error('[floor/live] query failed: states: ' + String((err && err.message) || err).slice(0, 200)); } catch (_) {}
  }

  const sessions0 = await all(env,
    `SELECT id, table_no, opened_ts FROM table_sessions
      WHERE merchant = ? AND status = 'open' AND mode = 'table' AND table_no <> ''`, [merchant], 'sessions', errors);
  const sessionsFailed = !sessions0;
  const sessions = sessions0 || [];

  /* Open bill per table: unpaid, not-rejected orders of the open visit. Older
     bases have no session_id/paid_ts; they fall back to "orders on this table
     since the visit opened". */
  let bills = null;
  if (sessions.length) {
    const ids = sessions.map((s) => String(s.id));
    bills = await all(env,
      `SELECT s.table_no AS table_no, SUM(o.total) AS total, COUNT(*) AS n
         FROM orders o JOIN table_sessions s ON s.id = o.session_id AND s.merchant = o.merchant
        WHERE o.merchant = ? AND o.session_id IN (${ids.map(() => '?').join(',')})
          AND o.paid_ts IS NULL AND o.status IN ${OPEN_ORDER}
        GROUP BY s.table_no`, [merchant, ...ids], 'bills');
    if (!bills) {
      const since = Math.min(...sessions.map((s) => Number(s.opened_ts) || now));
      bills = await all(env,
        `SELECT table_no, SUM(total) AS total, COUNT(*) AS n FROM orders
          WHERE merchant = ? AND mode = 'table' AND status IN ${OPEN_ORDER} AND created_ts >= ?
          GROUP BY table_no`, [merchant, since], 'bills-fallback', errors);
    }
  }

  const turns = await all(env,
    `SELECT table_no, opened_ts, closed_ts FROM table_sessions
      WHERE merchant = ? AND mode = 'table' AND table_no <> '' AND opened_ts >= ?`, [merchant, dayStart], 'turns', errors);

  /* Revenue per table today, through the visit that produced the sale. A base
     without sales.session_id or void_ts answers nothing here, which is a
     missing statistic, not a wrong one. */
  const sales = await all(env,
    `SELECT s.table_no AS table_no, SUM(COALESCE(x.amount_cents, x.amount * 100)) AS cents
       FROM sales x JOIN table_sessions s ON s.id = x.session_id AND s.merchant = x.merchant
      WHERE x.merchant = ? AND x.ts >= ? AND x.void_ts IS NULL
      GROUP BY s.table_no`, [merchant, dayStart], 'sales', errors);

  /* Whether a till is actually on: the register polls /api/order/queue every
     few seconds with its pairing proof and that poll stamps order_desk. The
     plan used to say "Caisse en direct" whenever THIS endpoint answered, even
     with no till ever paired. 0 = never seen (or a base without the table). */
  const desk = await all(env, 'SELECT seen_ts FROM order_desk WHERE merchant = ?', [merchant], 'desk', errors);
  const tillSeen = Math.max(0, Number(desk && desk[0] && desk[0].seen_ts) || 0);

  const body = assemble({
    states: doc.states && typeof doc.states === 'object' ? doc.states : {},
    requests: Array.isArray(doc.requests) ? doc.requests : [],
    sessions, bills: bills || [], turns: turns || [], sales: sales || [], now,
  });
  return json({ ok: true, merchant, dayStart, tillSeen, ...body,
    errors,
    partial: { bills: sessions.length > 0 && !bills, stats: !turns, revenue: !sales, sessions: sessionsFailed } });
}
