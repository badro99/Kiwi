#!/usr/bin/env node
/* dash-phone-browser-test · the dashboard on a phone with the 2027 flag on
 * (stage 5, §18.1, §10.18, §10.20, §18.6), in a real Chromium at 390 × 844,
 * mobile, on the demo store.
 *
 *   node tools/dash-phone-browser-test.mjs
 *
 * What it holds:
 *   · flag on, phone: html[data-k-phone]; the shipped dark header, its
 *     hamburger and the shipped tab bar are not drawn; the header is on the
 *     kit's ground with the wordmark, the venue (the sidebar's own name), the
 *     Kiwi AI capsule and the bell, each 44 tall; the kit's tab capsule floats
 *     8 above the bottom with Home, Orders, Report, Customers and More,
 *     labelled, the lens on Home;
 *   · Home in §18.1's order: key figure, goal line, comparison, presets, the
 *     revenue chart (its gridline labels carry their digits, its first hour
 *     stays inside the plot, in French and in Arabic), four tiles (no margin,
 *     no success rate), the three latest orders and "See all"; the shipped
 *     sections below are not drawn; the key figure is the largest text; no
 *     label is set in capitals;
 *   · no redraw loop: Home's figure is not rebuilt every frame;
 *   · real taps on the capsule: Orders and Customers become the page, their
 *     title in the nav bar (no large title, no Back on a tab), the lens moves;
 *   · the Kiwi AI capsule opens the assistant titled "Kiwi AI", its start
 *     right under the head and its tools row above the composer;
 *   · Home's date line opens the period picker on an opaque sheet; the
 *     Report: Print and the month report on one row, no tile figure broken
 *     or cut off, no label in capitals;
 *   · in Arabic the Report names the currency as Home does;
 *   · an iPad in portrait (820) gets the same phone layout, whole;
 *   · flag off on a phone, and flag on at 1280 wide: none of the above;
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
const S = suite('dash-phone', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo store as a returning visitor sees it: the onboarding was skipped
   (Explore the demo sets kiwiSkipOnboard, as shipped). */
async function open(tr, ctx, { flag = true, width = 390, height = 844, lang = 'fr' } = {}) {
  const page = tr.watch(await ctx.newPage());
  await pinTradingHour(page);   // « aujourd'hui » de la démo, à 15 h (tools/demo-clock.mjs)
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  const phone = width < 900;
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone });
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
  // coverage: surface=dashboard locale=fr viewport=tablet
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  /* The demo's greeting lock gives way to Escape, as the shipped intro offers. */
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  if (flag && phone) await page.waitForFunction(() => { const c = document.querySelector('#kit-home k-chart'); return document.documentElement.hasAttribute('data-k-phone') && c && !c.hidden; }, { timeout: 30000 });
  await sleep(800);
  return page;
}

