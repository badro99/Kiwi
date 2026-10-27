import menuCatalogSource from './menu-catalog-test-source.cjs';
// assets/employee-planning.js assets/menu-catalog.js assets/onboarding.js
// assets/pages-pro/boutique-promos-returns.js assets/pos-epicerie.js assets/admin-workspace.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, realPage } from './surface-matrix-lib.mjs';
const h=await harness('wave-p-keyboard');
try {
 await h.S.run('planning sheets contain keyboard and restore focus',async t=>{
  const page=await h.browser.newPage();t.defer(()=>page.close());t.watch(page);
  await page.goto(h.base+'/404.html');
  await page.setContent('<html lang="fr"><body><button id="outside">Outside</button><div id="kg-sched-card"></div></body></html>');
  await page.addScriptTag({url:h.base+'/assets/employee-planning.js'});
  await page.evaluate(()=>window.dispatchEvent(new Event('load')));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('kiwi-employee-data',{detail:{employee:{id:'synthetic'},schedule:{'2099-01-01':{start:'09:00',end:'17:00'}},planning:{notices:Array.from({length:6},(_,i)=>({type:'schedule-published',periodKey:'Week '+i,createdAt:String(i)})),swapRequests:[{id:'swap',day:'2099-01-02',status:'open',shift:{start:'09:00',end:'17:00'}}]}}})));
  await page.focus('summary');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('details',e=>e.open),true);
  assert.equal(await page.$$eval('details .kep-notice',e=>e.length),3);
  for(const kind of ['leave','availability']) {
   await page.click(`[data-kep="${kind}"]`);
   assert.equal(await page.$eval('#outside',e=>e.inert||e.closest('[inert]')!==null),true);
   await page.keyboard.down('Shift');
   try { await page.keyboard.press('Tab'); } finally { await page.keyboard.up('Shift'); }
   assert.equal(await page.evaluate(()=>document.activeElement.type),'submit');
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-kep-close')),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.kep),kind);
   assert.equal(await page.$eval('#outside',e=>e.inert),false);
  }
  await page.click('[data-kep-swap-claim]');
  await page.keyboard.down('Shift');
  try { await page.keyboard.press('Tab'); } finally { await page.keyboard.up('Shift'); }
  assert.equal(await page.evaluate(()=>document.activeElement.type),'submit');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-kep-close')),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-kep-swap-claim')),true);
 });
 await h.S.run('catalog switch works with Enter and Space',async t=>{
  const page=await h.browser.newPage();t.defer(()=>page.close());t.watch(page);
  const source=menuCatalogSource();
  const markup=source.match(/<button type="button" class="sw [^\n]+<\/button>/)[0];
  const html=Function('it','esc','tr','T','return `'+markup+'`;')({id:'synthetic',name:'Synthetic item',avail:true},String,x=>x,{avail:'Available',unavail:'Unavailable'});
  await page.setContent('<html lang="en"><body>'+html+'</body></html>');
  await page.evaluate(()=>document.querySelector('button').onclick=e=>e.currentTarget.setAttribute('aria-checked',String(e.currentTarget.getAttribute('aria-checked')!=='true')));
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal(await page.$eval('button',e=>e.getAttribute('aria-checked')),'false');
  await page.keyboard.press('Space');assert.equal(await page.$eval('button',e=>e.getAttribute('aria-checked')),'true');
 });
 await h.S.run('onboarding completion waits for explicit entry',async t=>{
  const page=await h.browser.newPage();t.defer(()=>page.close());t.watch(page);
  await page.setContent('<html lang="fr"><body><div class="kob-card"></div></body></html>');
  const source=fs.readFileSync('assets/onboarding.js','utf8');
  const completion=source.slice(source.indexOf('  function celebrate()'),source.indexOf('  /* ── Dismiss the wizard'));
  await page.evaluate(code=>{
    window.entries=0;
    Function('S','root','tr','esc','brandMark','enterApp',code+';celebrate();')({ownerName:'Synthetic'},document,x=>x.fr,String,()=>'',()=>window.entries++);
    document.querySelector('[data-enter]').onclick=()=>window.entries++;
  },completion);
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-enter')),true);
  assert.equal(await page.evaluate(()=>window.entries),0);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.entries),1);
 });
 await h.S.run('open dossier refreshes without replacing a typed note',async t=>{
  const merchant='synthetic-wave-p';let reads=0;
  const routes={
    'GET /api/admin/clients':{clients:[{merchant,business:'Synthetic dossier',type:'restaurant'}],now:Date.now(),senior:true},
    'GET /api/admin/operators':{operators:[]},
    'GET /api/admin/workspace':req=>({body:{merchant:new URL(req.url()).searchParams.get('merchant')||'',now:Date.now(),sources:{tasks:{available:true,rows:[]},notes:{available:true,rows:[{id:'note',merchant,body:'Read '+(++reads),ts:Date.now()}]},events:{available:true,rows:[]}}}}),
  };
  const {page,ctx}=await realPage(h,'fr','desktop',routes);t.defer(()=>ctx.close());t.watch(page);
  await page.goto(h.base+'/kiwi-admin.html#merchant/'+merchant+'/summary',{waitUntil:'load'});
  await page.waitForSelector('form[data-note] textarea');
  await page.focus('form[data-note] textarea');await page.keyboard.type('Unfinished synthetic note');
  await page.evaluate(()=>{window.originalNote=document.activeElement;originalNote.setSelectionRange(2,8);});
  const before=reads;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(n=>document.querySelector('#op-dossier-summary').textContent.includes('Read '+n),{},before+1);
  await page.waitForFunction(()=>!document.querySelector('#op-freshness').textContent.includes('manuellement'));
  assert.ok(reads>before);
  assert.deepEqual(await page.evaluate(()=>[document.activeElement===originalNote,originalNote.value,originalNote.selectionStart,originalNote.selectionEnd]),[true,'Unfinished synthetic note',2,8]);
 });
 await h.S.run('shared credit confirmation supports Escape and explicit confirmation',async t=>{
  const page=await h.browser.newPage();t.defer(()=>page.close());t.watch(page);
  await page.goto(h.base+'/404.html');
  await page.setContent('<html lang="fr"><body><button id="opener">Review</button></body></html>');
  for(const file of ['interactive/helpers.js','interactive/handlers.js','interactive.js']) await page.addScriptTag({url:h.base+'/assets/'+file});
  await page.focus('#opener');
  await page.evaluate(async base=>{
    const {confirmCreditCancellation}=await import(base+'/assets/credit-cancel-dialog.js');
    window.review=()=>{window.answer='pending';confirmCreditCancellation({modal:Kiwi.modal,credit:{balanceCents:12345},code:'TEST-CREDIT',esc:s=>s,fmtMAD:n=>n.toFixed(2),translate:fr=>fr}).then(value=>window.answer=value);};
    window.review();
  },h.base);
  await page.waitForSelector('[data-credit-confirm]');
  assert.match(await page.$eval('.kiwi-modal-body',e=>e.textContent),/123.45 MAD/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.answer===false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
  await page.evaluate(()=>window.review());await page.waitForSelector('.kiwi-backdrop.in [data-credit-confirm]');
  await page.focus('.kiwi-backdrop.in [data-credit-confirm]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.answer===true);
 });
 await h.S.run('ledger pages remain bounded and keyboard reachable',async t=>{
  const page=await h.browser.newPage();t.defer(()=>page.close());t.watch(page);
  await page.goto(h.base+'/404.html');await page.setContent('<html lang="en"><body><main><div class="ep-htl"></div></main></body></html>');
  await page.evaluate(async base=>{const {bindHistoryPages}=await import(base+'/assets/credit-history-page.js');bindHistoryPages(document.querySelector('main'),Array.from({length:123},(_,i)=>i),i=>`<p>${i}</p>`,()=>{});},h.base);
  assert.equal(await page.$$eval('.ep-htl p',rows=>rows.length),50);
  await page.focus('button:last-child');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.ep-htl p',e=>e.textContent),'50');
  await page.keyboard.press('Enter');assert.equal(await page.$$eval('.ep-htl p',rows=>rows.length),23);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Previous');
 });
} finally { await h.close(); }
