#!/usr/bin/env node
/* fixture-agreement-test · the worked example agrees with itself and with the spec (design 2027, §18.0).
 *
 *   node tools/fixture-agreement-test.mjs
 *
 * tools/fixtures/worked-example.json is the one fixture behind every hero:
 * Café Atlas, Monday 12 October 2026, cutoff 5, Africa/Casablanca, at 17:39 and
 * at the close, 23:41. It stores SOURCES only (menu prices, each table's lines
 * with their send times, the order log, the kitchen's ticket log, each
 * customer's dated visits, the method tallies, the close's movements and
 * denominations). Every figure a screen draws is derived from those sources.
 *
 * Four legs:
 *   1 · SPEC   the derived figures equal the numbers §18.0 prints (137 orders,
 *              19,174.00 MAD, 66 %, goal 82 %, Z 0147, expected 8,920.00...).
 *              The literals live in this file; the fixture can only reach them
 *              by deriving them.
 *   2 · AGREE  the sources agree with one another, the checks of §18.0 that need
 *              no frame: orders against the plan and the table lines, tickets
 *              against tables and open orders, the count against its parts, the
 *              close against its tallies. A reference that does not resolve is a
 *              failure, never a skip.
 *   3 · MUTATE each row of the mutation table breaks one source in a copy of the
 *              fixture and the named check must go red. A check that compares a
 *              value with itself cannot pass this table.
 *   4 · PREVIEW the checks that read painted frames (13 to 15, 19) cannot run on
 *              data alone. docs/specs/kiwi-design-2027-preview.html runs all of
 *              them on its frames and its own 204-row table; this leg loads it in
 *              Chromium, requires every check green and every mutation caught, and
 *              requires its embedded fixture to be byte-identical to the file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.KIWI_ROOT || path.resolve(HERE, '..');
const FIXTURE = path.join(root, 'tools/fixtures/worked-example.json');
const PREVIEW = path.join(root, 'docs/specs/kiwi-design-2027-preview.html');
const FX0 = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

let checks = 0;
const tick = () => { checks++; };
const section = (t) => console.log('\n' + t);
const done = (t) => console.log('  ✓ ' + t);
const copy = (o) => JSON.parse(JSON.stringify(o));

/* ── Small helpers ────────────────────────────────────────────────────────── */
const mins = (t) => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
const days = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
const need = (v, what) => { if (v === undefined || v === null || v === false) throw new Error('missing reference: ' + what); return v; };
const bag = (lines) => { const m = {}; lines.forEach((l) => { m[l[0]] = (m[l[0]] || 0) + l[1]; }); return Object.keys(m).sort().map((k) => k + '×' + m[k]).join(', '); };
const round2 = (v) => Math.round(v * 100) / 100;

/* The model: everything derived from sources, nothing stored (§18.0, revision 6). */
function model(FX) {
  need(/^\d{4}-\d{2}-\d{2}$/.test(FX.date) && !isNaN(Date.parse(FX.date)), 'a valid date');
  need(/^\d{2}:\d{2}$/.test(FX.now), 'a valid clock');
  const M = { price: {}, station: {}, plan: {}, now: mins(FX.now) };
  const seen = {};
  FX.menu.forEach((c) => c.items.forEach((it) => {
    need(!seen[it[0]], 'a dish named once: ' + it[0]); seen[it[0]] = 1;
    M.price[it[0]] = it[1]; M.station[it[0]] = it[2];
  }));
  Object.keys(FX.plan).forEach((z) => FX.plan[z].forEach((id) => { M.plan[id] = z; }));
  M.dish = (n) => need(M.price[n] !== undefined ? n : null, 'dish "' + n + '" on the menu');
  M.amount = (lines) => lines.reduce((a, l) => a + M.price[M.dish(l[0])] * need(Number.isInteger(l[1]) && l[1] !== 0 ? l[1] : null, 'a whole quantity for ' + l[0]), 0);
  M.table = (id) => FX.tables.filter((t) => t.id === id)[0] || null;
  M.order = (n) => FX.orders.filter((o) => o.n === n && !o.refund)[0] || null;
  M.status = (id) => {
    need(M.plan[id] ? id : null, 'table ' + id + ' on the plan');
    const t = M.table(id); if (!t) return { s: 'free' };
    let by = null; FX.orders.forEach((o) => { if (!o.refund && o.table === id && mins(o.time) >= mins(t.opened)) by = o; });
    if (by) return { s: 'paid', by, t };
    if (t.billAsked) return { s: 'bill', t };
    if (!t.lines.length) return { s: 'open', t };
    if (t.lines.some((l) => !l[2])) return { s: 'ordering', t };
    return { s: 'progress', t };
  };
  const T = FX.tallies;
  M.rev = 0; M.orders = 0; M.refunds = 0;
  Object.keys(T).forEach((k) => { M.rev += T[k].gross - T[k].refunds; M.orders += T[k].orders; M.refunds += T[k].refunds; });
  M.card = T.card.gross - T.card.refunds;
  M.segment = (c) => {
    const ds = c.visits.map((v) => v[0]).sort();
    if (days(FX.date, ds[0]) <= 30) return 'New';
    if (days(FX.date, ds[ds.length - 1]) > 60) return 'Inactive';
    return 'Regular';
  };
  M.age = (t) => M.now - mins(t.sent);
  M.state = (t) => { const a = M.age(t); return a >= FX.kitchen.lateMin ? 'late' : a >= FX.kitchen.warnMin ? 'warning' : ''; };
  M.active = FX.tickets.filter((t) => t.lane === 'new' || t.lane === 'preparing');
  M.close = () => {
    const C = FX.close, t = C.tallies;
    const gross = t.card.gross + t.cash.gross, refunds = t.card.refunds + t.cash.refunds;
    const cashSales = t.cash.gross - t.cash.refunds;                 // already net of cash refunds (day-report.js:717)
    const movesIn = C.moves.filter((m) => m[0] === 'in').reduce((a, m) => a + m[1], 0);
    const movesOut = C.moves.filter((m) => m[0] === 'out').reduce((a, m) => a + m[1], 0);
    const expected = round2(C.float + cashSales + t.cash.tips + movesIn - movesOut);   // day-report.js:719, no refunds term
    const counted = C.denominations.reduce((a, d) => a + d[0] * d[1], 0);
    return { orders: t.card.orders + t.cash.orders, total: gross - refunds, card: t.card.gross - t.card.refunds, cash: cashSales,
      cashRefunds: t.cash.refunds, tips: t.card.tips + t.cash.tips, expected, counted, difference: round2(counted - expected), movesIn, movesOut };
  };
  return M;
}

