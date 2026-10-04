#!/usr/bin/env node
// Local bundled demos plus script-free, already-open Team/Kitchen fixtures.
// No credentials, digit entry, gate bypass or merchant network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from './build-app-www.mjs';
import { demoClockFixture, installDemoClock } from './native-demo-clock-fixture.mjs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pass2-'));
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
const demoTime = demoClockFixture();
async function phone(lang, dark=false, signedOut=false, epochMs=demoTime.midServiceMs) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.emulateTimezone(demoTime.timezone);
  // Install a coherent clock before any application script starts. Never jump
  // an already-running demo, which would exercise the unrelated idle lock.
  await page.evaluateOnNewDocument(installDemoClock,epochMs);
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
// Read the real production ledger and renderer, never substitute DOM figures.
function demoState() {
  const clock=window.KiwiDemoClock, dr=window.KiwiDayReport;
  if (!clock?.isActive?.() || !dr || document.querySelector('[data-kiwi-lock]')) return null;
  const sim=clock.getSimState();
  if (!sim) return null;
  const before=dr.shiftDay(dr.today(),-1), bounds=dr.dayBounds(before);
  const cut=bounds.from+sim.fraction*(bounds.to-bounds.from);
  const previous=clock.getDaySales(before).filter(row=>row.ts<=cut);
  const chart=document.querySelector('[data-rev-hero-delta]');
  const hero=document.querySelector('[data-hero-delta="hier"] [data-hero-delta-val]');
  const pct=text=>Number((text.match(/([+−-]?[\d.,]+)\s*%/)||[])[1]?.replace('−','-').replace(',','.'));
  return {timezone:dr.timezone(),now:Date.now(),date:new Date().getTime(),
    rows:clock.getDaySales().length,priorRows:previous.length,
    priorAmount:previous.reduce((sum,row)=>sum+Math.round(row.amount*100),0)/100,
    chartExists:!!chart,chartText:chart?.textContent || '',heroExists:!!hero,
    deltas:[pct(chart?.textContent || ''),pct(hero?.textContent || '')]};
}
function menuCloseState() {
  return {viewport:[innerWidth,innerHeight],dir:document.documentElement.dir,
    open:document.body.classList.contains('kiwi-native-menu-open'),
    buttons:[...document.querySelectorAll('.kiwi-native-menu-close')].map(button=> {
      const r=button.getBoundingClientRect(), s=getComputedStyle(button);
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},visibility:s.visibility,
        display:s.display,menuTransform:getComputedStyle(button.closest('.kiwi-native-menu')).transform,
        hit:hit?.className || null,hitIsButton:button.contains(hit)};
    })};
}
try {
  const privacyKeys=['NSMicrophoneUsageDescription','NSSpeechRecognitionUsageDescription','NSCameraUsageDescription','NSFaceIDUsageDescription','NSLocalNetworkUsageDescription'];
  for(const file of ['Info.plist',...['fr','en','ar'].map(lang=>lang+'.lproj/InfoPlist.strings')]) {
    const content=fs.readFileSync(path.join(root,'app/ios/App/App',file),'utf8');
    check(privacyKeys.every(key=>content.includes(key)),file+': all five privacy purposes present');
  }
  // Invalid/empty native login uses only an empty password, never credentials.
  for (const lang of ['fr','en','ar']) {
    const {page,context,authRequests} = await phone(lang,false,true);
    await page.goto(base+'/index.html',{waitUntil:'networkidle2'});
    await page.waitForFunction(()=>window.__host?.screen==='setup');
    for (const email of ['', 'invalid-email']) {
      await page.evaluate(email=>window.KiwiNativeHostAction({action:'login',email,password:''}),email);
      await page.waitForFunction(()=>window.__host?.statusKind==='error' && window.__host.status.length>0);
      check(await page.$eval('#login-err',e=>!e.hidden && e.textContent.length>0),lang+': native invalid sign-in returns a visible error');
      check(authRequests()===0,lang+': invalid sign-in never reaches authentication');
    }
    // Native host context is asserted above; Chromium cannot paint Swift UI.
    // Do not save a misleading blank web screenshot as sign-in evidence.
    await context.close();
  }
  // Local onboarding only: synthetic names, no code, no final account creation.
  for (const lang of ['fr','ar']) {
    const {page,context,verificationRequests}=await phone(lang);
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await page.waitForSelector('.kob-root .kob-foot .primary');
    for(let step=0;step<=6;step++) {
      if(step===6) {
        await page.click('[data-pin-add]'); await page.click('[data-pin-add]');
      }
      const box = await page.$eval('.kob-foot .primary',e=> {
        e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,height:r.height,overflow:document.documentElement.scrollWidth-innerWidth};
      });
      check(box.top>=62 && box.bottom<=840 && box.height>=44 && box.overflow<=0,`${lang}: onboarding step ${step} primary reachable `+JSON.stringify(box));
      if(step===6) {
        check(await page.$eval('.kob-top',e=>e.getBoundingClientRect().top>=62),'scrolled onboarding header stays below status strip');
        check(await page.$$eval('[data-pin-code]',nodes=>nodes.every(n=>n.value==='')),'no onboarding code entered');
        await page.screenshot({path:path.join(work,`onboarding-access-${lang}.png`)});
        await page.click('.kob-foot [data-go="back"]');
        check(await page.$('[data-f="dailyGoal"]')!==null,'long onboarding can return to previous step');
        break;
      }
      if(step===1) await page.type('[data-f="ownerName"]','Layout Review');
      if(step===2) {
        await page.click('.kob-foot .primary');
        check(await page.$eval('.kob-err',e=>e.getAttribute('role')==='alert' && e.textContent.length>0),'empty business name gives inline accessible feedback');
        await page.type('[data-f="bizName"]','Local Layout Fixture');
      }
      await page.click('.kob-foot .primary');
      await sleep(400);
    }
    check(verificationRequests()===0,'onboarding layout check does not verify any code');
    await context.close();
  }
  for (const lang of ['fr','en','ar']) for (const dark of [false,true]) {
    const {page,context,verificationRequests} = await phone(lang,dark);
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await page.waitForSelector('.kob-root [data-explore]',{visible:true});
    await page.click('.kob-root [data-explore]');
    await page.waitForSelector('.kob-root',{hidden:true});
    await page.waitForSelector('.kiwi-native-owner-keypad',{visible:true});
    const keypad = await page.evaluate(()=> {
      const input = document.querySelector('[data-kiwi-pin-input]');
      const pad = document.querySelector('.kiwi-native-owner-keypad');
      return {readonly:input.readOnly,mode:input.inputMode,buttons:[...pad.querySelectorAll('button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})),rtl:document.documentElement.dir,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    check(keypad.readonly && keypad.mode==='none' && keypad.buttons.length===11 && keypad.buttons.every(b=>b.w>=44 && b.h>=44) && keypad.overflow<=0,`${lang}/${dark?'dark':'light'}: keypad suppresses software keyboard, 44pt keys, no overflow`);
    check(await page.$eval('.kiwi-native-backspace',e=>getComputedStyle(e).color===getComputedStyle(e.parentElement).color),'delete glyph inherits readable keypad foreground');
    if(lang==='ar') check(keypad.rtl==='rtl','Arabic gate is RTL, numeric keypad retains conventional order');
    // No digit is entered, even in the local demo. Empty delete cannot authenticate.
    await page.click('.kiwi-native-owner-keypad [data-key="back"]');
    check(verificationRequests()===0,'empty delete never sends a verification request');
    await page.setViewport({width:320,height:568,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const small = await page.evaluate(()=> {
      document.documentElement.style.setProperty('--type-scale','1.35');
      const skip=document.querySelector('[data-kiwi-skip]'); skip.scrollIntoView({block:'end'});
      const r=skip.getBoundingClientRect();
      return {bottom:r.bottom,top:r.top,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    await page.screenshot({path:path.join(work,'small-lock.png')});
    check(small.top>=62 && small.bottom<=535 && small.overflow<=0,'small phone / large text: demo entry clears both safe areas '+JSON.stringify(small));
    await page.setViewport({width:402,height:874,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await page.screenshot({path:path.join(work,`owner-lock-${lang}-${dark?'dark':'light'}.png`)});
    const hidden = await page.evaluate(()=> {
      document.documentElement.classList.add('kiwi-hosted');
      const hidden=getComputedStyle(document.querySelector('[data-kiwi-skip]')).display==='none';
      document.documentElement.classList.remove('kiwi-hosted'); return hidden;
    });
    check(hidden,'native styles do not reveal the demo link on a hosted account');
    await page.click('[data-kiwi-skip]');
    await page.waitForFunction(`(() => { const state=(${demoState})(); return state?.rows > 0 && state.priorAmount > 0 && state.deltas.every(Number.isFinite); })()`,{timeout:10000});
    const ready=await page.evaluate(demoState);
    check(ready.timezone===demoTime.timezone && ready.now===demoTime.midServiceMs && ready.date===ready.now,
      `${lang}/${dark?'dark':'light'}: mid-service clock is coherent before boot`);
    const deltas = await page.evaluate(()=> {
      const get=s=>document.querySelector(s)?.textContent || '';
      const pct=s=>Number((s.match(/([+−-]?[\d.,]+)\s*%/)||[])[1]?.replace('−','-').replace(',','.'));
      return [pct(get('[data-rev-hero-delta]')),pct(get('[data-hero-delta="hier"] [data-hero-delta-val]'))];
    });
    check(deltas.every(Number.isFinite) && Math.abs(deltas[0]-deltas[1])<=0.01,`demo comparisons agree (${deltas.join(' / ')})`);
    check(await page.evaluate(()=>document.querySelectorAll('.kiwi-native-owner-actions button').length===4),'all four quick actions survive locale hydration');
    const goal = await page.$eval('[data-vexel-goal-label]',n=>n.textContent);
    check(goal === ({fr:'Objectif du jour',en:"Today's goal",ar:'هدف اليوم'})[lang],lang+': goal label is translated');
    await page.screenshot({path:path.join(work,`owner-home-${lang}-${dark?'dark':'light'}.png`)});
    check(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight-60)?.classList.contains('kiwi-native-touch-shield')),'capsule footprint absorbs web click-through');
    await page.evaluate(()=> {
      const button=document.createElement('button'); button.id='qa-under-tab'; button.textContent='Fixture';
      button.style.cssText='position:fixed;bottom:40px;left:calc(50% - 30px);width:60px;height:40px;z-index:2147483642';
      window.__underTabClicks=0; button.onclick=()=>window.__underTabClicks++;
      document.body.appendChild(button);
    });
    await page.touchscreen.tap(201,814);
    check(await page.evaluate(()=>window.__underTabClicks===0),'real browser touch does not activate content beneath native capsule');
    await page.evaluate(()=>document.getElementById('qa-under-tab').remove());
    // Exercise the real shared overlay primitive with harmless layout content.
    await page.evaluate(()=> { window.__qaModal=Kiwi.modal({title:'Layout fixture',body:'No merchant action',foot:'<button type="button">Close fixture</button>'}); });
    await page.waitForFunction(()=>window.__host.tabs.length===0);
    check(await page.$eval('.kiwi-native-touch-shield',e=>e.hidden),'shared modal hides native capsule and touch shield');
    await page.evaluate(()=>window.__qaModal.close());
    await page.waitForFunction(()=>window.__host.tabs.length>0);

    await page.evaluate(()=>window.KiwiNativeHostAction({action:'navigate',id:'transactions'}));
    await sleep(700);
    const rows = await page.evaluate(()=>[...document.querySelectorAll('[data-payment-kind]')].map(r=>({kind:r.dataset.paymentKind,image:getComputedStyle(r,'::after').backgroundImage})));
    check(rows.length>0 && rows.every(r=>r.image.includes(({card:'credit_card',wallet:'account_balance_wallet',cash:'payments',qr:'qr_code',other:'payments'})[r.kind]+'.svg')),'order rows use semantic payment glyphs');
    await context.close();
  }
  // An actual pre-service ledger legitimately has no same-time comparator.
  // Assert that honest absence separately; the finite numerical assertions
  // above still run unconditionally for every mid-service locale and theme.
  for (const lang of ['fr','en','ar']) {
    const {page,context,verificationRequests,authRequests}=await phone(lang,false,false,demoTime.emptyDayMs);
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await page.waitForSelector('.kob-root [data-explore]',{visible:true});
    await page.click('.kob-root [data-explore]');
    await page.waitForSelector('.kob-root',{hidden:true});
    await page.waitForSelector('[data-kiwi-skip]',{visible:true});
    await page.click('[data-kiwi-skip]');
    await page.waitForFunction(`(${demoState})()?.chartExists && document.querySelector('[data-rev-svg] path') && document.querySelector('.kiwi-native-owner-actions button')`,{timeout:10000});
    const state=await page.evaluate(demoState);
    check(state.timezone===demoTime.timezone && state.now===demoTime.emptyDayMs && state.date===state.now,
      lang+': empty morning clock is coherent before boot');
    check(state.rows===0 && state.priorRows===0 && state.priorAmount===0,
      lang+': real pre-service ledger has no current or aligned prior sales');
    check(state.chartText.trim()==='' && !state.heroExists,
      lang+': empty morning omits chart and hero percentage comparisons');
    check(verificationRequests()===0 && authRequests()===0,
      lang+': empty demo entry never authenticates or verifies a code');
    await page.screenshot({path:path.join(work,`owner-empty-morning-${lang}.png`)});
    await context.close();
  }
  // Real pairing/login screens, inspected without entering a code.
  for (const [file,role] of [['kiwi-cuisine.html','Kitchen'],['kiwi-serveur.html','Team']]) {
    const {page,context}=await phone('fr');
    await page.goto(base+'/'+file,{waitUntil:'networkidle2'}); await sleep(1200);
    check(await page.evaluate(()=>window.__host?.tabs.length===0),role+' hides native navigation at the code gate');
    await page.screenshot({path:path.join(work,role.toLowerCase()+'-gate.png')});
    if(role==='Kitchen') {
      check(await page.$eval('.kiwi-native-role-back',e=>{e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.height>=44 && r.top>=62 && r.bottom<=840;}),'Kitchen exit remains reachable below keypad');
      await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('.kiwi-native-role-back')]);
      check(new URL(page.url()).searchParams.has('choose'),'Kitchen returns to role selection without a pairing code');
    }

    await context.close();
  }
  for (const lang of ['en','ar']) {
    const {page,context}=await phone(lang);
    await page.goto(base+'/kiwi-serveur.html',{waitUntil:'networkidle2'});
    check(await page.evaluate(lang=>document.documentElement.lang===lang && window.__host.locale===lang,lang),'Team inherits native '+lang+' locale before any code entry');
    await context.close();
  }
  // Isolated production-layout fixtures: application scripts are NOT run.
  // These are not authenticated sessions and cannot read or write a merchant.
  for (const [file,role,screen] of [['kiwi-serveur.html','Team','screen-main'],['kiwi-cuisine.html','Kitchen','screen']]) {
    for (const [lang,dark] of [['fr',false],['en',true],['ar',true]]) {
      const {page,context}=await phone(lang,dark);
      await page.goto(base+'/index.html');
      const raw=fs.readFileSync(path.join(root,file),'utf8');
      await page.evaluate(({raw,screen,lang,dark,base})=> {
        const parsed=new DOMParser().parseFromString(raw,'text/html');
        document.head.innerHTML='<base href="'+base+'/"><meta name="viewport" content="width=device-width,initial-scale=1">'+[...parsed.querySelectorAll('style,link[rel="stylesheet"]')].map(n=>n.outerHTML).join('')+'<link rel="stylesheet" href="native-runtime.css">';
        document.body.innerHTML='';document.body.className='';
        const node=parsed.getElementById(screen);node.hidden=false;node.inert=false;node.classList.add('is-active');node.setAttribute('aria-hidden','false');
        document.body.append(document.importNode(node,true));
        document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.documentElement.dataset.theme=dark?'dark':'light';
        document.querySelectorAll('#screen-main .bottom-tabs button').forEach(b=>b.addEventListener('click',()=> {
          document.querySelectorAll('.bottom-tabs button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.__forwarded=b.dataset.tab;
        }));
        history.replaceState(null,'',screen==='screen-main'?'kiwi-serveur.html':'kiwi-cuisine.html');
      },{raw,screen,lang,dark,base});
      await page.addScriptTag({url:base+'/native-runtime.js'}); await sleep(500);
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${role} ${lang}: isolated phone fixture has no horizontal overflow`);
      await page.click('.kiwi-native-burger');
      check(await page.evaluate(()=>document.body.classList.contains('kiwi-native-menu-open')&&[...document.querySelectorAll('.kiwi-native-menu [data-kno-account]')].map(x=>x.dataset.knoAccount).join(',')==='change-role,sign-out,ai-privacy,delete-account'),`${role} ${lang}: the header menu opens the account drawer`);
      // Opening changes the class synchronously, but does not guarantee that
      // layout has painted a reachable close target. Wait for its real bounds
      // and hit-test, not a synthetic click on a hidden/off-screen node.
      console.log(`${role} ${lang}: pre-close target `+JSON.stringify(await page.evaluate(menuCloseState)));
      try {
        await page.waitForFunction(()=> {
          const button=document.querySelector('.kiwi-native-menu-close');
          if (!button) return false;
          const rect=button.getBoundingClientRect(), style=getComputedStyle(button);
          const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
          return rect.width>=44 && rect.height>=44 && rect.left>=0 && rect.right<=innerWidth
            && rect.top>=0 && rect.bottom<=innerHeight && style.visibility==='visible'
            && style.display!=='none' && button.contains(hit);
        },{timeout:10000});
      } catch (error) {
        console.log('role menu close readiness: '+JSON.stringify(await page.evaluate(menuCloseState)));
        await page.screenshot({path:path.join(work,`${role.toLowerCase()}-fixture-${lang}-menu-not-clickable.png`)});
        throw error;
      }
      check(true,`${role} ${lang}: menu close is a visible 44px browser hit target`);
      await page.click('.kiwi-native-menu-close');
      await page.waitForFunction(()=>!document.body.classList.contains('kiwi-native-menu-open'));
      check(await page.evaluate(()=>!document.body.classList.contains('kiwi-native-menu-open')),
        `${role} ${lang}: real close click closes the drawer`);
      if(role==='Team') {
        check(await page.evaluate(()=>window.__host.tabs.map(t=>t.id).join(',')==='tables,menu,notifications,profil'),'Team publishes its actual four routes, no More tab');
        for(const id of ['menu','notifications','profil','tables']) {
          await page.evaluate(id=>window.KiwiNativeHostAction({action:'navigate',id}),id);
          check(await page.evaluate(id=>window.__forwarded===id && window.__host.selected===id,id),'Team host forwards '+id+' and tracks selection');
        }
      } else {
        // Synthetic long tickets in the actual production markup, no KDS APIs.
        await page.evaluate(()=> {
          document.querySelectorAll('.stack').forEach((s,i)=> {
            s.innerHTML='<article class="tk"><div class="tk-top"><span class="tk-no">Demo '+(i+1)+'</span><span class="tk-timer">12:45</span></div><ul class="tk-items"><li><span class="tk-q">2×</span><span class="tk-n">Synthetic long kitchen item with preparation notes and allergen instructions<span class="tk-note">Layout fixture only, not a merchant order</span></span></li></ul><button class="tk-act act-ready">Fixture action</button></article>';
          });
        });
        const queues = await page.evaluate(()=>[...document.querySelectorAll('.col')].map(c=>getComputedStyle(c).display));
        check(queues.length===3 && queues.every(d=>d==='flex'),'Kitchen phone exposes new, preparation and pass queues');
        const ticket = await page.evaluate(()=> {
          const b=document.querySelector('#s-pass .tk-act'); b.scrollIntoView({block:'center'});
          const r=b.getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,height:r.height,overflow:document.documentElement.scrollWidth-innerWidth};
        });
        check(ticket.height>=44 && ticket.top>=62 && ticket.bottom<874-34 && ticket.overflow<=0,'long Kitchen ticket stays readable and its action can be reached');
        await page.evaluate(()=>document.querySelector('.cols').scrollTop=0);
      }
      await page.screenshot({path:path.join(work,`${role.toLowerCase()}-fixture-${lang}.png`)});
      await context.close();
    }
  }
  console.log(`native-pass2-browser-test: ${checks} controls passed; evidence: ${work}`);
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
