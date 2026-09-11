#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyRequestCommand, deriveRequestLabel } from '../functions/api/inventory/_internal-request.js';

const EXPECTED = 2;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }
const line = { itemId: 'cola', unit: 'bouteille', conversionSnapshot: { unit: 'bouteille', baseUnit: 'bouteille', basePerUnit: 1 }, qtyRequestedBase: 4, qtyRequested: 4, qtyApproved: 0, qtyPrepared: 0, qtyReceived: 0, resolution: 'pending', substituteFor: '', note: '' };
let state = { request: { id: 'r', state: 'open', revision: 1, reviewRevision: 0, acceptedRevision: 0 }, lines: [line] };
state = applyRequestCommand(state, 'review', { lines: [{ itemId: 'cola', qtyApproved: 4, resolution: 'approved' }], now: 1 }).value;
state = applyRequestCommand(state, 'accept', { now: 2 }).value;
const rereview = applyRequestCommand(state, 'review', { lines: [{ itemId: 'cola', qtyApproved: 3, resolution: 'reduced' }], now: 3 });
await check('an accepted open request may be reviewed again', () => assert.equal(rereview.ok, true));
await check('re-review advances review revision beyond acceptance and restores proposal state', () => {
  assert.ok(rereview.value.request.reviewRevision > rereview.value.request.acceptedRevision);
  assert.equal(deriveRequestLabel(rereview.value.request, rereview.value.lines), 'changes-proposed');
});
assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);

