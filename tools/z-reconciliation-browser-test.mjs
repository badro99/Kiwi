#!/usr/bin/env node
// Actual date-range/headline renderer and Z client, synthetic merchant only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname,'..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core',{paths:[path.join(ROOT,'app'),ROOT]})); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);
if (!executablePath) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }
let mode='closed', fail=false;
const blocked={id:'synthetic-blocked',amountCents:5700,method:'card',ts:Date.now(),reason:'sale-conflict'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/z-reconciliation'){
  if(fail){res.writeHead(503);res.end('{}');return;}
  const day=url.searchParams.get('day');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ok:true,daySummary:{day,source:mode==='closed'?'closed-z':mode==='open'?'live-ledger':'ledger-only',
   referenceCents:mode==='closed'?150700:31400,recordedCents:31400,reportedCents:mode==='closed'?150700:null,
   gapCents:119300,missingCount:9,waitingCount:9,comparisonAvailable:mode!=='history',
   blocked:mode==='closed'?[{id:'synthetic-blocked',amountCents:5700,method:'card',ts:Date.now(),reason:'sale-conflict'}]:[]}}));
 }else if(url.pathname==='/kiwi-caisse.html'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<html><body><h1>Amira · synthetic till</h1><div class="quick-actions"></div>
    <script>window.__flushes=0;window.KiwiLive={queueStatus:()=>({blocked:1,pending:0,blockedEntries:[${JSON.stringify(blocked)}]}),flush:()=>{window.__flushes++;return Promise.resolve()}};</script>
    <script src="/assets/caisse-pwa.js"></script></body></html>`);
 }else if(url.pathname==='/kiwi-admin.html'){
  const ids=['op-workspace','op-dossier-summary','op-new-task','op-search-shortcut','refresh','op-page-name','op-eyebrow','op-page-title','op-page-copy','op-freshness','mode-badge'];
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<html><body>${ids.map(id=>'<div id="'+id+'"></div>').join('')}
   <script>window.KiwiOperator={snapshot:()=>({clients:[{merchant:'amira-fixture',business:'Amira fixture'}],live:true,now:Date.now()}),close:()=>{},open:()=>{},refresh:()=>{},api:async path=>path==='/operators'?{operators:[]}:{now:Date.now(),merchant:'',sources:{caisseSync:{available:true,rows:[{merchant:'amira-fixture',app:'caisse',deviceId:'synthetic-till',updated_ts:Date.now(),sync:{total:1,blocked:1,blockedEntries:[${JSON.stringify(blocked)}]}}]}}}};</script>
   <script src="/assets/admin-policy.js"></script><script src="/assets/admin-workspace.js"></script></body></html>`);
 }else if(['/assets/z-reconciliation.js','/assets/dateRange.js','/assets/caisse-pwa.js','/assets/admin-policy.js','/assets/admin-workspace.js'].includes(url.pathname)){
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(ROOT,url.pathname)));
 }else{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<html><body style="margin:16px;font-family:system-ui"><main id="kw-main"><h1>Amira · synthetic merchant</h1>
  <div><div data-hero-label></div><div data-hero-amount>0,00 MAD</div></div></main>
  <script>
  window.Kiwi={handlers:{}}; window.KiwiEnv={isReal:()=>true}; window.__kiwiRole='owner';
  window.KiwiLive={merchant:()=>"amira-fixture"};
  window.KiwiVenue={isCustom:()=>true,getVenue:()=>"amira-fixture",getCurrentVenueData:()=>({id:'amira-fixture',type:new URLSearchParams(location.search).get('type')||'cafe'}),subscribe:()=>{}};
  window.KiwiSales={list:()=>[],subscribe:()=>{}};
  </script><script src="/assets/dateRange.js"></script><script src="/assets/z-reconciliation.js"></script></body></html>`);
 }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
let checks=0;
try{
 for(const type of ['restaurant','boutique']){
  mode='closed';fail=false;
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html?type=${type}`);
  assert.equal(await page.$('#kiwi-z-reconciliation-alert'),null,'no financial comparison before unlock');checks++;
  await page.evaluate(()=>window.dispatchEvent(new Event('kiwi:dashboard-unlocked')));
  await page.waitForFunction(()=>document.querySelector('[data-hero-amount]')?.textContent.replace(/\s/g,'')==='1507,00MAD',{timeout:5000});checks++;
  assert.match(await page.$eval('[data-hero-label]',n=>n.textContent),/RAPPORT Z/);checks++;
  let text=await page.$eval('#kiwi-z-reconciliation-alert',n=>n.textContent.replace(/\s/g,' '));
  assert.match(text,/314,00 MAD/);assert.match(text,/1.193,00 MAD/);assert.match(text,/9 reçu\(s\) manquant/);checks+=3;
  await page.click('#kiwi-z-reconciliation-alert summary');
  assert.match(await page.$eval('#kiwi-z-reconciliation-alert details',n=>n.innerText),/57,00 MAD · card.*sale-conflict/);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);checks++;
  if(process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace('.png','-'+type+'.png'),fullPage:true});
  mode='open';await page.evaluate(()=>KiwiZReconciliation.showDashboard());
  await page.waitForFunction(()=>document.querySelector('[data-hero-amount]')?.textContent.replace(/\s/g,'')==='314,00MAD');checks++;
  assert.match(await page.$eval('#kiwi-z-reconciliation-alert',n=>n.textContent),/9 reçu\(s\) en attente/);checks++;
  mode='history';await page.evaluate(()=>KiwiDateRange.setDateRange('hier'));
  await page.waitForFunction(()=>document.querySelector('#kiwi-z-reconciliation-alert')?.textContent.includes('impossible de vérifier'));checks++;
  assert.match(await page.$eval('[data-hero-label]',n=>n.textContent),/VENTES ENREGISTRÉES/);checks++;
  await page.evaluate(()=>KiwiDateRange.setDateRange('septJours'));
  assert.equal(await page.$('#kiwi-z-reconciliation-alert'),null,'no single-day reference on aggregate range');checks++;
  await page.evaluate(()=>KiwiDateRange.setDateRange('aujourdhui'));
  await page.waitForSelector('#kiwi-z-reconciliation-alert');
  fail=true;await page.evaluate(()=>KiwiZReconciliation.showDashboard());
  assert.match(await page.$eval('#kiwi-z-reconciliation-alert',n=>n.textContent),/indisponible/);checks++;
  assert.equal(await page.evaluate(()=>KiwiZReconciliation.reference()),null,'stale Z not shown after fetch failure');checks++;
  assert.deepEqual(errors,[]);checks++;
  await page.close();
 }
 const till=await browser.newPage();await till.setViewport({width:390,height:844});
 await till.goto(`http://127.0.0.1:${server.address().port}/kiwi-caisse.html`);
 await till.click('#kiwi-net');await till.waitForSelector('dialog[open]');
 const detail=await till.$eval('dialog',n=>n.textContent);
 assert.match(detail,/57.00 MAD · card/);checks++;
 assert.match(detail,/sale-conflict/);checks++;
 assert.match(detail,/contacter le support/);checks++;
 assert.equal(await till.evaluate(()=>window.__flushes),0,'opening debt details must not resend money');checks++;
 if(process.env.KIWI_TEST_SCREENSHOT) await till.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace('.png','-till.png')});
 await till.click('dialog button');await till.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(await till.$('dialog'),null);checks++;
 await till.close();
 const admin=await browser.newPage();const adminErrors=[];admin.on('pageerror',e=>adminErrors.push(e.message));
 await admin.goto(`http://127.0.0.1:${server.address().port}/kiwi-admin.html#fleet`);
 await admin.waitForFunction(()=>document.querySelector('#op-workspace')?.textContent.includes('synthetic-blocked'));
 const fleet=await admin.$eval('#op-workspace',n=>n.textContent);
 assert.match(fleet,/57.00 MAD · card/);checks++;
 assert.match(fleet,/sale-conflict/);checks++;
 assert.deepEqual(adminErrors,[]);checks++;
 if(process.env.KIWI_TEST_SCREENSHOT) await admin.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace('.png','-godmode.png'),fullPage:true});
 await admin.close();
 console.log('✓ '+checks+' actual browser assertions: restaurant + boutique, headline Z/live/history, blocked details, date switching, narrow viewport, unavailable state');
}finally{await browser.close();await new Promise(r=>server.close(r));}
