#!/usr/bin/env node
/* menu-shell-browser-test · the restaurant Menu page shell (#0114, #0149,
 * #0150, #0151), in a real Chromium on the demo dashboard, at 390 (phone) and
 * 1280 (desktop).
 *
 *   node tools/menu-shell-browser-test.mjs
 *
 * What it holds, by real clicks and typing:
 *   · the page never scrolls sideways;
 *   · sections: a rail beside the dishes from 900 px, a pill row below it;
 *     either way it is a .mi-pill-row that liquid-lens.js lenses;
 *   · dishes are rows with a price, an availability switch and a modifier
 *     count; search and "New item" stay on screen while the list scrolls;
 *   · the open tab and section stay put after an edit, a re-render and a
 *     poller tick (a sale landing through KiwiSales);
 *   · a dish added through the shipped editor, priced 14,50, switched off from
 *     its row, then found by the search field.
 * The demo store keeps everything in this browser: no network, no merchant. */
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
const S = suite('menu-shell', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(t, width) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  const phone = width < 900;
  await page.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('kiwiSkipOnboard', '1'); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  page.setDefaultNavigationTimeout(60000);
  t.step('open the demo dashboard at ' + width);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!(window.KiwiMenuStore && window.Kiwi && window.Kiwi.handlers && window.KiwiRestaurantMenuWorkspace), { timeout: 30000 });
  /* The demo café starts with an empty carte: give it the shipped example. */
  await page.evaluate(() => { if (!KiwiMenuStore.items().length) KiwiMenuStore.loadExample(); });
  t.step('open Menu from the sidebar');
  if (phone) await tap(page, '.kw-hamburger');
  await tap(page, '.sidebar [data-nav="menu"]');
  await page.waitForFunction(() => document.body.classList.contains('page-menu') && !!document.querySelector('[data-menu-root] .rmw-shell .rmw-row'), { timeout: 20000 });
  await sleep(600);
  return page;
}

/* A real tap: scroll the control to the middle, make sure nothing (the sticky
   bar, the tab bar, a sheet) sits on top of it, then click its centre. */
async function tap(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 10000 });
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await sleep(150);
  const hit = await page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect(), p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: p === e || e.contains(p), x: r.left + r.width / 2, y: r.top + r.height / 2, on: p && (p.className || p.tagName).toString().slice(0, 60) };
  });
  assert.ok(hit.ok, `tap ${sel} lands on it, not on ${hit.on}`);
  await page.mouse.click(hit.x, hit.y);
  await sleep(250);
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const state = (page) => page.evaluate(() => ({
  tab: (document.querySelector('[data-menu-root] .mi-filters .mi-pill.on') || {}).dataset?.tab || null,
  pick: ((document.querySelector('.rmw-tabpick-label') || {}).textContent || '').trim(),
  stations: !!document.querySelector('[data-menu-root] [data-rmw-panel] [data-action="rmw-station-add"]'),
  cat: (document.querySelector('.rmw-cats .mi-pill.on') || {}).dataset?.cat || null,
  head: ((document.querySelector('.rmw-list-head h3') || {}).textContent || '').trim(),
}));
const tick = (page) => page.evaluate(() => { window.KiwiSales.add(null, { amount: 0, label: 'TEST KIWI tick' }); window.KiwiRestaurantMenuWorkspace.render(); });
const closeSheet = async (page) => { const b = await page.$('.kiwi-backdrop .kiwi-modal-close'); if (b) { await b.click(); await page.waitForSelector('.kiwi-backdrop', { hidden: true }); await sleep(300); } };

