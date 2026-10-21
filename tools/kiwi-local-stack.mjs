#!/usr/bin/env node
/* Kiwi · the whole product, locally, on synthetic data.
 *
 * Every Pages Function (functions/**) behind the real account gate
 * (functions/_middleware.js), the static site from the repo root, and a D1
 * shim over node:sqlite seeded from schema.sql. Nothing here reaches
 * production: no D1 binding, no secrets, no webhooks. Outbound providers
 * (WhatsApp, SMS, mail, payment links, AI) are simply unbound, so the
 * product reports them as "blocked", which is what it should do anyway.
 *
 * Why it exists: a feature is only honest once it has been used end to end,
 * caisse → server → dashboard. The static preview cannot do that (no /api),
 * and prod holds real merchants' books. This can.
 *
 *   Needs Node 22.5+ (node:sqlite).
 *
 *   npm run stack                              # = --seed: a fixture café, store activated
 *   node tools/kiwi-local-stack.mjs            # http://localhost:8790
 *   node tools/kiwi-local-stack.mjs --reset    # start from an empty database
 *   KIWI_STACK_PORT=8791 KIWI_STACK_DB=/tmp/x.sqlite node tools/kiwi-local-stack.mjs
 *
 * Accounts are created through the product's own signup page. The database
 * lives in the OS temp directory unless KIWI_STACK_DB says otherwise. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FUNCTIONS = path.join(ROOT, 'functions');
const PORT = Number(process.env.KIWI_STACK_PORT) || 8790;
const HOST = 'localhost';
const DB_FILE = process.env.KIWI_STACK_DB || path.join(os.tmpdir(), 'kiwi-local-stack.sqlite');

const FIXTURE_FILE = DB_FILE + '.fixture';
if (process.argv.includes('--reset')) {
  for (const f of [DB_FILE, FIXTURE_FILE]) { try { fs.rmSync(f); } catch (_) {} }
}
const sqlite = new DatabaseSync(DB_FILE);
/* schema.sql describes a FRESH database and applies in one pass. A database
   kept from an earlier run is brought up to date the way prod should be: the
   same parser tools/d1-schema.mjs uses lists what is missing, and it is added.
   (An earlier split-on-semicolon loader silently created nothing, and every
   write then failed as "merchant-ownership-unavailable".) */
{
  const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  try { sqlite.exec(schema); } catch (e) { console.error('[stack] schema.sql:', e.message); }
  const { parseSchema, diff } = await import(pathToFileURL(path.join(ROOT, 'tools/d1-schema.mjs')).href);
  const live = { tables: new Map(), indexes: new Set(), triggers: new Set() };
  for (const t of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    live.tables.set(t.name, new Set(sqlite.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name)));
  }
  for (const i of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all()) live.indexes.add(i.name);
  for (const t of sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()) live.triggers.add(t.name);
  const gap = diff(parseSchema(schema), live);
  for (const c of gap.missingColumns) { try { sqlite.exec(c.sql); } catch (e) { console.error('[stack] column', c.table + '.' + c.column, e.message); } }
  for (const t of gap.missingTriggers) { try { sqlite.exec(t.sql); } catch (e) { console.error('[stack] trigger', t.name, e.message); } }
  for (const b of gap.blocked) console.error('[stack] column not addable:', b.table + '.' + b.column, b.reason);
  const tables = sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  if (tables < 10) throw new Error('local schema did not load (' + tables + ' tables)');
}

/* ── D1 over node:sqlite ──────────────────────────────────────────────── */
const toSql = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
/* D1 refuses more than 100 bound parameters in one statement (« too many SQL
   variables », measured on production 2026-10-21); node:sqlite accepts 32 766.
   Without the same ceiling here, a route that binds one `?` per item passed
   every suite and failed for real at item 101 (the stock queue, 30 September). */
