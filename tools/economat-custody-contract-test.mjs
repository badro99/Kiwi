#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = 5;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = fs.readFileSync(path.join(root, 'docs/specs/HOTEL_ECONOMAT.md'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'docs/specs/HOTEL_ECONOMAT_PLAN.md'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'functions/api/inventory/internal-requests.js'), 'utf8');

await check('current V1 custody remains confirmation-only', () => {
  assert.match(spec, /Économat holds the\s+goods until the department confirms receipt/);
  assert.match(spec, /confirmation writes one atomic Économat-to-unit\s+movement pair/);
});
await check('conditional dispatch has one explicit virtual custodian', () => {
  assert.match(spec, /transit:<request-id>/);
  assert.match(spec, /exactly one\s+custodian owns every quantity/);
});
await check('receipt and rejection both move stock out of transit atomically', () => {
  assert.match(spec, /Received:[\s\S]*one atomic pair moves the counted quantity from transit/);
  assert.match(spec, /Rejected, short or returned at the door:[\s\S]*from transit back to the Économat/);
});
await check('staff discovery is the executable gate, not a calendar phase', () => {
  assert.match(plan, /Discovery D must first establish whether staff recognise a real custody interval/);
  assert.match(plan, /otherwise keep confirmation-only custody/);
});
await check('the conditional transit model is not implemented in runtime code', () => {
  assert.doesNotMatch(runtime, /transit:<request-id>|transfer-dispatch|dispatch-out/);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('economat-custody-contract-test: ' + checks + ' checks passed\n');
