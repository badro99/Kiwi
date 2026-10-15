#!/usr/bin/env node
/* dash-desktop-browser-test · the dashboard on a desktop window (900 and
 * wider) on the kit (§10.20, §12, §13.5), behind kiwiSkin2027:dashboard, in a
 * real Chromium, on the demo store.
 *
 *   node tools/dash-desktop-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-desktop.css and dash-desktop.js are never fetched and the
 *     shipped sidebar keeps its own (dark) ground;
 *   · flag on, 1440: the kit's sidebar at 248 on surface-2 lists the shipped
 *     links, in their order and with their labels, the shipped active one
 *     current; the shipped nav is not drawn; the top bar sits on the kit's
 *     ground;
 *   · Home's grid: one card holds the key figure and its chart, the tiles
 *     stand beside it in two columns and fill its height, the latest orders
 *     sit beside the goal, the regulars and the payment mix; the goal card
 *     shows the shipped goal; no two cards overlap; nothing scrolls sideways;
 *   · a real click on the sidebar's Orders opens the shipped Orders page and
 *     moves the current item;
 *   · 1024: the tiles go under the chart, three across; 1920: the content
 *     keeps the grid's maximum width, centred;
 *   · dark (both systems: html[data-theme] and body[data-vexel-mode]) paints
 *     the sidebar and the ground dark, measured, not read from a flag;
 *   · Arabic: the sidebar sits at the right edge;
 *   · 1280: Home's labels, Orders and the Report in sentence case; Orders
 *     says its total once; the Report's buttons and strip are the kit's;
 *   · 900: the desktop starts where the shipped sidebar becomes a column;
 *     the app card's label in sentence case; the Report's three tiles in
 *     three columns, none cut off;
 *   · 800: none of the desktop's nodes is drawn, the phone layout is;
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
const S = suite('dash-desktop', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo store, past the onboarding (Explore the demo), the service
   worker kept out, /api/ answering 503 as offline. */
async function open(tr, ctx, { flag = true, width = 1440, height = 900, theme = '', lang = '' } = {}) {
  const page = tr.watch(await ctx.newPage());
  const fetched = [];
  await page.setViewport({ width, height });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on, theme, lang) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    localStorage.setItem('kiwiSkipOnboard', '1');
    if (theme) { localStorage.setItem('kiwiTheme', theme); localStorage.setItem('kiwiDashTheme', theme); }
    if (lang) localStorage.setItem('kiwiLang', lang);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag, theme, lang);
  tr.step('open the dashboard');
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 20000 });
  if (flag) await page.waitForFunction(() => !!document.getElementById('kit-dd-goal') && !!document.getElementById('kit-side'), { timeout: 20000 });
  await sleep(900);
  return { page, fetched };
}

/* Rectangles and colours as the browser computes them. */
const measure = (page) => page.evaluate(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const tok = (n) => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;color:var(' + n + ')'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
  const q = (s) => document.querySelector(s);
  const side = q('#kit-side'), sb = q('aside.sidebar');
  const shipped = [...q('aside.sidebar > nav').querySelectorAll('a')].filter((a) => (a.dataset.nav || a.dataset.action) && getComputedStyle(a).display !== 'none')
    .map((a) => ({ id: a.dataset.nav || 'act:' + a.dataset.action, label: (a.querySelector('[data-i18n]') || a).textContent.replace(/\s+/g, ' ').trim(), active: a.classList.contains('active') }));
  const items = side && side.shadowRoot ? [...side.shadowRoot.querySelectorAll('.it')].map((b) => ({ id: b.getAttribute('data-id'), label: b.textContent.replace(/\s+/g, ' ').trim(), cur: b.getAttribute('aria-current') === 'page' })) : [];
  const grid = q('#kit-home k-kpi-grid');
  const gridIn = grid && grid.shadowRoot && grid.shadowRoot.querySelector('.grid');
  const tiles = gridIn ? [...gridIn.children].map(R) : [];
  const D = window.KiwiDateRange && window.KiwiDateRange.home ? window.KiwiDateRange.home() : null;
  const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  return {
    w: innerWidth, scrollW: document.documentElement.scrollWidth,
    side: side ? { display: getComputedStyle(side).display, rect: R(side) } : null,
    sb: { rect: R(sb), bg: getComputedStyle(sb).backgroundColor, lum: lum(getComputedStyle(sb).backgroundColor) },
    shippedNav: getComputedStyle(q('aside.sidebar > nav')).display,
    topBg: getComputedStyle(q('.topbar')).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor, bodyLum: lum(getComputedStyle(document.body).backgroundColor),
    main: R(q('#kw-main')),
    shipped, items,
    hero: R(q('.k-dd-ground--hero')), fig: R(q('#kit-home > .k-dh__fig')), chart: R(q('.dash-standard .hero-today')),
    feed: R(q('.k-dd-ground--feed')), list: R(q('#kit-home > k-list')),
    goal: R(q('#kit-dd-goal')), goalText: (q('#kit-dd-goal') || {}).textContent || '',
    regs: R(q('.dash-standard .vexel-clients')), mix: R(q('.dash-standard .vexel-bottom-row > .block')),
    chan: R(q('.dash-standard .vexel-goals-card')), ins: R(q('.dash-standard .vexel-insights-row')),
    grid: R(grid), tiles, std: R(q('.dash-standard')),
    goalModel: D && D.goal ? { pct: D.goal.pct, unset: !!D.goal.unset } : null,
    k: { s2: tok('--k-surface-2'), bg: tok('--k-bg'), max: getComputedStyle(document.documentElement).getPropertyValue('--k-grid-max').trim() },
  };
});
const overlap = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
const inside = (outer, inner) => outer && inner && inner.l >= outer.l - 1 && inner.r <= outer.r + 1 && inner.t >= outer.t - 1 && inner.b <= outer.b + 1;

