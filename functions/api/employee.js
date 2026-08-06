// /api/employee — private mobile employee/service app bridge.
//
// POST { action:'login', email, pin } validates the employee credentials saved
// by the owner in Dashboard → Équipe.
// and creates a short-lived httpOnly employee session. GET returns only the
// signed-in employee's operational view: sanitized identity, their schedule and
// worked hours, on-shift colleagues, and the restaurant floor. POST clock-in /
// clock-out writes real attendance and rolls completed time into the same team
// hours document used by Dashboard → Paie & planning.

import {
  json, employeeToken, employeeCookie, clearEmployeeCookie, readEmployee,
  findEmployeeCredential, limitCheck, limitFail, limitClear,
} from '../auth/_lib.js';

const ATTENDANCE_FEATURE = 'attendance';
const TEAM_FEATURE = 'team';
const ACCESS_FEATURE = 'employee-access';
const FLOOR_FEATURE = 'floorplan';
const MAX_ATTENDANCE = 5000;

function parse(raw, fallback) {
  try { const v = JSON.parse(raw || ''); return v && typeof v === 'object' ? v : fallback; }
  catch (_) { return fallback; }
}
function fullName(m) { return [m && m.firstName, m && m.lastName].filter(Boolean).join(' ').trim(); }
function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase() || 'E';
}
function memberPin(m) { return String((m && (m.pinCode || m.password)) || '').trim(); }
function safeMember(m, pinRow) {
  const name = fullName(m) || String(pinRow.name || '').trim() || 'Employé';
  return {
    id: String((m && m.id) || pinRow.id || ''),
    name,
    firstName: String((m && m.firstName) || name.split(/\s+/)[0] || ''),
    initials: initials(name),
    role: String((m && m.function) || pinRow.role || 'staff'),
    department: String((m && m.department) || ''),
  };
}
function memberFor(team, pinRow) {
  const members = Array.isArray(team && team.members) ? team.members : [];
  const pin = String(pinRow.pin || '');
  const byPin = members.find((m) => memberPin(m) === pin);
  if (byPin) return byPin;
  const want = String(pinRow.name || '').trim().toLocaleLowerCase('fr');
  return want ? members.find((m) => fullName(m).toLocaleLowerCase('fr') === want) || null : null;
}
async function readDoc(env, merchant, feature, fallback) {
  try {
    const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, feature).first();
    return { data: row ? parse(row.data, fallback) : fallback, rev: Number(row && row.rev) || 0 };
  } catch (_) { return { data: fallback, rev: 0 }; }
}
async function liveEmployee(request, env) {
  const session = await readEmployee(request, env);
  if (!session || !env.DB) return null;
  try {
    // Once the access mirror exists it is authoritative for revocation. Team
    // still enriches the employee view with schedule, hours and profile data.
    const accessRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'")
      .bind(session.merchant).first();
    const access = parse(accessRow && accessRow.data, { members: [] });
    const accessMember = (Array.isArray(access.members) ? access.members : [])
      .find((m) => m && String(m.id || '') === String(session.staffId || ''));
    if (accessRow && !accessMember) return null;
    const teamRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'")
      .bind(session.merchant).first();
    const team = parse(teamRow && teamRow.data, { members: [] });
    const teamMember = (Array.isArray(team.members) ? team.members : [])
      .find((m) => m && String(m.id || '') === String(session.staffId || ''));
    const member = accessMember ? { ...(teamMember || {}), ...accessMember } : teamMember;
    if (member) {
      return {
        session,
        pin: {
          id: String(member.id), merchant: session.merchant, pin: memberPin(member),
          name: fullName(member), role: String(member.function || member.department || 'staff'),
        },
      };
    }
    // Compatibility for sessions issued before employee IDs became canonical.
    const pin = await env.DB.prepare('SELECT id, merchant, pin, name, role FROM staff_pins WHERE id = ? AND merchant = ?')
      .bind(session.staffId, session.merchant).first();
    return pin ? { session, pin } : null;
  } catch (_) { return null; }
}
function dateKey(ts) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts));
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (_) { return new Date(ts).toISOString().slice(0, 10); }
}
function attendanceView(doc, staffId) {
  const entries = Array.isArray(doc && doc.entries) ? doc.entries : [];
  const mine = entries.filter((e) => e && e.staffId === staffId);
  const open = mine.slice().reverse().find((e) => !e.outTs) || null;
  return { open, recent: mine.slice(-31).reverse() };
}
function sanitizedFloor(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    zones: (Array.isArray(d.zones) ? d.zones : []).map((z) => ({ id: String(z.id || ''), name: String(z.name || 'Salle') })),
    tables: (Array.isArray(d.tables) ? d.tables : []).map((t) => ({
      id: String(t.id || ''), num: String(t.num || t.id || ''), zone: String(t.zone || ''),
      type: String(t.type || ''), seats: Math.max(0, Number(t.seats) || 0),
      status: String(t.status || 'free'), server: t.server == null ? '' : String(t.server),
    })),
    staff: (Array.isArray(d.staff) ? d.staff : []).map((s) => ({ id: String(s.id || ''), name: String(s.name || '') })),
  };
}
async function payloadFor(request, env) {
  const auth = await liveEmployee(request, env);
  if (!auth) return null;
  const merchant = auth.session.merchant;
  const [teamRow, floorRow, attendanceRow, cfg] = await Promise.all([
    readDoc(env, merchant, TEAM_FEATURE, { members: [], hours: {}, shifts: {} }),
    readDoc(env, merchant, FLOOR_FEATURE, { zones: [], tables: [], staff: [] }),
    readDoc(env, merchant, ATTENDANCE_FEATURE, { entries: [] }),
    env.DB.prepare('SELECT name, type, status FROM merchant_config WHERE merchant = ?').bind(merchant).first().catch(() => null),
  ]);
  if (cfg && String(cfg.status || '') === 'suspended') return { suspended: true };
  const member = memberFor(teamRow.data, auth.pin);
  const me = safeMember(member, auth.pin);
  const members = Array.isArray(teamRow.data.members) ? teamRow.data.members : [];
  const entries = Array.isArray(attendanceRow.data.entries) ? attendanceRow.data.entries : [];
  const openEntries = new Map(entries.filter((e) => e && !e.outTs)
    .map((e) => [String(e.memberId || e.staffId || ''), e]));
  const colleagues = members.map((m) => {
    const p = safeMember(m, { id: m.id, name: fullName(m), role: m.function || m.department || 'staff' });
    const open = openEntries.get(String(m.id || ''));
    return { ...p, status: open ? (open.pauseTs ? 'on-pause' : 'on-duty') : 'off-duty' };
  });
  if (!colleagues.some((c) => c.id === me.id)) {
    const open = attendanceView(attendanceRow.data, auth.pin.id).open;
    colleagues.unshift({ ...me, status: open ? (open.pauseTs ? 'on-pause' : 'on-duty') : 'off-duty' });
  }
  return {
    ok: true, merchant, store: { name: String((cfg && cfg.name) || merchant), type: String((cfg && cfg.type) || '') },
    employee: me,
    schedule: (teamRow.data.shifts && teamRow.data.shifts[me.id]) || {},
    hours: (teamRow.data.hours && teamRow.data.hours[me.id]) || {},
    attendance: attendanceView(attendanceRow.data, auth.pin.id),
    colleagues,
    floor: sanitizedFloor(floorRow.data),
  };
}

