#!/usr/bin/env node
/* business-day-default-test · direction 2027 §17.1.
 *
 * assets/kit/business-day.js is the browser's copy of the server's business
 * day (functions/api/_business-day.js) and the ONLY client file that holds the
 * defaults (DEFAULT_CUTOFF = 5, DEFAULT_ZONE = 'Africa/Casablanca'). This
 * test reads both files and fails when:
 *   · their defaults differ (the constants, and what each function does when
 *     it is called without a cutoff or a zone);
 *   · businessDate, businessBoundary, businessDayStart or businessDayWindows
 *     give a different answer on the same input, over a three-year grid with
 *     the clock changes, midnight, 04:59 / 05:00 and 23:59 / 00:00 edges, every
 *     cutoff from 0 to 12 and six zones, including a 25-hour and a 23-hour day;
 *   · it differs from KiwiDayReport.businessDay, the implementation the tills
 *     and dashboards ship today (assets/day-report.js), where the two meet;
 *   · resolve() does not give `config.businessCutoff ?? DEFAULT_CUTOFF` and
 *     `config.timezone || DEFAULT_ZONE` for every shape /api/config can send;
 *   · another client file holds a literal default zone or a literal
 *     `DEFAULT_CUTOFF` of its own.
 * Mutations of the client file must each turn it red. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as server from '../functions/api/_business-day.js';

/* A host far from Casablanca, so a client that fell back to the device zone would show. */
process.env.TZ = 'Pacific/Auckland';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SRC = fs.readFileSync(path.join(root, 'assets/kit/business-day.js'), 'utf8');
const SERVER_SRC = fs.readFileSync(path.join(root, 'functions/api/_business-day.js'), 'utf8');
const DAYREPORT_SRC = fs.readFileSync(path.join(root, 'assets/day-report.js'), 'utf8');

let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

