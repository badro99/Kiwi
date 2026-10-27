#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { businessBoundary } from '../functions/api/_business-day.js';
import * as endpoint from '../functions/api/z-reconciliation.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'z-reconcile-fixture', secret = 'z-reconcile-only';
db.prepare("INSERT INTO merchant_config(merchant,features,status,updated_ts) VALUES (?,'{}','active',?)")
  .run(merchant, Date.now());
db.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES ('z-owner','z@example.test',?,'','',?)")
  .run(merchant, Date.now());
db.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('z-owner', merchant);
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values; return this; },
  first() { return db.prepare(sql).get(...args) || null; },
  all() { return { results: db.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: db.prepare(sql).run(...args) }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(body, withCookie = true) {
  const request = new Request('https://kiwi.test/api/z-reconciliation', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ merchant, terminalId: 'till-fixture', ...body }) });
  const response = await endpoint.onRequestPost({ env, request });
  return { status: response.status, body: await response.json() };
}
const day = '2026-02-14'; // Casablanca's 25-hour winter-time business day
const ts = businessBoundary(day) + 1000;
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,40,4000,'cash',?)")
  .run('sale-one', merchant, ts);
const report = { day, sales: [
  { id: 'sale-one', amountCents: 4000, method: 'cash' },
  { id: 'sale-missing', amountCents: 5700, method: 'card' },
], count: 2, totalCents: 9700 };
assert.equal((await post(report, false)).status, 403, 'only paired till can submit Z');
assert.equal((await post({ ...report, day: '2026-02-31' })).status, 400, 'invalid civil day is rejected');
assert.equal((await post({ ...report, totalCents: 9800 })).status, 400, 'reported total must match receipt list');
let result = await post(report);
assert.equal(result.status, 200, JSON.stringify(result));
assert.deepEqual(result.body.missing, ['sale-missing']);
assert.equal(result.body.gapCents, 5700);
assert.equal(result.body.status, 'mismatch');
assert.equal(db.prepare('SELECT missing_count FROM z_reconciliations WHERE merchant=?').get(merchant).missing_count, 1);
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,57,5700,'card',?)")
  .run('sale-missing', merchant, ts + 1000);
result = await post(report);
assert.equal(result.body.status, 'matched');
assert.equal(result.body.missing.length, 0);
assert.equal(db.prepare('SELECT status FROM z_reconciliations WHERE merchant=?').get(merchant).status, 'matched');
// Another terminal's sale is not an "extra" against this terminal's Z.
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,23,2300,'cash',?)")
  .run('other-terminal-sale', merchant, ts + 2000);
result = await post({ ...report, closed: false });
assert.equal(result.body.status, 'matched');
assert.equal(result.body.serverCents, 9700);
assert.equal(result.body.closed, false);
const owner = `${SESS_COOKIE}=${await makeSession('z-owner', secret)}`;
db.prepare("INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,'dayreports',?,1,?)")
  .run(merchant, JSON.stringify({ days: { [day]: { gross: 150, txns: 4, cutoff: 5, closedCount: 1 } } }), Date.now());
const read = await endpoint.onRequestGet({ env, request: new Request(
  'https://kiwi.test/api/z-reconciliation?merchant=' + merchant, { headers: { Cookie: owner } }) });
assert.equal(read.status, 200);
const readBody = await read.json();
assert.equal(readBody.rows[0].status, 'matched');
assert.equal(readBody.rows[0].closed, false);
assert.equal(readBody.dayReports, undefined, 'legacy aggregate is not a comparison');
const foreign = await endpoint.onRequestGet({ env, request: new Request(
  'https://kiwi.test/api/z-reconciliation?merchant=another-store', { headers: { Cookie: owner } }) });
