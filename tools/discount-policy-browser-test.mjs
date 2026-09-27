#!/usr/bin/env node
// #93: click the owner setting, then click both retail product sheets.
// All pages are synthetic loopback fixtures; no merchant data is written.
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
assert.ok(executablePath, 'Chromium required for discount policy UI proof');
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('fixture timeout ' + errors)), 15000);
    fixture.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (match) { clearTimeout(timer); resolve(JSON.parse(match[1]).base); }
    });
    fixture.stderr.on('data', chunk => { errors += chunk; });
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${errors}`)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(base + '/nav-stability.html', { waitUntil: 'load' });
  await page.click('[data-explore]');
  await page.click('[data-kiwi-skip]');
  await page.click('[data-action=profile-menu]');
  await page.click('[role=menuitem][data-idx="2"]');
  await page.click('[data-action=settings-discounts]');
  for (const n of [10, 15, 20]) await page.click(`[data-discount-remove="${n}"]`);
  await page.click('[data-discount-save]');
  await page.waitForFunction(() => window.KiwiDiscountPolicy?.percentages().join(',') === '5');
  await page.waitForFunction(() => !document.querySelector('[data-action=settings-discounts]')?.innerText.includes('10 %'));
  assert.match(await page.$eval('[data-action=settings-discounts]', e => e.innerText), /5 %/);
  assert.doesNotMatch(await page.$eval('[data-action=settings-discounts]', e => e.innerText), /10 %/);
  await page.close();

  for (const [kind, key, product] of [
    ['maison', 'vogueHome', 'prod_2'], ['boutique', 'maisonMansour', 'prod_2'],
  ]) {
    const till = await browser.newPage();
    await till.setViewport({ width: 1440, height: 900 });
    const pageErrors = [];
    till.on('pageerror', error => pageErrors.push(String(error)));
    await till.goto(base + `/${kind}.html`, { waitUntil: 'load' });
    // Give the isolated fixture's catalogue identity the same owner setting.
    await till.evaluate(id => window.KiwiDiscountPolicy.save([5], id), key);
    await till.click(`[data-${kind === 'maison' ? 'mz' : 'bq'}-item="${product}"]`);
    const chips = await till.$$eval(`[data-${kind === 'maison' ? 'mz' : 'bq'}-rem]`, nodes =>
      nodes.filter(node => node.getClientRects().length).map(node => node.innerText.trim()));
    assert.deepEqual(chips, ['Sans', '−5 %'], `${kind} presents only the approved 5%`);
    assert.deepEqual(pageErrors, [], `${kind} product sheet has no script errors`);
    await till.close();
  }
  console.log('✓ discount policy browser: owner setting and both retail product sheets');
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
