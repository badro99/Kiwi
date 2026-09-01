#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyRequestCommand, deriveRequestLabel, fulfilmentConversionSnapshot, fulfilmentItemId,
} from '../functions/api/inventory/_internal-request.js';

const EXPECTED = 8;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const originalSnapshot = { unit: 'bouteille', baseUnit: 'bouteille', basePerUnit: 1 };
const substituteSnapshot = { unit: 'caisse', baseUnit: 'bouteille', basePerUnit: 6 };
const originalLine = {
  itemId: 'water-75cl', unit: 'bouteille', conversionSnapshot: originalSnapshot,
  qtyRequestedBase: 12, qtyRequested: 12, qtyApproved: 0, qtyPrepared: 0, qtyReceived: 0,
  resolution: 'pending', substituteFor: '', substituteUnit: '',
  substituteConversionSnapshot: {}, substituteReason: '', note: '',
};
let state = {
  request: { id: 'req-sub', state: 'open', revision: 1, reviewRevision: 0, acceptedRevision: 0 },
  lines: [originalLine],
};
const reviewed = applyRequestCommand(state, 'review', {
  lines: [{
    itemId: 'water-75cl', resolution: 'substituted', qtyApproved: 2,
    substituteFor: 'water-1l-case', substituteUnit: 'caisse',
    substituteConversionSnapshot: substituteSnapshot,
    substituteReason: 'Format demande epuise',
  }],
});
await check('review preserves the requested item and records the alternative contract', () => {
  assert.equal(reviewed.ok, true);
  const line = reviewed.value.lines[0];
  assert.equal(line.itemId, 'water-75cl');
  assert.equal(line.qtyRequested, 12);
  assert.equal(line.substituteFor, 'water-1l-case');
  assert.equal(line.qtyApproved, 2);
  assert.equal(line.substituteUnit, 'caisse');
  assert.equal(line.substituteReason, 'Format demande epuise');
});
await check('substitution is a proposed change until the requester accepts it', () => {
  assert.equal(deriveRequestLabel(reviewed.value.request, reviewed.value.lines), 'changes-proposed');
  const blocked = applyRequestCommand(reviewed.value, 'prepare', {
    lines: [{ itemId: 'water-75cl', qtyPrepared: 2 }],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'changes-not-accepted');
});
await check('missing substitute reason is refused', () => {
  const result = applyRequestCommand(state, 'review', {
    lines: [{
      itemId: 'water-75cl', resolution: 'substituted', qtyApproved: 2,
      substituteFor: 'water-1l-case', substituteUnit: 'caisse',
      substituteConversionSnapshot: substituteSnapshot,
    }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /^bad-substitution:/);
});
state = applyRequestCommand(reviewed.value, 'accept').value;
state = applyRequestCommand(state, 'prepare', {
  lines: [{ itemId: 'water-75cl', qtyPrepared: 2 }],
}).value;
state = applyRequestCommand(state, 'confirm', {
  lines: [{ itemId: 'water-75cl', qtyReceived: 2 }],
}).value;
await check('accepted substitute can be prepared and received against the original request line', () => {
  assert.equal(state.lines[0].qtyPrepared, 2);
  assert.equal(state.lines[0].qtyReceived, 2);
  assert.equal(state.request.state, 'closed');
});
await check('inventory fulfilment resolves to the substitute identity', () => {
  assert.equal(fulfilmentItemId(state.lines[0]), 'water-1l-case');
  assert.deepEqual(fulfilmentConversionSnapshot(state.lines[0]), substituteSnapshot);
});
await check('the route posts substitute stock and persists the trusted snapshot', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'functions/api/inventory/internal-requests.js'), 'utf8');
  assert.match(source, /const itemId = fulfilmentItemId\(after\)/);
  assert.match(source, /substitute_conversion_snapshot = \?/);
  assert.match(source, /context\.actor\.id, context\.actor\.name, JSON\.stringify\(commandData\)/);
});
await check('the additive migration preserves existing request lines', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(path.join(root, 'migrations/2026-09-01-hotel-request-substitutions.sql'), 'utf8');
  assert.equal((sql.match(/ALTER TABLE hotel_internal_request_lines/g) || []).length, 3);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM/);
});
await check('unknown resolutions still fail closed', () => {
  const result = applyRequestCommand({
    request: { ...reviewed.value.request, state: 'open' },
    lines: [originalLine],
  }, 'review', {
    lines: [{ itemId: 'water-75cl', resolution: 'swapped', qtyApproved: 1 }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'bad-review-line');
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('economat-substitution-test: ' + checks + ' checks passed\n');
