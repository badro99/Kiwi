#!/usr/bin/env node
/* tools/hotel-stays-group-browser-test.mjs — group recovery through the real
 * browser workflow: the actual group modal in assets/hotel.js, generated DOM
 * requests, and the real /api/hotel handlers against a real database.
 *
 * Wired in tools/check.js. Needs a Chromium binary (KIWI_CHROMIUM_BIN or the
 * usual paths) and puppeteer-core (app/node_modules). Without either it
 * SKIPS green with an explicit ○ line — except under CI, where a missing
 * browser fails: the recovery workflow must be proven, not assumed.
 *
 * Every scenario runs its own HTTP origin (static repo files + an adapter
 * that routes /api/hotel/* to the REAL functions with a file-backed SQLite
 * database), its own seeded merchant, and a fresh browser context, so reload
 * recovery, storage faults and cross-device edits are all genuine.
 *
 * Matrix (R = room-only, C = commercial with accepted quote):
 *  · T1  R partial failure → immediate retry completes, frozen terms kept
 *  · T2  R partial failure → reload → reopen → retry completes
 *  · T3  C partial failure → immediate retry, saved totals equal accepted
 *  · T4  C partial failure → reload → retry, saved totals equal accepted
 *  · T5  staged-write failure → intent-only recovery, lost response, reload,
 *        no duplicate bookings
 *  · T6  intent-write failure → zero booking writes, clear message
 *  · T7  externally cancelled room is reported, never confirmed nor deleted
 *  · T8  server-changed travelers fail loudly, booking left untouched
 *  · T9  compatible server state adopts without a duplicate POST
 *  · T10 contract change between quote responses rejects the simulation
 *  · T11 accept, then contract change → submission blocked, nothing saved
 *  · T12 tenant isolation holds over HTTP (401 on a foreign merchant)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession } from '../functions/auth/_lib.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { onRequestGet as getCommercial, onRequestPost as postCommercial } from '../functions/api/hotel/commercial.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SECRET = 'hotel-group-browser-secret-0123456789abcdef';
const SESS_COOKIE = 'kiwi_sess';

let controls = 0;
const ok = (value, label) => { assert.ok(value, label); controls++; console.log(`  ✓ ${label}`); };
const step = (m) => console.log(`  ▸ ${m}`);

/* ── browser bootstrap ─────────────────────────────────────────────── */
function findChromium() {
  const env = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || '';
  if (env) { try { if (fs.existsSync(env)) return env; } catch (_) {} }
  const cands = [];
  try {
    const cache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    for (const v of fs.readdirSync(cache)) {
      cands.push(path.join(cache, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
      cands.push(path.join(cache, v, 'chrome-linux64', 'chrome'));
    }
  } catch (_) {}
  cands.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  );
  for (const p of cands) { try { if (p && fs.existsSync(p)) return p; } catch (_) {} }
  return '';
}

async function loadPuppeteer() {
  const bases = [path.join(ROOT, 'app', 'package.json'), path.join(ROOT, 'package.json')];
  for (const b of bases) {
    try {
      const req = createRequire(b);
      const mod = await import(req.resolve('puppeteer-core'));
      return mod.default || mod;
    } catch (_) {}
  }
  return null;
}

const CHROME_BIN = findChromium();
const puppeteer = CHROME_BIN ? await loadPuppeteer() : null;
if (!CHROME_BIN || !puppeteer) {
  const reason = !CHROME_BIN ? 'no Chromium binary (set KIWI_CHROMIUM_BIN)' : 'puppeteer-core not installed';
  if (process.env.CI) { console.error(`  ✗ ${reason} — CI must execute the browser assertions`); process.exit(1); }
  console.log(`  ○ skip: ${reason} — browser assertions not executed`);
  process.exit(0);
}

/* ── D1 facade over a file-backed SQLite database ──────────────────── */
function makeEnv(dbFile) {
  const sql = new DatabaseSync(dbFile);
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  class Statement {
    constructor(text) { this.text = text; this.args = []; }
    bind(...args) { this.args = args.map((v) => (v === undefined ? null : v)); return this; }
    async first() { return sql.prepare(this.text).get(...this.args) ?? null; }
    async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
    async rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
    async run() {
      const r = sql.prepare(this.text).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
  }
  const DB = {
    prepare: (text) => new Statement(text),
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const out = [];
        for (const s of statements) out.push(/^\s*SELECT\b/i.test(s.text) ? await s.all() : await s.run());
        sql.exec('COMMIT');
        return out;
      } catch (err) { try { sql.exec('ROLLBACK'); } catch (_) {} throw err; }
    },
  };
  return { sql, env: { DB, AUTH_SECRET: SECRET } };
}

