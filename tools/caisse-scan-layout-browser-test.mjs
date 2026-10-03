#!/usr/bin/env node
// #0157: real scanner markup at full and keyboard-reduced phone heights.
// Resizing Chromium is a layout guard, not native keyboard acceptance.
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
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(root, 'tools/retail-ui-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-scan-layout-'));
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
  for (const [device, width, heights] of [['se', 375, [667, 407]], ['pro', 402, [874, 520]]]) {
    for (const lang of ['fr', 'en', 'ar']) for (const theme of ['light', 'dark']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const errors = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
      await page.setViewport({ width, height: heights[0], isMobile: true, hasTouch: true });
      await page.goto(base + '/boutique.html', { waitUntil: 'networkidle0' });
      await page.addStyleTag({ path: path.join(root, 'assets/pos-mobile.css') });
      await page.addStyleTag({ path: path.join(root, 'app/src/native-runtime.css') });
      await page.evaluate((lang, theme) => {
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme', theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top', '20px');
        window.KiwiCaisseLang.set(lang);
      }, lang, theme);
      await page.addScriptTag({ path: path.join(root, 'assets/pos-mobile.js') });
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="scan"]');
      await page.waitForSelector('#bq-ean');
      await page.waitForFunction(() => document.activeElement?.id === 'bq-ean');
      const focusRing = async (selector, label) => {
        const ring = await page.$eval(selector, input => {
          const inner = getComputedStyle(input), wrapper = getComputedStyle(input.parentElement);
          return { inner: inner.outlineStyle, width: parseFloat(wrapper.outlineWidth),
            style: wrapper.outlineStyle, radius: parseFloat(wrapper.borderRadius),
            border: wrapper.borderColor, outline: wrapper.outlineColor, shadow: wrapper.boxShadow };
        });
        check(ring.inner === 'none', label + ': no square inner focus outline ' + JSON.stringify(ring));
        check(ring.style === 'solid' && ring.width >= 3 && ring.radius >= 10,
          label + ': rounded wrapper retains a visible keyboard focus ring ' + JSON.stringify(ring));
        check(ring.border !== ring.outline && ring.shadow === 'none',
          label + ': only one accented focus effect ' + JSON.stringify(ring));
      };
      await focusRing('#bq-ean', `${device} ${lang} ${theme} scanner`);
      const statusBacking = await page.$eval('.vx-screen.is-on', screen => {
        const css = getComputedStyle(screen, '::before');
        return { position: css.position, height: parseFloat(css.height), background: css.backgroundColor };
      });
      check(statusBacking.position === 'fixed' && statusBacking.height === 20 &&
        !/rgba?\(0, 0, 0(?:, 0)?\)|transparent/.test(statusBacking.background),
        `${device} ${lang} ${theme}: opaque status backing while the workspace scrolls ${JSON.stringify(statusBacking)}`);
      await page.click('.vx-burger');
      // The scanner's blur handler may reclaim focus after 120ms. An immediate
      // assertion misses the real WKWebView keyboard reappearing over the rail.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 220)));
      check(await page.evaluate(() => !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')),
        `${device} ${lang} ${theme}: drawer dismisses text editing`);
      // Tap the visible scrim, not the rail covering its centre (or its RTL side).
      const scrimX = lang === 'ar' ? 20 : width - 20;
      check(await page.evaluate(x => document.elementFromPoint(x, 200)?.classList.contains('vx-scrim'), scrimX),
        `${device} ${lang} ${theme}: drawer scrim is touchable outside the rail`);
      await page.mouse.click(scrimX, 200);
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.click('#bq-ean');
      for (const height of heights) {
        await page.setViewport({ width, height, isMobile: true, hasTouch: true });
        const layout = await page.evaluate(() => {
          const rect = s => { const {top,bottom,left,right} = document.querySelector(s).getBoundingClientRect(); return {top,bottom,left,right}; };
          return { help: rect('.bq-scan .bq-head-sub'), input: rect('.bq-ean-in'), burger: rect('.vx-burger'), heading: rect('.bq-scan h1'), scroller: rect('.bq-scan') };
        });
        const label = `${device} ${lang} ${theme} height=${height}`;
        check(layout.input.top >= layout.help.bottom + 8, label + ': input cannot overlap scanner help ' + JSON.stringify(layout));
        check(layout.heading.right <= layout.burger.left - 6 || layout.heading.left >= layout.burger.right + 6,
          label + ': title clears the burger horizontally');
        check(layout.heading.top >= 20, label + ': title clears the native status inset');
        await page.screenshot({ path: path.join(shots, `${device}-${lang}-${theme}-${height}.png`), captureBeyondViewport: false });
      }
      await page.setViewport({width,height:heights[0],isMobile:true,hasTouch:true});
      await page.click('#bq-scan-mock');
      await page.waitForSelector('.bq-look-tot',{visible:true});
      await page.waitForFunction(lang=>{
        const expected=lang==='fr'?'en stock':lang==='en'?'in stock':'في المخزون';
        return document.querySelector('.bq-look-tot')?.textContent.includes(expected);
      },{},lang);
      const result=await page.$eval('.bq-look-tot',el=>el.textContent);
      const log=await page.$eval('.bq-scan-log-row',el=>el.textContent);
      check(result.includes(lang==='fr'?'en stock':lang==='en'?'in stock':'في المخزون'),`${device} ${lang} ${theme}: scan stock copy translates`);
      check(log.includes(lang==='fr'?'vérifié':lang==='en'?'checked':'تم التحقق'),`${device} ${lang} ${theme}: scan verification is interface copy, not part of the product name`);
      await page.click('#bq-ean');
      await page.type('#bq-ean', 'qqq');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#bqi-or-var + .kiwi-select .kiwi-select-trigger', {visible:true});
      await page.click('#bqi-or-var + .kiwi-select .kiwi-select-trigger');
      await page.click('.kiwi-select-search input');
      await focusRing('.kiwi-select-search input', `${device} ${lang} ${theme} variant chooser`);
      await page.click('.kiwi-select-close');
      await page.click('#bq-invmm [data-inv-x]');
      check(errors.length === 0, `${device} ${lang} ${theme}: no page errors: ${errors.join(' | ')}`);
      check(writes.length === 0, `${device} ${lang} ${theme}: read-only layout pass`);
      await context.close();
    }
  }
  if (failures.length) throw new Error(`${failures.length}/${checks} scanner layout checks failed; screenshots: ${shots}`);
  console.log(`caisse-scan-layout-browser-test: ${checks} checks passed; screenshots: ${shots}`);
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
