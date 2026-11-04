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
  const relOf = (p) => {
    try {
      if (p == null) return null;
      let file = p;
      if (typeof file === 'object') file = file instanceof URL ? fileURLToPath(file) : (Buffer.isBuffer(file) ? file.toString() : null);
      else if (typeof file === 'number') return null;
      if (!file) return null;
      if (file.startsWith('file:')) file = fileURLToPath(file);
      else if (/^[a-z][a-z0-9+.-]+:/i.test(file)) return null;   // node:, data:, http:
      file = path.resolve(file);
      if (file + path.sep === ROOT || file + path.sep === REAL) return '.';
      const base = file.startsWith(ROOT) ? ROOT : (file.startsWith(REAL) ? REAL : '');
      if (!base) return null;
      const rel = file.slice(base.length).split(path.sep).join('/');
      return rel && !SKIP.test(rel) ? rel : null;
    } catch (_) { return null; }
  };
  const note = (p) => { const rel = relOf(p); if (rel && rel !== '.') seen.add(rel); };

  const wrap = (obj, name) => {
    const real = obj[name];
    if (typeof real !== 'function' || real.kiwiTraced) return;
    const traced = function (p) { note(p); return real.apply(this, arguments); };
    traced.kiwiTraced = true;
    obj[name] = traced;
  };
  for (const n of ['readFileSync', 'readFile', 'createReadStream', 'openSync', 'open', 'copyFileSync', 'copyFile']) wrap(fs, n);
  if (fs.promises) for (const n of ['readFile', 'open', 'copyFile']) wrap(fs.promises, n);
  /* Probes and listings count too: a test that checks a file is absent, or that
     globs a folder, depends on that answer (the pass cache in check-pool.js
     hashes a listing as `dir:<folder>` and a missing file as absent). */
  for (const n of ['existsSync', 'statSync', 'lstatSync', 'accessSync', 'stat', 'lstat', 'access']) wrap(fs, n);
  if (fs.promises) for (const n of ['stat', 'lstat', 'access']) wrap(fs.promises, n);
  const wrapDir = (obj, name) => {
    const real = obj[name];
    if (typeof real !== 'function' || real.kiwiTraced) return;
    const traced = function (p) { const rel = relOf(p); if (rel) seen.add('dir:' + rel); return real.apply(this, arguments); };
    traced.kiwiTraced = true;
    obj[name] = traced;
  };
  for (const n of ['readdirSync', 'readdir', 'opendirSync', 'opendir']) wrapDir(fs, n);
  if (fs.promises) for (const n of ['readdir', 'opendir']) wrapDir(fs.promises, n);
  /* Inputs the file list cannot represent: a read outside the repo under the
     user's home (another checkout, ~/Library, a dotfile) and a connection to a
     host that is not this machine. They ride along as `#blind <what>` lines and
     the pass cache (tools/check-pool.js) then refuses to replay that pass: the
     key hashes repo files only, so it could not notice them change. The temp
     dir, /dev and system paths are not user state and do not count. */
  const os = require('os');
  let HOME = '', TMP = '';
  try { HOME = fs.realpathSync(os.homedir()) + path.sep; TMP = fs.realpathSync(os.tmpdir()) + path.sep; } catch (_) {}
  const blind = new Set();
  const outsideHome = (p) => {
    try {
      if (p == null || typeof p === 'number') return null;
      let file = typeof p === 'object' ? (p instanceof URL ? fileURLToPath(p) : (Buffer.isBuffer(p) ? p.toString() : null)) : String(p);
      if (!file) return null;
      if (file.startsWith('file:')) file = fileURLToPath(file);
      else if (/^[a-z][a-z0-9+.-]+:/i.test(file)) return null;
      file = path.resolve(file);
      const inRepo = (b) => b && file.startsWith(b);
      if (inRepo(ROOT) || inRepo(REAL) || (TMP && file.startsWith(TMP)) || /^\/(private\/)?(tmp|var\/folders)\//.test(file)) return null;
      // Packages: the pass key already hashes app/package-lock.json, and a worktree reaches the
      // main checkout's app/node_modules through a symlink that resolves outside its own root.
      if (file.split(path.sep).includes('node_modules')) return null;
      if (!HOME || !(file.startsWith(HOME) || file.startsWith(os.homedir() + path.sep))) return null;
      return file;
    } catch (_) { return null; }
  };
  const wrapBlind = (obj, name) => {
    const real = obj[name];
    if (typeof real !== 'function' || real.kiwiBlind) return;
    const traced = function (p) { const out = outsideHome(p); if (out) blind.add('file ' + out.replace(HOME, '~/')); return real.apply(this, arguments); };
    traced.kiwiBlind = true;
    traced.kiwiTraced = real.kiwiTraced;
    obj[name] = traced;
  };
  for (const n of ['readFileSync', 'readFile', 'createReadStream', 'openSync', 'open', 'copyFileSync', 'copyFile', 'existsSync', 'statSync', 'lstatSync', 'accessSync', 'stat', 'lstat', 'access', 'readdirSync', 'readdir', 'opendirSync', 'opendir']) wrapBlind(fs, n);
  if (fs.promises) for (const n of ['readFile', 'open', 'copyFile', 'stat', 'lstat', 'access', 'readdir', 'opendir']) wrapBlind(fs.promises, n);
  try {
    const net = require('net');
    const realConnect = net.Socket.prototype.connect;
    if (!realConnect.kiwiBlind) {
      const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|0\.0\.0\.0|::)$/;
      net.Socket.prototype.connect = function (...args) {
        try {
          let a = args[0];
          if (Array.isArray(a)) a = a[0];
          let host;
          if (a && typeof a === 'object') host = a.path ? null : (a.host || 'localhost');
          else if (typeof a === 'number' || (typeof a === 'string' && /^\d+$/.test(a))) host = typeof args[1] === 'string' ? args[1] : 'localhost';
          if (host && !LOCAL.test(host)) blind.add('net ' + host);
        } catch (_) {}
        return realConnect.apply(this, args);
      };
      net.Socket.prototype.connect.kiwiBlind = true;
    }
  } catch (_) {}
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
    const blindLines = blind.size ? [...blind].sort().map((b) => '#blind ' + b).join('\n') + '\n' : '';
    try { fs.appendFileSync(OUT, (seen.size ? [...seen].join('\n') + '\n' : '') + blindLines + cpu); } catch (_) {}
  });
}
