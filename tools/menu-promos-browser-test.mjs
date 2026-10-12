#!/usr/bin/env node
/* menu promotions · in a real Chromium, on the shipped pages, demo data only.
 *   node tools/menu-promos-browser-test.mjs
 *
 * The rule (assets/menu-promos.js) has its own suite; the server applies it in
 * priceOrder (tools/menu-promos-server-test.mjs). This one holds what a person
 * sees:
 *   · the till (kiwi-caisse.html, restaurant demo, real clicks): a dessert
 *     rings up at −15 %, the line names the promotion and strikes the regular
 *     price, two taps stack, and a unit added after the promotion stopped is a
 *     new line at full price while the first keeps its price;
 *   · the waiter app (kiwi-serveur.html): the same price and stamp on a table
 *     line, read at the code screen, which is never passed here;
 *   · the dashboard (Menu page, « Promotions » tab, real clicks and typing):
 *     a promotion is created, saved on the menu, paused and deleted.
 * No /api behind the static server: nothing reaches a merchant.
 */
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
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  /* No backend: every /api call fails fast, as on a till that lost the network. */
  if (pathname.startsWith('/api/') || pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('menu-promos', { browser });
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());

async function open(tr, url) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  tr.step('open ' + url);
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return { page, errors };
}

try {
  await S.run('till · a dessert at −15 %, stacked, and a price frozen when ordered', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-caisse.html?demo=restaurant');
    await page.waitForSelector('#clockin-btn', { visible: true });
    tr.step('open the till');
    /* The button paints before its deferred script binds it: tap until the
       opening screen actually goes, like a cashier would. */
    for (let i = 0; i < 20; i++) {
      await page.click('#clockin-btn').catch(() => {});
      const gone = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !b || !b.offsetParent; }, { timeout: 1000 }).then(() => true, () => false);
      if (gone) break;
    }
    await page.waitForSelector('.cat-pill[data-cat="desserts"]', { visible: true, timeout: 20000 });
    tr.step('desserts, then two taps on the crème brûlée');
    await page.click('.cat-pill[data-cat="desserts"]');
    await page.waitForSelector('.menu-item[data-menu-id="m-031"]', { visible: true });
    await page.click('.menu-item[data-menu-id="m-031"]');
    await page.click('.menu-item[data-menu-id="m-031"]');
    await page.waitForFunction(() => document.querySelectorAll('.rp-item--cart').length === 1
      && document.querySelector('.rp-item--cart .qty-num')?.textContent.trim() === '2');
    check(true, 'two taps stack on one line, quantity 2');
    const promo = await text(page, '.rp-item--cart .rp-item-promo');
    check(/−15 %/.test(promo) && /L'heure du goûter/.test(promo), `the line names the promotion (${promo})`);
    check(await text(page, '.rp-item--cart .rp-item-promo s') === '100 MAD', 'the regular price, 2 × 50, is struck through');
    check(await text(page, '.rp-item--cart .rp-item-price') === '85 MAD', 'the line costs 2 × 42,50 = 85 MAD');
    check(/85 MAD/.test(await text(page, '.rp-total')), 'the bill total is 85 MAD');

    tr.step('the promotion stops, then a third tap');
    await page.evaluate(() => { carteState.promos = []; });
    await page.click('.menu-item[data-menu-id="m-031"]');
    await page.waitForFunction(() => document.querySelectorAll('.rp-item--cart').length === 2);
    const rows = await page.$$eval('.rp-item--cart', (els) => els.map((e) => ({
      qty: e.querySelector('.qty-num')?.textContent.trim(),
      price: e.querySelector('.rp-item-price')?.textContent.trim(),
      promo: !!e.querySelector('.rp-item-promo'),
    })));
    check(rows.some((r) => r.qty === '2' && r.price === '85 MAD' && r.promo), 'the two units ordered during the promotion keep their price');
    check(rows.some((r) => r.qty === '1' && r.price === '50 MAD' && !r.promo), 'the unit ordered after it is a new line at 50 MAD');
    check(/135 MAD/.test(await text(page, '.rp-total')), 'the bill total is 135 MAD');

    tr.step('a drink, outside the promotion');
    await page.click('.cat-pill[data-cat="boissons"]');
    await page.waitForSelector('.menu-item[data-menu-id="m-024"]', { visible: true });
    await page.click('.menu-item[data-menu-id="m-024"]');
    await page.waitForFunction(() => document.querySelectorAll('.rp-item--cart').length === 3);
    check(await page.$$eval('.rp-item--cart .rp-item-promo', (els) => els.length) === 1, 'a drink carries no promotion');
    check(errors.length === 0, 'no script error on the till' + (errors.length ? ': ' + errors.join(' | ') : ''));
  });

  await S.run('waiter app · the same price and stamp on a table line', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-serveur.html?demo=1');
    await page.waitForFunction(() => !!window.KiwiMenuPromos && typeof addToTableOrder === 'function', { timeout: 20000 });
    const r = await page.evaluate(() => {
      tableOrders.T3 = [];
      addToTableOrder('T3', 'm-031');
      addToTableOrder('T3', 'm-031');
      addToTableOrder('T3', 'm-023');
      const lines = tableOrders.T3.map((l) => ({ id: l.id, qty: l.qty, price: l.price, basePrice: l.basePrice, promo: l.promo || null }));
      const wrap = document.createElement('div');
      wrap.innerHTML = svPromoLine(tableOrders.T3[0]);
      return { lines, html: wrap.textContent };
    });
    const dessert = r.lines.find((l) => l.id === 'm-031');
    const tea = r.lines.find((l) => l.id === 'm-023');
    check(r.lines.length === 2 && dessert.qty === 2, 'two crèmes brûlées stack on one line');
    check(dessert.price === 42.5 && dessert.basePrice === 50, 'the dessert is priced 42,50, regular 50');
    check(dessert.promo && dessert.promo.id === 'demo-gouter' && dessert.promo.before === 50, 'the line carries the promotion stamp');
    check(/−15 %/.test(r.html) && /L'heure du goûter/.test(r.html) && /100/.test(r.html), `the row shows the promotion (${r.html})`);
    check(tea.price === 30 && !tea.promo, 'the tea stays at 30 MAD, no stamp');
    check(errors.length === 0, 'no script error in the waiter app' + (errors.length ? ': ' + errors.join(' | ') : ''));
  });

  await S.run('dashboard · create, pause and delete a promotion on the Menu page', async (tr) => {
    const { page, errors } = await open(tr, '/dashboard.html');
    tr.step('explore the demo');
    await page.waitForSelector('[data-explore]', { visible: true, timeout: 30000 });
    await page.click('[data-explore]');
    await page.waitForSelector('[data-kiwi-skip]', { visible: true });
    await page.click('[data-kiwi-skip]');
    await page.waitForFunction(() => window.KiwiVenue?.getVenueType?.() === 'restaurant' && !!window.KiwiMenuStore && !!window.KiwiMenuPromosPanel, { timeout: 30000 });
    /* The demo menu starts empty; the store's own example gives it sections. */
    await page.evaluate(() => window.KiwiMenuStore.loadExample());
    tr.step('Menu page, Promotions tab');
    await page.evaluate(() => window.KiwiVenue.showMenu());
    await page.waitForSelector('[data-action="rmw-tab"][data-tab="promos"]', { visible: true, timeout: 20000 });
    await page.click('[data-action="rmw-tab"][data-tab="promos"]');
    await page.waitForSelector('[data-mp-act="new"]', { visible: true });
    check(/Aucune promotion/.test(await text(page, '[data-rmw-promos]')), 'the tab opens empty');

    tr.step('new promotion: Happy hour, 20 %, Boissons');
    await page.click('[data-mp-act="new"]');
    /* Kiwi.modal hands focus to [data-autofocus] on the next frame; typing
       before that would land on the close button. */
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'mp-name');
    check(true, 'the name field has the focus when the editor opens');
    await page.click('[data-mp-save]');
    check(/nom/.test(await text(page, '[data-mp-err]')), 'saving without a name says what is missing');
    /* Real keystrokes. Under the full gate (many browsers at once) a burst
       of key events has once arrived nowhere; nothing in the page writes to
       the field, so the value is confirmed and typed again once if needed. */
    const typeInto = async (sel, value) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.click(sel, { clickCount: 3 });
        await page.type(sel, value, { delay: 15 });
        const ok = await page.waitForFunction((s, v) => document.querySelector(s)?.value === v, { timeout: 3000 }, sel, value).then(() => true, () => false);
        if (ok) return;
        tr.notice(`keystrokes into ${sel} did not land, typing again`);
      }
      throw new Error(`could not type into ${sel}`);
    };
    await typeInto('[data-mp-field="name"]', 'Happy hour');
    await typeInto('[data-mp-field="value"]', '20');
    const boissons = await page.evaluate(() => window.KiwiMenuStore.categories().find((c) => c.name === 'Boissons').id);
    await page.click(`[data-mp-scope="${boissons}"]`);
    await page.click('[data-mp-save]');
    await page.waitForSelector('.mp-card', { visible: true });
    const saved = await page.evaluate(() => window.KiwiMenuStore.data().promos);
    check(saved.length === 1 && saved[0].name === 'Happy hour' && saved[0].kind === 'percent' && saved[0].value === 20
      && saved[0].cats.join() === boissons && saved[0].createdAt > 0, 'the promotion is saved on the menu');
    const card = await text(page, '.mp-card');
    check(/−20 %/.test(card) && /En cours/.test(card) && /Boissons/.test(card), `the card reads its discount, status and scope (${card})`);
    const priced = await page.evaluate(() => {
      const d = window.KiwiMenuStore.data();
      const tea = d.items.find((i) => i.name === 'Thé à la menthe');
      return window.KiwiMenuPromos.resolve(window.KiwiMenuStore.promos(), { itemId: tea.id, catId: tea.catId }, tea.price, Date.now());
    });
    check(priced && priced.price === 9.6, 'the saved rule prices a 12 MAD tea at 9,60');

    tr.step('pause, then delete');
    await page.click('.mp-card [data-mp-act="pause"]');
    await page.waitForFunction(() => /En pause/.test(document.querySelector('.mp-card')?.textContent || ''));
    check(await page.evaluate(() => window.KiwiMenuStore.data().promos[0].paused === true), 'pausing is saved');
    await page.click('.mp-card [data-mp-act="delete"]');
    await page.waitForSelector('[data-mp-ok]', { visible: true });
    await page.click('[data-mp-ok]');
    await page.waitForFunction(() => !document.querySelector('.mp-card'));
    check(await page.evaluate(() => !('promos' in window.KiwiMenuStore.data())), 'deleting the last one leaves the menu without a promos key');
    check(errors.length === 0, 'no script error on the dashboard' + (errors.length ? ': ' + errors.join(' | ') : ''));
  });
} finally {
  server.close();
  await S.finish();
}
