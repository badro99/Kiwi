#!/usr/bin/env node
/* segment-test · assets/kit/segment.js, the one customer segmentation
 * (spec §17.1 item 7, §18.0 "Customers").
 *
 *   · the worked example: eight customers, built from their dated visits, come
 *     out Regular 4, New 2, Inactive 2 (VIP 1 outside the sum), and three of
 *     them are returning today;
 *   · both boundaries, on the day and one day either side: 30 days (New) and
 *     60 days (Inactive);
 *   · the first matching rule wins, so no one is in two statuses and no one in
 *     none; the partition holds for every first/last visit pair over a year;
 *   · it reads dates, not a clock: no Date.now, no new Date(), no Math.random,
 *     so the same visits and the same business date always give the same answer;
 *   · junk is ignored, a bad business date throws, input is never mutated;
 *   · when tools/fixtures/worked-example.json exists and its customers carry
 *     dated visits, the same partition holds on that file.
 *   node tools/segment-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(path.join(root, 'assets/kit/segment.js'));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('segment-test');

const TODAY = '2026-10-12';
const day = (d) => S.dayNumber(d);
const shift = (date, n) => new Date((day(date) + n) * 86400000).toISOString().slice(0, 10);

/* `count` visits between `first` and `last`, evenly spread, amounts summing to `total`. */
function visits(first, last, count, total) {
  const a = day(first), b = day(last), out = [];
  for (let i = 0; i < count; i++) {
    const d = count === 1 ? a : Math.round(a + ((b - a) * i) / (count - 1));
    out.push({ date: new Date(d * 86400000).toISOString().slice(0, 10), amount: 0 });
  }
  const cents = Math.round(total * 100), each = Math.floor(cents / count);
  out.forEach((v, i) => { v.amount = (i === count - 1 ? cents - each * (count - 1) : each) / 100; });
  return out;
}

/* ── the worked example (§18.0) ────────────────────────────────────────── */
const people = [
  { name: 'Salma Bennani', vip: true, v: visits('2026-01-05', TODAY, 41, 11780), count: 41, lifetime: 11780, status: 'regular', ret: true },
  { name: 'Youssef Alaoui', v: visits('2026-04-05', TODAY, 22, 6420), count: 22, lifetime: 6420, status: 'regular', ret: true },
  { name: 'Leila Fassi', v: [{ date: '2026-10-03', amount: 170 }, { date: TODAY, amount: 210 }], count: 2, lifetime: 380, status: 'new', ret: true },
  { name: 'Omar Benjelloun', v: visits('2026-05-05', '2026-10-11', 15, 4150), count: 15, lifetime: 4150, status: 'regular', ret: false },
  { name: 'Hind Berrada', v: visits('2026-06-14', '2026-10-10', 9, 3960), count: 9, lifetime: 3960, status: 'regular', ret: false },
  { name: 'Mehdi Chraibi', v: [{ date: '2026-10-06', amount: 210 }], count: 1, lifetime: 210, status: 'new', ret: false },
  { name: 'Sanae Idrissi', v: visits('2026-03-26', '2026-07-30', 6, 1240), count: 6, lifetime: 1240, status: 'inactive', ret: false },
  { name: 'Amine Lahlou', v: visits('2026-04-25', '2026-07-13', 4, 860), count: 4, lifetime: 860, status: 'inactive', ret: false },
];
for (const p of people) {
  const st = S.visitStats(p.v);
  assert.equal(st.count, p.count, `${p.name} visits`);
  assert.equal(st.lifetime, p.lifetime, `${p.name} lifetime`);
  assert.equal(S.segmentCustomer(p.v, TODAY), p.status, `${p.name} status`);
  assert.equal(S.returningToday(p.v, TODAY), p.ret, `${p.name} returning today`);
}
check(true, 'eight customers: visits, lifetime spend and status as the §18.0 table says');
{
  const c = S.countStatuses(people.map((p) => ({ visits: p.v, vip: p.vip })), TODAY);
  assert.deepEqual(c, { all: 8, regular: 4, new: 2, inactive: 2, vip: 1, returningToday: 3 });
  check(c.regular + c.new + c.inactive === c.all, 'Regular 4 + New 2 + Inactive 2 = 8 = All; VIP 1 and Returning 3 sit outside the sum');
  assert.equal(S.daysSinceLastVisit(people[6].v, TODAY), 74);
  assert.equal(S.daysSinceLastVisit(people[7].v, TODAY), 91);
  assert.equal(S.daysSinceLastVisit(people[0].v, TODAY), 0);
  check(true, 'Sanae last came 74 days ago and Amine 91, as the table says');
  const sorted = people.map((p) => ({ name: p.name, visits: p.v })).sort(S.byLastVisit).map((p) => p.name.split(' ')[0]);
  assert.deepEqual(sorted, ['Salma', 'Youssef', 'Leila', 'Omar', 'Hind', 'Mehdi', 'Sanae', 'Amine']);
  check(true, 'sorted by last visit newest first, then lifetime highest first (check 9)');
}

