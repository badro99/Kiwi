#!/usr/bin/env node
// Local fixtures only. No credentials, pairing, merchant writes or production requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from './build-app-www.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const require=createRequire(path.join(root,'app/package.json'));
const puppeteer=require('puppeteer-core');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-store-ready-'));
build({out:dir,quiet:true});
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/fixture/')) {
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html class="kiwi-native"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/native-runtime.css"><script src="/native-privacy.js"></script><script src="/native-runtime.js" defer></script></head><body><button id="before">Before</button></body></html>');return;
  }
  const file=path.resolve(dir,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(dir+path.sep)) {res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  fs.readFile(file,(err,data)=>{res.statusCode=err?404:200;res.end(err?'':data);});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.KIWI_CHROMIUM_BIN||['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
let n=0;function check(v,msg){assert.ok(v,msg);n++;console.log('  ✓ '+msg);}
try {
  for(const lang of ['fr','en','ar']) {
    const context=await browser.createBrowserContext();const page=await context.newPage();
    await page.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
    await page.setRequestInterception(true);
    page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
    await page.evaluateOnNewDocument(lang=>{
      const noop=()=>Promise.resolve({});
      const plugin=new Proxy({},{get:(_,k)=>k==='addListener'?()=>({remove(){}}):noop});
      window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:new Proxy({},{get:()=>plugin})};
      window.webkit={messageHandlers:{kiwiShell:{postMessage(v){window.__host=v;}}}};
      localStorage.setItem('kiwiNativeLocale',lang);
      document.addEventListener('DOMContentLoaded',()=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';});
      const original=window.fetch;window.__sends=0;window.__deletionStatus=401;window.__pendingDeletion=false;
      window.fetch=(input,init)=>{
        const url=String(input?.url||input);
        if(url.includes('/api/ai/')) {window.__sends++;return Promise.resolve(new Response('{"ok":true}',{status:200}));}
        if(url.includes('/api/account/deletion-request')) {
          if(init?.method==='POST') throw Error('Deletion POST forbidden in test');
          if(window.__deletionStatus===401) return Promise.resolve(new Response('<html>Signed out</html>',{status:401}));
          if(window.__deletionStatus===500) return Promise.resolve(new Response('unavailable',{status:500}));
          return Promise.resolve(new Response(JSON.stringify({account:{email:'fixture@example.invalid'},request:window.__pendingDeletion?{reference:'TEST-ONLY'}:null}),{status:200}));
        }
        if(url.includes('/api/')||url.includes('/auth/'))return Promise.resolve(new Response('{}',{status:401}));
        return original(input,init);
      };
    },lang);
    await page.goto(base+'/fixture/kiwi-cuisine.html',{waitUntil:'networkidle0'});
    await page.evaluate(()=>{window.__result=fetch('/api/ai/ask',{method:'POST',body:'fixture'}).catch(e=>e.name);});
    await page.waitForSelector('.kiwi-native-privacy');
    check(await page.evaluate(()=>__sends===0),lang+': no AI upload before consent');
    check(await page.$eval('.kiwi-native-privacy',el=>el.textContent.includes('Cloudflare Workers AI')),lang+': processor disclosed');
    check(await page.$$eval('.kiwi-native-privacy button',els=>els.every(el=>el.getBoundingClientRect().height>=44)),lang+': accessible controls');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),lang+': sheet fits phone');
    await page.click('[data-deny]');
    check(await page.evaluate(async()=>await __result==='NotAllowedError'&&__sends===0),lang+': refusal sends nothing');
    check(await page.evaluate(async()=>{try{await fetch('/api/ai/voice');return false;}catch(e){return e.name==='NotAllowedError'&&!document.querySelector('.kiwi-native-privacy');}}),lang+': refusal is remembered without nagging');
    check(await page.evaluate(()=>{const x=new XMLHttpRequest();x.open('POST','/api/ai/voice');try{x.send('fixture');return false;}catch(e){return e.name==='NotAllowedError';}}),lang+': XHR cannot bypass refusal');
    check(await page.evaluate(()=>navigator.sendBeacon('/api/ai/ask','fixture')===false),lang+': beacon cannot bypass refusal');
    await page.evaluate(()=>KiwiNativeHostAction({action:'ai-privacy'}));
    await page.click('[data-submit]');
    await page.evaluate(()=>fetch(new Request(location.origin+'/api/ai/ask',{method:'POST',body:'fixture'})));
    check(await page.evaluate(()=>__sends===1),lang+': affirmative choice releases request');
    await page.evaluate(()=>KiwiNativeHostAction({action:'ai-privacy'}));
    await page.keyboard.press('Escape');
    check(await page.evaluate(async()=>{try{await fetch(new URL('/api/ai/voice',location.href));return false;}catch(e){return e.name==='NotAllowedError'&&__sends===1;}}),lang+': revocation fences new requests');
    // Aborted requests and account changes must not be released by later consent.
    await page.evaluate(()=>{KiwiNativePrivacy.show();window.__abort=new AbortController();window.__aborted=fetch('/api/ai/ask',{signal:__abort.signal}).catch(e=>e.name);__abort.abort();});
    await page.click('[data-submit]');
    check(await page.evaluate(async()=>await __aborted==='AbortError'&&__sends===1),lang+': cancelled request never uploads after consent');
    await page.evaluate(()=>{KiwiNativePrivacy.show();window.__old=fetch('/api/ai/ask').catch(e=>e.name);fetch('/auth/logout');});
    check(await page.evaluate(async()=>await __old==='NotAllowedError'&&__sends===1&&!document.querySelector('.kiwi-native-privacy')),lang+': sign-out cancels pending consent and request');
    // Deletion status: non-JSON 401 must never become a generic failure/password prompt.
    await page.evaluate(()=>KiwiNativeHostAction({action:'delete-account'}));
    await page.waitForFunction(()=>document.querySelector('.kiwi-native-account [data-submit]').hidden);
    check(await page.$eval('.kiwi-native-account label',el=>el.hidden),lang+': signed-out deletion hides password');
    check(await page.$$eval('.kiwi-native-account-actions button',els=>els.filter(el=>!el.hidden).length===2),lang+': signed-out deletion offers close and sign-in');
    await page.click('[data-close]');
    await page.evaluate(()=>{__deletionStatus=200;__pendingDeletion=true;KiwiNativeHostAction({action:'delete-account'});});
    await page.waitForFunction(()=>document.querySelector('.kiwi-native-account-status').textContent.includes('TEST-ONLY'));
    check(await page.$eval('.kiwi-native-account [data-submit]',el=>el.hidden),lang+': existing deletion cannot be duplicated');
    await page.click('[data-close]');
    await page.evaluate(()=>{__pendingDeletion=false;KiwiNativeHostAction({action:'delete-account'});});
    await page.waitForFunction(()=>!document.querySelector('.kiwi-native-account [data-submit]').disabled);
    check(await page.$eval('.kiwi-native-account input',el=>el.value===''),lang+': authenticated request available without submitting');
    await page.click('[data-close]');
    await page.evaluate(()=>{__deletionStatus=500;KiwiNativeHostAction({action:'delete-account'});});
    await page.waitForFunction(()=>document.querySelector('.kiwi-native-account [data-submit]').hidden);
    check(await page.$$eval('.kiwi-native-account-actions button',els=>els.filter(el=>!el.hidden).length===1),lang+': unavailable service does not offer a false sign-in fix');
    // Real bundled owner route, entered only using its visible local demo link.
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await new Promise(r=>setTimeout(r,1500));
    await page.evaluate(()=>document.querySelector('.kob-root [data-explore]')?.click());
    await page.waitForSelector('[data-kiwi-skip]');
    await page.evaluate(()=>document.querySelector('[data-kiwi-skip]').click());
    await new Promise(r=>setTimeout(r,1600));
    check(await page.$eval('[data-mix-plan-status]',el=>!el.hasAttribute('data-i18n')&&!/399|MAD/.test(el.textContent)),lang+': owner home has no subscription offer');
    await page.evaluate(()=>Kiwi.handlers['account-profile']());
    check(await page.evaluate(()=>![...document.querySelectorAll('.acc-plan-price')].some(el=>el.getBoundingClientRect().height>0)),lang+': profile has no subscription price');
    await page.evaluate(()=>Kiwi.handlers['account-billing']());
    check(await page.evaluate(()=>![...document.querySelectorAll('[data-action="upgrade-pro"]')].some(el=>el.getBoundingClientRect().height>0)),lang+': account has no visible upgrade control');
    await page.evaluate(()=>Kiwi.handlers['upgrade-pro']());
    check(await page.$('.kup-cta')===null,lang+': invoking an upgrade handler cannot open purchasing');
    await page.evaluate(()=>KiwiNativeHostAction({action:'ai-privacy'}));
    await page.waitForSelector('.kiwi-native-privacy');
    check(await page.evaluate(()=>__host.tabs.length===0),lang+': native tabs yield to privacy sheet');
    if(process.env.KIWI_RELEASE_EVIDENCE) {
      fs.mkdirSync(process.env.KIWI_RELEASE_EVIDENCE,{recursive:true});
      await page.screenshot({path:path.join(process.env.KIWI_RELEASE_EVIDENCE,'ai-consent-'+lang+'.png')});
    }
    await page.click('[data-deny]');
    await context.close();
  }
  for(const file of ['dashboard.html','kiwi-caisse.html','kiwi-serveur.html','kiwi-cuisine.html','index.html']) {
    const html=fs.readFileSync(path.join(dir,file),'utf8');
    check(html.indexOf('native-privacy.js')>html.indexOf('assets/api-base.js')&&html.indexOf('native-privacy.js')<html.indexOf('native-runtime.js'),file+': consent loaded before workspace clients');
  }
  const voice=fs.readFileSync(path.join(root,'assets/agent-voice.js'),'utf8');
  check(voice.includes("if (document.documentElement.classList.contains('kiwi-native')) return null;"),'native dictation never silently falls back to an undisclosed provider');
  const archive=fs.readFileSync(path.join(root,'tools/app-archive.sh'),'utf8');
  check(archive.includes('status --porcelain')&&archive.includes('node tools/check.js')&&archive.includes('KIWI_BUILD_NUMBER'),'archive refuses dirty/unchecked source and requires explicit build');
  console.log(`native-store-readiness: ${n} controls green`);
} finally {await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
