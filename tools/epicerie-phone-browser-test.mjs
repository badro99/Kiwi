#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* epicerie-phone-browser-test · the épicerie till (Kiwi Basic) on a phone.
 *
 *   node tools/epicerie-phone-browser-test.mjs
 *
 * A corner shop is the store most likely to run its till on a phone. At
 * 390 × 844, mobile, in French and in Arabic, this opens every view of the
 * demo épicerie and the sheets a grocer uses all day (payment, cash, the tab
 * picker, a new neighbour, weighing, search, a neighbour's tab, repayment,
 * the WhatsApp reminder), and holds:
 *   · nothing visible reaches past either edge of the screen outside a
 *     container the finger can scroll sideways;
 *   · on a neighbour's tab, the name keeps at least 150 px and the balance
 *     never sits on top of the name or the note. Until 21 October the
 *     balance and its label (« dû depuis il y a 1 semaine ») could not
 *     shrink, so the name and note fell into a one-word column under the
 *     amount;
 *   · no page error. */
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
const S = suite('epicerie-phone', { browser });
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
    if (!el.getClientRects().length || !shown(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    if (((b.right > W + 2 && b.left < W) || (b.left < -2 && b.right > 0)) && !reachable(el)) {
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(typeof el.className === 'string' ? el.className : '').split(' ')[0]} [${Math.round(b.left)}…${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return out;
});

try {
  for (const lang of forLocales(['fr', 'ar'])) {
    await S.run(lang === 'fr' ? 'French' : 'Arabic', async (tr) => {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = tr.watch(await ctx.newPage());
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
      await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, lang);
      tr.step('open the demo épicerie');
      // coverage: surface=caisse-entry locale=fr viewport=phone
      // coverage: surface=caisse-entry locale=ar viewport=phone
      await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
      await page.evaluate(() => window.KiwiPosDispatch.unlockById('epicerie'));
      await page.waitForFunction(() => document.querySelector('.ep-card'), { timeout: 30000 });
      await sleep(1000);

      const click = async (sel) => { const ok = await page.evaluate((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel); await sleep(600); return ok; };
      const close = async () => { await page.evaluate(() => { const x = [...document.querySelectorAll('[data-ep-close]')].filter((b) => b.offsetWidth).pop(); if (x) x.click(); }); await sleep(400); };
      const bad = [];
      let views = 0;
      const look = async (label) => { views++; tr.step(label); const o = await spills(page); if (o.length) bad.push(`${label}: ${o.slice(0, 3).join(' · ')}`); };

      await look('sale');
      await click('.ep-card:not(.is-out)'); await look('sale with a line');
      if (await click('#ep-pay')) { await look('payment'); await click('[data-ep-m="especes"]'); await look('cash'); await close(); await close(); }
      if (await click('#ep-pay')) { await click('[data-ep-m="ardoise"]'); await look('tab picker'); if (await click('#ep-cp-new')) await look('new neighbour'); await close(); await close(); await close(); }
      await page.evaluate(() => { const c = [...document.querySelectorAll('.ep-card')].find((b) => b.querySelector('.ep-card-flag.weigh, .ep-card-flag') && /kg/.test(b.textContent)); if (c) c.click(); }); await sleep(700); await look('weighing'); await close();
      if (await click('#ep-search-open')) { await look('search'); await close(); }
      let head = null;
      for (const v of ['carnet', 'stock', 'journee']) {
        await click(`[data-ep-view="${v}"]`); await look(v);
        if (v !== 'carnet') continue;
        await click('[data-ep-ard]'); await look('a neighbour\'s tab');
        head = await page.evaluate(() => {
          const r = (el) => el && el.getBoundingClientRect();
          const who = r(document.querySelector('.ep-dt-who')), name = r(document.querySelector('.ep-dt-who h3')), bal = r(document.querySelector('.ep-dt-bal'));
          if (!who || !bal) return null;
          const overlap = !(bal.right <= who.left + 1 || bal.left >= who.right - 1 || bal.bottom <= who.top + 1 || bal.top >= who.bottom - 1);
          return { name: Math.round(name.width), overlap };
        });
        if (await click('#ep-ard-settle')) { await look('repayment'); if (await click('[data-ep-settle="partial"]')) await look('partial repayment'); await close(); }
        await click('[data-ep-ard]'); if (await click('#ep-ard-wa')) { await look('WhatsApp reminder'); await close(); }
      }
      check(views >= 15, `${lang}: ${views} views and sheets opened`);
      check(bad.length === 0, `${lang}: nothing reaches past the screen` + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
      check(head && head.name >= 150, `${lang}: on a neighbour's tab the name keeps ${head && head.name} px (≥ 150)`);
      check(head && !head.overlap, `${lang}: and the balance does not sit on the name or the note`);
      check(errors.length === 0, `${lang}: no page error` + (errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''));
    });
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ epicerie-phone-browser-test · ${checks} checks`);
await S.finish();
