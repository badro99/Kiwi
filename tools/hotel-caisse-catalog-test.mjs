#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/pos-hotel.js'), 'utf8');
let failures = 0;
const ok = (value, message) => value ? console.log('  ✓ ' + message) : (failures++, console.error('  ✗ ' + message));

function boot(real) {
  const registered = [];
  const store = new Map();
  const window = {
    KiwiEnv: { isReal: () => real },
    KiwiPlatform: { isPaired: () => real, pairedVenue: () => real ? { merchant: 'hotel-chellah', name: 'Hotel Chellah', location: 'Tanger' } : null },
    KiwiPosDispatch: { register: (entry) => registered.push(entry) },
    KiwiVerticalState: { open: () => null },
  };
  const localStorage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) };
  const context = { window, localStorage, document: { querySelector: () => null, querySelectorAll: () => [] }, console, setTimeout: () => 0, clearTimeout() {}, Date, Intl, Math, JSON, Object, Array, String, Number, Map };
  vm.runInNewContext(source, context, { filename: 'assets/pos-hotel.js' });
  return { window, registered };
}

console.log('\n■ Hotel caisse catalogue');
const real = boot(true);
ok(real.window.KiwiHotelPosCatalog.current().rooms.length === 0, 'a real paired hotel never receives the eight Riad Yasmina demo rooms');
ok(!real.registered[0].greet.sub.includes('Yasmina') && !real.registered[0].greet.line1.includes('Hamza'), 'real hotel greeting contains no demo identity or employee');

real.window.KiwiHotelPosCatalog.apply({
  v: 4, baseRate: 900,
  roomTypes: [{ id: 'type:atlas', name: 'Suite Atlas', rate: 1250, updatedAt: 2 }],
  floors: [{ id: 'floor:one', name: '1er étage', order: 0, updatedAt: 2 }],
  rooms: [{ id: 'room:101', n: 101, typeId: 'type:atlas', floorId: 'floor:one', status: 'libre', updatedAt: 3 }],
});
const synced = real.window.KiwiHotelPosCatalog.current();
ok(synced.rooms.length === 1 && synced.rooms[0].n === 101 && synced.rooms[0].name === 'Suite Atlas' && synced.rooms[0].rate === 1250, 'caisse adopts the owner-defined room, category and price');
ok(synced.floors.length === 1 && synced.floors[0].lbl === '1er étage' && synced.floors[0].rooms[0] === 101, 'caisse adopts the owner-defined section and ordering');

const demo = boot(false);
ok(demo.window.KiwiHotelPosCatalog.current().rooms.length === 8, 'the explicit unpaired demo still keeps its showcase data');

if (failures) process.exit(1);
console.log('\nHotel caisse catalogue checks passed.');
