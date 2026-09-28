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
  const {page,context}=await phone('en');
  await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
  await page.waitForSelector('.kob-root [data-explore]');
  await page.click('.kob-root [data-explore]'); await sleep(1200);
  await page.click('[data-kiwi-skip]'); await sleep(2200);
  for (const range of ['aujourdhui','hier','septJours','trenteJours']) {
    await page.click('.dr-pill[data-range="'+range+'"]'); await sleep(1200);
    const values = await page.evaluate(range=>{
      const dr=KiwiDayReport, clock=KiwiDemoClock;
      const rows=range==='aujourdhui'?clock.getDaySales():range==='hier'?clock.getDaySales(dr.shiftDay(dr.today(),-1)):clock.getSales(range==='septJours'?7:30);
      const amount=Math.round(rows.reduce((s,r)=>s+Math.round(r.amount*100),0)/100);
      const shown=document.querySelector('[data-rev-hero-val]').textContent.replace(/[^0-9,.-]/g,'').replace(',','.');
      return {amount,shown};
    },range);
    check(Math.round(Number(values.shown))===values.amount, 'visible home '+range+' total matches ledger');
  }
  await page.click('.dr-pill[data-range="aujourdhui"]'); await sleep(1200);
  const stats = await page.evaluate(() => {
    const clock=KiwiDemoClock, dr=KiwiDayReport, rows=clock.getDaySales(), sim=clock.getSimState();
    const today=dr.today(), bounds=dr.dayBounds(today);
    const report=dr.build({day:today,sales:clock.getSales(30)});
    const yesterday=dr.shiftDay(today,-1), old=dr.build({day:yesterday,sales:clock.getSales(30)});
    return {count:rows.length, total:rows.reduce((s,r)=>s+Math.round(r.amount*100),0)/100, sim, report, old,
      valid:rows.every(r=>r.ts>=bounds.from && r.ts<bounds.to && r.ts<=Date.now()),
      stable:JSON.stringify(rows)===JSON.stringify(clock.getDaySales()),
      days:new Set(clock.getSales(14).map(r=>dr.businessDay(r.ts))).size};
  });
  check(stats.valid && stats.stable, 'demo timestamps inside current business day, never future; rows stable');
  check(stats.total===stats.sim.cumRevenue && stats.count===stats.sim.cumTx, 'home revenue and count sum the ledger');
  check(stats.report.net===stats.total && stats.report.txns===stats.count, 'daily report matches the same ledger');
  check(stats.old.txns>0 && stats.old.net>0 && stats.days>=13, 'yesterday and 14-day report history seeded');
  await page.evaluate(()=>window.KiwiNativeHostAction({action:"navigate",id:"transactions"})); await sleep(500);
  const orders=await page.$eval('[data-tx-host] .p-hero',e=>e.textContent);
  check(orders.includes(String(stats.count)), 'Orders renders ledger count');
  check(!/refresh|clock sync|horloge|ثوان/.test(orders), 'Orders never exposes a developer polling caption');
  await page.screenshot({path:path.join(work,'orders.png')});
  await page.evaluate(()=>window.KiwiNativeHostAction({action:"navigate",id:"clients"})); await sleep(500);
  await page.click('[data-cd-id]'); await sleep(250);
  const history=await page.$$eval('.cd-history-row',els=>els.map(e=>e.textContent));
  check(history.length===31, 'VIP has 31 purchase records rather than empty history');
  await page.screenshot({path:path.join(work,'client.png')});
  const isolation=await page.evaluate(()=>{window.KiwiEnv={isReal:()=>true};return {sim:KiwiDemoClock.getSimState(),rows:KiwiDemoClock.getSales(30)}});
  check(isolation.sim===null && isolation.rows.length===0, 'real identity closes every demo ledger entry point');
  await context.close();
  console.log(`native demo ledger: ${checks} checks passed; evidence ${work}`);
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
