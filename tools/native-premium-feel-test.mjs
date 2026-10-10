#!/usr/bin/env node
/* Premium feel, Tier 1 (docs/roadmaps/2026-10-10-premium-feel.md) and the
 * Orders cards that painted white before turning dark (2026-10-10).
 * Local bundled build, demo account, stubbed native plugins, real touches.
 *
 *   node tools/native-premium-feel-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from './build-app-www.mjs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

/* ── source ─────────────────────────────────────────────────────────────── */
const runtime = read('app/src/native-runtime.js');
const css = read('app/src/native-runtime.css');
const dark = read('assets/dark-fixes.js');
const pro = read('assets/pages-pro.js');
check(/<key>CADisableMinimumFrameDurationOnPhone<\/key>\s*<true\/>/.test(read('app/ios/App/App/Info.plist')), 'Info.plist opts native layers into 120 Hz');
check(/var FLICK_MS = 320;/.test(runtime) && /if \(Date\.now\(\) - st > FLICK_MS\) return;/.test(runtime), 'period swipe needs a quick flick, a slow drag reads the chart');
check(/Premium feel layer/.test(runtime) && /el\.animate\(\[\{ scale: '1' \}/.test(runtime), 'touch-down response animates `scale`, never an element\'s own transform');
check(/const app = document\.body;/.test(dark) && !/setTimeout\(\(\) => \{\s*const roots/.test(dark) && !/setTimeout\(\(\) => run\(n\), 30\)/.test(dark), 'dark pass themes new surfaces before paint, no 30 to 150 ms wait');
check(/\.rtx-summary>div\{[^}]*background:var\(--surface\)/.test(pro) && !/\.rtx-summary>div\{[^}]*--n-0/.test(pro), 'Orders summary cards use the theme surface, not an undefined token');
check(/\.rtx-summary>div\{background:var\(--kno-card\)!important/.test(css), 'native Orders cards are solid from the first frame');
check(/svg\[data-rev-svg\][^{]*\{touch-action:pan-y\}/.test(css) && /tabular-nums/.test(css), 'chart keeps horizontal drags, live amounts use tabular figures');
check(!/—/.test(runtime.slice(runtime.indexOf('Premium feel layer'))), 'no em dash in the feel layer');
const swift = read('app/ios/App/App/KiwiNativeShell.swift');
const scene = read('app/ios/App/App/SceneDelegate.swift');
check(/func presentNativeSheet/.test(swift) && /sheet\.prefersGrabberVisible = true/.test(swift) && /presentationControllerDidDismiss/.test(swift), 'native sheet: system detent, grabber, swipe away answers "dismiss"');
check(/window\.__kiwiHostCaps=Object\.freeze\(\{sheet:1\}\)/.test(scene) && /injectionTime: \.atDocumentStart/.test(scene), 'the host announces the native sheet before any page script runs');
check(/if \(nativeSheetAvailable\(\)\) \{\s*nativeSheet\(\{ title: c\.offerTitle, message: c\.offerBody, icon: 'faceid'/.test(runtime) && /if \(choice === 'enable'\) enable\(\); else decline\(\);/.test(runtime), 'the Face ID offer is a native sheet; swiping it away counts as Later');
check(/#if DEBUG[\s\S]*KiwiSheetDemo[\s\S]*#endif/.test(swift), 'the simulator sheet demo is compiled out of release builds');
check(/kiwi:sale-paid[\s\S]{0,120}haptic: false/.test(read('kiwi-caisse.html')), 'restaurant till announces the paid moment (its own haptic already played)');
check(/function ticketDone\(total, method\)[\s\S]*kiwi:sale-paid/.test(read('assets/pos-sale.js')) && /if \(!delivery\) \{ try \{ window\.dispatchEvent\(new CustomEvent\('kiwi:sale-paid'/.test(read('assets/pos-boutique.js')), 'every other register and the boutique announce it too, never a delivery still to collect');

/* ── browser ────────────────────────────────────────────────────────────── */
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-feel-'));
const www = path.join(work, 'www');
build({ out: www, quiet: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.resolve(www, '.' + new URL(req.url, 'http://local').pathname);
  if (!p.startsWith(www + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = process.env.KIWI_FEEL_SHOTS || work;

async function phone(scheme, { hostSheet = false, url = '/dashboard.html', demo = true } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) r.abort(); else r.continue(); });
  await page.evaluateOnNewDocument((hostSheet) => {
    localStorage.setItem('kiwiNativeLocale', 'en');
    localStorage.setItem('kiwi-employee-language:demo', 'fr');
    /* A phone: no hover-capable pointer. */
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/\(\s*hover\s*:\s*none\s*\)/.test(q)
      ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
      : mm(q));
    window.__hap = [];
    const noop = () => Promise.resolve({});
    const plug = new Proxy({}, { get: (_, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
    const haptics = new Proxy({}, { get: (_, k) => (k === 'addListener' ? () => ({ remove() {} }) : (arg) => { window.__hap.push(k + (arg && arg.style ? ':' + arg.style : '')); return Promise.resolve({}); }) });
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: (_, k) => (k === 'Haptics' ? haptics : plug) }) };
    window.__sheets = [];
    if (hostSheet) window.__kiwiHostCaps = { sheet: 1 };
    window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { if (v && v.sheet) window.__sheets.push(v.sheet); else window.__host = v; } } } };
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.documentElement.style;
      s.setProperty('--kiwi-host-safe-top', '62px'); s.setProperty('--kiwi-host-safe-bottom', '34px'); s.setProperty('--kiwi-host-tab-height', '106px');
    });
  }, hostSheet);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('dialog', (d) => { if (process.env.FEEL_DEBUG) console.log('dialog:', d.type(), d.message()); d.dismiss().catch(() => {}); });
  await page.goto(base + url, { waitUntil: 'networkidle2' });
  if (demo) {
    await page.waitForSelector('.kob-root [data-explore]');
    await page.click('.kob-root [data-explore]'); await sleep(1200);
    await page.click('[data-kiwi-skip]'); await sleep(2200);
  }
  return { page, context, requests };
}
const hoverRules = (page) => page.evaluate(() => {
  let n = 0;
  const walk = (list) => {
    let rules; try { rules = list.cssRules; } catch (_) { return; }
    for (const r of rules || []) {
      if (r.media && /hover\s*:\s*hover|pointer\s*:\s*fine/.test(r.media.mediaText)) continue;
      if (typeof r.selectorText === 'string' && r.selectorText.replace(/:not\(\s*:hover\s*\)/g, '').includes(':hover')) n++;
      if (r.cssRules) walk(r);
    }
  };
  for (const s of document.styleSheets) walk(s);
  return n;
});
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, left: r.left }; });

try {
  const { page, context } = await phone('dark');

  /* Sticky hover */
  check(await hoverRules(page) === 0, 'no :hover rule survives on a touch-only phone');
  await page.evaluate(() => { const s = document.createElement('style'); s.textContent = '.feel-probe:hover{color:red}.feel-probe:focus,.feel-probe:hover{outline:1px solid}'; document.body.appendChild(s); });
  await sleep(120);
  check(await hoverRules(page) === 0, 'a stylesheet a surface injects later loses its :hover too');
  check(await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText === '.feel-probe:focus'); } catch (_) { return false; } })), 'the non-hover half of a mixed selector is kept');

  /* Touch-down response */
  const pill = await center(page, '.dr-pill[data-range="hier"]');
  await page.touchscreen.touchStart(pill.x, pill.y); await sleep(140);
  const pressed = await page.$eval('.dr-pill[data-range="hier"]', (e) => parseFloat(getComputedStyle(e).scale));
  check(pressed > 0.95 && pressed < 0.99, 'a control shrinks the moment the finger lands (' + pressed + ')');
  const before = await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length);
  await page.touchscreen.touchEnd(); await sleep(320);
  const released = await page.$eval('.dr-pill[data-range="hier"]', (e) => getComputedStyle(e).scale);
  check(released === 'none' || parseFloat(released) === 1, 'and springs back on release');
  check(await page.$eval('.dr-pill[data-range="hier"]', (e) => e.classList.contains('on')), 'the tap still selects the period');
  const after = await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length);
  check(after === before + 1, 'changing the period gives one selection tick');
  await page.touchscreen.tap(pill.x, pill.y); await sleep(250);
  check(await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length) === after, 'tapping the period already chosen gives none');
  await page.evaluate(() => document.querySelector('.dr-pill[data-range="hier"]').click()); await sleep(200);
  check(await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length) === after, 'a programmatic click gives none');

  /* Chart: slow drag reads values with a tick per point, a flick steps the period. */
  await page.touchscreen.tap((await center(page, '.dr-pill[data-range="septJours"]')).x, pill.y); await sleep(1300);
  const hit = await center(page, '.hero-left-chart .rev-hit');
  const ticks0 = await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length);
  await page.touchscreen.touchStart(hit.left + 12, hit.y);
  for (let i = 1; i <= 12; i++) { await page.touchscreen.touchMove(hit.left + 12 + i * (hit.w - 30) / 12, hit.y); await sleep(45); }
  const reading = await page.evaluate(() => document.querySelector('.hero-left-chart .rev-hit').closest('svg').classList.contains('is-hover'));
  await page.touchscreen.touchEnd(); await sleep(400);
  const ticks = await page.evaluate(() => window.__hap.filter((h) => h === 'selectionChanged').length) - ticks0;
  check(reading, 'a slow drag shows the value under the finger');
  check(ticks >= 3 && ticks <= 7, 'one tick per data point across 7 days (' + ticks + ')');
  check(await page.$eval('.dr-pill[data-range="septJours"]', (e) => e.classList.contains('on')), 'letting go of a slow drag keeps the period');
  check(await page.evaluate(() => window.__hap.includes('selectionStart') && window.__hap.includes('selectionEnd')), 'the reading opens and closes one haptic session');
  await page.touchscreen.touchStart(hit.x + 60, hit.y);
  await page.touchscreen.touchMove(hit.x, hit.y);
  await page.touchscreen.touchMove(hit.x - 60, hit.y);
  await page.touchscreen.touchEnd(); await sleep(1300);
  check(await page.$eval('.dr-pill[data-range="trenteJours"]', (e) => e.classList.contains('on')), 'a quick flick still steps to the next period');

  /* Dark: no surface paints white first. */
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.vexelMode = 'dark'; });
  await sleep(300);
  const firstFrame = await page.evaluate(() => new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'feel-legacy-card';
    card.style.cssText = 'width:120px;height:80px;background:#fff';
    card.textContent = '171 MAD';
    (document.querySelector('.app .container') || document.querySelector('.app')).appendChild(card);
    requestAnimationFrame(() => resolve(getComputedStyle(card).backgroundColor));
  }));
  check(!/255, 255, 255/.test(firstFrame), 'a legacy white card is dark in its first painted frame (' + firstFrame + ')');
  const orders = await page.evaluate(() => new Promise((resolve) => {
    window.KiwiNativeHostAction({ action: 'navigate', id: 'transactions' });
    requestAnimationFrame(() => {
      const white = [...document.querySelectorAll('.app *')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return false;
        if (e.closest('.gk-qr,.btn-slim,.kc-sw,mark,.ai-btn')) return false;
        const m = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) || []).map(Number);
        return m.length >= 3 && (m[3] === undefined || m[3] > 0.85) && Math.min(m[0], m[1], m[2]) >= 234;
      }).map((e) => e.className || e.tagName);
      resolve(white);
    });
  }));
  check(orders.length === 0, 'Orders opens in dark with no white surface in its first frame' + (orders.length ? ' (' + orders.slice(0, 4).join(', ') + ')' : ''));
  await page.screenshot({ path: path.join(shots, 'orders-dark.png') });

  /* The paid moment: on screen, never in the way, success haptic once. */
  const paid = await page.evaluate(() => new Promise((resolve) => {
    const before = window.__hap.filter((h) => h === 'notification').length;
    window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: 171, method: 'cash' } }));
    setTimeout(() => {
      const box = document.querySelector('.kiwi-paid');
      const r = box.getBoundingClientRect();
      resolve({ on: box.classList.contains('is-in'), text: box.textContent, events: getComputedStyle(box).pointerEvents, opacity: +getComputedStyle(box).opacity,
        haptics: window.__hap.filter((h) => h === 'notification').length - before, centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2, role: box.getAttribute('role') });
    }, 420);
  }));
  await page.screenshot({ path: path.join(shots, 'paid.png') });
  check(paid.on && /171,00\s*MAD/.test(paid.text) && /Paid/.test(paid.text) && paid.opacity > 0.9 && paid.centred, 'a paid sale shows check, amount and "Paid" in the middle of the screen');
  check(paid.events === 'none' && paid.role === 'status', 'the paid moment never takes a tap and is read out by VoiceOver');
  check(paid.haptics === 1, 'with one success haptic');
  await sleep(1300);
  check(await page.$eval('.kiwi-paid', (b) => b.classList.contains('is-out') && !b.classList.contains('is-in')), 'and leaves on its own after about a second');
  const quiet = await page.evaluate(() => { const n = window.__hap.length; window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: 50, haptic: false } })); return window.__hap.length - n; });
  check(quiet === 0, 'a register that already played its haptic gets no second one');
  await context.close();

  /* Native sheet: the Face ID offer and the sign-out question go to iOS. */
  {
    const { page, context, requests } = await phone('light', { hostSheet: true });
    await page.evaluate(() => document.querySelector('[data-kno-account="sign-out"]').click());
    await sleep(200);
    const ask = await page.evaluate(() => window.__sheets[window.__sheets.length - 1]);
    check(ask && ask.title === 'Sign out of Kiwi Pro?' && ask.actions.some((a) => a.id === 'sign-out' && a.style === 'destructive') && ask.actions.some((a) => a.id === 'cancel'), 'signing out asks first, in a native sheet with a destructive choice');
    check(!requests.some((u) => /\/auth\/logout/.test(u)), 'nothing is signed out while the sheet is open');
    await page.evaluate((id) => window.KiwiNativeSheetResult({ id, action: 'dismiss' }), ask.id); await sleep(300);
    check(!requests.some((u) => /\/auth\/logout/.test(u)), 'swiping the sheet away keeps the session');
    await page.evaluate(() => document.querySelector('[data-kno-account="sign-out"]').click()); await sleep(200);
    const again = await page.evaluate(() => window.__sheets[window.__sheets.length - 1].id);
    await page.evaluate((id) => window.KiwiNativeSheetResult({ id, action: 'sign-out' }), again); await sleep(500);
    check(requests.some((u) => /\/auth\/logout/.test(u)), 'choosing Sign out signs out');
    await context.close();
  }
  {
    const { page, context, requests } = await phone('light', { hostSheet: false });
    await page.evaluate(() => document.querySelector('[data-kno-account="sign-out"]').click()); await sleep(400);
    check(await page.evaluate(() => window.__sheets.length === 0) && requests.some((u) => /\/auth\/logout/.test(u)), 'a host without native sheets keeps the old direct path');
    await context.close();
  }

  /* Honest sync on a phone till. */
  {
    const { page, context } = await phone('light', { url: '/kiwi-caisse.html', demo: false });
    await sleep(800);
    await page.evaluate(() => {
      document.getElementById('pair')?.classList.remove('on');
      const pad = document.getElementById('cp-pin-screen'); if (pad) pad.style.display = 'none';
      window.KiwiLive = Object.assign(window.KiwiLive || {}, { queueStatus: () => ({ pending: 2, blocked: 0, storageError: false }), refreshQueue: () => Promise.resolve(), flush: () => Promise.resolve() });
      window.dispatchEvent(new Event('kiwi:outbox'));
    });
    await sleep(2600);
    await page.screenshot({ path: path.join(shots, 'sync-pill.png') });
    const pill = await page.evaluate(() => { const p = document.querySelector('.kiwi-sync-pill'); return p && { on: p.classList.contains('is-visible'), text: p.textContent }; });
    check(pill && pill.on && /2 (operations waiting to send|opérations à synchroniser)/.test(pill.text), 'the till says when sales are waiting to be sent (' + (pill && pill.text) + ')');
    await page.evaluate(() => { window.KiwiLive.queueStatus = () => ({ pending: 0, blocked: 0, storageError: false }); window.dispatchEvent(new Event('kiwi:outbox')); });
    await sleep(2600);
    check(await page.evaluate(() => !document.querySelector('.kiwi-sync-pill').classList.contains('is-visible')), 'and goes quiet once everything is sent');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\nnative-premium-feel: ${checks} checks OK`);
