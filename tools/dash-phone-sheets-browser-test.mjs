#!/usr/bin/env node
/* dash-phone-sheets-browser-test · no sheet or picker of the dashboard spills off a phone.
 *
 *   node tools/dash-phone-sheets-browser-test.mjs
 *
 * dash-phone-pages-browser-test.mjs opens every page and sub-tab at 390 px;
 * this one opens what those pages open: every button of every sidebar page
 * of the demo store that brings up a sheet, a drawer or a picker, measured
 * the same way. The first sweep found Stock › Nouvel article pushing its
 * Protéines field to 416 px on a 390 px screen (three 1fr columns of number
 * fields cannot shrink below a number field's own width).
 *
 * Buttons that leave the page, print, share, delete or lock are skipped, and
 * each action is opened once even when several pages show it. A planted
 * 600 px sheet checks the detector on each pass. KIWI_PHONE_PASS=ar runs it
 * right to left (dash-phone-sheets-ar-browser-test.mjs). */
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

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(tr, ctx, { flag, lang }) {
  const page = tr.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on, l) => {
    try {
      if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
      localStorage.setItem('kiwiSkipOnboard', '1');
      localStorage.setItem('kiwiLang', l);
    } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag, lang);
  page.setDefaultNavigationTimeout(60000);
  // coverage: surface=dashboard locale=fr viewport=phone
  // coverage: surface=dashboard locale=ar viewport=phone
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  await sleep(800);
  return page;
}

/* Every visible element whose box crosses the left or right edge of the
   screen, unless an ancestor on screen scrolls sideways (a tab strip, a
   wide table in its own scroller): the finger reaches that one. */
const spills = (page) => page.evaluate(() => {
  const W = innerWidth, out = [];
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const reachable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) {
        const r = p.getBoundingClientRect();
        if (r.right <= W + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length || !shown(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    const crosses = (b.right > W + 2 && b.left < W) || (b.left < -2 && b.right > 0);
    if (crosses && !reachable(el)) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} [${Math.round(b.left)}…${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return { docW: document.documentElement.scrollWidth, W, out };
});

/* A sheet's own body scrolls up and down on a phone (mobile.css sets
   overflow-y:auto), and CSS then makes it scroll sideways too: anything too
   wide inside it no longer crosses the screen edge, it just slides under the
   finger. The page measure counts such a scroller as reachable, which is
   right for a tab strip and wrong for a whole sheet. So an open sheet, its
   body and its foot must not scroll sideways at all. */
const sheetSlides = (page) => page.evaluate(() => {
  const out = [];
  const sel = '.kiwi-modal, .kiwi-modal-body, .kiwi-modal-foot, .kiwi-drawer, .kiwi-drawer-body, .kiwi-drawer-foot, .kiwi-sheet, [role="dialog"]';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20 || getComputedStyle(el).visibility === 'hidden') continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      let widest = null, w = 0;
      for (const c of el.querySelectorAll('*')) { const b = c.getBoundingClientRect(); if (b.right - r.left > w && b.width > 4) { w = b.right - r.left; widest = c; } }
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      const wc = widest ? widest.tagName.toLowerCase() + (widest.id ? '#' + widest.id : '') + (typeof widest.className === 'string' && widest.className ? '.' + widest.className.trim().split(/\s+/)[0] : '') : '';
      out.push(`${cls || el.tagName.toLowerCase()} slides sideways ${el.scrollWidth}/${el.clientWidth}${wc ? ' · widest ' + wc + ' "' + (widest.textContent || '').trim().slice(0, 24) + '"' : ''}`);
    }
  }
  return out;
});

const PASSES = [
  { id: 'fr', suite: 'dash-phone-sheets', name: 'sheets · French', flag: false, lang: 'fr' },
  { id: 'ar', suite: 'dash-phone-sheets-ar', name: 'sheets · Arabic', flag: false, lang: 'ar' },
];
const PASS = PASSES.find((p) => p.id === (process.env.KIWI_PHONE_PASS || 'fr')) || PASSES[0];
const S = suite(PASS.suite, { browser });
const SKIP = /logout|sign-out|signout|delete|remove|supprimer|reset|wipe|lock|switch-venue|venue-switch|print|export|download|share|whatsapp|call|mailto|open-caisse|go-caisse|nav-|kiosk|install|pwa/i;
const OVERLAY = '.kiwi-modal, .kiwi-drawer, [role="dialog"], .kiwi-sheet, .modal-veil.is-open, .date-picker, .dr-pop, [data-popover]';