/* ── boundaries ────────────────────────────────────────────────────────── */
{
  const one = (date) => S.segmentCustomer([{ date, amount: 1 }], TODAY);
  check(one(shift(TODAY, -30)) === 'new' && one('2026-09-12') === 'new', 'a first visit 30 days ago (12 September) is New');
  check(one(shift(TODAY, -31)) === 'regular' && one('2026-09-11') === 'regular', '31 days ago is no longer New');
  check(one(shift(TODAY, -60)) === 'regular' && one('2026-08-13') === 'regular', 'a last visit exactly 60 days ago (13 August) is still Regular');
  check(one(shift(TODAY, -61)) === 'inactive' && one('2026-08-12') === 'inactive', '61 days ago is Inactive ("before 13 August")');
  check(one(TODAY) === 'new', 'a first visit today is New');

  const two = (first, last) => S.segmentCustomer([first, last], TODAY);
  check(two('2026-01-01', shift(TODAY, -61)) === 'inactive' && two('2026-01-01', shift(TODAY, -60)) === 'regular', 'first visit long ago: the last visit decides, at 60 and 61 days');
  check(two('2026-01-01', TODAY) === 'regular', 'long-standing customer who came today: Regular');
  check(two(shift(TODAY, -30), shift(TODAY, -2)) === 'new' && two(shift(TODAY, -31), shift(TODAY, -2)) === 'regular', 'first visit at 30 and 31 days, last visit recent');
  check(S.segmentCustomer([shift(TODAY, 1)], TODAY) === 'new', 'a visit dated after the business date (clock skew) counts as New, not a crash');
}

/* ── a true partition ──────────────────────────────────────────────────── */
{
  let n = 0, byRule = { new: 0, inactive: 0, regular: 0 };
  for (let f = 0; f <= 400; f += 3) {
    for (let l = 0; l <= f; l += 3) {
      const first = shift(TODAY, -f), last = shift(TODAY, -l);
      const status = S.segmentCustomer([first, last], TODAY);
      const isNew = f <= 30, isInactive = l > 60;
      assert.ok(!(isNew && isInactive), `rules 1 and 2 overlap at ${f}/${l}`);
      assert.equal(status, isNew ? 'new' : isInactive ? 'inactive' : 'regular', `${f}/${l}`);
      assert.ok(['new', 'regular', 'inactive'].includes(status));
      byRule[status]++; n++;
    }
  }
  check(n > 5000 && byRule.new && byRule.inactive && byRule.regular, `${n} first/last pairs: each lands in exactly one status (new ${byRule.new}, regular ${byRule.regular}, inactive ${byRule.inactive})`);
  check(shift('2026-01-30', 30) === '2026-03-01' && S.segmentCustomer(['2026-01-30'], '2026-03-01') === 'new' && S.segmentCustomer(['2026-01-30'], '2026-03-02') === 'regular', 'across a month end (30 days from 30 January is 1 March)');
  check(S.segmentCustomer(['2028-01-31'], '2028-03-01') === 'new' && S.segmentCustomer(['2028-01-30'], '2028-03-01') === 'regular', 'across a leap day (2028 has a 29 February)');
  check(day('2026-03-29') - day('2026-03-28') === 1 && day('2026-10-25') - day('2026-10-24') === 1, 'a day is a day across a clock change: no zone enters the count');
}