/* ── 1 · SPEC: the numbers §18.0 prints ──────────────────────────────────── */
const SPEC = {
  revenue: 19174, orders: 137, card: 12655, cardShare: 66, cash: 6519, refunds: 45,
  yRevenue: 20301, yOrders: 133, yCard: 13195, yShare: 65, delta: -1127, dayTotal: 30100,
  basket: 139.96, yBasket: 152.64, basketDelta: -12.68,
  goal: 23500, goalShare: 81.6, goalPct: 82,
  amounts: { 1208: 156, 1207: 84, 1206: 212, 1205: 58, 1204: 176, 1203: 37, 1202: 247, 1201: 132, 1200: 62, 1199: 318, 1198: 41, 1197: 204 },
  tables: { T2: ['paid', 156], T4: ['ordering', 230], T9: ['bill', 188], T12: ['progress', 419], T22: ['progress', 273] },
  kds: { all: 9, new: 3, preparing: 6, hot: 7, cold: 2, pastry: 2, drinks: 4, late: [42], warning: [43, 44] },
  segments: { Regular: 4, New: 2, Inactive: 2 }, returning: 3, known: 8, reachable: 7,
  customers: { 'Salma Bennani': [41, 11780, 'Regular'], 'Youssef Alaoui': [22, 6420, 'Regular'], 'Leila Fassi': [2, 380, 'New'], 'Omar Benjelloun': [15, 4150, 'Regular'],
    'Hind Berrada': [9, 3960, 'Regular'], 'Mehdi Chraibi': [1, 210, 'New'], 'Sanae Idrissi': [6, 1240, 'Inactive'], 'Amine Lahlou': [4, 860, 'Inactive'] },
  close: { z: '0147', at: '23:41', orders: 183, total: 25310, card: 17070, cash: 8240, cashRefunds: 120, tips: 200, expected: 8920, counted: 8902, difference: -18, doubleRefund: 8800 },
  unread: 3, pending: 2, takeawayBadge: 1,
};

const SPEC_CHECKS = [
  ['S1 · Revenue and the day before', (FX, M) => {
    const f = [];
    const cmp = (name, got, want) => { if (got !== want) f.push(`${name}: ${got}, spec ${want}`); };
    cmp('revenue', M.rev, SPEC.revenue); cmp('orders', M.orders, SPEC.orders); cmp('card net', M.card, SPEC.card);
    cmp('card share', Math.round(M.card / M.rev * 100), SPEC.cardShare); cmp('cash', FX.tallies.cash.gross - FX.tallies.cash.refunds, SPEC.cash);
    cmp('refunds', M.refunds, SPEC.refunds);
    const Y = FX.yesterday;
    cmp('yesterday revenue', Y.revenue, SPEC.yRevenue); cmp('yesterday orders', Y.orders, SPEC.yOrders); cmp('yesterday card', Y.card, SPEC.yCard);
    cmp('yesterday share', Math.round(Y.card / Y.revenue * 100), SPEC.yShare); cmp('delta', M.rev - Y.revenue, SPEC.delta); cmp('day total', Y.dayTotal, SPEC.dayTotal);
    cmp('basket', round2(M.rev / M.orders), SPEC.basket); cmp('yesterday basket', round2(Y.revenue / Y.orders), SPEC.yBasket);
    cmp('basket delta', round2(M.rev / M.orders - Y.revenue / Y.orders), SPEC.basketDelta);
    cmp('date', FX.date, '2026-10-12'); cmp('clock', FX.now, '17:39'); cmp('venue', FX.venue, 'Café Atlas'); cmp('cutoff', FX.cutoff, 5); cmp('zone', FX.zone, 'Africa/Casablanca');
    return f.join('; ');
  }],
  ['S2 · Order amounts', (FX, M) => {
    const f = [];
    FX.orders.filter((o) => !o.refund).forEach((o) => { const a = M.amount(o.lines); if (a !== SPEC.amounts[o.n]) f.push(`#${o.n}: ${a}, spec ${SPEC.amounts[o.n]}`); });
    const r = FX.orders.filter((o) => o.refund);
    if (r.length !== 1 || M.amount(r[0].lines) !== -45) f.push('the refund of #1201 is -45.00');
    if (FX.orders.length !== 13) f.push(`${FX.orders.length} orders in the log, spec 13`);
    return f.join('; ');
  }],
  ['S3 · Table statuses and totals', (FX, M) => {
    const f = [];
    Object.keys(M.plan).filter((id) => !SPEC.tables[id]).forEach((id) => { if (M.status(id).s !== 'free') f.push(`${id} is not free`); });
    Object.keys(SPEC.tables).forEach((id) => { const s = M.status(id), t = need(M.table(id), 'table ' + id); if (s.s !== SPEC.tables[id][0] || M.amount(t.lines) !== SPEC.tables[id][1]) f.push(`${id}: ${s.s} ${M.amount(t.lines)}, spec ${SPEC.tables[id]}`); });
    if (Object.keys(M.plan).length !== 16) f.push(`${Object.keys(M.plan).length} tables on the plan, spec 16`);
    return f.join('; ');
  }],
  ['S4 · Kitchen counts', (FX, M) => {
    const f = [], a = M.active;
    const st = (s) => a.filter((t) => t.lines.some((l) => M.station[M.dish(l[0])] === s)).length;
    const got = { all: a.length, new: a.filter((t) => t.lane === 'new').length, preparing: a.filter((t) => t.lane === 'preparing').length, hot: st('hot'), cold: st('cold'), pastry: st('pastry'), drinks: st('drinks') };
    Object.keys(got).forEach((k) => { if (got[k] !== SPEC.kds[k]) f.push(`${k}: ${got[k]}, spec ${SPEC.kds[k]}`); });
    const late = a.filter((t) => M.state(t) === 'late').map((t) => t.n), warn = a.filter((t) => M.state(t) === 'warning').map((t) => t.n);
    if (String(late) !== String(SPEC.kds.late)) f.push(`late ${late}`);
    if (String(warn) !== String(SPEC.kds.warning)) f.push(`warning ${warn}`);
    if (FX.tickets.length !== 11) f.push(`${FX.tickets.length} tickets, spec 11`);
    return f.join('; ');
  }],
  ['S8 · Returning and segments', (FX, M) => {
    const f = [], seg = { Regular: 0, New: 0, Inactive: 0 };
    FX.customers.forEach((c) => {
      const s = M.segment(c), want = SPEC.customers[c.name];
      seg[s]++;
      const life = c.visits.reduce((a, v) => a + v[1], 0);
      if (!want || c.visits.length !== want[0] || life !== want[1] || s !== want[2]) f.push(`${c.name}: ${c.visits.length} visits, ${life}, ${s}`);
    });
    if (JSON.stringify(seg) !== JSON.stringify(SPEC.segments)) f.push('segments ' + JSON.stringify(seg));
    const ret = FX.customers.filter((c) => c.visits.some((v) => v[0] === FX.date) && c.visits.length >= 2).length;
    if (ret !== SPEC.returning) f.push(`returning ${ret}`);
    if (FX.customers.length !== SPEC.known) f.push(`${FX.customers.length} customers`);
    if (FX.customers.filter((c) => c.phone).length !== SPEC.reachable) f.push('reachable customers');
    return f.join('; ');
  }],
  ['S11 · The close', (FX, M) => {
    const c = M.close(), s = SPEC.close, f = [];
    ['orders', 'total', 'card', 'cash', 'cashRefunds', 'tips', 'expected', 'counted', 'difference'].forEach((k) => { if (c[k] !== s[k]) f.push(`${k}: ${c[k]}, spec ${s[k]}`); });
    if (round2(c.expected - c.cashRefunds) === s.doubleRefund && c.expected === s.doubleRefund) f.push('refunds subtracted twice');
    if (FX.drawnElsewhere.close.z !== s.z || FX.drawnElsewhere.close.at !== s.at) f.push('Z number or time');
    return f.join('; ');
  }],
  ['S16 · Bell, actions, takeaway badge', (FX, M) => {
    const f = [];
    const unread = FX.notifications.filter((n) => n.unread).length, pend = FX.aiActions.filter((a) => a.status === 'pending').length;
    const take = FX.onlineOrders.filter((o) => o.status === 'pending' && mins(o.placed) <= M.now).length;
    if (unread !== SPEC.unread) f.push(`unread ${unread}`);
    if (pend !== SPEC.pending) f.push(`pending actions ${pend}`);
    if (take !== SPEC.takeawayBadge) f.push(`takeaway badge ${take}`);
    return f.join('; ');
  }],
  ['S18 · Daily goal', (FX, M) => {
    const share = Math.round(M.rev / FX.goal * 1000) / 10;
    return FX.goal === SPEC.goal && share === SPEC.goalShare && Math.round(share) === SPEC.goalPct ? '' : `goal ${FX.goal}, share ${share}`;
  }],
];

