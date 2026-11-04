/* Real browser interactions over live briefing and modifier code. No hosted records. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
import briefingSource from './briefing-test-source.cjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const browser = await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
const S = suite('r16-settings-modifiers',{browser});
const read = f => fs.readFileSync(f,'utf8');
const locales = (process.env.KIWI_LOCALES || 'fr').split(',');
for (const lang of locales) await S.run('briefing interactions '+lang,async t => {
  const context = await browser.createBrowserContext(); t.defer(() => context.close());
  const page = t.watch(await context.newPage());
  await page.setContent('<main><div data-briefing-card></div><button id="outside">Outside</button></main>');
  await page.evaluate(lang => {
    document.documentElement.lang=lang;
    const memory = new Map(); Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});
    window.KiwiEnv={isReal:()=>true}; window.KiwiAgentTier=()=> 'owner';
    window.KiwiCloudDoc={currentSlug:()=> 'fixture'};
    window.fetch=()=>Promise.reject(Error('no network in fixture'));
  },lang);
  await page.addScriptTag({content:briefingSource()});
  await page.evaluate(()=>window.KiwiBriefing._test.render());
  t.step('expand all nine sections with real pointer clicks');
  await page.click('[data-briefing-open="all"] > summary');
  for(let i=0;i<9;i++) {
    await page.click(`[data-briefing-open="rule-${i}"] > summary`);
    assert.equal(await page.$eval(`[data-briefing-open="rule-${i}"]`,el=>el.open),true);
  }
  t.step('edit a shared field then blur, preserving expanded sections');
  const field='[data-briefing-open="rule-4"] [data-briefing-limit="share"]';
  await page.click(field); await page.keyboard.press('Backspace');
  await page.$eval(field,el=>{el.select();}); await page.keyboard.type('12'); await page.click('#outside');
  await page.waitForFunction(()=>window.KiwiBriefing.settings().share===12);
  assert.equal(await page.$$eval('[data-briefing-open^="rule-"]',els=>els.filter(el=>el.open).length),9);
  assert.equal(await page.$eval('[data-briefing-open="rule-5"] [data-briefing-limit="share"]',el=>el.value),'12');
  t.step('invalid value stays local and announces its error');
  await page.click(field); await page.$eval(field,el=>el.select()); await page.keyboard.type('1000'); await page.click('#outside');
  assert.equal(await page.$eval(field,el=>el.getAttribute('aria-invalid')),'true');
  assert.ok(await page.$eval('#briefing-error-4-share',el=>el.textContent.length>0));
  assert.equal(await page.evaluate(()=>window.KiwiBriefing.settings().share),12);
  t.step('reset one rule updates every shared instance');
  await page.click('[data-briefing-reset="4"]');
  const values=await page.$$eval('[data-briefing-limit="share"]',els=>els.map(el=>el.value));
  assert.equal(new Set(values).size,1); assert.notEqual(values[0],'12');
  await page.click('[data-briefing-open="rule-4"] > summary');
  assert.equal(await page.$eval('[data-briefing-open="rule-4"]',el=>el.open),false);
});
await S.run('modifier debounce, pointer focus and remote conflict',async t=>{
  const context=await browser.createBrowserContext(); t.defer(()=>context.close());
  const page=t.watch(await context.newPage());
  await page.setContent('<main id="modal"></main>');
  await page.evaluate(()=>{
    const memory=new Map(); Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}});
    window.base={cats:[{id:'cat',name:'Carte'}],items:[{id:'item',name:'Dish',price:10}],opts:[{id:'g',name:'Base',kind:'one',choices:[{id:'c',name:'Choice',price:0}]}]};
    window.menu=structuredClone(window.base); window.remote=structuredClone(window.base); window.notices=[];
    window.KiwiEnv={isReal:()=>true}; window.KiwiConfig={storeSlug:()=> 'shop',type:'restaurant'};
    window.KiwiVenue={isCustom:()=>true,getCurrentVenueData:()=>({id:'v1',type:'restaurant'})};
    window.KiwiStore={define:()=>({get:()=>window.menu,set:d=>{window.menu=d;},update:fn=>{window.menu=fn(window.menu);},subscribe(){}})};
    window.Kiwi={toast:m=>window.notices.push(m),modal:()=>{
      const el=document.querySelector('#modal'); el.innerHTML='<div data-og-body></div><button data-og-close>Close</button>';
      return {el,close:()=>{el.innerHTML='';}};
    }};
    window.fetch=async()=>({ok:true,json:async()=>({merchant:'shop',updatedTs:2,menu:window.remote})});
  });
  const entry=read('assets/menu-catalog.js');
  await page.addScriptTag({content:entry.slice(0,entry.indexOf('/* MENU RULES END */'))});
  await page.addScriptTag({content:read('assets/menu-catalog/state.js').replace('    return { store, catById,','    return { pull, store, catById,')});
  await page.addScriptTag({content:read('assets/menu-catalog/modifiers.js')});
  await page.evaluate(()=>{
    const tr=x=>typeof x==='object'?x.en:x;
    const api=window.KiwiMenuCatalogParts.state({rules:window.KiwiMenuRules,tr,T:{},STATION_COLORS:[],render(){},createFormulas:()=>({})});
    window.api=api;
    window.KiwiMenuCatalogParts.modifiers({...api,tr,T:{},esc:s=>String(s??''),venueName:()=> 'Fixture',PLUS:'+',TRASH:'Delete',confirmThen:(_,fn)=>fn(),render(){}}).optsModal();
  });
  t.step('type a group name and move pointer focus before the debounce fires');
  await page.click('[data-og-name="g"]'); await page.$eval('[data-og-name="g"]',el=>el.select()); await page.keyboard.type('Local');
  await page.click('[data-oc-price="g::c"]');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].name),'Local','focusout flushes group edit');
  await page.keyboard.type('12.34');
  await page.click('[data-og-kind="g::many"]');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].choices[0].price),12.34,'pointer repaint flushes centime price');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].kind),'many');
  t.step('real pull merges a conflicting remote value while a new field edit is pending');
  await page.click('[data-oc-name="g::c"]'); await page.$eval('[data-oc-name="g::c"]',el=>el.select()); await page.keyboard.type('Pending');
  await page.evaluate(async()=>{
    window.remote.opts[0].name='Remote';
    localStorage.setItem('kiwiMenuPending:shop',JSON.stringify({vid:'v1',base:window.base,data:window.menu}));
    await window.api.pull();
  });
  assert.equal(await page.$eval('[data-oc-name="g::c"]',el=>document.activeElement===el),true,'remote pull leaves pointer focus in editor');
  await page.click('[data-og-close]');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].choices[0].name),'Pending','close flushes pending edit onto merged document');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].name),'Remote','same-field conflict keeps server winner');
  assert.equal(await page.evaluate(()=>window.menu.opts[0].choices[0].price),12.34);
  assert.equal(await page.evaluate(()=>window.notices.length),1,'conflict is explained once');
});
await browser.close();
await S.finish();
