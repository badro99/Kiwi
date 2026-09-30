#!/usr/bin/env node
/* Tickets #0137 #0138 #0139 #0140 · the métier registers on the iPhone app.
 *
 *   #0137  the boutique till wore the RESTAURANT capsule (Floor / Takeaway /
 *          Waiting) over its own rows; the menu drawer stayed open over the
 *          client carnet, which then covered every control with no way out;
 *          the inventory scrolled sideways into nothing; the clock painted over
 *          the page titles.
 *   #0138  no way to leave a register: no change-role / sign-out in its drawer.
 *   #0139  the register's staff pad had no "Change role" link (it matched
 *          .screen-pin, the pad is .pin-screen).
 *   #0140  a product photo showed the broken "?" in the app: /api/media/… in an
 *          <img src> resolves to capacitor://localhost, which api-base.js did
 *          not cover (it wraps fetch/XHR/EventSource/WebSocket/beacon only).
 *
 * The media rewrite is exercised for real (api-base.js in a vm with a fake
 * native platform). The rest lives in CSS and in browser-only wiring, so it is
 * pinned at the source: what must be there, and what must not come back.
 *
 * KIWI_ROOT=<dir> runs the same checks against another checkout (used to prove
 * the test fails on the code before the fix).
 *   node tools/register-phone-tickets-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── #0140 · media URLs in the native app ────────────────────────────────── */
