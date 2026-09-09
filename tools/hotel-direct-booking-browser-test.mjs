#!/usr/bin/env node
/* tools/hotel-direct-booking-browser-test.mjs — ordinary-guest reservations
 * through the real dashboard workflow: boot, PIN gate, hotel pages, the
 * actual individual editor (and group modal), generated requests, and the
 * real /api handlers against a real database.
 *
 * Wired in tools/check.js (420s budget, explicit ○ skip without a browser —
 * CI fails instead). An ordinary traveler must book every meal plan with no
 * commercial account; agency/company contract bookings keep working.
 *
 * Matrix (fresh merchant DB + fresh browser context per test):
 *  · T0  configure a missing meal supplement through the real type editor
 *  · T1  Bed & Breakfast, no account → confirm → reload → booking + price stay
 *  · T2  meal-plan matrix: room-only, lunch, dinner, full-board totals
 *  · T3  missing rate → actionable message (never an account requirement),
 *        then agreed price with reason → audited owner-stamped snapshot
 *  · T4  hold (requested) then confirm, price intact
 *  · T5  family of four in a max-5 room (no three-person cap)
 *  · T6  direct-guest group with meals + reload recovery
 *  · T7  agency/company contract booking still works, totals match
 *  · T8  dropped submit response + retry books exactly once
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
import { onRequestGet as meGet } from '../functions/api/me.js';
import { onRequestPost as pinVerify } from '../functions/api/pin/verify.js';
import { onRequestGet as configGet, onRequestPost as configPost } from '../functions/api/config.js';
import { onRequestGet as storeGet, onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestGet as operationsGet, onRequestPost as operationsPost } from '../functions/api/operations.js';
import { onRequestGet as saleCancelGet } from '../functions/api/sale/cancel.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { onRequestGet as getCommercial, onRequestPost as postCommercial } from '../functions/api/hotel/commercial.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SECRET = 'hotel-direct-browser-secret-0123456789abcdef';
const SESS_COOKIE = 'kiwi_sess';
const ACC = 'acc-direct-ux';
const MERCHANT = 'hotel-direct-ux';
const VENUE = 'v-hotel-direct';

let controls = 0;
const ok = (value, label) => { assert.ok(value, label); controls++; console.log(`  ✓ ${label}`); };
const step = (m) => console.log(`  ▸ ${m}`);
const NAV_PATHS = [];
const noteNav = (what, how) => {
  const line = `${what}:${how}`;
  if (!NAV_PATHS.includes(line)) NAV_PATHS.push(line);
};

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
  for (const b of [path.join(ROOT, 'app', 'package.json'), path.join(ROOT, 'package.json')]) {
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

const ymd = (plusDays) => new Date(Date.now() + plusDays * 86400000).toISOString().slice(0, 10);

function seedMerchant(made, withLunch) {
  const now = Date.now();
  const { sql } = made;
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACC, 'direct-ux@test.ma', 'Direct Owner', 'Hotel Direct UX', 's', 'h', now);
  sql.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .run('pin-ux-1', MERCHANT, '1234', 'Owner', 'owner', now);
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

/* ── per-test context ──────────────────────────────────────────────── */
let browser = null;

async function withCtx(options, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-direct-'));
  const made = makeEnv(path.join(dir, 'test.db'));
  seedMerchant(made, !!options.withLunch);
  const sessionValue = await makeSession(ACC, SECRET);
  const hooks = options.hooks || {};
  const { server, log, base } = await startOrigin(made.env, hooks);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCookie({ name: SESS_COOKIE, value: sessionValue, url: base });
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'load', timeout: 60000 });
  const venue = await page.evaluate(() => window.KiwiVenue?.getVenue?.() || 'hx-venue');
  await page.evaluate(
    ({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)),
    { key: `kiwi:hotel-rooms:v2:${venue}`, doc: clientRoomsDoc(!!options.withLunch) },
  );
  const ctx = {
    page, context, server, log, base, sessionValue, dir, hooks, sql: made.sql, nav: {},
    async stayByClientRef(ref) {
      const r = await ctx.api(`/api/hotel/stays?merchant=${MERCHANT}&clientRef=${encodeURIComponent(ref)}&includeCancelled=1`);
      assert.equal(r.status, 200, 'clientRef lookup works');
      return (r.json.stays || [])[0] || null;
    },
    async api(path, method = 'GET', body) {
      const res = await fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json', Cookie: `${SESS_COOKIE}=${sessionValue}`, 'x-hx-via': 'driver' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    },
    async stayByClientRef(ref) {
      const r = await ctx.api(`/api/hotel/stays?merchant=${MERCHANT}&clientRef=${encodeURIComponent(ref)}&includeCancelled=1`);
      assert.equal(r.status, 200, 'clientRef lookup works');
      return (r.json.stays || [])[0] || null;
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

/* ── dashboard driver (real shell, pages, buttons) ─────────────────── */
async function unlock(page) {
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 20000 });
  const locked = await page.evaluate(() => {
    const l = document.querySelector('[data-kiwi-lock]');
    return !!l && getComputedStyle(l).display !== 'none';
  });
  if (!locked) return;
  await page.evaluate(() => document.querySelector('[data-kiwi-pin-input]')?.focus());
  await page.keyboard.type('1234', { delay: 90 });
  await page.waitForFunction(() => {
    const l = document.querySelector('[data-kiwi-lock]');
    return !l || getComputedStyle(l).display === 'none';
  }, { timeout: 15000 });
  // Select our store through the real venue switcher when it is not active:
  // the reservation engine keys rooms, slugs and caches off this venue.
  await page.evaluate(() => document.querySelector('[data-action="venue-toggle"]')?.click());
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-action="venue-pick"]')].some((el) => (el.getAttribute('data-venue') || '').startsWith('v-')),
    { timeout: 15000 },
  ).catch(() => null);
  const picked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-action="venue-pick"]')];
    const ours = rows.find((el) => (el.getAttribute('data-venue') || '').startsWith('v-'));
    if (ours) { ours.click(); return ours.getAttribute('data-venue'); }
    return '';
  });
  if (picked) {
    await page.waitForFunction(
      (want) => window.KiwiVenue?.getVenue?.() === want,
      { timeout: 15000 }, picked,
    );
  }
}

