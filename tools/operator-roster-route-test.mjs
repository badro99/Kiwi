#!/usr/bin/env node
/* /api/admin/roster · the Team page publishes from operator view with the
 * console's authority, no more and no less.
 *
 *   node tools/operator-roster-route-test.mjs
 *
 * Owner report, 30 Oct 2026: on Santos's dashboard in operator view, a code set
 * on the Team page showed on screen but the till refused it, while the same
 * code added in the God-mode console worked at once. The page published
 * through POST /api/config, which needs the owner's session, and failed
 * silently. The dashboard now uses this route in operator view
 * (assets/merchant-config.js › syncPins). Runs the real route on the real
 * schema (SQLite in memory, tools/server-money-fixture.mjs). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as roster } from '../functions/api/admin/roster.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n').slice(0, 4).join(' ')}`); }
}

const f = await fixture(ROOT);
const cookies = {
  named: `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, 'money-operator')}`,
  anonymous: `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}`,
};
const send = async (body, cookie = cookies.named) => {
  const res = await roster({ request: new Request('https://kiwi.test/api/admin/roster', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  }), env: f.env });
  return { status: res.status, body: await res.json() };
};
const tillRows = () => f.sql.prepare('SELECT name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts').all(f.merchant).map((r) => ({ ...r }));
const seller = { memberId: 'm-zineb', code: '4821', name: 'Zineb Test', role: 'Vendeur conseil', department: 'Vente' };
const stock = { memberId: 'm-said', code: '5930', name: 'Said Test', role: 'Magasinier', department: 'Stock' };

await ok('a named operator publishes the roster: the seller reaches the till, the stock role does not', async () => {
  const r = await send({ merchant: f.merchant, pins: [seller, stock] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.deepEqual(tillRows(), [{ name: 'Zineb Test', role: 'Vendeur conseil' }]);
});

await ok('the reply and the journal name people, never a code', async () => {
  const r = await send({ merchant: f.merchant, pins: [seller] });
  assert.ok(!JSON.stringify(r.body).includes(seller.code), 'no code in the reply');
  const audit = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'staff-roster-publish' AND merchant = ?").all(f.merchant);
  assert.ok(audit.length >= 1, 'one journal line per publish');
  assert.equal(audit[0].actor_id, 'money-operator');
  assert.ok(!JSON.stringify(audit).includes(seller.code), 'no code in the journal');
});

await ok('the shared team pass (no named operator) and a plain visitor are refused, nothing written', async () => {
  const before = tillRows();
  assert.equal((await send({ merchant: f.merchant, pins: [stock, { ...seller, name: 'Autre' }] }, cookies.anonymous)).status, 403);
  assert.equal((await send({ merchant: f.merchant, pins: [] }, '')).status, 403);
  assert.deepEqual(tillRows(), before);
});

await ok('an unknown store is never created from operator view', async () => {
  const r = await send({ merchant: 'no-such-shop', pins: [seller] });
  assert.equal(r.status, 404);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM merchant_config WHERE merchant = 'no-such-shop'").get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = 'no-such-shop'").get().n, 0);
});

await ok('the owner\'s rules hold: two people on one code are refused aloud, nothing replaced', async () => {
  const before = tillRows();
  const r = await send({ merchant: f.merchant, pins: [seller, { ...stock, role: 'Caissier', code: seller.code }] });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'duplicate-staff-code');
  assert.deepEqual(tillRows(), before);
});

await ok('a roster without pins is refused rather than read as "remove everyone"', async () => {
  assert.equal((await send({ merchant: f.merchant })).status, 400);
  assert.equal(tillRows().length, 1);
});

/* The console's guards (security review, 30 Oct 2026). Each case uses its own
   operator, so the limiter budget of one case never decides another. The
   owner code below is a fixture value written straight into the test DB. */
const as = async (id) => {
  f.sql.prepare('INSERT OR IGNORE INTO operators(id,label,salt,hash,created_ts) VALUES(?,?,?,?,1)').run(id, 'Test ' + id, 's', 'h');
  return `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, id)}`;
};
const OWNER_FIXTURE_CODE = '7317';
f.sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)')
  .run('pin-owner-fixture', f.merchant, OWNER_FIXTURE_CODE, 'Owner Test', 'Propriétaire', 1);
