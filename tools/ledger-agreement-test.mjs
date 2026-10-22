#!/usr/bin/env node
/* ledger-agreement-test · KiwiLedger against the server's business day (design 2027, §17.1 and §21.2).
 *
 *   node tools/ledger-agreement-test.mjs
 *
 * The ledger (assets/kit/ledger.js) cuts DAYS into windows. The reference
 * (tools/fixtures/ledger-fixtures.mjs) classifies EVENTS with the server's own
 * businessDate() and sums. Two routes to one number; the test holds them equal
 * for every key, on the stores §17.1 names:
 *   cutoff 5 in Africa/Casablanca, cutoff 3, cutoff 0, a store with NO cutoff row
 *   and no zone (against today's /api/config and against the stage 1 route), a
 *   cutoff that changes from 5 to 7, the boundary minute, and the Ramadan clock
 *   change; plus Paris, to prove the zone is the store's and not the host's.
 * Eight surfaces read the same keys through reader(surface) and must agree.
 * Then shadow mode: off by default, never on a production merchant, read-only,
 * silent; its differences go to .kiwi/results/ledger-shadow/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const Ledger = require(path.join(ROOT, 'assets/kit/ledger.js'));
const F = await import('./fixtures/ledger-fixtures.mjs');

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); checks++; };
const section = (t) => console.log('\n' + t);
const done = (t) => console.log('  ✓ ' + t);

const defaults = await F.serverDefaults();
const KEYS = Ledger.keys();

function inst(store, over = {}) {
  return Ledger.create({
    sales: () => store.sales, refunds: () => store.refunds,
    config: () => store.config, resolve: store.resolve,
    zReports: (d) => (store.zReports && store.zReports[d]) || [],
    now: () => store.asOf, source: 'fixture', ...over,
  });
}
/* The server's per-day cutoff: the day's single Z cutoff, else the configured one. */
const cutoffOf = (store) => (day, st) => {
  const z = ((store.zReports && store.zReports[day]) || []).map((r) => r.cutoff).filter(Number.isInteger);
  return new Set(z).size === 1 ? z[0] : st.cutoff;
};

/* ── 0 · The ledger's date arithmetic is the server's ─────────────────────── */
section('Business day and boundary, against functions/api/_business-day.js');
{
  let n = 0;
  const zones = ['Africa/Casablanca', 'Europe/Paris', 'UTC', 'America/New_York'];
  const start = Date.parse('2026-03-20T00:00:00Z');
  for (const zone of zones) {
    for (let cutoff = 0; cutoff <= 12; cutoff++) {
      for (let d = 0; d < 400; d += 3) {
        const day = new Date(start + d * 86400000).toISOString().slice(0, 10);
        const b = F.businessBoundary(day, cutoff, zone);
        eq(Ledger._boundary(day, cutoff, zone), b, `boundary ${zone} ${day} cutoff ${cutoff}`);
        for (const t of [b - 1, b, b + 60000, b - 60000]) { eq(Ledger._businessDate(t, cutoff, zone), F.businessDate(t, cutoff, zone), `date ${zone} ${t} cutoff ${cutoff}`); n++; }
      }
    }
  }
  /* Every quarter hour across both Casablanca clock changes of 2027 and Paris's of 2026 and 2027. */
  for (const [zone, from] of [['Africa/Casablanca', '2027-02-04'], ['Africa/Casablanca', '2027-03-11'], ['Europe/Paris', '2026-10-23'], ['Europe/Paris', '2027-03-26']]) {
    for (let t = Date.parse(from + 'T00:00:00Z'); t < Date.parse(from + 'T00:00:00Z') + 6 * 86400000; t += 900000) {
      for (const cutoff of [0, 3, 5, 7]) { eq(Ledger._businessDate(t, cutoff, zone), F.businessDate(t, cutoff, zone), `date ${zone} ${new Date(t).toISOString()} cutoff ${cutoff}`); n++; }
    }
  }
  done(`${n} instants and ${zones.length * 13 * 134} boundaries agree with the server`);
}