/* A real tap at the centre of an element inside a shadow root. */
async function tapIn(page, host, sel) {
  const h = await page.evaluateHandle((a, b) => { const x = document.querySelector(a); return x && x.shadowRoot && x.shadowRoot.querySelector(b); }, host, sel);
  const el = h.asElement();
  assert.ok(el, `${host} ${sel} exists`);
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function tap(page, sel) {
  const el = await page.$(sel);
  assert.ok(el, sel + ' exists');
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

const chrome = (page) => page.evaluate(() => {
  const tok = (n) => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;background-color:var(' + n + ')'; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
  const tb = document.querySelector('#kw-main > .topbar');
  const tabs = document.querySelector('k-tabbar.k-ptabs');
  const items = tabs && tabs.shadowRoot ? [...tabs.shadowRoot.querySelectorAll('.it')].map((a) => ({ id: a.getAttribute('data-id'), label: a.textContent.trim(), cur: a.getAttribute('aria-current') })) : [];
  return {
    phone: document.documentElement.hasAttribute('data-k-phone'),
    shippedTabs: shown(document.querySelector('.kw-tabbar')),
    burger: shown(document.querySelector('.kw-hamburger')),
    tbBg: tb && getComputedStyle(tb).backgroundColor, tbImg: tb && getComputedStyle(tb).backgroundImage, bg: tok('--k-bg'),
    mode: document.querySelector('.k-pnav') && document.querySelector('.k-pnav').getAttribute('data-mode'),
    venue: (document.querySelector('.k-pnav__vn') || {}).textContent || '',
    shippedVenue: ((document.querySelector('.sidebar [data-loc-name]') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    ai: r(document.querySelector('.k-pnav__ai')), bell: r(document.querySelector('.k-pnav [data-k="bell"]')),
    back: !!document.querySelector('.k-pnav [data-k="back"]'),
    title: ((document.querySelector('.k-pnav__title') || {}).textContent || '').trim(),
    tabs: shown(tabs) ? { rect: r(tabs), pos: getComputedStyle(tabs).position, value: tabs.getAttribute('value'), items } : null,
    pageHead: shown(document.querySelector('.dash-genpage .genpage-head')),
    vh: window.innerHeight, vw: window.innerWidth,
  };
});

const home = (page) => page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { y: b.top, b: b.bottom, h: b.height, x: b.left, r: b.right }; };
  const k = document.querySelector('#kit-home');
  const ch = k.querySelector('k-chart');
  const svg = ch && ch.shadowRoot && ch.shadowRoot.querySelector('svg');
  const gl = svg ? [...svg.querySelectorAll('.gl')].map((t) => t.textContent) : [];
  const host = ch && ch.getBoundingClientRect();
  const xl = svg ? [...svg.querySelectorAll('.xl')].map((t) => { const b = t.getBoundingClientRect(); return { t: t.textContent, l: b.left, r: b.right }; }) : [];
  const grid = k.querySelector('k-kpi-grid');
  const tiles = grid && grid.shadowRoot ? [...grid.shadowRoot.querySelectorAll('[data-tile]')].map((x) => x.getAttribute('data-tile')) : [];
  const list = k.querySelector('k-list');
  const sizes = [...k.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize));
  const kf = k.querySelector('[data-key-figure] bdi');
  const labels = [...k.querySelectorAll('.k-dh__cmp li, .k-dh__goal, .k-dh__date')].map((e) => e.textContent.replace(/[\d\s%·.,:−+-]/g, ''));
  const std = document.querySelector('#kw-main .dash-standard');
  const others = std ? [...std.children].filter((c) => c !== k && getComputedStyle(c).display !== 'none' && c.getClientRects().length).map((c) => c.className) : [];
  return {
    order: { kf: r(k.querySelector('[data-key-figure]')), goal: r(k.querySelector('.k-dh__goal')), cmp: r(k.querySelector('.k-dh__cmp')), seg: r(k.querySelector('k-segmented')), chart: r(ch), grid: r(grid), list: r(list) },
    chart: { shown: !!ch && !ch.hidden && getComputedStyle(ch).display !== 'none', points: ch && ch.series ? ch.series.today.length : 0, gl, xl, host: host ? { l: host.left, r: host.right } : null },
    tiles, rows: list && list.rows ? list.rows.map((x) => x.id) : [],
    kf: kf ? parseFloat(getComputedStyle(kf).fontSize) : 0, maxOther: Math.max.apply(null, sizes.filter((s) => s !== (kf ? parseFloat(getComputedStyle(kf).fontSize) : 0)).concat([0])),
    capitals: labels.filter((s) => /[A-ZÀ-Þ]{3,}/.test(s) && s === s.toUpperCase()),
    others,
  };
});

