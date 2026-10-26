#!/usr/bin/env node
// Parcours hôtel FR : vrai dashboard, adaptateur D1/SQLite dérivé des suites hôtel existantes.
// Les seules données injectées sont le compte synthétique, sa session et son plan initial.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession } from '../functions/auth/_lib.js';
import { onRequestGet as meGet } from '../functions/api/me.js';
import { onRequestPost as pinVerify } from '../functions/api/pin/verify.js';
import { onRequestGet as configGet, onRequestPost as configPost } from '../functions/api/config.js';
import { onRequestGet as storeGet, onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestGet as operationsGet, onRequestPost as operationsPost } from '../functions/api/operations.js';
import { onRequestGet as saleCancelGet } from '../functions/api/sale/cancel.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { onRequestGet as getCommercial, onRequestPost as postCommercial } from '../functions/api/hotel/commercial.js';
import { onRequestGet as catalogGet, onRequestPost as catalogPost } from '../functions/api/catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SECRET = 'hotel-direct-browser-secret-0123456789abcdef';
const SESS_COOKIE = 'kiwi_sess';
const ACC = 'acc-direct-ux';
const MERCHANT = 'hotel-direct-ux';
const VENUE = 'v-hotel-direct';

import { suite, secretFromEnv, fillSecret } from './browser-trace.mjs';
import { LOCALES } from './test-locales.mjs';
import { randomInt } from 'node:crypto';
import { onRequestPost as salePost } from '../functions/api/sale.js';
process.env.KIWI_HOTEL_JOURNEY_PIN ||= String(randomInt(1000, 10000));
const staffCode = secretFromEnv('personnel synthétique', 'KIWI_HOTEL_JOURNEY_PIN');
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
  for (const b of [path.join(ROOT, 'app', 'package.json'), path.join(ROOT, 'package.json')]) {
    try {
      const req = createRequire(b);
      const mod = await import(pathToFileURL(req.resolve('puppeteer-core')).href);
      return mod.default || mod;
    } catch (_) {}
  }
  return null;
}

const CHROME_BIN = findChromium();
const puppeteer = CHROME_BIN ? await loadPuppeteer() : null;
if (!CHROME_BIN || !puppeteer) {
  console.error('Chromium et puppeteer-core sont requis pour vérifier le parcours hôtel.');
  process.exit(3);
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

const ymd = (plusDays) => new Date(Date.now() + plusDays * 86400000).toISOString().slice(0, 10);

function seedMerchant(made, withLunch) {
  const now = Date.now();
  const { sql } = made;
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACC, 'direct-ux@test.ma', 'Direct Owner', 'Hotel Direct UX', 's', 'h', now);
  sql.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .run('pin-ux-1', MERCHANT, process.env.KIWI_HOTEL_JOURNEY_PIN, 'Owner', 'owner', now);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'hotel', ACC, 'Hotel Direct UX', 'active', now);
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'reservations', JSON.stringify({ v: 1, settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 }, services: [], resources: [], blocked: [], bookings: [] }), 1, now);
  const t1Boards = { bb: 150, hb_dinner: 280, full_board: 450 };
  if (withLunch) t1Boards.hb_lunch = 220;
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'rooms', JSON.stringify({
      v: 4, baseRate: 700,
      roomTypes: [
        { id: 'type:t1', name: 'Chambre Double', rate: 900, maxGuests: 2, boardRates: t1Boards },
        { id: 'type:t2', name: 'Suite Familiale', rate: 1800, maxGuests: 5, boardRates: { bb: 150 } },
        { id: 'type:t3', name: 'Chambre Eco', rate: 500, maxGuests: 2 },
      ],
      rooms: [
        { id: 'room:101', n: 101, typeId: 'type:t1', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [] },
        { id: 'room:102', n: 102, typeId: 'type:t1', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [] },
        { id: 'room:201', n: 201, typeId: 'type:t2', floor: 'Étage 2', floorId: 'fl2', status: 'libre', connectingRoomIds: [] },
        { id: 'room:301', n: 301, typeId: 'type:t3', floor: 'Étage 3', floorId: 'fl3', status: 'libre', connectingRoomIds: [] },
      ],
      floors: [
        { id: 'fl1', name: 'Étage 1', order: 0 },
        { id: 'fl2', name: 'Étage 2', order: 1 },
        { id: 'fl3', name: 'Étage 3', order: 2 },
      ],
      folios: [],
    }), 1, now);
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'hotel-commercial', JSON.stringify({
      v: 1,
      accounts: [{ id: 'acc-agency-01', kind: 'agency', name: 'Atlas Voyages', legalName: '', address: '', city: 'Marrakech', country: 'Maroc', ice: '', taxId: '', rc: '', contact: 'M. Amrani', email: 'a@atlas.ma', phone: '+212661000002', paymentDays: 30, notes: '', archived: false }],
      contracts: [{ id: 'ctr-000001', name: 'Séminaire 2026', accountId: 'acc-agency-01', roomTypeId: 'type:t1', from: ymd(5), to: ymd(30), occupancy: 1, board: 'hb_dinner', unit: 'room', amountCents: 85000, taxBasis: 'inclusive', currency: 'MAD', archived: false }],
    }), 1, now);
}

