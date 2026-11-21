#!/usr/bin/env node
/* formula + the same drink again · in a real Chromium, demo data only.
 *   node tools/formula-extra-drink-browser-test.mjs
 *
 * Browse, 21 Nov 2026: a « Continental » formula includes an orange juice at
 * 0 MAD. A guest then orders a second orange juice. The tap stacked onto the
 * formula's included line (same dish, no note): on the till the extra juice
 * was billed 0 MAD (« 2× Orange Juice 0,00 »), and from the waiter app the
 * server refused the whole order as « carte modifiée », because a formula
 * slot holds one drink, not three.
 *
 * Held here, on the shipped pages:
 *   · waiter app (kiwi-serveur.html): a tap on the drink, plain or through
 *     the options path, becomes its own line at the menu price, and the
 *     formula's included line stays at 1;
 *   · till counter (kiwi-caisse.html, real click on the menu card): the same;
 *   · till table order: the same.
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
const S = suite('formula-extra-drink', { browser });
const check = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); console.log('  ✓ ' + msg); };

async function open(tr, url) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  tr.step('open ' + url);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  // coverage: surface=team-entry locale=fr viewport=desktop
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return { page, errors };
}

/* A formula already on the order, its included drink at 0 MAD, as both apps
   write it (parent `formula`, child `formula-part`, one shared formulaUid). */
const seedFormula = (drinkId, extra) => {
  const drink = menuItems.find((m) => m.id === drinkId);
  return [
    Object.assign({ uid: 'f-parent', id: 'formula-demo', name: 'Continental', price: 68, qty: 1, note: '', kind: 'formula', formulaUid: 'fu-1', formulaName: 'Continental' }, extra),
    Object.assign({ uid: 'f-part', id: drink.id, name: drink.name, price: 0, qty: 1, note: '', kind: 'formula-part', formulaUid: 'fu-1', formulaName: 'Continental', slotLabel: 'Breakfast Cold Drink', formulaSlotId: 'sl_1' }, extra),
  ];
};

