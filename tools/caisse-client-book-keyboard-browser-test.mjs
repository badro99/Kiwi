#!/usr/bin/env node
// Native client-book regressions: explicit Search keyboard and clipped safe area.
// These Chromium checks are not the separately captured iOS typing proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { decodeScreenshot } from './painted-png.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(root, 'app'), root] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(root, 'tools/retail-ui-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const failures = [];
let browser, checks = 0, originalChecks = 0, readabilityChecks = 0;
const stamp = Date.UTC(2026, 9, 2, 15, 44);
const dataName = 'Carte · mai <merchant> $& {n}';
const dataRef = 'AV-2032 · avoir <ref> $& {n}';
const dataActor = 'Caisse · Annulé <actor> $& {n}';
const unknownMethod = 'Carte custom · cash $& {n}';
const credits = [
  { code:dataRef, status:'active', amountCents:9000, balanceCents:5000, createdAt:stamp, expiresAt:stamp+86400000,
    originalRef:'sale · Ticket <ref> $&', events:[{action:'issue',actor:dataActor,lines:[{qty:1,name:dataName},{qty:1}]},{action:'redeem',amountCents:4000,balanceAfterCents:5000,actor:dataActor}] },
  { code:'cancelled-credit', status:'cancelled', amountCents:2000, balanceCents:0, createdAt:stamp, reason:dataName,
    events:[{action:'cancel',amountCents:2000,balanceAfterCents:0,actor:dataActor},{action:'custom · Utilisé <event> $&',amountCents:0,balanceAfterCents:0,actor:dataActor}] }
];
const check = (value, label) => { checks++; if (!value) { failures.push(label); console.error('✗ ' + label); } };
const checkReadability=(value,label)=>{readabilityChecks++;check(value,label);};
const paintReadings=[];
const canonicalCredit={code:'AV-2032',status:'active',amountCents:9000,balanceCents:5000,createdAt:stamp,originalRef:'13002',events:[{action:'issue',actor:'Fixture cashier',lines:[{qty:1,name:'Normal Shirt'}]}]};
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const pixelContrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function paintedText(bytes,bounds){
  const {width,height,channels,pixels}=decodeScreenshot(bytes);
  const x=Math.floor(bounds.x),y=Math.floor(bounds.y),right=Math.ceil(bounds.x+bounds.width),bottom=Math.ceil(bounds.y+bounds.height);
  if(x<0||y<0||right>width||bottom>height)return{error:'Text bounds leave original screenshot',bounds,width,height};
  const counts=new Map(),glyphCounts=new Map();
  for(let py=y;py<bottom;py++)for(let px=x;px<right;px++){
    const i=(py*width+px)*channels;if(channels===4&&pixels[i+3]!==255)continue;
    const key=[...pixels.subarray(i,i+3)].join(',');counts.set(key,(counts.get(key)||0)+1);
    // Strike decoration crosses the central band of each actual text line.
    // Exclude that band from ink selection; retain the whole isolated label for background selection.
    const decoration=bounds.struck&&bounds.lines.some(line=>py+.5>=line.top+(line.bottom-line.top)/3&&py+.5<=line.bottom-(line.bottom-line.top)/3);
    if(!decoration)glyphCounts.set(key,(glyphCounts.get(key)||0)+1);
  }
  const sorted=[...counts].sort((a,b)=>b[1]-a[1]);
  if(sorted.length<2)return{error:'No actual glyph paint',bounds};
  const background=sorted[0][0].split(',').map(Number);
  // Computed color is only a selector for full-coverage pixels, never contrast evidence.
  // The actual decoded PNG supplies foreground/background RGB and the measured ratio.
  const declared=bounds.color.match(/[\d.]+/g)?.map(Number);
  if(!/^rgba?\(/.test(bounds.color)||!declared||declared.length<3||bounds.opacity!==1)return{error:'Unsupported or translucent parent text paint',bounds};
  const alpha=declared[3]??1,expected=declared.slice(0,3).map((v,i)=>Math.round(v*alpha+background[i]*(1-alpha)));
  const ink=[...glyphCounts].sort((a,b)=>b[1]-a[1]).find(([key])=>{
    const rgb=key.split(',').map(Number);
    return rgb.some((v,i)=>Math.abs(v-background[i])>3)&&rgb.every((v,i)=>Math.abs(v-expected[i])<=1);
  });
  if(!ink)return{error:'No distinct opaque glyph paint',bounds};
  const foreground=ink[0].split(',').map(Number);
  return{foreground,background,expected,foregroundPixels:ink[1],backgroundPixels:sorted[0][1],contrast:pixelContrast(foreground,background),frame:{width,height},bounds};
}
function referenceGeometry(el){
  const range=document.createRange();range.selectNodeContents(el);
  const rects=[...range.getClientRects()].filter(b=>b.width>0&&b.height>0).map(b=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom}));
  const row=el.closest('.kcb-inforow').getBoundingClientRect();
  const lines=[...new Set(rects.map(b=>Math.round(b.top)))];
  return{text:el.textContent,protected:el.hasAttribute('data-nolang'),lines:lines.length,rects,fit:rects.length>0&&rects.every(b=>b.left>=row.left-.5&&b.right<=row.right+.5&&b.left>=-.5&&b.right<=innerWidth+.5)};
}
try {
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Retail fixture did not start')), 15000);
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error('Retail fixture exited: ' + code)); });
    fixture.stdout.on('data', chunk => {
      output += chunk;
      const ready = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (ready) { clearTimeout(timer); resolve(JSON.parse(ready[1]).base); }
    });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  for (const [device, width, height, safe] of [['se',375,667,20], ['pro',402,874,62]]) {
    for (const lang of ['fr','en','ar']) for (const theme of ['light','dark']) {
      const originalStart = checks;
      const context = await browser.createBrowserContext();
      try {
      const page = await context.newPage();
      await page.setViewport({ width, height, isMobile:true, hasTouch:true });
      await page.evaluateOnNewDocument((stamp,dataName,dataRef,unknownMethod) => {
        const book='synthetic-retail-acompte';
        localStorage.setItem('kiwi:clients:v1:'+book,JSON.stringify({seq:4,list:[
          {id:'points-98',name:'Safouane pts',phone:'+212698765432',points:98,stamps:0,visits:1,spend:98,lastSeen:1},
          {id:'literal-unit',name:'pts',phone:'+212611111111',points:98,stamps:0,visits:1,spend:98,lastSeen:0},
          {id:'history-proof',name:'History '+dataName,phone:'+212622222222',points:200,stamps:0,visits:1,spend:900,lastSeen:stamp,
            history:['cash','espèces','card','carte','credit','avoir','transfer','virement','cheque','chèque','wallet','delivery','livraison','espèces + carte',unknownMethod,''].map((method,index)=>({
              ref:index===0?'return-sale':'receipt-'+index,ts:index===15?0:stamp,amount:90,method,items:index===0?[{qty:1,name:dataName},{qty:1}]:[{qty:1,name:dataName}] }))},
          {id:'literal-key',name:'Utilisé',phone:'+212633333333',points:98,stamps:0,visits:1,spend:98,lastSeen:0,gender:'Homme',consent:true,consentEmail:true,
            history:[{ref:'13002',ts:stamp,amount:90,method:'cash',items:[{qty:1,name:'Normal Shirt'}]}]}
        ]}));
        localStorage.setItem('kiwi:bqReturns',JSON.stringify({m:book,list:[{saleRef:'return-sale',kind:'avoir',reference:dataRef,amount:90,items:[{qty:1,name:dataName},{qty:1}]},{saleRef:'13002',kind:'avoir',reference:'AV-2032',amount:90,items:[{qty:1,name:'Normal Shirt'}]}]}));
        localStorage.setItem('kiwi:fidelity:v1:'+book,JSON.stringify({model:'amount',amount:{perMad:1,threshold:100.5,reward:'Récompense <merchant>'},visit:{target:10},product:{target:10}}));
      },stamp,dataName,dataRef,unknownMethod);
      const writes=[];
      await page.setRequestInterception(true);
      page.on('request',request => {
        const url=new URL(request.url());
        if(!['http:','https:'].includes(url.protocol))return request.continue();
        if(['127.0.0.1','localhost'].includes(url.hostname) && request.method()==='GET' && url.pathname==='/api/store-credits' && url.searchParams.get('customerId')==='history-proof') {
          return request.respond({status:200,contentType:'application/json',body:JSON.stringify({credits})});
        }
        if(['127.0.0.1','localhost'].includes(url.hostname) && request.method()==='GET' && url.pathname==='/api/store-credits' && url.searchParams.get('customerId')==='literal-key') {
          return request.respond({status:200,contentType:'application/json',body:JSON.stringify({credits:[canonicalCredit]})});
        }
        if(!['127.0.0.1','localhost'].includes(url.hostname)||!['GET','HEAD'].includes(request.method())) {
          writes.push(request.method()+' '+url.pathname);return request.abort();
        }
        return request.continue();
      });
      await page.goto(base + '/boutique.html', { waitUntil:'networkidle0' });
      await page.addStyleTag({ path:path.join(root,'app/src/native-runtime.css') });
      await page.evaluate((lang,theme,safe) => {
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme',theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top',safe+'px');
        window.KiwiCaisseLang.set(lang);
      },lang,theme,safe);
      await page.click('button[data-bq-view="clientes"]');
      await page.waitForSelector('#kcb-q',{visible:true});
      const label = `${device} ${lang} ${theme}`;
      const navLabel=await page.$eval('button[data-bq-view="clientes"] > span',el=>el.textContent);
      check(navLabel===({fr:'Clients',en:'Customers',ar:'الزبناء'})[lang],label+': actual client navigation label '+JSON.stringify(navLabel));
      const input = await page.$eval('#kcb-q',el => ({type:el.type,mode:el.inputMode,hint:el.enterKeyHint,correct:el.getAttribute('autocorrect'),complete:el.autocomplete}));
      check(input.type==='text' && input.mode==='text' && input.hint==='search',label+': full text keyboard with explicit Search, got '+JSON.stringify(input));
      check(input.correct==='off' && input.complete==='off',label+': name/phone queries cannot be autocorrected');
      const initialBook=await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'));
      check(await page.$eval('[data-id="literal-unit"] .kcb-nm',el=>el.textContent)==='pts',label+': literal customer name pts remains data');
      await page.type('#kcb-q','Safouane');
      await page.waitForFunction(()=>document.querySelectorAll('#kcb-list .kcb-row').length===1);
      const row=await page.$('[data-id="points-98"]');
      for(const next of [lang,...['fr','en','ar'].filter(value=>value!==lang)]) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const units=await page.$eval('[data-id="points-98"]',el=>({unit:el.querySelector('[data-kcb-point-unit]')?.textContent,number:el.querySelector('.kcb-num bdi[data-nolang]')?.textContent,name:el.querySelector('.kcb-nm').textContent,phone:el.querySelector('.kcb-ph').textContent,ready:!!el.querySelector('.kcb-ready')}));
        check(units.unit===(next==='ar'?'نقطة':'pts') && units.number==='98' && !units.ready,label+' → '+next+': exact localized list points below reward '+JSON.stringify(units));
        const renderedPhone=await page.evaluate(()=>window.KiwiCaisseLang.bidi('+212698765432'));
        check(units.name==='Safouane pts' && units.phone===renderedPhone && await page.$eval('#kcb-q',el=>el.value)==='Safouane',label+' → '+next+': search/name bytes unchanged, phone preserves exact public bidi formatting');
        check(await row.evaluate(el=>el.isConnected),label+' → '+next+': language change does not rerender customer row');
      }
      await page.click('[data-id="points-98"]');
      await page.waitForSelector('#kcb-sheet',{visible:true});
      const amount=await page.$('#kcb-amt');
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const copy=await page.$eval('#kcb-sheet .kcb-card',el=>({
          historyHeading:el.querySelector(':scope > .kcb-section')?.textContent,
          historyEmpty:el.querySelector(':scope > .kcb-empty > b')?.textContent,
          historyHint:el.querySelector(':scope > .kcb-empty > div')?.textContent,
          creditHeading:el.querySelector('#kcb-credit-history .kcb-section > span')?.textContent,
          creditEmpty:el.querySelector('#kcb-credit-history .kcb-empty > b')?.textContent,
          creditHint:el.querySelector('#kcb-credit-history .kcb-empty > div')?.textContent,
          rewardLabel:el.querySelector('[data-kcb-reward-label]')?.textContent,
          rewardData:el.querySelector('[data-kcb-reward-value][data-nolang]')?.textContent,
          creditBalance:el.querySelector('#kcb-credit-history .kcb-section > bdi[data-nolang]')?.textContent
        }));
        const expected={
          fr:['Historique des achats','Aucun détail d’achat enregistré','Les prochains tickets attachés à ce client apparaîtront ici.','Avoirs · solde','Aucun avoir','Les crédits boutique émis à ce client apparaîtront ici.','récompense'],
          en:['Purchase history','No purchase details recorded','Future receipts linked to this customer will appear here.','Store credit · balance','No store credit','Store credits issued to this customer will appear here.','reward'],
          ar:['سجل المشتريات','لا توجد تفاصيل شراء مسجّلة','ستظهر هنا التذاكر المقبلة المرتبطة بهذا الزبون.','أرصدة المتجر · الرصيد','لا يوجد رصيد متجر','ستظهر هنا أرصدة المتجر الصادرة لهذا الزبون.','مكافأة']
        }[next];
        ['historyHeading','historyEmpty','historyHint','creditHeading','creditEmpty','creditHint','rewardLabel'].forEach((key,index)=>check(copy[key]===expected[index],label+' detail → '+next+': exact '+key+' '+JSON.stringify(copy[key])));
        check(copy.rewardData==='Récompense <merchant>' && copy.creditBalance==='0 MAD',label+' detail → '+next+': literal merchant reward and credit balance preserved '+JSON.stringify({rewardData:copy.rewardData,creditBalance:copy.creditBalance}));
        const detail=await page.$eval('.kcb-progtxt',el=>({unit:el.querySelector('[data-kcb-point-unit]')?.textContent,numbers:[...el.querySelectorAll('bdi[data-nolang]')].map(node=>node.textContent)}));
        check(detail.unit===(next==='ar'?'نقطة':'pts') && detail.numbers.join('/')==='98/100.5',label+' detail → '+next+': isolated balance/exact fractional threshold and localized unit '+JSON.stringify(detail));
        check(await amount.evaluate(el=>el.isConnected && el.value===''),label+' detail → '+next+': untouched purchase draft remains same node');
      }
      await page.click('#kcb-d-close');
      await page.evaluate(lang=>window.KiwiCaisseLang.set(lang),lang);
      check(await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'))===initialBook && writes.length===0,label+': no customer/loyalty persistence mutation or network writes '+JSON.stringify(writes));
      for (const h of [height,device==='se'?407:520]) {
        await page.setViewport({width,height:h,isMobile:true,hasTouch:true});
        const layout=await page.$eval('#kcb-root',el=>({rootTop:el.getBoundingClientRect().top,scrollTop:el.querySelector('.kcb-scroll').getBoundingClientRect().top,clip:getComputedStyle(el).overflow,heading:el.querySelector('h2').getBoundingClientRect().top}));
        check(layout.rootTop>=safe && layout.scrollTop>=safe && layout.clip==='hidden',label+' height='+h+': scrolling clips below the real safe area '+JSON.stringify(layout));
      }
      originalChecks += checks - originalStart;
      // Additional populated history/credits; the 46 original checks above stay intact.
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      await page.click('#kcb-q',{clickCount:3});
      await page.keyboard.press('Backspace');
      await page.type('#kcb-q','History');
      await page.waitForSelector('[data-id="history-proof"]',{visible:true});
      const historyQuery=await page.$('#kcb-q');
      await page.click('[data-id="history-proof"]');
      await page.waitForSelector('#kcb-credit-history .kcb-inforow',{visible:true});
      const historyAmount=await page.$('#kcb-amt');
      await page.type('#kcb-amt','12');
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const rendered=await page.$eval('#kcb-sheet .kcb-card',(el,stamp,next)=>{
          const clean=value=>value.replace(/[\u2066-\u2069]/g,'');
          const rows=[...el.querySelectorAll(':scope > .kcb-section + .kcb-info .kcb-inforow')];
          const locale={fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[next];
          return {
            methods:rows.map(row=>clean(row.querySelector('.k > small').textContent)),
            date:rows[0].querySelector('[data-kcb-date]')?.textContent||'',
            expectedDate:new Date(stamp).toLocaleString(locale,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
            unknownDate:clean(rows[15].querySelector('.k').firstChild.textContent),
            ret:clean(rows[0].querySelector('.kcb-ret')?.textContent||''),
            items:clean(rows[0].querySelector('.v > b').textContent),
            credit:clean(el.querySelector('#kcb-credit-history').textContent),
            data:[...el.querySelectorAll('bdi[data-nolang]')].map(node=>node.textContent),
            injected:!!el.querySelector('merchant,ref,actor,event'),
            historyRows:rows.length, creditRows:el.querySelectorAll('#kcb-credit-history .kcb-inforow').length,
            rewardData:el.querySelector('[data-kcb-reward-value]')?.textContent
          };
        },stamp,next);
        const labels={
          fr:{cash:'Espèces',card:'Carte',credit:'Avoir',transfer:'Virement / Versement',cheque:'Chèque',wallet:'Portefeuille',delivery:'Livraison',unknown:'Mode non renseigné',date:'Date inconnue',returned:'Retourné',note:'avoir',expires:'expire',remaining:'reste',balance:'solde',used:'Utilisé',cancelled:'Annulé',noExpiry:'sans échéance',till:'Caisse du magasin',item:'Article acheté'},
          en:{cash:'Cash',card:'Card',credit:'Credit note',transfer:'Bank transfer / Deposit',cheque:'Cheque',wallet:'Wallet',delivery:'Delivery',unknown:'Payment method not recorded',date:'Unknown date',returned:'Returned',note:'credit',expires:'expires',remaining:'remaining',balance:'balance',used:'Used',cancelled:'Cancelled',noExpiry:'no expiry date',till:'Store till',item:'Purchased item'},
          ar:{cash:'نقداً',card:'بطاقة',credit:'رصيد',transfer:'تحويل / إيداع بنكي',cheque:'شيك',wallet:'محفظة',delivery:'توصيل',unknown:'طريقة الدفع غير مسجّلة',date:'تاريخ غير معروف',returned:'مُرجع',note:'قسيمة',expires:'ينتهي في',remaining:'المتبقي',balance:'الرصيد',used:'مستعمل',cancelled:'ملغى',noExpiry:'بدون تاريخ انتهاء',till:'صندوق المتجر',item:'المنتج المشترى'}
        }[next];
        const methods=['cash','cash','card','card','credit','credit','transfer','transfer','cheque','cheque','wallet','delivery','delivery'].map(key=>labels[key]);
        methods.push(labels.cash+' + '+labels.card,unknownMethod,labels.unknown);
        check(JSON.stringify(rendered.methods)===JSON.stringify(methods),label+' populated → '+next+': exact persisted payment labels '+JSON.stringify(rendered.methods));
        check(rendered.date===rendered.expectedDate && rendered.unknownDate===labels.date,label+' populated → '+next+': timestamp dates use current public locale '+JSON.stringify({date:rendered.date,expected:rendered.expectedDate,unknown:rendered.unknownDate}));
        check(rendered.ret.includes(labels.returned) && rendered.ret.includes(labels.note+' '+dataRef) && rendered.ret.includes(dataName),label+' populated → '+next+': return interface localized, item/reference opaque '+JSON.stringify(rendered.ret));
        check(['expires','remaining','balance','used','cancelled','noExpiry','till'].every(key=>rendered.credit.includes(labels[key])),label+' populated → '+next+': populated credit interface localized '+JSON.stringify(rendered.credit));
        check([rendered.items,rendered.ret,rendered.credit].every(text=>text.includes(labels.item)),label+' populated → '+next+': precise missing-item UI fallback localized without changing real item names');
        check([dataName,dataRef,dataActor,unknownMethod,'custom · Utilisé <event> $&','90 MAD','50 MAD'].every(value=>rendered.data.includes(value)) && rendered.rewardData==='Récompense <merchant>' && !rendered.injected,label+' populated → '+next+': merchant/data markers are unchanged safe text');
        check(rendered.historyRows===16 && rendered.creditRows===2,label+' populated → '+next+': complete history and fetched credit records');
        check(await historyQuery.evaluate(el=>el.isConnected && el.value==='History') && await historyAmount.evaluate(el=>el.isConnected && el.value==='12'),label+' populated → '+next+': public locale subscription preserves query/draft nodes');
        const longData=await page.$eval('#kcb-sheet .kcb-card',(el,dataRef,dataName)=>{
          const nodes=[...el.querySelectorAll('bdi[data-nolang]')];
          const references=nodes.filter(node=>node.textContent===dataRef).map(node=>{
            const range=document.createRange();range.selectNodeContents(node);
            const row=node.closest('.kcb-inforow').getBoundingClientRect();
            const rects=[...range.getClientRects()].filter(b=>b.width>0);
            return{text:node.textContent,fit:rects.length>0&&rects.every(b=>b.left>=row.left-.5&&b.right<=row.right+.5&&b.left>=-.5&&b.right<=innerWidth+.5)};
          });
          const names=nodes.filter(node=>node.textContent===dataName);
          return{references,merchantWrap:names.length>0&&names.every(node=>getComputedStyle(node).whiteSpace!=='nowrap')};
        },dataRef,dataName);
        checkReadability(longData.references.length===2&&longData.references.every(value=>value.text===dataRef&&value.fit)&&longData.merchantWrap,label+' populated → '+next+': long opaque references fit; merchant names remain wrap-capable '+JSON.stringify(longData));
      }
      const cardBounds=await page.$eval('#kcb-sheet .kcb-card',el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};});
      await page.mouse.move(cardBounds.x+cardBounds.width/2,cardBounds.y+Math.min(cardBounds.height-40,200));
      await page.mouse.wheel({deltaY:-10000});
      await page.waitForFunction(()=>document.querySelector('#kcb-sheet .kcb-card').scrollTop===0);
      const scrollBefore=await page.$eval('#kcb-sheet .kcb-card',el=>el.scrollTop);
      await page.mouse.wheel({deltaY:800});
      await page.waitForFunction(before=>document.querySelector('#kcb-sheet .kcb-card').scrollTop>before,{},scrollBefore);
      check(true,label+': real wheel reveals populated history lower content');
      await page.click('#kcb-d-close');
      check(await page.$eval('#kcb-q',el=>el.value)==='History' && await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'))===initialBook && writes.length===0,label+': populated read-only navigation preserves query/book and sends no writes');
      // A merchant name equal to an exact new UI key must remain literal everywhere.
      await page.click('#kcb-q',{clickCount:3});
      await page.keyboard.press('Backspace');
      await page.type('#kcb-q','Utilisé');
      await page.waitForSelector('[data-id="literal-key"]',{visible:true});
      const literalQuery=await page.$('#kcb-q');
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const name=await page.$eval('[data-id="literal-key"] .kcb-nm',el=>({text:el.textContent,data:el.querySelector('bdi[data-nolang]')?.textContent}));
        check(name.text==='Utilisé' && name.data==='Utilisé',label+' literal key → '+next+': exact customer list name remains data '+JSON.stringify(name));
      }
      await page.click('[data-id="literal-key"]');
      await page.waitForSelector('#kcb-edit',{visible:true});
      await page.waitForSelector('#kcb-credit-history .kcb-inforow',{visible:true});
      await page.waitForFunction(()=>['#kcb-sheet','#kcb-sheet .kcb-card'].every(selector=>!document.querySelector(selector).getAnimations().some(animation=>animation.playState==='running')));
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const name=await page.$eval('#kcb-sheet .kcb-dhead h3',el=>({text:el.textContent,data:el.querySelector('bdi[data-nolang]')?.textContent}));
        check(name.text==='Utilisé' && name.data==='Utilisé',label+' literal key detail → '+next+': exact customer heading remains data '+JSON.stringify(name));
        // Only the added paint segment uses native-style physical sampling density.
        // CSS dimensions/cases stay original; restore 1× before every prior assertion.
        await page.setViewport({width,height,isMobile:true,hasTouch:true,deviceScaleFactor:3});
        await page.waitForFunction(()=>devicePixelRatio===3);
        const probes=[
          ['visits label','#kcb-sheet .kcb-kpis .kcb-kpi:nth-child(1) .l'],
          ['spent label','#kcb-sheet .kcb-kpis .kcb-kpi:nth-child(2) .l'],
          ['last-visit label','#kcb-sheet .kcb-kpis .kcb-kpi:nth-child(3) .l'],
          ['gender label','#kcb-sheet .kcb-kpis + .kcb-info .kcb-inforow:nth-child(1) .k'],
          ['consent label','#kcb-sheet .kcb-kpis + .kcb-info .kcb-inforow:nth-child(2) .k'],
          ['history date','#kcb-sheet [data-kcb-history-row] [data-kcb-date]'],
          ['payment method','#kcb-sheet [data-kcb-history-row] [data-kcb-method] > span'],
          ['returned item','#kcb-sheet .kcb-struck']
        ];
        for(const[part,selector]of probes){
          await page.click(selector); // Driver pointer click/scroll on read-only text, no DOM interaction synthesis.
          const bounds=await page.$eval(selector,el=>{
            const b=el.getBoundingClientRect(),style=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
            const lines=[...range.getClientRects()].filter(b=>b.width>0&&b.height>0).map(b=>({top:b.top,bottom:b.bottom}));
            let opacity=1;for(let node=el;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
            return{x:b.x,y:b.y,width:b.width,height:b.height,color:style.color,opacity,struck:el.matches('.kcb-struck'),lines,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
          });
          const visible=bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=bounds.viewport.width&&bounds.y+bounds.height<=bounds.viewport.height;
          let paint={error:'Text is not fully inside actual viewport',bounds};
          if(visible){
            // Browser-native capture clip only: no PNG interpolation or bitmap editing.
            const clip={x:Math.floor(bounds.x),y:Math.floor(bounds.y),width:Math.ceil(bounds.x+bounds.width)-Math.floor(bounds.x),height:Math.ceil(bounds.y+bounds.height)-Math.floor(bounds.y)};
            const dpr=bounds.viewport.dpr;
            const pixelBounds={...bounds,x:(bounds.x-clip.x)*dpr,y:(bounds.y-clip.y)*dpr,width:bounds.width*dpr,height:bounds.height*dpr,lines:bounds.lines.map(line=>({top:(line.top-clip.y)*dpr,bottom:(line.bottom-clip.y)*dpr})),cssBounds:bounds,clip};
            paint=paintedText(await page.screenshot({clip,captureBeyondViewport:false}),pixelBounds);
          }
          paintReadings.push({theme,part,paint});
          checkReadability(!paint.error&&paint.bounds.viewport.dpr===3&&paint.frame.width===paint.bounds.clip.width*3&&paint.frame.height===paint.bounds.clip.height*3&&paint.foregroundPixels>=20&&paint.backgroundPixels>=40&&paint.contrast>=4.5,label+' literal detail → '+next+': actual PNG '+part+' text contrast ≥4.5 '+JSON.stringify(paint));
        }
        const references=await page.$$('#kcb-sheet bdi[data-nolang]');
        const canonical=[];
        for(const reference of references){
          const text=await reference.evaluate(el=>el.textContent);
          if(text!=='13002'&&text!=='AV-2032')continue;
          await reference.click(); // Real driver pointer reach; never element.click() in page code.
          canonical.push(await reference.evaluate(referenceGeometry));
        }
        checkReadability(canonical.length===4&&canonical.every(value=>value.protected&&value.lines===1&&value.fit),label+' literal detail → '+next+': receipt/return/credit reference Range is one line and fits '+JSON.stringify(canonical));
        await page.setViewport({width,height,isMobile:true,hasTouch:true,deviceScaleFactor:1});
        await page.waitForFunction(()=>devicePixelRatio===1);
      }
      await page.click('#kcb-edit');
      await page.waitForSelector('#kcb-f-name',{visible:true});
      const literalInput=await page.$('#kcb-f-name');
      for(const next of ['fr','en','ar']) {
        await page.evaluate(next=>window.KiwiCaisseLang.set(next),next);
        const name=await page.$eval('#kcb-sheet .kcb-sub',el=>({text:el.textContent,data:el.querySelector('bdi[data-nolang]')?.textContent}));
        check(name.text==='Utilisé' && name.data==='Utilisé' && await literalInput.evaluate(el=>el.isConnected && el.value==='Utilisé'),label+' literal key edit → '+next+': exact subtitle and same untouched input remain merchant data '+JSON.stringify(name));
      }
      await page.click('#kcb-f-cancel');
      check(await literalQuery.evaluate(el=>el.isConnected && el.value==='Utilisé') && await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'))===initialBook && writes.length===0,label+': cancel-only literal name navigation preserves query/book and sends no writes');
      } finally { await context.close(); }
    }
  }
  assert.equal(originalChecks,552,'all original 552 checks and 12 cases executed');
  assert.equal(checks-readabilityChecks,984,'all prior 984 checks remain intact');
  assert.equal(readabilityChecks,360,'all added pixel and reference checks execute in all 12 cases');
  const paintSummary={};
  for(const {theme,part,paint}of paintReadings){
    const key=theme+' '+part;
    const group=paintSummary[key]||(paintSummary[key]={readings:0,errors:0,minContrast:Infinity,maxContrast:0,minGlyphPixels:Infinity,minBackgroundPixels:Infinity,foreground:[],background:[]});
    group.readings++;
    if(paint.error){group.errors++;continue;}
    group.minContrast=Math.min(group.minContrast,paint.contrast);group.maxContrast=Math.max(group.maxContrast,paint.contrast);
    group.minGlyphPixels=Math.min(group.minGlyphPixels,paint.foregroundPixels);group.minBackgroundPixels=Math.min(group.minBackgroundPixels,paint.backgroundPixels);
    for(const channel of ['foreground','background'])if(!group[channel].includes(paint[channel].join(',')))group[channel].push(paint[channel].join(','));
  }
  console.log('caisse-client-book-readability-paint: '+JSON.stringify(paintSummary));
  if(failures.length)throw new Error(`${failures.length}/${checks} client-book keyboard/safe-area checks failed`);
  console.log(`caisse-client-book-keyboard-browser-test: ${checks} checks passed`);
} finally {
  if(browser)await browser.close();
  fixture.kill('SIGTERM');
}
