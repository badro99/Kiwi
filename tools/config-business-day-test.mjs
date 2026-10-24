#!/usr/bin/env node
/* config-business-day-test · GET /api/config answers the business day the
 * ledger counts on (direction 2027 §17.1, stage 1 server change).
 *
 * Today the route sends `businessCutoff: null` and `timezone: ''` for a store
 * with no valid merchant_config row, while the server itself falls back to 5
 * and Africa/Casablanca. Stage 1 adds `businessDay: { cutoff, zone,
 * cutoffIsDefault, zoneIsDefault }`, resolved by the same rule as
 * merchantCutoff() and merchantZone(), and changes NOTHING else:
 *   · `timezone` and `businessCutoff` keep meaning "what the store published"
 *     (merchant-config.js reads that silence: the till reports its own clock
 *     when it differs, a dashboard adopts only a cutoff the till published);
 *   · every other field is byte for byte what it was;
 *   · the neutral answers (no database, no merchant) are untouched.
 * Real route, real SQLite from schema.sql, no credential involved: the store is
 * not a demo slug and the caller is anonymous, which reads features and type. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import * as config from '../functions/api/config.js';
import { merchantCutoff, merchantZone } from '../functions/api/_business-day.js';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const wrap = (db, breakOn) => ({
  prepare(q) {
    if (breakOn && breakOn.test(q)) throw new Error('no such column');
    let a = [];
    return {
      bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return this; },
      async first() { return db.prepare(q).get(...a) ?? null; },
      async all() { return { results: db.prepare(q).all(...a) }; },
      async run() { const r = db.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
  },
});
const DB = wrap(sql);
const now = Date.now();
const add = (merchant, extra = {}) => {
  sql.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts) VALUES (?, '{\"kds\":true}', 'active', ?)").run(merchant, now);
  if ('timezone' in extra) sql.prepare('UPDATE merchant_config SET timezone = ? WHERE merchant = ?').run(extra.timezone, merchant);
  if ('cutoff' in extra) sql.prepare('UPDATE merchant_config SET business_cutoff = ? WHERE merchant = ?').run(extra.cutoff, merchant);
};
add('bd-plain');                                              // a row with nothing published
/* A store from before the first till report has neither column: timezone.js adds
 * them at run time. schema.sql now declares both (prod has them), so model the
 * pre-upgrade database by taking them off first. */
sql.exec('ALTER TABLE merchant_config DROP COLUMN timezone');
sql.exec('ALTER TABLE merchant_config DROP COLUMN business_cutoff');
const beforeColumns = await (await config.onRequestGet({ env: { DB }, request: new Request('https://k.invalid/api/config?merchant=bd-plain') })).json();
sql.exec('ALTER TABLE merchant_config ADD COLUMN timezone TEXT');
sql.exec('ALTER TABLE merchant_config ADD COLUMN business_cutoff INTEGER');
add('bd-paris-7', { timezone: 'Europe/Paris', cutoff: 7 });   // a till that reported both
add('bd-cutoff-0', { cutoff: 0 });                            // calendar days, zone never reported
add('bd-zone-only', { timezone: 'America/New_York' });
add('bd-bad-values', { timezone: 'Mars/Olympus', cutoff: 13 });

const get = async (merchant, env = { DB }) => {
  const res = await config.onRequestGet({ env, request: new Request('https://k.invalid/api/config?merchant=' + merchant) });
  assert.equal(res.status, 200);
  return res.json();
};

console.log('config-business-day-test');

/* The shape every current caller reads. */
const LEGACY = ['features', 'pins', 'pinGateConfigured', 'type', 'plan', 'planExplicit', 'suspended', 'timezone', 'businessCutoff', 'subscription'];