/* ── inputs ────────────────────────────────────────────────────────────── */
{
  check(S.dayNumber('2026-02-30') !== S.dayNumber('2026-02-30') && S.dayNumber('2026-13-01') !== S.dayNumber('2026-13-01') && S.dayNumber('12/10/2026') !== S.dayNumber('12/10/2026'), 'dayNumber is NaN for anything but a real YYYY-MM-DD date');
  assert.throws(() => S.segmentCustomer([TODAY], '2026-02-30'), RangeError);
  assert.throws(() => S.segmentCustomer([TODAY], undefined), RangeError);
  assert.throws(() => S.segmentCustomer([TODAY], 1760000000000), RangeError);
  check(true, 'a business date that is not a real date throws (a wrong day must not segment silently)');
  const junk = [null, 'x', 12345, { date: '2026-13-01' }, {}, { date: 1760000000000 }, '2026-10-12T17:00:00+01:00'];
  const st = S.visitStats(junk);
  check(st.count === 0 && st.ignored === junk.length && st.first === null && st.last === null, 'junk entries carry no date and are ignored, and counted as ignored');
  check(S.segmentCustomer(junk, TODAY) === 'regular' && S.segmentCustomer(undefined, TODAY) === 'regular' && S.segmentCustomer([], TODAY) === 'regular', 'no dated visit at all: rule 3, Regular (callers read visitStats().count to tell)');
  check(S.returningToday(undefined, TODAY) === false && S.daysSinceLastVisit([], TODAY) === null, 'returningToday and daysSinceLastVisit are false and null with no visit');
  const mixed = ['2026-10-12', { date: '2026-10-03', amount: '170' }, { date: '2026-09-01', amount: 'abc' }];
  check(S.visitStats(mixed).lifetime === 170 && S.visitStats(mixed).count === 3, 'strings and {date, amount} both count; an amount that is not a number is 0');
  const pairs = [['2026-10-03', 170], ['2026-10-12', 210]];
  check(S.visitStats(pairs).lifetime === 380 && S.visitStats(pairs).count === 2 && S.segmentCustomer(pairs, TODAY) === 'new' && S.returningToday(pairs, TODAY), '[date, amount] pairs (the fixture form) read the same as {date, amount}');
  check(S.visitStats([['2026-10-03'], [null, 5], ['bad', 5]]).count === 1 && S.visitStats([['2026-10-03']]).lifetime === 0, 'a pair with no amount counts at 0; a pair with no readable date is ignored');
  const frozen = Object.freeze([Object.freeze({ date: '2026-10-12', amount: 1 }), Object.freeze({ date: '2026-01-01', amount: 2 })]);
  check(S.segmentCustomer(frozen, TODAY) === 'regular' && S.visitStats(frozen).first === '2026-01-01', 'unsorted frozen input works and is not mutated');
  check(S.returningToday([TODAY], TODAY) === false && S.returningToday([TODAY, '2026-10-11'], TODAY) === true && S.returningToday(['2026-10-10', '2026-10-11'], TODAY) === false, 'returning today = a visit today and at least two visits in all');
  check(S.visitStats([{ date: TODAY, amount: 0.1 }, { date: '2026-10-11', amount: 0.2 }]).lifetime === 0.3, 'lifetime is summed in cents (0.1 + 0.2 = 0.3)');
}

/* ── no clock, no randomness ───────────────────────────────────────────── */
{
  const src = fs.readFileSync(path.join(root, 'assets/kit/segment.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!/Date\.now|new Date\(\s*\)|Math\.random|performance\.now|Intl\./.test(src), 'segment.js reads no clock and no randomness');
  check(!/innerHTML|fetch\(|XMLHttpRequest|localStorage/.test(src), 'and touches no DOM, network or storage');
  check(globalThis.KiwiSegment === S, 'window.KiwiSegment is the module');
}

/* ── the fixture ───────────────────────────────────────────────────────── */
/* A missing file is a skip (slice E owns it). A file that exists and cannot be
 * read is a FAILURE: the one real cross-check must never skip silently. */
{
  const file = path.join(root, 'tools/fixtures/worked-example.json');
  if (!fs.existsSync(file)) console.log('  ○ tools/fixtures/worked-example.json not present yet, fixture cross-check skipped');
  else {
    const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(fx.date), `the fixture's date is a business date (${fx.date})`);
    const list = fx.customers;
    assert.ok(Array.isArray(list) && list.length > 0, 'the fixture has a customers list');
    list.forEach((c) => {
      assert.ok(Array.isArray(c.visits) && c.visits.length > 0, `${c.name}: a list of dated visits`);
      const st = S.visitStats(c.visits);
      assert.equal(st.ignored, 0, `${c.name}: every visit has a readable date`);
      assert.equal(st.count, c.visits.length, `${c.name}: visit count`);
    });
    const today = fx.date;
    const c = S.countStatuses(list, today);
    console.log(`    business date ${today}: all ${c.all}, regular ${c.regular}, new ${c.new}, inactive ${c.inactive}, vip ${c.vip}, returning today ${c.returningToday}`);
    for (const cu of list) console.log(`    ${cu.name}: ${S.segmentCustomer(cu.visits, today)}${S.returningToday(cu.visits, today) ? ', returning today' : ''}`);
    assert.equal(c.regular + c.new + c.inactive, c.all, 'fixture partition');
    assert.deepEqual([c.all, c.regular, c.new, c.inactive], [8, 4, 2, 2], 'fixture counts');
    assert.equal(c.returningToday, 3, 'fixture returning today');
    assert.equal(c.vip, 1, 'fixture VIP');
    const byName = Object.fromEntries(list.map((cu) => [cu.name, cu]));
    const want = { 'Salma Bennani': 'regular', 'Youssef Alaoui': 'regular', 'Leila Fassi': 'new', 'Omar Benjelloun': 'regular', 'Hind Berrada': 'regular', 'Mehdi Chraibi': 'new', 'Sanae Idrissi': 'inactive', 'Amine Lahlou': 'inactive' };
    for (const [name, status] of Object.entries(want)) {
      assert.ok(byName[name], `${name} is in the fixture`);
      assert.equal(S.segmentCustomer(byName[name].visits, today), status, `${name} should be ${status}`);
    }
    check(true, 'tools/fixtures/worked-example.json: 8 = Regular 4 + New 2 + Inactive 2, VIP 1, Returning 3, every customer as the §18.0 table says');
  }
}
console.log('\n✓ segment-test');
