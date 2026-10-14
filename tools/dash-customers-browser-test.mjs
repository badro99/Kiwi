#!/usr/bin/env node
/* dash-customers-browser-test · the dashboard's Customers page on the kit
 * (stage 5 (4), §18.5), behind kiwiSkin2027:dashboard, on the demo store in
 * a real Chromium. The kit draws the shipped book (owner, 2026-10-15): every
 * check below holds the kit to the page clients-directory.js rendered.
 *
 *   node tools/dash-customers-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-customers.js is never fetched, no #kit-customers, the
 *     shipped book is drawn;
 *   · flag on: #kit-customers heads the shipped page, whose cards, bar and
 *     table are not drawn;
 *   · the summary is the shipped book and its contactable count; the segments
 *     carry the shipped counts; one row per shipped customer, same order;
 *   · a segment and the search move the shipped ones; no match says so, and
 *     its Show all clears both;
 *   · the overflow is a menu of what the shipped bar shows; Export and Add run
 *     the shipped ones; a row opens the shipped record;
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
   then the sidebar's Customers. */
async function openCustomers(flag) {
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
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.Kiwi && !!window.Kiwi.handlers['clients-directory'], { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-action="clients-directory"]').click());
  await page.waitForFunction(() => !!document.querySelector('.dash-genpage .cd'), { timeout: 20000 });
  await sleep(600);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);

