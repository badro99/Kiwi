#!/usr/bin/env node
// Actual Promotions component/locale/CSS rendering in isolated fixtures.
// This is not native, paired, hosted-sale or archived-Z acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { releaseExitedBrowserStreams } from './browser-test-lifecycle.mjs';
import { paintedActionColours, decodeScreenshot } from './painted-png.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'assets/boutique-promos-dashboard.js'),'utf8');
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('  ✓ '+label);};
const pureHook=`window.__bpdPure={rows:typeof COPY==='undefined'?[]:COPY,tr:typeof tr==='undefined'?null:tr,scopeText,whenText,money,fmtDay};`;
export function validateSource(actualSource, report=check) {
  let locale='fr';
  const window={Kiwi:{handlers:{}},KiwiPromos:{status:p=>p.paused?'paused':p.from>Date.now()?'scheduled':p.to&&p.to<Date.now()?'ended':'active'},addEventListener:()=>{}};
  const context=vm.createContext({window,document:{readyState:'loading',addEventListener:()=>{},documentElement:{lang:'fr'}},localStorage:{getItem:()=>locale},Intl,Date,NodeFilter:{SHOW_TEXT:4}});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/i18n.js'),'utf8'),context);
  const at=actualSource.lastIndexOf('})();');
  assert.ok(at>=0,'Actual component closure exists');
  vm.runInContext(actualSource.slice(0,at)+pureHook+'\n'+actualSource.slice(at),context);
  const proof=window.__bpdPure;
  report(typeof proof.tr==='function','actual component declares scoped authored translation');
  report(proof.rows.length>=100,'full Promotions interface vocabulary declared');
  const keys=new Set();
  for(const row of proof.rows){
    report(row.length===3 && row.every(x=>typeof x==='string'&&x.trim()),'FR/EN/AR authored tuple: '+row[0]);
    report(!keys.has(row[0]),'unique authored source: '+row[0]);keys.add(row[0]);
    report(row[1]!==row[0] || row[0]==='Promotions','English translated or exact identity: '+row[0]);
    report(/[\u0600-\u06ff]/.test(row[2]),'Arabic authored copy: '+row[0]);
  }
  const expected={fr:['Créer une promotion','Définir l’offre','Prix promo'],en:['Create a promotion','Define the offer','Promotion price'],ar:['إنشاء عرض ترويجي','تحديد العرض','سعر العرض']};
  for(locale of ['fr','en','ar']){
    for(const [i,key] of ['Créer une promotion','Définir l’offre','Prix promo'].entries()) report(proof.tr?.(key)===expected[locale][i],locale+': exact visible copy '+key);
    const name='Prix promo <&> منتجات \u2067RTL\u2069';
    report(proof.tr?.('{name} enregistrée',{name}).includes(name),locale+': merchant collision/markup/RTL bytes preserved');
    report(proof.scopeText({products:{p:{name}},rayons:[]},{scope:{type:'produits',ids:['p']}})===name,locale+': product name is data, not copy');
    report(proof.money(12345).endsWith(' MAD') && Number(proof.money(12345).replace(/\D/g,''))===12345,locale+': money value/currency preserved');
    const money=locale==='en'?'12,345 MAD':'12\u202f345 MAD';
    report(proof.money(12345.4)===money,locale+': actual public KiwiNumber money keeps zero-digit rounded precision');
    report(proof.money(12345.5)===(locale==='en'?'12,346 MAD':'12\u202f346 MAD'),locale+': original Math.round precedes actual public formatter');
    const date=proof.fmtDay(new Date('2030-01-02T12:00:00Z'));
    report(locale==='ar'?/[\u0600-\u06ff]/.test(date):locale==='en'?date.includes('Jan'):date.includes('janv'),locale+': calendar month actually localized');
  }
}

