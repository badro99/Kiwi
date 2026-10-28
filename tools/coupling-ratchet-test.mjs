#!/usr/bin/env node
/* tools/coupling-ratchet-test.mjs · the browser code stops getting more tangled.
 *
 * The size ratchet (file-size-ratchet-test.mjs) stops files from growing, but a
 * file split in three that still reads the same thirty globals is as hard to
 * change as before (thirteenth blind rating, bigfiles#2: "size ceilings do not
 * measure coupling"). This suite measures the coupling itself:
 *
 *   · per file, the number of DISTINCT globals it reads or writes that another
 *     file defines (window.X / globalThis.X, and bare Kiwi* / __kiwi* names);
 *   · the set of globals that more than one file assigns: shared mutable
 *     interface, the costliest kind.
 *
 * tools/coupling-baseline.json pins both. A file's count only goes down; a file
 * not in the list (a new file) may touch at most NEW_FILE_CAP foreign globals;
 * a global may not gain a second writer. After a split or a clean-up:
 *   KIWI_UPDATE_COUPLING_BASELINE=1 node tools/coupling-ratchet-test.mjs   (lowers only)
 *   KIWI_SEED_COUPLING_BASELINE=1   node tools/coupling-ratchet-test.mjs   (first write)
 * Never raise a pin to make a red go away: route the new need through an
 * existing interface, or pass the dependency in.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tools/coupling-baseline.json');
const NEW_FILE_CAP = 12;
const SKIP_DIR = /^(vendor|icons|fonts|img|images|landing)$/;

function files() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(rel); }
      else if (/\.m?js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(rel);
    }
  })('assets');
  return out.sort();
}

/* Comments say a lot about globals; they do not couple anything. Strings are
   kept: window['X'] is rare and a template that names a global usually uses it. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

export function scan(source) {
  const s = stripComments(source);
  const writes = new Set(), uses = new Set();
  for (const m of s.matchAll(/\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\|\|=|\?\?=)/g)) writes.add(m[1]);
  for (const m of s.matchAll(/\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)/g)) uses.add(m[1]);
  for (const m of s.matchAll(/(?<![.\w$'"`])((?:Kiwi[A-Z]|__kiwi)[\w$]*)/g)) uses.add(m[1]);
  return { writes, uses };
}

/* The counter itself, on a probe. */
{
  const p = scan(`
    // window.Commented = 1
    window.KiwiA = { x: 1 };
    const y = window.KiwiB && KiwiC.go(window.KiwiB);
    if (window.KiwiA === 2) self.__kiwiD ||= {};
    obj.KiwiE = 3; 'KiwiF';
  `);
  assert.deepEqual([...p.writes].sort(), ['KiwiA', '__kiwiD']);
  assert.deepEqual([...p.uses].sort(), ['KiwiA', 'KiwiB', 'KiwiC', '__kiwiD']);
}

const list = files();
const scans = new Map(list.map((f) => [f, scan(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
const writers = new Map();
for (const [f, { writes }] of scans) for (const g of writes) {
  if (!writers.has(g)) writers.set(g, new Set());
  writers.get(g).add(f);
}
const counts = {};
for (const [f, { uses }] of scans) {
  counts[f] = [...uses].filter((g) => writers.has(g) && !writers.get(g).has(f)).length;
}
const multi = [...writers].filter(([, set]) => set.size > 1).map(([g]) => g).sort();

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
const seed = process.env.KIWI_SEED_COUPLING_BASELINE === '1';
if (seed || process.env.KIWI_UPDATE_COUPLING_BASELINE === '1') {
  assert.ok(seed || base, 'no baseline yet: seed it first');
  const pins = {};
  for (const [f, c] of Object.entries(counts)) {
    pins[f] = seed ? c : (base.files[f] != null ? Math.min(base.files[f], c) : undefined);
    if (pins[f] === undefined) delete pins[f];
  }
  const out = {
    note: 'Per file: distinct globals another file defines that this file reads or writes. multiWriter: globals assigned by more than one file. Pins only go down (tools/coupling-ratchet-test.mjs).',
    newFileCap: NEW_FILE_CAP,
    files: pins,
    multiWriter: seed ? multi : base.multiWriter.filter((g) => multi.includes(g)),
  };
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`coupling baseline written: ${Object.keys(pins).length} files, ${Object.values(pins).reduce((a, b) => a + b, 0)} foreign globals, ${out.multiWriter.length} shared writers`);
  process.exit(0);
}
assert.ok(base, 'tools/coupling-baseline.json is missing');

const problems = [];
for (const [f, c] of Object.entries(counts)) {
  const pin = base.files[f];
  if (pin == null) { if (c > NEW_FILE_CAP) problems.push(`${f}: touches ${c} globals other files define (a new file may touch ${NEW_FILE_CAP}). Pass dependencies in, or go through one existing interface`); }
  else if (c > pin) problems.push(`${f}: touches ${c} foreign globals, pinned at ${pin}. Coupling only goes down`);
}
for (const g of multi) if (!base.multiWriter.includes(g)) problems.push(`window.${g} now has ${writers.get(g).size} writers (${[...writers.get(g)].join(', ')}). One owner per global`);
let lowered = 0;
for (const [f, pin] of Object.entries(base.files)) if (counts[f] != null && counts[f] < pin) lowered++;

if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n✗ coupling-ratchet · ${problems.length} problem(s)`);
  process.exit(1);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`✓ coupling-ratchet · ${list.length} files, ${total} foreign-global references, ${multi.length} globals with several writers; none grew` + (lowered ? ` (${lowered} file(s) under their pin: KIWI_UPDATE_COUPLING_BASELINE=1 lowers them)` : ''));
