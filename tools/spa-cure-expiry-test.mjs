#!/usr/bin/env node
/* spa-cure-expiry-test · wave 12, lane G (clients#0).
 *
 * The wave Q ruling: a spa package expires at the end of its business day,
 * 05:00 the next morning in the store's zone. The dashboard workspace had it;
 * a cure sold at the till stored `expiresDays: 180` with no date and
 * redemption never looked at expiry. Now the sale stamps `expiresOn` with the
 * same rule (assets/trade-workspace-schema.js · cureExpiryOn) and the till
 * refuses an expired cure everywhere it is offered or punched.
 * Real schema functions and the real pos-spa.js helpers, run in vm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0;
const ok = (label, f) => { f(); n++; console.log('  ✓ ' + label); };

function schema(nowMs) {
  class FixedDate extends Date { static now() { return nowMs; } constructor(...a) { if (a.length) super(...a); else super(nowMs); } }
  const win = { KiwiDayReport: { timezone: () => 'Africa/Casablanca' } };
  const ctx = vm.createContext({ window: win, Date: FixedDate, Intl, Math, Number, String, Object, Array, JSON, RegExp, isFinite, console });
  vm.runInContext(read('assets/kit/haptics.js'), ctx);          // the zone law: Casablanca is UTC+0 since 20 Sept 2026
  vm.runInContext(read('assets/trade-workspace-schema.js'), ctx);
  return { S: win.KiwiTradeSchema, win, ctx, FixedDate };
}
const at = (iso) => Date.parse(iso);

ok('a cure sold at 02:00 belongs to the previous business day: 180 days from it', () => {
  const { S } = schema(at('2026-10-20T02:00:00Z'));
  assert.equal(S.cureExpiryOn(at('2026-10-20T02:00:00Z'), 180), '2027-04-17', 'business day 19 Oct + 180');
  assert.equal(S.cureExpiryOn(at('2026-10-20T06:00:00Z'), 180), '2027-04-18', 'business day 20 Oct + 180');
});
ok('valid until 04:59 after the last day, expired from 05:00', () => {
  const { S } = schema(0);
  assert.equal(S.cureDaysLeft('2027-04-17', at('2027-04-18T04:59:00Z')), 0, 'still the last business day');
  assert.equal(S.cureDaysLeft('2027-04-17', at('2027-04-18T05:00:00Z')), -1, 'expired at the 05:00 bascule');
  assert.equal(S.cureDaysLeft('2027-04-17', at('2027-04-10T12:00:00Z')), 7);
});
ok('a cure without a date (sold before it was kept) has no verdict', () => {
  const { S } = schema(0);
  assert.equal(S.cureDaysLeft(undefined, at('2030-01-01T12:00:00Z')), null);
  assert.equal(S.cureDaysLeft('', 0), null);
  assert.equal(S.cureDaysLeft('soon', 0), null);
});
ok('the dashboard workspace derives the same days left for the same package', () => {
  for (const iso of ['2027-04-18T04:59:00Z', '2027-04-18T05:00:00Z', '2027-04-12T09:00:00Z']) {
    const { S } = schema(at(iso));
    const sch = S.get('spa', 'packages');
    const rec = S.derived(sch, { values: { title: 'Cure', clientRef: 'c1', sessionsTotal: 5, sessionsUsed: 1, expiresAt: '2027-04-17' } }, at(iso));
    assert.equal(rec.derived.daysToExpiry, S.cureDaysLeft('2027-04-17', at(iso)), iso);
  }
});

/* ── the till (assets/pos-spa.js) ── */
const SPA = read('assets/pos-spa.js');
const line = (re) => { const m = SPA.match(re); assert.ok(m, String(re)); return m[0]; };
function till(nowIso, cures) {
  const { win, ctx, FixedDate } = schema(at(nowIso));
  const sandbox = vm.createContext({ window: win, Date: FixedDate, CURES: cures, FORFAIT: { fh: { presta: 'hammam' }, fm: { presta: 'massage' } } });
  sandbox.globalThis = ctx;
  const code = [
    line(/^ {2}const cureExpired = .*$/m),
    line(/^ {2}const curesOf = .*$/m),
    SPA.match(/^ {2}const cureFor = [\s\S]*?;\n/m)[0],
    'this.api = { cureExpired, curesOf, cureFor };',
  ].join('\n');
  vm.runInContext(code, sandbox);
  return sandbox.api;
}
const cure = (id, extra) => ({ id, clientId: 'c1', familyId: 'fh', size: 10, used: 3, ...extra });
ok('an expired cure is neither offered nor redeemable; a valid or legacy one is', () => {
  const cures = [cure('old', { expiresOn: '2027-04-17' }), cure('live', { expiresOn: '2027-05-30' }), cure('legacy', {})];
  const T = till('2027-04-18T05:00:00Z', cures);
  assert.deepEqual(T.curesOf('c1').map((c) => c.id), ['live', 'legacy']);
  assert.equal(T.cureFor('c1', 'hammam').id, 'live');
  assert.equal(T.cureExpired(cures[0]), true);
  assert.equal(T.cureExpired(cures[2]), false, 'no date, no verdict: never locked out by a missing field');
  const night = till('2027-04-18T04:30:00Z', cures);
  assert.deepEqual(night.curesOf('c1').map((c) => c.id), ['old', 'live', 'legacy'], 'at 04:30 the last business day is still running');
});
ok('the sale stamps the date and the punch dialog refuses an expired cure', () => {
  assert.ok(/expiresDays: 180, expiresOn: window\.KiwiTradeSchema\?\.cureExpiryOn\?\.\(Date\.now\(\), 180\)/.test(SPA), 'the sold cure carries expiresOn');
  assert.ok(/if \(!cu \|\| cu\.used >= cu\.size \|\| cureExpired\(cu\)\) return;/.test(SPA), 'openPunch refuses an expired cure');
  assert.ok(/const full = cu\.used >= cu\.size \|\| cureExpired\(cu\);/.test(SPA), 'an expired cure shows the renew action, not a punch button');
  assert.ok(/fulls = CURES\.filter\(\(cu\) => cu\.used >= cu\.size \|\| cureExpired\(cu\)\)/.test(SPA), 'and moves to the cures to renew');
});
console.log(`PASS spa cure expiry (${n} checks)`);
