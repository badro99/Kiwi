#!/usr/bin/env node
/* promos-properties-test · a promotion is a rule, and the till must apply it the same way every time.
 *
 * assets/promos.js decides which boutique promotion prices an item: scope
 * (whole store, sections, items, stock entered before a date, end of line),
 * dates, weekdays and hours on the 05:00 business day in Casablanca time,
 * pause, and the rule that two promotions never stack: the lowest price wins,
 * the oldest on a tie. Its merge() reconciles the rules between devices.
 * Generated catalogues, rule sets and moments run through the real module and
 * are checked against an independent model. Moments are drawn after 20
 * September 2026, when Morocco moved to permanent UTC+0, so the model's wall
 * clock is plain UTC; the module still reads it through the zone law. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; promotion properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 500, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const data = new Map();
const localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
const window = { localStorage };
const ctx = vm.createContext({ window, localStorage, console, Set, Map, Math, Date, JSON, Number, Object, Array, String, Intl });
vm.runInContext('globalThis.window = window;', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/kit/haptics.js'), 'utf8'), ctx, { filename: 'haptics.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/promos.js'), 'utf8'), ctx, { filename: 'promos.js' });
const PR = window.KiwiPromos;
assert.ok(PR && ctx.KiwiZoneLaw, 'module or zone law missing');

const DAY = 86400000, MIN = 60000;
const T_MIN = Date.UTC(2026, 9, 1), T_MAX = Date.UTC(2027, 5, 1);
const nowArb = fc.integer({ min: T_MIN, max: T_MAX });
const RAYONS = ['robes', 'caftans', 'accessoires'];
const hhmm = fc.integer({ min: 0, max: 23 * 60 + 59 }).map((m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));

const promoArb = (i) => fc.record({
  kind: fc.constantFrom('percent', 'amount', 'fixed'),
  value: fc.integer({ min: 0, max: 3000 }),
  scope: fc.oneof(
    fc.constant({ type: 'tout' }),
    fc.record({ type: fc.constant('rayon'), ids: fc.subarray(RAYONS) }),
    fc.record({ type: fc.constant('produits'), ids: fc.subarray(['a', 'b', 'c', 'd']) }),
    fc.record({ type: fc.constant('avant'), before: fc.integer({ min: T_MIN - 400 * DAY, max: T_MAX }) }),
    fc.record({ type: fc.constant('stock'), max: fc.integer({ min: 0, max: 6 }) })),
  from: fc.oneof(fc.constant(0), nowArb), to: fc.oneof(fc.constant(0), nowArb),
  days: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
  start: fc.option(hhmm, { nil: '' }), end: fc.option(hhmm, { nil: '' }),
  paused: fc.boolean(),
  createdAt: fc.integer({ min: 1, max: 1e6 }),
}).map((p) => ({ ...p, id: 'pr' + i, name: 'Promo ' + i, updatedAt: p.createdAt }));
const rulesArb = fc.tuple(...[0, 1, 2, 3].map(promoArb)).chain((ps) => fc.subarray(ps));
const itemArb = fc.record({
  id: fc.constantFrom('a', 'b', 'c', 'd'), rayon: fc.constantFrom(...RAYONS), price: fc.integer({ min: 0, max: 500000 }).map((c) => c / 100),
  createdAt: fc.integer({ min: T_MIN - 400 * DAY, max: T_MAX }), sizes: fc.record({ S: fc.nat(4), M: fc.nat(4) }),
});
function install(rules) { PR.reset(); PR.batch(() => rules.forEach((r) => PR.save(r))); /* save() stamps updatedAt; restore the generated one */ const db = JSON.parse(localStorage.getItem('kiwi:bqPromos:v1:' + PR.currentVenue())); db.promos.forEach((p, k) => { p.createdAt = rules[k].createdAt; p.updatedAt = rules[k].updatedAt; }); localStorage.setItem('kiwi:bqPromos:v1:' + PR.currentVenue(), JSON.stringify(db)); PR.use('other-venue'); PR.use(PR.demoVenue); }