/* ── 1 · Stores: every key, every day, ledger = reference ─────────────────── */
section('Every key on every day of every store');
const stores = await F.buildStores(defaults);
{
  for (const s of stores) {
    const L = inst(s);
    const cutoff = cutoffOf(s);
    let n = 0;
    for (const day of s.days) {
      for (const key of KEYS) {
        if (s.id === 'fx-conflict' && day === '2026-10-10') continue;   // covered in section 5
        const got = L.get(key, { day });
        const want = F.reference(s, key, day, cutoff);
        assert.ok(got.computable === (want !== null), `${s.id} ${day} ${key}: computable ${got.computable}, reference ${want}`);
        eq(got.value, want, `${s.id} ${day} ${key}`);
        eq(got.precision, key === 'orders' || key === 'card_share' ? 0 : 2, `${s.id} ${key} precision`);
        eq(got.businessDay, day, `${s.id} ${key} businessDay`);
        n++;
      }
    }
    done(`${s.id}: ${n} figures equal the server's day`);
  }
}

/* ── 2 · The boundary minute: 04:59 belongs to the day before, 05:00 to the new day ── */
section('The boundary minute, per cutoff');
{
  for (const [cutoff, zone] of [[5, 'Africa/Casablanca'], [3, 'Africa/Casablanca'], [0, 'Africa/Casablanca'], [5, 'Europe/Paris'], [12, 'Africa/Casablanca']]) {
    const day = '2026-10-12', prev = '2026-10-11';
    const hh = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const before = cutoff === 0 ? F.wall(prev, '23:59', zone) : F.wall(day, hh(cutoff * 60 - 1), zone);
    const at = F.wall(day, hh(cutoff * 60), zone);
    const store = { config: { businessCutoff: cutoff, timezone: zone }, resolve: F.resolverFor(defaults), zReports: {},
      sales: [{ ts: before, amount: 11, method: 'cash' }, { ts: at, amount: 23, method: 'card' }], refunds: [], asOf: F.wall(day, '23:00', zone) };
    const L = inst(store);
    eq(L.get('revenue', { day: prev }).value, 11, `cutoff ${cutoff} ${zone}: the minute before is the previous day`);
    eq(L.get('revenue', { day }).value, 23, `cutoff ${cutoff} ${zone}: the cutoff minute starts the day`);
    eq(L.get('orders', { day }).value, 1, `cutoff ${cutoff}: one order in the new day`);
    eq(L.get('cash_revenue', { day: prev }).value, 11, `cutoff ${cutoff}: the cash sale is in the previous day`);
  }
  /* A sale one millisecond before the boundary, and the day "now" falls in. */
  const store = { config: { businessCutoff: 5, timezone: 'Africa/Casablanca' }, resolve: F.resolverFor(defaults), zReports: {}, sales: [], refunds: [], asOf: 0 };
  const b = F.businessBoundary('2026-10-12', 5, 'Africa/Casablanca');
  store.sales.push({ ts: b - 1, amount: 5, method: 'cash' }, { ts: b, amount: 7, method: 'cash' });
  store.asOf = b - 1; eq(inst(store).get('revenue', 'today').businessDay, '2026-10-11', 'one millisecond before: still yesterday');
  store.asOf = b; eq(inst(store).get('revenue', 'today').businessDay, '2026-10-12', 'at the boundary: the new day');
  eq(inst(store).get('revenue', 'today').value, 7, 'today at the boundary holds only the new sale');
  done('04:59 / 05:00, 02:59 / 03:00, 23:59 / 00:00, Paris and cutoff 12');
}