const ymd = (plusDays) => {
  const d = new Date(Date.now() + plusDays * 86400000);
  return d.toISOString().slice(0, 10);
};

function seedMerchant(env, merchant, accId) {
  const now = Date.now();
  const { sql } = env;
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(accId, `${accId}@test.ma`, 'Groupe Owner', 'Hotel Groupe Test', 's', 'h', now);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'hotel', accId, 'Hotel Groupe Test', 'active', now);
  const reservations = { v: 1, settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 }, services: [], resources: [], blocked: [], bookings: [] };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(merchant, 'reservations', JSON.stringify(reservations), 1, now);
  const rooms = {
    v: 1, baseRate: 900,
    roomTypes: [{ id: 'type:t1', name: 'Chambre Double', rate: 900, maxGuests: 2 }],
    rooms: [
      { id: 'room:101', n: 101, typeId: 'type:t1', status: 'libre', connectingRoomIds: [] },
      { id: 'room:102', n: 102, typeId: 'type:t1', status: 'libre', connectingRoomIds: [] },
    ],
    folios: [],
  };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(merchant, 'rooms', JSON.stringify(rooms), 1, now);
  const commercial = {
    v: 1,
    accounts: [{ id: 'acc-agency-01', kind: 'agency', name: 'Atlas Voyages', legalName: '', address: '', city: 'Marrakech', country: 'Maroc', ice: '', taxId: '', rc: '', contact: 'M. Amrani', email: 'a@atlas.ma', phone: '+212661000002', paymentDays: 30, notes: '', archived: false }],
    contracts: [
      { id: 'ctr-000001', name: 'Séminaire 2026', accountId: 'acc-agency-01', roomTypeId: 'type:t1', from: ymd(5), to: ymd(30), occupancy: 1, board: 'hb_dinner', unit: 'room', amountCents: 85000, taxBasis: 'inclusive', currency: 'MAD', archived: false },
    ],
  };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(merchant, 'hotel-commercial', JSON.stringify(commercial), 1, now);
}

function clientRoomsDoc() {
  return {
    v: 4,
    rooms: [
      { id: 'room:101', n: 101, typeId: 'type:t1', typeName: 'Chambre Double', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [] },
      { id: 'room:102', n: 102, typeId: 'type:t1', typeName: 'Chambre Double', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [] },
    ],
    roomTypes: [{ id: 'type:t1', name: 'Chambre Double', rate: 900, maxGuests: 2 }],
    floors: [{ id: 'fl1', name: 'Étage 1', order: 0 }],
    views: ['mer', 'jardin'],
    folios: [],
    baseRate: 900,
  };
}

