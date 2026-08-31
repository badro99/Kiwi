#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'assets/hotel.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('  ✓ ' + message);
  else { failures++; console.error('  ✗ ' + message); }
};

function boot(saved) {
  const data = saved || new Map();
  const localStorage = {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const handlers = {};
  const window = {
    localStorage,
    addEventListener() {},
    Kiwi: {
      handlers,
      appPage() { return { el: { querySelector() { return null; } }, close() {} }; },
      toast() {},
    },
    KiwiVenue: {
      getVenue: () => 'vhotel',
      getCurrentVenueData: () => ({ id: 'vhotel', name: 'Hôtel Test', type: 'hotel', subtype: 'hotel', custom: true, profileInfo: null }),
      getVenueType: () => 'hotel',
      isCustom: () => true,
      subscribe() { return () => {}; },
    },
  };
  const context = {
    window, localStorage, console, document: { addEventListener() {} },
    setTimeout() { return 0; }, clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
  };
  vm.runInNewContext(source, context, { filename: 'assets/hotel.js' });
  return { data, window, handlers };
}

function editor(fields) {
  const controls = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value: String(value), checked: value === true, focus() {} }]));
  const root = { querySelector: (sel) => controls[sel] || null };
  return { closest: () => root };
}

console.log('\n■ Hotel room register');
const first = boot();
const empty = first.window.KiwiHotelRooms.current();
ok(Array.isArray(empty.rooms) && empty.rooms.length === 0, 'a skipped onboarding room count starts with an honest empty register');
ok(source.includes('data-action="hx-room-add"'), 'the empty rack exposes an add-room action');
ok(typeof first.handlers['hx-room-batch-save'] === 'function' && typeof first.handlers['hx-room-edit'] === 'function', 'batch add and edit handlers are registered');
ok(Array.isArray(empty.roomTypes) && empty.roomTypes.length >= 2, 'editable room-type categories are available from the first setup');

const roomTypeId = empty.roomTypes.find((t) => t.name === 'Chambre').id;
const firstFloorId = empty.floors.find((f) => !f.deletedAt).id;
first.handlers['hx-floor-save'](editor({ '[data-hx-floor-name]': '1er étage' }), firstFloorId);
first.handlers['hx-room-batch-save'](editor({
  '[data-hx-room-numbers]': '101-105, 110',
  '[data-hx-room-type-id]': roomTypeId,
  '[data-hx-room-floor-id]': firstFloorId,
}));

let doc = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
let liveRooms = doc.rooms.filter((r) => !r.deletedAt);
let room = liveRooms.find((r) => r.n === 101);
ok(liveRooms.length === 6 && liveRooms.some((r) => r.n === 105) && liveRooms.some((r) => r.n === 110), 'number ranges and individual numbers create multiple rooms in one action');
ok(liveRooms.every((r) => r.typeId === roomTypeId && r.floor === '1er étage'), 'batch-created rooms share their type and floor settings');

first.handlers['hx-room-type-save'](editor({
  '[data-hx-type-name]': 'Chambre Atlas',
  '[data-hx-type-rate]': 890,
  '[data-hx-type-description]': 'Calme, lumineuse et ouverte sur le patio.',
  '[data-hx-type-guests]': 3,
  '[data-hx-type-beds]': '1 grand lit + 1 lit simple',
  '[data-hx-type-size]': 28,
  '[data-hx-type-view]': 'Patio',
  '[data-hx-type-amenities]': 'Wi-Fi, Climatisation, Petit-déjeuner',
  '[data-hx-type-public]': true,
}), roomTypeId);
doc = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
const savedType = doc.roomTypes.find((t) => t.id === roomTypeId && !t.deletedAt);
ok(savedType && savedType.name === 'Chambre Atlas' && savedType.rate === 890, 'a hotel can rename a room category and set its shared nightly rate');
ok(savedType.maxGuests === 3 && savedType.view === 'Patio' && savedType.amenities.length === 3 && savedType.public === true,
  'guest-facing occupancy, view, bedding and amenities persist with the room category');

first.handlers['hx-room-save'](editor({
  '[data-hx-room-number]': 201,
  '[data-hx-room-type-id]': roomTypeId,
  '[data-hx-room-floor-id]': firstFloorId,
  '[data-hx-room-status]': 'hs',
}), '101');
doc = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
room = doc.rooms.find((r) => !r.deletedAt && r.id.includes(':101'));
ok(room && room.n === 201 && room.status === 'hs', 'editing can renumber one room and change its operational state');

const reloaded = boot(first.data);
const afterReload = reloaded.window.KiwiHotelRooms.current();
ok(afterReload.rooms.some((r) => r.n === 201 && r.typeId === roomTypeId), 'room and category configuration survive a full page reload');

