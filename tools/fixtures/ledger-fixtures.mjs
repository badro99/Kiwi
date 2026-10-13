/* Kiwi · tools/fixtures/ledger-fixtures.mjs : anonymised stores for the ledger (design 2027, §17.1 and §21.2).
 *
 * Seeded synthetic stores whose SHAPE covers what the production mix has. The
 * generator reads no production data and holds no merchant name, code or record:
 * every number comes from assets/kit/demo-seed.js (hash(storeId + businessDay))
 * or from tools/fixtures/worked-example.json.
 *
 *   buildStores(resolveDefaults)   the five stores of §17.1, plus Paris
 *   workedExampleStore()           Café Atlas on 12 October 2026, as events
 *   reference(store, key, day)     what the SERVER's rule gives, computed the other way round
 *                                  (each event classified by businessDate(), then summed)
 *   serverDefaults()               the defaults, read from functions/api/_business-day.js
 *
 * The reference classifies EVENTS into days with the server's own
 * `businessDate`; the ledger cuts DAYS into windows. Two routes to one number.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);
const seed = require(path.join(ROOT, 'assets/kit/demo-seed.js'));
const server = await import(pathToFileURL(path.join(ROOT, 'functions/api/_business-day.js')).href);
export const { businessDate, businessBoundary, addBusinessDays } = server;

/* The defaults the server itself falls back to, asked of the server's own functions. */
export async function serverDefaults() {
  return { cutoff: await server.merchantCutoff({}, 'x'), zone: await server.merchantZone({}, 'x') };
}

/* A stand-in for assets/kit/business-day.js (another stage-1 slice): cutoff =
 * config.businessCutoff ?? DEFAULT_CUTOFF, zone = config.timezone || DEFAULT_ZONE. */
export function resolverFor(defaults) {
  return function resolve(config) {
    config = config || {};
    return {
      cutoff: config.businessCutoff == null ? defaults.cutoff : config.businessCutoff,
      zone: config.timezone || defaults.zone,
    };
  };
}

/* The instant the zone's wall clock reads `day` at HH:MM (independent search, not the ledger's). */
export function wall(day, hhmm, zone) {
  const [h, m] = hhmm.split(':').map(Number);
  const target = Date.parse(day + 'T00:00:00Z') + (h * 60 + m) * 60000;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let guess = target;
  for (let i = 0; i < 5; i++) {
    const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
    const seen = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (seen === target) return guess;
    guess += target - seen;
  }
  return guess;
}

/* The first clock change of a zone inside [fromDay, toDay): the hour at which the offset moves. */
export function firstClockChange(zone, fromDay, toDay) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' });
  const off = (t) => f.format(t).split(', ')[1];
  let prev = off(Date.parse(fromDay + 'T00:00:00Z'));
  for (let t = Date.parse(fromDay + 'T00:00:00Z'); t < Date.parse(toDay + 'T00:00:00Z'); t += 3600000) {
    const o = off(t);
    if (o !== prev) return t;
    prev = o;
  }
  return null;
}

let n = 0;
const sale = (ts, amount, method = 'card') => ({ id: 'fx-' + (++n), ts, amount, method });
const refund = (ts, amount, method = 'card') => ({ ts, amount, method, kind: 'refund' });

function fillDays(id, days, cutoff, zone, until, out) {
  for (const day of days) {
    const startTs = businessBoundary(day, cutoff, zone);
    const endTs = businessBoundary(addBusinessDays(day, 1), cutoff, zone);
    const r = seed.ordersForDay(id, day, { startTs, endTs, until });
    out.sales.push(...r.sales);
    out.refunds.push(...r.refunds);
  }
}

/* The edge events of one store: a sale one minute before the cutoff and one at
 * it, on each of two days, so a boundary mistake moves a known amount. */
function edges(day, cutoff, zone, out, tag) {
  const hh = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const cutMin = cutoff * 60;
  const prevDay = addBusinessDays(day, -1);
  /* The minute before the cutoff belongs to the previous business day; for cutoff 0 that is 23:59 of the previous calendar day. */
  const before = cutoff === 0 ? wall(prevDay, '23:59', zone) : wall(day, hh(cutMin - 1), zone);
  const at = wall(day, hh(cutMin % 1440), zone);
  out.sales.push(sale(before, 11 + tag, 'cash'), sale(at, 23 + tag, 'card'));
}