/* ── 3 · Eight surfaces, one number ───────────────────────────────────────── */
section('Home, Orders, Report, Notifications, Z, Terminals, Team and Kiwi AI');
{
  eq(Ledger.surfaces(), ['home', 'orders', 'report', 'notifications', 'z', 'terminals', 'team', 'ai'], 'the eight surfaces');
  assert.throws(() => Ledger.reader('floor'), /unknown surface/); checks++;
  for (const id of ['fx-c5', 'fx-c3', 'fx-c0', 'fx-paris5', 'fx-norow', 'fx-ramadan']) {
    const s = stores.find((x) => x.id === id);
    const L = inst(s);
    const today = L.get('revenue', 'today').businessDay;
    const yesterday = F.addBusinessDays(today, -1);
    for (const key of KEYS) {
      const tod = [], yes = [];
      for (const surface of Ledger.surfaces()) {
        const rd = L.reader(surface);
        tod.push([rd.get(key, 'today').value, rd.get(key, { day: today }).value, rd.get(key, { from: today, to: today }).value]);
        yes.push([rd.get(key, 'yesterday').value, rd.get(key, { day: yesterday }).value]);
      }
      for (const v of tod) {
        eq(v[0], tod[0][0], `${id} ${key}: surfaces agree on today`);
        eq(v[1], v[0], `${id} ${key}: today = {day}`);
        eq(v[2], v[0], `${id} ${key}: today = {from,to}`);
      }
      for (const v of yes) {
        eq(v[0], yes[0][0], `${id} ${key}: surfaces agree on yesterday`);
        eq(v[1], v[0], `${id} ${key}: yesterday = {day}`);
      }
    }
    /* A week is the sum of its days, for the additive keys. */
    for (const key of ['revenue', 'orders', 'refunds', 'card_revenue', 'cash_revenue']) {
      let sum = 0; for (let i = 6; i >= 0; i--) sum += L.get(key, { day: F.addBusinessDays(today, -i) }).value;
      eq(Math.round(L.get(key, 'last7').value * 100), Math.round(sum * 100), `${id} ${key}: last7 = sum of 7 days`);
    }
  }
  done('every surface returns the same value for today, a day, a span and yesterday; last7 adds up');
}

/* ── 4 · A store with no cutoff row and no zone ───────────────────────────── */
section('No cutoff row, no zone');
{
  const a = stores.find((x) => x.id === 'fx-norow'), b = stores.find((x) => x.id === 'fx-norow-resolved');
  eq(a.config, { businessCutoff: null, timezone: '' }, 'today\'s /api/config sends null and an empty zone');
  eq(b.config, { businessCutoff: defaults.cutoff, timezone: defaults.zone }, 'the stage 1 route sends the resolved values');
  const La = inst(a), Lb = inst(b);
  for (const day of a.days) for (const key of KEYS) {
    eq(La.get(key, { day }).value, Lb.get(key, { day }).value, `client fallback = resolved route (${day} ${key})`);
    eq(La.get(key, { day }).value, F.reference(a, key, day), `no-row store equals the server (${day} ${key})`);
  }
  eq(La.get('revenue', 'today').cutoff, defaults.cutoff, 'the fallback is the server\'s own default cutoff');
  eq(La.get('revenue', 'today').zone, defaults.zone, 'the fallback is the server\'s own default zone');
  /* The ledger holds no default of its own: with no business-day module it says so. */
  const bare = Ledger.create({ sales: () => a.sales, refunds: () => [], config: () => a.config, now: () => a.asOf });
  const r = bare.get('revenue', 'today');
  eq([r.value, r.computable, r.reason], [null, false, 'no-business-day'], 'no business-day module: not computable, never a guess');
  const badZone = inst(a, { config: () => ({ businessCutoff: 5, timezone: 'Not/AZone' }), resolve: (c) => ({ cutoff: c.businessCutoff, zone: c.timezone }) });
  eq(badZone.get('revenue', 'today').reason, 'bad-zone', 'a zone the runtime does not know is refused');
  done('both routes give the server\'s days; no business-day module means not computable');
}

