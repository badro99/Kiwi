#!/usr/bin/env node
// Kiwi follows the time of the device at the store. The paired till uses its
// own zone and reports it; the server, the dashboard and the reports read the
// stored store zone; a God Mode session never moves a store's day.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { businessDate, businessBoundary, merchantZone, validZone, DEFAULT_ZONE } from '../functions/api/_business-day.js';
import * as timezone from '../functions/api/timezone.js';

const ROOT = new URL('..', import.meta.url);
let n = 0;
const check = (ok, label) => { assert.ok(ok, label); n++; };

// 1. Business day follows the zone it is given.
const at = Date.parse('2026-09-26T03:40:00Z'); // 04:40 Casablanca, 05:40 Paris
check(businessDate(at) === '2026-09-25', 'default zone keeps Casablanca');
check(businessDate(at, 5, 'Europe/Paris') === '2026-09-26', 'Paris store is already on the new day');
check(businessBoundary('2026-09-26', 5, 'Europe/Paris') === Date.parse('2026-09-26T03:00:00Z'), 'Paris 05:00 boundary');
check(businessBoundary('2026-09-26', 5, 'America/New_York') === Date.parse('2026-09-26T09:00:00Z'), 'New York 05:00 boundary');
check(validZone('Europe/Paris') === 'Europe/Paris' && validZone('America/Argentina/Buenos_Aires') && validZone('UTC'), 'real zones accepted');
check(!validZone('Mars/Olympus') && !validZone("'; DROP TABLE") && !validZone(''), 'junk zones refused');

// 2. Only the store's own till may set the store zone.
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('schema.sql', ROOT), 'utf8'));
const now = Date.now();
for (const m of ['tz-shop', 'other-shop']) {
  sql.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts) VALUES (?, '{}', 'active', ?)").run(m, now);
}
const DB = { prepare(q) { let a = []; return {
  bind(...v) { a = v.map(x => x === undefined ? null : x); return this; },
  async first() { return sql.prepare(q).get(...a) ?? null; },
  async all() { return { results: sql.prepare(q).all(...a) }; },
  async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; } };
const SECRET = 'device-timezone-fixture-only';
const env = { DB, AUTH_SECRET: SECRET };
check(await merchantZone(env, 'tz-shop') === DEFAULT_ZONE, 'unmigrated database falls back to the default');
const post = async (body, cookie, origin) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await timezone.onRequestPost({ env, request: new Request('https://k.invalid/api/timezone', { method: 'POST', headers, body: JSON.stringify(body) }) });
  return res.status;
};
const tillCookie = `${TILL_COOKIE}=${await tillToken(SECRET, 'tz-shop')}`;
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }) === 403, 'no till, no write');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, `${TILL_COOKIE}=${await tillToken(SECRET, 'other-shop')}`) === 403, 'another store\'s till cannot write');
check(await post({ merchant: 'tz-shop', timeZone: 'Nowhere/Land' }, tillCookie) === 400, 'invalid zone refused');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, tillCookie, 'https://evil.invalid') === 403, 'cross-origin refused');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, tillCookie) === 200, 'own till writes its zone');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, tillCookie) === 200, 'repeat report is idempotent');
check(await merchantZone(env, 'tz-shop') === 'Europe/Paris', 'server reads the stored store zone');
check(await merchantZone(env, 'other-shop') === DEFAULT_ZONE, 'other stores unchanged');

// 3. Browser: which zone each surface uses.
const source = fs.readFileSync(new URL('assets/day-report.js', ROOT), 'utf8');
function surface({ path, search = '', paired = false, stored = '', device = 'Asia/Tokyo' }) {
  const store = new Map(paired ? [['kiwiPaired', '1']] : []);
  const RealDTF = Intl.DateTimeFormat;
  function DTF(locale, opts) {
    const f = new RealDTF(locale, opts);
    if (!opts || !opts.timeZone) {
      const resolved = f.resolvedOptions.bind(f);
      f.resolvedOptions = () => ({ ...resolved(), timeZone: device });
    }
    return f;
  }
  DTF.supportedLocalesOf = RealDTF.supportedLocalesOf;
  const window = {
    addEventListener() {}, KiwiConfig: stored ? { timezone: stored } : {},
  };
  const ctx = vm.createContext({
    window, document: { addEventListener() {}, querySelector: () => null },
    location: { pathname: path, search },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    Intl: { ...Intl, DateTimeFormat: DTF }, console, Date, Math, JSON,
  });
  vm.runInContext(source, ctx);
  return window.KiwiDayReport.timezone();
}
check(surface({ path: '/kiwi-caisse.html', paired: true, stored: 'Europe/Paris', device: 'Africa/Casablanca' }) === 'Africa/Casablanca',
  'paired till uses its own device zone');
check(surface({ path: '/kiwi-caisse.html', search: '?op=1&merchant=tz-shop', paired: true, stored: 'Europe/Paris', device: 'Asia/Tokyo' }) === 'Europe/Paris',
  'God Mode till session uses the store zone, not the operator device');
check(surface({ path: '/dashboard.html', stored: 'Europe/Paris', device: 'Asia/Tokyo' }) === 'Europe/Paris',
  'dashboard abroad follows the store zone');
check(surface({ path: '/dashboard.html', device: 'America/New_York' }) === 'America/New_York',
  'no store zone yet: the device zone, not Casablanca');

// 4. The till clock and the zone report are wired.
const caisse = fs.readFileSync(new URL('kiwi-caisse.html', ROOT), 'utf8');
check(/function tickClock\(\)[\s\S]{0,900}resolvedOptions\(\)\.timeZone/.test(caisse), 'till clock falls back to the device zone');
const config = fs.readFileSync(new URL('assets/merchant-config.js', ROOT), 'utf8');
check(/function reportTillZone[\s\S]{0,900}\/api\/timezone/.test(config) && /op=1/.test(config), 'paired till reports its zone, never in God Mode');
const middleware = fs.readFileSync(new URL('functions/_middleware.js', ROOT), 'utf8');
check(middleware.includes("path === '/api/timezone'"), 'till report passes the site gate to its own handler');

sql.close();
console.log(`✓ device timezone: ${n} checks — till device zone, stored store zone, God Mode guard, server business day`);
