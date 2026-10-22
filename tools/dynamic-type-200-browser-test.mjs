#!/usr/bin/env node
/* Dynamic Type up to 200 % in the native owner app, rendered for real.
 *
 * What the app does. On iPhone the KiwiDynamicType plugin reports the system
 * text size and native-runtime.js hands it to WebKit as `text-size-adjust: N %`
 * on <html> and <body>, which scales every font in the page. (`--type-scale`
 * only moves the native chrome, and on iPhone it is removed so the text is not
 * counted twice.) The owner dashboard now follows Apple's accessibility sizes up
 * to 200 %; native-runtime.css reflows its screens under `.kiwi-large-type`.
 * The till, waiter and kitchen screens keep their 135 % ceiling.
 *
 * Chromium applies `text-size-adjust` percentages in mobile emulation, so this
 * suite runs the same path as the phone: an iPhone user agent, a stubbed
 * KiwiDynamicType that reports the scale, the bundled app (tools/build-app-www)
 * on a 390x844 viewport, the demo entry (no code, no PIN).
 *
 * Per screen at 165 % and 200 % (Home, Orders, Customers, Settings):
 *  · the page never scrolls sideways,
 *  · no text is clipped by its own box (overflow hidden, horizontally or
 *    vertically), and no two pieces of text sit on top of each other,
 *  · the key controls are at least 44 pt tall.
 * At 100 % and 135 % (the previous ceiling) the layout is the one it always was:
 * no large-type class, four quick actions, two KPI columns, three list columns.
 *
 *   node tools/dynamic-type-200-browser-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from './build-app-www.mjs';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';
import { readNativeRuntime } from './native-runtime-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('dynamic-type-200-browser-test');

/* ── source contract ───────────────────────────────────────────────────── */
const runtime = readNativeRuntime(root);
const shellJs = read('app/src/native-shell.js');
const css = read('app/src/native-runtime.css');
const swift = read('app/plugins/kiwi-dynamic-type/ios/Sources/KiwiDynamicType/KiwiDynamicTypePlugin.swift');
check(/case \.accessibilityMedium: return 1\.65/.test(swift) && /case \.accessibilityLarge: return 1\.94/.test(swift)
  && /\.accessibilityExtraExtraExtraLarge:\s*return 2\.0/.test(swift) && /case \.extraExtraExtraLarge: return 1\.35/.test(swift),
  'the iOS plugin reports the real accessibility ratios, capped at 2.0');
check(/var ceiling = iphone && ownerPage \? 2 : 1\.35;/.test(runtime) && /ownerPage = location\.pathname\.split\('\/'\)\.pop\(\) === 'dashboard\.html'/.test(runtime),
  'only the iPhone owner dashboard goes past 135 %; till, waiter, kitchen and iPad keep their ceiling');
check(/Math\.min\(1\.35, Math\.max\(0\.85, scale\)\)/.test(shellJs), 'the setup shell keeps its 135 % ceiling (its layout is fixed-size, not reflowed)');
check(/html\.kiwi-native\.kiwi-large-type body\.kiwi-native-owner:not\(#kno\)/.test(css) && !/\.kiwi-large-type[^{]*\{[^}]*font-style:\s*italic/.test(css),
  'the reflow rules are scoped to .kiwi-large-type on the owner body, and add no italics');
check(!/—/.test(css.slice(css.indexOf('Dynamic Type above 135'))), 'no em dash in the large-type block');

/* ── browser ───────────────────────────────────────────────────────────── */
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-dyntype-'));
const built = build({ out: path.join(work, 'www'), quiet: true });
if (!built || (built.errors && built.errors.length)) { console.log('  ✗ bundle build failed'); process.exit(1); }
const www = built.out;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const file = path.join(www, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(www)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('dynamic-type-200', { browser });

/* The Capacitor bridge as the WKWebView sees it, with KiwiDynamicType answering
   the scale under test (and `hostTextZoom` absent: that is Android). */
function nativeStub(role, scale) {
  localStorage.setItem('kiwiNativeLocale', 'fr');
  localStorage.setItem('kiwiAppRole', role);
  const noop = () => Promise.resolve({});
  const plug = new Proxy({}, { get: (_, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
  const dyn = { getDynamicTypeScale: () => Promise.resolve({ scale, category: 'test' }), addListener: () => ({ remove() {} }) };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: (_, k) => (k === 'KiwiDynamicType' ? dyn : plug) }) };
  window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { window.__host = v; } } } };
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.documentElement.style;
    s.setProperty('--kiwi-host-safe-top', '62px'); s.setProperty('--kiwi-host-safe-bottom', '34px'); s.setProperty('--kiwi-host-tab-height', '106px');
  });
}