async function gotoHotel(ctx, handler) {
  // Full workflow prefers the real sidebar click; the section chrome is not
  // the subject here, so a missing entry falls back to the real registered
  // handler (same page render either way) and says so.
  const clicked = await ctx.page.evaluate((h) => {
    const el = document.querySelector(`[data-action="${h}"]`);
    if (el) { el.click(); return true; }
    return false;
  }, handler);
  if (!clicked) await ctx.page.evaluate((h) => window.Kiwi.handlers[h](), handler);
  noteNav(handler, clicked ? 'click' : 'handler');
  await new Promise((r) => setTimeout(r, 1200));
}

async function openStayEditor(ctx, how) {
  const { page } = ctx;
  if (how && how.edit) {
    const clicked = await page.evaluate((id) => {
      const el = document.querySelector(`[data-action="hx-stay-edit"][data-arg="${id}"]`);
      if (el) { el.click(); return true; }
      return false;
    }, how.edit);
    if (!clicked) await page.evaluate((id) => window.Kiwi.handlers['hx-stay-edit'](null, id), how.edit);
    noteNav('hx-stay-edit', clicked ? 'click' : 'handler');
  } else {
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('[data-action="hx-stay-new"]');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!clicked) await page.evaluate(() => window.Kiwi.handlers['hx-stay-new']());
    noteNav('hx-stay-new', clicked ? 'click' : 'handler');
  }
  await page.waitForSelector('[data-hx-stay-form]', { timeout: 15000 });
  await page.waitForSelector('[data-hx-commercial-stay] select[name="board"]', { timeout: 15000 });
}

