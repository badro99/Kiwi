#!/usr/bin/env node
// #100/#97: real dashboard clicks, not merely markup checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  if (pathname.startsWith('/api/')) { res.writeHead(pathname === '/api/me' ? 200 : 404, {'Content-Type':'application/json'}); res.end(pathname === '/api/me' ? '{"authenticated":false}' : '{}'); return; }
  const file = path.resolve(ROOT, pathname === '/' ? 'dashboard.html' : pathname.replace(/^\/+/,''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
let checks=0;
// Resolves once the host node has stayed the same element for 800 ms.
async function settled(sel){ await page.waitForFunction((q)=>{ const el=document.querySelector(q); const now=performance.now(); if(!el) return false; if(window.__settleEl!==el){ window.__settleEl=el; window.__settleAt=now; return false; } return now-window.__settleAt>800; },{polling:100},sel); }
try {
  page=await browser.newPage();
  await page.setViewport({width:1440,height:900});
  await page.evaluateOnNewDocument(()=>{
    const venue={id:'v-date-selector',name:'Date selector fixture',slug:'date-selector',type:'restaurant',custom:true,status:'En service',txCount:0,staffCount:0};
    localStorage.setItem('kiwiCustomVenues',JSON.stringify([venue])); localStorage.setItem('kiwiVenue',venue.id); localStorage.setItem('kiwiOnboarded','1');
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`,{waitUntil:'load',timeout:30000});
  await page.waitForSelector('.kiwi-lock-skip',{visible:true}); await page.click('.kiwi-lock-skip');
  await page.waitForSelector('.sidebar nav a[data-nav="transactions"]');
  // pages-pro.js wraps nav handlers at load+150 ms; a click before that opens the demo page.
  await page.waitForFunction(()=>window.Kiwi?.handlers?.['nav-transactions']?.__kiwiStarter===true);
  await page.click('.sidebar nav a[data-nav="transactions"]');
  await page.waitForSelector('[data-rtx-day-selector] [data-dr-day-offset="2"]',{visible:true}); checks++;
  assert.ok(await page.$('[data-rtx-day-selector] .dr-pills[data-kw-lens]'),'Commandes uses the shared liquid lens'); checks++;
  assert.equal(await page.$eval('[data-rtx-day-selector]',el=>[...el.querySelectorAll('button')].map(x=>x.textContent.trim()).join('|')),"Aujourd'hui|Hier|Avant-hier|Choisir une date"); checks++;
  await page.click('[data-rtx-day-selector] [data-dr-day-offset="2"]');
  await page.waitForFunction(()=>document.querySelector('[data-rtx-day-selector] [data-dr-day-offset="2"]')?.getAttribute('aria-pressed')==='true'); checks++;
  // Choosing a day re-renders the page (sales, then the activity fetch). Click once it has settled.
  await settled('[data-rtx-day-selector]');
  await page.click('[data-rtx-day-selector] [data-dr-day-custom]');
  await page.waitForSelector('.dr-popover.open [data-drp-apply]',{visible:true}); checks++;
  assert.ok((await page.$$('.dr-popover.open .drp-month')).length >= 1); checks++;
  const past=await page.evaluate(()=>[...document.querySelectorAll('.dr-popover.open .drp-day[data-day]:not(:disabled)')].map(x=>x.dataset.day).sort()[0]);
  await page.click(`.dr-popover.open .drp-day[data-day="${past}"]`);
  await page.click('.dr-popover.open [data-drp-apply]');
  await page.waitForFunction(()=>document.querySelector('[data-rtx-day-selector] [data-dr-day-custom]')?.getAttribute('aria-pressed')==='true'); checks++;
  if (process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace(/\.png$/,'-orders-light.png'),fullPage:true});
  await page.click('.sidebar nav a[data-nav="rapport"]');
  await page.waitForSelector('[data-kdr-day-selector] [data-dr-day-offset="1"]',{visible:true}); checks++;
  assert.ok(await page.$('[data-kdr-day-selector] .dr-pills[data-kw-lens]'),'Rapport uses the shared liquid lens'); checks++;
  await page.click('[data-kdr-day-selector] [data-dr-day-offset="1"]');
  await page.waitForFunction(()=>document.querySelector('[data-kdr-day-selector] [data-dr-day-offset="1"]')?.getAttribute('aria-pressed')==='true'); checks++;
  await page.click('[data-kdr-day-selector] [data-dr-day-custom]');
  await page.waitForSelector('.dr-popover.open [data-drp-apply]',{visible:true}); checks++;
  const reportPast=await page.evaluate(()=>[...document.querySelectorAll('.dr-popover.open .drp-day[data-day]:not(:disabled)')].map(x=>x.dataset.day).sort()[0]);
  await page.click(`.dr-popover.open .drp-day[data-day="${reportPast}"]`);
  await page.click('.dr-popover.open [data-drp-apply]');
  await page.waitForFunction(()=>document.querySelector('[data-kdr-day-selector] [data-dr-day-custom]')?.getAttribute('aria-pressed')==='true'); checks++;
  await page.click('[data-kdr-day-selector] [data-dr-day-custom]');
  await page.waitForSelector('.dr-popover.open [data-drp-apply]',{visible:true});
  if (process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace(/\.png$/,'-report-light.png'),fullPage:true});
  await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.body.setAttribute('data-theme','dark');});
  assert.notEqual(await page.$eval('.dr-popover.open',el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)'); checks++;
  const darkDay = await page.$eval('.dr-popover.open .drp-day[data-day]:not(:disabled)', el => ({color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity,child:getComputedStyle(el.firstElementChild).color}));
  assert.equal(darkDay.opacity,'1','past calendar dates remain readable in dark mode'); checks++;
  if (process.env.KIWI_DEBUG_DATE) console.log('dark-day', darkDay);
  if (process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({path:process.env.KIWI_TEST_SCREENSHOT.replace(/\.png$/,'-report-dark.png'),fullPage:true});
  console.log(`✓ shared day selector browser: ${checks} real-click assertions`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
