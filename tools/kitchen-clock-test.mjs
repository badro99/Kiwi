#!/usr/bin/env node
/* kitchen-clock-test · wave 12, lane G (kitchen#2).
 *
 * kiwi-cuisine.html aged tickets and purged the 6 h service with the tablet's
 * Date.now() against created_ts, which is SERVER time, and printed hours with
 * the tablet's own zone. A tablet five minutes slow showed every ticket five
 * minutes young; one in the wrong zone printed the wrong hour.
 *   1. the queue route answers its clock (serverNow) and the store's zone;
 *   2. assets/kitchen-relay.js learns the offset on each poll: now() is server
 *      time, hm(ts) is HH:MM in the store's zone;
 *   3. the real elapsed() / hm() / purge test of kiwi-cuisine.html use them.
 * Real route over the in-memory D1, real relay and real cuisine functions in vm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/order/queue.js';

process.env.TZ = 'Pacific/Auckland';           // a tablet far from the store
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0;
const ok = async (label, f) => { await f(); n++; console.log('  ✓ ' + label); };

const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
}; } };
const merchant = 'kitchen-clock-test';
const env = { DB, AUTH_SECRET: 'kitchen-clock-test-secret' };
const t0 = Date.now();
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)').run('owner', 'owner@test.invalid', 'Owner', 'KC', 's', 'h', t0);
db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts,timezone) VALUES(?,?,?,?,?,?)').run(merchant, '{"orderpro":true}', 'restaurant', 'owner', t0, 'Africa/Casablanca');
const cookie = sessionCookie(await makeSession('owner', env.AUTH_SECRET)).split(';')[0];

let poll;
await ok('the queue answers its own clock and the store zone', async () => {
  const r = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/order/queue?merchant=${merchant}&since=0&role=kitchen`, { headers: { Cookie: cookie } }) });
  assert.equal(r.status, 200);
  poll = await r.json();
  assert.ok(Math.abs(poll.serverNow - Date.now()) < 5000, 'serverNow is the server time');
  assert.equal(poll.zone, 'Africa/Casablanca');
});

/* ── the relay, with a tablet whose clock is 7 min slow ── */
const SKEW = -7 * 60 * 1000;
function relay(zone = 'Africa/Casablanca') {
  const real = Date.now();
  class SlowDate extends Date { static now() { return real + SKEW; } constructor(...a) { if (a.length) super(...a); else super(real + SKEW); } }
  const win = { KiwiCaissePairing: { isPaired: () => true, pairedVenue: () => ({ merchant: 'kitchen-clock-test' }) }, addEventListener() {} };
  const ctx = vm.createContext({
    window: win, Date: SlowDate, Intl, Promise, Math, JSON, Number, String, Array, Object, isFinite, globalThis: {},
    localStorage: { getItem: () => null, setItem() {} }, navigator: { onLine: true },
    setTimeout, clearTimeout, AbortController, encodeURIComponent,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, orders: [], serverNow: real, zone, now: real - 2000 }) }),
  });
  win.localStorage = ctx.localStorage;
  ctx.KiwiCaissePairing = win.KiwiCaissePairing;
  ctx.globalThis = ctx;
  vm.runInContext(read('assets/kitchen-relay.js'), ctx, { filename: 'assets/kitchen-relay.js' });
  return { R: win.KiwiKitchenRelay, real, SlowDate, ctx };
}
await ok('a slow tablet clock is corrected on the first poll (now() is server time)', async () => {
  const { R, real } = relay();
  assert.ok(Math.abs(R.now() - (real + SKEW)) < 100, 'before any poll: the tablet clock');
  await R.pull(0, 'kitchen');
  assert.ok(Math.abs(R.now() - real) < 200, 'after a poll: server time, not 7 minutes behind');
});
await ok('hm() prints the store hour, not the tablet zone', async () => {
  const { R } = relay();
  await R.pull(0, 'kitchen');
  const ts = Date.UTC(2026, 9, 20, 23, 30);                   // Casablanca is UTC+0 since 20 Sept 2026
  assert.equal(R.hm(ts), new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts));
  const tabletZone = new Date(ts).toTimeString().slice(0, 5);
  assert.notEqual(R.hm(ts), tabletZone, 'the Auckland tablet zone must not leak into the ticket');
});

/* ── the real functions of kiwi-cuisine.html ── */
const HTML = read('kiwi-cuisine.html');
function fn(name) {
  const i = HTML.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' found');
  let d = 0;
  for (let k = HTML.indexOf('{', i); k < HTML.length; k++) {
    if (HTML[k] === '{') d++; else if (HTML[k] === '}' && --d === 0) return HTML.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
await ok('elapsed() and the purge compare server created_ts with server time', async () => {
  const { R, real, SlowDate } = relay();
  await R.pull(0, 'kitchen');
  const ctx = vm.createContext({ window: { KiwiKitchenRelay: R }, KiwiKitchenRelay: R, Date: SlowDate, Math });
  vm.runInContext(fn('clockNow') + '\n' + fn('elapsed') + '\n' + fn('hm') + '\nthis.api = { elapsed, hm };', ctx);
  assert.equal(ctx.api.elapsed({ created_ts: real - 5 * 60 * 1000 }), 300, 'a ticket sent 5 min ago on the server shows 5:00, not -2 min nor 12 min');
  const stale = HTML.match(/\(clockNow\(\) - (old\.created_ts|o\.created_ts)\) > STALE_MS/g) || [];
  assert.equal(stale.length, 2, 'both purge tests read the server clock');
  assert.ok(/var now = clockNow\(\), n = 0;/.test(HTML), 'the cold-start restore reads the server clock');
  assert.ok(!/Date\.now\(\) - (old\.created_ts|o\.created_ts)/.test(HTML), 'no ticket age left on the tablet clock');
});
await ok('without a relay the page still answers (tablet clock and zone)', async () => {
  const ctx = vm.createContext({ window: {}, Date, Math });
  vm.runInContext(fn('clockNow') + '\n' + fn('elapsed') + '\n' + fn('hm') + '\nthis.api = { elapsed, hm, clockNow };', ctx);
  assert.ok(Math.abs(ctx.api.clockNow() - Date.now()) < 100);
  assert.match(ctx.api.hm(Date.UTC(2026, 9, 20, 12, 0)), /^\d\d:\d\d$/);
});
console.log(`PASS kitchen clock (${n} checks)`);
