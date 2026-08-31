#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeSession, SESS_COOKIE, TILL_COOKIE, TERMINAL_COOKIE, tillToken, terminalToken,
} from '../functions/auth/_lib.js';
import { validateHotelUnits } from '../functions/api/_hotel-units.js';
import { resolveInventoryUnitScope } from '../functions/api/inventory/_unit-scope.js';
import { onRequestPost as postMovements } from '../functions/api/inventory/movements.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const SECRET = 'hotel-unit-scope-secret-32-bytes';
const MERCHANT = 'hotel-atlas';
let checks = 0;
let failures = 0;
function ok(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log('  ✓ ' + label);
  else { failures += 1; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

const registry = {
  units: [
    { id: 'u-economat', name: 'Économat', kind: 'economat', storeType: 'economat', locationId: 'loc-economat', active: true },
    { id: 'u-rooftop', name: 'Rooftop', kind: 'outlet', storeType: 'bar', locationId: 'loc-rooftop', active: true },
    { id: 'u-pool', name: 'Piscine', kind: 'outlet', storeType: 'bar', locationId: 'loc-pool', active: true },
    { id: 'u-housekeeping', name: 'Étages', kind: 'department', storeType: '', locationId: 'loc-housekeeping', active: true },
  ],
  terminalUnits: { 'terminal-rooftop': 'u-rooftop' },
};

function makeDb(type = 'hotel', doc = registry) {
  return {
    prepare(sql) {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (query.startsWith('SELECT type FROM merchant_config')) return { type };
          if (query.includes("FROM store_docs") && query.includes("feature = 'hotel-units'")) {
            return doc ? { data: JSON.stringify(doc) } : null;
          }
          if (query.startsWith('SELECT account_id FROM merchant_config')) return { account_id: 'owner-1' };
          if (query.startsWith('SELECT business FROM accounts')) return { business: MERCHANT };
          return null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

async function tillRequest(terminalId = 'terminal-rooftop', method = 'GET', body = null) {
  const till = await tillToken(SECRET, MERCHANT);
  const terminal = await terminalToken(SECRET, MERCHANT, terminalId);
  return new Request('https://kiwi.test/api/inventory/movements?merchant=' + MERCHANT, {
    method,
    headers: {
      cookie: `${TILL_COOKIE}=${till}; ${TERMINAL_COOKIE}=${terminal}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

console.log('■ Hotel unit scope (tools/hotel-unit-scope-test.mjs)');

const validRegistry = validateHotelUnits(registry);
ok('terminal assignment is retained by the hotel registry sanitizer',
  validRegistry.ok && validRegistry.value.terminalUnits['terminal-rooftop'] === 'u-rooftop');
const departmentAssignment = validateHotelUnits({ ...registry, terminalUnits: { t1: 'u-housekeeping' } });
ok('a caisse cannot be assigned to a department', !departmentAssignment.ok);
const missingAssignment = validateHotelUnits({ ...registry, terminalUnits: { t1: 'u-missing' } });
ok('a caisse cannot be assigned to an unknown unit', !missingAssignment.ok);

const tillReq = await tillRequest();
const tillScope = await resolveInventoryUnitScope(tillReq, { AUTH_SECRET: SECRET, DB: makeDb() }, MERCHANT, {
  terminalId: 'terminal-rooftop', unitId: 'u-pool',
});
ok('signed paired terminal resolves exactly one assigned outlet',
  tillScope.allowed && tillScope.role === 'till' && tillScope.unitIds.size === 1 && tillScope.unitId === 'u-rooftop');
ok('payload unitId cannot widen the resolved scope',
  tillScope.permitsUnit('u-rooftop') && !tillScope.permitsUnit('u-pool'));
ok('the assigned till can access only its outlet location',
  tillScope.permitsLocation('loc-rooftop') && !tillScope.permitsLocation('loc-pool'));

const unassignedReq = await tillRequest('terminal-pool');
const unassigned = await resolveInventoryUnitScope(unassignedReq, { AUTH_SECRET: SECRET, DB: makeDb() }, MERCHANT, {
  terminalId: 'terminal-pool',
});
ok('a signed but unassigned terminal is denied once hotel units exist',
  unassigned.scoped && !unassigned.allowed && unassigned.role === 'till');

const ownerToken = await makeSession('owner-1', SECRET);
const ownerReq = new Request('https://kiwi.test/api/inventory/movements?merchant=' + MERCHANT, {
  headers: { cookie: `${SESS_COOKIE}=${ownerToken}` },
});
const ownerScope = await resolveInventoryUnitScope(ownerReq, { AUTH_SECRET: SECRET, DB: makeDb() }, MERCHANT);
ok('owner session resolves every active hotel unit',
  ownerScope.allowed && ownerScope.role === 'manager' && ownerScope.unitIds.size === registry.units.length);

const restaurantScope = await resolveInventoryUnitScope(tillReq, { AUTH_SECRET: SECRET, DB: makeDb('restaurant') }, MERCHANT, {
  terminalId: 'terminal-rooftop',
});
ok('non-hotel merchants keep legacy unscoped behavior', !restaurantScope.scoped && restaurantScope.allowed);
const emptyScope = await resolveInventoryUnitScope(tillReq, { AUTH_SECRET: SECRET, DB: makeDb('hotel', { units: [] }) }, MERCHANT, {
  terminalId: 'terminal-rooftop',
});
ok('hotels with zero configured units keep legacy behavior', !emptyScope.scoped && emptyScope.allowed);

const foreignMovement = await postMovements({
  request: await tillRequest('terminal-rooftop', 'POST', {
    merchant: MERCHANT,
    terminalId: 'terminal-rooftop',
    movements: [{ id: 'sale-foreign', itemId: 'whisky', qty: -1, reason: 'sale', locationId: 'loc-pool' }],
  }),
  env: { AUTH_SECRET: SECRET, DB: makeDb() },
});
ok('automatic sale write to another outlet is rejected', foreignMovement.status === 403, String(foreignMovement.status));

const tillTransfer = await postMovements({
  request: await tillRequest('terminal-rooftop', 'POST', {
    merchant: MERCHANT,
    terminalId: 'terminal-rooftop',
    movements: [{ id: 'transfer-1', itemId: 'whisky', qty: -1, reason: 'transfer-out', locationId: 'loc-rooftop' }],
  }),
  env: { AUTH_SECRET: SECRET, DB: makeDb() },
});
ok('paired till still cannot create discretionary transfer movements', tillTransfer.status === 403, String(tillTransfer.status));

const movementsCode = source('functions/api/inventory/movements.js');
const countsCode = source('functions/api/inventory/counts.js');
ok('movement writes keep strict tenant resolution', /tenantFor\([^\n]+\{\s*strict:\s*true\s*\}/.test(movementsCode));
ok('count writes now use strict tenant resolution', /tenantFor\([^\n]+\{\s*strict:\s*true\s*\}/.test(countsCode));
ok('count reads and writes resolve server-side unit scope',
  (countsCode.match(/resolveInventoryUnitScope/g) || []).length >= 3 && countsCode.includes('scopeSql'));
ok('automatic reasons do not include transfer, loss or gift',
  !/AUTOMATIC_REASONS[\s\S]{0,220}'transfer-|AUTOMATIC_REASONS[\s\S]{0,220}'loss'|AUTOMATIC_REASONS[\s\S]{0,220}'gift'/.test(movementsCode));

if (failures) process.exit(1);
console.log(`  ✓ hotel unit scope (${checks} checks)`);
