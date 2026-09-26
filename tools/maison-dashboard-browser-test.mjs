#!/usr/bin/env node
/* Real dashboard regression for a Maison merchant. It starts from the same
 * restaurant demo markup as production and proves the venue/date renderers
 * replace every visible restaurant claim with honest Maison empty states. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(require.resolve('puppeteer-core', {
    paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)],
  }));
} catch {
  console.log('○ skip: puppeteer-core unavailable (Maison dashboard assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));
if (!executablePath) {
  console.log('○ skip: Chromium unavailable (Maison dashboard assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let liveCredit = {
  code: 'AV-AMIRA-001', customerId: 'client-amira-1', customerName: 'Cliente Amira',
  originalRef: 'Ticket 2042', originalSaleId: 'sale-amira-2042', amountCents: 12000,
  balanceCents: 12000, status: 'active', reason: 'Retour', issuedBy: 'Amira',
  createdAt: Date.now() - 86400000, expiresAt: Date.now() + 90 * 86400000,
  events: [{ action: 'issue', actor: 'Amira', lines: [{ qty: 1, name: 'Vase Atlas' }] }],
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (process.env.KIWI_TEST_DEBUG && pathname === '/api/store-credits') console.log('store-credit request', req.method, req.url);
  // A newly installed worker intentionally reloads a young production tab.
  // This test owns first paint, so keep the run on one document.
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('disabled in browser regression'); return; }
  if (pathname === '/api/store-credits' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ credits: [liveCredit] }));
    return;
  }
  if (pathname === '/api/store-credits' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const input = JSON.parse(body || '{}');
      if (input.action === 'adjust') {
        liveCredit = { ...liveCredit, balanceCents: liveCredit.balanceCents + Number(input.deltaCents || 0), events: liveCredit.events.concat({ action: 'adjust', deltaCents: Number(input.deltaCents || 0), reason: input.reason, actor: 'Amira' }) };
      } else if (input.action === 'cancel') {
        liveCredit = { ...liveCredit, balanceCents: 0, status: 'cancelled', events: liveCredit.events.concat({ action: 'cancel', reason: input.reason, actor: 'Amira' }) };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ credit: liveCredit }));
    });
    return;
  }
  if (pathname === '/api/z-reconciliation' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rows: [{ business_day: '2026-09-21',
      reported_cents: 150700, server_cents: 31400, missing_count: 9, status: 'mismatch' }],
      conflicts: [], daySummary: { day: new URL(req.url,'http://localhost').searchParams.get('day'),
        source:'closed-z',referenceCents:150700,reportedCents:150700,recordedCents:31400,gapCents:119300,
        missingCount:9,waitingCount:9,blocked:[],comparisonAvailable:true } }));
    return;
  }
  if (pathname.startsWith('/api/')) {
    res.writeHead(pathname === '/api/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(pathname === '/api/me' ? '{"authenticated":false}' : '{"error":"not-found"}');
    return;
  }
  const rel = pathname === '/' ? 'dashboard.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('✓ ' + label); };
try {
  const page = await browser.newPage();
  const click = async (selector) => {
    const found = await page.evaluate((query) => {
      const element = document.querySelector(query);
      if (!element) return false;
      element.click();
      return true;
    }, selector);
    assert.ok(found, `missing UI control: ${selector}`);
  };
  const waitForStable = async (selector) => {
    await page.waitForSelector(selector);
    await page.evaluate((query) => new Promise((resolve, reject) => {
      const node = document.querySelector(query);
      if (!node) return reject(new Error('missing stable UI: ' + query));
      let quiet;
      const observer = new MutationObserver(() => {
        clearTimeout(quiet);
        quiet = setTimeout(done, 300);
      });
      function done() { observer.disconnect(); resolve(); }
      observer.observe(node, { childList: true, subtree: true, characterData: true });
      quiet = setTimeout(done, 300);
    }), selector);
  };
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (process.env.KIWI_TEST_DEBUG) {
    page.on('response', (response) => { if (response.url().includes('/api/store-credits')) console.log('store-credit response', response.status(), response.url()); });
    page.on('requestfailed', (request) => { if (request.url().includes('/api/store-credits')) console.log('store-credit failed', request.failure()?.errorText || '', request.url()); });
  }
  await page.evaluateOnNewDocument(() => {
    const venue = {
      id: 'v-art-de-table-by-amira', name: 'art de table by amira', fullDisplay: 'art de table by amira',
      slug: 'art-de-table-by-amira', location: '', type: 'boutique', subtype: 'maison', custom: true,
      siblings: '', status: 'En service', ice: '·', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0,
    };
    localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
    localStorage.setItem('kiwiVenue', venue.id);
    localStorage.setItem('kiwiOnboarded', '1');
  });
  await page.goto(`http://localhost:${server.address().port}/dashboard.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.KiwiVenue?.getCurrentVenueData?.()?.subtype === 'maison');
  ok(!await page.$('#kiwi-z-reconciliation-alert'), 'closed-Z finances stay hidden before the dashboard PIN unlock');
  await page.evaluate(() => window.__kiwiLock.hide());
  await page.waitForFunction(() => /maison/i.test(document.querySelector('[data-hai-input]')?.placeholder || ''));
  await page.waitForFunction(() => document.querySelector('[data-bench-card]')?.classList.contains('is-empty-state'));
  await page.waitForFunction(() => /1.?193,00 MAD/.test(document.querySelector('#kiwi-z-reconciliation-alert')?.textContent || ''));
  ok(!!await page.$('#kiwi-z-reconciliation-alert'), 'Amira dashboard renders the synthetic closed-Z mismatch from the real UI module');
  // Wait for the actual affected content to settle, not a fixed wall-clock
  // delay that races a slow tab under the full check.js load.
  await Promise.all(['[data-hai-input]', '[data-bench-card]', '[data-hero-amount]'].map(waitForStable));

  const state = await page.evaluate(() => ({
    venue: window.KiwiVenue.getCurrentVenueData(),
    placeholder: document.querySelector('[data-hai-input]')?.placeholder || '',
    chips: [...document.querySelectorAll('.hai-chips .hai-chip')].map((el) => el.textContent.trim()),
    hero: document.querySelector('[data-hero-amount]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    bench: document.querySelector('[data-bench-card]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    nav: document.querySelector('[data-vertical-section]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    vocab: window.KiwiVenue.getVocab?.('askPlaceholder') || '',
    benchEmpty: document.querySelector('[data-bench-card]')?.classList.contains('is-empty-state'),
  }));
  if (process.env.KIWI_TEST_DEBUG) console.log(JSON.stringify({ state, errors }, null, 2));
  ok(state.venue.slug === 'art-de-table-by-amira' && state.venue.subtype === 'maison', 'dashboard keeps the Maison store identity and subtype');
  ok(/maison/i.test(state.placeholder) && !/restaurant/i.test(state.placeholder), 'AI question bar uses Maison vocabulary');
  ok(state.chips.length === 3 && state.chips.some((text) => /article/i.test(text)) && state.chips.every((text) => !/plat|carte/i.test(text)), 'AI starter questions describe retail sales, never restaurant dishes');
  ok(/^1.?507[,.]00\s*MAD$/i.test(state.hero), 'Maison day headline renders the explicitly labelled till Z reference, not demo revenue');
  ok(await page.$eval('[data-hero-label]',el=>el.textContent.includes('RAPPORT Z')), 'Z reference is not labelled recorded revenue');
  ok(await page.evaluate(()=>!(window.KiwiSales.list(window.KiwiVenue.getVenue())||[]).length), 'Z reference has not fabricated local receipt rows');
  ok(!/147|caf[ée]s|Café Atlas/i.test(state.bench), 'peer card contains no invented café cohort or Café Atlas data');
  ok(state.benchEmpty, 'real Maison benchmark renders an explicit empty state');
  ok(/Pièces|Rayons|Offres|Retours|vendues/i.test(state.nav) && !/Carte du restaurant|Cuisine/i.test(state.nav), 'sidebar exposes Maison operations');

  const seeded = await page.evaluate(() => {
    const cat = window.KiwiBoutiqueCatalog;
    cat.use(window.KiwiBoutiqueVenueKey());
    const supplier = window.KiwiProcurement.addSupplier({ name: 'Atelier Amira', phone: '0600000000', categories: 'Décoration', leadDays: 3 });
    const category = cat.addCategory('Décoration', 'atlas');
    const product = cat.addProduct({ name: 'Vase Atlas', categoryId: category.id, priceMAD: 240, cost: 80, supplierId: supplier.id, parLevel: 10, reorderLevel: 3 });
    const variant = cat.addVariant({ productId: product.id, colorId: 'blanc', size: 'TU', stock: 7 });
    window.KiwiProcurement.receiveDirect({ supplierId: supplier.id, externalRef: 'BL-AMIRA-7', receivedBy: 'Amira', skipMovements: true, lines: [{ itemId: product.id, variantId: variant.id, name: product.name, qty: 2, unit: 'pièce', unitCost: 80 }] });
    return { productId: product.id, supplierId: supplier.id };
  });
  ok(!!seeded.productId && !!seeded.supplierId, 'Amira retail catalogue and supplier fixture are stored through production APIs');

  await click('[data-vertical-section] a[data-nav="stock"]');
  await page.waitForSelector('body.page-stock [data-stock-root] .st-title');
  const stockOverview = await page.$eval('[data-stock-root]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  if (process.env.KIWI_TEST_DEBUG) console.log(JSON.stringify({ stockOverview }, null, 2));
  ok(/1 articles suivis/i.test(stockOverview) && /560 MAD/.test(stockOverview) && /160 MAD/.test(stockOverview) && !/Tomates|Boucherie|Marché Central/i.test(stockOverview), 'supplier workspace computes Amira retail stock and purchasing totals without restaurant fixtures');
  await click('[data-action="stock-tab"][data-tab="items"]');
  await page.waitForFunction(() => /Vase Atlas/.test(document.querySelector('.st-tab-body')?.textContent || ''));
  const itemProjection = await page.evaluate((productId) => {
    const row = window.KiwiStockOperatingDay.catalogue().find((item) => item.id === productId);
    return row && { name: row.name, stock: row.currentStock, supplierId: row.supplierId };
  }, seeded.productId);
  if (process.env.KIWI_TEST_DEBUG) console.log(JSON.stringify({ itemProjection, seeded }, null, 2));
  ok(itemProjection?.name === 'Vase Atlas' && itemProjection.stock === 7 && itemProjection.supplierId === seeded.supplierId, 'stock page projects the exact shared product, stock and supplier link');
  await click('[data-action="stock-tab"][data-tab="suppliers"]');
  await page.waitForFunction(() => /Atelier Amira/.test(document.querySelector('.st-tab-body')?.textContent || ''));
  const supplierText = await page.$eval('.st-tab-body', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  ok(/Atelier Amira/.test(supplierText) && !/Boucherie|Marché Central/i.test(supplierText), 'supplier tab uses the current Maison procurement register');
  await click('[data-action="stock-tab"][data-tab="orders"]');
  await page.waitForFunction(() => /BL-AMIRA-7|Atelier Amira|réception/i.test(document.querySelector('.st-tab-body')?.textContent || ''));
  const orderText = await page.$eval('.st-tab-body', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  ok(/BL-AMIRA-7|Atelier Amira|réception/i.test(orderText) && !/Boucherie|Marché Central/i.test(orderText), 'purchasing tab shows the Maison receipt instead of restaurant orders');

  await page.evaluate(() => window.Kiwi.handlers['nav-stock-movements']());
  await page.waitForSelector('.dash-genpage .mzs-filters');
  const movementFilters = await page.evaluate(() => ({
    selected: document.querySelector('[data-mz="days"]')?.value,
    labels: [...document.querySelectorAll('.mzs-filters select')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
    keys: [...document.querySelectorAll('.mzs-filters [data-mz]')].map((el) => el.getAttribute('data-mz')),
  }));
  ok(movementFilters.selected === '0' && movementFilters.labels[0]?.startsWith('Tout'), 'movement history opens on Tout');
  ok(!movementFilters.keys.includes('actor') && !movementFilters.keys.includes('supplier'), 'movement UI has no redundant employee or supplier filters');

  await page.evaluate(() => window.Kiwi.handlers['nav-returns']());
  if (process.env.KIWI_TEST_DEBUG) {
    await page.waitForSelector('[data-credit-register]');
    const returnsDebug = await page.evaluate(async () => ({
      custom: window.KiwiVenue?.isCustom?.(), venue: window.KiwiVenue?.getVenue?.(),
      page: document.querySelector('.dash-genpage')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 800) || '',
      register: document.querySelector('[data-credit-register]')?.textContent.replace(/\s+/g, ' ').trim() || '',
      direct: await fetch('/api/store-credits?merchant=art-de-table-by-amira').then((r) => r.json()),
    }));
    console.log(JSON.stringify({ returnsDebug, errors }, null, 2));
  }
  await page.waitForFunction(() => /AV-AMIRA-001/.test(document.querySelector('[data-credit-register]')?.textContent || ''));
  // The live returns document may repaint once after the credit API. Observe
  // the actual register rather than unrelated network traffic or a fixed wait.
  await waitForStable('[data-credit-register]');
  let creditText = await page.$eval('[data-credit-register]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  ok(/AV-AMIRA-001/.test(creditText) && /Cliente Amira/.test(creditText) && /Ticket 2042/.test(creditText) && /Vase Atlas/.test(creditText), 'owner credit register shows code, customer, original ticket and returned product');
  await page.type('#ret-credit-search', '2042');
  ok(await page.$eval('[data-credit-row]', (el) => !el.hidden), 'credit register searches by original ticket');
  await click('[data-action="credit-adjust"]');
  const confirmSelector = '.kiwi-backdrop [data-action="credit-adjust-confirm"]';
  await page.waitForSelector(confirmSelector, { visible: true });
  // Fill the open dialog atomically. Slow per-keystroke typing can race the
  // returns page's async repaint and leave the submit handler an empty input.
  await page.evaluate(() => {
    const root = document.querySelector('.kiwi-backdrop');
    const delta = root.querySelector('[data-credit-delta]');
    const reason = root.querySelector('[data-credit-reason]');
    delta.value = '-25';
    reason.value = 'Correction vérifiée Amira';
    delta.dispatchEvent(new Event('input', { bubbles: true }));
    reason.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const correctionResponse = page.waitForResponse((response) => response.url().includes('/api/store-credits')
    && response.request().method() === 'POST', { timeout: 15000 });
  await click(confirmSelector);
  ok((await correctionResponse).ok(), 'owner correction is submitted through the rendered confirmation control');
  await page.waitForFunction(() => /95(?:[,.]00)?\s*MAD/i.test(document.querySelector('[data-credit-register]')?.textContent || ''));
  const remoteCredit = await page.evaluate(() => fetch('/api/store-credits?merchant=art-de-table-by-amira')
    .then(response => response.json()).then(data => data.credits?.[0]?.balanceCents));
  ok(remoteCredit === 9500, 'owner correction persisted the new balance in the server API');
  creditText = await page.$eval('[data-credit-register]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  ok(/95(?:[,.]00)?\s*MAD/i.test(creditText), 'owner correction updates the rendered credit balance');

  ok(errors.length === 0, 'Maison dashboard renders without uncaught browser errors: ' + errors.join(' | '));
  console.log(`\n✓ ${checks} rendered Maison dashboard checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
