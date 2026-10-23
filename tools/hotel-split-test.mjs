/* Preuve de découpe : reconstruction exacte et exécution des fichiers réels. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hotelTestSource } from './hotel-test-source.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/hotel/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/hotel/split.json'));
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(hotelTestSource(), original, 'live bodies rebuild original byte for byte');
assert.equal(read('assets/hotel-language.js'), map.prefix + original.slice(map.start, map.end) + map.suffix);
assert.equal(read('assets/hotel.js'), original.slice(0, map.start) + map.replacement + original.slice(map.end));
const html = read('dashboard.html');
assert.equal((html.match(/<script\b[^>]*\bsrc=/gi) || []).length, 162);
assert.match(html, /<script src="assets\/hotel-language.js\?v=\d+" defer fetchpriority="low"><\/script>\s*<script src="assets\/hotel.js\?v=\d+" defer fetchpriority="low"><\/script>/);
const require = (await import('node:module')).createRequire(import.meta.url);
assert.ok(require('./stamps.js').scan().has('assets/hotel-language.js'), 'new shell URL is stamp-discoverable');
// Le même harnais de registre, avec l'original puis les deux vrais scripts.
const roomSuite = read('tools/hotel-rooms-test.mjs');
const boot = roomSuite.slice(roomSuite.indexOf('function boot(saved)'), roomSuite.indexOf('\nfunction editor('));
function run(parts, lang) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [1792710000000])); }
    static now() { return 1792710000000; }
  }
  const realm = vm.createContext({ console, vm, Date: Clock });
  vm.runInContext(`const source = ${JSON.stringify(parts.join('\n'))};\n${boot}\nglobalThis.result = boot();`, realm);
  const { window, data, handlers } = realm.result;
  const state = JSON.stringify(window.KiwiHotelRooms.current());
  const effects = JSON.stringify([...data]);
  const functions = Object.fromEntries(Object.entries(handlers).map(([k, v]) => [k, String(v)]));
  window.KiwiI18n = { getLang: () => lang };
  return { state, effects, functions, window };
}
for (const lang of ['fr', 'en', 'ar']) {
  const before = run([original], lang);
  const after = run([read('assets/hotel-language.js'), read('assets/hotel.js')], lang);
  assert.equal(after.state, before.state);
  assert.equal(after.effects, before.effects);
  assert.deepEqual(after.functions, before.functions);
  assert.deepEqual(Object.keys(after.window).filter(k => k !== '__kiwiHotelInternal'), Object.keys(before.window));
  assert.ok(Object.isFrozen(after.window.__kiwiHotelInternal));
  assert.deepEqual(Object.keys(after.window.__kiwiHotelInternal), ['language']);
  const a = after.window.__kiwiHotelInternal.language();
  const ctx = vm.createContext({ window: before.window });
  vm.runInContext(`(() => { 'use strict';\n${original.slice(map.start, map.end)}\nwindow.languageProof = { hxLang, hxLocale, tx, txk, HX_N, txn, ltr, hxTo, hxColon, HX_T }; })();`, ctx);
  const b = before.window.languageProof;
  for (const [key, value] of Object.entries(a)) {
    assert.equal(typeof value === 'function' ? String(value) : JSON.stringify(value), typeof b[key] === 'function' ? String(b[key]) : JSON.stringify(b[key]), key + ': exact source/data');
  }
  for (const key of Object.keys(a.HX_T)) assert.equal(a.tx(key), b.tx(key));
  for (const noun of Object.keys(a.HX_N)) for (const n of [0, 1, 2, 3, 10, 11, 99, 100, -1]) assert.equal(a.txn(n, noun), b.txn(n, noun));
}
console.log('✓ hotel-split: exact reconstruction, ordered deferred loading, stamp discovery, startup/state/handlers and FR/EN/AR parity');
