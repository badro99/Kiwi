#!/usr/bin/env node
/* Type check of the backend (functions/), as a ratchet.
 *
 * TypeScript reads the plain JavaScript in functions/ (checkJs, no build, no
 * runtime change) with tsconfig.functions.json. Each file's error count is
 * pinned in tools/typecheck-baseline.json and may only go down:
 *   · a file with more errors than its pin fails, and its new errors print;
 *   · a file not in the baseline is pinned at 0, so new code starts clean;
 *   · a file below its pin passes and says so; KIWI_UPDATE_TS_BASELINE=1
 *     lowers the pins (it never raises one).
 * `@ts-nocheck`, `@ts-ignore` and `@ts-expect-error` in functions/ are
 * counted and pinned the same way, or silencing a file would beat the ratchet.
 *
 * tsc comes from app/node_modules (a dev dependency of app/, like puppeteer);
 * without it the suite prints ○ skip, as the property suites do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(root, 'tools/typecheck-baseline.json');
const CONFIG = path.join(root, 'tsconfig.functions.json');
const tsc = path.join(root, 'app/node_modules/typescript/bin/tsc');
const update = process.env.KIWI_UPDATE_TS_BASELINE === '1';
let failed = 0;
const fail = (msg) => { failed++; console.log('  ✗ ' + msg); };

/* The config itself is part of the guarantee. */
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const o = config.compilerOptions || {};
if (!(o.allowJs && o.checkJs && o.noEmit)) fail('tsconfig.functions.json must keep allowJs, checkJs and noEmit on');
if (!(config.include || []).includes('functions/**/*.js')) fail('tsconfig.functions.json must include functions/**/*.js');

/* Escape hatches, counted per file. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const hatches = {};
for (const file of walk(path.join(root, 'functions'))) {
  const n = (fs.readFileSync(file, 'utf8').match(/@ts-(?:nocheck|ignore|expect-error)\b/g) || []).length;
  if (n) hatches[path.relative(root, file)] = n;
}

if (!fs.existsSync(tsc)) {
  console.log('  ○ skip typecheck-ratchet · TypeScript is not installed (npm --prefix app ci)');
  process.exit(failed ? 1 : 0);
}

const run = spawnSync(process.execPath, [tsc, '-p', CONFIG, '--pretty', 'false'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
if (run.error) { console.log('  ✗ tsc did not run: ' + run.error.message); process.exit(1); }
const lines = (run.stdout + run.stderr).split('\n');
const errors = {};
const byFile = {};
for (const line of lines) {
  const m = /^(.+?)\(\d+,\d+\): error (TS\d+): /.exec(line);
  if (!m) continue;
  const file = path.relative(root, path.resolve(root, m[1]));
  errors[file] = (errors[file] || 0) + 1;
  (byFile[file] = byFile[file] || []).push(line);
}
if (run.status !== 0 && !Object.keys(errors).length) {
  console.log('  ✗ tsc failed without reporting file errors:\n' + lines.slice(0, 20).join('\n'));
  process.exit(1);
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { errors: {}, hatches: {} };
const lowered = [];
function compare(kind, now, pinned, detail) {
  for (const file of new Set([...Object.keys(now), ...Object.keys(pinned)])) {
    const n = now[file] || 0, was = pinned[file] || 0;
    if (n > was) {
      fail(`${file}: ${n} ${kind}, pinned at ${was}`);
      if (detail && detail[file]) for (const l of detail[file].slice(0, 8)) console.log('      ' + l);
    } else if (n < was) lowered.push(`${file}: ${kind} ${was} → ${n}`);
  }
}
compare('type errors', errors, base.errors || {}, byFile);
compare('@ts escape hatches', hatches, base.hatches || {});

const total = Object.values(errors).reduce((a, b) => a + b, 0);
const pinnedTotal = Object.values(base.errors || {}).reduce((a, b) => a + b, 0);
if (lowered.length) {
  if (update && !failed) {
    const next = { note: base.note, errors: {}, hatches: {} };
    for (const [f, n] of Object.entries(errors).sort()) if (n) next.errors[f] = Math.min(n, (base.errors || {})[f] ?? n);
    for (const [f, n] of Object.entries(hatches).sort()) if (n) next.hatches[f] = Math.min(n, (base.hatches || {})[f] ?? n);
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`  ✓ baseline lowered: ${lowered.join(' · ')}`);
  } else {
    console.log(`  ! below the pin, lower it with KIWI_UPDATE_TS_BASELINE=1: ${lowered.join(' · ')}`);
  }
}
if (failed) {
  console.log(`typecheck-ratchet: ${failed} file(s) above their pin. Fix the new errors; never raise a pin.`);
  process.exit(1);
}
console.log(`✓ typecheck-ratchet · ${total} type errors in ${Object.keys(errors).length} files (pinned ${pinnedTotal}), none above its pin`);
