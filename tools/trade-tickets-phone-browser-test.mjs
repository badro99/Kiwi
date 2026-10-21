#!/usr/bin/env node
/* trade-tickets-phone-browser-test · the trades whose ticket has its own name.
 *
 *   node tools/trade-tickets-phone-browser-test.mjs
 *
 * pos-mobile.js turns each register's ticket into a bottom sheet on a phone,
 * but it found the ticket by a class ending in "-ticket". The librairie calls
 * it a panier, the traiteur a quote, the fleuriste a bouquet, the gym a cart:
 * until 21 October those four stayed docked beside their catalogue at 390 px,
 * and the librairie's books shrank to a 100 px strip under a full-screen basket.
 * The traiteur's due banner also left its sentence one word wide.
 *
 * At 390 × 844, mobile, in French and in Arabic, this holds:
 *   · each of the four tickets rests as a bottom sheet (fixed, only its peek
 *     bar on screen) and the catalogue beside it gets the width back;
 *   · tapping two books keeps ONE peek bar, the same node, showing the total.
 *     The librairie rebuilds its basket with innerHTML on every tap, which used
 *     to wipe the peek and build a new one, with a new listener, each time;
 *   · the peek opens the sheet;
 *   · the traiteur's due banner and event names keep a readable width, and
 *     nothing on its events screen reaches past the edge;
 *   · in a payment dialog on a 375 × 667 phone, the scan launcher no longer
 *     sits on the pharmacy's « Encaisser » button;
 *   · no page error.
 *
 * KIWI_ROOT=<dir> runs it against another checkout (to prove it fails before
 * the fix). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

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
const S = suite('trade-tickets-phone', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const spills = (page) => page.evaluate(() => {
  const W = innerWidth, out = [];
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const reachable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) { const r = p.getBoundingClientRect(); if (r.right <= W + 1 && r.left >= -1) return true; }
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length || !shown(el) || el.closest('.vx-ticket')) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    if (((b.right > W + 2 && b.left < W) || (b.left < -2 && b.right > 0)) && !reachable(el)) {
      out.push(`${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className : '').split(' ')[0]} [${Math.round(b.left)}…${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return out;
});

/* Where a ticket sits: a resting sheet is fixed and shows only its peek. */
const sheet = (page, sel) => page.evaluate((s) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { fixed: getComputedStyle(el).position === 'fixed', top: Math.round(r.top), width: Math.round(r.width), h: innerHeight };
}, sel);
const widthOf = (page, sel) => page.evaluate((s) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length);
  return el ? Math.round(el.getBoundingClientRect().width) : 0;
}, sel);

async function open(tr, lang, trade, ready, vp = { width: 390, height: 844 }) {
  const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, lang);
  tr.step(`open the demo ${trade}`);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await page.evaluate((t) => window.KiwiPosDispatch.unlockById(t), trade);
  await page.waitForFunction((s) => document.querySelector(s), { timeout: 30000 }, ready);
  await sleep(1200);
  return { page, errors };
}
const tap = async (page, sel) => { const ok = await page.evaluate((s) => { const b = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!b) return false; b.click(); return true; }, sel); await sleep(700); return ok; };

