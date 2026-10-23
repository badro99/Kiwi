#!/usr/bin/env node
/* tools/global-ownership-test.mjs · who owns each window.Kiwi* global, and how
 * far the very large files reach into the others.
 *
 * The dashboard loads about 160 classic scripts into one global namespace, so a
 * module's real interface is the set of window.Kiwi* names it defines and reads.
 * file-size-ratchet-test.mjs stops the large files from growing in lines; it
 * cannot see them growing in coupling. This suite holds three rules, no network:
 *
 *   1. ownership: a Kiwi* global is defined by one file. A second definer is a
 *      silent override (last script wins); the few deliberate ones are listed
 *      in SHARED with the reason.
 *   2. no new dangling read: a Kiwi* name read somewhere but defined nowhere
 *      (not in assets/, the native shell in app/src/, nor a page's inline
 *      script) is a dead branch or a typo that reads undefined forever. The
 *      ones that exist today are pinned in tools/global-ownership-baseline.json
 *      and that list only shrinks.
 *   3. coupling: every file pinned by the size ratchet has a pinned count of
 *      other files' globals it reads. It may not grow past its pin plus a small
 *      slack (a bug fix fits, a new dependency web does not); after a split,
 *      KIWI_UPDATE_OWNERSHIP_BASELINE=1 lowers the pins. Never raise one.
 *
 * `node tools/global-ownership-test.mjs` (KIWI_ROOT to point it at a copy). */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLACK = 2;
/* Two definers on purpose. Anything else defined twice is a defect. */
const SHARED = {
  KiwiLens: 'assets/liquid-lens.js stands down (if (!KIT)) when assets/kit/lens.js owns the lens',
  KiwiIcon: 'the OrderPro subset (material-icons.ordering.js) loads the full runtime on a miss and hands over',
  KiwiNativeHostAction: 'app/src/native-workspace.js takes the native host bridge over from native-shell.js while a workspace screen is up',
  KiwiNativeHostRequestState: 'same handover as KiwiNativeHostAction',
};
const NAME = /\bKiwi[A-Z][A-Za-z0-9_]*\b/g;