/* ── test HTTP origin: static repo + real API handlers ─────────────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) { return {}; }
}

function toHandlerRequest(url, req, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;
  return new Request(url, { method: req.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function via(req) {
  return req.headers['x-hx-via'] === 'driver' ? 'driver' : 'browser';
}

async function sendHandler(res, out) {
  const buf = Buffer.from(await out.arrayBuffer());
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  delete headers['content-length'];
  res.writeHead(out.status, { 'Content-Type': 'application/json', ...headers });
  res.end(buf);
}

function harnessPage(merchant) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>hx-group-harness</title></head><body>
<script>
window.__toasts = [];
window.KiwiI18n = { getLang: () => 'fr' };
window.KiwiVenue = {
  getVenue: () => 'hx-group-venue',
  isCustom: () => true,
  getVenueType: () => 'hotel',
  getCurrentVenueData: () => ({ slug: '${merchant}', name: 'Hotel Groupe Test' }),
  subscribe: () => () => {},
};
window.KiwiStore = { slugFor: () => '${merchant}' };
window.__resDoc = { bookings: [] };
window.KiwiReservations = { get: () => window.__resDoc, set: (d) => { window.__resDoc = d; } };
window.Kiwi = {
  handlers: {},
  appPage: () => ({ el: null, close() {} }),
  modal: (o) => {
    const el = document.createElement('div');
    el.className = 'kiwi-modal-stub';
    el.innerHTML = o.body || '';
    document.body.appendChild(el);
    return { el, close() { el.remove(); } };
  },
  toast: (m, opts) => { window.__toasts.push({ message: String(m), type: (opts && opts.type) || '' }); },
};
</script>
<script src="/assets/hotel.js"></script>
</body></html>`;
}

async function startOrigin(env, hooks = {}) {
  const log = [];
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/hx-test') {
        const html = harnessPage(u.searchParams.get('merchant') || 'hotel-grp-test');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
      if (u.pathname === '/api/hotel/stays') {
        if (req.method === 'GET') {
          const out = await getStays({ env, request: toHandlerRequest(`https://hx.test${req.url}`, req) });
          return sendHandler(res, out);
        }
        const body = await readJson(req);
        if (req.method === 'POST' && hooks.failStayPost && hooks.failStayPost(body)) {
          log.push({ type: 'stay-post-fault', clientRef: body.clientRef });
          res.writeHead(hooks.failStayPost.status || 409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: hooks.failStayPost.error || 'room-unavailable' }));
          return;
        }
        const out = await saveStay({ env, request: toHandlerRequest(`https://hx.test${u.pathname}`, req, body) });
        try {
          log.push({ type: 'stay-post', via: via(req), action: body.action, id: body.id || '', clientRef: body.clientRef || '', status: out.status, body: await out.clone().json().catch(() => ({})) });
        } catch (_) {
          log.push({ type: 'stay-post', via: via(req), action: body.action, id: body.id || '', clientRef: body.clientRef || '', status: out.status });
        }
        if (req.method === 'POST' && hooks.dropStayResponse && hooks.dropStayResponse(body)) {
          // Genuine lost response: the booking is already durable (handler
          // ran above), but the client receives a truncated body on a reset
          // connection. A bare socket.destroy() is NOT enough — Chrome
          // transparently retries a POST that never got a response byte, so
          // the loss must start mid-body, after the response has begun.
          log.push({ type: 'stay-response-dropped', clientRef: body.clientRef });
          const full = JSON.stringify({ ok: true });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': full.length + 64 });
          res.write(full.slice(0, 4));
          setTimeout(() => { try { req.socket.destroy(); } catch (_) {} }, 50);
          return;
        }
        return sendHandler(res, out);
      }
      if (u.pathname === '/api/hotel/commercial') {
        if (req.method === 'GET') {
          const out = await getCommercial({ env, request: toHandlerRequest(`https://hx.test${req.url}`, req) });
          return sendHandler(res, out);
        }
        const body = await readJson(req);
        if (req.method === 'POST' && body && body.action === 'quote') {
          const out = await postCommercial({ env, request: toHandlerRequest(`https://hx.test${u.pathname}`, req, body) });
          const data = await out.clone().json().catch(() => ({}));
          log.push({ type: 'commercial-quote', accountId: body.accountId || null, roomTypeId: body.roomTypeId, occupancy: body.occupancy, board: body.board, checkIn: body.checkIn, checkOut: body.checkOut, status: out.status, error: data.error || '', rev: data.rev, hasQuote: !!data.quote, keys: Object.keys(data) });
          if (hooks.afterQuoteResponse) await hooks.afterQuoteResponse(log.filter((e) => e.type === 'commercial-quote').length, data, body);
          return sendHandler(res, out);
        }
        const out = await postCommercial({ env, request: toHandlerRequest(`https://hx.test${u.pathname}`, req, body) });
        try {
          const wd = await out.clone().json().catch(() => ({}));
          log.push({ type: 'commercial-write', action: body && body.action, status: out.status, error: wd.error || '', rev: wd.rev });
        } catch (_) {
          log.push({ type: 'commercial-write', action: body && body.action, status: out.status });
        }
        return sendHandler(res, out);
      }
      const file = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('nope');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      try { res.writeHead(500); res.end('adapter fault'); } catch (_) {}
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, log, base: `http://127.0.0.1:${server.address().port}` };
}

/* ── per-test context ──────────────────────────────────────────────── */
let browser = null;
const ACC = 'acc-grp-test';
const MERCHANT = 'hotel-grp-test';