validateSource(source);
if(process.argv.includes('--pure')){
  console.log(`\n✓ Promotions pure locale: ${checks} checks passed.`);
} else {
  const require=createRequire(path.join(ROOT,'app/package.json'));
  const puppeteer=require('puppeteer-core');
  const executablePath=process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
  assert.ok(executablePath,'Chromium required');
  const fixture=spawn(process.execPath,[path.join(ROOT,'tools/retail-ui-fixture.mjs')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
  const fixtureClosed=new Promise(resolve=>fixture.once('close',(code,signal)=>resolve({code,signal})));
  const shots=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-promotions-locale-'));
  let browser, primaryFailure;
  const cleanupFailures=[];
  console.log(`  owned fixture PID: ${fixture.pid}; screenshot directory: ${shots}`);
  const dashboard=fs.readFileSync(path.join(ROOT,'dashboard.html'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
  const styles=[...dashboard.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>|<style[^>]*>[\s\S]*?<\/style>/g)].map(m=>{
    const href=m[0].match(/href="([^"]+)"/)?.[1];
    return href ? (href.startsWith('assets/') ? {href} : null) : {content:m[0].replace(/^<style[^>]*>|<\/style>$/g,'')};
  }).filter(Boolean);
  const rgb=text=>text.match(/[\d.]+/g).slice(0,3).map(Number);
  const componentPage='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiBoutiqueVenueKey=()=>"maisonMansour";</script><script src="/assets/venue-store.js"></script><script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script><script src="/assets/discount-policy.js"></script><script src="/assets/boutique-catalog.js"></script><script src="/assets/promos.js"></script></head><body><main class="app"><section class="container"><button data-action="nav-promos">Promotions fixture route</button><div class="lang"><span>fr</span><span>en</span><span>ar</span></div></section></main></body></html>';
  const luminance=colour=>colour.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  try{
    const base=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Retail fixture readiness timeout')),15000);
      fixture.once('exit',code=>{clearTimeout(timer);reject(new Error('Fixture exited '+code));});
      fixture.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);if(m){clearTimeout(timer);resolve(JSON.parse(m[1]).base);}});
    });
    browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
    console.log(`  owned browser PID: ${browser.process().pid}`);
    for(const locale of ['fr','en','ar']) for(const theme of ['light','dark']){
      const context=await browser.createBrowserContext();
      try{
        const page=await context.newPage();let writes=0,external=0;
        await page.setViewport({width:402,height:874,deviceScaleFactor:1,isMobile:true,hasTouch:true});
        await page.setRequestInterception(true);
        page.on('request',request=>{
          const u=new URL(request.url());
          if(u.origin!==base&&!['data:','blob:'].includes(u.protocol)){external++;return request.abort();}
          if((u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))&&!['GET','HEAD'].includes(request.method())){writes++;return request.abort();}
          if(u.origin===base&&u.pathname==='/promos-locale.html')return request.respond({status:200,contentType:'text/html',body:componentPage});
          request.continue();
        });
        await page.goto(base+'/promos-locale.html',{waitUntil:'networkidle0'});
        await page.waitForFunction(()=>window.KiwiBoutiqueCatalog&&window.KiwiPromos);
        for(const style of styles)await page.addStyleTag(style.href?{url:base+'/'+style.href}:{content:style.content});
        await page.addStyleTag({path:path.join(ROOT,'app/src/native-runtime.css')});
        // Isolated component shell only. Actual appPage/modal/router and price
        // engine are loaded below; no handwritten modal/price DOM is used.
        await page.evaluate(({locale,theme})=>{
          localStorage.setItem('kiwiLang',locale);
          document.documentElement.classList.add('kiwi-native');
          document.documentElement.dataset.theme=theme;
          document.documentElement.dataset.vexelMode=theme;
          document.body.className='design-2026 design-ios27 design-vexel kiwi-native-owner';
          document.body.dataset.vexelMode=theme;
          window.KiwiBoutiqueVenueKey=()=>KiwiBoutiqueCatalog.currentVenue();
          window.__promoWrites=0;
          for(const name of ['save','remove','setPaused'])KiwiPromos[name]=()=>{window.__promoWrites++;throw new Error('Promotion writes forbidden in this draft fixture');};
        },{locale,theme});
        await page.addScriptTag({path:path.join(ROOT,'assets/i18n.js')});
        await page.addScriptTag({path:path.join(ROOT,'assets/interactive.js')});
        await page.addScriptTag({path:path.join(ROOT,'assets/lucide.min.js')});
        await page.addScriptTag({path:path.join(ROOT,'assets/boutique-promos-dashboard.js')});
        await page.click('[data-action="nav-promos"]');
        await page.waitForSelector('.bpd-page');
        const label=locale==='fr'?'Créer une promotion':locale==='en'?'Create a promotion':'إنشاء عرض ترويجي';
        check(await page.$eval('.bpd-main-cta',el=>el.textContent.trim())===label,`${locale}/${theme}: real page copy localized`);
        await page.click('[data-action="bpd-new"]');
        await page.waitForSelector('#bpd-name',{visible:true});
        await page.waitForFunction(()=>{
          const modal=document.querySelector('.kiwi-backdrop.in .kiwi-modal');
          if(!modal)return false;
          const transform=getComputedStyle(modal).transform.replace(/\s/g,'');
          return transform==='none'||transform==='matrix(1,0,0,1,0,0)';
        });
        await page.click('#bpd-name');
        await page.waitForFunction(()=>{const input=document.querySelector('#bpd-name'),r=input.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input;});
        const merchant='Prix promo <&> منتجات \u2067RTL\u2069';
        await page.type('#bpd-name',merchant);
        await page.evaluate(()=>{window.__promoInput=document.querySelector('#bpd-name');window.__promoDates=[document.querySelector('#bpd-from'),document.querySelector('#bpd-to')];});
        const title=await page.$eval('.kiwi-modal-head h3',el=>el.textContent);
        check(title===label,`${locale}/${theme}: actual modal title localized`);
        for(const target of ['en','ar','fr',locale]){
          // Public production language contract while a draft is focused, not
          // a pretend native tap on a language control behind the modal.
          await page.evaluate(target=>KiwiI18n.setLang(target),target);
          check(await page.evaluate(merchant=>document.querySelector('#bpd-name')===window.__promoInput&&document.activeElement===window.__promoInput&&window.__promoInput.value===merchant&&window.__promoDates.every(n=>n.isConnected),merchant),`${locale}/${theme}: ${target} preserves focused draft/input/date nodes`);
          check(await page.$eval('.kiwi-modal-head h3',el=>el.textContent)===(target==='fr'?'Créer une promotion':target==='en'?'Create a promotion':'إنشاء عرض ترويجي'),`${locale}/${theme}: ${target} updates modal copy`);
          const spaced=await page.evaluate(()=>({label:document.querySelector('#bpd-name').previousElementSibling.textContent,give:document.querySelector('.bpd-give').textContent,amount:document.querySelector('.bpd-give b').textContent}));
          const wording={fr:['Nom · visible sur le reçu','Vous offrez','si tout part.'],en:['Name · visible on the receipt','You give','if everything sells.'],ar:['الاسم · يظهر على الإيصال','تمنح','إذا بيعت كل المنتجات.']}[target];
          check(spaced.label===wording[0],`${locale}/${theme}: ${target} exact name label whitespace preserved`);
          check(spaced.give===wording[1]+' '+spaced.amount+' '+wording[2],`${locale}/${theme}: ${target} exact copy/amount boundaries preserved`);
        }
        await page.$eval('.kiwi-modal-head h3',el=>el.scrollIntoView({block:'nearest'}));
        const geometry=await page.evaluate(()=>{
          const heading=document.querySelector('[data-bpd-dialog] .kiwi-modal-head h3');
          const close=document.querySelector('[data-bpd-dialog] .kiwi-modal-close');
          const modal=heading.closest('.kiwi-modal');
          const r=heading.getBoundingClientRect(),c=close.getBoundingClientRect(),m=modal.getBoundingClientRect();
          const hit=document.elementFromPoint(c.x+c.width/2,c.y+c.height/2);
          const range=document.createRange();range.selectNodeContents(heading);
          const title=[...range.getClientRects()].every(t=>t.left>=m.left&&t.right<=m.right&&!(t.left<c.right&&t.right>c.left&&t.top<c.bottom&&t.bottom>c.top));
          const prices=document.querySelector('.bpd-srow .prices'),old=prices.querySelector('s'),next=prices.querySelector('b');
          const a=old.getBoundingClientRect(),b=next.getBoundingClientRect();
          const nodes=[...document.querySelectorAll('.bpd-preview [data-bpd-money]')];
          const isolated=nodes.every(node=>{
            const s=getComputedStyle(node),text=node.firstChild,at=node.textContent.indexOf('MAD');
            if(!node.hasAttribute('data-no-num-fix')||s.direction!=='ltr'||s.unicodeBidi!=='isolate'||at<1||text.nodeType!==Node.TEXT_NODE)return false;
            const number=document.createRange(),currency=document.createRange();
            number.setStart(text,0);number.setEnd(text,at);
            currency.setStart(text,at);currency.setEnd(text,at+3);
            return number.getBoundingClientRect().right<=currency.getBoundingClientRect().left+1;
          });
          return{title,rects:{heading:r.toJSON(),close:c.toJSON(),modal:m.toJSON(),old:a.toJSON(),next:b.toJSON()},closeSize:c.width>=44&&c.height>=44,closeHit:hit===close||!!hit?.closest('.kiwi-modal-close'),
            titleFits:r.width>0&&r.left>=m.left&&r.right<=m.right,
            separated:a.right+5<=b.left,isolated,
            values:[document.querySelector('.bpd-swap>div:first-child b').textContent,document.querySelector('.bpd-swap .next b').textContent,old.textContent,next.textContent],
            expected:[28750,23000,2400,1920].map(n=>KiwiNumber.money(n))};
        });
        console.log(`  ${locale}/${theme}: actual geometry ${JSON.stringify(geometry)}`);
        await page.screenshot({path:path.join(shots,`${locale}-${theme}-geometry.png`)});
        check(geometry.title&&geometry.titleFits,`${locale}/${theme}: actual heading is unclipped and clear of close target`);
        check(geometry.closeSize&&geometry.closeHit,`${locale}/${theme}: actual close target is >=44px and hit-test reachable`);
        check(geometry.separated,`${locale}/${theme}: actual old/new price boxes have >=5px separation in source order`);
        check(geometry.isolated,`${locale}/${theme}: every preview amount/currency has rendered LTR order in an opaque isolated data node`);
        check(geometry.values.every((value,i)=>value===geometry.expected[i]),`${locale}/${theme}: exact model amounts and public formatter bytes preserved`);
        await page.click('#bpd-name');
        const targets=['.bpd-preview-head b','.bpd-swap>div:first-child b','.bpd-swap .next b','.bpd-srow s','.bpd-srow b','#bpd-save'];
        for(const selector of targets){
          await page.$eval(selector,el=>el.scrollIntoView({block:'center'}));
          const paint=await page.$eval(selector,el=>{const r=el.getBoundingClientRect();return{ink:getComputedStyle(el).color,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};});
          const screenshot=await page.screenshot({path:path.join(shots,`${locale}-${theme}-${targets.indexOf(selector)}.png`)});
          const colours=paintedActionColours(screenshot,rgb(paint.ink),paint.bounds);
          const ratio=contrast(colours.foreground,colours.background);
          check(ratio>=4.5,`${locale}/${theme}: actual PNG ${selector} text contrast ${ratio.toFixed(3)} >=4.5`);
        }
        await page.click('#bpd-name');
        const control=await page.$eval('#bpd-name',el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{ring:s.borderTopColor,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};});
        const frame=decodeScreenshot(await page.screenshot({path:path.join(shots,`${locale}-${theme}-focused-control.png`)}));
        const expectedRing=rgb(control.ring),r=control.bounds;
        let ringPixels=0,paintedRing=null;const surfaces=new Map();
        for(let y=Math.max(0,Math.floor(r.y-4));y<Math.min(frame.height,Math.ceil(r.y+r.height+4));y++)for(let x=Math.max(0,Math.floor(r.x-4));x<Math.min(frame.width,Math.ceil(r.x+r.width+4));x++){
          const i=(y*frame.width+x)*frame.channels,c=[...frame.pixels.subarray(i,i+3)];
          if(c.every((v,k)=>Math.abs(v-expectedRing[k])<=1)){ringPixels++;paintedRing=c;}
          if(x>r.x+8&&x<r.x+r.width-8&&y>r.y+8&&y<r.y+r.height-8){const key=c.join(',');surfaces.set(key,(surfaces.get(key)||0)+1);}
        }
        const surface=[...surfaces].sort((a,b)=>b[1]-a[1])[0]?.[0].split(',').map(Number);
        check(ringPixels>=20&&surface&&contrast(paintedRing,surface)>=3,`${locale}/${theme}: actual PNG focus border paints >=3:1 against input (${ringPixels} pixels)`);
        await page.click('[data-bpd-cancel]');
        await page.waitForFunction(()=>!document.querySelector('[data-bpd-host]'));
        check(await page.evaluate(()=>KiwiPromos.list().length===0&&window.__promoWrites===0),`${locale}/${theme}: ordinary cancel leaves no offer or writes`);
        check(writes===0,`${locale}/${theme}: no API/auth writes`);
        check(await page.evaluate(()=>document.documentElement.lang)===locale,`${locale}/${theme}: locale roundtrip restored`);
        console.log(`  fixture screenshot directory: ${shots}; external requests blocked: ${external}`);
      }finally{await context.close();}
    }
  }catch(error){
    primaryFailure=error;
    console.error('PRIMARY RENDER FAILURE:\n'+error.stack);
  }finally{
    try{
      if(browser){
        const child=browser.process();
        const exited=child.exitCode!==null||child.signalCode!==null
          ? Promise.resolve({code:child.exitCode,signal:child.signalCode})
          : new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
        const browserClosed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
        await browser.close();
        const exit=await exited;
        console.log(`  owned browser true exit: ${JSON.stringify(exit)}`);
        releaseExitedBrowserStreams(child);
        const closed=await browserClosed;
        console.log(`  owned browser true close: ${JSON.stringify(closed)}`);
        check(child.exitCode!==null||child.signalCode!==null,'owned browser process truly exited (actual code/signal reported)');
        check(closed.code===exit.code&&closed.signal===exit.signal,'owned browser true close agrees with actual exit');
        check(child.stdio.every(stream=>!stream||stream.destroyed),'owned browser pipe ends destroyed after true exit');
      }
    }catch(error){
      cleanupFailures.push(error);
      console.error('BROWSER CLEANUP FAILURE:\n'+error.stack);
    }finally{
      try{
        if(fixture.exitCode===null&&fixture.signalCode===null)fixture.kill('SIGTERM');
        const closed=await fixtureClosed;
        console.log(`  owned fixture true close: ${JSON.stringify(closed)}`);
        fixture.stdout.destroy();fixture.stderr.destroy();
        check(closed.code===0&&closed.signal===null,'owned fixture completed graceful server.close callback and true child close 0');
        check(fixture.stdout.destroyed&&fixture.stderr.destroyed,'owned fixture pipe ends destroyed after true close');
      }catch(error){
        cleanupFailures.push(error);
        console.error('FIXTURE CLEANUP FAILURE:\n'+error.stack);
      }
    }
  }
  if(primaryFailure)throw primaryFailure;
  if(cleanupFailures.length)throw new AggregateError(cleanupFailures,'Owned resource cleanup failed');
  console.log(`\n✓ Promotions locale rendering: ${checks} checks passed. Original 162-sale/Z guard unchanged.`);
}
