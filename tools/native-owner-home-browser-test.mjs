#!/usr/bin/env node
/* tools/native-owner-home-browser-test.mjs — the iPhone owner home and till,
 * rendered for real.
 *
 * Wired in tools/check.js. Builds the app bundle (tools/build-app-www.mjs),
 * serves it statically, stubs the Capacitor bridge the way the WKWebView sees
 * it (iOS, 62pt top inset, 34pt home indicator) and drives the demo entry
 * points only — never a code or a PIN. Assertions read the live DOM:
 *
 *  · owner home: the header owns the status-bar strip on every page, revenue
 *    leads, the period and four quick actions follow, the native tab bar gets
 *    five routes and tracks the page, inner pages carry their title;
 *  · owner pages: order and client tables become rows with no sideways scroll;
 *  · revenue chart: drawn at the phone's width, hour ticks never overlap,
 *    English weekday ticks are English;
 *  · first-run and lock gates: full-screen, no floating card;
 *  · till: tiles never clip their price, the bill is a floating pill with a
 *    count badge above the tab bar.
 *
 * Without Chromium or puppeteer-core the suite SKIPS green with a ○ line.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from './build-app-www.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

console.log('native-owner-home-browser-test');

function findChromium() {
  const env = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || '';
  if (env && fs.existsSync(env)) return env;
  const cands = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  return cands.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } }) || '';
}
async function loadPuppeteer() {
  try {
    const req = createRequire(path.join(ROOT, 'app', 'package.json'));
    const mod = await import(req.resolve('puppeteer-core'));
    return mod.default || mod;
  } catch (_) { return null; }
}

const bin = findChromium();
const puppeteer = bin ? await loadPuppeteer() : null;
if (!bin || !puppeteer) {
  const reason = !bin ? 'no Chromium binary (set KIWI_CHROMIUM_BIN)' : 'puppeteer-core not installed (npm --prefix app install)';
  if (process.env.CI) { console.error(`  ✗ ${reason} — CI must execute the browser assertions`); process.exit(1); }
  console.log(`  ○ skip: ${reason} — browser assertions not executed`);
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-owner-home-'));
let outDir = '';
try {
  const res = build({ out: path.join(work, 'www'), quiet: true });
  if (!res || (res.errors && res.errors.length)) throw new Error((res && res.errors.join(' ; ')) || 'build failed');
  outDir = res.out;
} catch (e) {
  bad(`bundle build failed: ${e.message}`);
  process.exit(1);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const file = path.join(outDir, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(outDir)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nativeStub(lang, role) {
  localStorage.setItem('kiwiNativeLocale', lang);
  localStorage.setItem('kiwiAppRole', role);
  const noop = () => Promise.resolve({});
  const plug = new Proxy({}, { get: (t, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: () => plug }) };
  window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { window.__host = v; } } } };
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.documentElement.style;
    s.setProperty('--kiwi-host-safe-top', '62px');
    s.setProperty('--kiwi-host-safe-bottom', '34px');
    s.setProperty('--kiwi-host-tab-height', '106px');
  });
}

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
async function phone(lang, role) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(nativeStub, lang, role);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, ctx, errors };
}
const click = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
const host = (page) => page.evaluate(() => window.__host || {});
const go = async (page, id) => { await page.evaluate((i) => window.KiwiNativeHostAction({ action: 'navigate', id: i }), id); await sleep(1400); };

try {
  /* ── owner home, French ─────────────────────────────────────────────── */
  {
    const { page, ctx, errors } = await phone('fr', 'dashboard');
    await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'networkidle2' });
    await sleep(2200);
    const gate = await page.evaluate(() => {
      const card = document.querySelector('.kob-card');
      if (!card) return null;
      const cs = getComputedStyle(card);
      return { bg: cs.backgroundColor, img: cs.backgroundImage, width: card.getBoundingClientRect().width };
    });
    check(gate && gate.bg === 'rgba(0, 0, 0, 0)' && gate.img === 'none' && gate.width >= 402 - 44 - 1,
      'first-run questions are a full-screen stage, not a floating card');
    check((await host(page)).tabs?.length === 0, 'the tab bar stays hidden during first-run questions');
    await click(page, '.kob-root [data-explore]');
    await sleep(1400);
    await click(page, '[data-kiwi-skip]');
    await sleep(2600);

    const home = await page.evaluate(() => {
      const top = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : NaN; };
      const bar = document.querySelector('.topbar');
      const actions = [...document.querySelectorAll('.kiwi-native-owner-actions [data-owner-action]')];
      return {
        owner: document.body.classList.contains('kiwi-native-owner'),
        barTop: bar.getBoundingClientRect().top, barPad: parseFloat(getComputedStyle(bar).paddingTop),
        hero: top('.hero-today'), period: top('.vexel-compose > .dash-date-range'), acts: top('.kiwi-native-owner-actions'), kpi: top('.vexel-kpi-section'),
        actions: actions.map((b) => b.getAttribute('data-owner-action')),
        actionIcon: actions.map((b) => b.querySelector('.kno-ico').getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    check(home.owner, 'the dashboard runs as the native owner home');
    check(home.barTop === 0 && home.barPad >= 62, 'the header owns the status-bar strip on the home');
    check(home.hero < home.period && home.period < home.acts && home.acts < home.kpi, 'revenue leads, then the period, the quick actions and the figures');
    check(home.actions.join(',') === 'report,invoice,export,customize' && home.actionIcon.every((h) => h >= 44), 'four round quick actions, each at least 44pt');
    check(home.overflow <= 0, 'the owner home never scrolls sideways');
    const context = await host(page);
    check((context.tabs || []).map((t) => t.id).join(',') === 'accueil,transactions,rapport,clients,more' && context.selected === 'accueil',
      'the native tab bar carries five owner routes with Home selected');

    const fired = await page.evaluate(() => new Promise((resolve) => {
      const target = document.querySelector('.vexel-report-btn');
      const hit = () => resolve(true);
      target.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); hit(); }, { capture: true, once: true });
      document.querySelector('[data-owner-action="report"]').click();
      setTimeout(() => resolve(false), 400);
    }));
    check(fired, 'a quick action forwards to the dashboard’s own control');

    const chart = await page.evaluate(() => {
      const svg = document.querySelector('.hero-today svg.chart-wrap');
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      const ticks = [...svg.querySelectorAll('text')].filter((t) => !t.closest('.rev-tip') && t.textContent.trim()).map((t) => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      let touching = 0;
      for (let i = 1; i < ticks.length; i++) if (ticks[i].left < ticks[i - 1].right + 2 && Math.abs(ticks[i].top - ticks[i - 1].top) < 4) touching++;
      return { vbW: vb[2], w: Math.round(svg.getBoundingClientRect().width), touching, count: ticks.length };
    });
    check(Math.abs(chart.vbW - chart.w) <= 2, `the revenue chart draws at the phone’s width (viewBox ${chart.vbW} for ${chart.w}px)`);
    check(chart.count > 0 && chart.touching === 0, 'chart hour ticks never touch each other');

    await go(page, 'transactions');
    const orders = await page.evaluate(() => {
      const bar = document.querySelector('.topbar');
      const title = document.querySelector('.kno-title');
      const row = document.querySelector('table.p-table tbody tr');
      return { barTop: bar.getBoundingClientRect().top, title: title && getComputedStyle(title).display !== 'none' ? title.textContent : '',
        rowDisplay: row && getComputedStyle(row).display, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    const ordersHost = await host(page);
    check(orders.barTop === 0, 'the header still owns the status bar on an inner page');
    check(orders.title === 'Commandes' && ordersHost.selected === 'transactions', 'Orders shows its title and selects its tab');
    check(orders.rowDisplay === 'grid' && orders.overflow <= 0, 'orders are list rows with no sideways scroll');

    await go(page, 'clients');
    const clients = await page.evaluate(() => {
      const row = document.querySelector('table.cd-tbl tbody tr');
      return { rowDisplay: row && getComputedStyle(row).display, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    check((await host(page)).selected === 'clients', 'the Clients tab tracks the clients page');
    check(clients.rowDisplay === 'grid' && clients.overflow <= 0, 'clients are list rows with no sideways scroll');

    await go(page, 'accueil');
    check((await host(page)).selected === 'accueil', 'Home returns to the home route');
    check(errors.length === 0, `no page errors on the owner home${errors.length ? ` (${errors[0]})` : ''}`);
    await ctx.close();
  }

  /* ── English weekday ticks ──────────────────────────────────────────── */
  {
    const { page, ctx } = await phone('en', 'dashboard');
    await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'networkidle2' });
    await sleep(2200);
    await click(page, '.kob-root [data-explore]');
    await sleep(1400);
    await click(page, '[data-kiwi-skip]');
    await sleep(2400);
    await click(page, '.dr-pill[data-range="septJours"]');
    await sleep(1400);
    const ticks = await page.evaluate(() => [...document.querySelectorAll('.hero-today svg.chart-wrap text')].map((t) => t.textContent.trim()).filter(Boolean));
    check(ticks.length > 0 && !ticks.some((t) => /^(Dim|Lun|Mar|Mer|Jeu|Ven|Sam)\b/.test(t)), `English 7-day ticks are English (${ticks.slice(0, 3).join(', ')})`);
    await ctx.close();
  }

  /* ── till: tiles and the bill pill ──────────────────────────────────── */
  {
    const { page, ctx, errors } = await phone('fr', 'caisse');
    await page.goto(`${BASE}/kiwi-caisse.html`, { waitUntil: 'networkidle2' });
    await sleep(1800);
    await click(page, '#clockin-btn, .clockin-btn');
    await sleep(2200);
    await click(page, '.mode-pill[data-mode="vrap"]');
    await sleep(800);
    const scrollWell = await page.evaluate(() => {
      const grid = document.querySelector('.menu-grid');
      const main = document.querySelector('.main');
      return { bottom:grid.getBoundingClientRect().bottom, mainPadding:parseFloat(getComputedStyle(main).paddingBottom), clearance:parseFloat(getComputedStyle(grid).paddingBottom) };
    });
    check(scrollWell.mainPadding === 0 && scrollWell.bottom > 874 - 106 && scrollWell.bottom <= 874 && scrollWell.clearance >= 106,
      'products scroll behind the native capsule, with last-row clearance inside the scroller: ' + JSON.stringify(scrollWell));
    if (process.env.KIWI_NATIVE_EVIDENCE) await page.screenshot({path:path.join(process.env.KIWI_NATIVE_EVIDENCE,'till-grid.png')});
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.menu-item')].filter((e) => e.offsetParent)
      .filter((e) => e.scrollHeight > e.getBoundingClientRect().height + 1).map((e) => e.querySelector('.menu-item-name')?.textContent.trim()));
    check(clipped.length === 0, `no product tile clips its price${clipped.length ? ` (${clipped.slice(0, 3).join(', ')})` : ''}`);
    await page.evaluate(() => { const items = [...document.querySelectorAll('.menu-item')]; items[0].click(); });
    await sleep(500);
    await page.evaluate(() => { const items = [...document.querySelectorAll('.menu-item')]; items[1].click(); });
    await sleep(900);
    const pill = await page.evaluate(() => {
      const peek = document.querySelector('.rp-peek');
      const r = peek.getBoundingClientRect();
      const label = peek.firstElementChild;
      return { radius: parseFloat(getComputedStyle(peek).borderTopLeftRadius), count: label.getAttribute('data-count'), text: label.textContent.trim(),
        left: r.left, right: r.right, bottom: r.bottom, total: (document.getElementById('rp-peek-total') || {}).textContent };
    });
    check(pill.radius >= 28 && pill.count === '2' && pill.text === 'Voir la note', 'the bill is a pill: count badge, “Voir la note”');
    check(pill.left >= 8 && pill.right <= 402 - 8 && pill.bottom <= 874 - 106 + 1, 'the bill pill floats inside the screen, above the tab bar');
    check(/MAD/.test(pill.total || ''), 'the bill pill shows the live total');
    /* The X on the open bill sheet folds it. It used to call clearCart() in
       takeaway, so a tap meant to glance back at the menu discarded the order. */
    await click(page, '.rp-peek');
    await sleep(700);
    const sheet = await page.evaluate(() => {
      const scrim = document.querySelector('.kiwi-native-sheet-scrim');
      const charge = document.getElementById('pay-charge');
      return { scrim: !!scrim && getComputedStyle(scrim).opacity === '1', amount: /MAD/.test(charge ? charge.textContent : '') && getComputedStyle(charge.querySelector('.pay-charge-total')).display !== 'none' };
    });
    check(sheet.scrim && sheet.amount, 'the open bill dims the menu and its one filled button names the amount');
    await page.evaluate(() => document.getElementById('rp-close').click());
    await sleep(700);
    const folded = await page.evaluate(() => ({ open: document.body.classList.contains('ticket-open'),
      count: (document.querySelector('.rp-peek')?.firstElementChild || {}).getAttribute?.('data-count') }));
    check(!folded.open && folded.count === '2', 'the bill’s X folds the sheet and keeps the takeaway order');
    await click(page, '.rp-peek');
    await sleep(700);
    await click(page, '.kiwi-native-cart-more');
    await sleep(400);
    const clearShown = await page.evaluate(() => { const b = document.querySelector('.rp-meta [data-action="cancel-table"]'); return !!(b && b.offsetParent); });
    /* That button is guarded by a server-checked staff code; the old X skipped the guard. */
    check(clearShown, 'emptying the order stays the guarded “Vider la commande” under More actions');
    check(errors.length === 0, `no page errors on the till${errors.length ? ` (${errors[0]})` : ''}`);
    await ctx.close();
  }
} catch (e) {
  bad(`suite crashed: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\nnative-owner-home-browser-test : ${failures} échec(s)` : '\nnative-owner-home-browser-test : vert');
process.exit(failures ? 1 : 0);