const D1_MAX_VARS = 100;
function statement(sql, args = []) {
  const prep = () => {
    if (args.length > D1_MAX_VARS) throw new Error(`too many SQL variables (${args.length} > ${D1_MAX_VARS}, D1's limit): SQLITE_ERROR`);
    return sqlite.prepare(sql);
  };
  return {
    bind: (...a) => statement(sql, a.map(toSql)),
    async first(col) {
      const row = prep().get(...args) || null;
      return row && col ? (row[col] ?? null) : row;
    },
    async all() { return { results: prep().all(...args), success: true, meta: {} }; },
    async raw() { const s = prep(); s.setReturnArrays?.(true); return s.all(...args).map((r) => Array.isArray(r) ? r : Object.values(r)); },
    async run() {
      const r = prep().run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    /* D1's batch() answers each statement with its rows: a SELECT inside a
       batch comes back as { results: [...] }. Running every statement with
       run() returned no rows, so a route that reads through batch() (the
       public booking page, for one) saw an empty database and said
       "booking-closed" for a store that had just opened it. */
    __run() {
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) {
        return { results: prep().all(...args), success: true, meta: {} };
      }
      /* A write with RETURNING hands back its rows AND, like D1, the number of
         rows it changed. Answering only the rows made every route that reads
         meta.changes after a batched UPDATE … RETURNING (the takeaway handover)
         believe nothing moved, and say 409 for an update that had landed. */
      if (/\bRETURNING\b/i.test(sql)) {
        const rows = prep().all(...args);
        return { results: rows, success: true, meta: { changes: rows.length } };
      }
      const r = prep().run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  };
}
const DB = {
  prepare: (sql) => statement(sql),
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = stmts.map((s) => s.__run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
  async exec(sql) { sqlite.exec(sql); return { count: 1 }; },
};

/* R2-shaped in-memory bucket, enough for uploads to round-trip. */
const blobs = new Map();
const MEDIA = {
  async put(key, value, opts = {}) { const buf = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value); blobs.set(key, { buf, httpMetadata: opts.httpMetadata || {} }); return { key }; },
  async get(key) { const b = blobs.get(key); return b ? { body: b.buf, httpMetadata: b.httpMetadata, arrayBuffer: async () => b.buf, writeHttpMetadata(h) { if (b.httpMetadata.contentType) h.set('content-type', b.httpMetadata.contentType); } } : null; },
  async head(key) { return blobs.has(key) ? { key } : null; },
  async delete(keys) { [].concat(keys).forEach((k) => blobs.delete(k)); },
  async list() { return { objects: [...blobs.keys()].map((key) => ({ key })) }; },
};

const SECRET_FILE = DB_FILE + '.secret';
let AUTH_SECRET = '';
try { AUTH_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (_) {}
if (!AUTH_SECRET) { AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID(); fs.writeFileSync(SECRET_FILE, AUTH_SECRET, { mode: 0o600 }); }
const env = { DB, MEDIA, AUTH_SECRET };

/* ── Pages-style routing ──────────────────────────────────────────────── */
const modCache = new Map();
async function load(file) {
  if (!modCache.has(file)) modCache.set(file, import(pathToFileURL(file).href));
  return modCache.get(file);
}
/* functions/a/b.js, functions/a/b/index.js, then [param].js / [[catchall]].js. */
function resolveRoute(pathname) {
  const segs = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segs.some((s) => s.startsWith('_') || s.includes('..'))) return null;
  function walk(dir, i, params) {
    if (i === segs.length) {
      const index = path.join(dir, 'index.js');
      return fs.existsSync(index) ? { file: index, params } : null;
    }
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (last && fs.existsSync(path.join(dir, seg + '.js'))) return { file: path.join(dir, seg + '.js'), params };
    if (fs.existsSync(path.join(dir, seg)) && fs.statSync(path.join(dir, seg)).isDirectory()) {
      const hit = walk(path.join(dir, seg), i + 1, params);
      if (hit) return hit;
    }
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (_) { return null; }
    for (const e of entries) {
      const m = e.match(/^\[([a-z0-9_]+)\]\.js$/i);
      if (m && last) return { file: path.join(dir, e), params: { ...params, [m[1]]: seg } };
      const c = e.match(/^\[\[([a-z0-9_]+)\]\]\.js$/i);
      if (c) return { file: path.join(dir, e), params: { ...params, [c[1]]: segs.slice(i) } };
      const d = e.match(/^\[([a-z0-9_]+)\]$/i);
      if (d && !last) { const hit = walk(path.join(dir, e), i + 1, { ...params, [d[1]]: seg }); if (hit) return hit; }
    }
    return null;
  }
  return walk(FUNCTIONS, 0, {});
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};
function staticAsset(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  let file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || rel.split('/').some((p) => p.startsWith('.') || p === 'node_modules' || p === 'functions')) {
    return new Response('Not found', { status: 404 });
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) {
    const notFound = path.join(ROOT, '404.html');
    return new Response(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found', { status: 404, headers: { 'content-type': TYPES['.html'] } });
  }
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
}

async function runFunction(request) {
  const url = new URL(request.url);
  const route = resolveRoute(url.pathname);
  if (!route) return staticAsset(request);
  const mod = await load(route.file);
  const method = request.method[0] + request.method.slice(1).toLowerCase();
  const handler = mod['onRequest' + method] || mod.onRequest;
  if (!handler) return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  const waits = [];
  const res = await handler({ request, env, params: route.params, data: {}, waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})), next: () => staticAsset(request) });
  return res;
}