/* ── the model ─────────────────────────────────────────────────────────── */
const HH = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (v) => { const m = HH.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
function business(now) { const d = new Date(now); let min = d.getUTCHours() * 60 + d.getUTCMinutes(), wd = d.getUTCDay(); if (min < 300) wd = (wd + 6) % 7; return { wd, min }; }
function running(p, now) {
  if (p.paused) return false;
  if (p.to && now > p.to) return false;
  if (p.from && now < p.from) return false;
  const days = p.days.length === 7 ? [] : p.days;
  const b = business(now);
  if (days.length && !days.includes(b.wd)) return false;
  const a = toMin(p.start), z = toMin(p.end);
  if (a == null || z == null || a === z) return true;
  return a < z ? b.min >= a && b.min < z : b.min >= a || b.min < z;
}
function hits(p, item) {
  const s = p.scope, stock = item.sizes.S + item.sizes.M;
  if (s.type === 'tout') return true;
  if (s.type === 'rayon') return s.ids.includes(item.rayon);
  if (s.type === 'produits') return s.ids.includes(item.id);
  if (s.type === 'avant') return !!s.before && !!item.createdAt && item.createdAt < s.before;
  return stock > 0 && stock <= s.max;
}
function priced(p, was) {
  const v = Math.round(p.value), pct = Math.min(100, v);
  const out = p.kind === 'percent' ? Math.floor(was * (100 - pct) / 100 + 1e-6) : p.kind === 'amount' ? was - v : v;
  return Math.max(0, Math.min(was, Math.floor(out + 1e-6)));
}
function model(rules, item, now) {
  const was = Math.floor(item.price + 1e-6);
  let best = null;
  for (const p of rules) {
    if (!running(p, now) || !hits(p, item)) continue;
    const price = priced(p, was);
    if (price >= was) continue;
    if (!best || price < best.price || (price === best.price && p.createdAt < best.createdAt)) best = { price, id: p.id, createdAt: p.createdAt };
  }
  return best;
}

console.log('promos-properties-test');

strict('the till charges exactly the best single promotion running now for that item, never two stacked, never above the shelf, never below zero', fc.property(rulesArb, itemArb, nowArb, (rules, item, now) => {
  install(rules);
  const got = PR.priceFor(item, { now }), want = model(rules, item, now);
  if (!want) { assert.equal(got, null); return; }
  assert.ok(got, 'no promotion applied, expected ' + want.id);
  assert.equal(got.price, want.price);
  assert.equal(got.promo.id, want.id);
  assert.ok(got.price >= 0 && got.price < got.was && got.was <= item.price);
}));

strict('status agrees with the till: active exactly when the rule prices something now', fc.property(rulesArb, nowArb, (rules, now) => {
  install(rules);
  for (const p of PR.list()) assert.equal(PR.status(p, now) === 'active', running(rules.find((r) => r.id === p.id), now), p.id);
}));

strict('a window past midnight still belongs to the business day it started on (the day turns at 05:00)', fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 299 }), fc.integer({ min: 0, max: 60 }), (wd, minute, week) => {
  /* Friday 22:00 to 01:00: at 00:30 on Saturday it still counts for Friday. */
  const base = Date.UTC(2026, 9, 4 + wd + 7 * week);         // 4 Oct 2026 is a Sunday
  const now = base + DAY + minute * MIN;                      // early hours of the next calendar day
  const p = { id: 'w', kind: 'percent', value: 10, scope: { type: 'tout' }, days: [new Date(base).getUTCDay()], start: '22:00', end: '05:00', createdAt: 1, updatedAt: 1 };
  install([p]);
  assert.equal(PR.status(PR.get('w'), now), 'active');
  assert.equal(PR.businessMoment(now).weekday, new Date(base).getUTCDay());
}));

strict('normalising a rule twice changes nothing, and a percentage never passes 100', fc.property(promoArb(0), (p) => {
  const once = PR.normalize(p), twice = PR.normalize(once);
  assert.deepEqual(JSON.parse(JSON.stringify(twice)), JSON.parse(JSON.stringify(once)));
  if (once.kind === 'percent') assert.ok(once.value <= 100);
}));

/* ── two devices, one set of rules ─────────────────────────────────────── */
const editArb = fc.array(fc.record({ dev: fc.nat(1), op: fc.constantFrom('edit', 'delete', 'resave'), id: fc.constantFrom('pr0', 'pr1', 'pr2'), value: fc.integer({ min: 1, max: 90 }) }), { maxLength: 12 });
function devicesFrom(edits) {
  const base = ['pr0', 'pr1', 'pr2'].map((id, k) => PR.normalize({ id, kind: 'percent', value: 10 + k, scope: { type: 'tout' }, createdAt: 1 + k, updatedAt: 1 + k }));
  const devs = [{ v: 1, promos: base.map((x) => ({ ...x })), deleted: [] }, { v: 1, promos: base.map((x) => ({ ...x })), deleted: [] }];
  let t = 100;
  const last = {};
  for (const e of edits) {
    const d = devs[e.dev]; t += 1 + e.dev;     // distinct instants on each device
    const i = d.promos.findIndex((p) => p.id === e.id);
    if (e.op === 'delete') { if (i < 0) continue; d.promos.splice(i, 1); d.deleted.push({ id: e.id, at: t }); last[e.id] = { at: t, gone: true }; }
    else if (e.op === 'edit') { if (i < 0) continue; d.promos[i] = { ...d.promos[i], value: e.value, updatedAt: t }; last[e.id] = { at: t, value: e.value }; }
    else { const p = PR.normalize({ id: e.id, kind: 'percent', value: e.value, scope: { type: 'tout' }, createdAt: 9, updatedAt: t }); if (i >= 0) d.promos[i] = p; else d.promos.push(p); d.deleted = d.deleted.filter((x) => x.id !== e.id); last[e.id] = { at: t, value: e.value }; }
  }
  return { devs, last };
}
const view = (doc) => doc.promos.map((p) => p.id + ':' + p.value + ':' + p.updatedAt).sort();

strict('merging rules is order-free and idempotent', fc.property(editArb, (edits) => {
  const { devs: [a, b] } = devicesFrom(edits);
  assert.deepEqual(view(PR.merge(a, b)), view(PR.merge(b, a)));
  const ab = PR.merge(a, b);
  assert.deepEqual(view(PR.merge(ab, b)), view(ab));
  assert.deepEqual(view(PR.merge(ab, ab)), view(ab));
}));

strict('after both devices merge, the latest gesture on each rule wins: an edit, a deletion, or a rule saved again after a deletion', fc.property(editArb, (edits) => {
  const { devs: [a, b], last } = devicesFrom(edits);
  const out = PR.merge(a, b);
  for (const [id, l] of Object.entries(last)) {
    const p = out.promos.find((x) => x.id === id);
    if (l.gone) assert.equal(p, undefined, id + ' came back');
    else { assert.ok(p, id + ' lost'); assert.equal(p.value, l.value); }
  }
}));

console.log(`${failed ? '✗' : '✓'} promos-properties-test · ${passed} held, ${failed} failed`);
process.exit(failed ? 1 : 0);
