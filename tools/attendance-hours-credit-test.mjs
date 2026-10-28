#!/usr/bin/env node
/* attendance-hours-credit-test · a clock-out never loses its worked hours.
 *
 * functions/api/employee/_attendance.js closes the shift in the `attendance`
 * document, then credits the worked hours to the `team` document in a second
 * compare-and-swap write. The second result was ignored: when it failed the
 * route still answered ok, and the phone's retry (same opId) was taken as a
 * replay that credited nothing. The hours were gone without a word.
 *
 * Now a clock-out whose hours could not be credited answers 503 (the phone's
 * queue keeps the punch and retries it), the retry credits the hours, and a
 * credited shift is never credited twice (a lost answer replayed). Runs the
 * real attendance module over an in-memory document store whose team write
 * can be made to fail. The attendance code is a generated test value. */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { handleAttendance } from '../functions/api/employee/_attendance.js';

let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const docs = new Map();
let failTeamWrites = 0;
const clone = (v) => JSON.parse(JSON.stringify(v));
async function readDoc(_env, _merchant, feature, fallback) {
  const row = docs.get(feature);
  return row ? { data: clone(row.data), rev: row.rev } : { data: clone(fallback), rev: 0 };
}
async function mutateDoc(env, merchant, feature, fallback, change) {
  const row = await readDoc(env, merchant, feature, fallback);
  const next = change(row.data);
  if (!next) return null;
  if (feature === 'team' && failTeamWrites > 0) { failTeamWrites--; return null; }
  docs.set(feature, { data: clone(next), rev: row.rev + 1 });
  return next;
}
const code = String(randomInt(100000, 1000000));
docs.set('attendance-code', { data: { code, createdTs: Date.now() - 1000, expiresTs: Date.now() + 600000 }, rev: 1 });
docs.set('team', { data: { members: [{ id: 'member-a', firstName: 'Test' }], hours: {}, shifts: {} }, rev: 1 });

const store = {
  env: {}, merchant: 'hours-credit-fixture', zone: 'Africa/Casablanca', cutoff: 5, readDoc, mutateDoc,
  memberFor: () => ({ id: 'member-a' }),
  // One fixed day: the module credits whatever the pay arithmetic returns.
  completedHours: (entry) => ({ '2026-10-27': (entry.outTs - entry.inTs) / 3600000 }),
  safeProgress: (raw) => ({ lifetimeXP: Number(raw && raw.lifetimeXP) || 0, shifts: Number(raw && raw.shifts) || 0,
    records: { bestNight: 0, streak: 0, bestSpeed: null } }),
};
const actor = { role: 'employee', identity: { session: {}, pin: { id: 'staff-a', name: 'Test', role: 'staff' } } };
async function punch(action, opId) {
  const res = await handleAttendance({ actor, store, action, request: new Request('https://kiwi.test/api/employee'),
    body: { action, attendanceCode: code, opId } });
  return { status: res.status, body: await res.json() };
}
const credited = () => Number(docs.get('team').data.hours?.['member-a']?.['2026-10-27'] || 0);
const entries = () => docs.get('attendance').data.entries;

console.log('attendance-hours-credit-test');
assert.equal((await punch('clock-in', 'op-in-1')).status, 200);
const open = entries()[0];
open.inTs -= 2 * 3600000; // two hours on the clock
docs.get('attendance').data.entries[0] = open;

failTeamWrites = 1; // the team CAS write gives up once (mutateDoc returns null)
const lost = await punch('clock-out', 'op-out-1');
ok(lost.status === 503 && lost.body.ok !== true, 'a clock-out whose hours were not credited is not answered ok');
ok(entries()[0].outTs > 0 && credited() === 0, 'the shift is closed and nothing is credited yet');

const retry = await punch('clock-out', 'op-out-1');
ok(retry.status === 200 && retry.body.ok === true, 'the phone retry (same opId) is accepted');
const hours = credited();
ok(Math.abs(hours - 2) < 0.01, 'and the retry credits the worked hours');

const again = await punch('clock-out', 'op-out-1');
ok(again.status === 200 && credited() === hours, 'a further replay credits nothing twice');

// A credited clock-out whose answer was lost: the replay must not pay it again.
assert.equal((await punch('clock-in', 'op-in-2')).status, 200);
const second = entries().find((e) => !e.outTs);
second.inTs -= 3600000;
docs.get('attendance').data.entries = entries().map((e) => (e.id === second.id ? second : e));
const done = await punch('clock-out', 'op-out-2');
ok(done.status === 200 && Math.abs(credited() - hours - 1) < 0.01, 'a clean clock-out credits its hour once');
const replayed = await punch('clock-out', 'op-out-2');
ok(replayed.status === 200 && Math.abs(credited() - hours - 1) < 0.01, 'its replay after a lost answer credits nothing more');

// A crowded fortnight of other credits must not push a fresh mark out.
const team = docs.get('team').data;
const crowd = {}; for (let i = 0; i < 800; i++) crowd['other-' + i] = Date.now() + i;
team.hoursCredited = { ...crowd, ...team.hoursCredited };
assert.equal((await punch('clock-in', 'op-in-3')).status, 200);
const third = entries().find((e) => !e.outTs);
third.inTs -= 3600000;
docs.get('attendance').data.entries = entries().map((e) => (e.id === third.id ? third : e));
const before3 = credited();
assert.equal((await punch('clock-out', 'op-out-3')).status, 200);
ok(third.id in docs.get('team').data.hoursCredited, 'a fresh mark is kept however many shifts were credited after it');
// The attendance write to 'done' lost: the entry stays pending, the team mark protects it.
docs.get('attendance').data.entries = entries().map((e) => (e.id === third.id ? { ...e, hoursCredit: 'pending' } : e));
const replay3 = await punch('clock-out', 'op-out-3');
ok(replay3.status === 200 && Math.abs(credited() - before3 - 1) < 0.01, 'a pending shift replayed is still paid once');
const old = Date.now() - 4 * 86400000;
docs.get('team').data.hoursCredited = { ...docs.get('team').data.hoursCredited, 'ancient-shift': old };
assert.equal((await punch('clock-in', 'op-in-4')).status, 200);
const fourth = entries().find((e) => !e.outTs); fourth.inTs -= 600000;
docs.get('attendance').data.entries = entries().map((e) => (e.id === fourth.id ? fourth : e));
assert.equal((await punch('clock-out', 'op-out-4')).status, 200);
ok(!('ancient-shift' in docs.get('team').data.hoursCredited), 'marks older than three days are dropped (no phone replays them)');
// The third shift, still 'pending', replayed after its mark was pruned (outTs moved
// five days back): the server must not pay it again on its own.
const stale = Date.now() - 5 * 86400000;
docs.get('attendance').data.entries = entries().map((e) => (e.id === third.id
  ? { ...e, inTs: stale - 3600000, outTs: stale, hoursCredit: 'pending' } : e));
const marks = { ...docs.get('team').data.hoursCredited }; delete marks[third.id];
docs.get('team').data.hoursCredited = marks;
const beforeStale = credited();
const staleReplay = await punch('clock-out', 'op-out-3');
ok(staleReplay.status === 200 && credited() === beforeStale, 'a pending shift replayed after its mark expired is not paid again automatically');
console.log(`✓ attendance-hours-credit-test · ${checks} checks`);
