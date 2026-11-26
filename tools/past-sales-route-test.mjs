/* /api/past-sales — les ventes d'avant Kiwi (Jon's Burgers, 26 nov. 2026).
 * Vraie route, vrai code d'authentification, vrai schema.sql dans node:sqlite. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/past-sales.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import * as auth from '../functions/auth/_lib.js';
import { businessDate, addBusinessDays } from '../functions/api/_business-day.js';

let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('  ok ' + checks + ' - ' + name); }

function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => { const r = db.prepare(sql).all(...args)[0]; return r ? (col ? r[col] : r) : null; },
  });
  return {
    prepare: (sql) => wrap(sql),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const SECRET = 'past-sales-test-secret-32-bytes!!';
const M = 'jon-burger-test';
const OTHER = 'autre-resto';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
db.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES (?, ?, ?, 'x', 'x', 0, 'active', 0)").run('acc-jon', 'jon@example.test', "Jon Burger Test");
db.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES (?, ?, ?, 'x', 'x', 0, 'active', 0)").run('acc-other', 'other@example.test', 'Autre Resto');
db.prepare("INSERT INTO merchant_config (merchant, features, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'restaurant', 'acc-jon', 'Jon Burger Test', 'active', 0)").run(M);
db.prepare("INSERT INTO merchant_config (merchant, features, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'restaurant', 'acc-other', 'Autre Resto', 'active', 0)").run(OTHER);
const env = { DB: d1(db), AUTH_SECRET: SECRET };

const today = businessDate(Date.now());
const day = (n) => addBusinessDays(today, n);
/* Le premier ticket de caisse : hier, à 13 h. */
db.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ts, written_by) VALUES ('till-1', ?, 40, 4000, 'cash', 'Table 1', ?, 'till:abc')")
  .run(M, Date.parse(day(-1) + 'T13:00:00Z'));

const owner = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-jon', SECRET)}`;
const stranger = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-other', SECRET)}`;
const post = (cookie, body) => onRequestPost({ env, request: new Request('https://kiwi.test/api/past-sales', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
const get = (cookie, merchant = M) => onRequestGet({ env, request: new Request('https://kiwi.test/api/past-sales?merchant=' + merchant, { headers: { Cookie: cookie } }) });
const live = () => db.prepare("SELECT * FROM sales WHERE merchant = ? AND id LIKE 'hist:%' AND void_ts IS NULL ORDER BY id").all(M);

const burgers = [
  { name: 'Tacos Indien', qty: 12, unitCents: 4000, cat: 'Blue Tacos' },
  { name: 'Double Cheese', qty: 7, unitCents: 6500, cat: 'Burgers' },
  { name: 'Coca 33cl', qty: 15, unitCents: 1200 },
];

await check('the owner saves a day before the first till ticket: one sale row, written by the account, channel historique', async () => {
  const r = await post(owner, { merchant: M, day: day(-5), method: 'cash', lines: burgers });
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  assert.equal(body.totalCents, 12 * 4000 + 7 * 6500 + 15 * 1200);
  const rows = live();
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.amount_cents, 111500);
  assert.equal(row.amount, 1115);
  assert.equal(row.written_by, 'account', 'the Z of a till never certifies it');
  assert.equal(row.channel, 'historique');
  assert.equal(row.label, 'Ventes antérieures');
  assert.equal(row.method, 'cash');
  assert.equal(businessDate(row.ts), day(-5), 'dated on its own business day');
  assert.deepEqual(JSON.parse(row.lines)[0], { n: 'Tacos Indien', q: 12, t: 480, c: 'Blue Tacos' });
});

await check('the feed serves it like any sale, so revenue and top products include it', async () => {
  const r = await feedGet({ env, request: new Request('https://kiwi.test/api/feed?merchant=' + M + '&since=0&limit=500', { headers: { Cookie: owner } }) });
  const data = await r.json();
  const hist = (data.sales || []).find((s) => s.id === 'hist:' + M + ':' + day(-5) + ':0');
  assert.ok(hist, 'served by /api/feed');
  assert.equal(hist.amount, 1115);
  assert.equal(hist.channel, 'historique');
});

await check('saving the same day again replaces it instead of adding to it', async () => {
  const r = await post(owner, { merchant: M, day: day(-5), method: 'card', lines: [{ name: 'Tacos Indien', qty: 10, unitCents: 4000 }] });
  assert.equal(r.status, 200);
  const rows = live();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_cents, 40000);
  assert.equal(rows[0].method, 'card');
});

await check('a long day splits into rows of 40 lines; shortening it voids the extra row, never deletes it', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ name: 'Plat ' + (i + 1), qty: 1, unitCents: 1000 }));
  assert.equal((await post(owner, { merchant: M, day: day(-6), lines: many })).status, 200);
  let rows = live().filter((r) => r.id.includes(day(-6)));
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((s, r) => s + r.amount_cents, 0), 45000);
  assert.equal((await post(owner, { merchant: M, day: day(-6), lines: many.slice(0, 3) })).status, 200);
  rows = live().filter((r) => r.id.includes(day(-6)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_cents, 3000);
  const all = db.prepare('SELECT id, void_ts, void_note FROM sales WHERE id LIKE ?').all('hist:' + M + ':' + day(-6) + ':%');
  assert.equal(all.length, 2, 'the row is kept');
  assert.ok(all.find((r) => r.id.endsWith(':1')).void_ts > 0);
});

