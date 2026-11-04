#!/usr/bin/env node
/* Choosing which barcode labels to print, in the boutique till, in a real browser.
 *
 *   node tools/label-picker-browser-test.mjs
 *
 * Santos, 2 Nov 2026 (voice note): « is there a better way to print the
 * labels? » The printer button printed one label per piece in stock, all
 * sizes and colours at once. Now it opens assets/pos-boutique/label-picker.js
 * (the real module, here in Chromium); every step is a real click or key.
 * Held here:
 *   · each colour × size with a barcode gets a counter, prefilled with the
 *     delivery not yet printed, else the stock; a size without a barcode says
 *     so and cannot be counted;
 *   · « 7 of the grey M »: none, then 7 typed on that row prints exactly 7
 *     labels of that variant, nothing else, and marks the delivery printed;
 *   · « Tout le stock », « Toute la couleur » and the − / + steppers set the
 *     counts; nothing chosen, nothing to print; Escape closes without printing;
 *   · both print buttons of the till (inventory row, product sheet) open it. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The wiring, read from the source: both buttons go through the picker. */
const inv = fs.readFileSync(path.join(root, 'assets/pos-boutique/inventory.js'), 'utf8');
assert.match(inv, /function printProductLabels\(pid, start\) \{\s*openLabelPicker\(/, 'the inventory row printer opens the picker');
assert.match(inv, /pick: \(all\) => printProductLabels\(pid, all \? 'stock' : 'rec'\)/, 'the product sheet print buttons open the picker');
assert.match(fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8'), /if \(o\.pick\) \{ o\.pick\(all\); return; \}/, 'the sheet hands over to the picker when the till asks');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const harness = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes</title></head><body>
<button id="opener">Imprimer</button>
<script type="module">
  import { openLabelPicker } from '/assets/pos-boutique/label-picker.js';
  window.__printed = [];
  const variants = [
    { id: 'v-noir-s', colorId: 'noir', colorLabel: 'Noir', size: 'S', stock: 2 },
    { id: 'v-noir-m', colorId: 'noir', colorLabel: 'Noir', size: 'M', stock: 1 },
    { id: 'v-gris-m', colorId: 'gris', colorLabel: 'Gris', size: 'M', stock: 3 },
    { id: 'v-gris-l', colorId: 'gris', colorLabel: 'Gris', size: 'L', stock: 4, nocode: true },
  ];
  const cat = { getProduct: (pid) => pid === 'p-robe' ? { product: { id: 'p-robe', name: 'Robe' }, variants } : null };
  const label = (pid, v) => v.nocode ? null : { title: 'Robe', sub: v.colorLabel + ' · ' + v.size, code: 'C-' + v.id };
  window.__open = (start) => openLabelPicker({ pid: 'p-robe', cat, label, lang: 'fr', start, print: (labels) => window.__printed.push(labels.map((l) => l.code)) });
  document.getElementById('opener').addEventListener('click', () => window.__open('rec'));
  window.__ready = true;
</script></body></html>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/labels.html') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end(harness); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('label-picker-browser', { browser });

/* A delivery of 2 grey M not yet printed, as the stock screen records it. */
async function open(t, { receipt = true, width = 1180 } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width, height: 860 });
  await page.goto(base + '/labels.html', { waitUntil: 'load' });
  await page.evaluate((receipt) => {
    if (receipt) localStorage.setItem('kiwiLabelReceipt:p-robe', JSON.stringify({ at: Date.now(), printed: false, got: { 'v-gris-m': 2 } }));
    else localStorage.removeItem('kiwiLabelReceipt:p-robe');
  }, receipt);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  await page.click('#opener');
  await page.waitForSelector('[data-blp] [role="dialog"]', { visible: true });
  return page;
}
const counts = (page) => page.$$eval('[data-blp-n]', (xs) => Object.fromEntries(xs.map((x) => [x.dataset.blpN, Number(x.value)])));
const go = (page) => page.$eval('[data-blp-go]', (b) => ({ text: b.textContent.trim(), disabled: b.disabled }));

await tests.run('seven labels of the grey M, nothing else, and the delivery is marked printed', async (t) => {
  const page = await open(t);
  assert.deepEqual(await counts(page), { 'v-noir-s': 0, 'v-noir-m': 0, 'v-gris-m': 2 }, 'prefilled with the delivery not yet printed');
  assert.match((await go(page)).text, /Imprimer 2 étiquette/);
  assert.match(await page.$eval('[data-blp]', (el) => el.textContent), /Sans code-barres/, 'the size without a barcode says so');
  assert.equal(await page.$('[data-blp-n="v-gris-l"]'), null, 'and has no counter');
  t.step('none, then 7 on the grey M');
  await page.click('[data-blp-preset="none"]');
  assert.deepEqual(await go(page), { text: 'Aucune étiquette choisie', disabled: true });
  await page.click('[data-blp-n="v-gris-m"]', { clickCount: 3 });
  await page.keyboard.type('7');
  assert.match((await go(page)).text, /Imprimer 7 étiquette/);
  await page.click('[data-blp-go]');
  await page.waitForFunction(() => window.__printed.length === 1);
  const printed = await page.evaluate(() => window.__printed[0]);
  assert.equal(printed.length, 7); assert.ok(printed.every((c) => c === 'C-v-gris-m'), 'only the grey M');
  assert.equal(await page.$('[data-blp]'), null, 'the window closes once sent');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('kiwiLabelReceipt:p-robe')));
  assert.equal(rec.printed, true, 'the delivery is marked printed');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'opener', 'focus goes back to the button');
});

await tests.run('all stock, a whole colour, the steppers; Escape prints nothing', async (t) => {
  const page = await open(t, { receipt: false, width: 390 });
  assert.deepEqual(await counts(page), { 'v-noir-s': 2, 'v-noir-m': 1, 'v-gris-m': 3 }, 'no delivery pending: the stock');
  assert.equal(await page.$('[data-blp-preset="rec"]'), null, 'no delivery shortcut without a delivery');
  await page.click('[data-blp-preset="none"]');
  await page.click('[data-blp-col="noir"]');
  assert.deepEqual(await counts(page), { 'v-noir-s': 2, 'v-noir-m': 1, 'v-gris-m': 0 });
  await page.click('[data-blp-d="1"][data-v="v-gris-m"]');
  await page.click('[data-blp-d="1"][data-v="v-gris-m"]');
  await page.click('[data-blp-d="-1"][data-v="v-noir-m"]');
  await page.click('[data-blp-d="-1"][data-v="v-noir-m"]');
  assert.deepEqual(await counts(page), { 'v-noir-s': 2, 'v-noir-m': 0, 'v-gris-m': 2 }, 'never below zero');
  assert.match((await go(page)).text, /Imprimer 4 étiquette/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, 'no sideways scroll on a phone: ' + overflow);
  const box = await page.$eval('[data-blp-d="1"][data-v="v-gris-m"]', (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  assert.ok(box[0] >= 44 && box[1] >= 44, 'steppers are a 44 px target: ' + box);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-blp]'));
  assert.deepEqual(await page.evaluate(() => window.__printed), []);
});

server.close();
await tests.finish();