export async function buildStores(defaults) {
  defaults = defaults || await serverDefaults();
  const resolve = resolverFor(defaults);
  const stores = [];
  const days = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'];
  const asOf = (zone, day, hhmm) => wall(day, hhmm, zone);

  for (const [id, cutoff, zone] of [['fx-c5', 5, 'Africa/Casablanca'], ['fx-c3', 3, 'Africa/Casablanca'], ['fx-c0', 0, 'Africa/Casablanca'], ['fx-paris5', 5, 'Europe/Paris']]) {
    const s = { id, config: { businessCutoff: cutoff, timezone: zone }, resolve, sales: [], refunds: [], zReports: {}, days, asOf: asOf(zone, '2026-10-12', '17:39') };
    fillDays(id, days, cutoff, zone, s.asOf, s);
    edges('2026-10-11', cutoff, zone, s, 0);
    edges('2026-10-12', cutoff, zone, s, 100);
    s.sales.push(sale(wall('2026-10-12', '12:00', zone), 500, 'cash'));
    s.refunds.push(refund(wall('2026-10-12', '12:30', zone), 40, 'cash'));
    stores.push(s);
  }

  /* No cutoff row and no zone: today's /api/config sends null and '' ... */
  const rawNull = { businessCutoff: null, timezone: '' };
  const zoneNo = defaults.zone, cutNo = defaults.cutoff;
  const noRow = { id: 'fx-norow', config: rawNull, resolve, sales: [], refunds: [], zReports: {}, days, asOf: asOf(zoneNo, '2026-10-12', '17:39') };
  fillDays('fx-norow', days, cutNo, zoneNo, noRow.asOf, noRow);
  edges('2026-10-11', cutNo, zoneNo, noRow, 0);
  edges('2026-10-12', cutNo, zoneNo, noRow, 100);
  stores.push(noRow);
  /* ... and the stage 1 route sends the resolved values, from the same functions the ledger uses. */
  stores.push({ ...noRow, id: 'fx-norow-resolved', config: { businessCutoff: cutNo, timezone: zoneNo } });

  /* A cutoff that changes from 5 to 7 between two days; the earlier day's Z recorded 5. */
  const ch = { id: 'fx-change', config: { businessCutoff: 7, timezone: 'Africa/Casablanca' }, resolve, sales: [], refunds: [],
    zReports: { '2026-10-10': [{ cutoff: 5 }] }, days: ['2026-10-10', '2026-10-11', '2026-10-12'], asOf: asOf('Africa/Casablanca', '2026-10-12', '17:39') };
  fillDays('fx-change-a', ['2026-10-10'], 5, 'Africa/Casablanca', undefined, ch);
  fillDays('fx-change-b', ['2026-10-11', '2026-10-12'], 7, 'Africa/Casablanca', ch.asOf, ch);
  ch.sales.push(sale(wall('2026-10-10', '06:00', 'Africa/Casablanca'), 77, 'cash')); // inside 10 Oct at cutoff 5, before 07:00
  ch.sales.push(sale(wall('2026-10-11', '06:00', 'Africa/Casablanca'), 66, 'cash')); // after 10 Oct's 05:00 end, before 11 Oct's 07:00 start
  stores.push(ch);

  /* Two Z reports for one day that disagree on the cutoff (z-reconciliation's cutoffConflict). */
  stores.push({ ...ch, id: 'fx-conflict', zReports: { '2026-10-10': [{ cutoff: 5 }, { cutoff: 7 }] } });

  /* A business day spanning the Ramadan clock change (the first one after 1 January 2027). */
  const zr = 'Africa/Casablanca';
  const change = firstClockChange(zr, '2027-01-01', '2027-04-01');
  const changeDay = businessDate(change, 5, zr);          // the business day the change falls in
  const rd = { id: 'fx-ramadan', config: { businessCutoff: 5, timezone: zr }, resolve, sales: [], refunds: [], zReports: {},
    days: [addBusinessDays(changeDay, -1), changeDay, addBusinessDays(changeDay, 1)], changeAt: change, changeDay,
    asOf: wall(addBusinessDays(changeDay, 2), '12:00', zr) };
  /* One sale every 30 minutes across the whole span, so a window that is an hour short or long moves the totals. */
  const t0 = businessBoundary(rd.days[0], 5, zr), t1 = businessBoundary(addBusinessDays(rd.days[2], 1), 5, zr);
  for (let t = t0, i = 0; t < t1; t += 1800000, i++) rd.sales.push(sale(t, 10 + (i % 7), i % 3 ? 'card' : 'cash'));
  stores.push(rd);

  for (const s of stores) { s.sales.sort((a, b) => a.ts - b.ts); s.refunds.sort((a, b) => a.ts - b.ts); }
  return stores;
}

/* The figure the SERVER's rule gives for one business day: classify each event
 * with businessDate() at that day's cutoff, then sum. */