assert.equal(foreign.status, 403, 'owner cannot read another merchant Z');
// A durable receipt that no manifest of the day claims is NAMED on a closed Z,
// as information only: the ledger cannot tell a till receipt from a waiter,
// delivery or dashboard one, so it never turns the till's Z into a mismatch.
result = await post(report);
assert.equal(result.body.status, 'matched', 'an unattributable receipt never fails a till Z');
assert.deepEqual(result.body.omitted, ['other-terminal-sale']);
assert.equal(result.body.omittedCents, 2300);
assert.equal(result.body.serverCents, 9700);
assert.equal(result.body.gapCents, 0);
// Another merchant's manifest can never claim this merchant's receipt.
db.prepare(`INSERT INTO z_reconciliations
  (merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,
   missing_count,missing_cents,mismatch_count,extra_count,status,result_json,updated_ts)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('another-store', day, 'till-two', 1, 2300, 0, 0, 1, 2300, 0, 0,
    'mismatch', JSON.stringify({ closed: true, manifest: [{ id: 'other-terminal-sale', amountCents: 2300, method: 'cash' }] }), Date.now());
result = await post(report);
assert.deepEqual(result.body.omitted, ['other-terminal-sale'], 'tenant isolation: foreign Z claims nothing');
// Once the other till of the SAME merchant declares it, the receipt is its own.
result = await post({ terminalId: 'till-two', day, sales: [{ id: 'other-terminal-sale', amountCents: 2300, method: 'cash' }],
  count: 1, totalCents: 2300 });
assert.equal(result.body.status, 'matched', 'receipts claimed by the other till of this merchant are not omitted');
assert.deepEqual(result.body.omitted, []);
result = await post(report);
assert.equal(result.body.status, 'matched');
assert.deepEqual(result.body.omitted, []);
assert.equal(result.body.serverCents, 9700);
// A sale just before the next 05:00 boundary belongs to this day; the next
// second does not. No fixed UTC offset may be used across the winter shift.
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,10,1000,'cash',?)")
  .run('next-day', merchant, businessBoundary('2026-02-15'));
result = await post(report);
assert.equal(result.body.status, 'matched');
// The merchant closes at 07:00, not the historical fallback 05:00. A 06:00
// receipt must stay on yesterday's Z even when the server is in another zone.
if (!db.prepare("SELECT 1 FROM pragma_table_info('merchant_config') WHERE name = 'business_cutoff'").get()) {
  db.exec('ALTER TABLE merchant_config ADD COLUMN business_cutoff INTEGER');
}
db.prepare('UPDATE merchant_config SET business_cutoff=7 WHERE merchant=?').run(merchant);
const longDay = '2026-02-16';
const beforeSeven = businessBoundary('2026-02-17', 5) + 3600000;
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,10,1000,'cash',?)")
  .run('late-night-sale', merchant, beforeSeven);
result = await post({ day: longDay, cutoff: 7, sales: [{ id: 'late-night-sale', amountCents: 1000, method: 'cash' }], count: 1, totalCents: 1000 });
assert.equal(result.body.status, 'matched', 'merchant cutoff, not 05:00, decides the Z day');
const oldJob = await post({ day: longDay, terminalId: 'old-job', sales: [
  { id: 'late-night-sale', amountCents: 1000, method: 'cash' }], count: 1, totalCents: 1000 });
assert.equal(oldJob.body.cutoff, 5, 'a durable pre-upgrade Z keeps its original 05:00 comparison');
assert.equal(oldJob.body.status, 'mismatch', 'old jobs are not silently reinterpreted under a new cutoff');

// One day has a void, two independent split parts, and a partial refund.
const netDay = '2026-02-18', netTs = businessBoundary(netDay, 7) + 1000;
for (const [id, cents, method, channel, voided] of [
  ['bill-one', 1000, 'cash', 'caisse', false],
  ['bill-split-1', 200, 'card', 'caisse', false],
  ['bill-split-2', 300, 'card', 'caisse', false],
  ['refund-one', -500, 'cash', 'refund', false],
  ['void-one', 700, 'cash', 'caisse', true],
]) db.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts,channel,void_ts) VALUES(?,?,?,?,?,?,?,?)')
  .run(id, merchant, cents / 100, cents, method, netTs, channel, voided ? netTs + 1 : null);
const netManifest = [
  { id: 'bill-one', amountCents: 1000, method: 'cash' },
  { id: 'bill-split-1', amountCents: 200, method: 'card' },
  { id: 'bill-split-2', amountCents: 300, method: 'card' },
  { id: 'refund-one', amountCents: -500, method: 'cash', kind: 'refund' },
];
result = await post({ day: netDay, cutoff: 7, sales: netManifest, count: 3, totalCents: 1000, closed: true });
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.status, 'matched', 'refund nets the same Z measure as the ledger');
assert.equal(result.body.serverCents, 1000);
const netRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${netDay}`, { headers: { Cookie: owner } }) });
const netSummary = (await netRead.json()).daySummary;
assert.equal(netSummary.recordedCents, 1000, 'dashboard reference is net of refund and void');
assert.equal(netSummary.recordedCount, 3, 'split parts count separately; refund and void do not');
assert.equal(netSummary.gapCents, 0);

// If a paid receipt never reached the outbox, do not invent its identity.
// Publish the unexplained Z delta and make the dashboard explicitly warn.
result = await post({ day: netDay, terminalId: 'other-till', cutoff: 7, sales: [netManifest[0]],
  count: 2, totalCents: 1700, unqueuedCount: 1, unqueuedCents: 700, closed: true });
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.status, 'mismatch');
assert.equal(result.body.unqueuedCount, 1);
const gapRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${netDay}`, { headers: { Cookie: owner } }) });
const gapSummary = (await gapRead.json()).daySummary;
assert.ok(gapSummary.unqueuedCount > 0, 'dashboard must surface a receipt absent from the outbox');
assert.ok(gapSummary.gapCents !== 0, 'unexplained Z delta cannot look matched');
result = await post({ day: netDay, terminalId: 'other-till', cutoff: 5, sales: [netManifest[0]],
  count: 2, totalCents: 1700, unqueuedCount: 1, unqueuedCents: 700, closed: true });
assert.equal(result.status, 200);
const conflictRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${netDay}`, { headers: { Cookie: owner } }) });
const conflictSummary = (await conflictRead.json()).daySummary;
assert.equal(conflictSummary.source, 'ambiguous-z', 'two till cutoffs cannot silently claim a matched Z');
assert.equal(conflictSummary.ambiguousReason, 'cutoff-conflict');
assert.equal(conflictSummary.gapCents, null, 'a conflicting day boundary cannot produce a trusted numeric gap');
const openDay = '2026-02-19', openTs = businessBoundary(openDay, 7) + 1000;
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,10,1000,'cash',?)")
  .run('open-sale', merchant, openTs);
