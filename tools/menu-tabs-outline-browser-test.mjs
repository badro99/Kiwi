#!/usr/bin/env node
// #0149: real owner demo, every shipped stylesheet/native class and liquid lens.
// Actual browser taps/swipes only. No accounts, codes or merchant API writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createRequire} from 'node:module';
import {transformPage} from './build-app-www.mjs';
import {demoClockFixture,installDemoClock} from './native-demo-clock-fixture.mjs';
import {decodeScreenshot} from './painted-png.mjs';
import {releaseExitedBrowserStreams} from './browser-test-lifecycle.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const require=createRequire(path.join(root,'app/package.json')),puppeteer=require('puppeteer-core');
const bin=process.env.KIWI_CHROMIUM_BIN||['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin,'Chromium required');
const diagnostics=process.env.KIWI_MENU_TABS_DIAGNOSTICS;
const started=performance.now();
let phase='bootstrap',phaseStarted=started,caseKeyNow=null,tabNow=null,checks=0,failed=0,frames=0,swipes=0,connections=0,browserProcess;
function mark(next){
  const now=performance.now(),previousPhase=phase,previousPhaseMs=Math.round(now-phaseStarted);
  if(next!==phase){phase=next;phaseStarted=now;}
  if(diagnostics)fs.appendFileSync(diagnostics,JSON.stringify({phase,previousPhase,previousPhaseMs,
    phaseMs:Math.round(now-phaseStarted),elapsedMs:Math.round(now-started),case:caseKeyNow,tab:tabNow,
    checks,failed,frames,swipes,connections,resources:process.getActiveResourcesInfo().sort(),
    browserProcess:browserProcess?{pid:browserProcess.pid,exitCode:browserProcess.exitCode,signalCode:browserProcess.signalCode,
      stdio:browserProcess.stdio.map(s=>s?{destroyed:s.destroyed,readable:s.readable,writable:s.writable}:null)}:null})+'\n');
}
mark(phase);
const pulse=diagnostics?setInterval(()=>mark(phase),15000):null;pulse?.unref();
process.once('beforeExit',()=>{mark('node-before-exit');if(pulse)clearInterval(pulse);});
const out=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-menu-tab-outline-'));
console.log('menu tab screenshot directory '+out);
const source=transformPage(fs.readFileSync(path.join(root,'dashboard.html'),'utf8'));
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/dashboard.html'){res.setHeader('Content-Type','text/html');res.end(source);return;}
  const native=/^\/native-(?:runtime\.(?:css|js)|locale\.js|privacy\.js)$/.test(name);
  const file=path.resolve(root,native?'app/src'+name:'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'':data);});
});
server.on('connection',socket=>{connections++;socket.once('close',()=>{connections--;});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
browserProcess=browser.process();browserProcess?.once('exit',()=>mark('browser-process-exited'));mark('browser-ready');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(yes,label)=>{checks++;if(!yes)failed++;console.log(` ${yes?'✓':'✗'} ${label}`);};
const rowSelector='[data-menu-root] > .mi-filters > .mi-pill-row';
const tabs=['menu','i18n','stations','recipes','nutrition','performance','hours','alerts','nfc'];
async function settleScroll(page,selector=rowSelector){
  mark('scroll-settle');
  await page.waitForFunction(selector=>{
    const node=document.querySelector(selector),row=node?.matches('.mi-pill-row')?node:node?.parentElement;if(!row)return false;
    if(row.__tapScroll!==row.scrollLeft){row.__tapScroll=row.scrollLeft;row.__tapScrollSince=performance.now();return false;}
    return performance.now()-row.__tapScrollSince>=200;
  },{timeout:10000},selector);
  mark('scroll-settled');
}
async function swipe(page,session,dx){
  swipes++;mark('swipe');
  const box=await page.$eval(rowSelector,node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[box]});
  for(let i=1;i<=10;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+dx*i/10,y:box.y}]});await pause(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settleScroll(page);
}
// Measure actual border/outline paint, excluding the label and unrelated rows.
function paintedRing(png,rect,expected){
  let count=0,foreground=null;
  const x0=Math.max(0,Math.floor(rect.x-3)),x1=Math.min(png.width,Math.ceil(rect.x+rect.width+3));
  const y0=Math.max(0,Math.floor(rect.y-3)),y1=Math.min(png.height,Math.ceil(rect.y+rect.height+3));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    if(x>rect.x+4&&x<rect.x+rect.width-4&&y>rect.y+4&&y<rect.y+rect.height-4)continue;
    const offset=(y*png.width+x)*png.channels;
    const distance=expected.reduce((sum,value,index)=>sum+(png.pixels[offset+index]-value)**2,0);
    if(distance<=12){count++;foreground=[...png.pixels.subarray(offset,offset+3)];}
  }
  const sample=(x,y)=>{const offset=(Math.round(y)*png.width+Math.round(x))*png.channels;return [...png.pixels.subarray(offset,offset+3)];};
  // Actual neighboring track paint just above the selected rim, not its token.
  const background=sample(rect.x+rect.width/2,rect.y-2);
  const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=foreground?(Math.max(luminance(foreground),luminance(background))+.05)/(Math.min(luminance(foreground),luminance(background))+.05):0;
  return {count,foreground,background,contrast};
}
// Text and its dominant interior fill come from the same original frame as the
// rim. Antialias pixels are excluded from the expected solid label colour.
function paintedLabel(png,rect,expected){
  const fills=new Map();let count=0,foreground=null;
  for(let y=Math.ceil(rect.y+6);y<Math.floor(rect.y+rect.height-6);y++)for(let x=Math.ceil(rect.x+8);x<Math.floor(rect.x+rect.width-8);x++){
    const offset=(y*png.width+x)*png.channels,rgb=[...png.pixels.subarray(offset,offset+3)];
    if(expected.reduce((sum,value,index)=>sum+(rgb[index]-value)**2,0)<=12){count++;foreground=rgb;}
    else{const key=rgb.join(',');fills.set(key,(fills.get(key)||0)+1);}
  }
  const background=[...fills].sort((a,b)=>b[1]-a[1])[0]?.[0].split(',').map(Number);
  const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=foreground&&background?(Math.max(luminance(foreground),luminance(background))+.05)/(Math.min(luminance(foreground),luminance(background))+.05):0;
  return {count,foreground,background,contrast};
}
try{
  const cases=[375,402].flatMap(width=>['fr','en','ar'].flatMap(lang=>['light','dark'].map(theme=>({width,lang,theme}))))
    .concat([861,1024].flatMap(width=>['light','dark'].map(theme=>({width,lang:'en',theme}))))
    .concat([375,861].map(width=>({width,lang:'en',theme:'dark',vexelMode:'light',name:'legacy-dark'})));
  const caseKey=({width,lang,theme,name})=>`${width}-${lang}-${name||theme}`;
  assert.ok(!process.env.KIWI_MENU_TABS_FILTER||cases.some(item=>caseKey(item)===process.env.KIWI_MENU_TABS_FILTER),'case filter must match an actual guarded case');
  for(const {width,lang,theme,vexelMode,name} of cases){
    const key=caseKey({width,lang,theme,name});
    if(process.env.KIWI_MENU_TABS_FILTER&&process.env.KIWI_MENU_TABS_FILTER!==key)continue;
    caseKeyNow=key;tabNow=null;mark('case-start');
    const context=await browser.createBrowserContext();let touchSession;
    try{
    const page=await context.newPage(),clock=demoClockFixture();
    touchSession=await page.createCDPSession();
    await page.setViewport({width,height:874,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.emulateTimezone(clock.timezone);await page.evaluateOnNewDocument(installDemoClock,clock.midServiceMs);
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]);
    let writes=0,codeRequests=0;const blockedWrites=[];
    await page.setRequestInterception(true);page.on('request',request=>{
      if(/\/api\/pin\/verify|\/auth\/login/.test(request.url()))codeRequests++;
      if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes++;blockedWrites.push(request.method()+' '+new URL(request.url()).pathname);request.abort();return;}
      request.url().startsWith(base)||request.url().startsWith('data:')?request.continue():request.abort();
    });
    await page.evaluateOnNewDocument(locale=>{
      localStorage.setItem('kiwiNativeLocale',locale);
      const noop=()=>Promise.resolve({}),plug=new Proxy({},{get:(_,key)=>key==='addListener'?()=>({remove(){}}):noop});
      window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:new Proxy({},{get:()=>plug})};
      window.webkit={messageHandlers:{kiwiShell:{postMessage(value){window.__host=value;}}}};
      document.addEventListener('DOMContentLoaded',()=>{const s=document.documentElement.style;s.setProperty('--kiwi-host-safe-top','62px');s.setProperty('--kiwi-host-safe-bottom','34px');s.setProperty('--kiwi-host-tab-height','106px');});
    },lang);
    mark('navigation');await page.goto(base+'/dashboard.html',{waitUntil:'load'});mark('explore-ready-wait');
    await page.waitForSelector('.kob-root [data-explore]',{visible:true});await page.click('.kob-root [data-explore]');
    mark('skip-ready-wait');await page.waitForSelector('.kob-root',{hidden:true});await page.click('[data-kiwi-skip]');
    await page.waitForSelector('[data-kiwi-lock]',{hidden:true});
    const otherLensStyle=()=>[...document.querySelectorAll('.dr-pills > .kw-lens')].map(node=>{const s=getComputedStyle(node);return {border:s.border,radius:s.borderRadius,background:s.backgroundColor,shadow:s.boxShadow};});
    const hamburger=await page.$('.kw-hamburger');
    if(hamburger&&await hamburger.isVisible())await page.click('.kw-hamburger');
    mark('menu-navigation');await page.waitForSelector('.sidebar [data-nav="menu"]',{visible:true});
    await page.click('.sidebar [data-nav="menu"]');
    await page.waitForSelector(rowSelector+'[data-kw-lens] > .kw-lens',{visible:true});
    mark('fonts-ready-wait');await page.evaluate(()=>document.fonts.ready);mark('runtime-ready');
    // Exercise the actual shipped cascade with a stale light climate flag but
    // a legacy dark root. Only root state is varied; no CSS or UI is injected.
    if(vexelMode)await page.evaluate(mode=>{document.documentElement.dataset.vexelMode=mode;document.body.dataset.vexelMode=mode;},vexelMode);
    const otherBefore=await page.evaluate(otherLensStyle);
    check(await page.evaluate(()=>document.documentElement.classList.contains('kiwi-native')&&document.body.classList.contains('design-vexel')&&!!window.KiwiLens),key+': actual native owner, Vexel and lens loaded');
    check(await page.$$eval(rowSelector+' [data-action="rmw-tab"]',nodes=>nodes.map(n=>n.dataset.tab).join(','))===tabs.join(','),key+': all nine primary tabs present');
    const initial=await page.$eval(rowSelector,node=>({left:node.scrollLeft,width:node.clientWidth,extent:node.scrollWidth}));
    const selected=await page.$eval(rowSelector+' .on',node=>node.dataset.tab);
    await swipe(page,touchSession,lang==='ar'?120:-120);
    check(initial.extent-initial.width<=20||await page.$eval(rowSelector,node=>Math.abs(node.scrollLeft))>Math.abs(initial.left)+20,key+': genuine horizontal touch moves overflowing track (or all tabs already fit)');
    check(await page.$eval(rowSelector+' .on',node=>node.dataset.tab)===selected,key+': swiping never changes selected panel');
    for(const tab of tabs){
      tabNow=tab;mark('tab-start');
      const selector=rowSelector+` [data-tab="${tab}"]`;
      // Reach every option through real thumb swipes, then tap its actual node.
      for(let attempt=0;attempt<16;attempt++){
        const position=await page.$eval(selector,node=>{const row=node.parentElement,a=node.getBoundingClientRect(),r=row.getBoundingClientRect(),left=r.left+row.clientLeft,right=left+row.clientWidth;return {visible:a.left>=left&&a.right<=right,direction:a.left<left?1:-1};});
        if(position.visible)break;
        await swipe(page,touchSession,position.direction*120);
      }
      // Wait for genuine thumb-swipe inertia to stop before measuring the tap;
      // otherwise its last frame is mistaken for a rerender-induced jump.
      await settleScroll(page,selector);
      const beforeTap=await page.$eval(selector,node=>{
        const a=node.getBoundingClientRect(),r=node.parentElement.getBoundingClientRect(),vertical=[];
        for(let parent=node.parentElement;parent;parent=parent.parentElement)vertical.push(parent.scrollTop);
        const left=r.left+node.parentElement.clientLeft,right=left+node.parentElement.clientWidth;
        return {left:node.parentElement.scrollLeft,y:scrollY,vertical,fullyVisible:a.left>=left&&a.right<=right};
      });
      mark('tab-tap');await page.tap(selector);mark('panel-ready-wait');
      await page.waitForFunction((selector,tab)=>document.querySelector(selector)?.classList.contains('on')&&document.querySelector('[data-rmw-panel]')?.children.length>0,{},selector,tab);
      mark('lens-ready-wait');try{await page.waitForFunction(selector=>{
        const node=document.querySelector(selector),lens=node?.parentElement.querySelector('.kw-lens');
        if(!lens||!node.parentElement.hasAttribute('data-kw-lens'))return false;
        const a=node.getBoundingClientRect(),b=lens.getBoundingClientRect();
        return getComputedStyle(lens).opacity==='1'&&Math.abs(a.x-b.x)<=1&&Math.abs(a.width-b.width)<=1;
      },{timeout:10000},selector);}catch(error){
        await page.screenshot({path:path.join(out,`${key}-${tab}-readiness-failure.png`)});
        console.log(key+' '+tab+' readiness failure '+JSON.stringify(await page.$eval(selector,node=>{const lens=node.parentElement.querySelector('.kw-lens');return {node:node.getBoundingClientRect().toJSON(),left:node.parentElement.scrollLeft,offsetLeft:node.offsetLeft,lens:lens&&{rect:lens.getBoundingClientRect().toJSON(),className:lens.className,style:lens.getAttribute('style'),opacity:getComputedStyle(lens).opacity}};})));
        throw error;
      }
      // The dark-completion observer runs after each workspace remount. Capture
      // only a stable painted state, never its pale intermediate surface.
      mark('paint-stability-wait');await page.waitForFunction(selector=>{
        const node=document.querySelector(selector),row=node?.parentElement,lens=row?.querySelector('.kw-lens');
        if(!lens)return false;
        // Observe the actual row while paint settles. A subsequent visible-tab
        // tap can reuse stability already earned here; both settleScroll calls
        // remain, and neither the 200ms scroll nor 500ms paint criterion shrinks.
        const now=performance.now();
        if(row.__tapScroll!==row.scrollLeft){row.__tapScroll=row.scrollLeft;row.__tapScrollSince=now;}
        const s=getComputedStyle(lens),r=lens.getBoundingClientRect();
        const signature=[lens.className,s.backgroundColor,s.border,s.borderRadius,r.x,r.width].join('|');
        if(lens.__outlinePaintSignature!==signature){lens.__outlinePaintSignature=signature;lens.__outlinePaintSince=now;return false;}
        return now-lens.__outlinePaintSince>=500&&now-row.__tapScrollSince>=200;
      },{timeout:10000},selector);
      const state=await page.$eval(selector,(node,theme)=>{
        const r=node.getBoundingClientRect(),row=node.parentElement,rowRect=row.getBoundingClientRect(),lens=row.querySelector('.kw-lens'),s=getComputedStyle(node),ls=getComputedStyle(lens);
        const vertical=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)vertical.push(parent.scrollTop);
        return {tab:node.dataset.tab,rect:r.toJSON(),row:rowRect.toJSON(),left:row.scrollLeft,y:scrollY,vertical,outline:s.outline,border:s.border,shadow:s.boxShadow,background:s.backgroundColor,color:s.color,radius:s.borderRadius,lens:{className:lens.className,rect:lens.getBoundingClientRect().toJSON(),border:ls.border,radius:ls.borderRadius,background:ls.backgroundColor,shadow:ls.boxShadow,boxSizing:ls.boxSizing},expected:getComputedStyle(node).getPropertyValue(theme==='dark'?'--mint':'--atlas').trim()};
      },theme);
      mark('screenshot');const bytes=await page.screenshot({path:path.join(out,`${key}-${tab}.png`)});frames++;
      mark('png-decode');const png=decodeScreenshot(bytes);mark('paint-checks');
      console.log(key+' '+tab+' computed '+JSON.stringify(state));
      // Parse the computed brand value off-DOM; a temporary body node would
      // create a mutation batch unrelated to the user's actual tab tap.
      const rgb=await page.evaluate(value=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);},state.expected);
      const paint=paintedRing(png,state.lens.rect,rgb);
      console.log(key+' '+tab+' actual PNG rim '+JSON.stringify(paint));
      const label=paintedLabel(png,state.rect,state.color.match(/[\d.]+/g).slice(0,3).map(Number));
      console.log(key+' '+tab+' actual PNG label '+JSON.stringify(label));
      check(state.tab===tab&&state.rect.left>=state.row.left-1&&state.rect.right<=state.row.right+1,key+' '+tab+': selected panel stays in the visible track');
      check(beforeTap.fullyVisible&&Math.abs(state.left-beforeTap.left)<=1,key+' '+tab+`: every fully visible tap preserves exact strip position (${beforeTap.left} → ${state.left})`);
      check(Math.abs(state.y-beforeTap.y)<=1&&state.vertical.length===beforeTap.vertical.length&&state.vertical.every((value,index)=>Math.abs(value-beforeTap.vertical[index])<=1),key+' '+tab+': tab tap never scrolls the whole page or its vertical ancestors');
      check(parseFloat(state.lens.radius)>=20,key+' '+tab+': painted selection lens remains fully rounded');
      check(paint.count>=40,key+' '+tab+`: actual screenshot contains green rounded outline (${paint.count} pixels)`);
      check(paint.contrast>=3,key+' '+tab+`: painted rim contrasts with neighboring track (${paint.contrast.toFixed(2)}:1)`);
      check(label.count>0&&label.contrast>=4.5,key+' '+tab+`: same settled screenshot label contrasts with its selected fill (${label.contrast.toFixed(2)}:1)`);
      check(state.lens.boxSizing==='border-box'&&Math.abs(state.lens.rect.width-state.rect.width)<=1&&Math.abs(state.lens.rect.height-state.rect.height)<=1,key+' '+tab+': rim preserves selected content dimensions');
      if(tab==='menu')check(await page.$eval('.mi-cat-pills > .kw-lens',node=>parseFloat(getComputedStyle(node).borderTopWidth)<2),key+': category lens keeps its existing border');
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),key+' '+tab+': no horizontal page overflow');
    }
    console.log(key+' blocked write attempts '+JSON.stringify(blockedWrites));
    check(otherBefore.length>0&&JSON.stringify(await page.evaluate(otherLensStyle))===JSON.stringify(otherBefore),key+': nonworkspace date lens styling is unchanged');
    check(writes===0&&codeRequests===0,key+': no network writes or credential requests');
    }finally{
      mark('touch-session-close');await touchSession?.detach().catch(()=>{});
      mark('context-close');await context.close();mark('case-complete');
    }
  }
  console.log(`menu-tabs-outline-browser-test: ${checks-failed}/${checks} passed, ${failed} failed; screenshots ${out}`);
  process.exitCode=failed?1:0;
}finally{
  try{mark('browser-close');await browser.close();mark('browser-closed');releaseExitedBrowserStreams(browserProcess);mark('browser-streams-closed');}
  finally{mark('server-close');await new Promise(resolve=>server.close(resolve));mark('server-closed');}
}
