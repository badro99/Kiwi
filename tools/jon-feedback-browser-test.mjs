#!/usr/bin/env node
/* Jon's Burgers feedback (27 Nov 2026) · in a real Chromium, French, demo data only.
 *   node tools/jon-feedback-browser-test.mjs
 *
 * Held with real clicks and typing on the shipped pages, behind a static
 * server with no /api, so nothing reaches a merchant:
 *   · Livraison (Menu & modificateurs): the price grid has a search bar, finds
 *     a dish by a misspelt word, says when nothing matches, and every dish is
 *     listed under its menu section;
 *   · Recettes: the same search bar over the recipe list;
 *   · the till, in-house delivery: no order-number field, the delivery fee from
 *     the dashboard with − and +, typed by hand too; the bill's fee line follows
 *     and leaves at 0;
 * (Ventes & activité, one filter per delivery channel, is a real-session page:
 * tools/dashboard-activity-test.mjs holds it on the shipped renderer.)
 * KIWI_SHOTS=<dir> writes a screenshot of each surface there.
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
const S = suite('jon-feedback', { browser });
const check = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); console.log('  ✓ ' + msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.KIWI_SHOTS || '';
async function shot(page, name, sel) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await wait(900);   // let the page settle its entry fade
  const el = sel ? await page.$(sel) : null;
  await (el || page).screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {});
}

async function open(tr, url, viewport) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setViewport(viewport || { width: 1366, height: 900 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  tr.step('open ' + url);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return { page, errors };
}
async function demoRestaurant(page) {
  await page.waitForSelector('[data-explore]', { visible: true, timeout: 30000 });
  await page.click('[data-explore]');
  await page.waitForSelector('[data-kiwi-skip]', { visible: true });
  await page.click('[data-kiwi-skip]');
  await page.waitForFunction(() => window.KiwiVenue?.getVenueType?.() === 'restaurant' && !!window.KiwiMenuStore && !!window.KiwiDelivery, { timeout: 30000 });
  await page.evaluate(() => window.KiwiMenuStore.loadExample());
}
/* Glovo and the in-house delivery on, 20 MAD of fee: what the owner set. */
const deliveryOn = (page) => page.evaluate(() => {
  /* The demo till has no merchant, so its stores keep nothing: point it at a
     test one (the dashboard demo has its own venue). */
  if (!window.KiwiVenue && window.KiwiPlatform) window.KiwiPlatform.pairedMerchant = () => 'test-burgers';
  const D = window.KiwiDelivery, d = D.doc(), now = Date.now();
  d.platforms = Object.assign({}, d.platforms, { glovo: { on: true, at: now } });
  d.house = { on: true, fee: 20, at: now };
  if (D.store) D.store.set(d);
  return D.options().map((o) => o.id);
});
const visibleRows = (page, scope) => page.$$eval(`${scope} [data-find-row]`, (els) => els.filter((e) => e.offsetParent).map((e) => e.getAttribute('data-find-text')));
async function typeInto(page, sel, text) {
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (text) await page.type(sel, text);
}