for (const width of [390, 1280]) {
  const phone = width < 900;
  await S.run(`menu shell at ${width}`, async (t) => {
    // coverage: surface=dashboard locale=fr viewport=phone
    // coverage: surface=dashboard locale=fr viewport=desktop
    // coverage: surface=dashboard-menu locale=fr viewport=phone
    // coverage: surface=dashboard-menu locale=fr viewport=desktop
    const page = await open(t, width);
    check(await noSideScroll(page), `${width}: no horizontal scroll on Menu`);

    t.step('sections and rows');
    const shape = await page.evaluate(() => {
      const cats = document.querySelector('.rmw-cats'), cs = getComputedStyle(cats);
      const row = document.querySelector('.rmw-row');
      return {
        pillRow: cats.classList.contains('mi-pill-row'), lensed: cats.hasAttribute('data-kw-lens') && !!cats.querySelector('.kw-lens'),
        column: cs.flexDirection, railBeside: (() => { const a = document.querySelector('.rmw-rail').getBoundingClientRect(), b = document.querySelector('.rmw-main').getBoundingClientRect(); return a.right <= b.left + 1; })(),
        price: (row.querySelector('.rmw-row-price') || {}).textContent || '', switch: row.querySelector('.rmw-avail[role="switch"]')?.getAttribute('aria-checked'),
        mods: !!row.querySelector('.rmw-row-mods b'), rowsFit: [...document.querySelectorAll('.rmw-row')].every((r) => r.scrollWidth <= r.clientWidth + 1),
        cards: document.querySelectorAll('[data-menu-root] .mi-card').length,
      };
    });
    check(shape.pillRow && shape.lensed, `${width}: the sections row is a .mi-pill-row, lensed by liquid-lens.js`);
    if (phone) check(shape.column === 'row' && !shape.railBeside, `${width}: sections are a pill row above the dishes`);
    else check(shape.column === 'column' && shape.railBeside, `${width}: sections are a rail on the left of the dishes`);
    check(/MAD/.test(shape.price) && shape.switch === 'true' && shape.mods && shape.cards === 0, `${width}: dishes are rows with price, availability switch and modifier count (${shape.price.trim()})`);
    check(shape.rowsFit, `${width}: every row fits its width`);

    t.step('the search and add bar stays on screen');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(300);
    const stuck = await page.evaluate(() => { const b = document.querySelector('.rmw-add').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
    check(stuck.top >= 0 && stuck.bottom <= stuck.vh, `${width}: "New item" is still on screen at the bottom of the list (top ${Math.round(stuck.top)})`);
    await page.evaluate(() => window.scrollTo(0, 0));

    t.step('the section stays put after an edit');
    const plats = await page.evaluate(() => KiwiMenuStore.categories().find((c) => KiwiMenuStore.items().filter((x) => x.catId === c.id).length > 1).id);
    await tap(page, `.rmw-cats [data-cat="${plats}"]`);
    let s = await state(page);
    check(s.cat === plats && !!s.head, `${width}: tapping a section selects it (${s.head})`);
    const target = await page.evaluate((cid) => KiwiMenuStore.items().find((x) => x.catId === cid).id, plats);
    await tap(page, `.rmw-row[data-rmw-row="${target}"] .rmw-row-main`);
    await page.waitForSelector('.kiwi-modal [data-price]', { visible: true });
    await page.click('.kiwi-modal [data-price]', { clickCount: 3 });
    await page.keyboard.type('99');
    await tap(page, '.kiwi-modal [data-save]');
    await page.waitForSelector('.kiwi-backdrop', { hidden: true, timeout: 5000 }).catch(() => {});
    await sleep(300);
    check(await page.evaluate((id) => KiwiMenuStore.items().find((x) => x.id === id).price === 99, target), `${width}: the shipped item editor saved the new price`);
    s = await state(page);
    check(s.cat === plats, `${width}: the section is still selected after the edit`);
    await tick(page); await sleep(300);
    s = await state(page);
    check(s.cat === plats, `${width}: the section is still selected after a re-render and a poller tick`);

    t.step('the tab stays put after an edit and a tick');
    if (phone) {
      await tap(page, '.rmw-tabpick');
      await tap(page, '.rmw-tabpick-row[data-pick="stations"]');
    } else {
      await tap(page, '[data-menu-root] .mi-filters [data-action="rmw-tab"][data-tab="stations"]');
    }
    await sleep(300);
    s = await state(page);
    check(s.stations && (phone ? /poste/i.test(s.pick) : s.tab === 'stations'), `${width}: the Kitchen stations tab opens`);
    await page.evaluate((id) => KiwiMenuStore.updateItem(id, { price: 98 }), target);
    await tick(page); await sleep(300);
    s = await state(page);
    check(s.stations && (phone ? /poste/i.test(s.pick) : s.tab === 'stations'), `${width}: the tab stays put after a menu edit, a re-render and a poller tick`);
    check(await noSideScroll(page), `${width}: no horizontal scroll on the stations tab`);
    if (phone) { await tap(page, '.rmw-tabpick'); await tap(page, '.rmw-tabpick-row[data-pick="menu"]'); }
    else await tap(page, '[data-menu-root] .mi-filters [data-action="rmw-tab"][data-tab="menu"]');
    await page.waitForSelector('.rmw-shell .rmw-row', { visible: true });

    t.step('add a dish at 14,50, switch it off, find it');
    const name = `TEST KIWI Citronnade ${width}`;
    await tap(page, '.rmw-bar .rmw-add');
    await page.waitForSelector('.kiwi-modal [data-name]', { visible: true });
    await tap(page, '.kiwi-modal [data-name]');
    await page.keyboard.type(name);
    await page.click('.kiwi-modal [data-price]', { clickCount: 3 });
    await page.keyboard.type('14.50');
    await tap(page, '.kiwi-modal [data-save]');
    await page.waitForSelector('.kiwi-backdrop', { hidden: true, timeout: 5000 }).catch(() => {});
    await sleep(300);
    const added = await page.evaluate((n) => { const x = KiwiMenuStore.items().find((i) => i.name === n); return x ? { id: x.id, price: x.price, avail: x.avail } : null; }, name);
    check(added && added.price === 14.5 && added.avail !== false, `${width}: the new dish is saved at 14.5`);
    const row = `.rmw-row[data-rmw-row="${added.id}"]`;
    check(await page.$eval(`${row} .rmw-row-price`, (e) => e.textContent.replace(/\s+/g, ' ').trim()) === '14,50 MAD', `${width}: its row reads 14,50 MAD`);
    await tap(page, `${row} .rmw-avail`);
    await sleep(300);
    check(await page.evaluate((id) => KiwiMenuStore.items().find((x) => x.id === id).avail === false, added.id), `${width}: the row switch takes the dish off sale`);
    check(await page.$eval(`${row} .rmw-avail`, (e) => e.getAttribute('aria-checked') === 'false' && document.activeElement === e), `${width}: the switch reads off and keeps the focus`);
    await tap(page, '.rmw-bar [data-rmw-search]');
    await page.keyboard.type('citronnade');
    await sleep(300);
    const found = await page.evaluate(() => [...document.querySelectorAll('.rmw-shell .rmw-row')].map((r) => r.querySelector('.rmw-row-name').textContent));
    check(found.length === 1 && found[0] === name, `${width}: the search field finds it (${found.join(', ')})`);
    check(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-rmw-search]') && document.activeElement.value === 'citronnade'), `${width}: the search keeps its focus while typing`);
    check(await noSideScroll(page), `${width}: no horizontal scroll after the whole flow`);
    await closeSheet(page);
    check(page.errors.length === 0, `${width}: no page error ${page.errors.join(' | ')}`);
  });
}

server.close();
if (!S.counts.failed && !S.counts.infra) console.log(`✓ menu-shell-browser-test · ${checks} checks`);
await S.finish();
