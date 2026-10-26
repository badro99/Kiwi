// Rebuild the original classic-script position for source assertions and VM extraction.
// The till's restaurant core is four blocking classic scripts, loaded in this
// order at the end of kiwi-caisse.html: three preludes of top-level function
// declarations only (caisse-accounting.js, then caisse-floor.js and
// caisse-kitchen.js, both out of caisse-app.js since 22 October 2026), then
// caisse-app.js with the state and everything that runs at load.
const fs = require('node:fs');
const path = require('node:path');
const workflows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/workflows.json'), 'utf8'));
const LIVE = ['assets/caisse/table-settlement.js', 'assets/caisse-accounting.js', 'assets/caisse-floor.js', 'assets/caisse-kitchen.js', ...workflows.files, 'assets/caisse-app.js'];
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const liveSource = () => LIVE.map(read).join('\n');
/* Second split (tools/fixtures/caisse-app/split-2.json): put every run of
   moved declarations back in front of the caisse-app.js text it used to
   precede, so tests that slice « from this function to the next statement »
   read caisse-app.js as it was. Runs and anchors are found by text, not by
   offset: an edit elsewhere keeps working. null when an anchor or a run start
   is gone or ambiguous, or when a prelude gained code ahead of its first run. */
/* Carrying later edits into a frozen split.
   Each split keeps its pre-split text frozen (a .js.gz) and the list of
   fragments that cut it into the live files. Once a live file is edited, its
   fragments no longer line up by length. Rather than give up (every legacy
   test would then read the live files in load order and miss its markers),
   diff each live file against the text the fixture sealed for it, and replay
   each changed run at the same spot of the frozen original. A run that
   straddles fragments loses its part of each and lands in the last one; one
   that cannot be placed at all gives null, and the split must be proven again. */