console.log('dash-phone-browser-test');
try {
  await S.run('flag on · phone · Home', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    tr.step('open the demo store at 390 × 844');
    // coverage: surface=dashboard locale=fr viewport=phone
    const page = await open(tr, ctx);
    const c = await chrome(page);
    check(c.phone && !c.shippedTabs && !c.burger, 'the shipped phone header and tab bar give way to the kit (html[data-k-phone])');
    check(c.tbBg === c.bg && c.tbImg === 'none', `the header is on the kit's ground, not the dark bar (${c.tbBg})`);
    check(c.mode === 'home' && c.venue && c.venue === c.shippedVenue, `Home's nav bar names the venue the sidebar names (${c.venue})`);
    check(c.ai && c.ai.h >= 44 && c.bell && c.bell.h >= 44 && c.bell.w >= 44 && c.ai.r <= c.bell.x, 'the Kiwi AI capsule and the bell are 44 tall, the capsule before the bell');
    check(c.tabs && c.tabs.pos === 'fixed' && Math.round(c.vh - c.tabs.rect.b) >= 8 && c.tabs.rect.h >= 62, `the tab capsule floats ${Math.round(c.vh - (c.tabs && c.tabs.rect.b))} above the bottom, ${c.tabs && Math.round(c.tabs.rect.h)} tall`);
    check(c.tabs.items.map((i) => i.id).join(',') === 'home,orders,report,customers,more' && c.tabs.items.every((i) => i.label), `five labelled destinations (${c.tabs.items.map((i) => i.label).join(' · ')})`);
    check(c.tabs.value === 'home' && c.tabs.items[0].cur === 'page', 'the lens is on Home');

    const h = await home(page);
    const o = h.order;
    check(o.kf.y < o.goal.y && o.goal.y < o.cmp.y && o.cmp.y < o.seg.y && o.seg.y < o.chart.y && o.chart.y < o.grid.y && o.grid.y < o.list.y,
      '§18.1 order: key figure, goal line, comparison, presets, chart, tiles, latest orders');
    check(h.chart.shown && h.chart.points > 2, `the revenue chart draws the shipped series (${h.chart.points} points)`);
    check(h.chart.gl.length >= 2 && h.chart.gl.every((s) => /\d/.test(s)), `its gridline labels carry their digits (${h.chart.gl.join(', ')})`);
    check(h.chart.xl.every((x) => x.l >= h.chart.host.l - 1 && x.r <= h.chart.host.r + 1), 'its hour labels stay inside the plot');
    check(h.tiles.length === 4 && !h.tiles.includes('marge') && !h.tiles.includes('success'), `four tiles, no margin and no success rate (${h.tiles.join(', ')})`);
    check(h.rows.length === 4 && h.rows[3] === '__all', 'the three latest orders, then "See all"');
    check(h.others.length === 0, 'the shipped sections below Home are not drawn' + (h.others.length ? ' · ' + h.others.join(' | ') : ''));
    check(h.kf > h.maxOther, `the key figure is the largest text (${h.kf} over ${h.maxOther})`);
    check(h.capitals.length === 0, 'no label is set in capitals' + (h.capitals.length ? ' · ' + h.capitals.join(' | ') : ''));

    tr.step('count how often Home rebuilds its figure');
    const rebuilt = await page.evaluate(() => new Promise((res) => {
      let n = 0; const fig = document.querySelector('#kit-home .k-dh__fig');
      const mo = new MutationObserver(() => { n++; }); mo.observe(fig, { childList: true });
      setTimeout(() => { mo.disconnect(); res(n); }, 2000);
    }));
    check(rebuilt <= 10, `no redraw loop: the figure was rebuilt ${rebuilt} times in 2 s`);

    tr.step('tap Orders in the capsule');
    await tapIn(page, 'k-tabbar.k-ptabs', '.it[data-id="orders"]');
    await page.waitForFunction(() => !!document.querySelector('.dash-genpage #kit-orders'), { timeout: 20000 });
    await sleep(500);
    let p = await chrome(page);
    check(p.mode === 'page' && p.title && !p.back && !p.pageHead, `Orders: its title in the nav bar (${p.title}), no large title, no Back on a tab`);
    check(p.tabs.value === 'orders', 'the lens moves to Orders');

    tr.step('tap Customers in the capsule');
    await tapIn(page, 'k-tabbar.k-ptabs', '.it[data-id="customers"]');
    await page.waitForFunction(() => !!document.querySelector('.dash-genpage .cd, .dash-genpage #kit-customers'), { timeout: 20000 });
    await sleep(500);
    p = await chrome(page);
    check(p.tabs.value === 'customers' && p.title && !p.pageHead, `Customers: the lens moves, its title in the nav bar (${p.title})`);

    tr.step('back to Home, then the Kiwi AI capsule');
    await tapIn(page, 'k-tabbar.k-ptabs', '.it[data-id="home"]');
    await page.waitForFunction(() => document.querySelector('.k-pnav') && document.querySelector('.k-pnav').getAttribute('data-mode') === 'home', { timeout: 20000 });
    await tap(page, '.k-pnav__ai');
    await page.waitForFunction(() => !!document.querySelector('.fa-drawer #kit-ai'), { timeout: 20000 });
    await sleep(500);
    const ai = await page.evaluate(() => {
      const d = document.querySelector('.fa-drawer');
      const head = d.querySelector('.kiwi-drawer-head').getBoundingClientRect();
      const intro = d.querySelector('#kit-ai .k-ai__intro').getBoundingClientRect();
      const tools = d.querySelector('.fa-toolbar').getBoundingClientRect();
      const input = d.querySelector('.fa-inputwrap').getBoundingClientRect();
      return { title: d.querySelector('.kiwi-drawer-head h3').textContent.trim(), gap: intro.top - head.bottom, tools: tools.bottom, input: input.top };
    });
    const want = await page.evaluate(() => String(window.KiwiStrings.t('ai.title')).replace(/[⁦-⁩]/g, ''));
    check(ai.title === want, `the assistant is titled ${want}`);
    check(ai.gap >= 0 && ai.gap <= 40, `its start sits right under the head (${Math.round(ai.gap)})`);
    check(ai.tools <= ai.input, 'its tools row is above the composer');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · phone · the period picker and the Report', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=phone
    const page = await open(tr, ctx);
    tr.step("tap Home's date line");
    await tap(page, '#kit-home .k-dh__pick');
    await page.waitForFunction(() => !!document.querySelector('.dr-popover.open'), { timeout: 10000 });
    await sleep(400);
    const pk = await page.evaluate(() => {
      const d = document.querySelector('.dr-popover.open');
      const a = (getComputedStyle(d).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      return { alpha: a.length === 4 ? a[3] : 1, eyebrow: getComputedStyle(d.querySelector('.drp-eyebrow')).textTransform };
    });
    check(pk.alpha === 1 && pk.eyebrow === 'none', `the date line opens the period picker, on an opaque sheet in sentence case (alpha ${pk.alpha})`);
    await page.keyboard.press('Escape');
    await sleep(400);

    tr.step('tap Report in the capsule');
    await tapIn(page, 'k-tabbar.k-ptabs', '.it[data-id="report"]');
    await page.waitForFunction(() => !!document.querySelector('.dash-genpage .kdr-nav .kdr-btn'), { timeout: 20000 });
    await sleep(800);
    const r = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.dash-genpage .kdr-nav .kdr-btn')].filter((b) => b.getClientRects().length).map((b) => { const q = b.getBoundingClientRect(); return Math.round((q.top + q.bottom) / 2); });
      const grid = document.querySelector('.dash-genpage k-kpi-grid');
      const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3;
      const broken = grid && grid.shadowRoot ? [...grid.shadowRoot.querySelectorAll('.dl > span:not(.nt)')].filter((e) => e.getBoundingClientRect().height > lh(e) * 1.5).map((e) => e.textContent) : ['no grid'];
      const clipped = grid && grid.shadowRoot ? [...grid.shadowRoot.querySelectorAll('.vl')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) : [];
      const caps = [...document.querySelectorAll('#kw-main .dash-genpage *')].filter((e) => e.children.length === 0 && e.getClientRects().length)
        .map((e) => ({ t: e.textContent.replace(/\b(MAD|TVA|TTC|Z)\b/g, '').trim(), up: getComputedStyle(e).textTransform === 'uppercase' }))
        .filter((x) => /[A-Za-zÀ-ÿ]{3}/.test(x.t) && (x.up || /[A-ZÀ-Þ]{3,}/.test(x.t) && x.t === x.t.toUpperCase())).map((x) => x.t);
      return { btns, broken, clipped, caps };
    });
    check(r.btns.length === 2 && Math.abs(r.btns[0] - r.btns[1]) <= 2, `Print and the month report share one row (centres ${r.btns.join(', ')})`);
    const tall = await page.evaluate(() => [...document.querySelectorAll('.dash-genpage .kdr-nav .kdr-btn')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height > 48).map((b) => b.textContent.trim()));
    check(tall.length === 0, 'each button keeps its label on one line' + (tall.length ? ' · ' + tall.join(' | ') : ''));
    check(r.broken.length === 0, "no tile's signed figure breaks over two lines" + (r.broken.length ? ' · ' + r.broken.join(' | ') : ''));
    check(r.clipped.length === 0, "no tile's figure is cut off" + (r.clipped.length ? ' · ' + r.clipped.join(' | ') : ''));
    check(r.caps.length === 0, 'no Report label is set in capitals' + (r.caps.length ? ' · ' + r.caps.join(' | ') : ''));
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · phone · Arabic Home', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=ar viewport=phone
    const page = await open(tr, ctx, { lang: 'ar' });
    const h = await home(page);
    check(h.chart.shown && h.chart.xl.every((x) => x.l >= h.chart.host.l - 1 && x.r <= h.chart.host.r + 1), `in Arabic the chart's hours stay inside the plot (${h.chart.xl.map((x) => x.t).join(' ')})`);
    check(h.chart.gl.every((s) => /\d/.test(s)), 'and its gridline labels keep their digits');
    const c = await chrome(page);
    check(c.ai && c.bell && c.bell.r <= c.ai.x, 'the nav bar is mirrored: the bell at the left, the capsule after it');
    tr.step('tap Report in the capsule');
    await tapIn(page, 'k-tabbar.k-ptabs', '.it[data-id="report"]');
    await page.waitForFunction(() => { const g = document.querySelector('#kit-report k-kpi-grid'); return g && g.shadowRoot && g.shadowRoot.querySelector('.tile .un'); }, { timeout: 20000 });
    const u = await page.evaluate(() => {
      const kf = document.querySelector('#kit-report [data-key-figure] .k-heading');
      const g = document.querySelector('#kit-report k-kpi-grid').shadowRoot;
      return [(kf || {}).textContent || ''].concat([...g.querySelectorAll('.un')].map((e) => e.textContent.trim()));
    });
    check(u.length > 1 && u.every((x) => x.trim() === 'درهم'), `the Arabic Report names the currency as Home does (${u.join(', ')})`);
    await page.waitForFunction(() => !!document.querySelector('.dash-genpage .kdr-strip'), { timeout: 15000 });
    const mad = await page.evaluate(() => (document.querySelector('#kw-main .dash-genpage').innerText.match(/MAD/g) || []).length);
    check(mad === 0, `and so does the rest of the Arabic Report, its 14 days and its rows (${mad} "MAD" left)`);
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  /* An iPad in portrait: the shipped page is in its phone form below 900,
     so the kit's phone layout takes it whole, never half-and-half. */
  await S.run('flag on · tablet 820 portrait', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=tablet
    const page = await open(tr, ctx, { width: 820, height: 1180 });
    const c = await chrome(page);
    check(c.phone && !c.shippedTabs && !c.burger && c.tabs, 'the kit phone chrome, without the shipped header and tab bar');
    const h = await home(page);
    check(h.chart.shown && h.chart.points > 0, `Home draws its chart (${h.chart.points} points)`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= c.vw, `nothing scrolls sideways (${sw} ≤ ${c.vw})`);
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  await S.run('2027 floating tabs reserve their measured footprint', async (tr) => {
    for (const lang of ['fr', 'ar']) {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = await open(tr, ctx, { width: 844, height: 390, lang });
      for (const [width, height] of [[844, 390], [820, 1180]]) {
        await page.setViewport({ width, height, isMobile: true, hasTouch: true });
        await sleep(400);
        const room = await page.evaluate(() => {
          const bar = document.querySelector('k-tabbar.k-ptabs').getBoundingClientRect();
          const c = document.querySelector('#kw-main .container');
          const pad = parseFloat(getComputedStyle(c).paddingBottom);
          return { height: bar.height, pad, footprint: innerHeight - bar.top,
            scroll: document.scrollingElement.scrollHeight - innerHeight };
        });
        check(room.pad >= room.footprint + 15, lang + ': content reserves the entire floating bar and safe area');
        check(room.scroll > 0, lang + ': even a short page can scroll content above the bar');
        if (height === 390) check(room.height <= 52, lang + ': short dashboard uses the compact capsule');
      }
    }
  });

  await S.run('flag off · phone', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=phone
    const page = await open(tr, ctx, { flag: false });
    const c = await chrome(page);
    check(!c.phone && c.shippedTabs && c.burger && !c.tabs, 'flag off: the shipped phone header and tab bar, no kit chrome');
    check(page.errors.length === 0, 'flag off: no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · 1280 wide', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=fr viewport=desktop
    const page = await open(tr, ctx, { width: 1280, height: 900 });
    const c = await chrome(page);
    const d = await page.evaluate(() => {
      const k = document.querySelector('#kit-home');
      const ch = k.querySelector('k-chart');
      return { first: k.firstElementChild.tagName.toLowerCase(), chart: !!ch && getComputedStyle(ch).display !== 'none' };
    });
    check(!c.phone && !c.tabs, 'wider than a phone: no phone chrome');
    check(d.first === 'k-segmented' && !d.chart, 'and Home keeps stage 5 (1)\'s order, without the phone chart');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-phone-browser-test · ${checks} checks`);
await S.finish();
