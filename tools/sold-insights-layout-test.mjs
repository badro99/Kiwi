#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {longListData,longListPage,MERCHANT} from './till-long-scroll-fixture.mjs';
import {releaseExitedBrowserStreams} from './browser-test-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'app', 'package.json'));
const puppeteer = require('puppeteer-core');
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((candidate) => fs.existsSync(candidate));
if (!chrome) throw new Error('Chromium/Chrome executable not found');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--sans:Arial,sans-serif;--num:Arial,sans-serif;--ink:#111;--surface:#fff;--paper:#faf8f4;--paper-soft:#f5f3ef;--n-100:#eee;--n-200:#dedbd5;--n-500:#777;--atlas:#087a5b}
  *{box-sizing:border-box}body{margin:0;background:var(--paper)}#panel{min-height:100vh}
</style></head><body><section id="panel"></section><script>
  window.KiwiBoutiqueCatalog={listCategories:()=>[],listProducts:()=>[],listVariants:()=>[]};
  window.KiwiPlatform={pairedMerchant:()=>''};
</script><script src="/assets/sold-insights.js"></script><script>
  KiwiSoldInsights.renderTill(document.getElementById('panel'));
</script></body></html>`;
const inlineCss=[...fs.readFileSync(path.join(ROOT,'kiwi-caisse.html'),'utf8').replace(/<!--[\s\S]*?-->/g,'').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n');
const shots=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-sold-layout-'));
const server = http.createServer((req, res) => {
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  if(pathname==='/boutique.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end(longListPage('boutique'));return;}
  if(pathname==='/caisse-inline.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(inlineCss);return;}
  if(pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"authenticated":false,"sales":[],"balances":[]}');return;}
  if (/^\/(assets|app\/src)\//.test(pathname)) {
    const file=path.resolve(ROOT,'.'+pathname);
    if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.writeHead(200, { 'Content-Type': {'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream' });
    res.end(fs.readFileSync(file));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'load' });
  const desktop = await page.evaluate(() => {
    const strip = document.querySelector('.kx-kpi-strip');
    const icon = document.querySelector('.kx-empty .ico');
    const svg = icon.querySelector('svg');
    return {
      stripDisplay: getComputedStyle(strip).display,
      stripColumns: getComputedStyle(strip).gridTemplateColumns.split(' ').length,
      icon: [Math.round(icon.getBoundingClientRect().width), Math.round(icon.getBoundingClientRect().height)],
      svg: [Math.round(svg.getBoundingClientRect().width), Math.round(svg.getBoundingClientRect().height)],
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  assert.equal(desktop.stripDisplay, 'grid');
  assert.equal(desktop.stripColumns, 4);
  assert.deepEqual(desktop.icon, [46, 46]);
  assert.deepEqual(desktop.svg, [22, 22]);
  assert.equal(desktop.pageWidth, 1440);
  await page.click('[data-ksold-custom]');
  const exactPicker = await page.evaluate(() => ({
    visible: !!document.querySelector('.ksold-picker'),
    mode: document.querySelector('[data-ksold-mode="day"]')?.classList.contains('on'),
    dates: document.querySelectorAll('.ksold-picker input[type="date"]').length,
  }));
  assert.deepEqual(exactPicker, { visible:true, mode:true, dates:1 });
  await page.click('[data-ksold-mode="range"]');
  const rangePicker = await page.evaluate(() => ({
    mode: document.querySelector('[data-ksold-mode="range"]')?.classList.contains('on'),
    dates: document.querySelectorAll('.ksold-picker input[type="date"]').length,
  }));
  assert.deepEqual(rangePicker, { mode:true, dates:2 });
  async function typeDate(selector,target){
    await page.click(selector,{offset:{x:18,y:18}});
    for(let i=0;i<4;i++)await page.keyboard.press('ArrowLeft');
    const current=(await page.$eval(selector,el=>el.value)).split('-').map(Number),wanted=target.split('-').map(Number);
    // Edit the actual segmented control without depending on automatic segment
    // advancement after typing a two-digit month/day in desktop Chrome.
    for(let i=0;i<Math.abs(wanted[1]-current[1]);i++)await page.keyboard.press(wanted[1]>current[1]?'ArrowUp':'ArrowDown');
    await page.keyboard.press('ArrowRight');
    for(let i=0;i<Math.abs(wanted[2]-current[2]);i++)await page.keyboard.press(wanted[2]>current[2]?'ArrowUp':'ArrowDown');
    await page.keyboard.press('ArrowRight');await page.keyboard.type(String(wanted[0]));
    assert.equal(await page.$eval(selector,el=>el.value),target);
    await page.keyboard.press('Tab');
  }
  await typeDate('[data-ksold-from]','2026-09-10');await typeDate('[data-ksold-to]','2026-09-11');
  await page.click('[data-ksold-apply]');
  assert.match(await page.$eval('[data-ksold-custom]', (el) => el.textContent), /10.*11/);
  assert.ok(await page.$eval('[data-ksold-custom]',el=>el.classList.contains('on')));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.kx-kpi-strip')).gridTemplateColumns.split(' ').length,
    width: document.documentElement.scrollWidth,
  }));
  assert.equal(mobile.columns, 1);
  assert.equal(mobile.width, 390);
  let cases=0;
  for(const [width,height] of [[375,667],[402,874],[861,900],[1024,768],[1440,900]])for(const lang of ['en','fr','ar'])for(const theme of ['light','dark']){
    const context=await browser.createBrowserContext(),p=await context.newPage(),label=`${width}/${lang}/${theme}`,phone=width<861;
    const errors=[];p.on('pageerror',error=>errors.push(error.message));
    await p.setViewport({width,height,isMobile:phone,hasTouch:phone});
    await p.setRequestInterception(true);let writes=0;
    p.on('request',request=>{if(!['GET','HEAD'].includes(request.method())){writes++;return request.abort();}if(!request.url().startsWith(`http://127.0.0.1:${port}/`)&&!request.url().startsWith('data:'))return request.abort();return request.continue();});
    await p.evaluateOnNewDocument(({data,merchant,lang,theme,phone})=>{
      localStorage.setItem('kiwiLiveMerchant',merchant);localStorage.setItem('kiwi:bqDay',JSON.stringify(data.sales));
      localStorage.setItem('kiwiCaisseLang',lang);localStorage.setItem('kiwiLang',lang);
      document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.caisseTheme=theme;if(phone){document.documentElement.classList.add('kiwi-native');document.body.classList.add('kiwi-native-till');}KiwiCaisseLang.set(lang);},{once:true});
    },{data:longListData(),merchant:MERCHANT,lang,theme,phone});
    await p.goto(`http://127.0.0.1:${port}/boutique.html`,{waitUntil:'networkidle0'});
    await p.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const key of await caches.keys())await caches.delete(key);});
    await p.reload({waitUntil:'networkidle0'});await p.evaluate(()=>document.fonts.ready);
    if(phone){await p.click('.vx-burger');await p.waitForFunction(()=>!document.querySelector('.kiwi-dna-rail').getAnimations().some(a=>a.playState==='running'));}
    await p.click('[data-bq-view="vendus"]');await p.waitForSelector('.ksold-full .ksold-row');
    if(phone){await p.waitForFunction(()=>!document.querySelector('.vx-screen').classList.contains('vx-nav-open'));await p.waitForFunction(()=>!document.querySelector('.kiwi-dna-rail').getAnimations().some(a=>a.playState==='running'));}
    async function metrics(){return p.evaluate(()=>{
      const grid=document.querySelector('.ksold-grid'),cards=[...grid.children],box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const row=cards[0].querySelector('.ksold-row');
      const source=JSON.parse(localStorage.getItem('kiwi:bqDay')).s,analysis=KiwiSoldInsights.analyze(source,7);
      return {columns:getComputedStyle(grid).gridTemplateColumns,gap:parseFloat(getComputedStyle(grid).rowGap),grid:box(grid),cards:cards.map(box),name:box(row.querySelector('.ksold-name')),row:box(row),products:cards[0].querySelectorAll('.ksold-row').length,timeline:document.querySelectorAll('.ksold-full .ksold-row').length,tail:document.querySelector('.ksold-full .ksold-row:last-child').textContent,tickets:analysis.tickets,revenue:analysis.revenue,units:analysis.units,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,visualHeight:visualViewport.height};
    });}
    const m=await metrics();
    if(width===375&&lang==='en'&&theme==='light')await p.screenshot({path:path.join(shots,'phone-en-light.png')});
    assert.equal(m.products,12,label+': product cap unchanged');assert.equal(m.timeline,20,label+': timeline cap unchanged');
    assert.deepEqual([m.tickets,m.revenue,m.units],[60,1200,60],label+': records and money unchanged');assert.ok(m.tail.includes('SCROLL-SALE-020'),label+': unchanged last history record');
    assert.equal(m.pageWidth,m.viewport,label+': no page overflow');
    if(phone){
      assert.ok(m.cards.every(card=>Math.abs(card.width-m.grid.width)<1),label+': mobile cards must occupy one full column '+JSON.stringify(m));
      assert.ok(m.cards.slice(1).every((card,i)=>card.y>=m.cards[i].bottom+m.gap-1),label+': cards stack without an empty stretched side column');
      assert.ok(m.cards[1].height<m.cards[0].height*.5,label+': near-empty associations card is not stretched to the product list height');
      assert.ok(m.name.width>=m.row.width*.6,label+': long product names retain readable row width');
      await p.setViewport({width,height:Math.round(height*.6),isMobile:true,hasTouch:true});
      const reduced=await metrics();assert.equal(reduced.viewport,width,label+': reduced-height layout keeps viewport width');
      assert.ok(Math.abs(reduced.visualHeight-Math.round(height*.6))<1,label+': browser visualViewport shrinks with reduced layout height');
      assert.ok(reduced.cards.every(card=>Math.abs(card.width-reduced.grid.width)<1),label+': reduced-height layout stays single-column (not native keyboard proof)');
    }else{
      assert.equal(m.columns.split(' ').length,2,label+': tablet/desktop keeps two columns');
      assert.ok(Math.abs(m.cards[0].width/m.cards[1].width-1.25/.75)<.02,label+': existing 1.25/.75 desktop ratio unchanged');
    }
    assert.deepEqual(errors,[],label+': no page exceptions');assert.equal(writes,0,label+': no API writes');cases++;await context.close();
  }
  console.log(`sold-insights-layout-test: original KPI/icon/date checks + ${cases} real-styled language/theme/width cases passed; screenshots ${shots}; reduced height is not native keyboard proof`);
} finally {
  const child=browser.process();await browser.close();releaseExitedBrowserStreams(child);
  await new Promise((resolve) => server.close(resolve));
}