await check('an empty list removes the day (voided)', async () => {
  assert.equal((await post(owner, { merchant: M, day: day(-6), lines: [] })).status, 200);
  assert.equal(live().filter((r) => r.id.includes(day(-6))).length, 0);
});

await check('same name at the same price is merged; zero quantities are skipped', async () => {
  const r = await post(owner, { merchant: M, day: day(-7), lines: [
    { name: 'Frites', qty: 2, unitCents: 1500 }, { name: 'frites', qty: 3, unitCents: 1500 }, { name: 'Sauce', qty: 0, unitCents: 500 }] });
  assert.equal(r.status, 200);
  const row = live().find((x) => x.id.includes(day(-7)));
  assert.deepEqual(JSON.parse(row.lines), [{ n: 'Frites', q: 5, t: 75 }]);
});

await check('a day the till already covers, today, or the future is refused', async () => {
  let r = await post(owner, { merchant: M, day: day(-1), lines: burgers });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).firstTillDay, day(-1));
  r = await post(owner, { merchant: M, day: today, lines: burgers });
  assert.equal(r.status, 400);
  r = await post(owner, { merchant: M, day: day(3), lines: burgers });
  assert.equal(r.status, 400);
  r = await post(owner, { merchant: M, day: '2026-02-30', lines: burgers });
  assert.equal(r.status, 400);
  r = await post(owner, { merchant: M, day: day(-800), lines: burgers });
  assert.equal((await r.json()).error, 'day-too-old');
});

await check('bad lines are refused with the dish name', async () => {
  let r = await post(owner, { merchant: M, day: day(-8), lines: [{ name: 'Tacos', qty: -1, unitCents: 4000 }] });
  assert.deepEqual(await r.json(), { error: 'line-qty', day: day(-8), name: 'Tacos' });
  r = await post(owner, { merchant: M, day: day(-8), lines: [{ name: 'Tacos', qty: 1, unitCents: 40.5 }] });
  assert.equal((await r.json()).error, 'line-price');
  r = await post(owner, { merchant: M, day: day(-8), lines: [{ name: '', qty: 1, unitCents: 100 }] });
  assert.equal((await r.json()).error, 'line-name');
});

