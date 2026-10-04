#!/usr/bin/env node
/* #0148: shipped daily report + shipped native owner shell, not a CSS replica.
 * Private generated bundle and ordinary public demo entry only. Browser proof
 * does not establish WKWebView acceptance. Never print/export/close a day.
 * Input is real pointer/touch protocol input; no synthetic DOM events, scroll
 * setters, injected CSS, pairing or merchant records. Existing inset guard stays.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from './build-app-www.mjs';
import {demoClockFixture,installDemoClock} from './native-demo-clock-fixture.mjs';
import {releaseExitedBrowserStreams} from './browser-test-lifecycle.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(ROOT,'app/package.json'));
const puppeteer=require('puppeteer-core');
const chrome=[process.env.KIWI_CHROMIUM_BIN,process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium']
  .find(candidate=>candidate&&fs.existsSync(candidate));
assert.ok(chrome,'real Chromium is required for the daily-report scroll guard');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-report-scroll-'));
const assembled=build({out:path.join(work,'www'),quiet:true});
assert.ok(assembled&&!assembled.errors?.length,'private native bundle assembled');
const www=assembled.out;
// The actual dashboard schedules an unrelated device-health POST at boot.
// This private layout fixture excludes ONLY its two scheduled heartbeat calls;
// flush, send, public APIs and the shipped Report/native-shell code stay real.
// This is not proof of native/background heartbeat behaviour.
const operationsPath=path.join(www,'assets/operations.js');
const originalOperations=fs.readFileSync(operationsPath,'utf8');
const bootHeartbeat=`  setTimeout(function () {
    flush();
    /* Heartbeat records capability, not customer or order data. Failure is
       silent and retryable; it never interrupts a cashier or merchant. */
    beat().catch(function () {});
  }, 1800);`;
const intervalHeartbeat='  setInterval(function () { if (navigator.onLine !== false) beat().catch(function () {}); }, 300000);';
const scheduledHeartbeats=[bootHeartbeat,intervalHeartbeat];
assert.equal(scheduledHeartbeats.reduce((count,source)=>count+originalOperations.split(source).length-1,0),2,'exact two scheduled heartbeat source matches');
let fixtureOperations=originalOperations;
for(const source of scheduledHeartbeats){
  assert.equal(originalOperations.split(source).length-1,1,'each scheduled heartbeat form occurs exactly once');
  fixtureOperations=fixtureOperations.replace(source,source.replace('beat().catch(function () {});','void 0; /* private report fixture: scheduled heartbeat excluded */'));
}
assert.doesNotThrow(()=>new Script(fixtureOperations,{filename:'private-fixture-operations.js'}),'private heartbeat exclusion remains valid JavaScript');
const operationHash=source=>createHash('sha256').update(source).digest('hex');
console.log('  · private non-native background-heartbeat exclusion '+JSON.stringify({calls:2,originalOperationsSHA256:operationHash(originalOperations),fixtureOperationsSHA256:operationHash(fixtureOperations)}));
fs.writeFileSync(operationsPath,fixtureOperations);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json'};
let serverWrites=0;
const server=http.createServer((req,res)=>{
  // A preflight has no data-changing payload. Never accept an actual write.
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(!['GET','HEAD'].includes(req.method)){serverWrites++;res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://local');
  if(/^\/(api|auth)\//.test(url.pathname)){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}
  const file=path.resolve(www,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(www+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,buf)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(err?'':buf);});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const clock=demoClockFixture('2026-10-04');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,checks=0,completed=0;
function check(condition,label){assert.ok(condition,label);checks++;console.log('  ✓ '+label);}
function nativeFixture(lang){
  // Public transport override: private fixture origin, never a production API.
  // This also exposes the actual method instead of an external CORS preflight.
  window.KIWI_API_BASE=location.origin;
  localStorage.setItem('kiwiNativeLocale',lang);
  localStorage.setItem('kiwiAppRole','dashboard');
  const noop=()=>Promise.resolve({});
  const plugin=new Proxy({},{get:(_,key)=>key==='addListener'?()=>({remove(){}}):noop});
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:new Proxy({},{get:()=>plugin})};
  window.webkit={messageHandlers:{kiwiShell:{postMessage(payload){window.__reportHost=payload;}}}};
  document.addEventListener('DOMContentLoaded',()=>{
    const style=document.documentElement.style;
    style.setProperty('--kiwi-host-safe-top','62px');
    style.setProperty('--kiwi-host-safe-bottom','34px');
    style.setProperty('--kiwi-host-tab-height','106px');
  },{once:true});
}
async function swipe(page,x,y,dy){
  const cdp=await page.createCDPSession();
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=12;step++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*step/12}]});
      await pause(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
}
async function routeState(page){return page.evaluate(()=>{
  const inspect=selector=>{
    const element=document.querySelector(selector);if(!element)return {selector,missing:true};
    const r=element.getBoundingClientRect(),c=getComputedStyle(element);
    const x=Math.max(1,Math.min(innerWidth-1,r.left+r.width/2)),y=Math.max(1,Math.min(innerHeight-1,r.top+r.height/2));
    const hit=document.elementFromPoint(x,y);
    return {selector,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:c.display,visibility:c.visibility,
      transform:c.transform,inert:!!element.closest('[inert]'),scrollTop:element.scrollTop,
      clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,
      hit:hit?{tag:hit.tagName,classes:hit.className}:null,hittable:!!hit&&element.contains(hit),
      animations:element.getAnimations().map(animation=>({state:animation.playState,remaining:animation.effect?.getComputedTiming().progress}))};
  };
  return {menuOpen:document.body.classList.contains('kw-menu-open'),viewport:{width:innerWidth,height:innerHeight},
    nodes:['.app','.kw-hamburger','.sidebar','.sidebar [data-nav="rapport"]'].map(inspect)};
});}
async function waitHittable(page,selector){
  await page.waitForFunction(selector=>{
    const element=document.querySelector(selector);if(!element)return false;
    const r=element.getBoundingClientRect(),c=getComputedStyle(element);
    if(element.closest('[inert]')||c.display==='none'||c.visibility!=='visible'||r.width<1||r.height<1)return false;
    if(element.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity))return false;
    if(r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight)return false;
    const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return !!hit&&element.contains(hit);
  },{timeout:10000},selector);
}
async function openReport(page,phone,label){
  try{
    if(phone){
      await waitHittable(page,'.kw-hamburger');
      await page.click('.kw-hamburger');
      await page.waitForFunction(()=>{
        const sidebar=document.querySelector('.sidebar');if(!sidebar||!document.body.classList.contains('kw-menu-open'))return false;
        const r=sidebar.getBoundingClientRect();
        return r.left>=-1&&r.right<=innerWidth+1&&r.width>0&&!sidebar.inert
          &&!sidebar.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity);
      },{timeout:10000});
    }
    console.log('  · '+label+' route-before '+JSON.stringify(await routeState(page)));
    await waitHittable(page,'.sidebar [data-nav="rapport"]');
    await page.click('.sidebar [data-nav="rapport"]');
  }catch(error){
    console.log('  · '+label+' route-failure '+JSON.stringify(await routeState(page)));
    await page.screenshot({path:path.join(work,label+'-route-failure.png')});
    throw error;
  }
}
async function layout(page){return page.evaluate(()=>{
  const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const style=element=>{const c=getComputedStyle(element);return {overflowX:c.overflowX,overflowY:c.overflowY,position:c.position,touchAction:c.touchAction};};
  const report=document.querySelector('.dash-genpage'),body=report.querySelector('.genpage-body');
  const tail=[...body.children].reverse().find(element=>element.getBoundingClientRect().height>0),shield=document.querySelector('.kiwi-native-touch-shield');
  const hit=document.elementFromPoint(innerWidth*.55,innerHeight*.65);
  return {scrollY,viewport:innerWidth,height:innerHeight,scrolling:document.scrollingElement.tagName,
    extent:document.scrollingElement.scrollHeight,client:document.scrollingElement.clientHeight,
    overflow:document.documentElement.scrollWidth-innerWidth,
    locks:window.__kiwiScrollLocks||0,locked:document.documentElement.classList.contains('kiwi-locked'),
    root:style(document.documentElement),body:style(document.body),main:style(document.querySelector('main.main')),
    scrollNodes:['html','body','.app','main.main','.container','.dash-genpage','.genpage-body'].map(selector=>{
      const element=document.querySelector(selector);return {selector,...style(element),...rect(element),extent:element.scrollHeight,client:element.clientHeight};
    }),
    columns:[...body.querySelectorAll('.kdr-nav,.kdr-strip,.kdr-kpis,.kdr-two')].map(rect),
    tail:rect(tail),shield:shield&&!shield.hidden?rect(shield):null,
    hit:hit?{tag:hit.tagName,classes:hit.className}:null,
    locale:document.documentElement.lang,dir:document.documentElement.dir,
    theme:document.documentElement.dataset.theme||document.documentElement.dataset.vexelMode,
    host:window.__reportHost?.selected,
    reportCount:document.querySelectorAll('.dash-genpage [data-kdr-day-selector]').length,
    date:body.querySelector('.kdr-day')?.textContent,
    net:body.querySelector('.kdr-kpi.is-lead .kdr-kpi-v')?.textContent,
    txns:body.querySelectorAll('.kdr-kpi .kdr-kpi-v')[1]?.textContent,
  };
});}
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
  const cases=[...['fr','en','ar'].flatMap(lang=>['light','dark'].map(theme=>({lang,theme,width:402,height:874,phone:true}))),
    {lang:'en',theme:'light',width:1440,height:900,phone:false}];
  for(const config of cases){
    const {lang,theme,width,height,phone}=config,label=`${width}-${lang}-${theme}`;
    const context=await browser.createBrowserContext();
    let initiatorSession;
    try{
      const page=await context.newPage(),errors=[];let writes=0,external=0,preflights=0;
      if(process.env.KIWI_REPORT_INITIATOR_DIAGNOSTICS==='1'){
        initiatorSession=await page.createCDPSession();
        await initiatorSession.send('Network.enable');
        initiatorSession.on('Network.requestWillBeSent',event=>{
          const pathname=new URL(event.request.url).pathname;
          if(event.request.method!=='POST'||pathname!=='/api/operations')return;
          const frames=[];
          for(let stack=event.initiator.stack;stack;stack=stack.parent){
            for(const frame of stack.callFrames||[]){
              let scriptPath='';try{scriptPath=new URL(frame.url).pathname;}catch{}
              frames.push({scriptPath,function:frame.functionName,line:frame.lineNumber+1});
            }
          }
          // Source locations only: never request bodies, headers or URL queries.
          console.log('  · '+label+' blocked-write-initiator '+JSON.stringify({method:event.request.method,pathname,frames}));
        });
      }
      page.on('pageerror',error=>errors.push(error.message));
      await page.setViewport({width,height,deviceScaleFactor:1,isMobile:phone,hasTouch:phone});
      await page.emulateTimezone(clock.timezone);
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
      await page.evaluateOnNewDocument(installDemoClock,clock.midServiceMs);
      await page.evaluateOnNewDocument(nativeFixture,lang);
      await page.setRequestInterception(true);
      page.on('request',request=>{
        if(request.method()==='OPTIONS'){
          preflights++;
          // Abort even safe preflights: no external request is transmitted.
          console.log('  · '+label+' blocked-preflight '+JSON.stringify({method:request.method(),pathname:new URL(request.url()).pathname}));
          request.abort();return;
        }
        if(!['GET','HEAD'].includes(request.method())){
          writes++;
          // Never log queries, headers or bodies. The request is aborted before
          // transmission; a known background path must still be investigated.
          console.log('  · '+label+' blocked-write '+JSON.stringify({method:request.method(),pathname:new URL(request.url()).pathname}));
          request.abort();return;
        }
        if(!request.url().startsWith(base+'/')&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:')){external++;request.abort();return;}
        request.continue();
      });
      await page.goto(base+'/dashboard.html',{waitUntil:'load'});
      await page.waitForSelector('.kob-root [data-explore]',{visible:true});
      await page.click('.kob-root [data-explore]');
      await page.waitForSelector('[data-kiwi-skip]',{visible:true});
      await page.click('[data-kiwi-skip]');
      await page.waitForFunction(()=>!document.querySelector('[data-kiwi-lock]')&&document.body.classList.contains('kiwi-native-owner'));
      await page.evaluate(()=>document.fonts.ready);
      await openReport(page,phone,label);
      await page.waitForSelector('.kdr-kpis',{visible:true});
      await page.waitForFunction(()=>!document.body.classList.contains('kw-menu-open')&&!document.documentElement.classList.contains('kiwi-locked'));
      await page.waitForFunction(()=>![...document.querySelectorAll('.dash-genpage')].some(e=>e.getAnimations().some(a=>a.playState==='running')));
      const before=await layout(page);
      console.log('  · '+label+' top '+JSON.stringify(before));
      check(before.locale===lang&&before.dir===(lang==='ar'?'rtl':'ltr'),label+': actual requested locale/direction');
      check(before.theme===theme,label+': actual requested native appearance');
      check(before.reportCount===1&&Number(before.txns)>0&&/[1-9]/.test(before.net)
        &&before.extent>before.client+200&&before.tail.bottom>height+200,label+': real populated report has below-fold content');
      check(before.overflow<=1,label+': no horizontal document overflow');
      check(before.columns.every(r=>r.left>=(phone?15:-1)&&r.right<=width-(phone?15:-1)),label+': actual report navigation/cards retain horizontal inset');
      check(!before.locked&&before.locks===0&&before.body.position!=='fixed',label+': ordinary report has no modal body/document lock');
      const heartbeat=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();setTimeout(()=>resolve(performance.now()-start),60);}));
      console.log('  · '+label+' runtime-heartbeat-ms '+heartbeat.toFixed(1));
      check(Number.isFinite(heartbeat)&&heartbeat>=40,label+': renderer event loop answers a real timer');
      await page.screenshot({path:path.join(work,label+'-top.png')});
      if(phone){
        check(before.host==='rapport',label+': native owner shell selected Report');
        check(!before.shield||before.shield.top>=height-107,label+': tab touch shield confined to capsule band');
        await swipe(page,width*.55,height*.65,-height*.32);
      }else{await page.mouse.move(width*.65,height*.65);await page.mouse.wheel({deltaY:420});}
      await page.waitForFunction(y=>scrollY>y+40,{timeout:5000},before.scrollY);
      const after=await layout(page);
      check(after.scrollY>before.scrollY+40,label+': genuine '+(phone?'vertical touch':'wheel')+' scroll moves document');
      await page.screenshot({path:path.join(work,label+'-scrolled.png')});
      // Genuine input only, bounded attempts. No scrollTo/scrollTop writes.
      for(let attempt=0;attempt<35;attempt++){
        const current=await layout(page),bottomLimit=current.shield?.top??height;
        if(current.tail.bottom<=bottomLimit-4&&current.tail.bottom>0)break;
        await page.mouse.move(width*.55,height*.6);await page.mouse.wheel({deltaY:600});
        await pause(70);
      }
      await pause(160);
      const bottom=await layout(page),limit=bottom.shield?.top??height;
      console.log('  · '+label+' bottom '+JSON.stringify(bottom));
      check(bottom.tail.bottom>0&&bottom.tail.bottom<=limit-4,label+': actual report end is reachable above native capsule');
      check(bottom.overflow<=1,label+': bottom keeps horizontal inset');
      check(bottom.date===before.date&&bottom.txns===before.txns&&bottom.net===before.net,label+': scrolling never changes report day/count/amount');
      check(errors.length===0,label+': no page errors '+errors.join(' | '));
      check(writes===0&&serverWrites===0,label+': no POST/auth/financial writes');
      await page.screenshot({path:path.join(work,label+'-bottom.png')});
      console.log('  · '+label+' blocked-preflights '+preflights);
      console.log('  · '+label+' blocked-external-GETs '+external);
      completed++;
    }finally{
      if(initiatorSession)await initiatorSession.detach();
      await context.close();
    }
  }
  check(completed===7,'all seven original contexts completed');
}finally{
  if(browser){
    const child=browser.process();await browser.close();releaseExitedBrowserStreams(child);
    check(child.exitCode!==null||child.signalCode!==null,'owned browser actually exited');
    check((child.stdio||[]).every(stream=>!stream||stream.destroyed),'owned browser stdio released after actual exit');
  }
  await new Promise(resolve=>server.close(resolve));
  const connections=await new Promise((resolve,reject)=>server.getConnections((error,count)=>error?reject(error):resolve(count)));
  check(!server.listening&&connections===0,'owned fixture listener closed and no connections remain');
}
console.log(`  ✓ day-report-scroll-browser: ${checks} checks, ${completed} contexts; original screenshots ${work}`);
