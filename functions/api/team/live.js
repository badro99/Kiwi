// /api/team/live — manager-owned live team channel.
// The paired caisse (or the store owner dashboard) reads attendance, starts and
// ends employee pauses, and sends operational messages. Employee devices only
// consume the resulting attendance/messages through /api/employee.

import { json, entitledMerchant } from '../../auth/_lib.js';
import { storeOperationalState } from '../_private.js';
import { DEFAULT_CUTOFF, businessDate, merchantCutoff, merchantZone } from '../_business-day.js';
import { hoursByDay } from '../_worked-hours.js';

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
/* Même journée que /api/employee et que les ventes : un pointage commencé
   avant la bascule (05:00 par défaut) appartient au service de la veille. */
function dateKey(ts, zone, cutoff = DEFAULT_CUTOFF) {
  return businessDate(ts, cutoff, zone);
}
/* Un pointage resté ouvert pour un salarié retiré (écrit avant que /api/store
 * ne le close au retrait) s'arrête à l'heure du retrait, pas à « maintenant ». */
function removedAt(team) {
  const at = new Map();
  (Array.isArray(team && team.removed) ? team.removed : []).forEach((r) => {
    const ts = Number(r && r.ts) || 0;
    if (r && r.id && ts) at.set(String(r.id), ts);
  });
  return at;
}
function pointedHours(attendance, now, zone, gone = new Map(), cutoff = DEFAULT_CUTOFF) {
  const items = [];
  (Array.isArray(attendance && attendance.entries) ? attendance.entries : []).forEach((entry) => {
    if (!entry || !entry.inTs) return;
    const memberId = String(entry.memberId || entry.staffId || '');
    if (!memberId) return;
    const start = Number(entry.inTs) || 0;
    const cut = gone.get(memberId);
    const end = Number(entry.outTs) || (cut ? Math.max(start, Math.min(now, cut)) : now);
    const breaks = (Array.isArray(entry.breaks) ? entry.breaks : []).map((pause) => [Number(pause && pause.inTs) || 0, Number(pause && pause.outTs) || 0]);
    if (!entry.outTs && entry.pauseTs) breaks.push([Number(entry.pauseTs), end]);
    items.push({ key: memberId, id: entry.id, closed: !!entry.outTs, start, end, breaks });
  });
  return hoursByDay(items, (ts) => dateKey(ts, zone, cutoff), (ts) => dateKey(ts, zone, 0));
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const asked = String(new URL(request.url).searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
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
    pointedHours: pointedHours(attendance.data, Date.now(), zone, removedAt(team.data), cutoff),
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
  const storeState = await storeOperationalState(env, merchant);
  if (!storeState.ok) return json({ error: 'auth-verification-unavailable' }, 503);
  if (storeState.pending) return json({ error: 'subscription-required' }, 402);
  if (storeState.suspended) return json({ error: 'store-suspended' }, 403);
  const action = String(body.action || '');
  const targetId = String(body.memberId || '').trim().slice(0, 96);

  /* A new six-digit code, never the one it replaces, alive 5 minutes. */
  const drawCode = (previousCode) => {
    const digits = new Uint32Array(1);
    let code = '';
    do {
      crypto.getRandomValues(digits);
      code = String(digits[0] % 1000000).padStart(6, '0');
    } while (code === String(previousCode || ''));
    const createdTs = Date.now();
    return { code, createdTs, expiresTs: createdTs + 5 * 60 * 1000 };
  };
  /* Le code remplacé reste connu 24 h, borné à SA fenêtre (fin = l'instant où
     il a été remplacé) : un pointage gardé hors ligne sur le téléphone de
     l'employé se vérifie contre le code qui valait au moment du geste. En
     direct, /api/employee n'accepte toujours que le code courant. */
  const withRecent = (previous, next) => {
    const now = next.createdTs;
    const recent = (Array.isArray(previous && previous.recent) ? previous.recent : [])
      .filter((c) => c && /^\d{6}$/.test(String(c.code || '')) && Number(c.endTs) > now - 24 * 3600000);
    if (previous && /^\d{6}$/.test(String(previous.code || '')) && Number(previous.createdTs) > 0) {
      recent.push({ code: String(previous.code), createdTs: Number(previous.createdTs),
        endTs: Math.min(Number(previous.expiresTs) || now, now) });
    }
    return { ...next, recent: recent.slice(-400) };
  };

  if (action === 'generate-attendance-code') {
    const previous = await readDoc(env, merchant, ATTENDANCE_CODE, {});
    const { code, createdTs, expiresTs } = drawCode(previous.data && previous.data.code);
    const saved = await mutateDoc(env, merchant, ATTENDANCE_CODE, {}, (doc) => withRecent(doc, {
      code, createdTs, expiresTs,
    }));
    return saved
      ? json({ ok: true, code, createdTs, expiresTs }, 200, { 'Cache-Control': 'no-store' })
      : json({ error: 'attendance-code-write-failed' }, 503);
  }

  /* §10.34 (stage 4): one shared code per merchant, shown the same on every
     till. The stored code comes back unchanged while it has MORE than 60 s
     of life left; only then is a new one drawn, through the same
     compare-and-swap on rev, so two tills renewing at the same instant end
     with one code (the loser re-reads the winner's and keeps it). `now` is
     the server's clock: the till times its renewal on it, not its own. */
  if (action === 'current-attendance-code') {
    const live = (doc) => !!doc && /^\d{6}$/.test(String(doc.code || '')) && Number(doc.expiresTs) - Date.now() > 60 * 1000;
    const first = await readDoc(env, merchant, ATTENDANCE_CODE, {});
    let reused = live(first.data);
    let current = reused ? first.data : null;
    if (!current) {
      current = await mutateDoc(env, merchant, ATTENDANCE_CODE, {}, (doc) => {
        reused = live(doc);
        return reused ? doc : withRecent(doc, drawCode(doc && doc.code));
      });
    }
    return current
      ? json({ ok: true, code: current.code, createdTs: current.createdTs, expiresTs: current.expiresTs, now: Date.now(), reused },
        200, { 'Cache-Control': 'no-store' })
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
