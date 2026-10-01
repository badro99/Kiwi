#!/usr/bin/env node
// Ticket #0151: isolated bundled demo, real input, geometry and visual matrix.
// No credentials, digit entry, gate bypass or merchant network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from './build-app-www.mjs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ticket151-'));
const phase=process.env.KIWI_151_PHASE||'after';
const evidence=process.env.KIWI_151_MATRIX==='1'||phase==='before'?path.join(root,'docs/audits/evidence/2026-10-01-ticket-0151',phase):path.join(work,'evidence');
fs.mkdirSync(evidence,{recursive:true});
const www = path.join(work, 'www');
build({ out:www, quiet:true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.resolve(www, '.' + new URL(req.url,'http://local').pathname);
  if (!p.startsWith(www + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, {'Content-Type':mime[path.extname(p)] || 'application/octet-stream'}); res.end(err ? '' : data); });
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
const sleep = ms => new Promise(r => setTimeout(r,ms));
let checks = 0;
const check = (value,label) => { assert.ok(value,label); checks++; console.log('  ✓ ' + label); };
async function phone(lang, dark=false, signedOut=false) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({width:402,height:874,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'},{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);
  let verificationRequests = 0;
  let authRequests = 0;
  page.on('request', r => {
    if (/\/api\/pin\/verify/.test(r.url())) verificationRequests++;
    if (/\/auth\/login/.test(r.url())) authRequests++;
    if (signedOut && /\/api\/me(?:[?#]|$)/.test(r.url())) { r.respond({status:401,contentType:'application/json',body:'{}'}); return; }
    if (!r.url().startsWith(base) && !r.url().startsWith('data:')) r.abort(); else r.continue();
  });
  await page.evaluateOnNewDocument((locale) => {
    localStorage.setItem('kiwiNativeLocale',locale);
    localStorage.setItem('kiwi-employee-language:demo','fr');
    const noop = () => Promise.resolve({});
    const plug = new Proxy({}, {get:(_,k)=> k === 'addListener' ? () => ({remove(){}}) : noop});
    window.Capacitor = {isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:new Proxy({}, {get:()=>plug})};
    window.webkit = {messageHandlers:{kiwiShell:{postMessage(v){ window.__host = v; }}}};
    document.addEventListener('DOMContentLoaded',()=> {
      const s = document.documentElement.style;
      s.setProperty('--kiwi-host-safe-top','62px'); s.setProperty('--kiwi-host-safe-bottom','34px'); s.setProperty('--kiwi-host-tab-height','106px');
    });
  },lang);
  return {page,context,verificationRequests:()=>verificationRequests,authRequests:()=>authRequests};
}

try {
  const measurements=[];
  const matrix=phase==='before'||process.env.KIWI_151_MATRIX==='1';
  const cases=matrix?[375,402].flatMap(width=>['fr','en','ar'].filter(lang=>!process.env.KIWI_151_LANGS||process.env.KIWI_151_LANGS.split(',').includes(lang)).flatMap(lang=>['light','dark'].map(theme=>({width,lang,theme})))):[{width:375,lang:'ar',theme:'dark'},{width:402,lang:'en',theme:'light'}];
  for(const {width,lang,theme} of cases) {
    const {page,context}=await phone(lang,theme==='dark');
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width,height:874,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const click=async(selector,options={})=>{
      try{await page.waitForSelector(selector,{visible:true,timeout:10000});}catch(e){await page.screenshot({path:path.join(work,'timeout.png')});console.log('timeout screenshot',path.join(work,'timeout.png'));console.log(await page.evaluate(()=>({body:document.body.className,root:document.querySelector('[data-menu-root]')?.getBoundingClientRect().toJSON(),text:document.body.innerText.slice(-1600)})));throw e;}
      await page.$eval(selector,e=>e.scrollIntoView({block:'center',inline:'center',behavior:'instant'}));await sleep(180);
      const hit=await page.$eval(selector,e=>{const r=e.getBoundingClientRect(),p=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {ok:p===e||e.contains(p),target:p?.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};});
      assert.ok(hit.ok,'actual tap hit test: '+selector+' '+JSON.stringify(hit));
      await page.click(selector,options);await sleep(180);
    };
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await page.waitForSelector('.kob-root [data-explore]');await click('.kob-root [data-explore]');await sleep(600);
    await page.waitForSelector('[data-kiwi-skip]');await click('[data-kiwi-skip]');await sleep(1200);
    await page.evaluate(({lang,theme})=>{KiwiI18n.setLang(lang);KiwiI18n.setTheme(theme);},{lang,theme});await sleep(200);
    // Seed the PUBLIC model in an isolated demo. Not a production merchant or mocked DOM.
    await page.evaluate((lang)=>{
      const fixtureName={fr:'TEST KIWI Tajine traditionnel aux légumes de saison et citron confit',en:'TEST KIWI Traditional tajine with seasonal vegetables and preserved lemon',ar:'TEST KIWI طاجين مغربي تقليدي بالخضروات الموسمية والليمون المصير والزيتون الأخضر'}[lang];
      const s=KiwiMenuStore;
      for(const name of ['TEST KIWI Mains','TEST KIWI Drinks','TEST KIWI Desserts','TEST KIWI Empty']) s.addCategory(name);
      const cats=s.categories();const cid=cats.find(c=>c.name==='TEST KIWI Mains').id;
      s.addSubcategory(cid,'TEST KIWI Tajines');s.addSubcategory(cid,'TEST KIWI Grillades');
      const subs=s.categories().find(c=>c.id===cid).sub;
      for(let i=0;i<200;i++) s.addItem({name:i===0?fixtureName:'TEST KIWI Item '+String(i+1).padStart(3,'0'),price:85+i%20,catId:cid,subId:subs[i%2].id,avail:i%7!==0});
    },lang);
    // Actual sidebar destinations, never synthetic click events.
    const go=async nav=>{
      const close=await page.$('.kiwi-drawer-backdrop .kiwi-drawer-close');if(close){await close.click();await sleep(450);}
      const hamburger=await page.$('.kw-hamburger');
      if(hamburger&&await hamburger.isVisible())await hamburger.click();
      const link=await page.$('.sidebar [data-nav="'+nav+'"]');
      if(link){await link.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await link.click();}
      else throw Error('Missing sidebar '+nav);
      await page.waitForFunction(route=>document.body.classList.contains('page-'+route),{},nav);await sleep(500);
    };
    const snap=async surface=>{
      const m=await page.evaluate(()=>{
        const scope=document.querySelector('body.page-menu [data-menu-root],body.page-stock [data-stock-root]');
        const r=scope.getBoundingClientRect();
        return {pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,rootWidth:r.width,grid:getComputedStyle(scope.querySelector('.mi-grid')||scope).gridTemplateColumns,targets:[...scope.querySelectorAll('button,summary')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {action:e.dataset.action||e.dataset.rmwCommand||e.tagName,width:r.width,height:r.height};}),rows:[...scope.querySelectorAll('.mi-pill-row,.mi-subchips,.st-tabs,.st-item-subtabs,.st-filter-row')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth,left:e.scrollLeft})),backgroundPoint:{x:Math.max(1,Math.round(r.left+6)),y:Math.max(1,Math.round(r.top+6))},paint:scope.querySelector('.mi-section,.st-section,.st-kpi')?getComputedStyle(scope.querySelector('.mi-section,.st-section,.st-kpi')).backgroundColor:null};
      });
      measurements.push({surface,width:m.pageWidth,lang,theme,...m});
      await page.screenshot({path:path.join(evidence,`${width}-${lang}-${theme}-${surface}.png`)});
      if(phase==='after'){check(m.targets.every(t=>t.width>=43.9&&t.height>=43.9),`${width} ${lang} ${theme} ${surface}: 44px targets`);check(m.scrollWidth<=m.pageWidth+1,`${width} ${lang} ${theme} ${surface}: no page overflow`);}
    };
    await go('menu');await snap('menu-all');
    await click('[data-action="rmw-cat-filter"][data-cat]:not([data-cat="all"])');await sleep(200);await snap('menu-section');
    await go('stock');await snap('stock-overview');
    await click('[data-action="stock-tab"][data-tab="items"]');await sleep(200);await snap('stock-items');
    await click('[data-action="stock-tab"][data-tab="suppliers"]');await sleep(200);await snap('stock-suppliers');
    if(phase==='after'&&process.env.KIWI_151_CAPTURE!=='1') {
      const close=async()=>{const b=await page.$('.kiwi-backdrop .kiwi-modal-close');if(b){await b.click();await page.waitForSelector('.kiwi-backdrop',{hidden:true});await sleep(450);}};
      await page.$eval('.st-supplier-cards [data-action="stock-supplier-detail"]',e=>e.scrollIntoView({block:'center',behavior:'instant'}));await sleep(350);await click('.st-supplier-cards [data-action="stock-supplier-detail"]');await sleep(450);
      if(!(await page.$('.st-md-stats'))){console.log('profile errors',errors);await page.screenshot({path:path.join(work,'profile-fail.png')});console.log('debug screenshot',path.join(work,'profile-fail.png'));}
      check(await page.$('.st-md-stats'),lang+': supplier profile renders without unbound variables');
      await page.screenshot({path:path.join(evidence,`${width}-${lang}-${theme}-supplier-detail.png`)});await close();
      await click('[data-action="stock-tab"][data-tab="orders"]');await sleep(200);await snap('stock-orders');
      await click('[data-action="stock-tab"][data-tab="items"]');await sleep(200);
      await click('[data-action="stock-view"][data-view="cards"]');await sleep(200);
      check(await page.$('.st-card-grid button.st-card .st-catalog-status'),lang+': card stock is labelled, not color-only');
      await page.screenshot({path:path.join(evidence,`${width}-${lang}-${theme}-stock-cards.png`)});
      await page.type('[data-stock-search-input]','zzzz');await sleep(200);
      check(await page.evaluate(()=>document.activeElement.matches('[data-stock-search-input]')&&document.activeElement.value==='zzzz'),lang+': stock search focus survives four real keystrokes');
      await click('[data-stock-search-input]',{clickCount:3});await page.keyboard.press('Backspace');await sleep(200);
      await click('[data-action="stock-subview"][data-subview="waste"]');await sleep(200);
      check(await page.evaluate(()=>document.querySelector('[data-subview="waste"]').getAttribute('aria-selected')==='true'),lang+': waste tab selection and accessibility state');
      await click('[data-action="stock-subview"][data-subview="counts"]');await sleep(200);
      check(await page.evaluate(()=>document.querySelector('[data-subview="counts"]').getAttribute('aria-selected')==='true'),lang+': history tab scrolls into view');
      await go('menu');
      const grid=await page.evaluate(()=>({body:document.body.className,width:innerWidth,grid:[...document.querySelectorAll('.mi-grid')].map(e=>({columns:getComputedStyle(e).gridTemplateColumns,width:e.getBoundingClientRect().width,visible:!!e.getClientRects().length}))}));if(!grid.grid.some(g=>g.width>0&&g.columns.split(' ').length===2)){await page.screenshot({path:path.join(evidence,'grid-fail.png')});console.log('grid failure',grid);}check(grid.grid.some(g=>g.width>0&&g.columns.split(' ').length===2),lang+': exactly two visible phone menu columns');
      await click('[data-action="rmw-section-actions"]');await sleep(200);
      await click('[data-catalog-action="reorder"]');await sleep(450);
      const before=await page.evaluate(()=>KiwiMenuStore.categories().map(c=>c.id));
      const rows=await page.$$('.catalog-reorder-row');const from=await rows[0].$('button');const r1=await from.boundingBox(),r2=await rows[1].boundingBox();
      await page.mouse.move(r1.x+r1.width/2,r1.y+r1.height/2);await page.mouse.down();await page.mouse.move(r2.x+20,r2.y+r2.height/2,{steps:12});await page.mouse.up();await sleep(200);
      check(await page.evaluate(before=>KiwiMenuStore.categories()[1].id===before[0],before),lang+': real drag reorders sections');
      check(await page.$eval('.catalog-reorder-row:nth-child(2) select',e=>{const r=e.getBoundingClientRect();return r.width>=76&&r.height>=44;}),'native position selector 76 by 44');await click('.catalog-reorder-row:nth-child(2) select');await page.keyboard.press('Home');await page.keyboard.press('Enter');await sleep(200);
      check(await page.evaluate(before=>KiwiMenuStore.categories()[0].id===before[0],before),lang+': keyboard-compatible position selector reorders');
      await click('[data-catalog-done]');await sleep(450);
      await click('.catalog-item-edit');await sleep(200);
      check(await page.$('.kiwi-modal [data-name]'),lang+': real card tap opens item editor');await close();
      await click('.catalog-item-footer .catalog-more');await sleep(200);
      const availBefore=await page.evaluate(()=>KiwiMenuStore.items()[0].avail);
      await click('[data-catalog-action="availability"]');await sleep(450);
      check(await page.evaluate(old=>KiwiMenuStore.items()[0].avail!==old,availBefore),lang+': overflow availability saves to model');
      await click('[data-action="rmw-cat-filter"][data-cat="all"]');await sleep(200);
      await page.evaluate(()=>{window.__catalogFirst=document.querySelector('.catalog-item-edit');KiwiRestaurantMenuWorkspace.render();});
      check(await page.evaluate(()=>window.__catalogFirst===document.querySelector('.catalog-item-edit')),lang+': unchanged poll render retains touched DOM');
      await click('[data-action="rmw-cat-filter"]:last-child');await sleep(200);
      check(await page.evaluate(()=>!document.querySelector('.mi-grid .mi-card')),lang+': empty section is deliberate');
      await page.screenshot({path:path.join(evidence,`${width}-${lang}-${theme}-menu-empty.png`)});
      await click('[data-action="rmw-item-add"]');await sleep(200);
      check(await page.$('.kiwi-modal [data-name]'),lang+': primary new item remains usable in empty section');await close();
      if(width===402&&lang==='en'&&theme==='light'){
        await click('[data-action="rmw-cat-filter"][data-cat]:not([data-cat="all"])');
        for(const action of ['new','rename','delete']){
          await click('[data-action="rmw-section-actions"]');await click('[data-catalog-action="'+action+'"]');
          await page.waitForFunction(()=>document.querySelectorAll('.kiwi-backdrop').length===1,{timeout:3000});check((await page.$$('.kiwi-backdrop')).length===1,'section '+action+': one sheet, no overlapping layers');await close();
        }
        await click('.catalog-item-footer .catalog-more');await click('[data-catalog-action="archive"]');
        check(await page.evaluate(()=>KiwiMenuStore.items()[0].archived===true),'archive action is reachable');
        await click('.catalog-item-footer .catalog-more');await click('[data-catalog-action="archive"]');
        check(await page.evaluate(()=>!KiwiMenuStore.items()[0].archived),'restore action is reachable');
        await go('stock');
        for(const tool of ['stock-scan-invoice','stock-count-sheet','stock-physical-count']){
          await click('[data-action="stock-workspace-actions"]');await click('[data-catalog-stock="'+tool+'"]');
          await page.waitForFunction(()=>document.querySelectorAll('.kiwi-backdrop').length===1,{timeout:3000});check((await page.$$('.kiwi-backdrop')).length===1,tool+': normal tool opens without nested sheet');await close();
        }
        await click('[data-action="stock-tab"][data-tab="suppliers"]');
        for(const action of ['stock-edit-supplier','stock-new-po']){
          await click('.st-supplier-cards [data-action="stock-supplier-detail"]');await click('[data-catalog-profile="'+action+'"]');
          await page.waitForFunction(()=>document.querySelectorAll('.kiwi-backdrop').length===1,{timeout:3000});check((await page.$$('.kiwi-backdrop')).length===1,action+': supplier handoff is a single sheet');await close();
        }
        check(await page.evaluate(()=>!document.documentElement.classList.contains('kiwi-locked')&&!window.__kiwiScrollLocks),'all sheet closes release background scroll lock');
        for(const target of ['ar','fr','en']){await page.evaluate(l=>KiwiI18n.setLang(l),target);await sleep(200);check(await page.$eval('[data-action="stock-workspace-actions"]',e=>e.getAttribute('aria-label'))===({ar:'أدوات المخزون',fr:'Outils du stock',en:'Stock tools'})[target],'in-place language switch: '+target);}
        for(const wide of [768,1440]){
          const wideGo=async nav=>{await page.setViewport({width:402,height:874,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.evaluate(()=>document.documentElement.classList.add('kiwi-native'));await go(nav);await page.setViewport({width:wide,height:960,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.evaluate(()=>document.documentElement.classList.remove('kiwi-native'));await sleep(300);};
          await wideGo('menu');await click('[data-action="rmw-cat-filter"][data-cat="all"]');await sleep(200);await snap('wide-'+wide+'-menu');
          check(await page.evaluate(()=>getComputedStyle(document.querySelector('.mi-grid')).gridTemplateColumns.split(' ').length>=3),'wide '+wide+': at least three menu columns');
          await wideGo('stock');await click('[data-action="stock-tab"][data-tab="items"]');await sleep(200);
          await click('[data-action="stock-subview"][data-subview="catalog"]');await click('[data-action="stock-view"][data-view="list"]');await sleep(200);await snap('wide-'+wide+'-items');
          check(await page.evaluate(()=>getComputedStyle(document.querySelector('.st-desktop-items')).display!=='none'),'wide '+wide+': sortable stock table retained');
          await click('[data-action="stock-tab"][data-tab="suppliers"]');await sleep(200);await snap('wide-'+wide+'-suppliers');
          check(await page.evaluate(()=>getComputedStyle(document.querySelector('.st-supplier-table')).display!=='none'),'wide '+wide+': supplier table retained');
          await click('[data-action="stock-tab"][data-tab="orders"]');await sleep(200);await snap('wide-'+wide+'-orders');
        }
      }
      if(width===402&&lang==='en'&&theme==='light'){
        for(const climate of ['vexel-dark','legacy-dark','light']){
          await page.evaluate(mode=>{if(mode==='legacy-dark')KiwiDesignVexel.disable();else KiwiDesignVexel.enable();KiwiDashTheme.set(mode==='legacy-dark'?'dark':'light');KiwiI18n.setTheme(mode==='legacy-dark'?'dark':'light');},climate);await sleep(300);
          // CSS isolation only: Vexel's palette without the legacy dark selector.
          if(climate==='vexel-dark'){await page.evaluate(()=>{document.documentElement.setAttribute('data-vexel-mode','dark');document.body.setAttribute('data-vexel-mode','dark');});await sleep(200);}
          await page.screenshot({path:path.join(evidence,'theme-'+climate+'.png')});
          const painted=await page.$eval('[data-stock-root] .st-section',e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));measurements.push({surface:'theme-'+climate,...painted});
        }
      }
      check(errors.length===0,'no runtime errors: '+errors.join('; '));
    }
    await context.close();
  }
  fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify(measurements,null,2));
  console.log(`${phase}: ${measurements.length} screenshots at ${evidence}`);
} finally {await browser.close();await new Promise(r=>server.close(r));fs.rmSync(www,{recursive:true,force:true});}
