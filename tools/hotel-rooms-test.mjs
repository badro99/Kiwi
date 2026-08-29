#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');
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
    window, localStorage, console,
    setTimeout() { return 0; }, clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
  };
  vm.runInNewContext(source, context, { filename: 'assets/hotel.js' });
  return { data, window, handlers };
}

function editor(fields) {
  const controls = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value: String(value), focus() {} }]));
  const root = { querySelector: (sel) => controls[sel] || null };
  return { closest: () => root };
}

console.log('\n■ Hotel room register');
const first = boot();
const empty = first.window.KiwiHotelRooms.current();
ok(Array.isArray(empty.rooms) && empty.rooms.length === 0, 'a skipped onboarding room count starts with an honest empty register');
ok(source.includes('data-action="hx-room-add"'), 'the empty rack exposes an add-room action');
ok(typeof first.handlers['hx-room-save'] === 'function' && typeof first.handlers['hx-room-edit'] === 'function', 'add and edit handlers are registered');

first.handlers['hx-room-save'](editor({
  '[data-hx-room-number]': 101,
  '[data-hx-room-type]': 'Suite Junior',
  '[data-hx-room-floor]': '1er étage',
  '[data-hx-room-rate]': 890,
  '[data-hx-room-status]': 'libre',
}), 'new');

let doc = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
let room = doc.rooms.find((r) => !r.deletedAt);
ok(room && room.n === 101 && room.typeName === 'Suite Junior', 'adding a room persists its number and type');
ok(room && room.floor === '1er étage' && room.rate === 890, 'adding a room persists its floor and nightly rate');

first.handlers['hx-room-save'](editor({
  '[data-hx-room-number]': 102,
  '[data-hx-room-type]': 'Suite Terrasse',
  '[data-hx-room-floor]': 'Terrasse',
  '[data-hx-room-rate]': 1200,
  '[data-hx-room-status]': 'hs',
}), '101');
doc = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
room = doc.rooms.find((r) => !r.deletedAt);
ok(room && room.n === 102 && room.status === 'hs', 'editing can renumber a room and change its operational state');

const reloaded = boot(first.data);
const afterReload = reloaded.window.KiwiHotelRooms.current();
ok(afterReload.rooms.some((r) => r.n === 102 && r.rate === 1200), 'room configuration survives a full page reload');

reloaded.handlers['hx-room-delete'](null, '102');
const deleted = JSON.parse(first.data.get('kiwi:hotel-rooms:v2:vhotel'));
ok(deleted.rooms.some((r) => r.n === 102 && r.deletedAt), 'deletion writes a sync-safe tombstone');
ok(reloaded.window.KiwiHotelRooms.current().rooms.every((r) => r.deletedAt), 'deleted rooms no longer appear in the live register');

const merged = reloaded.window.KiwiHotelRooms.merge(
  deleted,
  { v: 2, rooms: [{ ...room, updatedAt: 1 }], folios: [], baseRate: null, rateUpdatedAt: 0, sold: 0, updatedAt: 1 },
);
ok(merged.rooms.some((r) => r.n === 102 && r.deletedAt), 'a newer deletion cannot be resurrected by a stale device');

if (failures) {
  console.error(`\n${failures} hotel room regression(s) failed.`);
  process.exit(1);
}
console.log('\nHotel room register checks passed.');
