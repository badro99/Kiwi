import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8');
const listeners = {};
const ctx = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  Date,
  Math,
  JSON,
  location: { origin: 'https://kiwi-os.com' },
  navigator: {},
  document: { addEventListener(type, fn) { listeners[type] = fn; } },
  addEventListener(type, fn) { listeners[type] = fn; },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'assets/reservations.js' });

const R = ctx.KiwiReservations;
assert.ok(R, 'exports the reservation domain');
let controls = 0;
const ok = (condition, message) => { assert.ok(condition, message); controls += 1; };

const base = () => ({
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [{ id: 'svc-cut', name: 'Coupe', duration: 30, price: 80, deposit: 20, capacity: 1, resourceIds: [], active: true, updatedAt: 1 }],
  resources: [{ id: 'res-a', name: 'Amal', kind: 'person', capacity: 1, active: true, week: null, updatedAt: 1 }],
  blocked: [],
  bookings: [],
});

const blank = R.blank();
ok(blank.v === 1 && Array.isArray(blank.bookings), 'blank document has a stable schema');
ok(blank.settings.published === false, 'public booking is closed by default');

const dirty = R.normalize({
  settings: { minNoticeMinutes: -5, windowDays: 9999, slotStep: 7 },
  services: [{ id: 'svc', name: '  Soin  ', duration: 1, price: -20, deposit: -1 }],
  resources: [{ id: 'room', name: ' Cabine ', kind: 'spaceship', capacity: 0 }],
  bookings: [{ id: 'bad', customer: { name: '' }, serviceId: 'svc', startAt: 2, endAt: 1 }],
});
ok(dirty.settings.minNoticeMinutes === 0, 'minimum notice is bounded');
ok(dirty.settings.windowDays === 365, 'booking window is bounded');
ok(dirty.settings.slotStep === 15, 'unsupported slot steps fall back safely');
ok(dirty.services[0].name === 'Soin' && dirty.services[0].duration === 5, 'service fields are normalized');
ok(dirty.services[0].price === 0 && dirty.services[0].deposit === 0, 'money cannot be negative');
ok(dirty.resources[0].kind === 'person' && dirty.resources[0].capacity === 1, 'resource fields are normalized');
ok(dirty.bookings.length === 0, 'invalid bookings are discarded');

const left = base();
const right = base();
left.services[0].name = 'Ancien'; left.services[0].updatedAt = 2;
right.services[0].name = 'Nouveau'; right.services[0].updatedAt = 3;
right.resources.push({ id: 'res-b', name: 'Sara', kind: 'person', capacity: 1, active: true, updatedAt: 4 });
const merged = R.merge(left, right);
ok(merged.services[0].name === 'Nouveau', 'newest service wins conflict-free merge');
ok(merged.resources.length === 2, 'independent resource additions are retained');

const future = Date.now() + 3 * 86400000;
let doc = base();
let result = R.validate({ customer: { name: 'Nora' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(result.ok && result.resource.id === 'res-a', 'first available resource is assigned');
ok(result.endAt - result.startAt === 30 * 60000, 'service duration determines booking end');

doc.bookings.push({ id: 'bk-1', code: 'R-1', customer: { name: 'Nora' }, serviceId: 'svc-cut', resourceId: 'res-a', startAt: future, endAt: future + 30 * 60000, partySize: 1, status: 'confirmed', source: 'staff', createdAt: 1, updatedAt: 1 });
result = R.validate({ customer: { name: 'Mina' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(!result.ok && result.error === 'conflict', 'overlapping active bookings are rejected');

doc.bookings[0].status = 'cancelled';
result = R.validate({ customer: { name: 'Mina' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(result.ok, 'cancelled bookings release availability');

doc.bookings.length = 0;
doc.blocked.push({ id: 'blk-1', resourceId: 'res-a', startAt: future, endAt: future + 3600000, updatedAt: 1 });
result = R.validate({ customer: { name: 'Mina' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(!result.ok && result.error === 'conflict', 'resource blocks prevent booking');

doc = base();
doc.resources.push({ id: 'res-b', name: 'Sara', kind: 'person', capacity: 1, active: true, week: null, updatedAt: 1 });
doc.bookings.push({ id: 'bk-1', code: 'R-1', customer: { name: 'Nora' }, serviceId: 'svc-cut', resourceId: 'res-a', startAt: future, endAt: future + 30 * 60000, partySize: 1, status: 'checked_in', source: 'staff', createdAt: 1, updatedAt: 1 });
result = R.validate({ customer: { name: 'Mina' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(result.ok && result.resource.id === 'res-b', 'simultaneous capacity uses another free resource');

doc.services[0].resourceIds = ['res-a'];
result = R.validate({ customer: { name: 'Mina' }, serviceId: 'svc-cut', startAt: future }, doc);
ok(!result.ok, 'service-to-resource restrictions are enforced');

result = R.validate({ customer: { name: 'Nora' }, serviceId: 'svc-cut', startAt: future }, doc, 'bk-1');
ok(result.ok && result.resource.id === 'res-a', 'editing ignores the booking itself');

doc = base();
doc.settings.minNoticeMinutes = 180;
result = R.validate({ customer: { name: 'Late' }, serviceId: 'svc-cut', startAt: Date.now() + 30 * 60000 }, doc);
ok(!result.ok && result.error === 'invalid', 'minimum notice is enforced');
doc.settings.minNoticeMinutes = 0;
doc.settings.windowDays = 1;
result = R.validate({ customer: { name: 'Far' }, serviceId: 'svc-cut', startAt: Date.now() + 3 * 86400000 }, doc);
ok(!result.ok && result.error === 'invalid', 'booking horizon is enforced');
result = R.validate({ customer: { name: '' }, serviceId: 'svc-cut', startAt: future }, base());
ok(!result.ok && result.error === 'invalid', 'customer name is required');
result = R.validate({ customer: { name: 'Nora' }, serviceId: 'missing', startAt: future }, base());
ok(!result.ok && result.error === 'invalid', 'unknown services are rejected');

console.log(`reservations-test: ${controls} controls passed`);
