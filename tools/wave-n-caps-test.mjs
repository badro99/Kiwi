import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cleanSheet } from '../functions/api/foodcost.js';
import { parseIcal } from '../functions/api/hotel/_channels.js';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let failures = 0;
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
test('employee complete UI and metrics in FR/EN/AR', () => {
  for (const lang of ['fr', 'en', 'ar']) {
    const card = { innerHTML: '' }, events = {};
    const document = { documentElement: { lang }, getElementById: () => card, addEventListener: (n, fn) => { events[n] = fn; } };
    const window = { addEventListener() {} };
    vm.runInNewContext(read('assets/employee-planning.js'), { window, document, Intl, Date, setInterval() {} });
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: 'row-' + i, day: '2099-12-01', start: '09:00', end: '17:00', shift: {}, status: 'open' }));
    events['kiwi-employee-data']({ detail: { employee: {}, schedule: Object.fromEntries(rows.map((r, i) => ['2099-12-' + String(i + 1).padStart(2, '0'), r])), planning: {
      openShifts: [...rows, { ...rows[0], id: 'owned-open', mine: true, status: 'claimed' }],
      swapRequests: [...rows, { ...rows[0], id: 'owned-swap', mine: true, status: 'claimed' }],
      requests: rows.map(r => ({ ...r, type: 'leave', status: 'pending', startDate: r.day, endDate: r.day }))
    } } });
    for (const attr of ['data-kep-open', 'data-kep-swap-claim', 'data-kep-cancel', 'data-kep-swap'])
      test('employee ' + lang + ' ' + attr, () => assert.equal((card.innerHTML.match(new RegExp(attr + '="', 'g')) || []).length, 9, attr));
    test('employee ' + lang + ' late open cancellation', () => assert.ok(card.innerHTML.includes('data-kep-op-cancel="owned-open"')));
    test('employee ' + lang + ' late swap cancellation', () => assert.ok(card.innerHTML.includes('data-kep-op-cancel="owned-swap"')));
    const metrics = [...card.innerHTML.matchAll(/kep-metric"><b>(\d+)<\/b>/g)].map(m => Number(m[1]));
    test('employee ' + lang + ' complete counters', () => assert.deepEqual(metrics, [9, 18, 11]));
  }
});
test('pressing projects all 501 orders and balances', () => {
  const store = new Map(), window = { addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(read('assets/pressing-ops.js'), { window, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, CustomEvent: class {}, setTimeout() {}, setInterval() {} });
  const ops = window.KiwiPressingOps;
  const orders = Array.from({ length: 501 }, (_, i) => ({ id: 'order-' + i, total: 10, pay: { mode: 'pickup', paid: 0 }, pieces: [{ pid: 'p-' + i, status: 'recu' }] }));
  assert.equal(ops.replace(orders, {}, 'caps-test'), true);
  const summary = ops.summary('caps-test');
  assert.equal(summary.orders.length, 501);
  assert.equal(summary.active, 501);
  assert.equal(summary.due, 5010);
  assert.ok(summary.orders.some(o => o.id === 'order-500'));
});
test('foodcost rejects 81 lines and preserves 80', () => {
  assert.equal(cleanSheet({ lines: Array.from({ length: 80 }, () => ({})) }).lines.length, 80);
  assert.throws(() => cleanSheet({ lines: Array.from({ length: 81 }, () => ({})) }), /too-many-lines/);
});
test('hotel rejects 1001 events and preserves 1000', () => {
  const calendar = n => 'BEGIN:VCALENDAR\n' + Array.from({ length: n }, (_, i) => `BEGIN:VEVENT\nUID:event-${i}\nDTSTART:20991201\nDTEND:20991202\nEND:VEVENT\n`).join('') + 'END:VCALENDAR';
  assert.equal(parseIcal(calendar(1000)).length, 1000);
  assert.throws(() => parseIcal(calendar(1001)), /feed-too-many-events/);
});
if (failures) process.exitCode = 1;
