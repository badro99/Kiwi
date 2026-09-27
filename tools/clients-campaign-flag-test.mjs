#!/usr/bin/env node
// Render the actual Clients directory in a loopback-only synthetic merchant.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(fs.existsSync(executablePath), 'Chrome required for rendered Clients regression');
const child = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
const origin = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('fixture did not start')), 20000);
  child.stdout.on('data', chunk => {
    output += chunk.toString();
    const match = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
    if (match) { clearTimeout(timer); resolve(JSON.parse(match[1]).base); }
  });
  child.on('exit', code => { clearTimeout(timer); reject(new Error('fixture exited ' + code)); });
});
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage();
    await page.goto(origin + '/clients.html', { waitUntil: 'load' });
    if (enabled) await page.evaluate(() => { window.KiwiConfig = { features: { ultraCampaigns: true } }; });
    await page.click('[data-open-clients]');
    await page.waitForSelector('#cd-loyalty');
    const result = await page.evaluate(() => ({ campaign: !!document.querySelector('#cd-campaign'), loyalty: !!document.querySelector('#cd-loyalty') }));
    assert.equal(result.campaign, enabled, `campaign ${enabled ? 'only with explicit Ultra flag' : 'hidden by default'}`); checks++;
    assert.equal(result.loyalty, true, 'loyalty remains accessible'); checks++;
    await page.close();
  }
} finally { await browser.close(); child.kill('SIGTERM'); }
console.log(`✓ ${checks} rendered Clients campaign flag checks`);
