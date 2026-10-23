#!/usr/bin/env node
/* opening-float-test · opening the till on the kit (stage 4 (13), §18.9),
 * behind kiwiSkin2027:till, on the demo till in a real Chromium.
 *
 *   node tools/opening-float-test.mjs
 *
 * What it holds:
 *   · flag off: the shipped float chips, Open the till disabled until one is
 *     chosen, no kit count sheet;
 *   · flag on: the shipped chips are not drawn and Open the till opens
 *     <k-cash-count mode="open">: the key figure is the counted float,
 *     labelled count.opening_float, 0.00 before any entry; no Expected, no
 *     Difference; count.open waits for an amount;
 *   · the opening is TYPED (owner, 2026-10-16): no denomination rows, the
 *     keypad carries a decimal key, and count.by_denomination is the second
 *     way in; count.back_to_total brings what was counted back as the figure;
 *   · the last float is a chip to tap (count.same_as_last), never
 *     preselected; a row typed after it counts the rows;
 *   · count.open runs the shipped opening: openingFloat, the cash-session
 *     open event, the shift; one Commit on the local write; the float is
 *     remembered for next time;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const NOTES_AND_COINS = 11;   /* 4 notes + 7 coins, as till.js lists them */
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function openTill(flag) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:till', '1');
    localStorage.setItem('kiwi:openingFloat:v1:demo', '500');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openService === 'function' && !!document.getElementById('clockin-btn'), { timeout: 30000 });
  if (flag) await page.waitForFunction(() => document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await sleep(300);
  await page.evaluate(() => {
    window.__cash = [];
    if (window.KiwiCashSessions) window.KiwiCashSessions.emit = (ev) => { window.__cash.push(ev); return true; };
    window.__haptics = [];
    window.KiwiHaptics = window.KiwiHaptics || {};
    window.KiwiHaptics.play = (cls, gid, _p, meta) => { if (cls === 'Commit' || cls === 'Paid') window.__haptics.push([cls, meta && meta.trigger]); return null; };
  });
  return { page, errors };
}

