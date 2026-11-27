/* L'import de l'historique (Jon's Burgers, 27 nov. 2026) : tickets un par un
 * (/api/past-sales, kind 'tickets') et services + entrées / sorties de caisse
 * (/api/past-cash). Vraies routes, vrai code d'authentification, vrai
 * schema.sql dans node:sqlite. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as salesGet, onRequestPost as salesPost, wallEpoch } from '../functions/api/past-sales.js';
import { onRequestGet as cashGet, onRequestPost as cashPost } from '../functions/api/past-cash.js';
import { onRequestPost as cashSessionsPost } from '../functions/api/cash-sessions.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import * as auth from '../functions/auth/_lib.js';
import { businessDate, addBusinessDays, DEFAULT_ZONE } from '../functions/api/_business-day.js';

let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('  ok ' + checks + ' - ' + name); }

function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => { const r = db.prepare(sql).all(...args)[0]; return r ? (col ? r[col] : r) : null; },
  });
  return {
    prepare: (sql) => {
      const params = (sql.match(/\?/g) || []).length;
      assert.ok(params <= 100, 'D1 binds at most 100 values per query, this one has ' + params);
      return wrap(sql);
    },
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const SECRET = 'history-import-test-secret-32-b!!';
const M = 'jon-history-test';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
db.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES ('acc-jon', 'jon@example.test', 'Jon', 'x', 'x', 0, 'active', 0)").run();
db.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES ('acc-x', 'x@example.test', 'X', 'x', 'x', 0, 'active', 0)").run();
db.prepare("INSERT INTO merchant_config (merchant, features, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'restaurant', 'acc-jon', 'Jon', 'active', 0)").run(M);
db.prepare("INSERT INTO merchant_config (merchant, features, type, account_id, name, status, updated_ts) VALUES ('x-resto', '{}', 'restaurant', 'acc-x', 'X', 'active', 0)").run();
const env = { DB: d1(db), AUTH_SECRET: SECRET };

const today = businessDate(Date.now());
const day = (n) => addBusinessDays(today, n);
/* Le premier ticket de caisse sur Kiwi : il y a 3 jours, à 13 h. */
db.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ts, written_by) VALUES ('till-1', ?, 40, 4000, 'cash', 'Table 1', ?, 'till:abc')")
  .run(M, wallEpoch(day(-3) + ' 13:00', DEFAULT_ZONE));

const owner = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-jon', SECRET)}`;
const stranger = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-x', SECRET)}`;
const req = (url, cookie, body) => new Request('https://kiwi.test' + url, body
  ? { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  : { headers: { Cookie: cookie } });
const postSales = (cookie, body) => salesPost({ env, request: req('/api/past-sales', cookie, body) });
const postCash = (cookie, body) => cashPost({ env, request: req('/api/past-cash', cookie, body) });
const getSales = () => salesGet({ env, request: req('/api/past-sales?merchant=' + M, owner) }).then((r) => r.json());
const getCash = (cookie = owner) => cashGet({ env, request: req('/api/past-cash?merchant=' + M, cookie) });
const hist = () => db.prepare("SELECT * FROM sales WHERE merchant = ? AND id LIKE 'hist:%' AND void_ts IS NULL ORDER BY ts").all(M);
const cashRows = () => db.prepare("SELECT * FROM cash_session_events WHERE merchant = ? ORDER BY occurred_ts, id").all(M);

const D = day(-10);
const tickets = Array.from({ length: 30 }, (_, i) => ({
  ref: String(1000 + i), at: D + ' ' + String(11 + Math.floor(i / 6)).padStart(2, '0') + ':' + String((i % 6) * 9).padStart(2, '0'),
  method: i % 3 ? 'card' : 'cash', totalCents: 4500 + i * 10,
  lines: i === 0 ? [{ name: 'Tacos Indien', qty: 1, unitCents: 4500, cat: 'Tacos' }] : undefined,
}));

await check('tickets: one sale row per ticket, at its own time, its own payment, its original number', async () => {
  const r = await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: D, tickets }] });
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  assert.equal(body.tickets, 30);
  const rows = hist();
  assert.equal(rows.length, 30);
  assert.equal(rows[0].ref, 'HIST-T-1000');
  assert.equal(rows[0].ts, wallEpoch(D + ' 11:00', DEFAULT_ZONE));
  assert.equal(rows[0].method, 'cash');
  assert.equal(rows[1].method, 'card');
  assert.deepEqual(JSON.parse(rows[0].lines), [{ n: 'Tacos Indien', q: 1, t: 45, c: 'Tacos' }]);
  assert.equal(rows[1].lines, null, 'a ticket without detail carries no basket, never an invented one');
  assert.ok(rows.every((x) => x.channel === 'historique' && x.written_by === 'account' && x.label === 'Ventes antérieures'));
  assert.ok(rows.every((x) => businessDate(x.ts) === D));
});

