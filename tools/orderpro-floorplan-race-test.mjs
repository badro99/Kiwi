#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

const tables = { '10': {
  status: 'ka-yaklo', covers: 2, elapsed: 7, server: 'S1',
  orderStartedAt: 1700000000000, timerSession: 'visit-10', orderNo: '42',
} };
const tableOrders = { '10': [{ name: 'Pasta', qty: 1, sent: true, orderProLine: 'op-1:0' }] };
const phoneSeats = new Map([['10', { session: 'visit-10', since: 1700000000000 }]]);
const phonePending = new Map([['10', 1]]);
const host = { innerHTML: '' };
const view = { querySelectorAll: () => [], querySelector: () => host, appendChild() {} };
const context = vm.createContext({
  tables, tableOrders, phoneSeats, phonePending, __realZoneOrder: [], __realPlan: null,
  storeIsReal: () => true,
  document: { querySelector: selector => selector === '.view-salle' ? view : null, createElement: () => host },
  caisseFloorPlan: () => ({
    zones: [{ id: 'z1', name: 'Salle' }],
    tables: [{ id: 'plan-10', num: '10', zone: 'z1', shape: 'square', seats: 4, x: 20, y: 30 }],
    elements: [], staff: [{ id: 'staff-1', name: 'Sara' }],
  }),
  tableKey: value => String(value).toUpperCase().replace(/\s+/g, '').trim(),
  designedCovers: tb => Number(tb.seats || 0),
  servers: { S1: { name: 'Sara' } },
  renderRealGrid() {}, emptyPlanHTML: () => '', window: {},
});
vm.runInContext(`${extractFunction('setupRealSalle')}\nsetupRealSalle();`, context);

assert.equal(tables['10'].status, 'ka-yaklo', 'cloud plan refresh cannot mark an active OrderPro table empty');
assert.equal(tables['10'].covers, 2, 'live party size survives designed-capacity refresh');
assert.equal(tables['10'].elapsed, 7);
assert.equal(tables['10'].orderStartedAt, 1700000000000);
assert.equal(tables['10'].timerSession, 'visit-10');
assert.equal(tables['10'].orderNo, '42');
assert.equal(tables['10'].server, 'S1');
assert.equal(tables['10'].shape, 'square', 'new plan geometry still wins');
assert.equal(tables['10'].x, 20);

console.log('✓ OrderPro table state survives a live floor-plan refresh');
