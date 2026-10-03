#!/usr/bin/env node
// Real printer-panel copy opened from the boutique menu, never a print,
// hardware connection, pairing, routing save or production write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {releaseExitedBrowserStreams} from './browser-test-lifecycle.mjs';
import {paintedActionColours} from './painted-png.mjs';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);
const puppeteer=require(require.resolve('puppeteer-core',{paths:[path.join(root,'app'),root]}));
const executablePath=process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath,'Chromium required');
const fixture=spawn(process.execPath,[path.join(root,'tools/retail-ui-fixture.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
const failures=[];let browser,checks=0;
let selectedCases=0;
const shots=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-printer-colours-'));
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
const rgb=css=>{const p=css.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi).map(Number),s=css.startsWith('color(srgb')?255:1;return [...p.slice(0,3).map(c=>c*s),p[3]??1];};
const over=(a,b)=>a.slice(0,3).map((c,i)=>c*a[3]+b[i]*(1-a[3]));
const luminance=a=>{const f=a.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*f[0]+.7152*f[1]+.0722*f[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
// Only pointer/wheel interactions move the live panel. Geometry reads do not
// assign scrollTop, call scrollIntoView or dispatch synthetic DOM events.
async function reveal(page,selector){
 for(let i=0;i<30;i++){
  const box=await page.$eval(selector,el=>{const r=el.getBoundingClientRect(),p=document.querySelector('#kpr-card').getBoundingClientRect();return {top:r.top,bottom:r.bottom,x:p.left+p.width/2,y:p.top+p.height/2,lo:p.top+12,hi:p.bottom-12};});
  if(box.top>=box.lo && box.bottom<=box.hi)return;
  await page.mouse.move(box.x,box.y);await page.mouse.wheel({deltaY:Math.max(-400,Math.min(400,(box.top+box.bottom-box.lo-box.hi)/2))});
  await page.waitForFunction(()=>!document.querySelector('#kpr-card').getAnimations().some(a=>a.playState==='running'));
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw new Error('Could not reveal printer control using wheel: '+selector);
}
async function inspect(page,selector,label,dark,{primary=false,control=false,ancestorOpacity=false}={}){
 await reveal(page,selector);
 // Leave the target in its resting state: the wheel pointer can otherwise
 // hover a primary button, whose brightness filter changes its painted ink.
 const card=await page.$eval('#kpr-card',el=>{const r=el.getBoundingClientRect();return {x:r.left+5,y:r.top+5};});
 await page.mouse.move(card.x,card.y);
 await page.waitForFunction(selector=>!document.querySelector(selector).getAnimations().some(a=>a.playState==='running'),{},selector);
 const paint=await page.$eval(selector,el=>{
  const s=getComputedStyle(el),layers=[];let groupOpacity=1;for(let p=el;p;p=p.parentElement){const style=getComputedStyle(p);layers.push(style.backgroundColor);groupOpacity*=Number(style.opacity);}
  const placeholder=el.matches('input') && !el.value && el.placeholder?getComputedStyle(el,'::placeholder'):null;
  const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {foreground:placeholder?placeholder.color:s.color,inkOpacity:placeholder?Number(placeholder.opacity):1,layers,border:s.borderTopColor,width:parseFloat(s.borderTopWidth),disabled:el.matches(':disabled'),groupOpacity,opacity:Number(s.opacity),link:el.matches('a[href]') && s.textDecorationLine.includes('underline'),hit:hit===el || el.contains(hit),bounds:{x:r.left,y:r.top,width:r.width,height:r.height}};
 });
 check(!paint.disabled,label+': regression target is genuinely enabled');
 let bg=[247,245,240];for(const layer of [...paint.layers].reverse())bg=over(rgb(layer),bg);
 const fg=rgb(paint.foreground);fg[3]*=paint.inkOpacity;
 // This opt-in target is a transparent inline link in a transparent note.
 // Its ancestor opacity attenuates the ink against the opaque card ground.
 // Do not infer opaque-group blending for unrelated controls.
 if(ancestorOpacity)fg[3]*=paint.groupOpacity;
 if(ancestorOpacity)check(paint.link && paint.hit,label+': underlined real link is readable and hit-testable (no download opened)');
 const ink=over(fg,bg),ratio=contrast(ink,bg);
 check(ratio>=4.5,label+': text contrast '+ratio.toFixed(2)+':1');
 if(!primary)check(dark?luminance(bg)<.12:luminance(bg)>.7,label+': '+(dark?'dark':'light')+' semantic surface');
 if(control)check(paint.width>0 && contrast(over(rgb(paint.border),bg),bg)>=3,label+': outlined control boundary >=3:1');
 const bytes=await page.screenshot({type:'png',path:path.join(shots,label.replace(/[^a-z0-9-]+/gi,'-')+'.png'),captureBeyondViewport:false});
 const colours=paintedActionColours(bytes,ink,paint.bounds),paintedRatio=contrast(colours.foreground,colours.background);
 check(paintedRatio>=4.5,label+': painted text contrast '+paintedRatio.toFixed(2)+':1');
 if(primary){let parent=[247,245,240];for(const layer of [...paint.layers].reverse().slice(0,-1))parent=over(rgb(layer),parent);check(contrast(colours.background,parent)>=3,label+': primary control boundary >=3:1');}
}
async function inspectPrinterPicker(page,id,label,index,{width,height,safeTop,safeBottom}){
 const trigger='#'+id+'+.kiwi-select .kiwi-select-trigger';
 await reveal(page,trigger);
 const before=await page.$eval(trigger,(el,id)=>{
  const value=el.querySelector('.kiwi-select-value-label'),select=document.getElementById(id),r=el.getBoundingClientRect();
  return {text:value.textContent,textWidth:value.scrollWidth,available:value.clientWidth,aria:el.getAttribute('aria-label'),value:select.value,selected:select.selectedOptions[0].textContent.trim(),width:r.width,height:r.height};
 },id);
 const prefix=(id==='kpr-paper'?['Largeur papier','Paper width','عرض الورق']:["Format d'étiquette",'Label format','تنسيق الملصق'])[index];
 check(before.textWidth<=before.available,label+': complete selected value has no ellipsis ('+before.textWidth+'/'+before.available+')');
 check(before.width>=44 && before.height>=44,label+': closed picker has 44-point target');
 check(before.aria===prefix+': '+before.selected,label+': accessible interface prefix localized, entire selected value preserved; got '+before.aria);
 await page.click(trigger);
 await page.waitForSelector('.kiwi-select-popover',{visible:true});
 await page.waitForFunction(()=>!document.querySelector('.kiwi-select-popover').getAnimations().some(a=>a.playState==='running'));
 const chooser=await page.$eval('.kiwi-select-popover',el=>{
  const r=el.getBoundingClientRect(),close=el.querySelector('.kiwi-select-close').getBoundingClientRect(),row=el.querySelector('.kiwi-select-option[aria-selected="true"]'),value=row.querySelector('.kiwi-select-option-label'),b=row.getBoundingClientRect(),list=el.querySelector('.kiwi-select-options').getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,closeWidth:close.width,closeHeight:close.height,title:el.querySelector('.kiwi-select-popover-title').textContent,text:value.textContent,textWidth:value.scrollWidth,available:value.clientWidth,visible:b.top>=list.top && b.bottom<=list.bottom && b.bottom<=innerHeight,hit:hit===row || row.contains(hit)};
 });
 check(chooser.left>=8 && chooser.right<=width-8 && chooser.top>=safeTop+8 && chooser.bottom<=height-safeBottom-8,label+': chooser stays inside native safe insets '+JSON.stringify(chooser));
 check(chooser.closeWidth>=44 && chooser.closeHeight>=44,label+': chooser close has 44-point target');
 check(chooser.title===prefix,label+': chooser title localized');
 check(chooser.text===before.text && chooser.textWidth<=chooser.available && chooser.visible && chooser.hit,label+': selected option readable and hit-testable');
 await page.screenshot({type:'png',path:path.join(shots,label+'-chooser.png'),captureBeyondViewport:false});
 await page.keyboard.press('Escape');
 await page.waitForSelector('.kiwi-select-popover',{hidden:true});
 const after=await page.$eval(trigger,(el,id)=>({text:el.querySelector('.kiwi-select-value-label').textContent,value:document.getElementById(id).value,expanded:el.getAttribute('aria-expanded')}),id);
 check(after.text===before.text && after.value===before.value && after.expanded==='false',label+': real Escape closes without changing selected data');
}
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
const nativeCopy=[
 ['#kpr-status-t','Connexion directe à l’imprimante depuis l’app Kiwi.','Direct connection to the printer from the Kiwi app.','اتصال مباشر بالطابعة من تطبيق كيوي.'],
 ['#kpr-target','Aucune cible réseau enregistrée.','No network target saved.','لا توجد وجهة شبكة محفوظة.'],
 ['label[for="kpr-ip"]','Adresse IP de l’imprimante','Printer IP address','عنوان IP للطابعة'],
 ['#kpr-scan','Rechercher sur le réseau','Search the network','البحث في الشبكة'],
 ['#kpr-diagnostics','Exporter le diagnostic d’impression','Export printing diagnostics','تصدير تشخيص الطباعة'],
 ['label[for="kpr-port"]','Port','Network port','منفذ الشبكة'],
 ['label[for="kpr-paper"]','Largeur papier','Paper width','عرض الورق'],
 ['label[for="kpr-label"]',"Format d'étiquette",'Label format','تنسيق الملصق'],
 ['label[for="kpr-model"]','Modèle','Model','الطراز'],
 ['#kpr-test','Tester','Test','اختبار'],
 ['#kpr-save','Enregistrer','Save','حفظ'],
 // The rendered Arabic number keeps the real translator's LTR isolation.
 ['#kpr-paper option:checked','80 mm (standard)','80 mm (standard)','\u206680\u2069 مم (قياسي)'],
 ['.kpr-adv>.kpr-note:last-child','Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale. Télécharger le pont','The bridge runs on the till computer and communicates only with your local printer. Download the bridge','يعمل الجسر على حاسوب الصندوق ولا يتواصل إلا مع طابعتك المحلية. تنزيل الجسر'],
];
try{
 const base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Retail fixture timeout')),15000);fixture.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);if(m){clearTimeout(timer);resolve(JSON.parse(m[1]).base);}});});
 mark('fixture-ready');
 browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
 mark('browser-ready');browser.once('disconnected',()=>mark('browser-disconnected'));browser.process()?.once('exit',()=>mark('browser-process-exited'));
 for(const [width,height,safeTop,safeBottom] of [[375,667,20,0],[402,874,62,34]])for(const [index,lang] of ['fr','en','ar'].entries())for(const [theme,attrs] of [
  ['light',{'data-caisse-theme':'light'}],['dark',{'data-caisse-theme':'dark'}],
  ['mixed-dark',{'data-theme':'dark','data-caisse-theme':'light','data-vexel-mode':'light'}],
 ]){
  selectedCases++;
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
  await page.evaluate((lang,attrs,safeTop,safeBottom)=>{
   document.documentElement.classList.add('kiwi-native');document.documentElement.style.setProperty('--kiwi-host-safe-top',safeTop+'px');document.documentElement.style.setProperty('--kiwi-host-safe-bottom',safeBottom+'px');
   for(const [key,value] of Object.entries(attrs))document.documentElement.setAttribute(key,value);window.KiwiCaisseLang.set(lang);
   // Render the real native print-hub branch; the stub cannot pair, print or save.
   window.KiwiKitchenPrint={isHub:()=>false,status:()=>({pending:0,hub:false,printerReady:false})};
   // The actual native-socket status branch becomes .on without connecting.
   // Any accidental hardware operation is counted and rejected, never sent.
   window.__printerHardwareCalls=0;window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:name=>name==='KiwiPrinterSocket',Plugins:{KiwiPrinterSocket:{send:()=>{window.__printerHardwareCalls++;return Promise.reject(new Error('fixture forbids printing'));}}}};
  },lang,attrs,safeTop,safeBottom);
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
  const label=`${width}-${lang}-${theme}`,dark=theme!=='light';
  // The disconnected Bluetooth test is disabled, not an enabled-contrast
  // target. Station Test receipt and drawer buttons really are enabled.
  check(await page.$eval('#kpr-bt-test',el=>el.disabled),label+': disconnected Bluetooth test remains disabled');
  check(await page.$eval('#kpr-bt-status',el=>el.classList.contains('off')),label+': real disconnected status branch');
  await inspect(page,'#kpr-bt-status',label+'-no-printer',dark);
  await inspect(page,'#kpr-bt-connect',label+'-find-bluetooth',dark,{primary:true});
  await inspect(page,'.kpr-st-badge.receipt',label+'-receipt-badge',dark);
  await inspect(page,'.kpr-st-card:first-child .kiwi-select-trigger',label+'-station-select',dark,{control:true});
  await inspect(page,'.kpr-st-card:first-child .kpr-st-test',label+'-station-test',dark,{control:true});
  await inspect(page,'.kpr-st-badge.production',label+'-production-badge',dark);
  await inspect(page,'#kpr-add-prof-btn',label+'-new-printer',dark,{primary:true});
  await inspect(page,'#kpr-drawer-test',label+'-drawer-test',dark,{control:true});
  await inspect(page,'#kpr-relay-status',label+'-relay-error',dark);
  await inspect(page,'.kpr-adv summary',label+'-advanced-summary',dark);
  await page.click('.kpr-adv summary');
  await page.waitForSelector('.kpr-adv[open] #kpr-status',{visible:true});
  for(const [selector,...words] of nativeCopy){const actual=(await page.$eval(selector,el=>el.textContent)).trim();check(actual===words[index],`${lang} ${theme}: native ${selector} copy, got ${actual}`);}
  check(await page.$eval('#kpr-status',el=>el.classList.contains('on')),label+': actual native-socket available status branch');
  await inspect(page,'#kpr-status',label+'-native-status-on',dark);
  await inspect(page,'.kpr-field label[for="kpr-ip"]',label+'-ip-label',dark);
  await inspect(page,'#kpr-ip',label+'-ip-placeholder',dark,{control:true});
  await inspect(page,'#kpr-port',label+'-port',dark,{control:true});
  await inspect(page,'#kpr-test',label+'-native-enabled-test',dark,{control:true});
  await inspect(page,'#kpr-save',label+'-save',dark,{primary:true});
  await inspect(page,'.kpr-adv>.kpr-note:last-child a',label+'-bridge-footer-link',dark,{ancestorOpacity:true});
  for(const id of ['kpr-paper','kpr-label'])await inspectPrinterPicker(page,id,label+'-'+id,index,{width,height,safeTop,safeBottom});
  check(await page.evaluate(()=>window.__printerHardwareCalls===0),label+': no native printing calls');
  check(writes===0,`${lang} ${theme}: opening settings does not write configuration or pair hardware`);
  await reveal(page,'#kpr-close');
  await page.click('#kpr-close');await page.waitForSelector('#kpr-ov',{hidden:true});
  await context.close();
  mark(`case-complete-${width}-${lang}-${theme}`);
 }
 check(selectedCases===18,'all 18 printer cases ran');
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
console.log(`caisse-printer-copy-browser-test: ${checks} checks passed (FR/EN/AR copy, native light/dark/mixed painted printer states, real wheel, no hardware/writes + owned browser lifecycle); screenshots ${shots}`);