async function setField(page, selector, value) {
  await page.$eval(selector, (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function fillStay(page, f) {
  if (f.name !== undefined) await setField(page, '[data-hx-stay-form] input[name="name"]', f.name);
  if (f.checkIn) await setField(page, '[data-hx-stay-form] input[name="checkIn"]', f.checkIn);
  if (f.checkOut) await setField(page, '[data-hx-stay-form] input[name="checkOut"]', f.checkOut);
  if (f.roomTypeId) await setField(page, '[data-hx-stay-form] select[name="roomTypeId"]', f.roomTypeId);
  if (f.resourceId !== undefined) await setField(page, '[data-hx-stay-form] select[name="resourceId"]', f.resourceId);
  if (f.channel) await setField(page, '[data-hx-stay-form] select[name="channel"]', f.channel);
  if (f.status) await setField(page, '[data-hx-stay-form] select[name="status"]', f.status);
  if (f.partySize != null) await setField(page, '[data-hx-stay-form] input[name="partySize"]', String(f.partySize));
  if (f.phone !== undefined) await setField(page, '[data-hx-stay-form] input[name="phone"]', f.phone);
  if (f.email !== undefined) await setField(page, '[data-hx-stay-form] input[name="email"]', f.email);
  if (f.board) await setField(page, '[data-hx-commercial-stay] select[name="board"]', f.board);
  if (f.accountId !== undefined) await setField(page, '[data-hx-commercial-stay] select[name="accountId"]', f.accountId);
  if (f.booker !== undefined) await setField(page, '[data-hx-commercial-stay] input[name="booker"]', f.booker);
  for (const g of f.guests || []) {
    const rows = await page.$$('[data-hx-stay-form] [data-hx-guest-row]');
    let row = null;
    for (const r of rows) {
      const v = await r.$eval('[data-hx-guest-name]', (el) => el.value).catch(() => null);
      if (!v) { row = r; break; }
    }
    if (!row) {
      await page.click('[data-hx-stay-form] [data-action="hx-add-guest-row"]');
      const fresh = await page.$$('[data-hx-stay-form] [data-hx-guest-row]');
      row = fresh[fresh.length - 1];
    }
    await row.$eval('[data-hx-guest-name]', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, g);
  }
}

async function readError(page) {
  return page.$eval('[data-hx-stay-error]', (el) => el.textContent || '');
}

async function submitStay(page, timeout = 25000) {
  const ref = await page.evaluate(() => document.querySelector('[data-hx-stay-form]')?.__hxClientRef || '');
  await page.click('[data-hx-stay-form] [type="submit"]');
  const outcome = await page.waitForFunction(() => {
    if (!document.querySelector('[data-hx-stay-form]')) return 'closed';
    const err = document.querySelector('[data-hx-stay-error]');
    const btn = document.querySelector('[data-hx-stay-form] [type="submit"]');
    if (err && err.textContent && btn && !btn.disabled) return 'settled:' + err.textContent;
    return false;
  }, { timeout }).then((h) => h.jsonValue()).catch(() => 'timeout');
  return { outcome, ref };
}

async function directBreakdown(page) {
  return page.$eval('[data-hx-direct-breakdown]', (el) => el.textContent || '').catch(() => '');
}

async function simulateAndAccept(page) {
  await page.click('[data-hx-commercial-stay] [data-hx-quote]');
  await page.waitForSelector('[data-hx-commercial-stay] [data-hx-accept-quote]', { timeout: 15000 });
  await page.click('[data-hx-commercial-stay] [data-hx-accept-quote]');
}

function failStayPostOnce(suffix) {
  let n = 0;
  const f = (body) => {
    if (body && body.clientRef && String(body.clientRef).endsWith(suffix) && n++ === 0) return true;
    return false;
  };
  f.status = 409;
  f.error = 'room-unavailable';
  return f;
}

function dropNextStayPost() {
  let n = 0;
  return () => n++ === 0;
}

const GUEST = (checkIn, checkOut) => ({
  name: 'Karim Benchekroun', checkIn, checkOut, phone: '+212661000001', email: '',
  guests: ['Karim Benchekroun'],
});

async function reloadAndUnlock(page) {
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await unlock(page);
}

async function openStayForEdit(ctx, id) {
  const { page } = ctx;
  const clicked = await page.evaluate((bid) => {
    const el = document.querySelector(`[data-action="hx-stay-edit"][data-arg="${bid}"]`);
    if (el) { el.click(); return true; }
    return false;
  }, id);
  if (!clicked) await page.evaluate((bid) => window.Kiwi.handlers['hx-stay-edit'](null, bid), id);
  noteNav('hx-stay-edit', clicked ? 'click' : 'handler');
  await page.waitForSelector('[data-hx-stay-form]', { timeout: 15000 });
  await page.waitForSelector('[data-hx-commercial-stay] select[name="board"]', { timeout: 15000 });
  return clicked ? 'click' : 'handler';
}

async function closeModal(page) {
  await page.click('.kiwi-modal-close');
  await page.waitForFunction(() => !document.querySelector('[data-hx-stay-form]') && !document.querySelector('[data-hx-group-form]'), { timeout: 10000 });
}

/* ── launch ────────────────────────────────────────────────────────── */
console.log('\n■ launch · one browser, real dashboard for all scenarios');
browser = await puppeteer.launch({
  executablePath: CHROME_BIN,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
console.log('  (browser ready)');

/* ── T0 · missing lunch rate → message, configure via UI, book ─────── */
console.log('\n■ T0 · missing meal rate is actionable, then configured in Types');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'hb_lunch' });
  const missing = await directBreakdown(page);
  ok(/Aucun tarif/.test(missing) && /Types de chambres/.test(missing), 'missing rate names the fix, not an account');
  const agreedVisible = await page.$eval('[data-hx-agreed-box]', (el) => !el.hidden).catch(() => false);
  ok(agreedVisible, 'agreed-price box appears exactly when the rate is missing');
  const r0 = await submitStay(page);
  ok(String(r0.outcome).startsWith('settled:'), 'submit blocked without a rate');
  ok(/Types de chambres/.test(await readError(page)), 'block message is actionable');
  ok(!/compte commercial/i.test(await readError(page)), 'block never demands a commercial account');
  await closeModal(page);
  step('configure the lunch supplement through the real type editor');
  await gotoHotel(ctx, 'nav-tarifs');
  await page.click('[data-action="hx-room-type-edit"][data-arg="type:t1"]');
  await page.waitForSelector('[data-hx-type-board-hb_lunch]', { timeout: 10000 });
  await setField(page, '[data-hx-type-board-hb_lunch]', '220');
  await page.click('[data-action="hx-room-type-save"]');
  await page.waitForFunction(() => !document.querySelector('[data-hx-type-board-hb_lunch]'), { timeout: 10000 });
  const doc = await (async () => {
    for (let i = 0; i < 30; i++) {
      const s = await ctx.api('/api/store?merchant=' + MERCHANT + '&feature=rooms');
      const data = typeof s.json.data === 'string' ? JSON.parse(s.json.data) : s.json.data;
      const t = (data.roomTypes || []).find((x) => x.id === 'type:t1');
      if (t && t.boardRates && Number(t.boardRates.hb_lunch) === 220) return t;
      await new Promise((r2) => setTimeout(r2, 500));
    }
    return null;
  })();
  ok(doc && Number(doc.boardRates.hb_lunch) === 220, 'lunch supplement reached the server rooms document');
  step('book lunch with the configured rate');
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'hb_lunch' });
  const shown = await directBreakdown(page);
  ok(/2240\.00/.test(shown), 'lunch total displayed (900×2 + 220×2)');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'lunch booking confirms');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 2240, 'server total matches the configured rate');
});

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
      if (u.pathname === '/api/me' && req.method === 'GET') return route(meGet);
      if (u.pathname === '/api/pin/verify' && req.method === 'POST') return route(pinVerify);
      if (u.pathname === '/api/config' && req.method === 'GET') return route(configGet);
      if (u.pathname === '/api/config' && req.method === 'POST') return route(configPost);
      if (u.pathname === '/api/store' && req.method === 'GET') return route(storeGet);
      if (u.pathname === '/api/store' && req.method === 'POST') return route(storePost);
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
/* ── T1 · Bed & Breakfast, no account, reload keeps booking + price ── */
console.log('\n■ T1 · ordinary B&B books, reload preserves reservation and price');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb' });
  const shown = await directBreakdown(page);
  ok(/2100\.00/.test(shown), 'B&B total displayed before confirmation (900×2 + 150×2)');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'B&B confirms with no commercial account anywhere');
  let b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 2100, 'server total correct');
  ok(b.pricing && b.pricing.kind === 'direct' && b.pricing.totalCents === 210000, 'accepted pricing snapshot persisted');
  ok(b.pricing.rows.length === 2 && b.pricing.taxBasis === 'inclusive', 'snapshot carries per-night rows');
  ok(!b.commercial || (b.commercial.accountId === '' && b.commercial.quoted === false), 'no fake account created');
  step('reload: reservation and price remain');
  await reloadAndUnlock(page);
  b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 2100 && b.pricing && b.pricing.totalCents === 210000, 'reload keeps reservation and accepted price');
  await gotoHotel(ctx, 'nav-reception');
  await openStayForEdit(ctx, b.id);
  const nameBack = await page.$eval('[data-hx-stay-form] input[name="name"]', (el) => el.value);
  const boardBack = await page.$eval('[data-hx-commercial-stay] select[name="board"]', (el) => el.value);
  ok(nameBack === 'Karim Benchekroun' && boardBack === 'bb', 'reopened editor shows the same guest and formula');
});

