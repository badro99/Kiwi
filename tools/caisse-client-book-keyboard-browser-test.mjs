#!/usr/bin/env node
// Native client-book regressions: explicit Search keyboard and clipped safe area.
// These Chromium checks are not the separately captured iOS typing proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(root, 'app'), root] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(root, 'tools/retail-ui-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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
  for (const [device, width, height, safe] of [['se',375,667,20], ['pro',402,874,62]]) {
    for (const lang of ['fr','en','ar']) for (const theme of ['light','dark']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height, isMobile:true, hasTouch:true });
      await page.goto(base + '/boutique.html', { waitUntil:'networkidle0' });
      await page.addStyleTag({ path:path.join(root,'app/src/native-runtime.css') });
      await page.evaluate((lang,theme,safe) => {
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme',theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top',safe+'px');
        window.KiwiCaisseLang.set(lang);
      },lang,theme,safe);
      await page.click('button[data-bq-view="clientes"]');
      await page.waitForSelector('#kcb-q',{visible:true});
      const label = `${device} ${lang} ${theme}`;
      const input = await page.$eval('#kcb-q',el => ({type:el.type,mode:el.inputMode,hint:el.enterKeyHint,correct:el.getAttribute('autocorrect'),complete:el.autocomplete}));
      check(input.type==='text' && input.mode==='text' && input.hint==='search',label+': full text keyboard with explicit Search, got '+JSON.stringify(input));
      check(input.correct==='off' && input.complete==='off',label+': name/phone queries cannot be autocorrected');
      for (const h of [height,device==='se'?407:520]) {
        await page.setViewport({width,height:h,isMobile:true,hasTouch:true});
        const layout=await page.$eval('#kcb-root',el=>({rootTop:el.getBoundingClientRect().top,scrollTop:el.querySelector('.kcb-scroll').getBoundingClientRect().top,clip:getComputedStyle(el).overflow,heading:el.querySelector('h2').getBoundingClientRect().top}));
        check(layout.rootTop>=safe && layout.scrollTop>=safe && layout.clip==='hidden',label+' height='+h+': scrolling clips below the real safe area '+JSON.stringify(layout));
      }
      await context.close();
    }
  }
  if(failures.length)throw new Error(`${failures.length}/${checks} client-book keyboard/safe-area checks failed`);
  console.log(`caisse-client-book-keyboard-browser-test: ${checks} checks passed`);
} finally {
  if(browser)await browser.close();
  fixture.kill('SIGTERM');
}