try {
  await S.run('waiter app · the same drink after a formula is its own paid line', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-serveur.html?demo=1');
    await page.waitForFunction(() => typeof addToTableOrder === 'function' && typeof addConfiguredLine === 'function' && Array.isArray(menuItems) && menuItems.length > 0, { timeout: 20000 });
    const r = await page.evaluate((seedSrc) => {
      const seed = new Function('return (' + seedSrc + ')')();
      const drink = menuItems.find((m) => !m.formula && !(m.opts && m.opts.length) && m.price > 0);
      tableOrders.T3 = seed(drink.id, { sourceLocal: true, sentQty: 0 });
      addToTableOrder('T3', drink.id);
      const afterTap = tableOrders.T3.filter((l) => l.id === drink.id).map((l) => ({ kind: l.kind || '', qty: +l.qty, price: +l.price }));
      tableOrders.T4 = seed(drink.id, { sourceLocal: true, sentQty: 0 });
      addConfiguredLine('T4', drink, []);
      const afterSheet = tableOrders.T4.filter((l) => l.id === drink.id).map((l) => ({ kind: l.kind || '', qty: +l.qty, price: +l.price }));
      return { price: drink.price, afterTap, afterSheet };
    }, seedFormula.toString());
    for (const [label, lines] of [['a tap on the card', r.afterTap], ['the options path', r.afterSheet]]) {
      const part = lines.find((l) => l.kind === 'formula-part');
      const extra = lines.find((l) => l.kind === '');
      check(part && part.qty === 1 && part.price === 0, `${label} · the formula's included drink stays 1 × 0 MAD`, JSON.stringify(lines));
      check(extra && extra.qty === 1 && extra.price === r.price, `${label} · the extra drink is its own line at ${r.price} MAD`, JSON.stringify(lines));
    }
    check(errors.length === 0, 'no script error in the waiter app', errors.join(' | '));
  });

  await S.run('till · the same drink after a formula is its own paid line (counter and table)', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-caisse.html?demo=restaurant');
    await page.waitForSelector('.ci-float-chip', { visible: true, timeout: 30000 });
    for (let i = 0; i < 20; i++) {
      await page.click('.ci-float-chip').catch(() => {});
      const armed = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !!b && !b.disabled; }, { timeout: 1000 }).then(() => true, () => false);
      if (armed) break;
    }
    for (let i = 0; i < 20; i++) {
      await page.click('#clockin-btn').catch(() => {});
      const gone = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !b || !b.offsetParent; }, { timeout: 1000 }).then(() => true, () => false);
      if (gone) break;
    }
    await page.waitForFunction(() => typeof currentOrder === 'function' && typeof pushTableOrderLine === 'function' && Array.isArray(menuItems) && menuItems.length > 0, { timeout: 20000 });
    const drink = await page.evaluate(() => { const d = menuItems.find((m) => m.id === 'm-024'); return { id: d.id, price: d.price }; });
    tr.step('counter: a formula in the cart, then a real tap on the same drink');
    await page.evaluate((seedSrc, id) => {
      const seed = new Function('return (' + seedSrc + ')')();
      currentOrder().replaceCart([]);
      currentOrder().append(cart, ...seed(id, {}));
      renderMenu(); renderCart();
    }, seedFormula.toString(), drink.id);
    const card = `.menu-item[data-menu-id="${drink.id}"]`;
    await page.waitForSelector('.cat-pill[data-cat="boissons"]', { visible: true, timeout: 20000 });
    await page.click('.cat-pill[data-cat="boissons"]');
    await page.waitForSelector(card, { visible: true });
    await page.click(card);
    await new Promise((r) => setTimeout(r, 300));
    const counter = await page.evaluate((id) => cart.filter((l) => l.id === id).map((l) => ({ kind: l.kind || '', qty: +l.qty, price: +l.price })), drink.id);
    check(counter.some((l) => l.kind === 'formula-part' && l.qty === 1 && l.price === 0), 'counter · the formula\'s included drink stays 1 × 0 MAD', JSON.stringify(counter));
    check(counter.some((l) => l.kind === '' && l.qty === 1 && l.price === drink.price), `counter · the extra drink is its own line at ${drink.price} MAD`, JSON.stringify(counter));
    tr.step('counter: the − on the same menu card takes back the paid drink, never the included one');
    const counterMinus = await page.evaluate((id) => { cartMinusMenu(id); return cart.filter((l) => l.id === id).map((l) => ({ kind: l.kind || '', qty: +l.qty, price: +l.price })); }, drink.id);
    check(counterMinus.length === 1 && counterMinus[0].kind === 'formula-part' && counterMinus[0].qty === 1, 'counter · the card − removes the paid drink and leaves the formula whole', JSON.stringify(counterMinus));
    tr.step('table: a formula on T1, then the same drink');
    const table = await page.evaluate((seedSrc, id) => {
      const seed = new Function('return (' + seedSrc + ')')();
      const t = Object.keys(tables)[0];
      currentOrder().replaceTable(t, seed(id, {}));
      pushTableOrderLine(t, menuItems.find((m) => m.id === id), []);
      const pick = () => tableOrders[t].filter((l) => l.id === id).map((l) => ({ kind: l.kind || '', qty: +l.qty, price: +l.price }));
      const added = pick();
      tableOrderMinusMenu(t, id);
      return { added, minus: pick() };
    }, seedFormula.toString(), drink.id);
    const tableMinus = table.minus;
    check(table.added.some((l) => l.kind === 'formula-part' && l.qty === 1 && l.price === 0), 'table · the formula\'s included drink stays 1 × 0 MAD', JSON.stringify(table.added));
    check(table.added.some((l) => l.kind === '' && l.qty === 1 && l.price === drink.price), `table · the extra drink is its own line at ${drink.price} MAD`, JSON.stringify(table.added));
    check(tableMinus.length === 1 && tableMinus[0].kind === 'formula-part' && tableMinus[0].qty === 1, 'table · the card − removes the paid drink and leaves the formula whole', JSON.stringify(tableMinus));
    check(errors.length === 0, 'no script error on the till', errors.join(' | '));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
process.exit(S.failed ? 1 : 0);
