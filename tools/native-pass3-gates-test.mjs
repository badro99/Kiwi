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
const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pass3-gates-'));
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
  for (const lang of ['en','fr','ar']) {
    for (const [file,selector] of [['dashboard.html','[data-kiwi-lock]'],['kiwi-serveur.html','#screen-pin'],['kiwi-cuisine.html','#pair']]) {
      const {page,context}=await phone(lang);
      await page.goto(base+'/'+file,{waitUntil:'networkidle2'});
      if(file==='dashboard.html') { await page.waitForSelector('.kob-root [data-explore]'); await page.click('.kob-root [data-explore]'); }
      await page.waitForSelector(selector+' .kiwi-native-role-back',{visible:true});
      check(await page.evaluate(()=>__host.tabs.length===0),file+': gate hides host tabs');
      const exit=selector+' .kiwi-native-role-back';
      await page.$eval(exit,e=>e.scrollIntoView({block:'center'}));
      check(await page.$eval(exit,e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<=innerHeight;}),file+' '+lang+': exit reachable');
      check(await page.$eval(exit,(e,lang)=>e.textContent===({en:'Change role',fr:'Changer de rôle',ar:'تغيير الدور'})[lang],lang),'exit matches '+lang);
      await page.screenshot({path:path.join(work,file+'-'+lang+'.png')});
      await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click(exit)]);
      check(new URL(page.url()).searchParams.has('choose'),file+': real click exits without a code');
      await context.close();
    }
    // Script-free production-markup fixtures for later gates: no credentials,
    // authentication bypass, API writes, or merchant session involved.
    for(const [file,id] of [['kiwi-caisse.html','pin-screen'],['kiwi-caisse.html','clockin-screen'],['kiwi-serveur.html','screen-clockin'],['kiwi-serveur.html','screen-table']]) {
      const {page,context}=await phone(lang);
      await page.goto(base+'/index.html');
      const raw=fs.readFileSync(path.join(root,file),'utf8');
      await page.evaluate(({raw,file,id,lang,base})=>{
        const parsed=new DOMParser().parseFromString(raw,'text/html');
        document.head.innerHTML='<base href="'+base+'/"><meta name="viewport" content="width=device-width,initial-scale=1">'+[...parsed.querySelectorAll('style,link[rel="stylesheet"]')].map(n=>n.outerHTML).join('')+'<link rel="stylesheet" href="native-runtime.css">';
        document.body.innerHTML='';document.body.className='';
        const gate=parsed.getElementById(id);gate.hidden=false;gate.inert=false;gate.classList.add('is-active','is-visible');gate.setAttribute('aria-hidden','false');
        const container=document.createElement('div');container.className='phone-frame';container.innerHTML='<div class="app"></div>';container.firstChild.append(document.importNode(gate,true));document.body.append(container);
        document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
        history.replaceState(null,'',file);
      },{raw,file,id,lang,base});
      await page.addScriptTag({url:base+'/native-runtime.js'});await sleep(500);
      const exit='#'+id+' .kiwi-native-role-back';
      if(id==='screen-clockin') { await page.setViewport({width:402,height:450,isMobile:true,hasTouch:true}); check(await page.$eval(exit,e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}),lang+': clock-in escape stays above the form at keyboard height'); }
      check(await page.evaluate(()=>__host.tabs.length===0),id+': host blocked');
      await page.$eval(exit,e=>e.scrollIntoView({block:'center'}));
      check(await page.$eval(exit,e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<=innerHeight;}),id+' '+lang+': later gate has reachable escape');
      await page.screenshot({path:path.join(work,id+'-'+lang+'.png')});
      await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click(exit)]);
      check(new URL(page.url()).searchParams.has('choose'),id+': escape route works');
      await context.close();
    }
  }
  console.log(`native-pass3-gates-test: ${checks} controls passed; evidence: ${work}`);
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
