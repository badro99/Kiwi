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
      try {
      const page = await context.newPage();
      await page.setViewport({ width, height, isMobile:true, hasTouch:true });
      await page.evaluateOnNewDocument(() => {
        const book='synthetic-retail-acompte';
        localStorage.setItem('kiwi:clients:v1:'+book,JSON.stringify({seq:2,list:[
          {id:'points-98',name:'Safouane pts',phone:'+212698765432',points:98,stamps:0,visits:1,spend:98,lastSeen:1},
          {id:'literal-unit',name:'pts',phone:'+212611111111',points:98,stamps:0,visits:1,spend:98,lastSeen:0}
        ]}));
        localStorage.setItem('kiwi:fidelity:v1:'+book,JSON.stringify({model:'amount',amount:{perMad:1,threshold:100.5,reward:'synthetic reward'},visit:{target:10},product:{target:10}}));
      });
      const writes=[];
      await page.setRequestInterception(true);
      page.on('request',request => {
        const url=new URL(request.url());
        if(!['http:','https:'].includes(url.protocol))return request.continue();
        if(!['127.0.0.1','localhost'].includes(url.hostname)||!['GET','HEAD'].includes(request.method())) {
          writes.push(request.method()+' '+url.pathname);return request.abort();
        }
        return request.continue();
      });
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
      const initialBook=await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'));
      check(await page.$eval('[data-id="literal-unit"] .kcb-nm',el=>el.textContent)==='pts',label+': literal customer name pts remains data');
      await page.type('#kcb-q','Safouane');
      await page.waitForFunction(()=>document.querySelectorAll('#kcb-list .kcb-row').length===1);
      const row=await page.$('[data-id="points-98"]');
      for(const next of [lang,...['fr','en','ar'].filter(value=>value!==lang)]) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const units=await page.$eval('[data-id="points-98"]',el=>({unit:el.querySelector('[data-kcb-point-unit]')?.textContent,number:el.querySelector('.kcb-num bdi[data-nolang]')?.textContent,name:el.querySelector('.kcb-nm').textContent,phone:el.querySelector('.kcb-ph').textContent,ready:!!el.querySelector('.kcb-ready')}));
        check(units.unit===(next==='ar'?'نقطة':'pts') && units.number==='98' && !units.ready,label+' → '+next+': exact localized list points below reward '+JSON.stringify(units));
        const renderedPhone=await page.evaluate(()=>window.KiwiCaisseLang.bidi('+212698765432'));
        check(units.name==='Safouane pts' && units.phone===renderedPhone && await page.$eval('#kcb-q',el=>el.value)==='Safouane',label+' → '+next+': search/name bytes unchanged, phone preserves exact public bidi formatting');
        check(await row.evaluate(el=>el.isConnected),label+' → '+next+': language change does not rerender customer row');
      }
      await page.click('[data-id="points-98"]');
      await page.waitForSelector('#kcb-sheet',{visible:true});
      const amount=await page.$('#kcb-amt');
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const detail=await page.$eval('.kcb-progtxt',el=>({unit:el.querySelector('[data-kcb-point-unit]')?.textContent,numbers:[...el.querySelectorAll('bdi[data-nolang]')].map(node=>node.textContent)}));
        check(detail.unit===(next==='ar'?'نقطة':'pts') && detail.numbers.join('/')==='98/100.5',label+' detail → '+next+': isolated balance/exact fractional threshold and localized unit '+JSON.stringify(detail));
        check(await amount.evaluate(el=>el.isConnected && el.value===''),label+' detail → '+next+': untouched purchase draft remains same node');
      }
      await page.click('#kcb-d-close');
      await page.evaluate(lang=>window.KiwiCaisseLang.set(lang),lang);
      check(await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'))===initialBook && writes.length===0,label+': no customer/loyalty persistence mutation or network writes '+JSON.stringify(writes));
      for (const h of [height,device==='se'?407:520]) {
        await page.setViewport({width,height:h,isMobile:true,hasTouch:true});
        const layout=await page.$eval('#kcb-root',el=>({rootTop:el.getBoundingClientRect().top,scrollTop:el.querySelector('.kcb-scroll').getBoundingClientRect().top,clip:getComputedStyle(el).overflow,heading:el.querySelector('h2').getBoundingClientRect().top}));
        check(layout.rootTop>=safe && layout.scrollTop>=safe && layout.clip==='hidden',label+' height='+h+': scrolling clips below the real safe area '+JSON.stringify(layout));
      }
      } finally { await context.close(); }
    }
  }
  if(failures.length)throw new Error(`${failures.length}/${checks} client-book keyboard/safe-area checks failed`);
  console.log(`caisse-client-book-keyboard-browser-test: ${checks} checks passed`);
} finally {
  if(browser)await browser.close();
  fixture.kill('SIGTERM');
}
