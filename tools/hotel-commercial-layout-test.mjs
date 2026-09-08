#!/usr/bin/env node
// New commercial/production components only. Synthetic records, production
// JS/CSS, real Chromium; not a merchant session or full dashboard acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { draftSource,buildDraft } from '../functions/api/hotel/_billing-draft.js';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'app/package.json'));
const { default: puppeteer } = await import(require.resolve('puppeteer-core'));
const bin = [process.env.KIWI_CHROMIUM_BIN, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
assert.ok(bin, 'Chromium is required for hotel commercial layout verification');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-commercial-layout-'));
const source = fs.readFileSync(path.join(root, 'assets/hotel.js'), 'utf8').replace(/\}\)\(\);\s*$/, `window.__commercialLayout = { cuCommercialState, cuCommercialBody, cuProductionState, cuProductionBody,cuBillingBody,cuDraftInput,cuOpenDossier,cuStayEditor,cuState };})();`);
const booking={id:'booking-synthetic',code:'H-TEST',status:'confirmed',resourceId:'room:101',partySize:2,customer:{name:'Voyageur de démonstration'},hotel:{checkIn:'2027-07-01',checkOut:'2027-07-03',total:1600.25,roomTypeName:'Chambre supérieure'}};
const billingSource=draftSource([booking,{...booking,id:'booking-second',resourceId:'room:102',customer:{name:'ضيف تجريبي'},hotel:{...booking.hotel,total:300.15,dayUse:true,checkOut:'2027-07-01',arrivalTime:'09:00',departureTime:'14:00'}}],[{id:'company-synthetic',kind:'company',name:'Société de démonstration',legalName:'Société de démonstration',address:'Adresse de test'}]);
const billing={source:billingSource,preview:buildDraft(billingSource,{extras:[],allocations:[]}),stale:false,saved:null,sourceDigest:'synthetic-digest',directoryRev:1,rev:0};
const cssPaths = ['assets/tokens.css', 'assets/theme.css', 'assets/design-vexel.css', 'assets/hotel.css'];
const css = cssPaths.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
const latin = fs.readFileSync(path.join(root, 'app/node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2')).toString('base64');
const arabic = fs.readFileSync(path.join(root, 'app/node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2')).toString('base64');
const fonts = `@font-face{font-family:'Inter Tight';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${latin}) format('woff2')}@font-face{font-family:'IBM Plex Sans Arabic';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${arabic}) format('woff2')}`;
const server = http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hotel commercial component tests</title><style>${fonts}${css}</style><style>body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans),'IBM Plex Sans Arabic'}main{max-width:1240px;padding:20px;margin:auto}*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:600px){main{padding:12px}}</style><main></main></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath: bin, headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? req.continue() : req.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => {
    window.Kiwi = { handlers: {}, toast() {} };
    window.KiwiVenue = { getVenue: () => 'synthetic', getVenueType: () => 'hotel', isCustom: () => true, getCurrentVenueData: () => ({ id:'synthetic',slug:'synthetic',type:'hotel',custom:true }), subscribe() {} };
    window.KiwiStore = { slugFor: () => 'synthetic' };
  });
  await page.addScriptTag({ content: source });
  await page.evaluate(data=>{window.__billingFixture=data;},billing);
  await page.evaluate(() => {
    const api = window.__commercialLayout;
    Object.assign(api.cuCommercialState(), { loaded: true, accounts: [
      { id:'agency-synthetic',kind:'agency',name:'Agence des horizons · Démonstration',legalName:'Société de voyages fictive',city:'Tanger',paymentDays:30 },
      { id:'company-synthetic',kind:'company',name:'شركة تجريبية للسياحة والأعمال',legalName:'Données synthétiques uniquement',city:'Tanger',paymentDays:45 },
      { id:'individual-synthetic',kind:'individual',name:'SyntheticGuestWithAnUnbrokenVeryLongNameForNarrowScreenTesting',paymentDays:0 },
    ], contracts: [{ id:'rate-synthetic',accountId:'agency-synthetic',name:'Haute saison 2027',roomTypeId:'Standard',occupancy:2,board:'bb',from:'2027-07-01',to:'2027-08-31',amountCents:85045,unit:'room',taxBasis:'inclusive' }] });
    api.cuProductionState().month = '2027-07';
    api.cuProductionState().report = { month:'2027-07',nights:31,reservations:1,unassigned:0,totals:Array(31).fill(1),groups:[{name:'Agence des horizons · Démonstration',kind:'agency',days:Array(31).fill(1),nights:31}] };
  });
  for (const mode of ['light', 'dark', 'vexel-light', 'vexel-dark']) for (const width of [320,390,768,1024,1440]) for (const view of ['commercial','production','billing']) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.evaluate(({ mode, view }) => {
      document.documentElement.dataset.theme = mode.endsWith('dark') ? 'dark' : 'light';
      document.body.className = mode.startsWith('vexel') ? 'design-vexel' : '';
      if (mode.startsWith('vexel')) document.documentElement.dataset.vexelMode = mode.endsWith('dark') ? 'dark' : 'light';
      else delete document.documentElement.dataset.vexelMode;
      const a = window.__commercialLayout;
      document.querySelector('main').innerHTML = view === 'commercial' ? a.cuCommercialBody() : view === 'billing' ? a.cuBillingBody(window.__billingFixture) : a.cuProductionBody();
    }, { mode, view });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const box = el => el.getBoundingClientRect();
      const rgb = value => value.match(/[\d.]+/g).map(Number);
      const over = (fg,bg) => fg.slice(0,3).map((n,i) => n*(fg[3] ?? 1)+bg[i]*(1-(fg[3] ?? 1)));
      const backdrop = el => {
        const parents = []; for(let node=el;node;node=node.parentElement) parents.unshift(node);
        return parents.reduce((color,node) => over(rgb(getComputedStyle(node).backgroundColor),color),[255,255,255]);
      };
      const controls = [...document.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length);
      const small = controls.filter(el => box(el).height < 43.5).map(el => el.outerHTML);
      const region = document.querySelector('.hx-production-scroll');
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, small,
        regionFits: !region || box(region).right <= innerWidth + 1,
        labels: [...document.querySelectorAll('input,select')].every(el => el.labels.length > 0),
        inverse: [...document.querySelectorAll('.hx-btn.atlas')].map(el => { const background=backdrop(el);return {color:over(rgb(getComputedStyle(el).color),background),background}; }) };
    });
    assert.equal(result.overflow,false,`${view}/${mode}/${width}: page overflow`);
    assert.deepEqual(result.small,[],`${view}/${mode}/${width}: touch targets`);
    assert.ok(result.labels && result.regionFits,`${view}/${mode}/${width}: labels/table`);
    const luminance = color => {
      const values = color.map(n => { const v = Number(n)/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
      return values[0]*.2126+values[1]*.7152+values[2]*.0722;
    };
    for (const pair of result.inverse) {
      const a = luminance(pair.color), b = luminance(pair.background);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5,`${mode}: primary button contrast`);
    }
    const focusTarget = view === 'commercial' ? '[name="search"]' : view==='billing'?'[data-hx-payer]':'.hx-production-scroll';
    await page.focus(focusTarget);
    assert.ok(await page.$eval(focusTarget, el => getComputedStyle(el).outlineStyle !== 'none'),'visible keyboard focus');
    if (width === 390 || width === 1440) await page.screenshot({path:path.join(shots,`${view}-${mode}-${width}.png`),fullPage:true});
    console.log(`  ✓ ${view} ${mode} ${width}px: layout, labels, touch and focus`);
  }
  // Exercise real dossier handlers with synthetic API responses, not production data.
  await page.evaluate(async booking=>{
    const a=window.__commercialLayout;window.__draftCalls=[];
    window.Kiwi.modal=options=>{const el=document.createElement('section');el.innerHTML=options.body;document.querySelector('main').replaceChildren(el);return {el,close(){el.remove();}};};
    window.fetch=async(url,options)=>{
      if(options?.method==='POST'){
        const body=JSON.parse(options.body);window.__draftCalls.push(body);
        if(window.__failDraftOnce){window.__failDraftOnce=false;throw new Error('Synthetic lost response');}
        const draft=structuredClone(window.__billingFixture.preview);
        return {ok:true,json:async()=>({rev:1,saved:{draft,input:body.input,updatedAt:1}})};
      }
      return {ok:true,json:async()=>structuredClone(window.__billingFixture)};
    };
    await a.cuOpenDossier(booking);
  },booking);
  await page.select('[data-hx-payer]','account:company-synthetic');
  await page.select('[data-hx-second]','guest:booking-synthetic');
  await page.$eval('[data-hx-part]',el=>{el.value='200,01';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('.hx-billing summary');
  await page.type('[name="extraLabel"]','Repas proposé');
  await page.type('[name="extraPrice"]','123,45');
  await page.click('[data-hx-add-extra]');
  assert.equal(await page.$$eval('[data-hx-billing-line]',els=>els.length),4);
  await page.evaluate(()=>{window.__failDraftOnce=true;});
  await page.click('[data-hx-billing-form] [type="submit"]');
  await page.waitForFunction(()=>!document.querySelector('[data-hx-billing-form]').__saving);
  await page.click('[data-hx-billing-form] [type="submit"]');
  await page.waitForFunction(()=>window.__draftCalls.length===2&&!document.querySelector('[data-hx-billing-form]').__saving);
  const calls=await page.evaluate(()=>window.__draftCalls);
  assert.deepEqual(calls[0],calls[1],'ambiguous save retry preserves the same command and allocations');
  assert.equal(calls[0].input.extras[0].unitCents,12345);
  assert.deepEqual(calls[0].input.allocations[0].parts,[{payer:'account:company-synthetic',amountCents:60012},{payer:'guest:booking-synthetic',amountCents:20001}]);
  assert.equal(await page.$eval('[data-hx-print-draft]',el=>el.disabled),false);
  await page.$eval('[name="billingNote"]',el=>{el.value='New note';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.$eval('[data-hx-print-draft]',el=>el.disabled),true,'unsaved changes disable printing');
  console.log('  ✓ dossier UI: partial split, extra, ambiguous retry and saved-only printing');
  await page.evaluate(()=>{
    const a=window.__commercialLayout,st=a.cuState();
    st.roomTypes={standard:{id:'standard',name:'Standard',maxGuests:3,rate:600}};
    st.rooms={101:{id:'room:101',n:101,typeId:'standard',status:'libre'}};
    window.__stayPayload=null;
    window.fetch=async(url,options)=>{
      if(options?.method==='POST'){window.__stayPayload=JSON.parse(options.body);return {ok:false,json:async()=>({error:'room-unavailable'})};}
      return {ok:true,json:async()=>({accounts:[],contracts:[],rev:0})};
    };
    a.cuStayEditor(null);
  });
  await page.waitForSelector('[name="priceMode"]');
  await page.select('[name="stayMode"]','day_use');
  assert.equal(await page.$eval('[name="checkOut"]',el=>el.readOnly),true);
  assert.equal(await page.$eval('[name="priceMode"]',el=>el.disabled),true);
  await page.type('[name="name"]','Synthetic day-use guest');
  await page.type('[name="dayUsePrice"]','300,25');
  await page.click('[data-hx-stay-form] [type="submit"]');
  await page.waitForFunction(()=>window.__stayPayload!==null);
  const stayPayload=await page.evaluate(()=>window.__stayPayload);
  assert.equal(stayPayload.dayUse,true);assert.equal(stayPayload.dayUseAmountCents,30025);
  assert.equal(stayPayload.checkIn,stayPayload.checkOut);assert.equal(stayPayload.commercial.quoted,false);
  assert.equal(await page.$eval('[data-hx-stay-error]',el=>el.textContent.includes('prise')),true,'unavailable room keeps the form with an actionable error');
  console.log('  ✓ day-use editor: date locking, exact cents, no nightly contract and conflict feedback');
  console.log('Commercial component screenshots: ' + shots);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
