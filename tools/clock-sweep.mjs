#!/usr/bin/env node
/* clock-sweep · run the fast tier at the hours where two clocks disagree.
 *
 *   node tools/clock-sweep.mjs            # the six risky hours below, today
 *   node tools/clock-sweep.mjs 23:30 4:30 # chosen UTC times, today
 *
 * Several suites passed by day and failed by night: a test computed « today »
 * with this machine's clock (Paris, or Node's out-of-date Morocco data at +01)
 * while the code under test used the store's (Casablanca, UTC+0 since
 * 20 September 2026, on the till's 05:00 business day). This runs
 * `check.js --fast` with every node process, and every vm sandbox it creates,
 * pinned to each time through tools/clock-pin.mjs, and lists what fails at
 * each one. The browser tier is not covered: Chromium keeps its own clock.
 *
 * Not part of check.js (a few minutes per hour swept). Run it after touching
 * dates, business days or time zones. A failure that also appears at 14:00 is
 * not about the clock. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PIN = path.join(ROOT, 'tools', 'clock-pin.mjs');
const asked = process.argv.slice(2);
const times = asked.length ? asked : ['14:00', '22:15', '23:30', '0:30', '4:30', '5:10'];
const today = new Date();
let red = 0;
for (const hm of times) {
  const [h, m] = hm.split(':').map(Number);
  if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) { console.error('bad time ' + hm); process.exit(2); }
  /* Times after midnight UTC are taken on the next day, so the list reads as one night. */
  const day = h < 12 && hm !== '14:00' ? 1 : 0;
  const at = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + day, h, m);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check.js'), '--fast'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, KIWI_PIN_AT: String(at), NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${PIN}`.trim() },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /^\s+✗/.test(l));
  console.log(`${fails.length ? '✗' : '✓'} ${new Date(at).toISOString().slice(0, 16)}Z · ${fails.length} failure(s)`);
  fails.slice(0, 20).forEach((l) => console.log('    ' + l.trim().slice(0, 160)));
  if (fails.length) red++;
}
process.exit(red ? 1 : 0);