function loadClient(src = CLIENT_SRC) {
  const ctx = vm.createContext({ module: { exports: {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/kit/haptics.js'), 'utf8'), ctx);
  vm.runInContext(src, ctx);
  return ctx.module.exports;
}

/* Everything that must agree, as a list of mismatches. */
const STOP = Symbol('enough');
function compare(client, stopAt = 8) {
  const bad = [];
  const note = (what, a, b) => { bad.push(`${what}: client ${a} server ${b}`); if (bad.length >= stopAt) throw STOP; };
  try { collect(client, note); } catch (e) { if (e !== STOP) throw e; }
  return bad;
}
function collect(client, note) {
  if (client.DEFAULT_CUTOFF !== server.DEFAULT_CUTOFF) note('DEFAULT_CUTOFF', client.DEFAULT_CUTOFF, server.DEFAULT_CUTOFF);
  if (client.DEFAULT_ZONE !== server.DEFAULT_ZONE) note('DEFAULT_ZONE', client.DEFAULT_ZONE, server.DEFAULT_ZONE);

  const instants = [];
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += 29 * 3600000 + 1800000 + 59000) instants.push(t);
  /* The edges, in every zone: around each local 04:59 / 05:00, 23:59 / 00:00, and the clock changes. */
  for (const day of ['2026-03-29', '2026-10-25', '2026-03-08', '2026-11-01', '2026-02-15', '2026-03-22', '2027-02-07', '2027-03-15', '2026-12-31']) {
    const base = Date.parse(day + 'T00:00:00Z');
    for (let m = -240; m <= 1800; m += 30) instants.push(base + m * 60000, base + m * 60000 - 1000, base + m * 60000 + 59000);
  }
  const zones = ['Africa/Casablanca', 'Europe/Paris', 'America/New_York', 'UTC', 'Asia/Kolkata', 'Pacific/Auckland'];
  for (const t of instants) {
    /* Called with no cutoff and no zone: each side's own defaults. */
    if (client.businessDate(t) !== server.businessDate(t)) note('businessDate default', new Date(t).toISOString(), client.businessDate(t) + ' vs ' + server.businessDate(t));
    if (client.businessDayStart(t) !== server.businessDayStart(t)) note('businessDayStart default', new Date(t).toISOString(), '');
  }
  for (const z of zones) {
    for (let c = 0; c <= 12; c++) {
      for (let i = 0; i < instants.length; i += c === 5 ? 2 : 23) {
        const t = instants[i];
        const a = client.businessDate(t, c, z), b = server.businessDate(t, c, z);
        if (a !== b) note(`businessDate ${z} cutoff ${c} ${new Date(t).toISOString()}`, a, b);
      }
      for (const day of ['2026-02-14', '2026-02-15', '2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25', '2027-02-07', '2027-02-08', '2027-03-14', '2027-03-15', '2026-12-31', '2027-01-01']) {
        const a = client.businessBoundary(day, c, z), b = server.businessBoundary(day, c, z);
        if (a !== b) note(`businessBoundary ${z} cutoff ${c} ${day}`, a, b);
        if (client.businessBoundary(day) !== server.businessBoundary(day)) note('businessBoundary default ' + day, '', '');
      }
    }
  }
  for (const t of instants.filter((_, i) => i % 41 === 0)) {
    for (const [c, z] of [[5, 'Africa/Casablanca'], [3, 'Europe/Paris'], [0, 'UTC'], [7, 'America/New_York']]) {
      if (JSON.stringify(client.businessDayWindows(t, 14, c, z)) !== JSON.stringify(server.businessDayWindows(t, 14, c, z))) note(`businessDayWindows ${z} ${c}`, new Date(t).toISOString(), '');
      if (client.businessDayStart(t, c, z) !== server.businessDayStart(t, c, z)) note(`businessDayStart ${z} ${c}`, new Date(t).toISOString(), '');
    }
    if (JSON.stringify(client.businessDayWindows(t)) !== JSON.stringify(server.businessDayWindows(t))) note('businessDayWindows default', new Date(t).toISOString(), '');
  }
  /* An unknown or empty zone is the default zone on both sides, never the host's. */
  for (const z of ['Mars/Olympus', '', null, "x'; DROP"]) {
    for (const t of instants.slice(0, 400)) {
      if (client.businessDate(t, 5, z) !== server.businessDate(t, 5, z)) note('businessDate with zone ' + JSON.stringify(z), new Date(t).toISOString(), '');
    }
  }
  for (const z of ['Europe/Paris', 'Mars/Olympus', '', null, undefined, "x'; DROP", 'UTC', 'America/Argentina/Buenos_Aires', 'a'.repeat(70)]) {
    if (client.validZone(z) !== server.validZone(z)) note('validZone ' + JSON.stringify(z), client.validZone(z), server.validZone(z));
  }
  if (client.addBusinessDays('2026-12-31', 1) !== server.addBusinessDays('2026-12-31', 1) || client.addBusinessDays('2026-03-01', -1) !== server.addBusinessDays('2026-03-01', -1)) note('addBusinessDays', '', '');
}

console.log('business-day-default-test');
const client = loadClient();

/* 1. The two files agree. */
{
  const bad = compare(client);
  ok(bad.length === 0, 'the client and the server give the same business day on the whole grid' + (bad.length ? ': ' + bad.join(' | ') : ''));
  ok(client.DEFAULT_CUTOFF === 5 && client.DEFAULT_ZONE === 'Africa/Casablanca', "DEFAULT_CUTOFF = 5 and DEFAULT_ZONE = 'Africa/Casablanca' (section 17.1)");
  /* The server's own fallbacks: what merchantCutoff() and merchantZone() answer for a store with no row. */
  const none = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  const broken = { DB: { prepare: () => { throw new Error('no such column'); } } };
  for (const [label, env] of [['no row', none], ['a database without the column', broken], ['no database', {}]]) {
    ok(await server.merchantCutoff(env, 'shop') === client.DEFAULT_CUTOFF && await server.merchantZone(env, 'shop') === client.DEFAULT_ZONE, `the server answers the client's defaults for ${label}`);
  }
  for (const bad of [13, -1, 2.5, 'x', null]) {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ business_cutoff: bad, timezone: 'Mars/Olympus' }) }) }) } };
    ok(await server.merchantCutoff(env, 's') === client.resolve({ businessCutoff: bad }).cutoff, `an invalid stored cutoff (${JSON.stringify(bad)}) resolves the same on both sides`);
  }
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ business_cutoff: 7, timezone: 'Europe/Paris' }) }) }) } };
  ok(await server.merchantCutoff(env, 's') === 7 && await server.merchantZone(env, 's') === 'Europe/Paris'
    && client.resolve({ businessCutoff: 7, timezone: 'Europe/Paris' }).cutoff === 7, 'a published cutoff and zone are used as is');
}

