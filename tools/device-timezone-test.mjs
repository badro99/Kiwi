#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
// B24 · A store's zone is DECLARED by its owner (or a named operator), never taken
// from a device: a till paired on a Mac set to Berlin wrote Europe/Berlin for two
// Moroccan hotels. The till reports its business-day cutoff only; every surface reads
// the stored store zone, and with none stored, Casablanca, never the device zone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE, operatorToken, operatorIdToken, OP_COOKIE, OPID_COOKIE } from '../functions/auth/_lib.js';
import { businessDate, businessBoundary, merchantZone, merchantCutoff, validZone, DEFAULT_ZONE } from '../functions/api/_business-day.js';
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

// 2. Only the owner (or a named operator) declares the zone; the till reports its cutoff.
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
sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)").run('tz-owner', 'tz@example.test', 'Owner', 'tz-shop', 's', 'h', now);
sql.prepare("UPDATE merchant_config SET account_id = 'tz-owner' WHERE merchant = 'tz-shop'").run();
sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)").run('tz-stranger', 'x@example.test', 'X', 'x', 's', 'h', now);
sql.prepare('INSERT INTO operators(id,label,salt,hash,created_ts) VALUES(?,?,?,?,?)').run('tz-op', 'Fixture Operator', 's', 'h', now);
const ownerCookie = `${SESS_COOKIE}=${await makeSession('tz-owner', SECRET)}`;
const strangerCookie = `${SESS_COOKIE}=${await makeSession('tz-stranger', SECRET)}`;
const operatorCookie = `${OP_COOKIE}=${await operatorToken(SECRET)}; ${OPID_COOKIE}=${await operatorIdToken(SECRET, 'tz-op')}`;
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }) === 403, 'no session, no write');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, strangerCookie) === 403, 'another account cannot declare the zone');
check(await post({ merchant: 'tz-shop', timeZone: 'Nowhere/Land' }, ownerCookie) === 400, 'invalid zone refused');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, ownerCookie, 'https://evil.invalid') === 403, 'cross-origin refused');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Berlin' }, tillCookie) === 200, 'a till report is accepted…');
check(await merchantZone(env, 'tz-shop') === DEFAULT_ZONE, '…but its device zone is never stored (B24)');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, ownerCookie) === 200, 'the owner declares the zone');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, ownerCookie) === 200, 'repeat declaration is idempotent');
check(await merchantZone(env, 'tz-shop') === 'Europe/Paris', 'server reads the declared store zone');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Berlin' }, tillCookie) === 200 && await merchantZone(env, 'tz-shop') === 'Europe/Paris', 'a till never overwrites the declared zone');
check(await post({ merchant: 'tz-shop', timeZone: 'Africa/Casablanca' }, operatorCookie) === 200 && await merchantZone(env, 'tz-shop') === 'Africa/Casablanca', 'a named operator may correct it');
check(await post({ merchant: 'tz-shop', timeZone: 'Europe/Paris' }, ownerCookie) === 200, 'the owner sets it back');
check(await merchantZone(env, 'other-shop') === DEFAULT_ZONE, 'other stores unchanged');
check(await merchantCutoff(env, 'tz-shop') === 5, 'legacy till retains 05:00 cutoff');
check(await post({ merchant: 'tz-shop', businessCutoff: 13 }, tillCookie) === 400,
  'out-of-range cutoff is refused');
check(await post({ merchant: 'tz-shop', businessCutoff: 7 }, `${TILL_COOKIE}=${await tillToken(SECRET, 'other-shop')}`) === 403, 'another store\'s till cannot write');
check(await post({ merchant: 'tz-shop', businessCutoff: 7 }, tillCookie) === 200,
  'paired till publishes its actual cutoff');
check(await merchantCutoff(env, 'tz-shop') === 7, 'server reads the paired till cutoff');
check(await merchantCutoff(env, 'other-shop') === 5, 'other merchant cutoff is isolated');

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
check(surface({ path: '/kiwi-caisse.html', paired: true, stored: 'Europe/Paris', device: 'Africa/Casablanca' }) === 'Europe/Paris',
  'paired till uses the declared store zone, not its device zone (B24)');