await check('the feed counts every ticket: the number of sales and the average basket are right', async () => {
  const r = await feedGet({ env, request: req('/api/feed?merchant=' + M + '&since=0&limit=500', owner) });
  const data = await r.json();
  const served = (data.sales || []).filter((x) => String(x.id).startsWith('hist:' + M + ':' + D + ':'));
  assert.equal(served.length, 30, 'thirty sales, not one block per day');
  assert.equal(served.reduce((s, x) => s + Number(x.amountCents != null ? x.amountCents : x.amount_cents != null ? x.amount_cents : Math.round(x.amount * 100)), 0),
    tickets.reduce((s, x) => s + x.totalCents, 0));
});

await check('GET lists the day with its ticket count and mixed payments', async () => {
  const data = await getSales();
  const d = data.days.find((x) => x.day === D);
  assert.equal(d.tickets, 30);
  assert.equal(d.method, 'mixed');
  assert.equal(data.cutoff, 5);
  assert.equal(data.zone, DEFAULT_ZONE);
});

await check('re-importing the day replaces it: fewer tickets void the rest, a grid entry replaces tickets', async () => {
  const r = await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: D, tickets: tickets.slice(0, 4) }] });
  assert.equal(r.status, 200);
  assert.equal(hist().length, 4);
  const g = await postSales(owner, { merchant: M, day: D, method: 'cash', lines: [{ name: 'Burger', qty: 2, unitCents: 5000 }] });
  assert.equal(g.status, 200);
  assert.equal(hist().length, 1);
  assert.equal(hist()[0].ref, 'HIST-' + D.replace(/-/g, ''));
});

await check('a ticket after the night cutoff belongs to the previous business day, and must be sent with it', async () => {
  const late = { ref: 'N1', at: day(-8) + ' 01:30', method: 'cash', totalCents: 3000 };
  const wrong = await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: day(-8), tickets: [late] }] });
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).error, 'ticket-day');
  const ok = await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: day(-9), tickets: [late] }] });
  assert.equal(ok.status, 200);
});

await check('tickets refuse days already run on Kiwi, future days, bad totals, and strangers', async () => {
  assert.equal((await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: day(-3), tickets: [{ ref: 'a', totalCents: 10 }] }] })).status, 409);
  assert.equal((await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: today, tickets: [{ ref: 'a', totalCents: 10 }] }] })).status, 400);
  assert.equal((await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: day(-12), tickets: [{ ref: 'a', totalCents: -5 }] }] })).status, 400);
  assert.equal((await postSales(stranger, { merchant: M, kind: 'tickets', days: [{ day: day(-12), tickets: [{ ref: 'a', totalCents: 10 }] }] })).status, 403);
  const many = Array.from({ length: 1001 }, (_, i) => ({ ref: 'm' + i, totalCents: 100 }));
  assert.equal((await postSales(owner, { merchant: M, kind: 'tickets', days: [{ day: day(-12), tickets: many }] })).status, 400, 'too many tickets in one send');
});

const C = day(-6);
const shift = {
  ref: '17', open: C + ' 09:00', close: C + ' 23:40', openingCents: 50000, expectedCents: 348000, countedCents: 346000,
  moves: [{ at: C + ' 10:05', kind: 'out', cents: 12000, reason: 'Butane' }, { at: C + ' 18:20', kind: 'in', cents: 20000, reason: 'Monnaie' }],
};

