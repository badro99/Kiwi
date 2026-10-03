#!/usr/bin/env node
// Isolated browser integration, NOT native/paired/hardware acceptance.
// Actual dashboard composer -> shared demo price engine -> actual till sale
// -> actual Z projection. No cloud synchronization is simulated or claimed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { releaseExitedBrowserStreams } from './browser-test-lifecycle.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(ROOT,'app/package.json'));
const puppeteer=require('puppeteer-core');
const executablePath=process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath,'Chromium required');
const fixture=spawn(process.execPath,[path.join(ROOT,'tools/retail-ui-fixture.mjs')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
let browser,checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('  ✓ '+label);};
const source=fs.readFileSync(path.join(ROOT,'assets/pos-boutique.js'),'utf8');
const hook=`
  window.__promoProof={
    ticket:()=>JSON.parse(JSON.stringify(ticketTotals(state.ticket))),
    sales:()=>JSON.parse(JSON.stringify(salesToday().map(s=>({id:s.id,total:s.total,promoOff:s.promoOff,lines:s.lines})))),
    totals:()=>JSON.parse(JSON.stringify(bqDayTotals())),
    report:()=>JSON.parse(JSON.stringify(bqBuildReport(null,Date.now())))
  };
`;
assert.equal(source.split('  window.KiwiPosDispatch.register({').length,2,'single fixture hook insertion point');
const servedSource=source.replace('  window.KiwiPosDispatch.register({',hook+'\n  window.KiwiPosDispatch.register({');
try {
  const base=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('Retail fixture timeout')),15000);
    fixture.once('exit',code=>{clearTimeout(timer);reject(new Error('Fixture exited '+code));});
    fixture.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);if(match){clearTimeout(timer);resolve(JSON.parse(match[1]).base);}});
  });
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  for(const theme of ['light','dark']) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    let apiWrites=0;
    page.on('console',message=>{if(message.type()==='error') console.error('fixture console error: '+message.text());});
    await page.setViewport({width:1440,height:1000});
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.origin!==base && !['data:','blob:'].includes(url.protocol))return request.abort();
      if(url.pathname.startsWith('/api/') && !['GET','HEAD'].includes(request.method())){apiWrites++;return request.abort();}
      if(url.origin===base && url.pathname==='/assets/pos-boutique.js') return request.respond({status:200,contentType:'text/javascript',body:servedSource});
      request.continue();
    });
    await page.goto(base+'/boutique.html',{waitUntil:'networkidle0'});
    await page.waitForSelector('#bq-tk-reset');
    await page.click('#bq-tk-reset');
    // Date fixtures alter only this isolated context's local demo catalog.
    // Keep ISO representation to exercise #0162's formerly broken date path.
    const items=await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.documentElement.dataset.vexelMode=theme;
      const cat=KiwiBoutiqueCatalog,products=cat.load().products;
      products[0].createdAt='2020-01-01T12:00:00.000Z';
      products[1].createdAt='2099-01-01T12:00:00.000Z';
      cat.updateProduct(products[0].id,{}); // notify the real till catalog subscriber
      return {old:{id:products[0].id,name:products[0].name,price:products[0].priceMAD},recent:{id:products[1].id,name:products[1].name,price:products[1].priceMAD},key:cat.currentVenue()};
    },theme);
    check(items.key==='maisonMansour',theme+': only local Maison demo catalog is used');
    await page.addScriptTag({path:path.join(ROOT,'assets/day-report.js')});
    // Generic owner-page/modal shell only; pricing, validation, event handlers,
    // save/edit/pause logic all come from the unchanged actual dashboard asset.
    await page.evaluate(()=>{
      window.__fixturePrintCalls=0;
      window.print=()=>{window.__fixturePrintCalls++;throw new Error('Printing forbidden in this fixture');};
      const panel=document.createElement('section');panel.id='fixture-promo-panel';panel.hidden=true;
      panel.style.cssText='position:fixed;inset:0;background:var(--paper);z-index:300;padding:24px;overflow:auto';
      document.body.append(panel);
      const controls=document.createElement('div');controls.style.cssText='position:fixed;bottom:5px;left:5px;z-index:400;background:var(--paper)';
      controls.innerHTML='<button id="fixture-open-promos">Promotions (fixture)</button><button id="fixture-close-promos">Retour caisse (fixture)</button>';
      document.body.append(controls);
      window.KiwiBoutiqueVenueKey=()=>KiwiBoutiqueCatalog.currentVenue();
      window.Kiwi={handlers:{},toast:()=>{},appPage:(_id,opts)=>{
        panel.hidden=false;panel.innerHTML='<h1>'+opts.title+'</h1><p>'+opts.subtitle+'</p>'+opts.body;
        return{el:panel,close:()=>{panel.hidden=true;}};
      },modal:opts=>{
        const veil=document.createElement('div');veil.className='fixture-owner-modal';
        veil.style.cssText='position:fixed;inset:0;z-index:350;display:grid;place-items:center;background:#0005;padding:24px';
        veil.innerHTML='<section class="kiwi-modal" style="background:var(--surface);padding:20px;border-radius:20px;width:min('+opts.width+'px,95vw);max-height:95vh;overflow:auto"><h2>'+opts.title+'</h2><div class="kiwi-modal-body">'+(opts.body||'')+'</div>'+ (opts.foot||'')+'</section>';
        document.body.append(veil);return{el:veil,close:()=>veil.remove()};
      }};
      document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button && /^bpd-/.test(button.dataset.action))Kiwi.handlers[button.dataset.action]?.(button,button.dataset.arg);});
      document.getElementById('fixture-open-promos').onclick=()=>Kiwi.handlers['nav-promos']();
      document.getElementById('fixture-close-promos').onclick=()=>{panel.hidden=true;};
    });
    await page.addScriptTag({path:path.join(ROOT,'assets/boutique-promos-dashboard.js')});
    async function ordinaryDate(selector,year) {
      // Actual pointer/keyboard input in the ordinary month/day-first order.
      // January 1 is invariant under month/day versus day/month ordering.
      await page.click(selector,{offset:{x:18,y:20}});
      for(let i=0;i<4;i++)await page.keyboard.press('ArrowLeft');
      await page.evaluate(selector=>{window.__promoDateNode=document.querySelector(selector);},selector);
      await page.keyboard.type('1');await page.keyboard.press('ArrowRight');
      await page.keyboard.type('1');await page.keyboard.press('ArrowRight');
      await page.keyboard.type(String(year));
      const state=await page.evaluate(selector=>({value:document.querySelector(selector).value,focus:document.activeElement.id,same:window.__promoDateNode===document.querySelector(selector),editedValue:window.__promoDateNode.value}),selector);
      check(state.same && state.focus===selector.slice(1) && state.value===year+'-01-01',theme+': ordinary date typing preserves control, focus and full year '+selector+' '+JSON.stringify(state));
      await page.keyboard.press('Tab');
      return page.$eval(selector,el=>el.value);
    }
    async function editNumber(selector,value) {
      await page.click(selector,{clickCount:3});
      await page.evaluate(selector=>{window.__promoNumberNode=document.querySelector(selector);},selector);
      // Headless macOS Chrome does not consistently execute Command+A in
      // number controls. Pointer selection + real editing keys stays at the
      // actual input boundary and also covers an existing normalized value.
      for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');
      for(let i=0;i<8;i++)await page.keyboard.press('Backspace');
      check(await page.$eval(selector,el=>el.value)==='',theme+': number field cleared through real editing keys '+selector);
      await page.keyboard.type(String(value));
      const state=await page.evaluate(selector=>({value:document.querySelector(selector).value,focus:document.activeElement.id,same:window.__promoNumberNode===document.querySelector(selector)}),selector);
      check(state.same && state.focus===selector.slice(1) && state.value===String(value),theme+': number typing preserves control and focus '+selector+' '+JSON.stringify(state));
      await page.keyboard.press('Tab');
      check(await page.evaluate(selector=>window.__promoNumberNode===document.querySelector(selector),selector),theme+': number change on blur preserves control '+selector);
      check(await page.$eval(selector,el=>Number(el.value))===Math.max(0,Math.round(Number(value))),theme+': number display normalizes on blur '+selector+' entered '+value);
    }
    const before=await page.evaluate(()=>({report:__promoProof.report(),sales:__promoProof.sales()}));
    await page.click('#fixture-open-promos');
    await page.click('[data-action="bpd-new"]');
    await page.click('[data-prs="stock"]');
    await editNumber('#bpd-max',2.4);
    check(await page.$eval('[data-prm="2"]',el=>el.classList.contains('on')),theme+': fractional stock threshold preview uses its normalized integer');
    await editNumber('#bpd-max',-1);
    check(await page.$eval('#bpd-save',el=>el.disabled),theme+': negative stock threshold is visibly normalized to zero and cannot save');
    await editNumber('#bpd-max',5);
    check(await page.$eval('.bpd-preview-head b',el=>Number(el.textContent))>0 && !await page.$eval('#bpd-save',el=>el.disabled),theme+': stock-threshold typing updates impact and enables save');
    await editNumber('#bpd-max',0);
    check(await page.$eval('.bpd-preview-head b',el=>Number(el.textContent))===0 && await page.$eval('#bpd-save',el=>el.disabled),theme+': empty stock threshold updates impact and disables save');
    await page.click('[data-prs="avant"]');
    check(await page.$eval('#bpd-save',el=>el.disabled),theme+': old-stock promotion without date cannot launch');
    const cutoff=await ordinaryDate('#bpd-before',2025);
    check(cutoff==='2025-01-01',theme+': real date-control input sets the exact old-stock cutoff; got '+cutoff);
    await editNumber('#bpd-value',2.4);
    check(await page.$eval('.bpd-swap .next b',el=>Number(el.textContent.replace(/\D/g,'')))===2352,theme+': fractional discount preview uses the displayed normalized integer');
    await editNumber('#bpd-value',-1);
    check(await page.$eval('#bpd-save',el=>el.disabled),theme+': negative discount normalizes to zero and cannot save');
    await editNumber('#bpd-value',30);
    check(await page.$eval('.bpd-swap .next b',el=>Number(el.textContent.replace(/\D/g,'')))===1680 && await page.$eval('[data-prv="30"]',el=>el.classList.contains('on')),theme+': numeric discount updates live impact and active quick choice');
    await editNumber('#bpd-value',20);
    check(await page.$eval('.bpd-swap .next b',el=>Number(el.textContent.replace(/\D/g,'')))===1920,theme+': numeric discount restores 20% preview without replacing form');
    await ordinaryDate('#bpd-from',2020);
    await ordinaryDate('#bpd-to',2019);
    check(await page.$eval('#bpd-save',el=>el.disabled),theme+': typed end before start disables save without replacing date controls');
    await ordinaryDate('#bpd-to',2030);
    check(!await page.$eval('#bpd-save',el=>el.disabled),theme+': correcting the typed range restores save without replacing date controls');
    await page.type('#bpd-name','TEST KIWI old stock');
    check(await page.$eval('.bpd-preview-head b',el=>Number(el.textContent))===1,theme+': ISO old-stock scope previews exactly one product');
    await page.click('#bpd-save');
    const promo=await page.evaluate(()=>KiwiPromos.list()[0]);
    check(promo.value===20 && promo.scope.type==='avant',theme+': actual composer creates 20% old-stock promotion');
    await page.click('#fixture-close-promos');
    async function saleAt(percent,label) {
      const expected=Math.round(items.old.price*(100-percent)/100);
      await page.waitForSelector(`[data-bq-item="${items.old.id}"]`);
      check(await page.$eval(`[data-bq-item="${items.old.id}"]`,el=>el.classList.contains('is-promo'))===(percent>0),theme+' '+label+': till card promo state matches dashboard');
      const cardPrice=await page.$eval(`[data-bq-item="${items.old.id}"] .bq-card-price`,el=>Number([...el.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').replace(/\D/g,'')));
      check(cardPrice===expected,theme+' '+label+': visible product card displays the actual discounted/full price');
      check(!await page.$eval(`[data-bq-item="${items.recent.id}"]`,el=>el.classList.contains('is-promo')),theme+' '+label+': recent ISO stock is never discounted');
      await page.click(`[data-bq-item="${items.old.id}"]`);
      await page.waitForSelector('#bq-sheet-add',{visible:true});
      check(await page.$eval('#bq-sheet-total',el=>Number(el.textContent.replace(/\D/g,'')))===expected,theme+' '+label+': visible variant sheet agrees with the product card');
      await page.click('#bq-sheet-add');
      const totals=await page.evaluate(()=>__promoProof.ticket());
      check(totals.sub===items.old.price && totals.total===expected && totals.promo===items.old.price-expected,theme+' '+label+': actual ticket totals equal the applicable advertised discount');
      check(await page.$eval('.bq-tk-total .val',el=>Number(el.textContent.replace(/\D/g,'')))===expected,theme+' '+label+': visible ticket total matches the real ticket calculation');
      await page.click('#bq-validate');
      await page.waitForSelector('[data-bq-m="especes"]',{visible:true});
      await page.click('[data-bq-m="especes"]');
      check(await page.$eval('#bq-cash-in',el=>Number(el.value))===expected,theme+' '+label+': cash screen charges the same ticket amount');
      await page.click('#bq-cash-ok');
      // Cash closes the payment sheet; only delivery uses stepSuccess.
      // No printer bridge/runtime is loaded, so the automatic receipt attempt
      // returns "unavailable" without contacting hardware or window.print.
      await page.waitForSelector('#bq-pay-veil.is-open',{hidden:true});
      const sold=await page.evaluate(()=>__promoProof.sales()[0]);
      check(sold.total===expected && sold.lines.length===1 && sold.lines[0].unit===expected && sold.promoOff===items.old.price-expected,theme+' '+label+': settled demo journal preserves charged price and promotion');
      return{expected,sold};
    }
    const created=await saleAt(20,'created');
    await page.click('#fixture-open-promos');
    await page.click(`[data-action="bpd-edit"][data-arg="${promo.id}"]`);
    await page.click('[data-prv="30"]');
    await page.click('#bpd-save');
    check(await page.evaluate(id=>KiwiPromos.get(id).value,promo.id)===30,theme+': actual composer edits promotion to 30%');
    await page.click('#fixture-close-promos');
    const edited=await saleAt(30,'edited');
    await page.click('#fixture-open-promos');
    await page.click(`[data-action="bpd-toggle"][data-arg="${promo.id}"]`);
    check(await page.evaluate(id=>KiwiPromos.get(id).paused,promo.id),theme+': actual owner pause action deactivates promotion');
    await page.click('#fixture-close-promos');
    const paused=await saleAt(0,'paused');
    const after=await page.evaluate(()=>({report:__promoProof.report(),sales:__promoProof.sales(),totals:__promoProof.totals(),prints:window.__fixturePrintCalls,real:KiwiEnv.isReal()}));
    const expected=created.expected+edited.expected+paused.expected;
    check(after.report.net-before.report.net===expected && after.report.methods.cash-before.report.methods.cash===expected,theme+': actual Z projection net and cash equal the three actual discounted/full-price payments');
    check(after.report.txns-before.report.txns===3 && after.sales.length-before.sales.length===3,theme+': Z and demo journal count exactly three new sales');
    check(after.sales.find(s=>s.id===created.sold.id).total===created.expected && after.sales.find(s=>s.id===edited.sold.id).total===edited.expected,theme+': editing/pausing never reprices already-settled sales');
    check(!after.real && apiWrites===0 && after.prints===0,theme+': no real identity, API writes, printing or hardware operations');
    await context.close();
  }
  console.log(`promotions sale/Z browser integration: ${checks} checks passed; local demo only, native and cross-device acceptance remain separate`);
} finally {
  if(browser){await browser.close();releaseExitedBrowserStreams(browser.process());}
  const exited=once(fixture,'exit');fixture.kill('SIGTERM');await exited;
}
