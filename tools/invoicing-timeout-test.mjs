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
globalThis.fetch = realFetch;
console.log('✓ invoicing timeout · an unanswered write is reported as uncertain, a failed send as offline');