await check('a shift becomes open, moves and close events on the historique terminal, gap computed by the server', async () => {
  const r = await postCash(owner, { merchant: M, days: [{ day: C, shifts: [shift], moves: [{ at: C + ' 12:00', kind: 'out', cents: 3000, reason: 'Pain' }] }] });
  assert.equal(r.status, 200, await r.clone().text());
  const rows = cashRows();
  assert.equal(rows.length, 5);
  assert.ok(rows.every((x) => x.terminal_id === 'historique' && x.actor_id === 'historique' && x.id.startsWith('hist:' + M + ':' + C + ':')));
  const open = rows.find((x) => x.event_type === 'open');
  assert.equal(open.expected_cents, 50000);
  assert.equal(open.occurred_ts, wallEpoch(C + ' 09:00', DEFAULT_ZONE));
  const close = rows.find((x) => x.event_type === 'close');
  assert.equal(close.gap_cents, -2000);
  assert.equal(close.session_id, open.session_id);
  const butane = rows.find((x) => x.movement_reason === 'Butane');
  assert.equal(butane.movement_kind, 'out');
  assert.equal(butane.session_id, open.session_id);
  const pain = rows.find((x) => x.movement_reason === 'Pain');
  assert.notEqual(pain.session_id, open.session_id, 'a move outside any shift stays on its own day');
});

await check('the expenses reader sees the imported outs', async () => {
  const outs = db.prepare("SELECT SUM(movement_amount_cents) AS s FROM cash_session_events WHERE merchant = ? AND event_type = 'movement' AND movement_kind = 'out'").get(M).s;
  assert.equal(outs, 15000);
});

await check('GET past-cash sums the day; strangers get nothing', async () => {
  const data = await (await getCash()).json();
  const d = data.days.find((x) => x.day === C);
  assert.deepEqual({ shifts: d.shifts, moves: d.moves, inCents: d.inCents, outCents: d.outCents, gapCents: d.gapCents },
    { shifts: 1, moves: 3, inCents: 20000, outCents: 15000, gapCents: -2000 });
  assert.equal(data.firstLiveDay, day(-3));
  assert.equal((await getCash(stranger)).status, 403);
});

await check('re-importing a cash day replaces it, an empty day removes it', async () => {
  const r = await postCash(owner, { merchant: M, days: [{ day: C, shifts: [{ ...shift, moves: [] }] }] });
  assert.equal(r.status, 200);
  assert.equal(cashRows().length, 2);
  await postCash(owner, { merchant: M, days: [{ day: C, shifts: [], moves: [] }] });
  assert.equal(cashRows().length, 0);
});

await check('cash refuses: a move before its shift opens, a shift opening on another day, days run on a real drawer', async () => {
  const bad = { ...shift, moves: [{ at: C + ' 08:00', kind: 'out', cents: 100 }] };
  const r1 = await postCash(owner, { merchant: M, days: [{ day: C, shifts: [bad] }] });
  assert.equal((await r1.json()).error, 'move-time');
  const r2 = await postCash(owner, { merchant: M, days: [{ day: day(-7), shifts: [shift] }] });
  assert.equal((await r2.json()).error, 'shift-open');
  /* A real drawer opened on Kiwi before the first till sale moves the first live day back. */
  db.prepare("INSERT INTO cash_session_events (id, merchant, session_id, terminal_id, event_type, expected_cents, actor_id, opened_ts, occurred_ts) VALUES ('real-open', ?, 'sess1', 'term_abcdefabcdef', 'open', 20000, 'emp1', ?, ?)")
    .run(M, wallEpoch(day(-5) + ' 09:00', DEFAULT_ZONE), wallEpoch(day(-5) + ' 09:00', DEFAULT_ZONE));
  const r3 = await postCash(owner, { merchant: M, days: [{ day: day(-5), shifts: [{ ...shift, open: day(-5) + ' 09:00', close: '', moves: [] }] }] });
  assert.equal(r3.status, 409);
  assert.equal((await (await getCash()).json()).firstLiveDay, day(-5));
  assert.equal(cashRows().filter((x) => x.terminal_id === 'historique').length, 0, 'nothing was written');
});

await check('no till can write to the historique terminal or a hist: session', async () => {
  for (const body of [
    { merchant: M, terminalId: 'historique', sessionId: 's1', id: 'e1' },
    { merchant: M, terminalId: 'term_abcdefabcdef', sessionId: 'hist:' + C + ':s0', id: 'e2' },
    { merchant: M, terminalId: 'term_abcdefabcdef', sessionId: 's1', id: 'hist:' + M + ':' + C + ':s0:open' },
  ]) {
    const r = await cashSessionsPost({ env, request: req('/api/cash-sessions', owner, Object.assign({ eventType: 'open', actorId: 'a1', openedAt: 1, occurredAt: 1 }, body)) });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'reserved-id');
  }
});

console.log(`\n${checks} history import route checks passed`);