async function phone(t, { role = 'dashboard', scale, ua = IPHONE, url = '/dashboard.html', demo = true }) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await pinTradingHour(page);   // « aujourd'hui » de la démo, à 15 h (tools/demo-clock.mjs)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setUserAgent(ua);
  await page.evaluateOnNewDocument(nativeStub, role, scale);
  t.step(`open ${url} at ${scale}`);
  await page.goto(BASE + url, { waitUntil: 'networkidle2' });
  await sleep(2200);
  if (demo) {
    t.step('demo entry');
    await page.evaluate(() => document.querySelector('.kob-root [data-explore]')?.click());
    await sleep(1400);
    await page.evaluate(() => document.querySelector('[data-kiwi-skip]')?.click());
    await sleep(2600);
  }
  return page;
}

/* Everything the assertions read, in one pass over the live page. */
const audit = (page) => page.evaluate(() => {
  const vw = innerWidth;
  const root = document.documentElement;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:16px';
  probe.textContent = 'x';
  document.body.appendChild(probe);
  const probePx = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  const name = (e) => e.tagName + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ').slice(0, 2).join('.') + ' "' + (e.textContent || '').trim().slice(0, 22) + '"';
  const fixed = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const live = (e) => {
    for (let n = e; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; }
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw)) return false;
    /* A collapsed section or a scroller that hides it is not on screen. */
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
      const p = n.getBoundingClientRect();
      if (r.bottom <= p.top + 0.5 || r.top >= p.bottom - 0.5 || r.right <= p.left + 0.5 || r.left >= p.right - 0.5) return false;
    }
    return true;
  };
  const out = { cls: [...root.classList].filter((c) => /large-type/.test(c)), tsa: getComputedStyle(root).webkitTextSizeAdjust, probePx, scrollW: document.scrollingElement.scrollWidth, vw, wide: [], clipped: [], vclipped: [], overlaps: [], overlapAt: [], texts: 0 };
  const texts = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('svg')) continue;
    if (['SCRIPT', 'STYLE', 'OPTION', 'TEXTAREA', 'INPUT'].includes(e.tagName)) continue;
    if (!live(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (r.right > vw + 1 && cs.position !== 'fixed') {
      let scroller = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { scroller = true; break; } }
      if (!scroller) out.wide.push(name(e) + ' r=' + Math.round(r.right));
    }
    const ox = cs.overflowX, oy = cs.overflowY;
    if ((ox === 'hidden' || ox === 'clip') && e.scrollWidth > e.clientWidth + 1) out.clipped.push(name(e) + ' ' + e.scrollWidth + '>' + e.clientWidth);
    if ((oy === 'hidden' || oy === 'clip') && e.scrollHeight > e.clientHeight + 2) out.vclipped.push(name(e) + ' ' + e.scrollHeight + '>' + e.clientHeight);
    /* The box of the text itself, not of its container. */
    const range = document.createRange();
    let l = Infinity, tp = Infinity, rt = -Infinity, b = -Infinity;
    own.forEach((n) => { range.selectNodeContents(n); for (const q of range.getClientRects()) { if (q.width < 1 || q.height < 1) continue; l = Math.min(l, q.left); tp = Math.min(tp, q.top); rt = Math.max(rt, q.right); b = Math.max(b, q.bottom); } });
    if (l !== Infinity && !fixed(e)) texts.push({ e, l, t: tp, r: rt, b });
  }
  out.texts = texts.length;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], c = texts[j];
    if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
    const w = Math.min(a.r, c.r) - Math.max(a.l, c.l), h = Math.min(a.b, c.b) - Math.max(a.t, c.t);
    if (w <= 2 || h <= 2) continue;
    const small = Math.min((a.r - a.l) * (a.b - a.t), (c.r - c.l) * (c.b - c.t));
    if (w * h > small * 0.25) { out.overlaps.push(name(a.e) + ' x ' + name(c.e)); out.overlapAt.push(Math.round(Math.max(a.t, c.t) + scrollY)); }
  }
  out.wide = out.wide.slice(0, 8); out.clipped = out.clipped.slice(0, 8); out.vclipped = out.vclipped.slice(0, 8); out.overlaps = out.overlaps.slice(0, 8);
  return out;
});

