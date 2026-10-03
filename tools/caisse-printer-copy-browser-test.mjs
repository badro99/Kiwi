#!/usr/bin/env node
// Real printer-panel copy opened from the boutique menu, never a print,
// hardware connection, pairing, routing save or production write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {releaseExitedBrowserStreams} from './browser-test-lifecycle.mjs';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);
const puppeteer=require(require.resolve('puppeteer-core',{paths:[path.join(root,'app'),root]}));
const executablePath=process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath,'Chromium required');
const fixture=spawn(process.execPath,[path.join(root,'tools/retail-ui-fixture.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
const failures=[];let browser,checks=0;
// Opt-in lifecycle evidence only: no URLs, page contents or network payloads.
const diagnostics=process.env.KIWI_PRINTER_DIAGNOSTICS,started=performance.now();
let phase='fixture-start';
const mark=next=>{
 phase=next;
 if(diagnostics){const child=browser?.process();fs.appendFileSync(diagnostics,JSON.stringify({
  phase,checks,elapsedMs:Math.round(performance.now()-started),resources:process.getActiveResourcesInfo().sort(),
  browserProcess:child?{pid:child.pid,exitCode:child.exitCode,signalCode:child.signalCode,stdio:child.stdio.map(s=>s?{destroyed:s.destroyed,readable:s.readable,writable:s.writable}:null)}:null,
  fixtureProcess:{pid:fixture.pid,exitCode:fixture.exitCode,signalCode:fixture.signalCode},
 })+'\n');}
};
mark(phase);
const pulse=diagnostics?setInterval(()=>mark(phase),15000):null;pulse?.unref();
process.once('beforeExit',()=>{mark('node-before-exit');if(pulse)clearInterval(pulse);});
const check=(ok,label)=>{checks++;if(!ok){failures.push(label);console.error('✗ '+label);}};
const copy=[
 ['#kpr-card h2','Connecter une imprimante','Connect a printer','توصيل طابعة'],
 ['.kpr-bt h3','Imprimante Bluetooth','Bluetooth printer','طابعة Bluetooth'],
 ['#kpr-bt-status-t','Aucune imprimante connectée.','No printer connected.','لا توجد طابعة متصلة.'],
 ['#kpr-bt-connect','Rechercher une imprimante Bluetooth','Find a Bluetooth printer','البحث عن طابعة Bluetooth'],
 ['#kpr-bt-test','Imprimer un ticket test','Print a test receipt','طباعة إيصال تجريبي'],
 ['#kpr-kitchen h3','Tickets de production automatiques','Automatic production tickets','تذاكر الإنتاج التلقائية'],
 ['#kpr-kitchen p','Ce poste peut imprimer les commandes envoyées depuis la caisse, l’app employé et les autres terminaux. Activez cette option sur un seul ordinateur par établissement.','This station can print orders sent from the till, the employee app and other terminals. Enable this option on only one computer per venue.','يمكن لهذه المحطة طباعة الطلبات المرسلة من الصندوق وتطبيق الموظفين والأجهزة الأخرى. فعّل هذا الخيار على حاسوب واحد فقط لكل منشأة.'],
 ['.kpr-hub b','Faire de ce poste le hub d’impression','Use this station as the print hub','استخدام هذه المحطة كمركز للطباعة'],
 ['#kpr-hub-status','Les commandes de ce poste continuent à s’imprimer localement.','Orders from this station continue to print locally.','تستمر طباعة طلبات هذه المحطة محليًا.'],
 ['#kpr-profiles-list','Aucune imprimante additionnelle enregistrée. Ajoutez-en une pour router par poste.','No additional printer saved. Add one to route printing by station.','لا توجد طابعة إضافية محفوظة. أضف طابعة لتوجيه الطباعة حسب المحطة.'],
 ['#kpr-stations-box h3','Imprimantes par poste','Printers by station','الطابعات حسب المحطة'],
 ['#kpr-add-prof-btn','+ Nouvelle imprimante','+ New printer','+ طابعة جديدة'],
 ['#kpr-save-stations-btn','Enregistrer le routage par poste','Save station routing','حفظ توجيه الطباعة حسب المحطة'],
 ['#kpr-relay h3','Imprimer depuis un iPad ou une tablette · relais Kiwi','Print from an iPad or tablet · Kiwi relay','الطباعة من iPad أو جهاز لوحي · وسيط كيوي'],
 ['#kpr-relay-pair','Associer un pont','Pair a bridge','إقران جسر'],
 ['.kpr-st-top b','Caisse (comptoir)','Till (counter)','الصندوق (الكاونتر)'],
 ['.kpr-st-badge.receipt','Reçus clients','Customer receipts','إيصالات العملاء'],
 ['[data-station-id="caisse"] option[value=""]','· Imprimante par défaut (actuelle) ·','· Default printer (current) ·','· الطابعة الافتراضية (الحالية) ·'],
 ['.kpr-st-card:first-child .kpr-st-test','Ticket test','Test receipt','إيصال تجريبي'],
 ['#kpr-drawer-test','Tester le tiroir','Test the drawer','اختبار الدرج'],
 ['.kpr-st-badge.production','Production','Production','الإنتاج'],
 ['.kpr-st-card:nth-child(2) option[value=""]','· Même imprimante que la caisse ·','· Same printer as the till ·','· نفس طابعة الصندوق ·'],
 ['#kpr-relay-status-t','Cet appareil n’est pas reconnu comme la caisse d’un commerce · appairez-le d’abord.','This device is not recognised as a merchant’s till · pair it first.','لم يُتعرّف على هذا الجهاز كصندوق متجر · أقرنه أولًا.'],
 ['.kpr-adv summary','Option avancée · imprimante réseau globale (Wi-Fi / Ethernet)','Advanced option · shared network printer (Wi-Fi / Ethernet)','خيار متقدم · طابعة شبكة مشتركة (Wi-Fi / Ethernet)'],
];
try{
 const base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Retail fixture timeout')),15000);fixture.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);if(m){clearTimeout(timer);resolve(JSON.parse(m[1]).base);}});});
 mark('fixture-ready');
 browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
 mark('browser-ready');browser.once('disconnected',()=>mark('browser-disconnected'));browser.process()?.once('exit',()=>mark('browser-process-exited'));
 for(const [width,height,safeTop,safeBottom] of [[375,667,20,0],[402,874,62,34]])for(const [index,lang] of ['fr','en','ar'].entries())for(const theme of ['light','dark']){
  mark(`case-${width}-${lang}-${theme}`);
  const context=await browser.createBrowserContext(),page=await context.newPage();let writes=0;
  await page.setViewport({width,height,isMobile:true,hasTouch:true});
  await page.setRequestInterception(true);
  page.on('request',request=>{
   if(!['GET','HEAD'].includes(request.method())){writes++;return request.abort();}
   if(new URL(request.url()).pathname==='/api/print/bridges')return request.respond({status:401,contentType:'application/json',body:'{}'});
   if(/^https?:/.test(request.url()) && new URL(request.url()).origin!==base)return request.abort();
   return request.continue();
  });
  await page.goto(base+'/boutique.html',{waitUntil:'networkidle0'});
  await page.addStyleTag({path:path.join(root,'assets/pos-mobile.css')});
  await page.addStyleTag({path:path.join(root,'app/src/native-runtime.css')});
  await page.addScriptTag({path:path.join(root,'assets/pos-mobile.js')});
  await page.addScriptTag({path:path.join(root,'assets/printer-bridge.js')});
  await page.addScriptTag({path:path.join(root,'assets/lucide.min.js')});
  await page.evaluate((lang,theme,safeTop,safeBottom)=>{
   document.documentElement.classList.add('kiwi-native');document.documentElement.style.setProperty('--kiwi-host-safe-top',safeTop+'px');document.documentElement.style.setProperty('--kiwi-host-safe-bottom',safeBottom+'px');
   document.documentElement.setAttribute('data-caisse-theme',theme);window.KiwiCaisseLang.set(lang);
   // Render the real native print-hub branch; the stub cannot pair, print or save.
   window.KiwiKitchenPrint={isHub:()=>false,status:()=>({pending:0,hub:false,printerReady:false})};
  },lang,theme,safeTop,safeBottom);
  await page.click('.vx-burger');
  await page.waitForFunction(()=>!document.querySelector('.kiwi-dna-rail').getAnimations().some(a=>a.playState==='running'));
  await page.click('[data-action="printer-connect"]');
  await page.waitForSelector('#kpr-card',{visible:true});
  await page.waitForFunction(wanted=>document.querySelector('#kpr-card h2')?.textContent===wanted,{},copy[0][index+1]);
  await page.waitForFunction(()=>!document.querySelector('#kpr-relay-status-t')?.textContent.includes('Vérification'));
  for(const [selector,...words] of copy){const actual=(await page.$eval(selector,el=>el.textContent)).trim();check(actual===words[index],`${lang} ${theme}: ${selector} copy, got ${actual}`);}
  const bounds=await page.evaluate(()=>{
   const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   const card=document.querySelector('#kpr-card'),close=document.querySelector('#kpr-close'),head=document.querySelector('#kpr-card h2');
   const range=document.createRange();range.selectNodeContents(head);
   return {card:box(card),close:box(close),heading:box(range),glyph:!!close.querySelector('svg path'),scrollable:card.scrollHeight>card.clientHeight};
  });
  check(bounds.card.top>=safeTop+12 && bounds.card.bottom<=height-safeBottom-12,`${width} ${lang} ${theme}: card stays between native status and home indicator`);
  check(bounds.card.left>=20 && bounds.card.right<=width-20,`${width} ${lang} ${theme}: card fits horizontally`);
  check(bounds.close.width>=44 && bounds.close.height>=44 && bounds.glyph,`${width} ${lang} ${theme}: Material close has a 44-point target`);
  check(lang==='ar'?bounds.heading.left>=bounds.close.right:bounds.heading.right<=bounds.close.left,`${width} ${lang} ${theme}: close does not cover heading`);
  check(bounds.scrollable,`${width} ${lang} ${theme}: long printer settings remain scrollable`);
  check(writes===0,`${lang} ${theme}: opening settings does not write configuration or pair hardware`);
  await page.click('#kpr-close');await page.waitForSelector('#kpr-ov',{hidden:true});
  await context.close();
  mark(`case-complete-${width}-${lang}-${theme}`);
 }
 if(failures.length)throw new Error(`${failures.length}/${checks} printer-copy checks failed`);
 mark('assertions-complete');
}finally{
 try{
  mark('browser-close-start');
  if(browser){
   await browser.close();mark('browser-close-complete');
   // Chrome's crashpad descendant can inherit stderr after Chrome exits.
   // Release only this launch's streams, after the helper verifies its exit.
   const child=browser.process();releaseExitedBrowserStreams(child);
   assert.ok(child.stdio.every(stream=>!stream || stream.destroyed),'exited printer-test browser owns no open stdio');checks++;
   mark('browser-streams-released');
  }
 }finally{
  if(fixture.exitCode===null && fixture.signalCode===null){
   const exited=once(fixture,'exit');fixture.kill('SIGTERM');mark('fixture-stop-sent');await exited;
  }
  mark('fixture-exited');
 }
}
console.log(`caisse-printer-copy-browser-test: ${checks} checks passed (360 copy/layout/safety + owned browser lifecycle)`);