/* 2. resolve(): config.businessCutoff ?? DEFAULT_CUTOFF, config.timezone || DEFAULT_ZONE. */
{
  const D = { cutoff: 5, zone: 'Africa/Casablanca' };
  const cases = [
    [undefined, D, 'no config at all'],
    [{}, D, 'an older deployment that sends neither field'],
    [{ businessCutoff: null, timezone: '' }, D, "today's /api/config for a store with no row (null and empty)"],
    [{ businessCutoff: 3, timezone: 'Europe/Paris' }, { cutoff: 3, zone: 'Europe/Paris' }, 'a published cutoff and zone'],
    [{ businessCutoff: 0, timezone: 'UTC' }, { cutoff: 0, zone: 'UTC' }, 'cutoff 0 (calendar days) is a value, not a missing one'],
    [{ businessCutoff: 12 }, { cutoff: 12, zone: D.zone }, 'cutoff 12 is the upper bound'],
    [{ businessCutoff: 13, timezone: 'Mars/Olympus' }, D, 'out-of-range and unknown values fall back, never NaN or the device zone'],
    [{ businessCutoff: 2.5 }, D, 'a fractional cutoff falls back'],
    [{ businessCutoff: '5' }, D, 'a string cutoff falls back'],
    [{ businessDay: { cutoff: 4, zone: 'Europe/Paris' }, businessCutoff: null, timezone: '' }, { cutoff: 4, zone: 'Europe/Paris' }, 'the resolved block of the stage 1 route wins'],
    [{ businessDay: { cutoff: 5, zone: 'Africa/Casablanca' }, businessCutoff: null, timezone: '' }, D, 'the stage 1 route for a store with no row'],
    [{ businessDay: { cutoff: 99, zone: '' }, businessCutoff: 6, timezone: 'Asia/Tokyo' }, { cutoff: 6, zone: 'Asia/Tokyo' }, 'an unusable resolved block falls back to the raw fields'],
  ];
  for (const [cfg, want, label] of cases) {
    const got = client.resolve(cfg);
    ok(got.cutoff === want.cutoff && got.zone === want.zone, `resolve: ${label}`);
  }
  const flags = client.resolve({ businessCutoff: null, timezone: '' });
  ok(flags.cutoffIsDefault === true && flags.zoneIsDefault === true && client.resolve({ businessCutoff: 5, timezone: 'UTC' }).cutoffIsDefault === false, 'resolve says whether it fell back, so the fallback is stated, not hidden');
  /* Today's route and the stage 1 route give a store with no row the same business days. */
  const t = [Date.parse('2026-07-09T03:59:00Z'), Date.parse('2026-07-09T04:00:00Z')];   // 04:59 and 05:00 in Casablanca in July
  for (const cfg of [{ businessCutoff: null, timezone: '' }, { businessCutoff: null, timezone: '', businessDay: { cutoff: 5, zone: 'Africa/Casablanca' } }]) {
    const r = client.resolve(cfg);
    ok(client.businessDate(t[0], r.cutoff, r.zone) === '2026-07-08' && client.businessDate(t[1], r.cutoff, r.zone) === '2026-07-09'
      && client.businessDate(t[0], r.cutoff, r.zone) === server.businessDate(t[0]), 'a store with no row: 04:59 is the previous day and 05:00 the new one, as on the server');
  }
}

