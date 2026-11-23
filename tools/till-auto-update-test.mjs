#!/usr/bin/env node
// The till reloads itself onto a new version only when nothing is going on
// (owner, 23 Nov 2026: the Santos tablet still refused « Vendre quand même »
// an hour after it shipped, nobody touches the « Rafraîchir » pill).
// Drives assets/till-auto-update.js in a vm with a fake clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('assets/till-auto-update.js');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; console.log('  ✓ ' + m); };

function load({ readySince = 0, idle = true, dialog = false, focus = null, online = true } = {}) {
  let clock = 1_800_000_000_000;
  const FakeDate = class extends Date { static now() { return clock; } };
  const listeners = {};
  const intervals = [];
  const store = new Map();
  let reloads = 0, checksAsked = 0;
  const pill = { getClientRects: () => [1] };
  const win = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    location: { reload: () => { reloads++; } },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block', pointerEvents: 'auto' }),
    KiwiPWAUpdate: { readySince: () => win.__ready, check: () => { checksAsked++; } },
    KiwiPosDispatch: { idle: () => win.__idle },
    __ready: readySince, __idle: idle,
  };
  const doc = {
    activeElement: focus,
    querySelectorAll: () => (win.__dialog ? [pill] : []),
  };
  win.__dialog = dialog;
  const ctx = vm.createContext({
    window: win, document: doc, navigator: { serviceWorker: {}, onLine: online }, Date: FakeDate,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return 0; },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    console,
  });
  vm.runInContext(src, ctx);
  const api = win.KiwiTillAutoUpdate;
  return {
    api, win, doc, store,
    advance(ms) { clock += ms; },
    gesture() { (listeners.pointerdown || []).forEach((fn) => fn({})); },
    now: () => clock,
    reloads: () => reloads,
    checksAsked: () => checksAsked,
    ticks: intervals,
  };
}

console.log('till-auto-update');

/* decide(): the rule on its own. */
{
  const { api } = load();
  const base = { ready: true, readyAgeMs: 60000, idleMs: api.IDLE_MS, busyUi: false, tillIdle: true, online: true, sinceLastAutoMs: Infinity };
  ok(api.decide(base) === 'reload', 'a ready update on an idle till with an empty ticket reloads');
  ok(api.decide({ ...base, ready: false }) === 'no-update', 'no update, no reload');
  ok(api.decide({ ...base, tillIdle: false, idleMs: 1e9 }) === 'sale-in-progress', 'a ticket in progress is never reloaded, however long it waits');
  ok(api.decide({ ...base, busyUi: true }) === 'ui-busy', 'an open sheet, veil or focused field holds the reload');
  ok(api.decide({ ...base, idleMs: api.IDLE_MS - 1 }) === 'recent-activity', 'a recent tap holds the reload');
  ok(api.decide({ ...base, tillIdle: null, idleMs: api.IDLE_MS }) === 'recent-activity', 'a till that cannot say if it is busy waits longer');
  ok(api.decide({ ...base, tillIdle: null, idleMs: api.LONG_IDLE_MS }) === 'reload', '…and reloads after the long quiet');
  ok(api.decide({ ...base, online: false }) === 'offline', 'never reloads offline');
  ok(api.decide({ ...base, sinceLastAutoMs: api.GUARD_MS - 1 }) === 'guard', 'one auto-reload per ten minutes at most (no loop)');
  ok(api.decide({ ...base, readyAgeMs: 1000 }) === 'settling', 'lets the new worker settle a few seconds first');
}

/* tick(): wired to the real signals. */
{
  const t = load({ readySince: 1_800_000_000_000 });
  ok(t.ticks.length === 1, 'the module ticks on an interval');
  t.advance(30_000);
  ok(t.api.tick() === 'recent-activity' && t.reloads() === 0, 'just after a gesture-free start it waits for IDLE_MS');
  t.advance(t.api.IDLE_MS);
  ok(t.api.tick() === 'reload' && t.reloads() === 1, 'then it reloads once');
  ok(t.api.tick() === 'guard' && t.reloads() === 1, 'and the guard stops a second reload right after');
}
{
  const t = load({ readySince: 1_800_000_000_000, idle: false });
  t.advance(t.api.LONG_IDLE_MS * 4);
  ok(t.api.tick() === 'sale-in-progress' && t.reloads() === 0, 'a ticket with lines keeps the till as it is');
  t.win.__idle = true;
  ok(t.api.tick() === 'reload', 'once the sale is done and the ticket empty, it reloads');
}
{
  const t = load({ readySince: 1_800_000_000_000 });
  t.advance(t.api.IDLE_MS + 10_000);
  t.gesture();
  ok(t.api.tick() === 'recent-activity' && t.reloads() === 0, 'a tap resets the quiet timer');
}
{
  const t = load({ readySince: 1_800_000_000_000, dialog: true });
  t.advance(t.api.LONG_IDLE_MS);
  ok(t.api.tick() === 'ui-busy', 'an open dialog holds it');
  const f = load({ readySince: 1_800_000_000_000, focus: { tagName: 'INPUT' } });
  f.advance(f.api.LONG_IDLE_MS);
  ok(f.api.tick() === 'ui-busy', 'a focused field holds it');
}
{
  const t = load({ readySince: 0 });
  t.advance(10 * 60_000);
  t.api.tick();
  ok(t.checksAsked() === 1, 'a quiet till without an update asks for one itself');
  t.advance(60_000);
  t.api.tick();
  ok(t.checksAsked() === 1, 'but not more than every ten minutes');
}

/* The pieces it relies on are actually there. */
{
  const boot = read('assets/caisse-pwa.js');
  ok(/\/assets\/till-auto-update\.js\?v=\d+/.test(boot), 'the caisse bootstrap loads the module');
  ok(boot.indexOf('till-auto-update.js') > boot.indexOf('KiwiPWAUpdate.watch(reg)'), 'once the update watcher whose readySince() it reads is running');
  ok(/caisse-pwa\.js\?v=\d+/.test(read('kiwi-caisse.html')), 'and the caisse loads that bootstrap');
  ok(/function idle\(\)/.test(read('assets/pos-dispatch.js')) && /\bidle,/.test(read('assets/pos-dispatch.js')), 'KiwiPosDispatch exposes idle()');
  for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
    ok(/idle: \(\) => !\(state\.ticket/.test(read(f)), `${f} tells the dispatcher when its ticket is empty`);
  }
}

console.log(`till-auto-update: ${checks} checks ok`);