/* ── 2 · AGREE: the sources against one another ──────────────────────────── */
const CHECKS = [
  ['A1 · Tallies, day and yesterday', (FX, M) => {
    const f = [], T = FX.tallies, Y = FX.yesterday;
    M.now; // a valid clock
    ['card', 'cash'].forEach((m) => {
      if (!(T[m].refunds <= T[m].gross && T[m].orders >= 0)) f.push(m + ' refunds exceed gross');
      const logged = FX.orders.filter((o) => !o.refund && o.method.toLowerCase() === m);
      if (logged.length > T[m].orders) f.push(`${logged.length} logged ${m} orders, ${T[m].orders} tallied`);
      if (logged.reduce((a, o) => a + M.amount(o.lines), 0) > T[m].gross) f.push(`logged ${m} sales exceed the tally`);
      const refunded = -FX.orders.filter((o) => o.refund && o.method.toLowerCase() === m).reduce((a, o) => a + M.amount(o.lines), 0);
      if (refunded !== T[m].refunds) f.push(`${m} refunds ${T[m].refunds} against ${refunded} in the log`);
    });
    if (Y.card > Y.revenue) f.push('yesterday card exceeds yesterday revenue');
    if (Y.dayTotal < Y.revenue) f.push('yesterday\'s whole day is smaller than yesterday at the clock');
    if (!(Y.orders > 0 && Y.revenue > 0)) f.push('yesterday is empty');
    return f.join('; ');
  }],
  ['A2 · Latest orders', (FX, M) => {
    const f = [];
    const nums = FX.orders.filter((o) => !o.refund).map((o) => o.n);
    FX.orders.forEach((o, i) => {
      const where = o.refund ? 'refund of #' + o.n : '#' + o.n;
      M.amount(o.lines);
      need(FX.staff[o.staff], 'staff ' + o.staff + ' of ' + where);
      if (o.table !== 'Takeaway') need(M.plan[o.table] ? o.table : null, 'table ' + o.table + ' of ' + where + ' on the plan');
      if (mins(o.time) > M.now) f.push(where + ' is after the clock');
      if (i && mins(o.time) > mins(FX.orders[i - 1].time)) f.push(where + ' is newer than the row above it');
      if (o.refund) {
        const orig = need(M.order(o.n), 'order #' + o.n + ' that ' + where + ' refunds');
        if (orig.table !== o.table) f.push(where + ' names another table than the order');
        if (-M.amount(o.lines) > M.amount(orig.lines)) f.push(where + ' refunds more than the order');
        if (mins(o.time) < mins(orig.time)) f.push(where + ' is before the order');
        o.lines.forEach((l) => { const src = orig.lines.filter((x) => x[0] === l[0])[0]; if (!src || -l[1] > src[1]) f.push(where + ' refunds a line the order does not hold'); });
      }
    });
    if (new Set(nums).size !== nums.length) f.push('an order number appears twice');
    Object.keys(M.plan).forEach((id) => {
      const s = M.status(id);
      if (s.s === 'paid' && bag(s.by.lines) !== bag(s.t.lines)) f.push(`the order that settles ${id} (#${s.by.n}) does not hold the table's lines`);
      if (s.s === 'paid' && mins(s.by.time) > M.now) f.push(`${id} is settled after the clock`);
    });
    FX.tables.forEach((t) => { if (M.plan[t.id] !== t.zone) f.push(`${t.id} says ${t.zone}, the plan says ${M.plan[t.id]}`); });
    return f.join('; ');
  }],
  ['A3 · Elapsed time', (FX, M) => {
    const f = [];
    FX.tables.forEach((t) => {
      need(FX.staff[t.staff], 'staff ' + t.staff + ' of ' + t.id);
      if (mins(t.opened) > M.now) f.push(t.id + ' opened after the clock');
      t.lines.forEach((l) => { if (l[2] && (mins(l[2]) < mins(t.opened) || mins(l[2]) > M.now)) f.push(`${t.id} sends ${l[0]} outside its opening`); });
      if (t.billAsked && (mins(t.billAsked) < mins(t.opened) || mins(t.billAsked) > M.now)) f.push(t.id + ' asked for the bill outside its opening');
      const s = M.status(t.id);
      if (s.s === 'paid' && mins(s.by.time) < mins(t.opened)) f.push(t.id + ' is paid before it opened');
    });
    need(M.table(FX.till.billTable), 'the bill\'s table ' + FX.till.billTable);
    return f.join('; ');
  }],
  ['A4 · Kitchen tickets', (FX, M) => {
    const f = [], nums = FX.tickets.map((t) => t.n);
    if (new Set(nums).size !== nums.length) f.push('a ticket number appears twice');
    FX.tickets.forEach((t) => {
      t.lines.forEach((l) => M.dish(l[0]));
      if (mins(t.sent) > M.now) f.push(`ticket ${t.n} is sent after the clock`);
      if (t.table) {
        const tb = need(M.table(t.table), `table ${t.table} of ticket ${t.n}`);
        const sent = tb.lines.filter((l) => l[2] === t.sent);
        if (!sent.length || bag(sent) !== bag(t.lines)) f.push(`ticket ${t.n} lines differ from ${t.table}'s lines sent at ${t.sent}`);
      } else if (t.order) {
        const o = need(M.order(t.order), `order #${t.order} of ticket ${t.n}`);
        if (bag(o.lines) !== bag(t.lines)) f.push(`ticket ${t.n} lines differ from order #${t.order}`);
        if (mins(t.sent) > mins(o.time)) f.push(`ticket ${t.n} is sent after its order was paid`);
      } else if (t.pending) {
        const p = need(FX.pending.filter((x) => x.id === t.pending)[0], `open order ${t.pending} of ticket ${t.n}`);
        if (bag(p.lines) !== bag(t.lines)) f.push(`ticket ${t.n} lines differ from open order ${p.id}`);
        if (p.source !== t.source) f.push(`ticket ${t.n} source differs from open order ${p.id}`);
        if (mins(p.placed) > mins(t.sent)) f.push(`open order ${p.id} is placed after ticket ${t.n} is sent`);
      } else f.push(`ticket ${t.n} has no source`);
    });
    FX.pending.forEach((p) => { if (FX.tickets.filter((t) => t.pending === p.id).length !== 1) f.push(`open order ${p.id} has ${FX.tickets.filter((t) => t.pending === p.id).length} tickets`); if (p.staff) need(FX.staff[p.staff], 'staff ' + p.staff + ' of ' + p.id); });
    return f.join('; ');
  }],
  ['A5 · Kitchen counts', (FX, M) => {
    const k = FX.drawnElsewhere.kds, f = [], a = M.active;
    const st = (s) => a.filter((t) => t.lines.some((l) => M.station[M.dish(l[0])] === s)).length;
    const want = { all: a.length, new: a.filter((t) => t.lane === 'new').length, preparing: a.filter((t) => t.lane === 'preparing').length, hot: st('hot'), cold: st('cold'), pastry: st('pastry'), drinks: st('drinks') };
    Object.keys(want).forEach((n) => { if (k[n] !== want[n]) f.push(`${n}: drawn ${k[n]}, counted ${want[n]}`); });
    a.forEach((t) => {
      const age = M.age(t), text = age < 1 ? 'Just now' : age + '\u00a0min';   // U+00A0 between a number and its unit (§6.3)
      if (k.ages[t.n] !== text) f.push(`ticket ${t.n} age: drawn ${k.ages[t.n]}, derived ${text}`);
      if ((k.states[t.n] || '') !== M.state(t)) f.push(`ticket ${t.n} state: drawn ${k.states[t.n] || 'none'}, derived ${M.state(t) || 'none'}`);
    });
    Object.keys(k.ages).forEach((n) => { if (!a.some((t) => String(t.n) === n)) f.push(`an age is drawn for ticket ${n}, which is not active`); });
    return f.join('; ');
  }],
  ['A7 · Menu', (FX, M) => {
    const f = [];
    FX.tables.forEach((t) => t.lines.forEach((l) => { M.dish(l[0]); if (!(Number.isInteger(l[1]) && l[1] > 0)) f.push(`${t.id} ${l[0]} quantity`); }));
    FX.orders.forEach((o) => o.lines.forEach((l) => { M.dish(l[0]); if (!Number.isInteger(l[1]) || !l[1]) f.push(`#${o.n} ${l[0]} quantity`); }));
    FX.menu.forEach((c) => c.items.forEach((it) => { if (!(it[1] > 0) || !['hot', 'cold', 'pastry', 'drinks'].includes(it[2])) f.push(it[0] + ' price or station'); }));
    return f.join('; ');
  }],
  ['A9 · Customers', (FX, M) => {
    const f = [], names = FX.customers.map((c) => c.name);
    if (new Set(names).size !== names.length) f.push('a customer appears twice');
    FX.customers.forEach((c) => {
      const ds = c.visits.map((v) => v[0]);
      if (!ds.length) f.push(c.name + ' has no visit');
      ds.forEach((d, i) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || days(FX.date, d) < 0) f.push(`${c.name}: visit ${d} is not a past date`); if (i && ds[i] < ds[i - 1]) f.push(c.name + ' visits are out of order'); });
      c.visits.forEach((v) => { if (!(v[1] > 0)) f.push(c.name + ' has a visit without an amount'); });
      const s = M.segment(c);
      if (!['New', 'Inactive', 'Regular'].includes(s)) f.push(c.name + ' has no segment');
    });
    const sum = FX.customers.reduce((a, c) => a + 1, 0), segs = { New: 0, Inactive: 0, Regular: 0 };
    FX.customers.forEach((c) => { segs[M.segment(c)]++; });
    if (segs.New + segs.Inactive + segs.Regular !== sum) f.push('the segments do not partition the customers');
    return f.join('; ');
  }],
  ['A10 · Bill', (FX, M) => {
    const t = need(M.table(FX.till.billTable), 'the bill\'s table'), f = [];
    const unsent = t.lines.filter((l) => !l[2]), sent = t.lines.filter((l) => l[2]);
    const total = M.amount(t.lines);
    if (total !== M.amount(unsent) + M.amount(sent)) f.push('the bill\'s groups do not sum to its total');
    const times = [...new Set(sent.map((l) => l[2]))];
    if (times.some((x, i) => i && x < times[i - 1])) f.push('sends are not in time order');
    t.lines.forEach((l, i) => { if (l[2] && i && !t.lines[i - 1][2] && t.lines[i - 1] !== undefined) { /* unsent lines come first on the bill when drawn; the record keeps them in entry order */ } });
    return f.join('; ');
  }],
  ['A11 · Close', (FX, M) => {
    const c = M.close(), d = FX.drawnElsewhere.close, f = [];
    ['orders', 'total', 'card', 'cash', 'cashRefunds', 'tips', 'expected', 'counted', 'difference'].forEach((k) => { if (d[k] !== c[k]) f.push(`${k}: drawn ${d[k]}, derived ${c[k]}`); });
    ['card', 'cash'].forEach((m) => {
      const day = FX.tallies[m], cl = FX.close.tallies[m];
      if (cl.orders < day.orders || cl.gross < day.gross || cl.refunds < day.refunds) f.push(`the close's ${m} tally is below the day so far`);
    });
    if (Math.abs(c.difference) > FX.close.tolerance) f.push('the difference is outside the tolerance');
    const lastZ = need(FX.notifications.filter((n) => n.kind === 'close')[0], 'last night\'s Z');
    if (Number(d.z) !== Number(lastZ.z) + 1) f.push(`Z ${d.z} does not follow ${lastZ.z}`);
    if (mins(d.at) <= M.now) f.push('the close is before the clock');
    need(FX.staff[d.by], 'staff ' + d.by + ' of the close');
    return f.join('; ');
  }],
  ['A12 · Rail and hours', (FX, M) => {
    const f = [];
    need(FX.staff[FX.till.cashier], 'the till\'s cashier ' + FX.till.cashier);
    if (FX.staff[FX.till.cashier].role !== 'cashier') f.push('the till is signed in as a waiter');
    FX.orders.forEach((o, i) => { if (i && Math.floor(mins(o.time) / 60) > Math.floor(mins(FX.orders[i - 1].time) / 60)) f.push('hours go back up the log'); });
    return f.join('; ');
  }],
  ['A16 · Bell and actions', (FX, M) => {
    const f = [];
    FX.notifications.forEach((n) => { if (n.kind === 'late') need(FX.tickets.filter((t) => t.n === n.ticket)[0], 'ticket ' + n.ticket + ' of the late notice'); if (n.table) need(M.plan[n.table] ? n.table : null, 'table ' + n.table + ' of a notice'); });
    FX.notifications.filter((n) => n.kind === 'late').forEach((n) => { if (M.state(FX.tickets.filter((t) => t.n === n.ticket)[0]) !== 'late') f.push(`ticket ${n.ticket} is not late`); });
    FX.notifications.filter((n) => n.kind === 'bill').forEach((n) => { if (M.status(n.table).s !== 'bill') f.push(`${n.table} has not asked for the bill`); });
    FX.onlineOrders.forEach((o) => { if (!['pending', 'accepted', 'rejected'].includes(o.status)) f.push('online order status'); });
    FX.aiActions.forEach((a) => { if (!['pending', 'approved', 'rejected'].includes(a.status)) f.push('action status'); });
    return f.join('; ');
  }],
  ['A17 · Names', (FX, M) => {
    const f = [];
    if (!FX.venue || !FX.aiShop.venue || FX.venue === FX.aiShop.venue) f.push('the two venues need two names');
    FX.customers.forEach((c) => { const p = c.name.split(' '); if (c.ini !== (p[0][0] + p[p.length - 1][0]).toUpperCase()) f.push(`${c.name}: initials ${c.ini}`); });
    Object.keys(FX.staff).forEach((k) => { const s = FX.staff[k]; if (s.name.split(' ')[0] !== s.short) f.push(`${k}: short name ${s.short}`); });
    return f.join('; ');
  }],
  ['A18 · Daily goal', (FX, M) => {
    if (!(Number.isInteger(FX.goal) && FX.goal > 0)) return 'the goal is not a positive whole number';
    return M.rev / FX.goal > 0 ? '' : 'no share';
  }],
  ['A20 · Trade and shop', (FX, M) => {
    const f = [], trades = ['restaurant', 'boutique', 'spa', 'hotel'];
    if (!trades.includes(FX.trade) || !trades.includes(FX.aiShop.trade)) f.push('a trade the suggestions do not know');
    if (typeof FX.costsSet !== 'boolean' || typeof FX.aiShop.costsSet !== 'boolean') f.push('costsSet is not a flag');
    if (!(FX.aiShop.salesToday >= 0 && FX.aiShop.pendingActions >= 0)) f.push('the shop\'s counts');
    return f.join('; ');
  }],
];
const BY_NAME = {};
SPEC_CHECKS.concat(CHECKS).forEach((c) => { BY_NAME[c[0].split(' ')[0]] = c; });