let dishes = [];
try {
  await S.run('dashboard · Livraison and Recettes get a search bar', async (tr) => {
    const { page, errors } = await open(tr, '/dashboard.html');
    await demoRestaurant(page);
    dishes = await page.evaluate(() => window.KiwiMenuStore.items().filter((x) => !x.archived).map((x) => x.name));
    check(dishes.length > 6, `the example menu has ${dishes.length} dishes`);
    tr.step('Livraison: Glovo on, the grid and its search bar');
    await page.evaluate(() => window.KiwiDelivery.openSettings());
    await page.waitForSelector('[data-pid="glovo"] [data-kdl-on]', { visible: true, timeout: 10000 });
    await page.click('[data-pid="glovo"] [data-kdl-on]');
    await page.waitForSelector('[data-find="delivery-prices"] .kfb-in', { visible: true, timeout: 10000 });
    const all = await visibleRows(page, '[data-kdl-products]');
    check(all.length === dishes.length, `every dish is in the grid, priced in the dining room or not (${all.length})`);
    const groups = await page.$$eval('[data-kdl-products] [data-find-group]', (els) => els.map((e) => e.textContent.trim()));
    check(groups.length >= 2, 'dishes are grouped under their menu sections', groups.join(' · '));
    const target = dishes.find((n) => n.split(/\s+/).some((w) => w.length >= 6)) || dishes[0];
    const word = target.split(/\s+/).find((w) => w.length >= 6) || target;
    const typo = word.slice(0, 2) + word[3] + word[2] + word.slice(4);   // two letters swapped
    await page.type('[data-find="delivery-prices"] .kfb-in', typo);
    const hits = await visibleRows(page, '[data-kdl-products]');
    check(hits.length >= 1 && hits.some((t) => t.startsWith(target)), `« ${typo} » still finds « ${target} »`, hits.join(' | '));
    check(hits.length < all.length, 'the other dishes step aside');
    const count = await page.$eval('[data-find="delivery-prices"] .kfb-n', (e) => e.textContent);
    check(new RegExp(`^${hits.length} sur ${all.length}$`).test(count), `the bar counts « ${count} »`);
    await shot(page, 'delivery-search', '.kdl-find');
    await typeInto(page, '[data-find="delivery-prices"] .kfb-in', 'zzzz');
    await page.waitForSelector('[data-find="delivery-prices"] .kfb-none:not([hidden])', { visible: true });
    check(/Aucun résultat pour « zzzz »/.test(await page.$eval('[data-find="delivery-prices"] .kfb-none', (e) => e.textContent)), 'nothing found says so');
    await page.click('[data-find="delivery-prices"] .kfb-x');
    check((await visibleRows(page, '[data-kdl-products]')).length === all.length, 'the clear button brings every dish back');
    tr.step('a price typed under a search survives clearing it');
    await page.type('[data-find="delivery-prices"] .kfb-in', target.split(/\s+/)[0]);
    const id = await page.$eval('[data-kdl-products] [data-find-row]:not(.kfb-hide) [data-kdl-item][data-p="glovo"]', (e) => e.getAttribute('data-kdl-item'));
    await page.type(`[data-kdl-products] [data-kdl-item="${id}"][data-p="glovo"]`, '77');
    await page.click('[data-find="delivery-prices"] .kfb-x');
    await page.click('[data-kdl-save]');
    await page.waitForFunction((i) => window.KiwiDelivery.priceOf(i, 'glovo') === 77, { timeout: 10000 }, id);
    check(true, 'the Glovo price found through the search is saved');

    tr.step('Recettes: the same bar');
    await page.evaluate(() => { window.Kiwi.closeModal?.(); document.querySelectorAll('.kiwi-backdrop').forEach((b) => b.remove()); });
    await page.evaluate(() => { try { sessionStorage.setItem('kiwiMenuTab', 'recipes'); } catch (_) {} window.KiwiVenue.showMenu(); });
    await page.waitForSelector('[data-action="rmw-tab"][data-tab="recipes"]', { visible: true, timeout: 15000 });
    await page.click('[data-action="rmw-tab"][data-tab="recipes"]');
    await page.waitForSelector('[data-find="recipes"] .kfb-in', { visible: true, timeout: 15000 });
    const before = await visibleRows(page, '.rmw-recipe-list');
    await page.type('[data-find="recipes"] .kfb-in', target.split(/\s+/).slice(-1)[0]);
    const after = await visibleRows(page, '.rmw-recipe-list');
    check(after.length >= 1 && after.length < before.length && after.some((t) => t.startsWith(target)), `the recipe list narrows to « ${target} » (${after.length}/${before.length})`);
    await shot(page, 'recipes-search', '.mi-section[data-find-scope]');
    check(errors.length === 0, 'no script error on the dashboard', errors.join(' | '));
  });

  await S.run('classic till · in-house delivery asks the fee, with − and +', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-caisse.html?demo=restaurant');
    await page.waitForSelector('.ci-float-chip', { visible: true, timeout: 30000 });
    for (let i = 0; i < 20; i++) {
      await page.click('.ci-float-chip').catch(() => {});
      if (await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !!b && !b.disabled; }, { timeout: 1000 }).then(() => true, () => false)) break;
    }
    for (let i = 0; i < 20; i++) {
      await page.click('#clockin-btn').catch(() => {});
      if (await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !b || !b.offsetParent; }, { timeout: 1000 }).then(() => true, () => false)) break;
    }
    await page.waitForFunction(() => typeof renderCart === 'function' && Array.isArray(menuItems) && menuItems.length > 0 && !!window.KiwiDelivery, { timeout: 30000 });
    await deliveryOn(page);
    await page.waitForSelector('.mode-pill[data-mode="livraison"]', { visible: true, timeout: 10000 });
    await page.click('.mode-pill[data-mode="livraison"]');
    await page.waitForSelector('[data-kdl-pick="livraison"]', { visible: true, timeout: 10000 });
    await page.click('[data-kdl-pick="livraison"]');
    await page.waitForSelector('.kdl-band .kdl-fee-in', { visible: true, timeout: 10000 });
    const fee = () => page.evaluate(() => ({ input: document.querySelector('.kdl-band .kdl-fee-in').value, line: cart.filter((l) => l.kind === 'fee').map((l) => l.price * l.qty), less: document.querySelector('.kdl-band [data-kdl-step^="-"]').disabled }));
    check(!(await page.$('.kdl-band input:not(.kdl-fee-in)')), 'no order-number field for the in-house delivery');
    let f = await fee();
    check(f.input === '20' && f.line.join() === '20', 'the fee starts at the 20 MAD set on the dashboard', JSON.stringify(f));
    await shot(page, 'till-fee', '#vrap-builder');
    await page.click('.kdl-band [data-kdl-step="5"]');
    f = await fee();
    check(f.input === '25' && f.line.join() === '25', '+ raises it to 25 and the bill follows', JSON.stringify(f));
    await page.click('.kdl-band [data-kdl-step="-5"]');
    await page.click('.kdl-band [data-kdl-step="-5"]');
    f = await fee();
    check(f.input === '15' && f.line.join() === '15', '− twice brings it to 15', JSON.stringify(f));
    await typeInto(page, '.kdl-band .kdl-fee-in', '32,5');
    f = await fee();
    check(f.line.join() === '32.5', 'a typed 32,5 sets the fee to 32.50', JSON.stringify(f));
    await typeInto(page, '.kdl-band .kdl-fee-in', '0');
    await page.click('.kdl-band .kdl-fee-l');
    f = await fee();
    check(f.line.length === 0 && f.input === '0' && f.less, 'at 0 the fee line leaves the bill and − rests', JSON.stringify(f));
    await page.click('.kdl-band [data-kdl-step="5"]');
    f = await fee();
    check(f.line.join() === '5', '+ from 0 puts a 5 MAD fee back', JSON.stringify(f));
    tr.step('Glovo keeps its order number');
    await page.click('.kdl-band .kdl-band-x');
    await page.click('.mode-pill[data-mode="livraison"]');
    await page.waitForSelector('[data-kdl-pick="glovo"]', { visible: true, timeout: 10000 });
    await page.click('[data-kdl-pick="glovo"]');
    await page.waitForSelector('.kdl-band input:not(.kdl-fee-in)', { visible: true, timeout: 10000 });
    check(!(await page.$('.kdl-band .kdl-fee-in')), 'a platform still asks its order number, not a fee');
    check(errors.length === 0, 'no script error on the till', errors.join(' | '));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
process.exit(S.failed ? 1 : 0);
