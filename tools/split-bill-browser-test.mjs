#!/usr/bin/env node
/* Split bill, as Browse uses it (26 Nov 2026) · in a real Chromium, French,
 * demo data only (a static server with no /api: nothing reaches a merchant).
 *   node tools/split-bill-browser-test.mjs
 *
 * Browse's report: « a table with 4 items, you pay item 1 with split and leave
 * the others for later: the table becomes bugged and you can't pay the other
 * splits », « we need to split without paying at once », « cash on every
 * share with what we received and the change, and keep card ».
 *
 * Held here with real clicks on the 2027 till (the default) and the classic one:
 *   · by item, one share paid in cash (received 100, change 10 shown), the
 *     bill then says what was paid and asks only for the rest; another
 *     table's split opened and left; back on the table, « Encaisser » reopens
 *     the same shares with share 1 ticked; the rest paid by card and cash; the
 *     table is freed and the sales sum to the bill to the cent;
 *   · a split saved without paying (« Enregistrer le partage »), undone while
 *     nothing is paid, saved again, one share paid, a dish added at the table
 *     becomes a share of its own, every share paid;
 *   · the classic window: a share paid, « Plus tard », another table, resume.
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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
const S = suite('split-bill', { browser });
let checks = 0;
const check = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); checks++; console.log('  ✓ ' + msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 'T2', OTHER = 'T9';   /* demo tables: T2 holds 2 × Salade 45, 2 × Tajine 180, Thé 30, Jus 50 = 530 */
const FREE = 'T8';               /* a free demo table, seated and ordered by clicks: 2 × Salade 45, 2 × Briouates 60, Harira 35, Zaalouk 40 = 285 */

async function till(tr, { kit }) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((on) => {
    localStorage.setItem('kiwiSkin2027:till', on ? '1' : '0');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, kit);
  // coverage: surface=caisse-restaurant locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.waitForFunction((id) => typeof tables !== 'undefined' && !!tables[id], { timeout: 20000 }, T);
  await wait(500);
  /* The demo till opens on takeaway: the floor, by the rail (2027) or the mode pill. */
  if (kit) await page.click('k-rail >>> [data-id="floor"]');
  else await page.click('.mode-pill[data-mode="salle"]');
  await page.waitForFunction(() => mode === 'salle', { timeout: 8000 });
  return { page, errors };
}
const shown = (page, tag) => page.evaluate((t) => { const el = document.querySelector(t); return !!el && !el.hidden; }, tag);
const tap = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 10000 }); await page.click(sel); await wait(250); };
const billText = (page) => page.evaluate(() => document.querySelector('k-bill').shadowRoot.textContent.replace(/\s+/g, ' '));
const openTableKit = async (page, id) => { await page.evaluate((t) => openTable(t), id); await wait(500); };
const splitSales = (page) => page.evaluate(() => journal.filter((e) => e && e.split && !e.voided).map((e) => ({ cents: Math.round(e.amount * 100), method: e.method, idx: e.split.index, flow: e.split.flowId })));
const assignRow = (page, row, share) => page.click(`k-split >>> [data-l="${row}"] [data-chip="${share}"]`);
/* Seat the free table and order by taps on the 2027 menu, then send: real
   lines, as a waiter or the cashier would put them (the demo's sample tables
   swap their sample lines for the real ones at the first ticket). */
async function seatKit(page, id, dishes) {
  await page.click(`.cplan-tbl[data-table="${id}"]`);
  await page.waitForSelector('#new-table-modal.is-open', { timeout: 8000 });
  await page.click('#nt-covers-chips button');
  await page.click('#nt-confirm');
  await page.waitForFunction(() => mode === 'order', { timeout: 8000 });
  for (const d of dishes) { await page.click(`k-menu-grid >>> [data-item="${d}"]`); await wait(120); }
  await tap(page, 'k-bill >>> [data-w="send"]');
  await page.waitForFunction(() => mode === 'salle', { timeout: 8000 });
  await openTableKit(page, id);
}
async function payShareKit(page, { method, chipText }) {
  await tap(page, 'k-split >>> [data-w="pay"]');
  await page.waitForFunction(() => { const p = document.querySelector('k-pay'); return p && !p.hidden; }, { timeout: 8000 });
  await tap(page, `k-pay >>> [data-method="${method}"]`);
  if (method === 'cash' && chipText) {
    const chips = await page.$$('k-pay >>> [data-chip]');
    for (const c of chips) if ((await c.evaluate((e) => e.textContent)).includes(chipText)) { await c.click(); break; }
    await wait(150);
  }
  await tap(page, 'k-pay >>> [data-w="confirm"]');
}

