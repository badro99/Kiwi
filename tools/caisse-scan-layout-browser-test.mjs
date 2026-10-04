#!/usr/bin/env node
// #0157: real scanner markup at full and keyboard-reduced phone heights.
// Resizing Chromium is a layout guard, not native keyboard acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { decodeScreenshot, paintedActionColours } from './painted-png.mjs';
import { demoClockFixture, installDemoClock } from './native-demo-clock-fixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(root, 'app'), root] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const args=process.argv.slice(2);
assert.ok(args.length<=1 && (!args.length || args[0]==='--opening-float-only'),'Usage: caisse-scan-layout-browser-test.mjs [--opening-float-only]');
const openingOnly=args[0]==='--opening-float-only';
const fixture = spawn(process.execPath, [path.join(root, 'tools/retail-ui-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
// Existing component widths are the contract, not new icon-size guesses.
assert.match(fs.readFileSync(path.join(root,'assets/pos-boutique.css'),'utf8'),/\.bq-btn svg\s*\{\s*width:\s*16px;\s*height:\s*16px;/);
assert.match(fs.readFileSync(path.join(root,'assets/pos-boutique.js'),'utf8'),/\.bqx-mini svg\s*\{\s*width:\s*17px;\s*height:\s*17px;/);
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-scan-layout-'));
const failures = [];
const depositComputedMeasurements = [];
const stockPlaceholderPixelMeasurements = [];
const openingFloatPixelMeasurements = [];
const luminance = colour => colour.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
  .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const pixelContrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const intakeExpected = {
  fr: ['Reprise de stock', "Scannez le code déjà présent sur l'article. Kiwi le garde tel quel · aucune étiquette à réimprimer.", 'Scannez un article…', 'Lecture partielle : trop peu de caractères pour être un code-barres. Rescannez plus lentement, ou tapez-le.', 'Lecture refusée · trop-court', 'Terminer la reprise', 'La douchette ne répond pas ?', 'Valider le code saisi', "Scan incomplet, rien n'a été enregistré"],
  en: ['Stock intake', 'Scan the code already on the item. Kiwi keeps it unchanged · no labels to reprint.', 'Scan an item…', 'Partial scan: too few characters for a barcode. Scan again more slowly, or type it.', 'Scan rejected · code too short', 'Finish stock intake', 'Scanner not responding?', 'Validate the entered code', 'Incomplete scan, nothing was saved'],
  ar: ['إدخال المخزون', 'امسح الرمز الموجود على المنتج. يحتفظ به كيوي كما هو · لا حاجة لإعادة طباعة الملصقات.', 'امسح منتجًا…', 'مسح جزئي: عدد الأحرف غير كافٍ لرمز شريطي. أعد المسح ببطء أكبر أو اكتبه.', 'تم رفض المسح · الرمز قصير جدًا', 'إنهاء إدخال المخزون', 'الماسح لا يستجيب؟', 'التحقق من الرمز المدخل', 'مسح غير مكتمل، لم يُحفظ شيء'],
};
function paintedPlaceholderColours(bytes, placeholder) {
  const {width,height,channels,pixels}=decodeScreenshot(bytes), bounds=placeholder.bounds;
  const box={x:Math.floor(bounds.x),y:Math.floor(bounds.y),width:Math.floor(bounds.width),height:Math.floor(bounds.height)};
  assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=width && box.y+box.height<=height,'Actual placeholder bounds must be inside the full frame');
  const inset=Math.min(5,Math.floor(Math.min(box.width,box.height)/8)), counts=new Map();
  for(let y=box.y+inset;y<box.y+box.height-inset;y++) for(let x=box.x+inset;x<box.x+box.width-inset;x++) {
    const offset=(y*width+x)*channels;
    if(channels===4 && pixels[offset+3]!==255) continue;
    const colour=[...pixels.subarray(offset,offset+3)].join(','); counts.set(colour,(counts.get(colour)||0)+1);
  }
  const dominant=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
  assert.ok(dominant,'Opaque input surface pixels required');
  const background=dominant[0].split(',').map(Number);
  // CSS only locates the intended glyph colour, including alpha. The helper
  // must find that ink in the actual decoded PNG; contrast uses PNG pixels.
  const alpha=(placeholder.colour[3]??1)*placeholder.opacity;
  const expected=placeholder.colour.slice(0,3).map((v,i)=>v*alpha+background[i]*(1-alpha));
  return paintedActionColours(bytes,expected,bounds);
}
function paintedFocusRing(bytes, state) {
  const png=decodeScreenshot(bytes),r=state.bounds,extent=state.offset+state.width;
  assert.ok(r.x-extent-2>=0 && r.y-extent-2>=0 && r.x+r.width+extent+2<png.width && r.y+r.height+extent+2<png.height,'Whole actual opening-float ring must be inside the original frame');
  const sample=(x,y)=>{const i=(Math.round(y)*png.width+Math.round(x))*png.channels;return [...png.pixels.subarray(i,i+3)];};
  let count=0;
  for(let y=Math.floor(r.y-extent);y<Math.ceil(r.y+r.height+extent);y++) for(let x=Math.floor(r.x-extent);x<Math.ceil(r.x+r.width+extent);x++) {
    if(x>=r.x && x<=r.x+r.width && y>=r.y && y<=r.y+r.height)continue;
    const colour=sample(x,y);
    if(colour.reduce((sum,value,i)=>sum+(value-state.colour[i])**2,0)<=12)count++;
  }
  // Opening remains a dark, nonuniform gradient even with a light OS theme.
  // Its darker top centre can pass while the brighter side neighbours fail.
  // Read actual ring ink and its outside neighbour along every straight edge;
  // exclude rounded corners and use the worst painted contrast, never an
  // assumed theme surface or one convenient centre pixel.
  const distance=colour=>colour.reduce((sum,value,i)=>sum+(value-state.colour[i])**2,0);
  const edges={};
  for(const edge of ['top','right','bottom','left']) {
    const horizontal=edge==='top'||edge==='bottom';
    const length=horizontal?r.width:r.height,inset=Math.min(state.radius+2,length/2);
    const measurements=[];
    for(const fraction of [0,.25,.5,.75,1]) {
      const along=inset+(length-2*inset)*fraction;
      const at=outward=>edge==='top'?[r.x+along,r.y-outward]
        :edge==='right'?[r.x+r.width+outward,r.y+along]
        :edge==='bottom'?[r.x+along,r.y+r.height+outward]
        :[r.x-outward,r.y+along];
      let ink,ringPoint;
      for(let outward=state.offset+.5;outward<extent;outward+=.5) {
        const point=at(outward),colour=sample(...point);
        // Fractional bottom-edge rasterization can shift mint by a few RGB
        // values. Still measure that decoded ink, not the declared CSS colour.
        if(distance(colour)<=64){ink=colour;ringPoint=point.map(Math.round);break;}
      }
      assert.ok(ink,`Actual opening-float ${edge} ring ink required`);
      const outsidePoint=at(extent+2).map(Math.round),background=sample(...outsidePoint);
      measurements.push({foreground:ink,background,ringPoint,outsidePoint,contrast:pixelContrast(ink,background)});
    }
    edges[edge]=measurements.reduce((worst,measurement)=>measurement.contrast<worst.contrast?measurement:worst);
  }
  const worst=Object.values(edges).reduce((a,b)=>a.contrast<b.contrast?a:b);
  return {count,foreground:worst.foreground,background:worst.background,contrast:worst.contrast,edges};
}
let browser, checks = 0;
const check = (value, label) => { checks++; if (!value) { failures.push(label); console.error('✗ ' + label); } };
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
  if(!openingOnly) for (const [device, width, heights] of [['se', 375, [667, 407]], ['pro', 402, [874, 520]]]) {
    for (const lang of ['fr', 'en', 'ar']) for (const theme of ['light', 'dark']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const errors = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
      await page.setViewport({ width, height: heights[0], isMobile: true, hasTouch: true });
      await page.goto(base + '/boutique.html', { waitUntil: 'networkidle0' });
      await page.addStyleTag({ path: path.join(root, 'assets/pos-mobile.css') });
      await page.addStyleTag({ path: path.join(root, 'app/src/native-runtime.css') });
      // The small retail fixture does not include the production icon adapter.
      // Load that exact runtime before controls mount, rather than accepting
      // empty placeholder <i> nodes as an honest rendered surface.
      await page.addScriptTag({ path: path.join(root, 'assets/lucide.min.js') });
      await page.evaluate((lang, theme) => {
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme', theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top', '20px');
        window.KiwiCaisseLang.set(lang);
      }, lang, theme);
      await page.addScriptTag({ path: path.join(root, 'assets/pos-mobile.js') });
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="scan"]');
      await page.waitForSelector('#bq-ean');
      await page.waitForFunction(() => document.activeElement?.id === 'bq-ean');
      const focusRing = async (selector, label) => {
        const ring = await page.$eval(selector, input => {
          const inner = getComputedStyle(input), wrapper = getComputedStyle(input.parentElement);
          return { inner: inner.outlineStyle, width: parseFloat(wrapper.outlineWidth),
            style: wrapper.outlineStyle, radius: parseFloat(wrapper.borderRadius),
            border: wrapper.borderColor, outline: wrapper.outlineColor, shadow: wrapper.boxShadow,
            keyboard: input.matches(':focus-visible') && document.activeElement === input };
        });
        check(ring.keyboard, label + ': real editable control owns keyboard focus');
        check(ring.inner === 'none', label + ': no square inner focus outline ' + JSON.stringify(ring));
        check(ring.style === 'solid' && ring.width >= 3 && ring.radius >= 10,
          label + ': rounded wrapper retains a visible keyboard focus ring ' + JSON.stringify(ring));
        check(ring.border !== ring.outline && ring.shadow === 'none',
          label + ': only one accented focus effect ' + JSON.stringify(ring));
      };
      // Computed CSS compositing is a browser guard, not screenshot pixel proof.
      const computedSurfaceContrast = (selector, wrapped = true) => page.$eval(selector, (input, wrapped) => {
        const control=wrapped?input.parentElement:input, css=getComputedStyle(control);
        const rgb=value => (value.match(/[\d.]+/g) || []).map(Number);
        const blend=(top,bottom) => {
          const alpha=top[3] == null?1:top[3];
          return top.slice(0,3).map((v,i)=>v*alpha+bottom[i]*(1-alpha));
        };
        const backgrounds=[];
        for(let el=control;el;el=el.parentElement) backgrounds.push(rgb(getComputedStyle(el).backgroundColor));
        let background=[247,245,240];
        for(const color of backgrounds.reverse()) background=blend(color,background);
        const luminance=color => color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
        const ratio=color => {const a=luminance(color),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
        return {border:ratio(blend(rgb(css.borderColor),background)),outline:ratio(blend(rgb(css.outlineColor),background)),background,
          outlineColor:css.outlineColor,outlineStyle:css.outlineStyle,outlineWidth:parseFloat(css.outlineWidth),radius:parseFloat(css.borderRadius),
          keyboard:input.matches(':focus-visible') && document.activeElement===input};
      }, wrapped);
      await focusRing('#bq-ean', `${device} ${lang} ${theme} scanner`);
      const statusBacking = await page.$eval('.vx-screen.is-on', screen => {
        const css = getComputedStyle(screen, '::before');
        return { position: css.position, height: parseFloat(css.height), background: css.backgroundColor };
      });
      check(statusBacking.position === 'fixed' && statusBacking.height === 20 &&
        !/rgba?\(0, 0, 0(?:, 0)?\)|transparent/.test(statusBacking.background),
        `${device} ${lang} ${theme}: opaque status backing while the workspace scrolls ${JSON.stringify(statusBacking)}`);
      await page.click('.vx-burger');
      // The scanner's blur handler may reclaim focus after 120ms. An immediate
      // assertion misses the real WKWebView keyboard reappearing over the rail.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 220)));
      check(await page.evaluate(() => !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')),
        `${device} ${lang} ${theme}: drawer dismisses text editing`);
      // Tap the visible scrim, not the rail covering its centre (or its RTL side).
      const scrimX = lang === 'ar' ? 20 : width - 20;
      check(await page.evaluate(x => document.elementFromPoint(x, 200)?.classList.contains('vx-scrim'), scrimX),
        `${device} ${lang} ${theme}: drawer scrim is touchable outside the rail`);
      await page.mouse.click(scrimX, 200);
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.click('#bq-ean');
      for (const height of heights) {
        await page.setViewport({ width, height, isMobile: true, hasTouch: true });
        const layout = await page.evaluate(() => {
          const rect = s => { const {top,bottom,left,right} = document.querySelector(s).getBoundingClientRect(); return {top,bottom,left,right}; };
          return { help: rect('.bq-scan .bq-head-sub'), input: rect('.bq-ean-in'), burger: rect('.vx-burger'), heading: rect('.bq-scan h1'), scroller: rect('.bq-scan') };
        });
        const label = `${device} ${lang} ${theme} height=${height}`;
        check(layout.input.top >= layout.help.bottom + 8, label + ': input cannot overlap scanner help ' + JSON.stringify(layout));
        check(layout.heading.right <= layout.burger.left - 6 || layout.heading.left >= layout.burger.right + 6,
          label + ': title clears the burger horizontally');
        check(layout.heading.top >= 20, label + ': title clears the native status inset');
        await page.screenshot({ path: path.join(shots, `${device}-${lang}-${theme}-${height}.png`), captureBeyondViewport: false });
      }
      await page.setViewport({width,height:heights[0],isMobile:true,hasTouch:true});
      await page.click('#bq-scan-mock');
      await page.waitForSelector('.bq-look-tot',{visible:true});
      await page.waitForFunction(lang=>{
        const expected=lang==='fr'?'en stock':lang==='en'?'in stock':'في المخزون';
        return document.querySelector('.bq-look-tot')?.textContent.includes(expected);
      },{},lang);
      const result=await page.$eval('.bq-look-tot',el=>el.textContent);
      const log=await page.$eval('.bq-scan-log-row',el=>el.textContent);
      check(result.includes(lang==='fr'?'en stock':lang==='en'?'in stock':'في المخزون'),`${device} ${lang} ${theme}: scan stock copy translates`);
      check(log.includes(lang==='fr'?'vérifié':lang==='en'?'checked':'تم التحقق'),`${device} ${lang} ${theme}: scan verification is interface copy, not part of the product name`);
      await page.click('#bq-ean');
      const unknownCode='qqq · Total <img src=x> $& {n} 007';
      await page.type('#bq-ean', unknownCode);
      await page.keyboard.press('Enter');
      await page.waitForFunction(code=>Array.from(document.querySelectorAll('#toast-stack .toast-title')).some(el=>el.textContent.replace(/[\u2066\u2069]/g,'').includes(code)),{},unknownCode);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const unknownToast=await page.$$eval('#toast-stack .toast-title',(els,code)=>{
        const el=els.find(el=>el.textContent.replace(/[\u2066\u2069]/g,'').includes(code));
        return {text:el?.textContent.replace(/[\u2066\u2069]/g,''),elements:el?.children.length,severity:el?.closest('.toast')?.className};
      },unknownCode);
      const unknownExpected=lang==='fr'?`Code ${unknownCode} inconnu, aucun article ne le porte`
        :lang==='en'?`Unknown code ${unknownCode}, no item uses it`:`الرمز ${unknownCode} غير معروف، لا يحمله أي منتج`;
      check(unknownToast.text===unknownExpected,`${device} ${lang} ${theme}: actual scanner Enter unknown-code toast translates and preserves code bytes ${JSON.stringify(unknownToast)}`);
      check(unknownToast.elements===0,`${device} ${lang} ${theme}: barcode markup remains safe toast text, never injected elements`);
      check(unknownToast.severity?.includes('is-warn') && !unknownToast.severity?.includes('is-success'),
        `${device} ${lang} ${theme}: unknown barcode feedback is a warning, not success ${JSON.stringify(unknownToast)}`);
      const unknownHistory=await page.$eval('.bq-scan-log-row.is-err > span:nth-of-type(2)',el=>el.textContent);
      const historyExpected=lang==='fr'?'Code inconnu, non référencé':lang==='en'?'Unknown code, not registered':'رمز غير معروف، غير مسجّل';
      check(unknownHistory===historyExpected,`${device} ${lang} ${theme}: actual unknown-code scan history translates ${JSON.stringify(unknownHistory)}`);
      await page.waitForSelector('#bqi-or-var + .kiwi-select .kiwi-select-trigger', {visible:true});
      await page.click('#bqi-or-var + .kiwi-select .kiwi-select-trigger');
      await page.click('.kiwi-select-search input');
      await focusRing('.kiwi-select-search input', `${device} ${lang} ${theme} variant chooser`);
      await page.click('.kiwi-select-close');
      await page.click('#bq-invmm [data-inv-x]');
      // Inventory owns a different search wrapper from the scanner screen.
      // It is generated by renderInventaire(), not a hand-written fixture.
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="inventaire"]');
      await page.waitForSelector('#bqi-scan', {visible:true});
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open') &&
        !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState==='running'));
      for (const height of heights) {
        await page.setViewport({width,height,isMobile:true,hasTouch:true});
        await page.click('#bqi-scan');
        await page.waitForFunction(() => document.activeElement?.id==='bqi-scan');
        // Clear through the real editable control so the actual placeholder,
        // not an input value or a recreated label, is captured in the PNG.
        const selectAllModifier=process.platform==='darwin'?'Meta':'Control';
        await page.keyboard.down(selectAllModifier);
        await page.keyboard.press('KeyA');
        await page.keyboard.up(selectAllModifier);
        await page.keyboard.press('Backspace');
        await page.evaluate(()=>document.fonts.ready);
        const placeholder=await page.$eval('#bqi-scan',input=>{
          const r=input.getBoundingClientRect(), css=getComputedStyle(input,'::placeholder');
          return {empty:input.value==='' && input.matches(':placeholder-shown'),text:input.placeholder,
            colour:(css.color.match(/[\d.]+/g)||[]).map(Number),opacity:Number(css.opacity),
            bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};
        });
        check(placeholder.empty,`${device} ${lang} ${theme} stock height=${height}: actual focused input displays its placeholder`);
        const placeholderFrame=await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-stock-placeholder-${height}.png`),captureBeyondViewport:false});
        let measured;
        try {
          const colours=paintedPlaceholderColours(placeholderFrame,placeholder);
          measured={...colours,contrast:pixelContrast(colours.foreground,colours.background),bounds:placeholder.bounds,text:placeholder.text};
          check(measured.contrast>=4.5,`${device} ${lang} ${theme} stock height=${height}: PNG-decoded placeholder text contrast ≥4.5 ${JSON.stringify(measured)}`);
        } catch(error) {
          check(false,`${device} ${lang} ${theme} stock height=${height}: actual placeholder ink must be present in full-frame PNG: ${error.message} ${JSON.stringify(placeholder)}`);
        }
        stockPlaceholderPixelMeasurements.push({device,lang,theme,height,...measured});
        await page.keyboard.type('q');
        await focusRing('#bqi-scan', `${device} ${lang} ${theme} stock height=${height}`);
        const computed = await computedSurfaceContrast('#bqi-scan');
        check(computed.border>=3 && computed.outline>=3,
          `${device} ${lang} ${theme} stock height=${height}: neutral border and sole focus ring contrast ≥3 against computed surface ${JSON.stringify(computed)}`);
        await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-stock-${height}.png`),captureBeyondViewport:false});
      }
      // Real Stock Enter follows invScanHandle→intakeTake, unlike scanner
      // lookup's offerRegister. A one-character code must remain a no-save draft.
      const catalogBefore=await page.evaluate(()=>{
        window.__intakeCatalogWrites=[];
        const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
        Storage.prototype.setItem=function(key,value){if(/^kiwi(?:BoutiqueCatalog|Catalog)/.test(key)) window.__intakeCatalogWrites.push(key);return set.call(this,key,value);};
        Storage.prototype.removeItem=function(key){if(/^kiwi(?:BoutiqueCatalog|Catalog)/.test(key)) window.__intakeCatalogWrites.push(key);return remove.call(this,key);};
        return Object.keys(localStorage).filter(key=>/^kiwi(?:BoutiqueCatalog|Catalog)/.test(key)).sort().map(key=>[key,localStorage.getItem(key)]);
      });
      await page.click('#bqi-scan');
      await page.keyboard.down(process.platform==='darwin'?'Meta':'Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up(process.platform==='darwin'?'Meta':'Control');
      await page.keyboard.type('Q');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#bqx-code',{visible:true});
      await page.waitForFunction(()=>document.activeElement?.id==='bqx-code');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const intake=await page.evaluate(()=>{
        const text=selector=>document.querySelector(selector)?.textContent.replace(/[\u2066\u2069]/g,'').trim();
        const values=[text('.bqx-head-t h3'),text('.bqx-head-t > span'),document.querySelector('#bqx-code')?.placeholder,
          text('#bqx-hint'),text('.bqx-log-row span'),text('#bqx-done'),text('#bqx-diag'),document.querySelector('#bqx-go')?.title];
        const nonSave=Array.from(document.querySelectorAll('#toast-stack .toast-title')).find(el=>/Scan incomplet|Incomplete scan|مسح غير مكتمل/.test(el.textContent));
        return {values,counts:Array.from(document.querySelectorAll('.bqx-tally b'),el=>el.textContent.replace(/[\u2066\u2069]/g,'')),
          nonSave:nonSave?.textContent,severity:nonSave?.closest('.toast')?.className,
          catalog:Object.keys(localStorage).filter(key=>/^kiwi(?:BoutiqueCatalog|Catalog)/.test(key)).sort().map(key=>[key,localStorage.getItem(key)]),
          catalogWrites:window.__intakeCatalogWrites};
      });
      for(let i=0;i<8;i++) check(intake.values[i]===intakeExpected[lang][i],`${device} ${lang} ${theme}: real invalid Stock Enter copy[${i}] ${JSON.stringify(intake.values[i])}`);
      check(intake.counts.join(',')==='0,0',`${device} ${lang} ${theme}: invalid stock intake retains 0 item / 0 unit`);
      check(intake.nonSave===intakeExpected[lang][8] && intake.severity?.includes('is-warn') && !intake.severity?.includes('is-success'),
        `${device} ${lang} ${theme}: invalid intake non-save toast translates and warns ${JSON.stringify({text:intake.nonSave,severity:intake.severity})}`);
      check(JSON.stringify(intake.catalog)===JSON.stringify(catalogBefore) && intake.catalogWrites.length===0,
        `${device} ${lang} ${theme}: invalid Stock Enter performs no catalog/stock persistence writes ${JSON.stringify(intake.catalogWrites)}`);
      await focusRing('#bqx-code',`${device} ${lang} ${theme} invalid stock intake`);
      // Severity was checked while the real feedback was visible. Let its
      // ordinary timers expire and the modal settle before durable UI proof;
      // do not hide, remove, recolour or edit anything for the screenshot.
      await page.waitForFunction(()=>!document.querySelector('#toast-stack .toast'),{timeout:12000});
      await page.waitForFunction(()=>!document.querySelector('#bq-invmm').getAnimations({subtree:true}).some(a=>a.playState==='running'));
      for(const intakeHeight of heights) {
        await page.setViewport({width,height:intakeHeight,isMobile:true,hasTouch:true});
        await page.waitForFunction(()=>!document.querySelector('#bq-invmm').getAnimations({subtree:true}).some(a=>a.playState==='running'));
        for(const [selector,symbol,optional,expectedWidth] of [['#bq-invmm [data-inv-x]','close',false,16],['#bqx-go','arrow_forward',false,17],['#bqx-diag','monitoring',false,16],['#bqx-cam','photo_camera',true,16]]) {
          const icon=await page.evaluate((selector,symbol,optional)=>{
            const control=document.querySelector(selector);
            if(!control && optional) return {notApplicable:true};
            const svg=control?.querySelector('svg[data-material-symbol]'),shape=svg?.querySelector('path');
            if(!svg || !shape) return {present:false};
            const r=svg.getBoundingClientRect(),css=getComputedStyle(svg),owner=getComputedStyle(control);
            return {present:svg.getAttribute('data-material-symbol')===symbol && !!shape.getAttribute('d'),width:r.width,height:r.height,
              visible:css.display!=='none' && css.visibility==='visible' && Number(css.opacity)>0 && Number(owner.opacity)>0 &&
                r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,
              fill:css.fill,flexShrink:css.flexShrink,symbol:svg.getAttribute('data-material-symbol')};
          },selector,symbol,optional);
          check(icon.notApplicable || (icon.present && icon.visible && icon.width>=expectedWidth && icon.height>=expectedWidth && icon.fill!=='none'),
            `${device} ${lang} ${theme} intake height=${intakeHeight}: actual ${symbol} icon retains declared ${expectedWidth}px size via the production adapter ${JSON.stringify(icon)}`);
        }
        await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-stock-intake-invalid-${intakeHeight}.png`),captureBeyondViewport:false});
      }
      await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-stock-intake-invalid.png`),captureBeyondViewport:false});
      await page.click('#bqx-done');
      await page.waitForFunction(()=>!document.querySelector('#bq-inv-veil')?.classList.contains('is-open'));
      await page.setViewport({width,height:heights[0],isMobile:true,hasTouch:true});
      await page.click('.vx-burger');
      await page.waitForFunction(() => document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
      await page.waitForFunction(() => !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState === 'running'));
      await page.click('button[data-bq-view="acomptes"]');
      await page.waitForSelector('.krb-search input',{visible:true});
      await page.waitForFunction(() => !document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open') &&
        !document.querySelector('.kiwi-dna-rail').getAnimations().some(a => a.playState==='running'));
      await page.click('.krb-search input');
      await page.keyboard.type('q');
      const depositComputed=await computedSurfaceContrast('.krb-search input',false);
      check(depositComputed.keyboard && depositComputed.outlineStyle==='solid' && depositComputed.outlineWidth>=2 && depositComputed.radius>=10,
        `${device} ${lang} ${theme} deposits: real keyboard focus has one rounded ring ${JSON.stringify(depositComputed)}`);
      check(depositComputed.outline>=3,`${device} ${lang} ${theme} deposits: focus ring contrast ≥3 against computed surface ${JSON.stringify(depositComputed)}`);
      depositComputedMeasurements.push({device,lang,theme,...depositComputed});
      check(errors.length === 0, `${device} ${lang} ${theme}: no page errors: ${errors.join(' | ')}`);
      check(writes.length === 0, `${device} ${lang} ${theme}: read-only layout pass`);
      await context.close();
    }
  }
  // The normal retail demo deliberately skips opening float. Change only its
  // loopback bootstrap before the real module executes; never copy its markup,
  // invoke a private renderer, pair an account or press the shift-opening button.
  const demoBootstrap='window.KiwiEnv={isReal:()=>false,demosAllowed:true}';
  const openingHtml=await (await fetch(base+'/boutique.html')).text();
  assert.equal(openingHtml.split(demoBootstrap).length,2,'Opening fixture must replace exactly the real/demo bootstrap');
  const demoMerchant="localStorage.setItem('kiwiLiveMerchant','synthetic-retail-acompte');";
  assert.equal(openingHtml.split(demoMerchant).length,2,'Opening fixture must remove only its synthetic merchant identity');
  const openingSource=openingHtml.replace(demoBootstrap,'window.KiwiEnv={isReal:()=>true,demosAllowed:false}').replace(demoMerchant,'');
  for(const [device,width,heights] of [['se',375,[667,407]],['pro',402,[874,520]]]) {
    for(const lang of ['fr','en','ar']) for(const theme of ['light','dark']) {
      const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[],writes=[];
      try {
      page.on('pageerror',error=>errors.push(error.message));
      await page.setViewport({width,height:heights[0],isMobile:true,hasTouch:true});
      const clock=demoClockFixture();
      await page.emulateTimezone(clock.timezone);
      await page.evaluateOnNewDocument(installDemoClock,clock.midServiceMs);
      await page.setRequestInterception(true);
      page.on('request',request=>{
        if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(request.method()+' '+new URL(request.url()).pathname);request.abort();return;}
        if(request.url()===base+'/boutique.html?opening-focus') {request.respond({status:200,contentType:'text/html',body:openingSource});return;}
        request.url().startsWith(base+'/') || request.url().startsWith('data:')?request.continue():request.abort();
      });
      await page.goto(base+'/boutique.html?opening-focus',{waitUntil:'networkidle0'});
      await page.addStyleTag({path:path.join(root,'assets/pos-mobile.css')});
      await page.addStyleTag({path:path.join(root,'app/src/native-runtime.css')});
      await page.evaluate((lang,theme)=>{
        document.documentElement.classList.add('kiwi-native');
        document.documentElement.setAttribute('data-caisse-theme',theme);
        document.documentElement.setAttribute('data-theme',theme);
        document.documentElement.setAttribute('data-vexel-mode',theme);
        document.documentElement.style.setProperty('--kiwi-host-safe-top','20px');
        window.KiwiCaisseLang.set(lang);
      },lang,theme);
      await page.waitForSelector('#bq-clockin.is-visible',{visible:true});
      await page.waitForFunction(()=>!document.querySelector('#bq-clockin').getAnimations({subtree:true}).some(a=>a.playState==='running'));
      const dateState=locale=>page.evaluate(locale=>{
        const now=new Date(),expected=new Intl.DateTimeFormat({fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[locale],{weekday:'long',day:'numeric',month:'long'}).format(now);
        return {actual:document.querySelector('#bqci-date').textContent,expected,clock:document.querySelector('#bqci-time').textContent,
          expectedClock:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')};
      },locale);
      const initialDate=await dateState(lang);
      check(initialDate.actual===initialDate.expected,`${device} ${lang} ${theme}: actual opening date uses the active locale ${JSON.stringify(initialDate)}`);
      for(const switched of ['fr','en','ar']) {
        await page.evaluate(locale=>window.KiwiCaisseLang.set(locale),switched);
        const changed=await dateState(switched);
        console.log(`${device} ${lang} ${theme} opening date switch ${switched}: `+JSON.stringify(changed));
        check(changed.actual===changed.expected,`${device} ${lang} ${theme}: public locale switch immediately reformats the actual opening date in ${switched} ${JSON.stringify(changed)}`);
        check(changed.clock===changed.expectedClock || (switched==='ar' && changed.clock==='\u2066'+changed.expectedClock+'\u2069'),`${device} ${lang} ${theme}: date locale switch preserves the actual local-time clock, allowing only the existing AR LRI/PDI wrapper ${JSON.stringify(changed)}`);
      }
      await page.evaluate(locale=>window.KiwiCaisseLang.set(locale),lang);
      const before=await page.evaluate(()=>({shift:localStorage.getItem('kiwi:bqShift'),float:localStorage.getItem('kiwi:openingFloat:v1:boutique')}));
      await page.tap('#bqci-chips [data-float="custom"]');
      await page.waitForFunction(()=>document.activeElement?.id==='bqci-input' && !document.querySelector('#bqci-custom').hidden);
      for(const height of heights) {
        await page.setViewport({width,height,isMobile:true,hasTouch:true});
        await page.tap('#bqci-input');
        await page.waitForFunction(()=>!document.querySelector('#bq-clockin').getAnimations({subtree:true}).some(a=>a.playState==='running'));
        const state=await page.$eval('#bqci-input',input=>{
          const inner=getComputedStyle(input),owner=input.parentElement,css=getComputedStyle(owner),r=owner.getBoundingClientRect();
          return {focused:document.activeElement===input && input.matches(':focus-visible'),inner:inner.outlineStyle,
            gateBackground:getComputedStyle(input.closest('#bq-clockin')).backgroundImage,
            style:css.outlineStyle,width:parseFloat(css.outlineWidth),offset:parseFloat(css.outlineOffset),radius:parseFloat(css.borderRadius),
            border:css.borderColor,outline:css.outlineColor,colour:(css.outlineColor.match(/[\d.]+/g)||[]).slice(0,3).map(Number),shadow:css.boxShadow,
            bounds:{x:r.x,y:r.y,width:r.width,height:r.height},value:input.value,expanded:document.querySelector('[aria-controls="bqci-custom"]').getAttribute('aria-expanded')};
        });
        const label=`${device} ${lang} ${theme} opening float height=${height}`;
        check(state.focused && state.expanded==='true',label+': real Other tap exposes the focused editable amount');
        check(state.inner==='none',label+': no square inner outline '+JSON.stringify(state));
        check(state.style==='solid' && state.width>=3 && state.radius>=10 && state.gateBackground.includes('radial-gradient('),label+': one rounded outer focus ring on the actual forced-dark opening gradient '+JSON.stringify(state));
        check(state.border!==state.outline && state.shadow==='none',label+': neutral border and no duplicate accent');
        const bytes=await page.screenshot({path:path.join(shots,`${device}-${lang}-${theme}-opening-float-${height}.png`),captureBeyondViewport:false});
        let paint;
        try {
          paint=paintedFocusRing(bytes,state);
          check(paint.count>=40 && paint.contrast>=3,label+': original PNG focus ring contrast ≥3 '+JSON.stringify(paint));
        }catch(error){check(false,label+': actual rounded ring paint required: '+error.message);}
        openingFloatPixelMeasurements.push({device,lang,theme,height,...paint});
      }
      const after=await page.evaluate(()=>({shift:localStorage.getItem('kiwi:bqShift'),float:localStorage.getItem('kiwi:openingFloat:v1:boutique'),confirmed:document.querySelector('#bqci-btn').classList.contains('is-confirmed')}));
      check(after.shift===before.shift && after.float===before.float && !after.confirmed,`${device} ${lang} ${theme}: no shift or amount preference saved by focus checks`);
      check(errors.length===0 && writes.length===0,`${device} ${lang} ${theme}: opening-focus renderer has no page errors or network writes ${JSON.stringify({errors,writes})}`);
      } finally { await context.close(); }
    }
  }
  console.log('deposit-focus-computed-measurements: '+JSON.stringify(depositComputedMeasurements));
  console.log('stock-placeholder-pixel-measurements: '+JSON.stringify(stockPlaceholderPixelMeasurements));
  console.log('opening-float-pixel-measurements: '+JSON.stringify(openingFloatPixelMeasurements));
  if (failures.length) throw new Error(`${failures.length}/${checks} scanner layout checks failed; screenshots: ${shots}`);
  console.log(`caisse-scan-layout-browser-test: ${checks} checks passed; screenshots: ${shots}`);
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
