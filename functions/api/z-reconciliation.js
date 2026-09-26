// Read-only comparison of a till's closed Z with the authoritative sales ledger.
// Missing receipts are never fabricated here: only the originating till can
// requeue their full, locally preserved payment payloads.
import { entitledMerchant, isTillFor } from '../auth/_lib.js';
import { businessBoundary, addBusinessDays } from './_business-day.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function schema(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS z_reconciliations (
    merchant TEXT NOT NULL, business_day TEXT NOT NULL, terminal_id TEXT NOT NULL,
    reported_count INTEGER NOT NULL, reported_cents INTEGER NOT NULL,
    server_count INTEGER NOT NULL, server_cents INTEGER NOT NULL,
    missing_count INTEGER NOT NULL, missing_cents INTEGER NOT NULL,
    mismatch_count INTEGER NOT NULL, extra_count INTEGER NOT NULL,
    status TEXT NOT NULL, result_json TEXT NOT NULL, updated_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, business_day, terminal_id)
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS sale_sync_conflicts (
    merchant TEXT NOT NULL, sale_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    method TEXT NOT NULL, first_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, sale_id)
  )`).run();
}
function validDay(day) {
  if (!/^20\d\d-\d\d-\d\d$/.test(day)) return false;
  const parsed = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day;
}
export async function onRequestPost({ request, env }) {
  if (!env?.DB) return json({ error: 'no-db' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String(body?.merchant || '').slice(0, 64);
  if (!merchant || !await isTillFor(request, env, merchant)) return json({ error: 'till-required' }, 403);
  const day = String(body.day || '');
  const terminalId = String(body.terminalId || '').trim().slice(0, 64);
  const sales = body.sales;
  if (!validDay(day) || !/^[A-Za-z0-9:_-]{1,64}$/.test(terminalId)
    || !Array.isArray(sales) || sales.length > 5000
    || !Number.isSafeInteger(body.count) || body.count !== sales.length
    || !Number.isSafeInteger(body.totalCents) || body.totalCents < 0) return json({ error: 'bad-z-report' }, 400);
  const seen = new Set();
  let sum = 0;
  const local = new Map();
  for (const sale of sales) {
    const id = String(sale?.id || '').trim();
    const cents = sale?.amountCents;
    const method = String(sale?.method || '');
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(id) || seen.has(id)
      || !Number.isSafeInteger(cents) || cents < 0 || cents > 20000000
      || !/^[a-z-]{1,16}$/.test(method)) return json({ error: 'bad-z-sale' }, 400);
    seen.add(id); sum += cents; local.set(id, { amountCents: cents, method });
  }
  if (sum !== body.totalCents) return json({ error: 'z-total-mismatch' }, 400);
  const from = businessBoundary(day);
  const to = businessBoundary(addBusinessDays(day, 1));
  let remote;
  try {
    remote = (await env.DB.prepare(`SELECT id, amount, amount_cents, method FROM sales
      WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL ORDER BY ts LIMIT 5001`)
      .bind(merchant, from, to).all()).results || [];
  } catch (error) { return json({ error: 'db-read-failed' }, 503); }
  if (remote.length > 5000) return json({ error: 'day-too-large' }, 409);
  const server = new Map(remote.map(row => [row.id, {
    amountCents: row.amount_cents == null ? Number(row.amount) * 100 : Number(row.amount_cents), method: row.method,
  }]));
  const missing = [], mismatched = [], extra = [];
  let missingCents = 0, serverCents = 0, serverCount = 0;
  for (const [id, row] of local) {
    const stored = server.get(id);
    if (!stored) { missing.push(id); missingCents += row.amountCents; }
    else {
      serverCount++;
      serverCents += stored.amountCents;
      if (stored.amountCents !== row.amountCents || stored.method !== row.method) mismatched.push(id);
    }
  }
  for (const [id, row] of server) {
    if (!local.has(id)) extra.push(id);
  }
  const result = { day, terminalId, reportedCount: body.count, reportedCents: sum,
    serverCount, serverCents, missing, missingCents, mismatched, extra,
    closed: body.closed !== false,
    gapCents: sum - serverCents,
    status: missing.length || mismatched.length || sum !== serverCents ? 'mismatch' : 'matched' };
  try {
    await schema(env.DB);
    await env.DB.prepare(`INSERT INTO z_reconciliations
      (merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,
       missing_count,missing_cents,mismatch_count,extra_count,status,result_json,updated_ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(merchant,business_day,terminal_id) DO UPDATE SET
       reported_count=excluded.reported_count,reported_cents=excluded.reported_cents,
       server_count=excluded.server_count,server_cents=excluded.server_cents,
       missing_count=excluded.missing_count,missing_cents=excluded.missing_cents,
       mismatch_count=excluded.mismatch_count,extra_count=excluded.extra_count,
       status=excluded.status,result_json=excluded.result_json,updated_ts=excluded.updated_ts`)
      .bind(merchant, day, terminalId, body.count, sum, serverCount, serverCents,
        missing.length, missingCents, mismatched.length, extra.length, result.status, JSON.stringify(result), Date.now()).run();
  } catch (error) { return json({ error: 'db-write-failed' }, 503); }
  return json({ ok: true, ...result });
}

export async function onRequestGet({ request, env }) {
  if (!env?.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked);
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  try {
    await schema(env.DB);
    const rows = (await env.DB.prepare(`SELECT business_day, terminal_id, reported_count, reported_cents,
      server_count, server_cents, missing_count, missing_cents, mismatch_count, extra_count,
      status, result_json, updated_ts FROM z_reconciliations WHERE merchant = ? ORDER BY business_day DESC, updated_ts DESC LIMIT 14`)
      .bind(merchant).all()).results || [];
    for (const row of rows) {
      try { row.closed = JSON.parse(row.result_json || '{}').closed !== false; }
      catch (_) { row.closed = true; } // pre-upgrade jobs were close-only
      delete row.result_json;
    }
    const conflicts = (await env.DB.prepare(`SELECT sale_id, amount_cents, method, updated_ts
      FROM sale_sync_conflicts WHERE merchant = ? ORDER BY updated_ts DESC LIMIT 14`)
      .bind(merchant).all()).results || [];
    // Existing cloud-backed day reports predate the receipt-ID Z protocol.
    // Compare their aggregate gross with the merchant's real ledger, but do
    // not invent receipt rows or claim a count of missing individual tickets.
    const dayReports = [];
    let saved = null, dayReportsUnavailable = false;
    try { saved = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'dayreports'")
      .bind(merchant).first(); }
    catch (_) { dayReportsUnavailable = true; }
    let days = {};
    try { days = JSON.parse(saved?.data || '{}').days || {}; } catch (_) { days = {}; }
    for (const day of Object.keys(days).filter(validDay).sort().reverse().slice(0, 14)) {
      const report = days[day];
      if (!report || typeof report !== 'object') continue;
      const reportedCents = Math.round(Number(report.gross) * 100);
      if (!Number.isSafeInteger(reportedCents) || reportedCents < 0) continue;
      const cutoff = Number.isInteger(Number(report.cutoff)) && Number(report.cutoff) >= 0 && Number(report.cutoff) <= 12
        ? Number(report.cutoff) : 5;
      const from = businessBoundary(day, cutoff), to = businessBoundary(addBusinessDays(day, 1), cutoff);
      const ledger = await env.DB.prepare(`SELECT COUNT(*) AS n,
        COALESCE(SUM(COALESCE(amount_cents, CAST(ROUND(amount * 100) AS INTEGER))), 0) AS cents
        FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL
          AND COALESCE(amount_cents, amount * 100) > 0`).bind(merchant, from, to).first();
      const serverCents = Number(ledger?.cents || 0);
      dayReports.push({ business_day: day, source: 'saved-day-report',
        reported_count: Number(report.txns) || 0, reported_cents: reportedCents,
        server_count: Number(ledger?.n || 0), server_cents: serverCents,
        closed: !!(Number(report.closedCount) || Number(report.closedAt)),
        status: reportedCents === serverCents ? 'matched' : 'mismatch' });
    }
    return json({ ok: true, merchant, rows, dayReports, dayReportsUnavailable, conflicts });
  } catch (_) { return json({ error: 'db-read-failed' }, 503); }
}
