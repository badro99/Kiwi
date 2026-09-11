#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyRequestCommand, deriveRequestLabel } from '../functions/api/inventory/_internal-request.js';

const EXPECTED = 3;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }
const base = { request: { id: 'r', state: 'open', revision: 1, reviewRevision: 0, acceptedRevision: 0 }, lines: [{ itemId: 'cola', unit: 'bouteille', conversionSnapshot: { unit: 'bouteille', baseUnit: 'bouteille', basePerUnit: 1 }, qtyRequestedBase: 4, qtyRequested: 4, qtyApproved: 0, qtyPrepared: 0, qtyReceived: 0, resolution: 'pending', substituteFor: '', substituteUnit: '', substituteConversionSnapshot: {}, substituteReason: '', note: '' }] };
await check('an incomplete substitution is rejected', () => assert.match(applyRequestCommand(base, 'review', { lines: [{ itemId: 'cola', qtyApproved: 4, resolution: 'substituted' }] }).error, /^bad-substitution:/));
await check('a substitute item cannot hide under an approved resolution', () => assert.match(applyRequestCommand(base, 'review', { lines: [{ itemId: 'cola', qtyApproved: 4, resolution: 'approved', substituteFor: 'water' }] }).error, /^resolution-substitution-mismatch:/));
await check('zero approval remains a visible refusal after acceptance', () => {
  let refused = applyRequestCommand(base, 'review', { lines: [{ itemId: 'cola', qtyApproved: 0, resolution: 'refused' }] }).value;
  refused = applyRequestCommand(refused, 'accept').value;
  assert.equal(refused.lines[0].substituteFor, '');
  assert.equal(deriveRequestLabel(refused.request, refused.lines), 'rejected');
});
assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);
