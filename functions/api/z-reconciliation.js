// Read-only comparison of a till's closed Z with the authoritative sales ledger.
// Missing receipts are never fabricated here: only the originating till can
// requeue their full, locally preserved payment payloads.
import { entitledMerchant, isTillFor } from '../auth/_lib.js';
import { businessDate, businessBoundary, addBusinessDays, merchantZone } from './_business-day.js';

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
  const zone = await merchantZone(env, merchant);
  const from = businessBoundary(day, 5, zone);
  const to = businessBoundary(addBusinessDays(day, 1), 5, zone);
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
  // A missing receipt alone does NOT make a permanent rejection retryable.
  // Only reasons removed by this release are eligible. Conflicting financial
  // identities and malformed payloads stay quarantined for human resolution.
  const comparisonId = crypto.randomUUID(), comparedAt = Date.now();
  const blocked = (Array.isArray(body.blocked) ? body.blocked : []).slice(0, 200).filter(row =>
    local.has(String(row?.id)) && Number.isSafeInteger(row.amountCents) && row.amountCents >= 0
  ).map(row => ({ id: String(row.id).slice(0,64), amountCents: row.amountCents,
    method: String(row.method || '').slice(0,16), ts: Number(row.ts) || 0,
    reason: String(row.reason || 'unknown').slice(0,96), status: Number(row.status) || 0 }));
  const relaxed = new Set(['table-session-missing', 'service-session-table-mismatch',
    'open-service-session-required', 'send-order-before-payment']);
  const retryable = blocked.filter(row => missing.includes(row.id) && relaxed.has(row.reason)
    && [404,409].includes(row.status)).map(row => ({ id: row.id, reason: row.reason,
      status: row.status, comparisonId, comparedAt, merchant, changed: 'visit-rule-relaxed' }));
  const result = { comparisonId, blocked, retryable,
    manifest: sales.map(row => ({ id: row.id, amountCents: row.amountCents, method: row.method })), day, terminalId, reportedCount: body.count, reportedCents: sum,
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
  const zone = await merchantZone(env, merchant);
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
    const day = url.searchParams.get('day') || businessDate(Date.now(), 5, zone);
    if (!validDay(day)) return json({ error: 'bad-day' }, 400);
    const dayRows = (await env.DB.prepare(`SELECT * FROM z_reconciliations
      WHERE merchant = ? AND business_day = ? ORDER BY updated_ts DESC`).bind(merchant, day).all()).results || [];
    const ledger = (await env.DB.prepare(`SELECT id, amount, amount_cents, method FROM sales
      WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL`)
      .bind(merchant, businessBoundary(day, 5, zone), businessBoundary(addBusinessDays(day, 1), 5, zone)).all()).results || [];
    const recordedCents = ledger.reduce((n,r) => n + Math.round(r.amount_cents == null ? Number(r.amount)*100 : Number(r.amount_cents)), 0);
    const remote = new Map(ledger.map(r => [r.id,r]));
    const reports = dayRows.map(row => ({ row, result: JSON.parse(row.result_json || '{}') }));
    const closed = reports.filter(x => x.result.closed !== false);
    // Manifests allow exact union across tills (imported receipts can overlap).
    // Older single-terminal comparisons still carry their exact aggregate.
    const union = new Map(), waiting = new Set(), blockedById = new Map();
    let overlappingConflict = false;
    for (const {result} of reports) {
      for (const id of result.missing || []) if (!remote.has(id)) waiting.add(id);
      for (const item of result.blocked || []) blockedById.set(item.id, item);
    }
    // Heartbeats also expose blocked receipts when no valid Z can be queued.
    // Latest observation per device; absence is not proof of synchronisation.
    let pendingCount = 0, syncObserved = reports.length > 0;
    try {
      const beats = (await env.DB.prepare(`SELECT payload FROM operational_commands
        WHERE merchant = ? AND domain = 'device' AND action = 'heartbeat'
        ORDER BY updated_ts DESC LIMIT 1000`).bind(merchant).all()).results || [];
      const devices = new Set();
      for (const row of beats) {
        let beat; try { beat = JSON.parse(row.payload); } catch (_) { continue; }
        if (!beat.deviceId || devices.has(beat.deviceId)) continue;
        devices.add(beat.deviceId);
        if (beat.sync) syncObserved = true;
        pendingCount += Math.max(0,Math.min(100000,Number(beat.sync?.pending)||0));
        for (const r of (Array.isArray(beat.sync?.blockedEntries) ? beat.sync.blockedEntries : []).slice(0,200)) {
          if (!r?.id) continue;
          blockedById.set(String(r.id).slice(0,64), {id:String(r.id).slice(0,64),
            amountCents:Math.max(0,Math.min(20000000,Math.round(Number(r.amountCents)||0))),
            method:String(r.method||'').slice(0,16),ts:Number(r.ts)||0,reason:String(r.reason||'unknown').slice(0,96)});
        }
      }
    } catch (_) { /* Older stores have no device telemetry yet. */ }
    for (const [id,r] of blockedById) {
      const stored = remote.get(id);
      if (stored && Number(stored.amount_cents ?? Math.round(Number(stored.amount)*100)) === r.amountCents
        && stored.method === r.method) blockedById.delete(id);
    }
    for (const {result} of closed) for (const item of result.manifest || []) {
      const old = union.get(item.id);
      if (old && (old.amountCents !== item.amountCents || old.method !== item.method)) overlappingConflict = true;
      union.set(item.id,item);
    }
    const exactUnion = closed.length && closed.every(x => Array.isArray(x.result.manifest)) && !overlappingConflict;
    const reportedCents = !closed.length ? null : exactUnion
      ? [...union.values()].reduce((n,r) => n + r.amountCents,0)
      : closed.length === 1 ? Number(closed[0].row.reported_cents) : null;
    const missingCount = exactUnion ? [...union.keys()].filter(id => !remote.has(id)).length
      : closed.length === 1 ? (closed[0].result.missing || []).filter(id => !remote.has(id)).length : null;
    const source = reportedCents != null ? 'closed-z' : day === businessDate(Date.now(), 5, zone) ? 'live-ledger' : 'ledger-only';
    const daySummary = { day, source, syncObserved, closedTerminals: closed.length, totalTerminals: reports.length, comparisonAvailable: reports.length > 0,
      referenceCents: reportedCents == null ? recordedCents : reportedCents, reportedCents, recordedCents,
      recordedCount: ledger.length, gapCents: reportedCents == null ? null : reportedCents - recordedCents,
      missingCount, waitingCount: day === businessDate(Date.now(), 5, zone) ? Math.max(waiting.size,pendingCount) : waiting.size, blocked: [...blockedById.values()],
      ambiguous: closed.length > 1 && reportedCents == null };
    return json({ ok: true, merchant, rows, conflicts, daySummary });
  } catch (_) { return json({ error: 'db-read-failed' }, 503); }
}