await check('another account, a till cookie or no session cannot read or write it', async () => {
  assert.equal((await post(stranger, { merchant: M, day: day(-9), lines: burgers })).status, 403);
  assert.equal((await get(stranger)).status, 403);
  assert.equal((await post('', { merchant: M, day: day(-9), lines: burgers })).status, 403);
  const till = `kiwi_till=${await auth.tillToken(SECRET, M, 0)}`;
  assert.equal((await post(till, { merchant: M, day: day(-9), lines: burgers })).status, 403);
});

await check('GET lists the saved days with their lines and the first till day', async () => {
  const data = await (await get(owner)).json();
  assert.equal(data.firstTillDay, day(-1));
  assert.equal(data.today, today);
  assert.deepEqual(data.days.map((d) => d.day), [day(-5), day(-7)]);
  assert.equal(data.days[0].method, 'card');
  assert.deepEqual(data.days[0].lines, [{ name: 'Tacos Indien', qty: 10, totalCents: 40000, cat: '' }]);
});

await check('several days save in one request; one bad day writes nothing', async () => {
  const days = [day(-20), day(-21), day(-22)].map((d, i) => ({ day: d, lines: [{ name: 'Tacos Indien', qty: i + 1, unitCents: 4000 }] }));
  let r = await post(owner, { merchant: M, method: 'other', days: days.concat([{ day: day(-1), lines: burgers }]) });
  assert.equal(r.status, 409);
  assert.equal(live().filter((x) => [day(-20), day(-21), day(-22)].some((d) => x.id.includes(d))).length, 0, 'nothing half-written');
  r = await post(owner, { merchant: M, method: 'other', days: days.concat([{ day: day(-20), lines: [] }]) });
  assert.equal((await r.json()).error, 'day-twice');
  r = await post(owner, { merchant: M, method: 'other', days });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.totalCents, (1 + 2 + 3) * 4000);
  assert.equal(body.days.length, 3);
  assert.equal(live().filter((x) => x.method === 'other').length, 3);
});

await check('the hist: prefix and the historique channel belong to this route alone', async () => {
  /* /api/sale refuses both, so a till can never write a row the other tills would skip. */
  const sale = fs.readFileSync(new URL('../functions/api/sale.js', import.meta.url), 'utf8');
  assert.match(sale, /if \(\/\^hist:\/i\.test\(suppliedId\) \|\| channel === 'historique'\) return json\(\{ error: 'reserved-id' \}, 400\)/);
  assert.ok(sale.indexOf("const channel = String(") < sale.indexOf("channel === 'historique'"), 'the channel is read before it is checked');
  /* And a row that only looks like one (an old till row on that channel) is never read, replaced or voided as past sales. */
  const id = 'hist:' + M + ':' + day(-30) + ':0';
  db.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ts, channel, written_by) VALUES (?, ?, 50, 5000, 'cash', 'Till', ?, 'historique', 'till:abc')").run(id, M, Date.parse(day(-30) + 'T13:00:00Z'));
  const data = await (await get(owner)).json();
  assert.ok(!data.days.some((d) => d.day === day(-30)), 'not listed as past sales');
  assert.equal(data.firstTillDay, day(-30), 'it is a till sale, so the first till day moves back');
  assert.equal((await post(owner, { merchant: M, day: day(-29), lines: burgers })).status, 409, 'days after it are now till days');
  assert.equal((await post(owner, { merchant: M, day: day(-31), lines: [] })).status, 200, 'days before it stay open');
  assert.equal(db.prepare('SELECT written_by FROM sales WHERE id = ?').get(id).written_by, 'till:abc');
  db.prepare('DELETE FROM sales WHERE id = ?').run(id);
});

await check('a suspended store cannot write', async () => {
  db.prepare("UPDATE merchant_config SET status = 'suspended' WHERE merchant = ?").run(M);
  try { assert.equal((await post(owner, { merchant: M, day: day(-9), lines: burgers })).status, 403); }
  finally { db.prepare("UPDATE merchant_config SET status = 'active' WHERE merchant = ?").run(M); }
});

console.log(`\n${checks} past sales route checks passed`);
