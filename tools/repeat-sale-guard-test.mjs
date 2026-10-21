#!/usr/bin/env node
// The same basket charged twice in a row. Seen in production on 21 October:
// Santos Store rang an identical ticket again within a minute, on consecutive
// ticket numbers (one was voided later, a 500 MAD Trench never was). The till
// now asks before charging the same basket again within two minutes.
// Part 1 drives assets/repeat-sale-guard.js in a vm; part 2 clicks through the
// real boutique till on the synthetic retail fixture (no merchant data).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const plain = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const eq = (a, b, m) => { assert.deepEqual(plain(a), b, m); checks++; };

/* ── 1 · the guard on its own ───────────────────────────────────────────── */
{
  const store = new Map();
  const win = { localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
  const ctx = vm.createContext({ window: win, Date, Math, JSON, Object, String, Array, Promise });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/repeat-sale-guard.js'), 'utf8'), ctx);
  const G = win.KiwiRepeatSale;
  const trench = [{ pid: 'prod_147', size: 'TU', color: 'multi', qty: 1, unit: 500 }];
  const a = G.signature(trench, 500);
  ok(a, 'a basket has a signature');
  eq(G.signature([...trench].reverse(), 500), a, 'line order does not change it');
  ok(G.signature([{ ...trench[0], qty: 2 }], 1000) !== a, 'quantity changes it');
  ok(G.signature([{ ...trench[0], size: 'M' }], 500) !== a, 'size changes it');
  ok(G.signature(trench, 450) !== a, 'total (a discount) changes it');
  eq(G.signature([], 0), '', 'an empty basket has none');
  const t0 = 1_800_000_000_000;
  eq(G.recent('boutique', a, t0), null, 'nothing charged yet');
  G.remember('boutique', a, '11209', t0);
  eq(G.recent('boutique', a, t0 + 51_000), { num: '11209', agoSec: 51 }, '51 s later the same basket is flagged');
  eq(G.recent('boutique', G.signature([{ ...trench[0], pid: 'prod_9' }], 500), t0 + 51_000), null, 'another basket is not');
  eq(G.recent('maison', a, t0 + 51_000), null, 'another till is not');
  eq(G.recent('boutique', a, t0 + 120_000), null, 'after two minutes it is not');
  eq(G.recent('boutique', a, t0 - 5_000), null, 'a clock moved backwards is not');
  {
    const log = [];
    const o = (sig) => ({ scope: 'boutique', sig, el: null, busy: b => log.push('busy:' + b), go: () => { log.push('go'); } });
    eq(G.confirmRepeat(o(G.signature([{ pid: 'x', qty: 1, unit: 1 }], 1))), false, 'confirmRepeat: a new basket goes straight on');
    eq(log, [], 'and touches nothing');
    G.remember('boutique', a, '11209', Date.now());
    eq(G.confirmRepeat(o(a)), true, 'confirmRepeat: the same basket stops the till');
    await new Promise(r => setTimeout(r, 0));
    eq(log, ['busy:true', 'go'], 'it holds the till busy, then opens payment once confirmed');
    G.remember('boutique', a, '11209', t0);
  }
  store.clear();
  eq(G.recent('boutique', a, t0 + 10_000), { num: '11209', agoSec: 10 }, 'storage blocked: memory still remembers');
}

/* ── 2 · the boutique till, real clicks ────────────────────────────────── */
const require = createRequire(import.meta.url);
let puppeteer = null;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] })); } catch (_) {}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
if (!puppeteer || !executablePath || process.env.KIWI_REPEAT_UNIT_ONLY) {
  console.log(`✓ repeat-sale guard: ${checks} checks (browser part skipped)`);
  process.exit(0);
}
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
async function button(page, label) {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')]
    .find(el => el.getClientRects().length && !el.disabled && el.innerText.includes(text)), label);
  const el = handle.asElement();
  assert.ok(el, `Visible button ${label} missing`);
  await el.click();
  await handle.dispose();
}
const visible = (page, text) => page.evaluate(t => [...document.querySelectorAll('.modal-veil.is-open')]
  .some(v => v.innerText.includes(t)), text);
