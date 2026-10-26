#!/usr/bin/env node
import printerTestSource from './printer-test-source.cjs';
/* Kiwi · un profil d'imprimante au nom arabe ne capte pas toutes les stations.
 *
 * resolveStationTarget() comparait des clés réduites à [a-z0-9]. Un nom arabe
 * devenait la chaîne vide, et une chaîne vide est « contenue » dans toutes les
 * autres : le premier profil au nom arabe recevait la cuisine, le bar et la
 * caisse. La clé garde maintenant les lettres et chiffres de toute écriture, et
 * une clé vide ne sert jamais de correspondance partielle. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const bridgeSource = printerTestSource();
let passed = 0;
const ok = (c, l) => { assert.ok(c, l); passed++; };

function boot() {
  const memory = new Map();
  const localStorage = {
    getItem: (k) => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k), clear: () => memory.clear(),
  };
  const listeners = Object.create(null);
  const context = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Uint8Array,
    AbortController: globalThis.AbortController, localStorage,
    document: {
      readyState: 'complete', head: { appendChild() {} }, body: { appendChild() {} }, getElementById: () => null,
      createElement: () => ({ id: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, remove() {} }),
      addEventListener() {},
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
    Kiwi: { toast() {} }, KiwiKitchenRelay: { merchant: () => 'arabic-shop' },
  };
  context.window = context;
  context.navigator = { bluetooth: null, usb: null };
  vm.runInNewContext(bridgeSource, context, { filename: 'assets/printer-bridge.js' });
  return context.KiwiPrinter;
}

const KP = boot();
KP.setStationConfig({
  profiles: [
    { id: 'p_caisse', name: 'الصندوق', type: 'ip', ip: '192.168.1.10', port: 9100 },
    { id: 'p_kitchen', name: 'المطبخ', type: 'ip', ip: '192.168.1.11', port: 9100 },
    { id: 'p_bar', name: 'Bar Réseau', type: 'ip', ip: '192.168.1.12', port: 9100 },
  ],
  bindings: {},
});
const id = (station) => (KP.resolveStationTarget(station) || {}).id || null;

ok(id('المطبخ') === 'p_kitchen', 'an Arabic station name finds the profile of that exact name');
ok(id('الصندوق') === 'p_caisse', 'a second Arabic name finds its own profile, not the first Arabic one');
ok(id('bar') === 'p_bar', 'a Latin station still matches its profile by containment');
ok(id('cuisson') === null, 'a station nobody names does not fall on the Arabic profiles');
ok(id('تحلية') === null, 'an unknown Arabic station does not fall on an Arabic profile either');

/* Les liaisons par clé suivent la même règle : deux clés arabes ne se confondent pas. */
KP.setStationConfig({
  profiles: [
    { id: 'p_a', name: 'A', type: 'ip', ip: '192.168.1.20', port: 9100 },
    { id: 'p_b', name: 'B', type: 'ip', ip: '192.168.1.21', port: 9100 },
  ],
  bindings: { 'المطبخ': 'p_a', 'الحلويات': 'p_b' },
});
ok(id('الحلويات') === 'p_b', 'bindings keyed by Arabic names stay distinct (the second is not read as the first)');
ok(id('المطبخ') === 'p_a', 'the first Arabic binding still resolves');

/* Le comportement latin d'origine ne bouge pas. */
KP.setStationConfig({
  profiles: [{ id: 'p_c', name: 'Cuisine Réseau', type: 'ip', ip: '192.168.1.30', port: 9100 }],
  bindings: { 'Bar-Cocktails': 'p_c' },
});
ok(id('bar cocktails') === 'p_c', 'punctuation and case are still ignored in Latin keys');
ok(id('cuisine') === 'p_c', 'a Latin partial name still resolves');

console.log(`✓ printer station names beyond Latin (${passed} controls)`);