export function reference(store, key, day, cutoffOf) {
  const { resolve, config } = store;
  const st = resolve(config);
  const cutoff = cutoffOf ? cutoffOf(day, st) : st.cutoff;
  let sales = 0, refunds = 0, orders = 0, card = 0, cash = 0;
  const isCard = (m) => ['card', 'carte', 'visa', 'mc', 'mastercard', 'tap'].includes(String(m).toLowerCase());
  for (const e of store.sales) if (businessDate(e.ts, cutoff, st.zone) === day) { sales += Math.round(e.amount * 100); orders++; if (e.method === 'cash') cash += Math.round(e.amount * 100); else if (isCard(e.method)) card += Math.round(e.amount * 100); }
  for (const e of store.refunds) if (businessDate(e.ts, cutoff, st.zone) === day) { const c = Math.round(Math.abs(e.amount) * 100); refunds += c; if (e.method === 'cash') cash -= c; else if (isCard(e.method)) card -= c; }
  const net = sales - refunds;
  return { revenue: net / 100, orders, avg_ticket: orders ? Math.round(net / orders) / 100 : null, refunds: refunds / 100,
    card_revenue: card / 100, cash_revenue: cash / 100, card_share: net > 0 ? Math.round(card / net * 100) : null, tips: 0 }[key];
}

/* ── Café Atlas, 12 October 2026, as events ──────────────────────────────── */

export function loadWorkedExample() {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'worked-example.json'), 'utf8'));
}

/* n whole-dirham amounts that sum to `total`, none below `min`, deterministic. */
function partition(total, count, r, min) {
  const spare = total - count * min;
  if (spare < 0) throw new Error('partition: ' + total + ' cannot hold ' + count + ' parts of ' + min);
  const w = Array.from({ length: count }, () => 0.2 + r());
  const sum = w.reduce((a, b) => a + b, 0);
  const parts = w.map((x) => Math.floor(spare * x / sum));
  parts[count - 1] += spare - parts.reduce((a, b) => a + b, 0);
  return parts.map((p) => p + min);
}

export function workedExampleStore(defaults) {
  const FX = loadWorkedExample();
  const zone = FX.zone, cutoff = FX.cutoff;
  const price = {};
  FX.menu.forEach((c) => c.items.forEach((it) => { price[it[0]] = it[1]; }));
  const yesterday = addBusinessDays(FX.date, -1);
  const r = seed.rng('worked-example', FX.date, 'fill');
  const sales = [], refunds = [];
  const mins = (t) => t;
  /* The orders the day's log holds, with their exact lines and times. */
  let loggedCard = { n: 0, gross: 0 }, loggedCash = { n: 0, gross: 0 };
  for (const o of FX.orders) {
    const amount = o.lines.reduce((a, l) => a + price[l[0]] * l[1], 0);
    const ts = wall(FX.date, mins(o.time), zone);
    if (o.refund) { refunds.push(refund(ts, Math.abs(amount), o.method.toLowerCase())); continue; }
    sales.push(sale(ts, amount, o.method.toLowerCase()));
    const b = o.method === 'Cash' ? loggedCash : loggedCard;
    b.n++; b.gross += amount;
  }
  const clockTs = wall(FX.date, FX.now, zone);
  const fill = (method, count, gross, dayLabel, fromHhmm, toHhmm) => {
    const parts = partition(gross, count, r, 15);
    const a = wall(dayLabel, fromHhmm, zone), b = wall(dayLabel, toHhmm, zone);
    parts.forEach((amount, i) => sales.push(sale(a + Math.floor((b - a) * (i + 0.5) / count), amount, method)));
  };
  /* Today before the log's first order (16:40): the rest of the day's tallies. */
  fill('card', FX.tallies.card.orders - loggedCard.n, FX.tallies.card.gross - loggedCard.gross, FX.date, '11:00', '16:39');
  fill('cash', FX.tallies.cash.orders - loggedCash.n, FX.tallies.cash.gross - loggedCash.gross, FX.date, '11:00', '16:39');
  /* Yesterday up to 17:39, then the rest of its day to the closing total. */
  const yo = FX.yesterday;
  const yCardOrders = 86, yCashOrders = yo.orders - yCardOrders;
  fill('card', yCardOrders, yo.card, yesterday, '11:00', '17:38');
  fill('cash', yCashOrders, yo.revenue - yo.card, yesterday, '11:00', '17:38');
  const restOrders = 64;
  fill('card', restOrders, yo.dayTotal - yo.revenue, yesterday, '17:40', '23:50');
  sales.sort((a, b) => a.ts - b.ts); refunds.sort((a, b) => a.ts - b.ts);
  return { id: 'worked-example', fixture: FX, config: { businessCutoff: cutoff, timezone: zone }, sales, refunds, zReports: {}, asOf: clockTs, today: FX.date, yesterday };
}
