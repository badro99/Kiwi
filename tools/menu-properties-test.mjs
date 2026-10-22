#!/usr/bin/env node
/* Stored restaurant documents only: real Pages handlers, local SQLite D1, no browser. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { sanitizeMenu, onRequestPost as save, onRequestGet as read } from '../functions/api/menu.js';
import { onRequestPost as availability } from '../functions/api/menu/availability.js';
import { sanitizeMenuPriceLists, resolveCaisseMenu } from '../functions/api/_menu-price-lists.js';
import { normalizeMenuLangs } from '../functions/api/_menu-langs.js';
import { businessDate, businessBoundary } from '../functions/api/_business-day.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; menu properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0, known = 0;
async function strict(label, p) {
  if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return;
  const r = await fc.check(p, { numRuns: RUNS, seed: SEED });
  if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample), r.errorInstance?.message); }
  else { passed++; console.log('✓ ' + label); }
}
async function knownIssue(label, explanation, p) {
  const r = await fc.check(p, { numRuns: RUNS, seed: SEED });
  if (r.failed) { known++; console.log('○ ' + label + ': ' + explanation + ' Witness: ' + fc.stringify(r.counterexample).slice(0, 300)); }
  else { failed++; console.error('✗ known issue unexpectedly holds: ' + label); }
}
const f = await fixture(ROOT), { sql, env, merchant } = f;
const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', env.AUTH_SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const NOW = Date.parse('2026-10-22T12:00:00Z');
const cents = fc.integer({ min: 0, max: 1000000 });
const menuArb = fc.tuple(fc.array(cents, { minLength: 1, maxLength: 12 }), cents, cents).map(([prices, option, extra]) => ({
  cats: [{ id: 'c', name: 'Carte' }],
  items: prices.map((p, i) => ({ id: 'i' + i, name: 'Plat ' + i, catId: 'c', price: p / 100, opts: ['g'], ...(i ? {} : { formula: { slots: [{ id: 's', label: 'Plat', min: 1, max: 1, choices: [{ itemId: 'i0', extra: extra / 100 }] }] } }) })),
  opts: [{ id: 'g', name: 'Extras', kind: 'many', choices: [{ id: 'o', name: 'Extra', price: option / 100 }] }],
}));
function reset() { sql.exec('DELETE FROM menus'); sql.exec('DELETE FROM doc_history'); }
async function call(handler, body, auth = cookie, get = false) {
  const request = new Request(`https://kiwi.test/api/menu?mine=1&merchant=${merchant}`, { method: get ? 'GET' : 'POST', headers: { Cookie: auth, 'Content-Type': 'application/json' }, ...(get ? {} : { body: JSON.stringify({ merchant, name: 'Properties', type: 'restaurant', ...body }) }) });
  const response = await handler({ request, env }); return { status: response.status, body: await response.json() };
}
const post = (data, revision = 0) => call(save, { data, expectedUpdatedTs: revision });
// Hold the first menu mutation until both requests reach the write. This
// exercises the SQL guard, independently of authentication microtask timing.
async function race(work) {
  const db = env.DB;
  let writes = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const timer = setTimeout(release, 3000);
  env.DB = { ...db, prepare(query) {
    const statement = db.prepare(query);
    let proxy;
    proxy = new Proxy(statement, { get(target, key) {
      if (key === 'bind') return (...args) => { target.bind(...args); return proxy; };
      if (key === 'run' && /^(?:UPDATE menus|INSERT INTO menus)/.test(query)) return async () => {
        if (++writes === 2) release();
        await ready;
        return target.run();
      };
      return target[key];
    } });
    return proxy;
  } };
  try { const results = await work(); assert.ok(writes >= 2, 'both writes must reach the barrier'); return results; }
  finally { clearTimeout(timer); env.DB = db; }
}
const stored = () => sql.prepare('SELECT * FROM menus WHERE merchant=?').get(merchant);
try {
  await strict('round trip preserves dishes, centimes, option choices and formula components; sanitation is idempotent', fc.asyncProperty(menuArb, async m => {
    reset(); assert.equal((await post(m)).status, 200);
    const got = await call(read, {}, cookie, true), clean = sanitizeMenu(m, NOW);
    assert.deepEqual(got.body.menu, clean);
    assert.deepEqual(sanitizeMenu(clean, NOW), clean);
    assert.deepEqual(clean.items.map(i => i.price), m.items.map(i => i.price));
    assert.deepEqual(clean.opts[0].choices.map(c => c.price), m.opts[0].choices.map(c => c.price));
    assert.deepEqual(clean.items[0].formula, m.items[0].formula);
  }));
  await strict('edited monetary fields normalize to finite nonnegative centimes', fc.property(fc.constantFrom(12.10 + .20, .001, 1.005, -1, NaN, Infinity), value => {
    const m = fc.sample(menuArb, { seed: SEED, numRuns: 1 })[0];
    m.items[0].price = m.opts[0].choices[0].price = m.items[0].formula.slots[0].choices[0].extra = value;
    const clean = sanitizeMenu(m, NOW);
    for (const p of [clean.items[0].price, clean.opts[0].choices[0].price, clean.items[0].formula.slots[0].choices[0].extra]) {
      assert.ok(Number.isFinite(p) && p >= 0); assert.equal(p, Math.round(p * 100) / 100);
    }
  }));
  await knownIssue('price lists are not stored with the menu', 'functions/api/_menu-price-lists.js has no screen that sends price lists and no production menu holds one (22 October 2026); storing them is a feature to finish, not a fix.', fc.asyncProperty(menuArb, cents, async (m, p) => {
    reset(); Object.assign(m, { priceLists: [{ id: 'evening', name: 'Evening', active: true, prices: { i0: p / 100 }, optionPrices: { 'g:o': .2 }, formulaExtras: { 'items/i0/formula/slots/0/choices/0/extra': .3 } }], terminalMenus: { till: 'evening' } });
    const expected = sanitizeMenuPriceLists(m, m);
    assert.equal((await post(m)).status, 200);
    const got = (await call(read, {}, cookie, true)).body.menu;
    for (const key of Object.keys(expected)) assert.deepEqual(got[key], expected[key]);
    assert.equal((await call(availability, { itemId: 'i0', available: false }, till)).status, 200);
    const hidden = JSON.parse(stored().data);
    for (const key of Object.keys(expected)) assert.deepEqual(hidden[key], expected[key]);
    const publicResponse = await read({ request: new Request(`https://kiwi.test/api/menu?merchant=${merchant}`), env });
    const publicPayload = await publicResponse.json();
    assert.ok(publicPayload.menu);
    assert.equal(publicPayload.menu.priceLists, undefined);
    assert.equal(publicPayload.menu.terminalMenus, undefined);
    assert.deepEqual(sanitizeMenu(got, NOW), got);
  }));
  await strict('guarded concurrent edits accept at most one winner, including a frozen millisecond clock', fc.asyncProperty(menuArb, async m => {
    reset(); const realNow = Date.now; Date.now = () => NOW;
    try {
      const first = await post(m); assert.equal(first.status, 200);
      const a = structuredClone(m), b = structuredClone(m); a.items[0].name = 'Device A'; b.items[0].name = 'Device B';
      const results = await race(() => Promise.all([post(a, first.body.updatedTs), post(b, first.body.updatedTs)]));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.ok(stored().updated_ts > first.body.updatedTs);
      const winner = results[0].status === 200 ? a : b;
      assert.deepEqual(JSON.parse(stored().data), sanitizeMenu(winner, NOW));
    } finally { Date.now = realNow; }
  }));
  await strict('first publication races never overwrite a different document', fc.asyncProperty(menuArb, async m => {
    reset(); const other = structuredClone(m); other.items[0].name = 'Other first publication';
    const results = await race(() => Promise.all([post(m), post(other)]));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const winner = results[0].status === 200 ? m : other;
    assert.deepEqual(JSON.parse(stored().data), sanitizeMenu(winner, NOW));
  }));
  await strict('dashboard and till racing preserve both changes or reject the stale dashboard', fc.asyncProperty(menuArb, fc.boolean(), async (m, tillFirst) => {
    reset(); const initial = await post(m), edited = structuredClone(m); edited.items[0].name = 'Dashboard edit';
    const dash = () => post(edited, initial.body.updatedTs);
    const toggle = () => call(availability, { itemId: 'i0', available: false }, till);
    const results = await race(() => Promise.all(tillFirst ? [toggle(), dash()] : [dash(), toggle()]));
    const d = results[tillFirst ? 1 : 0], t = results[tillFirst ? 0 : 1];
    assert.equal(t.status, 200); assert.ok([200, 409].includes(d.status));
    const final = JSON.parse(stored().data);
    assert.equal(final.items[0].avail, false);
    assert.equal(final.items[0].name, d.status === 200 ? 'Dashboard edit' : m.items[0].name);
    assert.equal(final.items[0].price, m.items[0].price);
  }));
  await strict('identical retry is a no-op even with its original revision', fc.asyncProperty(menuArb, async m => {
    reset(); const first = await post(m); const before = stored();
    f.trace.length = 0;
    const retry = await post(m); assert.ok(!f.trace.some(query => /^(?:INSERT|UPDATE|DELETE)/.test(query)), 'retry must perform no writes'); assert.equal(retry.status, 200); assert.equal(retry.body.updatedTs, first.body.updatedTs); assert.deepEqual(stored(), before);
  }));
  await strict('successful menu edits retain the preceding document and revision in history', fc.asyncProperty(menuArb, async m => {
    reset(); const initial = await post(m), before = stored(), next = structuredClone(m);
    next.items[0].name = 'New version';
    assert.equal((await post(next, initial.body.updatedTs)).status, 200);
    const history = sql.prepare("SELECT data, updated_ts FROM doc_history WHERE merchant=? AND kind='menu'").all(merchant);
    assert.deepEqual(history.map(row => ({ ...row })), [{ data: before.data, updated_ts: before.updated_ts }]);
  }));
  await strict('till sold-out writes preserve prices and components; expiry and re-enable clear the flag', fc.asyncProperty(menuArb, fc.integer({ min: 10000, max: 3600000 }), async (m, duration) => {
    reset(); const first = await post(m), before = JSON.parse(stored().data), until = Date.now() + duration;
    assert.equal((await call(availability, { itemId: 'i0', available: false, until }, till)).status, 200);
    const hidden = JSON.parse(stored().data), expected = structuredClone(before); expected.items[0].avail = false; expected.items[0].availUntil = until;
    assert.deepEqual(hidden, expected);
    assert.deepEqual(sanitizeMenu(hidden, until), before);
    assert.equal((await post(m, first.body.updatedTs)).status, 409);
    assert.equal((await call(availability, { itemId: 'i0', available: true }, till)).status, 200);
    assert.deepEqual(JSON.parse(stored().data), before);
  }));
  await strict('language additions, aliases and removals never move ids, options or prices', fc.property(menuArb, fc.subarray(['es', 'DE-de', 'zh_CN', 'he', 'invalid']), (m, langs) => {
    const base = sanitizeMenu(m, NOW), next = sanitizeMenu({ ...m, langs }, NOW);
    assert.deepEqual(next.langs, normalizeMenuLangs(langs)); delete next.langs; const expected = { ...base }; delete expected.langs; assert.deepEqual(next, expected);
    assert.deepEqual(sanitizeMenu({ ...m, langs: [] }, NOW), base);
  }));
  await strict('tenant A cannot write tenant B through menu or paired availability', fc.asyncProperty(menuArb, async m => {
    reset(); sql.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('menu-other','menu-other@example.test','Other','s','h',1,'active') ON CONFLICT(id) DO NOTHING").run();
    sql.prepare("UPDATE merchant_config SET account_id='menu-other' WHERE merchant='server-other-shop'").run();
    sql.prepare("INSERT INTO menus(merchant,name,type,data,updated_ts) VALUES('server-other-shop','Other','restaurant','{}',1)").run();
    assert.equal((await post(m)).status, 200);
    const before = sql.prepare("SELECT * FROM menus WHERE merchant='server-other-shop'").get();
    assert.equal((await call(save, { merchant: 'server-other-shop', data: m })).status, 404);
    assert.equal((await call(availability, { merchant: 'server-other-shop', itemId: 'i0', available: false }, till)).status, 401);
    assert.deepEqual(sql.prepare("SELECT * FROM menus WHERE merchant='server-other-shop'").get(), before);
  }));
  await strict('terminal assignment picks one active list or default independently of time/channel; input is immutable', fc.property(menuArb, cents, cents, (m, a, b) => {
    Object.assign(m, sanitizeMenuPriceLists({ priceLists: [{ id: 'a', name: 'A', active: true, prices: { i0: a / 100 } }, { id: 'b', name: 'B', active: false, prices: { i0: b / 100 } }], terminalMenus: { t: 'a', off: 'b' } }, m));
    const before = structuredClone(m);
    for (const terminal of ['t', 'off', 'unknown']) {
      const r = resolveCaisseMenu(m, terminal);
      assert.equal(r.menu.items[0].price, terminal === 't' ? a / 100 : m.items[0].price);
      assert.equal(r.menu.items.length, m.items.length);
    }
    assert.deepEqual(m, before);
  }));
  await strict('legal Morocco clock partitions business days at 05:00 after September 20', fc.property(fc.integer({ min: -1440, max: 1440 }), minute => {
    const boundary = Date.parse('2026-10-22T05:00:00Z'), ts = boundary + minute * 60000;
    for (const zone of ['Africa/Casablanca', 'Africa/El_Aaiun']) {
      const day = businessDate(ts, 5, zone); assert.equal(businessBoundary(day, 5, zone), boundary + Math.floor(minute / 1440) * 86400000);
    }
  }));
  await knownIssue('scheduled/channel price lists', 'Price lists support terminal assignment only. No time/channel contract exists; equal endpoints and overnight scheduling need a product decision. Promotions have their own suite.', fc.property(fc.constantFrom(['00:00', '00:00'], ['22:00', '05:00'], ['05:00', '06:00']), ([from, to]) => {
    const raw = { priceLists: [{ id: 'night', name: 'Night', active: true, from, to, channel: 'delivery' }] };
    return sanitizeMenuPriceLists(raw, {}).priceLists[0].from === from;
  }));
} finally { f.close(); }
console.log(`menu-properties: ${passed} held, ${failed} failed, ${known} known; ${RUNS} cases/property; seed=${SEED}`);
process.exitCode = failed ? 1 : 0;