const ownerRows = () => f.sql.prepare("SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ? AND id = 'pin-owner-fixture'").get(f.merchant).n;

await ok('an owner line is never published from operator view: left out, the owner code kept', async () => {
  const r = await send({ merchant: f.merchant, pins: [seller, { memberId: 'm-boss', code: '6402', name: 'Boss Test', role: 'Propriétaire' }] }, await as('op-owner-line'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ownerSkipped, 1);
  assert.equal(ownerRows(), 1, 'the owner code stays');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ? AND name = 'Boss Test'").get(f.merchant).n, 0);
});

await ok('a line on the owner\'s code refuses the whole publish, says not which, and is journaled without the code', async () => {
  const before = tillRows();
  const r = await send({ merchant: f.merchant, pins: [stock, { ...seller, role: 'Caissier', code: OWNER_FIXTURE_CODE }] }, await as('op-guess'));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'staff-code-taken' });
  assert.deepEqual(tillRows(), before, 'nothing replaced');
  const audit = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'staff-roster-duplicate' AND actor_id = 'op-guess'").all();
  assert.equal(audit.length, 1);
  assert.ok(!JSON.stringify(audit).includes(OWNER_FIXTURE_CODE), 'no code in the journal');
});

await ok('guessing is rate limited: refusals stop at the limiter, then even a clean roster waits', async () => {
  const cookie = await as('op-prober');
  const statuses = [];
  for (let i = 0; i < 12; i++) {
    const guess = String(1000 + i);
    statuses.push((await send({ merchant: f.merchant, pins: [{ ...seller, code: guess }] }, cookie)).status);
  }
  assert.ok(statuses.includes(429), 'the limiter answers: ' + statuses.join(','));
  assert.ok(statuses.indexOf(429) <= 9, 'within the console budget: ' + statuses.join(','));
  assert.equal((await send({ merchant: f.merchant, pins: [seller] }, cookie)).status, 429);
});

/* The browser half: operator view sends to this route, an owner to /api/config. */
const src = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');
function client(venue) {
  const calls = [];
  const window = {
    KiwiVenue: { getCurrentVenueData: () => venue, slugOf: () => venue.slug, isCustom: () => true },
    addEventListener() {}, location: { search: venue.id === 'scoped' ? '?merchant=' + venue.slug : '' },
  };
  const ctx = {
    window, console, JSON, Promise, Object, Array, String, Number, Date, Math, RegExp, URLSearchParams,
    location: window.location, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => null }, body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } } },
    fetch: (url, init) => { calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null }); return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }); },
  };
  Object.assign(ctx, window); ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { cfg: ctx.KiwiConfig, calls };
}
await ok('in operator view the Team page publishes to /api/admin/roster with the confirmed store, and a refusal reads false', async () => {
  const c = client({ id: 'scoped', custom: true, slug: 'santos-store', name: 'Santos Store' });
  if (c.cfg.confirmScope) c.cfg.confirmScope('santos-store');
  const res = await c.cfg.syncPins([seller]);
  const call = c.calls.find((x) => x.body && Array.isArray(x.body.pins));
  assert.ok(call, 'the roster was sent: ' + JSON.stringify(c.calls.map((x) => x.url)));
  assert.equal(call.url, '/api/admin/roster');
  assert.equal(call.body.merchant, 'santos-store');
  assert.equal(res, false, 'a 401 comes back as false, so the page can say so');
});
await ok('an owner on their own store still publishes through /api/config', async () => {
  const c = client({ id: 'v-own', custom: true, slug: 'my-shop', name: 'My Shop' });
  await c.cfg.syncPins([seller]);
  const call = c.calls.find((x) => x.body && Array.isArray(x.body.pins));
  assert.ok(call);
  assert.equal(call.url, '/api/config');
});

f.close();
console.log(`\noperator-roster-route: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