/* Visible controls matching a selector, with their height. */
const heights = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => {
  for (let n = e; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden') return false; }
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0;
}).map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10), sel);

const go = async (page, id) => { await page.evaluate((i) => window.KiwiNativeHostAction({ action: 'navigate', id: i }), id); await sleep(1500); };
const openSettings = async (page) => { await page.evaluate(() => { const h = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers.settings; if (h) h(); }); await sleep(1500); };

/* The controls each screen must keep at 44 pt or more. */
const CONTROLS = {
  home: ['.kw-hamburger', '.topbar .ai-btn', '.dash-date-range .dr-pill', '.kiwi-native-owner-actions button'],
  orders: ['.kw-hamburger', '.topbar .ai-btn', 'button.chip[data-action="tx-filter"]'],
  clients: ['.kw-hamburger', '.cd-exp', '.cd-seg'],
  settings: ['.kw-hamburger', '.kset-row']
};

async function screens(t, page, scale) {
  const results = {};
  const shot = async (id, prepare) => {
    t.step(`${id} at ${scale}`);
    await prepare();
    const a = await audit(page);
    results[id] = a;
    /* KIWI_DT_SHOTS=<dir> leaves a picture of every collision, for debugging. */
    if (process.env.KIWI_DT_SHOTS && a.overlapAt.length) {
      fs.mkdirSync(process.env.KIWI_DT_SHOTS, { recursive: true });
      for (const [k, y] of a.overlapAt.slice(0, 6).entries()) { await page.evaluate((yy) => window.scrollTo(0, yy - 380), y); await sleep(200); await page.screenshot({ path: path.join(process.env.KIWI_DT_SHOTS, `${scale}-${id}-${k}.png`) }); }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    return a;
  };
  await shot('home', async () => {});
  await shot('orders', () => go(page, 'transactions'));
  await shot('clients', () => go(page, 'clients'));
  await shot('settings', () => openSettings(page));
  await shot('report', () => go(page, 'rapport'));
  await shot('menu', async () => { await go(page, 'accueil'); await page.evaluate(() => document.querySelector('.kw-hamburger')?.click()); await sleep(900); });
  results.menuOpen = await page.evaluate(() => document.body.classList.contains('kw-menu-open'));
  await page.evaluate(() => document.querySelector('.kw-hamburger')?.click());
  await sleep(600);
  return results;
}

/* ── 100 %: nothing changed ───────────────────────────────────────────── */
await S.run('100 %: the layout is the one it always was', async (t) => {
  const page = await phone(t, { scale: 1 });
  const a = await audit(page);
  check(a.cls.length === 0 && a.probePx === 16, 'no large-type class, text at its natural size');
  const base = await page.evaluate(() => {
    const cols = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).gridTemplateColumns.split(' ').length : 0; };
    const ai = document.querySelector('.topbar .ai-btn');
    return { actions: cols('.kiwi-native-owner-actions'), kpi: cols('.kpi-band'), aiLabel: ai ? getComputedStyle(ai, '::after').display + '|' + getComputedStyle(ai, '::after').content : '' };
  });
  check(base.actions === 4 && base.kpi === 2, `home keeps four quick actions and two KPI columns (${base.actions}, ${base.kpi})`);
  check(base.aiLabel === 'block|"Kiwi AI"', `the Kiwi AI pill keeps its label (${base.aiLabel})`);
  await go(page, 'transactions');
  const orders = await page.evaluate(() => { const r = document.querySelector('table.p-table tbody tr'); return r ? getComputedStyle(r).gridTemplateColumns.split(' ').length : 0; });
  await go(page, 'clients');
  const clients = await page.evaluate(() => { const r = document.querySelector('table.cd-tbl tbody tr'); const k = document.querySelector('.cd-kpis'); return { row: r ? getComputedStyle(r).gridTemplateColumns.split(' ').length : 0, kpis: k ? getComputedStyle(k).gridTemplateColumns.split(' ').length : 0 }; });
  check(orders === 3 && clients.row === 3 && clients.kpis === 4, `order and customer rows keep three columns, customer figures four (${orders}, ${clients.row}, ${clients.kpis})`);
});