/* 3. The implementation the app ships today (assets/day-report.js) is the same rule. */
{
  function shipped(zone, cutoff) {
    const store = new Map([['kiwiDayCutoff', String(cutoff)]]);
    const window = { addEventListener() {}, dispatchEvent() {}, KiwiConfig: { timezone: zone } };
    const ctx = vm.createContext({
      window, document: { addEventListener() {}, querySelector: () => null }, location: { pathname: '/dashboard.html', search: '' },
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
      console, Date, Math, JSON, CustomEvent: class {},
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/kit/haptics.js'), 'utf8'), ctx);
    vm.runInContext(DAYREPORT_SRC, ctx);
    return window.KiwiDayReport;
  }
  let bad = 0, n = 0;
  for (const [zone, cutoff] of [['Africa/Casablanca', 5], ['Europe/Paris', 3], ['America/New_York', 0], ['Africa/Casablanca', 7]]) {
    const R = shipped(zone, cutoff);
    for (const day of ['2026-03-29', '2026-10-25', '2026-03-08', '2026-02-15']) {
      const base = Date.parse(day + 'T00:00:00Z');
      for (let m = -120; m <= 1700; m += 17) {
        const t = base + m * 60000;
        n++;
        if (R.businessDay(t) !== client.businessDate(t, cutoff, zone)) bad++;
      }
    }
  }
  ok(n > 300 && bad === 0, `KiwiDayReport.businessDay (the shipped rule) and the client module agree on ${n} instants in four stores`);
}

/* 4. No other client file keeps a default of its own. */
{
  const dir = path.join(root, 'assets/kit');
  const files = fs.readdirSync(dir).filter((f) => /\.(js|mjs)$/.test(f) && f !== 'business-day.js');
  const offenders = files.filter((f) => /DEFAULT_CUTOFF\s*=|['"]Africa\/Casablanca['"]/.test(fs.readFileSync(path.join(dir, f), 'utf8').replace(f === 'haptics.js' ? /^const ZONE_LAWS = .*;$/m : /$^/, '')));
  ok(offenders.length === 0, `no other kit file holds DEFAULT_CUTOFF or the default zone (${files.length} kit files read)`);
  ok(/export const DEFAULT_CUTOFF = 5;/.test(SERVER_SRC) && /export const DEFAULT_ZONE = 'Africa\/Casablanca';/.test(SERVER_SRC), 'the server holds the same two constants, exported');
}

/* 5. Mutations of the client file each turn the comparison red. */
{
  const mutations = [
    ['the default cutoff is 6', (s) => s.replace('var DEFAULT_CUTOFF = 5;', 'var DEFAULT_CUTOFF = 6;')],
    ['the default zone is UTC', (s) => s.replace("var DEFAULT_ZONE = 'Africa/Casablanca';", "var DEFAULT_ZONE = 'UTC';")],
    ['the day changes at the cutoff hour inclusive', (s) => s.replace('return Number(p.hour) < cutoff', 'return Number(p.hour) <= cutoff')],
    ['the boundary ignores the clock change', (s) => s.replace('for (var i = 0; i < 4; i++) {', 'for (var i = 0; i < 1; i++) {')],
    ['the device zone replaces the default for an unknown zone', (s) => s.replace("var z = validZone(zone) || DEFAULT_ZONE;", "var z = validZone(zone) || undefined;")],
  ];
  for (const [name, mutate] of mutations) {
    const src = mutate(CLIENT_SRC);
    ok(src !== CLIENT_SRC, `mutation "${name}" applies`);
    let red;
    try { red = compare(loadClient(src), 1).length > 0; } catch (_) { red = true; }
    ok(red, `mutation "${name}" turns the comparison red`);
  }
}

console.log(`\nbusiness-day-default-test: ${checks} checks passed`);