/* ── 5 · A cutoff change, and the Z rule ──────────────────────────────────── */
section('Cutoff 5 to 7, closed days and conflicting Z reports');
{
  const ch = stores.find((x) => x.id === 'fx-change'), cf = stores.find((x) => x.id === 'fx-conflict');
  const L = inst(ch);
  /* The closed day keeps the cutoff its Z recorded. */
  const before = inst({ ...ch, config: { businessCutoff: 5, timezone: 'Africa/Casablanca' }, zReports: {} });
  const afterNoZ = inst({ ...ch, zReports: {} });
  for (const key of KEYS) eq(L.get(key, { day: '2026-10-10' }).value, before.get(key, { day: '2026-10-10' }).value, `closed day ${key} is what it was at cutoff 5`);
  check(afterNoZ.get('revenue', { day: '2026-10-10' }).value !== L.get('revenue', { day: '2026-10-10' }).value, 'without the Z, cutoff 7 would reinterpret the closed day');
  eq(L.get('revenue', { day: '2026-10-10' }).cutoff, 5, 'the result names the cutoff it used');
  eq(L.get('revenue', { day: '2026-10-11' }).cutoff, 7, 'an open day uses the configured cutoff');
  /* A pre-upgrade Z has no cutoff field: it is read at the legacy cutoff, never at the new one. */
  const legacy = inst({ ...ch, zReports: { '2026-10-10': [{}] } });
  eq(legacy.get('revenue', { day: '2026-10-10' }).value, before.get('revenue', { day: '2026-10-10' }).value, 'a legacy Z is read at the legacy cutoff');
  eq(legacy.get('revenue', { day: '2026-10-10' }).computable, true, 'a legacy Z alone is not a conflict');
  /* Two reports that disagree. */
  const C = inst(cf);
  const r = C.get('revenue', { day: '2026-10-10' });
  eq([r.value, r.computable, r.reason], [null, false, 'cutoff-conflict'], 'two Z reports with two cutoffs: z.cutoff_conflict');
  eq(r.conflicts[0].reports.map((x) => x.cutoff).sort(), [5, 7], 'each report keeps its own cutoff');
  for (const rep of r.conflicts[0].reports) eq(r.conflicts[0].reports.find((x) => x.cutoff === rep.cutoff).value, F.reference(cf, 'revenue', '2026-10-10', () => rep.cutoff), `report at cutoff ${rep.cutoff} carries its own figure`);
  eq(C.get('revenue', { from: '2026-10-09', to: '2026-10-11' }).reason, 'cutoff-conflict', 'a span holding the conflicting day is not a single number');
  eq(C.get('revenue', { day: '2026-10-11' }).computable, true, 'the next day is unaffected');
  const mixed = inst({ ...ch, zReports: { '2026-10-10': [{}, { cutoff: 7 }] } }).get('revenue', { day: '2026-10-10' });
  eq(mixed.reason, 'cutoff-conflict', 'a legacy report beside a 7 h report disagree');
  done('Z cutoff kept, legacy Z read at the legacy cutoff, conflicts reported with each report\'s figure');
}

/* ── 6 · The Ramadan clock change ─────────────────────────────────────────── */
section('A business day spanning the Ramadan clock change');
{
  const rd = stores.find((x) => x.id === 'fx-ramadan');
  const L = inst(rd);
  check(rd.changeAt, 'the zone has a clock change in the first quarter of 2026');
  const win = (day) => F.businessBoundary(F.addBusinessDays(day, 1), 5, 'Africa/Casablanca') - F.businessBoundary(day, 5, 'Africa/Casablanca');
  eq(win(rd.changeDay) / 3600000, 25, 'the day the clocks go back is 25 hours long');
  let total = 0;
  for (const day of rd.days) {
    for (const key of KEYS) eq(L.get(key, { day }).value, F.reference(rd, key, day), `${day} ${key}`);
    total += L.get('orders', { day }).value;
  }
  eq(total, rd.sales.length, 'no sale is lost or counted twice across the change');
  eq(L.get('orders', { day: rd.changeDay }).value, 50, 'a 25-hour day holds 50 half-hours');
  /* The forward change, a year-style 23-hour day, from the same zone. */
  const fwd = F.firstClockChange('Africa/Casablanca', '2026-03-01', '2026-04-01');
  const fday = F.businessDate(fwd, 5, 'Africa/Casablanca');
  eq(win(fday) / 3600000, 23, 'the day the clocks go forward is 23 hours long');
  done('25 h and 23 h days: windows follow the wall clock, nothing lost, nothing doubled');
}

