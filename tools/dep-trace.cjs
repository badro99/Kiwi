'use strict';
/* Kiwi · dep-trace.cjs — records which repo files a test actually touched.
 *
 * Preloaded into a child test by tools/check-pool.js:
 *   NODE_OPTIONS=--require=<this file>  KIWI_DEP_TRACE=<out file>  KIWI_DEP_ROOT=<repo>
 * It notes every repo file the process imports or requires (module hooks) and
 * every file it reads through fs (a test that loads assets/receipt.js into a
 * vm, a static server handing dashboard.html to Chromium), then appends the
 * list, repo-relative, to KIWI_DEP_TRACE when the process exits. Child node
 * processes inherit the two variables, so a server a test spawns is traced too.
 *
 * It also notes the process's CPU time (`#cpu <ms>`, see below).
 * `node tools/check.js --changed` uses the map built from these lists to run
 * only the tests a change can affect. Tracing never changes what a test does:
 * every hook calls straight through, and any error inside it is swallowed. */
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const OUT = process.env.KIWI_DEP_TRACE;
const ROOT = process.env.KIWI_DEP_ROOT ? path.resolve(process.env.KIWI_DEP_ROOT) + path.sep : '';
/* Module URLs come back as real paths (/private/var/… for /var/… on macOS). */
let REAL = ROOT;
try { if (ROOT) REAL = fs.realpathSync(ROOT) + path.sep; } catch (_) {}
if (OUT && ROOT) {
  const seen = new Set();
  const SKIP = /(^|\/)(node_modules|\.git|\.kiwi|graphify-out)\//;
  const note = (p) => {
    try {
      if (p == null) return;
      let file = p;
      if (typeof file === 'object') file = file instanceof URL ? fileURLToPath(file) : (Buffer.isBuffer(file) ? file.toString() : null);
      else if (typeof file === 'number') return;
      if (!file) return;
      if (file.startsWith('file:')) file = fileURLToPath(file);
      else if (/^[a-z][a-z0-9+.-]+:/i.test(file)) return;   // node:, data:, http:
      file = path.resolve(file);
      const base = file.startsWith(ROOT) ? ROOT : (file.startsWith(REAL) ? REAL : '');
      if (!base) return;
      const rel = file.slice(base.length).split(path.sep).join('/');
      if (rel && !SKIP.test(rel)) seen.add(rel);
    } catch (_) {}
  };

  const wrap = (obj, name) => {
    const real = obj[name];
    if (typeof real !== 'function' || real.kiwiTraced) return;
    const traced = function (p) { note(p); return real.apply(this, arguments); };
    traced.kiwiTraced = true;
    obj[name] = traced;
  };
  for (const n of ['readFileSync', 'readFile', 'createReadStream', 'openSync', 'open']) wrap(fs, n);
  if (fs.promises) for (const n of ['readFile', 'open']) wrap(fs.promises, n);
  /* `import { readFileSync } from 'node:fs'` binds the original unless told. */
  try { require('module').syncBuiltinESMExports(); } catch (_) {}

  try {
    const mod = require('module');
    if (typeof mod.registerHooks === 'function') {
      mod.registerHooks({
        resolve(specifier, context, nextResolve) {
          const r = nextResolve(specifier, context);
          if (r && r.url) note(r.url);
          return r;
        },
      });
    }
  } catch (_) {}

  /* The process's own CPU time rides along as a `#cpu <ms>` line: the pool adds
     up a test's processes for the time ratchet (CPU time, unlike wall time,
     barely moves when the machine is busy). */
  process.on('exit', () => {
    let cpu = '';
    try { const u = process.cpuUsage(); cpu = '#cpu ' + Math.round((u.user + u.system) / 1000) + '\n'; } catch (_) {}
    try { fs.appendFileSync(OUT, (seen.size ? [...seen].join('\n') + '\n' : '') + cpu); } catch (_) {}
  });
}
