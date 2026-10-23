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
 * Each test also runs with tools/dep-trace.cjs preloaded: a test that passes
 * leaves the list of repo files it touched in kiwi-test-deps.json (temp dir,
 * next to the durations), which is how `check.js --changed` knows what a change
 * can affect. KIWI_DEP_TRACE=0 turns the tracing off.
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

/* What each passing test read or imported (tools/dep-trace.cjs). */
const ROOT = path.resolve(__dirname, '..');
const TRACER = path.join(__dirname, 'dep-trace.cjs');
const DEPS = path.join(os.tmpdir(), 'kiwi-test-deps.json');
const tracing = process.env.KIWI_DEP_TRACE !== '0' && fs.existsSync(TRACER);
const traceDir = tracing ? fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-deps-')) : null;
const deps = {};
let traceN = 0;
const relOf = (f) => path.relative(ROOT, path.resolve(f)).split(path.sep).join('/');
function envFor(task) {
  if (!tracing) return { env: process.env, file: null };
  const file = path.join(traceDir, (traceN++) + '.txt');
  const req = '--require=' + (/\s/.test(TRACER) ? JSON.stringify(TRACER) : TRACER);
  return { file, env: Object.assign({}, process.env, {
    KIWI_DEP_TRACE: file, KIWI_DEP_ROOT: ROOT,
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' ' + req).trim(),
  }) };
}
function saveDeps() {
  if (!tracing) return;
  try { fs.rmSync(traceDir, { recursive: true, force: true }); } catch (_) {}
  if (!Object.keys(deps).length) return;
  let all = {};
  try { all = JSON.parse(fs.readFileSync(DEPS, 'utf8')) || {}; } catch (_) { all = {}; }
  Object.assign(all, deps);
  try { fs.writeFileSync(DEPS, JSON.stringify(all)); } catch (_) {}
}

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
  const trace = envFor(task);
  const child = cp.spawn(process.execPath, task.args, { cwd: task.cwd || undefined, env: trace.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, timeout);
  const began = Date.now();
  child.on('close', (status, signal) => {
    clearTimeout(timer);
    if (status === 0) times[nameOf(task)] = Date.now() - began;
    let cpuMs = null;
    if (trace.file) {
      try {
        const own = relOf(task.args[task.args.length - 1]);
        const lines = fs.readFileSync(trace.file, 'utf8').split('\n').filter(Boolean);
        cpuMs = lines.filter((l) => l.startsWith('#cpu ')).reduce((n, l) => n + (Number(l.slice(5)) || 0), 0);
        if (status === 0) {
          const list = new Set(lines.filter((l) => !l.startsWith('#')));
          list.delete(own);
          deps[own] = [...list].sort();
        }
      } catch (_) {}
    }
    running--; if (task.slow) runningSlow--;
    done++;
    results[task.key] = { status, signal, stdout, stderr, cpuMs, wallMs: Date.now() - began };
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
    saveDeps();
    console.log(`  ✓ ${done} test files run in parallel in ${Math.round((Date.now() - t0) / 1000)}s (${jobs} at a time, ${browserJobs} browsers)`);
  }
}

console.log(`  … running ${tasks.length} test files in parallel (${jobs} at a time, ${browserJobs} browsers)`);
pump();