/* ── 7 · The worked example: Café Atlas, Monday 12 October 2026, 17:39 ───── */
section('Café Atlas (tools/fixtures/worked-example.json) through the ledger');
{
  const w = F.workedExampleStore(defaults);
  const L = inst({ ...w, resolve: F.resolverFor(defaults) });
  const today = L.get('revenue', 'today');
  eq(today.businessDay, '2026-10-12', 'the business day of 17:39 on 12 October');
  eq(today.cutoff, 5, 'cutoff 5'); eq(today.zone, 'Africa/Casablanca', 'Africa/Casablanca');
  eq(today.value, 19174, 'revenue 19,174.00, net of the 45.00 refund');
  eq(L.get('orders', 'today').value, 137, '137 orders');
  eq(L.get('card_share', 'today').value, 66, 'card share 66%');
  eq(L.get('avg_ticket', 'today').value, 139.96, 'average basket 139.96');
  eq(L.get('refunds', 'today').value, 45, 'refunds 45.00');
  eq(L.get('card_revenue', 'today').value, 12655, 'card 12,655.00 net');
  eq(L.get('cash_revenue', 'today').value, 6519, 'cash 6,519.00');
  const cmp = L.compare('revenue', 'yesterday');
  eq(cmp.baselineValue, 20301, 'yesterday at 17:39: 20,301.00');
  eq(cmp.delta, -1127, 'delta -1,127.00');
  eq(cmp.baselineLabel.key, 'compare.yesterday_at', 'the baseline names its clock');
  eq(cmp.baselineLabel.params.time, '17:39', '"vs yesterday at 17:39"');
  eq(L.compare('orders', 'yesterday').baselineValue, 133, 'yesterday at 17:39: 133 orders');
  eq(L.compare('orders', 'yesterday').delta, 4, '+4 orders');
  eq(L.get('revenue', { day: '2026-10-11' }).value, 30100, 'yesterday\'s whole business day closed at 30,100.00');
  {
    const at = F.wall('2026-10-12', '23:41', 'Africa/Casablanca'), cut = F.wall('2026-10-11', '23:41', 'Africa/Casablanca');
    const lo = F.businessBoundary('2026-10-11', 5, 'Africa/Casablanca');
    const want = w.sales.filter((e) => e.ts >= lo && e.ts <= cut).reduce((a, e) => a + e.amount, 0);
    const got = L.compare('revenue', 'yesterday', { asOf: at });
    eq(got.baselineValue, want, 'at 23:41 the baseline is yesterday cut at 23:41');
    eq(got.baselineLabel.params.time, '23:41', 'and it says 23:41');
  }
  eq(Math.round(L.compare('card_share', 'yesterday').baselineValue), 65, 'yesterday at 17:39: card share 65%');
  /* Before the first sale the day is empty, not borrowed from yesterday. */
  const early = L.get('revenue', 'today', { asOf: F.wall('2026-10-12', '06:00', 'Africa/Casablanca') });
  eq(early.value, 0, 'at 06:00 today has nothing');
  eq(L.get('avg_ticket', 'today', { asOf: F.wall('2026-10-12', '06:00', 'Africa/Casablanca') }).computable, false, 'an average of nothing is not computable');
  eq(L.get('card_share', 'today', { asOf: F.wall('2026-10-12', '06:00', 'Africa/Casablanca') }).reason, 'no-revenue', 'a share of nothing is not computable');
  /* Last Monday: the weekday baseline names the weekday. */
  const wk = inst(stores.find((x) => x.id === 'fx-c5')).compare('revenue', 'weekday');
  eq([wk.baselineLabel.key, wk.baselineLabel.params.weekday, wk.baselineLabel.params.time], ['compare.weekday_at', 1, '17:39'], '"vs last Monday at 17:39"');
  eq(wk.baselineDay, '2026-10-05', 'seven days back');
  eq(L.compare('revenue', 'none').reason, 'no-baseline', 'no baseline, no delta');
  eq(L.compare('revenue', 'yesterday', { range: 'last7' }).reason, 'range-not-comparable', 'only the live day compares');
  done('137 orders, 19,174.00 MAD, 66%, 139.96, vs yesterday at 17:39: -1,127.00');
}

