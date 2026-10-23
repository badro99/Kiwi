#!/usr/bin/env node
/* dash-report-browser-test · the head of the dashboard's Report on the kit
 * (stage 5 (3), §12), behind kiwiSkin2027:dashboard, on the demo store in a
 * real Chromium. The kit draws the shipped figures (owner, 2026-10-15): every
 * check below holds the kit to the shipped render day-report-dash.js made.
 *
 *   node tools/dash-report-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-report.js is never fetched, no #kit-report, the shipped
 *     figures are drawn;
 *   · flag on: #kit-report follows the shipped nav bar, whose day selector
 *     stays; the shipped figures, day line, status and Export are not drawn;
 *   · the day line carries the shipped day and status; the key figure is the
 *     shipped net, with its shipped baseline;
 *   · one tile per other shipped figure, same labels and values;
 *   · Export is one menu of the three exports, and each runs the shipped one;
 *   · another day on the shipped strip moves the kit's head with it;
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
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();

/* The demo store, as a first visit sees it (Explore the demo, then Escape),
   then the sidebar's Report. */
async function openReport(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1000 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('.sidebar nav a[data-nav="rapport"]'), { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="rapport"]').click());
  await page.waitForFunction(() => !!document.querySelector('.dash-genpage .kdr-kpis'), { timeout: 20000 });
  await sleep(600);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);

console.log('dash-report-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openReport(false);
    const off = await page.evaluate(() => ({ kit: !!document.getElementById('kit-report'), kpis: !!document.querySelector('.kdr-kpis').offsetParent }));
    check(!fetched.some((p) => /dash-report\.js/.test(p)) && !off.kit && off.kpis, 'flag off: dash-report.js is never fetched, no #kit-report, the shipped figures are drawn');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openReport(true);
  const place = await page.evaluate(() => {
    const kr = document.getElementById('kit-report');
    const nav = document.querySelector('.dash-genpage .kdr-nav');
    const gone = (sel) => [...document.querySelectorAll(sel)].every((el) => !el.offsetParent);
    return { after: !!kr && kr.previousElementSibling === nav, selector: !!nav.querySelector('[data-kdr-day-selector]').offsetParent,
      shipped: gone('.dash-genpage .kdr-kpis') && gone('.kdr-nav .kdr-day') && gone('.kdr-nav .kdr-chip') && gone('.kdr-nav [data-kdr="csv"]') };
  });
  check(place.after && place.selector, 'flag on: #kit-report follows the shipped nav bar, whose day selector stays');
  check(place.shipped, 'the shipped figures, day line, status and Export are not drawn');

  const read = () => page.evaluate(() => {
    const kr = document.getElementById('kit-report');
    const kpis = [...document.querySelectorAll('.dash-genpage .kdr-kpi')].map((k) => {
      const v = k.querySelector('.kdr-kpi-v').cloneNode(true); v.querySelectorAll('small').forEach((s) => s.remove());
      return { label: k.querySelector('.kdr-kpi-l').textContent, value: v.textContent, d: (k.querySelector('.kdr-d') || {}).textContent || '' };
    });
    return {
      day: kr.querySelector('.k-dr__day').textContent,
      shippedDay: document.querySelector('.kdr-nav .kdr-day b').textContent,
      chip: (document.querySelector('.kdr-nav .kdr-chip') || {}).textContent || '',
      kf: kr.querySelector('[data-key-figure] bdi').textContent,
      cmp: kr.querySelector('.k-dh__cmp').textContent,
      tiles: [...kr.querySelector('k-kpi-grid').shadowRoot.querySelectorAll('[data-tile]')].map((t) => ({ label: t.querySelector('.lb').textContent, value: (t.querySelector('.vl .k-title') || {}).textContent || '' })),
      kpis,
    };
  });

  let v = await read();
  check(norm(v.day).indexOf(norm(v.shippedDay)) === 0 && v.chip && norm(v.day).endsWith(norm(v.chip)), `the day line carries the shipped day and status (${norm(v.day)})`);
  check(norm(v.kf) === norm(v.kpis[0].value) && norm(v.kpis[0].d).indexOf(norm(v.cmp).replace(/^\S+ /, '')) >= 0, `the key figure is the shipped net, with its baseline (${norm(v.kf)} · ${norm(v.cmp)})`);
  check(v.tiles.length === v.kpis.length - 1 && v.tiles.every((t, i) => norm(t.label) === norm(v.kpis[i + 1].label) && norm(t.value) === norm(v.kpis[i + 1].value)),
    `one tile per other shipped figure, same labels and values (${v.tiles.map((t) => norm(t.value)).join(' · ')})`);

  /* Export: one menu of three, each the shipped export. */
  await page.evaluate(() => {
    window.__ran = [];
    window.Kiwi.handlers['export'] = () => window.__ran.push('printable');
    window.KiwiReport = Object.assign(window.KiwiReport || {}, { downloadTransactions: () => window.__ran.push('sales') });
    window.KiwiDayReportExport = Object.assign(window.KiwiDayReportExport || {}, { open: () => window.__ran.push('day_report') });
  });
  const ran = [];
  for (const id of ['printable', 'sales', 'day_report']) {
    await tap(page, `document.querySelector('#kit-report k-button[data-do="export"]').shadowRoot.querySelector('button')`);
    await sleep(300);
    const rows = await page.evaluate(() => {
      const pop = document.querySelector('#kit-report k-popover');
      return { open: pop.hasAttribute('open'), rows: pop.querySelector('k-list').rows.map((r) => r.title) };
    });
    if (id === 'printable') check(rows.open && rows.rows.length === 3, `Export opens one menu of the three exports (${rows.rows.join(', ')})`);
    await tap(page, `document.querySelector('#kit-report k-popover k-list').shadowRoot.querySelector('[data-id="${id}"] [data-row]')`);
    await sleep(300);
  }
  ran.push(...await page.evaluate(() => window.__ran.slice()));
  const closed = await page.evaluate(() => !document.querySelector('#kit-report k-popover').hasAttribute('open'));
  check(ran.join(',') === 'printable,sales,day_report' && closed, `each runs the shipped export, and the menu closes (${ran.join(', ')})`);

  /* Another day, on the shipped strip. */
  const before = v.shippedDay;
  await page.evaluate(() => { const bars = [...document.querySelectorAll('.dash-genpage .kdr-sd:not(.is-sel)')]; bars[0].click(); });
  await sleep(800);
  v = await read();
  check(norm(v.shippedDay) !== norm(before) && norm(v.day).indexOf(norm(v.shippedDay)) === 0 && norm(v.kf) === norm(v.kpis[0].value),
    `another day on the shipped strip moves the kit's head (${norm(v.shippedDay)} · ${norm(v.kf)})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-report-browser-test · ${checks} checks`);