/* ── 135 %: the previous ceiling, same layout ─────────────────────────── */
await S.run('135 %: scaled text, the old layout', async (t) => {
  const page = await phone(t, { scale: 1.35 });
  const a = await audit(page);
  check(a.cls.length === 0 && /^135%$/.test(a.tsa) && a.probePx > 21 && a.probePx < 22, `text scaled to 135 % without the large-type class (${a.tsa}, ${a.probePx}px)`);
  const cols = await page.evaluate(() => ({ actions: getComputedStyle(document.querySelector('.kiwi-native-owner-actions')).gridTemplateColumns.split(' ').length, kpi: getComputedStyle(document.querySelector('.kpi-band')).gridTemplateColumns.split(' ').length }));
  check(cols.actions === 4 && cols.kpi === 2, 'the quick actions and KPI tiles keep their 100 % columns at 135 %');
  check(a.scrollW <= a.vw, 'the home does not scroll sideways at 135 %');
});

/* ── 165 % and 200 %: the screens reflow ──────────────────────────────── */
for (const scale of [1.65, 2]) {
  await S.run(`${Math.round(scale * 100)} %: Home, Orders, Customers and Settings`, async (t) => {
    const page = await phone(t, { scale });
    const res = await screens(t, page, scale);
    const first = res.home;
    check(res.menuOpen, 'the menu drawer opens at this size and was audited with the screens');
    check(first.cls.includes('kiwi-large-type') && first.tsa === `${Math.round(scale * 100)}%`, `the dashboard is in large-type mode, text-size-adjust ${first.tsa}`);
    check(first.probePx >= 16 * scale - 0.6, `text really is scaled (a 16px probe paints ${first.probePx}px)`);
    for (const id of ['home', 'orders', 'clients', 'settings', 'report', 'menu']) {
      const a = res[id];
      check(a.texts > 12, `${id}: ${a.texts} pieces of text on screen`);
      check(a.scrollW <= a.vw, `${id}: no sideways page scroll (${a.scrollW} <= ${a.vw})`);
      assert.deepEqual(a.wide, [], `${id}: text running past the screen edge: ${a.wide.join(' | ')}`);
      assert.deepEqual(a.clipped, [], `${id}: clipped text: ${a.clipped.join(' | ')}`);
      assert.deepEqual(a.vclipped, [], `${id}: text cut at the bottom of its box: ${a.vclipped.join(' | ')}`);
      assert.deepEqual(a.overlaps, [], `${id}: text over text: ${a.overlaps.join(' | ')}`);
      console.log(`  ✓ ${id}: no clipped or overlapping text`);
    }
    /* Controls, read on their own screen. */
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const [id, enter] of [['home', () => go(page, 'accueil')], ['orders', () => go(page, 'transactions')], ['clients', () => go(page, 'clients')], ['settings', () => openSettings(page)]]) {
      await enter();
      for (const sel of CONTROLS[id]) {
        const hs = await heights(page, sel);
        assert.ok(hs.length > 0, `${id}: ${sel} is on screen`);
        assert.ok(hs.every((h) => h >= 43.5), `${id}: ${sel} is at least 44 tall (${hs.join(', ')})`);
      }
      console.log(`  ✓ ${id}: ${CONTROLS[id].join(', ')} stay 44pt or taller`);
    }
    /* The Pour vous band is still there and readable on Home. */
    await go(page, 'accueil');
    const oppo = await page.evaluate(() => { const c = document.querySelector('.oppo-card'); return c ? Math.round(c.getBoundingClientRect().width) : 0; });
    check(oppo > 200, `the Pour vous cards are full width on Home (${oppo}px)`);
  });
}

/* ── the screens that keep their lower ceiling ────────────────────────── */
await S.run('the till keeps its 135 % ceiling, a non-iPhone host only scales the chrome', async (t) => {
  const till = await phone(t, { role: 'caisse', scale: 2, url: '/kiwi-caisse.html', demo: false });
  const a = await till.evaluate(() => ({ tsa: getComputedStyle(document.documentElement).webkitTextSizeAdjust, large: document.documentElement.classList.contains('kiwi-large-type') }));
  check(a.tsa === '135%' && !a.large, `the till takes 200 % from the phone as 135 % (${a.tsa})`);
  const ipad = await phone(t, { scale: 2, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const b = await ipad.evaluate(() => ({ ts: document.documentElement.style.getPropertyValue('--type-scale'), large: document.documentElement.classList.contains('kiwi-large-type'), scrollW: document.scrollingElement.scrollWidth, vw: innerWidth }));
  check(b.ts === '1.35' && !b.large, `iPad: --type-scale stops at 1.35 and nothing reflows (${b.ts})`);
  check(b.scrollW <= b.vw, 'iPad path: the dashboard does not scroll sideways');
});

server.close();
await S.finish();