/* ── the parts, exported to the self-test below ─────────────────────────── */
export function definitions(source) {
  const out = new Map();
  const add = (name, kind) => { if (!out.has(name) || kind === 'own') out.set(name, kind); };
  // host.KiwiX = …, whatever the IIFE called its global (window, w, win, root, host…).
  for (const m of source.matchAll(/(?:^|[^\w.$])([A-Za-z_$][\w$]*)\.(Kiwi[A-Z]\w*)\s*=(?!=)\s*([^;\n]{0,80})/gm)) {
    if (m[1] === 'this' || /^Kiwi/.test(m[1])) continue;
    const rhs = m[3].trim();
    // X = X || {...} and X = Object.assign(X || {}, …) extend a namespace someone else may own.
    const merge = new RegExp('^(?:Object\\.assign\\()?\\(?\\s*[A-Za-z_$][\\w$]*\\.' + m[2] + '\\s*(?:\\|\\||\\?\\?|,)').test(rhs);
    add(m[2], merge ? 'merge' : 'own');
  }
  for (const m of source.matchAll(/\[\s*['"](Kiwi[A-Z]\w*)['"]\s*\]\s*=(?!=)/g)) add(m[1], 'own');
  for (const m of source.matchAll(/Object\.defineProperty\(\s*(?:window|globalThis)\s*,\s*['"](Kiwi[A-Z]\w*)['"]/g)) add(m[1], 'own');
  // Top-level declarations in a classic script are globals too.
  for (const m of source.matchAll(/^(?:var|function|class)\s+(Kiwi[A-Z]\w*)\b/gm)) add(m[1], 'own');
  return out;
}
export function reads(source) {
  const own = definitions(source);
  const found = new Set();
  for (const m of source.matchAll(NAME)) if (!own.has(m[0])) found.add(m[0]);
  return found;
}

function walk(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'graphify-out', '.kiwi', 'vendor'].includes(e.name) || e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, out); else if (keep(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');

export function inventory(root = ROOT) {
  const files = walk(path.join(root, 'assets'), (n) => /\.js$/.test(n) && !/\.min\.js$/.test(n))
    .concat(walk(path.join(root, 'app/src'), (n) => /\.js$/.test(n)));
  const pages = fs.readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n));
  const sources = new Map();
  for (const f of files) sources.set(rel(f), fs.readFileSync(f, 'utf8'));
  for (const p of pages) sources.set(rel(p), inlineScripts(fs.readFileSync(p, 'utf8')));
  // The native shell also injects names from Swift/Kotlin; they count as defined.
  const native = walk(path.join(root, 'app'), (n) => /\.(swift|kt|java)$/.test(n)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const owners = new Map(), merges = new Map(), readers = new Map();
  for (const [file, src] of sources) {
    for (const [name, kind] of definitions(src)) {
      const map = kind === 'own' ? owners : merges;
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(file);
    }
    for (const name of reads(src)) {
      if (!readers.has(name)) readers.set(name, new Set());
      readers.get(name).add(file);
    }
  }
  const nativeNames = new Set([...native.matchAll(NAME)].map((m) => m[0]));
  return { sources, owners, merges, readers, nativeNames };
}

/* ── self-test: the parser sees what it must, and the rules bite ───────── */
{
  const d = definitions("window.KiwiA = {};\nwindow.KiwiB = window.KiwiB || {};\nvar KiwiC = 1;\nif (window.KiwiD == null) x();\n  w.KiwiE = { a: 1 };\nroot.KiwiF = Object.assign(root.KiwiF || {}, { b: 2 });\nKiwiG.KiwiH = 1;\n");
  assert.deepEqual([...d], [['KiwiA', 'own'], ['KiwiB', 'merge'], ['KiwiE', 'own'], ['KiwiF', 'merge'], ['KiwiC', 'own']]);
  assert.deepEqual([...reads('window.KiwiA = 1; KiwiZ.go(); window.KiwiY && 1;')].sort(), ['KiwiY', 'KiwiZ']);
}

/* ── the rules on the real tree ────────────────────────────────────────── */
const inv = inventory();
const failures = [];
const basePath = path.join(ROOT, 'tools/global-ownership-baseline.json');
const base = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : { dangling: [], coupling: {} };

// 1 · one owner per global
for (const [name, files] of inv.owners) {
  if (files.size > 1 && !SHARED[name]) failures.push(`${name} is defined by ${files.size} files (${[...files].join(', ')}): the last script loaded silently wins`);
}
for (const name of Object.keys(SHARED)) assert(inv.owners.has(name), `SHARED lists ${name}, which nothing defines any more: drop it`);

// 2 · dangling reads
const defined = (name) => inv.owners.has(name) || inv.merges.has(name) || inv.nativeNames.has(name);
const dangling = [...inv.readers.keys()].filter((n) => !defined(n)).sort();
const UPDATE = process.env.KIWI_UPDATE_OWNERSHIP_BASELINE === '1';
// First initialisation only: today's dangling names become the pinned list.
const known = new Set(fs.existsSync(basePath) ? base.dangling || [] : UPDATE ? dangling : []);
for (const n of dangling) if (!known.has(n)) failures.push(`${n} is read by ${[...inv.readers.get(n)].join(', ')} but defined nowhere: a typo or a dead branch`);
const gone = [...known].filter((n) => !dangling.includes(n));
if (gone.length) console.log(`  ! no longer dangling, drop from the baseline: ${gone.join(', ')}`);

// 3 · coupling of the very large files
const size = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/file-size-baseline.json'), 'utf8'));
const big = Object.keys(size.lines).filter((f) => f.endsWith('.js'));
const coupling = {};
for (const file of big) {
  const src = inv.sources.get(file);
  if (src == null) { failures.push(`${file} is pinned by the size ratchet but missing`); continue; }
  const foreign = [...reads(src)].filter((n) => (inv.owners.get(n) && !inv.owners.get(n).has(file)) || inv.merges.has(n));
  coupling[file] = foreign.length;
  const pin = base.coupling && base.coupling[file];
  if (pin != null && foreign.length > pin + SLACK) failures.push(`${file} now reads ${foreign.length} globals owned elsewhere (pin ${pin} + ${SLACK}): split before adding a dependency web`);
  if (pin != null && foreign.length < pin) console.log(`  ! ${file}: coupling ${foreign.length} < pin ${pin}, lower it with KIWI_UPDATE_OWNERSHIP_BASELINE=1`);
}

if (UPDATE) {
  // Only ever lowers: a pin never rises, a dangling name never comes back.
  const next = { note: base.note || 'Pins for tools/global-ownership-test.mjs. Both lists only go down. Never raise one to make a red run go away.',
    dangling: dangling.filter((n) => known.has(n)),
    coupling: Object.fromEntries(Object.entries(coupling).map(([f, n]) => [f, base.coupling && base.coupling[f] != null ? Math.min(n, base.coupling[f]) : n])) };
  fs.writeFileSync(basePath, JSON.stringify(next, null, 2) + '\n');
  console.log('  baseline written: ' + path.relative(ROOT, basePath));
} else assert(fs.existsSync(basePath), 'initialise tools/global-ownership-baseline.json with KIWI_UPDATE_OWNERSHIP_BASELINE=1');

for (const f of failures) console.log('  ✗ ' + f);
assert.equal(failures.length, 0, failures.length + ' ownership rule(s) broken');
console.log(`✓ global ownership · ${inv.owners.size} owned globals, ${Object.keys(SHARED).length} shared on purpose, ${dangling.length} dangling (pinned), coupling pinned for ${big.length} large files`);
