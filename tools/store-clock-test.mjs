#!/usr/bin/env node
/* store-clock-test · no shipped code assumes Morocco is UTC+1.
 *
 * Morocco moved from UTC+1 to permanent UTC+0 in 2026 (owner, 2026-10-13).
 * Order-queue days, the restaurant week and demo references used a fixed
 * "+ 3600000"; the dashboard printed "GMT+1" beside the device's own clock.
 *
 * Every assertion below holds whatever time-zone data the machine carries: it
 * checks that a boundary is civil midnight IN the zone, as Intl reads it, never
 * a hard-coded offset. (Node's bundled tzdata can lag Chrome and Cloudflare's
 * ICU on Morocco; a fixed-offset expectation would pass on one and fail on the
 * other.)
 *   node tools/store-clock-test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startOfDay, startOfWeek, nextOrderNumber } from '../functions/api/order/_lib.js';
import { demoReference } from '../functions/api/_demo-requests.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

const civil = (t, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(t).map((p) => [p.type, p.value]));
const ymd = (t, zone) => { const c = civil(t, zone); return `${c.year}-${c.month}-${c.day}`; };

console.log('store-clock-test');

/* 1 · Day and week boundaries are civil midnight in the store's zone. */
const ZONES = ['Africa/Casablanca', 'Europe/Paris', 'UTC', 'America/New_York'];
const INSTANTS = [
  '2026-08-03T12:00:00Z', '2026-09-22T23:30:00Z', '2026-09-23T00:30:00Z', '2026-10-13T23:15:00Z',
  '2026-10-14T00:30:00Z', '2026-10-25T01:30:00Z', '2027-02-14T23:59:00Z', '2027-03-28T02:30:00Z',
].map(Date.parse);
let dayBad = [], weekBad = [];
for (const zone of ZONES) for (const t of INSTANTS) {
  const d = startOfDay(t, zone), w = startOfWeek(t, zone);
  const cd = civil(d, zone), cw = civil(w, zone);
  if (!(cd.hour === '00' && cd.minute === '00' && cd.second === '00' && ymd(d, zone) === ymd(t, zone) && d <= t))
    dayBad.push(`${zone} ${new Date(t).toISOString()} → ${new Date(d).toISOString()}`);
  if (!(cw.hour === '00' && cw.minute === '00' && cw.weekday === 'Mon' && w <= d && d - w < 7 * 86400000 + 7200000))
    weekBad.push(`${zone} ${new Date(t).toISOString()} → ${new Date(w).toISOString()}`);
}
ok(!dayBad.length, `startOfDay is civil midnight of the same day in ${ZONES.length} zones × ${INSTANTS.length} instants${dayBad.length ? ': ' + dayBad.slice(0, 3).join('; ') : ''}`);
ok(!weekBad.length, `startOfWeek is the civil Monday 00:00 at or before that day${weekBad.length ? ': ' + weekBad.slice(0, 3).join('; ') : ''}`);
ok(startOfDay(Date.parse('2026-10-14T12:00:00Z')) === startOfDay(Date.parse('2026-10-14T12:00:00Z'), 'Africa/Casablanca'),
  'with no zone, the boundary is Africa/Casablanca (the historical default)');

/* 2 · The demo reference carries the Casablanca civil date. */
for (const iso of ['2026-10-25T23:30:00Z', '2026-07-31T23:30:00Z', '2027-01-01T00:10:00Z']) {
  const t = Date.parse(iso), c = civil(t, 'Africa/Casablanca');
  ok(demoReference(t).startsWith(`D-${c.day}${c.month}-`), `demoReference(${iso}) is dated ${c.day}/${c.month}, Casablanca's civil date`);
}

/* 3 · A week whose Monday boundary moved keeps its counter. */
{
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const prepare = (q) => { let a = []; const st = {
    bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return st; },
    first() { const r = db.prepare(q).get(...a); return r === undefined ? null : r; },
    all() { return { results: db.prepare(q).all(...a) }; },
    run() { const r = db.prepare(q).run(...a); return { success: true, meta: { changes: r.changes } }; },
  }; return st; };
  const env = { DB: { prepare } };
  const now = Date.parse('2026-10-14T12:00:00Z');
  const period = startOfWeek(now, 'Africa/Casablanca');
  db.exec('CREATE TABLE IF NOT EXISTS order_sequences (merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period))');
  /* The same week under the old fixed +1 h key: numbers up to 56 handed out, the top ones since deleted. */
  db.prepare('INSERT INTO order_sequences (merchant, period, next_value, updated_ts) VALUES (?, ?, ?, ?)').run('clock-test', period - 3600000, 57, now);
  db.prepare('INSERT INTO order_sequences (merchant, period, next_value, updated_ts) VALUES (?, ?, ?, ?)').run('clock-test', period - 7 * 86400000, 300, now);
  const n = await nextOrderNumber(env, 'clock-test', now);
  ok(n === 57, `the week's counter continues across a moved boundary (got ${n}, want 57), and last week's 300 does not leak in`);
  const fresh = await nextOrderNumber(env, 'clock-test-2', now);
  ok(fresh === 1, `a store with no sequence this week starts at 1 (got ${fresh})`);
}

/* 4 · No fixed Morocco offset left in the code, no "GMT+1" in the UI. */
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/\+\s*3600000|-\s*3600000/.test(code('functions/api/order/_lib.js').replace(/3 \* 3600000/g, '')), 'order/_lib.js has no fixed ±1 h day arithmetic');
ok(!/3600000/.test(code('functions/api/_demo-requests.js')), '_demo-requests.js has no fixed +1 h');
for (const p of ['dashboard.html', 'assets/polish.js', 'assets/venues.js'])
  ok(!/GMT\s*\+\s*1|UTC\s*\+\s*1/.test(read(p)), `${p} prints no "GMT+1" beside a device clock`);

console.log(`\n${fail ? '✗' : '✓'} store-clock-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
