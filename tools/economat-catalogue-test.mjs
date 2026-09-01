#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  makeSession, SESS_COOKIE, TILL_COOKIE, TERMINAL_COOKIE, tillToken, terminalToken,
} from '../functions/auth/_lib.js';
import {
  RESTAURANT_UNITS, makeConversionSnapshot, quantityToBase, snapshotForUnit,
  validateEconomatCatalogue,
} from '../functions/api/inventory/_economat-catalogue.js';
import { resolveInventoryUnitScope } from '../functions/api/inventory/_unit-scope.js';
import { onRequestGet, onRequestPost } from '../functions/api/inventory/movements.js';

const SECRET = 'economat-catalogue-test-secret-32';
const MERCHANT = 'hotel-atlas';
const EXPECTED = 8;
let checks = 0;
process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});
async function check(name, fn) {
  await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`);
}

const catalogue = validateEconomatCatalogue({ items: [{
  itemId: 'water', name: 'Eau', baseUnit: 'bouteille',
  purchaseUnit: 'caisse', purchaseToBase: 12,
  issueUnit: 'bouteille', issueToBase: 1,
  consumptionUnit: 'bouteille', consumptionToBase: 1,
}] });
await check('the server recognises every canonical restaurant unit', () => {
  assert.equal(RESTAURANT_UNITS.length, 27);
});
await check('one case received and three bottles issued leave nine base bottles', () => {
  assert.equal(catalogue.ok, true);
  const item = catalogue.value.items[0];
  const received = quantityToBase(1, snapshotForUnit(item, 'caisse'));
  const issued = quantityToBase(3, snapshotForUnit(item, 'bouteille'));
  assert.equal(received - issued, 9);
});
await check('a precision-losing conversion is refused rather than rounded', () => {
  const snapshot = makeConversionSnapshot('g', 'mg');
  assert.equal(quantityToBase(0.1, snapshot), null);
});

const registry = { units: [
  { id: 'economat', kind: 'economat', locationId: 'loc-economat', active: true },
  { id: 'rooftop', kind: 'outlet', locationId: 'loc-rooftop', active: true },
  { id: 'retired', kind: 'outlet', locationId: 'loc-retired', active: false },
], terminalUnits: { 'term-rooftop': 'rooftop' } };

function makeDb() {
  let cursor = 100;
  return {
    prepare(sql) {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [], bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (query.startsWith('SELECT type FROM merchant_config')) return { type: 'hotel' };
          if (query.includes("feature = 'hotel-units'")) return { data: JSON.stringify(registry) };
          if (query.startsWith('SELECT account_id FROM merchant_config')) return { account_id: 'owner-1' };
          if (query.startsWith('SELECT business FROM accounts')) return { business: MERCHANT };
          if (query.startsWith('UPDATE inventory_sync_sequences')) return { value: ++cursor };
          if (query.startsWith('SELECT srv_ts AS cursor')) return { cursor };
          return null;
        },
        async all() {
          if (query.includes('SUM(qty_milli) AS qty_milli')) return { results: [
            { item_id: 'water', variant_id: '', location_id: 'loc-economat', qty_milli: 9000, cursor: 2 },
            { item_id: 'water', variant_id: '', location_id: 'loc-retired', qty_milli: 4000, cursor: 3 },
          ] };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return stmt;
    },
  };
}

const ownerCookie = `${SESS_COOKIE}=${await makeSession('owner-1', SECRET)}`;
const ownerRequest = (method = 'GET', body = null, query = '') => new Request(
  `https://kiwi.test/api/inventory/movements?merchant=${MERCHANT}${query}`,
  { method, headers: { cookie: ownerCookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) },
);
const tillCookie = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}; ${TERMINAL_COOKIE}=${await terminalToken(SECRET, MERCHANT, 'term-rooftop')}`;
const tillRequest = new Request(`https://kiwi.test/api/inventory/movements?merchant=${MERCHANT}`, {
  headers: { cookie: tillCookie },
});
const env = { AUTH_SECRET: SECRET, DB: makeDb() };
const ownerScope = await resolveInventoryUnitScope(ownerRequest(), env, MERCHANT);
const tillScope = await resolveInventoryUnitScope(tillRequest, env, MERCHANT, { terminalId: 'term-rooftop' });
await check('an inactive unit is visible to the hotel manager but not an outlet till', () => {
  assert.equal(ownerScope.permitsLocation('loc-retired'), true);
  assert.equal(tillScope.permitsLocation('loc-retired'), false);
});
await check('inactive unit movement policy allows only manager transfer-out', () => {
  assert.equal(ownerScope.permitsMovementLocation('loc-retired', 'transfer-out'), true);
  assert.equal(ownerScope.permitsMovementLocation('loc-retired', 'transfer-in'), false);
  assert.equal(ownerScope.permitsMovementLocation('loc-retired', 'sale'), false);
});

async function movement(reason, qty) {
  const request = ownerRequest('POST', { merchant: MERCHANT, movements: [{
    id: `mov-${reason}`, itemId: 'water', locationId: 'loc-retired', reason, qty,
  }] });
  return onRequestPost({ request, env: { AUTH_SECRET: SECRET, DB: makeDb() } });
}
await check('inactive transfer-in and sale are denied server-side', async () => {
  assert.equal((await movement('transfer-in', 1)).status, 403);
  assert.equal((await movement('sale', -1)).status, 403);
});
await check('manager can drain an inactive unit with transfer-out', async () => {
  assert.equal((await movement('transfer-out', -1)).status, 200);
});
const summary = await onRequestGet({ request: ownerRequest('GET', null, '&summary=1'), env: { AUTH_SECRET: SECRET, DB: makeDb() } });
const summaryBody = await summary.json();
await check('the consolidated manager balance includes stock stranded in an inactive unit', () => {
  assert.equal(summaryBody.balances.some((row) => row.locationId === 'loc-retired' && row.qty === 4), true);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);
process.stdout.write(`economat-catalogue-test: ${checks} checks passed\n`);
