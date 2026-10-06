import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT,'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)] })); }
catch { console.error('Browser QA requires puppeteer-core; no browser checks were run.'); process.exit(1); }
const chrome = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if (!chrome) { console.error('Browser QA requires Chrome; no browser checks were run.'); process.exit(1); }
const evidence = process.argv.includes('--evidence');
const out = path.join(ROOT, 'docs/audits/evidence/2026-10-04-landing-es');
if (evidence) fs.mkdirSync(out, {recursive:true});
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'};
const server = http.createServer((req,res)=>{
  let file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',file.endsWith('/opengraph-image')?'image/png':mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// Chrome can wrap a single compositor capture beyond its 16384-pixel surface.
// Capture bounded document clips and assemble them in a detached canvas.
// The viewport stays at the top, preserving fixed/sticky elements and layout.
async function fullPageCapture(page, file) {
  const {width}=page.viewport();
  const height=await page.evaluate(()=>Math.ceil(document.documentElement.scrollHeight));
  if(height>32767)throw new Error('Page exceeds the screenshot canvas height limit');
  const tiles=[];
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await delay(300);
    for(let y=0;y<height;y+=8000){
      const png=await page.screenshot({clip:{x:0,y,width,height:Math.min(8000,height-y)},captureBeyondViewport:true});
      tiles.push({y,data:Buffer.from(png).toString('base64')});
    }
    const png=await page.evaluate(async({tiles,width,height})=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');
      for(const tile of tiles){const im=new Image();im.src='data:image/png;base64,'+tile.data;await im.decode();ctx.drawImage(im,0,tile.y);}
      return canvas.toDataURL('image/png').split(',')[1];
    },{tiles,width,height});
    fs.writeFileSync(file,Buffer.from(png,'base64'));
}
let checks=0;const failures=[];const results={matrix:[],navigation:[],interactions:[],links:[]};
const ok=(condition,label)=>{checks++;if(!condition)failures.push(label);};
async function open(locale,width=1440) {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewport({width,height:900});
  await page.setCacheEnabled(false);
  await page.goto(origin+'/'+locale+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(async()=>{
    for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();
    for(const key of await caches.keys())await caches.delete(key);
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.kw-locale-trigger',{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);await delay(200);
  return {page,errors};
}
// Measure painted text, rather than scrollWidth on transformed miniature
// screens or decorative glows. The QR strip is an intentionally scrolling
// demonstration; its viewport clipping is separately recorded below.
function measureLayout() {
  const clipped=[],outside=[],overlaps=[],rects=[],svgOverflow=[],splitHeadingWords=[];
  const visible=e=>{for(let a=e;a&&a!==document.body;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return false;}return true;};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode())){
    const e=n.parentElement;if(!n.textContent.trim()||e.closest('script,style,svg')||!visible(e))continue;
    if(e.closest('h1,h2,h3'))for(const word of n.textContent.matchAll(/[\p{L}]+/gu)){
      if(word[0].length<5)continue;
      const part=document.createRange();part.setStart(n,word.index);part.setEnd(n,word.index+word[0].length);
      if([...part.getClientRects()].filter(r=>r.width>0&&r.height>0).length>1)splitHeadingWords.push({word:word[0],heading:e.closest('h1,h2,h3').textContent});
    }
    const range=document.createRange();range.selectNodeContents(n);
    const parts=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
    for(const r of parts){
      const detail={text:n.textContent.trim(),tag:e.tagName,cls:e.className};
      if(e.closest('.kw-lang-view'))continue; // deliberate moving language strip
      for(let a=e;a&&a!==document.body;a=a.parentElement){
        const s=getComputedStyle(a),p=a.getBoundingClientRect();
        if(['hidden','clip','scroll','auto'].includes(s.overflowX)&& (r.left<p.left-2||r.right>p.right+2)) {clipped.push({...detail,container:a.className,left:r.left,right:r.right,bounds:[p.left,p.right]});break;}
      }
      if(e.closest('header,footer,#pricing')&&(r.left< -2||r.right>document.documentElement.clientWidth+2))outside.push(detail);
      if(e.closest('header,#pricing,.kw-locale-list'))rects.push({r,detail,node:n});
    }
  }
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j];if(a.node===b.node)continue;if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>2&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>3)overlaps.push([a.detail.text,b.detail.text]);
  }
  for (const text of document.querySelectorAll('svg text')) {
    if (!visible(text)) continue;
    const svg=text.closest('svg'), r=text.getBoundingClientRect(), p=svg.getBoundingClientRect();
    if (r.width && (r.left<p.left-2||r.right>p.right+2)) svgOverflow.push({text:text.textContent,svg:svg.getAttribute('aria-label'),bounds:[r.left,r.right,p.left,p.right]});
  }
  return{scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,clipped,outside,overlaps,svgOverflow,splitHeadingWords};
}
try {
  for(const [locale,width]of [...[360,390,768,1024,1440,1920].map(w=>['es',w]),['en',390],['en',1440],['fr',390],['fr',1440]]){
    const {page,errors}=await open(locale,width);
    // Let each reveal settle in its viewport before taking a full-page capture.
    const height=await page.evaluate(()=>document.body.scrollHeight);
    for(let y=0;y<height;y+=700){await page.evaluate(y=>scrollTo({top:y,behavior:"instant"}),y);await delay(evidence?180:30);}
    await delay(350);
    await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));await delay(400);
    const layout=await page.evaluate(measureLayout);
    const browserState=await page.evaluate(async()=>({sw:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys(),resources:performance.getEntriesByType('resource').map(e=>e.name.replace(location.origin,''))}));
    ok(layout.scrollWidth<=layout.clientWidth,`${locale} ${width}: no horizontal page scroll`);
    if(locale==='es')ok(layout.splitHeadingWords.length===0,`${width}: heading words stay whole ${JSON.stringify(layout.splitHeadingWords)}`);
    {
      ok(layout.clipped.length===0,`${locale} ${width}: no clipped text ${JSON.stringify(layout.clipped)}`);
      ok(layout.svgOverflow.length===0,`${locale} ${width}: SVG captions fit ${JSON.stringify(layout.svgOverflow)}`);
      ok(layout.outside.length===0,`${locale} ${width}: all navigation/pricing/footer text within page`);
      ok(layout.overlaps.length===0,`${locale} ${width}: no overlapping control/pricing text ${JSON.stringify(layout.overlaps)}`);
      ok(errors.length===0,`${locale} ${width}: no browser errors ${errors.join('; ')}`);
      ok(browserState.sw===0&&browserState.caches.length===0,`${width}: clean service-worker/cache state`);
    }
    if(evidence){await fullPageCapture(page,path.join(out,`${locale}-${width}.png`));}
    results.matrix.push({locale,width,layout,errors,...browserState});
    console.log(`${locale} ${width}: ${layout.scrollWidth}/${layout.clientWidth}, clipped=${layout.clipped.length}, overlap=${layout.overlaps.length}, errors=${errors.length}`);
    // Also measure the language menu in its open state.
    await page.click('.kw-locale-trigger');await delay(200);
    const menu=await page.evaluate(measureLayout);
    if(locale==='es')ok(!menu.clipped.length&&!menu.overlaps.length,`${width}: open locale menu fits`);
    if(evidence&&locale==='es')await page.screenshot({path:path.join(out,`es-${width}-menu.png`)});
    await page.close();
  }
  for(const locale of ['fr','en','ar','de','it','nl','es']){
    const {page}=await open('es');await delay(250);await page.click('.kw-locale-trigger');await delay(200);
    const options=await page.$$eval('.kw-locale-option',nodes=>nodes.map(e=>({locale:e.hreflang,current:e.getAttribute('aria-current'),selected:e.getAttribute('aria-selected'),text:e.innerText})));
    ok(options.length===7&&options.find(e=>e.locale==='es')?.current==='page'&&options.find(e=>e.locale==='es')?.selected==='true','seven locales with Spanish current');
    if(locale==='es'){await page.click('.kw-locale-option[hreflang="es"]');await delay(250);}
    else await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:60000}),page.click(`.kw-locale-option[hreflang="${locale}"]`)]);
    ok(new URL(page.url()).pathname===`/${locale}/`,`es -> ${locale} navigates`);results.navigation.push(`es -> ${locale}`);
    if(locale!=='es'){
      await page.waitForSelector('.kw-locale-trigger');await delay(300);await page.click('.kw-locale-trigger');await delay(200);
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:60000}),page.click('.kw-locale-option[hreflang="es"]')]);
      ok(new URL(page.url()).pathname==='/es/',`${locale} -> es navigates`);results.navigation.push(`${locale} -> es`);
    }
    await page.close();
  }
  const {page,errors}=await open('es');
  for (const width of [390,1440]) {
    await page.setViewport({width,height:900});
    const trades=await page.$$('#trades button');
    ok(trades.length===18,'18 trade/audience tabs at ' + width);
    for(let i=0;i<trades.length;i++){
      await trades[i].scrollIntoView();await trades[i].click();await delay(900);
      const state=await page.evaluate(()=>document.querySelector('#trades').innerText);
      ok(state.includes(String(i+1).padStart(2,'0')+' / 18'),`trade tab ${i+1} changes demo at ${width}`);
      const layout=await page.evaluate(measureLayout);
      ok(layout.clipped.length===0,`trade ${i+1} at ${width}: text fits ${JSON.stringify(layout.clipped)}`);
    }
    results.interactions.push(`18 trade tabs clicked and text measured at ${width}`);
  }
  await page.click('#pricing [role="radio"]:nth-of-type(2)');await delay(450);
  ok(await page.$eval('#pricing [role="radio"]:nth-of-type(2)',e=>e.getAttribute('aria-checked')==='true'),'yearly tab selects');
  const yearly=await page.$eval('#pricing',e=>e.innerText);
  ok(yearly.includes('199')&&yearly.includes('2 400 MAD')&&!yearly.includes('billed'),'yearly price and total stay Spanish');
  const lens=await page.$eval('#pricing .kw-lens',e=>({width:e.getBoundingClientRect().width,opacity:getComputedStyle(e).opacity}));
  ok(lens.width>20&&+lens.opacity>0,'liquid-lens highlight follows pricing tab');
  await page.click('#pricing [role="radio"]:nth-of-type(1)');await delay(150);
  ok((await page.$eval('#pricing',e=>e.innerText)).includes('249'),'monthly tab restores price');
  results.interactions.push('monthly/yearly price, annual total and liquid lens');
  await page.evaluate(()=>document.querySelector('#stats').scrollIntoView());await delay(600);
  await page.waitForSelector('.kw-more-btn',{timeout:5000});
  await page.click('.kw-more-btn');await delay(250);
  ok(await page.$eval('#stats-more',e=>e.getAttribute('data-open')==='true'),'six extra features expand');
  await delay(650);
  ok(await page.$$eval('#stats-more[data-open="true"] .kw-more-card',es=>es.length===6),'six additional feature cards appear');
  const nutrition=await page.$$eval('#stats-more .kw-nut-lbl',nodes=>nodes.map(e=>e.textContent));
  ok(JSON.stringify(nutrition)===JSON.stringify(['P 32 g','C 48 g','G 21 g']),'nutrition labels and amounts are Spanish protein/carbohydrate/fat');
  // The source timeline reveals avatars before growing each bar to expose
  // its clock label. Measure the real fully-revealed phase, not that mask.
  await page.waitForFunction(()=>[...document.querySelectorAll('.kw-team-bar')].every(e=>e.getBoundingClientRect().width>80&&+getComputedStyle(e).opacity>.9),{timeout:10000});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const expanded=await page.evaluate(measureLayout);
  results.expanded=expanded;
  ok(!expanded.clipped.length&&!expanded.svgOverflow.length&&!expanded.overlaps.length,'expanded feature text fits '+JSON.stringify(expanded));
  if(evidence)await fullPageCapture(page,path.join(out,'es-1440-more-features.png'));
  results.interactions.push('six extra features reveal; source has no collapse control');
  const links=await page.$$eval('a[href]',nodes=>[...new Set(nodes.map(e=>e.getAttribute('href')))]);
  for(const href of links){
    if(href.startsWith('#')){ok(await page.evaluate(h=>!!document.getElementById(h.slice(1)),href),`anchor ${href} exists`);results.links.push({href,status:'anchor exists'});}
    else if(href.startsWith('/')){const response=await fetch(origin+href);ok(response.ok,`link ${href} returns ${response.status}`);results.links.push({href,status:response.status});}
    else results.links.push({href,status:'external/contact target; no message sent'});
  }
  ok(errors.length===0,'interaction browser has no errors '+errors.join('; '));
  await page.setViewport({width:390,height:900});await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
  await page.click('header button[aria-controls="kw-mobile-menu"]');await delay(200);
  ok(await page.$eval('header button[aria-controls="kw-mobile-menu"]',e=>e.getAttribute('aria-expanded')==='true'&&e.getAttribute('aria-label')==='Cerrar menú'),'mobile menu opens with Spanish close label');
  await page.click('header button[aria-controls="kw-mobile-menu"]');
  results.interactions.push('mobile menu opens/closes');
  await page.close();
} catch (error) { failures.push(error.message); results.exception=error.stack; } finally {await browser.close();await new Promise(r=>server.close(r));}
results.checks=checks;results.failures=failures;
if(evidence)fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`Spanish browser QA: ${checks-failures.length}/${checks} checks passed`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
