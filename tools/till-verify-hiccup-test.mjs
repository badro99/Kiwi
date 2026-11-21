#!/usr/bin/env node
/* A database hiccup while checking the till must say « try again », not « forbidden ».
 *   node tools/till-verify-hiccup-test.mjs
 *
 * The till pauses EVERY upload for 60 seconds when the server answers 401/403
 * (assets/live-link/queue-store.js, the auth back-off): a refusal means « this
 * device is no longer this store's till », and hammering would be pointless.
 * A read of the till epoch that fails for an instant proves no such thing.
 *   · POST /api/sale re-read the proof after a failed first read, saw it was
 *     valid, and still answered 403 forbidden-merchant;
 *   · POST /api/sale/refund never checked: any failed read was a 403.
 * One slow read then cost a minute during which paid tables stayed lit as
 * occupied on the waiters' phones.
 *
 * Held here, on the real handlers over in-memory SQLite, with a database that
 * fails the till epoch read on demand:
 *   · one failed read, then a good one: the sale is accepted, the refund gets
 *     past the till check (it stops at the manager approval it does not carry);
 *   · a database that stays down: both answer 503 auth-verification-unavailable;
 *   · a device with no valid proof is still refused 403 on both.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { TILL_COOKIE, tillDeviceToken, forgetTillEpoch } from '../functions/auth/_lib.js';
import { onRequestPost as sale } from '../functions/api/sale.js';
import { onRequestPost as refund } from '../functions/api/sale/refund.js';

let passed = 0;
const ok = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); passed++; console.log('  ✓ ' + msg); };

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
let failEpochReads = 0; // how many of the next till-epoch reads throw
const DB = {
  prepare(sql) {
    let args = [];
    const hiccup = () => { if (/SELECT till_epoch FROM merchant_config/.test(sql) && failEpochReads > 0) { failEpochReads--; throw new Error('D1_ERROR: Network connection lost.'); } };
    return {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return this; },
      async first() { hiccup(); return db.prepare(sql).get(...args) || null; },
      async all() { hiccup(); return { results: db.prepare(sql).all(...args) }; },
      async run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
  },
  async batch(statements) { const r = []; for (const s of statements) r.push(await s.run()); return r; },
};
const SECRET = 'synthetic-till-hiccup-test-only', merchant = 'hiccup-fixture', device = 'term_hiccupfixture01';
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
db.prepare('INSERT INTO merchant_config (merchant, features, type, updated_ts) VALUES (?, ?, ?, ?)').run(merchant, '{}', 'restaurant', now);
const proof = TILL_COOKIE + '=' + await tillDeviceToken(SECRET, merchant, 0, device);
const post = async (handler, path, body, cookie) => {
  forgetTillEpoch(merchant, DB); forgetTillEpoch(merchant);
  const res = await handler({ env, request: new Request('https://fixture.invalid' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  }), waitUntil() {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const saleBody = (id) => ({ id, merchant, amountCents: 6800, amount: 68, method: 'cash', label: 'Comptoir', ref: 'T-' + id, ts: now, lines: [] });
const refundBody = (id) => ({ id, merchant, kind: 'refund', originalSaleId: 'sale-hiccup-0', amountCents: 500, method: 'cash', ts: now });

const clean = await post(sale, '/api/sale', saleBody('sale-hiccup-0'), proof);
ok(clean.status >= 200 && clean.status < 300 && clean.body.ok, 'a paired till\'s sale is accepted on a healthy database', JSON.stringify(clean));

failEpochReads = 1;
const blip = await post(sale, '/api/sale', saleBody('sale-hiccup-1'), proof);
ok(blip.status !== 403, 'one failed read of the till epoch does not answer forbidden', JSON.stringify(blip));
ok(blip.status >= 200 && blip.status < 300 && blip.body.ok, 'the sale is accepted on the second, good read', JSON.stringify(blip));

failEpochReads = 99;
const down = await post(sale, '/api/sale', saleBody('sale-hiccup-2'), proof);
ok(down.status === 503 && down.body.error === 'auth-verification-unavailable', 'a database that stays down answers 503, the till retries by itself', JSON.stringify(down));
failEpochReads = 0;

const stranger = await post(sale, '/api/sale', saleBody('sale-hiccup-3'), TILL_COOKIE + '=' + await tillDeviceToken(SECRET, 'another-store', 0, device));
ok(stranger.status === 403 && stranger.body.error === 'forbidden-merchant', 'another store\'s proof is still refused 403', JSON.stringify(stranger));

failEpochReads = 1;
const refundBlip = await post(refund, '/api/sale/refund', refundBody('refund-hiccup-1'), proof);
ok(refundBlip.body.error !== 'forbidden-merchant', 'refund · one failed read does not answer forbidden-merchant', JSON.stringify(refundBlip));
ok(refundBlip.body.error === 'manager-required', 'refund · it gets past the till check and stops at the missing manager approval', JSON.stringify(refundBlip));

failEpochReads = 99;
const refundDown = await post(refund, '/api/sale/refund', refundBody('refund-hiccup-2'), proof);
ok(refundDown.status === 503 && refundDown.body.error === 'auth-verification-unavailable', 'refund · a database that stays down answers 503', JSON.stringify(refundDown));
failEpochReads = 0;

const refundStranger = await post(refund, '/api/sale/refund', refundBody('refund-hiccup-3'), '');
ok(refundStranger.status === 403 && refundStranger.body.error === 'forbidden-merchant', 'refund · a device with no proof is still refused 403', JSON.stringify(refundStranger));

console.log(`till-verify-hiccup: ${passed} passed`);
