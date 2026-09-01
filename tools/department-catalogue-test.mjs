#!/usr/bin/env node
import assert from 'node:assert/strict';
import { employeeToken, employeeCookie } from '../functions/auth/_lib.js';
import {
  departmentAllowsItem, validateDepartmentCatalogue,
} from '../functions/api/inventory/_department-catalogue.js';
import { onRequestGet, onRequestPost } from '../functions/api/inventory/department-catalogue.js';

const SECRET = 'department-catalogue-secret-32b';
const MERCHANT = 'hotel-atlas';
const EXPECTED = 7;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const units = { units: [
  { id: 'economat', name: 'Economat', kind: 'economat', locationId: 'loc-economat', active: true },
  { id: 'rooftop', name: 'Rooftop', kind: 'outlet', storeType: 'bar', locationId: 'loc-rooftop', active: true },
] };
const central = { items: [{
  itemId: 'water', name: 'Eau', baseUnit: 'bouteille', active: true,
  purchaseUnit: 'caisse', purchaseToBase: 12,
  issueUnit: 'bouteille', issueToBase: 1,
  consumptionUnit: 'bouteille', consumptionToBase: 1,
}] };

function makeDb() {
  const docs = new Map([
    ['hotel-units', { data: JSON.stringify(units), rev: 1, updated_ts: 1 }],
    ['economat-catalogue', { data: JSON.stringify(central), rev: 1, updated_ts: 1 }],
    ['employee-access', { data: JSON.stringify({ members: [
      { id: 'bartender', firstName: 'Sara', function: 'Barman', department: 'Rooftop' },
      { id: 'bar-manager', firstName: 'Nora', function: 'Responsable', department: 'Rooftop' },
    ] }), rev: 1, updated_ts: 2 }],
    ['team', { data: JSON.stringify({ members: [] }), rev: 1, updated_ts: 1 }],
  ]);
  return {
    docs,
    prepare(sql) {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [], bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (query.startsWith('SELECT type FROM merchant_config')) return { type: 'hotel' };
          if (query.includes('FROM store_docs')) {
            const feature = query.includes("feature = 'hotel-units'") ? 'hotel-units' : stmt.args[1];
            return docs.get(feature) || null;
          }
          return null;
        },
        async all() {
          if (query.includes("feature IN ('employee-access', 'team')")) return { results: [
            { feature: 'employee-access', ...docs.get('employee-access') },
            { feature: 'team', ...docs.get('team') },
          ] };
          return { results: [] };
        },
        async run() {
          if (query.startsWith('INSERT INTO store_docs')) {
            docs.set(stmt.args[1], { data: stmt.args[2], rev: stmt.args[3], updated_ts: stmt.args[4] });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

const db = makeDb();
async function requestFor(staffId, method = 'GET', body = null) {
  const token = await employeeToken(SECRET, { merchant: MERCHANT, staffId });
  const query = `merchant=${MERCHANT}&unitId=rooftop`;
  return new Request(`https://kiwi.test/api/inventory/department-catalogue?${query}`, {
    method, headers: { cookie: employeeCookie(token).split(';')[0], ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const validData = { unitId: 'rooftop', items: [{
  itemId: 'water', visibility: 'visible', countingUnit: 'bouteille',
  packaging: { unit: 'caisse', quantity: 1 }, countingFrequency: 'daily',
  active: true, recipeUse: false,
}] };

const beforeResponse = await onRequestGet({ request: await requestFor('bartender'), env: { AUTH_SECRET: SECRET, DB: db } });
const before = await beforeResponse.json();
await check('bartender cannot see or request an item before a manager approves it', () => {
  assert.deepEqual(before.data.items, []);
  assert.equal(departmentAllowsItem(before.data, 'water', 'request'), false);
});
await check('an outlet employee cannot add an item server-side', async () => {
  const response = await onRequestPost({ request: await requestFor('bartender', 'POST', {
    merchant: MERCHANT, unitId: 'rooftop', baseRev: 0, data: validData,
  }), env: { AUTH_SECRET: SECRET, DB: db } });
  assert.equal(response.status, 403);
});
await check('an item absent from the central catalogue is rejected', () => {
  const result = validateDepartmentCatalogue({ unitId: 'rooftop', items: [{
    ...validData.items[0], itemId: 'ghost-item',
  }] }, central, 'rooftop');
  assert.equal(result.error, 'central-item-required:ghost-item');
});
await check('par and reorder shortcuts are omitted rather than accepted', () => {
  const result = validateDepartmentCatalogue({ unitId: 'rooftop', items: [{
    ...validData.items[0], par: 12,
  }] }, central, 'rooftop');
  assert.equal(result.error, 'unsupported-field:par');
});
await check('a department manager can add an approved central item', async () => {
  const response = await onRequestPost({ request: await requestFor('bar-manager', 'POST', {
    merchant: MERCHANT, unitId: 'rooftop', baseRev: 0, data: validData,
  }), env: { AUTH_SECRET: SECRET, DB: db } });
  assert.equal(response.status, 200);
});
const afterResponse = await onRequestGet({ request: await requestFor('bartender'), env: { AUTH_SECRET: SECRET, DB: db } });
const after = await afterResponse.json();
await check('after manager approval the bartender can count and request the item', () => {
  assert.equal(after.data.items.length, 1);
  assert.equal(departmentAllowsItem(after.data, 'water', 'request'), true);
});
await check('each department catalogue occupies its own store_docs feature row', () => {
  assert.equal(db.docs.has('hotel-dept:rooftop'), true);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);
process.stdout.write(`department-catalogue-test: ${checks} checks passed\n`);
