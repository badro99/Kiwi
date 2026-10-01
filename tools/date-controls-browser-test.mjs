#!/usr/bin/env node
// #143/#144: shipped calendar, skins and lens, real wheel/touch input. No merchant APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {createRequire} from 'node:module';
const root=path.resolve(new URL('..',import.meta.url).pathname), read=f=>fs.readFileSync(path.join(root,f),'utf8');
const require=createRequire(path.join(root,'app/package.json')), puppeteer=require('puppeteer-core');
const bin=process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin,'Chromium required for date controls');
const source=read('dashboard.html');
const styles=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m=>m[1] || (m[2].startsWith('assets/')?read(m[2].split('?')[0]):'')).join('\n')+'\n'+read('app/src/native-runtime.css');
export const fixture=()=>`<!doctype html><html class="kiwi-native kiwi-native-ios"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>body{margin:0;min-height:2800px;padding:18px;box-sizing:border-box}.fixture-spacer{height:400px}#dates{min-width:0;width:100%}</style></head><body class="design-2026 design-vexel kiwi-native-owner" data-vexel-mode="dark"><h1>Date controls</h1><p>Shared day selector · synthetic fixture</p><div class="fixture-spacer"></div><div id="dates"></div><div class="fixture-spacer"></div><script>window.KiwiDashboardBoot={whenUnlocked(){}};window.KiwiI18n={getLang:()=>document.documentElement.lang||'en'};window.KiwiDayReport={today:()=> '2026-09-30',shiftDay:(day,n)=>{let d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}};window.selected='2026-09-30';window.mount=()=>KiwiDateRange.mountDaySelector(document.querySelector('#dates'),{offsets:[0,1,2],value:selected,onChange:day=>{selected=day;mount()}});</script><script src="assets/interactive.js"></script><script src="assets/dateRange.js"></script><script src="assets/liquid-lens.js"></script><script>mount()</script></body></html>`;
if(process.env.KIWI_DATE_FIXTURE_ONLY==='1'){fs.writeFileSync(process.env.KIWI_DATE_FIXTURE_PATH,fixture());process.exit(0)}
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/fixture.html'){res.setHeader('Content-Type','text/html');res.end(fixture());return}const f=path.resolve(root,'.'+url.pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(f,(err,b)=>{res.writeHead(err?404:200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});res.end(err?'':b)})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`, out=process.env.KIWI_QA_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-date-controls-'));
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
const check=(yes,msg)=>{assert.ok(yes,msg);checks++;console.log(' ✓ '+msg)};
async function swipe(page,x,y,dx,dy){const c=await page.createCDPSession();await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y:y+dy*i/10}]});await pause(20)}await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();await pause(400)}
try{
for(const [width,height] of [[375,667],[402,874]]) for(const lang of ['fr','en','ar']) for(const theme of ['light','dark']){
 if(process.env.KIWI_DATE_FILTER && process.env.KIWI_DATE_FILTER!==`${width}-${lang}-${theme}`)continue;
 const p=await browser.newPage();await p.setViewport({width,height,isMobile:true,hasTouch:true,deviceScaleFactor:1});await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await p.setRequestInterception(true);p.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());await p.goto(base+'/fixture.html');await p.evaluate(()=>document.fonts.ready);
 await p.evaluate(({lang,theme})=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.documentElement.dataset.theme=theme;document.body.dataset.vexelMode=theme;document.documentElement.style.setProperty('--kiwi-host-safe-bottom','34px');mount();document.querySelector('#dates').scrollIntoView({block:'center',behavior:'instant'})},{lang,theme});await pause(200);
 const prefix=`${width}-${lang}-${theme}`;
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+': no horizontal page overflow');
 if(process.env.KIWI_DATE_CASE!=='sheet'){
 const row=await p.$eval('.dr-pills',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:e.scrollLeft,max:e.scrollWidth-e.clientWidth}});
 const towardsEnd=Math.abs(row.scroll)<row.max/2;
 const selectedBefore=await p.evaluate(()=>selected);
 await swipe(p,row.x+row.width/2,row.y+row.height/2,(lang==='ar'?130:-130)*(towardsEnd?1:-1),0);
 check(await p.evaluate(()=>selected)===selectedBefore,prefix+': horizontal swipe never selects a day');
 if(process.env.KIWI_DATE_FILTER) console.log('track',row,await p.$eval('.dr-pills',e=>({after:e.scrollLeft,touch:getComputedStyle(e).touchAction,overflow:getComputedStyle(e).overflowX,display:getComputedStyle(e).display,snap:getComputedStyle(e).scrollSnapType,hit:document.elementFromPoint(e.getBoundingClientRect().x+e.clientWidth/2,e.getBoundingClientRect().y+e.clientHeight/2)?.outerHTML.slice(0,200)})));
 if(row.max>=20) await p.waitForFunction((before)=>Math.abs(document.querySelector('.dr-pills').scrollLeft-before)>10,{timeout:2500},row.scroll).catch(()=>console.log('failed-track',prefix,row));
 check(row.max<20 || await p.$eval('.dr-pills',(e,before)=>Math.abs(e.scrollLeft-before)>10,row.scroll),prefix+': horizontal swipe moves overflowing track (or every pill already fits)');
 // All options can be reached and tapped, including a re-mounted selected pill.
 for(const offset of [2,1,0]){await p.$eval(`[data-dr-day-offset="${offset}"]`,e=>e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));await p.tap(`[data-dr-day-offset="${offset}"]`);await pause(150);
 check(await p.$eval('.dr-pill.on',e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.height>=44}),prefix+': selected day visible and 44pt');}
 const y0=await p.evaluate(()=>scrollY),r2=await p.$eval('.dr-pills',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
 await swipe(p,r2.x,r2.y,0,-90);check(await p.evaluate(y=>scrollY>y+20,y0),prefix+': vertical swipe on pills still scrolls page');
 }
 await p.$eval('[data-dr-day-custom]',e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));const original=await p.evaluate(()=>scrollY);await p.tap('[data-dr-day-custom]');await p.waitForSelector('.dr-sheet.open');await pause(150);
 check(await p.evaluate(()=>getComputedStyle(document.body).position==='fixed'),prefix+': sheet owns body position lock');
 const pageTop=await p.evaluate(()=>scrollY), bodyTop=await p.$eval('body',e=>e.getBoundingClientRect().top);
 const body=await p.$eval('.drp-body',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height,max:e.scrollHeight-e.clientHeight}});
 check(body.max>40,prefix+': calendar has its own scrollable extent');
 await p.mouse.move(body.x,body.y);await p.mouse.wheel({deltaY:180});await pause(150);
 check(await p.$eval('.drp-body',e=>e.scrollTop>20),prefix+': wheel scrolls calendar, not background');
 check(await p.evaluate(y=>scrollY===y,pageTop)&&Math.abs(await p.$eval('body',e=>e.getBoundingClientRect().top)-bodyTop)<1,prefix+': background unchanged while sheet scrolls');
 await swipe(p,body.x,body.y,0,-90);
 check(await p.$eval('.drp-foot',e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>0}),prefix+': pinned footer remains visible');
 await p.$eval('.drp-body',e=>e.scrollTo(0,0));await p.tap('[data-nav="prev"]');await pause(80);
 const day=await p.$('.drp-day[data-day]:not([disabled])');await day.tap();await p.tap('[data-drp-apply]');await pause(350);
 check(await p.evaluate(y=>Math.abs(scrollY-y)<1&&getComputedStyle(document.body).position!=='fixed',original),prefix+': Apply restores exact background position');
 await p.$eval('[data-dr-day-custom]',e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await p.tap('[data-dr-day-custom]');await p.waitForSelector('.dr-sheet.open');await p.screenshot({path:path.join(out,prefix+'.png')});await p.tap('[data-drp-cancel]');await pause(350);
 check(await p.evaluate(()=>!document.querySelector('.dr-sheet')&&window.__kiwiScrollLocks===0),prefix+': close releases lock');await p.close();
}
console.log(`date-controls-browser-test: ${checks} checks; screenshots ${out}`);
}finally{await browser.close();await new Promise(r=>server.close(r))}
