#!/usr/bin/env node
// #81: a real till click must restore the sold variant and leave a readable
// sale/return movement pair linked by the printed ticket, in both retail tills.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium is required for the stock-return UI regression');
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
async function button(page, label) {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')]
    .find(el => el.getClientRects().length && el.innerText.includes(text)), label);
  const el = handle.asElement();
  assert.ok(el, `Visible button ${label} missing`);
  await el.click();
  await handle.dispose();
}
async function snapshot(page) {
  return page.evaluate(() => ({
    stock: window.KiwiBoutiqueCatalog._doc().variants.reduce((sum, v) => sum + (+v.stock || 0), 0),
    rows: window.KiwiMaisonStock.list(),
  }));
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
  let checks = 0;
  for (const kind of ['maison', 'boutique']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', req => (req.url().startsWith(base + '/') || req.url().startsWith('data:') ? req.continue() : req.abort()).catch(() => {}));
    await page.goto(`${base}/${kind}-stock.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__fixtureLiveStock === true);
    const before = await snapshot(page);
    await button(page, 'Encaisser ·');
    await button(page, 'Espèces');
    await button(page, 'Confirmer');
    await page.waitForFunction(n => window.KiwiMaisonStock.list().length > n, {}, before.rows.length);
    const sold = await snapshot(page);
    assert.ok(sold.stock < before.stock, `${kind}: sale reduces real catalogue stock`); checks++;
    assert.ok(sold.rows.some(r => r.type === 'vente'), `${kind}: sale has a movement`); checks++;
    await button(page, 'Échanges & avoirs');
    await button(page, kind === 'maison' ? 'Service 18 pièces Fès' : 'Caftan Fassi');
    await button(page, 'Émettre un avoir');
    await page.waitForFunction(n => window.KiwiMaisonStock.list().length > n, {}, sold.rows.length);
    const returned = await snapshot(page);
    assert.equal(returned.stock, sold.stock + 1, `${kind}: one returned piece restores stock`); checks++;
    const sale = returned.rows.find(r => r.type === 'vente');
    const ret = returned.rows.find(r => r.type === 'retour-client');
    assert.ok(ret, `${kind}: visible journal has a retour client movement`); checks++;
    assert.equal(ret.ref, sale.ref, `${kind}: return and sale have same ticket reference`); checks++;
    assert.match(ret.ref, /^\d+$/, `${kind}: reference is printed ticket number`); checks++;
    await button(page, 'Terminer');
    if (kind === 'maison') {
      await button(page, 'Mouvements de stock');
      await page.waitForFunction(() => document.querySelector('.mzm-view')?.getClientRects().length, { timeout: 5000 });
      const movementText = await page.evaluate(() => document.querySelector('.mzm-view')?.innerText || '');
      assert.ok(movementText.includes('Retour client') && movementText.includes(ret.ref),
        `Maison stock movement screen shows the return and ticket: retour=${movementText.includes('Retour client')} ref=${movementText.includes(ret.ref)} excerpt=${movementText.slice(0, 800)}`); checks++;
    } else {
      await button(page, 'Inventaire');
      const product = await page.evaluateHandle(() => [...document.querySelectorAll('[data-inv-open]')]
        .find(el => el.innerText.includes('Caftan Fassi')));
      assert.ok(product.asElement(), 'Boutique returned product is visible in inventory');
      await product.asElement().click(); await product.dispose();
      assert.ok(await page.evaluate(ref => document.querySelector('.bqi-movements')?.innerText.includes('Retour client')
        && document.querySelector('.bqi-movements')?.innerText.includes(`Ticket ${ref}`), ret.ref),
      'Boutique product detail shows return movement and ticket'); checks++;
      await page.evaluate(() => document.querySelector('.bqi-movements').scrollIntoView({ block: 'center' }));
    }
    if (process.env.KIWI_PROOF_DIR) {
      fs.mkdirSync(process.env.KIWI_PROOF_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.KIWI_PROOF_DIR, `ticket-81-${kind}.png`), fullPage: true });
    }
    await page.close();
  }
  console.log(`✓ retail stock returns: ${checks} real-click assertions on Maison and Boutique fixtures`);
} finally {
  if (browser) await browser.close();
  fixture.kill();
}