try {
  for (const lang of ['fr', 'ar']) {
    await S.run(`librairie · ${lang}`, async (tr) => {
      const { page, errors } = await open(tr, lang, 'librairie', '.lb-card');
      const s = await sheet(page, '.lb-panier');
      check(s && s.fixed && s.top >= s.h - 90 && s.width >= 380, `${lang}: the librairie basket rests as a bottom sheet (top ${s && s.top} of ${s && s.h})`);
      const grid = await widthOf(page, '#lb-gridwrap');
      check(grid >= 340, `${lang}: the books get the screen width back (${grid} px)`);
      await page.evaluate(() => { window.__peek = document.querySelector('.lb-panier > .vx-peek'); });
      tr.step('tap two books');
      for (const n of [0, 1]) {
        await page.evaluate((i) => { const c = [...document.querySelectorAll('.lb-card:not(.is-out)')]; if (c[i]) c[i].click(); }, n);
        await sleep(600);
        await tap(page, '#lb-sheet-add');
      }
      await sleep(400);
      const peek = await page.evaluate(() => {
        const all = document.querySelectorAll('.vx-peek');
        const p = document.querySelector('.lb-panier > .vx-peek');
        return { count: all.length, same: !!p && p === window.__peek, first: !!p && p.parentElement.firstElementChild === p, text: p ? p.textContent.trim() : '' };
      });
      check(peek.count === 1 && peek.same && peek.first, `${lang}: after two taps one peek bar, the same one, still on top of the basket`);
      check(/[1-9]/.test(peek.text), `${lang}: the peek shows the basket total (« ${peek.text} »)`);
      tr.step('raise the basket');
      await tap(page, '.lb-panier > .vx-peek');
      const up = await sheet(page, '.lb-panier');
      check(up && up.top < up.h / 2, `${lang}: tapping the peek raises the basket (top ${up && up.top})`);
      check(errors.length === 0, `${lang}: no page error` + (errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''));
    });

    await S.run(`traiteur · ${lang}`, async (tr) => {
      const { page, errors } = await open(tr, lang, 'traiteur', '.tr-evcard');
      const due = await widthOf(page, '.tr-duebar-txt');
      check(due >= 250, `${lang}: the due banner's sentence keeps ${due} px (≥ 250)`);
      const names = await page.evaluate(() => [...document.querySelectorAll('.tr-evname')].filter((x) => x.getClientRects().length).map((x) => Math.round(x.getBoundingClientRect().width)));
      check(names.length && Math.min(...names) >= 200, `${lang}: every event name keeps at least 200 px (narrowest ${Math.min(...names)})`);
      const out = await spills(page);
      check(out.length === 0, `${lang}: nothing on the events screen reaches past the edge` + (out.length ? '\n      ' + out.slice(0, 4).join('\n      ') : ''));
      tr.step('open the quote builder');
      await tap(page, '[data-tr-view="devis"]');
      await page.waitForFunction(() => document.querySelector('.tr-quote'), { timeout: 15000 });
      await sleep(600);
      const s = await sheet(page, '.tr-quote');
      check(s && s.fixed && s.top >= s.h - 90, `${lang}: the quote rests as a bottom sheet (top ${s && s.top} of ${s && s.h})`);
      const dishes = await widthOf(page, '.tr-dishgrid');
      check(dishes >= 330, `${lang}: the dishes get the screen width back (${dishes} px)`);
      check(errors.length === 0, `${lang}: no page error` + (errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''));
    });
  }

  for (const [trade, ready, ticket, view] of [['fleuriste', '.fl-bouquet', '.fl-bouquet'], ['gym', '.gy-cart', '.gy-cart', '[data-gy-view="comptoir"]']]) {
    await S.run(`${trade} · fr`, async (tr) => {
      const { page, errors } = await open(tr, 'fr', trade, ready);
      if (view) { tr.step('open the counter'); await tap(page, view); }
      const s = await sheet(page, ticket);
      check(s && s.fixed && s.top >= s.h - 90, `${trade}: the ticket rests as a bottom sheet (top ${s && s.top} of ${s && s.h})`);
      check(errors.length === 0, `${trade}: no page error` + (errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''));
    });
  }

  /* The scan launcher sat above every dialog: on a 375 × 667 phone it hid half
   * of the pharmacy's « Encaisser » button. Every point of that button must
   * land on the button itself. */
  await S.run('pharmacie · 375 × 667', async (tr) => {
    const { page, errors } = await open(tr, 'fr', 'pharmacie', '.ph-card', { width: 375, height: 667 });
    tr.step('sell one box and open the payment');
    await tap(page, '.ph-card:not(.is-out)');
    await tap(page, '#ph-sheet-add');
    await tap(page, '#ph-validate');
    await page.waitForFunction(() => document.querySelector('#ph-rc-pay'), { timeout: 15000 });
    await sleep(400);
    const hit = await page.evaluate(() => {
      const b = document.querySelector('#ph-rc-pay').getBoundingClientRect();
      const pts = [[0.1, 0.2], [0.5, 0.5], [0.9, 0.2], [0.1, 0.85], [0.9, 0.85]];
      return pts.map(([x, y]) => { const e = document.elementFromPoint(b.left + b.width * x, b.top + b.height * y); return e && e.closest('#ph-rc-pay') ? 'pay' : (e && e.closest('.krs-launch') ? 'scan' : (e ? e.className.toString().slice(0, 24) : 'none')); });
    });
    check(hit.every((h) => h === 'pay'), `the payment button takes every tap on it (${hit.join(', ')})`);
    check(errors.length === 0, 'pharmacie: no page error' + (errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ trade-tickets-phone-browser-test · ${checks} checks`);
await S.finish();
