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
const depositComputedMeasurements = [];
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
            border: wrapper.borderColor, outline: wrapper.outlineColor, shadow: wrapper.boxShadow,
            keyboard: input.matches(':focus-visible') && document.activeElement === input };
        });
        check(ring.keyboard, label + ': real editable control owns keyboard focus');
        check(ring.inner === 'none', label + ': no square inner focus outline ' + JSON.stringify(ring));
        check(ring.style === 'solid' && ring.width >= 3 && ring.radius >= 10,
          label + ': rounded wrapper retains a visible keyboard focus ring ' + JSON.stringify(ring));
        check(ring.border !== ring.outline && ring.shadow === 'none',
          label + ': only one accented focus effect ' + JSON.stringify(ring));
      };
      // Computed CSS compositing is a browser guard, not screenshot pixel proof.
      const computedSurfaceContrast = (selector, wrapped = true) => page.$eval(selector, (input, wrapped) => {
        const control=wrapped?input.parentElement:input, css=getComputedStyle(control);
        const rgb=value => (value.match(/[\d.]+/g) || []).map(Number);
        const blend=(top,bottom) => {
          const alpha=top[3] == null?1:top[3];
          return top.slice(0,3).map((v,i)=>v*alpha+bottom[i]*(1-alpha));
        };
        const backgrounds=[];
        for(let el=control;el;el=el.parentElement) backgrounds.push(rgb(getComputedStyle(el).backgroundColor));
        let background=[247,245,240];
        for(const color of backgrounds.reverse()) background=blend(color,background);
        const luminance=color => color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
        const ratio=color => {const a=luminance(color),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
        return {border:ratio(blend(rgb(css.borderColor),background)),outline:ratio(blend(rgb(css.outlineColor),background)),background,
          outlineColor:css.outlineColor,outlineStyle:css.outlineStyle,outlineWidth:parseFloat(css.outlineWidth),radius:parseFloat(css.borderRadius),
          keyboard:input.matches(':focus-visible') && document.activeElement===input};
      }, wrapped);
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
      const unknownCode='qqq · Total <img src=x> $& {n} 007';
      await page.type('#bq-ean', unknownCode);
      await page.keyboard.press('Enter');
      await page.waitForFunction(code=>Array.from(document.querySelectorAll('#toast-stack .toast-title')).some(el=>el.textContent.replace(/[\u2066\u2069]/g,'').includes(code)),{},unknownCode);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const unknownToast=await page.$$eval('#toast-stack .toast-title',(els,code)=>{
        const el=els.find(el=>el.textContent.replace(/[\u2066\u2069]/g,'').includes(code));
        return {text:el?.textContent.replace(/[\u2066\u2069]/g,''),elements:el?.children.length,severity:el?.closest('.toast')?.className};
      },unknownCode);
      const unknownExpected=lang==='fr'?`Code ${unknownCode} inconnu, aucun article ne le porte`
        :lang==='en'?`Unknown code ${unknownCode}, no item uses it`:`الرمز ${unknownCode} غير معروف، لا يحمله أي منتج`;
      check(unknownToast.text===unknownExpected,`${device} ${lang} ${theme}: actual scanner Enter unknown-code toast translates and preserves code bytes ${JSON.stringify(unknownToast)}`);
      check(unknownToast.elements===0,`${device} ${lang} ${theme}: barcode markup remains safe toast text, never injected elements`);
      check(unknownToast.severity?.includes('is-warn') && !unknownToast.severity?.includes('is-success'),
        `${device} ${lang} ${theme}: unknown barcode feedback is a warning, not success ${JSON.stringify(unknownToast)}`);
      const unknownHistory=await page.$eval('.bq-scan-log-row.is-err > span:nth-of-type(2)',el=>el.textContent);
      const historyExpected=lang==='fr'?'Code inconnu, non référencé':lang==='en'?'Unknown code, not registered':'رمز غير معروف، غير مسجّل';
      check(unknownHistory===historyExpected,`${device} ${lang} ${theme}: actual unknown-code scan history translates ${JSON.stringify(unknownHistory)}`);
      await page.waitForSelector('#bqi-or-var + .kiwi-select .kiwi-select-trigger', {visible:true});
      await page.click('#bqi-or-var + .kiwi-select .kiwi-select-trigger');
      await page.click('.kiwi-select-search input');
      await focusRing('.kiwi-select-search input', `${device} ${lang} ${theme} variant chooser`);
      await page.click('.kiwi-select-close');
      await page.click('#bq-invmm [data-inv-x]');
      // Inventory owns a different search wrapper from the scanner screen.
      // It is generated by renderInventaire(), not a hand-written fixture.
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="inventaire"]');
      await page.waitForSelector('#bqi-scan', {visible:true});
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open') &&
        !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState==='running'));
      for (const height of heights) {
        await page.setViewport({width,height,isMobile:true,hasTouch:true});
        await page.click('#bqi-scan');
        await page.waitForFunction(() => document.activeElement?.id==='bqi-scan');
        await page.keyboard.type('q');
        await focusRing('#bqi-scan', `${device} ${lang} ${theme} stock height=${height}`);
        const computed = await computedSurfaceContrast('#bqi-scan');
        check(computed.border>=3 && computed.outline>=3,
          `${device} ${lang} ${theme} stock height=${height}: neutral border and sole focus ring contrast ≥3 against computed surface ${JSON.stringify(computed)}`);
        await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-stock-${height}.png`),captureBeyondViewport:false});
      }
      await page.setViewport({width,height:heights[0],isMobile:true,hasTouch:true});
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="acomptes"]');
      await page.waitForSelector('.krb-search input',{visible:true});
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open') &&
        !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState==='running'));
      await page.click('.krb-search input');
      await page.keyboard.type('q');
      const depositComputed=await computedSurfaceContrast('.krb-search input',false);
      check(depositComputed.keyboard && depositComputed.outlineStyle==='solid' && depositComputed.outlineWidth>=2 && depositComputed.radius>=10,
        `${device} ${lang} ${theme} deposits: real keyboard focus has one rounded ring ${JSON.stringify(depositComputed)}`);
      check(depositComputed.outline>=3,`${device} ${lang} ${theme} deposits: focus ring contrast ≥3 against computed surface ${JSON.stringify(depositComputed)}`);
      depositComputedMeasurements.push({device,lang,theme,...depositComputed});
      check(errors.length === 0, `${device} ${lang} ${theme}: no page errors: ${errors.join(' | ')}`);
      check(writes.length === 0, `${device} ${lang} ${theme}: read-only layout pass`);
      await context.close();
    }
  }
  console.log('deposit-focus-computed-measurements: '+JSON.stringify(depositComputedMeasurements));
  if (failures.length) throw new Error(`${failures.length}/${checks} scanner layout checks failed; screenshots: ${shots}`);
  console.log(`caisse-scan-layout-browser-test: ${checks} checks passed; screenshots: ${shots}`);
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