try {
  await S.run('2027 · one share paid, left for later, another table, back: the rest is paid share by share', async (tr) => {
    const { page, errors } = await till(tr, { kit: true });
    tr.step('seat T8 and order by taps: 2 salads, 2 briouates, harira, zaalouk');
    await seatKit(page, FREE, ['m-001', 'm-001', 'm-002', 'm-002', 'm-003', 'm-004']);
    check(/Encaisser 285,00/.test(await billText(page)), 'T8 asks 285,00 MAD');
    await tap(page, 'k-bill >>> [data-w="split"]');
    await page.click('k-split >>> k-segmented >>> [data-value="item"]').catch(async () => {
      await page.evaluate(() => { const s = document.querySelector('k-split'); s.__mode = 'item'; s.render(); });
    });
    await wait(250);
    const rows = await page.$$eval('k-split >>> [data-l]', (els) => els.map((e) => e.getAttribute('data-l')));
    check(rows.filter((r) => r.startsWith('Briouates au fromage#')).length === 2, 'by item, 2 × Briouates is two rows, one per dish', rows.join(' | '));
    /* four shares (2 by default, « + » twice): 1 = both salads, 2 and 3 = one briouate each, 4 = harira and zaalouk */
    await page.click('k-split >>> [data-l="Salade marocaine#1"] [data-chip="+"]'); await wait(80);
    await page.click('k-split >>> [data-l="Salade marocaine#1"] [data-chip="+"]'); await wait(80);
    for (const [row, s] of [['Salade marocaine#1', 1], ['Salade marocaine#2', 1], ['Briouates au fromage#1', 2], ['Briouates au fromage#2', 3], ['Harira#0', 4], ['Zaalouk#0', 4]]) { await assignRow(page, row, s); await wait(80); }
    const shares = await page.evaluate(() => document.querySelector('k-split').shares());
    check(JSON.stringify(shares) === JSON.stringify([9000, 6000, 6000, 7500]), 'four shares: 90 · 60 · 60 · 75', JSON.stringify(shares));

    tr.step('share 1 in cash, 100 received');
    await payShareKit(page, { method: 'cash', chipText: '100' });
    const note = await page.evaluate(() => document.querySelector('k-pay').pay.note || '');
    check(/Reçu 100,00/.test(note) && /Monnaie à rendre 10,00/.test(note), 'the paid screen keeps what was received and the change', note);
    await page.waitForFunction(() => { const s = document.querySelector('k-split'); return s && !s.hidden && document.querySelector('k-pay').hidden; }, { timeout: 8000 });
    check(JSON.stringify(await page.evaluate(() => document.querySelector('k-split').parts.map((p) => p.paid))) === '[true,false,false,false]', 'the split comes back with share 1 ticked');

    tr.step('leave for later: the bill asks only for the rest');
    await tap(page, 'k-split >>> [data-w="leave"]');
    let bt = await billText(page);
    check(/Déjà réglé · 1 sur 4 parts/.test(bt) && /Encaisser 195,00/.test(bt), 'the bill shows « Déjà réglé · 1 sur 4 parts » and asks 195,00', bt.slice(-160));

    tr.step('another table: its own split opened and left');
    await openTableKit(page, OTHER);
    await tap(page, 'k-bill >>> [data-w="split"]');
    check(await page.evaluate(() => !document.querySelector('k-split').parts), 'T9 gets a fresh split, not T8\'s shares');
    await tap(page, 'k-split >>> [data-w="leave"]');

    tr.step('back on T8: Encaisser reopens the same shares');
    await openTableKit(page, FREE);
    bt = await billText(page);
    check(/Encaisser 195,00/.test(bt), 'T8 still asks 195,00 after another table', bt.slice(-120));
    await tap(page, 'k-bill >>> [data-w="pay"]');
    check(await shown(page, 'k-split') && !(await shown(page, 'k-pay')), 'Encaisser opens the split, not a whole-bill payment');
    const parts = await page.evaluate(() => document.querySelector('k-split').parts.map((p) => [Math.round(p.amount * 100), p.paid]));
    check(JSON.stringify(parts) === JSON.stringify([[9000, true], [6000, false], [6000, false], [7500, false]]), 'the same four shares, share 1 paid', JSON.stringify(parts));
    check(!(await page.$('k-split >>> [data-w="cancel"]')), 'a split with a share paid cannot be cancelled');

    tr.step('share 2 by card (card still offered), share 3 in cash with the change, share 4 by card');
    await page.waitForSelector('k-split >>> [data-w="pay"]', { visible: true });
    await payShareKit(page, { method: 'card' });
    await page.waitForFunction(() => { const s = document.querySelector('k-split'); return s && !s.hidden && document.querySelector('k-pay').hidden; }, { timeout: 8000 });
    await tap(page, 'k-split >>> [data-w="pay"]');
    check(!!(await page.$('k-pay >>> [data-method="card"]')) && !!(await page.$('k-pay >>> [data-method="cash"]')), 'share 3 offers cash and card');
    await tap(page, 'k-pay >>> [data-w="leave"]').catch(() => {});
    await page.evaluate(() => { const p = document.querySelector('k-pay'); if (!p.hidden) window.KiwiTillFrame.closePay(); });
    await wait(300);
    if (!(await shown(page, 'k-split'))) await tap(page, 'k-bill >>> [data-w="pay"]');
    await payShareKit(page, { method: 'cash', chipText: '100' });
    const note3 = await page.evaluate(() => document.querySelector('k-pay').pay.note || '');
    check(/Reçu 100,00/.test(note3) && /Monnaie à rendre 40,00/.test(note3), 'share 3: received 100, change 40 on screen', note3);
    await page.waitForFunction(() => { const s = document.querySelector('k-split'); return s && !s.hidden && document.querySelector('k-pay').hidden; }, { timeout: 8000 });
    await payShareKit(page, { method: 'card' });
    await page.waitForFunction(() => document.querySelector('k-split').hidden && document.querySelector('k-pay').hidden, { timeout: 8000 });

    const sales = await splitSales(page);
    check(sales.length === 4 && new Set(sales.map((s) => s.flow)).size === 1 && sales.reduce((a, s) => a + s.cents, 0) === 28500,
      'four share sales of one split, summing to 285,00 to the cent', JSON.stringify(sales));
    check(JSON.stringify(sales.map((s) => s.method)) === JSON.stringify(['cash', 'card', 'cash', 'card']), 'methods as tapped: cash, card, cash, card');
    check(await page.evaluate((id) => ['khlass', 'khawya'].includes(tables[id].status) && !tableSplits.has(id), FREE), 'T8 is freed and its split cleared');
    check(errors.length === 0, 'no page error', errors.join(' | '));
  });

  await S.run('2027 · split saved without paying, undone, saved again; a dish added later becomes its own share', async (tr) => {
    const { page, errors } = await till(tr, { kit: true });
    await seatKit(page, FREE, ['m-001', 'm-001', 'm-002', 'm-002', 'm-003', 'm-004']);
    tr.step('equal split in 2, saved without taking a share');
    await tap(page, 'k-bill >>> [data-w="split"]');
    await tap(page, 'k-split >>> [data-w="save"]');
    check(await page.evaluate((id) => tableSplits.has(id) && tableSplits.get(id).parts.length === 2 && tableSplits.get(id).parts.every((p) => !p.paid), FREE), 'the split is saved with two shares, none paid');
    check(!!(await page.$('k-split >>> [data-w="cancel"]')), 'a saved split with nothing paid can be cancelled');
    await tap(page, 'k-split >>> [data-w="leave"]');
    await tap(page, 'k-bill >>> [data-w="pay"]');
    check(await shown(page, 'k-split') && await page.evaluate(() => (document.querySelector('k-split').parts || []).length === 2), 'Encaisser on the bill reopens the saved shares');
    tr.step('cancel it, then save a split in 2 again');
    await tap(page, 'k-split >>> [data-w="cancel"]');
    check(await page.evaluate((id) => !tableSplits.has(id) && !document.querySelector('k-split').parts, FREE), 'cancelled: no saved split, a fresh split sheet');
    await tap(page, 'k-split >>> [data-w="save"]');
    tr.step('pay share 1 in cash, exact');
    await payShareKit(page, { method: 'cash', chipText: 'Exact' });
    await page.waitForFunction(() => { const s = document.querySelector('k-split'); return s && !s.hidden && document.querySelector('k-pay').hidden; }, { timeout: 8000 });
    await tap(page, 'k-split >>> [data-w="leave"]');
    tr.step('a dish added at the table after the split');
    await tap(page, 'k-bill >>> [data-w="add-items"]');
    await page.waitForFunction(() => mode === 'order', { timeout: 8000 });
    await page.click('k-menu-grid >>> [data-item="m-003"]'); await wait(150);
    await tap(page, 'k-bill >>> [data-w="send"]');
    await page.waitForFunction(() => mode === 'salle', { timeout: 8000 });
    await openTableKit(page, FREE);
    const added = 35;
    const bt = await billText(page);
    check(/Encaisser 177,50/.test(bt), 'the bill asks the unpaid share plus the added harira (142,50 + 35,00)', bt.slice(-140));
    await tap(page, 'k-bill >>> [data-w="pay"]');
    const parts = await page.evaluate(() => document.querySelector('k-split').parts.map((p) => [Math.round(p.amount * 100), p.paid]));
    check(parts.length === 3 && parts[0][1] && parts[2][0] === Math.round(added * 100), 'the added dish is a third share of its own price', JSON.stringify(parts));
    tr.step('pay the rest');
    await payShareKit(page, { method: 'card' });
    await page.waitForFunction(() => { const s = document.querySelector('k-split'); return s && !s.hidden && document.querySelector('k-pay').hidden; }, { timeout: 8000 });
    await payShareKit(page, { method: 'cash', chipText: 'Exact' });
    await page.waitForFunction(() => document.querySelector('k-split').hidden, { timeout: 8000 });
    const sales = await splitSales(page);
    check(sales.length === 3 && sales.reduce((a, s) => a + s.cents, 0) === 28500 + Math.round(added * 100), 'three sales summing to the bill with the added dish', JSON.stringify(sales));
    check(await page.evaluate((id) => ['khlass', 'khawya'].includes(tables[id].status), FREE), 'the table is freed');
    check(errors.length === 0, 'no page error', errors.join(' | '));
  });

  await S.run('classic till · a share paid, « Plus tard », another table, resumed and finished', async (tr) => {
    const { page, errors } = await till(tr, { kit: false });
    await page.evaluate((id) => openTable(id), T);
    await page.waitForSelector('#pay-split', { visible: true, timeout: 10000 });
    await page.click('#pay-split');
    await page.waitForSelector('#split-modal.is-open', { timeout: 10000 });
    await page.click('[data-parts="2"]').catch(() => {});
    await wait(150);
    await page.click('#split-launch');
    await page.waitForSelector('[data-pay-part="0"][data-pay-method="cash"]', { visible: true });
    await page.click('[data-pay-part="0"][data-pay-method="cash"]');
    await page.waitForFunction(() => !document.getElementById('cash-confirm').disabled, { timeout: 8000 });
    await page.click('#cash-confirm');
    await wait(800);
    await page.evaluate(() => { const m = document.getElementById('success-modal'); if (m) m.classList.remove('is-open'); });
    await page.waitForSelector('#split-flow-close', { visible: true, timeout: 8000 });
    await page.click('#split-flow-close');
    await wait(300);
    await page.evaluate((id) => openTable(id), OTHER);
    await wait(400);
    await page.evaluate((id) => openTable(id), T);
    await wait(400);
    check(await page.evaluate(() => !document.getElementById('rp-split-card').hidden), 'the classic bill shows the split in progress');
    await page.click('#pay-split').catch(async () => page.evaluate(() => openSplitModal(selectedId)));
    await page.waitForSelector('#split-modal.is-open', { timeout: 8000 });
    check(await page.evaluate(() => splitState.flow && splitState.flow.parts[0].paid && !splitState.flow.parts[1].paid), 'resumed with share 1 paid');
    await page.click('[data-pay-part="1"][data-pay-method="carte"]');
    await page.waitForFunction(() => typeof triggerCardSuccess === 'function', { timeout: 4000 });
    await page.evaluate(() => triggerCardSuccess({}));
    await wait(800);
    const sales = await splitSales(page);
    check(sales.length === 2 && sales.reduce((a, s) => a + s.cents, 0) === 53000, 'two shares summing to 530,00', JSON.stringify(sales));
    check(await page.evaluate((id) => !tableSplits.has(id), T), 'the split is cleared');
    check(errors.length === 0, 'no page error', errors.join(' | '));
  });
} finally {
  await browser.close();
  server.close();
}
console.log(`split-bill-browser-test · ${checks} checks`);