function clientRoomsDoc(withLunch) {
  const t1Boards = { bb: 150, hb_dinner: 280, full_board: 450 };
  if (withLunch) t1Boards.hb_lunch = 220;
  const ts = Date.now();
  return {
    v: 4,
    rooms: [
      { id: 'room:101', n: 101, typeId: 'type:t1', typeName: 'Chambre Double', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [], updatedAt: ts },
      { id: 'room:102', n: 102, typeId: 'type:t1', typeName: 'Chambre Double', floor: 'Étage 1', floorId: 'fl1', status: 'libre', connectingRoomIds: [] },
      { id: 'room:201', n: 201, typeId: 'type:t2', typeName: 'Suite Familiale', floor: 'Étage 2', floorId: 'fl2', status: 'libre', connectingRoomIds: [] },
      { id: 'room:301', n: 301, typeId: 'type:t3', typeName: 'Chambre Eco', floor: 'Étage 3', floorId: 'fl3', status: 'libre', connectingRoomIds: [] },
    ],
    roomTypes: [
      { id: 'type:t1', name: 'Chambre Double', rate: 900, maxGuests: 2, boardRates: t1Boards, updatedAt: ts },
      { id: 'type:t2', name: 'Suite Familiale', rate: 1800, maxGuests: 5, boardRates: { bb: 150 }, updatedAt: ts },
      { id: 'type:t3', name: 'Chambre Eco', rate: 500, maxGuests: 2, updatedAt: ts },
    ],
    floors: [
      { id: 'fl1', name: 'Étage 1', order: 0, updatedAt: ts },
      { id: 'fl2', name: 'Étage 2', order: 1, updatedAt: ts },
      { id: 'fl3', name: 'Étage 3', order: 2, updatedAt: ts },
    ],
    views: ['mer', 'jardin'],
    folios: [],
    baseRate: 700,
  };
}

/* ── test origin: static repo + real API handlers ──────────────────── */
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

async function sendHandler(res, out) {
  const buf = Buffer.from(await out.arrayBuffer());
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  delete headers['content-length'];
  res.writeHead(out.status, { 'Content-Type': 'application/json', ...headers });
  res.end(buf);
}

function via(req) {
  return req.headers['x-hx-via'] === 'driver' ? 'driver' : 'browser';
}

