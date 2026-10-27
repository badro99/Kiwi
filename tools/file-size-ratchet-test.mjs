#!/usr/bin/env node
/* file-size-ratchet-test · the very large files stop growing.
 *
 *   node tools/file-size-ratchet-test.mjs
 *   KIWI_UPDATE_SIZE_BASELINE=1 node tools/file-size-ratchet-test.mjs   (lower the pins after a split)
 *
 * assets/pages-pro.js was 13 768 lines when CLAUDE.md first warned about it
 * and 20 938 on 2026-10-21; kiwi-caisse.html is 24 915, and the dashboard
 * loads 141 scripts (89 when that warning was written). Every feature added
 * to one of these files makes the next change slower and lets an edit break
 * an unrelated screen. Splitting them is a staged migration; this suite is
 * the stage before it: they stop getting bigger.
 *
 *   · a file pinned in tools/file-size-baseline.json may grow by at most
 *     SLACK lines over its pin: a bug fix fits, a new feature belongs in a
 *     new file;
 *   · any other assets/*.js, functions/**.js or root *.html file stays
 *     under CAP lines (2 500 since 2026-10-27, was 5 000: the files split
 *     out of the big controllers are all under it, and a new one should be);
 *   · tools/global-ownership-test.mjs pins the second number that makes a
 *     big file risky: how many other files' globals it reads;
 *   · the three shells may load at most SCRIPT_SLACK more <script src> than
 *     pinned;
 *   · each assets/**.css file may carry at most IMPORTANT_SLACK more
 *     `!important` than pinned, a new one at most IMPORTANT_CAP. There were
 *     573 on 2026-08-20, 705 a month later and 1 182 on 2026-10-21: every
 *     skin layer wins by force over the one below, which is why a correct CSS
 *     fix so often does nothing. New rules win by cascade (a more specific
 *     selector, a later layer), not by force.
 *
 * A pin only ever goes down. When a split makes a file smaller, run with
 * KIWI_UPDATE_SIZE_BASELINE=1 to lower it; never raise a pin to make a red
 * run go away. */
import fs from 'node:fs';
import { checkInterfaces } from './controller-interfaces.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'tools', 'file-size-baseline.json');
const CAP = 2500, SLACK = 200, SCRIPT_SLACK = 3, IMPORTANT_SLACK = 10, IMPORTANT_CAP = 25;
const SHELLS = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html'];
const update = process.env.KIWI_UPDATE_SIZE_BASELINE === '1';
const pinFiles = process.argv.slice(2);
const updateFile = rel => update && (!pinFiles.length || pinFiles.includes(rel));

const lines = (rel) => { const s = fs.readFileSync(path.join(ROOT, rel), 'utf8'); return s.length ? s.split('\n').length - (s.endsWith('\n') ? 1 : 0) : 0; };
const scripts = (rel) => (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/<script\b[^>]*\bsrc=/gi) || []).length;
const walk = (dir, keep) => {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') out.push(...walk(rel, keep)); }
    else if (keep(rel)) out.push(rel);
  }
  return out;
};
/* Our own code only: vendored and minified bundles are not ours to split. */
const ours = (rel) => /\.js$/.test(rel) && !/\.min\.js$/.test(rel) && !/ 2\./.test(rel);
const files = [
  ...walk('assets', ours),
  ...walk('functions', ours),
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !/ 2\./.test(f)),
].sort();

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const fail = checkInterfaces(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8'),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/controller-interfaces.json'), 'utf8'))), lowered = [];
let checks = 0;
for (const rel of files) {
  const n = lines(rel);
  const pin = base.lines[rel];
  checks++;
  if (pin == null) {
    if (updateFile(rel) && pinFiles.includes(rel) && n <= CAP) { base.lines[rel] = n; lowered.push(`${rel} newly pinned at ${n}`); }
    if (n > CAP) fail.push(`${rel}: ${n} lines, over the ${CAP} cap for a file that is not pinned. Put the new code in its own file.`);
  } else if (n > pin + SLACK) {
    fail.push(`${rel}: ${n} lines, ${n - pin} over its pin of ${pin} (slack ${SLACK}). Put the new code in its own file.`);
  } else if (n < pin && updateFile(rel)) {
    base.lines[rel] = n; lowered.push(`${rel} ${pin} → ${n}`);
  }
}
for (const rel of Object.keys(base.lines)) if (!files.includes(rel)) { if (updateFile(rel)) { delete base.lines[rel]; lowered.push(`${rel} removed`); } }
for (const rel of SHELLS) {
  const n = scripts(rel), pin = base.scripts[rel];
  checks++;
  if (pin == null) fail.push(`${rel}: no script pin in tools/file-size-baseline.json`);
  else if (n > pin + SCRIPT_SLACK) fail.push(`${rel}: loads ${n} <script src>, ${n - pin} over its pin of ${pin} (slack ${SCRIPT_SLACK}). Load the new code lazily, or bundle it with a neighbour.`);
  else if (n < pin && updateFile(rel)) { base.scripts[rel] = n; lowered.push(`${rel} scripts ${pin} → ${n}`); }
}
const css = walk('assets', (rel) => rel.endsWith('.css') && !/ 2\./.test(rel)).sort();
base.important = base.important || {};
for (const rel of css) {
  const n = (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/!important/g) || []).length;
  const pin = base.important[rel];
  checks++;
  if (pin == null) { if (n > IMPORTANT_CAP) fail.push(`${rel}: ${n} !important, over the ${IMPORTANT_CAP} cap for a stylesheet that is not pinned. Win by cascade, not by force.`); }
  else if (n > pin + IMPORTANT_SLACK) fail.push(`${rel}: ${n} !important, ${n - pin} over its pin of ${pin} (slack ${IMPORTANT_SLACK}). Win by cascade, not by force.`);
  else if (n < pin && updateFile(rel)) { base.important[rel] = n; lowered.push(`${rel} !important ${pin} → ${n}`); }
}
for (const rel of Object.keys(base.important)) if (!css.includes(rel) && updateFile(rel)) { delete base.important[rel]; lowered.push(`${rel} removed`); }
if (update && lowered.length) { fs.writeFileSync(BASE, JSON.stringify(base, null, 2) + '\n'); console.log('  lowered: ' + lowered.join(' · ')); }
if (fail.length) {
  console.error('✗ file-size-ratchet-test\n  ' + fail.join('\n  '));
  process.exit(1);
}
const pinned = Object.keys(base.lines).length;
console.log(`✓ file-size-ratchet-test · ${checks} checks, ${pinned} files and ${Object.keys(base.important).length} stylesheets pinned, none grew past its pin`);