async function mutateDoc(env, merchant, feature, fallback, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant, feature, fallback);
    const next = change(row.data);
    const text = JSON.stringify(next);
    const now = Date.now();
    try {
      if (row.rev) {
        const res = await env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?')
          .bind(text, row.rev + 1, now, merchant, feature, row.rev).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return next;
      } else {
        const res = await env.DB.prepare('INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
          .bind(merchant, feature, text, now).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return next;
      }
    } catch (_) { return null; }
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const data = await payloadFor(request, env);
  if (!data) return json({ error: 'employee-session-required' }, 401);
  if (data.suspended) return json({ error: 'store-suspended' }, 403);
  return json(data, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const action = String(body.action || 'login');

  if (action === 'login') {
    const limited = await limitCheck(request, env, 'employee');
    if (limited) return limited;
    const email = String(body.email || '').trim();
    const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 4);
    if (!email || pin.length !== 4) { await limitFail(request, env, 'employee'); return json({ error: 'bad-employee-code' }, 401); }
    const row = await findEmployeeCredential(env, email, pin);
    if (row && row.ambiguous) {
      await limitFail(request, env, 'employee');
      return json({ error: 'employee-access-ambiguous' }, 409);
    }
    if (!row || String(row.status || 'active') === 'suspended') {
      await limitFail(request, env, 'employee');
      return json({ error: row && row.status === 'suspended' ? 'store-suspended' : 'bad-employee-code' }, row && row.status === 'suspended' ? 403 : 401);
    }
    await limitClear(request, env, 'employee');
    const merchant = row.merchant;
    const res = json({ ok: true, merchant, role: row.role || 'staff', name: row.name || 'Employé' });
    res.headers.append('Set-Cookie', employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: row.id })));
    return res;
  }

  if (action === 'logout') {
    const res = json({ ok: true });
    res.headers.append('Set-Cookie', clearEmployeeCookie());
    return res;
  }

  const auth = await liveEmployee(request, env);
  if (!auth) return json({ error: 'employee-session-required' }, 401);
  if (!['clock-in', 'clock-out', 'pause', 'resume'].includes(action)) return json({ error: 'bad-action' }, 400);
  const merchant = auth.session.merchant;
  const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members: [], hours: {}, shifts: {} });
  const member = memberFor(teamRow.data, auth.pin);
  const memberId = String((member && member.id) || auth.pin.id);
  const now = Date.now();
  let changedEntry = null;
  const attendance = await mutateDoc(env, merchant, ATTENDANCE_FEATURE, { entries: [] }, (doc) => {
    const entries = Array.isArray(doc.entries) ? doc.entries.slice() : [];
    const open = entries.slice().reverse().find((e) => e && e.staffId === auth.pin.id && !e.outTs);
    if (action === 'clock-in') {
      changedEntry = open || { id: crypto.randomUUID(), staffId: auth.pin.id, memberId, name: auth.pin.name || '', role: auth.pin.role || '', inTs: now, outTs: 0 };
      if (!open) entries.push(changedEntry);
    } else if (action === 'pause' && open && !open.pauseTs) {
      open.pauseTs = now;
      open.breaks = Array.isArray(open.breaks) ? open.breaks : [];
      changedEntry = { ...open };
    } else if (action === 'resume' && open && open.pauseTs) {
      open.breaks = Array.isArray(open.breaks) ? open.breaks : [];
      open.breaks.push({ inTs: Number(open.pauseTs) || now, outTs: now });
      open.pauseTs = 0;
      changedEntry = { ...open };
    } else if (action === 'clock-out' && open) {
      if (open.pauseTs) {
        open.breaks = Array.isArray(open.breaks) ? open.breaks : [];
        open.breaks.push({ inTs: Number(open.pauseTs) || now, outTs: now });
        open.pauseTs = 0;
      }
      open.outTs = Math.max(now, Number(open.inTs) || now);
      changedEntry = { ...open };
    }
    return { entries: entries.slice(-MAX_ATTENDANCE) };
  });
  if (!attendance) return json({ error: 'attendance-write-failed' }, 503);
  if (action === 'clock-out' && changedEntry && changedEntry.outTs > changedEntry.inTs) {
    const pauseMs = (Array.isArray(changedEntry.breaks) ? changedEntry.breaks : []).reduce((sum, pause) => {
      const start = Number(pause && pause.inTs) || 0;
      const end = Number(pause && pause.outTs) || 0;
      return sum + (start && end > start ? end - start : 0);
    }, 0);
    const hours = Math.round((Math.max(0, changedEntry.outTs - changedEntry.inTs - pauseMs) / 3600000) * 100) / 100;
    const day = dateKey(changedEntry.inTs);
    await mutateDoc(env, merchant, TEAM_FEATURE, { members: [], hours: {}, shifts: {} }, (doc) => {
      doc.members = Array.isArray(doc.members) ? doc.members : [];
      doc.hours = doc.hours && typeof doc.hours === 'object' ? doc.hours : {};
      doc.shifts = doc.shifts && typeof doc.shifts === 'object' ? doc.shifts : {};
      if (!doc.hours[memberId]) doc.hours[memberId] = {};
      doc.hours[memberId][day] = Math.round(((Number(doc.hours[memberId][day]) || 0) + hours) * 100) / 100;
      return doc;
    });
  }
  return json({ ok: true, action, entry: changedEntry });
}
