#!/usr/bin/env node
/* An invoice write that gets no answer in time may still have landed on the
 * server. The transport must report it as a timeout, never as "offline,
 * nothing was saved"; a request that never left stays "offline". */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/invoicing/transport.js', import.meta.url), 'utf8');
const { createTransport } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const noop = () => {};
const transport = createTransport({ TYPES: [], computeTotals: noop, getSeller: noop, iceProblem: noop, lsGet: () => null, lsSet: noop,
  merchantSlug: () => 'fixture-shop', ownData: () => true, shift: noop, today: () => '2026-11-04', venueId: () => 'fixture' });

const realTimeout = globalThis.setTimeout, realFetch = globalThis.fetch;
async function failure(fetchImpl, fireDeadline) {
  globalThis.fetch = fetchImpl;
  globalThis.setTimeout = (fn, ms) => realTimeout(fn, fireDeadline && ms === 12000 ? 0 : ms);
  try { await transport.api('POST', { action: 'issue', id: 'inv_fixture' }); return null; }
  catch (error) { return error.code; }
  finally { globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout; }
}

assert.equal(await failure(() => new Promise(() => {}), true), 'timeout', 'a write with no answer before the deadline is a timeout, not offline');
assert.equal(await failure(() => Promise.reject(new TypeError('Failed to fetch')), false), 'offline', 'a request that never left is offline');
console.log('✓ invoicing timeout · an unanswered write is reported as uncertain, a failed send as offline');
