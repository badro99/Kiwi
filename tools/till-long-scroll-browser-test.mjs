#!/usr/bin/env node
// #0159: real Boutique/Maison renderers + actual browser pointer/wheel/keys.
// Reduced Chromium height is ONLY a layout guard, never an iOS keyboard proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MERCHANT, ROW_COUNT, longListData, longListPage } from './till-long-scroll-fixture.mjs';
import { releaseExitedBrowserStreams } from './browser-test-lifecycle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const css = [...fs.readFileSync(path.join(root, 'kiwi-caisse.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  .matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const mime = { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  if (/^\/(boutique|maison)\.html$/.test(pathname)) {
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
    res.end(longListPage(pathname.slice(1, -5))); return;
  }
  if (pathname === '/caisse-inline.css') { res.writeHead(200, { 'Content-Type':'text/css' }); res.end(css); return; }
  if (pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ authenticated:false, sales:[], balances:[] })); return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!/^\/(assets|app\/src)\//.test(pathname) || !file.startsWith(root + path.sep)) {
    res.writeHead(404); res.end(); return;
  }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? '' : bytes);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-till-long-scroll-'));
const started = Date.now();
let browser, checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function state(page, panel, tail) {
  return page.evaluate((panelSelector, tailSelector) => {
    const panel = document.querySelector(panelSelector), tail = document.querySelector(tailSelector);
    const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    // Enumerate actual overflowing ancestors. Maison's current Vendus .ksold
    // owns the overflow instead of its outer view; do not assume one selector.
    const owners = [];
    for (let el = tail.parentElement; el && panel.contains(el); el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (/auto|scroll/.test(overflow) && el.scrollHeight > el.clientHeight + 10) {
        owners.push({ cls:el.className, top:el.scrollTop, max:el.scrollHeight-el.clientHeight, rect:box(el) });
      }
    }
    return { owners, panel:box(panel), tail:box(tail), text:tail.textContent,
      pageTop:scrollY, pageLeft:scrollX, width:document.documentElement.scrollWidth, viewport:innerWidth };
  }, panel, tail);
}