function loadApiBase({ native }) {
  const observers = [];
  class FakeMO { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} }
  const element = (tagName, attrs = {}, children = []) => ({
    nodeType: 1, tagName, attrs: { ...attrs }, children,
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    querySelectorAll() { return this.children; },
  });
  const documentElement = element('HTML');
  const window = {
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    MutationObserver: FakeMO,
    document: { documentElement, addEventListener() {} },
    fetch() { return Promise.resolve({}); },
    navigator: {},
  };
  window.window = window;
  vm.runInNewContext(read('assets/api-base.js'), window, { filename: 'assets/api-base.js' });
  return { window, observers, element, documentElement };
}
{
  const { window, observers, element } = loadApiBase({ native: true });
  ok('native: the media fixer is exposed', () => assert.equal(typeof window.KiwiApiBase.fixMedia, 'function'));
  ok('native: a MutationObserver keeps watching for new media', () => assert.ok(observers.length >= 1));
  const fix = (el) => { if (typeof window.KiwiApiBase.fixMedia === 'function') window.KiwiApiBase.fixMedia(el); };
  const img = element('IMG', { src: '/api/media/media/art-de-table-by-amira/1790000000-abc.jpg' });
  fix(img);
  ok('native: /api/media in <img src> is pointed at kiwi-os.com',
    () => assert.equal(img.attrs.src, 'https://kiwi-os.com/api/media/media/art-de-table-by-amira/1790000000-abc.jpg'));
  fix(img);
  ok('…and rewriting twice does not stack prefixes (no mutation loop)',
    () => assert.equal(img.attrs.src, 'https://kiwi-os.com/api/media/media/art-de-table-by-amira/1790000000-abc.jpg'));
  const own = element('IMG', { src: 'assets/kiwi-newlogo-inverse.svg' });
  const data = element('IMG', { src: 'data:image/png;base64,AAAA' });
  const ext = element('IMG', { src: 'https://cdn.example.test/a.png' });
  [own, data, ext].forEach(fix);
  ok('native: bundled, data: and third-party images are left alone', () => {
    assert.equal(own.attrs.src, 'assets/kiwi-newlogo-inverse.svg');
    assert.equal(data.attrs.src, 'data:image/png;base64,AAAA');
    assert.equal(ext.attrs.src, 'https://cdn.example.test/a.png');
  });
  const video = element('VIDEO', { src: '/api/media/media/x/v.mp4', poster: '/api/media/media/x/p.jpg' }, [element('SOURCE', { src: '/api/media/media/x/v.webm' })]);
  fix(video);
  ok('native: <video> src, poster and nested <source> are all rewritten', () => {
    assert.match(video.attrs.src, /^https:\/\/kiwi-os\.com\/api\/media\//);
    assert.match(video.attrs.poster, /^https:\/\/kiwi-os\.com\/api\/media\//);
    assert.match(video.children[0].attrs.src, /^https:\/\/kiwi-os\.com\/api\/media\//);
  });
  const dom = element('DIV', {}, [element('IMG', { src: '/api/media/media/y/z.png' })]);
  if (observers[0]) observers[0].cb([{ type: 'childList', addedNodes: [dom] }]);
  ok('native: an image painted later (innerHTML) is fixed by the observer',
    () => assert.match(dom.children[0].attrs.src, /^https:\/\/kiwi-os\.com\/api\/media\//));
}
{
  const { window } = loadApiBase({ native: false });
  ok('web: api-base stays a no-op (media already resolves against the site)', () => assert.equal(window.KiwiApiBase.fixMedia, undefined));
}

/* ── #0137 #0138 · no restaurant capsule over a register, a way out ───────── */
const nr = read('app/src/native-runtime.js');
const nrCss = read('app/src/native-runtime.css');
ok('the host tab list is empty while a register is open', () => {
  assert.match(nr, /function nativeRegisterOpen\(\)[\s\S]{0,160}classList\.contains\('is-pos'\)/);
  assert.match(nr, /tabs:nativeBlockingLayer\(\) \|\| nativeRegisterOpen\(\)/);
});
ok('the web tab bar is hidden over a register', () => assert.match(nrCss, /body\.kiwi-native-till\.is-pos \.kiwi-native-tabbar\{display:none\}/));
ok('a register drawer carries the account actions (change role, sign out…)', () => {
  assert.match(nr, /mountNativeAccountGroup\(rail\)/);
  assert.match(nr, /body\.is-pos \.vx-rail/);
});

/* ── #0139 · the register's staff pad has its exit ────────────────────────── */
ok('the gate-exit observer covers the register staff and pairing pads', () => {
  const gates = nr.match(/var gates = '([^']+)'/);
  assert.ok(gates, 'gates list found');
  assert.ok(gates[1].split(',').includes('#cp-pin-screen'), '#cp-pin-screen missing');
  assert.ok(gates[1].split(',').includes('#cp-screen'), '#cp-screen missing');
});

/* ── #0137 · drawer, carnet, sideways scroll, status bar ──────────────────── */
const pm = read('assets/pos-mobile.js');
const pmCss = read('assets/pos-mobile.css');
const cb = read('assets/clients-book.js');
ok('the drawer closes on a nav tap even when another script swallows the click', () => {
  // capture phase on the screen (not the rail), and the carnet's injected entry counts
  assert.match(pm, /screen\.addEventListener\('click',[\s\S]{0,260}vx-rail[\s\S]{0,120}data-kcb-navitem[\s\S]{0,120}setNav\(false\);\s*\}, true\)/);
  assert.doesNotMatch(pm, /rail\.addEventListener\('click'/);
});
ok('an open ticket sheet folds on a tap outside it, and says it is a control', () => {
  assert.match(pm, /vx-ticket-open'\)\) return;[\s\S]{0,300}closest\('\.vx-ticket'\)[\s\S]{0,260}stopPropagation\(\);[\s\S]{0,120}classList\.remove\('vx-ticket-open'\)/);
  assert.match(pmCss, /\.vx-peek-l::before/);
});
ok('the client carnet takes the whole screen on a phone', () => {
  assert.match(cb, /PHONE_Q = '\(max-width: 860px\), \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)'/);
  assert.match(cb, /var b = isPhone\(\) \? \{ left: 0, top: 0, right: 0, bottom: 0 \} : panelInset\(\)/);
});
ok('the carnet has a close control on a phone, and no autofocus keyboard', () => {
  assert.match(cb, /id="kcb-back"/);
  assert.match(cb, /#kcb-back'\)\.onclick = close/);
  assert.match(cb, /if \(!isPhone\(\)\) q\.focus\(\)/);
  assert.match(cb, /#kcb-root \.kcb-back\{display:none;\}/);
});
ok('toolbars and KPI strips wrap instead of forcing a sideways scroll', () => {
  assert.match(pmCss, /\[class\$="-tools"\][^{]*\{ flex-wrap: wrap; \}/);
  assert.match(pmCss, /\[class\$="-kpis"\]/);
  assert.match(pmCss, /\.bqi \{ overflow-x: hidden; \}/);
});
ok('the register clears the status bar and the home indicator via the app insets', () => {
  assert.match(pmCss, /--vx-safe-top: var\(--kiwi-safe-top, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(pmCss, /margin-top: var\(--vx-safe-top\)/);
  assert.doesNotMatch(pmCss, /padding-top: calc\(20px \+ env\(safe-area-inset-top/);
});

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}register-phone-tickets: ${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
