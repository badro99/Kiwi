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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-qa-six-fixes-'));
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
// Regression for the six findings reproduced in the actual native wrapper.
// This local bundle suite isolates ALL external traffic; native proof is separate.
try {
  const {page,context,verificationRequests,authRequests}=await phone('en');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
  await page.waitForSelector('.kob-root [data-explore]');
  await page.click('.kob-root [data-explore]');await sleep(1200);
  await page.click('[data-kiwi-skip]');await sleep(1800);
  const go=async id=>{const close=await page.$('.kiwi-drawer-backdrop .kiwi-drawer-close');if(close){await close.click();await sleep(450);}await page.evaluate(id=>KiwiNativeHostAction({action:'navigate',id}),id);await sleep(500);await page.waitForFunction(id=>Kiwi.activePage===(id==='clients'?'crm':id),{},id);};
  for(const lang of ['en','fr','ar']) {
    await page.evaluate(lang=>KiwiI18n.setLang(lang),lang);await sleep(300);
    await go('clients');await page.click('#cd-new,[data-cd-new]');
    let form=await page.evaluate(()=>({wa:document.querySelector('#cdn-consent').checked,email:document.querySelector('#cdn-consent-email').checked,hint:document.querySelector('#cdn-consent-hint').textContent}));
    check(!form.wa&&!form.email,lang+': new customer starts with no marketing consent');
    check(form.hint.includes({en:'Optional',fr:'Facultatif',ar:'اختياري'}[lang])&&!/requis|CNDP|required/.test(form.hint),lang+': optional consent copy is translated');
    await page.type('#cdn-name','Local QA opt-out '+lang);
    await page.click('[data-save]');await page.waitForSelector('#cdn-name',{hidden:true});await sleep(350);
    check(await page.evaluate(lang=>{const r=KiwiClients.list().find(c=>c.name==='Local QA opt-out '+lang);return r&&!r.consent&&!r.consentEmail;},lang),lang+': opt-out customer saves without granting consent');
    await page.click('#cd-new,[data-cd-new]');
    await page.type('#cdn-name','Local QA email-only '+lang);await page.click('#cdn-consent-email');await page.click('[data-save]');await page.waitForSelector('#cdn-name',{hidden:true});await sleep(350);
    check(await page.evaluate(lang=>{const r=KiwiClients.list().find(c=>c.name==='Local QA email-only '+lang);return r&&!r.consent&&r.consentEmail;},lang),lang+': explicit email consent does not grant WhatsApp consent');
    await page.click('#cd-new,[data-cd-new]');
    check(await page.evaluate(()=>!document.querySelector('#cdn-consent').checked&&!document.querySelector('#cdn-consent-email').checked),lang+': reopening resets both choices');
    await page.click('.kiwi-modal [data-close]');await page.waitForSelector('#cdn-name',{hidden:true});await sleep(400);
    await go('equipe');
    const team=await page.evaluate(()=>({roster:KiwiTeam.roster(),shown:Number(document.querySelectorAll('.eq-stat-v')[1]?.textContent),rows:[...document.querySelectorAll('.eq-member-phone-status')].map(e=>e.textContent)}));
    check(team.shown===team.roster.filter(m=>m.status==='on-duty').length,lang+': Team summary agrees with roster');
    const duty={en:'On duty',fr:'En service',ar:'في الخدمة'}[lang];
    check(team.rows.filter(t=>t===duty).length===team.shown,lang+': visible member statuses agree with summary');
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>KiwiI18n.setTheme(theme),theme);await sleep(250);
      await go('accueil');
      const ink=await page.evaluate(()=>({selected:getComputedStyle(document.querySelector('.dr-pill.on')).color,normal:getComputedStyle(document.querySelector('.dr-pill:not(.on)')).color}));
      check(ink.selected===ink.normal,lang+' '+theme+': selected Home date uses readable theme ink');
      await go('tables');
      const floor=await page.evaluate(()=>({summary:document.querySelector('.pdsp-sum').textContent,cards:[...document.querySelectorAll('.pdsp-srv')].map(e=>({accent:e.style.getPropertyValue('--c'),bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e.querySelector('b')).color,avatar:getComputedStyle(e.querySelector('.pdsp-av')).backgroundColor}))}));
      check(floor.cards.length>=3 && floor.cards.every(c=>c.bg===floor.cards[0].bg),lang+' '+theme+': amber server card stays neutral like its peers');
      check(floor.cards.some(c=>c.accent==='#D99A2B'),lang+' '+theme+': amber staff accent preserved');
      check(lang!=='ar'||(/طاولات/.test(floor.summary)&&!/tables/i.test(floor.summary)),lang+' '+theme+': floor summary uses correct language');
      await page.screenshot({path:path.join(work,lang+'-'+theme+'-floor.png')});
    }
  }
  check(!errors.length,'no runtime errors in six-fix flows: '+errors.join('; '));
  check(verificationRequests()===0&&authRequests()===0,'no code entry or account login required');
  await context.close();console.log(`native QA six fixes: ${checks} checks passed; evidence ${work}`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