reloaded.handlers['hx-room-delete'](null, '201');
const deleted = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(deleted.rooms.some((r) => r.n === 201 && r.deletedAt), 'deletion writes a sync-safe tombstone');
ok(reloaded.window.KiwiHotelRooms.current().rooms.every((r) => r.n !== 201 || r.deletedAt), 'deleted rooms no longer appear in the live register');

const merged = reloaded.window.KiwiHotelRooms.merge(
  deleted,
  { v: 3, rooms: [{ ...room, updatedAt: 1 }], roomTypes: [], folios: [], baseRate: null, rateUpdatedAt: 0, sold: 0, updatedAt: 1 },
);
ok(merged.rooms.some((r) => r.n === 201 && r.deletedAt), 'a newer deletion cannot be resurrected by a stale device');

const large = boot();
const largeTypeId = large.window.KiwiHotelRooms.current().roomTypes.find((t) => t.name === 'Chambre').id;
const initialLargeFloorId = large.window.KiwiHotelRooms.current().floors.find((f) => !f.deletedAt).id;
for (const [numbers, floor] of [
  ['101-125', '1er étage'],
  ['201-225', '2e étage'],
  ['301-325', '3e étage'],
  ['401-425', '4e étage'],
]) {
  const floorId = floor === '1er étage' ? initialLargeFloorId : 'new';
  if (floorId === 'new') large.handlers['hx-floor-save'](editor({ '[data-hx-floor-name]': floor }), 'new');
  else large.handlers['hx-floor-save'](editor({ '[data-hx-floor-name]': floor }), floorId);
  const savedFloorId = large.window.KiwiHotelRooms.current().floors.find((f) => !f.deletedAt && f.name === floor).id;
  large.handlers['hx-room-batch-save'](editor({
    '[data-hx-room-numbers]': numbers,
    '[data-hx-room-type-id]': largeTypeId,
    '[data-hx-room-floor-id]': savedFloorId,
  }));
}
let largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.rooms.filter((r) => !r.deletedAt).length === 100 && new Set(largeDoc.rooms.map((r) => r.floor)).size === 4,
  'batch setup scales to 100 rooms across multiple floors without changing the data model');
const secondFloor = largeDoc.floors.filter((f) => !f.deletedAt).find((f) => f.name === '2e étage');
large.handlers['hx-floor-save'](editor({ '[data-hx-floor-name]': 'Aile Atlas' }), secondFloor.id);
largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.rooms.filter((r) => !r.deletedAt && r.floorId === secondFloor.id).every((r) => r.floor === 'Aile Atlas'),
  'renaming a section updates every room in that section');
large.handlers['hx-floor-move'](null, secondFloor.id + ':-1');
largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.floors.find((f) => f.id === secondFloor.id).order === 0,
  'sections can be reordered and keep their new position');
const thirdFloor = largeDoc.floors.filter((f) => !f.deletedAt).find((f) => f.name === '3e étage');
large.handlers['hx-floor-delete'](editor({ '[data-hx-floor-target]': secondFloor.id }), thirdFloor.id);
largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.floors.some((f) => f.id === thirdFloor.id && f.deletedAt) && largeDoc.rooms.filter((r) => !r.deletedAt && r.n >= 301 && r.n <= 325).every((r) => r.floorId === secondFloor.id),
  'deleting a section safely moves its rooms and writes a sync tombstone');
ok(source.includes("const compactProperty = all.length <= 20") && source.includes('data-hx-room-search') && source.includes('hx-room-floor'),
  'the room plan progressively adds dense search and floor navigation only for larger properties');
ok(source.includes('hx-room-section-tabs') && styles.includes('.hx-room-section-tabs') && styles.includes('.hx-floor-section { display:flex; flex-direction:column; gap:10px; padding:0; }'),
  'room plan and housekeeping use styled Kiwi tabs without inheriting generic section spacing');
ok(dashboard.includes('assets/hotel.css?v=11') && serviceWorker.includes("'/assets/hotel.css?v=11'"),
  'the live page and offline shell request the same cache-busted hotel stylesheet');

large.handlers['hx-room-save'](editor({
  '[data-hx-room-number]': 101,
  '[data-hx-room-type-id]': largeTypeId,
  '[data-hx-room-floor-id]': initialLargeFloorId,
  '[data-hx-room-status]': 'sale',
}), '101');
largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.rooms.find((r) => r.n === 101)?.status === 'sale' && source.includes('File de remise à blanc'),
  'a room marked dirty is immediately part of the shared housekeeping workflow');
large.handlers['hx-hk-done'](null, '101');
largeDoc = JSON.parse(large.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(largeDoc.rooms.find((r) => r.n === 101)?.status === 'libre' && largeDoc.rooms.find((r) => r.n === 101)?.hk === 'clean',
  'housekeeping completion returns the same room to ready inventory');

if (failures) {
  console.error(`\n${failures} hotel room regression(s) failed.`);
  process.exit(1);
}
console.log('\nHotel room register checks passed.');