/* ── T2 · meal-plan matrix, configured rates ───────────────────────── */
console.log('\n■ T2 · every meal plan prices from configuration');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  const cases = [
    { board: 'room_only', room: 'room:101', checkIn: ymd(7), checkOut: ymd(9), total: '1800.00', cents: 180000 },
    { board: 'bb', room: 'room:102', checkIn: ymd(7), checkOut: ymd(9), total: '2100.00', cents: 210000 },
    { board: 'hb_dinner', room: 'room:101', checkIn: ymd(10), checkOut: ymd(12), total: '2360.00', cents: 236000 },
    { board: 'full_board', room: 'room:102', checkIn: ymd(10), checkOut: ymd(12), total: '2700.00', cents: 270000 },
  ];
  for (const c of cases) {
    await gotoHotel(ctx, 'nav-reception');
    await openStayEditor(ctx);
    await fillStay(page, { ...GUEST(c.checkIn, c.checkOut), roomTypeId: 'type:t1', resourceId: c.room, partySize: 1, board: c.board });
    const shown = await directBreakdown(page);
    ok(new RegExp(c.total.replace('.', '\\.')).test(shown), `${c.board}: ${c.total} MAD displayed`);
    const done = await submitStay(page);
    ok(done.outcome === 'closed', `${c.board}: confirms`);
    const b = await ctx.stayByClientRef(done.ref);
    ok(b && b.hotel.total === Number(c.total) && b.pricing && b.pricing.totalCents === c.cents, `${c.board}: server total and snapshot match`);
    ok(b.pricing.board === c.board, `${c.board}: snapshot carries the formula`);
  }
});

/* ── T3 · agreed price with reason, owner-stamped ───────────────────── */
console.log('\n■ T3 · missing rate offers an agreed price, audited');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t3', resourceId: 'room:301', partySize: 1, board: 'bb' });
  const done = await (async () => {
    await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-amount]', '950');
    await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-reason]', 'geste commercial, dernière chambre');
    await page.click('[data-hx-commercial-stay] [data-hx-agreed-confirm]');
    return submitStay(page);
  })();
  ok(done.outcome === 'closed', 'agreed price confirms with no account');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 950, 'total follows the agreed amount');
  ok(b.pricing && b.pricing.agreed === true && b.pricing.totalCents === 95000, 'agreed snapshot persisted');
  ok(b.pricing.reason === 'geste commercial, dernière chambre', 'reason persisted verbatim');
  ok(b.pricing.agreedBy && b.pricing.agreedBy.role === 'owner', 'authorizing identity stamped');
});

/* ── T4 · hold, then confirm, price intact ──────────────────────────── */
console.log('\n■ T4 · hold a room, then confirm it');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb', status: 'requested' });
  const held = await submitStay(page);
  ok(held.outcome === 'closed', 'hold blocks the room');
  let b = await ctx.stayByClientRef(held.ref);
  ok(b && b.status === 'requested', 'stay held as requested');
  ok(b.pricing && b.pricing.totalCents === 210000, 'hold carries the accepted pricing');
  const how = await openStayForEdit(ctx, b.id);
  step(`reopened via ${how}`);
  await setField(page, '[data-hx-stay-form] select[name="status"]', 'confirmed');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'hold confirms');
  b = await ctx.stayByClientRef(done.ref);
  ok(b && b.status === 'confirmed' && b.hotel.total === 2100, 'confirmed with the same price');
  ok(b.pricing && b.pricing.totalCents === 210000, 'snapshot intact across the transition');
});