console.log('opening-float-test');
try {
  /* Flag off: the shipped float chips. */
  {
    const { page, errors } = await openTill(false);
    const off = await page.evaluate(() => {
      const box = document.querySelector('.clockin-float');
      return { chips: !!box && getComputedStyle(box).display !== 'none', disabled: document.getElementById('clockin-btn').disabled };
    });
    check(off.chips && off.disabled, 'flag off: the shipped float chips, Open the till disabled until one is chosen');
    await page.evaluate(() => document.getElementById('clockin-btn').click());
    await sleep(200);
    check(await page.evaluate(() => !document.querySelector('k-cash-count')), 'flag off: no kit count sheet');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await page.close();
  }

  const { page, errors } = await openTill(true);
  const t = (k, a) => page.evaluate((key, args) => KiwiKit.t(key, args).replace(/[⁦-⁩]/g, ''), k, a || {});
  const tap = (sel) => page.evaluate((s) => {
    const el = document.querySelector('k-sheet k-cash-count').shadowRoot.querySelector(s);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click();
    return true;
  }, sel);

  const on = await page.evaluate(() => {
    const box = document.querySelector('.clockin-float');
    return { chips: !!box && getComputedStyle(box).display !== 'none', disabled: document.getElementById('clockin-btn').disabled };
  });
  check(!on.chips && !on.disabled, 'flag on: the shipped chips are not drawn and Open the till is ready');

  await page.evaluate(() => document.getElementById('clockin-btn').click());
  await sleep(400);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('k-sheet[size="count"]');
    const c = s && s.querySelector('k-cash-count');
    if (!c) return null;
    const R = c.shadowRoot;
    return {
      open: s.hasAttribute('open'), mode: c.getAttribute('mode'),
      label: R.querySelector('.fig .k-foot').textContent, fig: R.querySelector('[data-key-figure]').textContent,
      parts: R.querySelectorAll('.sum [data-k-part]').length, sumText: (R.querySelector('.sum') || { textContent: '' }).textContent.trim(),
      rows: R.querySelectorAll('[data-denom]').length,
      dec: !!R.querySelector('[data-kp-key="dec"]'), next: !!R.querySelector('[data-kp-key="next"]'),
      alt: (R.querySelector('[data-w="by-denom"]') || { textContent: '' }).textContent.trim(),
      commit: R.querySelector('[data-w="commit"]').textContent.trim(), disabled: R.querySelector('[data-w="commit"]').disabled,
      chip: R.querySelector('[data-chip="same"]') && R.querySelector('[data-chip="same"]').textContent.trim(),
      chipOn: R.querySelector('[data-chip="same"]') && R.querySelector('[data-chip="same"]').getAttribute('aria-checked'),
      shift: !!shiftOpenedAt,
    };
  });
  check(!!sheet && sheet.open && sheet.mode === 'open', 'Open the till opens the kit\'s count sheet in mode open');
  check(sheet.label === await t('count.opening_float') && /^0[.,]00/.test(sheet.fig.replace(/\s/g, '')), `the key figure is the float being counted, ${sheet.fig.trim()}, labelled count.opening_float`);
  check(sheet.parts === 0 && !sheet.sumText, 'no Expected and no Difference at open');
  check(sheet.rows === 0 && sheet.dec && !sheet.next, 'the opening is typed: no denomination rows, a decimal key and no Next');
  check(sheet.alt === await t('count.by_denomination'), 'counting note by note is the second way in, one tap away');
  check(sheet.commit.indexOf(await t('count.open')) >= 0 && sheet.disabled, 'count.open waits for an amount');
  check(sheet.chip === await t('count.same_as_last', { amount: await page.evaluate(() => KiwiKit.money(500, 2)) }) && sheet.chipOn !== 'true', 'the last float is a chip to tap, not preselected');
  check(!sheet.shift, 'nothing is opened while the sheet counts');

  const state = () => page.evaluate(() => {
    const c = document.querySelector('k-sheet k-cash-count');
    return { counted: c.counted(), disabled: c.shadowRoot.querySelector('[data-w="commit"]').disabled, rows: c.shadowRoot.querySelectorAll('[data-denom]').length };
  });
  for (const k of ['2', '0', '0']) { await tap(`[data-kp-key="${k}"]`); await sleep(80); }
  let st = await state();
  check(st.counted === 200 && !st.disabled, `typed on the keypad: ${st.counted}.00 counted, count.open ready`);

  await tap('[data-chip="same"]');
  await sleep(150);
  st = await state();
  check(st.counted === 500 && !st.disabled, 'the chip tapped: 500.00 counted, count.open ready');

  await tap('[data-w="by-denom"]');
  await sleep(150);
  st = await state();
  check(st.rows === NOTES_AND_COINS && st.counted === 500, `count.by_denomination opens the ${st.rows} rows, carrying the 500.00 over`);
  await tap('[data-denom="200"]');
  await sleep(100);
  await tap('[data-kp-key="1"]');
  await sleep(150);
  st = await state();
  check(st.counted === 200, `a row typed after the chip counts the rows (${st.counted})`);

  await tap('[data-w="enter-total"]');
  await sleep(150);
  st = await state();
  check(st.rows === 0 && st.counted === 200, 'count.back_to_total returns to the figure, carrying what was counted');
  await tap('[data-kp-key="del"]');
  await sleep(150);
  st = await state();
  check(st.counted === 20, `the carried figure is editable: one delete leaves ${st.counted}.00`);
  await tap('[data-kp-key="0"]');
  await sleep(150);
  st = await state();
  check(st.counted === 200, 'typed back to 200.00');

  await tap('[data-w="commit"]');
  await page.waitForFunction(() => !!shiftOpenedAt, { timeout: 20000 });
  await sleep(600);
  const done = await page.evaluate(() => ({
    float: openingFloat, ev: window.__cash.filter((e) => e.eventType === 'open').pop(),
    haptics: window.__haptics.slice(), sheet: !!document.querySelector('k-sheet[size="count"]'),
    mem: localStorage.getItem('kiwi:openingFloat:v1:demo'),
  }));
  check(done.float === 200 && !!done.ev && done.ev.expectedCents === 20000, `count.open runs the shipped opening: openingFloat 200, the open event at 20000 cents`);
  check(done.haptics.length === 1 && done.haptics[0][0] === 'Commit', `one Commit on the local write (${JSON.stringify(done.haptics)})`);
  check(!done.sheet && done.mem === '200', 'the sheet leaves, and 200 is remembered for next time');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ opening-float-test · ${checks} checks`);