async function withCtx(options, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-grp-'));
  const made = makeEnv(path.join(dir, 'test.db'));
  seedMerchant(made, MERCHANT, ACC);
  const sessionValue = await makeSession(ACC, SECRET);
  const hooks = options.hooks || {};
  const { server, log, base } = await startOrigin(made.env, hooks);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCookie({ name: SESS_COOKIE, value: sessionValue, url: base });
  if (options.blockStorage) {
    await page.evaluateOnNewDocument((pattern) => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (new RegExp(pattern).test(String(k))) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        return real.call(this, k, v);
      };
    }, options.blockStorage);
  }
  await page.goto(`${base}/hx-test?merchant=${MERCHANT}`, { waitUntil: 'load' });
  await page.evaluate((doc) => localStorage.setItem('kiwi:hotel-rooms:v2:hx-group-venue', JSON.stringify(doc)), clientRoomsDoc());
  const ctx = {
    page, context, server, log, base, sessionValue, dir, hooks,
    async apiStays(params, method = 'GET', body) {
      const res = await fetch(`${base}/api/hotel/stays${params}`, {
        method, headers: { 'Content-Type': 'application/json', Cookie: `${SESS_COOKIE}=${sessionValue}`, 'x-hx-via': 'driver' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    },
    async apiCommercial(body) {
      const res = await fetch(`${base}/api/hotel/commercial`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${SESS_COOKIE}=${sessionValue}`, 'x-hx-via': 'driver' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    },
    async bookingsByDossier(dossierId) {
      const r = await ctx.apiStays(`?merchant=${MERCHANT}&dossierId=${encodeURIComponent(dossierId)}&includeCancelled=1`);
      assert.equal(r.status, 200, 'dossier read works');
      return r.json.stays || [];
    },
  };
  try {
    await fn(ctx);
  } finally {
    try { await context.close(); } catch (_) {}
    await new Promise((r) => server.close(r));
    try { made.sql.close(); } catch (_) {}
  }
}

/* ── modal driver ──────────────────────────────────────────────────── */
const SEL = {
  form: '[data-hx-group-form]',
  err: '[data-hx-group-error]',
  submit: '[data-hx-group-submit]',
  simulate: '[data-action="hx-simulate-group-quote"]',
  accept: '[data-hx-group-accept-quote]',
  breakdown: '[data-hx-quote-breakdown]',
  toasts: () => {},
};

async function openModal(page) {
  await page.evaluate(() => window.Kiwi.handlers['hx-group-new']());
  await page.waitForSelector(SEL.form, { timeout: 15000 });
}

async function setField(page, selector, value) {
  await page.$eval(selector, (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function fillBasics(page, d) {
  await setField(page, 'input[name="groupName"]', d.groupName);
  await setField(page, 'input[name="checkIn"]', d.checkIn);
  await setField(page, 'input[name="checkOut"]', d.checkOut);
  await setField(page, 'input[name="contactName"]', d.contactName);
  await setField(page, 'input[name="contactPhone"]', d.contactPhone);
  await setField(page, 'input[name="contactEmail"]', d.contactEmail);
  if (d.channel) await setField(page, 'select[name="channel"]', d.channel);
  if (d.accountId) await setField(page, 'select[name="accountId"]', d.accountId);
  if (d.board) await setField(page, 'select[name="board"]', d.board);
}

async function selectRooms(page, ...nums) {
  for (const n of nums) {
    await page.click(`input[data-hx-group-cb][value="room:${n}"]`);
  }
}

async function travelerRows(page) {
  return page.$$('[data-hx-group-traveler]');
}

async function fillTraveler(page, idx, { name, roomN }) {
  const rows = await travelerRows(page);
  assert.ok(rows[idx], `traveler row ${idx} exists`);
  await rows[idx].$eval('[data-hx-t-name]', (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
  if (roomN) {
    await rows[idx].$eval('[data-hx-t-room]', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, `room:${roomN}`);
  }
}

async function submitAndSettle(page, timeout = 25000) {
  await page.click(SEL.submit);
  return page.waitForFunction(() => {
    if (!document.querySelector('[data-hx-group-form]')) return 'closed';
    const err = document.querySelector('[data-hx-group-error]');
    const btn = document.querySelector('[data-hx-group-submit]');
    if (err && err.textContent && err.textContent.indexOf('Contrôle des disponibilités') !== 0 && btn && !btn.disabled) {
      return 'settled:' + err.textContent;
    }
    return false;
  }, { timeout }).then((h) => h.jsonValue()).catch(() => 'timeout');
}

async function readError(page) {
  return page.$eval(SEL.err, (el) => el.textContent || '');
}

async function simulateAndAccept(page) {
  await page.click(SEL.simulate);
  await page.waitForSelector(SEL.accept, { timeout: 15000 });
  await page.click(SEL.accept);
}

function dossierOf(ctx) {
  return ctx.page.evaluate(() => {
    const code = document.querySelector('[data-hx-group-review] code');
    return code ? code.textContent.trim() : '';
  });
}

const BASICS = () => ({
  groupName: 'Séminaire Atlas',
  checkIn: ymd(7),
  checkOut: ymd(9),
  contactName: 'Yasmine El Amrani',
  contactPhone: '+212661000001',
  contactEmail: 'yasmine@example.ma',
  channel: 'direct',
});

function failRoomOnce(clientRefSuffix) {
  let n = 0;
  const f = (body) => {
    if (body && body.clientRef && body.clientRef.endsWith(clientRefSuffix) && n++ === 0) return true;
    return false;
  };
  f.status = 409;
  f.error = 'room-unavailable';
  return f;
}

async function twoRoomSetup(page, d, commercial) {
  await openModal(page);
  await fillBasics(page, d);
  if (commercial) {
    await setField(page, 'select[name="accountId"]', 'acc-agency-01');
    await setField(page, 'select[name="board"]', 'hb_dinner');
  }
  await selectRooms(page, 101, 102);
  await page.click('[data-action="hx-add-group-traveler"]');
  await fillTraveler(page, 0, { name: 'Karim Benchekroun', roomN: 101 });
  await fillTraveler(page, 1, { name: 'Salma El Fassi', roomN: 102 });
  if (commercial) await simulateAndAccept(page);
  return dossierOf({ page });
}

function displayedGroupTotal(page) {
  return page.$eval(SEL.breakdown, (el) => {
    const m = (el.textContent || '').match(/Total commercial groupe\s*:\s*([\d.,]+)\s*MAD/);
    return m ? Number(m[1].replace(',', '.')) : null;
  });
}

async function bumpContract(ctx) {
  const g = await fetch(`${ctx.base}/api/hotel/commercial?merchant=${MERCHANT}`, {
    headers: { Cookie: `${SESS_COOKIE}=${ctx.sessionValue}` },
  }).then((r) => r.json());
  const contract = g.contracts.find((c) => c.id === 'ctr-000001');
  const up = await ctx.apiCommercial({
    merchant: MERCHANT, action: 'contract', rev: g.rev,
    item: { ...contract, amountCents: contract.amountCents + 10000 },
  });
  assert.equal(up.status, 200, 'contract bump lands a new directory revision');
  return up.json.rev;
}

async function apiCancelStay(ctx, id) {
  const r = await ctx.apiStays(`?merchant=${MERCHANT}`, 'POST', { merchant: MERCHANT, action: 'cancel', id });
  assert.equal(r.status, 200, 'external cancellation lands');
  return r.json.booking;
}

async function apiRenameGuest(ctx, id, from, to) {
  const cur = await ctx.apiStays(`?merchant=${MERCHANT}&id=${encodeURIComponent(id)}`);
  assert.equal(cur.status, 200, 'booking readable before external edit');
  const b = cur.json.stays[0];
  const guests = b.guests.map((g) => (g.name === from ? { ...g, name: to } : g));
  const r = await ctx.apiStays(`?merchant=${MERCHANT}`, 'POST', {
    merchant: MERCHANT, id: b.id, clientRef: b.publicRef, roomTypeId: b.serviceId, resourceId: b.resourceId,
    checkIn: b.hotel.checkIn, checkOut: b.hotel.checkOut, partySize: b.partySize,
    status: b.status, channel: b.hotel.channel,
    customer: b.customer, guests, dossierId: b.hotel.dossierId, groupName: b.hotel.groupName,
  });
  assert.equal(r.status, 200, 'external guest edit lands');
  return r.json.booking;
}

function stayPostsFor(log, suffix) {
  return log.filter((e) => e.type === 'stay-post' && (!e.action || e.action === 'save') && String(e.clientRef || '').endsWith(suffix));
}

/* ── launch · one browser for all scenarios ────────────────────────── */
console.log('\n■ launch · one browser for all scenarios');
browser = await puppeteer.launch({
  executablePath: CHROME_BIN,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
console.log('  (browser ready)');

/* ── T1 · room-only partial failure → immediate retry ─────────────── */
console.log('\n■ T1 · room-only partial failure, immediate retry keeps frozen terms');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  step('first attempt: room 102 rejected once');
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'first attempt settles with a room error');
  ok(/102/.test(await readError(page)), 'error names the failed room');
  const frozen = await page.$eval('input[name="checkIn"]', (el) => ({ value: el.value, disabled: el.disabled }));
  ok(frozen.disabled && frozen.value === d.checkIn, 'dates stay visible but locked');
  const lockedAccount = await page.$eval('select[name="accountId"]', (el) => el.disabled);
  ok(lockedAccount === true, 'commercial identity locks with the first saved room');
  step('immediate retry');
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'retry completes without a date error (no null dates from locked fields)');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 2, 'both rooms booked under one dossier');
  for (const s of stays) {
    ok(s.hotel.checkIn === d.checkIn && s.hotel.checkOut === d.checkOut, 'original dates preserved exactly');
    ok(s.hotel.groupName === d.groupName, 'group name preserved exactly');
    ok(s.commercial?.booker === d.contactName, 'booker contact preserved exactly');
    ok(s.customer.phone === d.contactPhone && s.customer.email === d.contactEmail, 'contact coordinates preserved exactly');
  }
  const names = stays.flatMap((s) => s.guests.map((g) => g.name));
  ok(names.includes('Karim Benchekroun') && names.includes('Salma El Fassi'), 'travelers preserved');
});

/* ── T2 · room-only reload recovery ────────────────────────────────── */
console.log('\n■ T2 · room-only partial failure, reload, retry completes');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'first attempt partially fails');
  step('reload, reopen, retry from the draft cache');
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const restored = await page.$eval('input[name="checkIn"]', (el) => ({ value: el.value, disabled: el.disabled }));
  ok(restored.disabled && restored.value === d.checkIn, 'frozen dates restore visible and locked');
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'post-reload retry completes (retry is not blocked)');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 2, 'both rooms booked, no duplicates');
  ok(new Set(stays.map((s) => s.publicRef)).size === 2, 'stable identities, one booking per room');
});

/* ── T3 · commercial immediate retry, totals equal accepted ────────── */
console.log('\n■ T3 · commercial partial failure, immediate retry, totals match');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, { ...d, accountId: 'acc-agency-01', board: 'hb_dinner' }, true);
  const shown = await displayedGroupTotal(page);
  ok(shown === 3400, `accepted total displayed (got ${shown})`);
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'first attempt partially fails');
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'immediate retry completes');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 2, 'both rooms booked');
  const savedTotal = stays.reduce((s, b) => s + Number(b.commercial?.quote?.totalCents || 0), 0) / 100;
  ok(savedTotal === shown, `saved totals equal the accepted total (${savedTotal} MAD)`);
  for (const s of stays) {
    ok(s.commercial?.accountId === 'acc-agency-01' && s.commercial?.board === 'hb_dinner', 'account and meal plan preserved');
  }
});

/* ── T4 · commercial reload recovery ───────────────────────────────── */
console.log('\n■ T4 · commercial partial failure, reload, retry, totals match');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, { ...d, accountId: 'acc-agency-01', board: 'hb_dinner' }, true);
  const shown = await displayedGroupTotal(page);
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'first attempt partially fails');
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const stillAccepted = await page.$eval(SEL.accept, (el) => el.checked).catch(() => null);
  ok(stillAccepted === true, 'accepted quote position survives reload');
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'post-reload retry completes');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 2, 'both rooms booked, no duplicates');
  const savedTotal = stays.reduce((s, b) => s + Number(b.commercial?.quote?.totalCents || 0), 0) / 100;
  ok(savedTotal === shown, `saved totals equal the accepted total (${savedTotal} MAD)`);
});

/* ── T5 · staged-write failure → intent-only recovery, lost response ─ */
console.log('\n■ T5 · staged write fails, response lost, reload recovers from intent');
await withCtx({
  blockStorage: 'kiwi:hotel-group-staged',
  hooks: {
    dropStayResponse: (() => { let n = 0; return () => n++ === 0; })(),
  },
}, async (ctx) => {
  const { page, log } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  step('submit: room 101 succeeds server-side but its response is lost');
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'attempt settles with a room error');
  ok(/101/.test(await readError(page)), 'error names room 101');
  const warned = await page.evaluate(() => window.__toasts.map((t) => t.message).join(' | '));
  ok(/Brouillon local/.test(warned), 'operator is told the draft cache failed but recovery stands');
  let stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 1 && stays[0].resourceId === 'room:101', 'room 101 is on the server despite the lost response');
  const room1Id = stays[0].id;
  step('reload with no staged record: intent alone must drive recovery');
  const stagedKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kiwi:hotel-group-staged')));
  ok(stagedKeys.length === 0, 'no staged record could persist (blocked storage)');
  const intentKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kiwi_hx_intent_')));
  ok(intentKeys.length === 1, 'the authoritative intent did persist');
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'intent-only retry completes');
  stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 2, 'both rooms booked exactly once');
  ok(stays.some((s) => s.id === room1Id), 'room 101 adopted by identity, not recreated');
  ok(stayPostsFor(log, 'room_101').length === 1, 'no duplicate POST for the adopted room');
  ok(stayPostsFor(log, 'room_102').length === 1, 'room 102 posted exactly once');
});

/* ── T6 · intent-write failure → zero writes ───────────────────────── */
console.log('\n■ T6 · intent write fails: nothing is written, message is clear');
await withCtx({ blockStorage: 'kiwi_hx_intent_' }, async (ctx) => {
  const { page, log } = ctx;
  await twoRoomSetup(page, BASICS(), false);
  const r = await submitAndSettle(page);
  ok(String(r).startsWith('settled:'), 'submission settles');
  ok(/intention/i.test(await readError(page)), 'message names the unsecured intent');
  ok(!log.some((e) => e.type === 'stay-post'), 'zero booking writes reached the server');
  const all = await ctx.apiStays(`?merchant=${MERCHANT}&includeCancelled=1`);
  ok(all.status === 200 && (all.json.stays || []).length === 0, 'no booking exists server-side');
});
/* ── T7 · externally cancelled room is reported, never confirmed ─── */
console.log('\n■ T7 · cancellation on another device surfaces, booking untouched');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page, log } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  const r1 = await submitAndSettle(page);
  ok(String(r1).startsWith('settled:'), 'first attempt partially fails');
  let stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 1 && stays[0].resourceId === 'room:101', 'room 101 saved');
  step('another device cancels room 101');
  await apiCancelStay(ctx, stays[0].id);
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const r2 = await submitAndSettle(page);
  ok(String(r2).startsWith('settled:'), 'retry settles instead of confirming');
  ok(/annul/.test(await readError(page)), 'error reports the cancellation');
  stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 1 && stays[0].status === 'cancelled', 'cancelled booking kept, nothing recreated');
  ok(!log.some((e) => e.type === 'stay-post' && e.via !== 'driver' && (e.action === 'cancel' || /delete/i.test(e.action || ''))), 'recovery never cancels or deletes');
  ok(stayPostsFor(log, 'room_102').length === 0, 'room 102 never attempted after the stop');
});

/* ── T8 · server-changed travelers fail loudly ─────────────────────── */
console.log('\n■ T8 · changed traveler details are caught, booking untouched');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  await submitAndSettle(page);
  let stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 1, 'room 101 saved');
  step('another device renames the traveler');
  await apiRenameGuest(ctx, stays[0].id, 'Karim Benchekroun', 'Karim Benali');
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const r2 = await submitAndSettle(page);
  ok(String(r2).startsWith('settled:'), 'retry settles instead of adopting');
  ok(/oyageurs/.test(await readError(page)), 'error names the guest mismatch');
  stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 1, 'no duplicate booking created');
  ok(stays[0].guests.some((g) => g.name === 'Karim Benali'), 'server version left untouched, not reverted');
});

/* ── T9 · compatible state adopts without a duplicate POST ─────────── */
console.log('\n■ T9 · compatible server state adopts, no duplicate write');
await withCtx({ hooks: { failStayPost: failRoomOnce('room_102') } }, async (ctx) => {
  const { page, log } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, d, false);
  await submitAndSettle(page);
  const before = await ctx.bookingsByDossier(dossier);
  ok(before.length === 1, 'room 101 saved');
  await page.reload({ waitUntil: 'load' });
  await openModal(page);
  const r2 = await submitAndSettle(page);
  ok(r2 === 'closed', 'retry completes');
  const after = await ctx.bookingsByDossier(dossier);
  ok(after.length === 2, 'both rooms booked');
  ok(after.some((s) => s.id === before[0].id), 'room 101 adopted by identity');
  ok(stayPostsFor(log, 'room_101').length === 1, 'no second POST for the adopted room');
});

/* ── T10 · contract change between quote responses ─────────────────── */
console.log('\n■ T10 · mixed revisions reject the simulation, submit blocked');
await withCtx({ hooks: {} }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, { ...d, accountId: 'acc-agency-01', board: 'hb_dinner' }, false);
  step('contract changes between the two room quote responses');
  let bumped = false;
  ctx.hooks.afterQuoteResponse = async (count) => {
    if (count === 1 && !bumped) { bumped = true; await bumpContract(ctx); }
  };
  await page.click('[data-action="hx-simulate-group-quote"]');
  await page.waitForFunction(() => {
    const area = document.querySelector('[data-hx-quote-breakdown]');
    return area && /changé pendant la simulation/.test(area.textContent || '');
  }, { timeout: 15000 });
  ok(bumped, 'contract moved exactly between the two responses');
  const breakdown = await page.$eval('[data-hx-quote-breakdown]', (el) => el.textContent || '');
  ok(/changé pendant la simulation/.test(breakdown), 'simulation rejected on revision move');
  ok((await page.$('[data-hx-group-accept-quote]')) === null, 'no acceptance possible on a mixed quote');
  const r = await submitAndSettle(page);
  ok(String(r).startsWith('settled:'), 'submit settles');
  ok(/simuler et accepter/.test(await readError(page)), 'submit blocked without an accepted quote');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 0, 'nothing booked from a mixed revision');
});

/* ── T11 · accept, then contract change → submit blocked ───────────── */
console.log('\n■ T11 · accepted quote invalidated by a later contract change');
await withCtx({ hooks: {} }, async (ctx) => {
  const { page } = ctx;
  const d = BASICS();
  const dossier = await twoRoomSetup(page, { ...d, accountId: 'acc-agency-01', board: 'hb_dinner' }, true);
  ok((await page.$('[data-hx-group-accept-quote]')) !== null, 'quote accepted');
  step('contract changes after acceptance');
  await bumpContract(ctx);
  const r = await submitAndSettle(page);
  ok(String(r).startsWith('settled:'), 'submit settles');
  ok(/répertoire commercial a changé/.test(await readError(page)), 'submit blocked with a revision message, nothing saved blindly');
  const stays = await ctx.bookingsByDossier(dossier);
  ok(stays.length === 0, 'no booking saved with a stale total');
  ok((await page.$('[data-hx-group-accept-quote]')) === null, 'acceptance cleared, simulation required again');
});

/* ── T12 · tenant isolation over HTTP ──────────────────────────────── */
console.log('\n■ T12 · tenant isolation holds');
await withCtx({ hooks: {} }, async (ctx) => {
  const foreign = await ctx.apiStays('?merchant=hotel-foreign');
  ok(foreign.status === 401, 'foreign merchant reads 401');
  const { page } = ctx;
  const cross = await page.evaluate(async () => {
    const r = await fetch('/api/hotel/stays?merchant=hotel-foreign&includeCancelled=1', { cache: 'no-store' });
    return r.status;
  });
  ok(cross === 401, 'browser cross-tenant read 401s too');
});

/* ── summary ───────────────────────────────────────────────────────── */
console.log(`\n✓ All ${controls} group browser workflow controls passed.`);
if (browser) { try { await browser.close(); } catch (_) {} }
