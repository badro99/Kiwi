#!/usr/bin/env node
// A till tab stays open for days with no navigation, and the browser only looks
// for a new service worker when a page loads: Santos Store's till still ran the
// code from before the morning's fix on the evening of 21 October. The shared
// update module now asks every 30 minutes, when the tab comes back into view and
// when the network returns. Drives assets/pwa-update.js in a vm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/pwa-update.js'), 'utf8');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };

function load({ rejectUpdate = false } = {}) {
  const listeners = { window: {}, document: {}, sw: {} };
  const on = bag => (ev, fn) => { (bag[ev] = bag[ev] || []).push(fn); };
  const fire = (bag, ev) => (bag[ev] || []).forEach(fn => fn({}));
  const intervals = [];
  let clock = 1_800_000_000_000;
  const FakeDate = class extends Date { static now() { return clock; } };
  const doc = { visibilityState: 'visible', addEventListener: on(listeners.document),
    getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, documentElement: { lang: 'fr' }, body: { appendChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null }) };
  const sw = { controller: {}, addEventListener: on(listeners.sw) };
  const win = { addEventListener: on(listeners.window) };
  const unhandled = [];
  const ctx = vm.createContext({
    window: win, document: doc, navigator: { serviceWorker: sw }, Date: FakeDate,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return { unref() {} }; },
    setTimeout: () => 0, clearTimeout() {}, sessionStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { observe() {} }, console,
  });
  vm.runInContext(src, ctx);
  let updates = 0;
  const reg = { waiting: null, addEventListener() {},
    update() { updates++; return rejectUpdate ? Promise.reject(new Error('offline')) : Promise.resolve(); } };
  process.on('unhandledRejection', e => unhandled.push(e));
  return { api: win.KiwiPWAUpdate, reg, intervals, doc, listeners, fire, unhandled,
    updates: () => updates, advance: ms => { clock += ms; } };
}

{
  const t = load();
  t.api.watch(t.reg);
  const poll = t.intervals.find(i => i.ms === 30 * 60000);
  ok(poll, 'watch() starts a 30-minute check');
  t.advance(30 * 60000); poll.fn();
  ok(t.updates() === 1, 'the interval asks the browser for a new version');
  t.doc.visibilityState = 'visible';
  t.advance(60000); t.fire(t.listeners.document, 'visibilitychange');
  ok(t.updates() === 1, 'back on the tab a minute later: no extra request');
  t.advance(10 * 60000); t.fire(t.listeners.document, 'visibilitychange');
  ok(t.updates() === 2, 'back on the tab after ten minutes: one request');
  t.doc.visibilityState = 'hidden';
  t.advance(10 * 60000); t.fire(t.listeners.document, 'visibilitychange');
  ok(t.updates() === 2, 'leaving the tab asks nothing');
  t.fire(t.listeners.window, 'online');
  ok(t.updates() === 3, 'the network coming back asks once');
  t.api.watch(t.reg);
  ok(t.intervals.filter(i => i.ms === 30 * 60000).length === 1, 'a second watch() does not double the checks');
  ok(t.api.readySince() === 0, 'no update announced yet: readySince is 0');
  t.api.show();
  ok(t.api.readySince() > 0, 'once announced, readySince gives the time (sent in the heartbeat)');
  const before = t.updates(); t.fire(t.listeners.window, 'online');
  ok(t.updates() === before, 'an announced update stops further checks');
}
{
  const t = load({ rejectUpdate: true });
  t.api.watch(t.reg);
  t.fire(t.listeners.window, 'online');
  await new Promise(r => setTimeout(r, 10));
  ok(t.updates() === 1 && t.unhandled.length === 0, 'an offline check fails quietly (no unhandled rejection)');
}
console.log(`✓ pwa update polling: ${checks} checks`);
