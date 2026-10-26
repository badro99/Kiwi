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
  findEmployeeCredential, employeeAuthRevision, limitCheck, limitFail, limitClear, targetKey, rateLimitUnavailable,
} from '../auth/_lib.js';
import { storeOperationalState } from './_private.js';
import { DEFAULT_CUTOFF, businessDate, merchantCutoff, merchantZone } from './_business-day.js';
import { handleAttendance, ACTION_ROLES as ATTENDANCE_ACTION_ROLES } from './employee/_attendance.js';
import { handleLeave, ACTION_ROLES as LEAVE_ACTION_ROLES } from './employee/_leave.js';
import { hoursByDay } from './_worked-hours.js';

const ATTENDANCE_FEATURE = 'attendance';
const TEAM_FEATURE = 'team';
const FLOOR_FEATURE = 'floorplan';
const MESSAGES_FEATURE = 'team-messages';
const MESSAGE_WINDOW_MS = 24 * 3600000;
const PROGRESS_FEATURE = 'employee-progress';

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
  // Signed staff identity takes priority over legacy PIN/name matching.
  const byId = members.find((m) => m && String(m.id || '') === String(pinRow.id || ''));
  if (byId) return byId;
  const pin = String(pinRow.pin || '');
  const byPin = members.find((m) => memberPin(m) === pin);
  if (byPin) return byPin;
  const want = String(pinRow.name || '').trim().toLocaleLowerCase('fr');
  return want ? members.find((m) => fullName(m).toLocaleLowerCase('fr') === want) || null : null;
}
function planningState(team, memberId, currentRole, zone) {
  const raw = team && team.planning && typeof team.planning === 'object' ? team.planning : {};
  const ownRole = roleKey(currentRole);
  const today = planningDay(Date.now(), zone);
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
    /* Retiré par le propriétaire (pierre tombale du document team) : la session
       signée ne vaut plus rien, même si le miroir d'accès n'a pas encore suivi. */
    const revoked = (Array.isArray(team.removed) ? team.removed : [])
      .some((r) => r && String(r.id || '') === String(session.staffId || ''));
    if (revoked) return null;
    const member = accessMember
      ? { ...(teamMember || {}), ...accessMember }
      : (teamIsNewer ? teamMember : null);
    if (member) {
      const expected = Math.max(0, Math.round(Number(member.authVersion) || 0));
      const presented = Math.max(0, Math.round(Number(session.av) || 0));
      const revision = await employeeAuthRevision(env, session.merchant, session.staffId, expected);
      if (!revision.ok || presented !== revision.version) return null;
      return {
        session,
        pin: {
          id: String(member.id), merchant: session.merchant, pin: memberPin(member),
          name: fullName(member), role: String(member.function || member.department || 'staff'),
        },
      };
    }
    // Compatibility for sessions issued before employee IDs became canonical.
    const pin = await env.DB.prepare('SELECT * FROM staff_pins WHERE id = ? AND merchant = ?')
      .bind(session.staffId, session.merchant).first();
    if (pin) {
      const expected = Math.max(0, Math.round(Number(pin.auth_version) || 0));
      const revision = await employeeAuthRevision(env, session.merchant, session.staffId, expected);
      if (!revision.ok || Math.max(0, Math.round(Number(session.av) || 0)) !== revision.version) return null;
    }
    return pin ? { session, pin } : null;
  } catch (_) { return null; }
}
/* Un pointage appartient à la journée commerciale du magasin (bascule à 05:00
   par défaut), comme les ventes du soir : un service commencé à 00:30 est
   celui de la veille. Le planning, lui, range ses services par date civile
   du magasin, comme l'app (employee-planning.js) : planningDay. */