console.log('dash-customers-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openCustomers(false);
    const off = await page.evaluate(() => ({ kit: !!document.getElementById('kit-customers'), table: !!document.querySelector('.cd .cd-tbl').offsetParent }));
    check(!fetched.some((p) => /dash-customers\.js/.test(p)) && !off.kit && off.table, 'flag off: dash-customers.js is never fetched, no #kit-customers, the shipped book is drawn');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openCustomers(true);
  const place = await page.evaluate(() => {
    const kc = document.getElementById('kit-customers');
    return { before: !!kc && kc.nextElementSibling === document.querySelector('.dash-genpage .cd'),
      shipped: !document.querySelector('.dash-genpage .cd').offsetParent && !document.querySelector('#cd-stats').offsetParent };
  });
  check(place.before, 'flag on: #kit-customers heads the shipped page');
  check(place.shipped, 'the shipped count cards, bar and table are not drawn');

  const read = () => page.evaluate(() => {
    const kc = document.getElementById('kit-customers');
    return {
      sum: kc.querySelector('.k-dc__sum').textContent,
      segs: kc.querySelector('k-segmented').options.map((o) => o.label),
      seg: kc.querySelector('k-segmented').getAttribute('value'),
      rows: kc.querySelector('.k-dc__rows').rows.map((r) => ({ id: r.id, title: r.title, value: r.value })),
      shipped: [...document.querySelectorAll('.cd .cd-tbl tbody tr')].map((tr) => ({ id: tr.dataset.cdId, name: tr.querySelector('.cd-nm').firstChild.textContent, spend: tr.children[4].textContent })),
      chips: [...document.querySelectorAll('.cd [data-cd-seg]')].map((b) => ({ id: b.dataset.cdSeg, n: b.querySelector('em').textContent, on: b.classList.contains('on') })),
      book: document.querySelector('#cd-stats [data-cd-kpi="total"] .v').textContent,
      ok: document.querySelector('#cd-stats [data-cd-kpi="ok"] .v').textContent,
      em: (kc.querySelector('.k-dc__em:not([hidden])') || {}).textContent || '',
    };
  });

  let v = await read();
  check(norm(v.sum).indexOf(norm(v.book) + ' ') === 0 && norm(v.sum).indexOf(' ' + norm(v.ok) + ' ') > 0, `the summary is the shipped book and its contactable count (${norm(v.sum)})`);
  check(v.segs.length === 5 && v.chips.every((c, i) => v.segs[i].endsWith(' ' + c.n)), `the segments carry the shipped counts (${v.segs.join(' · ')})`);
  check(v.rows.length > 0 && v.rows.length === v.shipped.length && v.rows.every((r, i) => r.id === v.shipped[i].id && norm(r.title) === norm(v.shipped[i].name) && norm(r.value) === norm(v.shipped[i].spend)),
    `one row per shipped customer, same name and spend, same order (${v.rows.length})`);

  /* A segment, on the kit. */
  await tap(page, `document.querySelector('#kit-customers k-segmented').shadowRoot.querySelector('[data-v="new"]')`);
  await sleep(400);
  v = await read();
  check(v.seg === 'new' && v.chips.find((c) => c.on).id === 'new' && v.rows.length === v.shipped.length && v.rows.length === +v.chips.find((c) => c.id === 'new').n,
    `New on the kit's segments moves the shipped segment (${v.rows.length})`);

  /* The search, on the kit: no match, then Show all. */
  await page.evaluate(() => {
    const f = document.querySelector('#kit-customers k-field').shadowRoot.querySelector('input');
    f.value = 'zzzz-nobody';
    f.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await sleep(400);
  v = await read();
  const q = await page.evaluate(() => document.querySelector('#cd-q').value);
  check(q === 'zzzz-nobody' && v.rows.length === 0 && v.shipped.length === 0 && v.em.length > 0, `the search types into the shipped field; no match says so (${norm(v.em)})`);
  await tap(page, `document.querySelector('#kit-customers .k-dc__em k-button').shadowRoot.querySelector('button')`);
  await sleep(400);
  v = await read();
  const after = await page.evaluate(() => ({ q: document.querySelector('#cd-q').value, kq: document.querySelector('#kit-customers k-field').value }));
  check(after.q === '' && after.kq === '' && v.seg === 'all' && v.rows.length === v.shipped.length && v.rows.length > 0, 'its Show all clears the shipped search and segment, and the kit\'s field');

  /* The overflow menu and Add, then a row. */
  await page.evaluate(() => {
    window.__ran = [];
    ['#cd-exp', '#cd-loyalty', '#cd-retention', '#cd-campaign', '#cd-new'].forEach((s) => {
      const b = document.querySelector(s);
      if (b) b.addEventListener('click', (e) => { window.__ran.push(s); e.stopImmediatePropagation(); }, true);
    });
  });
  await tap(page, `document.querySelector('#kit-customers k-button[data-do="more"]').shadowRoot.querySelector('button')`);
  await sleep(300);
  const menu = await page.evaluate(() => {
    const pop = document.querySelector('#kit-customers k-popover');
    return { open: pop.hasAttribute('open'), ids: pop.querySelector('k-list').rows.map((r) => r.id), shown: window.KiwiClientsPage.model().more };
  });
  check(menu.open && menu.ids[0] === 'exp' && menu.ids.join() === menu.shown.join(), `the overflow is a menu of what the shipped bar shows (${menu.ids.join(', ')})`);
  await tap(page, `document.querySelector('#kit-customers k-popover k-list').shadowRoot.querySelector('[data-id="exp"] [data-row]')`);
  await sleep(300);
  await tap(page, `document.querySelector('#kit-customers k-button[data-do="add"]').shadowRoot.querySelector('button')`);
  await sleep(300);
  const ran = await page.evaluate(() => window.__ran.slice());
  check(ran.join() === '#cd-exp,#cd-new', `Export and Add run the shipped ones (${ran.join(', ')})`);
  const first = v.rows[0];
  await tap(page, `document.querySelector('#kit-customers .k-dc__rows').shadowRoot.querySelector('[data-row]')`);
  await sleep(500);
  const detail = await page.evaluate(() => [...document.querySelectorAll('.kiwi-modal, [role="dialog"]')].map((m) => m.textContent).join(' '));
  check(detail.indexOf(first.title) >= 0, `a row opens the shipped customer record (${first.title})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-customers-browser-test · ${checks} checks`);
