'use strict';
/* Kiwi · check-pool.js — runs the gate's child tests side by side.
 *
 *   node tools/check-pool.js <records.jsonl> <results.json> <jobs> <browserJobs>
 *
 * check.js runs ~100 test files one after another; most of its wall time is a
 * single core busy while the others wait. check-guard.js (prefetch) records
 * every child test check.js is about to run, hands the list to this pool, then
 * replays check.js against the results: same order, same output, same verdict.
 * Only a PASS is reused. A test that failed here (load, a race with a sibling,
 * a real bug) runs again, alone, at its usual place in check.js, so a red gate
 * still means red when nothing else is running.
 *
 * Browser suites (they launch Chromium) are capped separately and start first:
 * they are the long ones, and too many browsers at once time out on their own.
 * Zero dependencies, like check.js. */
const cp = require('child_process');
const fs = require('fs');
const { isSlow, DEFAULT_TIMEOUT_MS } = require('./check-guard');

const [recordsFile, resultsFile, jobsArg, browserArg] = process.argv.slice(2);
const jobs = Math.max(1, Number(jobsArg) || 4);
const browserJobs = Math.max(1, Math.min(jobs, Number(browserArg) || 3));
const timeout = Number(process.env.KIWI_CHECK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

const seen = new Set();
const tasks = [];
for (const line of fs.readFileSync(recordsFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let rec; try { rec = JSON.parse(line); } catch (_) { continue; }
  if (seen.has(rec.key)) continue;
  seen.add(rec.key);
  rec.slow = isSlow(rec.args[rec.args.length - 1]);
  tasks.push(rec);
}
/* Longest first: the last long test to start decides when the pool ends.
 * Durations from the previous run on this machine (a cache in the temp dir,
 * never in the repo); a test never timed counts as long when it drives a
 * browser, short otherwise. */
const os = require('os');
const path = require('path');
const TIMES = path.join(os.tmpdir(), 'kiwi-check-durations.json');
let times = {};
try { times = JSON.parse(fs.readFileSync(TIMES, 'utf8')) || {}; } catch (_) { times = {}; }
const nameOf = (t) => String(t.args[t.args.length - 1]).replace(/^.*\//, '');
const guess = (t) => (times[nameOf(t)] != null ? times[nameOf(t)] : (t.slow ? 60000 : 2000));
tasks.sort((a, b) => guess(b) - guess(a));

const results = {};
let running = 0, runningSlow = 0, done = 0;
const t0 = Date.now();

function next() {
  if (!tasks.length) return null;
  const i = tasks.findIndex((t) => !t.slow || runningSlow < browserJobs);
  return i < 0 ? null : tasks.splice(i, 1)[0];
}

function start(task) {
  running++; if (task.slow) runningSlow++;
  const child = cp.spawn(process.execPath, task.args, { cwd: task.cwd || undefined, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, timeout);
  const began = Date.now();
  child.on('close', (status, signal) => {
    clearTimeout(timer);
    if (status === 0) times[nameOf(task)] = Date.now() - began;
    running--; if (task.slow) runningSlow--;
    done++;
    results[task.key] = { status, signal, stdout, stderr };
    if (status !== 0) {
      const name = String(task.args[task.args.length - 1]).replace(/^.*\//, '');
      console.log(`  … ${name} did not pass in parallel (exit ${status === null ? signal : status}), it will run again alone`);
    }
    pump();
  });
}

function pump() {
  while (running < jobs) {
    const task = next();
    if (!task) break;
    start(task);
  }
  if (!running && !tasks.length) {
    fs.writeFileSync(resultsFile, JSON.stringify(results));
    try { fs.writeFileSync(TIMES, JSON.stringify(times)); } catch (_) {}
    console.log(`  ✓ ${done} test files run in parallel in ${Math.round((Date.now() - t0) / 1000)}s (${jobs} at a time, ${browserJobs} browsers)`);
  }
}

console.log(`  … running ${tasks.length} test files in parallel (${jobs} at a time, ${browserJobs} browsers)`);
pump();