check(surface({ path: '/kiwi-caisse.html', paired: true, device: 'Europe/Berlin' }) === 'Africa/Casablanca',
  'a till set to Berlin with no declared zone runs on Casablanca (B24)');
check(surface({ path: '/kiwi-caisse.html', search: '?op=1&merchant=tz-shop', paired: true, stored: 'Europe/Paris', device: 'Asia/Tokyo' }) === 'Europe/Paris',
  'God Mode till session uses the store zone, not the operator device');
check(surface({ path: '/dashboard.html', stored: 'Europe/Paris', device: 'Asia/Tokyo' }) === 'Europe/Paris',
  'dashboard abroad follows the store zone');
check(surface({ path: '/dashboard.html', device: 'America/New_York' }) === 'Africa/Casablanca',
  'no store zone yet: Casablanca, not the device zone (B24)');

// 3b. The owner's setting (Horaires d'ouverture → Fuseau horaire) runs the real hours.js.
{
  const posts = [];
  const window = { KiwiConfig: { timezone: '' }, KiwiCloudDoc: { slugFor: (id) => (id === 'v-tz-shop' ? 'tz-shop' : ''), currentSlug: () => 'tz-shop' }, addEventListener() {} };
  const ctx = vm.createContext({ window, document: { addEventListener() {}, readyState: 'complete', querySelector: () => null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/dashboard.html', search: '' }, console, Date, Math, JSON, Intl, setTimeout, clearTimeout, setInterval() {},
    fetch: async (url, o) => { posts.push([url, JSON.parse(o.body)]); return { ok: true, json: async () => ({ ok: true, timeZone: JSON.parse(o.body).timeZone }) }; } });
  vm.runInContext(fs.readFileSync(new URL('assets/hours.js', ROOT), 'utf8'), ctx);
  const KH = window.KiwiHours;
  check(KH.zone() === 'Africa/Casablanca' && KH.zoneChoices()[0] === 'Africa/Casablanca', 'no declared zone: the setting shows Casablanca');
  check((await KH.setZone('Europe/Paris')).ok === true && posts[0][0] === '/api/timezone' && posts[0][1].merchant === 'tz-shop' && posts[0][1].timeZone === 'Europe/Paris', 'saving posts the declared zone for this store');
  check(KH.zone() === 'Europe/Paris', 'the page follows the declared zone at once');
  window.KiwiConfig.timezone = 'Europe/Berlin';
  check(KH.zoneChoices().includes('Europe/Berlin') && KH.zone() === 'Europe/Berlin', 'a stored zone is shown so the owner can see and correct it');
}

// 4. The till clock and the zone report are wired.
const caisse = caisseTestSource(fs.readFileSync(new URL('kiwi-caisse.html', ROOT), 'utf8'));
check(/function tickClock\(\)[\s\S]{0,900}resolvedOptions\(\)\.timeZone/.test(caisse), 'till clock falls back to the device zone');
const config = fs.readFileSync(new URL('assets/merchant-config.js', ROOT), 'utf8');
check(/function reportTillZone[\s\S]{0,900}\/api\/timezone/.test(config) && /op=1/.test(config), 'paired till reports its cutoff, never in God Mode');
check(config.includes('businessCutoff: cutoff') && config.includes('KiwiDayReport.cutoff') && !/function reportTillZone[\s\S]{0,900}resolvedOptions/.test(config), 'paired till reports the Z cutoff, never its device zone (B24)');
check(config.includes('KiwiHours.subscribe') && config.includes('reportTillZone(cfg.timezone, cfg.businessCutoff)'),
  'editing trading hours republishes the derived cutoff before the next shift');
check(config.includes("var clock = slug + ':' + cutoff"),
  'same browser pairing to another merchant cannot reuse the first merchant clock acknowledgement');
const middleware = fs.readFileSync(new URL('functions/_middleware.js', ROOT), 'utf8');
check(middleware.includes("path === '/api/timezone'"), 'till report passes the site gate to its own handler');

sql.close();
console.log(`✓ device timezone: ${n} checks · declared store zone (owner/operator), till cutoff only, Casablanca by default, God Mode guard, server business day`);
