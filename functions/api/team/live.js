// /api/team/live — manager-owned live team channel.
// The paired caisse (or the store owner dashboard) reads attendance, starts and
// ends employee pauses, and sends operational messages. Employee devices only
// consume the resulting attendance/messages through /api/employee.

import { json, entitledMerchant } from '../../auth/_lib.js';

const TEAM = 'team';
const ACCESS = 'employee-access';
const ATTENDANCE = 'attendance';
const ATTENDANCE_CODE = 'attendance-code';
const MESSAGES = 'team-messages';
const MAX_ATTENDANCE = 5000;
const MAX_MESSAGES = 200;

function parse(raw, fallback) {
  try { const value = JSON.parse(raw || ''); return value && typeof value === 'object' ? value : fallback; }
  catch (_) { return fallback; }
}
function nameOf(member) {
  return [member && member.firstName, member && member.lastName].filter(Boolean).join(' ').trim()
    || String(member && member.name || '').trim() || 'Employé';
}
async function readDoc(env, merchant, feature, fallback) {
  try {
    const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, feature).first();
    return { data: row ? parse(row.data, fallback) : fallback, rev: Number(row && row.rev) || 0 };
  } catch (_) { return { data: fallback, rev: 0 }; }
}
async function mutateDoc(env, merchant, feature, fallback, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant, feature, fallback);
    const next = change(row.data);
    if (!next) return null;
    const text = JSON.stringify(next), now = Date.now();
    try {
      if (row.rev) {
        const result = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, now, merchant, feature, row.rev).run();
        if (Number(result && result.meta && result.meta.changes) > 0) return next;
      } else {
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, feature, text, now).run();
        if (Number(result && result.meta && result.meta.changes) > 0) return next;
      }
    } catch (_) { return null; }
  }
  return null;
}
function rosterFor(team, access) {
  const primary = Array.isArray(team && team.members) && team.members.length ? team.members : (access && access.members);
  return (Array.isArray(primary) ? primary : []).map((member) => ({
    id: String(member && member.id || ''),
    name: nameOf(member),
    role: String(member && (member.function || member.role) || 'staff'),
    department: String(member && member.department || ''),
  })).filter((member) => member.id);
}
function liveMembers(roster, attendance) {
  const entries = Array.isArray(attendance && attendance.entries) ? attendance.entries : [];
  const open = new Map();
  entries.forEach((entry) => {
    if (!entry || entry.outTs) return;
    open.set(String(entry.memberId || entry.staffId || ''), entry);
  });
  return roster.map((member) => {
    const entry = open.get(member.id);
    return {
      ...member,
      status: entry ? (entry.pauseTs ? 'on-pause' : 'on-duty') : 'off-duty',
      since: entry ? Number(entry.inTs) || 0 : 0,
      pauseTs: entry ? Number(entry.pauseTs) || 0 : 0,
    };
  });
}
function dateKey(ts) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts));
    const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (_) { return new Date(ts).toISOString().slice(0, 10); }
}
function pointedHours(attendance, now) {
  const hours = {};
  (Array.isArray(attendance && attendance.entries) ? attendance.entries : []).forEach((entry) => {
    if (!entry || !entry.inTs) return;
    const memberId = String(entry.memberId || entry.staffId || '');
    if (!memberId) return;
    const end = Number(entry.outTs) || now;
    const start = Number(entry.inTs) || 0;
    if (end <= start) return;
    let pauseMs = (Array.isArray(entry.breaks) ? entry.breaks : []).reduce((sum, pause) => {
      const a = Number(pause && pause.inTs) || 0, b = Number(pause && pause.outTs) || 0;
      return sum + (a && b > a ? b - a : 0);
    }, 0);
    if (!entry.outTs && entry.pauseTs) pauseMs += Math.max(0, now - Number(entry.pauseTs));
    const day = dateKey(start);
    const row = hours[memberId] || (hours[memberId] = {});
    row[day] = Math.round(((Number(row[day]) || 0) + Math.max(0, end - start - pauseMs) / 3600000) * 100) / 100;
  });
  return hours;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const asked = String(new URL(request.url).searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const [team, access, attendance, messages] = await Promise.all([
    readDoc(env, merchant, TEAM, { members: [] }),
    readDoc(env, merchant, ACCESS, { members: [] }),
    readDoc(env, merchant, ATTENDANCE, { entries: [] }),
    readDoc(env, merchant, MESSAGES, { messages: [] }),
  ]);
  return json({
    ok: true,
    merchant,
    members: liveMembers(rosterFor(team.data, access.data), attendance.data),
    pointedHours: pointedHours(attendance.data, Date.now()),
    recentAttendance: (Array.isArray(attendance.data.entries) ? attendance.data.entries : [])
      .slice(-20).reverse().map((entry) => ({
        id: String(entry && entry.id || ''),
        memberId: String(entry && (entry.memberId || entry.staffId) || ''),
        name: String(entry && entry.name || 'Employé'),
        inTs: Number(entry && entry.inTs) || 0,
        outTs: Number(entry && entry.outTs) || 0,
      })),
    messages: (Array.isArray(messages.data.messages) ? messages.data.messages : []).slice(-MAX_MESSAGES),
    now: Date.now(),
  }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = String(body.merchant || '').trim().toLowerCase().slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const action = String(body.action || '');
  const targetId = String(body.memberId || '').trim().slice(0, 96);

  if (action === 'generate-attendance-code') {
    const digits = new Uint32Array(1);
    const previous = await readDoc(env, merchant, ATTENDANCE_CODE, {});
    let code = '';
    do {
      crypto.getRandomValues(digits);
      code = String(digits[0] % 1000000).padStart(6, '0');
    } while (code === String(previous.data && previous.data.code || ''));
    const createdTs = Date.now();
    const expiresTs = createdTs + 5 * 60 * 1000;
    const saved = await mutateDoc(env, merchant, ATTENDANCE_CODE, {}, () => ({
      code, createdTs, expiresTs,
    }));
    return saved
      ? json({ ok: true, code, createdTs, expiresTs }, 200, { 'Cache-Control': 'no-store' })
      : json({ error: 'attendance-code-write-failed' }, 503);
  }

  if (action === 'message') {
    const text = String(body.text || '').trim().slice(0, 500);
    const target = String(body.target || targetId || 'ALL').trim().slice(0, 96) || 'ALL';
    if (!text) return json({ error: 'message-required' }, 400);
    const message = { id: 'team-' + crypto.randomUUID(), target, text, ts: Date.now(), sender: 'Caisse' };
    const saved = await mutateDoc(env, merchant, MESSAGES, { messages: [] }, (doc) => ({
      ...doc,
      messages: [...(Array.isArray(doc.messages) ? doc.messages : []), message].slice(-MAX_MESSAGES),
    }));
    return saved ? json({ ok: true, message }) : json({ error: 'message-write-failed' }, 503);
  }

  if (!['manager-pause', 'manager-resume'].includes(action)) return json({ error: 'bad-action' }, 400);
  if (!targetId) return json({ error: 'member-required' }, 400);
  let changed = null, found = false;
  const now = Date.now();
  const saved = await mutateDoc(env, merchant, ATTENDANCE, { entries: [] }, (doc) => {
    const entries = Array.isArray(doc.entries) ? doc.entries.slice() : [];
    const entry = entries.slice().reverse().find((item) => item && !item.outTs
      && String(item.memberId || item.staffId || '') === targetId);
    if (!entry) return { ...doc, entries };
    found = true;
    if (action === 'manager-pause' && !entry.pauseTs) {
      entry.pauseTs = now;
      entry.breaks = Array.isArray(entry.breaks) ? entry.breaks : [];
    } else if (action === 'manager-resume' && entry.pauseTs) {
      entry.breaks = Array.isArray(entry.breaks) ? entry.breaks : [];
      entry.breaks.push({ inTs: Number(entry.pauseTs) || now, outTs: now });
      entry.pauseTs = 0;
    }
    changed = { ...entry };
    return { ...doc, entries: entries.slice(-MAX_ATTENDANCE) };
  });
  if (!saved) return json({ error: 'attendance-write-failed' }, 503);
  if (!found) return json({ error: 'employee-not-clocked-in' }, 409);
  return json({ ok: true, action, entry: changed });
}
