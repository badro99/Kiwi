import { codeDocument } from '../auth/_staff-codes.js';
// Server-owned recovery ledger. No presence codes or credentials are retained.
import { json, entitledMerchant, activeAccountSession, isOperator, operatorActor, readEmployee } from '../auth/_lib.js';
import { businessDate, merchantZone, merchantCutoff } from './_business-day.js';
import { hoursByDay } from './_worked-hours.js';
import { MAX_CORRECTIONS_PER_DAY, HARD_MAX_CORRECTIONS } from './_attendance-cap.js';
const FEATURE = 'attendance-corrections';
const MAX_PENDING_PER_STAFF = 20;
const DECIDED_KEEP_MS = 90 * 24 * 3600000;
async function read(env, merchant, feature, fallback) {
  const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, feature).first();
  // Fail closed on malformed or unavailable documents; never replace them with emptiness.
  return row ? { data: JSON.parse(row.data), rev: Number(row.rev) } : { data: fallback, rev: 0 };
}
async function seed(env, merchant, feature, data) {
  await env.DB.prepare('INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').bind(merchant, feature, JSON.stringify(data), Date.now()).run();
}
const HOUR_MS = 3600000;
export async function retainCorrection(env, merchant, staff, body) {
  const opId = String(body.opId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!opId) return json({ error: 'attendance-operation-required' }, 400);
  const receivedTs = Date.now();
  const delay = Math.floor(Number(body.capturedAgoMs));
  if (!Number.isSafeInteger(delay) || delay <= 12 * HOUR_MS || receivedTs - delay <= 0) {
    return json({ error: 'attendance-capture-invalid' }, 400);
  }
  try {
    await seed(env, merchant, FEATURE, { items: [] });
    for (let attempt = 0; attempt < 6; attempt++) {
      const row = await read(env, merchant, FEATURE, { items: [] });
      const existing = row.data.items.find((item) => item.staffId === staff.id && item.opId === opId && item.action === body.action);
      if (existing) return json({ ok: true, pendingApproval: existing.status === 'pending', correction: existing });
      // Bounded: one person cannot fill the manager's queue, and decided items
      // older than DECIDED_KEEP_MS leave the document (their effect is in attendance).
      const pendingForStaff = row.data.items.filter((item) => item.staffId === staff.id && item.status === 'pending');
      if (pendingForStaff.length >= MAX_PENDING_PER_STAFF) return json({ error: 'attendance-corrections-full' }, 429);
      // Own small bounds: a few requests per person per day, and a ceiling on the whole document
      // (refuse the new request, never drop a stored one).
      const lastDay = row.data.items.filter((item) => item.staffId === staff.id && receivedTs - Number(item.receivedTs) < 24 * HOUR_MS);
      if (lastDay.length >= MAX_CORRECTIONS_PER_DAY) return json({ error: 'too-many-punches' }, 429);
      if (row.data.items.length >= HARD_MAX_CORRECTIONS) return json({ error: 'attendance-full' }, 409);
      row.data.items = row.data.items.filter((item) => item.status === 'pending' || !(Number(item.decidedAt) > 0) || receivedTs - Number(item.decidedAt) < DECIDED_KEEP_MS);
      const capturedAt = Number.isSafeInteger(body.capturedAt) && body.capturedAt > 0 ? body.capturedAt : receivedTs - delay;
      const item = {
        id: crypto.randomUUID(), opId, staffId: staff.id, memberId: staff.memberId || staff.id, name: staff.name || '',
        action: body.action, claimedTs: receivedTs - delay, capturedTs: capturedAt, receivedTs,
        deviceId: String(body.deviceId || 'legacy-device').slice(0, 120), status: 'pending',
      };
      row.data.items.push(item);
      const result = await env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?')
        .bind(JSON.stringify(row.data), row.rev + 1, receivedTs, merchant, FEATURE, row.rev).run();
      if (Number(result.meta?.changes) > 0) return json({ ok: true, pendingApproval: true, correction: item });
    }
  } catch (_) {}
  return json({ error: 'attendance-correction-write-failed' }, 503);
}
export async function correctionList(env, merchant) {
  return (await read(env, merchant, FEATURE, { items: [] })).data.items.filter((item) => item.status === 'pending');
}
export async function decideCorrection(request, env, merchant, body) {
  // Same dashboard owner / named-operator boundary as editing attendance/team.
  if (await entitledMerchant(request, env, merchant) !== merchant) return json({ error: 'forbidden-merchant' }, 403);
  const operator = await isOperator(request, env);
  const session = await activeAccountSession(request, env);
  const actor = operator ? { type: 'operator', ...(await operatorActor(request, env)) } : session?.aid ? { type: 'owner', id: session.aid } : null;
  if (!actor?.id) return json({ error: 'attendance-actor-required' }, 403);
  const employee = await readEmployee(request, env);
  const decision = String(body.decision || '');
  if (!['approved', 'rejected'].includes(decision)) return json({ error: 'attendance-decision-invalid' }, 400);
  try {
    const account = session?.aid ? await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(session.aid).first() : null;
    const accountEmail = String(account?.email || '').trim().toLowerCase();
    const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
    await seed(env, merchant, 'attendance', { entries: [] });
    await seed(env, merchant, 'team', { members: [], hours: {}, shifts: {} });
    for (let attempt = 0; attempt < 6; attempt++) {
      const [corrections, attendance, team] = await Promise.all([
        read(env, merchant, FEATURE, { items: [] }), read(env, merchant, 'attendance', {}), read(env, merchant, 'team', {}),
      ]);
      const item = corrections.data.items.find((candidate) => candidate.id === body.correctionId);
      if (!item) return json({ error: 'attendance-correction-not-found' }, 404);
      const member = (team.data.members || []).find((candidate) => String(candidate.id) === item.memberId);
      const sameEmployee = employee?.merchant === merchant && employee.staffId === item.staffId;
      const sameAccount = accountEmail && String(member?.email || '').trim().toLowerCase() === accountEmail;
      if (sameEmployee || actor.id === item.staffId || sameAccount) return json({ error: 'attendance-self-approval-forbidden' }, 403);
      if (item.status !== 'pending') return item.status === decision ? json({ ok: true, correction: item, replay: true }) : json({ error: 'attendance-already-decided' }, 409);
      if (decision === 'approved') {
        const entries = attendance.data.entries;
        const mine = entries.filter((entry) => entry && String(entry.staffId) === item.staffId);
        const field = item.action === 'clock-in' ? 'clockInOpId' : 'clockOutOpId';
        // A previously accepted operation must not be counted a second time.
        if (!mine.some((entry) => entry[field] === item.opId)) {
          const at = item.claimedTs;
          if (item.action === 'clock-in') {
            if (mine.some((entry) => !entry.outTs || entry.outTs > at)) return json({ error: 'attendance-correction-conflict' }, 409);
            entries.push({ id: crypto.randomUUID(), staffId: item.staffId, memberId: item.memberId, name: item.name, inTs: at, outTs: 0, clockInOpId: item.opId, correctionId: item.id });
          } else {
            const open = mine.filter((entry) => !entry.outTs && entry.inTs <= at);
            if (open.length !== 1) return json({ error: 'attendance-correction-conflict' }, 409);
            const target = open[0];
            const floor = Math.max(target.inTs, Number(target.pauseTs) || 0, ...(target.breaks || []).map((brk) => Number(brk.outTs) || 0));
            const overlaps = mine.some((other) => other !== target && other.inTs < at && (other.outTs || Infinity) > target.inTs);
            if (at < floor || overlaps) return json({ error: 'attendance-correction-conflict' }, 409);
            if (target.pauseTs) { target.breaks = target.breaks || []; target.breaks.push({ inTs: target.pauseTs, outTs: at }); target.pauseTs = 0; }
            target.outTs = at; target.clockOutOpId = item.opId; target.outCorrectionId = item.id;
            const span = { key: item.memberId, id: target.id, closed: true, start: target.inTs, end: at, breaks: (target.breaks || []).map((brk) => [brk.inTs, brk.outTs]) };
            const hours = hoursByDay([span], (ts) => businessDate(ts, cutoff, zone), (ts) => businessDate(ts, 0, zone))[item.memberId] || {};
            team.data.hours = team.data.hours || {};
            const bucket = team.data.hours[item.memberId] = team.data.hours[item.memberId] || {};
            for (const [day, worked] of Object.entries(hours)) bucket[day] = (Number(bucket[day]) || 0) + worked;
          }
        }
      }
      item.status = decision; item.decidedAt = Date.now(); item.actor = actor; item.decisionId = crypto.randomUUID();
      // First statement wins only if ALL revisions still match. Following writes
      // are gated by its unique result, inside the same atomic D1 batch.
      const text = JSON.stringify(corrections.data), next = corrections.rev + 1, now = Date.now();
      const guard = 'EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = ? AND rev = ? AND data = ?)';
      const result = await env.DB.batch([
        env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ? AND EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'attendance' AND rev = ?) AND EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'team' AND rev = ?)")
          .bind(text, next, now, merchant, FEATURE, corrections.rev, merchant, attendance.rev, merchant, team.rev),
        env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND ' + guard)
          .bind(JSON.stringify(attendance.data), attendance.rev + 1, now, merchant, 'attendance', merchant, FEATURE, next, text),
        env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND ' + guard)
          .bind(JSON.stringify(await codeDocument(env, merchant, 'team', team.data, true)), team.rev + 1, now, merchant, 'team', merchant, FEATURE, next, text),
      ]);
      if (Number(result[0].meta?.changes) > 0) return json({ ok: true, correction: item });
    }
  } catch (_) {}
  return json({ error: 'attendance-correction-write-failed' }, 503);
}
