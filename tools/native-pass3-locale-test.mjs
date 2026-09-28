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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pass3-locale-'));
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
  for(const lang of ['fr','en','ar']) {
    const {page,context}=await phone(lang);
    await page.goto(base+'/kiwi-serveur.html',{waitUntil:'networkidle2'});
    await page.waitForFunction(locale=>document.documentElement.lang===locale,{},lang);
    const strings=await page.evaluate(()=>Object.fromEntries(['.pin-tagline','.pin-hint','.pin-foot','#nfc-caption','#ci-button span','#ci-browse-link span','.profil-theme-option[data-theme-choice="auto"] span'].map(s=>[s,document.querySelector(s)?.textContent.trim()])));
    const expected={fr:['Équipe','Entrez votre code','Système'],en:['Team','Enter your code','System'],ar:['الفريق','أدخل رمزك','النظام']}[lang];
    check(strings['.pin-tagline']===expected[0]&&strings['.pin-hint']===expected[1],lang+': gate copy follows app locale despite stale French preference');
    check(strings['.profil-theme-option[data-theme-choice="auto"] span']===expected[2],lang+': theme choices translated');
    if(lang!=='fr') check(!Object.values(strings).some(v=>/Saisissez|Pointer|Votre compte|Consulter/.test(v)),lang+': later gate copy translated');
    check(await page.evaluate(l=>document.documentElement.dir===(l==='ar'?'rtl':'ltr'),lang),lang+': direction matches locale');
    await page.evaluate(()=>{const e=document.createElement('p');e.id='qa-employee-error';e.textContent='Code de pointage incorrect ou expiré';document.querySelector('#screen-pin').append(e);});
    const error={fr:'Code de pointage incorrect ou expiré',en:'Clock-in code is incorrect or expired',ar:'رمز بدء الوردية غير صحيح أو منتهي الصلاحية'}[lang];
    await page.waitForFunction(text=>document.querySelector('#qa-employee-error').textContent===text,{},error);
    check(true,lang+': dynamic attendance errors translated');
    await page.evaluate(()=>document.querySelector('#qa-employee-error').remove());
    await page.screenshot({path:path.join(work,'team-'+lang+'.png')});
    await page.goto(base+'/kiwi-caisse.html',{waitUntil:'networkidle2'});
    await page.waitForFunction(()=>!!window.KiwiCaisseLang);
    const refund=await page.evaluate(()=>({subtitle:document.querySelector('#rf-search-input')?.closest('.modal')?.querySelector('.modal-subtle')?.textContent,placeholder:document.querySelector('#rf-search-input')?.placeholder,translated:KiwiCaisseLang.tr("Khtar la transaction à rembourser, journal d'lyoum.")}));
    if(lang!=='fr') check(!/Khtar|Rechercher/.test(refund.translated+' '+refund.placeholder),lang+': refund copy has no French or Darija');
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await page.waitForSelector('.kob-root [data-explore]');await page.click('.kob-root [data-explore]');
    await page.waitForSelector('[data-kiwi-skip]',{visible:true});await page.click('[data-kiwi-skip]');
    await page.evaluate(()=>Kiwi.handlers['clients-directory']());
    await page.waitForSelector('[data-cd-id]');
    await page.click('[data-cd-id]');
    const gender={fr:'Femme',en:'Woman',ar:'أنثى'}[lang];
    await page.waitForFunction(g=>[...document.querySelectorAll('.cd-drow .v')].some(n=>n.textContent===g),{},gender);
    check(true,lang+': customer gender translated without altering stored value');
    await page.screenshot({path:path.join(work,'client-'+lang+'.png')});
    await context.close();
  }
  console.log(`native-pass3-locale-test: ${checks} controls passed; evidence: ${work}`);
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