result = await post({ day: openDay, sales: [
  { id: 'open-sale', amountCents: 1000, method: 'cash' },
  { id: 'rejected-sale', amountCents: 500, method: 'card' },
], count: 2, totalCents: 1500, closed: false,
blocked: [{ id: 'rejected-sale', amountCents: 500, method: 'card', ts: openTs, reason: 'sale-conflict', status: 409 }] });
assert.equal(result.body.status, 'mismatch');
const openRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${openDay}`, { headers: { Cookie: owner } }) });
const openSummary = (await openRead.json()).daySummary;
assert.equal(openSummary.source, 'open-z', 'provisional comparison stays visible during service');
assert.equal(openSummary.gapCents, 500);
assert.equal(openSummary.missingCount, 1);
assert.equal(openSummary.blocked.length, 1);
// Even before a provisional Z reaches D1, the till heartbeat must reveal a
// rejected paid receipt as a scoped, non-fabricated dashboard gap.
const beatDay = '2026-02-20', beatTs = businessBoundary(beatDay, 7) + 1000;
db.prepare(`INSERT INTO operational_commands
  (id,merchant,domain,action,status,idempotency_key,payload,created_ts,updated_ts)
  VALUES (?,?,'device','heartbeat','done',?,?,?,?)`).run('beat-one', merchant, 'beat-one',
    JSON.stringify({ deviceId: 'terminal-z', sync: { pending: 0,
      blockedEntries: [{ id: 'rejected-without-z', amountCents: 800, method: 'card', ts: beatTs, reason: 'sale-conflict' }] } }),
    beatTs, beatTs);
const beatRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${beatDay}`, { headers: { Cookie: owner } }) });
const beatSummary = (await beatRead.json()).daySummary;
assert.equal(beatSummary.source, 'sync-gap');
assert.equal(beatSummary.gapCents, 800);
assert.equal(beatSummary.missingCount, 1);
assert.equal(beatSummary.blocked[0].id, 'rejected-without-z');
const legacyDay = '2026-02-21';
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,6,600,'cash',?)")
  .run('legacy-next-day', merchant, businessBoundary('2026-02-22', 5) + 3600000);
db.prepare(`INSERT INTO z_reconciliations
  (merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,
   missing_count,missing_cents,mismatch_count,extra_count,status,result_json,updated_ts)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(merchant, legacyDay, 'legacy-till', 0, 0, 0, 0,
    0, 0, 0, 0, 'matched', JSON.stringify({ closed: true, manifest: [], missing: [] }), Date.now());
const legacyRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${legacyDay}`, { headers: { Cookie: owner } }) });
const legacySummary = (await legacyRead.json()).daySummary;
assert.equal(legacySummary.cutoff, 5, 'old Z keeps the historical 05:00 boundary after the store changes hours');
assert.equal(legacySummary.recordedCents, 0);
// A till whose hours are stale still closes at 05:00 while the store publishes
// 07:00 (merchantCutoff). The server compares on the STORE's day, as /api/sale
// files a bill on it, never on the window the till sent; the Z cannot read as
// matched, and the dashboard says why instead of showing a trusted gap.
const staleDay = '2026-03-10';
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,9,900,'cash',?)")
  .run('stale-window-sale', merchant, businessBoundary('2026-03-11', 5) + 3600000);
result = await post({ day: staleDay, terminalId: 'stale-till', cutoff: 5, sales: [], count: 0, totalCents: 0 });
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.cutoff, 7, 'the store cutoff, not the till-supplied one, decides the compared window');
assert.equal(result.body.tillCutoff, 5, 'the window the till used stays on record');
assert.deepEqual(result.body.omitted, ['stale-window-sale'], 'a 06:00 receipt belongs to the 07:00 store day');
assert.equal(result.body.status, 'mismatch', 'a Z counted on another window never reads as matched');
const staleRead = await endpoint.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${staleDay}`, { headers: { Cookie: owner } }) });
const staleSummary = (await staleRead.json()).daySummary;
assert.equal(staleSummary.cutoff, 7);
assert.equal(staleSummary.ambiguousReason, 'cutoff-conflict', 'the dashboard names the stale boundary');
assert.equal(staleSummary.gapCents, null, 'and offers no trusted numeric gap for it');
db.close();
console.log('✓ Z reconciliation: till auth, missing receipt, repair, idempotent upsert, winter boundary');
