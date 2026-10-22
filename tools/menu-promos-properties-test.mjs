#!/usr/bin/env node
/* menu-promos-properties-test · a happy hour costs the same on the tablet, the till and the ticket.
 *
 * assets/menu-promos.js prices restaurant promotions (percent, amount off,
 * fixed price; whole menu, categories or items; dates, weekdays and daily
 * hours on the 05:00 business day in Casablanca time). The till and the
 * waiter app run it in the browser, and priceOrder (functions/api/order/_lib.js)
 * runs it on the server, which is the authority: a phone's order is repriced
 * when it arrives. Generated menus, promotion sets and moments go through the
 * real server pricer on the SQLite D1 fixture and through the browser copy
 * (kit zone law + menu-promos.js in a vm), and both are checked against an
 * independent model:
 *   1. every line costs exactly the lowest price among the running
 *      promotions that cover it (the oldest on a tie), never above the menu
 *      price, never below zero; composed menus and their parts never move;
 *   2. the server and the till agree on every line at every moment, on the
 *      legal Casablanca clock (UTC+0 since 20 September 2026) even when the
 *      runtime's own time zone data is older than that;
 *   3. the order total is the sum of its lines in centimes, and a stamp or a
 *      price sent by the device changes nothing;
 *   4. sanitising a promotion list twice changes nothing, and what survives is
 *      bounded (percent at most 100, only targets the menu still has).
 * Moments are drawn after 20 September 2026, so the model's wall clock is
 * plain UTC. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { priceOrder } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; menu promotion properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, Number(process.env.KIWI_WITNESS_CHARS) || 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

/* The browser copy, loaded the way the till loads it: kit first, then the rule. */
const window = {};
const ctx = vm.createContext({ window, console, Set, Map, Math, Date, JSON, Number, Object, Array, String, Intl });
vm.runInContext('globalThis.window = window;', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/kit/haptics.js'), 'utf8'), ctx, { filename: 'haptics.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/menu-promos.js'), 'utf8'), ctx, { filename: 'menu-promos.js' });
const TILL = window.KiwiMenuPromos;
assert.ok(TILL && ctx.KiwiZoneLaw, 'browser rule or zone law missing');

const f = await fixture(ROOT), { sql, merchant, env } = f;

const DAY = 86400000, MIN = 60000;
const T_MIN = Date.UTC(2026, 9, 1), T_MAX = Date.UTC(2027, 5, 1);
const CATS = ['boissons', 'tajines', 'desserts'], ITEMS = ['the', 'jus', 'kefta', 'tarte', 'cafe'];
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const toMin = (s) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

/* Moments land on minutes, and often right on a window edge. */
const EDGES = [0, 1, 4 * 60 + 59, 5 * 60, 5 * 60 + 1, 17 * 60, 18 * 60 + 59, 19 * 60, 23 * 60 + 59];
const momentArb = fc.tuple(fc.integer({ min: 0, max: Math.floor((T_MAX - T_MIN) / DAY) }),
  fc.oneof(fc.constantFrom(...EDGES), fc.integer({ min: 0, max: 1439 }))).map(([d, m]) => T_MIN + d * DAY + m * MIN);
const timeArb = fc.oneof(fc.constantFrom(...EDGES), fc.integer({ min: 0, max: 1439 })).map(hhmm);

const promoArb = (i) => fc.record({
  kind: fc.constantFrom('percent', 'amount', 'fixed'),
  /* A few shared values, so two promotions often tie on the same price. */
  value: fc.oneof(fc.constantFrom(0, 10, 20, 50, 100), fc.integer({ min: 0, max: 120 }), fc.integer({ min: 0, max: 30000 }).map((c) => c / 100)),
  scope: fc.oneof(fc.constant({ all: true }), fc.record({ cats: fc.subarray([...CATS, 'gone']) }), fc.record({ items: fc.subarray([...ITEMS, 'ghost']) })),
  /* Often always on, so several run at once and their rivalry is tested. */
  window: fc.oneof({ weight: 2, arbitrary: fc.constant({ from: '', to: '', days: [], start: '', end: '' }) }, { weight: 3, arbitrary: fc.record({
    from: fc.option(momentArb.map(iso), { nil: '' }), to: fc.option(momentArb.map(iso), { nil: '' }),
    days: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
    start: fc.option(timeArb, { nil: '' }), end: fc.option(timeArb, { nil: '' }),
  }) }),
  paused: fc.oneof({ weight: 4, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  createdAt: fc.integer({ min: 1, max: 3 }),
}).map((p) => ({ id: 'p' + i, name: 'Promo ' + i, kind: p.kind, value: p.value, ...p.scope, ...p.window, paused: p.paused, createdAt: p.createdAt }));
const promosArb = fc.tuple(...[0, 1, 2, 3].map(promoArb)).chain((ps) => fc.subarray(ps));

const menuArb = fc.record({
  prices: fc.tuple(...ITEMS.map(() => fc.integer({ min: 0, max: 50000 }))),
  cats: fc.tuple(...ITEMS.map(() => fc.constantFrom(...CATS))),
  syrup: fc.integer({ min: 0, max: 2000 }),
  formula: fc.integer({ min: 0, max: 50000 }),
}).map((m) => ({
  cats: CATS.map((id) => ({ id, name: id })),
  opts: [{ id: 'sirop', name: 'Sirop', kind: 'one', choices: [{ id: 'menthe', name: 'Menthe', price: m.syrup / 100 }] }],
  items: [
    ...ITEMS.map((id, k) => ({ id, name: id, catId: m.cats[k], price: m.prices[k] / 100, opts: k === 0 ? ['sirop'] : [] })),
    { id: 'menu', name: 'Menu midi', catId: m.cats[2], price: m.formula / 100, formula: { slots: [{ id: 's1', label: 'Boisson', min: 1, max: 1, choices: [{ itemId: 'the', extra: 0 }] }] } },
  ],
}));

/* Lines a device sends: plain dishes, the tea with syrup, a composed menu with its drink, and forged stamps. */
const linesArb = fc.array(fc.record({
  id: fc.constantFrom(...ITEMS, 'menu'), qty: fc.integer({ min: 1, max: 4 }), syrup: fc.boolean(),
  forged: fc.integer({ min: 0, max: 9999 }),
}), { minLength: 1, maxLength: 6 });
let uidSerial = 0;
function toRaw(lines) {
  const raw = [];
  for (const l of lines) {
    const forged = { unitPrice: l.forged / 100, price: l.forged / 100, promo: { id: 'p0', name: 'Forgée', badge: '−99 %', before: 999 } };
    if (l.id === 'menu') {
      const uid = 'fml-' + (++uidSerial);
      raw.push({ id: 'menu', qty: l.qty, kind: 'formula', formulaUid: uid, ...forged });
      raw.push({ id: 'the', qty: l.qty, kind: 'formula-part', formulaUid: uid, formulaSlotId: 's1', ...forged });
    } else raw.push({ id: l.id, qty: l.qty, ...(l.id === 'the' && l.syrup ? { optionChoices: [{ group: 'sirop', choiceId: 'menthe' }] } : {}), ...forged });
  }
  return raw;
}

function publish(menu, promos) {
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(merchant) DO UPDATE SET data = excluded.data, updated_ts = excluded.updated_ts')
    .run(merchant, 'Carte', 'restaurant', JSON.stringify({ ...menu, promos }), 1);
}

/* ── The model, written from the rules in the file header, not from its code. */
function businessMoment(t) {
  const d = new Date(t), min = d.getUTCHours() * 60 + d.getUTCMinutes();
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (min < 300 ? DAY : 0));
  return { date: iso(day.getTime()), weekday: day.getUTCDay(), min };
}
function running(p, t) {
  if (p.paused) return false;
  const b = businessMoment(t);
  if (p.from && b.date < p.from) return false;
  if (p.to && b.date > p.to) return false;
  const days = [...new Set(p.days)];
  if (days.length && days.length < 7 && !days.includes(b.weekday)) return false;
  const s = toMin(p.start), e = toMin(p.end);
  if (s == null || e == null || s === e) return true;
  return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;           /* a window past midnight */
}
function covers(p, line, menu) {
  if (line.kind === 'formula' || line.kind === 'formula-part') return false;
  if (p.all) return true;
  const item = menu.items.find((i) => i.id === line.id);
  return (p.items || []).includes(line.id) || (p.cats || []).includes(item.catId);
}
const cents = (mad) => Math.round(mad * 100);
function promoCents(p, base) {
  const v = Math.max(0, cents(Number(p.value) || 0));
  if (p.kind === 'percent') { const pct = Math.min(100, Math.round(Math.max(0, Number(p.value) || 0))); return Math.floor((base * (100 - pct) + 50) / 100); }
  if (p.kind === 'amount') return Math.max(0, base - v);
  return Math.min(base, v);
}
/* A promotion with nothing to take off (a zero percent or amount) never reaches the till. */
const usable = (p) => p && p.id && p.name && (p.kind === 'fixed' || (p.kind === 'percent' ? Math.round(Math.min(100, Number(p.value) || 0)) > 0 : cents(Number(p.value) || 0) > 0));
function modelLine(line, menu, promos, t) {
  if (line.kind === 'formula-part') return { cents: 0, stamp: null };
  const item = menu.items.find((i) => i.id === line.id);
  const base = cents(item.price) + (line.optionChoices ? cents(menu.opts[0].choices[0].price) : 0);
  let best = null;
  const live = promos.filter(usable).filter((p) => p.all || (p.cats || []).some((c) => CATS.includes(c)) || (p.items || []).some((i) => ITEMS.includes(i)))
    .map((p) => ({ ...p, cats: (p.cats || []).filter((c) => CATS.includes(c)), items: (p.items || []).filter((i) => ITEMS.includes(i)) }));
  for (const p of live) {
    if (!covers(p, line, menu) || !running(p, t)) continue;
    const c = promoCents(p, base);
    if (c >= base) continue;
    if (!best || c < best.cents || (c === best.cents && p.createdAt < best.p.createdAt)) best = { cents: c, p };
  }
  return best ? { cents: best.cents, stamp: { id: best.p.id, before: base / 100 } } : { cents: base, stamp: null };
}

console.log('menu-promos-properties-test');
try {
  await strict('every line costs the lowest running promotion that covers it (the oldest on a tie), never above the menu price; composed menus never move', fc.asyncProperty(menuArb, promosArb, linesArb, momentArb, async (menu, promos, lines, t) => {
    publish(menu, promos);
    const raw = toRaw(lines);
    const r = await priceOrder(env, merchant, raw, { publicCaller: true, now: t });
    assert.equal(r.lines.length, raw.length);
    r.lines.forEach((l, k) => {
      const want = modelLine(raw[k], menu, promos, t);
      assert.equal(cents(l.unitPrice), want.cents, `${l.id} at ${new Date(t).toISOString()}: ${cents(l.unitPrice)} ≠ ${want.cents}`);
      assert.deepEqual(l.promo ? { id: l.promo.id, before: l.promo.before } : null, want.stamp, 'stamp of ' + l.id);
      assert.ok(cents(l.unitPrice) >= 0);
    });
  }));

  await strict('the server and the till agree on every line, on the legal Casablanca clock, even with old time zone data', fc.asyncProperty(menuArb, promosArb, linesArb, momentArb, async (menu, promos, lines, t) => {
    publish(menu, promos);
    const raw = toRaw(lines);
    const r = await priceOrder(env, merchant, raw, { publicCaller: true, now: t });
    const tillPromos = TILL.sanitize(promos, menu);
    r.lines.forEach((l, k) => {
      if (raw[k].kind === 'formula-part') return;
      const item = menu.items.find((i) => i.id === raw[k].id);
      const base = Math.round((item.price + (raw[k].optionChoices ? menu.opts[0].choices[0].price : 0)) * 100) / 100;
      const hit = TILL.resolve(tillPromos, { itemId: item.id, catId: item.catId, kind: raw[k].kind }, base, t);
      assert.equal(cents(l.unitPrice), cents(hit ? hit.price : base), `${l.id} at ${new Date(t).toISOString()}: server ${l.unitPrice}, till ${hit ? hit.price : base}`);
    });
  }));

  await strict('the total is the sum of the lines in centimes, and a stamp or a price sent by the device changes nothing', fc.asyncProperty(menuArb, promosArb, linesArb, momentArb, fc.integer({ min: 0, max: 9999 }), async (menu, promos, lines, t, other) => {
    publish(menu, promos);
    const a = await priceOrder(env, merchant, toRaw(lines), { publicCaller: true, now: t });
    const b = await priceOrder(env, merchant, toRaw(lines.map((l) => ({ ...l, forged: other }))).map((l) => { const { promo, ...rest } = l; void promo; return rest; }), { publicCaller: true, now: t });
    assert.equal(cents(a.total), a.lines.reduce((s, l) => s + cents(l.unitPrice) * l.qty, 0));
    assert.deepEqual(a.lines.map((l) => [l.unitPrice, l.promo || null]), b.lines.map((l) => [l.unitPrice, l.promo || null]));
  }));

  await strict('sanitising twice changes nothing, and what survives is bounded and targets only what the menu still has', fc.asyncProperty(menuArb, promosArb, async (menu, promos) => {
    const plain = (v) => JSON.parse(JSON.stringify(v));            /* the rule runs in another realm */
    const once = plain(TILL.sanitize(promos, menu));
    assert.deepEqual(plain(TILL.sanitize(once, menu)), once);
    for (const p of once) {
      assert.ok(p.value >= 0 && (p.kind !== 'percent' || p.value <= 100), 'value ' + p.value);
      assert.ok(p.all || p.cats.length || p.items.length);
      assert.ok(p.cats.every((c) => CATS.includes(c)) && p.items.every((i) => ITEMS.includes(i)));
    }
  }));

  console.log(`${failed ? '✗' : '✓'} menu-promos-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