/* ── 8 · Shadow mode ──────────────────────────────────────────────────────── */
section('Shadow mode (§21.2)');
{
  const calls = { console: 0, storageWrites: 0, fetch: 0, reads: 0 };
  const realConsole = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { realConsole[k] = console[k]; console[k] = () => { calls.console++; }; }
  const store = new Map();
  let flag = null;
  globalThis.localStorage = { getItem: (k) => (k === 'kiwiLedger' ? flag : null), setItem: () => { calls.storageWrites++; }, removeItem: () => { calls.storageWrites++; } };
  globalThis.fetch = () => { calls.fetch++; return Promise.reject(new Error('no network in shadow mode')); };
  const c5 = stores.find((x) => x.id === 'fx-c5'), c0 = stores.find((x) => x.id === 'fx-c0');
  /* What the shipped dateRange reads when KiwiDayReport has no cutoff: calendar midnight (dayCutoffH → 0), summed like venues.js salesTotals. */
  const shipped = (s, day) => {
    const zone = s.config.timezone;
    const from = F.businessBoundary(day, 0, zone), to = Math.min(F.businessBoundary(F.addBusinessDays(day, 1), 0, zone), s.asOf + 1);
    let r = 0; for (const e of s.sales) if (e.ts >= from && e.ts < to) r += e.amount;
    for (const e of s.refunds) if (e.ts >= from && e.ts < to) r -= Math.abs(e.amount);
    return r;
  };
  const mk = (s) => inst(s, { sales: () => { calls.reads++; return s.sales; } });
  try {
    /* off by default: nothing is computed, nothing recorded */
    let L = mk(c5);
    eq(L.shadow.mode(), 'off', 'absent flag is off');
    eq(L.reader('home').shadow('revenue', 'today', shipped(c5, '2026-10-12'), { fixture: true }), null, 'off: no difference recorded');
    eq(calls.reads, 0, 'off: not one sale read');
    flag = 'bogus'; eq(L.shadow.mode(), 'off', 'an unknown value is off');
    flag = 'on'; eq(L.shadow.mode(), 'on', 'on is read'); eq(L.reader('home').shadow('revenue', 'today', 0, { fixture: true }), null, 'on: shadow does not run');
    flag = 'shadow'; eq(L.shadow.mode(), 'shadow', 'shadow is read');

    /* a fixture: records a difference where the shipped midnight day differs from the 05:00 day */
    L = mk(c5);
    const rec = L.reader('home').shadow('revenue', 'today', shipped(c5, '2026-10-12'), { fixture: true });
    check(rec && rec.surface === 'home' && rec.key === 'revenue' && rec.kind === 'fixture' && rec.delta !== 0, 'cutoff 5: the shipped midnight day and the ledger day differ, and the difference is kept');
    eq(L.reader('home').shadow('revenue', 'today', L.get('revenue', 'today').value, { fixture: true }), null, 'equal figures leave no record');
    eq(mk(c0).reader('orders').shadow('revenue', 'today', shipped(c0, '2026-10-12'), { fixture: true }), null, 'cutoff 0: shipped and ledger agree, nothing recorded');
    eq(L.reader('z').shadow('revenue', 'today', null, { fixture: true }) === null, false, 'a figure the shipped code cannot give is a difference');
    eq(L.shadow.diffs().length, 2, 'two differences kept in memory');
    eq(L.shadow.evidence().schema, 'kiwi-ledger-shadow/1', 'evidence file schema');
    const dir = path.join(process.env.KIWI_RESULTS_DIR || path.join(ROOT, '.kiwi', 'results'), 'ledger-shadow');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ledger-agreement.json'), JSON.stringify(L.shadow.evidence(), null, 1) + '\n');

    /* a production merchant: refused before a sale is read, fixture flag or not */
    globalThis.KiwiEnv = { isReal: () => true };
    globalThis.KiwiStore = { currentVenue: () => 'v-santos', slugFor: () => 'santos-store' };
    calls.reads = 0;
    L = mk(c5);
    eq(L.shadow.eligible({ fixture: true }).kind, 'live', 'Santos Store is live');
    eq(L.reader('home').shadow('revenue', 'today', 1, { fixture: true }), null, 'a production merchant: no check');
    eq(L.reader('home').shadow('revenue', 'today', 1, { demo: true, slug: 'amira-cafe' }), null, 'a caller cannot name its own slug');
    eq(calls.reads, 0, 'a production merchant: not one sale read');
    eq(L.shadow.diffs().length, 0, 'a production merchant: nothing recorded');

    /* Amira Cafe: allowed, and visible in the page only with ?ledgerDebug=1 */
    globalThis.KiwiStore = { currentVenue: () => 'v-amira', slugFor: () => 'amira-cafe' };
    globalThis.location = { search: '' };
    L = mk(c5);
    eq(L.shadow.eligible().kind, 'amira', 'Amira Cafe is the test venue');
    check(L.reader('home').shadow('revenue', 'today', 1), 'Amira Cafe: a difference is recorded');
    eq(globalThis.__kiwiLedgerDiff, undefined, 'Amira Cafe: nothing in the page without ledgerDebug');
    globalThis.location = { search: '?ledgerDebug=1' };
    L.reader('home').shadow('revenue', 'today', 2);
    eq(globalThis.__kiwiLedgerDiff.length, 2, 'Amira Cafe with ?ledgerDebug=1: window.__kiwiLedgerDiff');
    delete globalThis.__kiwiLedgerDiff;

    /* a demo store (local, not real) */
    globalThis.KiwiEnv = { isReal: () => false };
    globalThis.KiwiStore = { currentVenue: () => 'cafeAtlas', slugFor: () => '' };
    globalThis.location = { search: '' };
    L = mk(c5);
    eq(L.shadow.eligible().kind, 'demo', 'a demo store');
    check(L.reader('team').shadow('revenue', 'today', 1), 'a demo store: a difference is recorded');
    /* the page cannot be tricked into calling a real merchant a fixture */
    globalThis.KiwiEnv = { isReal: () => true }; globalThis.KiwiStore = { currentVenue: () => 'x', slugFor: () => 'santos-store' };
    eq(mk(c5).shadow.eligible({ fixture: true }).kind, 'live', 'fixture:true does not unlock a real merchant');
    /* no host objects at all, no flags: not a fixture, not shadow */
    delete globalThis.KiwiEnv; delete globalThis.KiwiStore;
    eq(mk(c5).shadow.eligible({}).kind, 'live', 'unknown host: live');
  } finally {
    for (const k of Object.keys(realConsole)) console[k] = realConsole[k];
    delete globalThis.localStorage; delete globalThis.fetch; delete globalThis.KiwiEnv; delete globalThis.KiwiStore; delete globalThis.location; delete globalThis.__kiwiLedgerDiff;
  }
  eq(calls.console, 0, 'shadow mode never wrote to the console');
  eq(calls.storageWrites, 0, 'shadow mode never wrote to storage');
  eq(calls.fetch, 0, 'shadow mode never touched the network');
  done('off by default; production merchants refused unread; Amira Cafe gated; silent and read-only');
}