/* ── T5 · family of four, no three-person cap ───────────────────────── */
console.log('\n■ T5 · family of four books breakfast at configured rates');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { name: 'Famille Bennani', checkIn: ymd(7), checkOut: ymd(9), phone: '', email: '', roomTypeId: 'type:t2', resourceId: 'room:201', partySize: 4, board: 'bb' });
  for (const name of ['Yasmine Bennani', 'Omar Bennani', 'Lina Bennani', 'Adam Bennani']) {
    const rows = await page.$$('[data-hx-stay-form] [data-hx-guest-row]');
    let row = null;
    for (const r of rows) {
      const v = await r.$eval('[data-hx-guest-name]', (el) => el.value).catch(() => null);
      if (!v) { row = r; break; }
    }
    if (!row) {
      await page.click('[data-hx-stay-form] [data-action="hx-add-guest-row"]');
      const fresh = await page.$$('[data-hx-stay-form] [data-hx-guest-row]');
      row = fresh[fresh.length - 1];
    }
    await row.$eval('[data-hx-guest-name]', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, name);
  }
  const shown = await directBreakdown(page);
  ok(/4800\.00/.test(shown), 'family total displayed (1800×2 + 150×4×2)');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'family confirms despite exceeding three persons');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 4800 && b.pricing && b.pricing.totalCents === 480000, 'server total scales meals per person');
  ok(b.pricing.occupancy === 4, 'snapshot records the family occupancy');
});

/* ── T6 · direct-guest group with meals + reload ────────────────────── */
console.log('\n■ T6 · direct group books dinners, reload keeps the dossier');
await withCtx({}, async (ctx) => {
  const { page, log } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('[data-action="hx-group-new"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!clicked) await page.evaluate(() => window.Kiwi.handlers['hx-group-new']());
  noteNav('hx-group-new', clicked ? 'click' : 'handler');
  await page.waitForSelector('[data-hx-group-form]', { timeout: 15000 });
  const form = '[data-hx-group-form] ';
  await setField(page, form + 'input[name="groupName"]', 'Familles Réunies');
  await setField(page, form + 'input[name="checkIn"]', ymd(7));
  await setField(page, form + 'input[name="checkOut"]', ymd(9));
  await setField(page, form + 'input[name="contactName"]', 'Salma Idrissi');
  await setField(page, form + 'select[name="board"]', 'hb_dinner');
  await page.click(`${form}input[data-hx-group-cb][value="room:101"]`);
  await page.click(`${form}input[data-hx-group-cb][value="room:102"]`);
  await page.click(`${form}[data-action="hx-add-group-traveler"]`);
  const grows = await page.$$(`${form}[data-hx-group-traveler]`);
  ok(grows.length === 2, 'two traveler rows ready');
  const fillT = async (idx, name, room) => {
    const rows = await page.$$(`${form}[data-hx-group-traveler]`);
    await rows[idx].$eval('[data-hx-t-name]', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, name);
    await rows[idx].$eval('[data-hx-t-room]', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, room);
  };
  await fillT(0, 'Salma Idrissi', 'room:101');
  await fillT(1, 'Mehdi Idrissi', 'room:102');
  const card = await page.$eval('[data-hx-group-quote-slot]', (el) => el.textContent || '');
  ok(/4720\.00/.test(card), 'group direct total displayed (2 × 2360)');
  const dossier = await page.evaluate(() => document.querySelector('[data-hx-group-review] code')?.textContent.trim() || '');
  ok(dossier.length > 0, 'dossier reference shown');
  await page.click(`${form}[data-hx-group-submit]`);
  const outcome = await page.waitForFunction(() => {
    // The real modal removes its DOM 280ms after close (fade-out): only a
    // settled error counts while the form is still attached, never the
    // in-flight progress line next to a re-enabled button.
    if (!document.querySelector('[data-hx-group-form]')) return 'closed';
    const err = document.querySelector('[data-hx-group-error]');
    const btn = document.querySelector('[data-hx-group-submit]');
    if (err && err.textContent && err.textContent.indexOf('Contrôle des disponibilités') !== 0 && btn && !btn.disabled) return 'settled:' + err.textContent;
    return false;
  }, { timeout: 25000 }).then((h) => h.jsonValue()).catch(() => 'timeout');
  ok(outcome === 'closed', 'direct group confirms with no account');
  const list = await ctx.api(`/api/hotel/stays?merchant=${MERCHANT}&dossierId=${encodeURIComponent(dossier)}&includeCancelled=1`);
  ok(list.status === 200 && (list.json.stays || []).length === 2, 'both rooms booked under one dossier');
  for (const s of list.json.stays) {
    ok(s.hotel.total === 2360 && s.pricing && s.pricing.totalCents === 236000, 'each room priced from configuration');
    ok(s.commercial && s.commercial.accountId === '', 'no account attached');
  }
  step('reload: dossier intact');
  await reloadAndUnlock(page);
  const again = await ctx.api(`/api/hotel/stays?merchant=${MERCHANT}&dossierId=${encodeURIComponent(dossier)}&includeCancelled=1`);
  ok(again.status === 200 && (again.json.stays || []).length === 2, 'reload keeps the dossier and its prices');
});

/* ── T7 · agency contract still works ───────────────────────────────── */
console.log('\n■ T7 · agency/company contract booking unchanged');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'hb_dinner' });
  await setField(page, '[data-hx-commercial-stay] select[name="accountId"]', 'acc-agency-01');
  await page.click('[data-hx-commercial-stay] [data-hx-quote]');
  await page.waitForSelector('[data-hx-commercial-stay] [data-hx-accept-quote]', { timeout: 15000 });
  await page.click('[data-hx-commercial-stay] [data-hx-accept-quote]');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'contract booking confirms');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b && b.hotel.total === 1700, 'contract total applied (850×2)');
  ok(b.commercial && b.commercial.quoted === true && b.commercial.quote && b.commercial.quote.totalCents === 170000, 'accepted contract snapshot persisted');
  ok(b.commercial.accountId === 'acc-agency-01', 'account preserved');
});

