#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRequestCommand, deriveRequestLabel } from '../functions/api/inventory/_internal-request.js';

const EXPECTED = 3;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }
const line = { itemId: 'cola', unit: 'bouteille', conversionSnapshot: { unit: 'bouteille', baseUnit: 'bouteille', basePerUnit: 1 }, qtyRequestedBase: 4, qtyRequested: 4, qtyApproved: 4, qtyPrepared: 0, qtyReceived: 0, resolution: 'approved', substituteFor: '', note: '' };
let state = { request: { id: 'r', state: 'open', revision: 3, reviewRevision: 2, acceptedRevision: 2, fulfilmentMethod: 'pickup', deliveryStartedTs: 0, disputed: false }, lines: [line] };
state = applyRequestCommand(state, 'prepare', { fulfilmentMethod: 'delivery', handover: true, lines: [{ itemId: 'cola', qtyPrepared: 2 }], now: 100 }).value;
await check('prepare writes fulfilment method and first delivery timestamp', () => {
  assert.equal(state.request.fulfilmentMethod, 'delivery');
  assert.equal(state.request.deliveryStartedTs, 100);
});
state = applyRequestCommand(state, 'prepare', { fulfilmentMethod: 'delivery', handover: true, lines: [{ itemId: 'cola', qtyPrepared: 4 }], now: 200 }).value;
await check('later partial handover does not overwrite the first delivery timestamp', () => assert.equal(state.request.deliveryStartedTs, 100));
await check('dispute reaches the label branch and all three projection columns are persisted', () => {
  const disputed = applyRequestCommand(state, 'dispute', { now: 300 }).value;
  assert.equal(deriveRequestLabel(disputed.request, disputed.lines), 'disputed');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'functions/api/inventory/internal-requests.js'), 'utf8');
  assert.match(source, /fulfilment_method = \?/);
  assert.match(source, /delivery_started_ts = \?/);
  assert.match(source, /disputed = \?/);
});
assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);