async function handle(request) {
  const middleware = await load(path.join(FUNCTIONS, '_middleware.js'));
  const waits = [];
  return middleware.onRequest({
    request, env, params: {}, data: {},
    waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})),
    next: (input) => runFunction(input instanceof Request ? input : request),
  });
}

/* --seed : one synthetic restaurant owner, created through the product's own
   signup handler (so its hashing, slug and checks are the real ones). Its
   password is generated per database and kept beside it (mode 600), never in
   the repo: it opens nothing but this local database, but a committed
   password is a committed password. */
function fixturePassword() {
  try { const p = fs.readFileSync(FIXTURE_FILE, 'utf8').trim(); if (p) return p; } catch (_) {}
  const p = 'local-' + crypto.randomBytes(12).toString('base64url');
  fs.writeFileSync(FIXTURE_FILE, p + '\n', { mode: 0o600 });
  return p;
}
export const LOCAL_FIXTURE = {
  email: 'cafe@local.test', business: 'Café Local Test', name: 'Propriétaire test',
};
if (process.argv.includes('--seed')) {
  const exists = sqlite.prepare('SELECT id FROM accounts WHERE email = ?').get(LOCAL_FIXTURE.email);
  if (!exists) {
    const { onRequestPost } = await load(path.join(FUNCTIONS, 'auth/signup.js'));
    const res = await onRequestPost({
      request: new Request(`http://${HOST}:${PORT}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://${HOST}:${PORT}` }, body: JSON.stringify({ ...LOCAL_FIXTURE, password: fixturePassword() }) }),
      env, waitUntil() {}, params: {}, data: {},
    });
    console.log('[seed] signup', res.status, res.status >= 400 ? await res.text() : LOCAL_FIXTURE.email + ' · password in ' + FIXTURE_FILE);
  }
  /* Onboarding creates the store as `pending`: no active subscription yet, so
     entitlements-v2.js shows the paywall and the server refuses writes.
     --seed activates the fixture's store the way the operator console would,
     so a session can test past onboarding. Run without --seed to see what a
     new, unpaid merchant sees. */
  const acc = sqlite.prepare('SELECT id FROM accounts WHERE email = ?').get(LOCAL_FIXTURE.email);
  if (acc) {
    const n = sqlite.prepare("UPDATE merchant_config SET status = 'active', plan = COALESCE(plan, 'pro'), updated_ts = ? WHERE account_id = ? AND status = 'pending'").run(Date.now(), acc.id).changes;
    if (n) console.log('[seed] activated', n, 'pending store(s)');
  }
}

http.createServer(async (req, res) => {
  try {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end('Local stack only'); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('cf-connecting-ip', '127.0.0.1');
    const request = new Request(`http://${HOST}:${PORT}${req.url}`, {
      method: req.method, headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
    });
    const response = await handle(request);
    /* A 5xx is the one answer worth reading in the terminal: it is where the
       product says "I cannot" and the UI has to tell the merchant something. */
    if (response.status >= 500) {
      try { console.error('[stack]', response.status, req.method, req.url.split('?')[0], (await response.clone().text()).slice(0, 300)); } catch (_) {}
    }
    const out = {};
    response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    if (req.method === 'HEAD' || !response.body) return res.end();
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error('[stack]', req.method, req.url, e && e.stack || e);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'local-stack-error', detail: String(e && e.message || e) }));
  }
}).listen(PORT, HOST, () => {
  console.log(`Kiwi local stack · http://${HOST}:${PORT}/  (D1: ${DB_FILE})`);
  console.log('Synthetic data only. Outbound providers are unbound.');
});
