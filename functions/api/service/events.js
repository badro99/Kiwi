// Store-scoped, assigned-server event stream for front-of-house facts that are
// not orders (today: a party seated from the cashier waitlist).

import { json, entitledMerchant, activeServiceEmployee } from '../../auth/_lib.js';

const FEATURE = 'service-events';
const MAX_EVENTS = 200;
const TABLE_STATUSES = new Set(['khawya', 'a-commander', 'ka-yaklo', 'bgha-ykhlass', 'ka-tkhdam', 'khlass']);

function parse(raw) {
  try { const d = JSON.parse(raw || '{}'); return d && typeof d === 'object' ? d : {}; }
  catch (_) { return {}; }
}
function norm(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
function memberName(member) {
  return [member && member.firstName, member && member.lastName].filter(Boolean).join(' ').trim();
}
async function readDoc(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, FEATURE).first();
    return { data: parse(row && row.data), rev: Number(row && row.rev) || 0 };
  } catch (_) { return { data: {}, rev: 0 }; }
}
async function append(env, merchant, event, statePatch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant);
    const events = Array.isArray(row.data.events) ? row.data.events.slice(-MAX_EVENTS + 1) : [];
    events.push(event);
    const states = { ...(row.data.states && typeof row.data.states === 'object' ? row.data.states : {}) };
    if (statePatch && statePatch.table) states[statePatch.table] = statePatch;
    const text = JSON.stringify({ ...row.data, events, states });
    try {
      if (row.rev) {
        const res = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, event.ts, merchant, FEATURE, row.rev).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return true;
      } else {
        const res = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, FEATURE, text, event.ts).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return true;
      }
    } catch (_) { return false; }
  }
  return false;
}

function tableKey(value) {
  return String(value || '').trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
}
async function floorTargets(env, merchant) {
  const out = Object.create(null);
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'floorplan'")
      .bind(merchant).first();
    const plan = parse(row && row.data);
    const staff = Object.create(null);
    (Array.isArray(plan.staff) ? plan.staff : []).forEach((s) => { if (s && s.id) staff[String(s.id)] = String(s.name || ''); });
    (Array.isArray(plan.tables) ? plan.tables : []).forEach((t) => {
      const table = tableKey(t && (t.num || t.id));
      if (!table) return;
      out[table] = { serverId: String(t.server || ''), server: String(staff[t.server] || '') };
    });
  } catch (_) {}
  return out;
}
async function syncTableSnapshot(env, merchant, rawTables) {
  const targets = await floorTargets(env, merchant);
  const incoming = Object.create(null);
  (Array.isArray(rawTables) ? rawTables : []).slice(0, 250).forEach((src) => {
    const table = tableKey(src && src.table);
    const status = String(src && src.status || '');
    if (!table || !TABLE_STATUSES.has(status)) return;
    incoming[table] = { table, status, covers: Math.max(0, Math.min(99, Number(src.covers) || 0)) };
  });
  if (!Object.keys(incoming).length) return { ok: false, events: [] };
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant);
    const previous = row.data.states && typeof row.data.states === 'object' ? row.data.states : {};
    const states = { ...previous };
    const events = Array.isArray(row.data.events) ? row.data.events.slice(-MAX_EVENTS) : [];
    const emitted = [];
    Object.keys(incoming).forEach((table) => {
      const next = incoming[table], before = previous[table];
      states[table] = { ...next, ts: Date.now() };
      if (!before || before.status === next.status) return;
      const target = targets[table] || {};
      const event = {
        id: 'evt-' + crypto.randomUUID(), type: 'table-state', ts: Date.now(),
        table, status: next.status, previousStatus: String(before.status || ''), covers: next.covers,
        serverId: target.serverId || '', server: target.server || '',
      };
      events.push(event); emitted.push(event);
    });
    const text = JSON.stringify({ ...row.data, states, events: events.slice(-MAX_EVENTS) });
    try {
      if (row.rev) {
        const res = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, Date.now(), merchant, FEATURE, row.rev).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return { ok: true, events: emitted };
      } else {
        const res = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, FEATURE, text, Date.now()).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return { ok: true, events: emitted };
      }
    } catch (_) { return { ok: false, events: [] }; }
  }
  return { ok: false, events: [] };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const employee = await activeServiceEmployee(request, env, asked);
  if (!employee) return json({ error: 'on-shift-service-required' }, 403);
  const since = Math.max(
    0,
    Number(url.searchParams.get('since')) || 0,
    Number(employee.attendance && employee.attendance.inTs) || 0,
  );
  const myId = String(employee.member.id || employee.session.staffId || '');
  const myName = norm(memberName(employee.member));
  const row = await readDoc(env, employee.merchant);
  let pausedIds = new Set(), pausedNames = new Set();
  try {
    const attendanceRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance'")
      .bind(employee.merchant).first();
    const attendance = JSON.parse((attendanceRow && attendanceRow.data) || '{}');
    (Array.isArray(attendance.entries) ? attendance.entries : []).forEach((entry) => {
      if (!entry || entry.outTs || !entry.pauseTs) return;
      const id = String(entry.memberId || entry.staffId || '');
      const name = norm(entry.name);
      if (id) pausedIds.add(id);
      if (name) pausedNames.add(name);
    });
  } catch (_) { pausedIds = new Set(); pausedNames = new Set(); }
  const events = (Array.isArray(row.data.events) ? row.data.events : [])
    .filter((event) => event && Number(event.ts) > since)
    .filter((event) => {
      if (employee.attendance && employee.attendance.pauseTs) return false;
      const direct = (event.serverId && String(event.serverId) === myId)
        || (event.server && norm(event.server) === myName);
      const coverage = (event.serverId && pausedIds.has(String(event.serverId)))
        || (event.server && pausedNames.has(norm(event.server)));
      return direct || coverage;
    })
    .slice(-MAX_EVENTS);
  return json({ ok: true, events, states: row.data.states || {}, now: Date.now() });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = String(body.merchant || '').trim().toLowerCase().slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  if (body.snapshot && Array.isArray(body.snapshot.tables)) {
    const result = await syncTableSnapshot(env, merchant, body.snapshot.tables);
    return result.ok ? json({ ok: true, events: result.events }) : json({ error: 'snapshot-write-failed' }, 503);
  }
  const src = body.event && typeof body.event === 'object' ? body.event : {};
  if (String(src.type || '') !== 'table-seated') return json({ error: 'bad-event-type' }, 400);
  const event = {
    id: 'evt-' + crypto.randomUUID(), type: 'table-seated', ts: Date.now(),
    table: String(src.table || '').slice(0, 32),
    serverId: String(src.serverId || '').slice(0, 96),
    server: String(src.server || '').slice(0, 80),
    customer: String(src.customer || '').slice(0, 80),
    covers: Math.max(0, Math.min(99, Number(src.covers) || 0)),
  };
  if (!event.table || (!event.serverId && !event.server)) return json({ error: 'event-target-required' }, 400);
  const state = { table: event.table, status: 'a-commander', covers: event.covers, ts: event.ts };
  if (!await append(env, merchant, event, state)) return json({ error: 'event-write-failed' }, 503);
  return json({ ok: true, event });
}