function dateKey(ts, zone, cutoff = DEFAULT_CUTOFF) {
  return businessDate(ts, cutoff, zone);
}
function planningDay(ts, zone) {
  return businessDate(ts, 0, zone);
}
function attendanceView(doc, staffId) {
  const entries = Array.isArray(doc && doc.entries) ? doc.entries : [];
  const mine = entries.filter((e) => e && e.staffId === staffId);
  const open = mine.slice().reverse().find((e) => !e.outTs) || null;
  return { open, recent: mine.slice(-31).reverse() };
}
function pointedHours(doc, memberId, staffId, zone, cutoff = DEFAULT_CUTOFF) {
  const items = [];
  (Array.isArray(doc && doc.entries) ? doc.entries : []).forEach((entry) => {
    if (!entry || !entry.outTs) return;
    if (String(entry.memberId || '') !== String(memberId || '') && String(entry.staffId || '') !== String(staffId || '')) return;
    items.push({
      key: 'me', id: entry.id, closed: true,
      start: Number(entry.inTs) || 0, end: Number(entry.outTs) || 0,
      breaks: (Array.isArray(entry.breaks) ? entry.breaks : []).map((pause) => [Number(pause && pause.inTs) || 0, Number(pause && pause.outTs) || 0]),
    });
  });
  return hoursByDay(items, (ts) => dateKey(ts, zone, cutoff), (ts) => dateKey(ts, zone, 0)).me || {};
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
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
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
  const planning = planningState(teamRow.data, me.id, me.role || me.department, zone);
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
  // Only authenticated attribution is included. Historical unassigned receipts
  // cannot be reconstructed from a device tally or table ownership.
  const shiftOpen = attendanceView(attendanceRow.data, auth.pin.id).open;
  const shiftPayments = shiftOpen ? await env.DB.prepare(
    'SELECT COALESCE(SUM(COALESCE(amount_cents,amount*100)),0) AS amountCents, COUNT(*) AS receipts FROM sales WHERE merchant=? AND seller_id=? AND ts>=? AND ts<=? AND void_ts IS NULL'
  ).bind(merchant, String(auth.session.staffId), Number(shiftOpen.inTs), Date.now()).first() : {amountCents:0,receipts:0};
  return {
    ok: true, merchant, store: { name: String((cfg && cfg.name) || merchant), type: String((cfg && cfg.type) || ''), timezone: zone },
    employee: me,
    shiftPayments,
    schedule: planning.schedule,
    planning: {
      publishingEnabled:planning.publishingEnabled,
      requests:planning.requests,
      openShifts:planning.openShifts,
      swapRequests:planning.swapRequests,
      notices:planning.notices,
    },
    hours: (teamRow.data.hours && teamRow.data.hours[me.id]) || {},
    pointedHours: pointedHours(attendanceRow.data, me.id, auth.pin.id, zone, cutoff),
    progress: safeProgress(progressRow.data.members && progressRow.data.members[me.id]),
    attendance: attendanceView(attendanceRow.data, auth.pin.id),
    colleagues,
    messages: (Array.isArray(messagesRow.data.messages) ? messagesRow.data.messages : [])
      .filter((message) => message && (message.target === 'ALL' || String(message.target || '') === me.id)
        // Un message du comptoir vaut pour le service en cours : celui d'hier
        // soir (« la salle B ferme ») ne doit pas ressortir comme une consigne
        // d'aujourd'hui, le jour où l'employé rouvre l'app.
        && Date.now() - (Number(message.ts) || 0) < MESSAGE_WINDOW_MS)
      .slice(-100),
    floor: sanitizedFloor(floorRow.data, members),
  };
}

async function mutateDoc(env, merchant, feature, fallback, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant, feature, fallback);
    const next = change(row.data);
    // Rien à écrire (pointage différé refusé) : on n'écrit rien.
    if (!next) return null;
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
      await employeeToken(env.AUTH_SECRET, { merchant: session.merchant, staffId: session.staffId, authVersion: session.av })));
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
      const sourceOk = await limitFail(request, env, 'employee');
      const targetOk = !target || await limitFail(request, env, 'employee', target);
      return sourceOk && targetOk;
    };
    const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 4);
    if (!email || pin.length !== 4) { if (!await failBoth()) return rateLimitUnavailable(); return json({ error: 'bad-employee-code' }, 401); }
    const row = await findEmployeeCredential(env, email, pin);
    if (row && row.ambiguous) {
      if (!await failBoth()) return rateLimitUnavailable();
      return json({ error: 'employee-access-ambiguous' }, 409);
    }
    if (!row || String(row.status || 'active') === 'suspended') {
      if (!await failBoth()) return rateLimitUnavailable();
      return json({ error: row && row.status === 'suspended' ? 'store-suspended' : 'bad-employee-code' }, row && row.status === 'suspended' ? 403 : 401);
    }
    // Seul le compteur de la CIBLE s'efface ; celui de la source garde sa mémoire.
    if (target) await limitClear(request, env, 'employee', target);
    const merchant = row.merchant;
    const res = json({ ok: true, merchant, role: row.role || 'staff', name: row.name || 'Employé' });
    res.headers.append('Set-Cookie', employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: row.id, authVersion: row.authVersion })));
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
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  const storeState = await storeOperationalState(env, merchant);
  if (!storeState.ok) return json({ error: 'auth-verification-unavailable' }, 503);
  if (storeState.suspended) return json({ error: 'store-suspended' }, 403);
  if (storeState.pending) return json({ error: 'subscription-required' }, 402);
  const actor = { role: 'employee', identity: auth };
  const store = { env, merchant, zone, cutoff, readDoc, mutateDoc, memberFor,
    completedHours: (changedEntry, memberId) => pointedHours({ entries: [changedEntry] }, memberId, auth.pin.id, zone, cutoff),
    safeProgress, planningDay, roleKey, validISODate, validTime };
  if (Object.hasOwn(LEAVE_ACTION_ROLES, action)) {
    return handleLeave({ actor, store, request, action, body });
  }
  if (Object.hasOwn(ATTENDANCE_ACTION_ROLES, action)) {
    return handleAttendance({ actor, store, request, action, body });
  }
  return json({ error: 'bad-action' }, 400);
}