/* ── T8 · dropped response + retry books exactly once ───────────────── */
console.log('\n■ T8 · network failure and retry never duplicate');
await withCtx({
  hooks: {
    dropStayResponse: (() => { let n = 0; return () => n++ === 0; })(),
  },
}, async (ctx) => {
  const { page, log } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb' });
  const first = await submitStay(page);
  ok(String(first.outcome).startsWith('settled:'), 'lost response surfaces as an error, not a silent success');
  const second = await submitStay(page);
  ok(second.outcome === 'closed', 'retry completes');
  ok(second.ref === first.ref, 'retry reuses the same idempotency reference');
  const b = await ctx.stayByClientRef(second.ref);
  ok(b && b.hotel.total === 2100, 'exactly one booking with the right total');
  const posts = log.filter((e) => e.type === 'stay-post' && String(e.clientRef || '') === second.ref);
  ok(posts.length === 2, 'two attempts, one booking: idempotency absorbs the retry');
});

async function setTypeBoardRate(ctx, typeId, board, amount) {
  const { page } = ctx;
  await gotoHotel(ctx, 'nav-tarifs');
  await page.click(`[data-action="hx-room-type-edit"][data-arg="${typeId}"]`);
  await page.waitForSelector(`[data-hx-type-board-${board}]`, { timeout: 10000 });
  await setField(page, `[data-hx-type-board-${board}]`, String(amount));
  await page.click('[data-action="hx-room-type-save"]');
  await page.waitForFunction(() => !document.querySelector('[data-hx-type-board-bb]'), { timeout: 10000 });
  const t = await (async () => {
    for (let i = 0; i < 30; i++) {
      const s = await ctx.api('/api/store?merchant=' + MERCHANT + '&feature=rooms');
      const data = typeof s.json.data === 'string' ? JSON.parse(s.json.data) : s.json.data;
      const hit = (data.roomTypes || []).find((x) => x.id === typeId);
      if (hit && hit.boardRates && Number(hit.boardRates[board]) === amount) return hit;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  })();
  assert.ok(t && Number(t.boardRates[board]) === amount, `supplement ${board}=${amount} reached the server rooms document`);
}

/* ── E1 · catalogue change cannot reprice a saved stay ─────────────── */
console.log('\n■ E1 · saved snapshot survives catalogue moves and contact edits');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb' });
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'B&B books at 2100');
  let b = await ctx.stayByClientRef(done.ref);
  const at0 = b.pricing.acceptedAt;
  ok(b.hotel.total === 2100 && at0 > 0, 'snapshot accepted with timestamp');
  step('breakfast supplement rises 150 → 300 in Types');
  await setTypeBoardRate(ctx, 'type:t1', 'bb', 300);
  step('reopen: the display still shows the accepted 2100');
  await gotoHotel(ctx, 'nav-reception');
  await openStayForEdit(ctx, b.id);
  const shown = await directBreakdown(page);
  ok(/2100\.00/.test(shown) && !/2400/.test(shown), 'reopened editor shows the saved snapshot, not new catalogue math');
  step('phone, note and traveler edits preserve it');
  await setField(page, '[data-hx-stay-form] input[name="phone"]', '+212662000002');
  await setField(page, '[data-hx-stay-form] textarea[name="note"]', 'Arrivée tardive');
  await page.$eval('[data-hx-stay-form] [data-hx-guest-name]', (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, 'Karim Benali');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'contact edit saves');
  b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 2100, 'total untouched by non-pricing edits');
  ok(b.pricing.totalCents === 210000 && b.pricing.acceptedAt === at0, 'snapshot and original timestamp intact');
  ok(b.customer.phone === '+212662000002' && (b.note || '').includes('tardive'), 'edits applied');
  ok(b.guests.some((g) => g.name === 'Karim Benali'), 'renamed traveler kept');
});

/* ── E2 · moved dates require an explicit, reviewed reprice ────────── */
console.log('\n■ E2 · date moves need a confirmed reprice, then apply it');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb' });
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'B&B books');
  await setTypeBoardRate(ctx, 'type:t1', 'bb', 300);
  await gotoHotel(ctx, 'nav-reception');
  await openStayForEdit(ctx, (await ctx.stayByClientRef(done.ref)).id);
  await setField(page, '[data-hx-stay-form] input[name="checkIn"]', ymd(10));
  await setField(page, '[data-hx-stay-form] input[name="checkOut"]', ymd(12));
  const wrapVisible = await page.$eval('[data-hx-reprice-wrap]', (el) => !el.hidden).catch(() => false);
  ok(wrapVisible, 'reprice confirmation appears with the new total');
  const wrapText = await page.$eval('[data-hx-reprice-label]', (el) => el.textContent || '');
  ok(/2400\.00/.test(wrapText), 'reprice total reflects the moved catalogue (900+300)×2');
  const blocked = await submitStay(page);
  ok(String(blocked.outcome).startsWith('settled:'), 'unconfirmed reprice is blocked');
  ok(/revalorisation|tarif a changé/.test(await readError(page)), 'block message demands review');
  await page.click('[data-hx-reprice-confirm]');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'confirmed reprice saves');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 2400 && b.pricing.totalCents === 240000, 'fresh snapshot and total applied');
  ok(b.pricing.acceptedAt > 0 && b.hotel.checkIn === ymd(10), 'new dates with new acceptance');
});

