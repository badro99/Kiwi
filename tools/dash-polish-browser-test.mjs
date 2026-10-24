#!/usr/bin/env node
/* dash-polish-browser-test · the details of the 2027 dashboard that read as
 * unfinished when they slip, behind kiwiSkin2027:dashboard, in a real
 * Chromium, on the demo store.
 *
 *   node tools/dash-polish-browser-test.mjs
 *
 * What it holds:
 *   · 1440: the phone's nav bar is never drawn on a wide window (it showed,
 *     unstyled, above the desktop bar), nor after the window grows from a
 *     phone's width to an iPad's in landscape; the reading-progress hairline
 *     is not drawn; the key figure keeps a space before its unit; every
 *     segment's label sits in the middle of its segment; Home's shipped
 *     section titles are in sentence case; the goal is written grouped; the
 *     period opens the shipped picker, on screen, from Home;
 *   · 1180: the top bar keeps the search's words, its magnifier painted, and
 *     Kiwi AI on one line; Compliance never scrolls sideways, its title at the
 *     Heading size, its cards the kit's flat card, its eyebrows in sentence
 *     case, its figures never broken from their unit;
 *   · 390, FR: Orders' five filters become the scrolling track rather than
 *     squeezing "Remboursements" under its label; Compliance names itself in
 *     the nav bar and draws no second title; the status line ends above the
 *     tab capsule;
 *   · 390, AR: Orders writes درهم as the rest of the dashboard does; the
 *     venue's Latin name is cut at its own end;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

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
const S = suite('dash-polish', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo store past the onboarding, the service worker kept out, /api/
   answering 503 as offline. */
async function open(tr, ctx, { width = 1440, height = 900, lang = 'fr' } = {}) {
  const page = tr.watch(await ctx.newPage());
  await pinTradingHour(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width, height });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((lang) => {
    localStorage.setItem('kiwiSkin2027:dashboard', '1');
    localStorage.setItem('kiwiSkipOnboard', '1');
    localStorage.setItem('kiwiLang', lang);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, lang);
  tr.step('open the dashboard');
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d|استكشف/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.getElementById('kit-home') && !!document.querySelector('#kit-home .k-dh__kf bdi'), { timeout: 20000 });
  await sleep(1200);
  return { page, errors };
}
const nav = (page, dest) => page.evaluate((d) => {
  if (d === 'orders') document.querySelector('.sidebar nav a[data-nav="transactions"]').click();
  if (d === 'compliance') document.querySelector('.sidebar nav a[data-nav="conformite"]').click();
}, dest);