/* ── 9 · The file itself ──────────────────────────────────────────────────── */
section('assets/kit/ledger.js');
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/kit/ledger.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check(!/\bconsole\s*\./.test(code), 'no console');
  check(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/.test(code), 'no network');
  check(!/\b(setItem|removeItem|sessionStorage|indexedDB)\b/.test(code), 'no writes');
  check(!code.split('\n').some((l) => /cutoff/i.test(l) && (/cutoff\s*(=|:|\?\?|\|\|)\s*\d/i.test(l) || /(\?\?|\|\|)\s*\d+\s*[;,)]/.test(l))), 'no literal cutoff default (only assets/kit/business-day.js holds it, §17.1)');
  check(!/Africa\/Casablanca/.test(code), 'no default zone');
  check(!/Math\.random|Date\.now\(\)\s*[-+*]/.test(code), 'no randomness');
  /* Adopted by no product surface: no shell, no shipped script, no service
     worker mentions it. Stage 2's gallery (kit.html, noindex) is the one
     page allowed to load it, to show the KPI tiles' polarity (§21.1: "Adopts
     it: Gallery only"). */
  const hosts = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !/ \d+\.html$/.test(f)).concat(['kiwi-sw.js'])
    .concat(fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => f.endsWith('.js') && !/ \d+\.js$/.test(f)).map((f) => 'assets/' + f));
  const users = hosts.filter((f) => { try { return /kit\/ledger\.js|KiwiLedger/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return false; } });
  eq(users.filter((f) => f !== 'kit.html'), [], 'KiwiLedger is adopted by no product surface (the stage-2 gallery aside)');
  done('read-only, silent, no default of its own, adopted by no product surface');
}

