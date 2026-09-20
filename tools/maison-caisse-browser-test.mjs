#!/usr/bin/env node
/* Browser regression for the real Maison till shell.
 * Loads kiwi-caisse.html, opens the Maison vertical through the production
 * dispatcher, then clicks every rail destination. This catches valid-JS
 * event-handler typos and global CSS leaks that static source checks cannot. */
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
  console.log('○ skip: puppeteer-core unavailable (Maison browser assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p));
if (!executablePath) {
  console.log('○ skip: Chromium unavailable (Maison browser assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};
const misses = [];
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/api/media/media/test/product.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nksAAAAASUVORK5CYII=', 'base64'));
    return;
  }
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/caisse-dna.css">
      <link rel="stylesheet" href="/assets/pos-maison.css">
      <link rel="stylesheet" href="/assets/retail-scan.css">
      <style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0);font-family:Arial,sans-serif}
        button,input{font:inherit} button{border:0} .vx-screen{display:flex} .modal-veil{display:none}.modal-veil.is-open{display:flex}
      </style>
      <script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiPosDispatch={register:s=>window.__maisonSpec=s,lock:()=>{}};</script>
      <script src="/assets/caisse-dna.js"></script>
      <script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
      <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
      <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
      <script src="/assets/boutique-catalog.js"></script><script src="/assets/sold-insights.js"></script><script src="/assets/pos-maison.js"></script>
    </head><body class="is-pos-maison"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-maison"></div>
      <script>window.__maisonSpec.mount(document.getElementById('pos-maison'));window.KiwiCaisseDna.enhance(document.getElementById('pos-maison'),'maison');document.getElementById('pos-maison').insertAdjacentHTML('beforeend','<button class="krs-launch">Scan continu</button>');</script>
    </body></html>`);
    return;
  }
  const rel = pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    misses.push(pathname);
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('✓ ' + label); };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'load' });
  try {
    await page.waitForSelector('#pos-maison.is-on .mz-view.is-on', { visible: true, timeout: 8000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      registered: !!window.__maisonSpec,
      url: location.href,
      body: document.body.className,
      root: document.querySelector('#pos-maison')?.outerHTML.slice(0, 500) || '',
      scripts: [...document.scripts].filter((s) => /pos-maison/.test(s.src)).map((s) => s.src),
      toast: document.querySelector('#toast-stack')?.textContent || '',
    }));
    throw new Error(`Maison did not open: ${JSON.stringify(state)}; missing=${misses.join(',')}; ${errors.join(' | ')}`, { cause: error });
  }

  const shell = await page.evaluate(() => {
    const root = document.querySelector('#pos-maison');
    const rail = root.querySelector('.mz-rail').getBoundingClientRect();
    const panel = root.querySelector('.mz-view.is-on');
    const rect = panel.getBoundingClientRect();
    const head = root.querySelector('.mz-head').getBoundingClientRect();
    const style = getComputedStyle(panel);
    return {
      paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
      panelLeft: rect.left, railRight: rail.right, headTop: head.top,
      panelBottom: rect.bottom, viewportHeight: innerHeight,
    };
  });
  ok(shell.paddingTop === '0px' && shell.paddingBottom === '0px', 'application panels ignore global marketing section padding');
  ok(shell.panelLeft >= shell.railRight && shell.headTop < 80, 'sale content starts beside the rail and at the top of the viewport');
  ok(shell.panelBottom <= shell.viewportHeight + 1, 'active Maison panel fits inside the viewport');
  const primaryLabels = await page.evaluate(() => [...document.querySelectorAll('.kiwi-dna-primary > span')].map((label) => {
    const button = label.parentElement.getBoundingClientRect();
    const text = label.getBoundingClientRect();
    return {
      name: label.textContent.trim(),
      contained: text.left >= button.left - 0.5 && text.right <= button.right + 0.5 && label.scrollWidth <= label.clientWidth + 1,
      textWidth: Math.round(text.width), scrollWidth: label.scrollWidth, buttonWidth: Math.round(button.width),
    };
  }));
  ok(primaryLabels.every((item) => item.contained),
    'every compact Maison primary label stays inside its tile: ' + JSON.stringify(primaryLabels));
  const launcher = await page.evaluate(() => {
    const scan = document.querySelector('.krs-launch').getBoundingClientRect();
    const ticket = document.querySelector('.mz-ticket').getBoundingClientRect();
    return { scanRight: scan.right, ticketLeft: ticket.left, scanBottom: scan.bottom, viewportHeight: innerHeight };
  });
  ok(launcher.scanRight <= launcher.ticketLeft, 'continuous scan launcher does not cover the Maison checkout column');
  ok(launcher.scanBottom <= launcher.viewportHeight, 'continuous scan launcher remains fully visible');

  const views = ['vente', 'mouvements', 'casse', 'scan', 'inventaire', 'fournisseurs', 'echanges', 'vendus', 'clientes'];
  const workspaceFrames = [];
  const artifactDir = process.env.KIWI_TEST_ARTIFACT_DIR || '';
  if (artifactDir) fs.mkdirSync(artifactDir, { recursive: true });
  // Let the real clients-book MutationObserver wire the mounted vertical. The
  // Maison Clients entry must remain owned by this workspace, not be captured
  // by the legacy fixed client-book panel used by other caisse types.
  await new Promise((resolve) => setTimeout(resolve, 220));
  for (const view of views) {
    await page.click(`[data-mz-view="${view}"]`);
    const state = await page.evaluate((name) => ({
      activeNav: document.querySelector(`[data-mz-view="${name}"]`)?.classList.contains('on'),
      activePanel: document.querySelector(`[data-mz-panel="${name}"]`)?.classList.contains('is-on'),
      visiblePanel: document.querySelector('#pos-maison .mz-view.is-on')?.dataset.mzPanel,
    }), view);
    ok(state.activeNav && state.activePanel && state.visiblePanel === view, `rail opens ${view}`);
    const frame = await page.evaluate((name) => {
      const panel = document.querySelector(`[data-mz-panel="${name}"]`);
      const heading = panel?.querySelector('h1');
      const rect = heading?.getBoundingClientRect();
      return {
        view: name,
        left: rect?.left || 0,
        top: rect?.top || 0,
        fontSize: heading ? getComputedStyle(heading).fontSize : '',
        pageShell: name === 'vente' || !!panel?.querySelector('.mz-page, .ksold'),
        overflow: panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : 999,
      };
    }, view);
    workspaceFrames.push(frame);
    if (artifactDir) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      await page.screenshot({ path: path.join(artifactDir, `maison-${view}.png`) });
    }
  }
  ok(!(await page.$('[data-mz-view="clientes"][data-kcb-redirect]'))
    && !(await page.$('#kcb-root:not([style*="display: none"])')),
  'Maison keeps Clients inside the shared workspace instead of opening the legacy fixed panel');
  const headingLefts = workspaceFrames.map((frame) => Math.round(frame.left));
  const headingTops = workspaceFrames.map((frame) => Math.round(frame.top));
  ok(Math.max(...headingLefts) - Math.min(...headingLefts) <= 1,
    'every Maison destination keeps the same title gutter: ' + JSON.stringify(workspaceFrames));
  ok(Math.max(...headingTops) - Math.min(...headingTops) <= 1,
    'every Maison destination keeps the same title baseline: ' + JSON.stringify(workspaceFrames));
  ok(workspaceFrames.every((frame) => frame.fontSize === '24px' && frame.pageShell),
    'every Maison destination uses the shared 24px workspace header and page shell');
  ok(workspaceFrames.every((frame) => frame.overflow <= 1),
    'every Maison destination stays inside the desktop canvas without horizontal overflow');

  const visualSystem = await page.evaluate(() => {
    const inventory = document.querySelector('[data-mz-panel="inventaire"]');
    const page = inventory?.querySelector('.mz-page');
    const button = inventory?.querySelector('.mz-btn');
    const kpis = inventory?.querySelector('.mzi-kpis');
    return {
      pageGap: page ? getComputedStyle(page).gap : '',
      buttonHeight: button ? getComputedStyle(button).minHeight : '',
      buttonRadius: button ? getComputedStyle(button).borderRadius : '',
      kpiRadius: kpis ? getComputedStyle(kpis).borderRadius : '',
    };
  });
  ok(visualSystem.pageGap === '18px' && visualSystem.buttonHeight === '44px'
    && visualSystem.buttonRadius === '12px' && visualSystem.kpiRadius === '16px',
  'shared workspace spacing, controls and KPI surfaces use one design language: ' + JSON.stringify(visualSystem));

  await page.setViewport({ width: 1024, height: 760, deviceScaleFactor: 1 });
  const compactFrames = [];
  for (const view of views) {
    await page.click(`[data-mz-view="${view}"]`);
    compactFrames.push(await page.evaluate((name) => {
      const panel = document.querySelector(`[data-mz-panel="${name}"]`);
      const heading = panel?.querySelector('h1')?.getBoundingClientRect();
      const rail = document.querySelector('#pos-maison .mz-rail')?.getBoundingClientRect();
      return {
        view: name,
        visible: !!heading && heading.left >= (rail?.right || 0) && heading.top >= 0 && heading.right <= innerWidth,
        overflow: panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : 999,
      };
    }, view));
  }
  ok(compactFrames.every((frame) => frame.visible && frame.overflow <= 1),
    'all Maison destinations preserve the shared shell on a 1024px caisse: ' + JSON.stringify(compactFrames));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await page.click('[data-mz-view="mouvements"]');
  ok((await page.$eval('[data-mz-view="mouvements"]', (el) => el.textContent)).includes('Mouvements de stock'),
    'the second Maison tile exposes stock movements');
  ok(!(await page.$('[data-mz-view="registries"]')), 'the gift-list tile is removed from the Maison rail');
  ok((await page.$eval('#mzm-days', (el) => ({ value: el.value, label: el.selectedOptions[0]?.textContent }))).value === '0',
    'stock movement period defaults to the complete history');
  ok((await page.$$('#mzm-days, #mzm-kind, #mzm-category')).length === 3
    && !(await page.$('[data-mzm-actor], [data-mzm-supplier]')),
  'caisse movement history offers date, type and category filters without employee or supplier filters');
  await page.click('#mzm-new');
  ok(!!(await page.$('#mzm-pick-product')) && !!(await page.$('#mzm-pick-variant')),
    'new stock movement opens the exact product and variant picker');
  ok(!(await page.$eval('#mzm-pick-next', (el) => el.disabled)),
    'the movement picker can continue to the existing manager-approved stock flow');
  await page.click('#mzm-pick-next');
  ok(!!(await page.$('#mzm-type')) && !!(await page.$('#mzm-qty')) && !!(await page.$('#mzm-save')),
    'the picker reaches the manual movement form without changing stock');
  await page.click('#mz-invmm [data-inv-x]');

  await page.evaluate(() => { window.KiwiConfig = { ...(window.KiwiConfig || {}), features: { ...((window.KiwiConfig || {}).features || {}), caisseInventoryAdmin: true, depotvente: true } }; });
  await page.click('[data-mz-view="inventaire"]');
  ok(!!(await page.$('#mzi-new')) && !!(await page.$('#mzi-category')), 'God Mode exposes full Maison inventory controls');
  await page.click('#mzi-category');
  ok(await page.$eval('#mz-invmm', (el) => !!el.querySelector('.mzi-cat-create') && !!el.querySelector('.mzi-cat-list')),
    'category management uses a distinct create area and category list');
  await page.type('#mzi-cat-name', 'Catégorie test navigateur');
  await page.focus('#mzi-cat-name');
  await page.keyboard.press('Enter');
  ok((await page.$eval('#mz-invmm', (el) => el.textContent)).includes('Catégorie test navigateur'),
    'category creation works from the keyboard and refreshes the organized list');
  ok(await page.$eval('.mzi-cat-row', (el) => {
    const actions = el.querySelector('.mzi-cat-actions');
    const input = el.querySelector('input');
    return !!actions && !!input && actions.getBoundingClientRect().width > 0 && input.getBoundingClientRect().width > 120;
  }), 'category rows keep editable names and actions visibly separated');
  await page.click('#mz-invmm [data-inv-x]');
  await page.click('#mzi-new');
  await page.type('#mzi-n-name', 'Produit test navigateur');
  await page.type('#mzi-n-price', '125');
  await page.type('#mzi-n-cost', '50');
  await page.type('#mzi-n-stock', '2');
  ok((await page.$$('input[name="mzi-n-ownership"]')).length === 2,
    'God Mode A/B option exposes both ownership choices in caisse product creation');
  await page.click('input[name="mzi-n-ownership"][value="outright"]');
  ok(!!(await page.$('[data-mzi-photo-pick]')) && !!(await page.$('[data-mzi-photo-input]')),
    'caisse product creation offers a real image picker');
  await page.evaluate(() => {
    window.KiwiPlatformOps = window.KiwiPlatformOps || {};
    window.KiwiPlatformOps.uploads = { upload: async () => ({ ok: true, url: '/api/media/media/test/product.png' }) };
    const input = document.querySelector('[data-mzi-photo-input]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['png'], 'product.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => /Photo prête/.test(document.querySelector('[data-mzi-photo-status]')?.textContent || ''));
  await page.click('#mzi-n-save');
  ok((await page.$eval('#mz-invmm', (el) => el.textContent)).includes('Produit test navigateur'), 'God Mode creates a Maison product and opens its inventory card');
  ok(await page.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().some((p) => p.name === 'Produit test navigateur' && p.ownership === 'outright' && p.photo === '/api/media/media/test/product.png')),
    'caisse product creation persists ownership and the uploaded photo in the shared catalogue');
  await page.click('#mz-invmm [data-inv-x]');
  await page.evaluate(() => { window.KiwiConfig.features.caisseInventoryValue = false; });
  await page.click('[data-mz-view="vente"]');
  await page.click('[data-mz-view="inventaire"]');
  ok(!(await page.$eval('[data-mz-panel="inventaire"]', (el) => el.textContent)).includes('Valeur de stock'),
    'God Mode can hide the inventory value from the Maison caisse');
  await page.evaluate(() => { delete window.KiwiConfig.features.caisseInventoryValue; });
  await page.click('[data-mz-view="vente"]');
  await page.click('[data-mz-view="inventaire"]');
  ok((await page.$eval('[data-mz-panel="inventaire"]', (el) => el.textContent)).includes('Valeur de stock'),
    'inventory value stays visible by default when the God Mode key is absent');

  await page.click('[data-mz-view="echanges"]');
  await page.click('.mz-sline:not(.is-locked)');
  await page.click('[data-mz-do-avoir]');
  await page.waitForSelector('#mz-avoir-veil.is-open', { timeout: 3000 });
  ok((await page.$eval('#mz-avoirmm', (el) => el.textContent)).includes('AV-'), 'store-credit action issues and opens a voucher');
  await page.click('#mz-avoirmm [data-mz-close]');
  ok((await page.$eval('[data-mz-panel="echanges"]', (el) => el.textContent)).includes('retournée'), 'issued credit marks the returned line in the sales journal');

  await page.click('[data-mz-view="vendus"]');
  await page.click('[data-ksold-custom]');
  ok(await page.$eval('[data-ksold-mode="day"]', (el) => el.classList.contains('on')), 'Vendus opens the exact-day calendar inside Maison');
  await page.click('[data-ksold-mode="range"]');
  await page.$eval('[data-ksold-from]', (el) => { el.value = '2026-09-10'; });
  await page.$eval('[data-ksold-to]', (el) => { el.value = '2026-09-11'; });
  await page.click('[data-ksold-apply]');
  ok(/10.*11/.test(await page.$eval('[data-ksold-custom]', (el) => el.textContent)), 'Vendus applies a custom period inside the real Maison panel');
  ok(errors.length === 0, 'all Maison navigation clicks complete without a browser error: ' + errors.join(' | ') + '; missing=' + misses.join(','));
  console.log(`\n✓ ${checks} rendered Maison caisse checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