console.log('dash-polish-browser-test');
try {
  await S.run('1440 · Home', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=desktop
    const { page, errors } = await open(tr, ctx);
    const v = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const pnav = q('.topbar .k-pnav');
      const kf = q('#kit-home .k-dh__kf'), fig = kf.querySelector('bdi'), unit = kf.querySelector('span');
      const segs = [...document.querySelectorAll('#kit-home k-segmented')].flatMap((g) => [...g.shadowRoot.querySelectorAll('.sg')]).map((b) => {
        const r = b.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(b); const t = rg.getBoundingClientRect();
        return { label: b.textContent.trim(), off: Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2) };
      });
      const caps = ['.dash-standard .oppo-eyebrow', '.dash-standard .block-head .t', '.dash-standard .hai-eyebrow', '.dash-standard .hh-ai-eyebrow', '.dash-standard .settle > .lbl']
        .flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => !e.children.length).map((e) => e.textContent.trim()).filter((s) => /[A-ZÀ-Ý]{2}/.test(s) && s === s.toUpperCase());
      const sp = q('.scroll-progress');
      return {
        pnav: pnav ? getComputedStyle(pnav).display : 'none',
        gap: unit.getBoundingClientRect().left - fig.getBoundingClientRect().right,
        segs, caps, progress: sp ? getComputedStyle(sp).display : 'none',
        goal: (q('#kit-dd-goal') || {}).textContent || '',
      };
    });
    check(v.pnav === 'none', `the phone's nav bar is not drawn on a wide window (${v.pnav})`);
    check(v.progress === 'none', 'the shipped reading-progress hairline is not drawn');
    check(v.gap >= 3, `the key figure keeps a space before its unit (${v.gap.toFixed(1)} px)`);
    const off = v.segs.filter((s) => s.off > 2);
    check(v.segs.length >= 4 && !off.length, 'every range label sits in the middle of its segment' + (off.length ? ' · ' + off.map((s) => s.label + ' ' + s.off.toFixed(1)).join(', ') : ''));
    check(!v.caps.length, "Home's shipped section titles are in sentence case" + (v.caps.length ? ' · ' + v.caps.join(' | ') : ''));
    check(v.goal && !/\d{5}/.test(v.goal), `the goal is written grouped (${v.goal.replace(/\s+/g, ' ').trim()})`);

    tr.step('the period, from Home');
    const pick = await page.$('#kit-home .k-dh__pick');
    const box = pick && await pick.boundingBox();
    check(!!box && box.height >= 44, `Home offers the period picker on a desktop (${box ? Math.round(box.height) : 'none'} tall)`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(700);
    const p = await page.evaluate(() => { const e = document.querySelector('.dr-popover.open'); if (!e) return null; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth, H: innerHeight }; });
    check(p && p.w > 300 && p.h > 200 && p.l >= 0 && p.t >= 0 && p.r <= p.W && p.b <= p.H, `the shipped picker opens on screen (${p ? Math.round(p.w) + '×' + Math.round(p.h) + ' at ' + Math.round(p.l) + ',' + Math.round(p.t) : 'not open'})`);
    await page.keyboard.press('Escape');

    tr.step('narrow to a phone, then widen to an iPad in landscape');
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-k-phone'), { timeout: 10000 });
    await sleep(400);
    await page.setViewport({ width: 1180, height: 820 });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-k-phone'), { timeout: 10000 });
    await sleep(400);
    const back = await page.evaluate(() => { const n = document.querySelector('.topbar .k-pnav'); return n ? getComputedStyle(n).display : 'none'; });
    check(back === 'none', `after a phone's width, a wide window draws no phone nav bar (${back})`);
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('1180 · the top bar and Compliance', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=tablet
    const { page, errors } = await open(tr, ctx, { width: 1180, height: 820 });
    tr.step('open Compliance');
    await nav(page, 'compliance');
    await page.waitForFunction(() => !!document.querySelector('.dash-conformite .cf-card') && !!document.getElementById('kit-compliance'), { timeout: 15000 });
    await sleep(800);
    const v = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      const tok = (n) => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;font-size:var(' + n + ')'; document.body.appendChild(p); const v = getComputedStyle(p).fontSize; p.remove(); return v; };
      const s = q('.topbar .search-big'), ph = s.querySelector('.ph'), glass = s.querySelector('svg'), ai = q('.topbar .ai-btn');
      const card = getComputedStyle(q('.dash-conformite .cf-card'));
      const eyebrows = [...document.querySelectorAll('.dash-conformite :is(.cf-eyebrow, .cf-eyebrow-sub, .cf-z-expected-l)')].filter((e) => getComputedStyle(e).textTransform === 'uppercase').length;
      const broken = [...document.querySelectorAll('.dash-conformite :is(.cf-z-counter-v, .cf-z-expected-v, .cf-z-denom-sub)')].filter((e) => e.getClientRects().length > 1 || e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight || '20') * 1.5).map((e) => e.textContent.trim());
      return {
        sw: document.documentElement.scrollWidth, w: innerWidth,
        search: s.getBoundingClientRect().width, ph: ph ? ph.getBoundingClientRect().width : 0,
        glass: Math.abs(lum(getComputedStyle(glass).color) - lum(getComputedStyle(s).backgroundColor)),
        aiH: ai.getBoundingClientRect().height,
        title: getComputedStyle(q('.dash-conformite .cf-title')).fontSize, heading: tok('--k-fs-heading'),
        shadow: card.boxShadow, cardBg: card.backgroundImage, eyebrows, broken,
        /* A page's head sits 28 below its page's top (24, then the head's 4). */
        headAt: q('.dash-conformite .cf-title').getBoundingClientRect().top - q('.dash-conformite').getBoundingClientRect().top,
      };
    });
    check(v.search >= 160 && v.ph >= 80, `the search keeps its words beside the icons (${Math.round(v.search)} wide, text ${Math.round(v.ph)})`);
    check(v.glass > 0.25, `the search's magnifier is painted against its field (contrast ${v.glass.toFixed(2)})`);
    check(v.aiH <= 48, `Kiwi AI stays on one line (${Math.round(v.aiH)} tall)`);
    check(v.sw <= v.w, `Compliance never scrolls sideways (${v.sw} ≤ ${v.w})`);
    check(v.title === v.heading, `Compliance's title is at the Heading size, as every page's (${v.title}, Heading ${v.heading})`);
    check(Math.abs(v.headAt - 28) <= 1, `its title sits where every page's title sits (${Math.round(v.headAt)} below the page's top, 28 elsewhere)`);
    check(v.shadow === 'none' && v.cardBg === 'none', `its cards are the kit's flat card (${v.shadow.slice(0, 30)}, ${v.cardBg.slice(0, 30)})`);
    check(v.eyebrows === 0, `its eyebrows are in sentence case (${v.eyebrows} in capitals)`);
    check(!v.broken.length, 'its figures stay on one line with their unit' + (v.broken.length ? ' · ' + v.broken.join(' | ') : ''));
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 FR · Orders, Compliance, the status line', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=phone
    const { page, errors } = await open(tr, ctx, { width: 390, height: 844 });
    tr.step('open Orders');
    await nav(page, 'orders');
    await page.waitForFunction(() => !!document.querySelector('#kit-orders [data-do="filter"]'), { timeout: 15000 });
    await sleep(900);
    const f = await page.evaluate(() => {
      const g = document.querySelector('#kit-orders [data-do="filter"]');
      const squeezed = [...g.shadowRoot.querySelectorAll('.sg')].filter((b) => { const rg = document.createRange(); rg.selectNodeContents(b); return rg.getBoundingClientRect().width + 24 > b.getBoundingClientRect().width + 1; }).map((b) => b.textContent.trim());
      return { squeezed, scroll: g.hasAttribute('data-scroll') };
    });
    check(!f.squeezed.length, `no filter label is squeezed under its segment (scrolling track: ${f.scroll})` + (f.squeezed.length ? ' · ' + f.squeezed.join(', ') : ''));
    tr.step('the end of the page');
    const end = await page.evaluate(async () => {
      window.scrollTo({ top: 1e7, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 500));
      const s = document.querySelector('.status-bar'), t = document.querySelector('k-tabbar.k-ptabs');
      const kids = [...s.children].filter((k) => k.getClientRects().length);
      return { text: Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)), tab: t.getBoundingClientRect().top };
    });
    check(end.text <= end.tab, `the status line ends above the tab capsule (${Math.round(end.text)} ≤ ${Math.round(end.tab)})`);

    tr.step('open Compliance');
    await nav(page, 'compliance');
    await page.waitForFunction(() => !!document.getElementById('kit-compliance'), { timeout: 15000 });
    await page.evaluate(() => window.KiwiDashPhone && window.KiwiDashPhone.paint());
    await sleep(800);
    const c = await page.evaluate(() => ({
      title: ((document.querySelector('.k-pnav__title') || {}).textContent || '').trim(),
      head: getComputedStyle(document.querySelector('.dash-conformite .cf-head')).display,
      own: document.querySelector('.dash-conformite .cf-title').textContent.trim(),
    }));
    check(c.title && c.title === c.own, `Compliance names itself in the nav bar (${c.title})`);
    check(c.head === 'none', `and draws no second title below it (${c.head})`);
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 AR · the currency and the venue', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=ar viewport=phone
    const { page, errors } = await open(tr, ctx, { width: 390, height: 844, lang: 'ar' });
    const venue = await page.evaluate(() => { const e = document.querySelector('.k-pnav__vn'); return e ? e.getAttribute('dir') : null; });
    check(venue === 'auto', `the venue's name takes its own direction, so a Latin name is cut at its end (${venue})`);
    tr.step('open Orders');
    await nav(page, 'orders');
    await page.waitForFunction(() => !!document.querySelector('#kit-orders .k-do__kf'), { timeout: 15000 });
    await sleep(900);
    const o = await page.evaluate(() => {
      const list = document.querySelector('#kit-orders .k-do__rows k-list');
      return { unit: document.querySelector('#kit-orders .k-do__kf span').textContent.trim(), sum: document.querySelector('#kit-orders .k-do__sum').textContent, row: list && list.rows && list.rows[0] ? list.rows[0].value : '' };
    });
    check(o.unit === 'درهم' && !/\bMAD\b/.test(o.sum + ' ' + o.row), `Orders writes درهم, as Home and the Report do (${o.unit} · ${o.row})`);
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-polish-browser-test · ${checks} checks`);
await S.finish();
