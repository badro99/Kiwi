#!/usr/bin/env node
// Render the actual boutique payment drafts, not a dictionary-only fixture.
// Browser guard only. Native before/after captures are separate evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { paintedActionColours } from './painted-png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const failures = [];
let browser, checks = 0;
const check = (value, label) => { checks++; if (!value) { failures.push(label); console.error('✗ ' + label); } };
const clean = text => text.replace(/[\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
const luminance = colour => colour.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

async function methodIcons(page, label) {
  for (const method of ['especes', 'carte', 'virement', 'cheque', 'livraison', 'avoir']) {
    const selector = `[data-bq-m="${method}"] .ic`;
    // This is a rendering regression guard, not native touch acceptance.
    // Reveal each icon inside the real method-list scroller before sampling.
    await page.$eval(selector, root => root.scrollIntoView({ block: 'center' }));
    const icon = await page.$eval(selector, root => {
      const svg = root.querySelector('svg'), box = root.getBoundingClientRect();
      return { material: !!svg && svg.getAttribute('fill') === 'currentColor' && !root.querySelector('img'),
        ink: svg ? getComputedStyle(svg).color.match(/[\d.]+/g).slice(0, 3).map(Number) : null,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
    check(icon.material, `${label} ${method}: Material icon inherits theme colour, not black image ink`);
    if (!icon.material) continue;
    const painted = paintedActionColours(await page.screenshot(), icon.ink, icon.bounds);
    check(contrast(painted.foreground, painted.background) >= 3,
      `${label} ${method}: actual icon paint clears 3:1 ${JSON.stringify(painted)}`);
  }
}
const words = {
  cash: ['Rendu calculé, flous comptés une fois', 'Change calculated, cash counted once', 'الباقي محسوب، ويُعدّ النقد مرة واحدة'],
  reader: ['Lecteur partenaire, V1 sans encaissement Kiwi', 'Partner reader, V1 does not take payment through Kiwi', 'قارئ شريك، الإصدار الأول لا يُحصّل الدفع عبر كيوي'],
  bank: ['Confirmer uniquement après réception en banque', 'Confirm only after the bank receives the funds', 'أكّد فقط بعد وصول الأموال إلى البنك'],
  cheque: ['Confirmer après réception du chèque', 'Confirm after receiving the cheque', 'أكّد بعد استلام الشيك'],
  delivery: ['Vente enregistrée, paiement à recevoir du transporteur', 'Sale recorded, payment to collect from the carrier', 'البيع مسجّل، والدفع سيُحصّل من شركة التوصيل'],
  voucher: ['Scanner ou saisir le code du bon', 'Scan or enter the credit-note code', 'امسح رمز سند الرصيد أو أدخله'],
  confirmed: ['Encaissement confirmé sur le lecteur', 'Payment confirmed on the reader', 'تم تأكيد الدفع على القارئ'],
  refused: ['Paiement refusé · annuler', 'Payment declined · cancel', 'تم رفض الدفع · إلغاء'],
  display: ['Kiwi affiche, le lecteur encaisse', 'Kiwi displays the amount; the reader takes payment', 'كيوي يعرض المبلغ، والقارئ يُحصّل الدفع'],
  bankQuestion: ['Les fonds sont-ils visibles sur le compte bancaire ? Aucun montant ne sera attendu dans le tiroir.', 'Are the funds visible in the bank account? No cash is expected in the drawer.', 'هل تظهر الأموال في الحساب البنكي؟ لا يُنتظر أي نقد في الدرج.'],
  chequeQuestion: ['Le chèque a-t-il été remis au comptoir ? Aucun montant ne sera attendu dans le tiroir.', 'Has the cheque been handed over at the counter? No cash is expected in the drawer.', 'هل تم تسليم الشيك عند الكاونتر؟ لا يُنتظر أي نقد في الدرج.'],
  creditHelp: ['Scannez le bon, ou choisissez-le, il se déduit du total', 'Scan or choose the credit note; it is deducted from the total', 'امسح سند الرصيد أو اختره ليُخصم من المجموع'],
};

async function heading(page, label) {
  await page.waitForFunction(() => {
    for (let el=document.querySelector('#bq-paym');el;el=el.parentElement) {
      if(el.getAnimations().some(a=>a.playState==='running' && Number.isFinite(a.effect.getTiming().iterations)))return false;
    }
    return true;
  });
  const geometry = await page.$eval('#bq-paym', root => {
    const button = root.querySelector('[data-bq-close]'), h = root.querySelector('.modal-title');
    const b = button.getBoundingClientRect(), texts = [];
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) texts.push({ left:r.left, right:r.right, top:r.top, bottom:r.bottom });
    }
    return { width:b.width, height:b.height, overlap:texts.some(r => Math.min(r.right,b.right)>Math.max(r.left,b.left) && Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top)) };
  });
  check(geometry.width >= 44 && geometry.height >= 44, label+': close is a real 44pt touch target '+JSON.stringify(geometry));
  check(!geometry.overlap, label+': close cannot cover heading glyphs '+JSON.stringify(geometry));
}

async function centered(page, selector, label) {
  const geometry=await page.$eval(selector,button=>{
    const box=button.getBoundingClientRect(),runs=[];
    const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(!node.nodeValue.trim())continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects())runs.push({left:r.left,right:r.right});
    }
    for(const icon of button.querySelectorAll('svg,img')){const r=icon.getBoundingClientRect();runs.push({left:r.left,right:r.right});}
    const left=Math.min(...runs.map(r=>r.left)),right=Math.max(...runs.map(r=>r.right));
    return{offset:(left+right-box.left-box.right)/2,fits:left>=box.left && right<=box.right,
      button:{left:box.left,right:box.right},runs,
      icons:[...button.querySelectorAll('svg,img,i')].map(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return{tag:el.tagName,left:r.left,right:r.right,width:r.width,display:css.display,flex:css.flex,margin:css.margin};})};
  });
  check(geometry.fits && Math.abs(geometry.offset)<=2,label+': painted icon/label group is centered '+JSON.stringify(geometry));
}

