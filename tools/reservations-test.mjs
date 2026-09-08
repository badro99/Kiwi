import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8');
const dashboardSource = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const configClientSource = fs.readFileSync(new URL('../assets/merchant-config.js', import.meta.url), 'utf8');
const configApiSource = fs.readFileSync(new URL('../functions/api/config.js', import.meta.url), 'utf8');
const bookingSource = fs.readFileSync(new URL('../assets/booking.js', import.meta.url), 'utf8');
const bookingApiSource = fs.readFileSync(new URL('../functions/api/booking.js', import.meta.url), 'utf8');
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
result = R.validate({ customer: { name: 'Family' }, serviceId: 'svc-cut', startAt: future, partySize: 4 }, doc);
ok(!result.ok && result.error === 'conflict', 'party size cannot be assigned to an undersized resource');
doc.resources[0].capacity = 4;
result = R.validate({ customer: { name: 'Family' }, serviceId: 'svc-cut', startAt: future, partySize: 4 }, doc);
ok(result.ok && result.resource.capacity === 4, 'party size selects a resource with sufficient capacity');

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

ok(/data-nav="reservations"(?![^>]*data-feature)/.test(dashboardSource), 'core reservations navigation is never hidden by legacy entitlements');
ok(configClientSource.includes("if (key === 'reservations' || key === 'payroll') return false;"), 'legacy reservations:false rows cannot lock owners out of setup');
ok(!/reservations:\s*false/.test(configApiSource), 'new stores no longer seed reservations as disabled');
ok(bookingSource.includes("document.documentElement.lang||'fr'"), 'public booking defaults to French instead of browser-dependent English');
ok(bookingSource.includes('data-closed-lang'), 'closed booking state keeps FR, EN and Arabic language controls');
ok(bookingSource.includes('partySize:party()') && bookingSource.includes("partySize='+encodeURIComponent(party())"), 'public dining flow carries the real party size through availability and booking');
ok(!/isDining/.test(bookingSource), 'the guest stepper is no longer gated on the free-text trade label');
ok(bookingSource.includes('Number(s&&s.maxParty||0)'), 'guest ceiling is read from the seats published per service');
ok(bookingApiSource.includes('function maxParty(') && /maxParty:maxParty\(doc,x\)/.test(bookingApiSource), 'the public booking config publishes each service seating ceiling');
ok(bookingSource.includes('function hotelSearch()') && bookingSource.includes('function hotelRoomList()') && bookingSource.includes('roomTypeId:state.service.id'), 'public hotel booking has date search, room-category selection and a dedicated stay submission');
ok(bookingSource.includes('function hotelVisual(room)') && bookingSource.includes('data-hotel-photo') && bookingSource.includes('bk-room-cover'), 'public hotel cards expose a multi-photo gallery with a real cover image');
ok(bookingSource.includes('function hotelPhotoUrl(v)') && bookingApiSource.includes("photos:(Array.isArray(x?.photos)"), 'room photos are allowlisted again on both server and public client');
ok(bookingSource.includes("state.config.kind==='hotel'") && bookingSource.includes("['fr','en','ar']"), 'hotel mode is server-selected and keeps all three locale controls');
ok(bookingApiSource.includes("feature = 'rooms'") && bookingApiSource.includes('function safeHotel('), 'hotel availability reads the tenant-scoped room register');
ok(!/resourceIds:.*hotel\.categories/.test(bookingApiSource), 'hotel category responses do not publish assignable room identifiers');
const hotelNormalized=R.normalize({bookings:[{id:'hotel-1',customer:{name:'Nora'},serviceId:'type-atlas',resourceId:'room:101',startAt:future,endAt:future+86400000,partySize:2,status:'confirmed',source:'public',hotel:{roomTypeName:'Suite Atlas',checkIn:'2026-09-01',checkOut:'2026-09-02',nights:1,rate:900,total:900,channel:'booking',externalRef:'OTA-42'}}]});
ok(hotelNormalized.bookings[0].hotel.roomTypeName==='Suite Atlas' && hotelNormalized.bookings[0].hotel.total===900 && hotelNormalized.bookings[0].hotel.channel==='booking', 'dashboard normalization preserves the hotel stay and channel snapshot');

