#!/usr/bin/env node
// Browser regression for the real shared rail. Native screenshots separately
// prove the short iPhone landscape failure and its rebuilt-app after state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(root, 'app'), root] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required for the rail layout regression');
const fixture = spawn(process.execPath, [path.join(root, 'tools/retail-ui-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-rail-layout-'));
const failures = [];
let browser, checks = 0;
const check = (value, label) => { checks++; if (!value) { failures.push(label); console.error('✗ ' + label); } };
try {
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Retail fixture did not start')), 15000);
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error('Retail fixture exited: ' + code)); });
    fixture.stdout.on('data', chunk => {
      output += chunk;
      const ready = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (ready) { clearTimeout(timer); resolve(JSON.parse(ready[1]).base); }
    });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const vertical of ['boutique', 'maison']) {
    for (const [name, width, height, native] of [['se-portrait',375,667,true], ['se-landscape',667,375,true], ['pro-landscape',874,402,true], ['desktop',1280,860,false]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: native, hasTouch: true });
      await page.goto(base + '/' + vertical + '.html', { waitUntil: 'networkidle0' });
      await page.addStyleTag({ path: path.join(root, 'assets/pos-mobile.css') });
      await page.addStyleTag({ path: path.join(root, 'app/src/native-runtime.css') });
      await page.evaluate(native => {
        document.documentElement.classList.toggle('kiwi-native', native);
        document.documentElement.style.setProperty('--kiwi-host-safe-top', '0px');
        document.documentElement.style.setProperty('--kiwi-host-safe-bottom', '0px');
      }, native);
      await page.addScriptTag({ path: path.join(root, 'assets/pos-mobile.js') });
      await page.waitForSelector('.vx-burger');
      for (const dir of ['ltr', 'rtl']) {
        await page.evaluate(dir => {
          document.documentElement.dir = dir;
          document.documentElement.classList.toggle('kiwi-rtl', dir === 'rtl');
        }, dir);
        const burgerVisible = await page.$eval('.vx-burger', el => getComputedStyle(el).display !== 'none');
        check(burgerVisible === native, `${vertical} ${name} ${dir}: phone drawer only on handheld layouts`);
        if (native) {
          const open = await page.$eval('.vx-root', el => el.classList.contains('vx-nav-open'));
          if (!open) await page.click('.vx-burger');
        }
        await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
        await page.$eval('.kiwi-dna-rail', el => { el.scrollTop = 0; });
        const layout = await page.evaluate(() => {
          const rect = s => { const {top,bottom,left,right,width,height} = document.querySelector(s).getBoundingClientRect(); return {top,bottom,left,right,width,height}; };
          return { rail: rect('.kiwi-dna-rail'), venue: rect('.kiwi-dna-venue'), clock: rect('.kiwi-dna-clock'), label: rect('.kiwi-dna-nav-label'), brand: rect('.kiwi-dna-brand') };
        });
        const label = `${vertical} ${name} ${dir}`;
        check(layout.clock.bottom <= layout.venue.bottom - 8, label + ': clock stays INSIDE its venue card ' + JSON.stringify(layout));
        check(layout.label.top >= layout.venue.bottom + 8, label + ': section label cannot overlap the card/clock');
        check(layout.venue.top >= layout.brand.bottom + 8, label + ': card cannot overlap the logo');
        check(layout.rail.width >= 200 && layout.rail.width <= 250, label + ': rail keeps its intended compact width');
        await page.screenshot({ path: path.join(shots, vertical + '-' + name + '-' + dir + '.png'), captureBeyondViewport: false });
        const reachable = await page.$eval('.kiwi-dna-nav > button:last-child', el => {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          return { top:r.top, bottom:r.bottom, height:r.height, viewport:innerHeight };
        });
        check(reachable.top >= 0 && reachable.bottom <= height + 1 && reachable.height >= 36, label + ': final destination remains scroll-reachable');
      }
    }
  }
  if (failures.length) throw new Error(`${failures.length}/${checks} rail layout regressions failed; screenshots: ${shots}`);
  console.log(`caisse-rail-layout-browser-test: ${checks} checks passed; screenshots: ${shots}`);
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