try {
  const base = await new Promise((resolve,reject) => {
    let output=''; const timer=setTimeout(()=>reject(new Error('Retail fixture timeout')),15000);
    fixture.once('exit', code=>{clearTimeout(timer);reject(new Error('Fixture exited '+code));});
    fixture.stdout.on('data', chunk=>{output+=chunk;const match=output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);if(match){clearTimeout(timer);resolve(JSON.parse(match[1]).base);}});
  });
  browser = await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  for (const [device,width,height,safe] of [['se',375,667,20],['pro',402,874,62]]) {
    for (const [index,lang] of ['fr','en','ar'].entries()) for(const theme of ['light','dark']) {
      const context=await browser.createBrowserContext(), page=await context.newPage();
      let writes=0;
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      await page.setRequestInterception(true);
      page.on('request', request=>{
        const url=request.url();
        if (/^https?:/.test(url) && new URL(url).origin!==base) return request.abort();
        if (!['GET','HEAD'].includes(request.method())) writes++;
        return request.continue();
      });
      await page.goto(base+'/boutique.html',{waitUntil:'networkidle0'});
      // Use the actual phone shell, including its real ticket peek. The
      // fixture's seeded ticket is enough to inspect drafts; do not create
      // an extra line or confirm a payment just to reach these sheets.
      await page.addStyleTag({path:path.join(ROOT,'assets/pos-mobile.css')});
      await page.addStyleTag({path:path.join(ROOT,'app/src/native-runtime.css')});
      await page.addScriptTag({path:path.join(ROOT,'assets/pos-mobile.js')});
      // The caisse's local icon adapter replaces legacy data-lucide markers
      // with Material SVGs. Empty <i> markers would create a false 4px offset.
      await page.addScriptTag({path:path.join(ROOT,'assets/lucide.min.js')});
      await page.evaluate((lang,theme,safe)=>{
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme',theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top',safe+'px');
        window.KiwiCaisseLang.set(lang);
      },lang,theme,safe);
      await page.waitForSelector('.vx-peek',{visible:true});
      await page.click('.vx-peek');
      await page.waitForFunction(() => document.querySelector('.vx-screen').classList.contains('vx-ticket-open'));
      await page.waitForFunction(() => !document.querySelector('.vx-ticket').getAnimations().some(a=>a.playState==='running'));
      const label=`${device} ${lang} ${theme}`;
      const text=async selector=>clean(await page.$eval(selector,el=>el.innerText));
      const expect=async (selector,key,scene)=>{
        const actual=await text(selector), wanted=words[key][index];
        check(actual.includes(wanted),label+' '+scene+': translated '+key+'; got '+actual);
      };
      const open=async()=>{await page.click('#bq-validate');await page.waitForSelector('[data-bq-m="especes"]',{visible:true});};
      const close=async()=>{await page.click('#bq-paym [data-bq-close]');await page.waitForSelector('#bq-pay-veil.is-open',{hidden:true});};
      await open(); await heading(page,label+' methods');
      await methodIcons(page,label+' methods');
      for(const [method,key] of [['especes','cash'],['carte','reader'],['virement','bank'],['cheque','cheque'],['livraison','delivery'],['avoir','voucher']]) await expect(`[data-bq-m="${method}"] .l span`,key,'methods');
      await page.click('[data-bq-m="especes"]'); await heading(page,label+' cash'); await centered(page,'#bq-cash-ok',label+' cash'); await close();
      await open(); await page.click('[data-bq-m="carte"]');
      await page.waitForSelector('#bq-card-ok',{visible:true});
      await expect('#bq-paym .modal-subtle','display','card');
      await expect('#bq-card-ok','confirmed','card'); await expect('#bq-card-cancel','refused','card');
      await heading(page,label+' card'); await centered(page,'#bq-card-ok',label+' card'); await close();
      for(const [method,key] of [['virement','bankQuestion'],['cheque','chequeQuestion']]) {
        await open(); await page.click(`[data-bq-m="${method}"]`); await heading(page,label+' '+method); await expect('#bq-paym .modal-subtle',key,method); await centered(page,'#bq-external-ok',label+' '+method); await close();
      }
      await open(); await page.click('[data-bq-m="avoir"]');
      await heading(page,label+' credit'); await expect('#bq-paym .modal-subtle','creditHelp','credit'); await close();
      // A mixed-payment draft stops before confirming even its first share.
      // It proves the half-amount copy without manufacturing a settled sale.
      await open(); await page.click('[data-bq-share="0.5"]');
      await page.click('[data-bq-m="carte"]');await page.waitForSelector('#bq-card-ok',{visible:true});
      await heading(page,label+' mixed card');await centered(page,'#bq-card-ok',label+' mixed card');
      const mixed=await text('#bq-paym .modal-subtle');
      check(mixed.includes(index===0?'Part sur':index===1?'Share of':'حصة من') && mixed.includes(index===0?'restera':index===1?'remaining':'سيتبقى'),label+': mixed share translates without changing its amount; got '+mixed);
      await close();
      check(writes===0,label+': opening and cancelling drafts never writes a sale');
      await context.close();
    }
  }
  if(failures.length) throw new Error(`${failures.length}/${checks} payment copy/heading checks failed`);
  console.log(`caisse-payment-copy-browser-test: ${checks} checks passed`);
} finally {
  if(browser)await browser.close();
  fixture.kill('SIGTERM');
}