function run(FX, only) {
  let M;
  try { M = model(FX); } catch (e) { return (only || Object.keys(BY_NAME)).map((id) => ({ id, ok: false, why: e.message })); }
  return (only || Object.keys(BY_NAME)).map((id) => {
    const c = BY_NAME[id];
    try { const why = c[1](FX, M); return { id, ok: !why, why }; } catch (e) { return { id, ok: false, why: e.message }; }
  });
}

section('1 · SPEC: the numbers §18.0 prints');
{
  const res = run(FX0, SPEC_CHECKS.map((c) => c[0].split(' ')[0]));
  res.forEach((r) => { assert.ok(r.ok, `${BY_NAME[r.id][0]}: ${r.why}`); tick(); done(BY_NAME[r.id][0]); });
}

section('2 · AGREE: the sources against one another');
{
  const res = run(FX0, CHECKS.map((c) => c[0].split(' ')[0]));
  res.forEach((r) => { assert.ok(r.ok, `${BY_NAME[r.id][0]}: ${r.why}`); tick(); done(BY_NAME[r.id][0]); });
}

/* ── 3 · MUTATE ──────────────────────────────────────────────────────────── */
const row = (FX, id) => FX.orders.filter((o) => o.n === id && !o.refund)[0];
const tab = (FX, id) => FX.tables.filter((t) => t.id === id)[0];
const tk = (FX, n) => FX.tickets.filter((t) => t.n === n)[0];
const cu = (FX, name) => FX.customers.filter((c) => c.name === name)[0];
const dish = (FX, name) => { let hit; FX.menu.forEach((c) => c.items.forEach((it) => { if (it[0] === name) hit = it; })); return hit; };