console.log('dash-desktop-browser-test');
try {
  await S.run('flag off · nothing of the desktop loads', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const { page, fetched } = await open(tr, ctx, { flag: false });
    const v = await page.evaluate(() => ({ side: !!document.getElementById('kit-side'), lum: (() => { const m = getComputedStyle(document.querySelector('aside.sidebar')).backgroundColor.match(/[\d.]+/g) || [255, 255, 255]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; })() }));
    check(!fetched.some((p) => /dash-desktop\.(css|js)/.test(p)) && !v.side, 'flag off: dash-desktop.css and .js are never fetched, no kit sidebar');
    check(v.lum < 0.2, `flag off: the shipped sidebar keeps its own dark ground (luminance ${v.lum.toFixed(2)})`);
  });

  await S.run('flag on · 1440, the frame and Home', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const errors = [];
    const { page } = await open(tr, ctx);
    page.on('pageerror', (e) => errors.push(e.message));
    const v = await measure(page);
    check(v.side && v.side.display === 'block' && v.shippedNav === 'none', 'the kit sidebar is drawn, the shipped nav is not');
    check(Math.round(v.sb.rect.w) === 248 && v.sb.bg === v.k.s2, `the sidebar is 248 on surface-2 (${Math.round(v.sb.rect.w)}, ${v.sb.bg})`);
    check(v.items.length === v.shipped.length && v.items.every((it, i) => it.id === v.shipped[i].id && it.label === v.shipped[i].label),
      `it lists the shipped links in order with their labels (${v.items.length})`);
    const act = v.shipped.find((s) => s.active), cur = v.items.find((i) => i.cur);
    check(act && cur && act.id === cur.id, `the shipped active link is the current item (${cur && cur.id})`);
    check(v.topBg === v.k.bg, `the top bar sits on the kit's ground (${v.topBg})`);
    check(inside(v.hero, v.fig) && inside(v.hero, v.chart), 'one card holds the key figure and its chart');
    check(v.grid.l >= v.hero.r && Math.abs(v.grid.t - v.hero.t) <= 1 && Math.abs(v.grid.b - v.hero.b) <= 1, 'the tiles stand beside it and fill its height');
    const cols = new Set(v.tiles.map((t) => Math.round(t.l))).size;
    check(cols === 2 && v.tiles.length >= 4, `the tiles are two across (${cols} columns, ${v.tiles.length} tiles)`);
    check(inside(v.feed, v.list) && v.goal.l >= v.feed.r && v.regs.l >= v.feed.r && v.mix.l >= v.feed.r && Math.abs(v.goal.t - v.feed.t) <= 1,
      'the latest orders sit beside the goal, the regulars and the payment mix');
    check(v.goalModel && !v.goalModel.unset && v.goalText.replace(/\s/g, '').includes(String(v.goalModel.pct) + '%'), `the goal card shows the shipped goal (${v.goalModel && v.goalModel.pct} %)`);
    const cards = { hero: v.hero, tiles: v.grid, feed: v.feed, goal: v.goal, regs: v.regs, mix: v.mix, chan: v.chan, ins: v.ins };
    const names = Object.keys(cards), hits = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlap(cards[names[i]], cards[names[j]])) hits.push(names[i] + '/' + names[j]);
    check(!hits.length, 'no two cards overlap' + (hits.length ? ' · ' + hits.join(', ') : ''));
    check(v.scrollW <= v.w, `nothing scrolls sideways (${v.scrollW} ≤ ${v.w})`);

    tr.step('a real click on the sidebar Orders');
    const target = await page.evaluateHandle(() => document.getElementById('kit-side').shadowRoot.querySelector('.it[data-id="transactions"]'));
    await target.asElement().click();
    await page.waitForFunction(() => !!document.getElementById('kit-orders'), { timeout: 15000 });
    await sleep(500);
    const after = await page.evaluate(() => {
      const it = document.getElementById('kit-side').shadowRoot.querySelector('[aria-current="page"]');
      const a = document.querySelector('aside.sidebar > nav a.active');
      return { cur: it && it.getAttribute('data-id'), shipped: a && a.dataset.nav };
    });
    check(after.cur === 'transactions' && after.shipped === 'transactions', 'a click on Orders opens the shipped Orders page and moves the current item');
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('flag on · 1280, sentence case, Orders and Report', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const errors = [];
    const { page } = await open(tr, ctx, { width: 1280, height: 900 });
    page.on('pageerror', (e) => errors.push(e.message));
    /* A label in capitals: a visible text with a word of three capitals or
       more, written so or set so, currency codes aside. */
    const caps = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((root) => [...root.querySelectorAll('*')].concat(root))
      .filter((e) => e.children.length === 0 && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => ({ t: e.textContent.replace(/\b(MAD|EUR|USD|AED|ICE|TVA|QR|ID|KPI|CSV|PDF|Z)\b/g, '').trim(), up: getComputedStyle(e).textTransform === 'uppercase' }))
      .filter((x) => /[A-Za-zÀ-ÿ]{3}/.test(x.t) && (x.up || /[A-ZÀ-Þ]{3,}/.test(x.t) && x.t === x.t.toUpperCase())).map((x) => x.t.slice(0, 40)), sel);
    const home = await caps('#kit-home .k-dh__lb, #kit-home .k-dh__cmp, [data-goal-label], .sidebar .loc-switch .badge, #kit-dd-goal');
    check(home.length === 0, 'Home: the cashed label, the goal and the venue status are in sentence case' + (home.length ? ' · ' + home.join(' | ') : ''));

    tr.step('open Orders from the sidebar');
    const go = async (id, sel) => {
      const it = await page.evaluateHandle((id) => document.getElementById('kit-side').shadowRoot.querySelector(`.it[data-id="${id}"]`), id);
      await it.asElement().click();
      await page.waitForFunction((sel) => !!document.querySelector(sel), { timeout: 15000 }, sel);
      await sleep(700);
    };
    await go('transactions', '#kit-orders');
    const o = await page.evaluate(() => {
      const gp = document.querySelector('#kw-main .dash-genpage');
      const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
      return { headLine: shown(gp.querySelector('.genpage-head > p')), upToDate: shown(gp.querySelector('span.tx-update-status')), fig: shown(gp.querySelector('#kit-orders [data-key-figure]')) };
    });
    check(o.fig && !o.headLine && !o.upToDate, 'Orders: the total is said once, by the key figure (no head line, no "up to date" note)');

    tr.step('open the Report from the sidebar');
    await go('rapport', '#kit-report, .dash-genpage .kdr-nav');
    const r = await page.evaluate(() => {
      const s2 = getComputedStyle(document.documentElement).getPropertyValue('--k-surface-2').trim();
      const probe = document.createElement('i'); probe.style.color = s2; document.body.appendChild(probe);
      const s2rgb = getComputedStyle(probe).color; probe.remove();
      const btn = document.querySelector('.dash-genpage .kdr-btn'), strip = document.querySelector('.dash-genpage .kdr-strip');
      return { btn: btn && getComputedStyle(btn).backgroundColor, s2: s2rgb, strip: strip && getComputedStyle(strip).borderTopWidth };
    });
    check(r.btn === r.s2 && r.strip === '0px', `Report: its buttons on surface-2, its strip a kit card with no border (${r.btn}, ${r.strip})`);
    const rep = await caps('#kw-main .dash-genpage');
    check(rep.length === 0, 'Report: no label is set in capitals' + (rep.length ? ' · ' + rep.join(' | ') : ''));
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('flag on · 1024 and 1920', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const { page } = await open(tr, ctx, { width: 1024, height: 768 });
    const v = await measure(page);
    const cols = new Set(v.tiles.map((t) => Math.round(t.l))).size;
    check(v.grid.t >= v.hero.b && cols === 3, `1024: the tiles go under the chart, three across (${cols})`);
    check(v.scrollW <= v.w, `1024: nothing scrolls sideways (${v.scrollW} ≤ ${v.w})`);
    await page.setViewport({ width: 1920, height: 1080 });
    await sleep(700);
    const w = await measure(page);
    const max = parseFloat(w.k.max);
    const mainMid = (w.main.l + w.main.r) / 2, stdMid = (w.std.l + w.std.r) / 2;
    check(Math.round(w.std.w) <= max && Math.abs(mainMid - stdMid) <= 2, `1920: the content keeps the grid's maximum (${Math.round(w.std.w)} ≤ ${max}), centred`);
  });

  await S.run('flag on · dark and Arabic', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const { page } = await open(tr, ctx, { theme: 'dark' });
    const v = await measure(page);
    const sys = await page.evaluate(() => ({ html: document.documentElement.getAttribute('data-theme'), body: document.body.getAttribute('data-vexel-mode') }));
    check(v.sb.lum < 0.2 && v.bodyLum < 0.1 && v.bodyBg === v.k.bg, `dark: the sidebar and the ground paint dark, measured (${v.sb.lum.toFixed(2)}, ${v.bodyLum.toFixed(2)}; html ${sys.html}, body ${sys.body})`);
    const ctx2 = await browser.createBrowserContext(); tr.defer(() => ctx2.close());
    const { page: ar } = await open(tr, ctx2, { lang: 'ar' });
    const a = await measure(ar);
    check(a.sb.rect.l > a.main.l && a.hero.r > a.grid.r, 'Arabic: the sidebar at the right edge, the tiles at the left of the chart');
    check(a.items.length === a.shipped.length && a.items.every((it, i) => it.label === a.shipped[i].label), 'Arabic: the sidebar reads the shipped Arabic labels');
  });

  await S.run('flag on · 800, none of the desktop is drawn', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const { page } = await open(tr, ctx, { width: 800, height: 1000 });
    const v = await page.evaluate(() => ['#kit-side', '#kit-dd-goal', '.k-dd-ground'].map((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'none'; }));
    check(v.every((d) => d === 'none'), 'below 900 the kit sidebar, the goal card and the grounds are not drawn');
    check(await page.evaluate(() => document.documentElement.hasAttribute('data-k-phone')), 'and the phone layout takes the page, as the shipped page is in its phone form there');
  });

  /* 900 is where the shipped sidebar becomes a column: the desktop starts
     there, so a tablet never shows the shipped header beside kit pages. */
  await S.run('flag on · 900, the desktop from the shipped sidebar column', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const errors = [];
    const { page } = await open(tr, ctx, { width: 900, height: 1000 });
    page.on('pageerror', (e) => errors.push(e.message));
    const v = await page.evaluate(() => ({
      side: getComputedStyle(document.getElementById('kit-side')).display, phone: document.documentElement.hasAttribute('data-k-phone'),
      sw: document.documentElement.scrollWidth, w: innerWidth,
      card: ((document.querySelector('[data-upsell] .kiwi-install-head > .t') || {}).textContent || '').trim(),
    }));
    check(v.side !== 'none' && !v.phone, `900: the kit sidebar is drawn and the phone layout is not (${v.side})`);
    check(v.sw <= v.w, `900: nothing scrolls sideways (${v.sw} ≤ ${v.w})`);
    check(!v.card || (v.card !== v.card.toUpperCase() && /Kiwi/.test(v.card)), `the app card's label in sentence case, the brand kept (${v.card})`);
    tr.step('open the Report from the sidebar');
    const it = await page.evaluateHandle(() => document.getElementById('kit-side').shadowRoot.querySelector('.it[data-id="rapport"]'));
    await it.asElement().click();
    await page.waitForFunction(() => { const g = document.querySelector('#kit-report k-kpi-grid'); return g && g.shadowRoot && g.shadowRoot.querySelector('.tile .vl'); }, { timeout: 15000 });
    await sleep(700);
    const r = await page.evaluate(() => {
      const g = document.querySelector('#kit-report k-kpi-grid').shadowRoot;
      const grid = g.querySelector('.grid');
      return { n: grid.children.length, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, clipped: [...g.querySelectorAll('.vl')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) };
    });
    check(r.n !== 3 || r.cols === 3, `Report: three tiles take three columns, not four with a hole (${r.n} tiles, ${r.cols} columns)`);
    check(r.clipped.length === 0, "Report: no tile's figure is cut off" + (r.clipped.length ? ' · ' + r.clipped.join(' | ') : ''));
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-desktop-browser-test · ${checks} checks`);
await S.finish();
