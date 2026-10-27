/* tools/coverage-lib.mjs · real code coverage from Node's built-in V8 coverage.
 *
 * Until now the gate measured only `// coverage:` annotations (which locale
 * and viewport a browser suite reached), never which lines of functions/ and
 * assets/ any test executed, so a route nobody tests was invisible.
 * Node writes raw V8 coverage JSON for every process that runs with
 * NODE_V8_COVERAGE=<dir>, child processes included. No dependency: this file
 * merges those files. tools/coverage-report.mjs (npm run coverage) drives it.
 *
 * Definitions, kept simple on purpose:
 *   function covered   V8 reports the function and its entry count is above
 *                      zero in at least one process. Anonymous callbacks and
 *                      each file's top-level body count as functions.
 *   line covered       the line has a non-blank, non-comment character that
 *                      some process executed (block ranges, nested ranges
 *                      override the enclosing one). A file no process loaded
 *                      has every line uncovered.
 * Numbers are approximate to a few lines (a comment inside a run range counts
 * as run); the ratchet uses functions, which have no such fuzz. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FLOOR_FILE = path.join(ROOT, 'tools/code-coverage-floor.json');
export const SCOPES = ['functions', 'assets'];

const realMemo = new Map();
const real = (p) => { if (!realMemo.has(p)) { try { realMemo.set(p, fs.realpathSync(p)); } catch (_) { realMemo.set(p, p); } } return realMemo.get(p); };

/* repo-relative path for a V8 script url when it is a file under a scope. */
export function repoPath(url, root = ROOT) {
  let p = '';
  if (url.startsWith('file://')) { try { p = fileURLToPath(url); } catch (_) { return null; } }
  else if (path.isAbsolute(url)) p = url;
  else return null;
  const rel = path.relative(real(root), p);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const first = rel.split(path.sep)[0];
  if (!SCOPES.includes(first) || !/\.(m?js|cjs)$/.test(rel) || rel.includes('node_modules')) return null;
  return rel.split(path.sep).join('/');
}

/* Fold one V8 script entry into the running totals for its file. */
function addScript(acc, rel, script, len) {
  let e = acc.get(rel);
  if (!e) { e = { fns: new Map(), hit: new Uint8Array(len), len }; acc.set(rel, e); }
  if (e.len !== len) return;                                // another version of the file: ignore
  const state = new Uint8Array(len);                        // 0 none, 1 ran, 2 did not run
  const ranges = [];
  for (const fn of script.functions) {
    const r0 = fn.ranges[0];
    const key = `${r0.startOffset}:${r0.endOffset}:${fn.functionName}`;
    const prev = e.fns.get(key) || 0;
    e.fns.set(key, Math.max(prev, r0.count > 0 ? 1 : 0));
    for (const r of fn.ranges) ranges.push(r);
  }
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) state.fill(r.count > 0 ? 1 : 2, Math.min(r.startOffset, len), Math.min(r.endOffset, len));
  for (let i = 0; i < len; i++) if (state[i] === 1) e.hit[i] = 1;
}

/* Merge every coverage-*.json in the given directories. Returns Map<rel, acc>. */
export function mergeDirs(dirs, root = ROOT) {
  const acc = new Map();
  const sources = new Map();
  let processes = 0;
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => /^coverage-.*\.json$/.test(n)); } catch (_) { continue; }
    for (const n of names) {
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { continue; }
      processes++;
      for (const script of data.result || []) {
        const rel = repoPath(script.url || '', root);
        if (!rel) continue;
        if (!sources.has(rel)) { try { sources.set(rel, fs.readFileSync(path.join(root, rel), 'utf8')); } catch (_) { sources.set(rel, null); } }
        const src = sources.get(rel);
        if (src == null) continue;
        addScript(acc, rel, script, src.length);   // V8 offsets are UTF-16 units, like String#length
      }
    }
  }
  return { acc, sources, processes };
}

const significant = (line) => { const t = line.trim(); return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && t !== '}' && t !== '});' && t !== '};'; };

/* Per-file summary for every file under the scopes (loaded or not). */
export function summarise({ acc, sources }, root = ROOT) {
  const files = {};
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(rel); }
      else if (/\.(m?js|cjs)$/.test(ent.name) && !/\.min\./.test(ent.name)) {
        let src = sources.get(rel);
        if (src == null) { try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { src = ''; } }
        const e = acc.get(rel);
        const lines = src.split('\n');
        let off = 0, total = 0, covered = 0;
        for (const l of lines) {
          if (significant(l)) {
            total++;
            if (e) { for (let i = 0; i < l.length; i++) if (e.hit[off + i] && l[i] !== ' ' && l[i] !== '\t') { covered++; break; } }
          }
          off += l.length + 1;
        }
        let fnTotal = 0, fnCovered = 0;
        if (e) for (const c of e.fns.values()) { fnTotal++; fnCovered += c; }
        files[rel] = { lines: total, linesCovered: covered, functions: fnTotal, functionsCovered: fnCovered, loaded: !!e };
      }
    }
  };
  for (const s of SCOPES) { try { walk(s); } catch (_) {} }
  return files;
}

export function totals(files) {
  const t = { files: 0, loaded: 0, lines: 0, linesCovered: 0, functions: 0, functionsCovered: 0 };
  for (const f of Object.values(files)) {
    t.files++; if (f.loaded) t.loaded++;
    t.lines += f.lines; t.linesCovered += f.linesCovered; t.functions += f.functions; t.functionsCovered += f.functionsCovered;
  }
  return t;
}

/* The ratchet: each pinned file keeps at least `coveredFunctions` covered. */
export function readFloors(file = FLOOR_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return { files: {} }; }
}
export function checkFloors(files, floors) {
  const problems = [];
  for (const [rel, pin] of Object.entries(floors.files || {})) {
    const f = files[rel];
    if (!f) problems.push(`${rel}: file is gone; remove it from tools/code-coverage-floor.json`);
    else if (f.functionsCovered < pin.coveredFunctions) problems.push(`${rel}: ${f.functionsCovered} functions covered, floor ${pin.coveredFunctions} (${pin.coveredFunctions - f.functionsCovered} lost its test)`);
  }
  return problems;
}
/* Floors only move up. */
export function raiseFloors(files, floors) {
  const out = { ...floors, files: { ...floors.files } };
  for (const rel of Object.keys(out.files)) {
    const f = files[rel];
    if (f && f.functionsCovered > out.files[rel].coveredFunctions) out.files[rel] = { coveredFunctions: f.functionsCovered, totalFunctions: f.functions };
    else if (f) out.files[rel] = { coveredFunctions: out.files[rel].coveredFunctions, totalFunctions: f.functions };
  }
  return out;
}