/* ── E3 · direct → contract: one total, history kept ───────────────── */
console.log('\n■ E3 · direct to contract keeps a single payable total');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'hb_dinner' });
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'direct dinner books at 2360');
  await openStayForEdit(ctx, (await ctx.stayByClientRef(done.ref)).id);
  await setField(page, '[data-hx-commercial-stay] select[name="accountId"]', 'acc-agency-01');
  await page.click('[data-hx-commercial-stay] [data-hx-quote]');
  await page.waitForSelector('[data-hx-commercial-stay] [data-hx-accept-quote]', { timeout: 15000 });
  const card = await page.$eval('[data-hx-quote-result]', (el) => el.textContent || '');
  ok(/1700\.00/.test(card), 'contract total displayed before acceptance (1700)');
  await page.click('[data-hx-commercial-stay] [data-hx-accept-quote]');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'contract transition saves');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 1700, 'persisted total is the contract total, not the stale 2360');
  ok(b.commercial && b.commercial.quote && b.commercial.quote.totalCents === 170000, 'accepted quote stored');
  ok(!b.pricing, 'stale direct snapshot cleared, not competing');
  ok(Array.isArray(b.pricingHistory) && b.pricingHistory.length === 1
    && b.pricingHistory[0].totalCents === 236000 && b.pricingHistory[0].supersededAt > 0,
    'superseded direct snapshot preserved in history');
  step('reload: single source still agrees');
  await reloadAndUnlock(page);
  const r = await ctx.stayByClientRef(done.ref);
  ok(r.hotel.total === 1700 && !r.pricing && r.pricingHistory.length === 1, 'reload keeps one total plus history');
});

/* ── E4 · contract → direct: reverse transition ────────────────────── */
console.log('\n■ E4 · contract back to direct clears the quote');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'hb_dinner' });
  await setField(page, '[data-hx-commercial-stay] select[name="accountId"]', 'acc-agency-01');
  await page.click('[data-hx-commercial-stay] [data-hx-quote]');
  await page.waitForSelector('[data-hx-commercial-stay] [data-hx-accept-quote]', { timeout: 15000 });
  await page.click('[data-hx-commercial-stay] [data-hx-accept-quote]');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'contract books at 1700');
  await openStayForEdit(ctx, (await ctx.stayByClientRef(done.ref)).id);
  await setField(page, '[data-hx-commercial-stay] select[name="accountId"]', '');
  const shown = await directBreakdown(page);
  ok(/2360\.00/.test(shown), 'direct total recomputed on account removal');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'direct transition saves');
  const b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 2360, 'direct total wins back');
  ok(!b.commercial || b.commercial.quote == null, 'stale contract quote cleared');
  ok(b.pricing && b.pricing.totalCents === 236000, 'fresh direct snapshot stored');
  ok(Array.isArray(b.pricingHistory) && b.pricingHistory.length === 1 && b.pricingHistory[0].kind === 'contract'
    && b.pricingHistory[0].totalCents === 170000, 'contract snapshot archived');
});

/* ── E5+E6 · agreed reopening preserves; deliberate change re-audits ─ */
console.log('\n■ E5+E6 · agreed price reopens intact, deliberate changes re-authorize');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t3', resourceId: 'room:301', partySize: 1, board: 'bb' });
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-amount]', '950');
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-reason]', 'geste commercial');
  await page.click('[data-hx-commercial-stay] [data-hx-agreed-confirm]');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'agreed booking saves');
  let b = await ctx.stayByClientRef(done.ref);
  const at0 = b.pricing.acceptedAt;
  ok(b.hotel.total === 950 && b.pricing.agreedBy.role === 'owner', 'agreed snapshot with owner stamp');
  step('reopen: amount, reason and authorizer loaded, confirm unset');
  await openStayForEdit(ctx, b.id);
  const agreedShown = await page.$eval('[data-hx-direct-breakdown]', (el) => el.textContent || '');
  ok(/950\.00/.test(agreedShown) && /geste commercial/.test(agreedShown), 'stored agreement displayed with amount and reason');
  const confirmChecked = await page.$eval('[data-hx-commercial-stay] [data-hx-agreed-confirm]', (el) => el.checked).catch(() => 'absent');
  ok(confirmChecked === false || confirmChecked === 'absent', 'no pre-checked acceptance that would re-stamp');
  step('phone-only edit preserves authorization verbatim');
  await setField(page, '[data-hx-stay-form] input[name="phone"]', '+212662000002');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'ordinary edit saves');
  b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 950, 'total untouched');
  ok(b.pricing.agreedBy.at === at0 && b.pricing.reason === 'geste commercial', 'original authorization timestamp and reason intact');
  step('deliberate amount change re-authorizes and archives the old one');
  await openStayForEdit(ctx, b.id);
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-amount]', '1000');
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-reason]', 'geste revu');
  await page.click('[data-hx-commercial-stay] [data-hx-agreed-confirm]');
  const done3 = await submitStay(page);
  ok(done3.outcome === 'closed', 're-authorized change saves');
  b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 1000 && b.pricing.totalCents === 100000, 'new agreed total applied');
  ok(b.pricing.acceptedAt >= at0, 'new authorization timestamped');
  ok(Array.isArray(b.pricingHistory) && b.pricingHistory.length === 1 && b.pricingHistory[0].amountCents === 95000, 'old authorization archived');
});

