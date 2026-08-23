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
  json, employeeToken, employeeCookie, clearEmployeeCookie, readEmployee, employeeNeedsRefresh,
  findEmployeeCredential, limitCheck, limitFail, limitClear, targetKey,
} from '../auth/_lib.js';

const ATTENDANCE_FEATURE = 'attendance';
const ATTENDANCE_CODE_FEATURE = 'attendance-code';
const TEAM_FEATURE = 'team';
const ACCESS_FEATURE = 'employee-access';
const FLOOR_FEATURE = 'floorplan';
const MESSAGES_FEATURE = 'team-messages';
const PROGRESS_FEATURE = 'employee-progress';
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
function planningState(team, memberId, currentRole) {
  const raw = team && team.planning && typeof team.planning === 'object' ? team.planning : {};
  const ownRole = roleKey(currentRole);
  const today = dateKey(Date.now());
  const members = Array.isArray(team && team.members) ? team.members : [];
  const roles = new Map(members.map((member) => [String(member.id || ''), roleKey(member.function || member.department || member.role)]));
  const requests = (Array.isArray(raw.requests) ? raw.requests : [])
    .filter((request) => request && String(request.memberId || '') === String(memberId || ''))
    .map((request) => ({
      id:String(request.id || ''), type:String(request.type || ''), status:String(request.status || 'pending'),
      startDate:String(request.startDate || ''), endDate:String(request.endDate || ''),
      weekdays:Array.isArray(request.weekdays) ? request.weekdays.map(Number).filter((day) => day >= 0 && day <= 6) : [],
      start:String(request.start || ''), end:String(request.end || ''), available:request.available !== false,
      reason:String(request.reason || '').slice(0, 240), createdAt:String(request.createdAt || ''), updatedAt:String(request.updatedAt || ''),
    }));
  const source = raw.publishingEnabled ? raw.publishedShifts : team && team.shifts;
  const openShifts = (Array.isArray(raw.openShifts) ? raw.openShifts : [])
    .filter((shift) => shift && String(shift.day || '') >= today && (String(shift.claimantId || '') === String(memberId || '') || String(shift.memberId || '') === String(memberId || '') || (shift.status === 'open' && (!shift.role || !ownRole || roleKey(shift.role) === ownRole))))
    .map((shift) => ({ id:String(shift.id || ''), day:String(shift.day || ''), start:String(shift.start || ''), end:String(shift.end || ''), role:String(shift.role || '').slice(0,80), note:String(shift.note || '').slice(0,160), status:String(shift.status || 'open'), mine:String(shift.claimantId || shift.memberId || '') === String(memberId || '') }));
  const swapRequests = (Array.isArray(raw.swapRequests) ? raw.swapRequests : [])
    .filter((request) => request && String(request.day || '') >= today && (String(request.memberId || '') === String(memberId || '') || String(request.claimantId || '') === String(memberId || '') || (request.status === 'open' && (!ownRole || !roles.get(String(request.memberId || '')) || roles.get(String(request.memberId || '')) === ownRole))))
    .map((request) => ({ id:String(request.id || ''), memberId:String(request.memberId || ''), day:String(request.day || ''), shift:request.shift && typeof request.shift === 'object' ? { start:String(request.shift.start || ''), end:String(request.shift.end || '') } : {}, status:String(request.status || 'open'), claimantId:String(request.claimantId || '') === String(memberId || '') ? String(memberId || '') : '', offeredDay:String(request.claimantId || '') === String(memberId || '') ? String(request.offeredDay || '') : '', mine:String(request.memberId || '') === String(memberId || '') }));
  const notices = (Array.isArray(raw.notices) ? raw.notices : [])
    .filter((notice) => notice && String(notice.memberId || '') === String(memberId || ''))
    .slice(-20).map((notice) => ({ id:String(notice.id || ''), type:String(notice.type || ''), day:String(notice.day || ''), otherDay:String(notice.otherDay || ''), periodKey:String(notice.periodKey || ''), createdAt:String(notice.createdAt || '') }));
  return { publishingEnabled:Boolean(raw.publishingEnabled), schedule:(source && source[memberId]) || {}, requests, openShifts, swapRequests, notices };
}
function validISODate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(String(value) + 'T12:00:00Z')); }
function validTime(value) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
function roleKey(value) { return String(value || '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
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
    const accessRow = await env.DB.prepare("SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = 'employee-access'")
      .bind(session.merchant).first();
    const access = parse(accessRow && accessRow.data, { members: [] });
    const accessMember = (Array.isArray(access.members) ? access.members : [])
      .find((m) => m && String(m.id || '') === String(session.staffId || ''));
    const teamRow = await env.DB.prepare("SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = 'team'")
      .bind(session.merchant).first();
    const team = parse(teamRow && teamRow.data, { members: [] });
    const teamMember = (Array.isArray(team.members) ? team.members : [])
      .find((m) => m && String(m.id || '') === String(session.staffId || ''));
    const teamIsNewer = !accessRow
      || Number((teamRow && teamRow.updated_ts) || 0) > Number(accessRow.updated_ts || 0);
    const member = accessMember
      ? { ...(teamMember || {}), ...accessMember }
      : (teamIsNewer ? teamMember : null);
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
function pointedHours(doc, memberId, staffId) {
  const out = {};
  (Array.isArray(doc && doc.entries) ? doc.entries : []).forEach((entry) => {
    if (!entry || !entry.outTs) return;
    if (String(entry.memberId || '') !== String(memberId || '') && String(entry.staffId || '') !== String(staffId || '')) return;
    const start = Number(entry.inTs) || 0, end = Number(entry.outTs) || 0;
    if (!start || end <= start) return;
    const pauseMs = (Array.isArray(entry.breaks) ? entry.breaks : []).reduce((sum, pause) => {
      const a = Number(pause && pause.inTs) || 0, b = Number(pause && pause.outTs) || 0;
      return sum + (a && b > a ? b - a : 0);
    }, 0);
    const key = dateKey(start);
    out[key] = Math.round(((Number(out[key]) || 0) + Math.max(0, end - start - pauseMs) / 3600000) * 100) / 100;
  });
  return out;
}
function safeProgress(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const records = value.records && typeof value.records === 'object' ? value.records : {};
  return {
    lifetimeXP: Math.max(0, Number(value.lifetimeXP) || 0),
    records: {
      bestNight: Math.max(0, Number(records.bestNight) || 0),
      streak: Math.max(0, Number(records.streak) || 0),
      bestSpeed: Number(records.bestSpeed) > 0 ? Number(records.bestSpeed) : null,
    },
    shifts: Math.max(0, Number(value.shifts) || 0),
    updatedTs: Math.max(0, Number(value.updatedTs) || 0),
  };
}
function normalizedFloorStaff(raw, members) {
  const staff = Array.isArray(raw && raw.staff) ? raw.staff : [];
  const team = Array.isArray(members) ? members : [];
  const teamIds = new Set(team.map((m) => String(m && m.id || '')).filter(Boolean));
  const teamByName = new Map(team.map((m) => [fullName(m).toLocaleLowerCase('fr'), String(m && m.id || '')]));
  const floorNames = new Map(staff.map((s) => [String(s && s.id || ''), String(s && s.name || '')]));
  function memberId(value) {
    const rawId = String(value || '');
    if (!rawId) return '';
    if (teamIds.has(rawId)) return rawId;
    const legacyId = rawId.startsWith('tm-') ? rawId.slice(3) : '';
    if (legacyId && teamIds.has(legacyId)) return legacyId;
    return teamByName.get(String(floorNames.get(rawId) || '').trim().toLocaleLowerCase('fr')) || rawId;
  }
  return { staff, memberId };
}
function sanitizedFloor(raw, members) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const normalized = normalizedFloorStaff(d, members);
  return {
    zones: (Array.isArray(d.zones) ? d.zones : []).map((z) => ({ id: String(z.id || ''), name: String(z.name || 'Salle') })),
    tables: (Array.isArray(d.tables) ? d.tables : []).map((t) => ({
      id: String(t.id || ''), num: String(t.num || t.id || ''), zone: String(t.zone || ''),
      type: String(t.type || ''), seats: Math.max(0, Number(t.seats) || 0),
      status: String(t.status || 'free'), server: normalized.memberId(t.server),
      servers: Array.from(new Set((Array.isArray(t.servers) ? t.servers : [t.server])
        .filter(Boolean).map(normalized.memberId).filter(Boolean))).slice(0, 3),
    })),
    staff: normalized.staff.map((s) => ({ id: normalized.memberId(s.id), name: String(s.name || '') })),
  };
}
async function payloadFor(request, env) {
  const auth = await liveEmployee(request, env);
  if (!auth) return null;
  const merchant = auth.session.merchant;
  const [teamRow, floorRow, attendanceRow, messagesRow, progressRow, cfg] = await Promise.all([
    readDoc(env, merchant, TEAM_FEATURE, { members: [], hours: {}, shifts: {} }),
    readDoc(env, merchant, FLOOR_FEATURE, { zones: [], tables: [], staff: [] }),
    readDoc(env, merchant, ATTENDANCE_FEATURE, { entries: [] }),
    readDoc(env, merchant, MESSAGES_FEATURE, { messages: [] }),
    readDoc(env, merchant, PROGRESS_FEATURE, { members: {} }),
    env.DB.prepare('SELECT name, type, status FROM merchant_config WHERE merchant = ?').bind(merchant).first().catch(() => null),
  ]);
  if (cfg && String(cfg.status || '') === 'suspended') return { suspended: true };
  const member = memberFor(teamRow.data, auth.pin);
  const me = safeMember(member, auth.pin);
  const planning = planningState(teamRow.data, me.id, me.role || me.department);
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
    schedule: planning.schedule,
    planning: {
      publishingEnabled:planning.publishingEnabled,
      requests:planning.requests,
      openShifts:planning.openShifts,
      swapRequests:planning.swapRequests,
      notices:planning.notices,
    },
    hours: (teamRow.data.hours && teamRow.data.hours[me.id]) || {},
    pointedHours: pointedHours(attendanceRow.data, me.id, auth.pin.id),
    progress: safeProgress(progressRow.data.members && progressRow.data.members[me.id]),
    attendance: attendanceView(attendanceRow.data, auth.pin.id),
    colleagues,
    messages: (Array.isArray(messagesRow.data.messages) ? messagesRow.data.messages : [])
      .filter((message) => message && (message.target === 'ALL' || String(message.target || '') === me.id))
      .slice(-100),
    floor: sanitizedFloor(floorRow.data, members),
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
  const res = json(data, 200, { 'Cache-Control': 'no-store' });
  /* Fenêtre glissante — voir employeeNeedsRefresh(). C'est le sondage que
   * l'app employé fait déjà tourner : le seul point du service traversé par
   * une session VALIDE à chaque service, donc le seul endroit où la prolonger
   * sans ajouter d'appel. Rien n'est prolongé si la session est déjà morte —
   * payloadFor() a répondu 401 plus haut. */
  const session = await readEmployee(request, env);
  if (employeeNeedsRefresh(session)) {
    res.headers.append('Set-Cookie', employeeCookie(
      await employeeToken(env.AUTH_SECRET, { merchant: session.merchant, staffId: session.staffId })));
  }
  return res;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const action = String(body.action || 'login');

  if (action === 'login') {
    /* C'était le seul contrôle d'identifiant du dépôt dont le compteur n'était
     * rattaché à AUCUNE identité prouvée : `limitCheck(…, 'employee')` sans
     * identité retombe sur l'adresse IP. Un code à quatre chiffres, confronté
     * par `findEmployeeCredential` aux effectifs de TOUS les commerçants d'un
     * coup, se trouvait donc en changeant d'adresse — et `limitClear` effaçait
     * l'ardoise à chaque réussite. La cible garde maintenant son propre
     * plafond, quelle que soit la source. */
    const limited = await limitCheck(request, env, 'employee');
    if (limited) return limited;
    const email = String(body.email || '').trim();
    const target = await targetKey(env.AUTH_SECRET, 'employee', email);
    const limitedTarget = target ? await limitCheck(request, env, 'employee', target) : null;
    if (limitedTarget) return limitedTarget;
    const failBoth = async () => {
      await limitFail(request, env, 'employee');
      if (target) await limitFail(request, env, 'employee', target);
    };
    const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 4);
    if (!email || pin.length !== 4) { await failBoth(); return json({ error: 'bad-employee-code' }, 401); }
    const row = await findEmployeeCredential(env, email, pin);
    if (row && row.ambiguous) {
      await failBoth();
      return json({ error: 'employee-access-ambiguous' }, 409);
    }
    if (!row || String(row.status || 'active') === 'suspended') {
      await failBoth();
      return json({ error: row && row.status === 'suspended' ? 'store-suspended' : 'bad-employee-code' }, row && row.status === 'suspended' ? 403 : 401);
    }
    // Seul le compteur de la CIBLE s'efface ; celui de la source garde sa mémoire.
    if (target) await limitClear(request, env, 'employee', target);
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
  // Attendance starts/ends on the employee device. Breaks are a manager action
  // owned by the paired caisse through /api/team/live; an employee cannot grant
  // or end their own pause by crafting this request.
  const merchant = auth.session.merchant;
  if (action === 'planning-request' || action === 'planning-request-cancel') {
    const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} });
    const member = memberFor(teamRow.data, auth.pin);
    const memberId = String((member && member.id) || auth.pin.id);
    let requestId = '';
    const now = new Date().toISOString();
    if (action === 'planning-request') {
      const type = String(body.type || '');
      if (type !== 'leave' && type !== 'availability') return json({ error:'planning-request-type-invalid' }, 400);
      const reason = String(body.reason || '').trim().slice(0, 240);
      const request = { id:crypto.randomUUID(), memberId, type, reason, status:'pending', createdAt:now, updatedAt:now };
      if (type === 'leave') {
        const startDate = String(body.startDate || ''), endDate = String(body.endDate || '');
        if (!validISODate(startDate) || !validISODate(endDate) || startDate > endDate) return json({ error:'planning-date-invalid' }, 400);
        const length = Math.round((Date.parse(endDate + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000);
        if (length > 366) return json({ error:'planning-date-range-too-long' }, 400);
        request.startDate = startDate; request.endDate = endDate;
      } else {
        const weekdays = Array.from(new Set((Array.isArray(body.weekdays) ? body.weekdays : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
        const available = body.available !== false;
        const start = String(body.start || ''), end = String(body.end || '');
        if (!weekdays.length || (available && (!validTime(start) || !validTime(end) || start === end))) return json({ error:'planning-availability-invalid' }, 400);
        request.weekdays = weekdays; request.available = available; request.start = available ? start : ''; request.end = available ? end : '';
      }
      requestId = request.id;
      const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
        doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
        doc.planning.requests = Array.isArray(doc.planning.requests) ? doc.planning.requests : [];
        const duplicate = doc.planning.requests.some((item) => item && item.memberId === memberId && item.type === request.type && item.status === 'pending' && (request.type === 'leave' ? item.startDate === request.startDate && item.endDate === request.endDate : JSON.stringify(item.weekdays || []) === JSON.stringify(request.weekdays || [])));
        if (!duplicate) doc.planning.requests.push(request);
        return doc;
      });
      if (!updated) return json({ error:'planning-write-failed' }, 503);
    } else {
      requestId = String(body.requestId || '');
      if (!requestId) return json({ error:'planning-request-id-required' }, 400);
      const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
        doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
        doc.planning.requests = Array.isArray(doc.planning.requests) ? doc.planning.requests : [];
        const request = doc.planning.requests.find((item) => item && item.id === requestId && item.memberId === memberId && item.status === 'pending');
        if (request) { request.status = 'cancelled'; request.updatedAt = now; }
        return doc;
      });
      if (!updated) return json({ error:'planning-write-failed' }, 503);
    }
    return json({ ok:true, action, requestId });
  }
  if (['planning-open-shift-claim', 'planning-swap-request', 'planning-swap-claim', 'planning-opportunity-cancel'].includes(action)) {
    const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} });
    const member = memberFor(teamRow.data, auth.pin);
    const memberId = String((member && member.id) || auth.pin.id);
    const memberRole = roleKey((member && (member.function || member.department)) || auth.pin.role);
    const now = new Date().toISOString();
    let resultId = '';
    let operationError = '';
    const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
      doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
      const planning = doc.planning;
      planning.openShifts = Array.isArray(planning.openShifts) ? planning.openShifts : [];
      planning.swapRequests = Array.isArray(planning.swapRequests) ? planning.swapRequests : [];
      planning.publishedShifts = planning.publishedShifts && typeof planning.publishedShifts === 'object' ? planning.publishedShifts : {};
      if (action === 'planning-open-shift-claim') {
        resultId = String(body.shiftId || '');
        const shift = planning.openShifts.find((item) => item && item.id === resultId);
        if (!shift || shift.status !== 'open') { operationError = 'open-shift-unavailable'; return doc; }
        if (!validISODate(shift.day) || !validTime(shift.start) || !validTime(shift.end) || shift.start === shift.end) { operationError = 'open-shift-invalid'; return doc; }
        if (shift.day < dateKey(Date.now())) { operationError = 'open-shift-past'; return doc; }
        if (shift.role && memberRole && roleKey(shift.role) !== memberRole) { operationError = 'open-shift-role-mismatch'; return doc; }
        if (planning.publishedShifts[memberId] && planning.publishedShifts[memberId][shift.day]) { operationError = 'open-shift-schedule-conflict'; return doc; }
        const activeClaims = planning.openShifts.filter((item) => item && item.claimantId === memberId && item.status === 'claimed').length;
        if (activeClaims >= 20) { operationError = 'planning-opportunity-limit'; return doc; }
        shift.status = 'claimed'; shift.claimantId = memberId; shift.updatedAt = now;
      } else if (action === 'planning-swap-request') {
        const day = String(body.day || '');
        const ownShift = planning.publishedShifts[memberId] && planning.publishedShifts[memberId][day];
        if (!validISODate(day) || !ownShift || !validTime(ownShift.start) || !validTime(ownShift.end)) { operationError = 'swap-shift-invalid'; return doc; }
        if (day < dateKey(Date.now())) { operationError = 'swap-shift-past'; return doc; }
        const activeMine = planning.swapRequests.filter((item) => item && item.memberId === memberId && ['open','claimed'].includes(item.status)).length;
        if (activeMine >= 20) { operationError = 'planning-opportunity-limit'; return doc; }
        if (planning.swapRequests.some((item) => item && item.memberId === memberId && item.day === day && ['open','claimed'].includes(item.status))) { operationError = 'swap-already-open'; return doc; }
        resultId = crypto.randomUUID();
        planning.swapRequests.push({ id:resultId, memberId, day, shift:{ start:String(ownShift.start), end:String(ownShift.end) }, status:'open', claimantId:'', offeredDay:'', createdAt:now, updatedAt:now });
      } else if (action === 'planning-swap-claim') {
        resultId = String(body.requestId || '');
        const offeredDay = String(body.offeredDay || '');
        const request = planning.swapRequests.find((item) => item && item.id === resultId);
        const offeredShift = planning.publishedShifts[memberId] && planning.publishedShifts[memberId][offeredDay];
        if (!request || request.status !== 'open' || request.memberId === memberId) { operationError = 'swap-unavailable'; return doc; }
        if (!validISODate(offeredDay) || !offeredShift || !validTime(offeredShift.start) || !validTime(offeredShift.end)) { operationError = 'swap-offer-invalid'; return doc; }
        if (request.day < dateKey(Date.now()) || offeredDay < dateKey(Date.now())) { operationError = 'swap-shift-past'; return doc; }
        const owner = (Array.isArray(doc.members) ? doc.members : []).find((item) => item && String(item.id || '') === String(request.memberId || ''));
        const ownerRole = roleKey(owner && (owner.function || owner.department || owner.role));
        if (ownerRole && memberRole && ownerRole !== memberRole) { operationError = 'swap-role-mismatch'; return doc; }
        request.status = 'claimed'; request.claimantId = memberId; request.offeredDay = offeredDay;
        request.offeredShift = { start:String(offeredShift.start), end:String(offeredShift.end) }; request.updatedAt = now;
      } else {
        resultId = String(body.requestId || body.shiftId || '');
        const open = planning.openShifts.find((item) => item && item.id === resultId && item.status === 'claimed' && item.claimantId === memberId);
        const swap = planning.swapRequests.find((item) => item && item.id === resultId);
        if (open) { open.status = 'open'; open.claimantId = ''; open.updatedAt = now; }
        else if (swap && swap.memberId === memberId && ['open','claimed'].includes(swap.status)) { swap.status = 'cancelled'; swap.updatedAt = now; }
        else if (swap && swap.claimantId === memberId && swap.status === 'claimed') { swap.status = 'open'; swap.claimantId = ''; swap.offeredDay = ''; delete swap.offeredShift; swap.updatedAt = now; }
        else operationError = 'planning-opportunity-not-cancellable';
      }
      return doc;
    });
    if (!updated) return json({ error:'planning-write-failed' }, 503);
    if (operationError) return json({ error:operationError }, 409);
    return json({ ok:true, action, id:resultId });
  }
  if (action === 'pause' || action === 'resume') return json({ error: 'pause-managed-by-caisse' }, 403);
  if (!['clock-in', 'clock-out'].includes(action)) return json({ error: 'bad-action' }, 400);
  // Credentials prove who is pointing. The short-lived code generated by the
  // paired caisse proves the employee is physically present at this store.
  const attendanceCode = String(body.attendanceCode || '').replace(/\D/g, '').slice(0, 6);
  const codeRow = await readDoc(env, merchant, ATTENDANCE_CODE_FEATURE, {});
  const codeData = codeRow.data || {};
  if (attendanceCode.length !== 6 || attendanceCode !== String(codeData.code || '')
      || Date.now() > Number(codeData.expiresTs || 0)) {
    return json({ error: 'attendance-code-invalid' }, 403);
  }
  const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members: [], hours: {}, shifts: {} });
  const member = memberFor(teamRow.data, auth.pin);
  const memberId = String((member && member.id) || auth.pin.id);
  const now = Date.now();
  let changedEntry = null;
  const attendance = await mutateDoc(env, merchant, ATTENDANCE_FEATURE, { entries: [] }, (doc) => {
    const entries = Array.isArray(doc.entries) ? doc.entries.slice() : [];
    const open = entries.slice().reverse().find((e) => e && e.staffId === auth.pin.id && !e.outTs);
    if (action === 'clock-in') {
      changedEntry = open || { id: crypto.randomUUID(), staffId: auth.pin.id, memberId, name: auth.pin.name || '', role: auth.pin.role || '', inTs: now, outTs: 0, clockInCodeTs: Number(codeData.createdTs) || now };
      if (!open) entries.push(changedEntry);
    } else if (action === 'clock-out' && open) {
      if (open.pauseTs) {
        open.breaks = Array.isArray(open.breaks) ? open.breaks : [];
        open.breaks.push({ inTs: Number(open.pauseTs) || now, outTs: now });
        open.pauseTs = 0;
      }
      open.outTs = Math.max(now, Number(open.inTs) || now);
      open.clockOutCodeTs = Number(codeData.createdTs) || now;
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
    const rawProgress = body.progress && typeof body.progress === 'object' ? body.progress : {};
    const paid = Math.min(200, Math.max(0, Math.floor(Number(rawProgress.paid) || 0)));
    const revenue = Math.min(1000000, Math.max(0, Number(rawProgress.revenue) || 0));
    const turnMinutes = Math.min(100000, Math.max(0, Number(rawProgress.turnMinutes) || 0));
    const speed = paid > 0 && turnMinutes > 0 ? Math.round(turnMinutes / paid) : null;
    const earnedXP = Math.round(paid * 10 + revenue * 0.01);
    await mutateDoc(env, merchant, PROGRESS_FEATURE, { members: {} }, (doc) => {
      doc.members = doc.members && typeof doc.members === 'object' ? doc.members : {};
      const previous = safeProgress(doc.members[memberId]);
      doc.members[memberId] = {
        lifetimeXP: previous.lifetimeXP + earnedXP,
        records: {
          bestNight: Math.max(previous.records.bestNight, paid),
          streak: paid >= 8 ? previous.records.streak + 1 : (paid > 0 ? 1 : previous.records.streak),
          bestSpeed: speed == null ? previous.records.bestSpeed
            : (previous.records.bestSpeed == null ? speed : Math.min(previous.records.bestSpeed, speed)),
        },
        shifts: previous.shifts + 1,
        updatedTs: now,
      };
      return doc;
    });
  }
  return json({ ok: true, action, entry: changedEntry });
}
