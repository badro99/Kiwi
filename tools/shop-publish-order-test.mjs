#!/usr/bin/env node
/* Kiwi · shop-publish-order-test — a boutique's public shop never goes back.
 *   node tools/shop-publish-order-test.mjs
 *
 * A boutique publishes its OrderPro shop (POST /api/menu, type 'boutique') as
 * a projection of its shared catalogue (/api/catalog). Every open dashboard
 * publishes, and the write used to be last-writer-wins: a tab that had been
 * offline republished its old stock over a device that was up to date.
 * Runs the real handler over node:sqlite:
 *   1. a projection older than the shared catalogue revision is refused
 *      (409 stale-shop) and the published shop is untouched;
 *   2. two publishes racing on the same row: the one whose row moved under it
 *      is refused instead of overwriting;
 *   3. a fractional stock is never advertised (2.5 pieces publish as 2).
 * Red on the code before 27 October 2026. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as menuPost } from '../functions/api/menu.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'shop-publish-order-secret-0123456789';
const MERCHANT = 'shop-order';
let checks = 0;
function check(condition, message, detail) {
  checks += 1;
  assert.ok(condition, message + (detail ? ' · ' + detail : ''));
  console.log(`  ✓ ${message}`);
}

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
db.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?)')
  .run('acc-shop', 'shop@example.test', 'Shop Order', 's', 'h', now, 'active');
db.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,subscription_kind,updated_ts) VALUES (?,'{}','pro','boutique',?,?,'active','paid',?)")
  .run(MERCHANT, 'acc-shop', 'Shop Order', now);
db.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, ?, ?)').run(MERCHANT, '{}', 5, now);

/* One gate: the next write to `menus` waits until the test lets it go. */
const gate = { armed: false, reached: null, release: null };
const stmt = (q, p) => {
  const st = db.prepare(q);
  return {
    async first() { const r = st.get(...p); return r === undefined ? null : r; },
    async all() { return { results: st.all(...p) }; },
    async run() {
      if (gate.armed && /^\s*(UPDATE|INSERT INTO) menus/i.test(q)) {
        gate.armed = false;
        const go = new Promise((resolve) => { gate.release = resolve; });
        gate.reached();
        await go;
      }
      const r = st.run(...p);
      return { meta: { changes: r.changes }, success: true };
    },
  };
};
const env = { AUTH_SECRET: SECRET, DB: {
  prepare(q) { return { bind(...p) { return stmt(q, p); }, ...stmt(q, []) }; },
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
} };
const cookie = sessionCookie(await makeSession('acc-shop', SECRET));
const shop = (catalogRev, stock) => ({
  products: [{ id: 'p', name: 'Polo', priceMAD: 300 }],
  variants: [{ id: 'v', productId: 'p', colorId: 'noir', size: 'M', stock }],
  catalogRev,
});
const publish = async (data) => {
  const res = await menuPost({ env, request: new Request('https://kiwi.test/api/menu', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.0.0.7' },
    body: JSON.stringify({ merchant: MERCHANT, type: 'boutique', name: 'Shop Order', data }),
  }) });
  return { status: res.status, j: await res.json() };
};
const live = () => JSON.parse(db.prepare('SELECT data FROM menus WHERE merchant = ?').get(MERCHANT).data);

const fresh = await publish(shop(5, 4));
check(fresh.status === 200, 'a projection of the current catalogue publishes', JSON.stringify(fresh.j));
check(live().variants[0].stock === 4, 'the shop shows 4 pieces');

const old = await publish(shop(4, 9));
check(old.status === 409 && old.j.error === 'stale-shop', 'a projection of an older catalogue is refused',
  `${old.status} ${JSON.stringify(old.j)}`);
check(live().variants[0].stock === 4, 'and the published stock is untouched');
const legacy = await publish({ ...shop(0, 9), catalogRev: undefined });
check(legacy.status === 409, 'a publisher that names no revision cannot overwrite a catalogue-backed shop');

{
  const reached = new Promise((resolve) => { gate.reached = resolve; });
  gate.armed = true;
  const slow = publish(shop(5, 1));          // read the row, now waits at its write
  await reached;
  const fast = await publish(shop(5, 3));    // writes first
  check(fast.status === 200, 'the second publisher writes while the first is between read and write');
  gate.release();
  const late = await slow;
  check(late.status === 409 && late.j.error === 'stale-shop', 'the first, whose row moved, is refused',
    `${late.status} ${JSON.stringify(late.j)}`);
  check(live().variants[0].stock === 3, 'the shop keeps the write that won');
}

db.prepare('UPDATE catalogs SET rev = 6 WHERE merchant = ?').run(MERCHANT);
const half = await publish(shop(6, 2.5));
check(half.status === 200 && live().variants[0].stock === 2, 'a fractional stock is never advertised (2.5 shows 2)',
  JSON.stringify(live().variants[0]));

console.log(`shop-publish-order-test: ${checks} checks passed`);