/* ── 10 · The comparison can go red ───────────────────────────────────────── */
section('The test turns red on a wrong ledger');
{
  const c5 = stores.find((x) => x.id === 'fx-c5'), paris = stores.find((x) => x.id === 'fx-paris5');
  const differs = (s, over) => {
    const L = inst(s, over); let bad = 0;
    for (const day of s.days) for (const key of KEYS) { const w = F.reference(s, key, day); if (w !== null && L.get(key, { day }).value !== w) bad++; }
    return bad;
  };
  eq(differs(c5, {}), 0, 'the honest ledger has no mismatch');
  check(differs(c5, { resolve: (c) => ({ cutoff: c.businessCutoff + 1, zone: c.timezone }) }) > 0, 'cutoff off by one is caught');
  check(differs(c5, { resolve: (c) => ({ cutoff: 0, zone: c.timezone }) }) > 0, 'midnight instead of the cutoff is caught');
  check(differs(paris, { resolve: (c) => ({ cutoff: c.businessCutoff, zone: 'Africa/Casablanca' }) }) > 0, 'the wrong zone is caught');
  check(differs(c5, { refunds: () => [] }) > 0, 'refunds ignored is caught');
  check(differs(c5, { sales: () => c5.sales.slice(1) }) > 0, 'a dropped sale is caught');
  const ch = stores.find((x) => x.id === 'fx-change');
  let bad = 0; for (const key of KEYS) if (inst(ch, { zReports: () => [] }).get(key, { day: '2026-10-10' }).value !== F.reference(ch, key, '2026-10-10', cutoffOf(ch))) bad++;
  check(bad > 0, 'a ledger that reinterprets a closed day is caught');
  done('six wrong ledgers each turn the comparison red');
}

console.log(`\n${checks} checks passed.`);