async function sweep(page, panel, tail, label) {
  const initial = await state(page, panel, tail);
  check(initial.owners.length > 0, label + ': long actual content has a bounded scroll owner');
  const owner = initial.owners[0];
  check(owner.rect.height > 80 && owner.rect.bottom <= await page.evaluate(() => innerHeight + 1),
    label + ': owning region is bounded by the available viewport');
  const x = (Math.max(0, owner.rect.left) + Math.min(initial.viewport, owner.rect.right)) / 2;
  const y = Math.max(owner.rect.top + 24, Math.min(owner.rect.bottom - 24, owner.rect.top + owner.rect.height * .7));
  await page.mouse.move(x, y);
  await page.mouse.wheel({ deltaY:550 }); await pause(55);
  const moved = await state(page, panel, tail);
  check(moved.owners.some((o, i) => o.top > (initial.owners[i]?.top || 0) + 20), label + ': browser wheel moves the actual list');
  for (let step = 0; step < 24; step++) {
    const current = await state(page, panel, tail);
    const r = current.owners[0].rect;
    if (current.tail.top >= r.top - 1 && current.tail.bottom <= r.bottom + 1) break;
    await page.mouse.wheel({ deltaY:900 }); await pause(30);
  }
  const bottom = await state(page, panel, tail), r = bottom.owners[0].rect;
  check(bottom.tail.top >= r.top - 1 && bottom.tail.bottom <= r.bottom + 1,
    label + ': final rendered row is fully reachable by wheel ' + JSON.stringify(bottom));
  const hit = await page.evaluate((selector, x, y) => {
    const tail = document.querySelector(selector), hit = document.elementFromPoint(x, y);
    return tail === hit || tail.contains(hit);
  }, tail, (bottom.tail.left + bottom.tail.right) / 2, (bottom.tail.top + bottom.tail.bottom) / 2);
  check(hit, label + ': final row is not behind a fixed control');
  check(bottom.pageTop === initial.pageTop && bottom.pageLeft === initial.pageLeft,
    label + ': list scrolling does not move the background page');
  check(bottom.width <= bottom.viewport + 1, label + ': no horizontal page overflow');
  for (let step = 0; step < 24; step++) {
    const current = await state(page, panel, tail);
    if (current.owners.every(o => o.top <= 1)) break;
    await page.mouse.wheel({ deltaY:-900 }); await pause(30);
  }
  check((await state(page, panel, tail)).owners.every(o => o.top <= 1), label + ': reverse wheel returns to the top');
  check(await page.$eval(panel + ' h1', el => { const r=el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
    label + ': heading is reachable again');
}

async function openView(page, prefix, view, mobile) {
  if (mobile) {
    await page.click('.vx-burger');
    await page.waitForFunction(() => document.querySelector('.vx-screen').classList.contains('vx-nav-open'));
    await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
  }
  await page.click(`[data-${prefix}-view="${view}"]`);
  if (mobile) await page.waitForFunction(() => !document.querySelector('.vx-screen').classList.contains('vx-nav-open'));
}

try {
  browser = await puppeteer.launch({ executablePath, headless:true, args:['--no-sandbox'] });
  const devices = [['se',375,[667,407],true], ['pro',402,[874,520],true],
    ['tablet',1024,[768],false], ['desktop',1440,[900],false]];
  for (const vertical of ['boutique','maison']) for (const [device,width,heights,mobile] of devices) {
    for (const lang of ['fr','en','ar']) for (const theme of ['light','dark']) {
      const label = `${vertical}/${device}/${lang}/${theme}`;
      if (process.env.KIWI_LONG_SCROLL_FILTER && !label.includes(process.env.KIWI_LONG_SCROLL_FILTER)) continue;
      const context = await browser.createBrowserContext(), page = await context.newPage();
      page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(15000);
      const errors = [], writes = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (!['GET','HEAD'].includes(request.method())) { writes.push(request.url()); void request.abort(); }
        else if (!request.url().startsWith(base + '/') && !request.url().startsWith('data:')) { external.push(request.url()); void request.abort(); }
        else void request.continue();
      });
      await page.setViewport({width,height:heights[0],isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(({merchant, data, lang, theme, mobile}) => {
        // Fixture bootstrap only. All subsequent navigation, search and scroll
        // use browser input; no dispatchEvent, scrollTop writes or DOM clicks.
        localStorage.setItem('kiwiLiveMerchant',merchant);
        localStorage.setItem('kiwi:bqDay',JSON.stringify(data.sales));
        localStorage.setItem('kiwi:retailBalances:'+merchant,JSON.stringify(data.balances));
        localStorage.setItem('kiwiCaisseLang',lang); localStorage.setItem('kiwiLang',lang);
        document.addEventListener('DOMContentLoaded',() => {
          if (mobile) document.documentElement.classList.add('kiwi-native');
          document.documentElement.dataset.caisseTheme=theme;
          document.documentElement.style.setProperty('--kiwi-host-safe-top', mobile ? '20px' : '0px');
          document.documentElement.style.setProperty('--kiwi-host-safe-bottom', mobile ? '34px' : '0px');
          window.KiwiCaisseLang.set(lang);
        },{once:true});
      },{merchant:MERCHANT,data:longListData(),lang,theme,mobile});
      await page.goto(base+'/'+vertical+'.html',{waitUntil:'networkidle0'});
      const prefix = vertical === 'boutique' ? 'bq' : 'mz';
      for (const view of ['vendus','acomptes']) {
        await openView(page,prefix,view,mobile);
        const panel = `[data-${prefix}-panel="${view}"].is-on`;
        const tail = panel + (view === 'vendus' ? ' .ksold-full .ksold-row:last-child' : ' .krb-card:last-child');
        await page.waitForSelector(tail,{visible:true});
        if (view === 'vendus') {
          await page.waitForFunction(s => !document.querySelector(s).textContent.includes('synchronisation…'),{},panel);
          check(await page.$$eval(panel+' .ksold-full .ksold-row', els => els.length) === 20,
            label + ': actual Vendus renders its 20-row history cap from 60 records');
          check((await page.$eval(tail,el=>el.textContent)).includes('SCROLL-SALE-020'), label + ': expected last history record');
        } else check(await page.$$eval(panel+' .krb-card',els=>els.length)===ROW_COUNT, label+': all 60 open bills render');
        for (const height of heights) {
          await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
          await sweep(page,panel,tail,`${label}/${view}/height=${height}${height!==heights[0]?' (reduced-layout only)':''}`);
          if (device==='se' && lang==='fr' && theme==='light') {
            await page.screenshot({path:path.join(shots,`${vertical}-${view}-${height}-browser.png`),captureBeyondViewport:false});
          }
        }
        await page.setViewport({width,height:heights[0],isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
        if (view === 'acomptes') {
          const input=panel+' .krb-search input';
          await page.click(input); await page.type(input,'SCROLL-BALANCE-060');
          await page.waitForFunction(s=>document.querySelectorAll(s+' .krb-card').length===1,{},panel);
          const filteredText=await page.$eval(panel+' .krb-card',e=>e.textContent);
          // RTL copy intentionally adds Unicode bidi-isolation controls around
          // Latin runs. Ignore only those formatting controls, not actual data.
          check(filteredText.replace(/[\u2066-\u2069]/g,'').includes('SCROLL-BALANCE-060'),
            label+': real search typing reaches final bill '+JSON.stringify(filteredText));
          // Backspace the real typed characters. This avoids depending on the
          // host OS's select-all shortcut in a mobile Chromium emulation.
          for (const _ of 'SCROLL-BALANCE-060') await page.keyboard.press('Backspace');
          check(await page.$eval(input,el=>el.value)==='',label+': real Backspace clears the filter');
          await page.waitForFunction((s,n)=>document.querySelectorAll(s+' .krb-card').length===n,{},panel,ROW_COUNT);
          await page.keyboard.press('Tab');
          check(await page.evaluate(()=>!document.activeElement?.matches('input,textarea')),label+': keyboard navigation leaves search without synthetic blur');
        }
      }
      check(errors.length===0,label+': no page exceptions '+errors.join(' | '));
      check(writes.length===0,label+': no attempted network mutations '+writes.join(' | '));
      check(await page.evaluate((merchant,n)=>JSON.parse(localStorage.getItem('kiwi:retailBalances:'+merchant)).length===n,MERCHANT,ROW_COUNT),
        label+': original synthetic bill ledger remains unchanged');
      await context.close();
      console.log('✓ '+label+' (pointer/wheel/search; '+external.length+' external requests blocked)');
    }
  }
  console.log(`till-long-scroll-browser-test: ${checks} checks in ${((Date.now()-started)/1000).toFixed(1)}s; browser screenshots ${shots}; no native keyboard/touch proof`);
} finally {
  if (browser) { const child=browser.process(); await browser.close(); releaseExitedBrowserStreams(child); }
  await new Promise(resolve=>server.close(resolve));
}