const MUT = [
  ['L1', 'T2 gains a line the order never held', ['A2', 'A4'], (F) => tab(F, 'T2').lines.push(['Café noir', 1, '17:10'])],
  ['L2', '#1208 loses a line', ['A2'], (F) => row(F, 1208).lines.pop()],
  ['L3', '#1206 is on a table that does not exist', ['A2'], (F) => { row(F, 1206).table = 'T99'; }],
  ['L4', '#1207 is rung after the clock', ['A2'], (F) => { row(F, 1207).time = '17:50'; }],
  ['L5', 'two rows of the log swap', ['A2'], (F) => { const a = F.orders.indexOf(row(F, 1206)), b = F.orders.indexOf(row(F, 1205)); [F.orders[a], F.orders[b]] = [F.orders[b], F.orders[a]]; }],
  ['L6', 'the refund of #1201 names Table 8', ['A2'], (F) => { F.orders.filter((o) => o.refund)[0].table = 'T8'; }],
  ['L7', 'the refund is larger than the order', ['A2'], (F) => { F.orders.filter((o) => o.refund)[0].lines = [['Salade marocaine', -1], ['Zaalouk', -1], ['Cornes de gazelle', -1], ['Thé à la menthe', -2]]; }],
  ['L8', 'the refund is rung before the order', ['A2'], (F) => { F.orders.filter((o) => o.refund)[0].time = '17:05'; }],
  ['L9', 'T22 leaves the plan', ['A2', 'A4', 'S3'], (F) => { F.plan.terrace = F.plan.terrace.filter((id) => id !== 'T22'); }],
  ['L10', 'T22 says it is in the dining room', ['A2'], (F) => { tab(F, 'T22').zone = 'dining'; }],
  ['L11', 'the clock goes back to 17:00', ['A2', 'A3', 'A4'], (F) => { F.now = '17:00'; }],
  ['L12', 'an order number appears twice', ['A2'], (F) => { row(F, 1204).n = 1205; }],
  ['L13', 'the order that settles T2 holds another dish', ['A2'], (F) => { row(F, 1208).lines[0][0] = 'Tajine de poisson'; }],
  ['L14', 'T4 opened after its first send', ['A3'], (F) => { tab(F, 'T4').opened = '17:30'; }],
  ['L15', 'T9 asked for the bill before it opened', ['A3'], (F) => { tab(F, 'T9').billAsked = '16:30'; }],
  ['L16', 'T12 opens after the clock', ['A3'], (F) => { tab(F, 'T12').opened = '17:50'; }],
  ['L17', 'the bill is on a table that does not exist', ['A3', 'A10'], (F) => { F.till.billTable = 'T99'; }],
  ['L18', 'ticket 44 holds a dish T4 never sent', ['A4'], (F) => tk(F, 44).lines.push(['Zaalouk', 1])],
  ['L19', 'ticket 42 is sent a minute before T22 sent it', ['A4'], (F) => { tk(F, 42).sent = '17:20'; }],
  ['L20', 'ticket 41 points at another order', ['A4'], (F) => { tk(F, 41).order = 1206; }],
  ['L21', 'ticket 43\'s open order holds other lines', ['A4'], (F) => { F.pending.filter((p) => p.id === 'G3412')[0].lines = [['Harira', 1]]; }],
  ['L22', 'open order A2 is placed after its ticket', ['A4'], (F) => { F.pending.filter((p) => p.id === 'A2')[0].placed = '17:42'; }],
  ['L23', 'a ticket names a table that does not exist', ['A4'], (F) => { tk(F, 45).table = 'T99'; }],
  ['L24', 'an open order has no ticket', ['A4'], (F) => { F.pending.push({ id: 'G9999', source: 'Glovo 9999', placed: '17:30', lines: [['Harira', 1]] }); }],
  ['L25', 'the late threshold moves to 18 minutes', ['A5', 'S4'], (F) => { F.kitchen.lateMin = 19; }],
  ['L26', 'Hot is drawn as 6', ['A5'], (F) => { F.drawnElsewhere.kds.hot = 6; }],
  ['L27', 'ticket 42\'s age is drawn as 17 minutes', ['A5'], (F) => { F.drawnElsewhere.kds.ages['42'] = '17\u00a0min'; }],
  ['L27b', 'ticket 42\'s age uses an ordinary space', ['A5'], (F) => { F.drawnElsewhere.kds.ages['42'] = '18 min'; }],
  ['L28', 'New is drawn as 4', ['A5'], (F) => { F.drawnElsewhere.kds.new = 4; }],
  ['L29', 'ticket 44 is drawn as late', ['A5'], (F) => { F.drawnElsewhere.kds.states['44'] = 'late'; }],
  ['L30', 'a dish leaves the menu', ['A7', 'A2', 'A4'], (F) => { F.menu.forEach((c) => { c.items = c.items.filter((it) => it[0] !== 'Café noir'); }); }],
  ['L31', 'a bill line has a misspelt dish', ['A7', 'A2'], (F) => { tab(F, 'T4').lines[0][0] = 'Harrira'; }],
  ['L32', 'a bill line has no quantity', ['A7'], (F) => { tab(F, 'T4').lines[0][1] = 0; }],
  ['L33', 'a dish is on the menu twice', ['A7'], (F) => { F.menu[5].items.push(['Harira', 35, 'hot']); }],
  ['L34', 'a visit is dated tomorrow', ['A9'], (F) => { cu(F, 'Leila Fassi').visits.push(['2026-10-13', 100]); }],
  ['L35', 'a customer\'s visits are out of order', ['A9'], (F) => { const v = cu(F, 'Hind Berrada').visits; [v[0], v[1]] = [v[1], v[0]]; }],
  ['L36', 'a customer appears twice', ['A9'], (F) => { F.customers.push(copy(cu(F, 'Omar Benjelloun'))); }],
  ['L37', 'Leila\'s second visit is deleted', ['S8'], (F) => { cu(F, 'Leila Fassi').visits.splice(0, 1); }],
  ['L38', 'Sanae\'s last visit moves to 13 August, 60 days back', ['S8'], (F) => { const v = cu(F, 'Sanae Idrissi').visits; v[v.length - 1][0] = '2026-08-13'; }],
  ['L39', 'Mehdi\'s visit moves to 5 September', ['S8'], (F) => { cu(F, 'Mehdi Chraibi').visits[0][0] = '2026-09-05'; }],
  ['L40', 'an amount in Youssef\'s visits changes', ['S8'], (F) => { cu(F, 'Youssef Alaoui').visits[3][1] += 1; }],
  ['L41', 'Salma\'s initials are drawn SX', ['A17'], (F) => { cu(F, 'Salma Bennani').ini = 'SX'; }],
  ['L42', 'both venues share a name', ['A17'], (F) => { F.aiShop.venue = F.venue; }],
  ['L43', 'the cashier is not on the staff list', ['A12'], (F) => { F.till.cashier = 'XX'; }],
  ['L44', 'an order is rung by someone not on the staff list', ['A2'], (F) => { row(F, 1204).staff = 'ZZ'; }],
  ['L45', 'the till is signed in as a waiter', ['A12'], (F) => { F.till.cashier = 'KA'; }],
  ['L46', 'a notice is marked read', ['S16'], (F) => { F.notifications[0].unread = false; }],
  ['L47', 'a pending action is approved', ['S16'], (F) => { F.aiActions[0].status = 'approved'; }],
  ['L48', 'the takeaway order is placed after the clock', ['S16'], (F) => { F.onlineOrders[0].placed = '17:45'; }],
  ['L49', 'the late notice names a ticket that is not late', ['A16'], (F) => { F.notifications[0].ticket = 45; }],
  ['L50', 'the bill notice names a table that has not asked', ['A16'], (F) => { F.notifications[1].table = 'T4'; }],
  ['L51', 'tips on cash change by 10', ['A11', 'S11'], (F) => { F.close.tallies.cash.tips += 10; }],
  ['L52', 'the Z subtracts the cash refund twice', ['A11'], (F) => { F.drawnElsewhere.close.expected = 8800; }],
  ['L53', 'a denomination is one note short', ['A11'], (F) => { F.close.denominations[2][1] -= 1; }],
  ['L54', 'one cash movement out is 50 smaller', ['A11'], (F) => { F.close.moves[3][1] = 200; }],
  ['L55', 'the opening float is 450', ['A11', 'S11'], (F) => { F.close.float = 450; }],
  ['L56', 'last night\'s Z is 0144', ['A11'], (F) => { F.notifications.filter((n) => n.kind === 'close')[0].z = '0144'; }],
  ['L57', 'the close\'s cash refund is 0 and the drawn one 120', ['A11'], (F) => { F.close.tallies.cash.refunds = 0; }],
  ['L58', 'the close\'s card tally falls below the day so far', ['A11'], (F) => { F.close.tallies.card.orders = 50; }],
  ['L59', 'the difference leaves the tolerance', ['A11'], (F) => { F.close.denominations[0][1] = 29; }],
  ['L60', 'the card refund tally is 40', ['A1', 'S1'], (F) => { F.tallies.card.refunds = 40; }],
  ['L61', 'the card order tally falls below the log', ['A1'], (F) => { F.tallies.card.orders = 5; }],
  ['L62', 'yesterday\'s card exceeds its revenue', ['A1'], (F) => { F.yesterday.card = 25000; }],
  ['L63', 'yesterday\'s whole day is smaller than at the clock', ['A1'], (F) => { F.yesterday.dayTotal = 15000; }],
  ['L64', 'the date is not a date', ['A1', 'S1'], (F) => { F.date = '2026-13-45'; }],
  ['L65', 'the goal is zero', ['A18', 'S18'], (F) => { F.goal = 0; }],
  ['L66', 'the goal is 25,000', ['S18'], (F) => { F.goal = 25000; }],
  ['L67', 'the shop\'s trade is unknown', ['A20'], (F) => { F.aiShop.trade = 'florist'; }],
  ['L68', 'costsSet is a string', ['A20'], (F) => { F.costsSet = 'true'; }],
  ['L69', 'a cash tally gains one order', ['S1'], (F) => { F.tallies.cash.orders += 1; }],
  ['L70', 'yesterday\'s revenue is 20,302', ['S1'], (F) => { F.yesterday.revenue = 20302; }],
  ['L71', 'a price changes by one dirham', ['S2', 'S3'], (F) => { dish(F, 'Harira')[1] = 36; }],
  ['L72', 'T12 gains a dish', ['S3'], (F) => { tab(F, 'T12').lines.push(['Baghrir', 1, '17:38']); }],
  ['L73', 'a bill line loses its send time', ['S3'], (F) => { tab(F, 'T22').lines[1][2] = null; }],
  ['L74', 'T9 stops asking for the bill', ['S3'], (F) => { delete tab(F, 'T9').billAsked; }],
  ['L75', 'a sixth table is opened', ['S3'], (F) => { F.tables.push({ id: 'T5', zone: 'dining', guests: 2, opened: '17:20', staff: 'KA', lines: [] }); }],
  ['L76', 'a ticket is dropped', ['S4', 'A4'], (F) => { F.tickets = F.tickets.filter((t) => t.n !== 46); }],
  ['L77', 'ticket 49 moves to Preparing', ['S4', 'A5'], (F) => { tk(F, 49).lane = 'preparing'; }],
  ['L78', 'ticket 45 is sent at 17:20', ['S4', 'A4'], (F) => { tk(F, 45).sent = '17:20'; }],
  ['L79', 'a customer loses a phone', ['S8'], (F) => { cu(F, 'Youssef Alaoui').phone = false; }],
  ['L81', 'the close tallies and the Z are both moved by 10, so they still agree', ['S11'], (F) => { F.close.tallies.card.gross += 10; F.drawnElsewhere.close.total += 10; F.drawnElsewhere.close.card += 10; }],
  ['L80', 'a ninth customer', ['S8'], (F) => { F.customers.push({ name: 'Test Client', ini: 'TC', city: 'Rabat', phone: true, visits: [['2026-10-12', 50]] }); }],
];

