#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/orderpro-inbox.js', import.meta.url), 'utf8');
const start = source.indexOf('  function setStatus(id, status, extra) {');
const end = source.indexOf('  /* ── L\'addition est réglée', start);
assert.ok(start >= 0 && end > start, 'the real inbox transition is available to exercise');
const makeSetStatus = new Function('state', 'merchant', 'window', 'paint', 'bridge', 'fetch',
  source.slice(start, end) + '\nreturn setStatus;');

function harness(order) {
  const state = { orders: { [order.id]: structuredClone(order) }, updating: {} };
  const sent = [];
  const bridged = [];
  const printed = [];
  let resolveFetch;
  let rejectFetch;
  const fetch = (...args) => {
    sent.push(args);
    return new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
  };
  const setStatus = makeSetStatus(state, () => 'pasta-corner',
    { KiwiCaisseKitchen: { confirmAccepted: (o) => printed.push(o) } },
    () => {}, (delta) => bridged.push(delta), fetch);
  return { state, sent, bridged, printed, setStatus,
    respond: (status, body) => resolveFetch({ status, json: () => Promise.resolve(body) }),
    fail: () => rejectFetch(new Error('network lost')) };
}

const original = { id: 'ord-confirm-test', status: 'pending', lines: [{ id: 'pasta', station: 'kitchen' }] };

{
  const h = harness(original);
  const pending = h.setStatus(original.id, 'accepted', { server: 'Ali' });
  assert.equal(h.state.orders[original.id].status, 'pending', 'pending stays visible until server confirmation');
  assert.equal(h.state.updating[original.id], true, 'duplicate taps are blocked while request is in flight');
  await h.setStatus(original.id, 'accepted', { server: 'Ali' });
  assert.equal(h.sent.length, 1, 'duplicate tap cannot send a second transition');
  h.respond(500, { ok: false, error: 'db-unavailable' });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(h.state.orders[original.id].status, 'pending', 'failed POST leaves the order actionable');
  assert.equal(h.state.updating[original.id], undefined);
  assert.equal(h.printed.length, 0, 'no kitchen print on failed transition');
}

{
  const h = harness(original);
  const pending = h.setStatus(original.id, 'accepted');
  h.state.orders[original.id] = { ...original, status: 'accepted' }; // another poll won the race
  h.fail();
  const result = await pending;
  assert.equal(result.httpStatus, 0);
  assert.equal(h.state.orders[original.id].status, 'accepted', 'network rollback cannot overwrite newer poll state');
}

{
  const h = harness(original);
  const pending = h.setStatus(original.id, 'accepted');
  h.respond(200, { ok: true, status: 'accepted' });
  assert.equal((await pending).ok, true);
  assert.equal(h.state.orders[original.id].status, 'accepted');
  assert.equal(h.printed.length, 1, 'kitchen print follows confirmed acceptance exactly once');
  assert.equal(h.bridged.at(-1)[0].status, 'accepted');
}

{
  const h = harness(original);
  const pending = h.setStatus(original.id, 'rejected', { pinAuthorized: true });
  h.respond(200, { ok: true, status: 'rejected' });
  assert.equal((await pending).ok, true);
  assert.equal(h.state.orders[original.id], undefined, 'confirmed refusal clears inbox card');
  assert.equal(h.bridged.at(-1)[0].status, 'rejected', 'caisse bridge receives terminal state');
}

console.log('✓ OrderPro inbox waits for server proof and survives failed or concurrent transitions');
