#!/usr/bin/env node
/* « Ouvrir la caisse » on the dashboard PIN lock must open THIS account's till.
 *
 *   node tools/lock-caisse-handoff-test.mjs
 *
 * Owner report, 30 Oct 2026: from the lock screen, Santos landed on a
 * restaurant till and Amira on Pasta Corner's. The button was a bare link to
 * kiwi-caisse.html, which names no store, so the till booted whatever this
 * browser had last been paired with (or the demo restaurant). It now writes
 * the same hand-off as the panel's « Ouvrir la caisse sur cet appareil » and
 * opens kiwi-caisse.html?pair=1. This runs the real assets/caisse-link.js and
 * assets/lock-till.js (the button's handler; the store picker for an account
 * with several stores is checked in a browser by lock-till-browser-test). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/caisse-link.js'), 'utf8');
const lockSrc = fs.readFileSync(path.join(ROOT, 'assets/lock-till.js'), 'utf8');
let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split("\n").slice(0, 6).join(" ")}`); }
}

/* A dashboard page: the lock link, a store map, the venue engine, identity. */
function page({ venue = null, me = null, real = true, store = {} } = {}) {
  const ls = { ...store };
  const listeners = [];
  const timers = [];
  const toasts = [];
  const location = { href: 'https://kiwi-os.com/dashboard', search: '' };
  const link = { tag: 'a', closest: (sel) => (sel === '.kiwi-lock-caisse' ? link : null), attrs: {},
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; } };
  const other = { closest: () => null };
  const window = {
    KiwiEnv: { isReal: () => real },
    KiwiVenue: venue ? { getCurrentVenueData: () => venue, isCustom: () => !!venue.custom } : undefined,
    KiwiMe: me,
    Kiwi: { toast: (m) => toasts.push(m) },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const ctx = {
    window, location, console, JSON, Date, Math, String, Object, Array, Number, RegExp, Uint32Array,
    crypto: { getRandomValues: (a) => a },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: 'fr' },
    document: {
      readyState: 'loading', documentElement: { lang: 'fr', getAttribute: () => 'fr' },
      addEventListener: (type, fn, capture) => { if (type === 'click') listeners.push({ fn, capture }); },
      querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} }, body: { appendChild() {} },
    },
  };
  /* As in a browser, window IS the global object: the script reads both
     window.KiwiVenue and a bare KiwiVenue. */
  Object.assign(ctx, window);
  const win = ctx;
  win.window = win;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  vm.runInContext(lockSrc, ctx);
  const click = (target = link) => {
    const ev = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const l of listeners) l.fn(ev);
    return ev;
  };
  const tick = (n = 1) => { for (let i = 0; i < n && timers.length; i++) timers.shift()(); };
  return { ls, location, click, tick, toasts, listeners, link, other, window: win };
}

const amira = { custom: true, slug: 'amira-boutique', id: 'v-boutique', type: 'boutique', subtype: 'vetements', name: 'Amira Boutique', location: 'Casablanca' };
const stalePasta = { kiwiPairedVenue: JSON.stringify({ merchant: 'pasta-corner', type: 'restaurant', name: 'Pasta Corner' }), kiwiLiveMerchant: 'pasta-corner' };

await ok('the lock button is caught on the capture phase (before the bare link navigates)', () => {
  const p = page({ venue: amira, me: { business: 'Amira' } });
  assert.ok(p.listeners.some((l) => l.capture === true));
});

await ok('a browser last paired with Pasta Corner opens Amira Boutique\'s till, named outright', () => {
  const p = page({ venue: amira, me: { business: 'Amira' }, store: stalePasta });
  const ev = p.click();
  assert.ok(ev.prevented, 'the bare link is stopped');
  const h = JSON.parse(p.ls.kiwiPairHandoff || 'null');
  assert.ok(h, 'a hand-off is written');
  assert.equal(h.merchant, 'amira-boutique');
  assert.equal(h.venueId, 'v-boutique');
  assert.equal(h.type, 'boutique');
  assert.ok(Date.now() - h.ts < 5000, 'fresh, so the till accepts it');
  assert.equal(p.location.href, 'kiwi-caisse.html?pair=1', 'the till is opened in hand-off mode');
});

await ok('an account without a custom venue keeps its trade (a boutique never routes to the restaurant till)', () => {
  const p = page({ venue: { custom: false }, me: { business: 'Santos Store', type: 'boutique' } });
  p.click();
  const h = JSON.parse(p.ls.kiwiPairHandoff || 'null');
  assert.equal(h && h.merchant, 'santos-store');
  assert.equal(h.type, 'boutique');
  assert.equal(p.location.href, 'kiwi-caisse.html?pair=1');
});

await ok('while the store is still unknown it waits, then opens the right till once identity lands', () => {
  const p = page({ venue: null, me: null });
  const ev = p.click();
  assert.ok(ev.prevented);
  assert.equal(p.location.href, 'https://kiwi-os.com/dashboard', 'nothing opens on a guess');
  p.tick(3);
  p.window.KiwiMe = { business: 'Santos Store', type: 'boutique' };
  p.tick(1);
  assert.equal(JSON.parse(p.ls.kiwiPairHandoff).merchant, 'santos-store');
  assert.equal(p.location.href, 'kiwi-caisse.html?pair=1');
});

await ok('if the store never resolves, no till opens and the merchant is told', () => {
  const p = page({ venue: null, me: null, store: stalePasta });
  p.click();
  p.tick(40);
  assert.equal(p.location.href, 'https://kiwi-os.com/dashboard');
  assert.equal(p.ls.kiwiPairHandoff, undefined);
  assert.equal(p.toasts.length, 1);
  assert.equal(p.link.getAttribute('aria-busy'), null, 'the button can be pressed again');
});

await ok('a double tap does not queue two hand-offs', () => {
  const p = page({ venue: null, me: null });
  p.click(); p.click();
  assert.equal(p.link.getAttribute('aria-busy'), 'true');
});

await ok('the local demo keeps its plain link, other clicks are untouched', () => {
  const demo = page({ venue: amira, real: false });
  assert.equal(demo.click().prevented, false);
  assert.equal(demo.ls.kiwiPairHandoff, undefined);
  const p = page({ venue: amira, me: { business: 'Amira' } });
  assert.equal(p.click(p.other).prevented, false);
});

console.log(`\nlock-caisse-handoff: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