try {
  await S.run(PASS.name, async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, PASS);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const overlays = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20 && getComputedStyle(e).visibility !== 'hidden'; }).length, OVERLAY);
    /* A sheet that Escape does not close stays on screen, and counting sheets
       before and after a click then sees no change when the next one opens:
       that is how Stock › Nouvel article slipped through the first version.
       So every sheet already open is stamped before the click, and a sheet
       counts as opened when one without the stamp appears. */
    const stampOpen = () => page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => e.setAttribute('data-sheet-seen', '1')), OVERLAY);
    const freshOpen = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].some((e) => { const r = e.getBoundingClientRect(); return !e.hasAttribute('data-sheet-seen') && r.width > 20 && r.height > 20 && getComputedStyle(e).visibility !== 'hidden'; }), OVERLAY);
    const closeAll = async () => {
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(90); }
      await page.evaluate(() => document.querySelectorAll('.kiwi-modal-close, .kiwi-drawer-close, [data-dismiss], [data-close]').forEach((b) => { try { if (b.offsetWidth) b.click(); } catch (_) {} }));
      await sleep(200);
    };
    const goto = (n) => page.evaluate((n) => { const a = document.querySelector('.sidebar [data-nav="' + n + '"]'); a && a.click(); }, n);
    const mark = () => page.evaluate((skip) => [...document.querySelectorAll('#kw-main [data-action], main [data-action], .kiwi-page [data-action], header [data-action]')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight * 4 && !new RegExp(skip, 'i').test(b.getAttribute('data-action')); })
      .map((b, i) => { b.setAttribute('data-sheet-sweep', String(i)); return { i, a: b.getAttribute('data-action'), arg: b.getAttribute('data-arg') || '', key: b.getAttribute('data-action') + '|' + (b.getAttribute('data-arg') || ''), t: (b.textContent || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30) }; }), SKIP.source);
    /* Click by what the button does, never by its position: a page that
       re-renders after a click renumbers its buttons, and the sweep then
       pressed the wrong one (Stock › Nouvel article was never opened). */
    const press = (x) => page.evaluate((a, arg) => {
      const b = [...document.querySelectorAll('#kw-main [data-action], main [data-action], .kiwi-page [data-action], header [data-action]')]
        .find((e) => e.getAttribute('data-action') === a && (e.getAttribute('data-arg') || '') === arg && e.getBoundingClientRect().width > 0);
      if (b) b.click();
      return !!b;
    }, x.a, x.arg);

    tr.step('the detector sees a planted 600 px sheet');
    const planted = await page.evaluate(() => {
      if (!window.Kiwi || !Kiwi.modal) return false;
      Kiwi.modal({ title: 'probe', body: '<div id="sheet-probe" style="width:600px;height:20px"></div>' });
      return true;
    });
    check(planted, `${PASS.name}: Kiwi.modal opens a planted sheet`);
    await sleep(500);
    check(await overlays() > 0, `${PASS.name}: the sweep sees an open sheet`);
    const slid = await sheetSlides(page);
    check(slid.some((x) => x.includes('#sheet-probe')), `${PASS.name}: the measure catches a 600 px element inside a sheet (${slid[0] || 'nothing'})`);
    await closeAll();
    check(await overlays() === 0, `${PASS.name}: Escape closes the sheet again`);

    /* KIWI_SHEETS_ONLY=stock narrows the sweep to one page, KIWI_SHEETS_VERBOSE=1
       prints every sheet it opens: both for chasing one spill by hand. */
    const only = process.env.KIWI_SHEETS_ONLY || '';
    const verbose = !!process.env.KIWI_SHEETS_VERBOSE;
    const navs = (await page.evaluate(() => [...new Set([...document.querySelectorAll('.sidebar [data-nav]')].map((a) => a.getAttribute('data-nav')))]))
      .filter((n) => !only || n === only);
    if (!only) check(navs.length >= 8, `${PASS.name}: ${navs.length} sidebar destinations to sweep`);
    const seen = new Set();
    const bad = [];
    let sheets = 0;
    for (const n of navs) {
      tr.step('sheets of ' + n);
      await closeAll();
      await goto(n);
      await sleep(800);
      for (const x of await mark()) {
        if (seen.has(x.key)) continue;
        seen.add(x.key);
        await stampOpen();
        if (!(await press(x))) continue;
        await sleep(450);
        const opened = await freshOpen();
        if (verbose) {
          const left = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return e.hasAttribute('data-sheet-seen') && r.width > 20 && r.height > 20 && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName) + (e.id ? '#' + e.id : '')), OVERLAY);
          console.log('    ·', n, x.key, '"' + x.t + '"', opened ? 'opened' : '-', left.length ? 'still open: ' + left.join(',') : '');
        }
        if (opened) {
          sheets++;
          const m = await spills(page);
          const slides = await sheetSlides(page);
          if (m.out.length || m.docW > m.W || slides.length) bad.push(`${n} › ${x.key} "${x.t}": page ${m.docW} wide · ${m.out.concat(slides).slice(0, 3).join(' · ')}`);
        }
        await closeAll();
        /* Only go back when the action left the page: re-opening it for every
           button is what made the sweep slow. A page that lost its marks
           (it re-rendered, or the action navigated) is opened and marked again. */
        const here = await page.evaluate(() => document.querySelectorAll('[data-sheet-sweep]').length);
        if (!here) {
          await goto(n);
          await sleep(400);
          await mark();
        }
      }
    }
    if (!only) check(sheets >= 20, `${PASS.name}: ${sheets} sheets and pickers opened`);
    check(bad.length === 0, `${PASS.name}: none of them reaches past the screen` + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
    check(page.errors.length === 0, `${PASS.name}: no page error` + (page.errors.length ? ' · ' + page.errors.slice(0, 3).join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ ${PASS.suite}-browser-test · ${checks} checks`);
await S.finish();