{
  const a = await get('bd-no-row-at-all');
  ok(a.timezone === '' && a.businessCutoff === null, "a store with no row: `timezone` is still '' and `businessCutoff` still null (the silence current callers read)");
  ok(a.businessDay && a.businessDay.cutoff === 5 && a.businessDay.zone === 'Africa/Casablanca' && a.businessDay.cutoffIsDefault === true && a.businessDay.zoneIsDefault === true,
    'and `businessDay` carries the resolved 5 and Africa/Casablanca, flagged as defaults');
  ok(Object.keys(a).sort().join() === [...LEGACY, 'businessDay', 'pollMode'].sort().join(), 'the answer holds exactly the existing fields plus `businessDay` and `pollMode`');
  ok(a.features && typeof a.features === 'object' && Array.isArray(a.pins) && a.pinGateConfigured === false && a.type === '' && a.suspended === false
    && a.subscription.state === 'active' && a.subscription.active === true, 'the other fields keep the values they had');
}
{
  const a = await get('bd-plain');
  ok(a.timezone === '' && a.businessCutoff === null && a.businessDay.cutoff === 5 && a.businessDay.zone === 'Africa/Casablanca', 'a row with nothing published: raw fields untouched, defaults resolved');
  ok(a.features.kds === true && a.plan === 'basic' && a.planExplicit === false, 'its features and plan are read as before');
}
{
  const a = await get('bd-paris-7');
  ok(a.timezone === 'Europe/Paris' && a.businessCutoff === 7, 'a published zone and cutoff are returned in the old fields');
  ok(a.businessDay.cutoff === 7 && a.businessDay.zone === 'Europe/Paris' && !a.businessDay.cutoffIsDefault && !a.businessDay.zoneIsDefault, 'and in `businessDay`, not flagged');
}
{
  const a = await get('bd-cutoff-0');
  ok(a.businessCutoff === 0 && a.businessDay.cutoff === 0 && a.businessDay.cutoffIsDefault === false, 'cutoff 0 (calendar days) is a published value, never replaced by 5');
  ok(a.timezone === '' && a.businessDay.zone === 'Africa/Casablanca' && a.businessDay.zoneIsDefault === true, 'its unreported zone resolves to the default');
  const b = await get('bd-zone-only');
  ok(b.timezone === 'America/New_York' && b.businessCutoff === null && b.businessDay.cutoff === 5 && b.businessDay.zone === 'America/New_York', 'a zone without a cutoff resolves each half on its own');
  const c = await get('bd-bad-values');
  ok(c.timezone === '' && c.businessCutoff === null && c.businessDay.cutoff === 5 && c.businessDay.zone === 'Africa/Casablanca', 'values the server rejects (13, an unknown zone) are not published and resolve to the defaults');
}
{
  /* The route answers what the ledger's own functions answer, for every case above. */
  for (const m of ['bd-no-row-at-all', 'bd-plain', 'bd-paris-7', 'bd-cutoff-0', 'bd-zone-only', 'bd-bad-values']) {
    const a = await get(m);
    ok(a.businessDay.cutoff === await merchantCutoff({ DB }, m) && a.businessDay.zone === await merchantZone({ DB }, m), `${m}: the same cutoff and zone as merchantCutoff() and merchantZone()`);
  }
}
{
  ok(beforeColumns.timezone === '' && beforeColumns.businessCutoff === null && beforeColumns.businessDay.cutoff === 5 && beforeColumns.businessDay.zone === 'Africa/Casablanca',
    'the real schema, before any till has reported (no columns yet): old fields as before, defaults resolved');
  /* The same, forced onto a row that has values. */
  const old = wrap(sql, /timezone|business_cutoff/);
  const a = await get('bd-paris-7', { DB: old });
  ok(a.timezone === '' && a.businessCutoff === null && a.businessDay.cutoff === 5 && a.businessDay.zone === 'Africa/Casablanca' && a.businessDay.cutoffIsDefault && a.businessDay.zoneIsDefault,
    'a database without the columns: old fields as before, defaults resolved, no throw');
  ok(a.features.kds === true, 'and the feature flags are still returned');
}
{
  /* The neutral answers do not move. */
  const none = await (await config.onRequestGet({ env: {}, request: new Request('https://k.invalid/api/config?merchant=x') })).json();
  ok(JSON.stringify(none) === JSON.stringify({ features: {}, pins: [] }), 'no backend: still { features: {}, pins: [] }');
  const anon = await (await config.onRequestGet({ env: { DB }, request: new Request('https://k.invalid/api/config') })).json();
  ok(JSON.stringify(anon) === JSON.stringify({ features: {}, pins: [], pinGateConfigured: false }), 'no merchant: still { features: {}, pins: [], pinGateConfigured: false }');
}
{
  /* The client turns the answer into the day it counts on, today's route and the new one alike. */
  const ctx = vm.createContext({ module: { exports: {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/kit/business-day.js'), 'utf8'), ctx);
  const client = ctx.module.exports;
  const today = { timezone: '', businessCutoff: null };
  const stage1 = await get('bd-no-row-at-all');
  const t = [Date.parse('2026-07-09T03:59:00Z'), Date.parse('2026-07-09T04:00:00Z')];
  const days = (cfg) => { const r = client.resolve(cfg); return t.map((x) => client.businessDate(x, r.cutoff, r.zone)).join(); };
  ok(days(today) === days(stage1) && days(stage1) === '2026-07-08,2026-07-09', 'KiwiBusinessDay.resolve gives a store with no row the same business days from today\'s answer and the stage 1 answer');
}

console.log(`\nconfig-business-day-test: ${checks} checks passed`);
sql.close();