section('3 · MUTATE: each row breaks one source and its check must go red');
{
  const base = run(FX0);
  base.forEach((r) => assert.ok(r.ok, `unmutated ${r.id}: ${r.why}`));
  let caught = 0, n = 0;
  const unnamed = new Set(MUT.flatMap((m) => m[2]));
  Object.keys(BY_NAME).forEach((id) => assert.ok(unnamed.has(id), `no mutation row targets ${id}`));
  for (const [id, desc, targets, fn] of MUT) {
    const F = copy(FX0); fn(F);
    assert.notDeepEqual(F, FX0, `${id} changed nothing`);
    const res = run(F, targets);
    const red = res.filter((r) => !r.ok);
    assert.ok(red.length > 0, `${id} (${desc}) left ${targets.join(', ')} green`);
    n++; caught++; tick();
    /* every named check must go red for a reason, not by throwing on its own mistake */
    red.forEach((r) => assert.ok(r.why && r.why.length > 0, `${id}: ${r.id} gave no reason`));
  }
  assert.equal(caught, n);
  done(`${caught} of ${n} mutations turn their check red; every check is the target of at least one row`);
  /* A check that compared a value with itself would stay green under every row. Prove the table would
     catch one: the drawn expected cash checked against the drawn expected cash. */
  const selfCompare = (FX) => (FX.drawnElsewhere.close.expected === FX.drawnElsewhere.close.expected ? '' : 'never');
  const stillGreen = MUT.filter((m) => m[2].includes('A11')).filter((m) => { const F = copy(FX0); m[3](F); return selfCompare(F) === ''; }).length;
  assert.ok(stillGreen > 0, 'a self-comparing close check stays green under the rows aimed at it, so the table would reject it'); tick();
  done(`a close check that compared a value with itself would stay green under ${stillGreen} rows and be rejected; none of ours does`);
}

