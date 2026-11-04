#!/usr/bin/env node
/* An invoice write that gets no answer in time may still have landed on the
 * server. The transport must report it as a timeout, never as "offline,
 * nothing was saved"; a request that never left stays "offline". */
import assert from 'node:assert/strict';

const { createTransport } = await import('../assets/invoicing/transport.js');
const noop = () => {};
const transport = createTransport({ TYPES: [], computeTotals: noop, getSeller: noop, iceProblem: noop, lsGet: () => null, lsSet: noop,
  merchantSlug: () => 'fixture-shop', ownData: () => true, shift: noop, today: () => '2026-11-04', venueId: () => 'fixture' });

const realTimeout = globalThis.setTimeout, realFetch = globalThis.fetch;
async function failure(fetchImpl, fireDeadline) {
  globalThis.fetch = fetchImpl;
  globalThis.setTimeout = (fn, ms) => realTimeout(fn, fireDeadline && ms <= 12000 ? 0 : ms);
  try { await transport.api('POST', { action: 'issue', id: 'inv_fixture' }); return null; }
  catch (error) { return error.code; }
  finally { globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout; }
}

assert.equal(await failure(() => new Promise(() => {}), true), 'timeout', 'a write with no answer before the deadline is a timeout, not offline');
assert.equal(await failure(async () => ({ ok: true, json: () => new Promise(() => {}) }), true), 'timeout', 'a stalled body keeps the uncertain-write timeout mapping');
// Owner ruling docs/decisions/2026-11-04-owner-delegated.md (invoices#0): a failed send is only
// "offline, nothing saved" when the browser reports offline; otherwise the write may have landed.
const setOnline = (v) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: v } });
setOnline(false);
assert.equal(await failure(() => Promise.reject(new TypeError('Failed to fetch')), false), 'offline', 'a send while the browser is offline is offline');
setOnline(true);
assert.equal(await failure(() => Promise.reject(new TypeError('Failed to fetch')), false), 'timeout', 'a connection lost while online may have committed: uncertain, not offline');
globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
await transport.api('POST', { action: 'issue', id: 'inv_fixture' }).then(() => assert.fail('should throw'), (e) => assert.equal(e.uncertainCommit, true, 'the uncertain write is flagged for callers'));
// A 2xx whose body cannot be parsed on a write is uncertain too: flagged so the caller invites a safe retry.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } });
await transport.api('POST', { action: 'issue', id: 'inv_fixture' }).then(() => assert.fail('should throw'), (e) => {
  assert.equal(e.code, 'timeout'); assert.equal(e.uncertainCommit, true, 'an unreadable 2xx write reply is flagged uncertainCommit');
});
globalThis.fetch = realFetch;
// One stable key per write intent: kept across retries of the same payload, renewed when it changes, dropped when done.
const k1 = transport.intentKey('pay:inv_1', 'a');
assert.equal(transport.intentKey('pay:inv_1', 'a'), k1, 'a retry of the same payload reuses the key');
assert.notEqual(transport.intentKey('pay:inv_1', 'b'), k1, 'a changed payload is a new intent');
const k2 = transport.intentKey('pay:inv_2', 'a');
assert.notEqual(k2, k1, 'another scope has its own key');
assert.match(k2, /^[A-Za-z0-9_-]{8,64}$/, 'the key fits the server format');
const k3 = transport.intentKey('pay:inv_2', 'a'); transport.intentDone('pay:inv_2');
assert.notEqual(transport.intentKey('pay:inv_2', 'a'), k3, 'a finished intent does not leak its key into the next one');
console.log('✓ invoicing timeout · an unanswered write is reported as uncertain, a failed send as offline');