const last = page => page.evaluate(() => JSON.parse(localStorage.getItem('kiwi:lastCharge:boutique') || '{}').num || '');
// The pay window closes once the sale is recorded; a new ticket number is the proof.
async function settled(page, prev = '') {
  await page.waitForFunction(p => {
    const n = JSON.parse(localStorage.getItem('kiwi:lastCharge:boutique') || '{}').num || '';
    return n && n !== p && !document.querySelector('.modal-veil.is-open');
  }, { timeout: 8000 }, prev);
}
async function ring(page, pid) {
  await page.click(`[data-bq-item="${pid}"]`);
  await page.waitForSelector('#bq-sheet-add:not([disabled])', { visible: true, timeout: 5000 });
  await page.click('#bq-sheet-add');
}
try {
  const base = await new Promise((resolve, reject) => {
    let out = '', errors = '';
    const timer = setTimeout(() => reject(new Error('retail fixture did not start: ' + errors)), 15000);
    fixture.stdout.on('data', chunk => { out += chunk; const m = out.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/); if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).base); } });
    fixture.stderr.on('data', chunk => { errors += chunk; });
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error(`retail fixture exited ${code}: ${errors}`)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request', req => (req.url().startsWith(base + '/') || req.url().startsWith('data:') ? req.continue() : req.abort()).catch(() => {}));
  await page.goto(`${base}/boutique.html`, { waitUntil: 'load' });
  await page.evaluate(() => { try { Object.keys(localStorage).filter(k => k.startsWith('kiwi:lastCharge:')).forEach(k => localStorage.removeItem(k)); } catch (_) {} });
  const pid = await page.$eval('[data-bq-item]:not(.is-out)', el => el.dataset.bqItem);

  // Whatever the fixture seeded is charged first, so the next sale starts clean.
  if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.getClientRects().length && b.innerText.includes('Encaisser ·')))) {
    await button(page, 'Encaisser ·');
    if (await visible(page, 'Même panier')) await button(page, 'Encaisser à nouveau');
    await button(page, 'Espèces'); await button(page, 'Confirmer');
    await settled(page);
  }

  // Sale 1: one piece, cash.
  await ring(page, pid);
  await button(page, 'Encaisser ·');
  ok(!(await visible(page, 'Même panier')), 'a first sale is not questioned');
  const before = await last(page);
  await button(page, 'Espèces'); await button(page, 'Confirmer');
  await settled(page, before);
  const firstRef = await page.evaluate(() => JSON.parse(localStorage.getItem('kiwi:lastCharge:boutique') || '{}').num || '');
  ok(firstRef, 'the till remembers the ticket it just charged');

  // Same piece again: the till asks, and "Ne pas encaisser" charges nothing.
  await ring(page, pid);
  await button(page, 'Encaisser ·');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal-veil.is-open')].some(v => v.innerText.includes('Même panier')), { timeout: 5000 });
  const sheet = await page.evaluate(() => [...document.querySelectorAll('.modal-veil.is-open')].map(v => v.innerText).join(' '));
  ok(sheet.includes(`Ticket ${firstRef}`), `the question names the earlier ticket (${firstRef})`);
  ok(/il y a \d+ s/.test(sheet), 'and how long ago');
  ok(!sheet.includes('Espèces'), 'no payment method is offered before the cashier answers');
  await button(page, 'Ne pas encaisser');
  ok(!(await page.evaluate(() => document.querySelector('.modal-veil.is-open'))), 'the window closes');
  ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.getClientRects().length && b.innerText.includes('Encaisser ·'))), 'the basket stays on the ticket');
  const stillFirst = await page.evaluate(() => JSON.parse(localStorage.getItem('kiwi:lastCharge:boutique') || '{}').num);
  eq(stillFirst, firstRef, 'nothing new was charged');

  // A second customer for the same piece: one more tap, then the usual payment.
  await button(page, 'Encaisser ·');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal-veil.is-open')].some(v => v.innerText.includes('Même panier')), { timeout: 5000 });
  await button(page, 'Encaisser à nouveau');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal-veil.is-open button')].some(b => b.innerText.includes('Espèces')), { timeout: 5000 });
  await button(page, 'Espèces'); await button(page, 'Confirmer');
  await settled(page, firstRef);
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('kiwi:lastCharge:boutique') || '{}').num);
  ok(second && second !== firstRef, `the second sale gets its own ticket (${firstRef} then ${second})`);
  eq(errors, [], 'no script errors');
  await page.close();
  console.log(`✓ repeat-sale guard: ${checks} checks, guard unit and boutique till real clicks`);
} finally {
  if (browser) await browser.close();
  fixture.kill();
}