/* The preview carries the same fixture: byte for byte. */
section('The preview\'s embedded fixture is this file');
{
  const html = fs.readFileSync(PREVIEW, 'utf8');
  const m = html.match(/<script type="application\/json" id="fixture">\n([\s\S]*?)<\/script>/);
  assert.ok(m, 'the preview embeds a fixture'); tick();
  assert.equal(m[1].replace(/\s+$/, ''), fs.readFileSync(FIXTURE, 'utf8').replace(/\s+$/, ''), 'tools/fixtures/worked-example.json is the preview\'s fixture, byte for byte'); tick();
  assert.deepStrictEqual(JSON.parse(m[1]), FX0); tick();
  done('identical to the fixture in docs/specs/kiwi-design-2027-preview.html');
}

/* ── 4 · PREVIEW: the checks that read frames ─────────────────────────────── */
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable : the preview leg (checks 13 to 15, 19) was not executed'); console.log(`\n${checks} checks passed.`); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable : the preview leg (checks 13 to 15, 19) was not executed'); console.log(`\n${checks} checks passed.`); process.exit(process.env.CI ? 1 : 0); }
const { suite } = await import('./browser-trace.mjs');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('fixture-agreement', { browser });
section('4 · PREVIEW: every check on every frame, and its own mutation table');
try {
  await S.run('the preview checks its frames against this fixture', async (t) => {
    const page = t.watch(await browser.newPage());
    t.defer(() => page.close());
    t.step('open the preview');
    await page.goto(`${base}/docs/specs/kiwi-design-2027-preview.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__kiwiPreview, { timeout: 60000 });
    t.step('wait for the mutation self-test to finish');
    await page.waitForFunction(() => /Mutation self-test: \d+ of \d+/.test((document.getElementById('mutations') || {}).textContent || ''), { timeout: 120000 });
    const r = await page.evaluate(() => {
      const P = window.__kiwiPreview, live = P.checks.filter((c) => !c.retired);
      return {
        total: live.length, red: live.filter((c) => !c.ok).map((c) => c.name + ': ' + c.why),
        mutTotal: P.mutations.length, mutRed: P.mutations.filter((m) => !m.ok).map((m) => m.m[0] + ': ' + m.why),
        retired: P.retiredMutations.length,
        fixture: JSON.parse(document.getElementById('fixture').textContent),
        banner: document.getElementById('mutations').textContent.slice(0, 80),
      };
    });
    assert.deepStrictEqual(r.red, [], 'a check on the preview\'s frames is red');
    assert.ok(r.total >= 19, `${r.total} checks ran, at least 19 expected`);
    assert.deepStrictEqual(r.mutRed, [], 'a mutation left its check green');
    assert.ok(r.mutTotal >= 186, `${r.mutTotal} mutation rows`);
    assert.deepStrictEqual(r.fixture, FX0, 'the page ran on this fixture');
    checks += 4;
    console.log(`  ✓ ${r.total} checks green on the frames; ${r.mutTotal} of ${r.mutTotal} mutations caught (${r.retired} retired rows listed); ${r.banner.replace(/\s+/g, ' ')}`);
  });
} finally {
  server.close();
}
console.log(`\n${checks} checks passed.`);
await S.finish();