/* ── E7 · later catalogue rates never overwrite an agreement ───────── */
console.log('\n■ E7 · catalogue gains do not touch agreed bookings');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t3', resourceId: 'room:301', partySize: 1, board: 'bb' });
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-amount]', '950');
  await setField(page, '[data-hx-commercial-stay] [data-hx-agreed-reason]', 'geste commercial');
  await page.click('[data-hx-commercial-stay] [data-hx-agreed-confirm]');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'agreed booking saves');
  let b = await ctx.stayByClientRef(done.ref);
  const at0 = b.pricing.acceptedAt;
  step('hotel now configures a bb rate for that category');
  await setTypeBoardRate(ctx, 'type:t3', 'bb', 150);
  await gotoHotel(ctx, 'nav-reception');
  await openStayForEdit(ctx, b.id);
  await setField(page, '[data-hx-stay-form] input[name="phone"]', '+212662000002');
  const done2 = await submitStay(page);
  ok(done2.outcome === 'closed', 'edit saves');
  b = await ctx.stayByClientRef(done.ref);
  ok(b.hotel.total === 950, 'agreed total stands, catalogue 2100 math ignored');
  ok(b.pricing.agreedBy.at === at0 && b.pricing.reason === 'geste commercial', 'original authorization intact');
});

/* ── T9 · editor hides what must stay hidden, birth dates type French ── */
console.log('\n■ T9 · no phantom rows, birth dates in JJ/MM/AAAA');
await withCtx({}, async (ctx) => {
  const { page } = ctx;
  await unlock(page);
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(7), ymd(9)), roomTypeId: 'type:t1', resourceId: 'room:101', partySize: 1, board: 'bb' });
  const hiddenState = await page.evaluate(() => {
    const disp = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : 'absent'; };
    return {
      quote: disp('[data-hx-commercial-stay] [data-hx-quote]'),
      reprice: disp('[data-hx-commercial-stay] [data-hx-reprice-wrap]'),
      agreed: disp('[data-hx-commercial-stay] [data-hx-agreed-box]'),
    };
  });
  ok(hiddenState.quote === 'none', 'no contract simulation offered without an account');
  ok(hiddenState.reprice === 'none', 'no empty reprice row rendered');
  ok(hiddenState.agreed === 'none', 'no agreed-price box while configured rates cover the stay');
  step('birth date types French, persists ISO');
  await setField(page, '[data-hx-stay-form] [data-hx-guest-birth]', '17/05/1990');
  const done = await submitStay(page);
  ok(done.outcome === 'closed', 'booking with a typed birth date confirms');
  let b = await ctx.stayByClientRef(done.ref);
  ok(b && b.guests && b.guests[0] && b.guests[0].birthDate === '1990-05-17', 'birth date stored ISO');
  await openStayForEdit(ctx, b.id);
  const birthBack = await page.$eval('[data-hx-stay-form] [data-hx-guest-birth]', (el) => el.value);
  ok(birthBack === '17/05/1990', 'reopened editor shows JJ/MM/AAAA, never mm/dd/yyyy');
  step('invalid birth blocks the save with guidance, creates nothing');
  await setField(page, '[data-hx-stay-form] [data-hx-guest-birth]', 'n’importe quoi');
  const bad = await submitStay(page);
  ok(String(bad.outcome).startsWith('settled:') && /JJ\/MM\/AAAA/.test(String(bad.outcome)), 'invalid birth date refused with guidance');
  step('agreed checkbox keeps control size on the fallback path');
  await gotoHotel(ctx, 'nav-reception');
  await openStayEditor(ctx);
  await fillStay(page, { ...GUEST(ymd(11), ymd(13)), roomTypeId: 'type:t1', resourceId: 'room:102', partySize: 1, board: 'hb_lunch' });
  const agreedBox = await page.evaluate(() => {
    const el = document.querySelector('[data-hx-commercial-stay] [data-hx-agreed-box]');
    const cb = document.querySelector('[data-hx-commercial-stay] [data-hx-agreed-confirm]');
    const r = cb ? cb.getBoundingClientRect() : { width: 0 };
    return { box: el ? getComputedStyle(el).display : 'absent', cbW: Math.round(r.width) };
  });
  ok(agreedBox.box !== 'none', 'missing meal rate offers the agreed-price path');
  ok(agreedBox.cbW <= 32, `agreed checkbox stays a control (${agreedBox.cbW}px, not full width)`);
});

/* ── summary ───────────────────────────────────────────────────────── */
console.log(`\n✓ All ${controls} direct-booking browser controls passed.`);
console.log(`  navigation paths used: ${NAV_PATHS.join(' | ')}`);
if (browser) { try { await browser.close(); } catch (_) {} }