// Execute the real normalization/get/set/merge paths with a synthetic manifest.
const guestManifest = [
  { id: 'gst_synthetic_001', name: 'Synthetic Adult', sex: 'F', nationality: 'Marocaine', birthDate: '1990-04-12', residenceCountry: 'Maroc', minorsUnder18: 1, idDocType: 'passeport', idDocNumber: 'TEST-DOC-001' },
  { id: 'gst_synthetic_002', name: 'Synthetic Minor', sex: 'M', nationality: 'Française', birthDate: '2015-06-10', residenceCountry: 'France', minorsUnder18: 0, idDocType: 'autre', idDocNumber: 'TEST-DOC-002' },
];
const roomHistory = [
  { roomId: 'room:101', fromDate: '2026-09-01', toDate: '2026-09-02' },
  { roomId: 'room:102', fromDate: '2026-09-02', toDate: '2026-09-04' },
];
const guestHistory = [
  { guestId: 'gst_synthetic_001', nationalityCountry: 'MA', usualResidenceCountry: 'MA', ageCategory: 'adult', fromDate: '2026-09-01', toDate: '2026-09-04' },
  { guestId: 'gst_synthetic_002', nationalityCountry: 'FR', usualResidenceCountry: 'FR', ageCategory: 'minor', fromDate: '2026-09-02', toDate: '2026-09-04' },
];
const manifestBooking = {
  ...hotelNormalized.bookings[0], updatedAt: 10, guests: guestManifest, roomSegments: roomHistory,
  hotel: { ...hotelNormalized.bookings[0].hotel, checkOut: '2026-09-04', nights: 3, guestSegments: guestHistory, roomSegments: roomHistory },
};
const manifestOf = (b) => JSON.parse(JSON.stringify({ guests: b.guests, roomSegments: b.roomSegments, guestSegments: b.hotel.guestSegments, hotelRoomSegments: b.hotel.roomSegments }));
const expectedManifest = manifestOf(manifestBooking);
const normalizedManifest = R.normalize({ bookings: [manifestBooking] });
assert.deepEqual(manifestOf(normalizedManifest.bookings[0]), expectedManifest);
ok(normalizedManifest.bookings[0].guests !== guestManifest && normalizedManifest.bookings[0].guests[0] !== guestManifest[0], 'normalization preserves guest identity without retaining mutable input references');
assert.deepEqual(manifestOf(R.normalize(normalizedManifest).bookings[0]), expectedManifest);
let savedReservations = { bookings: [manifestBooking] };
ctx.KiwiVenue = { getVenue: () => 'synthetic-hotel' };
ctx.KiwiStore = { define(feature) {
  assert.equal(feature, 'reservations');
  return { subscribe() {}, get() { return savedReservations; }, set(value) { savedReservations = value; } };
} };
const fromStore = R.get();
assert.deepEqual(manifestOf(fromStore.bookings[0]), expectedManifest);
fromStore.bookings[0].note = 'Unrelated edit';
R.set(fromStore);
assert.deepEqual(manifestOf(savedReservations.bookings[0]), expectedManifest);
assert.deepEqual(manifestOf(R.get().bookings[0]), expectedManifest);
fromStore.bookings[0].guests[0].birthDate = '';
fromStore.bookings[0].hotel.roomSegments[0].roomId = 'mutated-input';
assert.deepEqual(manifestOf(R.get().bookings[0]), expectedManifest, 'mutating a prior caller object cannot erase stored guest or room history');
ok(true, 'get/set preserves guest ids, birth dates, and independent room/guest segments');
const newerManifest = structuredClone(manifestBooking);
newerManifest.updatedAt = 11;
newerManifest.guests[0].birthDate = '1990-04-13';
for (const [a, b] of [[manifestBooking, newerManifest], [newerManifest, manifestBooking]]) {
  assert.deepEqual(manifestOf(R.merge({ bookings: [a] }, { bookings: [b] }).bookings[0]), manifestOf(newerManifest));
}
ok(true, 'merge preserves the complete manifest from the newer booking in either order');
const legacyManifest = R.normalize({ bookings: [{ ...manifestBooking, guests: null, roomSegments: null, hotel: { ...manifestBooking.hotel, guestSegments: null, roomSegments: null } }] }).bookings[0];
ok(legacyManifest.guests.length === 0 && legacyManifest.roomSegments.length === 0 && legacyManifest.hotel.guestSegments.length === 0 && legacyManifest.hotel.roomSegments.length === 0, 'legacy absent manifest arrays normalize safely without inventing guests');

const templates = R.restaurantTemplates();
ok(templates.length === 3, 'restaurant onboarding provides three practical starter templates');
ok(templates.every(x => x.services.length && x.resources.length), 'every restaurant template has usable services and tables');
ok(templates.every(x => x.resources.every(r => r.kind === 'table' && r.capacity >= 2)), 'template resources are reservable tables with real guest capacity');
ok(templates.find(x => x.id === 'classic').services.some(s => s.duration === 90) && templates.find(x => x.id === 'classic').services.some(s => s.duration === 120), 'classic template separates lunch and dinner duration');
ok(templates.find(x => x.id === 'groups').settings.confirmation === 'request', 'group template requires staff confirmation');
ok(R.templateSeats(templates.find(x => x.id === 'classic')) === 36, 'classic template advertises its true 36-seat capacity');
ok(new Set(templates.flatMap(x => [...x.services, ...x.resources].map(r => r.id))).size === templates.flatMap(x => [...x.services, ...x.resources]).length, 'template record identifiers are globally unique and repeat-safe');
ok(source.includes('Vos services et vos tables actuels restent intacts') && source.includes('data-kr-template'), 'setup explains preservation and exposes template actions');
const floorTemplate = R.floorPlanTemplateFrom({ tables: [{ id:'t1', num:'A1', type:'round2' }, { id:'t2', num:'B4', type:'rect6' }] });
ok(floorTemplate.resources.length === 2 && floorTemplate.resources[0].capacity === 2 && floorTemplate.resources[1].capacity === 6, 'floor-plan template imports real table names and capacities');
ok(floorTemplate.resources[0].name.includes('A1'), 'floor-plan template preserves the merchant table number');

doc = base(); doc.settings.staffingEnabled = true; doc.settings.tablesPerStaff = 1;
ctx.KiwiTeam = { bookingCoverage: () => ({ configured:true, members:[] }) };
result = R.validate({ customer:{name:'Team test'}, serviceId:'svc-cut', startAt:future },doc);
ok(!result.ok && result.error === 'conflict', 'configured service with no floor staff blocks a booking');
ctx.KiwiTeam.bookingCoverage = () => ({ configured:true, members:[{id:'staff-1'}] });
result = R.validate({ customer:{name:'Team test'}, serviceId:'svc-cut', startAt:future },doc);
ok(result.ok, 'a covered team shift makes the booking available');
delete ctx.KiwiTeam;

console.log(`reservations-test: ${controls} controls passed`);