async function startOrigin(env, hooks = {}) {
  const log = [];
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      const route = async (fn) => {
        const body = req.method === 'POST' ? await readJson(req) : undefined;
        const out = await fn({ env, request: toHandlerRequest(`https://hx.test${u.pathname}${u.search}`, req, body) });
        return sendHandler(res, out);
      };
      if (u.pathname === '/api/sale' && req.method === 'POST') return route(salePost);
      if (u.pathname === '/api/me' && req.method === 'GET') return route(meGet);
      if (u.pathname === '/api/pin/verify' && req.method === 'POST') return route(pinVerify);
      if (u.pathname === '/api/config' && req.method === 'GET') return route(configGet);
      if (u.pathname === '/api/config' && req.method === 'POST') return route(configPost);
      if (u.pathname === '/api/store' && req.method === 'GET') return route(storeGet);
      if (u.pathname === '/api/store' && req.method === 'POST') return route(storePost);
      if (u.pathname === '/api/catalog' && req.method === 'GET') return route(catalogGet);
      if (u.pathname === '/api/catalog' && req.method === 'POST') return route(catalogPost);
      if (u.pathname === '/api/operations' && req.method === 'GET') return route(operationsGet);
      if (u.pathname === '/api/operations' && req.method === 'POST') return route(operationsPost);
      if (u.pathname === '/api/sale/cancel' && req.method === 'GET') return route(saleCancelGet);
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
        log.push({ type: 'stay-post', via: via(req), action: body.action, id: body.id || '', clientRef: body.clientRef || '' });
        const out = await saveStay({ env, request: toHandlerRequest(`https://hx.test${u.pathname}`, req, body) });
        try {
          log.push({ type: 'stay-post-done', via: via(req), clientRef: body.clientRef || '', status: out.status, body: await out.clone().json().catch(() => ({})) });
        } catch (_) {}
        if (req.method === 'POST' && hooks.dropStayResponse && hooks.dropStayResponse(body)) {
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
        log.push({ type: 'commercial-post', via: via(req), action: body && body.action });
        const out = await postCommercial({ env, request: toHandlerRequest(`https://hx.test${u.pathname}`, req, body) });
        return sendHandler(res, out);
      }
      if (process.argv.includes('--serve-ui-qa') &&
          u.pathname !== '/dashboard.html' &&
          u.pathname !== '/dashboard.webmanifest' &&
          u.pathname !== '/kiwi-sw.js' &&
          !u.pathname.startsWith('/assets/')) {
        res.writeHead(404); res.end('not a public fixture asset'); return;
      }
      const file = path.resolve(ROOT, '.' + decodeURIComponent(u.pathname));
      const insideRoot = file.startsWith(ROOT + path.sep);
      const insidePublicAssets = file.startsWith(path.join(ROOT, 'assets') + path.sep);
      if (!insideRoot || (process.argv.includes('--serve-ui-qa') && u.pathname.startsWith('/assets/') && !insidePublicAssets) ||
          !fs.existsSync(file) || !fs.statSync(file).isFile()) {
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

const browser = await puppeteer.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const journey = suite('hotel-journey', { browser });
for (const locale of LOCALES.filter(l => l === 'fr')) for (const [device, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['phone', 390, 844]].filter(([device]) => !process.env.KIWI_HOTEL_VIEWPORT || process.env.KIWI_HOTEL_VIEWPORT === device)) {
  await journey.run(`${locale}-${device}`, async t => {
    const step = label => { t.step(label); console.log('  · ' + device + ' · ' + label); };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-hotel-journey-'));
    const made = makeEnv(path.join(dir, 'hotel.sqlite'));
    seedMerchant(made, false);
    const { server, base, log } = await startOrigin(made.env);
    t.defer(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); made.sql.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    const context = await browser.createBrowserContext();
    t.defer(() => context.close());
    const page = t.watch(await context.newPage());
    await page.setViewport({ width, height, isMobile: device === 'phone', hasTouch: device !== 'desktop' });
    await page.setCookie({ name: SESS_COOKIE, value: await makeSession(ACC, SECRET), url: base });
    await page.evaluateOnNewDocument(() => localStorage.setItem('kiwiLang', 'fr'));
    const click = async selector => {
      selector = selector.replace(/\[data-action="nav-([^"\]]+)"\]/g, '[data-nav="$1"]');
      if (selector.startsWith('[data-nav=') && width <= 860 && !await page.evaluate(() => document.body.classList.contains('kw-menu-open'))) {
        await page.click('[data-kw-tab="menu"]');
        await page.waitForFunction(() => document.body.classList.contains('kw-menu-open'));
        await new Promise(r => setTimeout(r, 500));
      }
      let el = await page.waitForSelector(selector, { visible: true });
      await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
      if (!await el.evaluate(e => e.isConnected)) el = await page.waitForSelector(selector, { visible: true });
      const box = await el.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, `Commande accessible : ${selector} ${JSON.stringify(box)}`);
      const hit = await el.evaluate(e => { const r=e.getBoundingClientRect(), target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return { ok: e === target || e.contains(target), obstacle: target?.className || target?.tagName }; });
      assert(hit.ok, 'Commande masquée : ' + selector + ' · ' + hit.obstacle);
      await el.click();
      if (selector.startsWith('[data-nav=') && width <= 860) await page.waitForFunction(() => !document.body.classList.contains('kw-menu-open'));
    };
    const unlock = async () => {
      await page.waitForSelector('[data-kiwi-pin-input]');
      if (await page.evaluate(() => {const e=document.querySelector('[data-kiwi-lock]'); return e && getComputedStyle(e).display !== 'none';})) {
        // Le champ natif est invisible derrière les quatre cellules du clavier.
        const input = await page.$('[data-kiwi-pin-input]');
        await fillSecret(page, { click: () => input.focus(), type: value => input.type(value, { delay: 90 }) }, staffCode);
        await page.waitForFunction(() => {const e=document.querySelector('[data-kiwi-lock]'); return !e || getComputedStyle(e).display === 'none';});
      }
    };
    const open = async () => {
      await page.goto(`${base}/dashboard.html`, { waitUntil: 'load' });
      await unlock();
      await page.waitForFunction(() => !document.querySelector('.app.kw-app-hidden') && !document.querySelector('[data-kiwi-greet].is-visible'));
      if (width <= 860 && await page.$eval('.sidebar', e => e.inert)) { await page.click('[data-kw-tab="menu"]'); await new Promise(r => setTimeout(r, 450)); }
      await page.click('[data-action="venue-toggle"]');
      await page.waitForSelector('[data-action="venue-pick"][data-venue^="v-"]');
      await page.click('[data-action="venue-pick"][data-venue^="v-"]');
      await page.evaluate(doc => localStorage.setItem('kiwi:hotel-rooms:v2:' + (() => { const id=window.KiwiVenue.getVenue(); return ['own','scoped'].includes(id) ? id + ':' + window.KiwiVenue.getCurrentVenueData().slug : id; })(), JSON.stringify(doc)), clientRoomsDoc(false));
      await page.reload({ waitUntil: 'load' });
      await unlock();
      await page.waitForFunction(() => !document.querySelector('.app.kw-app-hidden') && !document.querySelector('[data-kiwi-greet].is-visible'));
      // Le tiroir de navigation est également celui utilisé sur téléphone.
      await page.waitForFunction(() => !!window.Kiwi?.handlers?.['nav-reception']);
      await click('[data-action="nav-reception"]');
      await page.waitForSelector('[data-hx-daily-view]');
    };
    step('Ouvrir la réception hôtel');
    // coverage: surface=dashboard-hotel locale=fr viewport=desktop
    // coverage: surface=dashboard-hotel locale=fr viewport=tablet
    // coverage: surface=dashboard-hotel locale=fr viewport=phone
    await open();

    step('Installer le client en walk-in, règlement de la nuit en espèces');
    await click('[data-action="nav-chambres"]');
    await click('[data-action="hx-room"][data-arg="101"]');
    await click('[data-action="hx-walkin-room"][data-arg="101"]');
    await new Promise(r => setTimeout(r, 1500));
    await click('[data-action="hx-walkin-room"][data-arg="101|cash"]');
    await page.waitForFunction(() => !document.querySelector('[data-action="hx-walkin-room"]'));
    const rooms = () => JSON.parse(made.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(MERCHANT).data);
    const stays = () => JSON.parse(made.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='reservations'").get(MERCHANT).data).bookings;
    const wait = async fn => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('Persistance serveur non reçue : ' + JSON.stringify({stays: stays().map(b=>b.status), folios: rooms().folios?.length, posts:log.map(l=>[l.type,l.action,l.status])})); };
    await wait(() => rooms().folios?.some(f => f.room === 101));
    const stay = stays().find(b => b.resourceId === 'room:101');
    assert.equal(stay.status, 'checked_in');
    assert.equal(rooms().folios.find(f => f.room === 101).stayId, stay.id);
    step('Ajouter une charge au folio');
    await click('[data-action="nav-folios"]');
    await click('[data-action="hx-folio"][data-arg="101"]');
    await click('[data-action="hx-add-charge"]');
    await click('[data-action="hx-post-charge"][data-arg="101|0"]');
    await wait(() => rooms().folios.find(f => f.room === 101)?.lines.some(l => l.src === 'resto'));
    const f = rooms().folios.find(f => f.room === 101);
    const cents = f.lines.reduce((n,l) => n + Math.round(l.amt * 100), 0);
    const paid = f.lines.filter(l => l.paid).reduce((n,l) => n + Math.round(l.amt * 100), 0);
    assert.equal(cents - paid, 10500, '80 MAD de petit-déjeuner et 25 MAD de taxe');
    assert.match(await page.$eval('.hx-fol-tot', e => e.textContent), /1[\s\u202f\u00a0]?005/);
    await click('.kiwi-modal-close');
    step('Passer au lendemain, refuser le départ impayé et conserver le séjour');
    // Passage du temps uniquement : aucune mutation des dates du séjour enregistré.
    await page.evaluate(() => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [NativeDate.now() + 86400000])); } static now() { return NativeDate.now() + 86400000; } }; });
    await click('[data-action="nav-reception"]');
    await page.waitForSelector('[data-action="hx-daily-refresh"]:not([disabled])');
    // Le départ du walk-in est demain : le journal permet de préparer ce mouvement.
    await page.$eval('[data-hx-daily-date]', (e, day) => { e.value = day; e.dispatchEvent(new Event('change', { bubbles: true })); }, ymd(1));
    await page.waitForSelector('[data-action="hx-daily-refresh"]:not([disabled])');
    await click('.hx-daily .kiwi-select-trigger');
    await click('.kiwi-select-option[data-option-index="2"]');
    const dialog = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Confirmation du solde impayé absente')), 10000);
      page.once('dialog', async d => { clearTimeout(timeout); try { assert.match(d.message(), /105/); await d.dismiss(); resolve(); } catch (error) { reject(error); } });
    });
    await Promise.all([dialog, click(`[data-action="hx-stay-checkout"][data-arg="${stay.id}"]`)]);
    console.log('  · ' + device + ' · Refus confirmé');
    assert.equal(stays().find(b => b.id === stay.id).status, 'checked_in');
    step('Régler le solde puis clôturer et recharger');
    await click('[data-action="nav-folios"]');
    await click('[data-action="hx-folio"][data-arg="101"]');
    await click('[data-action="hx-checkout-pay"][data-arg="101|cash"]');
    await wait(() => stays().find(b => b.id === stay.id)?.status === 'completed' && rooms().folios?.some(f => f.stayId === stay.id && f.closedAt));
    await wait(() => Number(made.sql.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(MERCHANT).n) === 2);
    const amounts = made.sql.prepare('SELECT amount_cents FROM sales WHERE merchant=? ORDER BY amount_cents').all(MERCHANT).map(r => r.amount_cents);
    assert.deepEqual(amounts, [10500, 90000]);
    await page.reload({ waitUntil: 'load' });
    await unlock();
    await page.waitForFunction(() => !document.querySelector('.app.kw-app-hidden') && !document.querySelector('[data-kiwi-greet].is-visible'));
    assert.equal(stays().find(b => b.id === stay.id).status, 'completed');
    const closed = rooms().folios.find(f => f.stayId === stay.id && f.closedAt);
    assert.equal(Math.round(closed.settlementAmount * 100), cents - paid);
    assert.equal(paid + Math.round(closed.settlementAmount * 100), cents, 'Solde nul en centimes');
    await click('[data-action="nav-chambres"]');
    await page.waitForSelector('[data-hx-room-card][data-arg="101"].st-sale');
  });
}
await journey.finish();