function lineHunks(a, b) {
  if (a === b) return [];
  const A = a.split(/(?<=\n)/), B = b.split(/(?<=\n)/);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const a2 = A.slice(p, A.length - s), b2 = B.slice(p, B.length - s);
  const N = a2.length, M = b2.length, equal = [];
  if (N && M) {
    // Myers' O((N+M)D) diff on lines; D stays small for an edit, so the trace is small too.
    const off = N + M + 1, V = new Int32Array(2 * off + 1), trace = [];
    let D = 0, done = false;
    for (; D <= N + M && !done; D++) {
      if (D > 4000) return null;
      trace.push(V.slice());
      for (let k = -D; k <= D; k += 2) {
        let x = k === -D || (k !== D && V[off + k - 1] < V[off + k + 1]) ? V[off + k + 1] : V[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && a2[x] === b2[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { done = true; break; }
      }
    }
    let x = N, y = M;
    for (let d = trace.length - 1; d >= 0; d--) {
      const v = trace[d], k = x - y;
      const pk = d === 0 ? 0 : (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1);
      const px = d === 0 ? 0 : v[off + pk], py = px - pk;
      while (x > px && y > py) { x--; y--; equal.push([x, y]); }
      x = px; y = py;
    }
    equal.reverse();
  }
  const at = (lines, base, n) => { let c = base; for (let i = 0; i < n; i++) c += lines[i].length; return c; };
  const pa = at(A, 0, p), pb = at(B, 0, p);
  const offA = [pa], offB = [pb];
  for (const l of a2) offA.push(offA[offA.length - 1] + l.length);
  for (const l of b2) offB.push(offB[offB.length - 1] + l.length);
  const hunks = [];
  let ia = 0, ib = 0;
  for (const [ea, eb] of [...equal, [N, M]]) {
    if (ea > ia || eb > ib) hunks.push({ a0: offA[ia], a1: offA[ea], b0: offB[ib], b1: offB[eb] });
    ia = ea + 1; ib = eb + 1;
  }
  return hunks.map(h => ({ ...h, text: b.slice(h.b0, h.b1) }));
}
/* The frozen original with every edit of the live bodies replayed in it. */
function carryEdits(original, fragments, bodies) {
  const sealed = new Map(), pieces = [];
  for (const f of fragments) {
    const before = sealed.get(f.file) || '';
    pieces.push({ file: f.file, from: before.length, to: before.length + f.end - f.start, at: f.start });
    sealed.set(f.file, before + original.slice(f.start, f.end));
  }
  const patches = [];
  for (const [file, body] of bodies) {
    const was = sealed.get(file) || '';
    const hunks = lineHunks(was, body);
    if (hunks === null) return null;
    const own = pieces.filter(q => q.file === file);
    for (const line of hunks) {
      // Narrow each run to the characters that differ: a split joins two
      // fragments mid-line, and a run that only shares that line with the
      // fragment before must not carry its new text across the moved code.
      // A change that still spans fragments puts its new text in the last
      // one, next to the kept end (a statement often runs on into the next
      // line), so the kept start is cut back to a whole line in the first.
      const old = was.slice(line.a0, line.a1);
      let p = 0, s = 0;
      while (p < old.length && p < line.text.length && old[p] === line.text[p]) p++;
      while (s < old.length - p && s < line.text.length - p && old[old.length - 1 - s] === line.text[line.text.length - 1 - s]) s++;
      if (p === old.length && p === line.text.length) continue;
      if (own.filter(q => q.to > line.a0 + p && q.from < line.a1 - s).length > 1) while (p > 0 && was[line.a0 + p - 1] !== '\n') p--;
      const h = { a0: line.a0 + p, a1: line.a1 - s, text: line.text.slice(p, line.text.length - s) };
      if (h.a0 === h.a1) {
        // An insertion at a fragment boundary belongs to the fragment it follows.
        const q = own.find(q => h.a0 > q.from && h.a0 <= q.to) || own.find(q => h.a0 === q.from);
        if (!q) return null;
        patches.push({ from: q.at + h.a0 - q.from, to: q.at + h.a0 - q.from, text: h.text });
        continue;
      }
      // A change across fragments: each loses its own part, the new text goes
      // in the last, and what the split moved out in between stays where it was.
      const span = own.filter(q => q.to > h.a0 && q.from < h.a1);
      if (!span.length || span[0].from > h.a0 || span[span.length - 1].to < h.a1) return null;
      span.forEach((q, i) => patches.push({
        from: q.at + Math.max(h.a0, q.from) - q.from, to: q.at + Math.min(h.a1, q.to) - q.from, text: i === span.length - 1 ? h.text : '',
      }));
    }
  }
  patches.sort((x, y) => y.from - x.from || y.to - x.to);
  let out = original;
  for (const x of patches) out = out.slice(0, x.from) + x.text + out.slice(x.to);
  return out;
}
const frozen = new Map();
function frozenText(name, sha) {
  if (!frozen.has(name)) {
    const crypto = require('node:crypto');
    const text = require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app', name))).toString();
    frozen.set(name, crypto.createHash('sha256').update(text).digest('hex') === sha ? text : null);
  }
  return frozen.get(name);
}
/* Shift each offset of `at` through the edits that turned `a` into `b`;
   null when one falls inside a changed run. */
function shiftOffsets(a, b, at) {
  const hunks = lineHunks(a, b);
  if (hunks === null) return null;
  const out = [];
  for (const x of at) {
    let delta = 0, ok = true;
    for (const h of hunks) {
      if (x <= h.a0) break;
      if (x < h.a1) { ok = false; break; }
      delta += (h.b1 - h.b0) - (h.a1 - h.a0);
    }
    if (!ok) return null;
    out.push(x + delta);
  }
  return out;
}
let workflowMemo;
function appBeforeWorkflows() {
  if (workflowMemo !== undefined) return workflowMemo;
  const crypto = require('node:crypto');
  const pristine = Object.entries(workflows.splitFiles).every(([file, hash]) =>
    crypto.createHash('sha256').update(read(file)).digest('hex') === hash);
  let core = read(workflows.core);
  const insert = (raw, edits) => { for (const edit of [...edits].reverse()) raw = raw.slice(0, edit.at) + edit.text + raw.slice(edit.at); return raw; };
  if (pristine) {
    core = insert(core, workflows.coreWhitespace);
    const bodies = new Map([[workflows.core, core], ...workflows.files.map(file => [file, read(file).slice(workflows.headers[file].length, -1)])]);
    const offsets = new Map();
    return (workflowMemo = workflows.fragments.map(fragment => {
      const at = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
      offsets.set(fragment.file, at + length);
      return bodies.get(fragment.file).slice(at, at + length);
    }).join(''));
  }
  const original = frozenText('before-workflows.js.gz', workflows.sha256);
  if (original === null) return (workflowMemo = null);
  // The core's sealed text, without the whitespace the split took out, so the
  // re-inserted whitespace can follow the core's edits.
  const sealedCore = workflows.fragments.filter(f => f.file === workflows.core).map(f => original.slice(f.start, f.end)).join('');
  // Inserts were applied from the last to the first at raw offsets, so the k-th
  // sits at its raw offset plus the length of those before it.
  let raw = sealedCore, lead = 0;
  const ws = workflows.coreWhitespace.map(edit => { const w = edit.at + lead; lead += edit.text.length; return w; });
  for (let i = ws.length - 1; i >= 0; i--) raw = raw.slice(0, ws[i]) + raw.slice(ws[i] + workflows.coreWhitespace[i].text.length);
  const moved = shiftOffsets(raw, core, workflows.coreWhitespace.map(edit => edit.at));
  if (moved === null) return (workflowMemo = null);
  core = insert(core, workflows.coreWhitespace.map((edit, i) => ({ at: moved[i], text: edit.text })));
  const bodies = new Map([[workflows.core, core]]);
  for (const file of workflows.files) {
    const text = read(file), header = workflows.headers[file];
    if (!text.startsWith(header) || !text.endsWith('\n')) return (workflowMemo = null);
    bodies.set(file, text.slice(header.length, -1));
  }
  return (workflowMemo = carryEdits(original, workflows.fragments, bodies));
}
function appBeforeSecondSplit() {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/split-2.json'), 'utf8'));
  const core = appBeforeWorkflows();
  if (core === null) return null;
  const texts = new Map();
  for (const file of new Set(map.runs.map(run => run.file))) {
    const body = read(file).replace(/\n$/, '');
    const runs = map.runs.filter(run => run.file === file);
    const at = runs.map(run => body.indexOf(run.start));
    for (let i = 0; i < runs.length; i++) {
      if (at[i] < 0 || body.indexOf(runs[i].start, at[i] + 1) >= 0 || (i && at[i] <= at[i - 1])) return null;
    }
    if (/\bfunction\b/.test(body.slice(0, at[0]))) return null;
    runs.forEach((run, i) => texts.set(run, body.slice(at[i], i + 1 < runs.length ? at[i + 1] : body.length)));
  }
  let out = '', last = 0;
  for (const run of map.runs) {
    const at = core.indexOf(run.before);
    if (at < last || core.indexOf(run.before, at + 1) >= 0) return null;
    out += core.slice(last, at) + texts.get(run);
    last = at;
  }
  return out + core.slice(last);
}
function originalOrder() {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/split.json'), 'utf8'));
  const app = appBeforeSecondSplit();
  if (app === null) return liveSource();
  const bodies = new Map([[map.prelude, read(map.prelude)], [map.core, app]]);
  const offsets = new Map(), parts = [];
  for (const fragment of map.fragments) {
    const offset = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
    parts.push(bodies.get(fragment.file).slice(offset, offset + length));
    offsets.set(fragment.file, offset + length);
  }
  let aligned = true;
  for (const [file, body] of bodies) {
    if (body.length !== offsets.get(file) + (file === map.prelude ? 1 : 0)) aligned = false;
  }
  if (aligned) return parts.join('');
  // Edited since the first split: replay the edits in its frozen original.
  const original = frozenText('original.js.gz', map.sha256);
  const prelude = bodies.get(map.prelude);
  const carried = original !== null && prelude.endsWith('\n')
    ? carryEdits(original, map.fragments, new Map([[map.prelude, prelude.slice(0, -1)], [map.core, app]]))
    : null;
  return carried === null ? [...bodies.values()].join('\n') : carried;
}
module.exports = function caisseTestSource(html) {
  return html.replace(/  <link[^>]+data-caisse-(?:script|lazy)[^>]*>\n/g, '')
    .replace(/<script src="assets\/caisse\/workflows-loader\.js(?:\?v=\d+)?"><\/script>\s*/g, '')
    .replace(/<script src="assets\/caisse-(?:accounting|floor|kitchen)\.js(?:\?v=\d+)?"><\/script>\s*/g, '')
    .replace(/<script src="assets\/caisse-app\.js(?:\?v=\d+)?"><\/script>/,
      () => '<script>' + originalOrder() + '</script>');
};
// Tests needing individual functions read current declarations by name.
module.exports.declarations = function declarations(...names) {
  const { declaration } = require('./js-declarations.cjs');
  const source = liveSource();
  const body = names.map(name => declaration(source, name)).join('\n');
  return /\b(?:tableSettlement|currentOrder)\(/.test(body) ? module.exports.withSettlement(body) : body;
};
// The four live files, concatenated in load order, for tests that read or run the core.
module.exports.FILES = LIVE;
module.exports.liveSource = liveSource;
module.exports.appBeforeSecondSplit = appBeforeSecondSplit;

module.exports.appBeforeWorkflows = appBeforeWorkflows;
module.exports.originalOrder = originalOrder;
module.exports.lineHunks = lineHunks;
module.exports.carryEdits = carryEdits;
module.exports.appSource = () => appBeforeWorkflows() || [...workflows.files.map(read), read(workflows.core)].join("\n");

// Les bacs à sable de fonctions isolées chargent le propriétaire réel une seule fois.
module.exports.withSettlement = function withSettlement(source) {
  const { declaration } = require('./js-declarations.cjs');
  const catalogue = read('assets/caisse/catalogue.js');
  const order = ['createCurrentOrder', 'currentOrder'].map(name => declaration(catalogue, name)).join('\n');
  const body = read('assets/caisse/table-settlement.js');
  const at = body.indexOf('function tableSettlement()');
  return 'if (!globalThis.createCurrentOrder) { ' + order + '\nglobalThis.createCurrentOrder = createCurrentOrder; globalThis.currentOrder = currentOrder; }\n' + 'if (!globalThis.createTableSettlement) { globalThis.createTableSettlement = ('
    + body.slice(0, at) + '); globalThis.tableSettlement = (' + body.slice(at) + '); }\n' + source;
};

module.exports.orderDeclarations = function () {
  const { declaration } = require('./js-declarations.cjs');
  const catalogue = read('assets/caisse/catalogue.js');
  return ['createCurrentOrder', 'currentOrder'].map(name => declaration(catalogue, name)).join('\n');
};
